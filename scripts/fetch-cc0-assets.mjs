#!/usr/bin/env node
/**
 * Scarica automaticamente gli asset CC0 gratuiti (Poly Haven & AmbientCG):
 * - 8 set Texture PBR 2K (asfalto, pit lane, ghiaia, sabbia, cemento, metallo, erba)
 * - 4 HDRI 1K (asciutto, pioggia, notte, studio garage)
 * - 16 Modelli 3D 1K (alberi/natura per bioma, prop pista, attrezzatura box F1) impacchettati in .glb Draco
 *
 * Uso: node scripts/fetch-cc0-assets.mjs [--force]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, draco, textureCompress } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import {
  POLYHAVEN_TEXTURES,
  AMBIENTCG_TEXTURES,
  POLYHAVEN_HDRIS,
  POLYHAVEN_MODELS,
  rebuildManifestAndCredits,
} from './asset-catalog.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ASSETS_ROOT = path.join(PROJECT_ROOT, 'public', 'assets', '3d');
const FORCE = process.argv.includes('--force');
const USER_AGENT = 'F1Sim3D/1.0 (+https://github.com/samueleminardi08-svg/SIMULATORE-F1)';

function fileExistsNonEmpty(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).size > 0;
  } catch {
    return false;
  }
}

async function fetchWithRetry(url, responseType = 'buffer', attempts = 3) {
  let lastErr = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'follow',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      if (responseType === 'json') return await res.json();
      const arrBuf = await res.arrayBuffer();
      return Buffer.from(arrBuf);
    } catch (err) {
      lastErr = err;
      if (i < attempts) {
        await new Promise((r) => setTimeout(r, 700 * i));
      }
    }
  }
  throw lastErr;
}

async function downloadToFile(url, destPath) {
  if (!FORCE && fileExistsNonEmpty(destPath)) {
    return { status: 'skipped', bytes: fs.statSync(destPath).size };
  }
  const buf = await fetchWithRetry(url, 'buffer');
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  return { status: 'downloaded', bytes: buf.length };
}

async function runPool(items, concurrency, worker) {
  const results = [];
  let nextIdx = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIdx < items.length) {
      const idx = nextIdx++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

async function createGltfNodeIO() {
  const [decoder, encoder] = await Promise.all([
    draco3d.createDecoderModule(),
    draco3d.createEncoderModule(),
  ]);
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': decoder,
      'draco3d.encoder': encoder,
    });
  let sharp = null;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    sharp = null;
  }
  let lock = Promise.resolve();
  const runExclusive = (fn) => {
    const next = lock.then(fn, fn);
    lock = next.catch(() => {});
    return next;
  };
  return { io, sharp, runExclusive };
}

async function downloadPolyHavenTexture(id) {
  const destDir = path.join(ASSETS_ROOT, 'textures', id);
  const diffDest = path.join(destDir, 'diff.jpg');
  const norDest = path.join(destDir, 'nor_gl.jpg');
  const roughDest = path.join(destDir, 'rough.jpg');

  if (!FORCE && fileExistsNonEmpty(diffDest) && fileExistsNonEmpty(norDest) && fileExistsNonEmpty(roughDest)) {
    const total = fs.statSync(diffDest).size + fs.statSync(norDest).size + fs.statSync(roughDest).size;
    return { label: `tex:${id}`, status: 'skipped', bytes: total };
  }

  const info = await fetchWithRetry(`https://api.polyhaven.com/files/${id}`, 'json');
  const diffUrl = info.Diffuse?.['2k']?.jpg?.url || info.Diffuse?.['1k']?.jpg?.url;
  const norUrl = info.nor_gl?.['2k']?.jpg?.url || info.nor_gl?.['2k']?.png?.url || info.nor_gl?.['1k']?.jpg?.url;
  const roughUrl = info.Rough?.['2k']?.jpg?.url || info.arm?.['2k']?.jpg?.url || info.Rough?.['1k']?.jpg?.url;

  if (!diffUrl || !norUrl || !roughUrl) {
    throw new Error(`Mappe PBR mancanti su Poly Haven per ${id}`);
  }

  const [r1, r2, r3] = await Promise.all([
    downloadToFile(diffUrl, diffDest),
    downloadToFile(norUrl, norDest),
    downloadToFile(roughUrl, roughDest),
  ]);
  return {
    label: `tex:${id}`,
    status: r1.status === 'downloaded' || r2.status === 'downloaded' || r3.status === 'downloaded' ? 'downloaded' : 'skipped',
    bytes: r1.bytes + r2.bytes + r3.bytes,
  };
}

function findFileRecursive(dir, regex) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFileRecursive(full, regex);
      if (found) return found;
    } else if (regex.test(entry.name)) {
      return full;
    }
  }
  return null;
}

async function downloadAmbientCgTexture(entry) {
  const destDir = path.join(ASSETS_ROOT, 'textures', entry.id);
  const diffDest = path.join(destDir, 'diff.jpg');
  const norDest = path.join(destDir, 'nor_gl.jpg');
  const roughDest = path.join(destDir, 'rough.jpg');

  if (!FORCE && fileExistsNonEmpty(diffDest) && fileExistsNonEmpty(norDest) && fileExistsNonEmpty(roughDest)) {
    const total = fs.statSync(diffDest).size + fs.statSync(norDest).size + fs.statSync(roughDest).size;
    return { label: `tex:${entry.id}`, status: 'skipped', bytes: total };
  }

  const zipUrl = `https://ambientcg.com/get?file=${entry.ambientcgId}_${entry.resolution}.zip`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `acg-${entry.id}-`));
  const zipPath = path.join(tmpDir, `${entry.ambientcgId}.zip`);
  const extractDir = path.join(tmpDir, 'extracted');

  try {
    const zipBuf = await fetchWithRetry(zipUrl, 'buffer');
    fs.writeFileSync(zipPath, zipBuf);
    fs.mkdirSync(extractDir, { recursive: true });

    if (process.platform === 'win32') {
      execFileSync(
        'powershell.exe',
        ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${extractDir}' -Force`],
        { stdio: 'pipe' }
      );
    } else {
      execFileSync('unzip', ['-o', zipPath, '-d', extractDir], { stdio: 'pipe' });
    }

    const colorSrc = findFileRecursive(extractDir, /_Color\.jpg$/i);
    const normalSrc = findFileRecursive(extractDir, /_NormalGL\.jpg$/i);
    const roughSrc = findFileRecursive(extractDir, /_Roughness\.jpg$/i);

    if (!colorSrc || !normalSrc || !roughSrc) {
      throw new Error(`Mappe mancanti dentro lo ZIP AmbientCG per ${entry.ambientcgId}`);
    }

    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(colorSrc, diffDest);
    fs.copyFileSync(normalSrc, norDest);
    fs.copyFileSync(roughSrc, roughDest);

    const bytes = fs.statSync(diffDest).size + fs.statSync(norDest).size + fs.statSync(roughDest).size;
    return { label: `tex:${entry.id}`, status: 'downloaded', bytes };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function downloadPolyHavenHdri(entry) {
  const destPath = path.join(ASSETS_ROOT, 'hdri', `${entry.id}.hdr`);
  const minBytesForRes = entry.resolution === '2k' ? 2.2 * 1024 * 1024 : 100 * 1024;
  if (!FORCE && fileExistsNonEmpty(destPath) && fs.statSync(destPath).size >= minBytesForRes) {
    return { label: `hdri:${entry.key}`, status: 'skipped', bytes: fs.statSync(destPath).size };
  }

  const info = await fetchWithRetry(`https://api.polyhaven.com/files/${entry.id}`, 'json');
  const hdrUrl = info.hdri?.[entry.resolution]?.hdr?.url || info.hdri?.['1k']?.hdr?.url;
  if (!hdrUrl) {
    throw new Error(`HDRI ${entry.resolution} mancante su Poly Haven per ${entry.id}`);
  }

  const buf = await fetchWithRetry(hdrUrl, 'buffer');
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  return { label: `hdri:${entry.key}`, status: 'downloaded', bytes: buf.length };
}

async function downloadPolyHavenModel(category, id, ctx) {
  const outGlbPath = path.join(ASSETS_ROOT, 'models', category, `${id}.glb`);
  const fallbackGltfPath = path.join(ASSETS_ROOT, 'models', category, id, `${id}.gltf`);

  if (!FORCE && fileExistsNonEmpty(outGlbPath)) {
    return { label: `model:${category}/${id}`, status: 'skipped', bytes: fs.statSync(outGlbPath).size };
  }

  const info = await fetchWithRetry(`https://api.polyhaven.com/files/${id}`, 'json');
  const gltfMeta = info.gltf?.['1k']?.gltf || info.gltf?.['2k']?.gltf;
  if (!gltfMeta?.url) {
    throw new Error(`GLTF 1k/2k mancante su Poly Haven per ${id}`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `ph-${id}-`));
  try {
    const gltfLocalPath = path.join(tmpDir, `${id}.gltf`);
    const gltfBuf = await fetchWithRetry(gltfMeta.url, 'buffer');
    fs.writeFileSync(gltfLocalPath, gltfBuf);

    const includes = Object.entries(gltfMeta.include || {});
    await Promise.all(
      includes.map(async ([relPath, fileInfo]) => {
        const safeRel = relPath.replace(/^\/+/, '');
        const dest = path.join(tmpDir, safeRel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const buf = await fetchWithRetry(fileInfo.url, 'buffer');
        fs.writeFileSync(dest, buf);
      })
    );

    fs.mkdirSync(path.dirname(outGlbPath), { recursive: true });
    try {
      await ctx.runExclusive(async () => {
        const doc = await ctx.io.read(gltfLocalPath);
        const transforms = [
          dedup(),
          prune({ keepAttributes: true, keepLeaves: true }),
        ];
        if (ctx.sharp) {
          transforms.push(
            textureCompress({
              encoder: ctx.sharp,
              targetFormat: 'webp',
              resize: [1024, 1024],
              quality: 82,
            })
          );
        }
        transforms.push(draco({ method: 'edgebreaker' }));
        await doc.transform(...transforms);
        await ctx.io.write(outGlbPath, doc);
      });
      // Rimuove eventuale cartella fallback .gltf precedente ora sostituita dal .glb Draco
      const fallbackDir = path.dirname(fallbackGltfPath);
      if (fs.existsSync(fallbackDir)) {
        fs.rmSync(fallbackDir, { recursive: true, force: true });
      }
      return {
        label: `model:${category}/${id}`,
        status: 'downloaded',
        bytes: fs.statSync(outGlbPath).size,
      };
    } catch (packErr) {
      console.warn(`[fetch-cc0] Impacchettamento GLB Draco fallito per ${id}, uso fallback .gltf:`, packErr.message);
      const fallbackDir = path.dirname(fallbackGltfPath);
      fs.mkdirSync(fallbackDir, { recursive: true });
      fs.cpSync(tmpDir, fallbackDir, { recursive: true });
      return {
        label: `model:${category}/${id}`,
        status: 'downloaded',
        bytes: fs.statSync(fallbackGltfPath).size,
      };
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  console.log(`[fetch-cc0] Avvio download automatico CC0 in ${ASSETS_ROOT} (force=${FORCE})`);
  const io = await createGltfNodeIO();

  const tasks = [];
  for (const id of POLYHAVEN_TEXTURES) {
    tasks.push(() => downloadPolyHavenTexture(id));
  }
  for (const entry of AMBIENTCG_TEXTURES) {
    tasks.push(() => downloadAmbientCgTexture(entry));
  }
  for (const entry of POLYHAVEN_HDRIS) {
    tasks.push(() => downloadPolyHavenHdri(entry));
  }
  for (const [category, ids] of Object.entries(POLYHAVEN_MODELS)) {
    for (const id of ids) {
      tasks.push(() => downloadPolyHavenModel(category, id, io));
    }
  }

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  let totalBytes = 0;

  await runPool(tasks, 3, async (fn) => {
    try {
      const res = await fn();
      totalBytes += res.bytes || 0;
      if (res.status === 'downloaded') {
        downloaded++;
        console.log(`  [+] ${res.label} (${(res.bytes / 1024).toFixed(0)} KB)`);
      } else {
        skipped++;
        console.log(`  [=] ${res.label} (già presente, ${(res.bytes / 1024).toFixed(0)} KB)`);
      }
    } catch (err) {
      failed++;
      console.error(`  [!] ERRORE:`, err.message);
    }
  });

  const { manifestPath } = rebuildManifestAndCredits(PROJECT_ROOT);
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
  console.log(`\n[fetch-cc0] Completato: scaricati=${downloaded}, saltati=${skipped}, falliti=${failed}, totale asset CC0=${totalMB} MB`);
  console.log(`[fetch-cc0] Manifest aggiornato: ${manifestPath}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[fetch-cc0] Errore fatale:', err);
  process.exit(1);
});
