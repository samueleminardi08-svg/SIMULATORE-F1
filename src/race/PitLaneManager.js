/**
 * Gestore deterministico e serializzabile della Pit Lane e dei Box (Step 3 — PIANO PRE STEP 4).
 *
 * Responsabilità:
 * - Stati pit per vettura: 'IN_GARAGE' | 'EXITING_GARAGE' | 'PIT_EXIT_LANE' | 'ON_TRACK' |
 *   'IN_LAP' | 'PIT_ENTRY_LANE' | 'PIT_STOPPING' | 'AUTO_BOX_STOP' | 'IN_PIT_BOX' |
 *   'AUTO_PARKING' | 'PARKED_STAGE_END'.
 * - Regola intervallo minimo 3.0 secondi tra due uscite consecutive dai box (giocatore o bot)
 *   + controllo anti unsafe-release sul traffico in fast lane (-28 m .. +18 m).
 * - Uscita semi-automatica dal box (traiettoria Bézier ~1.65 s -> PIT_EXIT_LANE con limitatore).
 * - Parcheggio automatico dentro il proprio box al rientro a fine Q1/Q2/Q3 (~2.0 s -> PARKED_STAGE_END).
 * - Rientro rapido opzionale all'ingresso pit lane per saltare l'intero giro di rientro.
 *
 * Modulo puro JavaScript (Node.js headless safe, nessun accesso a DOM/Three.js).
 */

import { CAR_PHYSICS_CONFIG, TIRE_COMPOUNDS } from '../config/constants.js';
import { queryPitLane } from '../tracks/PitLaneGeometry.js';
import { queryTrackSurface } from '../tracks/TrackSurface.js';
import { fitFreshTires } from '../physics/AeroAndTires.js';
import { updateSuspension } from '../physics/Suspension.js';

export const MIN_PIT_RELEASE_INTERVAL_S = 10.0;
export const PIT_EXIT_GATE_INTERVAL_S = 10.0;
export const PIT_QUEUE_BUMPER_GAP_M = 2.0;
export const PIT_QUEUE_CENTER_SPACING_M =
  (CAR_PHYSICS_CONFIG.carLength ?? 5.32) + PIT_QUEUE_BUMPER_GAP_M; // ~7.32 m centro-centro (~2.0 m muso-alettone)
export const PIT_QUEUE_AUTO_ENGAGE_DIST_M = 26.0;
export const UNSAFE_MERGE_BACK_M = 7.5;
export const UNSAFE_MERGE_FRONT_M = 13.5;
export const UNSAFE_APPROACH_RANGE_M = 34.0;
export const UNSAFE_APPROACH_TTC_S = 1.85;
export const UNSAFE_ADJACENT_EXIT_BACK_M = 16.0;
export const UNSAFE_ADJACENT_EXIT_FRONT_M = 14.0;

export const PIT_MANAGED_STATES = new Set([
  'IN_GARAGE',
  'EXITING_GARAGE',
  'PIT_STOPPING',
  'AUTO_PARKING',
  'PARKED_STAGE_END',
]);

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function wrapAngleRad(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function lerpAngleRad(from, to, t) {
  return from + wrapAngleRad(to - from) * clamp(t, 0, 1);
}

function smoothstep01(t) {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}

function pitDurationHash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

export const PIT_STOP_PHASE1_END_S = 0.35;
export const PIT_STOP_SWAP_TIME_S = 1.15;
export const PIT_STOP_PHASE2_END_S = 1.95;
export const PIT_STOP_MAX_JACK_LIFT_M = 0.055;
export const PIT_STOP_MAX_WHEEL_OUT_M = 0.45;

/**
 * Calcola in modo deterministico lo stato visivo 3D delle 3 fasi di Pit Stop animato:
 * - Fase 1 (0..0.35s): sollevamento martinetti anteriore/posteriore (+5.5 cm)
 * - Fase 2 (0.35..1.95s): smontaggio 4 ruote (±0.45 m), cambio mescola a 1.15s, rimontaggio
 * - Fase 3 (1.95..duration): abbassamento a terra + rilascio semaforo verde FIA
 */
export function computePitStopVisualState(car) {
  if (!car || car.pitState !== 'PIT_STOPPING') {
    return {
      active: false,
      phase: 0,
      elapsed: 0,
      duration: 2.4,
      progress: 0,
      jackLiftM: 0,
      wheelOutOffsetM: 0,
      swapped: false,
      oldCompound: car?.aeroTire?.compound || 'M',
      newCompound: car?.nextPitCompound || car?.aeroTire?.compound || 'M',
    };
  }
  const duration = Math.max(2.2, car.pitStopDuration ?? 2.45);
  const t = Math.max(0, car.pitStopElapsed ?? 0);
  const progress = clamp(t / duration, 0, 1);
  let phase = 1;
  let jackLiftM = 0;
  let wheelOutOffsetM = 0;

  if (t < PIT_STOP_PHASE1_END_S) {
    phase = 1;
    jackLiftM = PIT_STOP_MAX_JACK_LIFT_M * smoothstep01(t / PIT_STOP_PHASE1_END_S);
    wheelOutOffsetM = 0;
  } else if (t < PIT_STOP_PHASE2_END_S) {
    phase = 2;
    jackLiftM = PIT_STOP_MAX_JACK_LIFT_M;
    if (t < 0.90) {
      wheelOutOffsetM = PIT_STOP_MAX_WHEEL_OUT_M * smoothstep01((t - PIT_STOP_PHASE1_END_S) / 0.55);
    } else if (t < 1.40) {
      wheelOutOffsetM = PIT_STOP_MAX_WHEEL_OUT_M;
    } else {
      wheelOutOffsetM = PIT_STOP_MAX_WHEEL_OUT_M * (1 - smoothstep01((t - 1.40) / 0.55));
    }
  } else if (t < duration) {
    phase = 3;
    const dropSpan = Math.max(0.2, duration - PIT_STOP_PHASE2_END_S);
    jackLiftM = PIT_STOP_MAX_JACK_LIFT_M * (1 - smoothstep01((t - PIT_STOP_PHASE2_END_S) / dropSpan));
    wheelOutOffsetM = 0;
  } else {
    phase = 3;
    jackLiftM = 0;
    wheelOutOffsetM = 0;
  }

  return {
    active: true,
    phase,
    elapsed: t,
    duration,
    progress,
    jackLiftM,
    wheelOutOffsetM,
    swapped: Boolean(car.pitStopSwapped || t >= PIT_STOP_SWAP_TIME_S),
    oldCompound: car.pitStopPrevCompound || car.aeroTire?.compound || 'M',
    newCompound: car.nextPitCompound || car.aeroTire?.compound || 'M',
  };
}

export function beginRacePitStop(car, worldState) {
  if (!car) return false;
  const h = pitDurationHash01(`${car.driverId || car.id}:${car.pitStopCount ?? 0}:${worldState?.tick ?? 0}`);
  const duration = Number((2.25 + h * 0.52).toFixed(2)); // ~2.25 .. 2.77 s
  const isRain = worldState?.weather === 'rain';
  const curComp = car.aeroTire?.compound || (isRain ? 'W' : 'M');
  if (!TIRE_COMPOUNDS[car.nextPitCompound]) {
    car.nextPitCompound = isRain ? 'W' : (curComp === 'M' ? 'S' : 'M');
  }
  car.pitState = 'PIT_STOPPING';
  car.pitStopDuration = duration;
  car.pitStopElapsed = 0;
  car.pitStopSwapped = false;
  car.pitStopPrevCompound = curComp;
  car.botPitStopTimer = duration;
  car.pitControlsLocked = true;
  car.pitAutoAlign = null;
  car.pitBoxHoldTimer = 0;
  return true;
}

function evalCubicBezier(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return mt2 * mt * p0 + 3 * mt2 * t * p1 + 3 * mt * t2 * p2 + t2 * t * p3;
}

function evalCubicBezierDeriv(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return 3 * mt * mt * (p1 - p0) + 6 * mt * t * (p2 - p1) + 3 * t * t * (p3 - p2);
}

export function createInitialPitLaneState() {
  return {
    lastPitReleaseTime: -MIN_PIT_RELEASE_INTERVAL_S,
    lastReleasedCarId: null,
    releaseSeq: 0,
    lastPitExitTime: -PIT_EXIT_GATE_INTERVAL_S,
    lastExitedCarId: null,
    pitExitReleaseSeq: 0,
    pitExitQueueIds: [],
  };
}

export function getCarPitStall(pitLane, car) {
  if (!pitLane || !car) return null;
  if (car.driverId && pitLane.stallByDriverId?.[car.driverId]) {
    return pitLane.stallByDriverId[car.driverId];
  }
  const byTeam = pitLane.stalls?.find((s) => s.teamId === car.teamId);
  return byTeam || pitLane.stalls?.[0] || null;
}

export function getCarPitGarage(pitLane, car) {
  if (!pitLane || !car) return null;
  return pitLane.garageByTeamId?.[car.teamId] || pitLane.garages?.[0] || null;
}

/**
 * Calcola lo stato semaforico dell'Ingegnere di Gara per l'uscita dal box secondo
 * il Regolamento Sportivo FIA F1 Art. 34.14(a) (Unsafe Release):
 * - Nessun blocco temporale fisso nei box: il pilota può uscire quando vuole.
 * - Viene bloccato SOLO nei veri casi di unsafe release:
 *   1) Altra vettura adiacente che sta già compiendo la manovra di immissione dai box.
 *   2) Vettura in fast lane ferma/in transito davanti allo stallo o sulla zona di immissione.
 *   3) Vettura in arrivo da dietro nella fast lane che verrebbe costretta a frenare/sterzare (TTC <= 1.85s).
 * @param {object} worldState
 * @param {object} car
 */
export function evaluatePitReleaseSafety(worldState, car) {
  const pitLane = worldState?.trackSurface?.pitLane || null;
  const speedLimitKmh = pitLane?.speedLimitKmh ?? 80;
  if (!pitLane || !car) {
    return {
      visible: false,
      isGreen: true,
      reason: 'CLEAR',
      waitSeconds: 0,
      label: 'VIA LIBERA — ESCI [W]',
      speedLimitKmh,
    };
  }

  const stall = getCarPitStall(pitLane, car);
  const myS = stall ? stall.sMeters : queryPitLane(pitLane, car.x, car.z).sMeters;

  for (const other of Object.values(worldState.cars || {})) {
    if (!other || other.id === car.id) continue;
    if (other.pitState === 'IN_GARAGE' || other.pitState === 'PARKED_STAGE_END') continue;

    // 1. Conflitto diretto con un'altra vettura vicina che sta uscendo dal box nello stesso corridoio
    if (other.pitState === 'EXITING_GARAGE') {
      const otherStall = getCarPitStall(pitLane, other);
      const otherS = otherStall ? otherStall.sMeters : myS;
      const signedAhead = otherS - myS;
      if (signedAhead >= -UNSAFE_ADJACENT_EXIT_BACK_M && signedAhead <= UNSAFE_ADJACENT_EXIT_FRONT_M) {
        return {
          visible: true,
          isGreen: false,
          reason: 'UNSAFE_ADJACENT_EXIT',
          waitSeconds: 0,
          label: 'STOP — UNSAFE RELEASE (USCITA ADIACENTE)',
          speedLimitKmh,
        };
      }
      continue;
    }

    const opq = queryPitLane(pitLane, other.x, other.z);
    if (!opq.inPitLane || opq.inGarage) continue;

    const signedAhead = opq.sMeters - myS;

    // 2. Fast lane fisicamente occupata davanti allo stallo / zona di immissione
    if (signedAhead >= -UNSAFE_MERGE_BACK_M && signedAhead <= UNSAFE_MERGE_FRONT_M) {
      return {
        visible: true,
        isGreen: false,
        reason: 'UNSAFE_OCCUPIED',
        waitSeconds: 0,
        label: 'STOP — UNSAFE RELEASE (FAST LANE OCCUPATA)',
        speedLimitKmh,
      };
    }

    // 3. Vettura in arrivo da dietro nella fast lane (FIA Art. 34.14(a): rischio collisione o frenata brusca)
    if (signedAhead < -UNSAFE_MERGE_BACK_M && signedAhead >= -UNSAFE_APPROACH_RANGE_M) {
      const approachSpeed = Math.max(0, other.forwardSpeed ?? other.speed ?? 0);
      const distBehind = -signedAhead;
      const ttc = approachSpeed > 1.5 ? distBehind / approachSpeed : Infinity;
      if (ttc <= UNSAFE_APPROACH_TTC_S) {
        return {
          visible: true,
          isGreen: false,
          reason: 'UNSAFE_APPROACHING',
          waitSeconds: Math.max(0.2, ttc),
          label: 'STOP — UNSAFE RELEASE (AUTO IN ARRIVO)',
          speedLimitKmh,
        };
      }
    }
  }

  return {
    visible: true,
    isGreen: true,
    reason: 'CLEAR',
    waitSeconds: 0,
    label: 'VIA LIBERA — ESCI [W]',
    speedLimitKmh,
  };
}

/**
 * Avvia la traiettoria semi-automatica di uscita dal box verso la fast lane (~1.65 s).
 */
export function beginGarageExit(worldState, car) {
  const pitLane = worldState?.trackSurface?.pitLane;
  if (!pitLane || !car) return false;
  const stall = getCarPitStall(pitLane, car);
  if (!stall) return false;

  if (!worldState.pitLaneState) {
    worldState.pitLaneState = createInitialPitLaneState();
  }
  worldState.pitLaneState.lastPitReleaseTime = worldState.elapsedTime ?? 0;
  worldState.pitLaneState.lastReleasedCarId = car.id;
  worldState.pitLaneState.releaseSeq = (worldState.pitLaneState.releaseSeq ?? 0) + 1;

  const p0x = car.x;
  const p0z = car.z;
  const p3x = stall.mergePointPos.x;
  const p3z = stall.mergePointPos.z;
  const chord = Math.max(2.0, Math.hypot(p3x - p0x, p3z - p0z));
  const handleOut = clamp(chord * 0.42, 2.2, 6.0);
  const handleIn = clamp(chord * 0.44, 2.4, 6.2);

  const startFwdX = Math.sin(car.heading);
  const startFwdZ = Math.cos(car.heading);
  const endFwdX = Math.sin(stall.mergePointPos.heading);
  const endFwdZ = Math.cos(stall.mergePointPos.heading);

  car.pitState = 'EXITING_GARAGE';
  car.pitExitRequested = false;
  car.pitExitCleared = false;
  car.pitExitGateHold = false;
  car.pitExitGateMaxSpeedMs = null;
  car.pitQueuePosition = 0;
  car.pitQueueAutoActive = false;
  car.pitExitAutoLaunch = false;
  car.pitControlsLocked = true;
  car.pitLimiterActive = true;
  car.pitLimitKmh = pitLane.speedLimitKmh;
  car.pitAutoAlign = {
    kind: 'exit_garage',
    p0x,
    p0z,
    p1x: p0x + startFwdX * handleOut,
    p1z: p0z + startFwdZ * handleOut,
    p2x: p3x - endFwdX * handleIn,
    p2z: p3z - endFwdZ * handleIn,
    p3x,
    p3z,
    startHeading: car.heading,
    targetHeading: stall.mergePointPos.heading,
    targetY: stall.mergePointPos.y ?? 0,
    elapsed: 0,
    duration: 1.65,
  };
  return true;
}

/**
 * Avvia il parcheggio automatico dentro il proprio box (fine Q1/Q2/Q3, ~2.0 s).
 */
export function beginGarageAutoParking(worldState, car) {
  const pitLane = worldState?.trackSurface?.pitLane;
  if (!pitLane || !car) return false;
  const stall = getCarPitStall(pitLane, car);
  if (!stall) return false;

  const p0x = car.x;
  const p0z = car.z;
  const p3x = stall.garageInteriorPos.x;
  const p3z = stall.garageInteriorPos.z;
  const chord = Math.max(1.5, Math.hypot(p3x - p0x, p3z - p0z));
  const handleLen = clamp(chord * 0.42, 1.8, 5.5);

  const startFwdX = Math.sin(car.heading);
  const startFwdZ = Math.cos(car.heading);
  // Ingresso fluido dentro il box: orienta il muso leggermente verso l'interno e poi si assesta nello stallo
  const tgtFwdX = Math.sin(stall.garageInteriorPos.heading);
  const tgtFwdZ = Math.cos(stall.garageInteriorPos.heading);

  car.pitState = 'AUTO_PARKING';
  car.pitControlsLocked = true;
  car.pitLimiterActive = true;
  car.pitLimitKmh = pitLane.speedLimitKmh;
  car.pitAutoAlign = {
    kind: 'park_garage',
    p0x,
    p0z,
    p1x: p0x + startFwdX * handleLen,
    p1z: p0z + startFwdZ * handleLen,
    p2x: p3x + tgtFwdX * (handleLen * 0.55),
    p2z: p3z + tgtFwdZ * (handleLen * 0.55),
    p3x,
    p3z,
    startHeading: car.heading,
    targetHeading: stall.garageInteriorPos.heading,
    targetY: stall.garageInteriorPos.y ?? 0,
    elapsed: 0,
    duration: 2.0,
  };
  return true;
}

/**
 * Porta la vettura direttamente all'ingresso pit lane (pulsante opzionale "Rientro rapido ai box").
 */
export function quickReturnCarToPitEntry(worldState, carId) {
  const pitLane = worldState?.trackSurface?.pitLane;
  const car = worldState?.getCar?.(carId);
  if (!pitLane || !car || !pitLane.samples?.length) return false;

  if (
    car.pitState === 'AUTO_PARKING' ||
    car.pitState === 'PARKED_STAGE_END' ||
    car.pitState === 'IN_GARAGE'
  ) {
    return false;
  }

  // Posiziona la vettura pulita appena dentro la rampa d'ingresso pit lane rivolta verso la scia verde
  const targetS = pitLane.entryStartM + Math.min(14, (pitLane.speedStartM - pitLane.entryStartM) * 0.35);
  let entrySample = pitLane.samples[0];
  for (const s of pitLane.samples) {
    if (s.sMeters >= targetS) {
      entrySample = s;
      break;
    }
  }

  const heading = Math.atan2(entrySample.tx, entrySample.tz);
  const cruiseSpeed = Math.min(15.0, pitLane.speedLimitMs * 0.85);

  car.x = entrySample.x;
  car.y = entrySample.y ?? 0;
  car.z = entrySample.z;
  car.heading = heading;
  car.vx = Math.sin(heading) * cruiseSpeed;
  car.vz = Math.cos(heading) * cruiseSpeed;
  car.forwardSpeed = cruiseSpeed;
  car.lateralSpeed = 0;
  car.speed = cruiseSpeed;
  car.yawRate = 0;
  car.steerAngle = 0;
  car.surface = 'pitlane';
  car.pitState = 'PIT_ENTRY_LANE';
  car.pitControlsLocked = false;
  car.pitLimiterActive = true;
  car.pitLimitKmh = pitLane.speedLimitKmh;
  car.pitBoxLeaveCooldown = 0;
  car.pitAutoAlign = null;
  car.chequeredLapDone = true;

  if (worldState.qualifyingState && worldState.qualifyingState.status === 'chequered_flag') {
    worldState.qualifyingState.status = 'in_lap';
  }
  worldState.pitGuideActive = true;

  const q = queryTrackSurface(worldState.trackSurface, car.x, car.z, entrySample.trackSampleIndex);
  car.trackSampleIndex = q.sampleIndex;
  return true;
}

function stepGarageBezierTrajectory(car, trackSurface, pitLane, dt) {
  const a = car.pitAutoAlign;
  if (!a) return true;
  const cfg = CAR_PHYSICS_CONFIG;

  const prevX = car.x;
  const prevZ = car.z;
  const prevHeading = car.heading;

  a.elapsed = Math.min(a.duration, a.elapsed + dt);
  const u = a.duration > 1e-4 ? clamp(a.elapsed / a.duration, 0, 1) : 1;

  // Uscita box: accelerazione progressiva fluida (smoothstep); parcheggio box: decelerazione dolce fino a 0
  const s =
    a.kind === 'exit_garage'
      ? u * u * (3 - 2 * u)
      : 1 - Math.pow(1 - u, 2.25);

  const nextX = evalCubicBezier(a.p0x, a.p1x, a.p2x, a.p3x, s);
  const nextZ = evalCubicBezier(a.p0z, a.p1z, a.p2z, a.p3z, s);
  const dBx = evalCubicBezierDeriv(a.p0x, a.p1x, a.p2x, a.p3x, s);
  const dBz = evalCubicBezierDeriv(a.p0z, a.p1z, a.p2z, a.p3z, s);
  const tangentHeading =
    Math.hypot(dBx, dBz) > 1e-3 ? Math.atan2(dBx, dBz) : a.targetHeading;

  const blendEnd = u * u * (3 - 2 * u);
  const nextHeading =
    a.kind === 'exit_garage'
      ? lerpAngleRad(lerpAngleRad(a.startHeading, tangentHeading, Math.min(1, u * 1.5)), a.targetHeading, blendEnd)
      : lerpAngleRad(a.startHeading, a.targetHeading, blendEnd);

  const vx = (nextX - prevX) / Math.max(1e-4, dt);
  const vz = (nextZ - prevZ) / Math.max(1e-4, dt);
  const spd = Math.hypot(vx, vz);

  car.x = nextX;
  car.z = nextZ;
  car.y = a.targetY;
  car.heading = nextHeading;
  car.vx = vx;
  car.vz = vz;
  car.forwardSpeed = spd;
  car.lateralSpeed = 0;
  car.speed = spd;
  car.yawRate = wrapAngleRad(nextHeading - prevHeading) / Math.max(1e-4, dt);
  car.steerAngle = clamp(car.yawRate * 0.45, -cfg.maxSteerAngle * 0.85, cfg.maxSteerAngle * 0.85);
  car.surface = 'pitlane';
  car.pitControlsLocked = true;
  car.pitLimiterActive = true;
  car.pitLimitKmh = pitLane.speedLimitKmh;
  car.throttleInput = a.kind === 'exit_garage' ? 0.35 : 0;
  car.brakeInput = a.kind === 'park_garage' ? 0.35 : 0;
  car.steerInput = 0;
  car.gear = spd > 0.4 ? 1 : 0;
  car.gearLabel = car.gear === 1 ? '1' : 'N';
  const targetRpm = cfg.idleRpm + clamp(spd / Math.max(8, pitLane.speedLimitMs), 0, 1) * 4800;
  car.rpm += (targetRpm - car.rpm) * Math.min(1, 14 * dt);

  if (car.aeroTire) {
    car.aeroTire.wheelLockup = false;
    car.aeroTire.highSpeedBraking = false;
  }
  updateSuspension(car, a.kind === 'exit_garage' ? 0.25 : -0.3 * (1 - u), (car.yawRate * spd) / 9.81, dt);

  const wheelDelta = (spd / cfg.wheelRadius) * dt;
  car.wheelRotation += wheelDelta;
  car.frontWheelRotation += wheelDelta;

  const postQ = queryTrackSurface(trackSurface, car.x, car.z, car.trackSampleIndex);
  car.trackSampleIndex = postQ.sampleIndex;

  return a.elapsed >= a.duration - 1e-5;
}

function findPitSampleAtS(pitLane, targetS) {
  const samples = pitLane.samples;
  if (!samples?.length) return null;
  const clamped = clamp(targetS, pitLane.entryStartM, pitLane.exitEndM);
  const span = Math.max(1e-3, pitLane.exitEndM - pitLane.entryStartM);
  const approxIdx = clamp(
    Math.round(((clamped - pitLane.entryStartM) / span) * (samples.length - 1)),
    0,
    samples.length - 1
  );
  let best = samples[approxIdx];
  let bestD = Math.abs(best.sMeters - clamped);
  for (let delta = -4; delta <= 4; delta++) {
    const idx = approxIdx + delta;
    if (idx < 0 || idx >= samples.length) continue;
    const d = Math.abs(samples[idx].sMeters - clamped);
    if (d < bestD) {
      bestD = d;
      best = samples[idx];
    }
  }
  return best;
}

/**
 * Pilota automatico di accodamento in fast lane (Qualifiche):
 * - Si ferma automaticamente a ~2.0 m muso-alettone dalla vettura davanti (stopS).
 * - Quando la vettura davanti avanza, avanza automaticamente mantenendo la distanza.
 * - Al semaforo di uscita attende i 10s, poi rilascia la vettura (con breve avvio pulito).
 */
function stepPitQueueAutoPilot(car, pitLane, trackSurface, stopS, targetMaxSpeedMs, dt, lockControls = true) {
  const cfg = CAR_PHYSICS_CONFIG;
  const pq = queryPitLane(pitLane, car.x, car.z, car.teamId);
  if (!pq.sample) return;

  const distToStop = stopS - pq.sMeters;
  let desiredSpeed = targetMaxSpeedMs;
  if (Number.isFinite(stopS)) {
    if (distToStop <= 0.06) {
      desiredSpeed = 0;
    } else {
      const vBrake = Math.sqrt(Math.max(0, 2 * 5.2 * Math.max(0, distToStop - 0.04)));
      desiredSpeed = Math.min(targetMaxSpeedMs, vBrake);
    }
  }

  const prevSpeed = Math.max(0, car.forwardSpeed ?? 0);
  let nextSpeed;
  if (desiredSpeed > prevSpeed) {
    nextSpeed = Math.min(desiredSpeed, prevSpeed + 9.0 * dt);
  } else {
    nextSpeed = Math.max(desiredSpeed, prevSpeed - 18.0 * dt);
  }
  if (Number.isFinite(stopS) && distToStop <= 0.12 && nextSpeed < 0.25) {
    nextSpeed = 0;
  }

  const prevHeading = car.heading;
  const lookAheadM = Math.max(7.5, nextSpeed * 0.65);
  const tgtSample = findPitSampleAtS(pitLane, pq.sMeters + lookAheadM) || pq.sample;
  const laneHeading = Math.atan2(pq.sample.tx, pq.sample.tz);

  let nextHeading = prevHeading;
  if (nextSpeed > 0.05) {
    const desiredHeading = Math.atan2(tgtSample.x - car.x, tgtSample.z - car.z);
    const turnAlpha = Math.min(1, (3.2 + nextSpeed * 0.35) * dt);
    nextHeading = lerpAngleRad(prevHeading, desiredHeading, turnAlpha);
  } else {
    nextHeading = lerpAngleRad(prevHeading, laneHeading, Math.min(1, 5.0 * dt));
  }

  const maxStepM = Number.isFinite(stopS) ? Math.max(0, distToStop) : Infinity;
  const stepDist = Math.min(nextSpeed * dt, maxStepM);
  const actualSpeed = dt > 1e-4 ? stepDist / dt : 0;

  car.x += Math.sin(nextHeading) * stepDist;
  car.z += Math.cos(nextHeading) * stepDist;
  car.y = pq.sample.y ?? car.y ?? 0;
  car.heading = nextHeading;
  car.vx = Math.sin(nextHeading) * actualSpeed;
  car.vz = Math.cos(nextHeading) * actualSpeed;
  car.forwardSpeed = actualSpeed;
  car.lateralSpeed = 0;
  car.speed = actualSpeed;
  car.yawRate = dt > 1e-4 ? wrapAngleRad(nextHeading - prevHeading) / dt : 0;
  car.steerAngle = clamp(car.yawRate * 0.42, -cfg.maxSteerAngle * 0.75, cfg.maxSteerAngle * 0.75);
  car.surface = 'pitlane';
  car.pitControlsLocked = Boolean(lockControls);
  car.pitLimiterActive = true;
  car.pitLimitKmh = pitLane.speedLimitKmh;
  car.throttleInput = actualSpeed > prevSpeed + 0.05 || actualSpeed > 1.0 ? 0.35 : 0;
  car.brakeInput = actualSpeed < prevSpeed - 0.05 || actualSpeed < 0.05 ? 0.45 : 0;
  car.steerInput = 0;
  car.gear = actualSpeed > 0.35 ? 1 : 0;
  car.gearLabel = car.gear === 1 ? '1' : 'N';

  const targetRpm =
    cfg.idleRpm + clamp(actualSpeed / Math.max(8, pitLane.speedLimitMs), 0, 1) * 5200;
  car.rpm += (targetRpm - car.rpm) * Math.min(1, 14 * dt);

  if (car.aeroTire) {
    car.aeroTire.wheelLockup = false;
    car.aeroTire.highSpeedBraking = false;
  }
  const longAccel = dt > 1e-4 ? (actualSpeed - prevSpeed) / dt : 0;
  updateSuspension(car, clamp(longAccel / 9.81, -0.45, 0.45), (car.yawRate * actualSpeed) / 9.81, dt);

  const wheelDelta = (actualSpeed / cfg.wheelRadius) * dt;
  car.wheelRotation += wheelDelta;
  car.frontWheelRotation += wheelDelta;

  const postQ = queryTrackSurface(trackSurface, car.x, car.z, car.trackSampleIndex);
  car.trackSampleIndex = postQ.sampleIndex;
}

/**
 * Aggiorna la macchina a stati pit lane per tutte le vetture in WorldState.
 * Restituisce un Set di carId già aggiornati in questo tick (che saltano stepCarPhysics libera).
 */
export function updatePitLaneManager(worldState, inputsByCarId, dt, localPlayerId = 'player_1') {
  const handledCars = new Set();
  const trackSurface = worldState?.trackSurface;
  const pitLane = trackSurface?.pitLane;
  if (!trackSurface || !pitLane) {
    worldState.pitReleaseStatus = null;
    return handledCars;
  }

  if (!worldState.pitLaneState) {
    worldState.pitLaneState = createInitialPitLaneState();
  }

  const q = worldState.qualifyingState;
  const isQuali = Boolean(q && worldState.raceState?.mode === 'qualifying');
  const isQualiRunning = Boolean(isQuali && q.status === 'running');
  const isQualiReturning = Boolean(isQuali && (q.status === 'in_lap' || q.status === 'chequered_flag'));
  const cfg = CAR_PHYSICS_CONFIG;

  for (const [carId, car] of Object.entries(worldState.cars)) {
    car.pitExitGateMaxSpeedMs = null;
    car.pitExitGateHold = false;
    car.pitQueuePosition = 0;
    const input = car.isBot ? null : inputsByCarId?.[carId] || null;
    const stall = getCarPitStall(pitLane, car);
    const garage = getCarPitGarage(pitLane, car);

    // 1. Vettura parcheggiata dentro il proprio box in attesa di uscire
    if (car.pitState === 'IN_GARAGE') {
      if (stall) {
        car.x = stall.garageInteriorPos.x;
        car.y = stall.garageInteriorPos.y ?? 0;
        car.z = stall.garageInteriorPos.z;
        car.heading = stall.garageInteriorPos.heading;
      }
      car.vx = 0;
      car.vz = 0;
      car.forwardSpeed = 0;
      car.lateralSpeed = 0;
      car.speed = 0;
      car.yawRate = 0;
      car.steerAngle = 0;
      car.surface = 'pitlane';
      car.pitControlsLocked = true;
      car.pitLimiterActive = true;
      car.pitLimitKmh = pitLane.speedLimitKmh;
      car.gear = 0;
      car.gearLabel = 'N';
      car.throttleInput = 0;
      car.brakeInput = 0;
      car.steerInput = 0;
      car.rpm += (cfg.idleRpm - car.rpm) * Math.min(1, 10 * dt);

      const canReleaseStage = !isQuali || q.status === 'running';
      if (canReleaseStage) {
        if (!car.isBot) {
          const wantsExit = Boolean(input?.forward || car.pitExitRequested);
          if (wantsExit) {
            const safety = evaluatePitReleaseSafety(worldState, car);
            if (safety.isGreen) {
              beginGarageExit(worldState, car);
            } else {
              // Mantiene il semaforo rosso finché non è sicuro (nessuna unsafe release!)
              car.pitExitRequested = false;
            }
          }
        } else if (isQuali && (q.elapsedInStage ?? 0) >= (car.plannedReleaseTime ?? 1.5)) {
          const safety = evaluatePitReleaseSafety(worldState, car);
          if (safety.isGreen) {
            beginGarageExit(worldState, car);
          }
        }
      }

      handledCars.add(carId);
      continue;
    }

    // 2. Uscita semi-automatica fluida dal box alla fast lane (~1.65 s)
    if (car.pitState === 'EXITING_GARAGE') {
      const done = stepGarageBezierTrajectory(car, trackSurface, pitLane, dt);
      if (done) {
        const mergeHeading = car.pitAutoAlign?.targetHeading ?? car.heading;
        const mergeSpeed = Math.min(12.5, pitLane.speedLimitMs * 0.72);
        car.heading = mergeHeading;
        car.vx = Math.sin(mergeHeading) * mergeSpeed;
        car.vz = Math.cos(mergeHeading) * mergeSpeed;
        car.forwardSpeed = mergeSpeed;
        car.lateralSpeed = 0;
        car.speed = mergeSpeed;
        car.yawRate = 0;
        car.steerAngle = 0;
        car.pitAutoAlign = null;
        car.pitState = 'PIT_EXIT_LANE';
        car.pitExitCleared = !isQualiRunning;
        car.pitControlsLocked = false;
        car.pitBoxLeaveCooldown = 6.5; // Evita ri-cattura sul rettangolo del proprio box appena usciti
      }
      handledCars.add(carId);
      continue;
    }

    // 3. Parcheggio automatico dentro il proprio box a fine fase Qualifica (~2.0 s)
    if (car.pitState === 'AUTO_PARKING') {
      const done = stepGarageBezierTrajectory(car, trackSurface, pitLane, dt);
      if (done) {
        if (stall) {
          car.x = stall.garageInteriorPos.x;
          car.y = stall.garageInteriorPos.y ?? 0;
          car.z = stall.garageInteriorPos.z;
          car.heading = stall.garageInteriorPos.heading;
        }
        car.vx = 0;
        car.vz = 0;
        car.forwardSpeed = 0;
        car.lateralSpeed = 0;
        car.speed = 0;
        car.yawRate = 0;
        car.steerAngle = 0;
        car.gear = 0;
        car.gearLabel = 'N';
        car.throttleInput = 0;
        car.brakeInput = 0;
        car.steerInput = 0;
        car.pitAutoAlign = null;
        car.pitState = 'PARKED_STAGE_END';
        car.pitControlsLocked = true;
      }
      handledCars.add(carId);
      continue;
    }

    // 4. Vettura parcheggiata a fine Q1/Q2/Q3
    if (car.pitState === 'PARKED_STAGE_END') {
      if (stall) {
        car.x = stall.garageInteriorPos.x;
        car.y = stall.garageInteriorPos.y ?? 0;
        car.z = stall.garageInteriorPos.z;
        car.heading = stall.garageInteriorPos.heading;
      }
      car.vx = 0;
      car.vz = 0;
      car.forwardSpeed = 0;
      car.lateralSpeed = 0;
      car.speed = 0;
      car.yawRate = 0;
      car.steerAngle = 0;
      car.surface = 'pitlane';
      car.pitControlsLocked = true;
      car.gear = 0;
      car.gearLabel = 'N';
      car.rpm += (cfg.idleRpm - car.rpm) * Math.min(1, 10 * dt);
      handledCars.add(carId);
      continue;
    }

    // 4a. Transizione da AUTO_BOX_STOP/IN_PIT_BOX a PIT_STOPPING animato in Gara e Prove Libere
    if (!car.isBot && car.pitState === 'IN_PIT_BOX') {
      const m = worldState.raceState?.mode;
      if (m === 'race' || m === 'practice') {
        beginRacePitStop(car, worldState);
      } else if (!car.pitPracticeFreshApplied) {
        const chosenComp = TIRE_COMPOUNDS[car.nextPitCompound]
          ? car.nextPitCompound
          : worldState.weather === 'rain'
            ? 'W'
            : 'M';
        fitFreshTires(car, chosenComp, worldState.weather === 'rain');
        car.pitPracticeFreshApplied = true;
        car.pitStopRequested = false;
        worldState.pitGuideActive = false;
      }
    } else if (!car.isBot && car.pitPracticeFreshApplied) {
      car.pitPracticeFreshApplied = false;
    }

    // 4b. Pit stop animato in gara (Giocatore e Bot: ~2.25–2.77s, 3 fasi + cambio mescola + FIA unsafe release)
    if (car.pitState === 'PIT_STOPPING') {
      if (garage) {
        car.x = garage.pitStopPos.x;
        car.y = garage.pitStopPos.y ?? 0;
        car.z = garage.pitStopPos.z;
        car.heading = garage.pitStopPos.heading;
      }
      car.vx = 0;
      car.vz = 0;
      car.forwardSpeed = 0;
      car.lateralSpeed = 0;
      car.speed = 0;
      car.yawRate = 0;
      car.steerAngle = 0;
      car.throttleInput = 0;
      car.brakeInput = 0;
      car.steerInput = 0;
      car.surface = 'pitlane';
      car.pitControlsLocked = true;
      car.pitLimiterActive = true;
      car.pitLimitKmh = pitLane.speedLimitKmh;
      car.gear = 0;
      car.gearLabel = 'N';
      car.rpm += (cfg.idleRpm - car.rpm) * Math.min(1, 10 * dt);
      if (car.aeroTire) {
        car.aeroTire.wheelLockup = false;
        car.aeroTire.highSpeedBraking = false;
      }
      updateSuspension(car, 0, 0, dt);

      const duration = Math.max(2.2, car.pitStopDuration ?? 2.45);
      car.pitStopElapsed = (car.pitStopElapsed ?? 0) + dt;
      car.botPitStopTimer = Math.max(0, duration - car.pitStopElapsed);

      // Fase 2 (metà sosta ~1.15s): montaggio reale del treno di gomme nuovo
      if (!car.pitStopSwapped && car.pitStopElapsed >= PIT_STOP_SWAP_TIME_S) {
        const targetComp = TIRE_COMPOUNDS[car.nextPitCompound]
          ? car.nextPitCompound
          : worldState.weather === 'rain'
            ? 'W'
            : 'M';
        fitFreshTires(car, targetComp, worldState.weather === 'rain');
        car.pitStopSwapped = true;
      }

      if (car.pitStopElapsed >= duration) {
        const safety = evaluatePitReleaseSafety(worldState, car);
        if (safety.isGreen) {
          const launchSpd = 3.8;
          car.pitStopCount = (car.pitStopCount ?? 0) + 1;
          car.pitStopLastDuration = Number(car.pitStopElapsed.toFixed(2));
          car.pitStopRequested = false;
          car.pitState = 'PIT_EXIT_LANE';
          car.pitExitCleared = true;
          car.pitControlsLocked = false;
          car.pitBoxLeaveCooldown = 6.5;
          car.vx = Math.sin(car.heading) * launchSpd;
          car.vz = Math.cos(car.heading) * launchSpd;
          car.forwardSpeed = launchSpd;
          car.speed = launchSpd;
          car.gear = 1;
          car.gearLabel = '1';
          if (!car.isBot) {
            worldState.pitGuideActive = false;
          }
        }
      }
      handledCars.add(carId);
      continue;
    }

    // 5. Transizione PIT_EXIT_LANE / PIT_ENTRY_LANE -> ON_TRACK una volta fuori dalla pit lane
    const pq = queryPitLane(pitLane, car.x, car.z, car.teamId);
    if (car.pitState === 'PIT_EXIT_LANE') {
      if (!pq.inPitLane) {
        car.pitState = 'ON_TRACK';
      }
    } else if (car.pitState === 'PIT_ENTRY_LANE' && !pq.inPitLane) {
      car.pitState = isQualiReturning && !car.isBot ? 'IN_LAP' : 'ON_TRACK';
    } else if (
      car.isBot &&
      car.pitStopRequested &&
      worldState.raceState?.mode === 'race' &&
      garage &&
      pq.inPitLane &&
      (pq.zone === 'entry' || pq.zone === 'speed_zone')
    ) {
      car.pitState = 'PIT_ENTRY_LANE';
      if (pq.zone === 'speed_zone') {
        const distToBox = Math.hypot(car.x - garage.pitStopPos.x, car.z - garage.pitStopPos.z);
        const longToBox = garage.sCenterM - pq.sMeters;
        if (distToBox <= 7.2 && longToBox >= -3.5 && longToBox <= 6.5) {
          beginRacePitStop(car, worldState);
          handledCars.add(carId);
          continue;
        }
      }
    } else if (
      !car.isBot &&
      (car.pitState === 'ON_TRACK' || car.pitState === 'IN_LAP') &&
      pq.inPitLane &&
      (pq.zone === 'entry' || pq.zone === 'speed_zone')
    ) {
      car.pitState = 'PIT_ENTRY_LANE';
    }

    // 6. In Qualifica (fase in_lap / chequered_flag): appena il giocatore rientra in pit lane
    //    e arriva davanti al proprio box, attiva AUTO_PARKING direttamente dentro il garage!
    if (
      isQualiReturning &&
      !car.isBot &&
      garage &&
      (car.pitState === 'IN_LAP' || car.pitState === 'PIT_ENTRY_LANE' || car.pitState === 'ON_TRACK')
    ) {
      if (pq.inPitLane && pq.zone === 'speed_zone') {
        car.pitState = 'PIT_ENTRY_LANE';
        const distToBox = Math.hypot(
          car.x - garage.pitStopPos.x,
          car.z - garage.pitStopPos.z
        );
        const longToBox = garage.sCenterM - pq.sMeters;
        if (distToBox <= 13.5 && longToBox >= -4.0 && longToBox <= 13.5) {
          beginGarageAutoParking(worldState, car);
          handledCars.add(carId);
          continue;
        }
      }
    }
  }

  // 7. Semaforo di Uscita Pit Lane (Qualifiche): coda automatica a ~2m + rilascio 1 vettura ogni 10.0s
  const gateS = pitLane.speedEndM - 2.0;
  let exitWaitS = 0;
  if (isQualiRunning) {
    const lastExit = worldState.pitLaneState.lastPitExitTime ?? -PIT_EXIT_GATE_INTERVAL_S;
    const elapsedSinceExit = (worldState.elapsedTime ?? 0) - lastExit;
    exitWaitS = Math.max(0, PIT_EXIT_GATE_INTERVAL_S - elapsedSinceExit);

    const queue = [];
    for (const car of Object.values(worldState.cars)) {
      if (car.pitState !== 'PIT_EXIT_LANE' || car.pitExitCleared) continue;
      const pq = queryPitLane(pitLane, car.x, car.z, car.teamId);
      if (pq.inPitLane && pq.sMeters <= pitLane.speedEndM + 4.0) {
        queue.push({ car, sMeters: pq.sMeters });
      }
    }
    queue.sort((a, b) => b.sMeters - a.sMeters);

    // Rilascia la vettura di testa al semaforo di uscita pit lane se sono passati >= 10.0s dall'ultima uscita
    if (queue.length > 0) {
      const lead = queue[0];
      if (lead.sMeters >= gateS - 9.5 && exitWaitS <= 1e-4) {
        const wasAutoQueued = Boolean(lead.car.pitQueueAutoActive);
        lead.car.pitExitCleared = true;
        lead.car.pitExitGateHold = false;
        lead.car.pitExitGateMaxSpeedMs = null;
        lead.car.pitQueuePosition = 0;
        lead.car.pitQueueAutoActive = false;
        lead.car.pitControlsLocked = false;
        if (!lead.car.isBot && wasAutoQueued) {
          lead.car.pitExitAutoLaunch = true;
        }
        worldState.pitLaneState.lastPitExitTime = worldState.elapsedTime ?? 0;
        worldState.pitLaneState.lastExitedCarId = lead.car.id;
        worldState.pitLaneState.pitExitReleaseSeq =
          (worldState.pitLaneState.pitExitReleaseSeq ?? 0) + 1;
        queue.shift();
        exitWaitS = PIT_EXIT_GATE_INTERVAL_S;
      }
    }

    worldState.pitLaneState.pitExitQueueIds = queue.map((entry) => entry.car.id);

    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i];
      const car = entry.car;
      car.pitQueuePosition = i + 1;
      const distToGate = gateS - entry.sMeters;

      if (i === 0) {
        // Prima vettura in coda davanti al semaforo rosso (attesa 10s)
        if (!car.isBot) {
          const shouldAutoGate =
            car.pitQueueAutoActive || (exitWaitS > 0.05 && distToGate <= PIT_QUEUE_AUTO_ENGAGE_DIST_M);
          if (shouldAutoGate && exitWaitS > 1e-4) {
            car.pitQueueAutoActive = true;
            car.pitExitGateHold = distToGate <= 2.5;
            stepPitQueueAutoPilot(car, pitLane, trackSurface, gateS, pitLane.speedLimitMs * 0.85, dt, true);
            handledCars.add(car.id);
          } else {
            car.pitQueueAutoActive = false;
            car.pitControlsLocked = false;
          }
        } else if (exitWaitS > 1e-4 && distToGate < 18.0) {
          car.pitExitGateMaxSpeedMs =
            distToGate <= 0.35 ? 0 : Math.max(0, (distToGate - 0.2) * 1.9);
          car.pitExitGateHold = distToGate <= 2.5;
        }
      } else {
        // Vettura accodata dietro a un'altra auto: stop automatico a ~2.0 m muso-alettone (7.32 m centro-centro)
        const aheadS = queue[i - 1].sMeters;
        const stopS = Math.min(gateS, aheadS - PIT_QUEUE_CENTER_SPACING_M);
        const distToStop = stopS - entry.sMeters;

        if (!car.isBot) {
          const distToAheadCenter = aheadS - entry.sMeters;
          const shouldAutoFollow =
            car.pitQueueAutoActive || distToAheadCenter <= PIT_QUEUE_AUTO_ENGAGE_DIST_M;
          if (shouldAutoFollow) {
            car.pitQueueAutoActive = true;
            car.pitExitGateHold = distToStop <= 0.8;
            stepPitQueueAutoPilot(car, pitLane, trackSurface, stopS, pitLane.speedLimitMs * 0.88, dt, true);
            handledCars.add(car.id);
          } else {
            car.pitControlsLocked = false;
          }
        } else if (distToStop < 16.0) {
          car.pitExitGateMaxSpeedMs =
            distToStop <= 0.2 ? 0 : Math.max(0, (distToStop - 0.1) * 1.75);
          car.pitExitGateHold = distToStop <= 1.2;
        }
      }
    }

    // Rilancio fluido dopo i 10s al semaforo verde (cede subito i comandi appena il pilota tocca un tasto)
    for (const [carId, car] of Object.entries(worldState.cars)) {
      if (car.isBot || !car.pitExitAutoLaunch) continue;
      if (car.pitState !== 'PIT_EXIT_LANE') {
        car.pitExitAutoLaunch = false;
        continue;
      }
      const input = inputsByCarId?.[carId] || null;
      const userTouchedControls = Boolean(
        input?.forward ||
          input?.backward ||
          input?.left ||
          input?.right ||
          Math.abs(input?.analogSteer ?? 0) > 0.05
      );
      const pq = queryPitLane(pitLane, car.x, car.z, car.teamId);
      if (userTouchedControls || !pq.inPitLane || pq.sMeters >= pitLane.exitEndM - 4.0) {
        car.pitExitAutoLaunch = false;
        car.pitControlsLocked = false;
        continue;
      }
      stepPitQueueAutoPilot(
        car,
        pitLane,
        trackSurface,
        Infinity,
        pitLane.speedLimitMs,
        dt,
        false
      );
      handledCars.add(carId);
    }
  } else {
    worldState.pitLaneState.pitExitQueueIds = [];
    for (const car of Object.values(worldState.cars)) {
      if (car.pitQueueAutoActive || car.pitExitAutoLaunch) {
        car.pitQueueAutoActive = false;
        car.pitExitAutoLaunch = false;
        if (car.pitState === 'PIT_EXIT_LANE') {
          car.pitControlsLocked = false;
        }
      }
    }
  }

  // Aggiornamento stato semaforo Ingegnere di Gara / Uscita Pit Lane per il giocatore locale
  const localCar = worldState.getCar?.(localPlayerId) || null;
  if (!localCar) {
    worldState.pitReleaseStatus = null;
  } else if (localCar.pitState === 'IN_GARAGE') {
    const canExitNow = !isQuali || q.status === 'running';
    if (canExitNow) {
      worldState.pitReleaseStatus = evaluatePitReleaseSafety(worldState, localCar);
    } else {
      worldState.pitReleaseStatus = {
        visible: true,
        isGreen: false,
        reason: 'SESSION_ENDED',
        waitSeconds: 0,
        label: 'SESSIONE TERMINATA — RESTA AI BOX',
        speedLimitKmh: pitLane.speedLimitKmh,
      };
    }
  } else if (localCar.pitState === 'EXITING_GARAGE') {
    worldState.pitReleaseStatus = {
      visible: true,
      isGreen: true,
      reason: 'CLEAR',
      waitSeconds: 0,
      label: 'USCITA DAI BOX — IMMISSIONE FAST LANE',
      speedLimitKmh: pitLane.speedLimitKmh,
    };
  } else if (localCar.pitState === 'PIT_EXIT_LANE' && isQualiRunning) {
    if (localCar.pitExitCleared) {
      worldState.pitReleaseStatus = {
        visible: true,
        isGreen: true,
        reason: 'PIT_EXIT_GREEN',
        waitSeconds: 0,
        label: 'SEMAFORO VERDE — VAI IN PISTA!',
        speedLimitKmh: pitLane.speedLimitKmh,
      };
    } else if ((localCar.pitQueuePosition ?? 0) > 1) {
      worldState.pitReleaseStatus = {
        visible: true,
        isGreen: false,
        reason: 'PIT_EXIT_QUEUE',
        waitSeconds: exitWaitS,
        label: localCar.pitQueueAutoActive
          ? `CODA AUTO (${localCar.pitQueuePosition}° IN FILA • 2m) — RILASCIO 10s`
          : `CODA PIT LANE (${localCar.pitQueuePosition}° IN FILA) — RILASCIO 10s`,
        speedLimitKmh: pitLane.speedLimitKmh,
      };
    } else if (exitWaitS > 0.05) {
      worldState.pitReleaseStatus = {
        visible: true,
        isGreen: false,
        reason: 'PIT_EXIT_LIGHT',
        waitSeconds: exitWaitS,
        label: 'SEMAFORO USCITA PIT — ATTENDI 10s',
        speedLimitKmh: pitLane.speedLimitKmh,
      };
    } else {
      worldState.pitReleaseStatus = {
        visible: true,
        isGreen: true,
        reason: 'PIT_EXIT_GREEN',
        waitSeconds: 0,
        label: 'USCITA PIT — SEMAFORO VERDE!',
        speedLimitKmh: pitLane.speedLimitKmh,
      };
    }
  } else if (localCar.pitState === 'AUTO_BOX_STOP') {
    worldState.pitReleaseStatus = {
      visible: true,
      isGreen: false,
      reason: 'AUTO_BOX_STOP',
      waitSeconds: 0,
      label: 'ALLINEAMENTO PIAZZOLA PIT STOP…',
      speedLimitKmh: pitLane.speedLimitKmh,
    };
  } else if (localCar.pitState === 'PIT_STOPPING') {
    const dur = Math.max(2.2, localCar.pitStopDuration ?? 2.45);
    const el = localCar.pitStopElapsed ?? 0;
    if (el < dur) {
      const nextComp = localCar.nextPitCompound || localCar.aeroTire?.compound || 'M';
      worldState.pitReleaseStatus = {
        visible: true,
        isGreen: false,
        reason: 'PIT_STOPPING',
        waitSeconds: Math.max(0, dur - el),
        label: `PIT STOP IN CORSO — CAMBIO GOMME [${nextComp}]`,
        speedLimitKmh: pitLane.speedLimitKmh,
      };
    } else {
      worldState.pitReleaseStatus = evaluatePitReleaseSafety(worldState, localCar);
    }
  } else if (localCar.pitState === 'AUTO_PARKING') {
    worldState.pitReleaseStatus = {
      visible: true,
      isGreen: false,
      reason: 'AUTO_PARKING',
      waitSeconds: 0,
      label: 'PARCHEGGIO AUTOMATICO NEL BOX…',
      speedLimitKmh: pitLane.speedLimitKmh,
    };
  } else if (localCar.pitState === 'PARKED_STAGE_END') {
    worldState.pitReleaseStatus = {
      visible: false,
      isGreen: true,
      reason: 'CLEAR',
      waitSeconds: 0,
      label: '',
      speedLimitKmh: pitLane.speedLimitKmh,
    };
  } else {
    worldState.pitReleaseStatus = null;
  }

  return handledCars;
}
