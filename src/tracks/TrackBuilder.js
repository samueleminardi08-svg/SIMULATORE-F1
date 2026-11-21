/**
 * Costruttore 3D della pista basato direttamente sui campioni di TrackSurface (Step 3).
 * Garantisce corrispondenza 1:1 tra grafica 3D (asfalto, cordoli, barriere, erba)
 * e geometria fisica delle collisioni.
 */

import * as THREE from 'three';
import { computeStartingGridTransforms } from '../race/RaceManager.js';
import { createTrackSurface, queryTrackSurface } from './TrackSurface.js';

function createAsphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#262930';
  ctx.fillRect(0, 0, 512, 512);

  // Grana asfalto omogenea tiling-safe in orizzontale e longitudinale (nessuna linea bianca baked)
  for (let i = 0; i < 6500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const shade = 28 + Math.floor(Math.random() * 26);
    ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 5})`;
    ctx.fillRect(x, y, 2, 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.anisotropy = 8;
  return texture;
}

const KERB_PALETTES = {
  italian: ['#009246', '#f8f9fa', '#ce2b37'],
  australian: ['#00843d', '#ffcd00', '#f8f9fa'],
  chinese: ['#de2910', '#ffde00', '#f8f9fa'],
  japanese: ['#e10600', '#ffffff'],
  bahrain: ['#ce1126', '#ffffff'],
  saudi: ['#006c35', '#ffffff'],
  miami: ['#00a3e0', '#ff4da6', '#ffffff'],
  standard: ['#d90429', '#f8f9fa'],
};

function createKerbTexture(style, repeatY) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const colors = KERB_PALETTES[style] || KERB_PALETTES.standard;
  for (let i = 0; i < colors.length; i++) {
    const y0 = Math.round((i * canvas.height) / colors.length);
    const y1 = Math.round(((i + 1) * canvas.height) / colors.length);
    ctx.fillStyle = colors[i];
    ctx.fillRect(0, y0, 64, y1 - y0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, repeatY);
  texture.anisotropy = 8;
  return texture;
}

function createGrassTexture(repeatX, repeatY) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#2d5a27';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#33652c';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillRect(128, 128, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  return texture;
}

function createBarrierTexture(repeatX) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  // Guardrail metallico con fascia superiore bianco-rossa F1
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(0, 0, 256, 64);

  ctx.fillStyle = '#e10600';
  ctx.fillRect(0, 0, 128, 22);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(128, 0, 128, 22);

  ctx.fillStyle = '#475569';
  ctx.fillRect(0, 52, 256, 12);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(repeatX, 1);
  texture.anisotropy = 8;
  return texture;
}

function createCheckerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  const cols = 16;
  const rows = 4;
  const cellW = canvas.width / cols;
  const cellH = canvas.height / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#111111';
      ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  return texture;
}

/**
 * Costruisce una geometria a nastro orizzontale dai campioni di TrackSurface.
 * Supporta halfWidth e lateralOffset dinamici per campione (larghezza variabile FIA)
 * e tiling UV metrico proporzionale alla larghezza effettiva.
 */
function buildRibbonFromSamples(
  samples,
  halfWidth,
  lateralOffset = 0,
  yOffset = 0.02,
  filterFn = null,
  uvOptions = null
) {
  const count = samples.length;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const hwIsFn = typeof halfWidth === 'function';
  const latIsFn = typeof lateralOffset === 'function';

  for (let i = 0; i <= count; i++) {
    const sampleIdx = i % count;
    const s = samples[sampleIdx];
    const t = i / count;
    const y = (s.y ?? 0) + yOffset;
    const hw = hwIsFn ? halfWidth(s, sampleIdx) : halfWidth;
    const lat = latIsFn ? lateralOffset(s, sampleIdx) : lateralOffset;

    const cx = s.x + s.nx * lat;
    const cz = s.z + s.nz * lat;

    const lx = cx + s.nx * hw;
    const lz = cz + s.nz * hw;
    const rx = cx - s.nx * hw;
    const rz = cz - s.nz * hw;

    positions.push(lx, y, lz);
    positions.push(rx, y, rz);
    normals.push(0, 1, 0, 0, 1, 0);

    if (uvOptions) {
      const vCoord =
        (i === count ? uvOptions.totalLength : (s.distance ?? 0)) /
        uvOptions.vTileMeters;
      const uHalf = hw / uvOptions.uTileMeters;
      uvs.push(-uHalf, vCoord);
      uvs.push(uHalf, vCoord);
    } else {
      uvs.push(0, t);
      uvs.push(1, t);
    }

    if (i < count && (!filterFn || filterFn(s, i))) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * Costruisce la soletta strutturale in cemento sotto i tratti sopraelevati (es. ponte a 8 di Suzuka).
 */
function buildBridgeDeckGeometry(samples, defaultHalfWidth, thickness = 0.45, kerbWidth = 1.4) {
  const count = samples.length;
  const positions = [];
  const indices = [];

  for (let i = 0; i <= count; i++) {
    const s = samples[i % count];
    const topY = (s.y ?? 0) + 0.01;
    const botY = topY - thickness;
    const spanHalf = (s.halfWidth ?? defaultHalfWidth) + kerbWidth + 0.55;

    const lx = s.x + s.nx * spanHalf;
    const lz = s.z + s.nz * spanHalf;
    const rx = s.x - s.nx * spanHalf;
    const rz = s.z - s.nz * spanHalf;

    positions.push(lx, topY, lz); // 0: left top
    positions.push(lx, botY, lz); // 1: left bottom
    positions.push(rx, botY, rz); // 2: right bottom
    positions.push(rx, topY, rz); // 3: right top

    if (i < count) {
      const nextS = samples[(i + 1) % count];
      if ((s.y ?? 0) > 0.35 || (nextS.y ?? 0) > 0.35) {
        const b = i * 4;
        const n = b + 4;
        // Fianco sinistro
        indices.push(b + 0, b + 1, n + 0);
        indices.push(b + 1, n + 1, n + 0);
        // Sottoponte inferiore
        indices.push(b + 1, b + 2, n + 1);
        indices.push(b + 2, n + 2, n + 1);
        // Fianco destro
        indices.push(b + 2, b + 3, n + 2);
        indices.push(b + 3, n + 3, n + 2);
      }
    }
  }

  if (indices.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Costruisce un muretto/barriera 3D continua (faccia interna, esterna e copertura superiore).
 * La faccia interna è allineata esattamente all'offset laterale e all'elevazione locale del campione.
 */
function buildBarrierGeometry(
  samples,
  sideSign,
  defaultBarrierHalfWidth,
  thickness = 0.45,
  height = 1.15
) {
  const count = samples.length;
  const positions = [];
  const uvs = [];
  const indices = [];

  // 4 vertici per sezione: innerBottom(0), innerTop(1), outerTop(2), outerBottom(3)
  for (let i = 0; i <= count; i++) {
    const s = samples[i % count];
    const u = i / count;
    const baseOffset =
      sideSign > 0
        ? (s.leftBarrierOffset ?? defaultBarrierHalfWidth)
        : (s.rightBarrierOffset ?? defaultBarrierHalfWidth);
    const innerOffset = sideSign * baseOffset;
    const outerOffset = sideSign * (baseOffset + thickness);
    const baseY = s.y ?? 0;

    const ix = s.x + s.nx * innerOffset;
    const iz = s.z + s.nz * innerOffset;
    const ox = s.x + s.nx * outerOffset;
    const oz = s.z + s.nz * outerOffset;

    positions.push(ix, baseY, iz);          // 0: inner bottom
    positions.push(ix, baseY + height, iz); // 1: inner top
    positions.push(ox, baseY + height, oz); // 2: outer top
    positions.push(ox, baseY, oz);          // 3: outer bottom

    uvs.push(u, 1);
    uvs.push(u, 0);
    uvs.push(u, 0);
    uvs.push(u, 1);

    if (i < count) {
      const b = i * 4;
      const n = b + 4;
      // Faccia interna
      indices.push(b + 0, b + 1, n + 0);
      indices.push(b + 1, n + 1, n + 0);
      // Copertura superiore
      indices.push(b + 1, b + 2, n + 1);
      indices.push(b + 2, n + 2, n + 1);
      // Faccia esterna
      indices.push(b + 2, b + 3, n + 2);
      indices.push(b + 3, n + 3, n + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addParkTrees(group, trackSurface) {
  const { samples, sampleCount, barrierHalfWidth } = trackSurface;
  const treePositions = [];
  const step = 10;

  for (let i = 0; i < sampleCount; i += step) {
    const s = samples[i];
    for (const side of [1, -1]) {
      const localBar =
        side > 0
          ? (s.leftBarrierOffset ?? barrierHalfWidth)
          : (s.rightBarrierOffset ?? barrierHalfWidth);
      // Distanza esterna alle barriere locali con leggera variazione deterministica
      const distOut = localBar + 10 + ((i * 7 + (side > 0 ? 3 : 11)) % 24);
      const tx = s.x + s.nx * side * distOut;
      const tz = s.z + s.nz * side * distOut;

      // Assicura che nessun albero finisca su un altro tratto di pista o dentro le barriere
      const check = queryTrackSurface(trackSurface, tx, tz);
      if (check.absOffset > (check.barrierHalfWidth ?? barrierHalfWidth) + 5.5) {
        treePositions.push({
          x: tx,
          z: tz,
          scale: 0.85 + ((i * 13) % 7) * 0.1,
        });
      }
    }
  }

  if (treePositions.length === 0) return;

  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 4.2, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
  const canopyGeo = new THREE.ConeGeometry(3.2, 8.5, 7);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x1e4d2b, roughness: 0.85 });

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
  const canopyInst = new THREE.InstancedMesh(canopyGeo, canopyMat, treePositions.length);
  canopyInst.castShadow = true;

  const dummy = new THREE.Object3D();
  treePositions.forEach((tp, idx) => {
    dummy.position.set(tp.x, 2.1 * tp.scale, tp.z);
    dummy.scale.setScalar(tp.scale);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(tp.x, 6.8 * tp.scale, tp.z);
    dummy.updateMatrix();
    canopyInst.setMatrixAt(idx, dummy.matrix);
  });

  group.add(trunkInst, canopyInst);
}

export function buildTrackMeshGroup(trackData) {
  const group = new THREE.Group();
  group.name = `Track_${trackData.id}`;

  const trackSurface = createTrackSurface(trackData, 1600);
  const {
    samples,
    totalLength,
    halfTrackWidth,
    kerbWidth,
    barrierHalfWidth,
    isStreet,
    bounds,
  } = trackSurface;

  // 1. Piano erboso proporzionato alle dimensioni del tracciato
  const padding = 1600;
  const planeWidth = (bounds.maxX - bounds.minX) + padding;
  const planeHeight = (bounds.maxZ - bounds.minZ) + padding;
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;

  const grassGeo = new THREE.PlaneGeometry(planeWidth, planeHeight);
  grassGeo.rotateX(-Math.PI / 2);
  const grassMat = new THREE.MeshLambertMaterial({
    map: createGrassTexture(Math.round(planeWidth / 24), Math.round(planeHeight / 24)),
  });
  const grassMesh = new THREE.Mesh(grassGeo, grassMat);
  grassMesh.position.set(centerX, 0, centerZ);
  grassMesh.receiveShadow = true;
  group.add(grassMesh);

  // 2a. Banchine / vie di fuga laterali fino ai muretti (cittadini) o margine cordoli (permanenti)
  const computeRunoffSpan = (s, barOffset) => {
    const hw = s.halfWidth ?? halfTrackWidth;
    const room = Math.max(0.25, barOffset - hw);
    return isStreet ? room : Math.min(room, kerbWidth + 2.6);
  };
  const runoffMat = new THREE.MeshStandardMaterial({
    color: isStreet ? 0x333a45 : 0x474e59,
    roughness: 0.92,
    metalness: 0.04,
  });
  const leftRunoffGeo = buildRibbonFromSamples(
    samples,
    (s) => computeRunoffSpan(s, s.leftBarrierOffset ?? barrierHalfWidth) * 0.5,
    (s) => (s.halfWidth ?? halfTrackWidth) + computeRunoffSpan(s, s.leftBarrierOffset ?? barrierHalfWidth) * 0.5,
    0.012
  );
  const rightRunoffGeo = buildRibbonFromSamples(
    samples,
    (s) => computeRunoffSpan(s, s.rightBarrierOffset ?? barrierHalfWidth) * 0.5,
    (s) => -((s.halfWidth ?? halfTrackWidth) + computeRunoffSpan(s, s.rightBarrierOffset ?? barrierHalfWidth) * 0.5),
    0.012
  );
  const leftRunoffMesh = new THREE.Mesh(leftRunoffGeo, runoffMat);
  const rightRunoffMesh = new THREE.Mesh(rightRunoffGeo, runoffMat);
  leftRunoffMesh.receiveShadow = true;
  rightRunoffMesh.receiveShadow = true;
  group.add(leftRunoffMesh, rightRunoffMesh);

  // 2. Nastro d'asfalto con estrusione dinamica ±(width/2) e tiling UV orizzontale metrico
  const asphaltGeo = buildRibbonFromSamples(
    samples,
    (s) => s.halfWidth ?? halfTrackWidth,
    0,
    0.02,
    null,
    { uTileMeters: 7.0, vTileMeters: 10.0, totalLength }
  );
  const asphaltMat = new THREE.MeshStandardMaterial({
    map: createAsphaltTexture(),
    roughness: 0.85,
    metalness: 0.05,
  });
  const asphaltMesh = new THREE.Mesh(asphaltGeo, asphaltMat);
  asphaltMesh.receiveShadow = true;
  group.add(asphaltMesh);

  // Linee bianche continue FIA a larghezza costante lungo entrambi i bordi della carreggiata
  const edgeLineMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });
  const leftEdgeLineGeo = buildRibbonFromSamples(
    samples,
    0.1,
    (s) => (s.halfWidth ?? halfTrackWidth) - 0.18,
    0.026
  );
  const rightEdgeLineGeo = buildRibbonFromSamples(
    samples,
    0.1,
    (s) => -((s.halfWidth ?? halfTrackWidth) - 0.18),
    0.026
  );
  group.add(
    new THREE.Mesh(leftEdgeLineGeo, edgeLineMat),
    new THREE.Mesh(rightEdgeLineGeo, edgeLineMat)
  );

  // 2b. Soletta ponte per tratti sopraelevati (es. cavalcavia a 8 di Suzuka)
  const bridgeDeckGeo = buildBridgeDeckGeometry(samples, halfTrackWidth, 0.45, kerbWidth);
  if (bridgeDeckGeo) {
    const bridgeDeckMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.85,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });
    const bridgeDeckMesh = new THREE.Mesh(bridgeDeckGeo, bridgeDeckMat);
    bridgeDeckMesh.castShadow = true;
    bridgeDeckMesh.receiveShadow = true;
    group.add(bridgeDeckMesh);
  }

  // 3. Cordoli interno ed esterno solo sugli apex delle curve
  const halfKerb = kerbWidth * 0.5;
  const kerbMat = new THREE.MeshStandardMaterial({
    map: createKerbTexture(trackData.kerbStyle, Math.max(100, Math.round(totalLength / 4))),
    roughness: 0.65,
  });

  const leftKerbGeo = buildRibbonFromSamples(
    samples,
    halfKerb,
    (s) => (s.halfWidth ?? halfTrackWidth) + halfKerb * 0.92,
    0.03,
    (s) => s.hasKerb
  );
  const rightKerbGeo = buildRibbonFromSamples(
    samples,
    halfKerb,
    (s) => -((s.halfWidth ?? halfTrackWidth) + halfKerb * 0.92),
    0.03,
    (s) => s.hasKerb
  );
  const leftKerbMesh = new THREE.Mesh(leftKerbGeo, kerbMat);
  const rightKerbMesh = new THREE.Mesh(rightKerbGeo, kerbMat);
  leftKerbMesh.receiveShadow = true;
  rightKerbMesh.receiveShadow = true;
  group.add(leftKerbMesh, rightKerbMesh);

  // 4. Barriere di sicurezza / muretti 3D continui ai due lati
  const barrierMat = new THREE.MeshStandardMaterial({
    map: createBarrierTexture(Math.max(120, Math.round(totalLength / 8))),
    roughness: 0.45,
    metalness: 0.35,
    side: THREE.DoubleSide,
  });

  const leftBarrierGeo = buildBarrierGeometry(samples, 1, barrierHalfWidth);
  const rightBarrierGeo = buildBarrierGeometry(samples, -1, barrierHalfWidth);
  const leftBarrierMesh = new THREE.Mesh(leftBarrierGeo, barrierMat);
  const rightBarrierMesh = new THREE.Mesh(rightBarrierGeo, barrierMat);
  leftBarrierMesh.castShadow = true;
  leftBarrierMesh.receiveShadow = true;
  rightBarrierMesh.castShadow = true;
  rightBarrierMesh.receiveShadow = true;
  group.add(leftBarrierMesh, rightBarrierMesh);

  // 5. Linea di partenza/traguardo a scacchi + Portale F1 adattati alla larghezza locale e barriere
  const s0 = samples[0];
  const startHalfW = s0.halfWidth ?? halfTrackWidth;
  const startBarrierL = s0.leftBarrierOffset ?? barrierHalfWidth;
  const startBarrierR = s0.rightBarrierOffset ?? barrierHalfWidth;

  const startLineGeo = new THREE.PlaneGeometry(startHalfW * 2 - 0.5, 2.8);
  startLineGeo.rotateX(-Math.PI / 2);
  const startLineMat = new THREE.MeshBasicMaterial({
    map: createCheckerTexture(),
  });
  const startLineMesh = new THREE.Mesh(startLineGeo, startLineMat);
  startLineMesh.position.set(0, 0.038, 0);

  const gantryGroup = new THREE.Group();
  gantryGroup.position.set(s0.x, s0.y ?? 0, s0.z);
  gantryGroup.rotation.y = Math.atan2(s0.tx, s0.tz);

  const leftPillarX = Math.max(startHalfW + kerbWidth + 1.2, startBarrierL + 0.65);
  const rightPillarX = -Math.max(startHalfW + kerbWidth + 1.2, startBarrierR + 0.65);
  const gantrySpan = leftPillarX - rightPillarX;

  const pillarGeo = new THREE.BoxGeometry(0.6, 6.5, 0.6);
  const gantryMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.5 });
  const bannerMat = new THREE.MeshStandardMaterial({ color: 0xe10600, roughness: 0.3 });

  const leftPillar = new THREE.Mesh(pillarGeo, gantryMat);
  leftPillar.position.set(leftPillarX, 3.25, 0);
  leftPillar.castShadow = true;

  const rightPillar = new THREE.Mesh(pillarGeo, gantryMat);
  rightPillar.position.set(rightPillarX, 3.25, 0);
  rightPillar.castShadow = true;

  const topBeam = new THREE.Mesh(new THREE.BoxGeometry(gantrySpan + 1.2, 1.1, 0.9), bannerMat);
  topBeam.position.set((leftPillarX + rightPillarX) * 0.5, 6.2, 0);
  topBeam.castShadow = true;

  gantryGroup.add(startLineMesh, leftPillar, rightPillar, topBeam);
  group.add(gantryGroup);

  // Caselle bianche della griglia di partenza (22 posizioni sfalsate)
  const gridSlots = computeStartingGridTransforms(trackSurface, 22, trackData.startTransform);
  const gridMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
  const frontBarGeo = new THREE.BoxGeometry(2.1, 0.02, 0.22);
  const sideBarGeo = new THREE.BoxGeometry(0.18, 0.02, 3.2);
  for (const slot of gridSlots) {
    const slotGroup = new THREE.Group();
    slotGroup.position.set(slot.x, (slot.y ?? 0) + 0.036, slot.z);
    slotGroup.rotation.y = slot.heading;

    const frontBar = new THREE.Mesh(frontBarGeo, gridMat);
    frontBar.position.set(0, 0, 2.35);
    const leftBar = new THREE.Mesh(sideBarGeo, gridMat);
    leftBar.position.set(0.96, 0, 0.85);
    const rightBar = new THREE.Mesh(sideBarGeo, gridMat);
    rightBar.position.set(-0.96, 0, 0.85);

    slotGroup.add(frontBar, leftBar, rightBar);
    group.add(slotGroup);
  }

  // 6. Alberi del parco intorno al circuito (istanziati per alte prestazioni)
  addParkTrees(group, trackSurface);

  return {
    group,
    trackSurface,
    asphaltMaterial: asphaltMat,
  };
}
