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
    // Track Limits & Penalità ufficiali FIA Art. 33.3
    trackLimitsCount: 0,
    penaltySeconds: 0,
    blackAndWhiteFlag: false,
    currentLapInvalidated: false,
    nextLapInvalidated: false,
    lastLapInvalidated: false,
    inTrackLimitsViolation: false,
    offTrackDuration: 0,
    trackLimitCooldown: 0,
    trackLimitAlertTimer: 0,
    trackLimitAlertText: '',
    trackLimitAlertSeverity: 'warn', // 'warn' | 'bw_flag' | 'penalty'
    wheelsOutsideCount: 0,
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
 * Valuta la regola ufficiale FIA Formula 1 Articolo 33.3:
 * - Le linee bianche che delimitano la pista fanno parte della pista; i cordoli NO.
 * - La vettura è giudicata fuori pista SOLO quando TUTTE E 4 LE RUOTE superano
 *   completamente il bordo esterno della linea bianca sullo stesso lato (nessuna parte
 *   di alcuno pneumatico resta a contatto con la linea bianca).
 * - Qualsiasi ruota in pit lane esenta dal controllo Track Limits.
 *
 * @param {object} car
 * @param {object} trackSurface
 * @param {object} centerQuery
 * @returns {{ allFourOut: boolean, wheelsOutside: number, inPitExempt: boolean }}
 */
export function evaluateFiaTrackLimits(car, trackSurface, centerQuery) {
  if (!car || !trackSurface || !centerQuery) {
    return { allFourOut: false, wheelsOutside: 0, inPitExempt: false };
  }
  if (centerQuery.inPitLane || centerQuery.surface === 'pitlane') {
    return { allFourOut: false, wheelsOutside: 0, inPitExempt: true };
  }

  const cfg = TIMING_CONFIG.fiaTrackLimits;
  const localHalfW = centerQuery.halfTrackWidth ?? trackSurface.halfTrackWidth;
  // Fast-path: se il baricentro è ben all'interno della carreggiata nessuna ruota può superare la linea bianca
  if (centerQuery.absOffset <= localHalfW - 1.75) {
    return { allFourOut: false, wheelsOutside: 0, inPitExempt: false };
  }

  const heading = car.heading ?? 0;
  const sinH = Math.sin(heading);
  const cosH = Math.cos(heading);
  const leftX = cosH;
  const leftZ = -sinH;

  const wheelDefs = [
    [cfg.frontTrackHalfM, cfg.frontAxleZ, cfg.frontTireHalfWidthM],
    [-cfg.frontTrackHalfM, cfg.frontAxleZ, cfg.frontTireHalfWidthM],
    [cfg.rearTrackHalfM, cfg.rearAxleZ, cfg.rearTireHalfWidthM],
    [-cfg.rearTrackHalfM, cfg.rearAxleZ, cfg.rearTireHalfWidthM],
  ];

  let wheelsOutside = 0;
  let firstOutSide = 0;
  let sameSide = true;

  for (let i = 0; i < 4; i++) {
    const [latLocal, fwdLocal, tireHalfW] = wheelDefs[i];
    const wx = car.x + leftX * latLocal + sinH * fwdLocal;
    const wz = car.z + leftZ * latLocal + cosH * fwdLocal;
    const wq = queryTrackSurface(trackSurface, wx, wz, centerQuery.sampleIndex);

    if (wq.inPitLane || wq.surface === 'pitlane') {
      return { allFourOut: false, wheelsOutside: 0, inPitExempt: true };
    }

    const whiteLineOuterEdge =
      (wq.halfTrackWidth ?? trackSurface.halfTrackWidth) - cfg.whiteLineOuterInsetM;
    // Bordo interno dello pneumatico rivolto verso il centro pista: se <= bordo esterno linea bianca è LEGALE
    const tireInnerEdgeAbs = wq.absOffset - tireHalfW;
    if (tireInnerEdgeAbs > whiteLineOuterEdge) {
      wheelsOutside += 1;
      const sideSign = wq.lateralOffset >= 0 ? 1 : -1;
      if (firstOutSide === 0) {
        firstOutSide = sideSign;
      } else if (sideSign !== firstOutSide) {
        sameSide = false;
      }
    }
  }

  return {
    allFourOut: wheelsOutside === 4 && sameSide,
    wheelsOutside,
    inPitExempt: false,
  };
}

/**
 * Registra una violazione di Track Limits secondo il Regolamento Sportivo FIA Art. 33.3:
 * - Qualifiche / Prove Libere: annulla immediatamente il giro corrente; se avviene nell'ultima
 *   curva (ultimi 12% del giro), annulla anche il giro successivo (vantaggio sul rettilineo).
 * - Gara: annulla il tempo giro per il Giro Veloce + sistema progressivo FIA "3 Strikes":
 *   1° Avvertimento, 2° Ultimo Avviso, 3° Bandiera Bianco-Nera, 4° +5s, 5° +10s, 6°+ +5s.
 */
export function recordTrackLimitViolation(timing, sessionMode = 'race', options = {}) {
  if (!timing) return;
  const lapProgress = options.lapProgress ?? timing.lapProgress ?? 0;
  const finalCornerMin = TIMING_CONFIG.fiaTrackLimits.finalCornerProgressMin;
  const isFinalCorner = lapProgress >= finalCornerMin;

  timing.trackLimitsCount = (timing.trackLimitsCount ?? 0) + 1;
  // In tutte le sessioni FIA un giro con track limits non può valere per miglior tempo / giro veloce
  timing.currentLapInvalidated = true;

  if (sessionMode === 'qualifying') {
    if (isFinalCorner) {
      timing.nextLapInvalidated = true;
      timing.trackLimitAlertText =
        'FIA ART. 33.3: GIRO ATTUALE E PROSSIMO ANNULLATI — ULTIMA CURVA';
      timing.trackLimitAlertTimer = 4.4;
    } else {
      timing.trackLimitAlertText =
        'FIA ART. 33.3: GIRO ANNULLATO — 4 RUOTE OLTRE LA LINEA BIANCA';
      timing.trackLimitAlertTimer = 3.8;
    }
    timing.trackLimitAlertSeverity = 'penalty';
  } else if (sessionMode === 'race') {
    const count = timing.trackLimitsCount;
    if (count === 1) {
      timing.trackLimitAlertText = 'FIA ART. 33.3: TRACK LIMITS (1/3) — AVVERTIMENTO';
      timing.trackLimitAlertSeverity = 'warn';
      timing.trackLimitAlertTimer = 3.2;
    } else if (count === 2) {
      timing.trackLimitAlertText = 'FIA ART. 33.3: TRACK LIMITS (2/3) — ULTIMO AVVISO';
      timing.trackLimitAlertSeverity = 'warn';
      timing.trackLimitAlertTimer = 3.4;
    } else if (count === 3) {
      timing.blackAndWhiteFlag = true;
      timing.trackLimitAlertText =
        'BANDIERA BIANCO-NERA (3/3) — PROSSIMA INFRAZIONE: PENALITÀ +5s';
      timing.trackLimitAlertSeverity = 'bw_flag';
      timing.trackLimitAlertTimer = 4.5;
    } else if (count === 4) {
      timing.blackAndWhiteFlag = true;
      timing.penaltySeconds = (timing.penaltySeconds ?? 0) + 5;
      timing.trackLimitAlertText =
        `PENALITÀ +5s — FIA ART. 33.3 (4ª INFRAZIONE) • TOTALE: +${timing.penaltySeconds}s`;
      timing.trackLimitAlertSeverity = 'penalty';
      timing.trackLimitAlertTimer = 4.6;
    } else if (count === 5) {
      timing.blackAndWhiteFlag = true;
      timing.penaltySeconds = (timing.penaltySeconds ?? 0) + 10;
      timing.trackLimitAlertText =
        `PENALITÀ +10s — FIA ART. 33.3 (5ª INFRAZIONE) • TOTALE: +${timing.penaltySeconds}s`;
      timing.trackLimitAlertSeverity = 'penalty';
      timing.trackLimitAlertTimer = 4.8;
    } else {
      timing.blackAndWhiteFlag = true;
      const added = count % 5 === 0 ? 10 : 5;
      timing.penaltySeconds = (timing.penaltySeconds ?? 0) + added;
      timing.trackLimitAlertText =
        `PENALITÀ +${added}s — FIA ART. 33.3 (${count}ª INFRAZIONE) • TOTALE: +${timing.penaltySeconds}s`;
      timing.trackLimitAlertSeverity = 'penalty';
      timing.trackLimitAlertTimer = 4.6;
    }
  } else {
    if (isFinalCorner) {
      timing.nextLapInvalidated = true;
      timing.trackLimitAlertText =
        'TRACK LIMITS (ART. 33.3): GIRO ATTUALE E PROSSIMO ANNULLATI';
      timing.trackLimitAlertTimer = 4.0;
    } else {
      timing.trackLimitAlertText =
        `TRACK LIMITS (${timing.trackLimitsCount}) — GIRO ANNULLATO (4 RUOTE FUORI)`;
      timing.trackLimitAlertTimer = 3.4;
    }
    timing.trackLimitAlertSeverity = 'penalty';
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
  if ((car.recentCarContactTimer ?? 0) > 0) {
    car.recentCarContactTimer = Math.max(0, car.recentCarContactTimer - dt);
  }

  if (raceStatus === 'countdown' || raceStatus === 'grid_wait') {
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

  // Controllo ufficiale FIA Articolo 33.3: tutte e 4 le ruote completamente oltre la linea bianca
  // (i cordoli non fanno parte della pista; pit lane, velocità < 4.5 m/s e contatti recenti esentati)
  const fiaCfg = TIMING_CONFIG.fiaTrackLimits;
  if (!car.raceFinished && raceStatus === 'racing') {
    const pitExemptState = car.pitState && car.pitState !== 'ON_TRACK';
    const justifiedContact = (car.recentCarContactTimer ?? 0) > 0 || Boolean(car.collidingWithBarrier);
    if (pitExemptState || query.surface === 'pitlane' || query.inPitLane) {
      timing.offTrackDuration = 0;
      timing.inTrackLimitsViolation = false;
      timing.wheelsOutsideCount = 0;
    } else {
      const tlEval = evaluateFiaTrackLimits(car, trackSurface, query);
      timing.wheelsOutsideCount = tlEval.wheelsOutside;

      if (tlEval.inPitExempt) {
        timing.offTrackDuration = 0;
        timing.inTrackLimitsViolation = false;
      } else if (tlEval.allFourOut && Math.abs(car.forwardSpeed) >= 4.5 && !justifiedContact) {
        timing.offTrackDuration = (timing.offTrackDuration ?? 0) + dt;
        if (
          !timing.inTrackLimitsViolation &&
          timing.trackLimitCooldown <= 0 &&
          timing.offTrackDuration >= fiaCfg.minViolationDurationS
        ) {
          timing.inTrackLimitsViolation = true;
          timing.trackLimitCooldown = fiaCfg.violationCooldownS;
          recordTrackLimitViolation(timing, sessionMode, { lapProgress: timing.lapProgress });
        }
      } else if (!tlEval.allFourOut && tlEval.wheelsOutside <= 2) {
        // Rientro confermato dentro la linea bianca: azzera stato violazione corrente
        timing.offTrackDuration = 0;
        timing.inTrackLimitsViolation = false;
      }
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

    // Regola FIA Art. 33.3: un giro con violazione track limits non può valere per best lap / giro veloce
    const recordAllowed = !lapInvalid;

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

    const carryNextInvalid = Boolean(timing.nextLapInvalidated);
    timing.completedLaps += 1;
    timing.currentLap += 1;
    timing.currentLapTime = 0;
    timing.sectorStartTime = 0;
    timing.currentSectorIndex = 0;
    timing.highestSectorReached = 0;
    timing.currentLapInvalidated = carryNextInvalid;
    timing.nextLapInvalidated = false;
    if (carryNextInvalid) {
      timing.trackLimitAlertText =
        'FIA ART. 33.3: GIRO ANNULLATO (TRACK LIMITS ULTIMA CURVA GIRO PREC.)';
      timing.trackLimitAlertSeverity = 'penalty';
      timing.trackLimitAlertTimer = 3.2;
    }
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
