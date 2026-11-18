/**
 * Modulo Sospensioni Dinamiche a 4 Ruote (Step 5).
 * Calcola beccheggio (dive in frenata / squat in accelerazione), rollio in curva,
 * abbassamento aerodinamico (heave) e vibrazioni su cordoli ed erba.
 */

import { ADVANCED_PHYSICS_CONFIG } from '../config/constants.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createInitialSuspensionState() {
  return {
    pitch: 0, // rad (+ muso giù in frenata, - muso su in accelerazione)
    roll: 0,  // rad (+ rollio a destra nelle curve a sinistra)
    heave: 0, // m (abbassamento verticale da carico aerodinamico / vibrazioni)
    wheelOffsetY: [0, 0, 0, 0], // fl, fr, rl, rr
  };
}

/**
 * Aggiorna lo stato delle sospensioni in base alle accelerazioni longitudinali/laterali e al carico aero.
 * @param {object} car
 * @param {number} longitudinalG
 * @param {number} lateralG
 * @param {number} dt
 */
export function updateSuspension(car, longitudinalG, lateralG, dt) {
  if (!car.suspension) {
    car.suspension = createInitialSuspensionState();
  }

  const susp = car.suspension;
  const cfg = ADVANCED_PHYSICS_CONFIG.suspension;
  const downforceRatio = car.aeroTire
    ? clamp(car.aeroTire.downforceKg / ADVANCED_PHYSICS_CONFIG.maxDownforceKg, 0, 1)
    : 0;

  // 1. Target di beccheggio, rollio e schiacciamento aerodinamico
  const targetPitch = clamp(-longitudinalG * 0.011, -cfg.maxPitchRad, cfg.maxPitchRad);
  const targetRoll = clamp(lateralG * 0.013, -cfg.maxRollRad, cfg.maxRollRad);

  let vibration = 0;
  const absSpeed = Math.abs(car.forwardSpeed);
  if (absSpeed > 2.0 && (car.surface === 'kerb' || car.surface === 'grass')) {
    const roughness = car.surface === 'grass' ? 1.25 : 0.9;
    vibration =
      Math.sin(car.wheelRotation * 3.4) * cfg.kerbVibrationAmp * roughness * clamp(absSpeed / 25, 0.25, 1.0);
  }

  const targetHeave = -cfg.maxAeroDropM * downforceRatio + vibration;

  const blend = Math.min(1, cfg.springStiffness * dt);
  susp.pitch += (targetPitch - susp.pitch) * blend;
  susp.roll += (targetRoll - susp.roll) * blend;
  susp.heave += (targetHeave - susp.heave) * blend;

  // 2. Deflessione verticale per ciascuna delle 4 sospensioni (fl, fr, rl, rr)
  const pitchOffset = susp.pitch * 0.7;
  const rollOffset = susp.roll * 0.6;
  const aeroDrop = susp.heave;

  // In curva a sinistra (roll > 0) la parte destra (-X) si comprime e la sinistra (+X) si estende
  susp.wheelOffsetY[0] = clamp(-(aeroDrop - pitchOffset + rollOffset), -0.05, 0.05); // FL
  susp.wheelOffsetY[1] = clamp(-(aeroDrop - pitchOffset - rollOffset), -0.05, 0.05); // FR
  susp.wheelOffsetY[2] = clamp(-(aeroDrop + pitchOffset + rollOffset), -0.05, 0.05); // RL
  susp.wheelOffsetY[3] = clamp(-(aeroDrop + pitchOffset - rollOffset), -0.05, 0.05); // RR
}
