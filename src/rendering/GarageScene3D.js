/**
 * Showroom 3D del Garage F1 in Three.js (stile "Crazy Grand Prix"):
 * - Pareti blu in lamiera ondulata, travi scure, pavimento in cemento e pedana gialla/nera
 * - Cassettiere rosse degli attrezzi, pile di gomme, fusti d'olio, seconda monoposto sullo sfondo
 * - Pilota in tuta nera e casco nero lucido accanto alla monoposto principale personalizzabile
 * - Camere dedicate per vista principale (Race / Customize) e vista Vehicle / Upgrades + rotazione 360°
 */

import * as THREE from 'three';
import { createF1CarMesh } from '../cars/CarModel3D.js';

function createCorrugatedWallTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(x, 0, 8, 256);
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(x + 8, 0, 8, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x + 2, 0, 2, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 2);
  return tex;
}

function createConcreteFloorTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#525866';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const shade = 68 + Math.floor(Math.random() * 28);
    ctx.fillStyle = `rgba(${shade}, ${shade + 4}, ${shade + 10}, 0.35)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  }
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 254, 254);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  return tex;
}

function createHazardBorderTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eab308';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#18181b';
  for (let x = -64; x < 320; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 16, 0);
    ctx.lineTo(x + 40, 64);
    ctx.lineTo(x + 24, 64);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(6, 1);
  return tex;
}

function buildToolChest(width = 1.6, height = 1.15, depth = 0.72) {
  const grp = new THREE.Group();
  const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.38, metalness: 0.45 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.6, metalness: 0.5 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.85 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), redMat);
  body.position.y = height * 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  grp.add(body);

  const topTray = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.06, depth + 0.04), darkMat);
  topTray.position.y = height + 0.03;
  grp.add(topTray);

  // Maniglie cassetti
  for (let i = 0; i < 4; i++) {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(width * 0.82, 0.03, 0.04), chromeMat);
    handle.position.set(0, 0.22 + i * 0.22, depth * 0.5 + 0.02);
    grp.add(handle);
  }
  return grp;
}

function buildLeaningDriver() {
  const grp = new THREE.Group();
  const suitMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.65, metalness: 0.1 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.1, metalness: 0.9 });

  const legGeo = new THREE.CylinderGeometry(0.09, 0.075, 0.82, 10);
  const legL = new THREE.Mesh(legGeo, suitMat);
  legL.position.set(0.11, 0.41, 0);
  legL.castShadow = true;

  const legR = new THREE.Mesh(legGeo, suitMat);
  legR.position.set(-0.11, 0.42, 0.1);
  legR.rotation.x = -0.35;
  legR.castShadow = true;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.54, 0.22), suitMat);
  torso.position.set(0, 1.06, -0.02);
  torso.rotation.x = 0.08;
  torso.castShadow = true;

  const armGeo = new THREE.CylinderGeometry(0.065, 0.055, 0.52, 8);
  const armL = new THREE.Mesh(armGeo, suitMat);
  armL.position.set(0.24, 1.02, 0.04);
  armL.rotation.z = 0.22;

  const armR = new THREE.Mesh(armGeo, suitMat);
  armR.position.set(-0.24, 1.02, -0.02);
  armR.rotation.z = -0.18;

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 16), visorMat);
  helmet.position.set(0, 1.48, 0.01);
  helmet.castShadow = true;

  grp.add(legL, legR, torso, armL, armR, helmet);
  return grp;
}

export class GarageScene3D {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'GarageShowroom3D';
    this.group.visible = false;

    this.viewMode = 'main'; // 'main' | 'vehicle'
    this.autoRotate = false;
    this._orbitAngle = 0.65;
    this._camPos = new THREE.Vector3(5.1, 2.2, 5.2);
    this._camLook = new THREE.Vector3(0.2, 0.55, 0.15);

    this._buildEnvironment();
    this._buildShowcaseCarsAndDriver();
  }

  _buildEnvironment() {
    const floorTex = createConcreteFloorTexture();
    const wallTex = createCorrugatedWallTexture();
    const hazardTex = createHazardBorderTexture();

    // 1. Pavimento officina
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x71717a,
      map: floorTex,
      roughness: 0.72,
      metalness: 0.15,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 28), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // 2. Pedana centrale angolata gialla/nera + griglia metallica
    const padGroup = new THREE.Group();
    padGroup.rotation.y = -0.58;
    const outerHazard = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.03, 6.2),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: hazardTex,
        roughness: 0.55,
      })
    );
    outerHazard.position.y = 0.015;
    outerHazard.receiveShadow = true;

    const innerPad = new THREE.Mesh(
      new THREE.BoxGeometry(2.85, 0.04, 5.65),
      new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        roughness: 0.45,
        metalness: 0.65,
      })
    );
    innerPad.position.y = 0.022;
    innerPad.receiveShadow = true;
    padGroup.add(outerHazard, innerPad);
    this.padGroup = padGroup;
    this.group.add(padGroup);

    // 3. Pareti blu in lamiera ondulata e colonne acciaio
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      map: wallTex,
      roughness: 0.52,
      metalness: 0.35,
    });
    const beamMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.6,
      metalness: 0.6,
    });

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(34, 8.5, 0.3), wallMat);
    backWall.position.set(0, 4.25, -9.5);
    backWall.receiveShadow = true;

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 8.5, 28), wallMat);
    leftWall.position.set(-14.5, 4.25, 0);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 8.5, 28), wallMat);
    rightWall.position.set(14.5, 4.25, 0);

    const roof = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 28),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 })
    );
    roof.rotation.x = Math.PI / 2;
    roof.position.y = 8.4;

    this.group.add(backWall, leftWall, rightWall, roof);

    for (let x = -12; x <= 12; x += 6) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.36, 8.5, 0.42), beamMat);
      col.position.set(x, 4.25, -9.25);
      this.group.add(col);
    }

    // 4. Luci neon a soffitto & faretti garage
    const stripGeo = new THREE.BoxGeometry(2.8, 0.08, 0.22);
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    for (const [lx, lz] of [
      [-4, -3],
      [4, -3],
      [0, 1.5],
      [-5, 3],
    ]) {
      const tube = new THREE.Mesh(stripGeo, stripMat);
      tube.position.set(lx, 7.6, lz);
      this.group.add(tube);
    }

    const keySpot = new THREE.SpotLight(0xfffbeb, 55, 28, Math.PI / 4, 0.45, 1.2);
    keySpot.position.set(4.5, 7.2, 5.5);
    keySpot.castShadow = true;
    keySpot.shadow.mapSize.set(1024, 1024);
    this.group.add(keySpot, keySpot.target);

    const fillPoint = new THREE.PointLight(0xbfdbfe, 24, 26, 1.2);
    fillPoint.position.set(-5.5, 5.5, 3.5);
    this.group.add(fillPoint);

    const backPoint = new THREE.PointLight(0xffffff, 22, 24, 1.2);
    backPoint.position.set(0, 5.8, -5.5);
    this.group.add(backPoint);

    // 5. Arredi officina: cassettiere rosse, gomme e fusti
    const chestLeft = buildToolChest(1.6, 1.25, 0.72);
    chestLeft.position.set(-5.4, 0, -2.5);
    chestLeft.rotation.y = 0.55;

    const chestBack = buildToolChest(1.5, 1.15, 0.68);
    chestBack.position.set(-0.2, 0, -7.8);

    const chestRight = buildToolChest(2.8, 1.05, 0.75);
    chestRight.position.set(6.5, 0, -6.5);
    chestRight.rotation.y = -0.35;

    this.group.add(chestLeft, chestBack, chestRight);

    const drumMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.65 });
    const drumGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.92, 16);
    for (const [dx, dz] of [
      [-1.7, -8.3],
      [-2.4, -8.1],
      [8.6, -7.2],
    ]) {
      const drum = new THREE.Mesh(drumGeo, drumMat);
      drum.position.set(dx, 0.46, dz);
      drum.castShadow = true;
      this.group.add(drum);
    }

    const spareTireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85 });
    const spareTireGeo = new THREE.TorusGeometry(0.36, 0.16, 10, 20);
    for (let t = 0; t < 2; t++) {
      const tire = new THREE.Mesh(spareTireGeo, spareTireMat);
      tire.rotation.x = Math.PI / 2;
      tire.position.set(2.3, 0.16 + t * 0.32, -6.8);
      this.group.add(tire);
    }
  }

  _buildShowcaseCarsAndDriver() {
    // Monoposto principale sulla pedana
    this.mainCar = createF1CarMesh({
      primaryColor: '#dc0000',
      accentColor: '#111318',
      wingColor: '#f8fafc',
      helmetColor: '#18181b',
    });
    this.mainCar.root.position.set(0, 0.04, 0);
    this.mainCar.root.rotation.y = -0.58;
    // Casco nascosto in abitacolo perché il pilota è fuori in piedi accanto alla vettura
    this.mainCar.setCockpitView(true);
    this.group.add(this.mainCar.root);

    // Pilota in piedi accanto alla pancia laterale della vettura (come negli screenshot)
    this.driverFigure = buildLeaningDriver();
    this.driverFigure.position.set(-0.98, 0.04, -0.45);
    this.driverFigure.rotation.y = 0.55;
    this.group.add(this.driverFigure);

    // Seconda monoposto parcheggiata sullo sfondo a sinistra
    this.bgCar = createF1CarMesh({
      primaryColor: '#f1f5f9',
      accentColor: '#18181b',
      wingColor: '#0284c7',
      helmetColor: '#18181b',
    });
    this.bgCar.root.position.set(-7.6, 0, -5.8);
    this.bgCar.root.rotation.y = 1.15;
    this.bgCar.setCockpitView(true);
    this.group.add(this.bgCar.root);
  }

  updateAppearance(appearance = {}) {
    if (!this.mainCar) return;
    this.mainCar.setAppearance(appearance);
  }

  setViewMode(viewMode = 'main') {
    this.viewMode = viewMode === 'vehicle' ? 'vehicle' : 'main';
  }

  setAutoRotate(enabled) {
    this.autoRotate = Boolean(enabled);
  }

  toggleAutoRotate() {
    this.autoRotate = !this.autoRotate;
    return this.autoRotate;
  }

  updateCamera(camera, dt = 1 / 60) {
    if (!camera) return;

    let targetPos;
    let targetLook;

    if (this.autoRotate) {
      this._orbitAngle += dt * 0.55;
      const radius = 6.2;
      targetPos = new THREE.Vector3(
        Math.sin(this._orbitAngle) * radius,
        2.25,
        Math.cos(this._orbitAngle) * radius
      );
      targetLook = new THREE.Vector3(0, 0.52, 0);
    } else if (this.viewMode === 'vehicle') {
      // Inquadratura Screenshot 3: 3/4 anteriore lato opposto (spazio a sx per Paint, in alto per Upgrades, a dx per Liveries)
      targetPos = new THREE.Vector3(-4.5, 2.35, 4.9);
      targetLook = new THREE.Vector3(-0.1, 0.52, 0.25);
    } else {
      // Inquadratura Screenshot 1 & 2: 3/4 anteriore/laterale con pilota accanto
      targetPos = new THREE.Vector3(4.95, 2.05, 5.1);
      targetLook = new THREE.Vector3(-0.25, 0.52, -0.05);
    }

    const alpha = Math.min(1, dt * 6.5);
    this._camPos.lerp(targetPos, alpha);
    this._camLook.lerp(targetLook, alpha);

    camera.position.copy(this._camPos);
    camera.lookAt(this._camLook);
  }
}
