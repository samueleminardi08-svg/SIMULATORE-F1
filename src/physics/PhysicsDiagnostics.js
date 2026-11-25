/**
 * Step 6a — Modulo di Diagnosi & Telemetria Fisica (SOLA LETTURA, zero modifiche alla fisica).
 * - Fornisce uno snapshot telemetrico live per il pannello debug HUD (tasto F3).
 * - Fornisce la suite deterministica a 60 Hz sui 5 scenari standard per misurare
 *   bloccaggi ruote, raggi di sterzata, frenate brevi, pioggia ed erba.
 */

import {
  ADVANCED_PHYSICS_CONFIG,
  CAR_PHYSICS_CONFIG,
  FIXED_DT,
  SURFACE_PHYSICS,
  WEATHER_CONFIG,
} from '../config/constants.js';
import { getDifficultyConfig } from '../config/difficulty.js';
import { getCarSpecsForLevel } from '../cars/CarSpecs.js';
import { createTrackSurface } from '../tracks/TrackSurface.js';
import { getTrackById } from '../tracks/calendar2026/index.js';
import { createInitialCarState, stepCarPhysics } from './CarPhysics.js';

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Calcola uno snapshot diagnostico completo dallo stato corrente della vettura
 * replicando in sola lettura le formule di CarPhysics / AeroAndTires.
 */
export function computeCarTelemetrySnapshot(
  car,
  weatherId = 'dry',
  difficultyOrSettings = 'intermediate'
) {
  if (!car) return null;
  const cfg = CAR_PHYSICS_CONFIG;
  const adv = ADVANCED_PHYSICS_CONFIG;
  const rawWeatherProps = WEATHER_CONFIG[weatherId] || WEATHER_CONFIG.dry;
  const difficultyProps = getDifficultyConfig(difficultyOrSettings);
  const rainPhysicsEnabled = difficultyProps.rainPhysicsEnabled !== false;
  const weatherProps = rainPhysicsEnabled ? rawWeatherProps : WEATHER_CONFIG.dry;
  const surfaceProps = SURFACE_PHYSICS[car.surface] || SURFACE_PHYSICS.asphalt;
  const carSpecs = car.carSpecs || getCarSpecsForLevel(car.carLevel || 'base');
  const aero = car.aeroTire || {};

  const forwardSpeed = car.forwardSpeed ?? 0;
  const absSpeed = Math.abs(forwardSpeed);
  const speedKmh = absSpeed * 3.6;
  const vRatio = Math.max(0, Math.min(1, absSpeed / 93.5));

  const highSpeedAttenuation =
    1 / (1 + Math.pow(absSpeed / cfg.highSpeedSteerScale, cfg.highSpeedSteerExponent));
  const lockSteerFactor = aero.wheelLockup ? adv.lockupUndersteerFactor : 1.0;
  const effectiveSteerRad = (car.steerAngle ?? 0) * highSpeedAttenuation * lockSteerFactor;

  const absYaw = Math.abs(car.yawRate ?? 0);
  const turnRadiusM = absSpeed > 1.0 && absYaw > 0.015 ? absSpeed / absYaw : null;
  const lateralG = (absYaw * absSpeed) / 9.81;

  const surfaceLockFactor =
    car.surface === 'kerb'
      ? surfaceProps.gripMultiplier * weatherProps.kerbGripMultiplier
      : surfaceProps.gripMultiplier * weatherProps.lockupThreshold;

  const fallbackResistance = difficultyProps.absAssist
    ? Infinity
    : surfaceLockFactor *
      (aero.tireGripFactor ?? 1.0) *
      (1.0 + 0.35 * vRatio) *
      (difficultyProps.lockupResistanceMultiplier ?? 1.0) *
      (carSpecs.brakeMult ?? 1.0);

  const lockupResistance =
    typeof aero.lastLockupResistance === 'number'
      ? aero.lastLockupResistance
      : fallbackResistance;

  const brakeHoldTime = aero.brakeHoldTime ?? 0;
  const brakePressure = Math.max(0, Math.min(1, car.brakeInput ?? 0));
  const steerLoad = 1.0 + Math.abs((car.steerAngle ?? 0) / 0.48) * adv.lockupSteerSensitivity;
  const fallbackDemand =
    brakePressure > 0.05 && forwardSpeed > 6.0
      ? (brakePressure * 0.82 + Math.min(0.30, brakeHoldTime * 0.35) * brakePressure) * steerLoad
      : 0;
  const brakeDemand =
    typeof aero.lastBrakeDemand === 'number' ? aero.lastBrakeDemand : fallbackDemand;

  return {
    speedKmh,
    forwardSpeed,
    lateralSpeed: car.lateralSpeed ?? 0,
    throttleInput: car.throttleInput ?? 0,
    brakeInput: car.brakeInput ?? 0,
    steerInput: car.steerInput ?? 0,
    steerAngleDeg: (car.steerAngle ?? 0) * RAD_TO_DEG,
    effectiveSteerDeg: effectiveSteerRad * RAD_TO_DEG,
    highSpeedAttenuation,
    yawRateRadS: car.yawRate ?? 0,
    turnRadiusM,
    lateralG,
    brakeHoldTime,
    brakeDemand,
    lockupResistance,
    lockupMargin: Number.isFinite(lockupResistance) ? lockupResistance - brakeDemand : Infinity,
    wheelLockup: Boolean(aero.wheelLockup),
    lockupIntensity: aero.lockupIntensity ?? 0,
    highSpeedBraking: Boolean(aero.highSpeedBraking),
    tireHealthPct: Math.round((aero.tireHealth ?? 1) * 1000) / 10,
    compound: aero.compound || 'M',
    tireTempC: Math.round(aero.tireTempC ?? 95),
    grainingPct: Math.round((aero.grainingLevel ?? 0) * 100),
    blisteringPct: Math.round((aero.blisteringLevel ?? 0) * 100),
    downforceKg: aero.downforceKg ?? 0,
    surface: car.surface || 'asphalt',
    weatherId,
    difficultyId: typeof difficultyOrSettings === 'string' ? difficultyOrSettings : difficultyProps.id,
  };
}

function makeTestCar(initialSpeedMs = 0, surface = 'asphalt') {
  const car = createInitialCarState('diag_car', { x: 0, y: 0, z: 0, heading: 0 }, {
    carLevel: 'base',
    teamId: 'ferrari',
  });
  car.vx = 0;
  car.vz = initialSpeedMs;
  car.forwardSpeed = initialSpeedMs;
  car.speed = initialSpeedMs;
  car.surface = surface;
  if (initialSpeedMs > 1) {
    car.gear = 6;
    car.gearLabel = '6';
    car.rpm = 11500;
  }
  return car;
}

/**
 * Crea una TrackSurface reale (Monza) per testare la superficie 'grass' con queryTrackSurface reale.
 */
function makeRealTrackSurfaceForGrass() {
  return createTrackSurface(getTrackById('monza'));
}

function runScenario1StandingStart() {
  const car = makeTestCar(0);
  let t100 = null;
  let t200 = null;
  let t250 = null;
  let gearAt250 = null;
  const maxSteps = Math.round(12 / FIXED_DT);

  for (let s = 1; s <= maxSteps; s++) {
    stepCarPhysics(car, { forward: true, backward: false, left: false, right: false }, FIXED_DT, null, 'dry', 'realistic');
    const kmh = car.forwardSpeed * 3.6;
    const t = s * FIXED_DT;
    if (t100 === null && kmh >= 100) t100 = t;
    if (t200 === null && kmh >= 200) t200 = t;
    if (t250 === null && kmh >= 250) {
      t250 = t;
      gearAt250 = car.gear;
    }
  }

  return {
    t0_100s: t100 !== null ? Number(t100.toFixed(2)) : null,
    t0_200s: t200 !== null ? Number(t200.toFixed(2)) : null,
    t0_250s: t250 !== null ? Number(t250.toFixed(2)) : null,
    gearAt250,
    speedAt12sKmh: Number((car.forwardSpeed * 3.6).toFixed(1)),
  };
}

function runScenario2FullBraking(startKmh = 300, weatherId = 'dry') {
  const results = {};
  for (const diff of ['beginner', 'intermediate', 'realistic']) {
    const startMs = startKmh / 3.6;
    const car = makeTestCar(startMs);
    let elapsed = 0;
    let lockupOnsetMs = null;
    let lockupTicks = 0;
    let totalTicks = 0;
    let peakDecelG = 0;
    let maxDemand = 0;
    let minResistance = Infinity;

    for (let s = 1; s <= 600; s++) {
      const prevV = car.forwardSpeed;
      stepCarPhysics(car, { forward: false, backward: true, left: false, right: false }, FIXED_DT, null, weatherId, diff);
      elapsed = s * FIXED_DT;
      totalTicks++;

      const decelG = (prevV - car.forwardSpeed) / FIXED_DT / 9.81;
      if (decelG > peakDecelG) peakDecelG = decelG;

      const snap = computeCarTelemetrySnapshot(car, weatherId, diff);
      if (snap.brakeDemand > maxDemand) maxDemand = snap.brakeDemand;
      if (snap.lockupResistance < minResistance) minResistance = snap.lockupResistance;

      if (car.aeroTire.wheelLockup) {
        lockupTicks++;
        if (lockupOnsetMs === null) lockupOnsetMs = Math.round(elapsed * 1000);
      }
      if (car.forwardSpeed <= 0.3) break;
    }

    const avgDecelG = startMs / Math.max(0.01, elapsed) / 9.81;
    results[diff] = {
      startKmh,
      weatherId,
      stopDistM: Number(car.z.toFixed(1)),
      stopTimeS: Number(elapsed.toFixed(2)),
      lockupOnsetMs,
      lockupPct: Number(((lockupTicks / Math.max(1, totalTicks)) * 100).toFixed(1)),
      avgDecelG: Number(avgDecelG.toFixed(2)),
      peakDecelG: Number(peakDecelG.toFixed(2)),
      tireWearLostPct: Number(((1 - car.aeroTire.tireHealth) * 100).toFixed(2)),
      maxBrakeDemand: Number(maxDemand.toFixed(2)),
      minLockupRes: Number.isFinite(minResistance) ? Number(minResistance.toFixed(2)) : null,
    };
  }
  return results;
}

function runScenario3ShortBraking() {
  const cases = [];
  const startKmh = 240;
  for (const diff of ['intermediate', 'realistic']) {
    for (const durationMs of [200, 400]) {
      for (const withSteer of [false, true]) {
        const car = makeTestCar(startKmh / 3.6);
        const steps = Math.round((durationMs / 1000) / FIXED_DT);
        let lockupOnsetMs = null;
        let lockupTicks = 0;
        let peakDemand = 0;
        let minRes = Infinity;

        for (let s = 1; s <= steps; s++) {
          stepCarPhysics(
            car,
            { forward: false, backward: true, left: withSteer, right: false },
            FIXED_DT,
            null,
            'dry',
            diff
          );
          const snap = computeCarTelemetrySnapshot(car, 'dry', diff);
          if (snap.brakeDemand > peakDemand) peakDemand = snap.brakeDemand;
          if (snap.lockupResistance < minRes) minRes = snap.lockupResistance;
          if (car.aeroTire.wheelLockup) {
            lockupTicks++;
            if (lockupOnsetMs === null) lockupOnsetMs = Math.round(s * FIXED_DT * 1000);
          }
        }

        cases.push({
          difficulty: diff,
          durationMs,
          steering: withSteer ? 'Sterzata (A+S)' : 'Dritta (solo S)',
          endKmh: Number((car.forwardSpeed * 3.6).toFixed(1)),
          deltaKmh: Number((startKmh - car.forwardSpeed * 3.6).toFixed(1)),
          lockedUp: lockupOnsetMs !== null,
          lockupOnsetMs,
          lockupPct: Number(((lockupTicks / steps) * 100).toFixed(1)),
          peakDemand: Number(peakDemand.toFixed(2)),
          minRes: Number(minRes.toFixed(2)),
        });
      }
    }
  }
  return cases;
}

function runScenario4CorneringRadii(weatherId = 'dry') {
  const speedsKmh = [60, 100, 150, 200, 230, 260];
  const rows = [];

  for (const kmh of speedsKmh) {
    const vMs = kmh / 3.6;
    const car = makeTestCar(vMs);
    // Stabilizza lo sterzo tenendo velocità costante per 0.8s (48 tick)
    for (let s = 0; s < 48; s++) {
      // Mantiene la velocità tangenziale di prova per misurare il raggio stazionario a quella velocità
      const fwdX = Math.sin(car.heading);
      const fwdZ = Math.cos(car.heading);
      car.vx = fwdX * vMs;
      car.vz = fwdZ * vMs;
      car.forwardSpeed = vMs;
      stepCarPhysics(
        car,
        { forward: false, backward: false, left: true, right: false },
        FIXED_DT,
        null,
        weatherId,
        'realistic'
      );
    }
    const snap = computeCarTelemetrySnapshot(car, weatherId, 'realistic');
    rows.push({
      speedKmh: kmh,
      rawSteerDeg: Number(snap.steerAngleDeg.toFixed(1)),
      attenuation: Number(snap.highSpeedAttenuation.toFixed(3)),
      effectiveSteerDeg: Number(snap.effectiveSteerDeg.toFixed(2)),
      yawRateRadS: Number(snap.yawRateRadS.toFixed(3)),
      lateralG: Number(snap.lateralG.toFixed(2)),
      turnRadiusM: snap.turnRadiusM !== null ? Number(snap.turnRadiusM.toFixed(1)) : null,
      lateralSlipMs: Number(Math.abs(snap.lateralSpeed).toFixed(2)),
    });
  }
  return rows;
}

function runScenario5RainAndGrass() {
  const rainBraking250 = runScenario2FullBraking(250, 'rain');
  const dryBraking250 = runScenario2FullBraking(250, 'dry');
  const rainCorner150 = runScenario4CorneringRadii('rain').find((r) => r.speedKmh === 150);
  const dryCorner150 = runScenario4CorneringRadii('dry').find((r) => r.speedKmh === 150);

  const grassSurface = makeRealTrackSurfaceForGrass();
  const grassByDiff = {};
  for (const diff of ['beginner', 'intermediate', 'realistic']) {
    const car = makeTestCar(180 / 3.6, 'grass');
    car.x = 50000;
    car.z = 50000;
    let lockTicks = 0;
    const steps = 90; // 1.5s
    for (let s = 1; s <= steps; s++) {
      stepCarPhysics(
        car,
        { forward: false, backward: true, left: true, right: false },
        FIXED_DT,
        grassSurface,
        'dry',
        diff
      );
      if (car.aeroTire.wheelLockup) lockTicks++;
    }
    grassByDiff[diff] = {
      startKmh: 180,
      endKmhAfter1_5s: Number((car.forwardSpeed * 3.6).toFixed(1)),
      headingChangeDeg: Number((car.heading * RAD_TO_DEG).toFixed(1)),
      lockupPct: Number(((lockTicks / steps) * 100).toFixed(1)),
      finalSurface: car.surface,
    };
  }

  return {
    dryBraking250,
    rainBraking250,
    corner150DryVsRain: { dry: dryCorner150, rain: rainCorner150 },
    grass180BrakeSteer: grassByDiff,
  };
}

/**
 * Esegue tutti e 5 gli scenari diagnostici e restituisce il report strutturato.
 */
export function runPhysicsDiagnosticSuite() {
  return {
    tickRateHz: Math.round(1 / FIXED_DT),
    scenario1_standingStart: runScenario1StandingStart(),
    scenario2_fullBraking300: runScenario2FullBraking(300, 'dry'),
    scenario3_shortBraking240: runScenario3ShortBraking(),
    scenario4_corneringDry: runScenario4CorneringRadii('dry'),
    scenario5_rainAndGrass: runScenario5RainAndGrass(),
  };
}
