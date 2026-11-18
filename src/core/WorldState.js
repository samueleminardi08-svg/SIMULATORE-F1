/**
 * Stato del mondo di gioco (Simulation Layer).
 * Contiene solo dati puri serializzabili (nessun oggetto Three.js o DOM),
 * così da poter essere sincronizzato via rete nello Step 10.
 */

import { CAR_PHYSICS_CONFIG, LOCAL_PLAYER_ID } from '../config/constants.js';
import { DEFAULT_DIFFICULTY_ID } from '../config/difficulty.js';
import {
  F1_2026_DRIVERS,
  F1_2026_TEAMS,
  RACE_TOTAL_LAPS,
} from '../config/f1_2026_data.js';
import { getCarSpecsForLevel } from '../cars/CarSpecs.js';
import { createInitialCarState, stepCarPhysics } from '../physics/CarPhysics.js';
import {
  resolveCarToCarCollisions,
  resolveTrackBarrierCollision,
} from '../physics/Collisions.js';
import { createTrackSurface } from '../tracks/TrackSurface.js';
import { DEFAULT_TRACK_ID, getTrackById } from '../tracks/calendar2026/index.js';
import { computeBotInput } from '../ai/BotController.js';
import {
  createSessionTimingState,
  createCarTimingState,
  updateCarTiming,
} from '../race/TimingSystem.js';
import {
  computeStartingGridTransforms,
  createInitialRaceState,
  updateRaceState,
} from '../race/RaceManager.js';
import {
  QUALIFYING_STAGE_IDS,
  QUALIFYING_STAGES,
  canSkipQualifying,
  createInitialQualifyingState,
  finalizeQualifyingStage,
  updateQualifyingState,
  voteSkipQualifying,
} from '../race/QualifyingManager.js';

function cloneCarTiming(timing) {
  if (!timing) return null;
  return {
    ...timing,
    currentSectorStatuses: [...timing.currentSectorStatuses],
    currentSectorTimes: [...timing.currentSectorTimes],
    lastLapSectorStatuses: timing.lastLapSectorStatuses
      ? [...timing.lastLapSectorStatuses]
      : null,
    lastLapSectorTimes: timing.lastLapSectorTimes
      ? [...timing.lastLapSectorTimes]
      : null,
    currentLapSplits: [...timing.currentLapSplits],
    personalBestSectors: [...timing.personalBestSectors],
    bestLapSplitTimes: [...timing.bestLapSplitTimes],
  };
}

function cloneSessionTiming(sessionTiming) {
  if (!sessionTiming) return null;
  return {
    ...sessionTiming,
    sectorSplits: [...sessionTiming.sectorSplits],
    overallBestSectors: [...sessionTiming.overallBestSectors],
  };
}

function cloneQualifyingState(qualifyingState) {
  if (!qualifyingState) return null;
  return {
    ...qualifyingState,
    activeDriverIds: [...(qualifyingState.activeDriverIds || [])],
    nextActiveDriverIds: [...(qualifyingState.nextActiveDriverIds || [])],
    humanDriverIds: [...(qualifyingState.humanDriverIds || [])],
    eliminatedAfterQ1: (qualifyingState.eliminatedAfterQ1 || []).map((r) => ({ ...r })),
    eliminatedAfterQ2: (qualifyingState.eliminatedAfterQ2 || []).map((r) => ({ ...r })),
    top10Results: (qualifyingState.top10Results || []).map((r) => ({ ...r })),
    standings: (qualifyingState.standings || []).map((r) => ({ ...r })),
    finalGrid: (qualifyingState.finalGrid || []).map((r) => ({ ...r })),
    skipVotes: qualifyingState.skipVotes
      ? {
          requiredPlayers: [...(qualifyingState.skipVotes.requiredPlayers || [])],
          approvedBy: [...(qualifyingState.skipVotes.approvedBy || [])],
          requestedAction: qualifyingState.skipVotes.requestedAction || null,
        }
      : null,
  };
}

export class WorldState {
  constructor(trackData = null) {
    this.tick = 0;
    this.elapsedTime = 0;
    this.weather = 'dry'; // 'dry' | 'rain'
    this.difficultyId = 'realistic';
    this.sessionConfig = null;
    this.trackData = trackData;
    this.trackSurface = trackData ? createTrackSurface(trackData) : null;
    this.sessionTiming = this.trackSurface
      ? createSessionTimingState(this.trackSurface, trackData?.startTransform)
      : null;
    this.raceState = null;
    this.qualifyingState = null;
    this.careerRewardGranted = false;
    this.lastCareerReward = null;
    /** @type {Record<string, ReturnType<typeof createInitialCarState>>} */
    this.cars = {};
  }

  setWeather(weatherId) {
    this.weather = weatherId === 'rain' ? 'rain' : 'dry';
    return this.weather;
  }

  toggleWeather() {
    this.weather = this.weather === 'dry' ? 'rain' : 'dry';
    return this.weather;
  }

  /**
   * Aggiorna il tracciato attivo nella simulazione.
   */
  setTrack(trackData) {
    this.trackData = trackData;
    this.trackSurface = trackData ? createTrackSurface(trackData) : null;
    this.sessionTiming = this.trackSurface
      ? createSessionTimingState(this.trackSurface, trackData?.startTransform)
      : null;
  }

  /**
   * Registra una nuova vettura nello stato della simulazione.
   */
  spawnCar(id, startTransform, meta = {}) {
    const carState = createInitialCarState(id, startTransform, meta);
    const finishLine = this.trackData?.startTransform ?? { x: 0, z: 0 };
    carState.timing = this.trackSurface
      ? createCarTimingState(this.trackSurface, startTransform, finishLine)
      : null;
    this.cars[id] = carState;
    return carState;
  }

  /**
   * Avvia una sessione configurata (Prove Libere o Gara 10 Giri) con difficoltà e livello vettura.
   * @param {{
   *   mode?: 'practice' | 'race',
   *   difficultyId?: string,
   *   withBots?: boolean,
   *   lapLimit?: number | null,
   *   carLevel?: 'base' | 'max',
   *   playerDriverId?: string,
   *   playerGridIndex?: number,
   *   weather?: 'dry' | 'rain',
   * }} [config]
   * @param {string} [localPlayerId=LOCAL_PLAYER_ID]
   */
  startSession(config = {}, localPlayerId = LOCAL_PLAYER_ID) {
    if (config.trackId && config.trackId !== this.trackData?.id) {
      this.setTrack(getTrackById(config.trackId));
    }
    if (!this.trackSurface) return;

    const mode =
      config.mode === 'qualifying'
        ? 'qualifying'
        : config.mode === 'race'
          ? 'race'
          : 'practice';
    const difficultyId = config.difficultyId || DEFAULT_DIFFICULTY_ID;
    const withBots = mode === 'race' || mode === 'qualifying' ? true : Boolean(config.withBots);
    const lapLimit =
      mode === 'race'
        ? RACE_TOTAL_LAPS
        : mode === 'qualifying'
          ? null
          : (config.lapLimit ?? null);
    const carLevel = config.carLevel === 'max' ? 'max' : 'base';
    const playerDriverId = config.playerDriverId || 'leclerc';
    const playerGridIndex = config.playerGridIndex ?? 7;

    if (config.weather) {
      this.setWeather(config.weather);
    }

    const humanPlayers =
      Array.isArray(config.humanPlayers) && config.humanPlayers.length > 0
        ? this._assignHumanDriverSlots(config.humanPlayers)
        : null;
    const requiredPlayerIds = humanPlayers
      ? humanPlayers.map((h) => h.carId)
      : config.requiredPlayerIds || [localPlayerId];

    this.difficultyId = difficultyId;
    this.careerRewardGranted = false;
    this.lastCareerReward = null;
    this.sessionConfig = {
      trackId: this.trackData?.id || DEFAULT_TRACK_ID,
      mode,
      difficultyId,
      withBots,
      lapLimit,
      carLevel,
      playerDriverId: humanPlayers?.[0]?.driverId || playerDriverId,
      playerGridIndex,
      requiredPlayerIds,
      humanPlayers,
      isCareer: Boolean(config.isCareer),
      careerTeamId: config.careerTeamId || null,
      playerCustomName: config.playerCustomName || null,
      playerCustomCode: config.playerCustomCode || null,
      playerCustomSpecs: config.playerCustomSpecs ? { ...config.playerCustomSpecs } : null,
      customPrimaryColor: config.customPrimaryColor || null,
      paintRoughness: config.paintRoughness ?? null,
      paintMetalness: config.paintMetalness ?? null,
      qualifiedPole: false,
    };

    if (mode === 'qualifying') {
      this.startQualifying(this.sessionConfig, localPlayerId);
      return;
    }

    this.qualifyingState = null;

    if (withBots) {
      this.spawnFullGrid(playerDriverId, playerGridIndex, localPlayerId, {
        totalLaps: lapLimit,
        skipCountdown: mode === 'practice',
        mode,
        carLevel,
        difficultyId,
      });
      return;
    }

    // Prove Libere in solitaria (1 sola vettura al via, nessuna attesa semaforo)
    this.tick = 0;
    this.elapsedTime = 0;
    this.cars = {};
    this.sessionTiming = createSessionTimingState(
      this.trackSurface,
      this.trackData?.startTransform
    );
    this.raceState = createInitialRaceState(lapLimit, {
      skipCountdown: true,
      mode: 'practice',
    });

    const playerDriver =
      F1_2026_DRIVERS.find((d) => d.id === playerDriverId) || F1_2026_DRIVERS[2];
    const team = F1_2026_TEAMS[playerDriver.teamId];
    const startTransform = this.trackData?.startTransform ?? { x: 0, y: 0, z: 0, heading: 0 };

    const customSpecs = config.playerCustomSpecs ? { ...config.playerCustomSpecs } : null;
    this.spawnCar(localPlayerId, startTransform, {
      driverId: playerDriver.id,
      driverName: config.playerCustomName || playerDriver.name,
      code: `${config.playerCustomCode || playerDriver.code}*`,
      driverNumber: playerDriver.number,
      teamId: playerDriver.teamId,
      teamName: team?.name ?? 'F1 Team',
      color: config.customPrimaryColor || team?.primaryColor || '#dc0000',
      secondaryColor: team?.secondaryColor ?? '#111318',
      wingColor: team?.wingColor ?? '#f8fafc',
      helmetColor: playerDriver.helmetColor,
      paintRoughness: config.paintRoughness ?? 0.25,
      paintMetalness: config.paintMetalness ?? 0.35,
      isBot: false,
      carLevel: customSpecs ? customSpecs.id : carLevel,
      carSpecs: customSpecs || getCarSpecsForLevel(carLevel),
      gridPosition: 1,
    });

    updateRaceState(this, 0, localPlayerId);
  }

  /**
   * Inizializza una sessione con tutta la griglia reale F1 2026 (22 vetture).
   * @param {string} [playerDriverId='leclerc']
   * @param {number} [playerGridIndex=7] - 0 = Pole Position (P1), 7 = P8
   * @param {string} [localPlayerId=LOCAL_PLAYER_ID]
   * @param {{ totalLaps?: number | null, skipCountdown?: boolean, mode?: string, carLevel?: string, difficultyId?: string }} [options]
   */
  spawnFullGrid(
    playerDriverId = 'leclerc',
    playerGridIndex = 7,
    localPlayerId = LOCAL_PLAYER_ID,
    options = {}
  ) {
    if (!this.trackSurface) return;

    const totalLaps = options.totalLaps !== undefined ? options.totalLaps : RACE_TOTAL_LAPS;
    const skipCountdown = Boolean(options.skipCountdown);
    const mode = options.mode ?? 'race';
    const carLevel = options.carLevel ?? 'base';
    if (options.difficultyId) {
      this.difficultyId = options.difficultyId;
    }

    this.tick = 0;
    this.elapsedTime = 0;
    this.cars = {};
    this.sessionTiming = createSessionTimingState(
      this.trackSurface,
      this.trackData?.startTransform
    );
    this.raceState = createInitialRaceState(totalLaps, { skipCountdown, mode });

    const humanPlayersRaw = options.humanPlayers || this.sessionConfig?.humanPlayers || null;
    const humanPlayers =
      Array.isArray(humanPlayersRaw) && humanPlayersRaw.length > 0
        ? this._assignHumanDriverSlots(humanPlayersRaw)
        : null;
    const humansByDriverId = new Map();
    if (humanPlayers) {
      for (const h of humanPlayers) {
        humansByDriverId.set(h.driverId, h);
      }
    }

    const playerDriver =
      F1_2026_DRIVERS.find((d) => d.id === playerDriverId) || F1_2026_DRIVERS[2];

    const orderedDrivers =
      Array.isArray(options.orderedDriverIds) && options.orderedDriverIds.length > 0
        ? options.orderedDriverIds
            .map((id) => F1_2026_DRIVERS.find((d) => d.id === id))
            .filter(Boolean)
        : null;

    const gridCount = orderedDrivers ? orderedDrivers.length : F1_2026_DRIVERS.length;
    const gridSlots = computeStartingGridTransforms(
      this.trackSurface,
      gridCount,
      this.trackData?.startTransform,
      { spacingMeters: options.gridSpacingMeters ?? 7.8 }
    );

    const safePlayerSlot = Math.max(0, Math.min(gridSlots.length - 1, playerGridIndex));
    let unplacedDrivers = null;

    if (!orderedDrivers) {
      if (humanPlayers && humanPlayers.length > 0) {
        const botList = F1_2026_DRIVERS.filter((d) => !humansByDriverId.has(d.id)).sort((a, b) => {
          const paceA = a.skill * (F1_2026_TEAMS[a.teamId]?.pace ?? 0.97);
          const paceB = b.skill * (F1_2026_TEAMS[b.teamId]?.pace ?? 0.97);
          return paceB - paceA;
        });
        const humanStart = Math.max(0, Math.min(gridCount - humanPlayers.length, safePlayerSlot));
        unplacedDrivers = new Array(gridCount);
        humanPlayers.forEach((h, idx) => {
          unplacedDrivers[humanStart + idx] =
            F1_2026_DRIVERS.find((d) => d.id === h.driverId) || F1_2026_DRIVERS[idx];
        });
        let bCursor = 0;
        for (let i = 0; i < gridCount; i++) {
          if (!unplacedDrivers[i]) {
            unplacedDrivers[i] = botList[bCursor++];
          }
        }
      } else {
        const botDrivers = F1_2026_DRIVERS.filter((d) => d.id !== playerDriver.id).sort((a, b) => {
          const paceA = a.skill * (F1_2026_TEAMS[a.teamId]?.pace ?? 0.97);
          const paceB = b.skill * (F1_2026_TEAMS[b.teamId]?.pace ?? 0.97);
          return paceB - paceA;
        });
        let bCursor = 0;
        unplacedDrivers = Array.from({ length: gridCount }, (_, i) =>
          i === safePlayerSlot ? playerDriver : botDrivers[bCursor++]
        );
      }
    }

    for (let slotIdx = 0; slotIdx < gridSlots.length; slotIdx++) {
      const slot = gridSlots[slotIdx];
      const driver = orderedDrivers ? orderedDrivers[slotIdx] : unplacedDrivers[slotIdx];
      const humanEntry = humansByDriverId.get(driver.id) || null;
      const isPlayerSlot = humanEntry
        ? true
        : orderedDrivers
          ? driver.id === playerDriver.id
          : slotIdx === safePlayerSlot;
      const effectiveTeamId = humanEntry?.teamId || driver.teamId;
      const team = F1_2026_TEAMS[effectiveTeamId] || F1_2026_TEAMS[driver.teamId];
      const carId = humanEntry ? humanEntry.carId : isPlayerSlot ? localPlayerId : `bot_${driver.id}`;

      const performance = driver.skill * (team?.pace ?? 0.97);
      const activeLevel = isPlayerSlot ? carLevel : 'base';
      const customSpecs = humanEntry?.carSpecs
        ? humanEntry.carSpecs
        : isPlayerSlot
          ? options.playerCustomSpecs || this.sessionConfig?.playerCustomSpecs || null
          : null;
      const customName = humanEntry?.playerName
        ? humanEntry.playerName
        : isPlayerSlot
          ? options.playerCustomName || this.sessionConfig?.playerCustomName || null
          : null;
      const customCode = humanEntry?.playerCode
        ? humanEntry.playerCode
        : isPlayerSlot
          ? options.playerCustomCode || this.sessionConfig?.playerCustomCode || null
          : null;
      const customPrimaryColor = humanEntry?.customPrimaryColor
        ? humanEntry.customPrimaryColor
        : isPlayerSlot
          ? options.customPrimaryColor || this.sessionConfig?.customPrimaryColor || null
          : null;
      const customRoughness =
        humanEntry?.paintRoughness !== undefined
          ? humanEntry.paintRoughness
          : isPlayerSlot
            ? options.paintRoughness ?? this.sessionConfig?.paintRoughness ?? 0.25
            : 0.25;
      const customMetalness =
        humanEntry?.paintMetalness !== undefined
          ? humanEntry.paintMetalness
          : isPlayerSlot
            ? options.paintMetalness ?? this.sessionConfig?.paintMetalness ?? 0.35
            : 0.35;
      const effectiveLevel = customSpecs ? customSpecs.id : activeLevel;
      const effectiveSpecs = customSpecs
        ? { ...customSpecs }
        : getCarSpecsForLevel(activeLevel);

      this.spawnCar(carId, slot, {
        driverId: driver.id,
        driverName: customName || driver.name,
        code: isPlayerSlot ? `${customCode || driver.code}*` : driver.code,
        driverNumber: driver.number,
        teamId: effectiveTeamId,
        teamName: team?.name ?? 'F1 Team',
        color: customPrimaryColor || team?.primaryColor || '#dc0000',
        secondaryColor: team?.secondaryColor ?? '#111318',
        wingColor: team?.wingColor ?? '#f8fafc',
        helmetColor: driver.helmetColor,
        paintRoughness: customRoughness,
        paintMetalness: customMetalness,
        isBot: !isPlayerSlot,
        carLevel: effectiveLevel,
        carSpecs: effectiveSpecs,
        skillFactor: performance,
        maxSpeedMultiplier: isPlayerSlot ? 1.0 : 0.955 + performance * 0.048,
        accelMultiplier: isPlayerSlot ? 1.0 : 0.94 + performance * 0.06,
        gridPosition: slot.gridPosition,
      });
    }

    if (mode !== 'qualifying') {
      updateRaceState(this, 0, localPlayerId);
    }
  }

  _assignHumanDriverSlots(humanPlayers = []) {
    const used = new Set();
    return humanPlayers.map((h) => {
      let chosen = h.driverId;
      if (!chosen || used.has(chosen) || !F1_2026_DRIVERS.some((d) => d.id === chosen)) {
        const teamDrivers = F1_2026_DRIVERS.filter(
          (d) => d.teamId === h.teamId && !used.has(d.id)
        );
        const pickFromTeam = teamDrivers[1] || teamDrivers[0];
        const fallback = F1_2026_DRIVERS.find((d) => !used.has(d.id)) || F1_2026_DRIVERS[0];
        chosen = (pickFromTeam || fallback).id;
      }
      used.add(chosen);
      return { ...h, driverId: chosen };
    });
  }

  /**
   * Avvia un weekend di Qualifiche (Q1 4:00, Q2 3:30, Q3 2:30 = 10 minuti totali).
   */
  startQualifying(config = {}, localPlayerId = LOCAL_PLAYER_ID) {
    if (!this.trackSurface) return;

    const humanPlayers = config.humanPlayers || null;
    const playerDriverId = humanPlayers?.[0]?.driverId || config.playerDriverId || 'leclerc';
    const sortedByPace = [...F1_2026_DRIVERS].sort((a, b) => {
      const pA = a.skill * (F1_2026_TEAMS[a.teamId]?.pace ?? 0.97);
      const pB = b.skill * (F1_2026_TEAMS[b.teamId]?.pace ?? 0.97);
      return pB - pA;
    });
    const allDriverIds = sortedByPace.map((d) => d.id);
    const requiredPlayers = humanPlayers
      ? humanPlayers.map((h) => h.carId)
      : config.requiredPlayerIds || [localPlayerId];
    const humanDriverIds = humanPlayers
      ? humanPlayers.map((h) => h.driverId)
      : [playerDriverId];

    this.qualifyingState = createInitialQualifyingState(
      allDriverIds,
      playerDriverId,
      requiredPlayers,
      humanDriverIds
    );
    this._spawnQualifyingStageCars(allDriverIds, localPlayerId);
  }

  _spawnQualifyingStageCars(driverIds, localPlayerId = LOCAL_PLAYER_ID) {
    const cfg = this.sessionConfig || {};
    this.spawnFullGrid(cfg.playerDriverId || 'leclerc', 0, localPlayerId, {
      totalLaps: null,
      skipCountdown: true,
      mode: 'qualifying',
      carLevel: cfg.carLevel || 'base',
      difficultyId: cfg.difficultyId || this.difficultyId,
      orderedDriverIds: driverIds,
      gridSpacingMeters: 16.0,
      humanPlayers: cfg.humanPlayers || null,
      playerCustomName: cfg.playerCustomName || null,
      playerCustomCode: cfg.playerCustomCode || null,
      playerCustomSpecs: cfg.playerCustomSpecs || null,
    });
    updateQualifyingState(this, 0, localPlayerId);
  }

  /**
   * Registra il voto di un giocatore per saltare la fase o tutte le qualifiche.
   * Esegue lo skip solo quando TUTTI i giocatori richiesti hanno approvato.
   */
  registerQualifyingSkipVote(voterCarId = LOCAL_PLAYER_ID, action = 'stage') {
    const q = this.qualifyingState;
    if (!q) {
      return { approvedCount: 0, requiredCount: 0, executed: false, action };
    }
    if (action === 'all') {
      q.skipVotes.requestedAction = 'all';
    } else if (!q.skipVotes.requestedAction) {
      q.skipVotes.requestedAction = 'stage';
    }

    const unanimous = voteSkipQualifying(q, voterCarId);
    const approvedCount = q.skipVotes.approvedBy.length;
    const requiredCount = q.skipVotes.requiredPlayers.length;
    const activeAction = q.skipVotes.requestedAction || action;

    if (!unanimous || !canSkipQualifying(q)) {
      return { approvedCount, requiredCount, executed: false, action: activeAction };
    }

    if (activeAction === 'all') {
      this._executeSkipAllQualifying(voterCarId);
    } else if (q.status === 'running') {
      finalizeQualifyingStage(this, voterCarId, { simulatePlayerIfMissing: true });
    }

    return { approvedCount, requiredCount, executed: true, action: activeAction };
  }

  /**
   * Salta la fase corrente di qualifica previa approvazione unanime di tutti i giocatori.
   */
  skipCurrentQualifyingStage(localPlayerId = LOCAL_PLAYER_ID) {
    return this.registerQualifyingSkipVote(localPlayerId, 'stage').executed;
  }

  /**
   * Passa alla fase successiva di qualifica (Q2 o Q3), oppure simula fino alla griglia se tutti gli umani sono eliminati.
   */
  advanceQualifyingToNextStage(localPlayerId = LOCAL_PLAYER_ID) {
    const q = this.qualifyingState;
    if (!q) return;

    if (q.status === 'running') {
      finalizeQualifyingStage(this, localPlayerId, { simulatePlayerIfMissing: true });
    }
    if (q.status === 'qualifying_complete') {
      this.startRaceFromQualifying(localPlayerId);
      return;
    }

    while (q.status === 'stage_complete') {
      const nextIdx = q.stageIndex + 1;
      if (nextIdx >= QUALIFYING_STAGE_IDS.length) break;
      const nextStage = QUALIFYING_STAGES[QUALIFYING_STAGE_IDS[nextIdx]];
      q.stageIndex = nextIdx;
      q.stageId = nextStage.id;
      q.stageLabel = nextStage.label;
      q.status = 'running';
      q.timeRemaining = nextStage.duration;
      q.stageDuration = nextStage.duration;
      q.elapsedInStage = 0;
      q.activeDriverIds = [...q.nextActiveDriverIds];
      q.nextActiveDriverIds = [];
      if (q.skipVotes) {
        q.skipVotes.approvedBy = [];
        q.skipVotes.requestedAction = null;
      }

      this._spawnQualifyingStageCars(q.activeDriverIds, localPlayerId);
      if (!q.allHumansEliminated) {
        break;
      }
      finalizeQualifyingStage(this, localPlayerId, { simulatePlayerIfMissing: false });
    }
  }

  _executeSkipAllQualifying(localPlayerId = LOCAL_PLAYER_ID) {
    const q = this.qualifyingState;
    if (!q) return false;

    while (q.status !== 'qualifying_complete') {
      if (q.status === 'running') {
        finalizeQualifyingStage(this, localPlayerId, { simulatePlayerIfMissing: true });
      } else if (q.status === 'stage_complete') {
        const nextIdx = q.stageIndex + 1;
        if (nextIdx >= QUALIFYING_STAGE_IDS.length) break;
        const nextStage = QUALIFYING_STAGES[QUALIFYING_STAGE_IDS[nextIdx]];
        q.stageIndex = nextIdx;
        q.stageId = nextStage.id;
        q.stageLabel = nextStage.label;
        q.status = 'running';
        q.timeRemaining = nextStage.duration;
        q.stageDuration = nextStage.duration;
        q.elapsedInStage = 0;
        q.activeDriverIds = [...q.nextActiveDriverIds];
        q.nextActiveDriverIds = [];
        this._spawnQualifyingStageCars(q.activeDriverIds, localPlayerId);
        finalizeQualifyingStage(this, localPlayerId, { simulatePlayerIfMissing: true });
      } else {
        break;
      }
    }

    this.startRaceFromQualifying(localPlayerId);
    return true;
  }

  /**
   * Salta tutte le qualifiche rimanenti (previa approvazione unanime) e avvia subito la Gara da 10 Giri.
   */
  skipAllQualifyingToRace(localPlayerId = LOCAL_PLAYER_ID) {
    return this.registerQualifyingSkipVote(localPlayerId, 'all').executed;
  }

  /**
   * Avvia la Gara da 10 Giri usando esattamente la griglia finale conquistata in Q1/Q2/Q3.
   */
  startRaceFromQualifying(localPlayerId = LOCAL_PLAYER_ID) {
    const q = this.qualifyingState;
    if (!q || !Array.isArray(q.finalGrid) || q.finalGrid.length === 0) return;

    const orderedDriverIds = q.finalGrid.map((r) => r.driverId);
    const cfg = this.sessionConfig || {};
    const playerDriverId = cfg.playerDriverId || 'leclerc';
    const playerGridIdx = Math.max(0, orderedDriverIds.indexOf(playerDriverId));
    const qualifiedPole = q.finalGrid[0]?.driverId === playerDriverId;

    this.qualifyingState = null;
    this.sessionConfig = {
      ...cfg,
      mode: 'race',
      withBots: true,
      lapLimit: RACE_TOTAL_LAPS,
      playerGridIndex: playerGridIdx,
      qualifiedPole,
    };

    this.spawnFullGrid(playerDriverId, playerGridIdx, localPlayerId, {
      totalLaps: RACE_TOTAL_LAPS,
      skipCountdown: false,
      mode: 'race',
      carLevel: cfg.carLevel || 'base',
      difficultyId: cfg.difficultyId || this.difficultyId,
      orderedDriverIds,
      gridSpacingMeters: 7.8,
      humanPlayers: cfg.humanPlayers || null,
      playerCustomName: cfg.playerCustomName || null,
      playerCustomCode: cfg.playerCustomCode || null,
      playerCustomSpecs: cfg.playerCustomSpecs || null,
    });
  }

  /**
   * Restituisce lo stato di una vettura specifica.
   */
  getCar(id) {
    return this.cars[id] || null;
  }

  /**
   * Esegue un passo deterministico della simulazione per tutte le vetture.
   * @param {Record<string, object>} inputsByCarId
   * @param {number} dt
   * @param {string} [localPlayerId=LOCAL_PLAYER_ID]
   */
  step(inputsByCarId, dt, localPlayerId = LOCAL_PLAYER_ID) {
    if (this.qualifyingState && this.qualifyingState.status !== 'running') {
      return;
    }

    this.tick += 1;
    this.elapsedTime += dt;

    if (this.raceState && this.raceState.status === 'countdown') {
      updateRaceState(this, dt, localPlayerId);
      // Durante il semaforo rosso le vetture restano ferme in griglia (consentendo sgasate in Folle)
      for (const [carId, carState] of Object.entries(this.cars)) {
        const input = carState.isBot ? null : inputsByCarId[carId];
        const revving = Boolean(input?.forward);
        const targetRpm = revving ? 12400 : CAR_PHYSICS_CONFIG.idleRpm;
        carState.rpm += (targetRpm - carState.rpm) * Math.min(1, 10 * dt);
        carState.throttleInput = revving ? 1 : 0;
      }
      return;
    }

    for (const [carId, carState] of Object.entries(this.cars)) {
      let carInput;
      if (carState.isBot) {
        carInput = computeBotInput(carState, this);
        if (carState.raceFinished) {
          // Giro di rientro lento dopo la bandiera a scacchi
          carInput = {
            ...carInput,
            forward: carState.forwardSpeed < 24,
            backward: carState.forwardSpeed > 28,
          };
        }
      } else {
        carInput = inputsByCarId[carId] || null;
      }

      stepCarPhysics(
        carState,
        carInput,
        dt,
        this.trackSurface,
        this.weather,
        this.difficultyId
      );
    }

    // Collisioni vettura-vettura tra tutte le 22 monoposto
    resolveCarToCarCollisions(this.cars);

    const sessionMode = this.raceState?.mode ?? 'race';
    for (const carState of Object.values(this.cars)) {
      resolveTrackBarrierCollision(carState, this.trackSurface);
      updateCarTiming(
        carState,
        this.sessionTiming,
        this.trackSurface,
        dt,
        this.raceState?.status ?? 'racing',
        sessionMode
      );
    }

    if (this.qualifyingState && sessionMode === 'qualifying') {
      updateQualifyingState(this, dt, localPlayerId);
    } else if (this.raceState) {
      updateRaceState(this, dt, localPlayerId);
    }
  }

  /**
   * Esporta uno snapshot JSON-safe dello stato (pronto per WebRTC/PeerJS).
   */
  getSnapshot() {
    const carsCopy = {};
    for (const [id, car] of Object.entries(this.cars)) {
      carsCopy[id] = {
        ...car,
        carSpecs: car.carSpecs ? { ...car.carSpecs } : null,
        aeroTire: car.aeroTire ? { ...car.aeroTire } : null,
        suspension: car.suspension
          ? {
              ...car.suspension,
              wheelOffsetY: [...car.suspension.wheelOffsetY],
            }
          : null,
        timing: cloneCarTiming(car.timing),
      };
    }
    return {
      tick: this.tick,
      elapsedTime: this.elapsedTime,
      trackId: this.trackData?.id || this.sessionConfig?.trackId || DEFAULT_TRACK_ID,
      weather: this.weather,
      difficultyId: this.difficultyId,
      careerRewardGranted: this.careerRewardGranted,
      lastCareerReward: this.lastCareerReward ? { ...this.lastCareerReward } : null,
      sessionConfig: this.sessionConfig ? { ...this.sessionConfig } : null,
      sessionTiming: cloneSessionTiming(this.sessionTiming),
      raceState: this.raceState
        ? {
            ...this.raceState,
            standings: this.raceState.standings.map((row) => ({ ...row })),
          }
        : null,
      qualifyingState: cloneQualifyingState(this.qualifyingState),
      cars: carsCopy,
    };
  }

  /**
   * Applica uno snapshot ricevuto dalla rete.
   */
  applySnapshot(snapshot) {
    if (!snapshot) return;
    const incomingTrackId = snapshot.trackId || snapshot.sessionConfig?.trackId;
    if (incomingTrackId && incomingTrackId !== this.trackData?.id) {
      this.setTrack(getTrackById(incomingTrackId));
    }
    this.tick = snapshot.tick ?? this.tick;
    this.elapsedTime = snapshot.elapsedTime ?? this.elapsedTime;
    if (snapshot.weather) {
      this.weather = snapshot.weather;
    }
    if (snapshot.difficultyId) {
      this.difficultyId = snapshot.difficultyId;
    }
    if (snapshot.careerRewardGranted !== undefined) {
      this.careerRewardGranted = Boolean(snapshot.careerRewardGranted);
    }
    if (snapshot.lastCareerReward !== undefined) {
      this.lastCareerReward = snapshot.lastCareerReward ? { ...snapshot.lastCareerReward } : null;
    }
    if (snapshot.sessionConfig) {
      this.sessionConfig = { ...snapshot.sessionConfig };
    }
    if (snapshot.sessionTiming) {
      this.sessionTiming = cloneSessionTiming(snapshot.sessionTiming);
    }
    if (snapshot.raceState) {
      this.raceState = {
        ...snapshot.raceState,
        standings: (snapshot.raceState.standings || []).map((row) => ({ ...row })),
      };
    }
    this.qualifyingState =
      snapshot.qualifyingState !== undefined
        ? cloneQualifyingState(snapshot.qualifyingState)
        : null;
    if (snapshot.cars) {
      this.cars = {};
      for (const [id, carData] of Object.entries(snapshot.cars)) {
        this.cars[id] = {
          ...carData,
          carSpecs: carData.carSpecs ? { ...carData.carSpecs } : null,
          aeroTire: carData.aeroTire ? { ...carData.aeroTire } : null,
          suspension: carData.suspension
            ? {
                ...carData.suspension,
                wheelOffsetY: [...carData.suspension.wheelOffsetY],
              }
            : null,
          timing: cloneCarTiming(carData.timing),
        };
      }
    }
  }
}
