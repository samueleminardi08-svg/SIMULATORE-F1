/**
 * Modulo Aerodinamica, Mescole Reali (S/M/H/W), Temperatura, Graining & Blistering,
 * Bloccaggio Ruote e Frenate Brusche (Step 5 — PIANO PRE STEP 4).
 * Puro JavaScript deterministico e serializzabile in WorldState.
 */

import { ADVANCED_PHYSICS_CONFIG, TIRE_COMPOUNDS } from '../config/constants.js';
import { getDifficultyConfig } from '../config/difficulty.js';
import { getCarSpecsForLevel } from '../cars/CarSpecs.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getTireCompoundSpec(compoundId = 'M') {
  return TIRE_COMPOUNDS[compoundId] || TIRE_COMPOUNDS.M;
}

export function createInitialAeroTireState(compound = 'M', isRain = false) {
  const validCompound = TIRE_COMPOUNDS[compound] ? compound : isRain ? 'W' : 'M';
  const spec = getTireCompoundSpec(validCompound);
  const initTemp = isRain ? 58.0 : 76.0;
  return {
    compound: validCompound,
    downforceKg: 0,
    aeroGripBonus: 1.0,
    tireHealth: 1.0,       // 1.0 = 100% nuova, 0.0 = 0% finita (media 4 ruote)
    wheelHealth: { fl: 1.0, fr: 1.0, rl: 1.0, rr: 1.0 },
    wheelTempC: { fl: initTemp, fr: initTemp, rl: initTemp, rr: initTemp },
    stintStartLap: 0,
    tireGripFactor: spec.gripMult,
    tireTempC: initTemp,   // Temperatura media battistrada (°C, da termocoperte)
    grainingLevel: 0.0,    // 0..1 (usura a freddo in curva, si pulisce in finestra termica)
    blisteringLevel: 0.0,  // 0..1 (surriscaldamento/bolle permanenti fino al pit stop)
    brakeHoldTime: 0,
    wheelLockup: false,
    lockupIntensity: 0,
    highSpeedBraking: false,
    lastBrakeDemand: 0,
    lastLockupResistance: 1.0,
  };
}

/**
 * Monta un nuovo treno di gomme al pit stop (ripristina salute 100% su tutte e 4 le ruote, graining=0, blistering=0).
 */
export function fitFreshTires(car, compoundId = 'M', isRain = false) {
  const validCompound = TIRE_COMPOUNDS[compoundId] ? compoundId : isRain ? 'W' : 'M';
  const spec = getTireCompoundSpec(validCompound);
  const freshTemp = validCompound === 'W' || isRain ? 60.0 : 78.0;
  const currentCompletedLaps = car?.timing?.completedLaps ?? 0;
  if (!car.aeroTire) {
    car.aeroTire = createInitialAeroTireState(validCompound, isRain);
    car.aeroTire.stintStartLap = currentCompletedLaps;
    return;
  }
  car.aeroTire.compound = validCompound;
  car.aeroTire.tireHealth = 1.0;
  car.aeroTire.wheelHealth = { fl: 1.0, fr: 1.0, rl: 1.0, rr: 1.0 };
  car.aeroTire.wheelTempC = { fl: freshTemp, fr: freshTemp, rl: freshTemp, rr: freshTemp };
  car.aeroTire.stintStartLap = currentCompletedLaps;
  car.aeroTire.tireGripFactor = spec.gripMult;
  car.aeroTire.tireTempC = freshTemp;
  car.aeroTire.grainingLevel = 0.0;
  car.aeroTire.blisteringLevel = 0.0;
  car.aeroTire.wheelLockup = false;
  car.aeroTire.lockupIntensity = 0;
}

/**
 * Aggiorna carico aerodinamico, mescola, temperatura, graining/blistering, bloccaggio e usura gomme.
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
  const isRain = weatherProps?.id === 'rain';
  if (!car.aeroTire) {
    car.aeroTire = createInitialAeroTireState(isRain ? 'W' : 'M', isRain);
  }

  const aero = car.aeroTire;
  if (!aero.compound || !TIRE_COMPOUNDS[aero.compound]) {
    aero.compound = isRain ? 'W' : 'M';
  }
  if (!Number.isFinite(aero.tireTempC)) aero.tireTempC = isRain ? 58.0 : 76.0;
  if (!Number.isFinite(aero.grainingLevel)) aero.grainingLevel = 0;
  if (!Number.isFinite(aero.blisteringLevel)) aero.blisteringLevel = 0;
  if (!aero.wheelHealth) {
    const h = clamp(aero.tireHealth ?? 1.0, 0, 1);
    aero.wheelHealth = { fl: h, fr: h, rl: h, rr: h };
  }
  if (!aero.wheelTempC) {
    const t = aero.tireTempC;
    aero.wheelTempC = { fl: t, fr: t, rl: t, rr: t };
  }
  if (!Number.isFinite(aero.stintStartLap)) {
    aero.stintStartLap = 0;
  }

  const spec = getTireCompoundSpec(aero.compound);
  const cfg = ADVANCED_PHYSICS_CONFIG;
  const absSpeed = Math.abs(car.forwardSpeed);
  const vRatio = clamp(absSpeed / 93.5, 0, 1);

  const aeroEnabled = difficultyProps?.aerodynamicsEnabled !== false;
  const degEnabled =
    difficultyProps?.tireDegradationEnabled !== false &&
    (difficultyProps?.tireWearMultiplier ?? 1.0) > 0;
  const rainPhysEnabled = difficultyProps?.rainPhysicsEnabled !== false;
  const offTrackEnabled = difficultyProps?.offTrackPenaltiesEnabled !== false;

  // 1. Aerodinamica: carico proporzionale a v² (neutralizzato se toggle Aerodinamica OFF)
  const vSq = vRatio * vRatio;
  if (aeroEnabled) {
    const downforceMult = carSpecs?.aeroDownforceMult ?? 1.0;
    aero.downforceKg = Math.round(cfg.maxDownforceKg * vSq * downforceMult);
    aero.aeroGripBonus = 1.0 + cfg.downforceGripGain * vSq * downforceMult;
  } else {
    aero.downforceKg = 0;
    aero.aeroGripBonus = 1.0;
  }

  // 2. Durata frenata continua guidata dalla pressione progressiva brakeInput (0..1)
  const brakePressure = clamp(
    typeof car.brakeInput === 'number' ? car.brakeInput : input?.backward ? 1 : 0,
    0,
    1
  );
  const isBrakingForward = Boolean(brakePressure > 0.05 && !input?.forward && car.forwardSpeed > 6.0);
  if (isBrakingForward && brakePressure >= 0.45) {
    aero.brakeHoldTime += dt * brakePressure;
  } else {
    aero.brakeHoldTime = Math.max(0, aero.brakeHoldTime - dt * 9.5);
  }

  // 3. Frenata brusca ad alta velocità (> ~173 km/h con pressione freno elevata)
  aero.highSpeedBraking = Boolean(
    isBrakingForward && brakePressure > 0.72 && car.forwardSpeed > cfg.highSpeedBrakeThresholdMs
  );

  // 4. Valutazione bloccaggio ruote anteriori (OFF = ABS)
  if (difficultyProps?.absAssist) {
    aero.wheelLockup = false;
    aero.lockupIntensity = 0;
    aero.lastBrakeDemand = 0;
    aero.lastLockupResistance = Infinity;
  } else {
    const effWeatherLockup = rainPhysEnabled ? weatherProps.lockupThreshold : 0.92;
    const effKerbWeather = rainPhysEnabled ? weatherProps.kerbGripMultiplier : 1.0;
    const baseSurfGrip =
      !offTrackEnabled && car.surface === 'kerb' ? 1.0 : surfaceProps.gripMultiplier;
    const surfaceLockFactor =
      car.surface === 'kerb'
        ? baseSurfGrip * effKerbWeather
        : baseSurfGrip * effWeatherLockup;

    const lockupResistance =
      surfaceLockFactor *
      aero.tireGripFactor *
      (1.0 + 0.35 * vRatio) *
      (difficultyProps?.lockupResistanceMultiplier ?? 1.0) *
      (carSpecs?.brakeMult ?? 1.0);

    const steerRatio = Math.abs(car.steerAngle / 0.48);
    const steerLoad = 1.0 + steerRatio * cfg.lockupSteerSensitivity;
    let brakeDemand =
      isBrakingForward
        ? (brakePressure * 0.82 + Math.min(0.30, aero.brakeHoldTime * 0.35) * brakePressure) *
          steerLoad
        : 0;

    const cadenceGrace = difficultyProps?.cadenceAssistGraceTime ?? 0;
    if (
      cadenceGrace > 0 &&
      isBrakingForward &&
      aero.brakeHoldTime <= cadenceGrace &&
      steerRatio < 0.62 &&
      car.surface !== 'grass'
    ) {
      brakeDemand = Math.min(brakeDemand, lockupResistance * 0.96);
    }

    aero.lastBrakeDemand = brakeDemand;
    aero.lastLockupResistance = lockupResistance;

    if (isBrakingForward && car.forwardSpeed > 7.5 && brakeDemand > lockupResistance) {
      aero.wheelLockup = true;
      aero.lockupIntensity = clamp((brakeDemand - lockupResistance) * 2.2, 0.22, 1.0);
    } else {
      aero.wheelLockup = false;
      aero.lockupIntensity = 0;
    }
  }

  // 5. Temperatura battistrada, Graining, Blistering e Usura progressiva per mescola
  const cornerLoad = (Math.abs(car.lateralSpeed) + Math.abs(car.yawRate) * 2.0) / 10.0;
  const ambientTemp = isRain ? 20.0 : 30.0;

  if (!degEnabled) {
    aero.tireHealth = 1.0;
    aero.wheelHealth.fl = 1.0;
    aero.wheelHealth.fr = 1.0;
    aero.wheelHealth.rl = 1.0;
    aero.wheelHealth.rr = 1.0;
    aero.grainingLevel = 0.0;
    aero.blisteringLevel = 0.0;
    aero.tireTempC += ((spec.optTempMin + spec.optTempMax) * 0.5 - aero.tireTempC) * Math.min(1, 0.6 * dt);
    aero.wheelTempC.fl = aero.tireTempC;
    aero.wheelTempC.fr = aero.tireTempC;
    aero.wheelTempC.rl = aero.tireTempC;
    aero.wheelTempC.rr = aero.tireTempC;
    const compoundRainFactor =
      isRain && rainPhysEnabled ? spec.wetGripMult : spec.gripMult;
    aero.tireGripFactor = clamp(compoundRainFactor, 0.55, 1.18);
    return;
  }

  if (absSpeed > 1.0) {
    // Dinamica termica del battistrada
    const dryOnWetHeatBoost = aero.compound === 'W' && !isRain ? 1.85 : 1.0;
    const rainCoolFactor = isRain ? 1.55 : 1.0;
    const heatGain =
      (1.35 * vRatio +
        7.8 * cornerLoad +
        4.5 * brakePressure * vRatio +
        (aero.wheelLockup ? 14.0 * aero.lockupIntensity : 0)) *
      spec.heatRate *
      dryOnWetHeatBoost;
    const cooling = (aero.tireTempC - ambientTemp) * (0.042 + 0.025 * vRatio) * rainCoolFactor;
    aero.tireTempC = clamp(aero.tireTempC + (heatGain - cooling) * dt, ambientTemp, 148.0);

    // Graining: forzare in curva sotto la finestra termica ottimale (es. Hard a freddo)
    if (aero.tireTempC < spec.optTempMin && cornerLoad > 0.22) {
      const coldGap = clamp((spec.optTempMin - aero.tireTempC) / 28.0, 0.15, 1.0);
      const grainDelta = 0.018 * cornerLoad * coldGap * spec.grainingSens * dt;
      aero.grainingLevel = clamp(aero.grainingLevel + grainDelta, 0, 1);
    } else if (
      aero.tireTempC >= spec.optTempMin &&
      aero.tireTempC <= spec.optTempMax &&
      aero.grainingLevel > 0 &&
      cornerLoad < 0.75
    ) {
      // Pulizia graduale del graining guidando puliti nella finestra termica
      aero.grainingLevel = clamp(aero.grainingLevel - 0.011 * dt, 0, 1);
    }

    // Blistering: surriscaldamento sostenuto oltre optTempMax, lockup ripetuti o Wet su asciutto (permanente fino al pit)
    const overheatGap = Math.max(0, aero.tireTempC - spec.optTempMax);
    let blisterDelta = 0;
    if (overheatGap > 0) {
      const overNorm = clamp(overheatGap / 22.0, 0.1, 1.5);
      const wearAmp = 1.0 + (1.0 - aero.tireHealth) * 0.9;
      blisterDelta += 0.016 * overNorm * (0.45 + cornerLoad) * wearAmp * spec.blisteringSens * dt;
    }
    if (aero.wheelLockup) {
      blisterDelta += 0.032 * aero.lockupIntensity * spec.blisteringSens * dt;
    }
    if (aero.compound === 'W' && !isRain && vRatio > 0.45) {
      blisterDelta += 0.014 * vRatio * dt;
    }
    if (blisterDelta > 0) {
      aero.blisteringLevel = clamp(aero.blisteringLevel + blisterDelta, 0, 1);
    }

    // Usura gomme scalata per mescola, superficie, difficoltà, upgrade e profilo pilota bot
    if (aero.tireHealth > 0) {
      const surfaceRoughness =
        car.surface === 'kerb'
          ? offTrackEnabled
            ? 1.5
            : 1.05
          : car.surface === 'grass'
            ? offTrackEnabled
              ? 1.8
              : 1.15
            : 1.0;
      const wetOnDryWear = aero.compound === 'W' && !isRain ? spec.dryWearMultOnWetTire : 1.0;
      const thermalWearBoost = overheatGap > 0 ? 1.0 + clamp(overheatGap / 30.0, 0, 0.7) : 1.0;

      let wearRate =
        (cfg.tireWearRateBase * vRatio + cfg.tireWearCornerMult * cornerLoad) *
        surfaceRoughness *
        spec.wearMult *
        wetOnDryWear *
        thermalWearBoost;

      if (aero.wheelLockup) {
        wearRate += cfg.tireWearLockupMult * aero.lockupIntensity;
      }

      wearRate *=
        (difficultyProps?.tireWearMultiplier ?? 1.0) * (carSpecs?.tireWearMult ?? 1.0);

      if (car.isBot && typeof car.driverProfile?.tyreManagement === 'number') {
        const tmScale = clamp(1.18 - car.driverProfile.tyreManagement * 0.28, 0.85, 1.08);
        wearRate *= tmScale;
      }

      // Distribuzione fisica realistica sui 4 pneumatici (carico curva, frenata, trazione posteriore, lockup interno)
      const steerNorm = clamp((car.steerAngle ?? 0) / 0.36, -1, 1);
      const latSign = Math.abs(steerNorm) > 0.04 ? steerNorm : clamp((car.yawRate ?? 0) * 0.8, -1, 1);
      const throttleAmt = clamp(car.throttleInput ?? (input?.forward ? 1 : 0), 0, 1);
      const tcRearExtra = difficultyProps?.tractionControlOff && !car.isBot ? 0.22 : 0.0;

      // Curva a sinistra (latSign > 0) carica le ruote esterne destre (FR, RR); curva a destra carica FL, RL
      let wFL = 1.0 - latSign * 0.24 + brakePressure * 0.32 - throttleAmt * 0.08;
      let wFR = 1.0 + latSign * 0.24 + brakePressure * 0.32 - throttleAmt * 0.08;
      let wRL = 1.0 - latSign * 0.20 - brakePressure * 0.14 + throttleAmt * (0.28 + tcRearExtra);
      let wRR = 1.0 + latSign * 0.20 - brakePressure * 0.14 + throttleAmt * (0.28 + tcRearExtra);

      if (aero.wheelLockup) {
        if ((car.steerAngle ?? 0) > 0.025) {
          wFL += 1.25; // Bloccaggio anteriore interna sinistra
        } else if ((car.steerAngle ?? 0) < -0.025) {
          wFR += 1.25; // Bloccaggio anteriore interna destra
        } else {
          wFL += 0.65;
          wFR += 0.65;
        }
      }

      wFL = Math.max(0.35, wFL);
      wFR = Math.max(0.35, wFR);
      wRL = Math.max(0.35, wRL);
      wRR = Math.max(0.35, wRR);
      const wMean = (wFL + wFR + wRL + wRR) * 0.25;
      const baseStep = wearRate * dt;

      aero.wheelHealth.fl = clamp(aero.wheelHealth.fl - baseStep * (wFL / wMean), 0, 1);
      aero.wheelHealth.fr = clamp(aero.wheelHealth.fr - baseStep * (wFR / wMean), 0, 1);
      aero.wheelHealth.rl = clamp(aero.wheelHealth.rl - baseStep * (wRL / wMean), 0, 1);
      aero.wheelHealth.rr = clamp(aero.wheelHealth.rr - baseStep * (wRR / wMean), 0, 1);
      aero.tireHealth =
        (aero.wheelHealth.fl + aero.wheelHealth.fr + aero.wheelHealth.rl + aero.wheelHealth.rr) * 0.25;

      // Temperature differenziate per singolo pneumatico attorno alla temperatura media
      const tBiasScale = 7.5;
      const tgtFL = clamp(aero.tireTempC + (wFL / wMean - 1.0) * tBiasScale, ambientTemp, 148.0);
      const tgtFR = clamp(aero.tireTempC + (wFR / wMean - 1.0) * tBiasScale, ambientTemp, 148.0);
      const tgtRL = clamp(aero.tireTempC + (wRL / wMean - 1.0) * tBiasScale, ambientTemp, 148.0);
      const tgtRR = clamp(aero.tireTempC + (wRR / wMean - 1.0) * tBiasScale, ambientTemp, 148.0);
      const tAlpha = Math.min(1, 2.2 * dt);
      aero.wheelTempC.fl += (tgtFL - aero.wheelTempC.fl) * tAlpha;
      aero.wheelTempC.fr += (tgtFR - aero.wheelTempC.fr) * tAlpha;
      aero.wheelTempC.rl += (tgtRL - aero.wheelTempC.rl) * tAlpha;
      aero.wheelTempC.rr += (tgtRR - aero.wheelTempC.rr) * tAlpha;
    }
  } else {
    // Raffreddamento lento da fermi
    aero.tireTempC = clamp(
      aero.tireTempC - (aero.tireTempC - ambientTemp) * 0.025 * dt,
      ambientTemp,
      148.0
    );
    const coolAlpha = Math.min(1, 0.5 * dt);
    aero.wheelTempC.fl += (aero.tireTempC - aero.wheelTempC.fl) * coolAlpha;
    aero.wheelTempC.fr += (aero.tireTempC - aero.wheelTempC.fr) * coolAlpha;
    aero.wheelTempC.rl += (aero.tireTempC - aero.wheelTempC.rl) * coolAlpha;
    aero.wheelTempC.rr += (aero.tireTempC - aero.wheelTempC.rr) * coolAlpha;
  }

  // Grip risultante: mescola × salute gomma × penalità graining/blistering × adeguatezza meteo
  const healthCurve =
    cfg.minTireGripFactor + (1.0 - cfg.minTireGripFactor) * Math.pow(aero.tireHealth, 0.85);
  const grainingPenalty = 1.0 - 0.16 * aero.grainingLevel;
  const blisteringPenalty = 1.0 - 0.22 * aero.blisteringLevel;
  const compoundBaseGrip =
    isRain && rainPhysEnabled ? spec.wetGripMult : spec.gripMult;

  aero.tireGripFactor = clamp(
    compoundBaseGrip * healthCurve * grainingPenalty * blisteringPenalty,
    0.45,
    1.22
  );
}
