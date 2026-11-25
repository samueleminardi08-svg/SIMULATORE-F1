/**
 * Gestore Gara da 10 Giri, Griglia di Partenza (22 caselle sfalsate) e Semaforo F1 (Step 6).
 * Puro JavaScript serializzabile in WorldState.
 */

import { RACE_TOTAL_LAPS } from '../config/f1_2026_data.js';
import { queryTrackSurface } from '../tracks/TrackSurface.js';

/**
 * Calcola le 22 posizioni sfalsate in griglia dietro la linea di partenza/traguardo.
 * @param {ReturnType<import('../tracks/TrackSurface.js').createTrackSurface>} trackSurface
 * @param {number} [count=22]
 * @param {{ x: number, z: number }} [startLinePos={ x: 0, z: 0 }]
 */
export function computeStartingGridTransforms(
  trackSurface,
  count = 22,
  startLinePos = { x: 0, z: 0 },
  options = {}
) {
  const { samples, sampleCount, totalLength } = trackSurface;
  const startQ = queryTrackSurface(trackSurface, startLinePos.x ?? 0, startLinePos.z ?? 0, 0);
  const startArc = startQ.arcDistance;
  const spacing = options.spacingMeters ?? 7.8;

  const transforms = [];
  for (let i = 0; i < count; i++) {
    const backDist = 6.5 + i * spacing; // Passo sfalsato tra una casella e la successiva
    const targetArc = (startArc - backDist + totalLength) % totalLength;
    const fIdx = (targetArc / totalLength) * sampleCount;
    const i0 = Math.floor(fIdx) % sampleCount;
    const i1 = (i0 + 1) % sampleCount;
    const alpha = fIdx - Math.floor(fIdx);
    const a = samples[i0];
    const b = samples[i1];

    const slotHalfWidth =
      (a.halfWidth ?? trackSurface.halfTrackWidth) +
      ((b.halfWidth ?? trackSurface.halfTrackWidth) - (a.halfWidth ?? trackSurface.halfTrackWidth)) *
        alpha;
    const maxSafeLat = Math.max(1.85, slotHalfWidth - 0.95 - 1.15);
    const lateralMag = Math.max(
      1.85,
      Math.min(Math.min(3.35, maxSafeLat), slotHalfWidth * 0.42)
    );
    const lateralOffset = i % 2 === 0 ? -lateralMag : lateralMag; // P1 a destra (-X), P2 a sinistra (+X)

    const sx = a.x + (b.x - a.x) * alpha;
    const sy = a.y + (b.y - a.y) * alpha;
    const sz = a.z + (b.z - a.z) * alpha;
    const rawTx = a.tx + (b.tx - a.tx) * alpha;
    const rawTz = a.tz + (b.tz - a.tz) * alpha;
    const tLen = Math.max(1e-6, Math.hypot(rawTx, rawTz));
    const tx = rawTx / tLen;
    const tz = rawTz / tLen;
    const nx = tz;
    const nz = -tx;

    transforms.push({
      x: sx + nx * lateralOffset,
      y: sy,
      z: sz + nz * lateralOffset,
      heading: Math.atan2(tx, tz),
      gridPosition: i + 1,
    });
  }

  return transforms;
}

export const GRID_WAIT_AFTER_QUALI_SECONDS = 10.0;

export function createInitialRaceState(totalLaps = RACE_TOTAL_LAPS, options = {}) {
  const skipCountdown = Boolean(options.skipCountdown);
  const gridWaitSeconds = !skipCountdown ? Math.max(0, Number(options.gridWaitSeconds) || 0) : 0;
  const initialStatus = skipCountdown
    ? 'racing'
    : gridWaitSeconds > 0
      ? 'grid_wait'
      : 'countdown';
  return {
    mode: options.mode ?? 'race', // 'practice' | 'race' | 'qualifying'
    totalLaps,                    // null = giri indeterminati (infiniti)
    status: initialStatus,        // 'grid_wait' | 'countdown' | 'racing' | 'finished'
    gridWaitTimer: gridWaitSeconds,
    countdownTimer: skipCountdown ? 0 : 4.2,
    lightsOn: 0,
    lightsOutFlashTimer: 0,
    raceStartElapsed: 0,
    winnerCarId: null,
    standings: [],
  };
}

function getEffectiveTotalProgress(car) {
  const t = car.timing;
  if (!t) return 0;
  // Gestisce le vetture schierate dietro la linea del traguardo prima dell'inizio del Giro 1
  let prog = t.rawLapProgress ?? t.lapProgress ?? 0;
  if (t.completedLaps === 0 && t.highestSectorReached === 0 && prog > 0.85) {
    prog -= 1.0;
  }
  return t.completedLaps + prog;
}

/**
 * Aggiorna semaforo di partenza, stato gara (10 giri), classifica e distacchi live.
 * @param {import('../core/WorldState.js').WorldState} worldState
 * @param {number} dt
 * @param {string} [localPlayerId='player_1']
 */
export function updateRaceState(worldState, dt, localPlayerId = 'player_1') {
  const race = worldState.raceState;
  const trackSurface = worldState.trackSurface;
  if (!race || !trackSurface || race.mode === 'qualifying') return;

  // 0. Attesa pre-semafori in griglia (10s dopo le Qualifiche Q3)
  if (race.status === 'grid_wait') {
    race.lightsOn = 0;
    race.gridWaitTimer = Math.max(0, (race.gridWaitTimer ?? 0) - dt);
    if (race.gridWaitTimer <= 0) {
      race.status = 'countdown';
      race.countdownTimer = 4.2;
      race.lightsOn = 0;
    }
  } else if (race.status === 'countdown') {
    // 1. Semaforo di partenza a 5 luci rosse
    race.countdownTimer = Math.max(0, race.countdownTimer - dt);
    if (race.countdownTimer > 3.5) race.lightsOn = 1;
    else if (race.countdownTimer > 2.8) race.lightsOn = 2;
    else if (race.countdownTimer > 2.1) race.lightsOn = 3;
    else if (race.countdownTimer > 1.4) race.lightsOn = 4;
    else if (race.countdownTimer > 0.5) race.lightsOn = 5;
    else if (race.countdownTimer > 0) race.lightsOn = 5;
    else {
      race.lightsOn = 0;
      race.status = 'racing';
      race.lightsOutFlashTimer = 1.6;
      race.raceStartElapsed = worldState.elapsedTime;
    }
  } else if (race.lightsOutFlashTimer > 0) {
    race.lightsOutFlashTimer = Math.max(0, race.lightsOutFlashTimer - dt);
  }

  const cars = Object.values(worldState.cars);
  const totalLen = trackSurface.totalLength;

  // 2. Verifica traguardo finale con applicazione penalità Track Limits
  if (race.totalLaps !== null) {
    for (const car of cars) {
      if (!car.raceFinished && (car.timing?.completedLaps ?? 0) >= race.totalLaps) {
        car.raceFinished = true;
        car.rawFinishTime = worldState.elapsedTime - race.raceStartElapsed;
        car.penaltySeconds = car.timing?.penaltySeconds ?? 0;
        car.finishTime = car.rawFinishTime + car.penaltySeconds;
      }
    }

    // 3. Fine gara quando tutti i piloti umani (1 in solo, N in multiplayer) tagliano il traguardo
    const humanCars = cars.filter((c) => !c.isBot);
    const localCar = worldState.getCar(localPlayerId);
    const allHumansFinished =
      humanCars.length > 0
        ? humanCars.every((c) => c.raceFinished)
        : Boolean(localCar && localCar.raceFinished);
    if (allHumansFinished && race.status === 'racing') {
      race.status = 'finished';
      for (const car of cars) {
        if (!car.raceFinished) {
          const remProg = Math.max(0, race.totalLaps - getEffectiveTotalProgress(car));
          const remDist = remProg * totalLen;
          const estSpeed = Math.max(42.0, Math.abs(car.forwardSpeed) || 60.0);
          car.rawFinishTime =
            worldState.elapsedTime - race.raceStartElapsed + remDist / estSpeed;
          car.penaltySeconds = car.timing?.penaltySeconds ?? 0;
          car.finishTime = car.rawFinishTime + car.penaltySeconds;
          car.raceFinished = true;
        }
      }
    }
  }

  // 4. Calcolo classifica ordinata (a fine gara include le penalità Track Limits)
  const sorted = [...cars].sort((a, b) => {
    if (a.raceFinished && b.raceFinished) {
      return (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity);
    }
    if (a.raceFinished !== b.raceFinished) {
      return a.raceFinished ? -1 : 1;
    }
    return getEffectiveTotalProgress(b) - getEffectiveTotalProgress(a);
  });

  if (race.status === 'finished' && sorted.length > 0) {
    race.winnerCarId = sorted[0].id;
  } else if (!race.winnerCarId && sorted[0]?.raceFinished) {
    race.winnerCarId = sorted[0].id;
  }

  const leader = sorted[0];
  const leaderProgress = leader ? getEffectiveTotalProgress(leader) : 0;

  race.standings = sorted.map((car, idx) => {
    const pos = idx + 1;
    car.racePosition = pos;
    const penaltySec = car.timing?.penaltySeconds ?? car.penaltySeconds ?? 0;
    const tlCount = car.timing?.trackLimitsCount ?? 0;

    let gap = penaltySec > 0 ? `LEADER (+${penaltySec}s)` : 'LEADER';
    if (idx > 0 && leader) {
      if (car.raceFinished && leader.raceFinished) {
        gap = `+${Math.max(0, car.finishTime - leader.finishTime).toFixed(3)}s`;
        if (penaltySec > 0) gap += ` (+${penaltySec}s)`;
      } else {
        const progDiff = Math.max(0, leaderProgress - getEffectiveTotalProgress(car));
        if (progDiff >= 1.0) {
          const lapsBehind = Math.floor(progDiff);
          gap = `+${lapsBehind} ${lapsBehind === 1 ? 'GIRO' : 'GIRI'}`;
        } else {
          const distGap = progDiff * totalLen;
          const refSpeed = Math.max(
            42.0,
            Math.abs(leader.forwardSpeed) * 0.6 + Math.abs(car.forwardSpeed) * 0.4
          );
          gap = `+${(distGap / refSpeed).toFixed(1)}s`;
        }
        if (penaltySec > 0) gap += ` +${penaltySec}s`;
      }
    }
    car.gapToLeader = gap;

    return {
      id: car.id,
      driverId: car.driverId ?? car.id,
      position: pos,
      code: car.code,
      driverName: car.driverName,
      driverNumber: car.driverNumber,
      teamId: car.teamId,
      teamName: car.teamName,
      color: car.color,
      isBot: car.isBot,
      completedLaps: car.timing?.completedLaps ?? 0,
      bestLapTime: car.timing?.bestLapTime ?? null,
      gapToLeader: gap,
      raceFinished: car.raceFinished,
      rawFinishTime: car.rawFinishTime ?? null,
      finishTime: car.finishTime,
      trackLimitsCount: tlCount,
      penaltySeconds: penaltySec,
      currentLapInvalidated: Boolean(car.timing?.currentLapInvalidated),
    };
  });
}
