/**
 * Gestione Carriera, Economia (premi in denaro), 5 Aree Upgrade, Campionato Stagionale 24 GP
 * e Salvataggio Persistente v2 (con migrazione automatica v1 -> v2).
 * Puro JavaScript compatibile sia con localStorage nel browser sia con storage iniettato nei test.
 */

import {
  CAREER_WEEKEND_PRESETS,
  DEFAULT_CAREER_PRESET_ID,
  F1_2026_DRIVERS,
  F1_2026_TEAMS,
  getCareerWeekendPreset,
} from '../config/f1_2026_data.js';
import { UPGRADE_CATEGORIES, UPGRADE_MAX_LEVEL } from '../cars/CarSpecs.js';
import { computeCareerPrizeMultiplier } from '../config/physicsSettings.js';
import { CALENDAR_2026_TRACKS } from '../tracks/calendar2026/index.js';

export const CAREER_STORAGE_KEY = 'f1_game_career_v1';
export const CAREER_SCHEMA_VERSION = 2;
export const INITIAL_CAREER_MONEY = 200000;

export const RACE_PRIZE_BY_POSITION = [
  1000000, // P1
  700000,  // P2
  500000,  // P3
  380000,  // P4
  310000,  // P5
  260000,  // P6
  220000,  // P7
  190000,  // P8
  165000,  // P9
  145000,  // P10
  125000,  // P11
  110000,  // P12
  100000,  // P13
  92000,   // P14
  85000,   // P15
  80000,   // P16
  75000,   // P17
  70000,   // P18
  65000,   // P19
  60000,   // P20
  55000,   // P21
  50000,   // P22
];

export const F1_POINTS_BY_POSITION = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export const DIFFICULTY_PRIZE_MULTIPLIER = {
  beginner: 1.0,
  intermediate: 1.15,
  realistic: 1.35,
};

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

export function formatCurrencyEUR(amount) {
  const num = Math.max(0, Math.round(Number(amount) || 0));
  const formatted = String(num).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted} €`;
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

function clampUpgrade(val) {
  const n = Math.floor(Number(val) || 0);
  return Math.max(0, Math.min(UPGRADE_MAX_LEVEL, n));
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
    out[i] = {
      roundIndex: i,
      round: track.round,
      trackId: item.trackId || track.id,
      gpName: item.gpName || track.gpName,
      trackName: item.trackName || track.name,
      winnerDriverId: item.winnerDriverId || null,
      winnerName: item.winnerName || 'Pilota F1',
      winnerTeamId: item.winnerTeamId && F1_2026_TEAMS[item.winnerTeamId] ? item.winnerTeamId : 'ferrari',
      playerPosition: Math.max(1, Math.min(22, Math.floor(Number(item.playerPosition) || 22))),
      playerPoints: Math.max(0, Math.floor(Number(item.playerPoints) || 0)),
      polePosition: Boolean(item.polePosition),
      fastestLap: Boolean(item.fastestLap),
      presetId: CAREER_WEEKEND_PRESETS[item.presetId] ? item.presetId : DEFAULT_CAREER_PRESET_ID,
      raceLaps: Math.max(1, Math.floor(Number(item.raceLaps) || getCareerWeekendPreset(item.presetId).raceLaps)),
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
      playerPosition: Math.max(1, Math.min(22, Math.floor(Number(entry.playerPosition) || 22))),
      playerPoints: Math.max(0, Math.floor(Number(entry.playerPoints) || 0)),
      playerWins: Math.max(0, Math.floor(Number(entry.playerWins) || 0)),
    }));
}

export function createDefaultCareerState(overrides = {}) {
  const playerName =
    typeof overrides.playerName === 'string' && overrides.playerName.trim()
      ? overrides.playerName.trim().slice(0, 24)
      : 'Pilota F1';
  const teamId = overrides.teamId && F1_2026_TEAMS[overrides.teamId] ? overrides.teamId : 'ferrari';
  const rawUpgrades = overrides.upgrades || {};
  const rawStats = overrides.stats || {};
  const rawPaint = overrides.paint || {};
  const racesCompleted = Math.max(0, Math.floor(Number(rawStats.racesCompleted) || 0));
  const seasonNumber = Math.max(1, Math.floor(Number(overrides.seasonNumber) || 1));
  const normalizedRoundResults = normalizeRoundResults(overrides.roundResults);
  const hasCompletedRounds = normalizedRoundResults.some(Boolean);

  // Migrazione automatica v1 -> v2: se non ha ancora disputato gare, inizia sempre da R01 (Melbourne)
  let currentRoundIndex = 0;
  const hasExplicitRoundIndex =
    overrides.currentRoundIndex !== undefined &&
    overrides.currentRoundIndex !== null &&
    Number.isFinite(Number(overrides.currentRoundIndex));
  if (hasExplicitRoundIndex) {
    currentRoundIndex = clampCareerRoundIndex(overrides.currentRoundIndex);
  } else if (racesCompleted > 0 && typeof overrides.selectedTrackId === 'string' && overrides.selectedTrackId) {
    const legacyIdx = CALENDAR_2026_TRACKS.findIndex((t) => t.id === overrides.selectedTrackId);
    currentRoundIndex = legacyIdx >= 0 ? legacyIdx : 0;
  }
  if (seasonNumber === 1 && racesCompleted === 0 && !hasCompletedRounds) {
    currentRoundIndex = 0;
  }
  const activeCareerTrack = CALENDAR_2026_TRACKS[currentRoundIndex] || CALENDAR_2026_TRACKS[0];
  const weekendPresetId = CAREER_WEEKEND_PRESETS[overrides.weekendPresetId]
    ? overrides.weekendPresetId
    : DEFAULT_CAREER_PRESET_ID;

  return {
    version: CAREER_SCHEMA_VERSION,
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
    money:
      Number.isFinite(overrides.money) && overrides.money >= 0
        ? Math.round(overrides.money)
        : INITIAL_CAREER_MONEY,
    paint: {
      r: clampByte(rawPaint.r, 220),
      g: clampByte(rawPaint.g, 0),
      b: clampByte(rawPaint.b, 0),
      smoothness: clampUnit(rawPaint.smoothness, 0.78),
      metallic: clampUnit(rawPaint.metallic, 0.35),
      useCustomPaint: Boolean(rawPaint.useCustomPaint),
    },
    upgrades: {
      engine: clampUpgrade(rawUpgrades.engine),
      tires: clampUpgrade(rawUpgrades.tires),
      suspension: clampUpgrade(rawUpgrades.suspension),
      brakes: clampUpgrade(rawUpgrades.brakes),
      aero: clampUpgrade(rawUpgrades.aero),
    },
    stats: {
      racesCompleted,
      wins: Math.max(0, Math.floor(Number(rawStats.wins) || 0)),
      podiums: Math.max(0, Math.floor(Number(rawStats.podiums) || 0)),
      poles: Math.max(0, Math.floor(Number(rawStats.poles) || 0)),
      points: Math.max(0, Math.floor(Number(rawStats.points) || 0)),
      totalEarnings: Math.max(0, Math.floor(Number(rawStats.totalEarnings) || 0)),
      lastRacePosition: rawStats.lastRacePosition ?? null,
      lastPrizeMoney: rawStats.lastPrizeMoney ?? null,
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

export function updateCareerProfile(state, updates = {}, explicitStorage = null) {
  const next = createDefaultCareerState({
    ...state,
    ...(updates.playerName !== undefined ? { playerName: updates.playerName } : {}),
    ...(updates.teamId !== undefined ? { teamId: updates.teamId } : {}),
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

export function grantCareerFreeCash(state, amount = 250000, explicitStorage = null) {
  const current = createDefaultCareerState(state);
  current.money += Math.max(0, Math.round(Number(amount) || 0));
  return saveCareerState(current, explicitStorage);
}

export function getUpgradeCost(categoryId, currentLevel) {
  const cat = UPGRADE_CATEGORIES[categoryId];
  if (!cat) return null;
  const lvl = clampUpgrade(currentLevel);
  if (lvl >= UPGRADE_MAX_LEVEL) return null;
  return cat.costs[lvl] ?? null;
}

export function purchaseCareerUpgrade(state, categoryId, explicitStorage = null) {
  const cat = UPGRADE_CATEGORIES[categoryId];
  if (!cat) {
    return { ok: false, reason: 'Reparto non valido.', state };
  }

  const current = createDefaultCareerState(state);
  const curLvl = current.upgrades[categoryId] ?? 0;
  if (curLvl >= UPGRADE_MAX_LEVEL) {
    return { ok: false, reason: `${cat.label} già al livello massimo.`, state: current };
  }

  const cost = getUpgradeCost(categoryId, curLvl);
  if (cost === null || current.money < cost) {
    return {
      ok: false,
      reason: `Fondi insufficienti per ${cat.label} (servono ${formatCurrencyEUR(cost)}).`,
      cost,
      state: current,
    };
  }

  current.money -= cost;
  current.upgrades[categoryId] = curLvl + 1;
  const saved = saveCareerState(current, explicitStorage);

  return {
    ok: true,
    categoryId,
    cost,
    newLevel: saved.upgrades[categoryId],
    state: saved,
  };
}

export function calculateRacePrize(
  position,
  difficultyOrPhysics = 'intermediate',
  fastestLap = false
) {
  const safePos = Math.max(1, Math.min(22, Math.floor(Number(position) || 22)));
  const basePrize = RACE_PRIZE_BY_POSITION[safePos - 1] ?? 50000;
  let difficultyMultiplier = 1.0;
  if (difficultyOrPhysics && typeof difficultyOrPhysics === 'object') {
    difficultyMultiplier = Number.isFinite(difficultyOrPhysics.prizeMultiplier)
      ? difficultyOrPhysics.prizeMultiplier
      : computeCareerPrizeMultiplier(difficultyOrPhysics);
  } else {
    difficultyMultiplier = DIFFICULTY_PRIZE_MULTIPLIER[difficultyOrPhysics] ?? 1.0;
  }
  const fastestLapBonus = fastestLap ? 75000 : 0;
  const totalPrize = Math.round(basePrize * difficultyMultiplier) + fastestLapBonus;
  const points = F1_POINTS_BY_POSITION[safePos - 1] ?? 0;

  return {
    position: safePos,
    basePrize,
    difficultyMultiplier,
    fastestLapBonus,
    totalPrize,
    points,
  };
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
  const reward = calculateRacePrize(position, physicsSettings || difficultyId, fastestLap);
  const roundIndex = clampCareerRoundIndex(current.currentRoundIndex);
  const roundTrack = CALENDAR_2026_TRACKS[roundIndex] || CALENDAR_2026_TRACKS[0];
  const usedPreset = getCareerWeekendPreset(presetId || current.weekendPresetId);
  const resolvedRaceLaps = Math.max(1, Math.round(Number(raceLaps) || usedPreset.raceLaps));
  const repDriver = getRepresentativeDriverForTeam(current.teamId);
  const effectivePlayerDriverId =
    playerDriverId && F1_2026_DRIVERS.some((d) => d.id === playerDriverId)
      ? playerDriverId
      : repDriver.id;

  current.money += reward.totalPrize;
  current.stats.racesCompleted += 1;
  if (reward.position === 1) current.stats.wins += 1;
  if (reward.position <= 3) current.stats.podiums += 1;
  if (polePosition) current.stats.poles += 1;
  current.stats.points += reward.points;
  current.stats.totalEarnings += reward.totalPrize;
  current.stats.lastRacePosition = reward.position;
  current.stats.lastPrizeMoney = reward.totalPrize;

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
    playerPosition: reward.position,
    playerPoints: reward.points,
    polePosition: Boolean(polePosition),
    fastestLap: Boolean(fastestLap),
    presetId: usedPreset.id,
    raceLaps: resolvedRaceLaps,
  };

  const completedSeasonNumber = current.seasonNumber;
  let seasonCompleted = false;
  let seasonSummary = null;

  if (roundIndex < CALENDAR_2026_TRACKS.length - 1) {
    current.currentRoundIndex = roundIndex + 1;
    current.selectedTrackId = CALENDAR_2026_TRACKS[current.currentRoundIndex].id;
  } else {
    seasonCompleted = true;
    const finalDrivers = getCareerDriverStandings(current);
    const finalTeams = getCareerConstructorStandings(current);
    const champDriver = finalDrivers[0];
    const champTeam = finalTeams[0];
    const playerStanding = finalDrivers.find((d) => d.isPlayer) || finalDrivers[0];
    seasonSummary = {
      seasonNumber: completedSeasonNumber,
      championDriverId: champDriver?.driverId || null,
      championDriverName: champDriver?.driverName || current.playerName,
      championDriverPoints: champDriver?.points || 0,
      championTeamId: champTeam?.teamId || current.teamId,
      championTeamName: champTeam?.teamName || 'F1 Team',
      championTeamPoints: champTeam?.points || 0,
      playerPosition: playerStanding?.position || reward.position,
      playerPoints: playerStanding?.points || 0,
      playerWins: playerStanding?.wins || 0,
    };
    current.seasonHistory.push(seasonSummary);
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
