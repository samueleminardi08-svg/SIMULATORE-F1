/**
 * Showroom 3D Dark-Luxury F1 in Three.js (Step 1 — Restyling 4K):
 * - Pavimento scuro lucido con riflesso reale sotto la monoposto e cornice luminosa team/rosso
 * - Sfondo studio scuro architettonico con luce d'accento dinamica sul colore della scuderia scelta
 * - Camere dedicate per vista principale e vista Vehicle / Upgrades + rotazione 360°
 */

import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { createF1CarMesh } from '../cars/CarModel3D.js';

function createDarkStudioFloorTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#090c12';
  ctx.fillRect(0, 0, 512, 512);

  // Griglia tecnica sottilissima stile galleria del vento / paddock F1
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(225, 6, 0, 0.14)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 510, 510);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  tex.anisotropy = 8;
  return tex;
}

export class GarageScene3D {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'GarageShowroom3D';
    this.group.visible = false;

    this.viewMode = 'home'; // 'home' | 'team' | 'track' | 'vehicle' | 'main'
    this.autoRotate = false;
    this._orbitAngle = 0.68;
    this._orbitPitch = 0.26;
    this._orbitRadius = 5.85;
    this._userOrbitActive = false;
    this._camPos = new THREE.Vector3(5.0, 1.95, 5.15);
    this._camLook = new THREE.Vector3(-0.15, 0.52, 0.05);

    this._buildEnvironment();
    this._buildShowcaseCar();
  }

  _buildEnvironment() {
    const floorTex = createDarkStudioFloorTexture();

    // 1. Riflesso speculare reale sul pavimento scuro sotto la vettura
    if (typeof window !== 'undefined') {
      const mirrorGeo = new THREE.PlaneGeometry(36, 32);
      const mirror = new Reflector(mirrorGeo, {
        clipBias: 0.003,
        textureWidth: 1024,
        textureHeight: 1024,
        color: 0x3b4254,
      });
      mirror.rotation.x = -Math.PI / 2;
      mirror.position.y = 0.001;
      this.group.add(mirror);
    }

    // Pavimento scuro lucido semitrasparente sopra il reflector per riflesso morbido e profondo
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x090c12,
      map: floorTex,
      roughness: 0.14,
      metalness: 0.68,
      transparent: true,
      opacity: 0.82,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 36), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.004;
    floor.receiveShadow = true;
    this.group.add(floor);

    // 2. Pedana circolare scura satinata sotto la monoposto con solo anello esterno luminoso
    const padGroup = new THREE.Group();
    padGroup.rotation.y = -0.58;
    padGroup.position.y = 0.008;

    this.padBorderMat = new THREE.MeshStandardMaterial({
      color: 0xdc0000,
      emissive: 0xdc0000,
      emissiveIntensity: 0.75,
      roughness: 0.3,
      metalness: 0.5,
    });

    const borderFrameGeo = new THREE.RingGeometry(3.32, 3.39, 96);
    borderFrameGeo.rotateX(-Math.PI / 2);
    const borderRing = new THREE.Mesh(borderFrameGeo, this.padBorderMat);
    padGroup.add(borderRing);

    this.padGroup = padGroup;
    this.group.add(padGroup);

    // 3. Studio scuro senza pareti con giunzioni visibili: solo sfondo profondo e morbido
    const stripGeo = new THREE.BoxGeometry(4.2, 0.06, 0.24);
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    for (const [lx, lz] of [
      [-3.2, -1.8],
      [3.2, -1.8],
      [0, 1.4],
    ]) {
      const tube = new THREE.Mesh(stripGeo, stripMat);
      tube.position.set(lx, 7.2, lz);
      this.group.add(tube);
    }

    const keySpot = new THREE.SpotLight(0xfffbeb, 62, 32, Math.PI / 4, 0.65, 1.15);
    keySpot.position.set(4.5, 7.8, 5.2);
    keySpot.castShadow = true;
    keySpot.shadow.mapSize.set(1024, 1024);
    this.group.add(keySpot, keySpot.target);

    this.teamAccentSpot = new THREE.SpotLight(0xdc0000, 32, 26, Math.PI / 3.0, 0.75, 1.2);
    this.teamAccentSpot.position.set(-5.2, 5.6, -4.0);
    this.group.add(this.teamAccentSpot, this.teamAccentSpot.target);

    this.teamFillLight = new THREE.DirectionalLight(0xdc0000, 0.55);
    this.teamFillLight.position.set(0, 4.5, -6.0);
    this.group.add(this.teamFillLight);

    const rimLight = new THREE.DirectionalLight(0xe2e8f0, 0.95);
    rimLight.position.set(-4.8, 4.8, 4.6);
    this.group.add(rimLight);
  }

  _buildShowcaseCar() {
    this.mainCar = createF1CarMesh({
      primaryColor: '#dc0000',
      accentColor: '#111318',
      wingColor: '#f8fafc',
      helmetColor: '#18181b',
    });
    this.mainCar.root.position.set(0, 0.012, 0);
    this.mainCar.root.rotation.y = -0.58;
    this.mainCar.setCockpitView(true);
    this.group.add(this.mainCar.root);
  }

  updateAppearance(appearance = {}) {
    if (this.mainCar) {
      this.mainCar.setAppearance(appearance);
    }
    const accentHex = appearance?.primaryColor || '#dc0000';
    if (this.teamAccentSpot) {
      this.teamAccentSpot.color.set(accentHex);
    }
    if (this.teamFillLight) {
      this.teamFillLight.color.set(accentHex);
    }
    if (this.padBorderMat) {
      this.padBorderMat.color.set(accentHex);
      this.padBorderMat.emissive.set(accentHex);
    }
  }

  setViewMode(viewMode = 'home') {
    const allowed = new Set(['home', 'main', 'team', 'track', 'vehicle']);
    const nextMode = allowed.has(viewMode) ? viewMode : 'home';
    if (this.viewMode !== nextMode) {
      this._userOrbitActive = false;
      if (nextMode === 'team') {
        this._orbitAngle = 0.64;
        this._orbitPitch = 0.24;
        this._orbitRadius = 5.75;
      }
    }
    this.viewMode = nextMode;
  }

  rotateOrbit(deltaYaw = 0, deltaPitch = 0) {
    this._userOrbitActive = true;
    this._orbitAngle -= deltaYaw;
    this._orbitPitch = Math.max(0.12, Math.min(1.02, this._orbitPitch + deltaPitch));
  }

  zoomOrbit(deltaZoom = 0) {
    this._userOrbitActive = true;
    this._orbitRadius = Math.max(3.6, Math.min(9.5, this._orbitRadius + deltaZoom));
  }

  resetOrbit() {
    this._userOrbitActive = false;
    this._orbitAngle = 0.64;
    this._orbitPitch = 0.24;
    this._orbitRadius = 5.75;
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
      this._orbitAngle += dt * 0.45;
      const cosPitch = Math.cos(this._orbitPitch);
      targetPos = new THREE.Vector3(
        Math.sin(this._orbitAngle) * cosPitch * this._orbitRadius,
        Math.sin(this._orbitPitch) * this._orbitRadius + 0.35,
        Math.cos(this._orbitAngle) * cosPitch * this._orbitRadius
      );
      targetLook = new THREE.Vector3(0, 0.42, 0);
    } else if (this._userOrbitActive || this.viewMode === 'team') {
      const cosPitch = Math.cos(this._orbitPitch);
      targetPos = new THREE.Vector3(
        Math.sin(this._orbitAngle) * cosPitch * this._orbitRadius,
        Math.sin(this._orbitPitch) * this._orbitRadius + 0.32,
        Math.cos(this._orbitAngle) * cosPitch * this._orbitRadius
      );
      targetLook = new THREE.Vector3(0, 0.25, 0);
    } else if (this.viewMode === 'vehicle') {
      targetPos = new THREE.Vector3(-4.5, 2.25, 4.9);
      targetLook = new THREE.Vector3(-0.1, 0.52, 0.25);
    } else {
      targetPos = new THREE.Vector3(4.95, 1.98, 5.1);
      targetLook = new THREE.Vector3(-0.18, 0.5, 0.02);
    }

    const alpha = Math.min(1, dt * 6.5);
    this._camPos.lerp(targetPos, alpha);
    this._camLook.lerp(targetLook, alpha);

    camera.position.copy(this._camPos);
    camera.lookAt(this._camLook);
  }
}
