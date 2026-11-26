/**
 * Gestione Carriera, Campionato Stagionale 24 GP, Ciclo di Vita v3,
 * Premi Reali F1 e Storico Carriere Concluse.
 * Puro JavaScript compatibile sia con localStorage nel browser sia con storage iniettato nei test.
 */

import {
  CAREER_WEEKEND_PRESETS,
  DEFAULT_CAREER_PRESET_ID,
  F1_2026_DRIVERS,
  F1_2026_TEAMS,
  getCareerWeekendPreset,
} from '../config/f1_2026_data.js';
import { CALENDAR_2026_TRACKS } from '../tracks/calendar2026/index.js';
import {
  F1_AWARDS,
  countCareerAwards,
  createSimulatedCompletedCareer,
  evaluateGpAwards,
  evaluateSeasonAwards,
} from './F1Awards.js';

export const CAREER_STORAGE_KEY = 'f1_game_career_v1';
export const CAREER_SCHEMA_VERSION = 3;

export const F1_POINTS_BY_POSITION = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export { F1_AWARDS };

let memoryFallbackJson = null;

function resolveStorage(explicitStorage = null) {
  if (explicitStorage) return explicitStorage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

export function deriveDriverCode(playerName = 'Pilota') {
  const cleaned = String(playerName || 'Pilota')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase();
  if (!cleaned) return 'PIL';
  return cleaned.slice(0, 3).padEnd(3, 'X');
}

export function getRepresentativeDriverForTeam(teamId = 'ferrari') {
  const validTeamId = F1_2026_TEAMS[teamId] ? teamId : 'ferrari';
  const teamDrivers = F1_2026_DRIVERS.filter((d) => d.teamId === validTeamId);
  return teamDrivers[1] || teamDrivers[0] || F1_2026_DRIVERS[2];
}

function clampPos(val, fallback = 22) {
  const n = Math.floor(Number(val));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(22, n));
}

function clampByte(val, fallback = 0) {
  const n = Math.round(Number(val));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(255, n));
}

function clampUnit(val, fallback = 0.5) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export function rgbToHex(r, g, b) {
  const toHex = (n) => clampByte(n, 0).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function clampCareerRoundIndex(val) {
  const maxIdx = Math.max(0, CALENDAR_2026_TRACKS.length - 1);
  const n = Math.floor(Number(val));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(maxIdx, n));
}

export function getCareerCurrentTrack(state = null) {
  const idx = clampCareerRoundIndex(state?.currentRoundIndex ?? 0);
  return CALENDAR_2026_TRACKS[idx] || CALENDAR_2026_TRACKS[0];
}

export function createEmptySeasonStandings() {
  const drivers = {};
  const driverWins = {};
  for (const d of F1_2026_DRIVERS) {
    drivers[d.id] = 0;
    driverWins[d.id] = 0;
  }
  const teams = {};
  const teamWins = {};
  for (const teamId of Object.keys(F1_2026_TEAMS)) {
    teams[teamId] = 0;
    teamWins[teamId] = 0;
  }
  return { drivers, teams, driverWins, teamWins };
}

function normalizeSeasonStandings(raw = null) {
  const base = createEmptySeasonStandings();
  if (!raw || typeof raw !== 'object') return base;
  for (const d of F1_2026_DRIVERS) {
    base.drivers[d.id] = Math.max(0, Math.floor(Number(raw.drivers?.[d.id]) || 0));
    base.driverWins[d.id] = Math.max(0, Math.floor(Number(raw.driverWins?.[d.id]) || 0));
  }
  for (const teamId of Object.keys(F1_2026_TEAMS)) {
    base.teams[teamId] = Math.max(0, Math.floor(Number(raw.teams?.[teamId]) || 0));
    base.teamWins[teamId] = Math.max(0, Math.floor(Number(raw.teamWins?.[teamId]) || 0));
  }
  return base;
}

function normalizeRoundResults(rawList = null) {
  const count = CALENDAR_2026_TRACKS.length;
  const out = Array(count).fill(null);
  if (!Array.isArray(rawList)) return out;
  for (let i = 0; i < count; i++) {
    const item = rawList[i];
    if (!item || typeof item !== 'object') continue;
    const track = CALENDAR_2026_TRACKS[i];
    const finishPosition = clampPos(item.finishPosition ?? item.playerPosition, 22);
    const polePosition = Boolean(item.polePosition);
    const fastestLap = Boolean(item.fastestLap);
    const gridPosition = clampPos(
      item.gridPosition !== undefined && item.gridPosition !== null
        ? item.gridPosition
        : polePosition
          ? 1
          : finishPosition,
      finishPosition
    );
    const awards = Array.isArray(item.awards)
      ? item.awards.filter((id) => Boolean(F1_AWARDS[id]))
      : evaluateGpAwards({ position: finishPosition, polePosition, fastestLap });

    out[i] = {
      roundIndex: i,
      round: track.round,
      trackId: item.trackId || track.id,
      gpName: item.gpName || track.gpName,
      trackName: item.trackName || track.name,
      winnerDriverId: item.winnerDriverId || null,
      winnerName: item.winnerName || 'Pilota F1',
      winnerTeamId:
        item.winnerTeamId && F1_2026_TEAMS[item.winnerTeamId] ? item.winnerTeamId : 'ferrari',
      gridPosition,
      finishPosition,
      playerPosition: finishPosition,
      playerPoints: Math.max(0, Math.floor(Number(item.playerPoints) || 0)),
      polePosition,
      fastestLap,
      awards,
      presetId: CAREER_WEEKEND_PRESETS[item.presetId] ? item.presetId : DEFAULT_CAREER_PRESET_ID,
      raceLaps: Math.max(
        1,
        Math.floor(Number(item.raceLaps) || getCareerWeekendPreset(item.presetId).raceLaps)
      ),
    };
  }
  return out;
}

function normalizeSeasonHistory(rawHistory = null) {
  if (!Array.isArray(rawHistory)) return [];
  return rawHistory
    .filter((entry) => entry && typeof entry === 'object')
    .slice(-12)
    .map((entry) => ({
      seasonNumber: Math.max(1, Math.floor(Number(entry.seasonNumber) || 1)),
      championDriverId: entry.championDriverId || null,
      championDriverName: entry.championDriverName || 'Pilota F1',
      championDriverPoints: Math.max(0, Math.floor(Number(entry.championDriverPoints) || 0)),
      championTeamId: entry.championTeamId || 'ferrari',
      championTeamName: entry.championTeamName || 'F1 Team',
      championTeamPoints: Math.max(0, Math.floor(Number(entry.championTeamPoints) || 0)),
      playerPosition: clampPos(entry.playerPosition, 22),
      playerTeamPosition: Math.max(
        1,
        Math.min(11, Math.floor(Number(entry.playerTeamPosition) || 1))
      ),
      playerPoints: Math.max(0, Math.floor(Number(entry.playerPoints) || 0)),
      playerWins: Math.max(0, Math.floor(Number(entry.playerWins) || 0)),
      seasonAwards: Array.isArray(entry.seasonAwards)
        ? entry.seasonAwards.filter((id) => Boolean(F1_AWARDS[id]))
        : [],
      completedCareerId: entry.completedCareerId || null,
    }));
}

function normalizeCompletedCareers(rawList = undefined) {
  if (!Array.isArray(rawList)) {
    return [createSimulatedCompletedCareer()];
  }
  return rawList
    .filter((entry) => entry && typeof entry === 'object')
    .slice(0, 24)
    .map((entry, idx) => {
      const teamId = entry.teamId && F1_2026_TEAMS[entry.teamId] ? entry.teamId : 'ferrari';
      const teamMeta = F1_2026_TEAMS[teamId];
      const normalizedRounds = normalizeRoundResults(entry.roundResults);
      const completedRounds = normalizedRounds.filter(Boolean);
      const computedWins = completedRounds.filter((r) => r.finishPosition === 1).length;
      const computedPodiums = completedRounds.filter((r) => r.finishPosition <= 3).length;
      const computedPoles = completedRounds.filter((r) => r.polePosition).length;
      const computedFl = completedRounds.filter((r) => r.fastestLap).length;
      const computedPts = completedRounds.reduce((sum, r) => sum + (r.playerPoints || 0), 0);
      const rawStats = entry.stats || {};
      const playerPosition = clampPos(entry.playerPosition, 22);
      const playerTeamPosition = Math.max(
        1,
        Math.min(11, Math.floor(Number(entry.playerTeamPosition) || 1))
      );
      const seasonAwards = Array.isArray(entry.seasonAwards)
        ? entry.seasonAwards.filter((id) => Boolean(F1_AWARDS[id]))
        : evaluateSeasonAwards({
            playerDriverPosition: playerPosition,
            playerTeamPosition,
          });
      const stats = {
        racesCompleted: Math.max(
          completedRounds.length,
          Math.floor(Number(rawStats.racesCompleted) || 0)
        ),
        wins: Math.max(0, Math.floor(Number(rawStats.wins ?? computedWins) || 0)),
        podiums: Math.max(0, Math.floor(Number(rawStats.podiums ?? computedPodiums) || 0)),
        poles: Math.max(0, Math.floor(Number(rawStats.poles ?? computedPoles) || 0)),
        fastestLaps: Math.max(0, Math.floor(Number(rawStats.fastestLaps ?? computedFl) || 0)),
        points: Math.max(0, Math.floor(Number(rawStats.points ?? computedPts) || 0)),
      };

      return {
        id:
          typeof entry.id === 'string' && entry.id.trim()
            ? entry.id.trim()
            : `career_s${entry.seasonNumber || 1}_${idx + 1}`,
        isSimulated: Boolean(entry.isSimulated),
        seasonNumber: Math.max(1, Math.floor(Number(entry.seasonNumber) || 1)),
        playerName:
          typeof entry.playerName === 'string' && entry.playerName.trim()
            ? entry.playerName.trim().slice(0, 24)
            : 'Pilota F1',
        playerCode: deriveDriverCode(entry.playerName || 'Pilota F1'),
        teamId,
        teamName: entry.teamName || teamMeta?.name || 'F1 Team',
        teamColor: entry.teamColor || teamMeta?.primaryColor || '#DC0000',
        weekendPresetId: CAREER_WEEKEND_PRESETS[entry.weekendPresetId]
          ? entry.weekendPresetId
          : DEFAULT_CAREER_PRESET_ID,
        startedAt: typeof entry.startedAt === 'string' ? entry.startedAt : null,
        completedAt: typeof entry.completedAt === 'string' ? entry.completedAt : null,
        championDriverId: entry.championDriverId || null,
        championDriverName: entry.championDriverName || 'Pilota F1',
        championDriverPoints: Math.max(0, Math.floor(Number(entry.championDriverPoints) || 0)),
        championTeamId:
          entry.championTeamId && F1_2026_TEAMS[entry.championTeamId]
            ? entry.championTeamId
            : teamId,
        championTeamName: entry.championTeamName || teamMeta?.name || 'F1 Team',
        championTeamPoints: Math.max(0, Math.floor(Number(entry.championTeamPoints) || 0)),
        playerPosition,
        playerTeamPosition,
        playerPoints: Math.max(0, Math.floor(Number(entry.playerPoints ?? stats.points) || 0)),
        playerWins: Math.max(0, Math.floor(Number(entry.playerWins ?? stats.wins) || 0)),
        stats,
        seasonAwards,
        awardCounts: countCareerAwards(normalizedRounds, seasonAwards),
        roundResults: normalizedRounds,
      };
    });
}

function computeLifetimeStatsFromCompletedCareers(completedCareers = []) {
  const realCareers = Array.isArray(completedCareers)
    ? completedCareers.filter((c) => c && !c.isSimulated)
    : [];
  const totals = {
    racesCompleted: 0,
    wins: 0,
    podiums: 0,
    poles: 0,
    fastestLaps: 0,
    points: 0,
    lastRacePosition: null,
  };
  for (const c of realCareers) {
    const s = c.stats || {};
    totals.racesCompleted += Math.max(0, Math.floor(Number(s.racesCompleted) || 0));
    totals.wins += Math.max(0, Math.floor(Number(s.wins) || 0));
    totals.podiums += Math.max(0, Math.floor(Number(s.podiums) || 0));
    totals.poles += Math.max(0, Math.floor(Number(s.poles) || 0));
    totals.fastestLaps += Math.max(0, Math.floor(Number(s.fastestLaps) || 0));
    totals.points += Math.max(0, Math.floor(Number(s.points) || 0));
  }
  return totals;
}

export function createDefaultCareerState(overrides = {}) {
  const playerName =
    typeof overrides.playerName === 'string' && overrides.playerName.trim()
      ? overrides.playerName.trim().slice(0, 24)
      : 'Pilota F1';
  const teamId = overrides.teamId && F1_2026_TEAMS[overrides.teamId] ? overrides.teamId : 'ferrari';
  const rawStats = overrides.stats || {};
  const rawPaint = overrides.paint || {};
  const racesCompleted = Math.max(0, Math.floor(Number(rawStats.racesCompleted) || 0));
  const seasonNumber = Math.max(1, Math.floor(Number(overrides.seasonNumber) || 1));
  const normalizedRoundResults = normalizeRoundResults(overrides.roundResults);
  const hasCompletedRounds = normalizedRoundResults.some(Boolean);
  const completedCareers = normalizeCompletedCareers(overrides.completedCareers);

  const hasExplicitStatus =
    overrides.careerStatus === 'active' || overrides.careerStatus === 'not_started';
  const careerStatus = hasExplicitStatus
    ? overrides.careerStatus
    : racesCompleted > 0 || hasCompletedRounds
      ? 'active'
      : 'not_started';
  const startedAt =
    careerStatus === 'active'
      ? typeof overrides.startedAt === 'string' && overrides.startedAt
        ? overrides.startedAt
        : new Date().toISOString()
      : null;

  // Migrazione automatica v1/v2 -> v3: se non ha ancora disputato gare o è not_started, parte sempre da R01
  let currentRoundIndex = 0;
  const hasExplicitRoundIndex =
    overrides.currentRoundIndex !== undefined &&
    overrides.currentRoundIndex !== null &&
    Number.isFinite(Number(overrides.currentRoundIndex));
  if (careerStatus === 'active') {
    if (hasExplicitRoundIndex) {
      currentRoundIndex = clampCareerRoundIndex(overrides.currentRoundIndex);
    } else if (
      racesCompleted > 0 &&
      typeof overrides.selectedTrackId === 'string' &&
      overrides.selectedTrackId
    ) {
      const legacyIdx = CALENDAR_2026_TRACKS.findIndex((t) => t.id === overrides.selectedTrackId);
      currentRoundIndex = legacyIdx >= 0 ? legacyIdx : 0;
    }
    if (seasonNumber === 1 && racesCompleted === 0 && !hasCompletedRounds) {
      currentRoundIndex = 0;
    }
  }
  const activeCareerTrack = CALENDAR_2026_TRACKS[currentRoundIndex] || CALENDAR_2026_TRACKS[0];
  const weekendPresetId = CAREER_WEEKEND_PRESETS[overrides.weekendPresetId]
    ? overrides.weekendPresetId
    : DEFAULT_CAREER_PRESET_ID;

  return {
    version: CAREER_SCHEMA_VERSION,
    careerStatus,
    startedAt,
    playerName,
    playerCode: deriveDriverCode(playerName),
    teamId,
    seasonNumber,
    currentRoundIndex,
    selectedTrackId: activeCareerTrack.id,
    weekendPresetId,
    seasonStandings: normalizeSeasonStandings(overrides.seasonStandings),
    roundResults: normalizedRoundResults,
    seasonHistory: normalizeSeasonHistory(overrides.seasonHistory),
    completedCareers,
    paint: {
      r: clampByte(rawPaint.r, 220),
      g: clampByte(rawPaint.g, 0),
      b: clampByte(rawPaint.b, 0),
      smoothness: clampUnit(rawPaint.smoothness, 0.78),
      metallic: clampUnit(rawPaint.metallic, 0.35),
      useCustomPaint: Boolean(rawPaint.useCustomPaint),
    },
    stats: {
      racesCompleted,
      wins: Math.max(0, Math.floor(Number(rawStats.wins) || 0)),
      podiums: Math.max(0, Math.floor(Number(rawStats.podiums) || 0)),
      poles: Math.max(0, Math.floor(Number(rawStats.poles) || 0)),
      fastestLaps: Math.max(0, Math.floor(Number(rawStats.fastestLaps) || 0)),
      points: Math.max(0, Math.floor(Number(rawStats.points) || 0)),
      lastRacePosition: rawStats.lastRacePosition ?? null,
    },
  };
}

export function saveCareerState(state, explicitStorage = null) {
  const normalized = createDefaultCareerState(state);
  const serialized = JSON.stringify(normalized);
  memoryFallbackJson = serialized;
  const storage = resolveStorage(explicitStorage);
  if (storage && typeof storage.setItem === 'function') {
    storage.setItem(CAREER_STORAGE_KEY, serialized);
  }
  return normalized;
}

export function loadCareerState(explicitStorage = null) {
  const storage = resolveStorage(explicitStorage);
  let rawJson = null;
  if (storage && typeof storage.getItem === 'function') {
    rawJson = storage.getItem(CAREER_STORAGE_KEY);
  } else {
    rawJson = memoryFallbackJson;
  }

  if (!rawJson) {
    const initial = createDefaultCareerState();
    saveCareerState(initial, explicitStorage);
    return initial;
  }

  try {
    const parsed = JSON.parse(rawJson);
    const normalized = createDefaultCareerState(parsed);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Number(parsed.version || 1) < CAREER_SCHEMA_VERSION ||
      normalized.currentRoundIndex !== parsed.currentRoundIndex
    ) {
      saveCareerState(normalized, explicitStorage);
    }
    return normalized;
  } catch {
    return createDefaultCareerState();
  }
}

export function resetCareerState(overrides = {}, explicitStorage = null) {
  const fresh = createDefaultCareerState(overrides);
  return saveCareerState(fresh, explicitStorage);
}

export function startNewCareer(
  state,
  { teamId, playerName, weekendPresetId } = {},
  explicitStorage = null
) {
  const current = createDefaultCareerState(state);
  const nextTeamId = teamId && F1_2026_TEAMS[teamId] ? teamId : current.teamId;
  const nextPlayerName =
    typeof playerName === 'string' && playerName.trim()
      ? playerName.trim().slice(0, 24)
      : current.playerName;
  const nextPresetId = CAREER_WEEKEND_PRESETS[weekendPresetId]
    ? weekendPresetId
    : current.weekendPresetId;

  const next = createDefaultCareerState({
    ...current,
    careerStatus: 'active',
    startedAt: new Date().toISOString(),
    teamId: nextTeamId,
    playerName: nextPlayerName,
    weekendPresetId: nextPresetId,
    currentRoundIndex: 0,
    selectedTrackId: CALENDAR_2026_TRACKS[0].id,
    seasonStandings: createEmptySeasonStandings(),
    roundResults: Array(CALENDAR_2026_TRACKS.length).fill(null),
    stats: computeLifetimeStatsFromCompletedCareers(current.completedCareers),
  });
  return saveCareerState(next, explicitStorage);
}

export function resetActiveCareer(state, explicitStorage = null) {
  const current = createDefaultCareerState(state);
  const next = createDefaultCareerState({
    ...current,
    careerStatus: 'not_started',
    startedAt: null,
    currentRoundIndex: 0,
    selectedTrackId: CALENDAR_2026_TRACKS[0].id,
    seasonStandings: createEmptySeasonStandings(),
    roundResults: Array(CALENDAR_2026_TRACKS.length).fill(null),
    stats: computeLifetimeStatsFromCompletedCareers(current.completedCareers),
  });
  return saveCareerState(next, explicitStorage);
}

export function updateCareerProfile(state, updates = {}, explicitStorage = null) {
  const current = createDefaultCareerState(state);
  const canChangeTeam = current.careerStatus !== 'active';
  const next = createDefaultCareerState({
    ...current,
    ...(updates.playerName !== undefined ? { playerName: updates.playerName } : {}),
    ...(canChangeTeam && updates.teamId !== undefined ? { teamId: updates.teamId } : {}),
    ...(updates.weekendPresetId !== undefined ? { weekendPresetId: updates.weekendPresetId } : {}),
  });
  return saveCareerState(next, explicitStorage);
}

export function updateCareerPaint(state, paintUpdates = {}, explicitStorage = null) {
  const current = createDefaultCareerState(state);
  const next = createDefaultCareerState({
    ...current,
    paint: {
      ...current.paint,
      ...paintUpdates,
    },
  });
  return saveCareerState(next, explicitStorage);
}

export function getCareerDriverStandings(careerState = null) {
  const state = careerState?.version >= CAREER_SCHEMA_VERSION ? careerState : createDefaultCareerState(careerState || {});
  const standingsMap = state.seasonStandings?.drivers || {};
  const winsMap = state.seasonStandings?.driverWins || {};
  const playerRep = getRepresentativeDriverForTeam(state.teamId);

  const rows = F1_2026_DRIVERS.map((driver) => {
    const team = F1_2026_TEAMS[driver.teamId] || F1_2026_TEAMS.ferrari;
    const isPlayer = driver.id === playerRep?.id;
    return {
      driverId: driver.id,
      driverName: isPlayer ? state.playerName : driver.name,
      code: isPlayer ? state.playerCode : driver.code,
      number: driver.number,
      teamId: driver.teamId,
      teamName: team.name,
      color: team.primaryColor,
      points: Math.max(0, Math.floor(Number(standingsMap[driver.id]) || 0)),
      wins: Math.max(0, Math.floor(Number(winsMap[driver.id]) || 0)),
      pace: (driver.skill ?? 0.96) * (team.pace ?? 0.96),
      isPlayer,
    };
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.pace - a.pace;
  });

  return rows.map((row, idx) => ({ ...row, position: idx + 1 }));
}

export function getCareerConstructorStandings(careerState = null) {
  const state = careerState?.version >= CAREER_SCHEMA_VERSION ? careerState : createDefaultCareerState(careerState || {});
  const teamsMap = state.seasonStandings?.teams || {};
  const winsMap = state.seasonStandings?.teamWins || {};

  const rows = Object.values(F1_2026_TEAMS).map((team) => ({
    teamId: team.id,
    teamName: team.name,
    color: team.primaryColor,
    points: Math.max(0, Math.floor(Number(teamsMap[team.id]) || 0)),
    wins: Math.max(0, Math.floor(Number(winsMap[team.id]) || 0)),
    pace: team.pace ?? 0.96,
    isPlayerTeam: team.id === state.teamId,
  }));

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.pace - a.pace;
  });

  return rows.map((row, idx) => ({ ...row, position: idx + 1 }));
}

export function recordCareerRaceResult(
  state,
  {
    position,
    gridPosition = null,
    difficultyId = 'intermediate',
    physicsSettings = null,
    fastestLap = false,
    polePosition = false,
    standings = null,
    playerDriverId = null,
    presetId = null,
    raceLaps = null,
  },
  explicitStorage = null
) {
  const current = createDefaultCareerState(state);
  if (current.careerStatus !== 'active') {
    current.careerStatus = 'active';
    current.startedAt = current.startedAt || new Date().toISOString();
  }

  const safeFinishPos = clampPos(position, 22);
  const safePole = Boolean(polePosition);
  const safeFastestLap = Boolean(fastestLap);
  const safeGridPos = clampPos(
    gridPosition !== null && gridPosition !== undefined && Number.isFinite(Number(gridPosition))
      ? gridPosition
      : safePole
        ? 1
        : safeFinishPos,
    safeFinishPos
  );
  const awards = evaluateGpAwards({
    position: safeFinishPos,
    polePosition: safePole,
    fastestLap: safeFastestLap,
  });
  const reward = {
    gridPosition: safeGridPos,
    finishPosition: safeFinishPos,
    position: safeFinishPos,
    points: F1_POINTS_BY_POSITION[safeFinishPos - 1] ?? 0,
    fastestLap: safeFastestLap,
    polePosition: safePole,
    awards,
  };
  const roundIndex = clampCareerRoundIndex(current.currentRoundIndex);
  const roundTrack = CALENDAR_2026_TRACKS[roundIndex] || CALENDAR_2026_TRACKS[0];
  const usedPreset = getCareerWeekendPreset(presetId || current.weekendPresetId);
  const resolvedRaceLaps = Math.max(1, Math.round(Number(raceLaps) || usedPreset.raceLaps));
  const repDriver = getRepresentativeDriverForTeam(current.teamId);
  const effectivePlayerDriverId =
    playerDriverId && F1_2026_DRIVERS.some((d) => d.id === playerDriverId)
      ? playerDriverId
      : repDriver.id;

  current.stats.racesCompleted += 1;
  if (reward.position === 1) current.stats.wins += 1;
  if (reward.position <= 3) current.stats.podiums += 1;
  if (safePole) current.stats.poles += 1;
  if (safeFastestLap) current.stats.fastestLaps += 1;
  current.stats.points += reward.points;
  current.stats.lastRacePosition = reward.position;

  let winnerDriverId = effectivePlayerDriverId;
  let winnerName = current.playerName;
  let winnerTeamId = current.teamId;

  if (Array.isArray(standings) && standings.length > 0) {
    const ordered = [...standings].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
    for (let i = 0; i < ordered.length; i++) {
      const row = ordered[i];
      const pos = Math.max(1, Math.min(22, Math.floor(Number(row.position) || i + 1)));
      const pts = F1_POINTS_BY_POSITION[pos - 1] ?? 0;
      const isHuman = row.isBot === false || row.id === 'player_1';
      const mappedDriverId =
        row.driverId && F1_2026_DRIVERS.some((d) => d.id === row.driverId)
          ? row.driverId
          : isHuman
            ? effectivePlayerDriverId
            : null;
      const driverMeta = mappedDriverId ? F1_2026_DRIVERS.find((d) => d.id === mappedDriverId) : null;
      const mappedTeamId =
        row.teamId && F1_2026_TEAMS[row.teamId]
          ? row.teamId
          : isHuman
            ? current.teamId
            : driverMeta?.teamId || null;

      if (mappedDriverId) {
        current.seasonStandings.drivers[mappedDriverId] =
          (current.seasonStandings.drivers[mappedDriverId] || 0) + pts;
        if (pos === 1) {
          current.seasonStandings.driverWins[mappedDriverId] =
            (current.seasonStandings.driverWins[mappedDriverId] || 0) + 1;
        }
      }
      if (mappedTeamId) {
        current.seasonStandings.teams[mappedTeamId] =
          (current.seasonStandings.teams[mappedTeamId] || 0) + pts;
        if (pos === 1) {
          current.seasonStandings.teamWins[mappedTeamId] =
            (current.seasonStandings.teamWins[mappedTeamId] || 0) + 1;
        }
      }
      if (pos === 1) {
        winnerDriverId = mappedDriverId || winnerDriverId;
        winnerName = isHuman ? current.playerName : row.driverName || driverMeta?.name || winnerName;
        winnerTeamId = mappedTeamId || winnerTeamId;
      }
    }
  } else {
    current.seasonStandings.drivers[effectivePlayerDriverId] =
      (current.seasonStandings.drivers[effectivePlayerDriverId] || 0) + reward.points;
    current.seasonStandings.teams[current.teamId] =
      (current.seasonStandings.teams[current.teamId] || 0) + reward.points;
    if (reward.position === 1) {
      current.seasonStandings.driverWins[effectivePlayerDriverId] =
        (current.seasonStandings.driverWins[effectivePlayerDriverId] || 0) + 1;
      current.seasonStandings.teamWins[current.teamId] =
        (current.seasonStandings.teamWins[current.teamId] || 0) + 1;
    } else {
      const topRival = F1_2026_DRIVERS.find((d) => d.id !== effectivePlayerDriverId) || F1_2026_DRIVERS[4];
      winnerDriverId = topRival.id;
      winnerName = topRival.name;
      winnerTeamId = topRival.teamId;
    }
  }

  current.roundResults[roundIndex] = {
    roundIndex,
    round: roundTrack.round,
    trackId: roundTrack.id,
    gpName: roundTrack.gpName,
    trackName: roundTrack.name,
    winnerDriverId,
    winnerName,
    winnerTeamId,
    gridPosition: safeGridPos,
    finishPosition: reward.finishPosition,
    playerPosition: reward.position,
    playerPoints: reward.points,
    polePosition: safePole,
    fastestLap: safeFastestLap,
    awards,
    presetId: usedPreset.id,
    raceLaps: resolvedRaceLaps,
  };

  const completedSeasonNumber = current.seasonNumber;
  let seasonCompleted = false;
  let seasonSummary = null;
  let completedCareer = null;

  if (roundIndex < CALENDAR_2026_TRACKS.length - 1) {
    current.currentRoundIndex = roundIndex + 1;
    current.selectedTrackId = CALENDAR_2026_TRACKS[current.currentRoundIndex].id;
  } else {
    seasonCompleted = true;
    const completedAt = new Date().toISOString();
    const finalDrivers = getCareerDriverStandings(current);
    const finalTeams = getCareerConstructorStandings(current);
    const champDriver = finalDrivers[0];
    const champTeam = finalTeams[0];
    const playerStanding = finalDrivers.find((d) => d.isPlayer) || finalDrivers[0];
    const playerTeamStanding = finalTeams.find((t) => t.isPlayerTeam) || finalTeams[0];
    const playerDriverPosition = playerStanding?.position || reward.position;
    const playerTeamPosition = playerTeamStanding?.position || 11;
    const seasonAwards = evaluateSeasonAwards({
      playerDriverPosition,
      playerTeamPosition,
    });
    const archivedRounds = current.roundResults.map((r) =>
      r ? { ...r, awards: Array.isArray(r.awards) ? [...r.awards] : [] } : null
    );
    const validRounds = archivedRounds.filter(Boolean);
    const seasonStats = {
      racesCompleted: validRounds.length,
      wins: validRounds.filter((r) => r.finishPosition === 1).length,
      podiums: validRounds.filter((r) => r.finishPosition <= 3).length,
      poles: validRounds.filter((r) => r.polePosition).length,
      fastestLaps: validRounds.filter((r) => r.fastestLap).length,
      points: validRounds.reduce((sum, r) => sum + (r.playerPoints || 0), 0),
    };
    const teamMeta = F1_2026_TEAMS[current.teamId] || F1_2026_TEAMS.ferrari;
    const completedCareerId = `career_s${completedSeasonNumber}_${Date.now()}`;

    completedCareer = {
      id: completedCareerId,
      isSimulated: false,
      seasonNumber: completedSeasonNumber,
      playerName: current.playerName,
      playerCode: current.playerCode,
      teamId: current.teamId,
      teamName: teamMeta?.name || 'F1 Team',
      teamColor: teamMeta?.primaryColor || '#DC0000',
      weekendPresetId: usedPreset.id,
      startedAt: current.startedAt || completedAt,
      completedAt,
      championDriverId: champDriver?.driverId || null,
      championDriverName: champDriver?.driverName || current.playerName,
      championDriverPoints: champDriver?.points || 0,
      championTeamId: champTeam?.teamId || current.teamId,
      championTeamName: champTeam?.teamName || 'F1 Team',
      championTeamPoints: champTeam?.points || 0,
      playerPosition: playerDriverPosition,
      playerTeamPosition,
      playerPoints: playerStanding?.points ?? seasonStats.points,
      playerWins: playerStanding?.wins ?? seasonStats.wins,
      stats: seasonStats,
      seasonAwards,
      awardCounts: countCareerAwards(archivedRounds, seasonAwards),
      roundResults: archivedRounds,
    };

    seasonSummary = {
      seasonNumber: completedSeasonNumber,
      championDriverId: completedCareer.championDriverId,
      championDriverName: completedCareer.championDriverName,
      championDriverPoints: completedCareer.championDriverPoints,
      championTeamId: completedCareer.championTeamId,
      championTeamName: completedCareer.championTeamName,
      championTeamPoints: completedCareer.championTeamPoints,
      playerPosition: completedCareer.playerPosition,
      playerTeamPosition: completedCareer.playerTeamPosition,
      playerPoints: completedCareer.playerPoints,
      playerWins: completedCareer.playerWins,
      seasonAwards,
      completedCareerId,
    };

    current.completedCareers = [completedCareer, ...(current.completedCareers || [])].slice(0, 24);
    current.seasonHistory.push(seasonSummary);
    current.careerStatus = 'not_started';
    current.startedAt = null;
    current.seasonNumber = completedSeasonNumber + 1;
    current.currentRoundIndex = 0;
    current.selectedTrackId = CALENDAR_2026_TRACKS[0].id;
    current.seasonStandings = createEmptySeasonStandings();
    current.roundResults = Array(CALENDAR_2026_TRACKS.length).fill(null);
  }

  const saved = saveCareerState(current, explicitStorage);
  return {
    state: saved,
    reward,
    completedRoundIndex: roundIndex,
    completedRound: roundTrack,
    completedSeasonNumber,
    seasonCompleted,
    seasonSummary,
    completedCareer,
    nextTrack: getCareerCurrentTrack(saved),
  };
}

export function exportCareerJson(state) {
  return JSON.stringify(createDefaultCareerState(state), null, 2);
}

export function importCareerJson(jsonString, explicitStorage = null) {
  const parsed = JSON.parse(jsonString);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('File salvataggio Carriera non valido.');
  }
  const normalized = createDefaultCareerState(parsed);
  return saveCareerState(normalized, explicitStorage);
}
