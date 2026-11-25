/**
 * Step 6b — Filtro di Input Virtuale Graduale (0..1) per Tastiera (WASD / Frecce).
 * Trasforma i tasti digitali on/off in rampe progressive deterministiche,
 * salvate direttamente nei campi serializzabili di CarState (throttleInput, brakeInput, steerInput)
 * per garantire compatibilità 100% con il multiplayer P2P e il replay deterministico.
 */

import { VIRTUAL_INPUT_CONFIG } from '../config/constants.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function moveTowards(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

/**
 * Aggiorna throttleInput (0..1), brakeInput (0..1) e steerInput (-1..1) della vettura.
 * Per i bot (o input con analogSteer esplicito) mantiene il comportamento diretto senza alterare l'IA.
 *
 * @param {object} car
 * @param {{ forward?: boolean, backward?: boolean, left?: boolean, right?: boolean, analogSteer?: number } | null} input
 * @param {number} dt
 * @param {object} [difficultyProps]
 */
export function stepVirtualInput(car, input, dt, difficultyProps = null) {
  const forward = Boolean(input?.forward);
  const backward = Boolean(input?.backward);
  const left = Boolean(input?.left);
  const right = Boolean(input?.right);

  // I bot e gli input già analogici bypassano il filtro tastiera
  if (car.isBot || typeof input?.analogSteer === 'number') {
    car.throttleInput =
      typeof input?.analogThrottle === 'number'
        ? clamp(input.analogThrottle, 0, 1)
        : forward && !backward
          ? 1
          : 0;
    car.brakeInput =
      typeof input?.analogBrake === 'number'
        ? clamp(input.analogBrake, 0, 1)
        : backward && !forward
          ? 1
          : 0;
    car.steerInput =
      typeof input?.analogSteer === 'number'
        ? clamp(input.analogSteer, -1, 1)
        : (left ? 1 : 0) - (right ? 1 : 0);
    return;
  }

  const vcfg = VIRTUAL_INPUT_CONFIG;
  const prevThrottle = clamp(car.throttleInput ?? 0, 0, 1);
  const prevBrake = clamp(car.brakeInput ?? 0, 0, 1);
  const prevSteer = clamp(car.steerInput ?? 0, -1, 1);

  // 1. Acceleratore (W): taglio immediato se si passa al freno, altrimenti rampa attack/release
  if (backward) {
    car.throttleInput = 0;
  } else if (forward) {
    const base = prevThrottle < vcfg.throttleInitialStep ? vcfg.throttleInitialStep : prevThrottle;
    const step = dt / Math.max(0.02, vcfg.throttleAttackTime);
    car.throttleInput = clamp(base + step, 0, 1);
  } else {
    const step = dt / Math.max(0.02, vcfg.throttleReleaseTime);
    car.throttleInput = Math.max(0, prevThrottle - step);
  }

  // 2. Freno (S): taglio immediato se si passa al gas, altrimenti rampa modulabile a tocchi
  if (forward) {
    car.brakeInput = 0;
  } else if (backward) {
    const base = prevBrake < vcfg.brakeInitialStep ? vcfg.brakeInitialStep : prevBrake;
    const step = dt / Math.max(0.02, vcfg.brakeAttackTime);
    car.brakeInput = clamp(base + step, 0, 1);
  } else {
    const step = dt / Math.max(0.02, vcfg.brakeReleaseTime);
    car.brakeInput = Math.max(0, prevBrake - step);
  }

  // 3. Sterzo (A / D): rampa progressiva dipendente dalla velocità + inversione rapida in chicane
  const rawTargetSteer = (left ? 1 : 0) - (right ? 1 : 0);
  const absSpeed = Math.abs(car.forwardSpeed ?? 0);
  const speedT = clamp(
    (absSpeed - vcfg.steerLowSpeedMs) / Math.max(1, vcfg.steerHighSpeedMs - vcfg.steerLowSpeedMs),
    0,
    1
  );
  const attackTime =
    vcfg.steerAttackTimeLow + (vcfg.steerAttackTimeHigh - vcfg.steerAttackTimeLow) * speedT;

  let targetSteer = rawTargetSteer;
  const assistLevel = difficultyProps?.steerBrakeAssist ?? 0;
  if (assistLevel > 0 && targetSteer !== 0 && car.brakeInput > 0.72 && absSpeed > 22.0) {
    const cap = 1.0 - (1.0 - vcfg.brakeSteerAssistCap) * assistLevel;
    targetSteer *= cap;
  }

  if (targetSteer === 0) {
    const returnStep = dt / Math.max(0.02, vcfg.steerReturnTime);
    car.steerInput = moveTowards(prevSteer, 0, returnStep);
  } else {
    const isReversing = prevSteer !== 0 && Math.sign(prevSteer) !== Math.sign(targetSteer);
    const rateBoost = isReversing ? vcfg.steerOppositeBoost : 1.0;
    const steerStep = (dt / Math.max(0.02, attackTime)) * rateBoost;
    car.steerInput = clamp(moveTowards(prevSteer, targetSteer, steerStep), -1, 1);
  }
}
