/**
 * Modulo Aerodinamica, Usura Gomme, Bloccaggio Ruote e Frenate Brusche (Step 5).
 * Puro JavaScript deterministico e serializzabile in WorldState.
 */

import { ADVANCED_PHYSICS_CONFIG } from '../config/constants.js';
import { getDifficultyConfig } from '../config/difficulty.js';
import { getCarSpecsForLevel } from '../cars/CarSpecs.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createInitialAeroTireState() {
  return {
    downforceKg: 0,
    aeroGripBonus: 1.0,
    tireHealth: 1.0,       // 1.0 = 100% nuova, 0.0 = 0% finita
    tireGripFactor: 1.0,
    brakeHoldTime: 0,
    wheelLockup: false,
    lockupIntensity: 0,
    highSpeedBraking: false,
  };
}

/**
 * Aggiorna carico aerodinamico, rischio bloccaggio ruote, instabilità da frenata brusca e usura gomme.
 * @param {object} car
 * @param {{ forward: boolean, backward: boolean, left: boolean, right: boolean }} input
 * @param {number} dt
 * @param {object} surfaceProps
 * @param {object} weatherProps
 */
export function updateAeroAndTires(
  car,
  input,
  dt,
  surfaceProps,
  weatherProps,
  difficultyProps = getDifficultyConfig('realistic'),
  carSpecs = getCarSpecsForLevel('base')
) {
  if (!car.aeroTire) {
    car.aeroTire = createInitialAeroTireState();
  }

  const aero = car.aeroTire;
  const cfg = ADVANCED_PHYSICS_CONFIG;
  const absSpeed = Math.abs(car.forwardSpeed);
  const vRatio = clamp(absSpeed / 93.5, 0, 1);

  // 1. Aerodinamica: carico proporzionale al quadrato della velocità (scalato dagli upgrade)
  const vSq = vRatio * vRatio;
  const downforceMult = carSpecs?.aeroDownforceMult ?? 1.0;
  aero.downforceKg = Math.round(cfg.maxDownforceKg * vSq * downforceMult);
  aero.aeroGripBonus = 1.0 + cfg.downforceGripGain * vSq * downforceMult;

  // 2. Durata frenata continua (modulabile rilasciando brevemente il freno)
  const isBrakingForward = Boolean(input?.backward && !input?.forward && car.forwardSpeed > 6.0);
  if (isBrakingForward) {
    aero.brakeHoldTime += dt;
  } else {
    aero.brakeHoldTime = Math.max(0, aero.brakeHoldTime - dt * 8.0);
  }

  // 3. Frenata brusca ad alta velocità (> ~173 km/h)
  aero.highSpeedBraking = Boolean(
    input?.backward && !input?.forward && car.forwardSpeed > cfg.highSpeedBrakeThresholdMs
  );

  // 4. Valutazione bloccaggio ruote anteriori (disattivato se ABS assistito in Principiante)
  if (difficultyProps?.absAssist) {
    aero.wheelLockup = false;
    aero.lockupIntensity = 0;
  } else {
    const surfaceLockFactor =
      car.surface === 'kerb'
        ? surfaceProps.gripMultiplier * weatherProps.kerbGripMultiplier
        : surfaceProps.gripMultiplier * weatherProps.lockupThreshold;

    const lockupResistance =
      surfaceLockFactor *
      aero.tireGripFactor *
      (1.0 + 0.35 * vRatio) *
      (difficultyProps?.lockupResistanceMultiplier ?? 1.0) *
      (carSpecs?.brakeMult ?? 1.0);

    const steerLoad = 1.0 + Math.abs(car.steerAngle / 0.40) * cfg.lockupSteerSensitivity;
    const brakeDemand =
      (0.72 + Math.min(0.45, aero.brakeHoldTime * 0.65)) * steerLoad;

    if (isBrakingForward && car.forwardSpeed > 7.5 && brakeDemand > lockupResistance) {
      aero.wheelLockup = true;
      aero.lockupIntensity = clamp((brakeDemand - lockupResistance) * 2.2, 0.25, 1.0);
    } else {
      aero.wheelLockup = false;
      aero.lockupIntensity = 0;
    }
  }

  // 5. Usura progressiva delle gomme (scalata da difficoltà e livello vettura)
  if (absSpeed > 1.0 && aero.tireHealth > 0) {
    const cornerLoad =
      (Math.abs(car.lateralSpeed) + Math.abs(car.yawRate) * 2.0) / 10.0;
    const surfaceRoughness =
      car.surface === 'kerb' ? 1.5 : car.surface === 'grass' ? 1.8 : 1.0;

    let wearRate =
      (cfg.tireWearRateBase * vRatio + cfg.tireWearCornerMult * cornerLoad) *
      surfaceRoughness;

    if (aero.wheelLockup) {
      wearRate += cfg.tireWearLockupMult * aero.lockupIntensity;
    }

    wearRate *=
      (difficultyProps?.tireWearMultiplier ?? 1.0) * (carSpecs?.tireWearMult ?? 1.0);

    aero.tireHealth = clamp(aero.tireHealth - wearRate * dt, 0, 1);
    aero.tireGripFactor =
      cfg.minTireGripFactor +
      (1.0 - cfg.minTireGripFactor) * Math.pow(aero.tireHealth, 0.85);
  }
}
