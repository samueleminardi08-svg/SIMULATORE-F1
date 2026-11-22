/**
 * Genera il set di texture PBR seamless 1024x1024 (`diff.webp`, `nor_gl.webp`, `rough.webp`)
 * per `public/assets/3d/textures/asphalt_track/` partendo dalla fascia più nitida e granulare
 * della foto Monza in `assets_import/textures/custom_asphalt_source.jpg`.
 *
 * Pipeline multi-scala (resistente al mipmapping fino a 40+ m):
 * 1. Estrazione banda asfalto frontale nitida (`top: 254, height: 190`) + de-lighting passa-alto
 * 2. Strato meso/coarse (75%): upsample 1.6x (grana 3-5 px) + sintesi toroidale 6x6 con varianza Heitz-Neyret
 * 3. Strato micro/fine (25%): sintesi toroidale 8x8 nativa 1:1 per dettaglio ravvicinato
 * 4. Modulazione periodica seamless delle corsie gommate F1 (scuro in traiettoria, grana chiara ai lati)
 * 5. Normal map OpenGL (+Y up) Scharr 3x3 intensa (strength 6.0) + Roughness map esattamente su media 212
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const SOURCE_PATH = path.join(ROOT, 'assets_import', 'textures', 'custom_asphalt_source.jpg');
const OUT_DIR = path.join(ROOT, 'public', 'assets', '3d', 'textures', 'asphalt_track');

const OUT_SIZE = 1024;
const TARGET_DIFF_MEAN = [92, 93, 95];
const TARGET_DIFF_MIN_STD = 29.0;
const TARGET_ROUGH_MEAN = 212;
const NORMAL_STRENGTH = 6.0;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleTransform(buf, w, h, px, py, u, v, patchSize, rot, flipX, flipY) {
  const sx = flipX ? patchSize - 1 - u : u;
  const sy = flipY ? patchSize - 1 - v : v;
  let rx = sx;
  let ry = sy;
  if (rot === 1) {
    rx = patchSize - 1 - sy;
    ry = sx;
  } else if (rot === 2) {
    rx = patchSize - 1 - sx;
    ry = patchSize - 1 - sy;
  } else if (rot === 3) {
    rx = sy;
    ry = patchSize - 1 - sx;
  }
  const ix = clamp(px + rx, 0, w - 1);
  const iy = clamp(py + ry, 0, h - 1);
  return (iy * w + ix) * 3;
}

function synthesizeToroidalLayer(srcFloat, srcW, srcH, patchSize, gridDim, baseLevel, seed) {
  const rand = mulberry32(seed);
  const maxPx = Math.max(1, srcW - patchSize);
  const maxPy = Math.max(1, srcH - patchSize);
  const patchOrigins = [];
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    patchOrigins.push({
      px: Math.round(t * maxPx),
      py: Math.round(rand() * maxPy),
    });
  }

  const patchWeights = new Float32Array(patchSize * patchSize);
  for (let v = 0; v < patchSize; v++) {
    const wy = Math.sin((Math.PI * (v + 0.5)) / patchSize);
    const wy2 = wy * wy;
    for (let u = 0; u < patchSize; u++) {
      const wx = Math.sin((Math.PI * (u + 0.5)) / patchSize);
      patchWeights[v * patchSize + u] = wx * wx * wy2;
    }
  }

  const outPixels = OUT_SIZE * OUT_SIZE;
  const sumW = new Float32Array(outPixels);
  const sumW2 = new Float32Array(outPixels);
  const sumWV = new Float32Array(outPixels * 3);

  const step = OUT_SIZE / gridDim;
  const jitterAmp = Math.round(step * 0.42);

  for (let gy = 0; gy < gridDim; gy++) {
    for (let gx = 0; gx < gridDim; gx++) {
      const origin = patchOrigins[Math.floor(rand() * patchOrigins.length)];
      const rot = Math.floor(rand() * 4);
      const flipX = rand() < 0.5;
      const flipY = rand() < 0.5;
      const jitterX = Math.round((rand() - 0.5) * jitterAmp);
      const jitterY = Math.round((rand() - 0.5) * jitterAmp);
      const dstX0 = Math.round(gx * step) + jitterX;
      const dstY0 = Math.round(gy * step) + jitterY;

      for (let v = 0; v < patchSize; v++) {
        const oy = (((dstY0 + v) % OUT_SIZE) + OUT_SIZE) % OUT_SIZE;
        const rowBase = oy * OUT_SIZE;
        const wRowBase = v * patchSize;

        for (let u = 0; u < patchSize; u++) {
          const w = patchWeights[wRowBase + u];
          if (w <= 1e-6) continue;
          const ox = (((dstX0 + u) % OUT_SIZE) + OUT_SIZE) % OUT_SIZE;
          const outIdx = rowBase + ox;
          const srcIdx = sampleTransform(
            srcFloat,
            srcW,
            srcH,
            origin.px,
            origin.py,
            u,
            v,
            patchSize,
            rot,
            flipX,
            flipY
          );

          sumW[outIdx] += w;
          sumW2[outIdx] += w * w;
          const cOut = outIdx * 3;
          sumWV[cOut] += w * srcFloat[srcIdx];
          sumWV[cOut + 1] += w * srcFloat[srcIdx + 1];
          sumWV[cOut + 2] += w * srcFloat[srcIdx + 2];
        }
      }
    }
  }

  const outFloat = new Float32Array(outPixels * 3);
  for (let i = 0; i < outPixels; i++) {
    const sw = Math.max(1e-5, sumW[i]);
    const sw2 = Math.max(1e-8, sumW2[i]);
    const varScale = Math.min(2.35, sw / Math.sqrt(sw2));
    const cIdx = i * 3;
    for (let c = 0; c < 3; c++) {
      const meanVal = sumWV[cIdx + c] / sw;
      outFloat[cIdx + c] = baseLevel + (meanVal - baseLevel) * varScale;
    }
  }
  return outFloat;
}

async function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    throw new Error(`Immagine sorgente non trovata: ${SOURCE_PATH}`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const meta = await sharp(SOURCE_PATH).metadata();
  const extractBox = {
    left: 0,
    top: Math.min(254, Math.max(0, (meta.height || 444) - 190)),
    width: meta.width || 666,
    height: Math.min(190, meta.height || 190),
  };

  const cropSharp = sharp(SOURCE_PATH).extract(extractBox).removeAlpha();
  const { data: origBuf, info } = await cropSharp.clone().raw().toBuffer({ resolveWithObject: true });
  const { data: blurBuf } = await cropSharp.clone().blur(22).raw().toBuffer({ resolveWithObject: true });

  const srcW = info.width;
  const srcH = info.height;
  const totalSrc = srcW * srcH;
  const baseLevel = 96.0;
  const leveledUint8 = Buffer.alloc(totalSrc * 3);
  const leveledFloat = new Float32Array(totalSrc * 3);

  for (let i = 0; i < totalSrc * 3; i++) {
    const val = clamp(baseLevel + (origBuf[i] - blurBuf[i]) * 1.28, 12.0, 238.0);
    leveledFloat[i] = val;
    leveledUint8[i] = Math.round(val);
  }

  // Strato Meso/Coarse (75%): upsample 1.6x con nitidezza così la grana resiste al mipmapping fino a 40+ m
  const coarseW = Math.round(srcW * 1.6);
  const coarseH = Math.round(srcH * 1.6);
  const { data: coarseBuf } = await sharp(leveledUint8, {
    raw: { width: srcW, height: srcH, channels: 3 },
  })
    .resize(coarseW, coarseH, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 0.9 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const coarseFloat = new Float32Array(coarseBuf.length);
  for (let i = 0; i < coarseBuf.length; i++) {
    coarseFloat[i] = coarseBuf[i];
  }

  const mesoLayer = synthesizeToroidalLayer(
    coarseFloat,
    coarseW,
    coarseH,
    288,
    6,
    baseLevel,
    20261122
  );
  const microLayer = synthesizeToroidalLayer(
    leveledFloat,
    srcW,
    srcH,
    160,
    8,
    baseLevel,
    20260711
  );

  // Fusione varianza-preservante 75% meso + 25% micro + corsie gommate F1 periodiche
  const outPixels = OUT_SIZE * OUT_SIZE;
  const blendNorm = 1.0 / Math.hypot(0.75, 0.25); // ~1.265
  const preFloat = new Float32Array(outPixels * 3);
  const grooveMaskArr = new Float32Array(outPixels);
  const chanSum = [0, 0, 0];

  for (let y = 0; y < OUT_SIZE; y++) {
    const vNorm = y / OUT_SIZE;
    const rowBase = y * OUT_SIZE;
    for (let x = 0; x < OUT_SIZE; x++) {
      const uNorm = x / OUT_SIZE;
      const uRad = uNorm * Math.PI * 2.0;

      // Doppia scia gommata realistica (100% periodica su [0,1]) + lieve scia longitudinale V
      const g1 = Math.exp(-Math.pow(Math.sin((uNorm - 0.28) * Math.PI), 2) / 0.045);
      const g2 = Math.exp(-Math.pow(Math.sin((uNorm - 0.72) * Math.PI), 2) / 0.045);
      const grooveMask = clamp(0.62 * (g1 + g2) + 0.18 * (0.5 - 0.5 * Math.cos(uRad)), 0, 1);
      const laneTone = 1.10 - 0.25 * grooveMask;
      const vDrag = 1.0 + 0.024 * Math.sin(vNorm * Math.PI * 4.0 + Math.sin(uRad) * 1.4);
      const toneMult = laneTone * vDrag;

      const idx = rowBase + x;
      grooveMaskArr[idx] = grooveMask;
      const cIdx = idx * 3;
      for (let c = 0; c < 3; c++) {
        const dMeso = mesoLayer[cIdx + c] - baseLevel;
        const dMicro = microLayer[cIdx + c] - baseLevel;
        const merged = (baseLevel + (0.75 * dMeso + 0.25 * dMicro) * blendNorm) * toneMult;
        preFloat[cIdx + c] = merged;
        chanSum[c] += merged;
      }
    }
  }

  // Calibra media e contrasto verso ~[92, 93, 95] con stdev croccante ~28-34
  const preMean = [chanSum[0] / outPixels, chanSum[1] / outPixels, chanSum[2] / outPixels];
  const chanVar = [0, 0, 0];
  for (let i = 0; i < outPixels; i++) {
    const b = i * 3;
    for (let c = 0; c < 3; c++) {
      const d = preFloat[b + c] - preMean[c];
      chanVar[c] += d * d;
    }
  }
  const preStd = [
    Math.sqrt(chanVar[0] / outPixels),
    Math.sqrt(chanVar[1] / outPixels),
    Math.sqrt(chanVar[2] / outPixels),
  ];

  const diffRaw = Buffer.alloc(outPixels * 3);
  const heightField = new Float32Array(outPixels);
  let heightSum = 0;

  for (let i = 0; i < outPixels; i++) {
    const b = i * 3;
    const rGain = Math.max(1.0, TARGET_DIFF_MIN_STD / Math.max(1e-3, preStd[0]));
    const gGain = Math.max(1.0, TARGET_DIFF_MIN_STD / Math.max(1e-3, preStd[1]));
    const bGain = Math.max(1.0, TARGET_DIFF_MIN_STD / Math.max(1e-3, preStd[2]));

    const r = clamp(Math.round(TARGET_DIFF_MEAN[0] + (preFloat[b] - preMean[0]) * rGain), 12, 232);
    const g = clamp(Math.round(TARGET_DIFF_MEAN[1] + (preFloat[b + 1] - preMean[1]) * gGain), 12, 232);
    const bl = clamp(Math.round(TARGET_DIFF_MEAN[2] + (preFloat[b + 2] - preMean[2]) * bGain), 12, 234);

    diffRaw[b] = r;
    diffRaw[b + 1] = g;
    diffRaw[b + 2] = bl;

    const lum = (0.299 * r + 0.587 * g + 0.114 * bl) / 255.0;
    heightField[i] = lum;
    heightSum += lum;
  }

  const meanH = heightSum / outPixels;

  // Normal map OpenGL (+Y up) Scharr 3x3 periodica + Roughness esattamente centrata su 212
  const normalRaw = Buffer.alloc(outPixels * 3);
  const roughFloat = new Float32Array(outPixels);
  let roughSum = 0;

  for (let y = 0; y < OUT_SIZE; y++) {
    const ym = (y - 1 + OUT_SIZE) & (OUT_SIZE - 1);
    const yp = (y + 1) & (OUT_SIZE - 1);
    const rM = ym * OUT_SIZE;
    const r0 = y * OUT_SIZE;
    const rP = yp * OUT_SIZE;

    for (let x = 0; x < OUT_SIZE; x++) {
      const xm = (x - 1 + OUT_SIZE) & (OUT_SIZE - 1);
      const xp = (x + 1) & (OUT_SIZE - 1);

      const hTL = heightField[rM + xm];
      const hT = heightField[rM + x];
      const hTR = heightField[rM + xp];
      const hL = heightField[r0 + xm];
      const hR = heightField[r0 + xp];
      const hBL = heightField[rP + xm];
      const hB = heightField[rP + x];
      const hBR = heightField[rP + xp];

      const gx = (-3 * hTL + 3 * hTR - 10 * hL + 10 * hR - 3 * hBL + 3 * hBR) / 32.0;
      const gy = (-3 * hTL - 10 * hT - 3 * hTR + 3 * hBL + 10 * hB + 3 * hBR) / 32.0;

      const nx = -gx * NORMAL_STRENGTH;
      const ny = gy * NORMAL_STRENGTH;
      const nz = 1.0;
      const invLen = 1.0 / Math.hypot(nx, ny, nz);

      const idx = r0 + x;
      const nBase = idx * 3;
      normalRaw[nBase] = clamp(Math.round((nx * invLen * 0.5 + 0.5) * 255), 0, 255);
      normalRaw[nBase + 1] = clamp(Math.round((ny * invLen * 0.5 + 0.5) * 255), 0, 255);
      normalRaw[nBase + 2] = clamp(Math.round((nz * invLen * 0.5 + 0.5) * 255), 128, 255);

      const dev = heightField[idx] - meanH;
      const grooveRoughDelta = 8.0 - 18.0 * grooveMaskArr[idx];
      const rf = TARGET_ROUGH_MEAN + dev * 95.0 + grooveRoughDelta;
      roughFloat[idx] = rf;
      roughSum += rf;
    }
  }

  const actualRoughMean = roughSum / outPixels;
  const roughRaw = Buffer.alloc(outPixels);
  for (let i = 0; i < outPixels; i++) {
    roughRaw[i] = clamp(Math.round(roughFloat[i] - actualRoughMean + TARGET_ROUGH_MEAN), 166, 248);
  }

  const diffOut = path.join(OUT_DIR, 'diff.webp');
  const norOut = path.join(OUT_DIR, 'nor_gl.webp');
  const roughOut = path.join(OUT_DIR, 'rough.webp');

  await sharp(diffRaw, { raw: { width: OUT_SIZE, height: OUT_SIZE, channels: 3 } })
    .webp({ quality: 92, effort: 5 })
    .toFile(diffOut);

  await sharp(normalRaw, { raw: { width: OUT_SIZE, height: OUT_SIZE, channels: 3 } })
    .webp({ quality: 90, effort: 5 })
    .toFile(norOut);

  await sharp(roughRaw, { raw: { width: OUT_SIZE, height: OUT_SIZE, channels: 1 } })
    .grayscale()
    .webp({ quality: 90, effort: 5 })
    .toFile(roughOut);

  for (const file of [diffOut, norOut, roughOut]) {
    const m = await sharp(file).metadata();
    const st = await sharp(file).stats();
    const bytes = fs.statSync(file).size;
    console.log(path.basename(file), {
      w: m.width,
      h: m.height,
      bytes,
      means: st.channels.map((c) => Math.round(c.mean)),
      stds: st.channels.map((c) => Math.round(c.stdev)),
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
