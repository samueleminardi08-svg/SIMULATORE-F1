/**
 * Gestore Qualifiche F1 a 3 fasi: Q1 (4:00), Q2 (3:30), Q3 (2:30) = 10 minuti totali (Step 8).
 * Puro JavaScript serializzabile in WorldState: gestisce tagli (Top 16, Top 10, Pole),
 * stato voto per lo skip (pronto per Step 10 multiplayer) e griglia finale 1-22 per la gara.
 */

import { F1_2026_DRIVERS, F1_2026_TEAMS } from '../config/f1_2026_data.js';
import { getDifficultyConfig } from '../config/difficulty.js';
import { formatLapTime } from './TimingSystem.js';

export const QUALIFYING_STAGES = {
  Q1: {
    id: 'Q1',
    label: 'Qualifica 1 (Q1)',
    shortLabel: 'Q1',
    duration: 240, // 4:00
    activeCount: 22,
    advanceCount: 16,
    eliminatedCount: 6,
  },
  Q2: {
    id: 'Q2',
    label: 'Qualifica 2 (Q2)',
    shortLabel: 'Q2',
    duration: 210, // 3:30
    activeCount: 16,
    advanceCount: 10,
    eliminatedCount: 6,
  },
  Q3: {
    id: 'Q3',
    label: 'Qualifica 3 (Q3)',
    shortLabel: 'Q3',
    duration: 150, // 2:30 -> Totale Q1+Q2+Q3 = 600s (10 minuti)
    activeCount: 10,
    advanceCount: 10,
    eliminatedCount: 0,
  },
};

export const QUALIFYING_STAGE_IDS = ['Q1', 'Q2', 'Q3'];
export const STAGE_AUTO_ADVANCE_SECONDS = 10.0;

export function resolveQualifyingStageDurations(stageDurations = null) {
  const custom = stageDurations && typeof stageDurations === 'object' ? stageDurations : {};
  const resolveStage = (id) => {
    const fallback = QUALIFYING_STAGES[id].duration;
    const raw = Number(custom[id]);
    return Number.isFinite(raw) && raw >= 10 ? Math.round(raw) : fallback;
  };
  return {
    Q1: resolveStage('Q1'),
    Q2: resolveStage('Q2'),
    Q3: resolveStage('Q3'),
  };
}

export function getQualifyingStageDuration(qualifyingState, stageId = 'Q1') {
  const fallback = QUALIFYING_STAGES[stageId]?.duration ?? QUALIFYING_STAGES.Q1.duration;
  const raw = Number(qualifyingState?.stageDurations?.[stageId]);
  return Number.isFinite(raw) && raw >= 10 ? Math.round(raw) : fallback;
}

function hashDriverStage(driverId, stageIndex) {
  const str = `${driverId}_${stageIndex}`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export function createInitialQualifyingState(
  allDriverIds,
  playerDriverId,
  requiredPlayerIds = ['player_1'],
  humanDriverIds = null,
  stageDurations = null
) {
  const stage = QUALIFYING_STAGES.Q1;
  const resolvedDurations = stageDurations ? resolveQualifyingStageDurations(stageDurations) : null;
  const q1Duration = resolvedDurations ? resolvedDurations.Q1 : stage.duration;
  return {
    stageIndex: 0,
    stageId: stage.id,
    stageLabel: stage.label,
    status: 'running', // 'running' | 'chequered_flag' | 'in_lap' | 'stage_complete' | 'qualifying_complete'
    timeRemaining: q1Duration,
    stageDuration: q1Duration,
    stageDurations: resolvedDurations,
    elapsedInStage: 0,
    autoAdvanceTimer: 0,
    activeDriverIds: [...allDriverIds],
    nextActiveDriverIds: [],
    eliminatedAfterQ1: [],
    eliminatedAfterQ2: [],
    top10Results: [],
    standings: [],
    finalGrid: [],
    playerDriverId,
    humanDriverIds: Array.isArray(humanDriverIds) && humanDriverIds.length > 0
      ? [...humanDriverIds]
      : [playerDriverId],
    playerEliminated: false,
    allHumansEliminated: false,
    playerEliminatedInStage: null,
    skipVotes: {
      requiredPlayers: [...requiredPlayerIds],
      approvedBy: [],
      requestedAction: null,
    },
  };
}

export function canSkipQualifying(qualifyingState) {
  if (!qualifyingState?.skipVotes) return false;
  const req = qualifyingState.skipVotes.requiredPlayers || [];
  const approved = qualifyingState.skipVotes.approvedBy || [];
  return req.length > 0 && req.every((id) => approved.includes(id));
}

export function voteSkipQualifying(qualifyingState, playerId = 'player_1') {
  if (!qualifyingState?.skipVotes) return false;
  if (!qualifyingState.skipVotes.approvedBy.includes(playerId)) {
    qualifyingState.skipVotes.approvedBy.push(playerId);
  }
  return canSkipQualifying(qualifyingState);
}

/**
 * Stima un tempo sul giro realistico per bot (o giocatore in caso di skip anticipato).
 */
export function computeSimulatedQualifyingLap(driverId, car, worldState, stageIndex) {
  const driver = F1_2026_DRIVERS.find((d) => d.id === driverId);
  const team = driver ? F1_2026_TEAMS[driver.teamId] : null;
  const rawPerf = car?.skillFactor ?? ((driver?.skill ?? 0.94) * (team?.pace ?? 0.96));

  const diff = getDifficultyConfig(worldState.physicsSettings || worldState.difficultyId);
  const botPace = diff.botPaceMultiplier;
  const isRain = worldState.weather === 'rain' && diff.rainPhysicsEnabled !== false;

  const sectorSum = worldState.sessionTiming?.overallBestSectors?.reduce((s, v) => s + v, 0);
  const baseRefLap = Number.isFinite(sectorSum) && sectorSum > 65 ? Math.min(108, Math.max(68, sectorSum)) : 81.2;

  const stageFactor = stageIndex === 0 ? 1.006 : stageIndex === 1 ? 1.001 : 0.996;
  const perfSpread = (0.98 - rawPerf) * 28.0; // ~0.1s..3.2s tra top team e fondo griglia
  const jitter = (hashDriverStage(driverId, stageIndex) - 0.5) * 0.44;
  const weatherFactor = isRain ? 1.125 : 1.0;
  const difficultyPace = 1.0 / Math.max(0.75, botPace);

  return Math.max(
    72.0,
    (baseRefLap * stageFactor + perfSpread + jitter) * weatherFactor * difficultyPace
  );
}

function buildQualifyingStandings(worldState, qualifyingState) {
  const stage = QUALIFYING_STAGES[qualifyingState.stageId] || QUALIFYING_STAGES.Q1;
  const carsByDriverId = new Map();
  for (const car of Object.values(worldState.cars)) {
    carsByDriverId.set(car.driverId ?? car.id, car);
  }

  const entries = qualifyingState.activeDriverIds.map((driverId) => {
    const car = carsByDriverId.get(driverId) || null;
    const driver = F1_2026_DRIVERS.find((d) => d.id === driverId);
    const team = driver ? F1_2026_TEAMS[driver.teamId] : null;
    const bestLapTime = car?.timing?.bestLapTime ?? null;
    const perf = car?.skillFactor ?? ((driver?.skill ?? 0.94) * (team?.pace ?? 0.96));

    const isPlayerDriver = driverId === qualifyingState.playerDriverId;
    const customName = isPlayerDriver ? worldState.sessionConfig?.playerCustomName : null;
    const customCode = isPlayerDriver ? worldState.sessionConfig?.playerCustomCode : null;

    return {
      car,
      id: car?.id ?? `bot_${driverId}`,
      driverId,
      code:
        car?.code ??
        (isPlayerDriver && customCode ? `${customCode}*` : driver?.code ?? driverId.slice(0, 3).toUpperCase()),
      driverName: car?.driverName ?? customName ?? driver?.name ?? driverId,
      driverNumber: car?.driverNumber ?? driver?.number ?? 1,
      teamId: car?.teamId ?? driver?.teamId ?? 'ferrari',
      teamName: car?.teamName ?? team?.name ?? 'F1 Team',
      color: car?.color ?? team?.primaryColor ?? '#38bdf8',
      isBot: car ? Boolean(car.isBot) : driverId !== qualifyingState.playerDriverId,
      bestLapTime,
      completedLaps: car?.timing?.completedLaps ?? 0,
      trackLimitsCount: car?.timing?.trackLimitsCount ?? 0,
      currentLapInvalidated: Boolean(car?.timing?.currentLapInvalidated),
      perf,
    };
  });

  entries.sort((a, b) => {
    const hasA = a.bestLapTime !== null;
    const hasB = b.bestLapTime !== null;
    if (hasA && hasB) return a.bestLapTime - b.bestLapTime;
    if (hasA !== hasB) return hasA ? -1 : 1;
    return b.perf - a.perf;
  });

  const leaderBest = entries[0]?.bestLapTime ?? null;

  return entries.map((entry, idx) => {
    const pos = idx + 1;
    const ps = entry.car?.pitState || null;
    let gapToLeader = 'IN PISTA';
    if (entry.bestLapTime !== null) {
      gapToLeader =
        idx === 0 || leaderBest === null
          ? formatLapTime(entry.bestLapTime)
          : `+${(entry.bestLapTime - leaderBest).toFixed(3)}s`;
    } else if (ps === 'IN_GARAGE' || ps === 'PARKED_STAGE_END') {
      gapToLeader = 'AI BOX';
    } else if (ps === 'EXITING_GARAGE' || ps === 'PIT_EXIT_LANE') {
      gapToLeader = 'OUT LAP';
    } else if (ps === 'IN_LAP' || ps === 'PIT_ENTRY_LANE' || ps === 'AUTO_PARKING') {
      gapToLeader = 'IN LAP';
    } else if (entry.currentLapInvalidated) {
      gapToLeader = 'GIRO ANN.';
    }

    if (entry.car) {
      entry.car.racePosition = pos;
      entry.car.gapToLeader = gapToLeader;
    }

    return {
      id: entry.id,
      driverId: entry.driverId,
      position: pos,
      code: entry.code,
      driverName: entry.driverName,
      driverNumber: entry.driverNumber,
      teamId: entry.teamId,
      teamName: entry.teamName,
      color: entry.color,
      isBot: entry.isBot,
      bestLapTime: entry.bestLapTime,
      completedLaps: entry.completedLaps,
      trackLimitsCount: entry.trackLimitsCount,
      penaltySeconds: 0,
      currentLapInvalidated: entry.currentLapInvalidated,
      gapToLeader,
      inEliminationZone: stage.advanceCount < stage.activeCount && pos > stage.advanceCount,
      stageEliminated: qualifyingState.stageId,
    };
  });
}

function isCarParkedInBox(car) {
  return (
    !car ||
    car.pitState === 'IN_GARAGE' ||
    car.pitState === 'PARKED_STAGE_END'
  );
}

/**
 * Aggiorna il cronometro Q1/Q2/Q3, regola F1 reale a 0:00 (completamento giro lanciato ->
 * giro di rientro guidato -> parcheggio automatico nel box) e countdown 10s classifica.
 */
export function updateQualifyingState(worldState, dt, localPlayerId = 'player_1') {
  const q = worldState.qualifyingState;
  if (!q) return { autoAdvanceTriggered: false };

  // 1. Classifica fine Q1 / Q2 / Q3: countdown automatico 10s -> fase successiva / griglia gara
  if (q.status === 'stage_complete' || q.status === 'qualifying_complete') {
    q.autoAdvanceTimer = Math.max(0, (q.autoAdvanceTimer ?? STAGE_AUTO_ADVANCE_SECONDS) - dt);
    return { autoAdvanceTriggered: q.autoAdvanceTimer <= 0 };
  }

  q.elapsedInStage += dt;

  // Popolamento progressivo dei tempi bot mentre girano in pista
  if (q.status === 'running' || q.status === 'chequered_flag') {
    for (const car of Object.values(worldState.cars)) {
      if (!car.isBot || !car.timing) continue;
      const releaseT = car.plannedReleaseTime ?? 0;
      const appearDelay = Math.max(35, releaseT + 42) + (car.gridPosition ?? 1) * 0.9;
      if (q.elapsedInStage >= appearDelay && car.timing.bestLapTime === null) {
        const simLap = computeSimulatedQualifyingLap(
          car.driverId ?? car.id,
          car,
          worldState,
          q.stageIndex
        );
        car.timing.bestLapTime = simLap;
        if (
          worldState.sessionTiming &&
          (worldState.sessionTiming.overallBestLapTime === null ||
            simLap < worldState.sessionTiming.overallBestLapTime)
        ) {
          worldState.sessionTiming.overallBestLapTime = simLap;
          worldState.sessionTiming.overallBestCarId = car.id;
        }
      }
    }
  }

  if (q.status === 'running') {
    q.timeRemaining = Math.max(0, q.timeRemaining - dt);
  }

  q.standings = buildQualifyingStandings(worldState, q);
  if (worldState.raceState) {
    worldState.raceState.standings = q.standings;
  }

  const humanCars = Object.values(worldState.cars).filter((c) => !c.isBot);

  // 2. Scadenza cronometro 0:00 -> regola F1 reale
  if (q.status === 'running' && q.timeRemaining <= 0) {
    if (humanCars.length === 0 || humanCars.every((c) => isCarParkedInBox(c))) {
      finalizeQualifyingStage(worldState, localPlayerId, { simulatePlayerIfMissing: false });
      return { autoAdvanceTriggered: false };
    }

    let anyOnFlyingLap = false;
    for (const hCar of humanCars) {
      if (isCarParkedInBox(hCar) || hCar.pitState === 'AUTO_PARKING') {
        hCar.chequeredLapDone = true;
      } else if (
        hCar.pitState === 'PIT_ENTRY_LANE' ||
        hCar.pitState === 'IN_LAP' ||
        hCar.pitState === 'AUTO_BOX_STOP' ||
        hCar.pitState === 'IN_PIT_BOX' ||
        (hCar.surface === 'pitlane' && hCar.pitState !== 'ON_TRACK')
      ) {
        hCar.chequeredLapDone = true;
        if (hCar.pitState !== 'AUTO_PARKING') {
          hCar.pitState = 'PIT_ENTRY_LANE';
        }
      } else {
        // Vettura umana in pista: può completare il giro lanciato in corso
        anyOnFlyingLap = true;
        hCar.chequeredStartLapSeq = hCar.timing?.lapCompletionSeq ?? 0;
        hCar.chequeredLapDone = false;
      }
    }

    if (anyOnFlyingLap) {
      q.status = 'chequered_flag';
      worldState.pitGuideActive = false;
    } else {
      q.status = 'in_lap';
      worldState.pitGuideActive = true;
    }
    return { autoAdvanceTriggered: false };
  }

  // 3. Bandiera a scacchi: attesa completamento giro lanciato dei piloti umani in pista
  if (q.status === 'chequered_flag') {
    for (const hCar of humanCars) {
      if (hCar.chequeredLapDone) continue;
      const curSeq = hCar.timing?.lapCompletionSeq ?? 0;
      if (curSeq > (hCar.chequeredStartLapSeq ?? 0)) {
        hCar.chequeredLapDone = true;
        hCar.pitState = 'IN_LAP';
      } else if (
        isCarParkedInBox(hCar) ||
        hCar.pitState === 'AUTO_PARKING' ||
        hCar.surface === 'pitlane'
      ) {
        hCar.chequeredLapDone = true;
        if (!isCarParkedInBox(hCar) && hCar.pitState !== 'AUTO_PARKING') {
          hCar.pitState = 'PIT_ENTRY_LANE';
        }
      }
    }

    if (humanCars.every((c) => c.chequeredLapDone || isCarParkedInBox(c))) {
      if (humanCars.every((c) => isCarParkedInBox(c))) {
        worldState.pitGuideActive = false;
        finalizeQualifyingStage(worldState, localPlayerId, { simulatePlayerIfMissing: false });
      } else {
        q.status = 'in_lap';
        worldState.pitGuideActive = true;
      }
    }
    return { autoAdvanceTriggered: false };
  }

  // 4. Giro di rientro guidato fino al parcheggio automatico nel box (PARKED_STAGE_END)
  if (q.status === 'in_lap') {
    worldState.pitGuideActive = true;
    if (humanCars.length === 0 || humanCars.every((c) => isCarParkedInBox(c))) {
      worldState.pitGuideActive = false;
      finalizeQualifyingStage(worldState, localPlayerId, { simulatePlayerIfMissing: false });
    }
    return { autoAdvanceTriggered: false };
  }

  return { autoAdvanceTriggered: false };
}

/**
 * Chiude la fase corrente (Q1, Q2 o Q3), calcola gli eliminati e avvia il countdown 10s della classifica.
 */
export function finalizeQualifyingStage(
  worldState,
  _localPlayerId = 'player_1',
  options = { simulatePlayerIfMissing: false }
) {
  const q = worldState.qualifyingState;
  if (!q || q.status === 'stage_complete' || q.status === 'qualifying_complete') return;

  const simulatePlayerIfMissing = Boolean(options.simulatePlayerIfMissing);
  worldState.pitGuideActive = false;

  for (const car of Object.values(worldState.cars)) {
    if (!car.timing) continue;
    if ((car.isBot || simulatePlayerIfMissing) && car.timing.bestLapTime === null) {
      const simLap = computeSimulatedQualifyingLap(
        car.driverId ?? car.id,
        car,
        worldState,
        q.stageIndex
      );
      car.timing.bestLapTime = simLap;
      if (
        worldState.sessionTiming &&
        (worldState.sessionTiming.overallBestLapTime === null ||
          simLap < worldState.sessionTiming.overallBestLapTime)
      ) {
        worldState.sessionTiming.overallBestLapTime = simLap;
        worldState.sessionTiming.overallBestCarId = car.id;
      }
    }
  }

  q.standings = buildQualifyingStandings(worldState, q);
  if (worldState.raceState) {
    worldState.raceState.standings = q.standings;
  }

  q.autoAdvanceTimer = STAGE_AUTO_ADVANCE_SECONDS;

  if (q.stageId === 'Q1') {
    q.eliminatedAfterQ1 = q.standings.slice(16, 22).map((row, idx) => ({
      ...row,
      position: 17 + idx,
      stageEliminated: 'Q1',
    }));
    q.nextActiveDriverIds = q.standings.slice(0, 16).map((row) => row.driverId);
    if (q.eliminatedAfterQ1.some((row) => row.driverId === q.playerDriverId)) {
      q.playerEliminated = true;
      q.playerEliminatedInStage = 'Q1';
    }
    const humanIds = q.humanDriverIds || [q.playerDriverId];
    q.allHumansEliminated = humanIds.every((id) => !q.nextActiveDriverIds.includes(id));
    q.status = 'stage_complete';
  } else if (q.stageId === 'Q2') {
    q.eliminatedAfterQ2 = q.standings.slice(10, 16).map((row, idx) => ({
      ...row,
      position: 11 + idx,
      stageEliminated: 'Q2',
    }));
    q.nextActiveDriverIds = q.standings.slice(0, 10).map((row) => row.driverId);
    if (q.eliminatedAfterQ2.some((row) => row.driverId === q.playerDriverId)) {
      q.playerEliminated = true;
      q.playerEliminatedInStage = 'Q2';
    }
    const humanIds = q.humanDriverIds || [q.playerDriverId];
    q.allHumansEliminated = humanIds.every((id) => !q.nextActiveDriverIds.includes(id));
    q.status = 'stage_complete';
  } else {
    q.top10Results = q.standings.slice(0, 10).map((row, idx) => ({
      ...row,
      position: idx + 1,
      stageEliminated: 'Q3',
    }));
    q.finalGrid = [...q.top10Results, ...q.eliminatedAfterQ2, ...q.eliminatedAfterQ1].map(
      (row, idx) => ({
        ...row,
        position: idx + 1,
      })
    );
    q.status = 'qualifying_complete';
  }
}
