/**
 * Gestione Carriera, Economia (premi in denaro), 5 Aree Upgrade e Salvataggio Persistente (Step 9).
 * Puro JavaScript compatibile sia con localStorage nel browser sia con storage iniettato nei test.
 */

import { F1_2026_DRIVERS, F1_2026_TEAMS } from '../config/f1_2026_data.js';
import { UPGRADE_CATEGORIES, UPGRADE_MAX_LEVEL } from '../cars/CarSpecs.js';

export const CAREER_STORAGE_KEY = 'f1_game_career_v1';
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

export function createDefaultCareerState(overrides = {}) {
  const playerName =
    typeof overrides.playerName === 'string' && overrides.playerName.trim()
      ? overrides.playerName.trim().slice(0, 24)
      : 'Pilota F1';
  const teamId = overrides.teamId && F1_2026_TEAMS[overrides.teamId] ? overrides.teamId : 'ferrari';
  const rawUpgrades = overrides.upgrades || {};
  const rawStats = overrides.stats || {};
  const rawPaint = overrides.paint || {};

  return {
    version: 1,
    playerName,
    playerCode: deriveDriverCode(playerName),
    teamId,
    careerFormat: overrides.careerFormat === 'race' ? 'race' : 'qualifying',
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
      racesCompleted: Math.max(0, Math.floor(Number(rawStats.racesCompleted) || 0)),
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
    return createDefaultCareerState(parsed);
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
    ...(updates.careerFormat !== undefined ? { careerFormat: updates.careerFormat } : {}),
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
  difficultyId = 'intermediate',
  fastestLap = false
) {
  const safePos = Math.max(1, Math.min(22, Math.floor(Number(position) || 22)));
  const basePrize = RACE_PRIZE_BY_POSITION[safePos - 1] ?? 50000;
  const difficultyMultiplier = DIFFICULTY_PRIZE_MULTIPLIER[difficultyId] ?? 1.0;
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

export function recordCareerRaceResult(
  state,
  { position, difficultyId = 'intermediate', fastestLap = false, polePosition = false },
  explicitStorage = null
) {
  const current = createDefaultCareerState(state);
  const reward = calculateRacePrize(position, difficultyId, fastestLap);

  current.money += reward.totalPrize;
  current.stats.racesCompleted += 1;
  if (reward.position === 1) current.stats.wins += 1;
  if (reward.position <= 3) current.stats.podiums += 1;
  if (polePosition) current.stats.poles += 1;
  current.stats.points += reward.points;
  current.stats.totalEarnings += reward.totalPrize;
  current.stats.lastRacePosition = reward.position;
  current.stats.lastPrizeMoney = reward.totalPrize;

  const saved = saveCareerState(current, explicitStorage);
  return { state: saved, reward };
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
