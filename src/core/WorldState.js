/**
 * Stato del mondo di gioco (Simulation Layer).
 * Contiene solo dati puri serializzabili (nessun oggetto Three.js o DOM),
 * così da poter essere sincronizzato via rete nello Step 10.
 */

import { CAR_PHYSICS_CONFIG, LOCAL_PLAYER_ID, TIRE_COMPOUNDS } from '../config/constants.js';
import { DEFAULT_DIFFICULTY_ID } from '../config/difficulty.js';
import {
  loadPhysicsSettings,
  normalizePhysicsSettings,
  physicsSettingsFromLegacyDifficulty,
} from '../config/physicsSettings.js';
import { fitFreshTires } from '../physics/AeroAndTires.js';
import {
  CAREER_RACE_LAPS,
  F1_2026_DRIVERS,
  F1_2026_TEAMS,
  RACE_TOTAL_LAPS,
  getCareerWeekendPreset,
} from '../config/f1_2026_data.js';
import { getCarSpecsForLevel } from '../cars/CarSpecs.js';
import { createInitialCarState, stepCarPhysics } from '../physics/CarPhysics.js';
import {
  resolveCarToCarCollisions,
  resolveTrackBarrierCollision,
} from '../physics/Collisions.js';
import { createTrackSurface, queryTrackSurface } from '../tracks/TrackSurface.js';
import { DEFAULT_TRACK_ID, getTrackById } from '../tracks/calendar2026/index.js';
import { computeBotInput } from '../ai/BotController.js';
import { getDriverProfile } from '../ai/DriverProfiles.js';
import {
  createSessionTimingState,
  createCarTimingState,
  updateCarTiming,
} from '../race/TimingSystem.js';
import {
  GRID_WAIT_AFTER_QUALI_SECONDS,
  computeStartingGridTransforms,
  createInitialRaceState,
  updateRaceState,
} from '../race/RaceManager.js';
import {
  createInitialPitLaneState,
  getCarPitStall,
  quickReturnCarToPitEntry,
  updatePitLaneManager,
} from '../race/PitLaneManager.js';
import {
  QUALIFYING_STAGE_IDS,
  QUALIFYING_STAGES,
  canSkipQualifying,
  createInitialQualifyingState,
  finalizeQualifyingStage,
  getQualifyingStageDuration,
  updateQualifyingState,
  voteSkipQualifying,
} from '../race/QualifyingManager.js';
import {
  SKY_PRESETS,
  getNextWeatherCyclePreset,
  getSkyPresetById,
  resolveSkyPreset,
} from '../rendering/SkyPresets.js';

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
    lastCompletedSector: timing.lastCompletedSector ? { ...timing.lastCompletedSector } : null,
    lastCompletedLap: timing.lastCompletedLap ? { ...timing.lastCompletedLap } : null,
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

const TRACK_RECOVERY_BYPASS_PIT_STATES = new Set([
  'IN_GARAGE',
  'EXITING_GARAGE',
  'PIT_EXIT_LANE',
  'PIT_ENTRY_LANE',
  'PIT_STOPPING',
  'AUTO_BOX_STOP',
  'IN_PIT_BOX',
  'AUTO_PARKING',
  'PARKED_STAGE_END',
]);

/**
 * Valuta se la vettura del giocatore può (e deve) essere rimessa in pista:
 * - fuori pista su erba/ghiaia a bassa/media velocità, oppure
 * - bloccata contro una barriera, oppure
 * - ferma contromano / di traverso.
 */
export function getCarTrackRecoveryState(worldState, car) {
  if (!worldState?.trackSurface || !car || car.isBot || car.raceFinished || car.trackRecoveryAnim) {
    return { eligible: false, showPrompt: false, reason: null };
  }
  const raceStatus = worldState.raceState?.status;
  if (raceStatus === 'grid_wait' || raceStatus === 'countdown' || raceStatus === 'finished') {
    return { eligible: false, showPrompt: false, reason: null };
  }
  const qStatus = worldState.qualifyingState?.status;
  if (qStatus === 'stage_complete' || qStatus === 'qualifying_complete') {
    return { eligible: false, showPrompt: false, reason: null };
  }
  if ((car.resetToTrackCooldown ?? 0) > 0) {
    return { eligible: false, showPrompt: false, reason: null };
  }
  if (car.pitState && TRACK_RECOVERY_BYPASS_PIT_STATES.has(car.pitState)) {
    return { eligible: false, showPrompt: false, reason: null };
  }

  const speed = Math.hypot(car.vx || 0, car.vz || 0);
  const query = queryTrackSurface(worldState.trackSurface, car.x, car.z, car.trackSampleIndex);
  const headingDot = Math.sin(car.heading || 0) * query.tx + Math.cos(car.heading || 0) * query.tz;

  const offTrack = car.surface === 'grass' && speed < 30;
  const barrierStuck = Boolean(car.collidingWithBarrier) && speed < 14;
  const wrongWayStopped = speed < 8 && headingDot < 0.35;

  const eligible = offTrack || barrierStuck || wrongWayStopped;
  if (!eligible) {
    return { eligible: false, showPrompt: false, reason: null };
  }

  const reason = offTrack ? 'off_track' : barrierStuck ? 'barrier' : 'wrong_way';
  const showPrompt =
    (car.surface === 'grass' && speed < 16) ||
    (Boolean(car.collidingWithBarrier) && speed < 10) ||
    (speed < 5 && headingDot < 0.35);

  return { eligible: true, showPrompt, reason };
}

function cloneQualifyingState(qualifyingState) {
  if (!qualifyingState) return null;
  return {
    ...qualifyingState,
    stageDurations: qualifyingState.stageDurations ? { ...qualifyingState.stageDurations } : null,
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
    this.skyPresetId = resolveSkyPreset('dry', trackData).id;
    this.difficultyId = 'realistic';
    this.physicsSettings = loadPhysicsSettings();
    this.sessionConfig = null;
    this.trackData = trackData;
    this.trackSurface = trackData ? createTrackSurface(trackData) : null;
    this.sessionTiming = this.trackSurface
      ? createSessionTimingState(this.trackSurface, trackData?.startTransform)
      : null;
    this.raceState = null;
    this.qualifyingState = null;
    this.pitLaneState = createInitialPitLaneState();
    this.pitGuideActive = false;
    this.pitReleaseStatus = null;
    this.careerRewardGranted = false;
    this.lastCareerReward = null;
    /** @type {Record<string, ReturnType<typeof createInitialCarState>>} */
    this.cars = {};
  }

  _resolveDefaultAutoSky(trackData = this.trackData) {
    return resolveSkyPreset('dry', trackData).isNight
      ? SKY_PRESETS.night_clear
      : SKY_PRESETS.sunset;
  }

  setSkyPreset(requestedId, rng = Math.random) {
    const preset =
      requestedId === 'auto'
        ? this._resolveDefaultAutoSky(this.trackData)
        : resolveSkyPreset(requestedId, this.trackData, rng);
    this.skyPresetId = preset.id;
    this.weather = preset.physicsWeather === 'rain' ? 'rain' : 'dry';
    return preset;
  }

  setWeather(weatherId) {
    this.weather = weatherId === 'rain' ? 'rain' : 'dry';
    const currentSky = getSkyPresetById(this.skyPresetId);
    if (this.weather === 'rain' && currentSky.physicsWeather !== 'rain') {
      this.skyPresetId = 'rain';
    } else if (this.weather === 'dry' && currentSky.physicsWeather === 'rain') {
      this.skyPresetId = resolveSkyPreset('dry', this.trackData).id;
    }
    return this.weather;
  }

  toggleWeather() {
    return this.setWeather(this.weather === 'dry' ? 'rain' : 'dry');
  }

  cycleWeatherPreset() {
    const nextPreset = getNextWeatherCyclePreset(this.skyPresetId, this.trackData);
    this.skyPresetId = nextPreset.id;
    this.weather = nextPreset.physicsWeather === 'rain' ? 'rain' : 'dry';
    return nextPreset;
  }

  /**
   * Aggiorna i 7 toggle modulari di fisica e il livello Bot IA (75%–105%) a runtime.
   */
  setPhysicsSettings(settings) {
    this.physicsSettings = normalizePhysicsSettings(settings);
    if (this.sessionConfig) {
      this.sessionConfig.physicsSettings = { ...this.physicsSettings };
    }
    return this.physicsSettings;
  }

  /**
   * Determina la mescola iniziale realistica per modalità e meteo (S / M / H / W),
   * rispettando sempre l'eventuale mescola scelta dal giocatore prima di scendere in pista.
   */
  _resolveInitialCompound(
    mode,
    isRain,
    driverNumber = 1,
    isPlayerSlot = false,
    requestedCompound = null
  ) {
    if (isPlayerSlot && requestedCompound && TIRE_COMPOUNDS[requestedCompound]) {
      return requestedCompound;
    }
    if (isRain) return 'W';
    if (mode === 'qualifying') return 'S';
    if (mode === 'practice') return 'M';
    if (isPlayerSlot) return 'M';
    const racePool = ['M', 'M', 'S', 'H'];
    return racePool[Math.abs(Number(driverNumber) || 0) % racePool.length];
  }

  _resolveDefaultNextPitCompound(startCompound, isRain, totalLaps = 10) {
    if (isRain) return 'W';
    if (startCompound === 'S') return 'M';
    if (startCompound === 'H') return 'M';
    return (totalLaps ?? 10) >= 8 ? 'H' : 'S';
  }

  /**
   * Attiva/disattiva la prenotazione Pit Stop in Gara/Prove per il giocatore (tasto BOX o HUD)
   * accendendo le frecce 3D verdi della guida pit lane.
   */
  togglePlayerPitStopRequest(carId = LOCAL_PLAYER_ID) {
    const car = this.getCar(carId);
    const mode = this.raceState?.mode ?? 'practice';
    if (!car || car.isBot || mode === 'qualifying') return false;
    car.pitStopRequested = !car.pitStopRequested;
    this.pitGuideActive = Boolean(car.pitStopRequested);
    return car.pitStopRequested;
  }

  /**
   * Imposta la mescola da montare al prossimo Pit Stop ('S' | 'M' | 'H' | 'W').
   * Se il giocatore è ancora fermo nel proprio garage/box (es. prima di uscire in Qualifica),
   * monta subito il nuovo treno così da uscire in pista con la mescola appena scelta.
   */
  setPlayerNextPitCompound(carId = LOCAL_PLAYER_ID, compoundId = 'M') {
    const car = this.getCar(carId);
    if (!car || car.isBot) return null;
    if (!TIRE_COMPOUNDS[compoundId]) return car.nextPitCompound;
    car.nextPitCompound = compoundId;
    if (car.pitState === 'IN_GARAGE' || car.pitState === 'IN_PIT_BOX') {
      fitFreshTires(car, compoundId, this.weather === 'rain');
    }
    return compoundId;
  }

  /**
   * Scorre ciclicamente la mescola per il prossimo Pit Stop (S → M → H → W).
   */
  cyclePlayerNextPitCompound(carId = LOCAL_PLAYER_ID) {
    const car = this.getCar(carId);
    if (!car || car.isBot) return null;
    const order = ['S', 'M', 'H', 'W'];
    const refComp =
      car.pitState === 'IN_GARAGE' || car.pitState === 'IN_PIT_BOX'
        ? car.aeroTire?.compound || car.nextPitCompound || 'M'
        : car.nextPitCompound || car.aeroTire?.compound || 'M';
    const curIdx = order.indexOf(refComp);
    const nextComp = order[(curIdx + 1 + order.length) % order.length];
    return this.setPlayerNextPitCompound(carId, nextComp);
  }

  /**
   * Monta immediatamente un treno di gomme nuove (es. cambio rapido ai box in Prove Libere).
   */
  fitCarFreshTires(carId = LOCAL_PLAYER_ID, compoundId = null) {
    const car = this.getCar(carId);
    if (!car) return null;
    const chosen =
      compoundId && TIRE_COMPOUNDS[compoundId]
        ? compoundId
        : car.nextPitCompound || (this.weather === 'rain' ? 'W' : 'M');
    return fitFreshTires(car, chosen, this.weather === 'rain');
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
    if (this.skyPresetId === 'clear_day' || this.skyPresetId === 'night_clear') {
      this.skyPresetId = resolveSkyPreset('dry', trackData).id;
    }
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
    const isCareer = Boolean(config.isCareer);
    const careerPreset = isCareer ? getCareerWeekendPreset(config.careerPresetId) : null;
    const rawRaceLaps = Number(config.raceLaps ?? config.lapLimit);
    const resolvedRaceLaps =
      Number.isFinite(rawRaceLaps) && rawRaceLaps >= 1
        ? Math.max(1, Math.min(99, Math.round(rawRaceLaps)))
        : isCareer
          ? careerPreset.raceLaps
          : RACE_TOTAL_LAPS;
    const qualifyingStageDurations = config.qualifyingStageDurations
      ? { ...config.qualifyingStageDurations }
      : careerPreset
        ? { ...careerPreset.qualifyingDurations }
        : null;
    const lapLimit =
      mode === 'race'
        ? resolvedRaceLaps
        : mode === 'qualifying'
          ? null
          : (config.lapLimit ?? null);
    const carLevel = config.carLevel === 'max' ? 'max' : 'base';
    const playerDriverId = config.playerDriverId || 'leclerc';
    const playerGridIndex = config.playerGridIndex ?? 7;

    if (isCareer) {
      const resolvedSky =
        config.skyPresetId &&
        config.skyPresetId !== 'random' &&
        config.skyPresetId !== 'auto' &&
        SKY_PRESETS[config.skyPresetId]
          ? SKY_PRESETS[config.skyPresetId]
          : resolveSkyPreset('random', this.trackData, config.skyRng);
      this.skyPresetId = resolvedSky.id;
      this.weather = resolvedSky.physicsWeather === 'rain' ? 'rain' : 'dry';
    } else if (config.skyPresetId === 'random') {
      const resolvedSky = resolveSkyPreset('random', this.trackData, config.skyRng);
      this.skyPresetId = resolvedSky.id;
      this.weather = resolvedSky.physicsWeather === 'rain' ? 'rain' : 'dry';
    } else if (config.skyPresetId === 'auto') {
      const resolvedSky =
        config.weather === 'rain' ? SKY_PRESETS.rain : this._resolveDefaultAutoSky(this.trackData);
      this.skyPresetId = resolvedSky.id;
      this.weather = resolvedSky.physicsWeather === 'rain' ? 'rain' : 'dry';
    } else if (config.skyPresetId) {
      const resolvedSky = resolveSkyPreset(config.skyPresetId, this.trackData, config.skyRng);
      this.skyPresetId = resolvedSky.id;
      this.weather = resolvedSky.physicsWeather === 'rain' ? 'rain' : 'dry';
    } else if (config.weather) {
      const resolvedSky =
        config.weather === 'rain' ? SKY_PRESETS.rain : resolveSkyPreset('dry', this.trackData);
      this.skyPresetId = resolvedSky.id;
      this.weather = resolvedSky.physicsWeather === 'rain' ? 'rain' : 'dry';
    } else {
      const resolvedSky = resolveSkyPreset('dry', this.trackData);
      this.skyPresetId = resolvedSky.id;
      this.weather = resolvedSky.physicsWeather === 'rain' ? 'rain' : 'dry';
    }

    const humanPlayers =
      Array.isArray(config.humanPlayers) && config.humanPlayers.length > 0
        ? this._assignHumanDriverSlots(config.humanPlayers)
        : null;
    const requiredPlayerIds = humanPlayers
      ? humanPlayers.map((h) => h.carId)
      : config.requiredPlayerIds || [localPlayerId];

    this.difficultyId = difficultyId;
    if (config.physicsSettings && typeof config.physicsSettings === 'object') {
      this.physicsSettings = normalizePhysicsSettings(config.physicsSettings);
    } else if (config.difficultyId) {
      this.physicsSettings = physicsSettingsFromLegacyDifficulty(config.difficultyId);
    }
    this.careerRewardGranted = false;
    this.lastCareerReward = null;
    this.sessionConfig = {
      trackId: this.trackData?.id || DEFAULT_TRACK_ID,
      mode,
      difficultyId,
      physicsSettings: { ...this.physicsSettings },
      withBots,
      lapLimit,
      raceLaps: resolvedRaceLaps,
      qualifyingStageDurations,
      carLevel,
      playerDriverId: humanPlayers?.[0]?.driverId || playerDriverId,
      playerGridIndex,
      requiredPlayerIds,
      humanPlayers,
      isCareer: Boolean(config.isCareer),
      careerTeamId: config.careerTeamId || null,
      careerPresetId: careerPreset?.id || config.careerPresetId || null,
      careerRoundIndex: Number.isFinite(Number(config.careerRoundIndex))
        ? Math.max(0, Math.floor(Number(config.careerRoundIndex)))
        : null,
      careerSeasonNumber: Number.isFinite(Number(config.careerSeasonNumber))
        ? Math.max(1, Math.floor(Number(config.careerSeasonNumber)))
        : null,
      playerCustomName: config.playerCustomName || null,
      playerCustomCode: config.playerCustomCode || null,
      playerCustomSpecs: config.playerCustomSpecs ? { ...config.playerCustomSpecs } : null,
      customPrimaryColor: config.customPrimaryColor || null,
      paintRoughness: config.paintRoughness ?? null,
      paintMetalness: config.paintMetalness ?? null,
      skyPresetId: this.skyPresetId,
      requestedSkyPresetId: isCareer ? 'random' : (config.skyPresetId || null),
      startingCompound:
        config.startingCompound && TIRE_COMPOUNDS[config.startingCompound]
          ? config.startingCompound
          : null,
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
        physicsSettings: this.physicsSettings,
      });
      return;
    }

    // Prove Libere in solitaria (1 sola vettura al via, nessuna attesa semaforo)
    this.tick = 0;
    this.elapsedTime = 0;
    this.cars = {};
    this.pitLaneState = createInitialPitLaneState();
    this.pitGuideActive = false;
    this.pitReleaseStatus = null;
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
    const isRainStart = this.weather === 'rain';
    const startCompound =
      config.startingCompound && TIRE_COMPOUNDS[config.startingCompound]
        ? config.startingCompound
        : this._resolveInitialCompound('practice', isRainStart, playerDriver.number, true);
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
      compound: startCompound,
      nextPitCompound: this._resolveDefaultNextPitCompound(startCompound, isRainStart, 10),
      isRain: isRainStart,
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
    if (options.physicsSettings && typeof options.physicsSettings === 'object') {
      this.physicsSettings = normalizePhysicsSettings(options.physicsSettings);
    } else if (options.difficultyId) {
      this.difficultyId = options.difficultyId;
      if (!this.sessionConfig?.physicsSettings) {
        this.physicsSettings = physicsSettingsFromLegacyDifficulty(options.difficultyId);
      }
    }

    this.tick = 0;
    this.elapsedTime = 0;
    this.cars = {};
    this.pitLaneState = createInitialPitLaneState();
    this.pitGuideActive = false;
    this.pitReleaseStatus = null;
    this.sessionTiming = createSessionTimingState(
      this.trackSurface,
      this.trackData?.startTransform
    );
    this.raceState = createInitialRaceState(totalLaps, {
      skipCountdown,
      mode,
      gridWaitSeconds: options.gridWaitSeconds ?? 0,
    });

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
      const isRainGrid = this.weather === 'rain';
      const requestedPlayerCompound =
        options.startingCompound || this.sessionConfig?.startingCompound || null;
      const gridCompound = this._resolveInitialCompound(
        mode,
        isRainGrid,
        driver.number,
        isPlayerSlot,
        requestedPlayerCompound
      );

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
        driverProfile: getDriverProfile(driver.id),
        maxSpeedMultiplier: isPlayerSlot ? 1.0 : 0.942 + Math.max(0, (performance - 0.90) / 0.09) * 0.064,
        accelMultiplier: isPlayerSlot ? 1.0 : 0.925 + Math.max(0, (performance - 0.90) / 0.09) * 0.082,
        gridPosition: slot.gridPosition,
        compound: gridCompound,
        nextPitCompound: this._resolveDefaultNextPitCompound(gridCompound, isRainGrid, totalLaps),
        isRain: isRainGrid,
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
      humanDriverIds,
      config.qualifyingStageDurations || null
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
      physicsSettings: cfg.physicsSettings || this.physicsSettings,
      orderedDriverIds: driverIds,
      gridSpacingMeters: 16.0,
      humanPlayers: cfg.humanPlayers || null,
      playerCustomName: cfg.playerCustomName || null,
      playerCustomCode: cfg.playerCustomCode || null,
      playerCustomSpecs: cfg.playerCustomSpecs || null,
    });

    // Step 3: Posiziona tutte le vetture attive (22 in Q1, 16 in Q2, 10 in Q3) dentro i rispettivi box
    const pitLane = this.trackSurface?.pitLane || null;
    this.pitLaneState = createInitialPitLaneState();
    this.pitGuideActive = false;
    this.pitReleaseStatus = null;

    if (pitLane) {
      // Ordina i bot dal box più vicino all'uscita verso il fondo per evitare blocchi in fast lane
      const botCars = Object.values(this.cars)
        .filter((c) => c.isBot)
        .sort((a, b) => {
          const sa = getCarPitStall(pitLane, a)?.sMeters ?? 0;
          const sb = getCarPitStall(pitLane, b)?.sMeters ?? 0;
          return sb - sa;
        });

      // I bot iniziano a uscire dai box a ondate naturali (rispettando FIA unsafe release)
      // e si accodano in fast lane fino al semaforo di uscita pit (1 ogni 10.0s)
      botCars.forEach((bot, idx) => {
        if (idx < 4) {
          bot.plannedReleaseTime = 0.6 + idx * 0.95;
        } else {
          bot.plannedReleaseTime = 4.6 + (idx - 4) * 8.8;
        }
      });

      for (const car of Object.values(this.cars)) {
        const stall = getCarPitStall(pitLane, car);
        if (stall) {
          car.x = stall.garageInteriorPos.x;
          car.y = stall.garageInteriorPos.y ?? 0;
          car.z = stall.garageInteriorPos.z;
          car.heading = stall.garageInteriorPos.heading;
        }
        car.vx = 0;
        car.vz = 0;
        car.forwardSpeed = 0;
        car.lateralSpeed = 0;
        car.speed = 0;
        car.yawRate = 0;
        car.steerAngle = 0;
        car.gear = 0;
        car.gearLabel = 'N';
        car.surface = 'pitlane';
        car.pitState = 'IN_GARAGE';
        car.pitControlsLocked = true;
        car.pitLimiterActive = true;
        car.pitLimitKmh = pitLane.speedLimitKmh;
        car.pitExitRequested = false;
        car.pitExitCleared = false;
        car.pitExitGateHold = false;
        car.pitExitGateMaxSpeedMs = null;
        car.pitQueuePosition = 0;
        car.pitQueueAutoActive = false;
        car.pitExitAutoLaunch = false;
        car.pitBoxLeaveCooldown = 0;
        car.pitAutoAlign = null;
        car.chequeredLapDone = false;
      }

      // Valuta subito il semaforo Ingegnere di Gara per il giocatore nel box
      updatePitLaneManager(this, {}, 0, localPlayerId);
    }

    updateQualifyingState(this, 0, localPlayerId);
  }

  /**
   * Richiede l'uscita semi-automatica dal box per un giocatore (tasto W o pulsante ESCI DAI BOX).
   */
  requestPlayerPitExit(carId = LOCAL_PLAYER_ID) {
    const car = this.getCar(carId);
    if (!car || car.isBot || car.pitState !== 'IN_GARAGE') return false;
    car.pitExitRequested = true;
    return true;
  }

  /**
   * Rientro rapido opzionale all'ingresso pit lane durante il giro di rientro a fine Q1/Q2/Q3.
   */
  quickReturnToPitEntry(carId = LOCAL_PLAYER_ID) {
    return quickReturnCarToPitEntry(this, carId);
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
    } else if (
      q.status === 'running' ||
      q.status === 'chequered_flag' ||
      q.status === 'in_lap'
    ) {
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

    if (q.status === 'running' || q.status === 'chequered_flag' || q.status === 'in_lap') {
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
      const nextDuration = getQualifyingStageDuration(q, nextStage.id);
      q.stageIndex = nextIdx;
      q.stageId = nextStage.id;
      q.stageLabel = nextStage.label;
      q.status = 'running';
      q.timeRemaining = nextDuration;
      q.stageDuration = nextDuration;
      q.elapsedInStage = 0;
      q.autoAdvanceTimer = 0;
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
      if (q.status === 'running' || q.status === 'chequered_flag' || q.status === 'in_lap') {
        finalizeQualifyingStage(this, localPlayerId, { simulatePlayerIfMissing: true });
      } else if (q.status === 'stage_complete') {
        const nextIdx = q.stageIndex + 1;
        if (nextIdx >= QUALIFYING_STAGE_IDS.length) break;
        const nextStage = QUALIFYING_STAGES[QUALIFYING_STAGE_IDS[nextIdx]];
        const nextDuration = getQualifyingStageDuration(q, nextStage.id);
        q.stageIndex = nextIdx;
        q.stageId = nextStage.id;
        q.stageLabel = nextStage.label;
        q.status = 'running';
        q.timeRemaining = nextDuration;
        q.stageDuration = nextDuration;
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
   * Salta tutte le qualifiche rimanenti (previa approvazione unanime) e avvia subito la Gara.
   */
  skipAllQualifyingToRace(localPlayerId = LOCAL_PLAYER_ID) {
    return this.registerQualifyingSkipVote(localPlayerId, 'all').executed;
  }

  /**
   * Avvia la Gara usando esattamente la griglia finale conquistata in Q1/Q2/Q3.
   */
  startRaceFromQualifying(localPlayerId = LOCAL_PLAYER_ID) {
    const q = this.qualifyingState;
    if (!q || !Array.isArray(q.finalGrid) || q.finalGrid.length === 0) return;

    const orderedDriverIds = q.finalGrid.map((r) => r.driverId);
    const cfg = this.sessionConfig || {};
    const playerDriverId = cfg.playerDriverId || 'leclerc';
    const playerGridIdx = Math.max(0, orderedDriverIds.indexOf(playerDriverId));
    const qualifiedPole = q.finalGrid[0]?.driverId === playerDriverId;

    const rawCfgLaps = Number(cfg.raceLaps ?? cfg.lapLimit);
    const targetRaceLaps =
      Number.isFinite(rawCfgLaps) && rawCfgLaps >= 1
        ? Math.max(1, Math.min(99, Math.round(rawCfgLaps)))
        : cfg.isCareer
          ? getCareerWeekendPreset(cfg.careerPresetId).raceLaps
          : RACE_TOTAL_LAPS;

    this.qualifyingState = null;
    this.sessionConfig = {
      ...cfg,
      mode: 'race',
      withBots: true,
      lapLimit: targetRaceLaps,
      raceLaps: targetRaceLaps,
      playerGridIndex: playerGridIdx,
      qualifiedPole,
    };

    this.spawnFullGrid(playerDriverId, playerGridIdx, localPlayerId, {
      totalLaps: targetRaceLaps,
      skipCountdown: false,
      gridWaitSeconds: GRID_WAIT_AFTER_QUALI_SECONDS,
      mode: 'race',
      carLevel: cfg.carLevel || 'base',
      difficultyId: cfg.difficultyId || this.difficultyId,
      physicsSettings: cfg.physicsSettings || this.physicsSettings,
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
   * Avvia una sequenza animata C2-continua per riportare in sicurezza la vettura
   * bloccata/fuori pista sulla centerline dell'asfalto senza sovrapporsi alle altre auto.
   */
  resetCarToTrack(carId = LOCAL_PLAYER_ID) {
    const car = this.getCar(carId);
    const recovery = getCarTrackRecoveryState(this, car);
    if (!recovery.eligible) {
      return { ok: false, reason: null };
    }

    const query = queryTrackSurface(this.trackSurface, car.x, car.z, car.trackSampleIndex);
    const maxSafeLat = Math.max(0, Math.min(2.6, (query.halfTrackWidth ?? 6) - 1.8));
    const candidateOffsets = [0, maxSafeLat * 0.55, -maxSafeLat * 0.55, maxSafeLat, -maxSafeLat];

    let bestX = query.closestX;
    let bestZ = query.closestZ;
    let bestMinCarDist = -1;

    for (const lat of candidateOffsets) {
      const cx = query.closestX + query.nx * lat;
      const cz = query.closestZ + query.nz * lat;
      let minDist = Infinity;
      for (const other of Object.values(this.cars)) {
        if (!other || other.id === car.id || other.pitState === 'IN_GARAGE') continue;
        const d = Math.hypot(other.x - cx, other.z - cz);
        if (d < minDist) minDist = d;
      }
      if (minDist >= 6.0) {
        bestX = cx;
        bestZ = cz;
        break;
      }
      if (minDist > bestMinCarDist) {
        bestMinCarDist = minDist;
        bestX = cx;
        bestZ = cz;
      }
    }

    const targetY = query.elevation ?? car.y ?? 0;
    const targetHeading = Math.atan2(query.tx, query.tz);
    const dist = Math.hypot(bestX - car.x, bestZ - car.z);
    const duration = Math.min(1.30, Math.max(0.85, 0.80 + dist * 0.025));
    const liftPeakM = Math.min(0.68, Math.max(0.28, dist * 0.032));

    car.trackRecoveryAnim = {
      elapsed: 0,
      duration,
      progress: 0,
      startX: car.x,
      startY: car.y ?? targetY,
      startZ: car.z,
      startHeading: car.heading || 0,
      targetX: bestX,
      targetY,
      targetZ: bestZ,
      targetHeading,
      targetSampleIndex: query.sampleIndex,
      targetArcDistance: query.arcDistance,
      liftPeakM,
    };

    car.vx = 0;
    car.vz = 0;
    car.forwardSpeed = 0;
    car.lateralSpeed = 0;
    car.speed = 0;
    car.yawRate = 0;
    car.throttleInput = 0;
    car.brakeInput = 0;
    car.steerInput = 0;
    car.collidingWithBarrier = false;
    car.collisionImpact = 0;
    car.resetToTrackCooldown = duration + 2.0;
    car.recoveryGhostTimer = duration + 2.2;

    if (car.aeroTire) {
      car.aeroTire.wheelLockup = false;
      car.aeroTire.highSpeedBraking = false;
    }

    if (car.timing && this.qualifyingState && this.raceState?.mode === 'qualifying') {
      car.timing.currentLapInvalidated = true;
    }

    return { ok: true, reason: recovery.reason, duration };
  }

  _stepCarTrackRecovery(carState, dt) {
    const anim = carState?.trackRecoveryAnim;
    if (!anim) return false;

    anim.elapsed = Math.min(anim.duration, anim.elapsed + dt);
    const u = anim.duration > 1e-4 ? Math.min(1, anim.elapsed / anim.duration) : 1;
    anim.progress = u;

    // Traiettoria C2-continua (smootherstep) per partenza e atterraggio senza scatti
    const ePos = u * u * u * (u * (u * 6 - 15) + 10);
    const eYaw = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    const lift = Math.pow(Math.sin(Math.PI * u), 1.35) * anim.liftPeakM;

    const deltaHeading = Math.atan2(
      Math.sin(anim.targetHeading - anim.startHeading),
      Math.cos(anim.targetHeading - anim.startHeading)
    );

    carState.x = anim.startX + (anim.targetX - anim.startX) * ePos;
    carState.z = anim.startZ + (anim.targetZ - anim.startZ) * ePos;
    carState.y = anim.startY + (anim.targetY - anim.startY) * ePos + lift;
    carState.heading = anim.startHeading + deltaHeading * eYaw;

    carState.vx = 0;
    carState.vz = 0;
    carState.forwardSpeed = 0;
    carState.lateralSpeed = 0;
    carState.speed = 0;
    carState.yawRate = 0;
    carState.throttleInput = 0;
    carState.brakeInput = 0;
    carState.steerInput = 0;
    carState.gear = 1;
    carState.gearLabel = '1';
    carState.rpm += (CAR_PHYSICS_CONFIG.idleRpm - carState.rpm) * Math.min(1, 10 * dt);

    const steerVis = Math.sin(Math.PI * u) * Math.max(-0.42, Math.min(0.42, deltaHeading * 0.45));
    carState.steerAngle = steerVis;
    carState.wheelRotation = (carState.wheelRotation || 0) + 2.8 * dt * Math.sin(Math.PI * u);
    carState.frontWheelRotation = (carState.frontWheelRotation || 0) + 2.8 * dt * Math.sin(Math.PI * u);

    if (carState.suspension) {
      // Sospensioni scariche in elevazione e lieve compressione morbida al touchdown
      const touchdownComp = u >= 0.85 ? Math.sin(((u - 0.85) / 0.15) * Math.PI) : 0;
      carState.suspension.heave = lift > 0.05 ? 0.014 * Math.sin(Math.PI * u) - touchdownComp * 0.02 : -touchdownComp * 0.018;
      carState.suspension.pitch = Math.sin(Math.PI * u) * -0.016;
      carState.suspension.roll = Math.sin(Math.PI * u) * Math.max(-0.025, Math.min(0.025, -deltaHeading * 0.02));
    }

    if (carState.timing && this.trackSurface) {
      const qCur = queryTrackSurface(
        this.trackSurface,
        carState.x,
        carState.z,
        anim.targetSampleIndex
      );
      carState.trackSampleIndex = qCur.sampleIndex;
      carState.timing.lastArcDistance = qCur.arcDistance;
    }

    if (u >= 1) {
      carState.x = anim.targetX;
      carState.y = anim.targetY;
      carState.z = anim.targetZ;
      carState.heading = anim.targetHeading;
      carState.steerAngle = 0;
      carState.surface = 'asphalt';
      carState.collidingWithBarrier = false;
      carState.collisionImpact = 0;
      carState.trackSampleIndex = anim.targetSampleIndex;
      if (carState.timing) {
        carState.timing.lastArcDistance = anim.targetArcDistance;
      }
      if (carState.suspension) {
        carState.suspension.pitch = -0.015;
        carState.suspension.heave = -0.018;
      }
      carState.trackRecoveryAnim = null;
      carState.resetToTrackCooldown = 2.0;
      carState.recoveryGhostTimer = 2.2;
    }

    return true;
  }

  /**
   * Esegue un passo deterministico della simulazione per tutte le vetture.
   * @param {Record<string, object>} inputsByCarId
   * @param {number} dt
   * @param {string} [localPlayerId=LOCAL_PLAYER_ID]
   */
  step(inputsByCarId, dt, localPlayerId = LOCAL_PLAYER_ID) {
    // Durante la classifica fine Q1/Q2/Q3 (10s automatici): vetture ferme, countdown attivo
    if (
      this.qualifyingState &&
      (this.qualifyingState.status === 'stage_complete' ||
        this.qualifyingState.status === 'qualifying_complete')
    ) {
      this.tick += 1;
      this.elapsedTime += dt;
      const qRes = updateQualifyingState(this, dt, localPlayerId);
      if (qRes?.autoAdvanceTriggered) {
        this.advanceQualifyingToNextStage(localPlayerId);
      }
      return;
    }

    this.tick += 1;
    this.elapsedTime += dt;

    if (
      this.raceState &&
      (this.raceState.status === 'grid_wait' || this.raceState.status === 'countdown')
    ) {
      updateRaceState(this, dt, localPlayerId);
      // Durante attesa griglia (10s) e semaforo rosso le vetture restano ferme (consentendo sgasate in Folle)
      for (const [carId, carState] of Object.entries(this.cars)) {
        const input = carState.isBot ? null : inputsByCarId[carId];
        const revving = Boolean(input?.forward);
        const targetRpm = revving ? 12400 : CAR_PHYSICS_CONFIG.idleRpm;
        carState.rpm += (targetRpm - carState.rpm) * Math.min(1, 10 * dt);
        carState.throttleInput = revving ? 1 : 0;
      }
      return;
    }

    // 1. Gestione stati box / uscita semi-automatica / parcheggio automatico (Step 3)
    const pitHandledCars = updatePitLaneManager(this, inputsByCarId, dt, localPlayerId);

    for (const [carId, carState] of Object.entries(this.cars)) {
      if ((carState.resetToTrackCooldown ?? 0) > 0) {
        carState.resetToTrackCooldown = Math.max(0, carState.resetToTrackCooldown - dt);
      }
      if ((carState.recoveryGhostTimer ?? 0) > 0) {
        carState.recoveryGhostTimer = Math.max(0, carState.recoveryGhostTimer - dt);
      }
      if (pitHandledCars.has(carId)) continue;

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
        if (carInput?.resetToTrack) {
          this.resetCarToTrack(carId);
        }
      }

      if (this._stepCarTrackRecovery(carState, dt)) {
        continue;
      }

      stepCarPhysics(
        carState,
        carInput,
        dt,
        this.trackSurface,
        this.weather,
        this.physicsSettings
      );
    }

    // Collisioni vettura-vettura tra tutte le monoposto attive (auto nei box escluse)
    resolveCarToCarCollisions(this.cars);

    const sessionMode = this.raceState?.mode ?? 'race';
    for (const [carId, carState] of Object.entries(this.cars)) {
      if (!pitHandledCars.has(carId) && !carState.trackRecoveryAnim) {
        resolveTrackBarrierCollision(carState, this.trackSurface);
      }
      // Non far partire il cronometro giro mentre la vettura è ancora ferma dentro il box
      if (carState.pitState === 'IN_GARAGE' || carState.pitState === 'PARKED_STAGE_END') {
        continue;
      }
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
        driverProfile: car.driverProfile ? { ...car.driverProfile } : null,
        pitAutoAlign: car.pitAutoAlign ? { ...car.pitAutoAlign } : null,
        trackRecoveryAnim: car.trackRecoveryAnim ? { ...car.trackRecoveryAnim } : null,
        aeroTire: car.aeroTire
          ? {
              ...car.aeroTire,
              wheelHealth: car.aeroTire.wheelHealth ? { ...car.aeroTire.wheelHealth } : null,
              wheelTempC: car.aeroTire.wheelTempC ? { ...car.aeroTire.wheelTempC } : null,
            }
          : null,
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
      skyPresetId: this.skyPresetId,
      difficultyId: this.difficultyId,
      physicsSettings: { ...this.physicsSettings },
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
      pitLaneState: this.pitLaneState
        ? {
            ...this.pitLaneState,
            pitExitQueueIds: [...(this.pitLaneState.pitExitQueueIds || [])],
          }
        : null,
      pitGuideActive: Boolean(this.pitGuideActive),
      pitReleaseStatus: this.pitReleaseStatus ? { ...this.pitReleaseStatus } : null,
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
    if (snapshot.skyPresetId && SKY_PRESETS[snapshot.skyPresetId]) {
      this.skyPresetId = snapshot.skyPresetId;
      if (!snapshot.weather) {
        this.weather = SKY_PRESETS[snapshot.skyPresetId].physicsWeather === 'rain' ? 'rain' : 'dry';
      }
    } else if (snapshot.weather) {
      this.setWeather(snapshot.weather);
    }
    if (snapshot.difficultyId) {
      this.difficultyId = snapshot.difficultyId;
    }
    if (snapshot.physicsSettings) {
      this.physicsSettings = normalizePhysicsSettings(snapshot.physicsSettings);
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
    if (snapshot.pitLaneState !== undefined) {
      this.pitLaneState = snapshot.pitLaneState
        ? {
            ...snapshot.pitLaneState,
            pitExitQueueIds: [...(snapshot.pitLaneState.pitExitQueueIds || [])],
          }
        : createInitialPitLaneState();
    }
    if (snapshot.pitGuideActive !== undefined) {
      this.pitGuideActive = Boolean(snapshot.pitGuideActive);
    }
    if (snapshot.pitReleaseStatus !== undefined) {
      this.pitReleaseStatus = snapshot.pitReleaseStatus ? { ...snapshot.pitReleaseStatus } : null;
    }
    if (snapshot.cars) {
      this.cars = {};
      for (const [id, carData] of Object.entries(snapshot.cars)) {
        this.cars[id] = {
          ...carData,
          carSpecs: carData.carSpecs ? { ...carData.carSpecs } : null,
          driverProfile: carData.driverProfile ? { ...carData.driverProfile } : null,
          pitAutoAlign: carData.pitAutoAlign ? { ...carData.pitAutoAlign } : null,
          trackRecoveryAnim: carData.trackRecoveryAnim ? { ...carData.trackRecoveryAnim } : null,
          aeroTire: carData.aeroTire
            ? {
                ...carData.aeroTire,
                wheelHealth: carData.aeroTire.wheelHealth ? { ...carData.aeroTire.wheelHealth } : null,
                wheelTempC: carData.aeroTire.wheelTempC ? { ...carData.aeroTire.wheelTempC } : null,
              }
            : null,
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
