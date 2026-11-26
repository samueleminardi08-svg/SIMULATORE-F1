/**
 * Modulo di fisica di guida avanzata (Step 5):
 * accelerazione, frenata, cambio automatico, sterzo progressivo,
 * aerodinamica, usura gomme, bloccaggio ruote, frenate brusche, sospensioni e pioggia.
 * Completamente disaccoppiato da Three.js per mantenere lo stato serializzabile.
 */

import {
  ADVANCED_PHYSICS_CONFIG,
  CAR_PHYSICS_CONFIG,
  SURFACE_PHYSICS,
  WEATHER_CONFIG,
} from '../config/constants.js';
import { getDifficultyConfig } from '../config/difficulty.js';
import { queryTrackSurface } from '../tracks/TrackSurface.js';
import { createInitialAeroTireState, updateAeroAndTires } from './AeroAndTires.js';
import { createInitialSuspensionState, updateSuspension } from './Suspension.js';
import { stepVirtualInput } from '../input/VirtualInputFilter.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapAngleRad(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function lerpAngleRad(from, to, t) {
  return from + wrapAngleRad(to - from) * clamp(t, 0, 1);
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

/**
 * Gestisce l'allineamento automatico di precisione nel rettangolo dipinto del proprio box
 * (blocco comandi pilota appena si arriva vicino alla freccia verde del box -> parcheggio esatto
 * nel rettangolo -> breve sosta -> rilascio pulito premendo W).
 * Restituisce true se questo tick è gestito interamente dall'auto-box (saltando la fisica libera).
 */
function handleAutoPitBoxControl(car, input, dt, trackSurface, pitQuery) {
  const pitLane = trackSurface?.pitLane || null;
  if (!pitLane || car.isBot) {
    car.pitControlsLocked = false;
    return false;
  }

  if (car.pitBoxLeaveCooldown > 0) {
    car.pitBoxLeaveCooldown = Math.max(0, car.pitBoxLeaveCooldown - dt);
  }

  const cfg = CAR_PHYSICS_CONFIG;
  const ownGarage = pitLane.garageByTeamId?.[car.teamId] || null;

  // 1. Fase di auto-posizionamento attivo verso il centro esatto del rettangolo dipinto
  if (car.pitState === 'AUTO_BOX_STOP' && car.pitAutoAlign) {
    const a = car.pitAutoAlign;
    car.pitControlsLocked = true;
    car.pitLimiterActive = true;
    car.pitLimitKmh = pitLane.speedLimitKmh;
    car.throttleInput = 0;
    car.brakeInput = 0.35;
    car.steerInput = 0;
    car.surface = 'pitlane';
    if (car.aeroTire) {
      car.aeroTire.wheelLockup = false;
      car.aeroTire.highSpeedBraking = false;
    }

    const prevX = car.x;
    const prevZ = car.z;
    const prevHeading = car.heading;

    a.elapsed = Math.min(a.duration, a.elapsed + dt);
    const u = a.duration > 1e-4 ? clamp(a.elapsed / a.duration, 0, 1) : 1;
    // Curva di decelerazione fluida stile frenata F1 sulle proprie marche pit-stop
    const s = 1 - Math.pow(1 - u, 2.35);

    const nextX = evalCubicBezier(a.p0x, a.p1x, a.p2x, a.p3x, s);
    const nextZ = evalCubicBezier(a.p0z, a.p1z, a.p2z, a.p3z, s);
    const dBx = evalCubicBezierDeriv(a.p0x, a.p1x, a.p2x, a.p3x, s);
    const dBz = evalCubicBezierDeriv(a.p0z, a.p1z, a.p2z, a.p3z, s);
    const tangentHeading =
      Math.hypot(dBx, dBz) > 1e-3 ? Math.atan2(dBx, dBz) : a.targetHeading;

    const blendToFinal = u * u * (3 - 2 * u);
    const nextHeading = lerpAngleRad(
      lerpAngleRad(a.startHeading, tangentHeading, Math.min(1, u * 1.4)),
      a.targetHeading,
      blendToFinal
    );

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

    updateAutomaticGearbox(car, spd, false, false, dt, cfg);
    updateSuspension(car, -0.35 * (1 - u), (car.yawRate * spd) / 9.81, dt);

    const wheelDelta = (spd / cfg.wheelRadius) * dt;
    car.wheelRotation += wheelDelta;
    car.frontWheelRotation += wheelDelta;

    if (a.elapsed >= a.duration - 1e-5) {
      // Snap di precisione millimetrica al centro e orientamento esatto del rettangolo dipinto
      car.x = a.p3x;
      car.z = a.p3z;
      car.y = a.targetY;
      car.heading = a.targetHeading;
      car.vx = 0;
      car.vz = 0;
      car.forwardSpeed = 0;
      car.lateralSpeed = 0;
      car.speed = 0;
      car.yawRate = 0;
      car.steerAngle = 0;
      car.gear = 0;
      car.gearLabel = 'N';
      car.brakeInput = 0;
      car.pitState = 'IN_PIT_BOX';
      car.pitBoxHoldTimer = 2.0;
      car.pitAutoAlign = null;
    }

    const postQ = queryTrackSurface(trackSurface, car.x, car.z, car.trackSampleIndex);
    car.trackSampleIndex = postQ.sampleIndex;
    return true;
  }

  // 2. Fase di sosta precisa dentro il rettangolo del box
  if (car.pitState === 'IN_PIT_BOX') {
    car.pitLimiterActive = true;
    car.pitLimitKmh = pitLane.speedLimitKmh;
    car.surface = 'pitlane';
    car.pitBoxHoldTimer = Math.max(0, (car.pitBoxHoldTimer ?? 0) - dt);

    if (ownGarage) {
      car.x = ownGarage.pitStopPos.x;
      car.z = ownGarage.pitStopPos.z;
      car.y = ownGarage.pitStopPos.y ?? 0;
      car.heading = ownGarage.pitStopPos.heading;
    }

    // Rilascio pulito al termine della sosta quando il pilota preme W
    if (car.pitBoxHoldTimer <= 0 && Boolean(input?.forward)) {
      car.pitState = 'PIT_EXIT_LANE';
      car.pitControlsLocked = false;
      car.pitBoxLeaveCooldown = 5.5;
      return false;
    }

    car.pitControlsLocked = true;
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
    car.gear = 0;
    car.gearLabel = 'N';
    car.rpm += (cfg.idleRpm - car.rpm) * Math.min(1, 10 * dt);
    if (car.aeroTire) {
      car.aeroTire.wheelLockup = false;
      car.aeroTire.highSpeedBraking = false;
    }
    updateSuspension(car, 0, 0, dt);
    return true;
  }

  // 3. Rilevamento ingresso nell'area antistante il proprio box (dove c'è la freccia verde)
  if (
    ownGarage &&
    pitQuery &&
    pitQuery.inPitLane &&
    pitQuery.zone === 'speed_zone' &&
    car.pitBoxLeaveCooldown <= 0 &&
    car.pitState !== 'IN_GARAGE' &&
    car.pitState !== 'EXITING_GARAGE' &&
    car.pitState !== 'AUTO_PARKING' &&
    car.pitState !== 'PARKED_STAGE_END'
  ) {
    const target = ownGarage.pitStopPos;
    const distToBox = Math.hypot(car.x - target.x, car.z - target.z);
    const longToBox = ownGarage.sCenterM - pitQuery.sMeters;

    if (distToBox <= 13.0 && longToBox >= -3.5 && longToBox <= 13.0) {
      const chord = Math.max(0.1, distToBox);
      const handleLen = clamp(chord * 0.42, 1.0, 5.2);
      const curFwdX = Math.sin(car.heading);
      const curFwdZ = Math.cos(car.heading);
      const tgtFwdX = Math.sin(target.heading);
      const tgtFwdZ = Math.cos(target.heading);

      // Se la vettura è leggermente oltre il centro box, punta dolcemente verso il centro
      const toTargetX = target.x - car.x;
      const toTargetZ = target.z - car.z;
      const forwardDot = toTargetX * curFwdX + toTargetZ * curFwdZ;
      const p1DirX = forwardDot >= 0 ? curFwdX : toTargetX / chord;
      const p1DirZ = forwardDot >= 0 ? curFwdZ : toTargetZ / chord;

      const entrySpeed = Math.max(4.2, Math.hypot(car.vx, car.vz));
      const duration = clamp(chord / Math.max(4.2, entrySpeed * 0.62), 0.75, 2.0);

      car.pitState = 'AUTO_BOX_STOP';
      car.pitControlsLocked = true;
      car.pitAutoAlign = {
        p0x: car.x,
        p0z: car.z,
        p1x: car.x + p1DirX * handleLen,
        p1z: car.z + p1DirZ * handleLen,
        p2x: target.x - tgtFwdX * handleLen,
        p2z: target.z - tgtFwdZ * handleLen,
        p3x: target.x,
        p3z: target.z,
        startHeading: car.heading,
        targetHeading: target.heading,
        targetY: target.y ?? 0,
        elapsed: 0,
        duration,
      };
      return handleAutoPitBoxControl(car, input, dt, trackSurface, pitQuery);
    }
  }

  // Ritorno allo stato ON_TRACK una volta usciti completamente dalla pit lane
  if (car.pitState === 'PIT_EXIT_LANE' && (!pitQuery || !pitQuery.inPitLane)) {
    car.pitState = 'ON_TRACK';
  }
  car.pitControlsLocked = false;
  return false;
}

/**
 * Crea lo stato iniziale serializzabile di una monoposto.
 * @param {string} id - Identificativo univoco della vettura
 * @param {{ x: number, y?: number, z: number, heading: number }} startTransform
 */
export function createInitialCarState(
  id,
  startTransform = { x: 0, y: 0, z: 0, heading: 0 },
  meta = {}
) {
  return {
    id,
    driverId: meta.driverId ?? id,
    driverName: meta.driverName ?? 'Pilota',
    code: meta.code ?? 'PIL',
    driverNumber: meta.driverNumber ?? 1,
    teamId: meta.teamId ?? 'ferrari',
    teamName: meta.teamName ?? 'Scuderia Ferrari',
    color: meta.color ?? '#dc0000',
    secondaryColor: meta.secondaryColor ?? '#111318',
    wingColor: meta.wingColor ?? '#f8fafc',
    helmetColor: meta.helmetColor ?? '#facc15',
    paintRoughness: meta.paintRoughness ?? 0.25,
    paintMetalness: meta.paintMetalness ?? 0.35,
    isBot: Boolean(meta.isBot),
    skillFactor: meta.skillFactor ?? 1.0,
    driverProfile: meta.driverProfile ? { ...meta.driverProfile } : null,
    maxSpeedMultiplier: meta.maxSpeedMultiplier ?? 1.0,
    accelMultiplier: meta.accelMultiplier ?? 1.0,
    gridPosition: meta.gridPosition ?? 1,
    racePosition: meta.gridPosition ?? 1,
    gapToLeader: 'LEADER',
    raceFinished: false,
    rawFinishTime: null,
    penaltySeconds: 0,
    finishTime: null,
    targetLaneOffset: 0,
    preferredLaneOffset: null,
    laneHoldTimer: 0,
    prevSteerInput: 0,
    pitStopRequested: false,
    nextPitCompound: meta.nextPitCompound ?? meta.compound ?? 'M',
    pitStopCount: 0,
    pitStopDuration: 2.4,
    pitStopElapsed: 0,
    pitStopSwapped: false,
    botPitStopTimer: 0,
    botStuckTimer: 0,
    botRecoveryTimer: 0,
    botRecoverySteer: 0,
    botMistakeOffset: 0,
    botMistakeSpeedBias: 0,
    botMistakeTimer: 0,
    botMistakeCheckBucket: -1,
    x: startTransform.x ?? 0,
    y: startTransform.y ?? 0,
    z: startTransform.z ?? 0,
    heading: startTransform.heading ?? 0, // rad, 0 = direzione +Z
    vx: 0,                                // velocità globale asse X (m/s)
    vz: 0,                                // velocità globale asse Z (m/s)
    forwardSpeed: 0,                      // componente longitudinale locale (m/s)
    lateralSpeed: 0,                      // componente laterale locale / scivolamento (m/s)
    speed: 0,                             // alias forwardSpeed (m/s) per compatibilità
    yawRate: 0,                           // velocità angolare di imbardata (rad/s)
    steerAngle: 0,                        // angolo ruote anteriori (rad, + sinistra, - destra)
    wheelRotation: 0,                     // rotazione cumulativa ruote posteriori (rad)
    frontWheelRotation: 0,                // rotazione cumulativa ruote anteriori (si ferma in bloccaggio)
    gear: 0,                              // -1 = R, 0 = N, 1..8 = marce avanti
    gearLabel: 'N',                       // etichetta visibile ('R', 'N', '1'..'8')
    rpm: CAR_PHYSICS_CONFIG.idleRpm,      // giri motore
    shiftTimer: 0,                        // timer cooldown tra cambiate
    throttleInput: 0,
    brakeInput: 0,
    steerInput: 0,
    surface: 'asphalt',                   // 'asphalt' | 'pitlane' | 'kerb' | 'grass'
    pitState: 'ON_TRACK',                 // stato pit lane / auto-posizionamento box
    pitLimiterActive: false,              // limitatore automatico 60/80 km/h attivo in pit lane
    pitLimitKmh: 80,                      // limite pit lane FIA 2026 del circuito corrente
    pitControlsLocked: false,             // blocco comandi pilota durante auto-posizionamento/sosta box
    pitBoxHoldTimer: 0,                   // durata residua sosta nel rettangolo box (s)
    pitBoxLeaveCooldown: 0,               // cooldown anti-ricattura all'uscita dal rettangolo box (s)
    pitAutoAlign: null,                   // curva Bézier serializzabile per auto-allineamento al box
    pitExitCleared: true,                 // autorizzazione semaforo verde uscita pit lane (Qualifiche)
    pitExitGateHold: false,               // fermo al semaforo rosso di uscita pit lane
    pitExitGateMaxSpeedMs: null,          // tetto velocità progressivo per accodamento/semaforo uscita pit
    pitQueuePosition: 0,                  // posizione in coda fast lane verso l'uscita pit (1 = testa)
    pitQueueAutoActive: false,            // pilota automatico attivo in coda fast lane (~2m gap + attesa 10s)
    pitExitAutoLaunch: false,             // avvio fluido automatico allo scattare del verde al termine dei 10s
    trackSampleIndex: null,               // indice campione spline per ricerca veloce
    collidingWithBarrier: false,          // flag contatto barriera nell'ultimo tick
    collisionImpact: 0,                   // intensità ultimo urto (m/s)
    aeroTire: createInitialAeroTireState(meta.compound ?? 'M', Boolean(meta.isRain)),
    suspension: createInitialSuspensionState(),
  };
}

/**
 * Calcola la marcia automatica e i giri motore (RPM) in base a velocità e input.
 */
function updateAutomaticGearbox(car, forwardSpeed, throttleActive, reverseActive, dt, cfg) {
  car.shiftTimer = Math.max(0, car.shiftTimer - dt);

  // Gestione Retromarcia (R)
  if (forwardSpeed < -0.3 || (reverseActive && !throttleActive && Math.abs(forwardSpeed) <= 0.35)) {
    car.gear = -1;
    car.gearLabel = 'R';
    const revRatio = clamp(Math.abs(forwardSpeed) / cfg.maxReverseSpeed, 0, 1);
    const targetRpm = cfg.idleRpm + revRatio * (cfg.maxRpm * 0.72 - cfg.idleRpm);
    car.rpm += (targetRpm - car.rpm) * Math.min(1, 14 * dt);
    return;
  }

  // Gestione Folle (N) da fermi senza gas
  if (Math.abs(forwardSpeed) < 0.25 && !throttleActive) {
    car.gear = 0;
    car.gearLabel = 'N';
    car.rpm += (cfg.idleRpm - car.rpm) * Math.min(1, 10 * dt);
    return;
  }

  // Marcia avanti: assicura almeno la 1ª marcia
  if (car.gear < 1) {
    car.gear = 1;
    car.shiftTimer = cfg.shiftCooldown * 0.5;
  }

  const rpmRange = cfg.maxRpm - cfg.idleRpm;
  const currentGearTop = cfg.gearTopSpeeds[car.gear];
  const currentRatio = clamp(forwardSpeed / currentGearTop, 0, 1);
  let targetRpm = cfg.idleRpm + currentRatio * rpmRange;

  // Salita di marcia automatica (Upshift)
  if (
    car.gear < 8 &&
    car.shiftTimer <= 0 &&
    throttleActive &&
    targetRpm >= cfg.upshiftRpm
  ) {
    car.gear += 1;
    car.shiftTimer = cfg.shiftCooldown;
  } else if (
    // Scalata di marcia automatica (Downshift)
    car.gear > 1 &&
    car.shiftTimer <= 0 &&
    forwardSpeed < cfg.gearTopSpeeds[car.gear - 1] * 0.78
  ) {
    car.gear -= 1;
    car.shiftTimer = cfg.shiftCooldown * 0.55;
  }

  // Ricalcolo RPM nella marcia effettiva
  const activeTop = cfg.gearTopSpeeds[car.gear];
  const activeRatio = clamp(forwardSpeed / activeTop, 0, 1);
  targetRpm = cfg.idleRpm + activeRatio * rpmRange;
  car.rpm += (targetRpm - car.rpm) * Math.min(1, 18 * dt);
  car.gearLabel = String(car.gear);
}

/**
 * Aggiorna la fisica di una vettura di un singolo timestep fisso dt (Step 5).
 * @param {object} car - Stato mutabile della vettura in WorldState
 * @param {{ forward: boolean, backward: boolean, left: boolean, right: boolean }} input
 * @param {number} dt - Passo di integrazione in secondi
 * @param {object | null} [trackSurface=null] - Superficie tracciato pre-campionata
 * @param {string} [weatherId='dry'] - Condizione meteo ('dry' | 'rain')
 */
export function stepCarPhysics(
  car,
  input,
  dt,
  trackSurface = null,
  weatherId = 'dry',
  difficultyId = 'realistic'
) {
  const cfg = CAR_PHYSICS_CONFIG;
  const adv = ADVANCED_PHYSICS_CONFIG;
  const weatherProps = WEATHER_CONFIG[weatherId] || WEATHER_CONFIG.dry;
  const difficultyProps = getDifficultyConfig(difficultyId);

  const forward = Boolean(input?.forward);
  const backward = Boolean(input?.backward);

  // 0. Rilevamento superficie sotto la vettura (asfalto, pitlane, cordolo, erba)
  let surfaceQuery = null;
  if (trackSurface) {
    surfaceQuery = queryTrackSurface(trackSurface, car.x, car.z, car.trackSampleIndex);
    car.surface = surfaceQuery.surface;
    car.trackSampleIndex = surfaceQuery.sampleIndex;
  } else {
    car.surface = 'asphalt';
  }

  // 0b. Blocco comandi e auto-allineamento di precisione nel rettangolo dipinto del proprio box
  if (handleAutoPitBoxControl(car, input, dt, trackSurface, surfaceQuery?.pitQuery || null)) {
    return;
  }

  // 0c. Pit Speed Limiter FIA 2026 automatico (Monaco = 60 km/h, tutti gli altri 23 circuiti = 80 km/h)
  const pitLane = trackSurface?.pitLane || null;
  const pitQuery = surfaceQuery?.pitQuery || null;
  const pitLimiterActive = Boolean(
    pitLane &&
      pitQuery &&
      pitQuery.inPitLane &&
      pitQuery.sMeters <= pitLane.speedEndM
  );
  car.pitLimiterActive = pitLimiterActive;
  car.pitLimitKmh = pitLane ? pitLane.speedLimitKmh : 80;
  const pitLimitMs = pitLimiterActive ? pitLane.speedLimitMs : Infinity;

  // Filtro Input Virtuale Graduale 0..1 per tastiera WASD (Step 6b; bot/analogici invariati)
  stepVirtualInput(car, input, dt, difficultyProps);
  const throttleAmount = car.throttleInput;
  const brakeAmount = car.brakeInput;

  const surfaceProps = SURFACE_PHYSICS[car.surface] || SURFACE_PHYSICS.asphalt;
  const offTrackEnabled = difficultyProps?.offTrackPenaltiesEnabled !== false;
  const rainPhysEnabled = difficultyProps?.rainPhysicsEnabled !== false;
  const aeroEnabled = difficultyProps?.aerodynamicsEnabled !== false;

  const effectiveSurfaceGrip =
    car.surface === 'grass'
      ? Math.max(surfaceProps.gripMultiplier, difficultyProps.minGrassGrip)
      : car.surface === 'kerb' && !offTrackEnabled
        ? 1.0
        : surfaceProps.gripMultiplier;
  const effectiveExtraRollingDrag =
    car.surface === 'grass'
      ? surfaceProps.extraRollingDrag * difficultyProps.grassDragMultiplier
      : car.surface === 'kerb' && !offTrackEnabled
        ? 0.0
        : surfaceProps.extraRollingDrag;

  // 1. Decomposizione della velocità globale negli assi locali (avanti / laterale)
  const fwdOldX = Math.sin(car.heading);
  const fwdOldZ = Math.cos(car.heading);
  const leftOldX = Math.cos(car.heading);
  const leftOldZ = -Math.sin(car.heading);

  let forwardSpeed = car.vx * fwdOldX + car.vz * fwdOldZ;
  let lateralSpeed = car.vx * leftOldX + car.vz * leftOldZ;
  const prevForwardSpeed = forwardSpeed;

  // 2. Aerodinamica, mescole reali, graining/blistering, bloccaggio e frenata brusca
  updateAeroAndTires(car, input, dt, surfaceProps, weatherProps, difficultyProps);

  const rawWeatherGrip =
    car.surface === 'kerb' ? weatherProps.kerbGripMultiplier : weatherProps.gripMultiplier;
  const weatherGrip = rainPhysEnabled
    ? 1.0 - (1.0 - rawWeatherGrip) * difficultyProps.rainGripPenaltyMultiplier
    : 1.0;
  const tireFactor = car.aeroTire.tireGripFactor;
  const aeroBonus = car.aeroTire.aeroGripBonus;

  // 3. Aggiornamento cambio automatico e giri motore (RPM)
  updateAutomaticGearbox(
    car,
    forwardSpeed,
    throttleAmount > 0.05,
    brakeAmount > 0.05,
    dt,
    cfg
  );

  // 4. Sterzo progressivo (A/← = sinistra +, D/→ = destra -)
  // Per tastiera umana VirtualInputFilter gestisce già la rampa progressiva: evitiamo doppio ritardo
  const isHumanKeyboard = !car.isBot && typeof input?.analogSteer !== 'number';
  const targetSteerAngle = car.steerInput * cfg.maxSteerAngle;
  const baseSteerRate = car.steerInput === 0 ? cfg.steerReturnSpeed : cfg.steerSpeed;
  const steerRate = isHumanKeyboard ? baseSteerRate * 2.1 : baseSteerRate;
  car.steerAngle += (targetSteerAngle - car.steerAngle) * Math.min(1, steerRate * dt);

  // 5. Forze longitudinali (trazione motore, frenata con effetto pioggia/bloccaggio, drag aero)
  const absFwd = Math.abs(forwardSpeed);
  const effectiveDragCoeff =
    (aeroEnabled ? cfg.aeroDragCoeff : cfg.aeroDragCoeff * 0.65) +
    (rainPhysEnabled ? weatherProps.extraDrag * difficultyProps.rainGripPenaltyMultiplier : 0);
  const aeroDrag =
    -Math.sign(forwardSpeed) * effectiveDragCoeff * forwardSpeed * forwardSpeed;
  const totalRollingRes = cfg.rollingResistance + effectiveExtraRollingDrag;
  const rollingDrag =
    absFwd > 0.05 ? -Math.sign(forwardSpeed) * totalRollingRes : 0;

  let driveAccel = 0;

  if (throttleAmount > 0.01 && brakeAmount <= 0.01) {
    if (forwardSpeed < -0.2) {
      driveAccel =
        cfg.maxBrakeDecel *
        Math.pow(throttleAmount, 0.85) *
        surfaceProps.brakeMultiplier *
        weatherGrip *
        tireFactor;
    } else if (car.gear >= 1) {
      const gearMult = cfg.gearAccelMultipliers[car.gear];
      const gearTop = cfg.gearTopSpeeds[car.gear];
      const speedRatio = clamp(forwardSpeed / gearTop, 0, 1);
      const torqueCurve = speedRatio < 0.92 ? 0.85 + 0.25 * Math.sin(speedRatio * Math.PI) : Math.max(0, (1 - speedRatio) * 10);
      driveAccel =
        cfg.baseEngineAccel *
        throttleAmount *
        gearMult *
        torqueCurve *
        surfaceProps.tractionMultiplier *
        weatherGrip *
        tireFactor *
        (car.accelMultiplier ?? 1.0);
    }
  } else if (brakeAmount > 0.01 && throttleAmount <= 0.01) {
    if (forwardSpeed > 0.25) {
      const lockPenalty = car.aeroTire.wheelLockup ? adv.lockupBrakePenalty : 1.0;
      const aeroBrakeBoost = 0.88 + 0.14 * (aeroBonus - 1.0);
      const progressiveBrake = Math.pow(brakeAmount, 0.85);
      driveAccel =
        -cfg.maxBrakeDecel *
        progressiveBrake *
        surfaceProps.brakeMultiplier *
        weatherGrip *
        tireFactor *
        aeroBrakeBoost *
        lockPenalty;
    } else if (forwardSpeed > -cfg.maxReverseSpeed && backward) {
      driveAccel = -cfg.reverseAccel * brakeAmount * surfaceProps.tractionMultiplier * weatherGrip;
    }
  }

  forwardSpeed += (driveAccel + aeroDrag + rollingDrag) * dt;

  // Applicazione elettronica Pit Speed Limiter FIA 2026 (frenata dolce se si entra forte + tetto rigido 60/80 km/h)
  if (pitLimiterActive) {
    if (forwardSpeed > pitLimitMs + 0.05) {
      const autoLimiterBrake = 52.0 * dt;
      forwardSpeed = Math.max(pitLimitMs, forwardSpeed - autoLimiterBrake);
      if (car.aeroTire) {
        car.aeroTire.wheelLockup = false;
        car.aeroTire.highSpeedBraking = false;
      }
    } else if (forwardSpeed > pitLimitMs) {
      forwardSpeed = pitLimitMs;
    }
  }

  // Blocco progressivo coda / semaforo rosso di uscita Pit Lane (Qualifiche: rilascio 1 ogni 3s)
  if (
    typeof car.pitExitGateMaxSpeedMs === 'number' &&
    Number.isFinite(car.pitExitGateMaxSpeedMs)
  ) {
    const gateBrake = 32.0 * dt;
    if (car.pitExitGateMaxSpeedMs <= 0.05 && forwardSpeed >= 0) {
      forwardSpeed = Math.max(0, forwardSpeed - gateBrake);
      if (forwardSpeed < 0.25) forwardSpeed = 0;
    } else if (forwardSpeed > car.pitExitGateMaxSpeedMs) {
      forwardSpeed = Math.max(car.pitExitGateMaxSpeedMs, forwardSpeed - gateBrake);
    }
    if (car.aeroTire) {
      car.aeroTire.wheelLockup = false;
      car.aeroTire.highSpeedBraking = false;
    }
  }

  if (throttleAmount <= 0.01 && brakeAmount <= 0.01 && Math.abs(forwardSpeed) < 0.08) {
    forwardSpeed = 0;
  }

  const maxTopSpeed = cfg.gearTopSpeeds[8] * (car.maxSpeedMultiplier ?? 1.0);
  const effectiveMaxSpeed = pitLimiterActive
    ? Math.min(maxTopSpeed, Math.max(pitLimitMs, forwardSpeed))
    : maxTopSpeed;
  forwardSpeed = clamp(forwardSpeed, -cfg.maxReverseSpeed, effectiveMaxSpeed);
  const longitudinalAccel = (forwardSpeed - prevForwardSpeed) / dt;

  // 6. Dinamica di sterzata + sottosterzo da bloccaggio + instabilità frenate brusche & erba
  const speedForSteer = Math.abs(forwardSpeed);
  const combinedLateralGrip = effectiveSurfaceGrip * weatherGrip * tireFactor * aeroBonus;
  const effectiveMaxLateralAccel = cfg.maxLateralAccel * combinedLateralGrip;
  const effectiveLateralGripCoeff = cfg.lateralGripCoeff * combinedLateralGrip;

  if (speedForSteer > 0.1) {
    const highSpeedAttenuation =
      1 / (1 + Math.pow(speedForSteer / cfg.highSpeedSteerScale, cfg.highSpeedSteerExponent));
    const lockSteerFactor = car.aeroTire.wheelLockup ? adv.lockupUndersteerFactor : 1.0;
    const effectiveSteer = car.steerAngle * highSpeedAttenuation * lockSteerFactor;
    const rawYawRate = (forwardSpeed / cfg.wheelbase) * Math.tan(effectiveSteer);

    if (speedForSteer > 4.0) {
      const maxYawByGrip = (effectiveMaxLateralAccel * 1.15) / speedForSteer;
      car.yawRate = clamp(rawYawRate, -maxYawByGrip, maxYawByGrip);
    } else {
      car.yawRate = rawYawRate;
    }

    // Instabilità in frenata brusca ad alta velocità (attenuata in Principiante/Intermedio)
    const brakeInstabMult = difficultyProps.highSpeedBrakeInstabilityMultiplier;
    if (
      brakeInstabMult > 0 &&
      car.aeroTire.highSpeedBraking &&
      (Math.abs(car.steerAngle) > 0.05 || Math.abs(lateralSpeed) > 0.8)
    ) {
      const instabDir = car.steerInput !== 0 ? car.steerInput : -Math.sign(lateralSpeed);
      const speedScale = clamp((speedForSteer - adv.highSpeedBrakeThresholdMs) / 35, 0.25, 1.0);
      const steerLoad = 0.5 + Math.abs(car.steerAngle / cfg.maxSteerAngle);
      car.yawRate += instabDir * adv.highSpeedBrakeYawTorque * brakeInstabMult * speedScale * steerLoad;
    }

    // Controllo Trazione OFF (sovrasterzo di potenza reale in uscita curva con gas alto)
    const tcOff = Boolean(difficultyProps?.tractionControlOff) && !car.isBot;
    if (
      tcOff &&
      throttleAmount > 0.72 &&
      forwardSpeed > 6.0 &&
      forwardSpeed < 52.0 &&
      Math.abs(car.steerAngle) > 0.08
    ) {
      const steerLoad = clamp(Math.abs(car.steerAngle) / cfg.maxSteerAngle, 0, 1);
      const lowGripBoost = clamp(1.35 - weatherGrip * clamp(tireFactor, 0.55, 1.05), 0.25, 1.45);
      const powerOversteer =
        Math.sign(car.steerAngle) *
        (throttleAmount - 0.68) *
        steerLoad *
        lowGripBoost *
        0.58;
      car.yawRate += powerOversteer;
    }

    // Instabilità direzionale sull'erba scivolosa (scalata dalla difficoltà / toggle Fuori Pista)
    const effectiveSurfInstab =
      !offTrackEnabled && car.surface === 'kerb' ? 0 : surfaceProps.yawInstability;
    if (effectiveSurfInstab > 0 && speedForSteer > 5.0) {
      const slipDir = car.steerInput !== 0 ? car.steerInput : -Math.sign(lateralSpeed);
      const pedalLoad = forward || backward ? 1.0 : 0.45;
      const rainSlipBoost = rainPhysEnabled && weatherProps.id === 'rain' ? 1.35 : 1.0;
      const instabilityYaw =
        slipDir *
        effectiveSurfInstab *
        difficultyProps.grassInstabilityMultiplier *
        rainSlipBoost *
        pedalLoad *
        clamp(speedForSteer / 35, 0.2, 1.3);
      car.yawRate += instabilityYaw;
    }

    car.heading += car.yawRate * dt;
  } else {
    car.yawRate = 0;
  }

  // 7. Proiezione inerziale + aderenza laterale gomme
  const vxPreRot = fwdOldX * forwardSpeed + leftOldX * lateralSpeed;
  const vzPreRot = fwdOldZ * forwardSpeed + leftOldZ * lateralSpeed;

  const fwdNewX = Math.sin(car.heading);
  const fwdNewZ = Math.cos(car.heading);
  const leftNewX = Math.cos(car.heading);
  const leftNewZ = -Math.sin(car.heading);

  let newForwardSpeed = vxPreRot * fwdNewX + vzPreRot * fwdNewZ;
  let newLateralSpeed = vxPreRot * leftNewX + vzPreRot * leftNewZ;

  const lateralRestoreAccel = clamp(
    -newLateralSpeed * effectiveLateralGripCoeff,
    -effectiveMaxLateralAccel,
    effectiveMaxLateralAccel
  );
  newLateralSpeed += lateralRestoreAccel * dt;

  if (Math.abs(newLateralSpeed) < 0.005 && car.steerInput === 0) {
    newLateralSpeed = 0;
  }

  // 8. Aggiornamento sospensioni dinamiche
  const lateralAccel = car.yawRate * newForwardSpeed;
  updateSuspension(car, longitudinalAccel / 9.81, lateralAccel / 9.81, dt);

  // 9. Ricostruzione velocità globale e integrazione posizione
  if (pitLimiterActive && newForwardSpeed > pitLimitMs && prevForwardSpeed <= pitLimitMs + 0.15) {
    newForwardSpeed = pitLimitMs;
  }
  car.vx = fwdNewX * newForwardSpeed + leftNewX * newLateralSpeed;
  car.vz = fwdNewZ * newForwardSpeed + leftNewZ * newLateralSpeed;
  if (pitLimiterActive) {
    const totalSpd = Math.hypot(car.vx, car.vz);
    const hardCap = Math.max(pitLimitMs, Math.min(totalSpd, forwardSpeed));
    if (totalSpd > hardCap + 0.01) {
      const k = hardCap / totalSpd;
      car.vx *= k;
      car.vz *= k;
      newForwardSpeed *= k;
      newLateralSpeed *= k;
    }
  }
  car.forwardSpeed = newForwardSpeed;
  car.lateralSpeed = newLateralSpeed;
  car.speed = newForwardSpeed;

  car.x += car.vx * dt;
  car.z += car.vz * dt;
  if (trackSurface) {
    const postQuery = queryTrackSurface(trackSurface, car.x, car.z, car.trackSampleIndex);
    car.surface = postQuery.surface;
    car.y = postQuery.elevation ?? 0;
    car.trackSampleIndex = postQuery.sampleIndex;
  } else {
    car.y = 0;
  }

  // 10. Rotazione visiva ruote (le anteriori si bloccano durante wheelLockup)
  const wheelDelta = (newForwardSpeed / cfg.wheelRadius) * dt;
  car.wheelRotation += wheelDelta;
  if (!car.aeroTire.wheelLockup) {
    car.frontWheelRotation += wheelDelta;
  }
}
