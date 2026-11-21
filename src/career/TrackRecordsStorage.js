/**
 * Gestione persistente dei Record Assoluti per ciascuna delle 24 piste F1 2026:
 * - Miglior giro Qualifica (`qualifyingBestLap`)
 * - Miglior giro Gara (`raceBestLap`)
 * - Miglior giro Prove Libere (`practiceBestLap`)
 * - Migliori 3 Settori (`bestSectors[0..2]`)
 * Puro JavaScript compatibile sia con localStorage nel browser sia con storage iniettato nei test.
 */

export const TRACK_RECORDS_STORAGE_KEY = 'f1_game_track_records_v1';
export const MIN_VALID_SECTOR_SEC = 2.0;
export const MIN_VALID_LAP_SEC = 15.0;
export const RECORD_EPSILON_SEC = 0.0005;

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

function normalizeEntry(raw, includeMode = false) {
  if (!raw || typeof raw !== 'object') return null;
  const time = Number(raw.time);
  if (!Number.isFinite(time) || time <= 0) return null;

  const entry = {
    time,
    driverName:
      typeof raw.driverName === 'string' && raw.driverName.trim()
        ? raw.driverName.trim().slice(0, 32)
        : 'Pilota F1',
    driverCode:
      typeof raw.driverCode === 'string' && raw.driverCode.trim()
        ? raw.driverCode.trim().slice(0, 4).toUpperCase()
        : 'PIL',
    teamId: typeof raw.teamId === 'string' && raw.teamId ? raw.teamId : 'ferrari',
    teamName:
      typeof raw.teamName === 'string' && raw.teamName.trim()
        ? raw.teamName.trim().slice(0, 36)
        : 'F1 Team',
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
  };

  if (includeMode) {
    entry.mode =
      raw.mode === 'qualifying' || raw.mode === 'race' || raw.mode === 'practice'
        ? raw.mode
        : 'practice';
  }
  return entry;
}

function buildEntry(timeSec, meta = {}, includeMode = false) {
  const entry = {
    time: Number(timeSec),
    driverName:
      typeof meta?.driverName === 'string' && meta.driverName.trim()
        ? meta.driverName.trim().slice(0, 32)
        : 'Pilota F1',
    driverCode:
      typeof meta?.driverCode === 'string' && meta.driverCode.trim()
        ? meta.driverCode.trim().replace(/\*$/, '').slice(0, 4).toUpperCase()
        : 'PIL',
    teamId: typeof meta?.teamId === 'string' && meta.teamId ? meta.teamId : 'ferrari',
    teamName:
      typeof meta?.teamName === 'string' && meta.teamName.trim()
        ? meta.teamName.trim().slice(0, 36)
        : 'F1 Team',
    updatedAt: Date.now(),
  };

  if (includeMode) {
    entry.mode =
      meta?.mode === 'qualifying' || meta?.mode === 'race' || meta?.mode === 'practice'
        ? meta.mode
        : 'practice';
  }
  return entry;
}

export function createEmptyTrackRecord(raw = null) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const rawSectors = Array.isArray(src.bestSectors) ? src.bestSectors : [];
  return {
    qualifyingBestLap: normalizeEntry(src.qualifyingBestLap, false),
    raceBestLap: normalizeEntry(src.raceBestLap, false),
    practiceBestLap: normalizeEntry(src.practiceBestLap, false),
    bestSectors: [
      normalizeEntry(rawSectors[0], true),
      normalizeEntry(rawSectors[1], true),
      normalizeEntry(rawSectors[2], true),
    ],
  };
}

export function loadAllTrackRecords(explicitStorage = null) {
  const storage = resolveStorage(explicitStorage);
  let rawJson = null;
  if (storage && typeof storage.getItem === 'function') {
    rawJson = storage.getItem(TRACK_RECORDS_STORAGE_KEY);
  } else {
    rawJson = memoryFallbackJson;
  }

  if (!rawJson) return {};

  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const normalized = {};
    for (const [trackId, rec] of Object.entries(parsed)) {
      if (trackId) {
        normalized[trackId] = createEmptyTrackRecord(rec);
      }
    }
    return normalized;
  } catch {
    return {};
  }
}

export function saveAllTrackRecords(recordsMap, explicitStorage = null) {
  const normalized = {};
  if (recordsMap && typeof recordsMap === 'object') {
    for (const [trackId, rec] of Object.entries(recordsMap)) {
      if (trackId) {
        normalized[trackId] = createEmptyTrackRecord(rec);
      }
    }
  }
  const serialized = JSON.stringify(normalized);
  memoryFallbackJson = serialized;
  const storage = resolveStorage(explicitStorage);
  if (storage && typeof storage.setItem === 'function') {
    storage.setItem(TRACK_RECORDS_STORAGE_KEY, serialized);
  }
  return normalized;
}

export function getTrackRecord(trackId, explicitStorage = null) {
  if (!trackId) return createEmptyTrackRecord();
  const all = loadAllTrackRecords(explicitStorage);
  return createEmptyTrackRecord(all[trackId]);
}

function getLapFieldForMode(sessionMode) {
  if (sessionMode === 'qualifying') return { field: 'qualifyingBestLap', category: 'qualifying' };
  if (sessionMode === 'race') return { field: 'raceBestLap', category: 'race' };
  return { field: 'practiceBestLap', category: 'practice' };
}

export function evaluateSectorRecord(
  trackId,
  sectorIndex,
  durationSec,
  meta = {},
  explicitStorage = null
) {
  const idx = Number(sectorIndex);
  if (
    !trackId ||
    !Number.isInteger(idx) ||
    idx < 0 ||
    idx > 2 ||
    !Number.isFinite(durationSec) ||
    durationSec < MIN_VALID_SECTOR_SEC
  ) {
    return {
      isNewRecord: false,
      isFirstRecord: false,
      sectorIndex: idx,
      time: durationSec,
      previousTime: null,
      delta: null,
      record: getTrackRecord(trackId, explicitStorage),
    };
  }

  const all = loadAllTrackRecords(explicitStorage);
  const record = createEmptyTrackRecord(all[trackId]);
  const prev = record.bestSectors[idx];

  if (prev === null || durationSec < prev.time - RECORD_EPSILON_SEC) {
    record.bestSectors[idx] = buildEntry(durationSec, meta, true);
    all[trackId] = record;
    saveAllTrackRecords(all, explicitStorage);
    return {
      isNewRecord: true,
      isFirstRecord: prev === null,
      sectorIndex: idx,
      time: durationSec,
      previousTime: prev?.time ?? null,
      delta: prev ? durationSec - prev.time : null,
      record,
    };
  }

  return {
    isNewRecord: false,
    isFirstRecord: false,
    sectorIndex: idx,
    time: durationSec,
    previousTime: prev.time,
    delta: durationSec - prev.time,
    record,
  };
}

export function evaluateLapRecord(
  trackId,
  sessionMode,
  lapTimeSec,
  meta = {},
  explicitStorage = null
) {
  const { field, category } = getLapFieldForMode(sessionMode);
  if (!trackId || !Number.isFinite(lapTimeSec) || lapTimeSec < MIN_VALID_LAP_SEC) {
    return {
      isNewRecord: false,
      isFirstRecord: false,
      isOverallTrackRecord: false,
      category,
      time: lapTimeSec,
      previousTime: null,
      delta: null,
      record: getTrackRecord(trackId, explicitStorage),
    };
  }

  const all = loadAllTrackRecords(explicitStorage);
  const record = createEmptyTrackRecord(all[trackId]);
  const prev = record[field];

  const existingTimes = [
    record.qualifyingBestLap?.time,
    record.raceBestLap?.time,
    record.practiceBestLap?.time,
  ].filter((t) => Number.isFinite(t));
  const prevOverallBest = existingTimes.length > 0 ? Math.min(...existingTimes) : null;

  if (prev === null || lapTimeSec < prev.time - RECORD_EPSILON_SEC) {
    record[field] = buildEntry(lapTimeSec, { ...meta, mode: category }, false);
    all[trackId] = record;
    saveAllTrackRecords(all, explicitStorage);
    return {
      isNewRecord: true,
      isFirstRecord: prev === null,
      isOverallTrackRecord:
        prevOverallBest === null || lapTimeSec < prevOverallBest - RECORD_EPSILON_SEC,
      category,
      time: lapTimeSec,
      previousTime: prev?.time ?? null,
      delta: prev ? lapTimeSec - prev.time : null,
      record,
    };
  }

  return {
    isNewRecord: false,
    isFirstRecord: false,
    isOverallTrackRecord: false,
    category,
    time: lapTimeSec,
    previousTime: prev.time,
    delta: lapTimeSec - prev.time,
    record,
  };
}

export function getTheoreticalBestLap(record) {
  if (!record || !Array.isArray(record.bestSectors)) return null;
  const s0 = record.bestSectors[0]?.time;
  const s1 = record.bestSectors[1]?.time;
  const s2 = record.bestSectors[2]?.time;
  if (!Number.isFinite(s0) || !Number.isFinite(s1) || !Number.isFinite(s2)) {
    return null;
  }
  return s0 + s1 + s2;
}

export function resetTrackRecords(trackId = null, explicitStorage = null) {
  if (!trackId) {
    return saveAllTrackRecords({}, explicitStorage);
  }
  const all = loadAllTrackRecords(explicitStorage);
  delete all[trackId];
  return saveAllTrackRecords(all, explicitStorage);
}
