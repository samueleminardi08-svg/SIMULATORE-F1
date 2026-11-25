/**
 * Costruttore 3D della pista basato direttamente sui campioni di TrackSurface (Step 3).
 * Garantisce corrispondenza 1:1 tra grafica 3D (asfalto, cordoli, barriere, erba)
 * e geometria fisica delle collisioni.
 */

import * as THREE from 'three';
import { F1_2026_DRIVERS } from '../config/f1_2026_data.js';
import { computeStartingGridTransforms } from '../race/RaceManager.js';
import { assetManager3D } from '../rendering/AssetManager3D.js';
import { isInsidePitFootprint } from './PitLaneGeometry.js';
import { getTrackBiomeConfig } from './TrackBiomes.js';
import { createTrackSurface, queryTrackSurface } from './TrackSurface.js';

function createAsphaltTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1c1f26';
  ctx.fillRect(0, 0, 512, 512);

  // Grana asfalto omogenea tiling-safe in orizzontale e longitudinale (nessuna linea bianca baked)
  for (let i = 0; i < 6500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const shade = 20 + Math.floor(Math.random() * 20);
    ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 4})`;
    ctx.fillRect(x, y, 2, 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
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
  if (typeof document === 'undefined') return null;
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
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, repeatY);
  texture.anisotropy = 8;
  return texture;
}

function createGrassTexture(repeatX, repeatY, baseColor = '#2d5a27', altColor = '#33652c') {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = altColor;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillRect(128, 128, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  return texture;
}

function createBarrierTexture(repeatX) {
  if (typeof document === 'undefined') return null;
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
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(repeatX, 1);
  texture.anisotropy = 8;
  return texture;
}

function createCheckerTexture() {
  if (typeof document === 'undefined') return null;
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
  texture.colorSpace = THREE.SRGBColorSpace;
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
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= count; i++) {
    const s = samples[i % count];
    const topY = (s.y ?? 0) + 0.01;
    const botY = topY - thickness;
    const spanHalf = (s.halfWidth ?? defaultHalfWidth) + kerbWidth + 0.55;
    const u = (s.distance ?? i * 3) / 6.0;

    const lx = s.x + s.nx * spanHalf;
    const lz = s.z + s.nz * spanHalf;
    const rx = s.x - s.nx * spanHalf;
    const rz = s.z - s.nz * spanHalf;

    positions.push(lx, topY, lz); // 0: left top
    positions.push(lx, botY, lz); // 1: left bottom
    positions.push(rx, botY, rz); // 2: right bottom
    positions.push(rx, topY, rz); // 3: right top

    uvs.push(u, 0);
    uvs.push(u, 0.35);
    uvs.push(u, 0.7);
    uvs.push(u, 1);

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
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
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
  height = 1.15,
  skipSegmentFn = null
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

    if (i < count && (!skipSegmentFn || !skipSegmentFn(i))) {
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

function addParkTrees(group, trackSurface, biome) {
  // Sui circuiti cittadini/desertici evitiamo alberi sparsi a bordo barriera
  if (biome?.biomeId === 'urban_street' || biome?.biomeId === 'desert_night') return;

  const { samples, sampleCount, barrierHalfWidth } = trackSurface;
  const treePositions = [];
  const step = 11;

  for (let i = 0; i < sampleCount; i += step) {
    const s = samples[i];
    for (const side of [1, -1]) {
      const localBar =
        side > 0
          ? (s.leftBarrierOffset ?? barrierHalfWidth)
          : (s.rightBarrierOffset ?? barrierHalfWidth);
      const distOut = localBar + 16 + ((i * 7 + (side > 0 ? 3 : 11)) % 30);
      const tx = s.x + s.nx * side * distOut;
      const tz = s.z + s.nz * side * distOut;

      const check = queryTrackSurface(trackSurface, tx, tz);
      if (
        check.surface !== 'pitlane' &&
        !isInsidePitFootprint(trackSurface.pitLane, tx, tz, 14.0) &&
        check.absOffset > (check.barrierHalfWidth ?? barrierHalfWidth) + 8.0
      ) {
        treePositions.push({
          x: tx,
          z: tz,
          scale: 0.72 + ((i * 13) % 7) * 0.09,
          rotY: ((i * 37 + (side > 0 ? 5 : 19)) % 360) * (Math.PI / 180),
          tintShift: ((i * 19 + (side > 0 ? 1 : 2)) % 5) * 0.035,
        });
      }
    }
  }

  if (treePositions.length === 0) return;

  const trunkGeo = new THREE.CylinderGeometry(0.24, 0.42, 3.0, 6);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x4a3525,
    roughness: 0.94,
    metalness: 0.0,
    envMapIntensity: 0.30,
  });

  // Conifera naturale a 3 palchi (LatheGeometry leggera, profilo realistico e piantata a terra)
  const treeProfile = [
    new THREE.Vector2(0.0, 2.0),
    new THREE.Vector2(2.75, 2.2),
    new THREE.Vector2(1.45, 4.1),
    new THREE.Vector2(2.25, 4.25),
    new THREE.Vector2(1.05, 6.0),
    new THREE.Vector2(1.55, 6.15),
    new THREE.Vector2(0.0, 8.6),
  ];
  const canopyGeo = new THREE.LatheGeometry(treeProfile, 8);
  canopyGeo.computeVertexNormals();
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x264422,
    roughness: 0.90,
    metalness: 0.0,
    envMapIntensity: 0.32,
  });

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
  const canopyInst = new THREE.InstancedMesh(canopyGeo, canopyMat, treePositions.length);
  canopyInst.castShadow = true;
  canopyInst.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const colorTmp = new THREE.Color();
  treePositions.forEach((tp, idx) => {
    dummy.position.set(tp.x, 1.5 * tp.scale, tp.z);
    dummy.rotation.set(0, tp.rotY, 0);
    dummy.scale.setScalar(tp.scale);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(tp.x, 0, tp.z);
    dummy.rotation.set(0, tp.rotY, 0);
    dummy.scale.set(tp.scale, tp.scale * (0.94 + tp.tintShift), tp.scale);
    dummy.updateMatrix();
    canopyInst.setMatrixAt(idx, dummy.matrix);

    colorTmp.setRGB(
      0.85 + tp.tintShift * 1.4,
      0.92 + tp.tintShift * 0.9,
      0.78 + tp.tintShift * 0.5
    );
    canopyInst.setColorAt(idx, colorTmp);
  });
  if (canopyInst.instanceColor) canopyInst.instanceColor.needsUpdate = true;

  group.add(trunkInst, canopyInst);
}

/**
 * Crea una corona di colline / dune dolci all'orizzonte lontano (1 sola mesh leggera)
 * per evitare il taglio netto del terreno piatto contro il cielo al tramonto/alba.
 */
function addDistantHorizonHills(group, biome, centerX, centerZ, bounds, groundMat) {
  if (biome?.biomeId === 'urban_street') return;

  const spanX = (bounds.maxX - bounds.minX) || 800;
  const spanZ = (bounds.maxZ - bounds.minZ) || 800;
  const trackRadius = Math.hypot(spanX, spanZ) * 0.5;
  const innerR = Math.max(trackRadius + 240, 780);
  const outerR = innerR + 720;

  const segAz = 96;
  const segRad = 4;
  const maxHeight = biome?.biomeId === 'desert_night' ? 24 : 58;

  const positions = [];
  const uvs = [];
  const indices = [];

  for (let r = 0; r <= segRad; r++) {
    const tRad = r / segRad;
    const rad = innerR + (outerR - innerR) * tRad;
    const profile = Math.sin(tRad * Math.PI);
    const radEnvelope = Math.pow(profile, 0.85);

    for (let a = 0; a <= segAz; a++) {
      const theta = (a / segAz) * Math.PI * 2;
      const ridgeWave =
        0.52 +
        0.24 * Math.sin(theta * 3.0 + 0.7) +
        0.15 * Math.cos(theta * 7.0 - 1.2) +
        0.09 * Math.sin(theta * 13.0 + 2.1);
      const y = maxHeight * radEnvelope * ridgeWave;

      const x = centerX + Math.cos(theta) * rad;
      const z = centerZ + Math.sin(theta) * rad;
      positions.push(x, y - 0.8, z);
      uvs.push((a / segAz) * 18, tRad * 3);
    }
  }

  const stride = segAz + 1;
  for (let r = 0; r < segRad; r++) {
    for (let a = 0; a < segAz; a++) {
      const i0 = r * stride + a;
      const i1 = i0 + 1;
      const i2 = i0 + stride;
      const i3 = i2 + 1;
      indices.push(i0, i2, i1);
      indices.push(i1, i2, i3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const hillsMesh = new THREE.Mesh(geo, groundMat);
  hillsMesh.name = 'DistantHorizonHills';
  hillsMesh.receiveShadow = true;
  group.add(hillsMesh);
}

function createTeamSignboardTexture(garage, driverNumbers = []) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Sfondo carbon scuro ad alto contrasto
  ctx.fillStyle = '#0b1018';
  ctx.fillRect(0, 0, 512, 128);

  // Banda colore scuderia a sinistra e bordo inferiore luminoso
  ctx.fillStyle = garage.primaryColor || '#e10600';
  ctx.fillRect(0, 0, 24, 128);
  ctx.fillRect(0, 114, 512, 14);

  // Badge numero box (01..11)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fillRect(36, 18, 76, 82);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 40px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(garage.teamIndex + 1).padStart(2, '0'), 74, 59);

  // Nome scuderia maiuscolo nitido
  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 34px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const label = (garage.teamName || garage.teamId).toUpperCase();
  ctx.fillText(label, 128, 48, 366);

  // Numeri pilota del team
  const numsText = driverNumbers.length > 0 ? driverNumbers.map((n) => `#${n}`).join('   •   ') : 'F1 2026';
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '700 22px Arial, sans-serif';
  ctx.fillText(numsText, 128, 88, 366);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Costruisce una geometria a nastro orizzontale sui campioni aperti della pit lane.
 */
function buildOpenPitRibbon(pitSamples, sideSign, innerFn, outerFn, yOffset = 0.022, uvOpts = null) {
  const count = pitSamples.length;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i < count; i++) {
    const s = pitSamples[i];
    const inOff = innerFn(s, i);
    const outOff = outerFn(s, i);
    const y = (s.y ?? 0) + yOffset;

    const ix = s.trackX + s.trackNx * sideSign * inOff;
    const iz = s.trackZ + s.trackNz * sideSign * inOff;
    const ox = s.trackX + s.trackNx * sideSign * outOff;
    const oz = s.trackZ + s.trackNz * sideSign * outOff;

    // Orientamento triangoli coerente con normale +Y indipendentemente da sideSign (+1 o -1)
    if (sideSign > 0) {
      positions.push(ox, y, oz);
      positions.push(ix, y, iz);
    } else {
      positions.push(ix, y, iz);
      positions.push(ox, y, oz);
    }
    normals.push(0, 1, 0, 0, 1, 0);

    if (uvOpts) {
      const vCoord = s.pitArcDist / uvOpts.vTileMeters;
      const uSpan = Math.max(0.1, Math.abs(outOff - inOff)) / uvOpts.uTileMeters;
      uvs.push(0, vCoord);
      uvs.push(uSpan, vCoord);
    } else {
      const t = i / Math.max(1, count - 1);
      uvs.push(0, t);
      uvs.push(1, t);
    }

    if (i < count - 1) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/**
 * Costruisce un muretto 3D aperto (pit wall o barriera rampa ingresso/uscita) lungo una sequenza di campioni.
 */
function buildOpenPitWallGeometry(
  pitSamples,
  sideSign,
  innerFn,
  outerFn,
  height = 1.12,
  filterSegFn = null,
  uDivisor = 8.0
) {
  const count = pitSamples.length;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i < count; i++) {
    const s = pitSamples[i];
    const inOff = innerFn(s, i);
    const outOff = outerFn(s, i);
    const baseY = s.y ?? 0;
    const u = s.pitArcDist / Math.max(1e-3, uDivisor);

    const ix = s.trackX + s.trackNx * sideSign * inOff;
    const iz = s.trackZ + s.trackNz * sideSign * inOff;
    const ox = s.trackX + s.trackNx * sideSign * outOff;
    const oz = s.trackZ + s.trackNz * sideSign * outOff;

    positions.push(ix, baseY, iz);          // 0: inner bottom
    positions.push(ix, baseY + height, iz); // 1: inner top
    positions.push(ox, baseY + height, oz); // 2: outer top
    positions.push(ox, baseY, oz);          // 3: outer bottom

    uvs.push(u, 1);
    uvs.push(u, 0);
    uvs.push(u, 0);
    uvs.push(u, 1);

    if (i < count - 1 && (!filterSegFn || filterSegFn(s, pitSamples[i + 1], i))) {
      const b = i * 4;
      const n = b + 4;
      indices.push(b + 0, b + 1, n + 0);
      indices.push(b + 1, n + 1, n + 0);
      indices.push(b + 1, b + 2, n + 1);
      indices.push(b + 2, n + 2, n + 1);
      indices.push(b + 2, b + 3, n + 2);
      indices.push(b + 3, n + 3, n + 2);
    }
  }

  if (indices.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Costruisce il gruppo 3D completo della Pit Lane (asfalto, pit wall, barriere rampa,
 * segnaletica 60/80 km/h e gli 11 Box Scuderie con piazzole pit-stop).
 * Viene aggiunto al TrackGroup DOPO group.children[3] per preservare l'indice asfalto pista.
 */
function buildPitLaneMeshGroup(trackSurface, biome, sharedBarrierMat) {
  const pitLane = trackSurface?.pitLane;
  if (!pitLane || !pitLane.samples || pitLane.samples.length < 4) {
    return null;
  }

  const pitGroup = new THREE.Group();
  pitGroup.name = 'PitLaneGroup';

  const { samples, sideSign, garages } = pitLane;

  // 1. Nastro asfalto Pit Lane (fast lane + working lane + raccordi ingresso/uscita)
  const pitAsphaltMat = new THREE.MeshPhysicalMaterial({
    map: createAsphaltTexture(),
    color: 0x8f97a3,
    roughness: 0.92,
    metalness: 0.0,
    specularIntensity: 0.24,
    envMapIntensity: 0.18,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  pitAsphaltMat.userData.baseTintHex = 0x8f97a3;
  pitAsphaltMat.userData.colorScale = 1.0;

  const pitAsphaltGeo = buildOpenPitRibbon(
    samples,
    sideSign,
    (s) => (s.zone === 'speed_zone' ? s.pitWallOuter - 0.1 : Math.max(s.trackHalfWidth - 0.25, s.innerEdge)),
    (s) => (s.zone === 'speed_zone' ? s.garageFront + 0.35 : s.outerEdge + 0.2),
    0.022,
    { uTileMeters: 6.0, vTileMeters: 8.0 }
  );
  const pitAsphaltMesh = new THREE.Mesh(pitAsphaltGeo, pitAsphaltMat);
  pitAsphaltMesh.name = 'PitLaneAsphalt';
  pitAsphaltMesh.receiveShadow = true;
  pitGroup.add(pitAsphaltMesh);

  // 2. Pavimento cemento interno dei 11 Box Scuderie
  const garageFloorSamples = samples.filter(
    (s) => s.sMeters >= pitLane.garageRowStartM - 3.0 && s.sMeters <= pitLane.garageRowEndM + 3.0
  );
  const garageFloorMat = new THREE.MeshStandardMaterial({
    color: 0x4b5563,
    roughness: 0.82,
    metalness: 0.04,
    envMapIntensity: 0.24,
  });
  if (garageFloorSamples.length >= 2) {
    const garageFloorGeo = buildOpenPitRibbon(
      garageFloorSamples,
      sideSign,
      (s) => s.garageFront - 0.1,
      (s) => s.garageBack + 0.3,
      0.026,
      { uTileMeters: 4.0, vTileMeters: 4.0 }
    );
    const garageFloorMesh = new THREE.Mesh(garageFloorGeo, garageFloorMat);
    garageFloorMesh.name = 'PitGarageFloor';
    garageFloorMesh.receiveShadow = true;
    pitGroup.add(garageFloorMesh);
  }

  // 3. Muretto separatore Pit Wall + fascia superiore + attenuatore d'urto all'ingresso
  const pitWallMat = new THREE.MeshStandardMaterial({
    color: 0xa6aeb8,
    roughness: 0.84,
    metalness: 0.04,
    envMapIntensity: 0.24,
    side: THREE.DoubleSide,
  });
  const pitWallGeo = buildOpenPitWallGeometry(
    samples,
    sideSign,
    (s) => s.pitWallInner,
    (s) => s.pitWallOuter,
    1.12,
    (a, b) => a.hasPitWall && b.hasPitWall
  );
  if (pitWallGeo) {
    const pitWallMesh = new THREE.Mesh(pitWallGeo, pitWallMat);
    pitWallMesh.name = 'PitWallConcrete';
    pitWallMesh.castShadow = true;
    pitWallMesh.receiveShadow = true;
    pitGroup.add(pitWallMesh);
  }

  // Corrimano metallico + fascia rossa/bianca sopra il pit wall
  const pitRailMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.52,
    metalness: 0.45,
    envMapIntensity: 0.35,
    side: THREE.DoubleSide,
  });
  const pitWallCapGeo = buildOpenPitWallGeometry(
    samples,
    sideSign,
    (s) => s.pitWallInner + 0.08,
    (s) => s.pitWallOuter - 0.08,
    0.12,
    (a, b) => a.hasPitWall && b.hasPitWall
  );
  if (pitWallCapGeo) {
    pitWallCapGeo.translate(0, 1.12, 0);
    const capMat = new THREE.MeshStandardMaterial({
      color: 0xe10600,
      roughness: 0.65,
      metalness: 0.08,
      envMapIntensity: 0.32,
      side: THREE.DoubleSide,
    });
    const pitWallCapMesh = new THREE.Mesh(pitWallCapGeo, capMat);
    pitWallCapMesh.name = 'PitWallTopTrim';
    pitGroup.add(pitWallCapMesh);
  }

  // Attenuatore giallo/nero sul muso d'ingresso del pit wall
  const firstWallSample = samples.find((s) => s.hasPitWall);
  if (firstWallSample) {
    const noseOffset = (firstWallSample.pitWallInner + firstWallSample.pitWallOuter) * 0.5;
    const noseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(pitLane.config.pitWallThickness + 0.16, 1.05, 1.4),
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        roughness: 0.58,
        metalness: 0.06,
        envMapIntensity: 0.32,
      })
    );
    noseMesh.position.set(
      firstWallSample.trackX + firstWallSample.trackNx * sideSign * noseOffset - firstWallSample.trackTx * 0.7,
      (firstWallSample.y ?? 0) + 0.525,
      firstWallSample.trackZ + firstWallSample.trackNz * sideSign * noseOffset - firstWallSample.trackTz * 0.7
    );
    noseMesh.rotation.y = Math.atan2(firstWallSample.trackTx, firstWallSample.trackTz);
    noseMesh.castShadow = true;
    noseMesh.receiveShadow = true;
    pitGroup.add(noseMesh);
  }

  // 4. Barriere esterne delle rampe di ingresso e uscita (chiudono il varco verso il guardrail principale)
  // Usa uDivisor = trackSurface.totalLength per allineare 1:1 il tiling rosso-bianco di sharedBarrierMat
  const outerEntryBarrierGeo = buildOpenPitWallGeometry(
    samples,
    sideSign,
    (s) => s.outerBarrierOffset,
    (s) => s.outerBarrierOffset + 0.45,
    1.15,
    (a, b) => a.sMeters < pitLane.garageRowStartM && b.sMeters <= pitLane.garageRowStartM + 3.0,
    trackSurface.totalLength
  );
  if (outerEntryBarrierGeo) {
    const m = new THREE.Mesh(outerEntryBarrierGeo, sharedBarrierMat);
    m.name = 'PitEntryOuterBarrier';
    m.castShadow = true;
    m.receiveShadow = true;
    pitGroup.add(m);
  }

  const outerExitBarrierGeo = buildOpenPitWallGeometry(
    samples,
    sideSign,
    (s) => s.outerBarrierOffset,
    (s) => s.outerBarrierOffset + 0.45,
    1.15,
    (a, b) => a.sMeters >= pitLane.garageRowEndM - 3.0 && b.sMeters > pitLane.garageRowEndM,
    trackSurface.totalLength
  );
  if (outerExitBarrierGeo) {
    const m = new THREE.Mesh(outerExitBarrierGeo, sharedBarrierMat);
    m.name = 'PitExitOuterBarrier';
    m.castShadow = true;
    m.receiveShadow = true;
    pitGroup.add(m);
  }

  // 5. Segnaletica orizzontale: linea bianca divisoria Fast Lane / Working Lane + linee Speed Limit
  const whiteLineMat = new THREE.MeshStandardMaterial({
    color: 0xe8edf5,
    roughness: 0.84,
    metalness: 0.0,
    envMapIntensity: 0.35,
  });
  const redStripeMat = new THREE.MeshStandardMaterial({
    color: 0xe10600,
    roughness: 0.78,
    metalness: 0.0,
    envMapIntensity: 0.35,
  });

  const speedSamples = samples.filter((s) => s.zone === 'speed_zone');
  if (speedSamples.length >= 2) {
    const dividerGeo = buildOpenPitRibbon(
      speedSamples,
      sideSign,
      (s) => s.fastLaneOuter - 0.08,
      (s) => s.fastLaneOuter + 0.08,
      0.032
    );
    const dividerMesh = new THREE.Mesh(dividerGeo, whiteLineMat);
    dividerMesh.name = 'PitFastLaneDivider';
    dividerMesh.receiveShadow = true;
    pitGroup.add(dividerMesh);
  }

  // Linee trasversali inizio/fine zona pit lane sull'asfalto (senza cartelli verticali km/h)
  const addSpeedLimitGate = (frame, isEndSign) => {
    if (!frame) return;
    const laneSpan = Math.max(4.0, frame.garageFront - frame.pitWallOuter);
    const midOffset = (frame.pitWallOuter + frame.garageFront) * 0.5;
    const gateHeading = Math.atan2(frame.trackTx, frame.trackTz);

    const gateGroup = new THREE.Group();
    gateGroup.position.set(
      frame.trackX + frame.trackNx * sideSign * midOffset,
      frame.y ?? 0,
      frame.trackZ + frame.trackNz * sideSign * midOffset
    );
    gateGroup.rotation.y = gateHeading;

    // Linea bianca + fascia rossa FIA sull'asfalto
    const whiteStrip = new THREE.Mesh(new THREE.PlaneGeometry(laneSpan, 0.42), whiteLineMat);
    whiteStrip.rotation.x = -Math.PI / 2;
    whiteStrip.position.set(0, 0.035, 0);
    gateGroup.add(whiteStrip);

    const redStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(laneSpan, 0.24),
      isEndSign ? pitRailMat : redStripeMat
    );
    redStrip.rotation.x = -Math.PI / 2;
    redStrip.position.set(0, 0.036, isEndSign ? 0.34 : -0.34);
    gateGroup.add(redStrip);

    pitGroup.add(gateGroup);
  };

  addSpeedLimitGate(pitLane.speedLimitStartFrame, false);
  addSpeedLimitGate(pitLane.speedLimitEndFrame, true);

  // 6. Edificio Paddock + 11 Box Scuderie (colori F1 2026, insegne, interni aperti, piazzole pit-stop)
  const garageWallMat = new THREE.MeshStandardMaterial({
    color: 0x222834,
    roughness: 0.84,
    metalness: 0.08,
    envMapIntensity: 0.24,
  });
  const garageInteriorMat = new THREE.MeshStandardMaterial({
    color: 0x11151d,
    roughness: 0.90,
    metalness: 0.05,
    envMapIntensity: 0.16,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x2b3240,
    roughness: 0.78,
    metalness: 0.16,
    envMapIntensity: 0.26,
  });
  const upperGlassMat = new THREE.MeshStandardMaterial({
    color: 0x0f1a2b,
    roughness: 0.24,
    metalness: 0.55,
    envMapIntensity: 0.65,
  });
  const ledStripMat = new THREE.MeshBasicMaterial({
    color: biome?.isNight ? 0xe0f2fe : 0xf8fafc,
  });
  const yellowBoxMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.76,
    metalness: 0.0,
    envMapIntensity: 0.35,
  });

  // Mappa rapida numeri piloti per scuderia
  const driversByTeam = {};
  for (const drv of F1_2026_DRIVERS) {
    if (!driversByTeam[drv.teamId]) driversByTeam[drv.teamId] = [];
    driversByTeam[drv.teamId].push(drv.number);
  }

  for (let idx = 0; idx < garages.length; idx++) {
    const g = garages[idx];
    const bayW = g.bayWidth;
    const depth = g.depth;
    const height = g.height;
    const pillarW = 0.48;
    const fasciaH = 0.58;
    const openingH = height - 1.28; // ~3.32 m luce libera portale box
    const canopyOverhang = 1.95;

    // Sistema locale del box:
    // +Z locale = direzione marcia pit lane (tx, tz)
    // +X locale = verso la pista (outX, outZ = -sideSign * trackN) → così la facciata aperta guarda sempre +X locale?
    // Verifichiamo: in Three.js se rotation.y = heading = atan2(tx, tz):
    // local +Z = (tx, tz), local +X = (tz, -tx) = trackN!
    // Quindi direzione verso l'esterno (dal fronte box verso il retro box) è local X = sideSign!
    // E direzione verso la fast lane (dal fronte box verso la pista) è local X = -sideSign!
    const bayGroup = new THREE.Group();
    bayGroup.name = `PitGarage_${g.teamId}`;
    bayGroup.position.set(g.frontPos.x, g.frontPos.y ?? 0, g.frontPos.z);
    bayGroup.rotation.y = g.heading;

    const toBack = sideSign;     // +1 se pit a sinistra, -1 se pit a destra
    const toLane = -sideSign;    // verso fast lane

    // Parete posteriore box
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, height, bayW + 0.04),
      garageWallMat
    );
    backWall.position.set(toBack * (depth - 0.22), height * 0.5, 0);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    bayGroup.add(backWall);

    // Parete interna scura per profondità box
    const backInner = new THREE.Mesh(
      new THREE.PlaneGeometry(bayW - 0.3, openingH),
      garageInteriorMat
    );
    backInner.position.set(toBack * (depth - 0.46), openingH * 0.5, 0);
    backInner.rotation.y = toLane > 0 ? Math.PI / 2 : -Math.PI / 2;
    bayGroup.add(backInner);

    // Divisori laterali (sinistra e destra lungo Z locale)
    const sideWallGeo = new THREE.BoxGeometry(depth, height, 0.34);
    const sideWallA = new THREE.Mesh(sideWallGeo, garageWallMat);
    sideWallA.position.set(toBack * (depth * 0.5), height * 0.5, -bayW * 0.5 + 0.17);
    sideWallA.castShadow = true;
    sideWallA.receiveShadow = true;
    bayGroup.add(sideWallA);

    if (idx === garages.length - 1) {
      const sideWallB = new THREE.Mesh(sideWallGeo, garageWallMat);
      sideWallB.position.set(toBack * (depth * 0.5), height * 0.5, bayW * 0.5 - 0.17);
      sideWallB.castShadow = true;
      sideWallB.receiveShadow = true;
      bayGroup.add(sideWallB);
    }

    // Pilastri anteriori che incorniciano l'ingresso aperto del box
    const pillarGeo = new THREE.BoxGeometry(0.48, openingH, pillarW);
    const frontPillarA = new THREE.Mesh(pillarGeo, garageWallMat);
    frontPillarA.position.set(toBack * 0.24, openingH * 0.5, -bayW * 0.5 + pillarW * 0.5);
    frontPillarA.castShadow = true;
    const frontPillarB = new THREE.Mesh(pillarGeo, garageWallMat);
    frontPillarB.position.set(toBack * 0.24, openingH * 0.5, bayW * 0.5 - pillarW * 0.5);
    frontPillarB.castShadow = true;
    bayGroup.add(frontPillarA, frontPillarB);

    // Tetto box + pensilina aggettante verso la working lane
    const roofDepth = depth + canopyOverhang;
    const roofCenterLocalX = toBack * (depth * 0.5 - canopyOverhang * 0.5);
    const roofMesh = new THREE.Mesh(
      new THREE.BoxGeometry(roofDepth, 0.38, bayW + 0.04),
      roofMat
    );
    roofMesh.position.set(roofCenterLocalX, height - 0.19, 0);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    bayGroup.add(roofMesh);

    // Architrave superiore frontale + fascia colore ufficiale scuderia
    const headerH = height - openingH;
    const headerMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, headerH, bayW + 0.02),
      garageWallMat
    );
    headerMesh.position.set(toBack * 0.27, openingH + headerH * 0.5, 0);
    headerMesh.castShadow = true;
    bayGroup.add(headerMesh);

    const teamAccentMat = new THREE.MeshStandardMaterial({
      color: g.primaryColor,
      roughness: 0.42,
      metalness: 0.12,
      envMapIntensity: 0.42,
    });
    const fasciaStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, fasciaH, bayW - 0.12),
      teamAccentMat
    );
    fasciaStrip.position.set(toLane * (canopyOverhang - 0.05), height - 0.28, 0);
    bayGroup.add(fasciaStrip);

    // Insegna frontale scuderia con CanvasTexture nitida rivolta verso la pit lane e la pista
    const signW = Math.min(bayW - 1.2, 11.5);
    const signH = 1.18;
    const signTex = createTeamSignboardTexture(g, driversByTeam[g.teamId] || []);
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      color: 0xffffff,
      roughness: 0.46,
      metalness: 0.06,
      envMapIntensity: 0.35,
      emissive: biome?.isNight ? new THREE.Color(0x1e293b) : new THREE.Color(0x000000),
      emissiveMap: biome?.isNight ? signTex : null,
      emissiveIntensity: biome?.isNight ? 0.55 : 0.0,
    });
    const signBoard = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), signMat);
    signBoard.position.set(toLane * (canopyOverhang + 0.05), height + 0.48, 0);
    signBoard.rotation.y = toLane > 0 ? Math.PI / 2 : -Math.PI / 2;
    bayGroup.add(signBoard);

    // Striscia LED sottoporta box (illumina l'ingresso del garage, molto visibile di notte)
    const ledBar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, bayW - 1.4), ledStripMat);
    ledBar.position.set(toLane * (canopyOverhang * 0.45), openingH + 0.08, 0);
    bayGroup.add(ledBar);

    // Piano superiore Paddock Club vetrato (volume architettonico pulito)
    const upperH = 2.65;
    const upperLevel = new THREE.Mesh(
      new THREE.BoxGeometry(depth * 0.86, upperH, bayW + 0.04),
      upperGlassMat
    );
    upperLevel.position.set(toBack * (depth * 0.52), height + upperH * 0.5, 0);
    upperLevel.castShadow = true;
    upperLevel.receiveShadow = true;
    bayGroup.add(upperLevel);

    // Piazzola Pit-Stop dipinta a terra sulla working lane davanti al box
    const stopDeltaLat = g.garageFrontOffset - g.workingLaneOffset; // positivo verso la pista
    const stopLocalX = toLane * stopDeltaLat;
    const boxW = 2.55;
    const boxL = 5.6;

    const frontStopBar = new THREE.Mesh(new THREE.PlaneGeometry(boxW, 0.24), yellowBoxMat);
    frontStopBar.rotation.x = -Math.PI / 2;
    frontStopBar.position.set(stopLocalX, 0.036, boxL * 0.5);
    bayGroup.add(frontStopBar);

    const rearStopBar = new THREE.Mesh(new THREE.PlaneGeometry(boxW, 0.18), whiteLineMat);
    rearStopBar.rotation.x = -Math.PI / 2;
    rearStopBar.position.set(stopLocalX, 0.036, -boxL * 0.5);
    bayGroup.add(rearStopBar);

    const sideLineL = new THREE.Mesh(new THREE.PlaneGeometry(0.16, boxL), teamAccentMat);
    sideLineL.rotation.x = -Math.PI / 2;
    sideLineL.position.set(stopLocalX - boxW * 0.5, 0.036, 0);
    bayGroup.add(sideLineL);

    const sideLineR = new THREE.Mesh(new THREE.PlaneGeometry(0.16, boxL), teamAccentMat);
    sideLineR.rotation.x = -Math.PI / 2;
    sideLineR.position.set(stopLocalX + boxW * 0.5, 0.036, 0);
    bayGroup.add(sideLineR);

    pitGroup.add(bayGroup);
  }

  return {
    group: pitGroup,
    pitAsphaltMat,
    pitWallMat,
    garageFloorMat,
    garageWallMat,
  };
}

function hydrateTrackPbrMaterials({
  biome,
  asphaltMat,
  groundMat,
  runoffMat,
  kerbMat,
  barrierMat,
  bridgeDeckMat,
  gantryMat,
  pitAsphaltMat,
  pitWallMat,
  garageFloorMat,
  garageWallMat,
  groundRepeatX,
  groundRepeatY,
  kerbRepeatY,
  barrierRepeatX,
}) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let disposed = false;
  const ownedTextures = [];

  const registerTex = (tex) => {
    if (tex) ownedTextures.push(tex);
    return tex;
  };

  const applyFullPbrSet = (
    mat,
    set,
    { tintHex = null, normalScale = 0.8, useRoughnessMap = true } = {}
  ) => {
    if (!mat || !set) return;
    if (disposed) {
      set.map?.dispose?.();
      set.normalMap?.dispose?.();
      set.roughnessMap?.dispose?.();
      return;
    }
    const prevMap = mat.map;
    if (set.map) {
      mat.map = registerTex(set.map);
      if (prevMap && prevMap !== set.map) prevMap.dispose?.();
    }
    if (set.normalMap) {
      mat.normalMap = registerTex(set.normalMap);
      mat.normalScale?.set?.(normalScale, normalScale);
    }
    if (set.roughnessMap) {
      if (useRoughnessMap) {
        mat.roughnessMap = registerTex(set.roughnessMap);
      } else {
        set.roughnessMap.dispose?.();
      }
    }
    if (tintHex !== null && tintHex !== undefined) {
      mat.color.setHex(tintHex);
    }
    mat.needsUpdate = true;
  };

  const applySurfaceDetailOnly = (mat, set, { normalScale = 0.6 } = {}) => {
    if (!mat || !set) return;
    // Mantiene la mappa colore procedurale (es. cordoli/guardrail F1) e rilascia il clone albedo inutilizzato
    set.map?.dispose?.();
    if (disposed) {
      set.normalMap?.dispose?.();
      set.roughnessMap?.dispose?.();
      return;
    }
    if (set.normalMap) {
      mat.normalMap = registerTex(set.normalMap);
      mat.normalScale?.set?.(normalScale, normalScale);
    }
    if (set.roughnessMap) {
      mat.roughnessMap = registerTex(set.roughnessMap);
    }
    mat.needsUpdate = true;
  };

  assetManager3D
    .loadPBRTextureSet(biome.asphaltTextureId, { repeatX: 1, repeatY: 1, anisotropy: 12 })
    .then((set) => {
      applyFullPbrSet(asphaltMat, set, {
        tintHex: biome.asphaltTint,
        normalScale: 1.15,
      });
      if (asphaltMat && !disposed) {
        const baseTint = asphaltMat.userData?.baseTintHex ?? biome.asphaltTint ?? 0xa4aab4;
        const colorScale = asphaltMat.userData?.colorScale ?? 1.0;
        asphaltMat.color.setHex(baseTint).multiplyScalar(colorScale);
      }
    });

  const isOrganicMatteGround =
    biome.groundTextureId === 'grass_004' ||
    biome.groundTextureId === 'coast_sand_01' ||
    biome.groundTextureId === 'gravelly_sand';

  assetManager3D
    .loadPBRTextureSet(biome.groundTextureId, {
      repeatX: groundRepeatX,
      repeatY: groundRepeatY,
      anisotropy: 8,
    })
    .then((set) => {
      applyFullPbrSet(groundMat, set, {
        tintHex: biome.groundTint,
        normalScale: isOrganicMatteGround ? 0.32 : 0.68,
        // Erba e sabbia opache: evita il washout speculare Fresnel ad angoli radenti con HDRI
        useRoughnessMap: !isOrganicMatteGround,
      });
    });

  assetManager3D
    .loadPBRTextureSet(biome.runoffTextureId, { repeatX: 1, repeatY: 1, anisotropy: 8 })
    .then((set) => {
      applyFullPbrSet(runoffMat, set, {
        tintHex: biome.runoffTint,
        normalScale: 0.7,
        useRoughnessMap: biome.runoffTextureId !== 'gravelly_sand',
      });
    });

  assetManager3D
    .loadPBRTextureSet(biome.wallTextureId, {
      repeatX: 1,
      repeatY: Math.max(40, Math.round(kerbRepeatY * 0.5)),
      anisotropy: 8,
    })
    .then((set) => {
      applySurfaceDetailOnly(kerbMat, set, { normalScale: 0.45 });
    });

  assetManager3D
    .loadPBRTextureSet(biome.metalTextureId, {
      repeatX: Math.max(40, Math.round(barrierRepeatX * 0.5)),
      repeatY: 1,
      anisotropy: 8,
    })
    .then((set) => {
      applySurfaceDetailOnly(barrierMat, set, { normalScale: 0.55 });
    });

  if (bridgeDeckMat) {
    assetManager3D
      .loadPBRTextureSet(biome.wallTextureId, { repeatX: 1, repeatY: 1, anisotropy: 8 })
      .then((set) => {
        applyFullPbrSet(bridgeDeckMat, set, { tintHex: 0x9aa4b2, normalScale: 0.7 });
      });
  }

  assetManager3D
    .loadPBRTextureSet(biome.metalTextureId, { repeatX: 2, repeatY: 2, anisotropy: 4 })
    .then((set) => {
      applySurfaceDetailOnly(gantryMat, set, { normalScale: 0.5 });
    });

  if (pitAsphaltMat) {
    assetManager3D
      .loadPBRTextureSet('asphalt_pit_lane', { repeatX: 1, repeatY: 1, anisotropy: 10 })
      .then((set) => {
        applyFullPbrSet(pitAsphaltMat, set, {
          tintHex: pitAsphaltMat.userData?.baseTintHex ?? 0x8f97a3,
          normalScale: 0.95,
        });
        if (pitAsphaltMat && !disposed) {
          const baseTint = pitAsphaltMat.userData?.baseTintHex ?? 0x8f97a3;
          const colorScale = pitAsphaltMat.userData?.colorScale ?? 1.0;
          pitAsphaltMat.color.setHex(baseTint).multiplyScalar(colorScale);
        }
      });
  }

  if (pitWallMat) {
    assetManager3D
      .loadPBRTextureSet('concrete_wall_007', { repeatX: 1, repeatY: 1, anisotropy: 8 })
      .then((set) => {
        applyFullPbrSet(pitWallMat, set, { tintHex: 0xb0b8c2, normalScale: 0.65 });
      });
  }

  if (garageFloorMat) {
    assetManager3D
      .loadPBRTextureSet('concrete_floor_painted', { repeatX: 1, repeatY: 1, anisotropy: 8 })
      .then((set) => {
        applyFullPbrSet(garageFloorMat, set, { tintHex: 0x6b7280, normalScale: 0.5 });
      });
  }

  if (garageWallMat) {
    assetManager3D
      .loadPBRTextureSet('concrete_wall_007', { repeatX: 2, repeatY: 2, anisotropy: 4 })
      .then((set) => {
        applyFullPbrSet(garageWallMat, set, { tintHex: 0x2a3140, normalScale: 0.5 });
      });
  }

  return () => {
    disposed = true;
    for (const tex of ownedTextures) {
      tex?.dispose?.();
    }
    ownedTextures.length = 0;
  };
}

export function buildTrackMeshGroup(trackData) {
  const group = new THREE.Group();
  group.name = `Track_${trackData.id}`;

  const biome = getTrackBiomeConfig(trackData);
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

  // 1. Piano terreno proporzionato al circuito (child index 0 — preservato per test UV)
  const padding = 1600;
  const planeWidth = (bounds.maxX - bounds.minX) + padding;
  const planeHeight = (bounds.maxZ - bounds.minZ) + padding;
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
  const groundRepeatX = Math.max(8, Math.round(planeWidth / biome.groundTileMeters));
  const groundRepeatY = Math.max(8, Math.round(planeHeight / biome.groundTileMeters));

  const grassGeo = new THREE.PlaneGeometry(planeWidth, planeHeight);
  grassGeo.rotateX(-Math.PI / 2);
  const grassMat = new THREE.MeshStandardMaterial({
    map: createGrassTexture(
      groundRepeatX,
      groundRepeatY,
      biome.groundFallbackBase,
      biome.groundFallbackAlt
    ),
    roughness: 0.98,
    metalness: 0.0,
    envMapIntensity: 0.30,
  });
  const grassMesh = new THREE.Mesh(grassGeo, grassMat);
  grassMesh.position.set(centerX, 0, centerZ);
  grassMesh.receiveShadow = true;
  group.add(grassMesh);

  // 2a. Banchine / vie di fuga laterali (child index 1 e 2 — preservato per test UV)
  const computeRunoffSpan = (s, barOffset) => {
    const hw = s.halfWidth ?? halfTrackWidth;
    const room = Math.max(0.25, barOffset - hw);
    return isStreet ? room : Math.min(room, kerbWidth + 2.6);
  };
  const runoffMat = new THREE.MeshStandardMaterial({
    color: isStreet ? 0x333a45 : 0x565a5e,
    roughness: isStreet ? 0.86 : 0.94,
    metalness: 0.0,
    envMapIntensity: isStreet ? 0.48 : 0.32,
  });
  const runoffUvOptions = { uTileMeters: 5.0, vTileMeters: 8.0, totalLength };
  const leftRunoffGeo = buildRibbonFromSamples(
    samples,
    (s) => computeRunoffSpan(s, s.leftBarrierOffset ?? barrierHalfWidth) * 0.5,
    (s) => (s.halfWidth ?? halfTrackWidth) + computeRunoffSpan(s, s.leftBarrierOffset ?? barrierHalfWidth) * 0.5,
    0.012,
    null,
    runoffUvOptions
  );
  const rightRunoffGeo = buildRibbonFromSamples(
    samples,
    (s) => computeRunoffSpan(s, s.rightBarrierOffset ?? barrierHalfWidth) * 0.5,
    (s) => -((s.halfWidth ?? halfTrackWidth) + computeRunoffSpan(s, s.rightBarrierOffset ?? barrierHalfWidth) * 0.5),
    0.012,
    null,
    runoffUvOptions
  );
  const leftRunoffMesh = new THREE.Mesh(leftRunoffGeo, runoffMat);
  const rightRunoffMesh = new THREE.Mesh(rightRunoffGeo, runoffMat);
  leftRunoffMesh.receiveShadow = true;
  rightRunoffMesh.receiveShadow = true;
  group.add(leftRunoffMesh, rightRunoffMesh);

  // 2. Nastro d'asfalto con estrusione dinamica ±(width/2) e tiling UV orizzontale metrico (child index 3)
  const asphaltGeo = buildRibbonFromSamples(
    samples,
    (s) => s.halfWidth ?? halfTrackWidth,
    0,
    0.02,
    null,
    { uTileMeters: 7.0, vTileMeters: 10.0, totalLength }
  );
  const asphaltMat = new THREE.MeshPhysicalMaterial({
    map: createAsphaltTexture(),
    color: biome.asphaltTint ?? 0xa4aab4,
    roughness: 0.96,
    metalness: 0.0,
    specularIntensity: 0.22,
    envMapIntensity: 0.16,
  });
  asphaltMat.userData.baseTintHex = biome.asphaltTint ?? 0xa4aab4;
  asphaltMat.userData.colorScale = 1.0;
  const asphaltMesh = new THREE.Mesh(asphaltGeo, asphaltMat);
  asphaltMesh.receiveShadow = true;
  group.add(asphaltMesh);

  // Linee bianche continue FIA in PBR (aperte sui varchi ingresso/uscita pit lane)
  const pitLane = trackSurface.pitLane;
  const isLeftPitOpen = (i) => Boolean(pitLane && pitLane.sideSign > 0 && pitLane.pitOpeningSkipMask?.[i]);
  const isRightPitOpen = (i) => Boolean(pitLane && pitLane.sideSign < 0 && pitLane.pitOpeningSkipMask?.[i]);

  const edgeLineMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.85,
    metalness: 0.0,
    envMapIntensity: 0.45,
  });
  const leftEdgeLineGeo = buildRibbonFromSamples(
    samples,
    0.1,
    (s) => (s.halfWidth ?? halfTrackWidth) - 0.18,
    0.026,
    (_s, i) => !isLeftPitOpen(i)
  );
  const rightEdgeLineGeo = buildRibbonFromSamples(
    samples,
    0.1,
    (s) => -((s.halfWidth ?? halfTrackWidth) - 0.18),
    0.026,
    (_s, i) => !isRightPitOpen(i)
  );
  const leftEdgeLineMesh = new THREE.Mesh(leftEdgeLineGeo, edgeLineMat);
  const rightEdgeLineMesh = new THREE.Mesh(rightEdgeLineGeo, edgeLineMat);
  leftEdgeLineMesh.receiveShadow = true;
  rightEdgeLineMesh.receiveShadow = true;
  group.add(leftEdgeLineMesh, rightEdgeLineMesh);

  // 2b. Soletta ponte per tratti sopraelevati (es. cavalcavia a 8 di Suzuka)
  const bridgeDeckGeo = buildBridgeDeckGeometry(samples, halfTrackWidth, 0.45, kerbWidth);
  let bridgeDeckMat = null;
  if (bridgeDeckGeo) {
    bridgeDeckMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.86,
      metalness: 0.04,
      envMapIntensity: 0.45,
      side: THREE.DoubleSide,
    });
    const bridgeDeckMesh = new THREE.Mesh(bridgeDeckGeo, bridgeDeckMat);
    bridgeDeckMesh.castShadow = true;
    bridgeDeckMesh.receiveShadow = true;
    group.add(bridgeDeckMesh);
  }

  // 3. Cordoli interno ed esterno solo sugli apex delle curve
  const halfKerb = kerbWidth * 0.5;
  const kerbRepeatY = Math.max(100, Math.round(totalLength / 4));
  const kerbMat = new THREE.MeshStandardMaterial({
    map: createKerbTexture(trackData.kerbStyle, kerbRepeatY),
    roughness: 0.88,
    metalness: 0.0,
    envMapIntensity: 0.32,
  });

  const leftKerbGeo = buildRibbonFromSamples(
    samples,
    halfKerb,
    (s) => (s.halfWidth ?? halfTrackWidth) + halfKerb * 0.92,
    0.03,
    (s, i) => s.hasKerb && !isLeftPitOpen(i)
  );
  const rightKerbGeo = buildRibbonFromSamples(
    samples,
    halfKerb,
    (s) => -((s.halfWidth ?? halfTrackWidth) + halfKerb * 0.92),
    0.03,
    (s, i) => s.hasKerb && !isRightPitOpen(i)
  );
  const leftKerbMesh = new THREE.Mesh(leftKerbGeo, kerbMat);
  const rightKerbMesh = new THREE.Mesh(rightKerbGeo, kerbMat);
  leftKerbMesh.receiveShadow = true;
  rightKerbMesh.receiveShadow = true;
  group.add(leftKerbMesh, rightKerbMesh);

  // 4. Barriere di sicurezza / muretti 3D continui ai due lati
  const barrierRepeatX = Math.max(120, Math.round(totalLength / 8));
  const barrierMat = new THREE.MeshStandardMaterial({
    map: createBarrierTexture(barrierRepeatX),
    roughness: 0.76,
    metalness: 0.14,
    envMapIntensity: 0.28,
    side: THREE.DoubleSide,
  });

  const skipLeftBarrier =
    pitLane && pitLane.sideSign > 0 ? (i) => Boolean(pitLane.mainBarrierSkipMask[i]) : null;
  const skipRightBarrier =
    pitLane && pitLane.sideSign < 0 ? (i) => Boolean(pitLane.mainBarrierSkipMask[i]) : null;

  const leftBarrierGeo = buildBarrierGeometry(samples, 1, barrierHalfWidth, 0.45, 1.15, skipLeftBarrier);
  const rightBarrierGeo = buildBarrierGeometry(samples, -1, barrierHalfWidth, 0.45, 1.15, skipRightBarrier);
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
  const startLineMat = new THREE.MeshStandardMaterial({
    map: createCheckerTexture(),
    roughness: 0.84,
    metalness: 0.0,
    envMapIntensity: 0.45,
  });
  const startLineMesh = new THREE.Mesh(startLineGeo, startLineMat);
  startLineMesh.position.set(0, 0.038, 0);
  startLineMesh.receiveShadow = true;

  const gantryGroup = new THREE.Group();
  gantryGroup.position.set(s0.x, s0.y ?? 0, s0.z);
  gantryGroup.rotation.y = Math.atan2(s0.tx, s0.tz);

  const startOnPitWall = Boolean(pitLane && pitLane.pitWallStartM <= 0 && pitLane.pitWallEndM >= 0);
  const pitWallCenterAtStart = pitLane
    ? startHalfW + pitLane.config.pitWallGap + pitLane.config.pitWallThickness * 0.5
    : 0;
  const leftPillarX =
    startOnPitWall && pitLane.sideSign > 0
      ? pitWallCenterAtStart
      : Math.max(startHalfW + kerbWidth + 1.2, startBarrierL + 0.65);
  const rightPillarX =
    startOnPitWall && pitLane.sideSign < 0
      ? -pitWallCenterAtStart
      : -Math.max(startHalfW + kerbWidth + 1.2, startBarrierR + 0.65);
  const gantrySpan = leftPillarX - rightPillarX;

  const pillarGeo = new THREE.BoxGeometry(0.6, 6.5, 0.6);
  const gantryMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.48,
    metalness: 0.45,
    envMapIntensity: 0.52,
  });
  const bannerMat = new THREE.MeshStandardMaterial({
    color: 0xe10600,
    roughness: 0.62,
    metalness: 0.05,
    envMapIntensity: 0.45,
  });

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

  // Caselle bianche della griglia di partenza in PBR (22 posizioni sfalsate)
  const gridSlots = computeStartingGridTransforms(trackSurface, 22, trackData.startTransform);
  const gridMat = new THREE.MeshStandardMaterial({
    color: 0xe8edf5,
    roughness: 0.86,
    metalness: 0.0,
    envMapIntensity: 0.45,
  });
  const frontBarGeo = new THREE.BoxGeometry(2.1, 0.02, 0.22);
  const sideBarGeo = new THREE.BoxGeometry(0.18, 0.02, 3.2);
  for (const slot of gridSlots) {
    const slotGroup = new THREE.Group();
    slotGroup.position.set(slot.x, (slot.y ?? 0) + 0.036, slot.z);
    slotGroup.rotation.y = slot.heading;

    const frontBar = new THREE.Mesh(frontBarGeo, gridMat);
    frontBar.position.set(0, 0, 2.35);
    frontBar.receiveShadow = true;
    const leftBar = new THREE.Mesh(sideBarGeo, gridMat);
    leftBar.position.set(0.96, 0, 0.85);
    leftBar.receiveShadow = true;
    const rightBar = new THREE.Mesh(sideBarGeo, gridMat);
    rightBar.position.set(-0.96, 0, 0.85);
    rightBar.receiveShadow = true;

    slotGroup.add(frontBar, leftBar, rightBar);
    group.add(slotGroup);
  }

  // 5b. Pit Lane, Pit Wall, Segnaletica 60/80 e 11 Box Scuderie (aggiunti DOPO group.children[3])
  const builtPitLane = buildPitLaneMeshGroup(trackSurface, biome, barrierMat);
  if (builtPitLane?.group) {
    group.add(builtPitLane.group);
  }

  // 6. Alberi del parco & colline perimetrali lontane (istanziati / mesh leggera per alte prestazioni)
  addParkTrees(group, trackSurface, biome);
  addDistantHorizonHills(group, biome, centerX, centerZ, bounds, grassMat);

  // 7. Idratazione asincrona delle texture PBR 2K dal manifest (no-op in Node headless)
  const disposePbr = hydrateTrackPbrMaterials({
    biome,
    asphaltMat,
    groundMat: grassMat,
    runoffMat,
    kerbMat,
    barrierMat,
    bridgeDeckMat,
    gantryMat,
    pitAsphaltMat: builtPitLane?.pitAsphaltMat || null,
    pitWallMat: builtPitLane?.pitWallMat || null,
    garageFloorMat: builtPitLane?.garageFloorMat || null,
    garageWallMat: builtPitLane?.garageWallMat || null,
    groundRepeatX,
    groundRepeatY,
    kerbRepeatY,
    barrierRepeatX,
  });

  return {
    group,
    trackSurface,
    asphaltMaterial: asphaltMat,
    pitAsphaltMaterial: builtPitLane?.pitAsphaltMat || null,
    kerbMaterial: kerbMat,
    edgeLineMaterial: edgeLineMat,
    biome,
    disposePbr,
  };
}
