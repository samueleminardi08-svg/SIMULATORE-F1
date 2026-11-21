/**
 * Sistema Piste matematico/fisico in JavaScript puro (Step 3).
 * Valuta la spline chiusa (Catmull-Rom centripeta), pre-campiona il tracciato
 * a passo uniforme e permette di interrogare in O(1) ammortizzato:
 * - la superficie sotto una vettura ('asphalt', 'kerb', 'grass');
 * - la distanza laterale dal centro pista e dalle barriere;
 * - tangente e normale per la fisica delle collisioni.
 */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function evalCentripetalSegment(p0, p1, p2, p3, u) {
  const d01 = Math.max(1e-4, Math.hypot(p1[0] - p0[0], p1[2] - p0[2]));
  const d12 = Math.max(1e-4, Math.hypot(p2[0] - p1[0], p2[2] - p1[2]));
  const d23 = Math.max(1e-4, Math.hypot(p3[0] - p2[0], p3[2] - p2[2]));

  const t0 = 0;
  const t1 = t0 + Math.sqrt(d01);
  const t2 = t1 + Math.sqrt(d12);
  const t3 = t2 + Math.sqrt(d23);

  const t = t1 + u * (t2 - t1);

  const lerpPt = (a, b, ta, tb) => {
    const denom = Math.max(1e-6, tb - ta);
    const w0 = (tb - t) / denom;
    const w1 = (t - ta) / denom;
    return [
      a[0] * w0 + b[0] * w1,
      a[1] * w0 + b[1] * w1,
      a[2] * w0 + b[2] * w1,
    ];
  };

  const A1 = lerpPt(p0, p1, t0, t1);
  const A2 = lerpPt(p1, p2, t1, t2);
  const A3 = lerpPt(p2, p3, t2, t3);

  const B1 = lerpPt(A1, A2, t0, t2);
  const B2 = lerpPt(A2, A3, t1, t3);

  return lerpPt(B1, B2, t1, t2);
}

/**
 * Crea la rappresentazione campionata uniforme di un tracciato chiuso.
 * @param {object} trackData
 * @param {number} [sampleCount=1400]
 */
export function createTrackSurface(trackData, sampleCount = 1600) {
  const pts = trackData.controlPoints;
  const nPts = pts.length;
  const rawStepsPerSeg = 32;
  const rawPoints = [];
  const rawLengths = [0];
  let totalLength = 0;

  for (let i = 0; i < nPts; i++) {
    const p0 = pts[(i - 1 + nPts) % nPts];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % nPts];
    const p3 = pts[(i + 2) % nPts];

    for (let s = 0; s < rawStepsPerSeg; s++) {
      const u = s / rawStepsPerSeg;
      const pt = evalCentripetalSegment(p0, p1, p2, p3, u);
      if (rawPoints.length > 0) {
        const prev = rawPoints[rawPoints.length - 1];
        totalLength += Math.hypot(pt[0] - prev[0], pt[2] - prev[2]);
        rawLengths.push(totalLength);
      }
      rawPoints.push(pt);
    }
  }

  // Chiusura verso il primo punto
  const firstPt = rawPoints[0];
  const lastPt = rawPoints[rawPoints.length - 1];
  totalLength += Math.hypot(firstPt[0] - lastPt[0], firstPt[2] - lastPt[2]);
  rawPoints.push(firstPt);
  rawLengths.push(totalLength);

  // Ricampionamento a distanza costante lungo l'arco
  const samples = [];
  let rawIdx = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < sampleCount; i++) {
    const targetDist = (i / sampleCount) * totalLength;
    while (rawIdx < rawLengths.length - 2 && rawLengths[rawIdx + 1] < targetDist) {
      rawIdx++;
    }
    const segStartDist = rawLengths[rawIdx];
    const segEndDist = rawLengths[rawIdx + 1];
    const segLen = Math.max(1e-6, segEndDist - segStartDist);
    const alpha = clamp((targetDist - segStartDist) / segLen, 0, 1);

    const a = rawPoints[rawIdx];
    const b = rawPoints[rawIdx + 1];
    const x = a[0] + (b[0] - a[0]) * alpha;
    const y = a[1] + (b[1] - a[1]) * alpha;
    const z = a[2] + (b[2] - a[2]) * alpha;

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;

    samples.push({
      x,
      y,
      z,
      distance: targetDist,
      tx: 0,
      tz: 1,
      nx: 1,
      nz: 0,
      curvature: 0,
      radius: 100000,
      halfWidth: 7.0,
      hasKerb: false,
      leftBarrierOffset: 0,
      rightBarrierOffset: 0,
    });
  }

  // Calcolo tangenti e normali sinistre unitarie
  for (let i = 0; i < sampleCount; i++) {
    const prev = samples[(i - 1 + sampleCount) % sampleCount];
    const next = samples[(i + 1) % sampleCount];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.max(1e-6, Math.hypot(dx, dz));
    const tx = dx / len;
    const tz = dz / len;
    // Normale sinistra coerente con left = (cos h, -sin h) quando fwd = (sin h, cos h)
    samples[i].tx = tx;
    samples[i].tz = tz;
    samples[i].nx = tz;
    samples[i].nz = -tx;
  }

  // Curvatura locale e maschera cordoli sugli apex (R < 260m, espansa di ±6 campioni)
  const chordSpan = 3;
  const curvWindowRadius = 6;
  const rawKerbMask = new Array(sampleCount).fill(false);

  for (let i = 0; i < sampleCount; i++) {
    const a = samples[(i - chordSpan + sampleCount) % sampleCount];
    const b = samples[(i + chordSpan) % sampleCount];
    const cross = a.tx * b.tz - a.tz * b.tx;
    const dot = a.tx * b.tx + a.tz * b.tz;
    const dTheta = Math.abs(Math.atan2(cross, dot));
    const arcSpan = Math.max(1e-3, (2 * chordSpan * totalLength) / sampleCount);
    const kappa = dTheta / arcSpan;
    const radius = 1 / Math.max(1e-5, kappa);
    samples[i].curvature = kappa;
    samples[i].radius = radius;
    if (radius < 260) {
      rawKerbMask[i] = true;
    }
  }

  for (let i = 0; i < sampleCount; i++) {
    let hasKerb = false;
    for (let k = -curvWindowRadius; k <= curvWindowRadius; k++) {
      if (rawKerbMask[(i + k + sampleCount) % sampleCount]) {
        hasKerb = true;
        break;
      }
    }
    samples[i].hasKerb = hasKerb;
  }

  const trackWidth = trackData.width ?? trackData.trackWidth ?? 14.0;
  const mainStraightWidth = Math.max(trackWidth, trackData.mainStraightWidth ?? trackWidth);
  const isStreet = Boolean(trackData.isStreet);
  const baseHalf = trackWidth * 0.5;
  const straightHalf = mainStraightWidth * 0.5;
  const kerbWidth = trackData.kerbWidth ?? (isStreet ? 1.1 : 1.4);
  const runoffWidth = trackData.runoffWidth ?? (isStreet ? 1.8 : 7.5);
  const sectorSplits = trackData.sectorSplits || [0.33, 0.66, 1.0];

  // Larghezza locale per campione lungo la centerline invariata (allargamento progressivo sul rettilineo principale)
  const startIdxRaw = samples.findIndex((s) => Math.abs(s.x) < 5 && Math.abs(s.z) < 12);
  const startIdx = startIdxRaw >= 0 ? startIdxRaw : 0;
  const startDist = samples[startIdx].distance;

  for (let i = 0; i < sampleCount; i++) {
    let signedDist = samples[i].distance - startDist;
    if (signedDist > totalLength * 0.5) signedDist -= totalLength;
    if (signedDist < -totalLength * 0.5) signedDist += totalLength;

    let straightWeight = 0;
    if (signedDist >= -185 && signedDist <= 85) {
      straightWeight = 1;
    } else if (signedDist >= -250 && signedDist < -185) {
      const t = (signedDist - (-250)) / 65;
      straightWeight = 0.5 * (1 - Math.cos(Math.PI * t));
    } else if (signedDist > 85 && signedDist <= 150) {
      const t = (150 - signedDist) / 65;
      straightWeight = 0.5 * (1 - Math.cos(Math.PI * t));
    }
    samples[i].halfWidth = baseHalf + (straightHalf - baseHalf) * straightWeight;
  }

  // Calcolo offset barriere adattivo per evitare intrusioni tra tratti adiacenti e garantire 0 compenetrazioni sull'asfalto
  const rawLeftOffsets = new Array(sampleCount);
  const rawRightOffsets = new Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const nominalBarrier = samples[i].halfWidth + kerbWidth + runoffWidth;
    rawLeftOffsets[i] = nominalBarrier;
    rawRightOffsets[i] = nominalBarrier;
  }

  const maxNominalBarrier = straightHalf + kerbWidth + runoffWidth;
  const minNonAdjIndexGap = 40;
  const checkMaxDistSq = (maxNominalBarrier * 2.2) ** 2;

  for (let i = 0; i < sampleCount; i++) {
    const s = samples[i];
    const minSafe = s.halfWidth + (s.hasKerb ? kerbWidth + 0.35 : 0.65);
    for (let j = 0; j < sampleCount; j++) {
      const idxDiff = Math.abs(i - j);
      if (idxDiff <= minNonAdjIndexGap || sampleCount - idxDiff <= minNonAdjIndexGap) {
        continue;
      }
      const o = samples[j];
      if (Math.abs(s.y - o.y) >= 3.5) continue;
      const dx = o.x - s.x;
      const dz = o.z - s.z;
      const distSq = dx * dx + dz * dz;
      if (distSq >= checkMaxDistSq) continue;

      const dist = Math.sqrt(distSq);
      const latProj = dx * s.nx + dz * s.nz;
      const clamped = Math.max(minSafe, 0.48 * dist - 0.25);
      if (latProj >= 0 && clamped < rawLeftOffsets[i]) {
        rawLeftOffsets[i] = clamped;
      } else if (latProj < 0 && clamped < rawRightOffsets[i]) {
        rawRightOffsets[i] = clamped;
      }
    }
  }

  let maxBarrierHalfWidth = maxNominalBarrier;
  for (let i = 0; i < sampleCount; i++) {
    let sumL = 0;
    let sumR = 0;
    for (let k = -3; k <= 3; k++) {
      const idx = (i + k + sampleCount) % sampleCount;
      sumL += rawLeftOffsets[idx];
      sumR += rawRightOffsets[idx];
    }
    const floorOffset = samples[i].halfWidth + (samples[i].hasKerb ? kerbWidth + 0.35 : 0.65);
    samples[i].leftBarrierOffset = Math.max(floorOffset, sumL / 7);
    samples[i].rightBarrierOffset = Math.max(floorOffset, sumR / 7);
    if (samples[i].leftBarrierOffset > maxBarrierHalfWidth) {
      maxBarrierHalfWidth = samples[i].leftBarrierOffset;
    }
    if (samples[i].rightBarrierOffset > maxBarrierHalfWidth) {
      maxBarrierHalfWidth = samples[i].rightBarrierOffset;
    }
  }

  return {
    id: trackData.id,
    name: trackData.name,
    width: trackWidth,
    trackWidth,
    mainStraightWidth,
    isStreet,
    runoffWidth,
    totalLength,
    sampleCount,
    samples,
    halfTrackWidth: baseHalf,
    kerbWidth,
    barrierHalfWidth: maxBarrierHalfWidth,
    sectorSplits,
    bounds: { minX, maxX, minY, maxY, minZ, maxZ },
  };
}

function searchClosestInRange(samples, x, z, startIdx, count, totalCount) {
  let bestDistSq = Infinity;
  let bestIdx = 0;
  let bestProjX = 0;
  let bestProjZ = 0;
  let bestTSeg = 0;

  for (let k = 0; k < count; k++) {
    const i = ((startIdx + k) % totalCount + totalCount) % totalCount;
    const iNext = (i + 1) % totalCount;
    const a = samples[i];
    const b = samples[iNext];

    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const abLenSq = Math.max(1e-6, abx * abx + abz * abz);
    const tSeg = clamp(((x - a.x) * abx + (z - a.z) * abz) / abLenSq, 0, 1);

    const projX = a.x + tSeg * abx;
    const projZ = a.z + tSeg * abz;
    const dx = x - projX;
    const dz = z - projZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIdx = i;
      bestProjX = projX;
      bestProjZ = projZ;
      bestTSeg = tSeg;
    }
  }

  return { bestDistSq, bestIdx, bestProjX, bestProjZ, bestTSeg };
}

/**
 * Interroga la superficie del tracciato sotto le coordinate globali (x, z).
 * @param {ReturnType<typeof createTrackSurface>} trackSurface
 * @param {number} x
 * @param {number} z
 * @param {number | null} [hintIndex=null]
 */
export function queryTrackSurface(trackSurface, x, z, hintIndex = null) {
  const { samples, sampleCount, halfTrackWidth, kerbWidth, barrierHalfWidth } = trackSurface;

  let match;
  if (hintIndex !== null && hintIndex >= 0 && hintIndex < sampleCount) {
    const windowRadius = 45;
    match = searchClosestInRange(
      samples,
      x,
      z,
      hintIndex - windowRadius,
      windowRadius * 2 + 1,
      sampleCount
    );
    // Fallback globale se la vettura è molto lontana dalla finestra locale
    const fallbackThresholdSq = (barrierHalfWidth * 2.2) ** 2;
    if (match.bestDistSq > fallbackThresholdSq) {
      match = searchClosestInRange(samples, x, z, 0, sampleCount, sampleCount);
    }
  } else {
    match = searchClosestInRange(samples, x, z, 0, sampleCount, sampleCount);
  }

  const a = samples[match.bestIdx];
  const b = samples[(match.bestIdx + 1) % sampleCount];
  const tSeg = match.bestTSeg;

  // Interpolazione morbida della tangente e normale
  const rawTx = a.tx + (b.tx - a.tx) * tSeg;
  const rawTz = a.tz + (b.tz - a.tz) * tSeg;
  const tLen = Math.max(1e-6, Math.hypot(rawTx, rawTz));
  const tx = rawTx / tLen;
  const tz = rawTz / tLen;
  const nx = tz;
  const nz = -tx;

  const elevation = a.y + (b.y - a.y) * tSeg;
  const lateralOffset = (x - match.bestProjX) * nx + (z - match.bestProjZ) * nz;
  const absOffset = Math.abs(lateralOffset);
  const localHalfWidth =
    (a.halfWidth ?? halfTrackWidth) +
    ((b.halfWidth ?? halfTrackWidth) - (a.halfWidth ?? halfTrackWidth)) * tSeg;
  const barA =
    lateralOffset >= 0
      ? (a.leftBarrierOffset ?? barrierHalfWidth)
      : (a.rightBarrierOffset ?? barrierHalfWidth);
  const barB =
    lateralOffset >= 0
      ? (b.leftBarrierOffset ?? barrierHalfWidth)
      : (b.rightBarrierOffset ?? barrierHalfWidth);
  const localBarrierHalfWidth = barA + (barB - barA) * tSeg;

  let surface = 'grass';
  if (absOffset <= localHalfWidth) {
    surface = 'asphalt';
  } else if (absOffset <= localHalfWidth + kerbWidth && a.hasKerb) {
    surface = 'kerb';
  }

  const arcDistance = a.distance + tSeg * (trackSurface.totalLength / sampleCount);

  return {
    surface,
    elevation,
    lateralOffset,
    absOffset,
    sampleIndex: match.bestIdx,
    arcDistance,
    closestX: match.bestProjX,
    closestZ: match.bestProjZ,
    tx,
    tz,
    nx,
    nz,
    halfTrackWidth: localHalfWidth,
    barrierHalfWidth: localBarrierHalfWidth,
  };
}
