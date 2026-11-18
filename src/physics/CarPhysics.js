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
import { getCarSpecsForLevel } from '../cars/CarSpecs.js';
import { queryTrackSurface } from '../tracks/TrackSurface.js';
import { createInitialAeroTireState, updateAeroAndTires } from './AeroAndTires.js';
import { createInitialSuspensionState, updateSuspension } from './Suspension.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
    carLevel: meta.carLevel ?? 'base',
    carSpecs: meta.carSpecs ?? getCarSpecsForLevel(meta.carLevel ?? 'base'),
    skillFactor: meta.skillFactor ?? 1.0,
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
    surface: 'asphalt',                   // 'asphalt' | 'kerb' | 'grass'
    trackSampleIndex: null,               // indice campione spline per ricerca veloce
    collidingWithBarrier: false,          // flag contatto barriera nell'ultimo tick
    collisionImpact: 0,                   // intensità ultimo urto (m/s)
    aeroTire: createInitialAeroTireState(),
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
  const carSpecs = car.carSpecs || getCarSpecsForLevel(car.carLevel || 'base');

  const forward = Boolean(input?.forward);
  const backward = Boolean(input?.backward);
  const left = Boolean(input?.left);
  const right = Boolean(input?.right);

  car.throttleInput = forward ? 1 : 0;
  car.brakeInput = backward ? 1 : 0;
  car.steerInput =
    typeof input?.analogSteer === 'number'
      ? clamp(input.analogSteer, -1, 1)
      : (left ? 1 : 0) - (right ? 1 : 0);

  // 0. Rilevamento superficie sotto la vettura (asfalto, cordolo, erba)
  if (trackSurface) {
    const query = queryTrackSurface(trackSurface, car.x, car.z, car.trackSampleIndex);
    car.surface = query.surface;
    car.trackSampleIndex = query.sampleIndex;
  } else {
    car.surface = 'asphalt';
  }
  const surfaceProps = SURFACE_PHYSICS[car.surface] || SURFACE_PHYSICS.asphalt;
  const effectiveSurfaceGrip =
    car.surface === 'grass'
      ? Math.max(surfaceProps.gripMultiplier, difficultyProps.minGrassGrip)
      : surfaceProps.gripMultiplier;
  const effectiveExtraRollingDrag =
    car.surface === 'grass'
      ? surfaceProps.extraRollingDrag * difficultyProps.grassDragMultiplier
      : surfaceProps.extraRollingDrag;

  // 1. Decomposizione della velocità globale negli assi locali (avanti / laterale)
  const fwdOldX = Math.sin(car.heading);
  const fwdOldZ = Math.cos(car.heading);
  const leftOldX = Math.cos(car.heading);
  const leftOldZ = -Math.sin(car.heading);

  let forwardSpeed = car.vx * fwdOldX + car.vz * fwdOldZ;
  let lateralSpeed = car.vx * leftOldX + car.vz * leftOldZ;
  const prevForwardSpeed = forwardSpeed;

  // 2. Aerodinamica, usura gomme, bloccaggio e frenata brusca (scalati da difficoltà e upgrade)
  updateAeroAndTires(car, input, dt, surfaceProps, weatherProps, difficultyProps, carSpecs);

  const rawWeatherGrip =
    car.surface === 'kerb' ? weatherProps.kerbGripMultiplier : weatherProps.gripMultiplier;
  const weatherGrip =
    1.0 - (1.0 - rawWeatherGrip) * difficultyProps.rainGripPenaltyMultiplier;
  const tireFactor = car.aeroTire.tireGripFactor * carSpecs.tireGripMult;
  const aeroBonus = car.aeroTire.aeroGripBonus;

  // 3. Aggiornamento cambio automatico e giri motore (RPM)
  updateAutomaticGearbox(car, forwardSpeed, forward, backward, dt, cfg);

  // 4. Sterzo progressivo (A/← = sinistra +, D/→ = destra -)
  const targetSteerAngle = car.steerInput * cfg.maxSteerAngle;
  const steerRate = car.steerInput === 0 ? cfg.steerReturnSpeed : cfg.steerSpeed;
  car.steerAngle += (targetSteerAngle - car.steerAngle) * Math.min(1, steerRate * dt);

  // 5. Forze longitudinali (trazione motore, frenata con effetto pioggia/bloccaggio, drag aero)
  const absFwd = Math.abs(forwardSpeed);
  const aeroDrag =
    -Math.sign(forwardSpeed) * (cfg.aeroDragCoeff + weatherProps.extraDrag) * forwardSpeed * forwardSpeed;
  const totalRollingRes = cfg.rollingResistance + effectiveExtraRollingDrag;
  const rollingDrag =
    absFwd > 0.05 ? -Math.sign(forwardSpeed) * totalRollingRes : 0;

  let driveAccel = 0;

  if (forward && !backward) {
    if (forwardSpeed < -0.2) {
      driveAccel = cfg.maxBrakeDecel * surfaceProps.brakeMultiplier * weatherGrip * tireFactor;
    } else if (car.gear >= 1) {
      const gearMult = cfg.gearAccelMultipliers[car.gear];
      const gearTop = cfg.gearTopSpeeds[car.gear];
      const speedRatio = clamp(forwardSpeed / gearTop, 0, 1);
      const torqueCurve = speedRatio < 0.92 ? 0.85 + 0.25 * Math.sin(speedRatio * Math.PI) : Math.max(0, (1 - speedRatio) * 10);
      driveAccel =
        cfg.baseEngineAccel *
        gearMult *
        torqueCurve *
        surfaceProps.tractionMultiplier *
        weatherGrip *
        tireFactor *
        (car.accelMultiplier ?? 1.0) *
        carSpecs.engineAccelMult;
    }
  } else if (backward && !forward) {
    if (forwardSpeed > 0.25) {
      const lockPenalty = car.aeroTire.wheelLockup ? adv.lockupBrakePenalty : 1.0;
      const aeroBrakeBoost = 0.88 + 0.14 * (aeroBonus - 1.0);
      driveAccel =
        -cfg.maxBrakeDecel *
        surfaceProps.brakeMultiplier *
        weatherGrip *
        tireFactor *
        aeroBrakeBoost *
        lockPenalty *
        carSpecs.brakeMult;
    } else if (forwardSpeed > -cfg.maxReverseSpeed) {
      driveAccel = -cfg.reverseAccel * surfaceProps.tractionMultiplier * weatherGrip;
    }
  }

  forwardSpeed += (driveAccel + aeroDrag + rollingDrag) * dt;

  if (!forward && !backward && Math.abs(forwardSpeed) < 0.08) {
    forwardSpeed = 0;
  }

  const maxTopSpeed =
    cfg.gearTopSpeeds[8] * (car.maxSpeedMultiplier ?? 1.0) * carSpecs.topSpeedMult;
  forwardSpeed = clamp(forwardSpeed, -cfg.maxReverseSpeed, maxTopSpeed);
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

    // Instabilità in frenata brusca ad alta velocità (attenuata in Principiante/Intermedio e da sospensioni upgrade)
    const brakeInstabMult =
      difficultyProps.highSpeedBrakeInstabilityMultiplier / carSpecs.suspensionStabilityMult;
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

    // Instabilità direzionale sull'erba scivolosa (scalata dalla difficoltà)
    if (surfaceProps.yawInstability > 0 && speedForSteer > 5.0) {
      const slipDir = car.steerInput !== 0 ? car.steerInput : -Math.sign(lateralSpeed);
      const pedalLoad = forward || backward ? 1.0 : 0.45;
      const rainSlipBoost = weatherProps.id === 'rain' ? 1.35 : 1.0;
      const instabilityYaw =
        slipDir *
        surfaceProps.yawInstability *
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
  car.vx = fwdNewX * newForwardSpeed + leftNewX * newLateralSpeed;
  car.vz = fwdNewZ * newForwardSpeed + leftNewZ * newLateralSpeed;
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
