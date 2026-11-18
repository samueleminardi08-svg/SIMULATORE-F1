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
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

const WHEEL_CENTERS = {
  fl: [0.800, 0.364, 1.522],
  fr: [-0.800, 0.366, 1.522],
  rl: [0.764, 0.358, -2.011],
  rr: [-0.764, 0.359, -2.011],
};
const STEERING_PIVOT = [0, 0.680, 0.455];

const TEMP_COLOR = new THREE.Color();

let glbTemplate = null;
let glbLoadPromise = null;
const pendingUpgrades = new Set();

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
 * nei 4 quadranti (fl, fr, rl, rr) centrandoli sul rispettivo mozzo.
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
    const [cx0, cy0, cz0] = WHEEL_CENTERS[quadKey];

    for (const [attrName, attr] of Object.entries(geometry.attributes)) {
      const itemSize = attr.itemSize;
      const ArrayCtor = attr.array.constructor;
      const dest = new ArrayCtor(usedVerts.length * itemSize);
      const src = attr.array;

      if (attrName === 'position') {
        for (let k = 0; k < usedVerts.length; k++) {
          const s = usedVerts[k] * itemSize;
          const d = k * itemSize;
          dest[d] = src[s] - cx0;
          dest[d + 1] = src[s + 1] - cy0;
          dest[d + 2] = src[s + 2] - cz0;
        }
      } else {
        for (let k = 0; k < usedVerts.length; k++) {
          const s = usedVerts[k] * itemSize;
          const d = k * itemSize;
          for (let c = 0; c < itemSize; c++) {
            dest[d + c] = src[s + c];
          }
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
 * Estrae geometrie e materiali condivisi dal GLB caricato in singleton.
 * @param {THREE.Group} gltfScene
 */
function buildTemplateFromGltfScene(gltfScene) {
  const toCarSpace = new THREE.Matrix4()
    .makeRotationX(Math.PI / 2)
    .setPosition(0, 0.027, 0);

  const template = {
    bodyParts: [],
    steeringParts: [],
    wheelParts: {
      fl: { spin: [], brake: [] },
      fr: { spin: [], brake: [] },
      rl: { spin: [], brake: [] },
      rr: { spin: [], brake: [] },
    },
  };

  gltfScene.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;

    const material = Array.isArray(child.material)
      ? child.material[0]
      : child.material;
    if (!material) return;

    const matName = material.name || '';
    const isTransparent =
      Boolean(material.transparent) || TRANSPARENT_DECAL_MATERIALS.has(matName);
    const castShadow = !isTransparent;

    const geo = child.geometry.clone();
    geo.applyMatrix4(toCarSpace);

    if (WHEEL_SPIN_MATERIALS.has(matName)) {
      const quads = splitGeometryByWheelQuadrant(geo);
      geo.dispose();
      for (const [qKey, subGeo] of Object.entries(quads)) {
        template.wheelParts[qKey].spin.push({
          geometry: subGeo,
          material,
          matName,
          castShadow: true,
        });
      }
      return;
    }

    if (WHEEL_BRAKE_MATERIALS.has(matName)) {
      const quads = splitGeometryByWheelQuadrant(geo);
      geo.dispose();
      for (const [qKey, subGeo] of Object.entries(quads)) {
        template.wheelParts[qKey].brake.push({
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
    template.bodyParts.push({
      geometry: geo,
      material,
      matName,
      castShadow,
    });
  });

  return template;
}

/**
 * Avvia in singleton il caricamento del file `2026_ferrari_sf-26.glb` nel browser.
 */
function ensureGlbTemplateLoaded() {
  if (glbTemplate) return Promise.resolve(glbTemplate);
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (glbLoadPromise) return glbLoadPromise;

  const glbUrl = new URL('../../2026_ferrari_sf-26.glb', import.meta.url).href;
  const loader = new GLTFLoader();

  glbLoadPromise = new Promise((resolve) => {
    loader.load(
      glbUrl,
      (gltf) => {
        glbTemplate = buildTemplateFromGltfScene(gltf.scene);
        for (const upgradeFn of pendingUpgrades) {
          upgradeFn(glbTemplate);
        }
        pendingUpgrades.clear();
        resolve(glbTemplate);
      },
      undefined,
      (err) => {
        console.warn('[CarModel3D] Errore caricamento GLB SF-26, uso modello fallback:', err);
        glbLoadPromise = null;
        resolve(null);
      }
    );
  });

  return glbLoadPromise;
}

/**
 * Crea un gruppo ruota composto da un pivot di sterzata (asse Y)
 * e un gruppo di rotazione di rotolamento (asse X).
 */
function createWheelAssembly(radius = 0.36, width = 0.34, isFront = true) {
  const steerPivot = new THREE.Group();
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

  steerPivot.add(spinGroup);
  return {
    steerPivot,
    spinGroup,
    isFront,
    baseY: radius,
  };
}

export function createF1CarMesh(options = {}) {
  const primaryColor = options.primaryColor ?? 0xdc0000;   // Colore scuderia
  const accentColor = options.accentColor ?? 0x111318;     // Carbonio / secondario
  const wingColor = options.wingColor ?? 0xf8fafc;         // Dettaglio ali
  const helmetColor = options.helmetColor ?? 0xfacc15;     // Casco pilota

  const appearanceState = {
    primaryColor,
    secondaryColor: accentColor,
    wingColor,
    helmetColor,
    roughness: null,
    metalness: null,
  };
  let isCockpitView = false;

  const root = new THREE.Group();
  root.name = 'F1CarRoot';

  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const primaryMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    roughness: 0.25,
    metalness: 0.35,
  });

  const carbonMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.55,
    metalness: 0.25,
  });

  const whiteAccentMat = new THREE.MeshStandardMaterial({
    color: wingColor,
    roughness: 0.3,
  });

  const helmetMat = new THREE.MeshStandardMaterial({
    color: helmetColor,
    roughness: 0.2,
    metalness: 0.3,
  });

  // 4 ruote (anteriori sterzanti + posteriori motrici)
  const wheelFL = createWheelAssembly(0.36, 0.32, true);
  wheelFL.steerPivot.position.set(0.86, 0.36, 1.48);

  const wheelFR = createWheelAssembly(0.36, 0.32, true);
  wheelFR.steerPivot.position.set(-0.86, 0.36, 1.48);

  const wheelRL = createWheelAssembly(0.36, 0.40, false);
  wheelRL.steerPivot.position.set(0.88, 0.36, -1.42);

  const wheelRR = createWheelAssembly(0.36, 0.40, false);
  wheelRR.steerPivot.position.set(-0.88, 0.36, -1.42);

  root.add(wheelFL.steerPivot, wheelFR.steerPivot, wheelRL.steerPivot, wheelRR.steerPivot);

  const wheels = {
    fl: wheelFL,
    fr: wheelFR,
    rl: wheelRL,
    rr: wheelRR,
  };

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

    // 4. Alettone anteriore (Front Wing + Endplates)
    const frontWingMain = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.06, 0.38), carbonMat);
    frontWingMain.position.set(0, 0.16, 2.38);
    frontWingMain.castShadow = true;
    bodyGroup.add(frontWingMain);

    const frontWingFlap = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.04, 0.22), whiteAccentMat);
    frontWingFlap.position.set(0, 0.21, 2.28);
    frontWingFlap.rotation.x = -0.18;
    bodyGroup.add(frontWingFlap);

    const fwEndplateGeo = new THREE.BoxGeometry(0.05, 0.24, 0.48);
    const fwEndplateLeft = new THREE.Mesh(fwEndplateGeo, primaryMat);
    fwEndplateLeft.position.set(0.94, 0.24, 2.35);
    const fwEndplateRight = new THREE.Mesh(fwEndplateGeo, primaryMat);
    fwEndplateRight.position.set(-0.94, 0.24, 2.35);
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
  };

  const applyAppearanceState = () => {
    const {
      primaryColor: nextPrimary,
      secondaryColor: nextSecondary,
      wingColor: nextWing,
      helmetColor: nextHelmet,
      roughness,
      metalness,
    } = appearanceState;

    if (nextPrimary !== undefined) primaryMat.color.set(nextPrimary);
    if (nextSecondary !== undefined) carbonMat.color.set(nextSecondary);
    if (nextWing !== undefined) whiteAccentMat.color.set(nextWing);
    if (nextHelmet !== undefined) helmetMat.color.set(nextHelmet);
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
      const mesh = new THREE.Mesh(part.geometry, resolveMaterial(part));
      mesh.castShadow = part.castShadow;
      mesh.receiveShadow = part.castShadow;
      bodyGroup.add(mesh);
    }

    steeringWheelGroup = new THREE.Group();
    steeringWheelGroup.position.set(
      STEERING_PIVOT[0],
      STEERING_PIVOT[1],
      STEERING_PIVOT[2]
    );
    for (const part of template.steeringParts) {
      const mesh = new THREE.Mesh(part.geometry, part.material);
      steeringWheelGroup.add(mesh);
    }
    bodyGroup.add(steeringWheelGroup);

    for (const qKey of ['fl', 'fr', 'rl', 'rr']) {
      const wheel = wheels[qKey];
      const [cx, cy, cz] = WHEEL_CENTERS[qKey];
      wheel.baseY = cy;
      wheel.steerPivot.position.set(cx, cy, cz);
      wheel.steerPivot.clear();
      wheel.spinGroup.clear();
      wheel.steerPivot.add(wheel.spinGroup);

      for (const part of template.wheelParts[qKey].spin) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        mesh.castShadow = part.castShadow;
        mesh.receiveShadow = true;
        wheel.spinGroup.add(mesh);
      }

      for (const part of template.wheelParts[qKey].brake) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        mesh.castShadow = false;
        wheel.steerPivot.add(mesh);
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

    applyAppearanceState();
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
    materials,
    wheels,
    setAppearance({
      primaryColor: nextPrimary,
      secondaryColor: nextSecondary,
      wingColor: nextWing,
      helmetColor: nextHelmet,
      roughness,
      metalness,
    } = {}) {
      if (nextPrimary !== undefined) appearanceState.primaryColor = nextPrimary;
      if (nextSecondary !== undefined) appearanceState.secondaryColor = nextSecondary;
      if (nextWing !== undefined) appearanceState.wingColor = nextWing;
      if (nextHelmet !== undefined) appearanceState.helmetColor = nextHelmet;
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
     * Sincronizza posizione, orientamento, sospensioni (pitch/roll/heave), volante e rotazione ruote
     * a partire dallo stato puro della simulazione.
     */
    syncFromState(carState) {
      root.position.set(carState.x, carState.y, carState.z);
      root.rotation.y = carState.heading;

      const susp = carState.suspension;
      if (susp) {
        bodyGroup.position.y = susp.heave ?? 0;
        bodyGroup.rotation.x = susp.pitch ?? 0;
        bodyGroup.rotation.z = susp.roll ?? 0;

        if (susp.wheelOffsetY) {
          wheelFL.steerPivot.position.y = wheelFL.baseY + susp.wheelOffsetY[0];
          wheelFR.steerPivot.position.y = wheelFR.baseY + susp.wheelOffsetY[1];
          wheelRL.steerPivot.position.y = wheelRL.baseY + susp.wheelOffsetY[2];
          wheelRR.steerPivot.position.y = wheelRR.baseY + susp.wheelOffsetY[3];
        }
      }

      steeringWheelGroup.rotation.z = -carState.steerAngle * 2.2;

      wheelFL.steerPivot.rotation.y = carState.steerAngle;
      wheelFR.steerPivot.rotation.y = carState.steerAngle;

      const frontRot = carState.frontWheelRotation ?? carState.wheelRotation;
      wheelFL.spinGroup.rotation.x = frontRot;
      wheelFR.spinGroup.rotation.x = frontRot;
      wheelRL.spinGroup.rotation.x = carState.wheelRotation;
      wheelRR.spinGroup.rotation.x = carState.wheelRotation;
    },
  };
}
