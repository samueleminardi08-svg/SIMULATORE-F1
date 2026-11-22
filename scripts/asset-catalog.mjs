import fs from 'node:fs';
import path from 'node:path';

export const POLYHAVEN_TEXTURES = [
  'asphalt_track',
  'asphalt_pit_lane',
  'gravelly_sand',
  'coast_sand_01',
  'concrete_floor_painted',
  'concrete_wall_007',
  'metal_plate',
];

export const AMBIENTCG_TEXTURES = [
  { id: 'grass_004', ambientcgId: 'Grass004', resolution: '2K-JPG' },
];

export const POLYHAVEN_HDRIS = [
  { key: 'clear_day', id: 'autumn_field_puresky', resolution: '2k' },
  { key: 'partly_cloudy', id: 'kloofendal_48d_partly_cloudy_puresky', resolution: '2k' },
  { key: 'sunrise', id: 'qwantani_sunrise_puresky', resolution: '2k' },
  { key: 'sunset', id: 'kloppenheim_06_puresky', resolution: '2k' },
  { key: 'cloudy_sunset', id: 'citrus_orchard_road_puresky', resolution: '2k' },
  { key: 'overcast', id: 'kloofendal_overcast_puresky', resolution: '2k' },
  { key: 'rain', id: 'overcast_soil_puresky', resolution: '2k' },
  { key: 'heavy_rain', id: 'kloppenheim_07_puresky', resolution: '2k' },
  { key: 'night_clear', id: 'kloppenheim_02_puresky', resolution: '2k' },
  { key: 'studio', id: 'studio_small_09', resolution: '1k' },
];

export const POLYHAVEN_MODELS = {
  nature: [
    'pine_tree_01',
    'fir_tree_01',
    'tree_small_02',
    'island_tree_01',
    'grass_medium_01',
    'fern_02',
    'rock_moss_set_01',
    'namaqualand_boulder_02',
  ],
  track: [
    'street_lamp_01',
    'modular_chainlink_fence',
    'Barrel_01',
  ],
  garage: [
    'metal_tool_chest',
    'steel_frame_shelves_01',
    'power_box_01',
    'Drill_01',
    'security_camera_01',
  ],
};

export const SKETCHFAB_SLOTS = [
  // 11 Monoposto F1 2026 (ID allineati a src/config/f1_2026_data.js)
  {
    slot: 'ferrari',
    bucket: 'cars',
    filename: 'ferrari.glb',
    localDefaultFile: '2026_ferrari_sf-26.glb',
    title: '2026 Ferrari SF-26',
    author: 'Tyler_Dave',
    url: 'https://sketchfab.com/',
    triangles: '272.038',
    license: 'CC-BY',
    notes: 'Presente localmente alla radice (2026_ferrari_sf-26.glb)',
  },
  {
    slot: 'red_bull',
    bucket: 'cars',
    filename: 'red_bull.glb',
    title: '2026 Redbull RB22',
    author: 'Tyler_Dave',
    url: 'https://sketchfab.com/3d-models/none-0a3d24a58e0549d591a5a48c22eec383',
    triangles: '281.075',
    license: 'CC-BY',
    notes: 'Fallback procedurale/scocca pulita attivo finché non importato',
  },
  {
    slot: 'mercedes',
    bucket: 'cars',
    filename: 'mercedes.glb',
    title: '2026 Mercedes W17',
    author: 'Tyler_Dave',
    url: 'https://sketchfab.com/3d-models/none-b806f1e70aa343219e7158169549b97b',
    triangles: '267.698',
    license: 'CC-BY',
    notes: 'Fallback procedurale/scocca pulita attivo finché non importato',
  },
  {
    slot: 'mclaren',
    bucket: 'cars',
    filename: 'mclaren.glb',
    title: '2026 McLaren MCL40',
    author: 'Tyler_Dave',
    url: 'https://sketchfab.com/3d-models/none-96214ad5624f42a0861f77008f8d29e7',
    triangles: '276.870',
    license: 'CC-BY',
    notes: 'Fallback procedurale/scocca pulita attivo finché non importato',
  },
  {
    slot: 'aston_martin',
    bucket: 'cars',
    filename: 'aston_martin.glb',
    title: '2026 Aston Martin AMR26',
    author: 'Tyler_Dave',
    url: 'https://sketchfab.com/3d-models/none-a50d1c7bc086455c9412470d93fc3fc7',
    triangles: '271.170',
    license: 'CC-BY',
    notes: 'Fallback procedurale/scocca pulita attivo finché non importato',
  },
  {
    slot: 'williams',
    bucket: 'cars',
    filename: 'williams.glb',
    title: '2026 Williams FW48',
    author: 'Tyler_Dave',
    url: 'https://sketchfab.com/3d-models/none-4efa51e6d64a4192a83418f1b715c671',
    triangles: '275.868',
    license: 'CC-BY',
    notes: 'Fallback procedurale/scocca pulita attivo finché non importato',
  },
  {
    slot: 'haas',
    bucket: 'cars',
    filename: 'haas.glb',
    title: '2026 Haas VF-26',
    author: 'Tyler_Dave',
    url: 'https://sketchfab.com/3d-models/none-1f41e03886724bc6acd16c92402989bc',
    triangles: '275.868',
    license: 'CC-BY',
    notes: 'Fallback procedurale/scocca pulita attivo finché non importato',
  },
  {
    slot: 'audi',
    bucket: 'cars',
    filename: 'audi.glb',
    title: '2026 Audi R26',
    author: 'Tyler_Dave',
    url: 'https://sketchfab.com/3d-models/none-32bf228264b047669b100b0f1b8769ac',
    triangles: '265.138',
    license: 'CC-BY',
    notes: 'Fallback procedurale/scocca pulita attivo finché non importato',
  },
  {
    slot: 'cadillac',
    bucket: 'cars',
    filename: 'cadillac.glb',
    title: '2026 Cadillac MAC-26',
    author: 'Tyler_Dave',
    url: 'https://sketchfab.com/3d-models/none-95bcd37aa7c649779efc33b90b6c023e',
    triangles: '259.719',
    license: 'CC-BY',
    notes: 'Fallback procedurale/scocca pulita attivo finché non importato',
  },
  {
    slot: 'alpine',
    bucket: 'cars',
    filename: 'alpine.glb',
    title: '2025 Alpine A525',
    author: 'abuhossain844',
    url: 'https://sketchfab.com/3d-models/none-5f029644bc2d4eaebbec88712ea46dfa',
    triangles: '455.631',
    license: 'CC-BY',
    notes: 'A526 2026 non disponibile gratis; fallback scocca 2026 pulita livrea Alpine',
  },
  {
    slot: 'racing_bulls',
    bucket: 'cars',
    filename: 'racing_bulls.glb',
    title: 'VCARB 02 (2025)',
    author: 'MattDoesBlender',
    url: 'https://sketchfab.com/3d-models/none-caf594de23d541b091b2e814cd6a0d74',
    triangles: '459.029',
    license: 'CC-BY-NC-SA',
    notes: 'VCARB 03 completo non disponibile gratis; fallback scocca 2026 pulita livrea VCARB',
  },
  // Piloti 3D
  {
    slot: 'driver_f1',
    bucket: 'drivers',
    filename: 'driver_f1.glb',
    title: 'rhp_bell_hp77_driver_f1',
    author: 'MattDoesBlender',
    url: 'https://sketchfab.com/3d-models/none-2916ac047ea84abe9394c38e4fa2d4bd',
    triangles: '60.714',
    license: 'CC-BY-NC-SA',
    notes: 'Pilota seduto + casco Bell HP77 opzionale',
  },
  {
    slot: 'driver_lod',
    bucket: 'drivers',
    filename: 'driver_lod.glb',
    title: 'Race Car Driver',
    author: 'tomkart',
    url: 'https://sketchfab.com/3d-models/none-a8503189a20a441893b66e4c57d3231b',
    triangles: '5.142',
    license: 'CC-BY',
    notes: 'Pilota leggero LOD per vetture AI opzionale',
  },
  // Garage F1 3D
  {
    slot: 'garage_f1',
    bucket: 'garage',
    filename: 'garage_f1.glb',
    title: 'F1 Garage',
    author: 'Sketchfab Creator',
    url: 'https://sketchfab.com/3d-models/none-6b2a72503e4249d3a4cc25f86d206dac',
    triangles: '16.000',
    license: 'CC-BY',
    notes: 'Box F1 3D opzionale (alt: Red Bull Garage 086dda7566f64c6c930354687e2ec274)',
  },
  // Prop opzionali pista
  {
    slot: 'palm_tree',
    bucket: 'models/optional',
    filename: 'palm_tree.glb',
    title: 'Realistic Palm Tree 4 Free',
    author: 'Sketchfab Creator',
    url: 'https://sketchfab.com/3d-models/none-917c18d6b2d04d33950dea6e20bc074f',
    triangles: '8.000',
    license: 'CC-BY',
    notes: 'Palma alta definizione per circuiti tropicali/costieri opzionale',
  },
  {
    slot: 'starting_line',
    bucket: 'models/optional',
    filename: 'starting_line.glb',
    title: 'Starting Line',
    author: 'Sketchfab Creator',
    url: 'https://sketchfab.com/3d-models/none-ecb35b3e5b424f9dbf54174e6c5907de',
    triangles: 'n/d',
    license: 'CC-BY',
    notes: 'Portale griglia di partenza opzionale',
  },
];

export const SKETCHFAB_BY_FILENAME = new Map(
  SKETCHFAB_SLOTS.map((entry) => [entry.filename.toLowerCase(), entry])
);

export const SKETCHFAB_BY_SLOT = new Map(
  SKETCHFAB_SLOTS.map((entry) => [entry.slot, entry])
);

function inspectGlbJsonChunk(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const header = Buffer.alloc(20);
      const bytesRead = fs.readSync(fd, header, 0, 20, 0);
      if (bytesRead < 20) return null;
      if (header.readUInt32LE(0) !== 0x46546c67) return null; // 'glTF'
      const jsonLen = header.readUInt32LE(12);
      const jsonType = header.readUInt32LE(16);
      if (jsonType !== 0x4e4f534a || jsonLen <= 0 || jsonLen > 32 * 1024 * 1024) {
        return null;
      }
      const jsonBuf = Buffer.alloc(jsonLen);
      fs.readSync(fd, jsonBuf, 0, jsonLen, 20);
      return JSON.parse(jsonBuf.toString('utf8'));
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

export function inspectGltfMetadata(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let json = null;
  if (ext === '.glb') {
    json = inspectGlbJsonChunk(filePath);
  } else if (ext === '.gltf') {
    try {
      json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      json = null;
    }
  }
  if (!json) {
    return { draco: false, webp: false, materialNames: [] };
  }
  const exts = new Set([...(json.extensionsUsed || []), ...(json.extensionsRequired || [])]);
  const materialNames = Array.isArray(json.materials)
    ? json.materials.map((m) => m?.name).filter(Boolean)
    : [];
  return {
    draco: exts.has('KHR_draco_mesh_compression'),
    webp: exts.has('EXT_texture_webp'),
    materialNames,
  };
}

function toPosixRelative(rootDir, absPath) {
  return path.relative(rootDir, absPath).split(path.sep).join('/');
}

function findExistingFile(candidates) {
  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).size > 0) {
      return p;
    }
  }
  return null;
}

function scanModelBucket(publicRoot, bucketDirAbs) {
  const result = {};
  if (!fs.existsSync(bucketDirAbs)) return result;

  const entries = fs.readdirSync(bucketDirAbs, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) {
      const id = path.basename(entry.name, '.glb');
      const fullPath = path.join(bucketDirAbs, entry.name);
      const stat = fs.statSync(fullPath);
      if (stat.size <= 0) continue;
      const meta = inspectGltfMetadata(fullPath);
      result[id] = {
        path: toPosixRelative(publicRoot, fullPath),
        format: 'glb',
        sizeBytes: stat.size,
        draco: meta.draco,
      };
    } else if (entry.isDirectory()) {
      const id = entry.name;
      if (result[id]) continue;
      const gltfPath = path.join(bucketDirAbs, id, `${id}.gltf`);
      if (fs.existsSync(gltfPath)) {
        const stat = fs.statSync(gltfPath);
        if (stat.size <= 0) continue;
        const meta = inspectGltfMetadata(gltfPath);
        result[id] = {
          path: toPosixRelative(publicRoot, gltfPath),
          format: 'gltf',
          sizeBytes: stat.size,
          draco: meta.draco,
        };
      }
    }
  }

  return result;
}

function scanGlbSlotBucket(publicRoot, bucketDirAbs) {
  const result = {};
  if (!fs.existsSync(bucketDirAbs)) return result;

  const entries = fs.readdirSync(bucketDirAbs, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.glb')) continue;
    const slot = path.basename(entry.name, '.glb');
    const fullPath = path.join(bucketDirAbs, entry.name);
    const stat = fs.statSync(fullPath);
    if (stat.size <= 0) continue;
    const meta = inspectGltfMetadata(fullPath);
    const slotMeta = SKETCHFAB_BY_SLOT.get(slot);
    result[slot] = {
      path: toPosixRelative(publicRoot, fullPath),
      sizeBytes: stat.size,
      draco: meta.draco,
      source: slotMeta ? slotMeta.author : 'local',
    };
  }

  return result;
}

/**
 * Rigenera `public/assets/3d/manifest.json` e `CREDITS_ASSETS.md` basandosi
 * esclusivamente sui file realmente presenti su disco (zero link rotti / zero 404).
 * @param {string} projectRoot
 */
export function rebuildManifestAndCredits(projectRoot) {
  const publicRoot = path.join(projectRoot, 'public');
  const assetsRoot = path.join(publicRoot, 'assets', '3d');
  fs.mkdirSync(assetsRoot, { recursive: true });

  // 1. Textures PBR
  const textures = {};
  const texturesDir = path.join(assetsRoot, 'textures');
  if (fs.existsSync(texturesDir)) {
    const texDirs = fs.readdirSync(texturesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const dir of texDirs) {
      const id = dir.name;
      const base = path.join(texturesDir, id);
      const diff = findExistingFile([
        path.join(base, 'diff.webp'),
        path.join(base, 'diff.jpg'),
        path.join(base, 'diff.png'),
      ]);
      if (!diff) continue;
      const nor = findExistingFile([
        path.join(base, 'nor_gl.webp'),
        path.join(base, 'nor_gl.jpg'),
        path.join(base, 'nor_gl.png'),
      ]);
      const rough = findExistingFile([
        path.join(base, 'rough.webp'),
        path.join(base, 'rough.jpg'),
        path.join(base, 'rough.png'),
      ]);

      textures[id] = {
        diff: toPosixRelative(publicRoot, diff),
        nor_gl: nor ? toPosixRelative(publicRoot, nor) : null,
        rough: rough ? toPosixRelative(publicRoot, rough) : null,
      };
    }
  }

  // 2. HDRIs (+ alias legacy dry/night per retrocompatibilità)
  const hdri = {};
  for (const h of POLYHAVEN_HDRIS) {
    const hdrPath = path.join(assetsRoot, 'hdri', `${h.id}.hdr`);
    if (fs.existsSync(hdrPath) && fs.statSync(hdrPath).size > 0) {
      hdri[h.key] = toPosixRelative(publicRoot, hdrPath);
    }
  }
  if (!hdri.dry && hdri.clear_day) {
    hdri.dry = hdri.clear_day;
  }
  if (!hdri.night && hdri.night_clear) {
    hdri.night = hdri.night_clear;
  }

  // 3. Modelli 3D per categoria
  const modelsDir = path.join(assetsRoot, 'models');
  const models = {
    nature: scanModelBucket(publicRoot, path.join(modelsDir, 'nature')),
    track: scanModelBucket(publicRoot, path.join(modelsDir, 'track')),
    garage: scanModelBucket(publicRoot, path.join(modelsDir, 'garage')),
    optional: scanModelBucket(publicRoot, path.join(modelsDir, 'optional')),
  };

  // 4. Cars / Drivers / Garage Sketchfab/local slots
  const cars = scanGlbSlotBucket(publicRoot, path.join(assetsRoot, 'cars'));
  const drivers = scanGlbSlotBucket(publicRoot, path.join(assetsRoot, 'drivers'));
  const garage = scanGlbSlotBucket(publicRoot, path.join(assetsRoot, 'garage'));

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    dracoDecoderPath: 'draco/',
    textures,
    hdri,
    models,
    cars,
    drivers,
    garage,
  };

  const manifestPath = path.join(assetsRoot, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // 5. CREDITS_ASSETS.md
  const creditsLines = [
    '# Crediti e Licenze Asset 3D',
    '',
    'Questo file viene generato automaticamente dagli script di acquisizione asset (`scripts/fetch-cc0-assets.mjs` e `scripts/import-and-optimize-glbs.mjs`) in base al catalogo verificato e ai file presenti in `public/assets/3d/`.',
    '',
    '---',
    '',
    '## 1. Texture PBR 2K — Poly Haven & AmbientCG (CC0 Public Domain)',
    '| ID Locale | Origine | Licenza | Stato su Disco | Link |',
    '|---|---|---|---|---|',
  ];

  for (const id of POLYHAVEN_TEXTURES) {
    const present = textures[id]?.diff ? 'Attiva' : 'Mancante';
    creditsLines.push(
      `| \`${id}\` | Poly Haven | CC0 1.0 | ${present} | https://polyhaven.com/a/${id} |`
    );
  }
  for (const entry of AMBIENTCG_TEXTURES) {
    const present = textures[entry.id]?.diff ? 'Attiva' : 'Mancante';
    creditsLines.push(
      `| \`${entry.id}\` (\`${entry.ambientcgId}\`) | AmbientCG | CC0 1.0 | ${present} | https://ambientcg.com/view?id=${entry.ambientcgId} |`
    );
  }

  creditsLines.push(
    '',
    '## 2. HDRI Sky & Environment Reflections — Poly Haven (CC0 Public Domain)',
    '| Slot | Asset ID | Licenza | Stato su Disco | Link |',
    '|---|---|---|---|---|'
  );
  for (const h of POLYHAVEN_HDRIS) {
    const present = hdri[h.key] ? 'Attiva' : 'Mancante';
    creditsLines.push(
      `| \`${h.key}\` | \`${h.id}\` | CC0 1.0 | ${present} | https://polyhaven.com/a/${h.id} |`
    );
  }

  creditsLines.push(
    '',
    '## 3. Modelli 3D Natura, Pista & Officina — Poly Haven (CC0 Public Domain)',
    '| Categoria | Asset ID | Licenza | Stato su Disco | Link |',
    '|---|---|---|---|---|'
  );
  for (const [category, ids] of Object.entries(POLYHAVEN_MODELS)) {
    for (const id of ids) {
      const entry = models[category]?.[id];
      const present = entry
        ? `Attivo (${entry.format.toUpperCase()}${entry.draco ? ' + Draco' : ''}, ${(entry.sizeBytes / 1024).toFixed(0)} KB)`
        : 'Mancante';
      creditsLines.push(
        `| ${category} | \`${id}\` | CC0 1.0 | ${present} | https://polyhaven.com/a/${id} |`
      );
    }
  }

  creditsLines.push(
    '',
    '## 4. Monoposto, Piloti e Garage F1 — Sketchfab (CC-BY / CC-BY-NC-SA)',
    '| Slot | Titolo Modello | Autore | Licenza | Stato su Disco | Link |',
    '|---|---|---|---|---|---|'
  );
  for (const item of SKETCHFAB_SLOTS) {
    let activeEntry = null;
    if (item.bucket === 'cars') activeEntry = cars[item.slot];
    else if (item.bucket === 'drivers') activeEntry = drivers[item.slot];
    else if (item.bucket === 'garage') activeEntry = garage[item.slot];
    else if (item.bucket === 'models/optional') activeEntry = models.optional?.[item.slot];

    const stateLabel = activeEntry
      ? `Attivo (${(activeEntry.sizeBytes / (1024 * 1024)).toFixed(2)} MB${activeEntry.draco ? ', Draco' : ''})`
      : 'Drop-in pronto (`assets_import/sketchfab/`)';

    creditsLines.push(
      `| \`${item.filename}\` | ${item.title} | \`${item.author}\` | ${item.license} | ${stateLabel} | ${item.url} |`
    );
  }

  creditsLines.push('');
  fs.writeFileSync(path.join(projectRoot, 'CREDITS_ASSETS.md'), creditsLines.join('\n'), 'utf8');

  return { manifest, manifestPath };
}
