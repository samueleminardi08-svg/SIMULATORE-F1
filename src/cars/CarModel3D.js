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

  // Pneumatico Pirelli slick di fallback
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 24);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.78,
    metalness: 0.1,
  });
  const tireMesh = new THREE.Mesh(tireGeo, tireMat);
  tireMesh.castShadow = true;
  spinGroup.add(tireMesh);

  // Cerchione / copricerchio aerodinamico
  const rimGeo = new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width + 0.01, 16);
  rimGeo.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x27272a,
    roughness: 0.35,
    metalness: 0.6,
  });
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  spinGroup.add(rimMesh);

  // Razza di riferimento visivo della rotazione
  const spokeGeo = new THREE.BoxGeometry(width + 0.02, radius * 1.15, 0.055);
  const spokeMat = new THREE.MeshBasicMaterial({ color: 0xe10600 });
  const spokeMesh = new THREE.Mesh(spokeGeo, spokeMat);
  spinGroup.add(spokeMesh);

  camberGroup.add(spinGroup);
  steerPivot.add(camberGroup);
  return {
    steerPivot,
    camberGroup,
    spinGroup,
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
  let lastRearWheelRot = null;
  const visualFrontRot = { fl: 0, fr: 0 };

  let steeringWheelGroup = new THREE.Group();
  let helmetMesh = null;
  let glbMaterials = null;

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
    steeringWheelGroup.position.set(
      STEERING_PIVOT[0],
      STEERING_PIVOT[1],
      STEERING_PIVOT[2]
    );
    if (detailedCar) {
      for (const part of template.steeringParts) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        steeringWheelGroup.add(mesh);
      }
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
     * Nasconde il casco di fallback in visuale prima persona per non ostruire la camera.
     */
    setCockpitView(isCockpit) {
      isCockpitView = Boolean(isCockpit);
      if (helmetMesh) {
        helmetMesh.visible = !isCockpitView;
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

      bodyGroup.position.y = visualSusp.heave;
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
        wheel.steerPivot.position.y = wheel.baseY + visualWheelLift[qKey];
      }

      // 3. Volante e sterzata ruote anteriori
      const steerAngle = carState.steerAngle ?? 0;
      if (detailedCar) {
        steeringWheelGroup.rotation.z = -steerAngle * 2.2;
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
