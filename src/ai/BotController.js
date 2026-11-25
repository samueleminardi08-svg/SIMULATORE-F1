/**
 * Motore IA Ibrido a 3 Layer per i 21 piloti bot (Step 4 — PIANO PRE STEP 4):
 * - Layer 1 (Strategico): gestione pit lane (uscita coda 2m + semaforo 10s), pit stop
 *   autonomo in gara per degrado gomme e recupero anti-incastro (zero deadlock).
 * - Layer 2 (Tattico): cost map su 7 corsie attorno alla Racing Line ideale, regola F1
 *   "leave the space" (>= 2.35 m affiancati), disciplina partenza Giro 1, scia e sorpassi.
 * - Layer 3 (Controllo 60 Hz): Pure-Pursuit sulla traiettoria ideale pre-calcolata in
 *   RacingLineSolver.js + profili individuali dei 22 piloti (DriverProfiles.js) con
 *   micro-errori realistici e zero allocazioni GC per tick (< 1.5 ms per 21 bot).
 */

import { CAR_PHYSICS_CONFIG, WEATHER_CONFIG } from '../config/constants.js';
import { getDifficultyConfig } from '../config/difficulty.js';
import {
  PIT_EXIT_GATE_INTERVAL_S,
  PIT_QUEUE_CENTER_SPACING_M,
  getCarPitGarage,
} from '../race/PitLaneManager.js';
import { queryPitLane } from '../tracks/PitLaneGeometry.js';
import { queryTrackSurface } from '../tracks/TrackSurface.js';
import { sampleRacingLineAtArcDistance } from './RacingLineSolver.js';
import { getDriverProfile } from './DriverProfiles.js';

const DT = 1 / 60;
const BRAKE_CHECK_DISTANCES = [8, 16, 26, 38, 52, 68, 88, 112, 140, 175];
const MAX_NEARBY = 24;

// Buffer riusabili a livello modulo -> ZERO allocazioni GC dentro computeBotInput()
const _rlNow = {};
const _rlLook = {};
const _rlAhead = {};
const _candLanes = new Float64Array(7);
const _nearbyDelta = new Float64Array(MAX_NEARBY);
const _nearbyLat = new Float64Array(MAX_NEARBY);
const _nearbySpeed = new Float64Array(MAX_NEARBY);

const PIT_BYPASS_OTHER_STATES = new Set([
  'IN_GARAGE',
  'EXITING_GARAGE',
  'PIT_STOPPING',
  'AUTO_PARKING',
  'PARKED_STAGE_END',
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function deterministicHash01(str, seedInt) {
  let h = 2166136261 ^ seedInt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Campiona posizione, tangente e normale della spline in modo continuo lungo l'arco.
 */
function sampleTrackAtArcDistance(trackSurface, arcDist, out = {}) {
  const { samples, sampleCount, totalLength } = trackSurface;
  const wrapped = ((arcDist % totalLength) + totalLength) % totalLength;
  const fIdx = (wrapped / totalLength) * sampleCount;
  const i0 = Math.floor(fIdx) % sampleCount;
  const i1 = (i0 + 1) % sampleCount;
  const alpha = fIdx - Math.floor(fIdx);

  const a = samples[i0];
  const b = samples[i1];

  const x = a.x + (b.x - a.x) * alpha;
  const z = a.z + (b.z - a.z) * alpha;
  const rawTx = a.tx + (b.tx - a.tx) * alpha;
  const rawTz = a.tz + (b.tz - a.tz) * alpha;
  const tLen = Math.max(1e-6, Math.hypot(rawTx, rawTz));
  const tx = rawTx / tLen;
  const tz = rawTz / tLen;

  out.x = x;
  out.z = z;
  out.tx = tx;
  out.tz = tz;
  out.nx = tz;
  out.nz = -tx;
  return out;
}

function findPitSampleAtS(pit, targetS) {
  const samples = pit.samples;
  if (!samples?.length) return null;
  const clamped = clamp(targetS, pit.entryStartM, pit.exitEndM);
  const span = Math.max(1e-3, pit.exitEndM - pit.entryStartM);
  const approxIdx = clamp(
    Math.round(((clamped - pit.entryStartM) / span) * (samples.length - 1)),
    0,
    samples.length - 1
  );
  let best = samples[approxIdx];
  let bestD = Math.abs(best.sMeters - clamped);
  for (let d = -4; d <= 4; d++) {
    const idx = approxIdx + d;
    if (idx < 0 || idx >= samples.length) continue;
    const dist = Math.abs(samples[idx].sMeters - clamped);
    if (dist < bestD) {
      bestD = dist;
      best = samples[idx];
    }
  }
  return best;
}

/**
 * Aggiorna i rari micro-errori deterministici del pilota (leggero lungo o sbavatura d'apex).
 */
function updateDriverMicroMistake(botCar, profile, worldState, isRain) {
  if ((botCar.botMistakeTimer ?? 0) > 0) {
    botCar.botMistakeTimer = Math.max(0, botCar.botMistakeTimer - DT);
    if (botCar.botMistakeTimer <= 0) {
      botCar.botMistakeOffset = 0;
      botCar.botMistakeSpeedBias = 0;
    }
    return;
  }

  // Controllo deterministico ogni ~4.0 secondi (240 tick)
  const bucket = Math.floor((worldState.tick ?? 0) / 240);
  if (bucket === botCar.botMistakeCheckBucket || bucket <= 1) return;
  botCar.botMistakeCheckBucket = bucket;

  const tireWear = 1.0 - clamp(botCar.aeroTire?.tireHealth ?? 1.0, 0, 1);
  const prob =
    profile.mistakeProbability *
    (1.0 + tireWear * 1.15) *
    (isRain ? 1.35 : 1.0);

  const roll = deterministicHash01(botCar.driverId || botCar.id, bucket * 31 + 7);
  if (roll < prob) {
    const sign = deterministicHash01(botCar.id, bucket * 17 + 3) < 0.5 ? -1 : 1;
    const mag = 0.35 + (1.0 - profile.corneringConsistency) * 1.1;
    botCar.botMistakeTimer = 0.75 + (roll / Math.max(1e-4, prob)) * 0.45;
    botCar.botMistakeOffset = sign * clamp(mag, 0.3, 0.75);
    botCar.botMistakeSpeedBias = 0.015 + (1.0 - profile.brakingSkill) * 0.03;
  }
}

/**
 * Calcola gli input di guida (forward, backward, analogSteer) per un bot in un dato tick.
 * @param {object} botCar
 * @param {import('../core/WorldState.js').WorldState} worldState
 */
export function computeBotInput(botCar, worldState) {
  const trackSurface = worldState.trackSurface;
  if (!trackSurface || !worldState.raceState) {
    return { forward: false, backward: false, left: false, right: false, analogSteer: 0 };
  }

  // Durante attesa in griglia o semaforo rosso mantieni il freno premuto
  if (worldState.raceState.status === 'grid_wait' || worldState.raceState.status === 'countdown') {
    return { forward: false, backward: true, left: false, right: false, analogSteer: 0 };
  }

  // Vetture gestite dal PitLaneManager (parcheggiate, pit stop o traiettoria Bézier)
  if (
    botCar.pitState === 'IN_GARAGE' ||
    botCar.pitState === 'EXITING_GARAGE' ||
    botCar.pitState === 'PIT_STOPPING' ||
    botCar.pitState === 'AUTO_PARKING' ||
    botCar.pitState === 'PARKED_STAGE_END'
  ) {
    return { forward: false, backward: false, left: false, right: false, analogSteer: 0 };
  }

  // Guida dedicata in ingresso Pit Lane (solo se pit stop richiesto o rientro a fine qualifica)
  if (
    botCar.pitState === 'PIT_ENTRY_LANE' &&
    botCar.pitStopRequested &&
    trackSurface.pitLane
  ) {
    const pit = trackSurface.pitLane;
    const pq = queryPitLane(pit, botCar.x, botCar.z, botCar.teamId);
    const garage = getCarPitGarage(pit, botCar);
    if (pq.sample && pq.inPitLane) {
      let targetX;
      let targetZ;
      let pitTargetSpeed = pit.speedLimitMs - 0.5;

      if (garage && garage.sCenterM - pq.sMeters <= 16.0) {
        targetX = garage.pitStopPos.x;
        targetZ = garage.pitStopPos.z;
        const distToBox = Math.hypot(targetX - botCar.x, targetZ - botCar.z);
        pitTargetSpeed = clamp(distToBox * 1.15, 2.5, pit.speedLimitMs * 0.7);
      } else {
        const tgt = findPitSampleAtS(pit, pq.sMeters + 12.0) || pit.samples[pit.samples.length - 1];
        targetX = tgt.x;
        targetZ = tgt.z;
      }

      const desiredH = Math.atan2(targetX - botCar.x, targetZ - botCar.z);
      const errH = normalizeAngle(desiredH - botCar.heading);
      const steer = clamp(errH * 2.0 - (botCar.yawRate ?? 0) * 0.18, -1, 1);
      const curSpd = Math.max(0, botCar.forwardSpeed);
      return {
        forward: curSpd < pitTargetSpeed - 0.1,
        backward: curSpd > pitTargetSpeed + 0.8,
        left: steer > 0.05,
        right: steer < -0.05,
        analogSteer: steer,
      };
    }
  }

  // Guida dedicata in uscita Pit Lane (segue fast lane + coda 2m + semaforo 10s + rampa uscita)
  if (botCar.pitState === 'PIT_EXIT_LANE' && trackSurface.pitLane) {
    const pit = trackSurface.pitLane;
    const pq = queryPitLane(pit, botCar.x, botCar.z);
    if (pq.sample && pq.inPitLane) {
      const targetS = pq.sMeters + 14.0;
      let targetX;
      let targetZ;
      if (targetS <= pit.exitEndM) {
        const tgt = findPitSampleAtS(pit, targetS) || pit.samples[pit.samples.length - 1];
        targetX = tgt.x;
        targetZ = tgt.z;
      } else {
        const beyond = targetS - pit.exitEndM;
        const lastPitSample = pit.samples[pit.samples.length - 1];
        const exitTrackArc =
          lastPitSample?.trackArcDist ??
          queryTrackSurface(trackSurface, pit.exitFrame.x, pit.exitFrame.z).arcDistance;
        const mergeSample = sampleTrackAtArcDistance(
          trackSurface,
          exitTrackArc + beyond + 10.0,
          _rlLook
        );
        targetX = mergeSample.x;
        targetZ = mergeSample.z;
      }

      const desiredH = Math.atan2(targetX - botCar.x, targetZ - botCar.z);
      const errH = normalizeAngle(desiredH - botCar.heading);
      const steer = clamp(errH * 1.9 - (botCar.yawRate ?? 0) * 0.18, -1, 1);

      let pitTargetSpeed =
        pq.sMeters <= pit.speedEndM ? pit.speedLimitMs - 0.4 : 42.0;

      // Accodamento ordinato a ~2.0 m muso-alettone (7.32 m centro-centro)
      for (const other of Object.values(worldState.cars)) {
        if (other.id === botCar.id) continue;
        if (PIT_BYPASS_OTHER_STATES.has(other.pitState)) continue;
        const opq = queryPitLane(pit, other.x, other.z);
        if (!opq.inPitLane || opq.inGarage) continue;
        const aheadM = opq.sMeters - pq.sMeters;
        if (aheadM > 0.2 && aheadM < 26.0) {
          if (aheadM <= PIT_QUEUE_CENTER_SPACING_M + 0.15) {
            pitTargetSpeed = 0;
          } else {
            const safeSpd = Math.min(
              (other.forwardSpeed ?? 0) + (aheadM - PIT_QUEUE_CENTER_SPACING_M) * 0.7,
              (aheadM - (PIT_QUEUE_CENTER_SPACING_M - 0.15)) * 1.55
            );
            pitTargetSpeed = Math.min(pitTargetSpeed, Math.max(0, safeSpd));
          }
        }
      }

      // Rispetta il semaforo rosso di uscita pit lane (1 vettura ogni 10.0s in Qualifica)
      if (!botCar.pitExitCleared) {
        const gateS = pit.speedEndM - 2.0;
        const distToGate = gateS - pq.sMeters;
        const lastExit = worldState.pitLaneState?.lastPitExitTime ?? -PIT_EXIT_GATE_INTERVAL_S;
        const exitWait = Math.max(
          0,
          PIT_EXIT_GATE_INTERVAL_S - ((worldState.elapsedTime ?? 0) - lastExit)
        );
        if (distToGate < 26.0 && ((botCar.pitQueuePosition ?? 0) > 1 || exitWait > 0.05)) {
          pitTargetSpeed =
            distToGate <= 0.8
              ? 0
              : Math.min(pitTargetSpeed, Math.max(0, (distToGate - 0.4) * 1.65));
        }
      }

      if (
        typeof botCar.pitExitGateMaxSpeedMs === 'number' &&
        Number.isFinite(botCar.pitExitGateMaxSpeedMs)
      ) {
        pitTargetSpeed = Math.min(pitTargetSpeed, botCar.pitExitGateMaxSpeedMs);
      }

      const curSpd = Math.max(0, botCar.forwardSpeed);
      return {
        forward: pitTargetSpeed > 0.25 && curSpd < pitTargetSpeed - 0.1,
        backward: curSpd > pitTargetSpeed + 0.65 || (pitTargetSpeed <= 0.15 && curSpd > 0.15),
        left: steer > 0.05,
        right: steer < -0.05,
        analogSteer: steer,
      };
    }
  }

  // Profilo comportamentale del pilota (caching diretto sull'oggetto vettura)
  let profile = botCar.driverProfile;
  if (!profile) {
    profile = getDriverProfile(botCar.driverId);
    botCar.driverProfile = profile;
  }

  const weatherProps = WEATHER_CONFIG[worldState.weather] || WEATHER_CONFIG.dry;
  const difficultyProps = getDifficultyConfig(worldState.physicsSettings || worldState.difficultyId);
  const botPace = difficultyProps.botPaceMultiplier;
  const rainPhysicsEnabled = difficultyProps.rainPhysicsEnabled !== false;
  const isRain = weatherProps.id === 'rain' && rainPhysicsEnabled;
  const { totalLength, halfTrackWidth, isStreet } = trackSurface;

  const query = queryTrackSurface(trackSurface, botCar.x, botCar.z, botCar.trackSampleIndex);
  botCar.trackSampleIndex = query.sampleIndex;
  const myDist = query.arcDistance;
  const localHalfWidth = query.halfTrackWidth ?? halfTrackWidth;
  const currentSpeed = Math.max(0, botCar.forwardSpeed);

  // --- LAYER 1a: Recupero anti-deadlock / anti-incastro (orientato alla tangente pista) ---
  const tangentHeadingEarly = Math.atan2(query.tx, query.tz);
  if ((botCar.botRecoveryTimer ?? 0) > 0) {
    botCar.botRecoveryTimer = Math.max(0, botCar.botRecoveryTimer - DT);
    const revPhase = botCar.botRecoveryTimer > 0.55;
    if (revPhase) {
      // In retromarcia lo sterzo invertito ruota il muso esattamente verso la tangente pista
      const tangErr = normalizeAngle(tangentHeadingEarly - botCar.heading);
      const revSteer = clamp(-tangErr * 1.85, -1, 1);
      return {
        forward: false,
        backward: true,
        analogThrottle: 0,
        analogBrake: 0.72,
        left: revSteer > 0.05,
        right: revSteer < -0.05,
        analogSteer: revSteer,
      };
    }
    const rejoinX = query.closestX + query.tx * 18.0;
    const rejoinZ = query.closestZ + query.tz * 18.0;
    const rejoinH = Math.atan2(rejoinX - botCar.x, rejoinZ - botCar.z);
    const fwdSteer = clamp(normalizeAngle(rejoinH - botCar.heading) * 1.9, -1, 1);
    return {
      forward: currentSpeed < 12.0,
      backward: false,
      analogThrottle: currentSpeed < 12.0 ? 0.65 : 0,
      analogBrake: 0,
      left: fwdSteer > 0.05,
      right: fwdSteer < -0.05,
      analogSteer: fwdSteer,
    };
  }

  const isActiveDriving =
    worldState.raceState.status === 'racing' ||
    (worldState.raceState.mode === 'qualifying' &&
      (worldState.qualifyingState?.status === 'running' ||
        worldState.qualifyingState?.status === 'chequered_flag'));

  if (isActiveDriving && Math.abs(botCar.forwardSpeed) < 1.35) {
    botCar.botStuckTimer = (botCar.botStuckTimer ?? 0) + DT;
    if (botCar.botStuckTimer >= 1.3) {
      botCar.botStuckTimer = 0;
      botCar.botConsecutiveRecoveries = (botCar.botConsecutiveRecoveries ?? 0) + 1;
      // Fallback di sicurezza se fisicamente incastrato fra muro e 2 auto (es. tornante Monaco)
      if (botCar.botConsecutiveRecoveries >= 2) {
        botCar.botConsecutiveRecoveries = 0;
        botCar.x = query.closestX;
        botCar.z = query.closestZ;
        botCar.y = query.elevation ?? botCar.y ?? 0;
        botCar.heading = tangentHeadingEarly;
        botCar.vx = query.tx * 8.0;
        botCar.vz = query.tz * 8.0;
        botCar.forwardSpeed = 8.0;
        botCar.lateralSpeed = 0;
        botCar.speed = 8.0;
        botCar.yawRate = 0;
        return {
          forward: true,
          backward: false,
          analogThrottle: 0.7,
          analogBrake: 0,
          left: false,
          right: false,
          analogSteer: 0,
        };
      }
      botCar.botRecoveryTimer = 1.25;
      const tangErr = normalizeAngle(tangentHeadingEarly - botCar.heading);
      const revSteer = clamp(-tangErr * 1.85, -1, 1);
      return {
        forward: false,
        backward: true,
        analogThrottle: 0,
        analogBrake: 0.72,
        left: revSteer > 0.05,
        right: revSteer < -0.05,
        analogSteer: revSteer,
      };
    }
  } else if (Math.abs(botCar.forwardSpeed) > 5.0) {
    botCar.botStuckTimer = Math.max(0, (botCar.botStuckTimer ?? 0) - DT * 2.5);
    botCar.botConsecutiveRecoveries = 0;
  }

  // --- LAYER 1b: Strategia Pit Stop bot in gara (usura gomme, blistering o meteo errato) ---
  const race = worldState.raceState;
  const pitLane = trackSurface.pitLane;
  if (
    pitLane &&
    race.mode === 'race' &&
    race.status === 'racing' &&
    race.totalLaps !== null &&
    race.totalLaps >= 4 &&
    !botCar.pitStopRequested &&
    (botCar.pitStopCount ?? 0) < 2
  ) {
    const remLaps = race.totalLaps - (botCar.timing?.completedLaps ?? 0);
    if (remLaps >= 2) {
      const curComp = botCar.aeroTire?.compound || 'M';
      const wrongWeatherTire =
        (isRain && curComp !== 'W') || (!isRain && curComp === 'W');
      const degEnabled = difficultyProps.tireDegradationEnabled !== false;
      const driverJitter = (deterministicHash01(botCar.driverId || botCar.id, 13) - 0.5) * 0.04;
      const wearThreshold = 0.34 - (profile.tyreManagement - 0.85) * 0.14 + driverJitter;
      const needsWearStop =
        degEnabled &&
        ((botCar.aeroTire?.tireHealth ?? 1.0) < wearThreshold ||
          (botCar.aeroTire?.blisteringLevel ?? 0) > 0.72);
      if (wrongWeatherTire || needsWearStop) {
        botCar.pitStopRequested = true;
        if (worldState.weather === 'rain') {
          botCar.nextPitCompound = 'W';
        } else if (remLaps <= 3) {
          botCar.nextPitCompound = 'S';
        } else if (remLaps <= 7) {
          botCar.nextPitCompound = curComp === 'M' ? 'S' : 'M';
        } else {
          botCar.nextPitCompound = curComp === 'H' ? 'M' : 'H';
        }
      }
    }
  }

  // Avvicinamento e ingresso nella rampa pit lane se pit stop prenotato
  if (botCar.pitStopRequested && pitLane?.samples?.length) {
    const entryArc = pitLane.samples[0].trackArcDist;
    let distToPitEntry = (entryArc - myDist + totalLength) % totalLength;
    if (distToPitEntry > totalLength * 0.5) distToPitEntry -= totalLength;

    if (distToPitEntry >= -45.0 && distToPitEntry <= 110.0) {
      let tgtX;
      let tgtZ;
      if (distToPitEntry <= 45.0) {
        const rampTargetS =
          distToPitEntry <= 8.0
            ? pitLane.entryStartM + Math.max(18.0, -distToPitEntry + 16.0)
            : pitLane.entryStartM + 16.0;
        const rampSample = findPitSampleAtS(pitLane, rampTargetS) || pitLane.entryFrame;
        tgtX = rampSample.x;
        tgtZ = rampSample.z;
      } else {
        const sideLat = pitLane.sideSign * Math.max(1.2, localHalfWidth - 1.1);
        tgtX = query.closestX + query.nx * sideLat + query.tx * 24.0;
        tgtZ = query.closestZ + query.nz * sideLat + query.tz * 24.0;
      }

      const desiredH = Math.atan2(tgtX - botCar.x, tgtZ - botCar.z);
      const errH = normalizeAngle(desiredH - botCar.heading);
      const steer = clamp(errH * 1.9 - (botCar.yawRate ?? 0) * 0.2, -1, 1);
      const approachSpeed = clamp(
        pitLane.speedLimitMs + Math.max(0, distToPitEntry) * 0.22,
        pitLane.speedLimitMs * 0.85,
        30.0
      );
      return {
        forward: currentSpeed < approachSpeed - 0.2,
        backward: currentSpeed > approachSpeed + 1.2,
        analogThrottle: currentSpeed < approachSpeed - 0.2 ? 0.65 : 0,
        analogBrake: currentSpeed > approachSpeed + 1.2 ? 0.65 : 0,
        left: steer > 0.05,
        right: steer < -0.05,
        analogSteer: steer,
      };
    }
  }

  // Aggiorna rari micro-errori realistici del pilota
  updateDriverMicroMistake(botCar, profile, worldState, isRain);

  // --- LAYER 3 (preparazione): Lettura Racing Line Ideale e ritmo personalizzato ---
  const rlNow = sampleRacingLineAtArcDistance(trackSurface, myDist, _rlNow);
  const laneLimit = Math.max(1.15, Math.min(rlNow.maxLat, localHalfWidth - (isStreet ? 1.55 : 1.48)));

  // Scala ritmo differenziata fra top team (McLaren/Ferrari/Red Bull) e fondo griglia (Audi/Cadillac)
  const rawSkill = botCar.skillFactor ?? 0.96;
  const skillNorm = clamp((rawSkill - 0.91) / 0.08, 0, 1);
  const teamDriverScale = 0.918 + 0.085 * skillNorm; // ~0.922 backmarker .. ~1.000 top team
  const rainCornerScale = isRain ? 0.77 + 0.11 * profile.rainMastery : 1.0;
  const rainBrakeScale = isRain ? 0.68 + 0.10 * profile.rainMastery : 1.0;
  const rainStraightScale = isRain ? 0.91 + 0.04 * profile.rainMastery : 1.0;
  const tireGrip = botCar.aeroTire?.tireGripFactor ?? 1.0;

  const paceScale = botPace * teamDriverScale;
  const maxStraightSpeed =
    93.2 *
    (0.955 + 0.048 * skillNorm) *
    botPace *
    rainStraightScale *
    (1.0 + (botCar.botMistakeSpeedBias ?? 0));

  const cornerSpeedScale =
    paceScale *
    rainCornerScale *
    Math.sqrt(clamp(tireGrip, 0.72, 1.05)) *
    (0.97 + 0.04 * profile.corneringConsistency) *
    (1.0 + (botCar.botMistakeSpeedBias ?? 0));

  const effectiveBrakeDecel =
    (isStreet ? 19.5 : 22.0) *
    rainBrakeScale *
    clamp(tireGrip, 0.72, 1.05) *
    (0.89 + 0.14 * profile.brakingSkill) *
    (0.86 + 0.14 * botPace);

  // Profilo velocità ideale: integra la curva globale baseSpeed (1600 campioni) + 10 checkpoint dinamici
  let targetSpeed = Math.min(maxStraightSpeed, rlNow.baseSpeed * cornerSpeedScale);
  const rlClose = sampleRacingLineAtArcDistance(trackSurface, myDist + 8.0, _rlAhead);
  targetSpeed = Math.min(targetSpeed, rlClose.baseSpeed * cornerSpeedScale);
  let nearCurvature = Math.max(rlNow.curvature, rlClose.curvature);
  let upcomingSignedCurv = rlNow.signedCurvature;
  let maxUpcomingCurv = nearCurvature;

  for (let c = 0; c < BRAKE_CHECK_DISTANCES.length; c++) {
    const distM = BRAKE_CHECK_DISTANCES[c];
    const pt = sampleRacingLineAtArcDistance(trackSurface, myDist + distM, _rlAhead);
    if (distM <= 38 && pt.curvature > nearCurvature) {
      nearCurvature = pt.curvature;
    }
    if (distM <= 60 && pt.curvature > maxUpcomingCurv) {
      maxUpcomingCurv = pt.curvature;
      upcomingSignedCurv = pt.signedCurvature;
    }

    const vCornerCap = clamp(pt.baseSpeed * cornerSpeedScale, 12.5, maxStraightSpeed);
    const brakeDistAvail = Math.max(0, distM - 5.0);
    const vAllowed = Math.sqrt(vCornerCap * vCornerCap + 2.0 * effectiveBrakeDecel * brakeDistAvail);
    if (vAllowed < targetSpeed) {
      targetSpeed = vAllowed;
    }
  }

  // --- LAYER 2: Valutazione Traffico, Space-Leaving F1 & Cost Map su 7 Corsie ---
  const raceElapsed =
    race.mode === 'race'
      ? Math.max(0, (worldState.elapsedTime ?? 0) - (race.raceStartElapsed ?? 0))
      : 99.0;

  if (botCar.preferredLaneOffset === null || botCar.preferredLaneOffset === undefined) {
    botCar.preferredLaneOffset = clamp(query.lateralOffset, -laneLimit, laneLimit);
    botCar.targetLaneOffset = botCar.preferredLaneOffset;
    botCar.gridLaneOffset = botCar.preferredLaneOffset;
  }

  // Disciplina partenza Giro 1: mantiene la corsia di griglia nei primi 2.2s, poi fonde sulla Racing Line
  const startIdealBlend = clamp((raceElapsed - 2.2) / 4.2, 0, 1);
  const idealTargetNow = clamp(
    rlNow.lateralOffset + (botCar.botMistakeOffset ?? 0),
    -laneLimit,
    laneLimit
  );
  const gridHoldLat = clamp(botCar.gridLaneOffset ?? query.lateralOffset, -laneLimit, laneLimit);
  const desiredBaseLat = gridHoldLat + (idealTargetNow - gridHoldLat) * startIdealBlend;

  botCar.laneHoldTimer = Math.max(0, (botCar.laneHoldTimer ?? 0) - DT);

  // Scansione vetture vicine senza allocazioni
  let nearbyCount = 0;
  let nearestAheadIdx = -1;
  let nearestAheadDelta = Infinity;
  let sideLeftBound = laneLimit;   // max lat consentito se c'è un'auto affiancata a sinistra (+lat)
  let sideRightBound = -laneLimit; // min lat consentito se c'è un'auto affiancata a destra (-lat)
  let hasSideBySide = false;

  const curLat = query.lateralOffset;
  const carsObj = worldState.cars;
  for (const otherId in carsObj) {
    const other = carsObj[otherId];
    if (!other || other.id === botCar.id) continue;
    if (PIT_BYPASS_OTHER_STATES.has(other.pitState)) continue;
    if (Math.abs((other.y ?? 0) - (botCar.y ?? 0)) > 2.5) continue;

    const dx = other.x - botCar.x;
    const dz = other.z - botCar.z;
    if (dx * dx + dz * dz > 44 * 44) continue;

    const otherQ = queryTrackSurface(trackSurface, other.x, other.z, other.trackSampleIndex);
    let forwardDelta = (otherQ.arcDistance - myDist + totalLength) % totalLength;
    if (forwardDelta > totalLength * 0.5) forwardDelta -= totalLength;
    if (forwardDelta < -6.5 || forwardDelta > 38.0) continue;

    const oLat = otherQ.lateralOffset;
    const oSpd = other.forwardSpeed ?? 0;

    if (nearbyCount < MAX_NEARBY) {
      _nearbyDelta[nearbyCount] = forwardDelta;
      _nearbyLat[nearbyCount] = oLat;
      _nearbySpeed[nearbyCount] = oSpd;

      if (
        forwardDelta > 0.5 &&
        forwardDelta < 32.0 &&
        Math.abs(oLat - curLat) < 2.25 &&
        forwardDelta < nearestAheadDelta
      ) {
        nearestAheadDelta = forwardDelta;
        nearestAheadIdx = nearbyCount;
      }

      // Regola F1 "leave the space": se un'altra vettura è affiancata, garantisci >= 2.35 m
      if (forwardDelta >= -5.6 && forwardDelta <= 6.0) {
        hasSideBySide = true;
        if (oLat >= curLat) {
          sideLeftBound = Math.min(sideLeftBound, oLat - 2.35);
        } else {
          sideRightBound = Math.max(sideRightBound, oLat + 2.35);
        }
      }

      nearbyCount++;
    }
  }

  // Margine sicuro se bloccato tra due vetture ai lati
  let safeMinLat = clamp(sideRightBound, -laneLimit, laneLimit);
  let safeMaxLat = clamp(sideLeftBound, -laneLimit, laneLimit);
  if (safeMinLat > safeMaxLat) {
    const mid = clamp(0.5 * (safeMinLat + safeMaxLat), -laneLimit, laneLimit);
    safeMinLat = mid;
    safeMaxLat = mid;
  }

  // Cost map 1D su 7 corsie attorno alla Racing Line ideale
  if (Math.abs(curLat) > localHalfWidth - 1.05) {
    // Rientro morbido se il bot è finito al limite pista
    botCar.preferredLaneOffset = clamp(curLat * 0.65, safeMinLat, safeMaxLat);
  } else if (hasSideBySide || botCar.laneHoldTimer <= 0 || nearestAheadIdx >= 0) {
    _candLanes[0] = clamp(desiredBaseLat, safeMinLat, safeMaxLat);
    _candLanes[1] = clamp(desiredBaseLat - 2.35, safeMinLat, safeMaxLat);
    _candLanes[2] = clamp(desiredBaseLat + 2.35, safeMinLat, safeMaxLat);
    _candLanes[3] = clamp(desiredBaseLat - 4.5, safeMinLat, safeMaxLat);
    _candLanes[4] = clamp(desiredBaseLat + 4.5, safeMinLat, safeMaxLat);
    _candLanes[5] = clamp(-laneLimit * 0.88, safeMinLat, safeMaxLat);
    _candLanes[6] = clamp(laneLimit * 0.88, safeMinLat, safeMaxLat);

    // Segno interno della prossima curva (cross < 0 = curva a sinistra = +lat)
    const insideSign = upcomingSignedCurv < 0 ? 1 : -1;
    const isApproachingCorner = maxUpcomingCurv > 0.0045;
    const prevPref = botCar.preferredLaneOffset ?? desiredBaseLat;

    let bestCand = _candLanes[0];
    let bestCost = Infinity;

    for (let c = 0; c < 7; c++) {
      const cand = _candLanes[c];
      let cost =
        Math.abs(cand - desiredBaseLat) * (0.48 + 0.34 * profile.corneringConsistency) +
        Math.abs(cand - prevPref) * (0.46 - 0.20 * profile.trafficManagement);

      for (let m = 0; m < nearbyCount; m++) {
        const d = _nearbyDelta[m];
        const oLat = _nearbyLat[m];
        const oSpd = _nearbySpeed[m];
        const latGap = Math.abs(cand - oLat);

        if (d >= -5.6 && d <= 6.2) {
          if (latGap < 2.35) {
            cost += 180.0 + (2.35 - latGap) * 40.0;
          }
        } else if (d > 0.5 && d < 30.0) {
          if (latGap < 2.35) {
            const closing = Math.max(0.4, currentSpeed - oSpd);
            const prox = 1.0 / Math.max(0.25, d * 0.08);
            cost += (14.0 + closing * 2.2) * prox * (1.0 - latGap / 2.6);
          } else if (
            !isApproachingCorner &&
            nearCurvature < 0.0022 &&
            d > 13.0 &&
            d < 28.0 &&
            latGap < 1.2 &&
            currentSpeed - oSpd < 2.5
          ) {
            // Leggero bonus scia (tow) su rettilineo lungo prima di uscire per il sorpasso
            cost -= 0.7;
          }
        }
      }

      // Bonus attacco all'interno in staccata per piloti aggressivi quando la linea interna è libera
      if (isApproachingCorner && nearestAheadIdx >= 0 && nearestAheadDelta < 20.0) {
        const aheadLat = _nearbyLat[nearestAheadIdx];
        if ((cand - aheadLat) * insideSign > 1.8) {
          cost -= (profile.aggression - 0.65) * 4.2;
        }
      }

      if (cost < bestCost) {
        bestCost = cost;
        bestCand = cand;
      }
    }

    const changeMag = Math.abs(bestCand - prevPref);
    if (hasSideBySide || changeMag > 0.22) {
      botCar.preferredLaneOffset = bestCand;
      if (changeMag > 1.15 && !hasSideBySide) {
        botCar.laneHoldTimer = 0.85 - profile.trafficManagement * 0.35;
      }
    }
  }

  // Adattamento velocità fluido dietro a traffico bloccante (evita tamponamenti a catena)
  if (nearestAheadIdx >= 0) {
    const aheadDelta = _nearbyDelta[nearestAheadIdx];
    const aheadLat = _nearbyLat[nearestAheadIdx];
    const aheadSpd = _nearbySpeed[nearestAheadIdx];
    const blockedInLane =
      Math.abs((botCar.preferredLaneOffset ?? curLat) - aheadLat) < 2.05 ||
      Math.abs(curLat - aheadLat) < 1.95;

    if (blockedInLane && aheadDelta < 20.0) {
      const safeGap = 6.9 - profile.aggression * 1.1; // ~5.8..6.2 m centro-centro (> 5.10 m collision box)
      if (aheadDelta <= safeGap) {
        targetSpeed = Math.min(targetSpeed, Math.max(2.0, aheadSpd - (safeGap - aheadDelta) * 2.4));
      } else {
        const followCap = aheadSpd + (aheadDelta - safeGap) * 1.15;
        targetSpeed = Math.min(targetSpeed, Math.max(4.0, followCap));
      }
    }
  }

  // Se costretto fuori traiettoria ideale in una curva stretta, riduce leggermente la velocità di percorrenza
  const offIdealDist = Math.abs(curLat - rlNow.lateralOffset);
  if (offIdealDist > 1.5 && nearCurvature > 0.0045) {
    const offLinePenalty = 1.0 - Math.min(0.11, (offIdealDist - 1.5) * 0.025);
    targetSpeed *= offLinePenalty;
  }

  // Transizione laterale dolce con slew limit (più reattiva in caso di auto affiancata)
  const prevLane = botCar.targetLaneOffset ?? botCar.preferredLaneOffset;
  const maxLaneStep = (hasSideBySide ? 3.8 : 2.1 + profile.trafficManagement * 0.85) * DT;
  const laneDelta = clamp(botCar.preferredLaneOffset - prevLane, -maxLaneStep, maxLaneStep);
  botCar.targetLaneOffset = clamp(prevLane + laneDelta, safeMinLat, safeMaxLat);

  // --- LAYER 3: Controllo Pure-Pursuit su Racing Line + Damping Imbardata + Frenata Modulata ---
  const curvLookScale = clamp(1.0 - nearCurvature * 26.0, 0.42, 1.0);
  const lookaheadMeters = clamp((10.5 + currentSpeed * 0.30) * curvLookScale, 7.5, 36.0);
  const targetSample = sampleRacingLineAtArcDistance(trackSurface, myDist + lookaheadMeters, _rlLook);

  // Applica l'offset tattico relativo rispetto alla racing line locale sul punto di lookahead
  const tacticalShift = botCar.targetLaneOffset - desiredBaseLat;
  const lookMaxLat = Math.max(1.15, Math.min(targetSample.maxLat, targetSample.halfWidth - (isStreet ? 1.55 : 1.48)));
  const targetIdealAtLook =
    startIdealBlend * targetSample.lateralOffset + (1.0 - startIdealBlend) * gridHoldLat;
  const finalLookLat = clamp(targetIdealAtLook + tacticalShift, -lookMaxLat, lookMaxLat);

  const targetX = targetSample.centerX + targetSample.nx * finalLookLat;
  const targetZ = targetSample.centerZ + targetSample.nz * finalLookLat;

  const desiredHeading = Math.atan2(targetX - botCar.x, targetZ - botCar.z);
  const headingError = normalizeAngle(desiredHeading - botCar.heading);

  const tangentHeading = Math.atan2(query.tx, query.tz);
  const tangentError = normalizeAngle(tangentHeading - botCar.heading);

  const kp = 1.62 + currentSpeed * 0.021;
  const kdYaw = 0.23 + currentSpeed * 0.0024;
  const rawSteer = clamp(
    headingError * kp + tangentError * 0.30 - (botCar.yawRate ?? 0) * kdYaw,
    -1,
    1
  );

  const prevSteer = botCar.prevSteerInput ?? 0;
  const maxSteerStep = nearCurvature > 0.012 ? 0.16 : 0.115;
  const limitedSteer = clamp(
    prevSteer + clamp(rawSteer - prevSteer, -maxSteerStep, maxSteerStep),
    -1,
    1
  );
  const analogSteer = Math.abs(limitedSteer) < 0.007 ? 0 : limitedSteer;
  botCar.prevSteerInput = analogSteer;

  // Controllo acceleratore / freno analogico stile F1 (threshold + trail braking anti-lockup)
  const speedExcess = botCar.forwardSpeed - targetSpeed;
  const brakeThreshold = 0.9 + (1.0 - profile.brakingSkill) * 0.75;
  const steerAbs = Math.abs(analogSteer);

  let analogBrake = 0;
  let analogThrottle = 0;
  if (speedExcess > brakeThreshold) {
    // Trail braking: riduce pressione freno all'aumentare dell'angolo sterzo per evitare bloccaggi
    const maxSafeBrake = clamp(
      (isRain ? 0.76 : 0.88) + (profile.brakingSkill - 0.85) * 0.25 - steerAbs * 0.34,
      0.42,
      0.92
    );
    const demand = clamp(0.32 + (speedExcess - brakeThreshold) * 0.14, 0.32, 1.0);
    analogBrake = Math.min(demand, maxSafeBrake);
    if (botCar.aeroTire?.wheelLockup) {
      analogBrake *= 0.45;
    }
  } else if (botCar.forwardSpeed < targetSpeed + 0.25) {
    const deficit = targetSpeed - botCar.forwardSpeed;
    analogThrottle = deficit > 2.2 ? 1.0 : clamp(0.35 + deficit * 0.30, 0.25, 1.0);
    // Riduce leggermente il gas in uscita di curva molto stretta su bagnato
    if (isRain && steerAbs > 0.55 && currentSpeed < 35.0) {
      analogThrottle *= 0.78 + 0.18 * profile.rainMastery;
    }
  }

  const backward = analogBrake > 0.05;
  const forward = !backward && analogThrottle > 0.05;

  return {
    forward,
    backward,
    analogThrottle,
    analogBrake,
    left: analogSteer > 0.05,
    right: analogSteer < -0.05,
    analogSteer,
  };
}
