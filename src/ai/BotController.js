/**
 * Controller IA autonomo per i 21 piloti bot (Step 6-7):
 * - Campionamento continuo della spline (senza scatti discreti tra campioni)
 * - Gestione frenata/velocità in curva e chicane rispettando l'attenuazione sterzo ad alta velocità
 * - Cambio corsia con isteresi, soglia di avvicinamento e scelta corsia libera
 * - Sterzo smorzato con tangente pista, damping imbardata (yawRate) e slew-rate limiter (niente zig-zag)
 */

import { CAR_PHYSICS_CONFIG, WEATHER_CONFIG } from '../config/constants.js';
import { getDifficultyConfig } from '../config/difficulty.js';
import { queryTrackSurface } from '../tracks/TrackSurface.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Campiona posizione, tangente e normale della spline in modo continuo lungo l'arco.
 */
function sampleTrackAtArcDistance(trackSurface, arcDist) {
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

  return {
    x,
    z,
    tx,
    tz,
    nx: tz,
    nz: -tx,
  };
}

function computeChordCurvature(samples, sampleCount, baseIdx, chordSamples, stepLen) {
  const a = samples[baseIdx % sampleCount];
  const b = samples[(baseIdx + chordSamples) % sampleCount];
  const cross = a.tx * b.tz - a.tz * b.tx;
  const dot = a.tx * b.tx + a.tz * b.tz;
  const dTheta = Math.abs(Math.atan2(cross, dot));
  return dTheta / Math.max(1, chordSamples * stepLen);
}

const CANDIDATE_LANES = [-3.0, -1.5, 0.0, 1.5, 3.0];

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

  // Durante il semaforo rosso mantieni il freno premuto in griglia
  if (worldState.raceState.status === 'countdown') {
    return { forward: false, backward: true, left: false, right: false, analogSteer: 0 };
  }

  const weatherProps = WEATHER_CONFIG[worldState.weather] || WEATHER_CONFIG.dry;
  const difficultyProps = getDifficultyConfig(worldState.difficultyId);
  const botPace = difficultyProps.botPaceMultiplier;
  const isRain = weatherProps.id === 'rain';
  const { samples, sampleCount, totalLength, halfTrackWidth } = trackSurface;
  const stepLen = totalLength / sampleCount;

  const query = queryTrackSurface(trackSurface, botCar.x, botCar.z, botCar.trackSampleIndex);
  botCar.trackSampleIndex = query.sampleIndex;

  const currentSpeed = Math.max(0, botCar.forwardSpeed);
  const maxStraightSpeed =
    93.0 * (botCar.maxSpeedMultiplier ?? 1.0) * botPace * (isRain ? 0.92 : 1.0);

  // 1. Scansione curvatura futura (corde corta + media) e stima limite sterzo ad alta velocità
  const maxLookSamples = Math.min(54, Math.floor(sampleCount * 0.25));
  const gripScale =
    (isRain ? 0.65 : 1.0) *
    (botCar.aeroTire?.tireGripFactor ?? 1.0) *
    (0.88 + (botCar.skillFactor ?? 0.96) * 0.14) *
    (botPace * botPace);

  const comfortLatAccel = 34.5 * gripScale;
  const comfortBrakeDecel =
    23.5 * (isRain ? 0.68 : 1.0) * (0.9 + (botCar.skillFactor ?? 0.96) * 0.1) * (0.85 + 0.15 * botPace);

  const maxEffectiveSteer = CAR_PHYSICS_CONFIG.maxSteerAngle * 0.82;
  let targetSpeed = maxStraightSpeed;
  let nearCurvature = 0;

  for (let offset = 1; offset <= maxLookSamples; offset += 2) {
    const baseIdx = (query.sampleIndex + offset) % sampleCount;
    const curvShort = computeChordCurvature(samples, sampleCount, baseIdx, 2, stepLen);
    const curvMed = computeChordCurvature(samples, sampleCount, baseIdx, 4, stepLen);
    const curvature = Math.max(curvShort, curvMed);
    const distAhead = offset * stepLen;

    if (distAhead <= 28.0 && curvature > nearCurvature) {
      nearCurvature = curvature;
    }

    if (curvature > 0.002) {
      const vGrip = Math.sqrt(comfortLatAccel / curvature);

      // Velocità massima alla quale l'attenuazione sterzo consente ancora di chiudere la curva
      const reqSteer = Math.atan(curvature * CAR_PHYSICS_CONFIG.wheelbase) * 1.32;
      let vSteer = maxStraightSpeed;
      if (reqSteer >= maxEffectiveSteer) {
        vSteer = CAR_PHYSICS_CONFIG.highSpeedSteerScale;
      } else if (reqSteer > 0.001) {
        vSteer =
          CAR_PHYSICS_CONFIG.highSpeedSteerScale *
          Math.pow(maxEffectiveSteer / reqSteer - 1, 1 / CAR_PHYSICS_CONFIG.highSpeedSteerExponent) *
          (0.92 + 0.08 * botPace);
      }

      const curveSpeed = clamp(Math.min(vGrip, vSteer), 18.0, maxStraightSpeed);
      const neededBrakeDist =
        currentSpeed > curveSpeed
          ? (currentSpeed * currentSpeed - curveSpeed * curveSpeed) / (2 * comfortBrakeDecel)
          : 0;

      if (distAhead <= 18.0 || neededBrakeDist >= distAhead - 14.0) {
        if (curveSpeed < targetSpeed) {
          targetSpeed = curveSpeed;
        }
      }
    }
  }

  // 2. Scelta corsia stabile con isteresi, soglia velocità di avvicinamento e verifica spazio libero
  const laneLimit = Math.min(3.4, Math.max(1.8, halfTrackWidth - 3.2));
  if (botCar.preferredLaneOffset === null || botCar.preferredLaneOffset === undefined) {
    botCar.preferredLaneOffset = clamp(query.lateralOffset, -laneLimit, laneLimit);
    botCar.targetLaneOffset = botCar.preferredLaneOffset;
  }

  botCar.laneHoldTimer = Math.max(0, (botCar.laneHoldTimer ?? 0) - 1 / 60);

  const myDist = query.arcDistance;
  const nearbyCars = [];
  let nearestAhead = null;

  for (const other of Object.values(worldState.cars)) {
    if (other.id === botCar.id) continue;

    const dx = other.x - botCar.x;
    const dz = other.z - botCar.z;
    if (dx * dx + dz * dz > 36 * 36) continue;

    const otherQ = queryTrackSurface(trackSurface, other.x, other.z, other.trackSampleIndex);
    let forwardDelta = (otherQ.arcDistance - myDist + totalLength) % totalLength;
    if (forwardDelta > totalLength * 0.5) {
      forwardDelta -= totalLength;
    }

    if (forwardDelta < -6.0 || forwardDelta > 32.0) continue;

    const carInfo = {
      forwardDelta,
      lateralOffset: otherQ.lateralOffset,
      forwardSpeed: other.forwardSpeed,
    };
    nearbyCars.push(carInfo);

    if (
      forwardDelta > 0.5 &&
      forwardDelta < 26.0 &&
      Math.abs(otherQ.lateralOffset - query.lateralOffset) < 2.15
    ) {
      if (!nearestAhead || forwardDelta < nearestAhead.forwardDelta) {
        nearestAhead = carInfo;
      }
    }
  }

  // Rientro morbido se il bot è finito molto largo fuori pista
  if (Math.abs(query.lateralOffset) > halfTrackWidth - 1.2) {
    botCar.preferredLaneOffset = clamp(query.lateralOffset, -laneLimit * 0.7, laneLimit * 0.7);
  } else if (nearestAhead) {
    const closingSpeed = currentSpeed - nearestAhead.forwardSpeed;

    // Adatta il passo se dietro a una vettura lenta senza margine immediato
    if (
      nearestAhead.forwardDelta < 12.0 &&
      closingSpeed > -0.5 &&
      Math.abs((botCar.targetLaneOffset ?? 0) - nearestAhead.lateralOffset) < 1.75 &&
      nearestAhead.forwardDelta < 10.5
    ) {
      targetSpeed = Math.min(
        targetSpeed,
        Math.max(14.0, nearestAhead.forwardSpeed - 0.5 + nearestAhead.forwardDelta * 0.25)
      );
    }

    // Cambia corsia solo se non in chicane stretta, timer scaduto e stiamo recuperando terreno
    const shouldAttemptPass =
      botCar.laneHoldTimer <= 0 &&
      nearCurvature < 0.0075 &&
      (closingSpeed > 1.3 || (nearestAhead.forwardDelta < 9.0 && closingSpeed > 0.2));

    if (shouldAttemptPass) {
      let bestCand = null;
      let bestScore = Infinity;

      for (const rawCand of CANDIDATE_LANES) {
        const cand = clamp(rawCand, -laneLimit, laneLimit);
        const isClear = !nearbyCars.some(
          (c) =>
            c.forwardDelta > -4.5 &&
            c.forwardDelta < 24.0 &&
            Math.abs(c.lateralOffset - cand) < 2.15
        );
        if (!isClear) continue;

        const score = Math.abs(cand - query.lateralOffset) + Math.abs(cand) * 0.15;
        if (score < bestScore) {
          bestScore = score;
          bestCand = cand;
        }
      }

      if (bestCand !== null && Math.abs(bestCand - botCar.preferredLaneOffset) > 0.35) {
        botCar.preferredLaneOffset = bestCand;
        botCar.laneHoldTimer = 2.0;
      }
    }
  } else if (botCar.laneHoldTimer <= 0 && worldState.elapsedTime > 4.0) {
    // Rientra gradualmente verso centro pista solo dopo la partenza e se il corridoio centrale è libero
    const centerClear = !nearbyCars.some(
      (c) =>
        c.forwardDelta > -4.5 &&
        c.forwardDelta < 18.0 &&
        Math.abs(c.lateralOffset) < 2.15
    );
    if (centerClear) {
      botCar.preferredLaneOffset *= 0.985;
    }
  }

  // Transizione laterale dolce con slew limit (max 1.8 m/s)
  const prevLane = botCar.targetLaneOffset ?? botCar.preferredLaneOffset;
  const laneDelta = clamp(botCar.preferredLaneOffset - prevLane, -0.03, 0.03);
  botCar.targetLaneOffset = clamp(prevLane + laneDelta, -laneLimit, laneLimit);

  // 3. Controllo sterzo smorzato su lookahead continuo + tangente + damping imbardata
  const curvLookScale = clamp(1.0 - nearCurvature * 28.0, 0.45, 1.0);
  const lookaheadMeters = clamp((13.0 + currentSpeed * 0.34) * curvLookScale, 9.5, 42.0);
  const targetSample = sampleTrackAtArcDistance(trackSurface, myDist + lookaheadMeters);

  const targetX = targetSample.x + targetSample.nx * botCar.targetLaneOffset;
  const targetZ = targetSample.z + targetSample.nz * botCar.targetLaneOffset;

  const desiredHeading = Math.atan2(targetX - botCar.x, targetZ - botCar.z);
  const headingError = normalizeAngle(desiredHeading - botCar.heading);

  const tangentHeading = Math.atan2(query.tx, query.tz);
  const tangentError = normalizeAngle(tangentHeading - botCar.heading);

  const kp = 1.55 + currentSpeed * 0.022;
  const kdYaw = 0.22 + currentSpeed * 0.0025;
  const rawSteer = clamp(
    headingError * kp + tangentError * 0.35 - (botCar.yawRate ?? 0) * kdYaw,
    -1,
    1
  );

  const prevSteer = botCar.prevSteerInput ?? 0;
  const limitedSteer = clamp(prevSteer + clamp(rawSteer - prevSteer, -0.11, 0.11), -1, 1);
  const analogSteer = Math.abs(limitedSteer) < 0.008 ? 0 : limitedSteer;
  botCar.prevSteerInput = analogSteer;

  // 4. Controllo acceleratore/freno con prevenzione bloccaggio ruote
  const isBrakingNeeded = botCar.forwardSpeed > targetSpeed + 1.8;
  const avoidLockupRelease =
    Boolean(botCar.aeroTire?.wheelLockup) && (worldState.tick % 6 < 3);

  const backward = isBrakingNeeded && !avoidLockupRelease;
  const forward = !isBrakingNeeded && botCar.forwardSpeed < targetSpeed;

  return {
    forward,
    backward,
    left: analogSteer > 0.05,
    right: analogSteer < -0.05,
    analogSteer,
  };
}
