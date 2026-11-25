/**
 * Pre-calcolatore deterministico della Traiettoria Ideale (Racing Line) e del
 * Profilo Velocità a 2 passate (Forward/Backward) per tutti i 24 circuiti F1 2026
 * (Step 4 — PIANO PRE STEP 4).
 *
 * Algoritmo:
 * 1. Ottimizzazione coarse-to-fine a curvatura minima (esterno -> apex -> esterno)
 *    entro il corridoio sicuro ±(halfWidth - margin), garantendo 0 track limits e 0 urti.
 * 2. Calcolo curvatura reale della traiettoria ottimizzata + limite laterale aero/sterzo.
 * 3. Passata retrograda (frenata) + passata in avanti (accelerazione) su anello chiuso.
 *
 * Modulo puro JavaScript (Node.js headless safe, TypedArrays zero-GC, < 10 ms/circuito).
 */

import { CAR_PHYSICS_CONFIG } from '../config/constants.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calcola la traiettoria ideale e il profilo velocità base per una TrackSurface.
 * @param {object} trackSurface
 */
export function computeTrackRacingLine(trackSurface) {
  const { samples, sampleCount, totalLength, isStreet } = trackSurface;
  const N = sampleCount;
  const stepLen = totalLength / Math.max(1, N);

  // Margine laterale di sicurezza per tenere sempre tutte e 4 le ruote su asfalto
  const edgeMargin = isStreet ? 1.55 : 1.48;
  const maxLat = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const hw = samples[i].halfWidth ?? trackSurface.halfTrackWidth ?? 7.0;
    maxLat[i] = Math.max(1.05, hw - edgeMargin);
  }

  // 1. Ottimizzazione coarse adattiva (~18 m/nodo, max 360 nodi) per cogliere sia tornanti stretti (La Source/Monaco) sia chicane
  const M = Math.min(360, Math.max(140, Math.round(totalLength / 18)));
  const stride = N / M;
  const cX = new Float32Array(M);
  const cZ = new Float32Array(M);
  const cNx = new Float32Array(M);
  const cNz = new Float32Array(M);
  const cMaxLat = new Float32Array(M);
  const cAlpha = new Float32Array(M);

  for (let k = 0; k < M; k++) {
    const idx = Math.floor(k * stride) % N;
    const s = samples[idx];
    cX[k] = s.x;
    cZ[k] = s.z;
    cNx[k] = s.nx;
    cNz[k] = s.nz;
    cMaxLat[k] = maxLat[idx];
    cAlpha[k] = 0;
  }

  // 90 iterazioni Gauss-Seidel (minimizzazione energia elastica / curvatura quadratica ∫k² ds)
  const coarseIters = 90;
  const omega = 0.86;
  for (let iter = 0; iter < coarseIters; iter++) {
    for (let k = 0; k < M; k++) {
      const prev = (k - 1 + M) % M;
      const next = (k + 1) % M;

      const px = cX[prev] + cNx[prev] * cAlpha[prev];
      const pz = cZ[prev] + cNz[prev] * cAlpha[prev];
      const nx = cX[next] + cNx[next] * cAlpha[next];
      const nz = cZ[next] + cNz[next] * cAlpha[next];

      const mx = 0.5 * (px + nx);
      const mz = 0.5 * (pz + nz);

      const targetAlpha = (mx - cX[k]) * cNx[k] + (mz - cZ[k]) * cNz[k];
      const updated = cAlpha[k] + omega * (targetAlpha - cAlpha[k]);
      cAlpha[k] = clamp(updated, -cMaxLat[k], cMaxLat[k]);
    }
  }

  // 2. Upsampling cubico Catmull-Rom periodico su tutti gli N campioni + fine smoothing C2
  const lateralOffset = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const fk = (i / N) * M;
    const k1 = Math.floor(fk) % M;
    const k0 = (k1 - 1 + M) % M;
    const k2 = (k1 + 1) % M;
    const k3 = (k1 + 2) % M;
    const u = fk - Math.floor(fk);
    const u2 = u * u;
    const u3 = u2 * u;

    const a0 = cAlpha[k0];
    const a1 = cAlpha[k1];
    const a2 = cAlpha[k2];
    const a3 = cAlpha[k3];
    const interp =
      0.5 *
      (2 * a1 +
        (-a0 + a2) * u +
        (2 * a0 - 5 * a1 + 4 * a2 - a3) * u2 +
        (-a0 + 3 * a1 - 3 * a2 + a3) * u3);

    lateralOffset[i] = clamp(interp, -maxLat[i], maxLat[i]);
  }

  const tmpOffset = new Float32Array(N);
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 0; i < N; i++) {
      const iPrev = (i - 1 + N) % N;
      const iNext = (i + 1) % N;
      const sm = 0.25 * lateralOffset[iPrev] + 0.5 * lateralOffset[i] + 0.25 * lateralOffset[iNext];
      tmpOffset[i] = clamp(sm, -maxLat[i], maxLat[i]);
    }
    lateralOffset.set(tmpOffset);
  }

  // 3. Coordinate mondo, tangenti, lunghezza d'arco e curvatura della traiettoria ideale
  const x = new Float32Array(N);
  const z = new Float32Array(N);
  const tx = new Float32Array(N);
  const tz = new Float32Array(N);
  const ds = new Float32Array(N);
  const curvature = new Float32Array(N);
  const signedCurvature = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    const s = samples[i];
    x[i] = s.x + s.nx * lateralOffset[i];
    z[i] = s.z + s.nz * lateralOffset[i];
  }

  for (let i = 0; i < N; i++) {
    const prev = (i - 1 + N) % N;
    const next = (i + 1) % N;
    const dx = x[next] - x[prev];
    const dz = z[next] - z[prev];
    const len = Math.max(1e-6, Math.hypot(dx, dz));
    tx[i] = dx / len;
    tz[i] = dz / len;
    ds[i] = Math.max(0.25, Math.hypot(x[next] - x[i], z[next] - z[i]));
  }

  // Curvatura su tripla corda (±1, ±2 e ±5 campioni) per non lisciare mai tornanti stretti su piste lunghe (es. La Source a Spa)
  for (let i = 0; i < N; i++) {
    const a1 = (i - 1 + N) % N;
    const b1 = (i + 1) % N;
    const cross1 = tx[a1] * tz[b1] - tz[a1] * tx[b1];
    const dot1 = tx[a1] * tx[b1] + tz[a1] * tz[b1];
    const k1 = Math.atan2(cross1, dot1) / Math.max(1.0, 2 * stepLen);

    const a2 = (i - 2 + N) % N;
    const b2 = (i + 2) % N;
    const cross2 = tx[a2] * tz[b2] - tz[a2] * tx[b2];
    const dot2 = tx[a2] * tx[b2] + tz[a2] * tz[b2];
    const k2 = Math.atan2(cross2, dot2) / Math.max(1.0, 4 * stepLen);

    const a5 = (i - 5 + N) % N;
    const b5 = (i + 5) % N;
    const cross5 = tx[a5] * tz[b5] - tz[a5] * tx[b5];
    const dot5 = tx[a5] * tx[b5] + tz[a5] * tz[b5];
    const k5 = Math.atan2(cross5, dot5) / Math.max(1.0, 10 * stepLen);

    let dominant = k2;
    if (Math.abs(k1) > Math.abs(dominant)) dominant = k1;
    if (Math.abs(k5) > Math.abs(dominant)) dominant = k5;
    signedCurvature[i] = dominant;
    curvature[i] = Math.max(Math.abs(k1), Math.abs(k2), Math.abs(k5));
  }

  // 4. Profilo velocità ideale a 2 passate (Lateral/Steer Limit -> Backward Braking -> Forward Accel)
  const cornerSpeed = new Float32Array(N);
  const baseSpeed = new Float32Array(N);
  const maxTopSpeed = 93.2; // ~335 km/h
  const maxEffSteer = CAR_PHYSICS_CONFIG.maxSteerAngle * 0.83;
  const wheelbase = CAR_PHYSICS_CONFIG.wheelbase;
  const steerScale = CAR_PHYSICS_CONFIG.highSpeedSteerScale;
  const steerExp = CAR_PHYSICS_CONFIG.highSpeedSteerExponent;

  for (let i = 0; i < N; i++) {
    const k = curvature[i];
    if (k < 0.0007) {
      cornerSpeed[i] = maxTopSpeed;
      baseSpeed[i] = maxTopSpeed;
      continue;
    }

    // Stima grip laterale prudenziale coerente con carico aerodinamico v² (margine anti-uscita chicane)
    const v0 = Math.sqrt(30.5 / k);
    const v0Ratio = clamp(v0 / 93.5, 0, 1);
    const aeroLatAccel = 30.5 * (1.0 + 0.50 * v0Ratio * v0Ratio);
    const vGrip = Math.sqrt(aeroLatAccel / k);

    // Limite geometrico da attenuazione sterzo ad alta velocità (impedisce di arrivare larghi)
    const reqSteer = Math.atan(k * wheelbase) * 1.32;
    let vSteer = maxTopSpeed;
    if (reqSteer >= maxEffSteer) {
      vSteer = steerScale * 0.88;
    } else if (reqSteer > 0.001) {
      vSteer =
        steerScale * Math.pow(maxEffSteer / reqSteer - 1, 1 / steerExp) * 0.95;
    }

    const vCap = clamp(Math.min(vGrip, vSteer), 13.5, maxTopSpeed);
    cornerSpeed[i] = vCap;
    baseSpeed[i] = vCap;
  }

  // Passata retrograda (2 giri completi sull'anello chiuso per chiudere la staccata di Curva 1)
  const refBrakeDecel = isStreet ? 20.5 : 22.5;
  for (let lap = 0; lap < 2; lap++) {
    for (let i = N - 1; i >= 0; i--) {
      const next = (i + 1) % N;
      const vNext = baseSpeed[next];
      const vMaxBefore = Math.sqrt(vNext * vNext + 2 * refBrakeDecel * ds[i]);
      if (vMaxBefore < baseSpeed[i]) {
        baseSpeed[i] = vMaxBefore;
      }
    }
  }

  // Passata in avanti (accelerazione progressiva motore F1)
  for (let lap = 0; lap < 2; lap++) {
    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      const vCur = baseSpeed[i];
      const ratio = clamp(vCur / maxTopSpeed, 0, 1);
      const aAccel = 2.8 + 15.5 * (1.0 - 0.65 * ratio * ratio);
      const vNextMax = Math.sqrt(vCur * vCur + 2 * aAccel * ds[i]);
      if (vNextMax < baseSpeed[next]) {
        baseSpeed[next] = vNextMax;
      }
    }
  }

  // Diagnostica apples-to-apples (±3 campioni come TrackSurface.js): riduzione energia curvatura ∫k² ds
  let sumCenterK = 0;
  let sumIdealK = 0;
  let sumCenterKSq = 0;
  let sumIdealKSq = 0;
  for (let i = 0; i < N; i++) {
    const ck = samples[i].curvature ?? 0;
    const a3 = (i - 3 + N) % N;
    const b3 = (i + 3) % N;
    const cross3 = tx[a3] * tz[b3] - tz[a3] * tx[b3];
    const dot3 = tx[a3] * tx[b3] + tz[a3] * tz[b3];
    const ik3 = Math.abs(Math.atan2(cross3, dot3)) / Math.max(1e-3, 6 * stepLen);
    sumCenterK += ck;
    sumIdealK += ik3;
    sumCenterKSq += ck * ck;
    sumIdealKSq += ik3 * ik3;
  }

  return {
    sampleCount: N,
    stepLen,
    edgeMargin,
    maxLat,
    lateralOffset,
    x,
    z,
    tx,
    tz,
    ds,
    curvature,
    signedCurvature,
    cornerSpeed,
    baseSpeed,
    avgCenterCurvature: sumCenterK / N,
    avgIdealCurvature: sumIdealK / N,
    rmsCenterCurvature: Math.sqrt(sumCenterKSq / N),
    rmsIdealCurvature: Math.sqrt(sumIdealKSq / N),
  };
}

/**
 * Campiona in modo continuo (zero allocazioni se `out` fornito) la traiettoria ideale
 * a una determinata distanza d'arco lungo il circuito.
 */
export function sampleRacingLineAtArcDistance(trackSurface, arcDist, out = {}) {
  const rl = trackSurface?.racingLine;
  const { samples, sampleCount, totalLength } = trackSurface;
  const wrapped = ((arcDist % totalLength) + totalLength) % totalLength;
  const fIdx = (wrapped / totalLength) * sampleCount;
  const i0 = Math.floor(fIdx) % sampleCount;
  const i1 = (i0 + 1) % sampleCount;
  const alpha = fIdx - Math.floor(fIdx);

  const sa = samples[i0];
  const sb = samples[i1];

  const cx = sa.x + (sb.x - sa.x) * alpha;
  const cz = sa.z + (sb.z - sa.z) * alpha;
  const rawTx = sa.tx + (sb.tx - sa.tx) * alpha;
  const rawTz = sa.tz + (sb.tz - sa.tz) * alpha;
  const tLen = Math.max(1e-6, Math.hypot(rawTx, rawTz));
  const ctx = rawTx / tLen;
  const ctz = rawTz / tLen;
  const cnx = ctz;
  const cnz = -ctx;

  out.centerX = cx;
  out.centerZ = cz;
  out.tx = ctx;
  out.tz = ctz;
  out.nx = cnx;
  out.nz = cnz;
  out.halfWidth =
    (sa.halfWidth ?? trackSurface.halfTrackWidth) +
    ((sb.halfWidth ?? trackSurface.halfTrackWidth) - (sa.halfWidth ?? trackSurface.halfTrackWidth)) *
      alpha;

  if (rl) {
    const lat = rl.lateralOffset[i0] + (rl.lateralOffset[i1] - rl.lateralOffset[i0]) * alpha;
    out.lateralOffset = lat;
    out.x = cx + cnx * lat;
    out.z = cz + cnz * lat;
    out.curvature = rl.curvature[i0] + (rl.curvature[i1] - rl.curvature[i0]) * alpha;
    out.signedCurvature =
      rl.signedCurvature[i0] + (rl.signedCurvature[i1] - rl.signedCurvature[i0]) * alpha;
    out.cornerSpeed = rl.cornerSpeed[i0] + (rl.cornerSpeed[i1] - rl.cornerSpeed[i0]) * alpha;
    out.baseSpeed = rl.baseSpeed[i0] + (rl.baseSpeed[i1] - rl.baseSpeed[i0]) * alpha;
    out.maxLat = rl.maxLat[i0] + (rl.maxLat[i1] - rl.maxLat[i0]) * alpha;
  } else {
    out.lateralOffset = 0;
    out.x = cx;
    out.z = cz;
    out.curvature = sa.curvature ?? 0;
    out.signedCurvature = 0;
    out.cornerSpeed = 93.0;
    out.baseSpeed = 93.0;
    out.maxLat = Math.max(1.2, out.halfWidth - 1.55);
  }
  return out;
}
