#!/usr/bin/env node
/**
 * Ottimizza e comprime con Draco + resize/WebP texture i modelli `.glb`:
 * 1) Monoposto Ferrari locale `2026_ferrari_sf-26.glb` -> `public/assets/3d/cars/ferrari.glb`
 *    (salvo override esplicito in `assets_import/sketchfab/ferrari.glb`)
 * 2) Qualsiasi `.glb` depositato dall'utente in `assets_import/sketchfab/` secondo gli slot del catalogo.
 *
 * Uso: node scripts/import-and-optimize-glbs.mjs [--force]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, draco, textureCompress } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import {
  SKETCHFAB_BY_FILENAME,
  inspectGltfMetadata,
  rebuildManifestAndCredits,
} from './asset-catalog.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const IMPORT_DIR = path.join(PROJECT_ROOT, 'assets_import', 'sketchfab');
const ASSETS_ROOT = path.join(PROJECT_ROOT, 'public', 'assets', '3d');
const FORCE = process.argv.includes('--force');

const CRITICAL_FERRARI_MATERIALS = [
  'tyre_sides',
  'discs.008',
  'sf25_decals',
  'numbers',
  'sf25_sw',
];

async function createOptimizerContext() {
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
    console.warn('[import-glb] Modulo "sharp" non disponibile: eseguo solo ottimizzazione Draco senza resize/WebP texture.');
  }

  return { io, sharp };
}

async function optimizeGlbFile({ srcPath, destPath, label, verifyFerrariMaterials = false }, ctx) {
  const srcStat = fs.statSync(srcPath);
  if (!FORCE && fs.existsSync(destPath)) {
    const destStat = fs.statSync(destPath);
    if (destStat.size > 0 && destStat.mtimeMs >= srcStat.mtimeMs) {
      console.log(`  [=] ${label}: invariato (${(destStat.size / (1024 * 1024)).toFixed(2)} MB)`);
      return {
        label,
        status: 'skipped',
        beforeBytes: srcStat.size,
        afterBytes: destStat.size,
      };
    }
  }

  const doc = await ctx.io.read(srcPath);

  const transforms = [
    // Esclude MATERIAL da dedup per preservare esattamente i material.name usati da CarModel3D.js
    dedup({
      propertyTypes: [PropertyType.ACCESSOR, PropertyType.TEXTURE],
    }),
    prune({
      keepAttributes: true,
      keepLeaves: true,
    }),
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

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  await ctx.io.write(destPath, doc);

  const afterStat = fs.statSync(destPath);
  const meta = inspectGltfMetadata(destPath);

  if (!meta.draco) {
    throw new Error(`Compressione Draco non rilevata nel file output ${destPath}`);
  }

  if (verifyFerrariMaterials) {
    const missing = CRITICAL_FERRARI_MATERIALS.filter((name) => !meta.materialNames.includes(name));
    if (missing.length > 0) {
      throw new Error(
        `Materiali critici mancanti dopo ottimizzazione di ${label}: ${missing.join(', ')}`
      );
    }
  }

  const beforeMB = (srcStat.size / (1024 * 1024)).toFixed(2);
  const afterMB = (afterStat.size / (1024 * 1024)).toFixed(2);
  const savedPct = (((srcStat.size - afterStat.size) / srcStat.size) * 100).toFixed(1);
  console.log(`  [+] ${label}: ${beforeMB} MB -> ${afterMB} MB (-${savedPct}%, Draco+WebP=${meta.webp})`);

  return {
    label,
    status: 'optimized',
    beforeBytes: srcStat.size,
    afterBytes: afterStat.size,
  };
}

async function main() {
  console.log(`[import-glb] Avvio ottimizzazione GLB (force=${FORCE})`);
  fs.mkdirSync(IMPORT_DIR, { recursive: true });

  const ctx = await createOptimizerContext();
  const jobs = [];

  // 1. Check override ferrari.glb nella cartella drop-in vs modello locale alla radice
  const ferrariImportPath = path.join(IMPORT_DIR, 'ferrari.glb');
  const rootFerrariPath = path.join(PROJECT_ROOT, '2026_ferrari_sf-26.glb');
  if (fs.existsSync(ferrariImportPath)) {
    jobs.push({
      srcPath: ferrariImportPath,
      destPath: path.join(ASSETS_ROOT, 'cars', 'ferrari.glb'),
      label: 'cars/ferrari.glb (override)',
      verifyFerrariMaterials: true,
    });
  } else if (fs.existsSync(rootFerrariPath)) {
    jobs.push({
      srcPath: rootFerrariPath,
      destPath: path.join(ASSETS_ROOT, 'cars', 'ferrari.glb'),
      label: 'cars/ferrari.glb (da 2026_ferrari_sf-26.glb)',
      verifyFerrariMaterials: true,
    });
  }

  // 2. Scansiona tutti gli altri .glb presenti in assets_import/sketchfab/
  const importEntries = fs.readdirSync(IMPORT_DIR, { withFileTypes: true });
  for (const entry of importEntries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.glb')) continue;
    if (entry.name.toLowerCase() === 'ferrari.glb') continue;

    const slotMeta = SKETCHFAB_BY_FILENAME.get(entry.name.toLowerCase());
    if (!slotMeta) {
      console.warn(`  [?] File sconosciuto in assets_import/sketchfab/: ${entry.name} (verrà comunque ottimizzato in models/optional/)`);
      jobs.push({
        srcPath: path.join(IMPORT_DIR, entry.name),
        destPath: path.join(ASSETS_ROOT, 'models', 'optional', entry.name),
        label: `models/optional/${entry.name}`,
        verifyFerrariMaterials: false,
      });
      continue;
    }

    const destSubdir = slotMeta.bucket === 'models/optional'
      ? path.join('models', 'optional')
      : slotMeta.bucket;
    jobs.push({
      srcPath: path.join(IMPORT_DIR, entry.name),
      destPath: path.join(ASSETS_ROOT, destSubdir, slotMeta.filename),
      label: `${destSubdir}/${slotMeta.filename}`,
      verifyFerrariMaterials: false,
    });
  }

  for (const job of jobs) {
    await optimizeGlbFile(job, ctx);
  }

  const { manifestPath } = rebuildManifestAndCredits(PROJECT_ROOT);
  console.log(`[import-glb] Manifest e crediti aggiornati: ${manifestPath}`);
}

main().catch((err) => {
  console.error('[import-glb] Errore fatale:', err);
  process.exit(1);
});
