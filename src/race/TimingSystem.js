/**
 * Sistema di Cronometraggio a 3 Settori Realistici (S1, S2, S3), Giro e Delta Tempi (Step 4).
 * Completamente disaccoppiato da DOM/Three.js per restare serializzabile in WorldState.
 */

import { TIMING_CONFIG } from '../config/constants.js';
import { queryTrackSurface } from '../tracks/TrackSurface.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Formatta un tempo giro nel formato F1: minuti : secondi . decimi centesimi millesimi
 * Esempio: 83.456 -> "1:23.456"
 * @param {number | null | undefined} seconds
 * @returns {string}
 */
export function formatLapTime(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '--:--.---';
  }
  const totalMs = Math.round(seconds * 1000);
  const minutes = Math.floor(totalMs / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${minutes}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * Formatta il tempo di un singolo settore (es. "26.840" oppure "1:02.150" se >= 60s).
 * @param {number | null | undefined} seconds
 * @returns {string}
 */
export function formatSectorTime(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '--.---';
  }
  const totalMs = Math.round(seconds * 1000);
  if (totalMs >= 60000) {
    return formatLapTime(totalMs / 1000);
  }
  const secs = Math.floor(totalMs / 1000);
  const ms = totalMs % 1000;
  return `${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * Formatta un delta temporale con segno esplicito e 3 decimali (es. "-0.234", "+0.512").
 * @param {number | null | undefined} deltaSeconds
 * @returns {string}
 */
export function formatDeltaTime(deltaSeconds) {
  if (deltaSeconds === null || deltaSeconds === undefined || !Number.isFinite(deltaSeconds)) {
    return '±0.000';
  }
  const totalMs = Math.round(deltaSeconds * 1000);
  if (totalMs === 0) return '+0.000';
  const sign = totalMs > 0 ? '+' : '-';
  const absSec = (Math.abs(totalMs) / 1000).toFixed(3);
  return `${sign}${absSec}`;
}

export function getSectorIndex(lapProgress, sectorSplits) {
  if (lapProgress < sectorSplits[0]) return 0;
  if (lapProgress < sectorSplits[1]) return 1;
  return 2;
}

/**
 * Calcola i tempi di riferimento iniziali dei 3 settori (S1, S2, S3)
 * in base alla lunghezza e alla curvatura reale di ciascun settore.
 */
function computeBaselineSectors(trackSurface, startArcDistance, sectorSplits) {
  const nSectors = TIMING_CONFIG.sectorCount;
  const { samples, sampleCount, totalLength } = trackSurface;
  const stepLen = totalLength / sampleCount;

  const angleSums = new Array(nSectors).fill(0);
  const lengths = new Array(nSectors).fill(0);

  for (let i = 0; i < sampleCount; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % sampleCount];
    const relProgress = ((a.distance - startArcDistance + totalLength) % totalLength) / totalLength;
    const secIdx = getSectorIndex(relProgress, sectorSplits);

    const cross = a.tx * b.tz - a.tz * b.tx;
    const dot = a.tx * b.tx + a.tz * b.tz;
    const dTheta = Math.abs(Math.atan2(cross, dot));

    angleSums[secIdx] += dTheta;
    lengths[secIdx] += stepLen;
  }

  return angleSums.map((thetaSum, idx) => {
    const secLen = Math.max(1, lengths[idx]);
    const avgCurvature = thetaSum / secLen; // rad/m
    const estSpeed = clamp(79.0 - avgCurvature * 6800, 42.0, 79.0);
    return secLen / estSpeed;
  });
}

function buildSplitTimes(sectorDurations) {
  const splits = [];
  let acc = 0;
  for (let i = 0; i < sectorDurations.length; i++) {
    acc += sectorDurations[i];
    splits.push(acc);
  }
  return splits;
}

/**
 * Crea lo stato di cronometraggio globale della sessione (record assoluti per i settori viola).
 */
export function createSessionTimingState(trackSurface, startTransform = { x: 0, z: 0 }) {
  const startQuery = queryTrackSurface(trackSurface, startTransform.x ?? 0, startTransform.z ?? 0);
  const sectorSplits = trackSurface.sectorSplits || TIMING_CONFIG.defaultSectorSplits;
  const baselineOverall = computeBaselineSectors(
    trackSurface,
    startQuery.arcDistance,
    sectorSplits
  );

  return {
    sectorCount: TIMING_CONFIG.sectorCount,
    sectorSplits: [...sectorSplits],
    startArcDistance: startQuery.arcDistance,
    overallBestSectors: baselineOverall,
    overallBestLapTime: null,
    overallBestCarId: null,
  };
}

/**
 * Crea lo stato di cronometraggio individuale di una vettura per i 3 settori (S1, S2, S3).
 * @param {object} trackSurface
 * @param {{ x: number, z: number }} [carTransform] - Posizione iniziale vettura (es. casella griglia)
 * @param {{ x: number, z: number }} [finishLineTransform] - Linea del traguardo comune (default 0,0)
 */
export function createCarTimingState(
  trackSurface,
  carTransform = { x: 0, z: 0 },
  finishLineTransform = { x: 0, z: 0 }
) {
  const lineQuery = queryTrackSurface(
    trackSurface,
    finishLineTransform.x ?? 0,
    finishLineTransform.z ?? 0
  );
  const carQuery = queryTrackSurface(
    trackSurface,
    carTransform.x ?? 0,
    carTransform.z ?? 0
  );
  const sectorSplits = trackSurface.sectorSplits || TIMING_CONFIG.defaultSectorSplits;
  const baselineOverall = computeBaselineSectors(
    trackSurface,
    lineQuery.arcDistance,
    sectorSplits
  );
  // Margine del 5% rispetto al record assoluto: batterlo accende Verde, battere il record accende Viola
  const personalBaseline = baselineOverall.map((t) => t * 1.05);
  const nSectors = TIMING_CONFIG.sectorCount;
  const initialRawProgress =
    ((carQuery.arcDistance - lineQuery.arcDistance + trackSurface.totalLength) %
      trackSurface.totalLength) /
    trackSurface.totalLength;

  return {
    startArcDistance: lineQuery.arcDistance,
    lapStarted: false,
    currentLap: 1,
    completedLaps: 0,
    currentLapTime: 0,
    lastLapTime: null,
    bestLapTime: null,
    liveDelta: 0,
    lapProgress: 0,
    rawLapProgress: initialRawProgress,
    currentSectorIndex: 0,
    highestSectorReached: 0,
    sectorStartTime: 0,
    currentSectorStatuses: new Array(nSectors).fill('pending'),
    currentSectorTimes: new Array(nSectors).fill(null),
    lastLapSectorStatuses: null,
    lastLapSectorTimes: null,
    currentLapSplits: new Array(nSectors).fill(null),
    personalBestSectors: personalBaseline,
    bestLapSplitTimes: buildSplitTimes(personalBaseline),
    // Track Limits & Penalità (Step 8)
    trackLimitsCount: 0,
    penaltySeconds: 0,
    currentLapInvalidated: false,
    lastLapInvalidated: false,
    inTrackLimitsViolation: false,
    offTrackDuration: 0,
    trackLimitCooldown: 0,
    trackLimitAlertTimer: 0,
    trackLimitAlertText: '',
    // Eventi completamento settore/giro per record persistenti pista
    sectorCompletionSeq: 0,
    lastCompletedSector: null,
    lapCompletionSeq: 0,
    lastCompletedLap: null,
  };
}

function getInterpolatedReferenceTime(splitTimes, lapProgress, sectorSplits) {
  if (!splitTimes || splitTimes.length !== 3) return 0;
  const clamped = clamp(lapProgress, 0, 0.999999);
  const idx = getSectorIndex(clamped, sectorSplits);
  const startProg = idx === 0 ? 0 : sectorSplits[idx - 1];
  const endProg = sectorSplits[idx];
  const frac = (clamped - startProg) / Math.max(1e-6, endProg - startProg);
  const prevSplit = idx === 0 ? 0 : splitTimes[idx - 1];
  const nextSplit = splitTimes[idx];
  return prevSplit + (nextSplit - prevSplit) * frac;
}

function finalizeSector(timing, sessionTiming, sectorIdx, duration, isLapInvalidated = false) {
  let status = 'yellow';

  if (!isLapInvalidated) {
    if (duration <= sessionTiming.overallBestSectors[sectorIdx]) {
      status = 'purple';
      sessionTiming.overallBestSectors[sectorIdx] = duration;
      if (duration < timing.personalBestSectors[sectorIdx]) {
        timing.personalBestSectors[sectorIdx] = duration;
      }
    } else if (duration <= timing.personalBestSectors[sectorIdx]) {
      status = 'green';
      timing.personalBestSectors[sectorIdx] = duration;
    }
  }

  timing.currentSectorStatuses[sectorIdx] = status;
  timing.currentSectorTimes[sectorIdx] = duration;
  timing.currentLapSplits[sectorIdx] = timing.currentLapTime;
  timing.sectorCompletionSeq = (timing.sectorCompletionSeq ?? 0) + 1;
  timing.lastCompletedSector = {
    seq: timing.sectorCompletionSeq,
    sectorIndex: sectorIdx,
    duration,
    valid: !isLapInvalidated,
  };
}

/**
 * Registra una violazione di Track Limits e applica la sanzione prevista:
 * - Qualifica / Prove Libere: 1 track limit annulla immediatamente il giro corrente.
 * - Gara: fino a 3 avvertimenti gratis; dal 4° in poi +5s per ogni violazione aggiuntiva.
 */
export function recordTrackLimitViolation(timing, sessionMode = 'race') {
  if (!timing) return;
  timing.trackLimitsCount = (timing.trackLimitsCount ?? 0) + 1;

  if (sessionMode === 'qualifying') {
    timing.currentLapInvalidated = true;
    timing.trackLimitAlertText = 'DIREZIONE GARA: GIRO ANNULLATO — TRACK LIMITS';
    timing.trackLimitAlertTimer = 3.8;
  } else if (sessionMode === 'race') {
    if (timing.trackLimitsCount <= 3) {
      timing.trackLimitAlertText = `DIREZIONE GARA: TRACK LIMITS (${timing.trackLimitsCount}/3) — AVVERTIMENTO`;
      timing.trackLimitAlertTimer = 3.2;
    } else {
      timing.penaltySeconds = (timing.trackLimitsCount - 3) * 5;
      timing.trackLimitAlertText = `PENALITÀ +5s — TRACK LIMITS (${timing.trackLimitsCount}) • TOTALE: +${timing.penaltySeconds}s`;
      timing.trackLimitAlertTimer = 4.2;
    }
  } else {
    timing.currentLapInvalidated = true;
    timing.trackLimitAlertText = `TRACK LIMITS (${timing.trackLimitsCount}) — GIRO ANNULLATO`;
    timing.trackLimitAlertTimer = 3.2;
  }
}

/**
 * Aggiorna il cronometraggio, i 3 settori, track limits e delta live di una vettura ad ogni tick.
 */
export function updateCarTiming(
  car,
  sessionTiming,
  trackSurface,
  dt,
  raceStatus = 'racing',
  sessionMode = 'race'
) {
  if (!car.timing || !sessionTiming || !trackSurface) return;

  const timing = car.timing;
  const nSectors = sessionTiming.sectorCount;
  const sectorSplits = sessionTiming.sectorSplits;

  timing.trackLimitCooldown = Math.max(0, (timing.trackLimitCooldown ?? 0) - dt);
  timing.trackLimitAlertTimer = Math.max(0, (timing.trackLimitAlertTimer ?? 0) - dt);

  if (raceStatus === 'countdown') {
    return;
  }

  if (!timing.lapStarted) {
    if (Math.abs(car.forwardSpeed) > 0.5 || car.throttleInput > 0) {
      timing.lapStarted = true;
    } else {
      return;
    }
  }

  timing.currentLapTime += dt;

  const query = queryTrackSurface(trackSurface, car.x, car.z, car.trackSampleIndex);
  car.trackSampleIndex = query.sampleIndex;

  // Controllo uscita dai limiti della pista (erba oltre il cordolo)
  if (!car.raceFinished && raceStatus === 'racing') {
    if (query.surface === 'grass' && Math.abs(car.forwardSpeed) > 3.0) {
      timing.offTrackDuration = (timing.offTrackDuration ?? 0) + dt;
      if (
        !timing.inTrackLimitsViolation &&
        timing.trackLimitCooldown <= 0 &&
        timing.offTrackDuration >= 0.08
      ) {
        timing.inTrackLimitsViolation = true;
        timing.trackLimitCooldown = 2.5;
        recordTrackLimitViolation(timing, sessionMode);
      }
    } else if (
      query.surface === 'asphalt' &&
      query.absOffset <= (query.halfTrackWidth ?? trackSurface.halfTrackWidth) - 0.25
    ) {
      timing.offTrackDuration = 0;
      timing.inTrackLimitsViolation = false;
    }
  }

  const rawDist =
    (query.arcDistance - timing.startArcDistance + trackSurface.totalLength) %
    trackSurface.totalLength;
  const lapProgress = rawDist / trackSurface.totalLength;
  timing.rawLapProgress = lapProgress;

  // Ignora lieve arretramento dietro la linea del traguardo ad inizio giro
  if (timing.highestSectorReached === 0 && lapProgress > 0.85) {
    timing.lapProgress = 0;
    timing.liveDelta = 0;
    return;
  }

  timing.lapProgress = lapProgress;

  // Calcolo delta continuo rispetto al miglior riferimento personale sui 3 settori
  const refTime = getInterpolatedReferenceTime(
    timing.bestLapSplitTimes,
    lapProgress,
    sectorSplits
  );
  timing.liveDelta = timing.currentLapTime - refTime;

  const prevIdx = timing.currentSectorIndex;
  const nextIdx = getSectorIndex(lapProgress, sectorSplits);

  // 1. Verifica completamento giro valido (passaggio dal Settore 3 al Settore 1 sul traguardo)
  if (prevIdx === nSectors - 1 && timing.highestSectorReached === nSectors - 1 && nextIdx === 0) {
    const lapInvalid = Boolean(timing.currentLapInvalidated);
    const s3Duration = Math.max(0.01, timing.currentLapTime - timing.sectorStartTime);
    finalizeSector(timing, sessionTiming, nSectors - 1, s3Duration, lapInvalid);

    timing.lastLapTime = timing.currentLapTime;
    timing.lastLapInvalidated = lapInvalid;
    timing.lastLapSectorStatuses = [...timing.currentSectorStatuses];
    timing.lastLapSectorTimes = [...timing.currentSectorTimes];

    const recordAllowed = !(
      lapInvalid && (sessionMode === 'qualifying' || sessionMode === 'practice')
    );

    if (recordAllowed) {
      if (timing.bestLapTime === null || timing.lastLapTime < timing.bestLapTime) {
        timing.bestLapTime = timing.lastLapTime;
        timing.bestLapSplitTimes = [...timing.currentLapSplits];
      }

      if (
        sessionTiming.overallBestLapTime === null ||
        timing.lastLapTime < sessionTiming.overallBestLapTime
      ) {
        sessionTiming.overallBestLapTime = timing.lastLapTime;
        sessionTiming.overallBestCarId = car.id;
      }
    }

    timing.lapCompletionSeq = (timing.lapCompletionSeq ?? 0) + 1;
    timing.lastCompletedLap = {
      seq: timing.lapCompletionSeq,
      lapTime: timing.lastLapTime,
      valid: recordAllowed,
      sessionMode,
    };

    timing.completedLaps += 1;
    timing.currentLap += 1;
    timing.currentLapTime = 0;
    timing.sectorStartTime = 0;
    timing.currentSectorIndex = 0;
    timing.highestSectorReached = 0;
    timing.currentLapInvalidated = false;
    timing.currentSectorStatuses = new Array(nSectors).fill('pending');
    timing.currentSectorTimes = new Array(nSectors).fill(null);
    timing.currentLapSplits = new Array(nSectors).fill(null);
    timing.liveDelta = 0;
    return;
  }

  // 2. Passaggio normale al settore successivo (S1 -> S2 o S2 -> S3)
  if (nextIdx > prevIdx) {
    const duration = Math.max(0.01, timing.currentLapTime - timing.sectorStartTime);
    const perSector = duration / (nextIdx - prevIdx);
    const lapInvalid = Boolean(timing.currentLapInvalidated);
    for (let s = prevIdx; s < nextIdx; s++) {
      finalizeSector(timing, sessionTiming, s, perSector, lapInvalid);
    }

    timing.sectorStartTime = timing.currentLapTime;
    timing.currentSectorIndex = nextIdx;
    if (nextIdx > timing.highestSectorReached) {
      timing.highestSectorReached = nextIdx;
    }
  }
}
