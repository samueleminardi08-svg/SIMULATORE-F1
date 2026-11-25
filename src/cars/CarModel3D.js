/**
 * Costruttore 3D della monoposto di Formula 1 in Three.js.
 * Carica in singleton il modello ufficiale 2026 Ferrari SF-26 (`2026_ferrari_sf-26.glb`)
 * separando carrozzeria, 4 ruote (sterzo anteriore + rotolamento), pinze freno e volante abitacolo,
 * mantenendo un fallback procedurale immediato durante il caricamento o nei test headless Node.
 *
 * Orientamento locale: musetto verso +Z, alettone posteriore verso -Z,
 * lato sinistro verso +X, lato destro verso -X, appoggio pneumatici a Y = 0.
 */

import * as THREE from 'three';
import { CAR_PHYSICS_CONFIG, TIRE_COMPOUNDS } from '../config/constants.js';
import { assetManager3D } from '../rendering/AssetManager3D.js';
import { queryTrackSurface } from '../tracks/TrackSurface.js';

const WHEEL_KEYS = ['fl', 'fr', 'rl', 'rr'];

export const LOCKUP_INNER_STEER_THRESHOLD = 0.025;

// Parametri sospensioni attive visive (100% estetici: scocca ferma stile F1, nessuna modifica fisica)
export const VISUAL_SUSPENSION_LIMITS = {
  maxPitchRad: 0.0085,   // ±0.487° max
  maxRollRad: 0.0075,    // ±0.430° max
  maxAeroDropM: 0.018,   // -1.8 cm max schiacciamento aero morbido
  dampingRate: 12.0,     // 1 - exp(-12 * dt)
};

// Sollevamento localizzato ruota singola su cordolo (kerb) + micro-zigrinatura
export const VISUAL_KERB_LIFT = {
  minM: 0.015,           // +1.5 cm minimo su cordolo
  maxM: 0.025,           // +2.5 cm massimo su cordolo
  serrationAmpM: 0.0025, // ±2.5 mm micro-zigrinatura
  serrationPitchM: 0.65, // passo denti cordolo lungo l'arco (m)
  dampingRate: 26.0,     // transizione fluida su/giù dal cordolo
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Determina quale/i ruota/e anteriore/i è/sono visivamente bloccata/e durante `wheelLockup`.
 * - Curva a sinistra (`steerAngle > 0.025`): si blocca solo l'anteriore interna scarica (FL).
 * - Curva a destra (`steerAngle < -0.025`): si blocca solo l'anteriore interna scarica (FR).
 * - Frenata rettilinea pura (`|steerAngle| <= 0.025`): si bloccano entrambe.
 * @param {object} carState
 * @returns {{ fl: boolean, fr: boolean, any: boolean }}
 */
export function resolveLockedFrontWheels(carState) {
  if (!carState?.aeroTire?.wheelLockup) {
    return { fl: false, fr: false, any: false };
  }
  const steer = carState.steerAngle ?? 0;
  if (steer > LOCKUP_INNER_STEER_THRESHOLD) {
    return { fl: true, fr: false, any: true };
  }
  if (steer < -LOCKUP_INNER_STEER_THRESHOLD) {
    return { fl: false, fr: true, any: true };
  }
  return { fl: true, fr: true, any: true };
}

const WHEEL_SPIN_MATERIALS = new Set([
  'tyre_sides',
  'sf25_wheel_hub',
  'tyre_tread',
]);
const WHEEL_BRAKE_MATERIALS = new Set(['discs.008']);
const STEERING_WHEEL_MATERIALS = new Set([
  'kers_green.004',
  'kers_red.004',
  'kers_blue',
  'CLEARLED.004',
  'plastic_interior.002',
  'sf25_lcd',
  'CLARED',
  'sf25_sw_carbon',
  'sf25_sw',
  'sf25_sw_decals',
]);
const TRANSPARENT_DECAL_MATERIALS = new Set([
  'sf25_decals',
  'sf25_decals2',
  'sf25_sw_decals',
  'numbers',
  'glass',
]);
// Mesh interne/micro-dettagli non visibili sugli avversari AI in gara (-55% draw call & -1.1M tris su 21 bot)
const AI_SKIP_BODY_MATERIALS = new Set([
  'gp21_cinture.005',
  'sf25_details',
  'sf25_generics',
  'sf25_decals2',
  'sf25_decals',
  'glass',
  'sf25_carbon3',
  'sf25_mirrorl',
  'black_s.002',
  'mirrorlight',
  'chrome_ao.002',
  'rear_light.001',
]);
const AI_DISTANT_HIDE_MATERIALS = new Set(['chrome.005', 'numbers', 'sf25_wheel_hub']);
const SHADOW_CASTING_BODY_MATERIALS = new Set([
  'sf25_paints',
  'sf25_carbon1',
  'sf25_carbon2',
  'sf25_carbon1_white',
]);

// Scala esatta F1 2026 (1 unità = 1 metro): larghezza 1.90 m, passo 3.40 m (ruote circolari: scaleY === scaleZ)
export const GLB_SCALE_X = 1.90 / 1.955686;
export const GLB_SCALE_YZ = 3.40 / 3.533;

const WHEEL_CENTERS = {
  fl: [0.800 * GLB_SCALE_X, 0.364 * GLB_SCALE_YZ, 1.522 * GLB_SCALE_YZ],
  fr: [-0.800 * GLB_SCALE_X, 0.366 * GLB_SCALE_YZ, 1.522 * GLB_SCALE_YZ],
  rl: [0.764 * GLB_SCALE_X, 0.358 * GLB_SCALE_YZ, -2.011 * GLB_SCALE_YZ],
  rr: [-0.764 * GLB_SCALE_X, 0.359 * GLB_SCALE_YZ, -2.011 * GLB_SCALE_YZ],
};
const STEERING_PIVOT = [0, 0.680 * GLB_SCALE_YZ, 0.455 * GLB_SCALE_YZ];

const TEMP_COLOR = new THREE.Color();
const UNIT_X = new THREE.Vector3(1, 0, 0);

/**
 * Calcola il vero versore dell'asse di rotazione (camber + convergenza/toe) di una ruota
 * tramite PCA 3×3 (autovettore associato all'autovalore minimo della covarianza dei vertici
 * del battistrada, risolto con algoritmo di Jacobi esatto).
 * Elimina la precessione laterale (wobble ~22 mm) sulle ruote anteriori modellate con camber negativo.
 * @param {Array<{ geometry: THREE.BufferGeometry }>} refParts
 * @returns {THREE.Vector3}
 */
export function computeWheelAxleVector(refParts) {
  let count = 0;
  let mx = 0;
  let my = 0;
  let mz = 0;

  for (const part of refParts) {
    const pos = part.geometry?.getAttribute('position');
    if (!pos) continue;
    for (let i = 0; i < pos.count; i++) {
      mx += pos.getX(i);
      my += pos.getY(i);
      mz += pos.getZ(i);
    }
    count += pos.count;
  }

  if (count < 12) return UNIT_X.clone();
  mx /= count;
  my /= count;
  mz /= count;

  let cxx = 0;
  let cyy = 0;
  let czz = 0;
  let cxy = 0;
  let cxz = 0;
  let cyz = 0;

  for (const part of refParts) {
    const pos = part.geometry?.getAttribute('position');
    if (!pos) continue;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) - mx;
      const y = pos.getY(i) - my;
      const z = pos.getZ(i) - mz;
      cxx += x * x;
      cyy += y * y;
      czz += z * z;
      cxy += x * y;
      cxz += x * z;
      cyz += y * z;
    }
  }

  const A = [
    [cxx, cxy, cxz],
    [cxy, cyy, cyz],
    [cxz, cyz, czz],
  ];
  const V = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  for (let iter = 0; iter < 40; iter++) {
    let p = 0;
    let q = 1;
    let maxOff = Math.abs(A[0][1]);
    if (Math.abs(A[0][2]) > maxOff) {
      p = 0;
      q = 2;
      maxOff = Math.abs(A[0][2]);
    }
    if (Math.abs(A[1][2]) > maxOff) {
      p = 1;
      q = 2;
      maxOff = Math.abs(A[1][2]);
    }
    if (maxOff < 1e-12) break;

    const apq = A[p][q];
    const theta = (A[q][q] - A[p][p]) / (2 * apq);
    const t =
      (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(1 + theta * theta));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;
    const tau = s / (1 + c);

    A[p][p] -= t * apq;
    A[q][q] += t * apq;
    A[p][q] = 0;
    A[q][p] = 0;

    const r = 3 - p - q;
    const arp = A[r][p];
    const arq = A[r][q];
    A[r][p] = A[p][r] = arp - s * (arq + tau * arp);
    A[r][q] = A[q][r] = arq + s * (arp - tau * arq);

    for (let k = 0; k < 3; k++) {
      const vkp = V[k][p];
      const vkq = V[k][q];
      V[k][p] = vkp - s * (vkq + tau * vkp);
      V[k][q] = vkq + s * (vkp - tau * vkq);
    }
  }

  let minIdx = 0;
  if (A[1][1] < A[minIdx][minIdx]) minIdx = 1;
  if (A[2][2] < A[minIdx][minIdx]) minIdx = 2;

  const axle = new THREE.Vector3(V[0][minIdx], V[1][minIdx], V[2][minIdx]);
  if (axle.lengthSq() < 1e-8) return UNIT_X.clone();
  axle.normalize();
  if (axle.x < 0) axle.negate();
  // Guard contro geometrie degenerate: camber/toe F1 reali restano sempre ampiamente entro ±25°
  if (axle.x < 0.9) return UNIT_X.clone();
  return axle;
}

let glbTemplate = null;
let glbLoadPromise = null;
const pendingUpgrades = new Set();
let sharedContactShadowTexture = null;

export const CAR_VISUAL_CONFIG = {
  contactShadowY: 0.024,
  contactShadowWidth: 2.34,
  contactShadowLength: 5.72,
  contactShadowZOffset: -0.08,
  contactShadowOpacity: 0.72,
  carEnvMapIntensity: 0.74,
};

/**
 * Crea una singola CanvasTexture radiale morbida condivisa fra tutte le 22 monoposto
 * (soft contact shadow + impronta dei 4 pneumatici per ancoraggio visivo all'asfalto).
 */
function getSharedContactShadowTexture() {
  if (sharedContactShadowTexture) return sharedContactShadowTexture;
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof ctx.createRadialGradient !== 'function') return null;

  ctx.clearRect(0, 0, 256, 512);

  // 1. Alone morbido esterno ellittico sotto l'intera sagoma F1
  ctx.save();
  ctx.translate(128, 256);
  ctx.scale(1.0, 2.0);
  const outerGrad = ctx.createRadialGradient(0, 0, 20, 0, 0, 122);
  outerGrad.addColorStop(0.0, 'rgba(3, 5, 10, 0.88)');
  outerGrad.addColorStop(0.42, 'rgba(3, 5, 10, 0.64)');
  outerGrad.addColorStop(0.74, 'rgba(4, 7, 12, 0.24)');
  outerGrad.addColorStop(1.0, 'rgba(4, 7, 12, 0.0)');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 122, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Nucleo più scuro sotto fondo piatto / pance / diffusore
  ctx.save();
  ctx.translate(128, 266);
  ctx.scale(0.68, 1.85);
  const coreGrad = ctx.createRadialGradient(0, 0, 8, 0, 0, 96);
  coreGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0.72)');
  coreGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.36)');
  coreGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 96, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 3. Quattro impronte di contatto morbide sotto le gomme (FL, FR, RL, RR)
  const tirePatches = [
    { x: 46, y: 120, rx: 28, ry: 46 },
    { x: 210, y: 120, rx: 28, ry: 46 },
    { x: 50, y: 398, rx: 32, ry: 50 },
    { x: 206, y: 398, rx: 32, ry: 50 },
  ];
  for (const patch of tirePatches) {
    ctx.save();
    ctx.translate(patch.x, patch.y);
    ctx.scale(1.0, patch.ry / patch.rx);
    const tGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, patch.rx);
    tGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0.65)');
    tGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.25)');
    tGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = tGrad;
    ctx.beginPath();
    ctx.arc(0, 0, patch.rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  sharedContactShadowTexture = tex;
  return tex;
}

function calibrateCarPbrMaterial(material) {
  if (!material) return material;
  if ('envMapIntensity' in material && !material.userData?._carEnvCalibrated) {
    material.envMapIntensity = CAR_VISUAL_CONFIG.carEnvMapIntensity;
    material.userData = { ...(material.userData || {}), _carEnvCalibrated: true };
  }
  const matName = material.name || '';
  if (!material.userData?._carCockpitCalibrated) {
    material.userData = { ...(material.userData || {}), _carCockpitCalibrated: true };
    if (matName === 'sf25_lcd') {
      material.emissive = new THREE.Color(0xd8f1ff);
      if (material.map) material.emissiveMap = material.map;
      material.emissiveIntensity = 0.95;
      material.roughness = 0.16;
      material.metalness = 0.05;
    } else if (matName === 'CLEARLED.004' || matName === 'CLARED') {
      material.emissive = new THREE.Color(0xffffff);
      if (material.map) material.emissiveMap = material.map;
      material.emissiveIntensity = 0.85;
      material.roughness = 0.25;
    } else if (matName === 'kers_green.004') {
      material.emissive = new THREE.Color(0x22c55e);
      material.emissiveIntensity = 0.65;
    } else if (matName === 'kers_red.004') {
      material.emissive = new THREE.Color(0xef4444);
      material.emissiveIntensity = 0.65;
    } else if (matName === 'kers_blue') {
      material.emissive = new THREE.Color(0x38bdf8);
      material.emissiveIntensity = 0.65;
    } else if (matName === 'sf25_carbon2') {
      material.roughness = Math.min(material.roughness ?? 0.32, 0.24);
      if ('envMapIntensity' in material) {
        material.envMapIntensity = Math.max(material.envMapIntensity ?? 0.74, 0.86);
      }
    }
  }
  return material;
}

const helmetTextureCache = new Map();
let sharedHelmetAssets = null;

/**
 * Crea geometria anatomica FIA 8860-2018 con proiezione UV azimutale dall'alto
 * per mappare livrea e numero di gara in modo nitido e privo di distorsioni polari in T-Cam.
 */
function createHelmetShellGeometry() {
  const geo = new THREE.SphereGeometry(1, 36, 26);
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');

  const rx = 0.130;
  const ry = 0.124;
  const rz = 0.156;

  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i);
    const ny = pos.getY(i);
    const nz = pos.getZ(i);

    let x = nx * rx;
    const y = ny * ry;
    let z = nz * rz;

    if (ny < 0 && nz > 0) {
      z += 0.022 * (-ny) * nz;
      x *= 1 - 0.14 * (-ny) * nz;
    }
    if (ny < -0.55) {
      const neckT = (-ny - 0.55) / 0.45;
      x *= 1 - 0.08 * neckT;
      z *= 1 - 0.06 * neckT;
    }

    pos.setXYZ(i, x, y, z);

    const rHoriz = Math.hypot(nx, nz);
    const polarAngle = Math.acos(clamp(ny, -1, 1));
    const radial = (polarAngle / (Math.PI * 0.92)) * 0.5;
    const u = clamp(0.5 - (rHoriz > 1e-5 ? nx / rHoriz : 0) * radial, 0.01, 0.99);
    const v = clamp(0.5 + (rHoriz > 1e-5 ? nz / rHoriz : 0) * radial, 0.01, 0.99);
    uv.setXY(i, u, v);
  }

  pos.needsUpdate = true;
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function getSharedHelmetAssets() {
  if (sharedHelmetAssets) return sharedHelmetAssets;

  const shellGeo = createHelmetShellGeometry();
  const visorGeo = new THREE.SphereGeometry(
    0.136,
    24,
    14,
    Math.PI * 0.14,
    Math.PI * 0.72,
    Math.PI * 0.36,
    Math.PI * 0.28
  );
  visorGeo.scale(0.99, 0.94, 1.15);

  const browGeo = new THREE.SphereGeometry(
    0.135,
    24,
    8,
    Math.PI * 0.16,
    Math.PI * 0.68,
    Math.PI * 0.28,
    Math.PI * 0.09
  );
  browGeo.scale(1.0, 0.96, 1.14);

  const scoopGeo = new THREE.BoxGeometry(0.011, 0.006, 0.024);
  const spoilerGeo = new THREE.BoxGeometry(0.140, 0.014, 0.036);
  const pivotGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.006, 12);
  pivotGeo.rotateZ(Math.PI / 2);

  const neckGeo = new THREE.CylinderGeometry(0.062, 0.072, 0.095, 16);
  const hansGeo = new THREE.TorusGeometry(0.088, 0.017, 10, 20, Math.PI * 1.15);
  hansGeo.rotateX(Math.PI / 2);
  hansGeo.rotateZ(Math.PI * 0.925);
  const strapGeo = new THREE.BoxGeometry(0.028, 0.012, 0.105);
  const torsoGeo = new THREE.CylinderGeometry(0.138, 0.148, 0.13, 18);
  torsoGeo.scale(1.07, 1.0, 0.56);

  const visorMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b1220,
    roughness: 0.06,
    metalness: 0.85,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.1,
  });
  const trimCarbonMat = new THREE.MeshStandardMaterial({
    color: 0x11151d,
    roughness: 0.32,
    metalness: 0.25,
    envMapIntensity: 0.8,
  });
  const nomexMat = new THREE.MeshStandardMaterial({
    color: 0x0e1118,
    roughness: 0.85,
    metalness: 0.02,
    envMapIntensity: 0.45,
  });
  const metallicPivotMat = new THREE.MeshStandardMaterial({
    color: 0xd1d5db,
    roughness: 0.22,
    metalness: 0.88,
    envMapIntensity: 0.9,
  });

  sharedHelmetAssets = {
    shellGeo,
    visorGeo,
    browGeo,
    scoopGeo,
    spoilerGeo,
    pivotGeo,
    neckGeo,
    hansGeo,
    strapGeo,
    torsoGeo,
    visorMat,
    trimCarbonMat,
    nomexMat,
    metallicPivotMat,
  };
  return sharedHelmetAssets;
}

/**
 * Genera (e memorizza in cache) una livrea 512x512 ad alta leggibilità dall'alto per il casco F1,
 * con bande aero simmetriche, zylon visor-brow e numero di gara centrato sulla calotta superiore.
 */
function getHelmetLiveryTexture(helmetColor, primaryColor, driverNumber) {
  if (typeof document === 'undefined') return null;

  let baseHex = '#facc15';
  let teamHex = '#dc0000';
  let lum = 0.7;
  try {
    TEMP_COLOR.set(helmetColor ?? 0xfacc15);
    baseHex = `#${TEMP_COLOR.getHexString()}`;
    lum = 0.2126 * TEMP_COLOR.r + 0.7152 * TEMP_COLOR.g + 0.0722 * TEMP_COLOR.b;
  } catch {
    baseHex = '#facc15';
  }
  try {
    TEMP_COLOR.set(primaryColor ?? 0xdc0000);
    teamHex = `#${TEMP_COLOR.getHexString()}`;
  } catch {
    teamHex = '#dc0000';
  }

  const numStr = driverNumber !== undefined && driverNumber !== null ? String(driverNumber).trim() : '';
  const cacheKey = `${baseHex}|${teamHex}|${numStr}`;
  if (helmetTextureCache.has(cacheKey)) {
    return helmetTextureCache.get(cacheKey);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof ctx.createRadialGradient !== 'function') return null;

  // Base cromatica piena (evita patine bianche in albedo che schiariscono il rosso in rosa)
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 512);

  const rimShade = ctx.createRadialGradient(256, 256, 130, 256, 256, 256);
  rimShade.addColorStop(0.0, 'rgba(0, 0, 0, 0.0)');
  rimShade.addColorStop(1.0, 'rgba(0, 0, 0, 0.24)');
  ctx.fillStyle = rimShade;
  ctx.fillRect(0, 0, 512, 512);

  // Fasce aero simmetriche lungo le tempie (+X/-X) e retro calotta (stile casco F1 2026)
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(256, 256);
    ctx.scale(side, 1);

    ctx.fillStyle = '#0f141e';
    ctx.beginPath();
    ctx.moveTo(92, -160);
    ctx.bezierCurveTo(168, -92, 198, 12, 178, 135);
    ctx.lineTo(122, 178);
    ctx.bezierCurveTo(142, 62, 130, -34, 68, -122);
    ctx.closePath();
    ctx.fill();

    // Profilo grafico scuderia / contrasto lungo le bande laterali
    ctx.strokeStyle = lum > 0.56 ? '#0b0f18' : '#f8fafc';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(64, -118);
    ctx.bezierCurveTo(124, -34, 134, 62, 114, 172);
    ctx.stroke();

    // Accento team sottile
    ctx.strokeStyle = teamHex;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(54, -110);
    ctx.bezierCurveTo(112, -28, 122, 64, 102, 166);
    ctx.stroke();
    ctx.restore();
  }

  // Bande geometriche leggere sulla calotta attorno al numero
  ctx.strokeStyle = lum > 0.56 ? 'rgba(15, 23, 42, 0.28)' : 'rgba(255, 255, 255, 0.30)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(192, 168);
  ctx.lineTo(256, 136);
  ctx.lineTo(320, 168);
  ctx.stroke();

  // Zylon brow / inserto frontale visiera (zona anteriore: canvas top y=70..130)
  ctx.fillStyle = '#0f141e';
  ctx.beginPath();
  ctx.moveTo(156, 98);
  ctx.quadraticCurveTo(256, 72, 356, 98);
  ctx.quadraticCurveTo(256, 128, 156, 98);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = teamHex;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(166, 104);
  ctx.quadraticCurveTo(256, 82, 346, 104);
  ctx.stroke();

  // Numero pilota compatto e interamente inquadrato dalla T-Cam (centro y=248)
  if (numStr) {
    ctx.save();
    ctx.translate(256, 248);
    ctx.font = 'italic 900 66px "Arial Black", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const isBrightBase = lum > 0.45;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = isBrightBase ? '#ffffff' : '#0b0f18';
    ctx.strokeText(numStr, 0, 0);
    ctx.fillStyle = isBrightBase ? '#0f172a' : '#ffffff';
    ctx.fillText(numStr, 0, 0);
    ctx.restore();
  }

  if (helmetTextureCache.size >= 48) {
    const firstKey = helmetTextureCache.keys().next().value;
    const oldest = helmetTextureCache.get(firstKey);
    oldest?.dispose?.();
    helmetTextureCache.delete(firstKey);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  helmetTextureCache.set(cacheKey, tex);
  return tex;
}

/**
 * Costruisce il gruppo 3D completo del pilota nell'abitacolo GLB:
 * casco FIA scolpito, visiera iridium curva, zylon brow, prese d'aria FIA, spoiler posteriore,
 * collare HANS in carbonio e spalle tuta ignifuga.
 */
function buildGlbDriverGroup({ helmetMat, suitMat, detailedCar }) {
  const assets = getSharedHelmetAssets();
  const group = new THREE.Group();
  group.name = 'F1DriverAssembly';

  const shellMesh = new THREE.Mesh(assets.shellGeo, helmetMat);
  shellMesh.position.set(0, 0.755, 0.045);
  shellMesh.castShadow = detailedCar;
  group.add(shellMesh);

  const visorMesh = new THREE.Mesh(assets.visorGeo, assets.visorMat);
  visorMesh.position.set(0, 0.754, 0.056);
  group.add(visorMesh);

  const neckMesh = new THREE.Mesh(assets.neckGeo, assets.nomexMat);
  neckMesh.position.set(0, 0.625, 0.032);
  group.add(neckMesh);

  if (!detailedCar) {
    return group;
  }

  const browMesh = new THREE.Mesh(assets.browGeo, assets.trimCarbonMat);
  browMesh.position.set(0, 0.756, 0.056);
  group.add(browMesh);

  const scoopCoords = [
    [-0.030, 0.870, 0.098, -0.26],
    [0.030, 0.870, 0.098, -0.26],
  ];
  for (const [sx, sy, sz, pitchX] of scoopCoords) {
    const scoop = new THREE.Mesh(assets.scoopGeo, assets.trimCarbonMat);
    scoop.position.set(sx, sy, sz);
    scoop.rotation.x = pitchX;
    group.add(scoop);
  }

  const spoilerMesh = new THREE.Mesh(assets.spoilerGeo, assets.trimCarbonMat);
  spoilerMesh.position.set(0, 0.750, -0.098);
  spoilerMesh.rotation.x = 0.28;
  group.add(spoilerMesh);

  for (const side of [-1, 1]) {
    const pivot = new THREE.Mesh(assets.pivotGeo, assets.metallicPivotMat);
    pivot.position.set(side * 0.130, 0.752, 0.072);
    group.add(pivot);
  }

  const hansCollar = new THREE.Mesh(assets.hansGeo, assets.trimCarbonMat);
  hansCollar.position.set(0, 0.620, 0.015);
  hansCollar.rotation.x = 0.18;
  group.add(hansCollar);

  for (const side of [-1, 1]) {
    const strap = new THREE.Mesh(assets.strapGeo, assets.trimCarbonMat);
    strap.position.set(side * 0.068, 0.592, 0.058);
    strap.rotation.set(0.32, side * 0.14, 0);
    group.add(strap);
  }

  const torsoMesh = new THREE.Mesh(assets.torsoGeo, suitMat);
  torsoMesh.position.set(0, 0.555, 0.025);
  torsoMesh.rotation.x = 0.14;
  group.add(torsoMesh);

  return group;
}

function isDefaultFerrariRed(color) {
  if (color === undefined || color === null) return false;
  if (typeof color === 'number') {
    return color === 0xdc0000 || color === 0xe10600;
  }
  if (typeof color === 'string') {
    const trimmed = color.trim().toLowerCase();
    if (trimmed === '#dc0000' || trimmed === '#e10600' || trimmed === '0xdc0000') {
      return true;
    }
  }
  try {
    TEMP_COLOR.set(color);
    const hex = TEMP_COLOR.getHex();
    return hex === 0xdc0000 || hex === 0xe10600;
  } catch {
    return false;
  }
}

/**
 * Separa una geometria ruote già portata nello spazio vettura (+Z avanti, +X sinistra)
 * nei 4 quadranti (fl, fr, rl, rr) mantenendo le coordinate nello spazio vettura
 * per consentire la centratura geometrica esatta sul bounding-box di `tyre_tread`.
 * @param {THREE.BufferGeometry} geometry
 * @returns {Partial<Record<'fl' | 'fr' | 'rl' | 'rr', THREE.BufferGeometry>>}
 */
function splitGeometryByWheelQuadrant(geometry) {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr) return {};

  const indexAttr = geometry.getIndex();
  const triCount = indexAttr
    ? Math.floor(indexAttr.count / 3)
    : Math.floor(posAttr.count / 3);

  const buckets = { fl: [], fr: [], rl: [], rr: [] };
  for (let t = 0; t < triCount; t++) {
    const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
    const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;

    const cx = (posAttr.getX(i0) + posAttr.getX(i1) + posAttr.getX(i2)) / 3;
    const cz = (posAttr.getZ(i0) + posAttr.getZ(i1) + posAttr.getZ(i2)) / 3;
    const key = `${cz >= 0 ? 'f' : 'r'}${cx >= 0 ? 'l' : 'r'}`;
    buckets[key].push(i0, i1, i2);
  }

  const result = {};
  const remap = new Int32Array(posAttr.count);

  for (const [quadKey, indices] of Object.entries(buckets)) {
    if (indices.length === 0) continue;

    remap.fill(-1);
    const usedVerts = [];
    const newIndices = new Array(indices.length);

    for (let i = 0; i < indices.length; i++) {
      const oldIdx = indices[i];
      let mapped = remap[oldIdx];
      if (mapped === -1) {
        mapped = usedVerts.length;
        remap[oldIdx] = mapped;
        usedVerts.push(oldIdx);
      }
      newIndices[i] = mapped;
    }

    const subGeo = new THREE.BufferGeometry();

    for (const [attrName, attr] of Object.entries(geometry.attributes)) {
      const itemSize = attr.itemSize;
      const ArrayCtor = attr.array.constructor;
      const dest = new ArrayCtor(usedVerts.length * itemSize);
      const src = attr.array;

      for (let k = 0; k < usedVerts.length; k++) {
        const s = usedVerts[k] * itemSize;
        const d = k * itemSize;
        for (let c = 0; c < itemSize; c++) {
          dest[d + c] = src[s + c];
        }
      }

      subGeo.setAttribute(
        attrName,
        new THREE.BufferAttribute(dest, itemSize, attr.normalized)
      );
    }

    const indexArray =
      usedVerts.length > 65535
        ? new Uint32Array(newIndices)
        : new Uint16Array(newIndices);
    subGeo.setIndex(new THREE.BufferAttribute(indexArray, 1));
    subGeo.computeBoundingBox();
    subGeo.computeBoundingSphere();

    result[quadKey] = subGeo;
  }

  return result;
}

/**
 * Estrae geometrie e materiali condivisi dal GLB caricato in singleton,
 * centrando ciascuna delle 4 ruote sul vero centro bounding-box `(min + max) / 2`
 * del battistrada (`tyre_tread`) per garantire 0.0 mm di eccentricità in rotazione.
 * @param {THREE.Group} gltfScene
 */
export function buildTemplateFromGltfScene(gltfScene) {
  const toCarSpace = new THREE.Matrix4()
    .makeTranslation(0, 0.0257, 0)
    .multiply(new THREE.Matrix4().makeScale(GLB_SCALE_X, GLB_SCALE_YZ, GLB_SCALE_YZ))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

  const rawWheelParts = {
    fl: { spin: [], brake: [] },
    fr: { spin: [], brake: [] },
    rl: { spin: [], brake: [] },
    rr: { spin: [], brake: [] },
  };

  const template = {
    bodyParts: [],
    steeringParts: [],
    wheelCenters: {
      fl: [...WHEEL_CENTERS.fl],
      fr: [...WHEEL_CENTERS.fr],
      rl: [...WHEEL_CENTERS.rl],
      rr: [...WHEEL_CENTERS.rr],
    },
    wheelAxleQuaternions: {
      fl: new THREE.Quaternion(),
      fr: new THREE.Quaternion(),
      rl: new THREE.Quaternion(),
      rr: new THREE.Quaternion(),
    },
    wheelParts: {
      fl: { spin: [], brake: [] },
      fr: { spin: [], brake: [] },
      rl: { spin: [], brake: [] },
      rr: { spin: [], brake: [] },
    },
    rearLightZ: -2.58,
    rearWingZ: -2.52,
    rearWingHalfX: 0.585,
    frontNoseZ: 2.38,
  };

  gltfScene.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;

    const material = calibrateCarPbrMaterial(
      Array.isArray(child.material) ? child.material[0] : child.material
    );
    if (!material) return;

    const matName = material.name || '';
    const isTransparent =
      Boolean(material.transparent) || TRANSPARENT_DECAL_MATERIALS.has(matName);
    const castShadow = !isTransparent && SHADOW_CASTING_BODY_MATERIALS.has(matName);

    const geo = child.geometry.clone();
    geo.applyMatrix4(toCarSpace);

    if (WHEEL_SPIN_MATERIALS.has(matName)) {
      const quads = splitGeometryByWheelQuadrant(geo);
      geo.dispose();
      for (const [qKey, subGeo] of Object.entries(quads)) {
        rawWheelParts[qKey].spin.push({
          geometry: subGeo,
          material,
          matName,
          castShadow: matName === 'tyre_tread' || matName === 'tyre_sides',
        });
      }
      return;
    }

    if (WHEEL_BRAKE_MATERIALS.has(matName)) {
      const quads = splitGeometryByWheelQuadrant(geo);
      geo.dispose();
      for (const [qKey, subGeo] of Object.entries(quads)) {
        rawWheelParts[qKey].brake.push({
          geometry: subGeo,
          material,
          matName,
          castShadow: false,
        });
      }
      return;
    }

    if (STEERING_WHEEL_MATERIALS.has(matName)) {
      geo.translate(-STEERING_PIVOT[0], -STEERING_PIVOT[1], -STEERING_PIVOT[2]);
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      template.steeringParts.push({
        geometry: geo,
        material,
        matName,
      });
      return;
    }

    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    if (geo.boundingBox) {
      if (geo.boundingBox.min.z < template.rearLightZ) {
        template.rearLightZ = geo.boundingBox.min.z;
      }
      if (geo.boundingBox.max.z > template.frontNoseZ) {
        template.frontNoseZ = geo.boundingBox.max.z;
      }
    }
    template.bodyParts.push({
      geometry: geo,
      material,
      matName,
      castShadow,
    });
  });

  // Seconda passata: calcola centro geometrico esatto e vero asse 3D (camber/toe) via PCA su `tyre_tread`.
  // Allinea le mesh rotanti sull'asse locale +X (zero precessione laterale / wobble), ri-centra nel frame
  // privo di camber e ripristina l'inclinazione camber autentica sul gruppo statico `camberGroup`.
  const centerBox = new THREE.Box3();
  const centerVec = new THREE.Vector3();
  const localCenterVec = new THREE.Vector3();

  for (const qKey of WHEEL_KEYS) {
    const spinList = rawWheelParts[qKey].spin;
    const brakeList = rawWheelParts[qKey].brake;

    centerBox.makeEmpty();
    const treadParts = spinList.filter((p) => p.matName === 'tyre_tread');
    const refParts =
      treadParts.length > 0
        ? treadParts
        : spinList.filter((p) => p.matName === 'tyre_sides').length > 0
          ? spinList.filter((p) => p.matName === 'tyre_sides')
          : spinList;

    for (const part of refParts) {
      if (!part.geometry.boundingBox) {
        part.geometry.computeBoundingBox();
      }
      if (part.geometry.boundingBox) {
        centerBox.union(part.geometry.boundingBox);
      }
    }

    let cx0;
    let cy0;
    let cz0;
    if (!centerBox.isEmpty()) {
      centerBox.getCenter(centerVec);
      cx0 = centerVec.x;
      cy0 = centerVec.y;
      cz0 = centerVec.z;
    } else {
      [cx0, cy0, cz0] = WHEEL_CENTERS[qKey];
    }

    const axle = refParts.length > 0 ? computeWheelAxleVector(refParts) : UNIT_X.clone();
    const qToX = new THREE.Quaternion().setFromUnitVectors(axle, UNIT_X);
    const qFromX = qToX.clone().invert();

    for (const part of spinList) {
      part.geometry.translate(-cx0, -cy0, -cz0);
      part.geometry.applyQuaternion(qToX);
      part.geometry.computeBoundingBox();
    }

    // Ri-centratura esatta nel frame allineato all'asse reale (senza bias da camber sulla bounding-box)
    centerBox.makeEmpty();
    for (const part of refParts) {
      if (part.geometry.boundingBox) {
        centerBox.union(part.geometry.boundingBox);
      }
    }
    if (!centerBox.isEmpty()) {
      centerBox.getCenter(localCenterVec);
    } else {
      localCenterVec.set(0, 0, 0);
    }

    const shiftCarSpace = localCenterVec.clone().applyQuaternion(qFromX);
    const finalCx = cx0 + shiftCarSpace.x;
    const finalCy = cy0 + shiftCarSpace.y;
    const finalCz = cz0 + shiftCarSpace.z;

    template.wheelCenters[qKey] = [finalCx, finalCy, finalCz];
    template.wheelAxleQuaternions[qKey] = qFromX;

    for (const part of spinList) {
      part.geometry.translate(-localCenterVec.x, -localCenterVec.y, -localCenterVec.z);
      part.geometry.computeBoundingBox();
      part.geometry.computeBoundingSphere();
      template.wheelParts[qKey].spin.push(part);
    }

    for (const part of brakeList) {
      part.geometry.translate(-finalCx, -finalCy, -finalCz);
      part.geometry.computeBoundingBox();
      part.geometry.computeBoundingSphere();
      template.wheelParts[qKey].brake.push(part);
    }
  }

  // Posizionamento accurato delle luci posteriori sul bordo di uscita del modello GLB
  template.rearWingZ = template.rearLightZ + 0.04;
  return template;
}

/**
 * Avvia in singleton il caricamento del modello compresso Draco+WebP `assets/3d/cars/ferrari.glb` (3,94 MB)
 * tramite AssetManager3D (evita di scaricare e includere in dist il file non compresso da 30 MB).
 */
function ensureGlbTemplateLoaded() {
  if (glbTemplate) return Promise.resolve(glbTemplate);
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (glbLoadPromise) return glbLoadPromise;

  glbLoadPromise = assetManager3D
    .loadGLTF('assets/3d/cars/ferrari.glb')
    .then((gltf) => {
      if (!gltf?.scene) {
        glbLoadPromise = null;
        return null;
      }
      glbTemplate = buildTemplateFromGltfScene(gltf.scene);
      for (const upgradeFn of pendingUpgrades) {
        upgradeFn(glbTemplate);
      }
      pendingUpgrades.clear();
      return glbTemplate;
    })
    .catch((err) => {
      console.warn('[CarModel3D] Errore caricamento GLB Draco SF-26, uso modello fallback:', err);
      glbLoadPromise = null;
      return null;
    });

  return glbLoadPromise;
}

const TIRE_TREAD_TEXTURE_SET_CACHE = new Map();
const GLB_TREAD_MATERIAL_CACHE = new Map();
const GLB_SIDEWALL_MATERIAL_CACHE = new Map();
const SIDEWALL_TEXTURE_CACHE = new Map();

function seededRand01(seed) {
  let s = seed | 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return ((s >>> 0) % 10000) / 10000;
  };
}

/**
 * Genera (e memorizza in cache globale) un set PBR HD per il battistrada:
 * - `map` 1024×1024 (albedo gomma slick / scanalature Wet / graining / blistering)
 * - `bumpMap` 512×512 (micro-grana vulcanizzata, intagli Wet, creste graining e crateri blister)
 * - `roughnessMap` 512×512 (satinatura slick centrale vs spalle opache, gessosità graining e strappi)
 * Aggiornato solo a gradini discreti del 5% (0..20) per zero costo FPS in gara.
 */
export function getTireTreadTextureSet(gBin = 0, bBin = 0, compoundId = 'M') {
  if (typeof document === 'undefined') return null;
  const safeG = clamp(Math.round(gBin), 0, 20);
  const safeB = clamp(Math.round(bBin), 0, 20);
  const comp = TIRE_COMPOUNDS[compoundId] ? compoundId : 'M';
  const key = `${comp}|${safeG}|${safeB}`;
  if (TIRE_TREAD_TEXTURE_SET_CACHE.has(key)) {
    return TIRE_TREAD_TEXTURE_SET_CACHE.get(key);
  }

  const size = 1024;
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = size;
  mapCanvas.height = size;
  const ctx = mapCanvas.getContext('2d');
  if (!ctx) return null;

  const auxSize = 512;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = auxSize;
  bumpCanvas.height = auxSize;
  const bCtx = bumpCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = auxSize;
  roughCanvas.height = auxSize;
  const rCtx = roughCanvas.getContext('2d');

  const gRatio = safeG / 20;
  const bRatio = safeB / 20;
  const rand = seededRand01(safeG * 97 + safeB * 521 + comp.charCodeAt(0) * 31);
  const sAux = auxSize / size;

  // 1. Base gomma Pirelli ad alta definizione con sfumatura realistica centro-spalle
  const baseGrad = ctx.createLinearGradient(0, 0, size, 0);
  if (comp === 'W') {
    baseGrad.addColorStop(0.0, '#101318');
    baseGrad.addColorStop(0.16, '#151920');
    baseGrad.addColorStop(0.5, '#191e26');
    baseGrad.addColorStop(0.84, '#151920');
    baseGrad.addColorStop(1.0, '#101318');
  } else {
    baseGrad.addColorStop(0.0, '#12151a');
    baseGrad.addColorStop(0.14, '#191d24');
    baseGrad.addColorStop(0.5, '#21252d');
    baseGrad.addColorStop(0.86, '#191d24');
    baseGrad.addColorStop(1.0, '#12151a');
  }
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  if (bCtx) {
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, auxSize, auxSize);
  }
  if (rCtx) {
    // Centro slick caldo leggermente più satinato (~0.62), spalle più opache (~0.82)
    const rGrad = rCtx.createLinearGradient(0, 0, auxSize, 0);
    const centerR = comp === 'W' ? 142 : 162;
    const edgeR = comp === 'W' ? 184 : 212;
    rGrad.addColorStop(0.0, `rgb(${edgeR},${edgeR},${edgeR})`);
    rGrad.addColorStop(0.22, `rgb(${centerR + 14},${centerR + 14},${centerR + 14})`);
    rGrad.addColorStop(0.5, `rgb(${centerR},${centerR},${centerR})`);
    rGrad.addColorStop(0.78, `rgb(${centerR + 14},${centerR + 14},${centerR + 14})`);
    rGrad.addColorStop(1.0, `rgb(${edgeR},${edgeR},${edgeR})`);
    rCtx.fillStyle = rGrad;
    rCtx.fillRect(0, 0, auxSize, auxSize);
  }

  // Micro-grana vulcanizzata fine (2200 fibre circonferenziali realistiche)
  for (let i = 0; i < 2200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const w = 1.0 + rand() * 3.2;
    const h = 6 + rand() * 24;
    const shade = 20 + Math.floor(rand() * 20);
    ctx.fillStyle = `rgba(${shade},${shade + 2},${shade + 5},0.55)`;
    ctx.fillRect(x, y, w, h);
    if (bCtx && i < 1200) {
      const bVal = 114 + Math.floor(rand() * 28);
      bCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
      bCtx.fillRect(x * sAux, y * sAux, Math.max(1, w * sAux), Math.max(2, h * sAux));
    }
  }

  // Sottili bande di rotolamento + linea di giunzione stampo Pirelli (scompare con l'usura)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.032)';
  ctx.lineWidth = 1.5;
  for (let x = 22; x < size; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  if (gRatio < 0.25 && bRatio < 0.25 && comp !== 'W') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
    ctx.fillRect(size * 0.497, 0, 5, size);
    if (bCtx) {
      bCtx.fillStyle = 'rgba(165, 165, 165, 0.5)';
      bCtx.fillRect(auxSize * 0.496, 0, 3, auxSize);
    }
  }

  // 2. Mescola Full Wet ('W'): canali longitudinali profondi + scolpitura drenante a V ad alta definizione
  if (comp === 'W') {
    const drawWetGrooves = (targetCtx, scale, grooveColor, ribHighlight, lw) => {
      targetCtx.fillStyle = grooveColor;
      targetCtx.fillRect(size * 0.31 * scale, 0, 22 * scale, size * scale);
      targetCtx.fillRect(size * 0.67 * scale, 0, 22 * scale, size * scale);
      targetCtx.strokeStyle = grooveColor;
      targetCtx.lineWidth = lw * scale;
      targetCtx.lineCap = 'round';
      for (let y = -size; y < size * 2; y += 76) {
        targetCtx.beginPath();
        targetCtx.moveTo(0, (y + 62) * scale);
        targetCtx.lineTo(size * 0.5 * scale, y * scale);
        targetCtx.lineTo(size * scale, (y + 62) * scale);
        targetCtx.stroke();
      }
      if (ribHighlight) {
        targetCtx.strokeStyle = ribHighlight;
        targetCtx.lineWidth = 2.5 * scale;
        for (let y = -size; y < size * 2; y += 76) {
          targetCtx.beginPath();
          targetCtx.moveTo(0, (y + 52) * scale);
          targetCtx.lineTo(size * 0.5 * scale, (y - 10) * scale);
          targetCtx.lineTo(size * scale, (y + 52) * scale);
          targetCtx.stroke();
        }
      }
    };
    drawWetGrooves(ctx, 1, '#080a0e', 'rgba(255,255,255,0.06)', 20);
    if (bCtx) drawWetGrooves(bCtx, sAux, '#1c1c1c', '#a8a8a8', 22);
    if (rCtx) drawWetGrooves(rCtx, sAux, '#5a5a5a', null, 20);
  }

  // 3. Graining (usura a freddo: fascia grigia gessosa multi-strato, striature e marbles di gomma)
  if (gRatio >= 0.1) {
    const bandAlpha = 0.18 + gRatio * 0.56;
    const grad = ctx.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0.0, 'rgba(138, 144, 154, 0)');
    grad.addColorStop(0.16, `rgba(148, 154, 164, ${(bandAlpha * 0.72).toFixed(3)})`);
    grad.addColorStop(0.5, `rgba(182, 188, 198, ${bandAlpha.toFixed(3)})`);
    grad.addColorStop(0.84, `rgba(148, 154, 164, ${(bandAlpha * 0.72).toFixed(3)})`);
    grad.addColorStop(1.0, 'rgba(138, 144, 154, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    if (rCtx) {
      const rg = rCtx.createLinearGradient(0, 0, auxSize, 0);
      const a = (0.35 + gRatio * 0.6).toFixed(3);
      rg.addColorStop(0.0, 'rgba(242,242,242,0)');
      rg.addColorStop(0.2, `rgba(242,242,242,${a})`);
      rg.addColorStop(0.8, `rgba(242,242,242,${a})`);
      rg.addColorStop(1.0, 'rgba(242,242,242,0)');
      rCtx.fillStyle = rg;
      rCtx.fillRect(0, 0, auxSize, auxSize);
    }

    const streakCount = Math.round(90 + gRatio * 340);
    for (let i = 0; i < streakCount; i++) {
      const sx = size * (0.11 + rand() * 0.78);
      const sy = rand() * size;
      const sw = 2.0 + rand() * 5.5;
      const sh = 24 + rand() * 96;
      const a = 0.10 + rand() * gRatio * 0.34;
      ctx.fillStyle = `rgba(202, 208, 218, ${a.toFixed(3)})`;
      ctx.fillRect(sx, sy, sw, sh);
      if (bCtx && i % 2 === 0) {
        bCtx.fillStyle = `rgba(195, 195, 195, ${(0.22 + gRatio * 0.4).toFixed(3)})`;
        bCtx.fillRect(sx * sAux, sy * sAux, Math.max(1, sw * sAux), Math.max(4, sh * sAux));
      }
    }
    const pillCount = Math.round(70 + gRatio * 260);
    for (let i = 0; i < pillCount; i++) {
      const px = size * (0.12 + rand() * 0.76);
      const py = rand() * size;
      const pr = 2.0 + rand() * 5.2;
      ctx.fillStyle = `rgba(126, 132, 142, ${(0.28 + gRatio * 0.45).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      if (bCtx) {
        bCtx.fillStyle = `rgba(225, 225, 225, ${(0.25 + gRatio * 0.45).toFixed(3)})`;
        bCtx.beginPath();
        bCtx.arc(px * sAux, py * sAux, pr * sAux, 0, Math.PI * 2);
        bCtx.fill();
      }
    }
  }

  // 4. Blistering (surriscaldamento: fascia bruciata + crateri scuri con bordo termico lacerato in bumpMap)
  if (bRatio >= 0.1) {
    const scorchAlpha = 0.24 + bRatio * 0.54;
    const scorchGrad = ctx.createLinearGradient(0, 0, size, 0);
    scorchGrad.addColorStop(0.0, 'rgba(9, 8, 9, 0)');
    scorchGrad.addColorStop(0.22, `rgba(11, 9, 10, ${(scorchAlpha * 0.85).toFixed(3)})`);
    scorchGrad.addColorStop(0.5, `rgba(16, 12, 10, ${scorchAlpha.toFixed(3)})`);
    scorchGrad.addColorStop(0.78, `rgba(11, 9, 10, ${(scorchAlpha * 0.85).toFixed(3)})`);
    scorchGrad.addColorStop(1.0, 'rgba(9, 8, 9, 0)');
    ctx.fillStyle = scorchGrad;
    ctx.fillRect(0, 0, size, size);

    const craterCount = Math.round(28 + bRatio * 180);
    for (let i = 0; i < craterCount; i++) {
      const cx = size * (0.18 + rand() * 0.64);
      const cy = rand() * size;
      const rx = 5.0 + rand() * (7.5 + bRatio * 14.0);
      const ry = 7.0 + rand() * (10.5 + bRatio * 19.0);
      const ang = rand() * Math.PI;

      // Alone termico del cratere (gomma lacerata grigio-bruno)
      ctx.fillStyle = `rgba(120, 96, 80, ${(0.30 + bRatio * 0.44).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx + 3.2, ry + 3.2, ang, 0, Math.PI * 2);
      ctx.fill();

      // Interno profondo del blister
      ctx.fillStyle = `rgba(5, 6, 8, ${(0.66 + bRatio * 0.30).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, ang, 0, Math.PI * 2);
      ctx.fill();

      if (bCtx) {
        bCtx.fillStyle = 'rgba(218, 218, 218, 0.72)';
        bCtx.beginPath();
        bCtx.ellipse(cx * sAux, cy * sAux, (rx + 2.5) * sAux, (ry + 2.5) * sAux, ang, 0, Math.PI * 2);
        bCtx.fill();
        bCtx.fillStyle = 'rgba(18, 18, 18, 0.92)';
        bCtx.beginPath();
        bCtx.ellipse(cx * sAux, cy * sAux, rx * sAux, ry * sAux, ang, 0, Math.PI * 2);
        bCtx.fill();
      }
      if (rCtx) {
        rCtx.fillStyle = 'rgba(248, 248, 248, 0.85)';
        rCtx.beginPath();
        rCtx.ellipse(cx * sAux, cy * sAux, (rx + 2) * sAux, (ry + 2) * sAux, ang, 0, Math.PI * 2);
        rCtx.fill();
      }
    }
  }

  const map = new THREE.CanvasTexture(mapCanvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 16;
  map.needsUpdate = true;

  let bumpMap = null;
  if (bCtx) {
    bumpMap = new THREE.CanvasTexture(bumpCanvas);
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.anisotropy = 8;
    bumpMap.needsUpdate = true;
  }

  let roughnessMap = null;
  if (rCtx) {
    roughnessMap = new THREE.CanvasTexture(roughCanvas);
    roughnessMap.wrapS = THREE.RepeatWrapping;
    roughnessMap.wrapT = THREE.RepeatWrapping;
    roughnessMap.anisotropy = 8;
    roughnessMap.needsUpdate = true;
  }

  const texSet = { map, bumpMap, roughnessMap };
  TIRE_TREAD_TEXTURE_SET_CACHE.set(key, texSet);
  return texSet;
}

export function getTireTreadTexture(gBin = 0, bBin = 0, compoundId = 'M') {
  return getTireTreadTextureSet(gBin, bBin, compoundId)?.map || null;
}

function getRecoloredSidewallTexture(baseMap, compoundId = 'M') {
  if (typeof document === 'undefined') return null;
  const spec = TIRE_COMPOUNDS[compoundId] || TIRE_COMPOUNDS.M;
  const key = `${spec.id}|${baseMap?.uuid || 'proc'}`;
  if (SIDEWALL_TEXTURE_CACHE.has(key)) {
    return SIDEWALL_TEXTURE_CACHE.get(key);
  }

  const targetCol = new THREE.Color(spec.colorHex);
  const tr = targetCol.r;
  const tg = targetCol.g;
  const tb = targetCol.b;

  const img = baseMap?.image;
  if (img && img.width > 0 && img.height > 0) {
    try {
      // Mantiene piena risoluzione HD 1024×1024 originale della texture spalla Pirelli SF-26
      const w = Math.min(1024, img.width);
      const h = Math.min(1024, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;
        let recoloredCount = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // Riconoscimento anti-aliased ad alta precisione della banda rossa Pirelli (zero aloni rossi)
          const maxGB = Math.max(g, b);
          const redExcess = r - maxGB;
          if (r > 78 && redExcess > 24 && r > maxGB * 1.28) {
            const blend = clamp((redExcess - 20) / 55, 0, 1);
            const lum = clamp(r / 215, 0.25, 1.08);
            const nr = Math.min(255, Math.round(tr * 255 * lum));
            const ng = Math.min(255, Math.round(tg * 255 * lum));
            const nb = Math.min(255, Math.round(tb * 255 * lum));
            data[i] = Math.round(r + (nr - r) * blend);
            data[i + 1] = Math.round(g + (ng - g) * blend);
            data[i + 2] = Math.round(b + (nb - b) * blend);
            recoloredCount++;
          }
        }
        if (recoloredCount > 16) {
          ctx.putImageData(imgData, 0, 0);
          const tex = new THREE.CanvasTexture(canvas);
          tex.flipY = baseMap.flipY;
          tex.wrapS = baseMap.wrapS;
          tex.wrapT = baseMap.wrapT;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 16;
          tex.needsUpdate = true;
          SIDEWALL_TEXTURE_CACHE.set(key, tex);
          return tex;
        }
      }
    } catch {
      // Fallback pulito su anello Pirelli procedurale HD
    }
  }

  // Fallback procedurale HD 512×512 con scritte e banda Pirelli del colore mescola
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const swGrad = ctx.createRadialGradient(size / 2, size / 2, size * 0.22, size / 2, size / 2, size * 0.5);
  swGrad.addColorStop(0, '#12151b');
  swGrad.addColorStop(0.65, '#191d25');
  swGrad.addColorStop(1, '#101318');
  ctx.fillStyle = swGrad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = spec.colorHex;
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.39, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  SIDEWALL_TEXTURE_CACHE.set(key, tex);
  return tex;
}

function getCachedGlbTreadMaterial(baseMat, compoundId, gBin, bBin) {
  if (!baseMat) return null;
  const safeG = clamp(Math.round(gBin), 0, 20);
  const safeB = clamp(Math.round(bBin), 0, 20);
  const comp = TIRE_COMPOUNDS[compoundId] ? compoundId : 'M';
  const key = `${baseMat.uuid}|${comp}|${safeG}|${safeB}`;
  if (GLB_TREAD_MATERIAL_CACHE.has(key)) {
    return GLB_TREAD_MATERIAL_CACHE.get(key);
  }
  const cloned = baseMat.clone();
  cloned.name = baseMat.name || 'tyre_tread';
  const texSet = getTireTreadTextureSet(safeG, safeB, comp);
  if (texSet?.map) {
    cloned.map = texSet.map;
    cloned.color?.setHex?.(0xffffff);
  }
  if (texSet?.bumpMap) {
    cloned.bumpMap = texSet.bumpMap;
    cloned.bumpScale = comp === 'W' ? 0.028 : 0.012 + (safeG / 20) * 0.012 + (safeB / 20) * 0.020;
  }
  if (texSet?.roughnessMap) {
    cloned.roughnessMap = texSet.roughnessMap;
  }
  const gRatio = safeG / 20;
  const bRatio = safeB / 20;
  cloned.roughness = texSet?.roughnessMap
    ? 1.0
    : clamp(0.68 + gRatio * 0.18 + bRatio * 0.16, 0.62, 0.98);
  cloned.metalness = 0.05;
  if ('envMapIntensity' in cloned) {
    cloned.envMapIntensity = comp === 'W' ? 0.95 : 0.72;
  }
  cloned.needsUpdate = true;
  GLB_TREAD_MATERIAL_CACHE.set(key, cloned);
  return cloned;
}

function getCachedGlbSidewallMaterial(baseMat, compoundId) {
  if (!baseMat) return null;
  const comp = TIRE_COMPOUNDS[compoundId] ? compoundId : 'M';
  const key = `${baseMat.uuid}|${comp}`;
  if (GLB_SIDEWALL_MATERIAL_CACHE.has(key)) {
    return GLB_SIDEWALL_MATERIAL_CACHE.get(key);
  }
  const cloned = baseMat.clone();
  cloned.name = baseMat.name || 'tyre_sides';
  if (comp === 'S' && baseMat.map) {
    baseMat.map.anisotropy = 16;
    cloned.map = baseMat.map;
  } else {
    const recolored = getRecoloredSidewallTexture(baseMat.map, comp);
    if (recolored) {
      cloned.map = recolored;
      cloned.color?.setHex?.(0xffffff);
    }
  }
  cloned.roughness = 0.56;
  cloned.metalness = 0.06;
  if ('envMapIntensity' in cloned) {
    cloned.envMapIntensity = 0.80;
  }
  cloned.needsUpdate = true;
  GLB_SIDEWALL_MATERIAL_CACHE.set(key, cloned);
  return cloned;
}

/**
 * Crea lo schermo LCD OLED dinamico 512×256 del volante F1 (stile EA Sports F1 23/26)
 * + barra superiore a 15 LED di cambiata + coppia di guanti pilota scolpiti in fibra di carbonio.
 */
function createCockpitSteeringOverlay() {
  const group = new THREE.Group();
  group.name = 'F1CockpitWheelOverlay';

  // 1. Schermo LCD live allineato esattamente al pannello `sf25_lcd` del volante SF-26
  let lcdCanvas = null;
  let lcdCtx = null;
  let lcdTex = null;
  if (typeof document !== 'undefined') {
    lcdCanvas = document.createElement('canvas');
    lcdCanvas.width = 512;
    lcdCanvas.height = 256;
    lcdCtx = lcdCanvas.getContext('2d');
    if (lcdCtx) {
      lcdTex = new THREE.CanvasTexture(lcdCanvas);
      lcdTex.colorSpace = THREE.SRGBColorSpace;
      lcdTex.anisotropy = 8;
    }
  }

  const lcdMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: lcdTex,
    toneMapped: false,
  });
  const lcdMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.095, 0.055), lcdMat);
  // Posizione relativa a STEERING_PIVOT [0, 0.654, 0.438] -> sf25_lcd center (0, 0.698, 0.417)
  lcdMesh.position.set(0, 0.044, -0.0226);
  lcdMesh.rotation.y = Math.PI;
  group.add(lcdMesh);

  // 2. Barra 15 LED shift-light sopra lo schermo LCD (5 verdi, 5 rossi, 5 blu/viola)
  const ledMats = [];
  const ledGeo = new THREE.BoxGeometry(0.0046, 0.0042, 0.003);
  for (let i = 0; i < 15; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x1e293b, toneMapped: false });
    const led = new THREE.Mesh(ledGeo, mat);
    led.position.set(-0.042 + i * 0.006, 0.0755, -0.0218);
    group.add(led);
    ledMats.push(mat);
  }

  // 3. Guanti FIA Nomex scolpiti nero opaco che avvolgono le manopole del volante (visibili solo in Cockpit)
  const handsGroup = new THREE.Group();
  handsGroup.name = 'F1CockpitGloves';
  const gloveMat = new THREE.MeshStandardMaterial({
    color: 0x0b0d12,
    roughness: 0.94,
    metalness: 0.02,
    envMapIntensity: 0.20,
  });
  const knuckleMat = new THREE.MeshStandardMaterial({
    color: 0x171b24,
    roughness: 0.58,
    metalness: 0.25,
    envMapIntensity: 0.35,
  });
  const cuffTrimMat = new THREE.MeshStandardMaterial({
    color: 0x5c1414,
    roughness: 0.85,
    metalness: 0.04,
    envMapIntensity: 0.15,
  });

  const fingerGeo = new THREE.CapsuleGeometry(0.0085, 0.026, 6, 10);
  const palmGeo = new THREE.CapsuleGeometry(0.021, 0.044, 8, 12);
  const thumbGeo = new THREE.CapsuleGeometry(0.0095, 0.024, 6, 10);
  const wristGeo = new THREE.CylinderGeometry(0.019, 0.024, 0.13, 14);
  const cuffGeo = new THREE.TorusGeometry(0.0205, 0.0018, 8, 16);

  // Estensione piantone sterzo in carbonio nero (copre lo spazio verso il cruscotto quando il volante è ravvicinato in cockpit)
  const columnMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.022, 0.17, 12),
    gloveMat
  );
  columnMesh.rotation.x = Math.PI / 2;
  columnMesh.position.set(0, 0.0, 0.105);
  handsGroup.add(columnMesh);

  for (const side of [-1, 1]) {
    const hand = new THREE.Group();
    hand.position.set(side * 0.123, -0.012, -0.014);

    // Dorso mano sagomato ad avvolgere la manopola laterale
    const palm = new THREE.Mesh(palmGeo, gloveMat);
    palm.scale.set(0.86, 1.0, 1.05);
    palm.rotation.z = side * 0.18;
    palm.rotation.x = 0.20;
    hand.add(palm);

    // 4 dita curve che abbracciano il retro/lato della manopola
    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Mesh(fingerGeo, gloveMat);
      const fy = 0.022 - f * 0.0165;
      finger.position.set(-side * 0.008, fy, 0.014);
      finger.rotation.z = Math.PI / 2 - side * 0.12;
      finger.rotation.y = side * 0.38;
      hand.add(finger);
    }

    // Protezione nocche discreta sul dorso
    const knuckle = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.036, 4, 8), knuckleMat);
    knuckle.position.set(side * 0.012, 0.004, -0.014);
    knuckle.rotation.z = side * 0.16;
    hand.add(knuckle);

    // Pollice appoggiato nell'incavo superiore del volante
    const thumb = new THREE.Mesh(thumbGeo, gloveMat);
    thumb.position.set(-side * 0.018, 0.026, -0.012);
    thumb.rotation.z = side * 0.78;
    thumb.rotation.x = -0.25;
    hand.add(thumb);

    // Polso & avambraccio snelli inclinati in basso nell'ombra dell'abitacolo
    const wrist = new THREE.Mesh(wristGeo, gloveMat);
    wrist.rotation.x = Math.PI / 2 + 0.68;
    wrist.rotation.z = -side * 0.22;
    wrist.position.set(side * 0.014, -0.068, -0.056);
    hand.add(wrist);

    const cuff = new THREE.Mesh(cuffGeo, cuffTrimMat);
    cuff.rotation.x = 0.68;
    cuff.rotation.y = side * 0.20;
    cuff.position.set(side * 0.009, -0.044, -0.036);
    hand.add(cuff);

    handsGroup.add(hand);
  }
  handsGroup.visible = false;
  group.add(handsGroup);

  let lastDrawClock = -1;

  const formatShortLap = (sec) => {
    if (!Number.isFinite(sec) || sec <= 0) return '0:00.000';
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(3)}`;
  };

  const updateTelemetry = (carState, clockSec = 0) => {
    // 1. LED di cambiata RPM sempre reattivi a 60 FPS
    const rpm = carState?.rpm ?? CAR_PHYSICS_CONFIG.idleRpm;
    const maxRpm = CAR_PHYSICS_CONFIG.maxRpm || 15000;
    const rpmNorm = clamp((rpm - 6500) / Math.max(1, maxRpm - 6500), 0, 1);
    const litCount = Math.round(rpmNorm * 15);
    const flashShift = rpmNorm >= 0.94 && Math.floor(clockSec * 18) % 2 === 0;
    for (let i = 0; i < 15; i++) {
      const mat = ledMats[i];
      if (flashShift) {
        mat.color.setHex(0xc084fc);
      } else if (i < litCount) {
        if (i < 5) mat.color.setHex(0x22c55e);
        else if (i < 10) mat.color.setHex(0xef4444);
        else mat.color.setHex(0x38bdf8);
      } else {
        mat.color.setHex(0x18202c);
      }
    }

    if (!lcdCtx || !lcdTex) return;
    if (lastDrawClock >= 0 && clockSec - lastDrawClock < 0.05) return;
    lastDrawClock = clockSec;

    const ctx = lcdCtx;
    const w = 512;
    const h = 256;

    // Sfondo OLED nero profondo F1
    ctx.fillStyle = '#06090f';
    ctx.fillRect(0, 0, w, h);

    // Cornice sottile e griglia telemetrica stile F1 23/26
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.beginPath();
    ctx.moveTo(4, 62); ctx.lineTo(w - 4, 62);
    ctx.moveTo(156, 4); ctx.lineTo(156, 188);
    ctx.moveTo(356, 4); ctx.lineTo(356, 188);
    ctx.moveTo(4, 188); ctx.lineTo(w - 4, 188);
    ctx.stroke();

    const speedKmh = Math.round(Math.hypot(carState?.vx ?? 0, carState?.vz ?? 0) * 3.6);
    const gear = String(carState?.gearLabel || 'N');
    const aero = carState?.aeroTire || {};
    const comp = aero.compound || 'M';
    const compSpec = TIRE_COMPOUNDS[comp] || TIRE_COMPOUNDS.M;
    const t = carState?.timing || {};
    const wt = aero.wheelTempC || {
      fl: aero.tireTempC ?? 90,
      fr: aero.tireTempC ?? 90,
      rl: aero.tireTempC ?? 90,
      rr: aero.tireTempC ?? 90,
    };

    // TOP LEFT: Velocità / Carico Aero
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.font = '900 28px "Consolas", monospace';
    ctx.fillText(`${speedKmh}`, 80, 34);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 13px sans-serif';
    ctx.fillText('KM/H', 80, 52);

    // TOP CENTER: Tempo Giro & Delta live
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 24px "Consolas", monospace';
    ctx.fillText(formatShortLap(t.currentLapTime ?? 0), 256, 30);
    const delta = t.liveDelta;
    const deltaTxt =
      Number.isFinite(delta)
        ? `${delta >= 0 ? '+' : ''}${delta.toFixed(3)}`
        : '±0.000';
    ctx.fillStyle =
      Number.isFinite(delta) && delta < -0.005
        ? '#4ade80'
        : Number.isFinite(delta) && delta > 0.005
          ? '#f87171'
          : '#cbd5e1';
    ctx.font = '800 18px "Consolas", monospace';
    ctx.fillText(deltaTxt, 256, 53);

    // TOP RIGHT: Posizione & Mescola
    ctx.fillStyle = '#38bdf8';
    ctx.font = '900 24px "Consolas", monospace';
    ctx.fillText(`P${carState?.racePosition ?? 1}`, 412, 34);
    ctx.fillStyle = compSpec.colorHex;
    ctx.font = '900 22px sans-serif';
    ctx.fillText(comp, 474, 34);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 13px "Consolas", monospace';
    ctx.fillText(`TYRE ${Math.round((aero.tireHealth ?? 1) * 100)}%`, 434, 54);

    // CENTER: MARCIA GIGANTE (stile F1 23)
    ctx.fillStyle = gear === 'R' ? '#f87171' : '#ffffff';
    ctx.font = '900 108px "Segoe UI", Arial, sans-serif';
    ctx.fillText(gear, 256, 158);

    // LEFT & RIGHT: 4 Temperature gomme (FL/RL a sinistra, FR/RR a destra)
    const drawCornerTemp = (label, tempVal, x, y) => {
      const tc = Math.round(tempVal ?? 90);
      ctx.fillStyle = '#64748b';
      ctx.font = '700 13px sans-serif';
      ctx.fillText(label, x, y - 2);
      ctx.fillStyle =
        tc > compSpec.optTempMax + 6
          ? '#f87171'
          : tc < compSpec.optTempMin - 4
            ? '#38bdf8'
            : '#fef08a';
      ctx.font = '800 22px "Consolas", monospace';
      ctx.fillText(`${tc}°C`, x, y + 20);
    };
    drawCornerTemp('FL', wt.fl, 80, 96);
    drawCornerTemp('RL', wt.rl, 80, 154);
    drawCornerTemp('FR', wt.fr, 434, 96);
    drawCornerTemp('RR', wt.rr, 434, 154);

    // BOTTOM STATUS BAR (stile barra arancio/verde "SORPASSO" F1 23 + alert FIA Track Limits)
    let barBg = '#16a34a';
    let barTxt = 'GRIP OK • ERS ATTIVO';
    if (carState?.pitLimiterActive) {
      barBg = '#2563eb';
      barTxt = `PIT LIMITER ${carState.pitLimitKmh || 80} KM/H`;
    } else if ((t.trackLimitAlertTimer ?? 0) > 0) {
      if (t.trackLimitAlertSeverity === 'bw_flag') {
        barBg = '#e2e8f0';
        barTxt = 'BANDIERA BIANCO-NERA • 3/3 TL';
      } else if (t.trackLimitAlertSeverity === 'penalty') {
        barBg = '#dc2626';
        barTxt =
          t.penaltySeconds > 0
            ? `PENALITÀ +${t.penaltySeconds}s • TRACK LIMITS`
            : 'FIA ART. 33.3 • GIRO ANNULLATO';
      } else {
        barBg = '#d97706';
        barTxt = `TRACK LIMITS ${t.trackLimitsCount}/3 • ATTENZIONE`;
      }
    } else if (aero.wheelLockup) {
      barBg = '#dc2626';
      barTxt = 'BLOCCAGGIO RUOTE!';
    } else if (carState?.pitStopRequested) {
      barBg = '#059669';
      barTxt = `BOX PRENOTATO • NEXT [${carState.nextPitCompound || 'M'}]`;
    } else if (speedKmh >= 265 && (carState?.throttleInput ?? 0) > 0.8) {
      barBg = '#ea580c';
      barTxt = 'SORPASSO • DEPLOY';
    } else if (aero.highSpeedBraking) {
      barBg = '#d97706';
      barTxt = 'STACCATA AL LIMITE';
    }

    ctx.fillStyle = barBg;
    ctx.fillRect(14, 198, w - 28, 30);
    ctx.fillStyle = barBg === '#e2e8f0' ? '#090d16' : '#ffffff';
    ctx.font = '900 18px "Segoe UI", Arial, sans-serif';
    ctx.fillText(barTxt, 256, 219);

    // Sottile barra progresso RPM / batteria in fondo
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(14, 234, w - 28, 12);
    ctx.fillStyle = rpmNorm > 0.85 ? '#ef4444' : '#22c55e';
    ctx.fillRect(14, 234, (w - 28) * clamp(rpmNorm, 0.08, 1), 12);

    lcdTex.needsUpdate = true;
  };

  return {
    group,
    handsGroup,
    updateTelemetry,
    setVisibleInCockpit(visible) {
      handsGroup.visible = Boolean(visible);
    },
  };
}

/**
 * Crea un gruppo ruota composto da:
 * - `steerPivot` (sterzata attorno a Y)
 * - `camberGroup` (orientamento statico dell'asse reale camber/toe del mozzo)
 * - `spinGroup` (rotolamento puro attorno al vero asse ruota locale X)
 */
function createWheelAssembly(radius = 0.36, width = 0.34, isFront = true) {
  const steerPivot = new THREE.Group();
  const camberGroup = new THREE.Group();
  const spinGroup = new THREE.Group();

  // Pneumatico Pirelli slick HD di fallback (48 segmenti lisci + PBR)
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 48);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.72,
    metalness: 0.06,
  });
  tireMat.name = 'tyre_tread';
  const tireMesh = new THREE.Mesh(tireGeo, tireMat);
  tireMesh.castShadow = true;
  spinGroup.add(tireMesh);

  // Cerchione / copricerchio aerodinamico HD
  const rimGeo = new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width + 0.01, 32);
  rimGeo.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x27272a,
    roughness: 0.30,
    metalness: 0.68,
  });
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  spinGroup.add(rimMesh);

  // Banda Pirelli colorata sul fianco (si aggiorna dinamicamente su mescola S/M/H/W)
  const stripeGeo = new THREE.TorusGeometry(radius * 0.78, 0.018, 12, 40);
  stripeGeo.rotateY(Math.PI / 2);
  const sideStripeMat = new THREE.MeshBasicMaterial({ color: TIRE_COMPOUNDS.M.colorHex });
  sideStripeMat.name = 'tyre_sides';
  const stripeOuter = new THREE.Mesh(stripeGeo, sideStripeMat);
  stripeOuter.position.x = width * 0.5 + 0.004;
  const stripeInner = new THREE.Mesh(stripeGeo, sideStripeMat);
  stripeInner.position.x = -(width * 0.5 + 0.004);
  spinGroup.add(stripeOuter, stripeInner);

  // Dado centrale ruota + razza di riferimento visivo della rotazione
  const spokeGeo = new THREE.BoxGeometry(width + 0.02, radius * 1.15, 0.045);
  const spokeMat = new THREE.MeshBasicMaterial({ color: 0xe10600 });
  const spokeMesh = new THREE.Mesh(spokeGeo, spokeMat);
  spinGroup.add(spokeMesh);

  camberGroup.add(spinGroup);
  steerPivot.add(camberGroup);
  return {
    steerPivot,
    camberGroup,
    spinGroup,
    tireMesh,
    tireMat,
    sideStripeMat,
    isFront,
    baseX: 0,
    baseY: radius,
    baseZ: 0,
  };
}

export function createF1CarMesh(options = {}) {
  const primaryColor = options.primaryColor ?? 0xdc0000;   // Colore scuderia
  const accentColor = options.accentColor ?? 0x111318;     // Carbonio / secondario
  const wingColor = options.wingColor ?? 0xf8fafc;         // Dettaglio ali
  const helmetColor = options.helmetColor ?? 0xfacc15;     // Casco pilota
  const driverNumber = options.driverNumber ?? '';
  const detailedCar = options.isPlayerCar !== false;

  const appearanceState = {
    primaryColor,
    secondaryColor: accentColor,
    wingColor,
    helmetColor,
    driverNumber,
    roughness: null,
    metalness: null,
  };
  let isCockpitView = false;
  const shadowCastingMeshes = [];
  const distantDetailMeshes = [];
  let lodIsClose = true;
  let lodAllowShadows = true;

  const root = new THREE.Group();
  root.name = 'F1CarRoot';

  // Soft contact shadow ancorata a terra sotto la monoposto (incollata all'asfalto, zero z-fighting)
  const contactShadowGeo = new THREE.PlaneGeometry(
    CAR_VISUAL_CONFIG.contactShadowWidth,
    CAR_VISUAL_CONFIG.contactShadowLength
  );
  contactShadowGeo.rotateX(-Math.PI / 2);
  const contactShadowTex = getSharedContactShadowTexture();
  const contactShadowMat = new THREE.MeshBasicMaterial({
    color: contactShadowTex ? 0xffffff : 0x05070c,
    map: contactShadowTex || null,
    transparent: true,
    opacity: contactShadowTex ? CAR_VISUAL_CONFIG.contactShadowOpacity : 0.42,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const contactShadowMesh = new THREE.Mesh(contactShadowGeo, contactShadowMat);
  contactShadowMesh.name = 'CarContactShadow';
  contactShadowMesh.position.set(
    0,
    CAR_VISUAL_CONFIG.contactShadowY,
    CAR_VISUAL_CONFIG.contactShadowZOffset
  );
  contactShadowMesh.renderOrder = 2;
  contactShadowMesh.castShadow = false;
  contactShadowMesh.receiveShadow = false;
  root.add(contactShadowMesh);

  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const primaryMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    roughness: 0.25,
    metalness: 0.35,
    envMapIntensity: CAR_VISUAL_CONFIG.carEnvMapIntensity,
  });

  const carbonMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.52,
    metalness: 0.25,
    envMapIntensity: CAR_VISUAL_CONFIG.carEnvMapIntensity,
  });

  const whiteAccentMat = new THREE.MeshStandardMaterial({
    color: wingColor,
    roughness: 0.3,
    envMapIntensity: CAR_VISUAL_CONFIG.carEnvMapIntensity,
  });

  const helmetMat = new THREE.MeshStandardMaterial({
    color: helmetColor,
    roughness: 0.2,
    metalness: 0.3,
    envMapIntensity: CAR_VISUAL_CONFIG.carEnvMapIntensity,
  });

  const initialHelmetTex = getHelmetLiveryTexture(helmetColor, primaryColor, driverNumber);
  const driverHelmetMat = new THREE.MeshPhysicalMaterial({
    color: initialHelmetTex ? 0xffffff : helmetColor,
    map: initialHelmetTex,
    roughness: 0.28,
    metalness: 0.08,
    clearcoat: 0.48,
    clearcoatRoughness: 0.16,
    envMapIntensity: 0.62,
  });

  const driverSuitMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    roughness: 0.78,
    metalness: 0.04,
    envMapIntensity: 0.45,
  });

  // 4 ruote (anteriori sterzanti + posteriori motrici) scalate a F1 2026 (passo 3.40 m, larghezza 1.90 m)
  const wheelFL = createWheelAssembly(0.35, 0.32, true);
  wheelFL.baseX = 0.79;
  wheelFL.baseY = 0.35;
  wheelFL.baseZ = 1.65;
  wheelFL.steerPivot.position.set(wheelFL.baseX, wheelFL.baseY, wheelFL.baseZ);

  const wheelFR = createWheelAssembly(0.35, 0.32, true);
  wheelFR.baseX = -0.79;
  wheelFR.baseY = 0.35;
  wheelFR.baseZ = 1.65;
  wheelFR.steerPivot.position.set(wheelFR.baseX, wheelFR.baseY, wheelFR.baseZ);

  const wheelRL = createWheelAssembly(0.35, 0.40, false);
  wheelRL.baseX = 0.75;
  wheelRL.baseY = 0.35;
  wheelRL.baseZ = -1.75;
  wheelRL.steerPivot.position.set(wheelRL.baseX, wheelRL.baseY, wheelRL.baseZ);

  const wheelRR = createWheelAssembly(0.35, 0.40, false);
  wheelRR.baseX = -0.75;
  wheelRR.baseY = 0.35;
  wheelRR.baseZ = -1.75;
  wheelRR.steerPivot.position.set(wheelRR.baseX, wheelRR.baseY, wheelRR.baseZ);

  root.add(wheelFL.steerPivot, wheelFR.steerPivot, wheelRL.steerPivot, wheelRR.steerPivot);

  const wheels = {
    fl: wheelFL,
    fr: wheelFR,
    rl: wheelRL,
    rr: wheelRR,
  };

  // Stato visivo smorzato (solo Presentation Layer: sospensioni attive F1, sollevamento cordolo per ruota, blocco ant. interna)
  const visualSusp = { pitch: 0, roll: 0, heave: 0 };
  const visualWheelLift = { fl: 0, fr: 0, rl: 0, rr: 0 };
  const pitVisualState = { jackLiftM: 0, wheelOutOffsetM: 0 };
  let lastRearWheelRot = null;
  const visualFrontRot = { fl: 0, fr: 0 };

  let steeringWheelGroup = new THREE.Group();
  let cockpitWheelOverlay = null;
  let cockpitClockSec = 0;
  let helmetMesh = null;
  let glbMaterials = null;
  const glbTireTreadMeshes = [];
  const glbTireSideMeshes = [];
  let glbBaseTreadMat = null;
  let glbBaseSideMat = null;
  let lastTireVisualKey = '';
  let lastSidewallCompound = '';

  const syncTireVisuals = (aeroTire) => {
    const compound = TIRE_COMPOUNDS[aeroTire?.compound] ? aeroTire.compound : 'M';
    const gBin = Math.round(clamp(aeroTire?.grainingLevel ?? 0, 0, 1) * 20);
    const bBin = Math.round(clamp(aeroTire?.blisteringLevel ?? 0, 0, 1) * 20);
    const nextKey = `${compound}|${gBin}|${bBin}`;
    if (nextKey === lastTireVisualKey) return;
    lastTireVisualKey = nextKey;

    const compSpec = TIRE_COMPOUNDS[compound] || TIRE_COMPOUNDS.M;
    if (glbTireTreadMeshes.length > 0 && glbBaseTreadMat) {
      const treadMat = getCachedGlbTreadMaterial(glbBaseTreadMat, compound, gBin, bBin);
      if (treadMat) {
        for (let i = 0; i < glbTireTreadMeshes.length; i++) {
          glbTireTreadMeshes[i].material = treadMat;
        }
      }
    } else {
      const procSet = getTireTreadTextureSet(gBin, bBin, compound);
      const gRatio = gBin / 20;
      const bRatio = bBin / 20;
      const nextRough = procSet?.roughnessMap
        ? 1.0
        : clamp(0.68 + gRatio * 0.18 + bRatio * 0.16, 0.62, 0.98);
      for (let i = 0; i < WHEEL_KEYS.length; i++) {
        const w = wheels[WHEEL_KEYS[i]];
        if (w?.tireMat) {
          if (procSet?.map) {
            w.tireMat.map = procSet.map;
            w.tireMat.color.setHex(0xffffff);
          }
          if (procSet?.bumpMap) {
            w.tireMat.bumpMap = procSet.bumpMap;
            w.tireMat.bumpScale = compound === 'W' ? 0.028 : 0.014;
          }
          if (procSet?.roughnessMap) {
            w.tireMat.roughnessMap = procSet.roughnessMap;
          }
          w.tireMat.roughness = nextRough;
          w.tireMat.needsUpdate = true;
        }
      }
    }

    if (compound !== lastSidewallCompound) {
      lastSidewallCompound = compound;
      if (glbTireSideMeshes.length > 0 && glbBaseSideMat) {
        const sideMat = getCachedGlbSidewallMaterial(glbBaseSideMat, compound);
        if (sideMat) {
          for (let i = 0; i < glbTireSideMeshes.length; i++) {
            glbTireSideMeshes[i].material = sideMat;
          }
        }
      }
      for (let i = 0; i < WHEEL_KEYS.length; i++) {
        const w = wheels[WHEEL_KEYS[i]];
        if (w?.sideStripeMat) {
          w.sideStripeMat.color.set(compSpec.colorHex);
        }
      }
    }
  };

  const buildProceduralBody = () => {
    bodyGroup.clear();

    // 1. Fondo piatto (Floor / Plank)
    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.06, 4.1), carbonMat);
    floorMesh.position.set(0, 0.14, -0.05);
    floorMesh.castShadow = true;
    bodyGroup.add(floorMesh);

    // 2. Monoscocca centrale
    const chassisMesh = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.42, 2.3), primaryMat);
    chassisMesh.position.set(0, 0.38, -0.05);
    chassisMesh.castShadow = true;
    bodyGroup.add(chassisMesh);

    // 3. Musetto anteriore (Nosecone inclinato verso +Z)
    const noseGeo = new THREE.BoxGeometry(0.42, 0.24, 1.45);
    const noseMesh = new THREE.Mesh(noseGeo, primaryMat);
    noseMesh.position.set(0, 0.30, 1.65);
    noseMesh.rotation.x = 0.09;
    noseMesh.castShadow = true;
    bodyGroup.add(noseMesh);

    // 4. Alettone anteriore (Front Wing + Endplates a larghezza 1.90 m)
    const frontWingMain = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.06, 0.38), carbonMat);
    frontWingMain.position.set(0, 0.16, 2.38);
    frontWingMain.castShadow = true;
    bodyGroup.add(frontWingMain);

    const frontWingFlap = new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.04, 0.22), whiteAccentMat);
    frontWingFlap.position.set(0, 0.21, 2.28);
    frontWingFlap.rotation.x = -0.18;
    bodyGroup.add(frontWingFlap);

    const fwEndplateGeo = new THREE.BoxGeometry(0.05, 0.24, 0.48);
    const fwEndplateLeft = new THREE.Mesh(fwEndplateGeo, primaryMat);
    fwEndplateLeft.position.set(0.925, 0.24, 2.35);
    const fwEndplateRight = new THREE.Mesh(fwEndplateGeo, primaryMat);
    fwEndplateRight.position.set(-0.925, 0.24, 2.35);
    bodyGroup.add(fwEndplateLeft, fwEndplateRight);

    // 5. Pance laterali (Sidepods)
    const sidepodGeo = new THREE.BoxGeometry(0.46, 0.34, 1.65);
    const leftSidepod = new THREE.Mesh(sidepodGeo, primaryMat);
    leftSidepod.position.set(0.52, 0.34, -0.25);
    leftSidepod.castShadow = true;

    const rightSidepod = new THREE.Mesh(sidepodGeo, primaryMat);
    rightSidepod.position.set(-0.52, 0.34, -0.25);
    rightSidepod.castShadow = true;
    bodyGroup.add(leftSidepod, rightSidepod);

    // 6. Cofano motore e Airbox superiore
    const airboxMesh = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 1.35), primaryMat);
    airboxMesh.position.set(0, 0.72, -0.65);
    airboxMesh.castShadow = true;
    bodyGroup.add(airboxMesh);

    const sharkFinMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 1.05), carbonMat);
    sharkFinMesh.position.set(0, 0.82, -1.25);
    bodyGroup.add(sharkFinMesh);

    // 7. Abitacolo, Volante F1, Casco pilota e Halo
    const cockpitRecess = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.75), carbonMat);
    cockpitRecess.position.set(0, 0.56, 0.22);
    bodyGroup.add(cockpitRecess);

    steeringWheelGroup = new THREE.Group();
    steeringWheelGroup.position.set(0, 0.61, 0.45);
    steeringWheelGroup.rotation.x = -0.22;

    const wheelRim = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.03), carbonMat);
    const wheelScreen = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.055, 0.034),
      new THREE.MeshBasicMaterial({ color: 0x0ea5e9 })
    );
    wheelScreen.position.set(0, 0.02, -0.004);

    const gripMat = new THREE.MeshStandardMaterial({ color: 0xe10600, roughness: 0.5 });
    const leftGrip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.12, 0.038), gripMat);
    leftGrip.position.set(0.115, -0.005, 0);
    const rightGrip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.12, 0.038), gripMat);
    rightGrip.position.set(-0.115, -0.005, 0);

    steeringWheelGroup.add(wheelRim, wheelScreen, leftGrip, rightGrip);
    bodyGroup.add(steeringWheelGroup);

    helmetMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), helmetMat);
    helmetMesh.position.set(0, 0.68, 0.18);
    bodyGroup.add(helmetMesh);

    const haloPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.24, 8), carbonMat);
    haloPillar.position.set(0, 0.67, 0.56);
    haloPillar.rotation.x = -0.30;
    bodyGroup.add(haloPillar);

    const haloLeftRail = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.68), carbonMat);
    haloLeftRail.position.set(0.24, 0.79, 0.26);
    const haloRightRail = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.68), carbonMat);
    haloRightRail.position.set(-0.24, 0.79, 0.26);
    const haloFrontBar = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.045, 0.08), carbonMat);
    haloFrontBar.position.set(0, 0.78, 0.58);
    const haloRearBar = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.045, 0.08), carbonMat);
    haloRearBar.position.set(0, 0.80, -0.06);
    bodyGroup.add(haloLeftRail, haloRightRail, haloFrontBar, haloRearBar);

    // 8. Alettone posteriore (Rear Wing)
    const rearWingMain = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.07, 0.34), carbonMat);
    rearWingMain.position.set(0, 0.88, -2.05);
    rearWingMain.castShadow = true;
    bodyGroup.add(rearWingMain);

    const rearWingUpper = new THREE.Mesh(new THREE.BoxGeometry(1.10, 0.12, 0.08), whiteAccentMat);
    rearWingUpper.position.set(0, 0.99, -2.16);
    bodyGroup.add(rearWingUpper);

    const rwEndplateGeo = new THREE.BoxGeometry(0.05, 0.62, 0.46);
    const rwLeft = new THREE.Mesh(rwEndplateGeo, primaryMat);
    rwLeft.position.set(0.56, 0.76, -2.05);
    const rwRight = new THREE.Mesh(rwEndplateGeo, primaryMat);
    rwRight.position.set(-0.56, 0.76, -2.05);
    bodyGroup.add(rwLeft, rwRight);

    attachNightLightsToBody();
  };

  // Luci LED vettura F1 per GP notturni e pioggia (emissivi HDR per bloom selettivo)
  let isNightVisualMode = false;
  let isRainVisualMode = false;
  let nightClockSec = 0;

  const rearRainLedMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.4, 0.12, 0.12),
    toneMapped: false,
  });
  const brakeLedMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.4, 0.08, 0.08),
    toneMapped: false,
  });
  const frontMarkerLedMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.2, 2.55, 3.0),
    toneMapped: false,
  });

  const nightLightsGroup = new THREE.Group();
  nightLightsGroup.name = 'F1NightCarLights';

  // Luce posteriore FIA centrale (rain / ERS light sulla crash structure posteriore)
  const rearRainLed = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.11, 0.04), rearRainLedMat);
  rearRainLed.position.set(0, 0.36, -2.27);
  nightLightsGroup.add(rearRainLed);

  // Barre LED rosse sugli endplate dell'ala posteriore (si illuminano intensamente in frenata)
  const brakeLedGeo = new THREE.BoxGeometry(0.022, 0.22, 0.036);
  const brakeLedLeft = new THREE.Mesh(brakeLedGeo, brakeLedMat);
  brakeLedLeft.position.set(0.54, 0.76, -2.23);
  const brakeLedRight = new THREE.Mesh(brakeLedGeo, brakeLedMat);
  brakeLedRight.position.set(-0.54, 0.76, -2.23);
  nightLightsGroup.add(brakeLedLeft, brakeLedRight);

  // Sottili marker LED bianchi sul muso/ala anteriore (visibili di notte)
  const frontMarkerGeo = new THREE.BoxGeometry(0.06, 0.024, 0.035);
  const frontMarkerLeft = new THREE.Mesh(frontMarkerGeo, frontMarkerLedMat);
  frontMarkerLeft.position.set(0.22, 0.28, 2.26);
  const frontMarkerRight = new THREE.Mesh(frontMarkerGeo, frontMarkerLedMat);
  frontMarkerRight.position.set(-0.22, 0.28, 2.26);
  nightLightsGroup.add(frontMarkerLeft, frontMarkerRight);

  const syncNightLightsVisibility = (brakeAmount = 0) => {
    const showRearRain = isNightVisualMode || isRainVisualMode;
    const showBrake = isNightVisualMode || brakeAmount > 0.08;
    const showFront = isNightVisualMode;

    rearRainLed.visible = showRearRain;
    brakeLedLeft.visible = showBrake;
    brakeLedRight.visible = showBrake;
    frontMarkerLeft.visible = showFront;
    frontMarkerRight.visible = showFront;
    nightLightsGroup.visible = showRearRain || showBrake || showFront;

    if (showBrake) {
      const b = Math.max(0, Math.min(1, brakeAmount));
      const gain = isNightVisualMode ? 1.85 + b * 3.4 : 0.95 + b * 2.6;
      brakeLedMat.color.setRGB(gain, 0.015 + b * 0.04, 0.015 + b * 0.02);
    }
    if (showRearRain) {
      const pulse = isRainVisualMode
        ? (Math.sin(nightClockSec * 22.0) > -0.15 ? 3.8 : 0.45)
        : 2.65;
      rearRainLedMat.color.setRGB(pulse, 0.02, 0.02);
    }
  };

  const attachNightLightsToBody = (template = null) => {
    if (template) {
      const trailingZ = (template.rearLightZ ?? -2.635) - 0.008;
      const wingX = template.rearWingHalfX ?? 0.585;
      const frontZ = (template.frontNoseZ ?? 2.38) - 0.28;
      rearRainLed.position.set(0, 0.40, trailingZ);
      brakeLedLeft.position.set(wingX, 0.84, trailingZ);
      brakeLedRight.position.set(-wingX, 0.84, trailingZ);
      frontMarkerLeft.position.set(0.24, 0.26, frontZ);
      frontMarkerRight.position.set(-0.24, 0.26, frontZ);
    } else {
      rearRainLed.position.set(0, 0.36, -2.27);
      brakeLedLeft.position.set(0.54, 0.76, -2.23);
      brakeLedRight.position.set(-0.54, 0.76, -2.23);
      frontMarkerLeft.position.set(0.22, 0.28, 2.26);
      frontMarkerRight.position.set(-0.22, 0.28, 2.26);
    }
    if (nightLightsGroup.parent !== bodyGroup) {
      bodyGroup.add(nightLightsGroup);
    }
    syncNightLightsVisibility(0);
  };

  const applyAppearanceState = () => {
    const {
      primaryColor: nextPrimary,
      secondaryColor: nextSecondary,
      wingColor: nextWing,
      helmetColor: nextHelmet,
      driverNumber: nextNumber,
      roughness,
      metalness,
    } = appearanceState;

    if (nextPrimary !== undefined) {
      primaryMat.color.set(nextPrimary);
      driverSuitMat.color.set(nextPrimary);
    }
    if (nextSecondary !== undefined) carbonMat.color.set(nextSecondary);
    if (nextWing !== undefined) whiteAccentMat.color.set(nextWing);
    if (nextHelmet !== undefined) helmetMat.color.set(nextHelmet);

    const nextHelmetTex = getHelmetLiveryTexture(nextHelmet, nextPrimary, nextNumber);
    if (driverHelmetMat.map !== nextHelmetTex) {
      driverHelmetMat.map = nextHelmetTex;
      driverHelmetMat.needsUpdate = true;
    }
    if (nextHelmetTex) {
      driverHelmetMat.color.setHex(0xffffff);
    } else if (nextHelmet !== undefined) {
      driverHelmetMat.color.set(nextHelmet);
    }
    if (typeof roughness === 'number' && Number.isFinite(roughness)) {
      primaryMat.roughness = Math.max(0.04, Math.min(0.95, roughness));
    }
    if (typeof metalness === 'number' && Number.isFinite(metalness)) {
      primaryMat.metalness = Math.max(0, Math.min(1, metalness));
    }

    if (!glbMaterials) return;

    const {
      paintMat,
      originalPaintMap,
      wingWhiteMat,
      originalWingMap,
      driverColorMat,
    } = glbMaterials;
    const isFerrariRed = isDefaultFerrariRed(nextPrimary);

    if (paintMat) {
      if (isFerrariRed && originalPaintMap) {
        if (paintMat.map !== originalPaintMap) {
          paintMat.map = originalPaintMap;
          paintMat.needsUpdate = true;
        }
        paintMat.color.setHex(0xffffff);
      } else if (nextPrimary !== undefined) {
        if (paintMat.map !== null) {
          paintMat.map = null;
          paintMat.needsUpdate = true;
        }
        paintMat.color.set(nextPrimary);
      }

      if (typeof roughness === 'number' && Number.isFinite(roughness)) {
        paintMat.roughness = Math.max(0.04, Math.min(0.95, roughness));
      }
      if (typeof metalness === 'number' && Number.isFinite(metalness)) {
        paintMat.metalness = Math.max(0, Math.min(1, metalness));
      }
    }

    if (wingWhiteMat) {
      if (isFerrariRed && originalWingMap) {
        if (wingWhiteMat.map !== originalWingMap) {
          wingWhiteMat.map = originalWingMap;
          wingWhiteMat.needsUpdate = true;
        }
        wingWhiteMat.color.setHex(0xffffff);
      } else if (nextWing !== undefined) {
        if (wingWhiteMat.map !== null) {
          wingWhiteMat.map = null;
          wingWhiteMat.needsUpdate = true;
        }
        wingWhiteMat.color.set(nextWing);
      }
    }

    if (driverColorMat && nextHelmet !== undefined) {
      if (driverColorMat.map !== null) {
        driverColorMat.map = null;
        driverColorMat.needsUpdate = true;
      }
      driverColorMat.color.set(nextHelmet);
    }
  };

  const applyGlbTemplate = (template) => {
    if (!template) return;

    bodyGroup.clear();
    shadowCastingMeshes.length = 0;
    distantDetailMeshes.length = 0;
    glbTireTreadMeshes.length = 0;
    glbTireSideMeshes.length = 0;
    glbBaseTreadMat = null;
    glbBaseSideMat = null;
    lastTireVisualKey = '';
    lastSidewallCompound = '';
    helmetMesh = null;

    let paintMat = null;
    let originalPaintMap = null;
    let wingWhiteMat = null;
    let originalWingMap = null;
    let driverColorMat = null;

    const resolveMaterial = (part) => {
      if (part.matName === 'sf25_paints') {
        if (!paintMat) {
          originalPaintMap = part.material.map ?? null;
          paintMat = part.material.clone();
        }
        return paintMat;
      }
      if (part.matName === 'sf25_carbon1_white') {
        if (!wingWhiteMat) {
          originalWingMap = part.material.map ?? null;
          wingWhiteMat = part.material.clone();
        }
        return wingWhiteMat;
      }
      if (part.matName === 'driver_color') {
        if (!driverColorMat) {
          driverColorMat = part.material.clone();
        }
        return driverColorMat;
      }
      return part.material;
    };

    for (const part of template.bodyParts) {
      if (!detailedCar && AI_SKIP_BODY_MATERIALS.has(part.matName)) continue;
      const mesh = new THREE.Mesh(part.geometry, resolveMaterial(part));
      mesh.castShadow = part.castShadow && lodAllowShadows;
      mesh.receiveShadow = detailedCar && part.castShadow;
      if (part.castShadow) {
        shadowCastingMeshes.push(mesh);
      }
      if (!detailedCar && AI_DISTANT_HIDE_MATERIALS.has(part.matName)) {
        mesh.visible = lodIsClose;
        distantDetailMeshes.push(mesh);
      }
      bodyGroup.add(mesh);
    }

    steeringWheelGroup = new THREE.Group();
    if (isCockpitView && detailedCar) {
      steeringWheelGroup.position.set(0, 0.670, 0.326);
    } else {
      steeringWheelGroup.position.set(
        STEERING_PIVOT[0],
        STEERING_PIVOT[1],
        STEERING_PIVOT[2]
      );
    }
    cockpitWheelOverlay = null;
    if (detailedCar) {
      for (const part of template.steeringParts) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        steeringWheelGroup.add(mesh);
      }
      cockpitWheelOverlay = createCockpitSteeringOverlay();
      cockpitWheelOverlay.setVisibleInCockpit(isCockpitView);
      steeringWheelGroup.add(cockpitWheelOverlay.group);
      bodyGroup.add(steeringWheelGroup);
    }

    for (const qKey of WHEEL_KEYS) {
      const wheel = wheels[qKey];
      const [cx, cy, cz] = template.wheelCenters?.[qKey] ?? WHEEL_CENTERS[qKey];
      wheel.baseX = cx;
      wheel.baseY = cy;
      wheel.baseZ = cz;
      wheel.steerPivot.position.set(cx, cy + visualWheelLift[qKey], cz);
      wheel.steerPivot.clear();
      wheel.camberGroup.clear();
      wheel.spinGroup.clear();
      if (template.wheelAxleQuaternions?.[qKey]) {
        wheel.camberGroup.quaternion.copy(template.wheelAxleQuaternions[qKey]);
      } else {
        wheel.camberGroup.quaternion.identity();
      }
      wheel.camberGroup.add(wheel.spinGroup);
      wheel.steerPivot.add(wheel.camberGroup);

      for (const part of template.wheelParts[qKey].spin) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        mesh.castShadow = part.castShadow && lodAllowShadows;
        mesh.receiveShadow = detailedCar;
        if (part.matName === 'tyre_tread') {
          if (!glbBaseTreadMat) glbBaseTreadMat = part.material;
          glbTireTreadMeshes.push(mesh);
        } else if (part.matName === 'tyre_sides') {
          if (!glbBaseSideMat) glbBaseSideMat = part.material;
          glbTireSideMeshes.push(mesh);
        }
        if (part.castShadow) {
          shadowCastingMeshes.push(mesh);
        }
        if (!detailedCar && AI_DISTANT_HIDE_MATERIALS.has(part.matName)) {
          mesh.visible = lodIsClose;
          distantDetailMeshes.push(mesh);
        }
        wheel.spinGroup.add(mesh);
      }

      if (detailedCar) {
        for (const part of template.wheelParts[qKey].brake) {
          const mesh = new THREE.Mesh(part.geometry, part.material);
          mesh.castShadow = false;
          wheel.steerPivot.add(mesh);
        }
      }
    }

    glbMaterials = {
      paintMat,
      originalPaintMap,
      wingWhiteMat,
      originalWingMap,
      driverColorMat,
    };

    if (paintMat) {
      materials.primaryMat = paintMat;
    }
    if (wingWhiteMat) {
      materials.whiteAccentMat = wingWhiteMat;
    }
    if (driverColorMat) {
      materials.helmetMat = driverColorMat;
    }

    const driverGroup = buildGlbDriverGroup({
      helmetMat: driverHelmetMat,
      suitMat: driverSuitMat,
      detailedCar,
    });
    bodyGroup.add(driverGroup);
    helmetMesh = driverGroup;

    applyAppearanceState();
    attachNightLightsToBody(template);
    if (helmetMesh) {
      helmetMesh.visible = !isCockpitView;
    }
  };

  const materials = {
    primaryMat,
    carbonMat,
    whiteAccentMat,
    helmetMat,
  };

  if (glbTemplate) {
    applyGlbTemplate(glbTemplate);
  } else {
    buildProceduralBody();
    if (typeof window !== 'undefined') {
      pendingUpgrades.add(applyGlbTemplate);
      ensureGlbTemplateLoaded();
    }
  }

  return {
    root,
    bodyGroup,
    contactShadowMesh,
    materials,
    wheels,
    setAppearance({
      primaryColor: nextPrimary,
      secondaryColor: nextSecondary,
      wingColor: nextWing,
      helmetColor: nextHelmet,
      driverNumber: nextNumber,
      roughness,
      metalness,
    } = {}) {
      if (nextPrimary !== undefined) appearanceState.primaryColor = nextPrimary;
      if (nextSecondary !== undefined) appearanceState.secondaryColor = nextSecondary;
      if (nextWing !== undefined) appearanceState.wingColor = nextWing;
      if (nextHelmet !== undefined) appearanceState.helmetColor = nextHelmet;
      if (nextNumber !== undefined) appearanceState.driverNumber = nextNumber;
      if (typeof roughness === 'number' && Number.isFinite(roughness)) {
        appearanceState.roughness = roughness;
      }
      if (typeof metalness === 'number' && Number.isFinite(metalness)) {
        appearanceState.metalness = metalness;
      }
      applyAppearanceState();
    },
    /**
     * Nasconde il casco in visuale prima persona e mostra i guanti pilota sul volante.
     */
    setCockpitView(isCockpit) {
      isCockpitView = Boolean(isCockpit);
      if (helmetMesh) {
        helmetMesh.visible = !isCockpitView;
      }
      if (cockpitWheelOverlay) {
        cockpitWheelOverlay.setVisibleInCockpit(isCockpitView);
      }
      if (cockpitWheelOverlay && detailedCar && steeringWheelGroup) {
        if (isCockpitView) {
          steeringWheelGroup.position.set(0, 0.670, 0.326);
        } else {
          steeringWheelGroup.position.set(
            STEERING_PIVOT[0],
            STEERING_PIVOT[1],
            STEERING_PIVOT[2]
          );
        }
      }
    },
    /**
     * Regola dinamicamente LOD secondario e shadow casting in base alla distanza dalla camera attiva.
     */
    setLodState(isClose, allowShadows = true) {
      const nextClose = Boolean(isClose);
      const nextShadows = Boolean(allowShadows);
      if (nextClose !== lodIsClose) {
        lodIsClose = nextClose;
        for (let i = 0; i < distantDetailMeshes.length; i++) {
          distantDetailMeshes[i].visible = lodIsClose;
        }
      }
      if (nextShadows !== lodAllowShadows) {
        lodAllowShadows = nextShadows;
        for (let i = 0; i < shadowCastingMeshes.length; i++) {
          shadowCastingMeshes[i].castShadow = lodAllowShadows;
        }
      }
    },
    /**
     * Abilita/disabilita luci LED vettura per GP notturni e pioggia.
     */
    setNightMode(isNight, isRain = false) {
      const nextNight = Boolean(isNight);
      const nextRain = Boolean(isRain);
      if (nextNight === isNightVisualMode && nextRain === isRainVisualMode) return;
      isNightVisualMode = nextNight;
      isRainVisualMode = nextRain;
      syncNightLightsVisibility(0);
    },
    /**
     * Imposta sollevamento martinetti e traslazione laterale delle 4 ruote durante il Pit Stop animato.
     */
    setPitStopVisualState({ jackLiftM = 0, wheelOutOffsetM = 0 } = {}) {
      const nextLift = clamp(Number(jackLiftM) || 0, 0, 0.14);
      const nextOut = clamp(Number(wheelOutOffsetM) || 0, 0, 0.75);
      pitVisualState.jackLiftM = nextLift;
      pitVisualState.wheelOutOffsetM = nextOut;
      bodyGroup.position.y = visualSusp.heave + nextLift;
      const pitWheelLift = nextOut > 0.01 ? 0.035 * Math.min(1, nextOut / 0.14) : 0;
      for (let i = 0; i < WHEEL_KEYS.length; i++) {
        const qKey = WHEEL_KEYS[i];
        const wheel = wheels[qKey];
        const outSign = wheel.baseX >= 0 ? 1 : -1;
        wheel.steerPivot.position.x = wheel.baseX + outSign * nextOut;
        wheel.steerPivot.position.y = wheel.baseY + visualWheelLift[qKey] + pitWheelLift;
      }
    },
    /**
     * Restituisce l'ultima chiave di stato visivo gomme applicata (diagnostica / test).
     */
    getTireVisualKey() {
      return lastTireVisualKey;
    },
    /**
     * Sincronizza posizione, orientamento, sospensioni attive visive smorzate,
     * sollevamento individuale della sola ruota su cordolo (`kerb`), volante e
     * bloccaggio rotazione sulla sola ruota anteriore interna.
     * Modifica 100% visiva — non altera mai `carState` né la fisica.
     * @param {object} carState
     * @param {{ trackSurface?: object | null, dt?: number }} [syncOptions]
     */
    syncFromState(carState, syncOptions = {}) {
      const trackSurface = syncOptions?.trackSurface ?? null;
      const rawDt = syncOptions?.dt;
      const safeDt = clamp(
        typeof rawDt === 'number' && Number.isFinite(rawDt) && rawDt > 0 ? rawDt : 1 / 60,
        0.001,
        0.05
      );

      root.position.set(carState.x, carState.y, carState.z);
      root.rotation.y = carState.heading;

      // 1. Sospensioni attive visive stile F1 reale (smorzate 1 - exp(-12 * dt), zero rimbalzi)
      const susp = carState.suspension;
      const targetPitch = susp
        ? clamp(
            (susp.pitch ?? 0) * 0.22,
            -VISUAL_SUSPENSION_LIMITS.maxPitchRad,
            VISUAL_SUSPENSION_LIMITS.maxPitchRad
          )
        : 0;
      const targetRoll = susp
        ? clamp(
            (susp.roll ?? 0) * 0.165,
            -VISUAL_SUSPENSION_LIMITS.maxRollRad,
            VISUAL_SUSPENSION_LIMITS.maxRollRad
          )
        : 0;

      let targetHeave = 0;
      const downforceKg = carState.aeroTire?.downforceKg;
      if (
        typeof downforceKg === 'number' &&
        Number.isFinite(downforceKg) &&
        (downforceKg > 0 || Math.abs(carState.forwardSpeed ?? 0) > 1.0)
      ) {
        const downforceRatio = clamp(downforceKg / 1250, 0, 1);
        targetHeave = -VISUAL_SUSPENSION_LIMITS.maxAeroDropM * downforceRatio;
      } else if (susp && typeof susp.heave === 'number' && Number.isFinite(susp.heave)) {
        targetHeave = clamp(susp.heave * 0.4, -VISUAL_SUSPENSION_LIMITS.maxAeroDropM, 0);
      }

      const suspAlpha = 1 - Math.exp(-VISUAL_SUSPENSION_LIMITS.dampingRate * safeDt);
      visualSusp.pitch += (targetPitch - visualSusp.pitch) * suspAlpha;
      visualSusp.roll += (targetRoll - visualSusp.roll) * suspAlpha;
      visualSusp.heave += (targetHeave - visualSusp.heave) * suspAlpha;

      bodyGroup.position.y = visualSusp.heave + pitVisualState.jackLiftM;
      bodyGroup.rotation.x = visualSusp.pitch;
      bodyGroup.rotation.z = visualSusp.roll;

      // 2. Ruote piantate a terra su asfalto (rimosso `susp.wheelOffsetY`) +
      //    sollevamento localizzato (+1.5..2.5 cm con micro-zigrinatura) SOLO sulla ruota su cordolo
      const shouldQueryWheels = Boolean(trackSurface) && (detailedCar || lodIsClose);
      const heading = carState.heading ?? 0;
      const sinH = Math.sin(heading);
      const cosH = Math.cos(heading);
      const leftX = cosH;
      const leftZ = -sinH;
      const absSpeed = Math.abs(carState.forwardSpeed ?? carState.speed ?? 0);
      const serrationSpeedFactor = clamp(absSpeed / 12, 0.2, 1.0);
      const wheelSmoothAlpha = 1 - Math.exp(-VISUAL_KERB_LIFT.dampingRate * safeDt);
      let hintIdx =
        typeof carState.trackSampleIndex === 'number' && carState.trackSampleIndex >= 0
          ? carState.trackSampleIndex
          : null;

      for (let i = 0; i < WHEEL_KEYS.length; i++) {
        const qKey = WHEEL_KEYS[i];
        const wheel = wheels[qKey];
        let targetLift = 0;

        if (shouldQueryWheels) {
          const wx = carState.x + leftX * wheel.baseX + sinH * wheel.baseZ;
          const wz = carState.z + leftZ * wheel.baseX + cosH * wheel.baseZ;
          const q = queryTrackSurface(trackSurface, wx, wz, hintIdx);
          if (hintIdx === null && q && typeof q.sampleIndex === 'number') {
            hintIdx = q.sampleIndex;
          }
          if (q && q.surface === 'kerb') {
            const kerbWidth = trackSurface.kerbWidth || 1.4;
            const intoKerb = clamp(
              (q.absOffset - q.halfTrackWidth) / Math.max(0.25, kerbWidth),
              0,
              1
            );
            const profileLift = 0.0175 + 0.0045 * Math.sin(intoKerb * Math.PI * 0.9);
            const serrationWave =
              Math.sin(
                (q.arcDistance ?? 0) * ((Math.PI * 2) / VISUAL_KERB_LIFT.serrationPitchM)
              ) *
              VISUAL_KERB_LIFT.serrationAmpM *
              serrationSpeedFactor;
            targetLift = clamp(
              profileLift + serrationWave,
              VISUAL_KERB_LIFT.minM,
              VISUAL_KERB_LIFT.maxM
            );
          }
        }

        visualWheelLift[qKey] += (targetLift - visualWheelLift[qKey]) * wheelSmoothAlpha;
        if (targetLift === 0 && Math.abs(visualWheelLift[qKey]) < 1e-5) {
          visualWheelLift[qKey] = 0;
        }
        const outSign = wheel.baseX >= 0 ? 1 : -1;
        const pitWheelLift =
          pitVisualState.wheelOutOffsetM > 0.01
            ? 0.035 * Math.min(1, pitVisualState.wheelOutOffsetM / 0.14)
            : 0;
        wheel.steerPivot.position.x = wheel.baseX + outSign * pitVisualState.wheelOutOffsetM;
        wheel.steerPivot.position.y = wheel.baseY + visualWheelLift[qKey] + pitWheelLift;
      }

      // 2b. Aggiornamento visivo battistrada (Graining/Blistering 5%) + banda Pirelli mescola (S/M/H/W)
      syncTireVisuals(carState.aeroTire);

      // 3. Volante, schermo LCD telemetria live (in prima persona) e sterzata ruote anteriori
      const steerAngle = carState.steerAngle ?? 0;
      if (detailedCar) {
        steeringWheelGroup.rotation.z = -steerAngle * 2.2;
        if (cockpitWheelOverlay && isCockpitView) {
          cockpitClockSec += safeDt;
          cockpitWheelOverlay.updateTelemetry(carState, cockpitClockSec);
        }
      }

      wheelFL.steerPivot.rotation.y = steerAngle;
      wheelFR.steerPivot.rotation.y = steerAngle;

      // 4. Rotolamento ruote + bloccaggio visivo sulla sola ruota anteriore interna alla curva
      const rearRot = carState.wheelRotation ?? 0;
      if (lastRearWheelRot === null) {
        lastRearWheelRot = rearRot;
        const initFront = carState.frontWheelRotation ?? rearRot;
        visualFrontRot.fl = initFront;
        visualFrontRot.fr = initFront;
      } else {
        const dRot = rearRot - lastRearWheelRot;
        lastRearWheelRot = rearRot;
        if (Math.abs(dRot) > 40) {
          const resetFront = carState.frontWheelRotation ?? rearRot;
          visualFrontRot.fl = resetFront;
          visualFrontRot.fr = resetFront;
        } else {
          const locked = resolveLockedFrontWheels(carState);
          if (!locked.fl) visualFrontRot.fl += dRot;
          if (!locked.fr) visualFrontRot.fr += dRot;
        }
      }

      wheelFL.spinGroup.rotation.x = visualFrontRot.fl;
      wheelFR.spinGroup.rotation.x = visualFrontRot.fr;
      wheelRL.spinGroup.rotation.x = rearRot;
      wheelRR.spinGroup.rotation.x = rearRot;

      if (isNightVisualMode || isRainVisualMode || (carState.brakeInput ?? 0) > 0.08) {
        nightClockSec += safeDt;
        syncNightLightsVisibility(carState.brakeInput ?? 0);
      } else if (nightLightsGroup.visible) {
        syncNightLightsVisibility(0);
      }
    },
  };
}
