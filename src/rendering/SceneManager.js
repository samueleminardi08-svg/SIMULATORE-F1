/**
 * Gestore del Rendering 3D (Presentation Layer — Step 5).
 * Legge lo stato da WorldState senza mai modificarlo e aggiorna le mesh Three.js,
 * gli effetti atmosferici (pioggia + asfalto bagnato) e il fumo/spray gomme.
 */

import * as THREE from 'three';
import { buildTrackMeshGroup } from '../tracks/TrackBuilder.js';
import { createF1CarMesh } from '../cars/CarModel3D.js';
import { CameraController } from './CameraController.js';
import { GarageScene3D } from './GarageScene3D.js';

export class SceneManager {
  constructor(canvas, trackData) {
    this.canvas = canvas;
    this.trackData = trackData;
    /** @type {Map<string, ReturnType<typeof createF1CarMesh>>} */
    this.carMeshes = new Map();
    this._currentWeather = 'dry';
    this._previewWeather = null;
    this.isGarageMode = true;
    this._garageViewMode = 'home';
    this._trackOrbitAngle = 0.45;
    this._trackCamPos = new THREE.Vector3(240, 140, 240);
    this._trackCamLook = new THREE.Vector3(0, 0, 0);
    this._lastRenderMs = performance.now();

    // 1. Renderer WebGL
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 2. Scena 3D, cielo e nebbia atmosferica
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b8e8);
    this.scene.fog = new THREE.FogExp2(0x87b8e8, 0.00045);

    // 3. Camera pista (3 visuali: Chase, Abitacolo, Onboard T-Cam) e camera menù completamente isolata
    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.1,
      6500
    );
    this.menuCamera = new THREE.PerspectiveCamera(
      58,
      window.innerWidth / window.innerHeight,
      0.1,
      6500
    );
    this.cameraController = new CameraController(this.camera);

    // 4. Illuminazione
    this._setupLights();

    // 5. Costruzione pista 3D
    const builtTrack = buildTrackMeshGroup(this.trackData);
    this.trackGroup = builtTrack.group;
    this.trackSurface = builtTrack.trackSurface;
    this.asphaltMaterial = builtTrack.asphaltMaterial;
    this.scene.add(this.trackGroup);

    // 6. Effetti atmosferici & Showroom Garage 3D
    this._setupRainParticles();
    this._setupTireParticlePool();
    this.garageScene = new GarageScene3D();
    this.scene.add(this.garageScene.group);

    // 7. Gestione resize finestra
    this._onResize = () => {
      const aspect = window.innerWidth / window.innerHeight;
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
      this.menuCamera.aspect = aspect;
      this.menuCamera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this._onResize);
  }

  _setupLights() {
    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x3f6212, 0.85);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.55);
    this.sunLight.position.set(120, 180, 90);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 450;
    const d = 120;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
  }

  _setupRainParticles() {
    const rainCount = 1200;
    const positions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 90;
      positions[i * 3 + 1] = Math.random() * 35;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0xcbd5e1,
      size: 0.24,
      transparent: true,
      opacity: 0.65,
    });
    this._rainPoints = new THREE.Points(rainGeo, rainMat);
    this._rainPoints.visible = false;
    this._rainPoints.frustumCulled = false;
    this.scene.add(this._rainPoints);
  }

  _setupTireParticlePool() {
    this._particles = [];
    const puffGeo = new THREE.SphereGeometry(0.28, 6, 6);
    for (let i = 0; i < 42; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xf1f5f9,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(puffGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this._particles.push({
        mesh,
        mat,
        life: 0,
        maxLife: 0.4,
        vx: 0,
        vy: 0,
        vz: 0,
      });
    }
    this._particleCursor = 0;
  }

  _emitTireParticle(x, y, z, vx, vy, vz, colorHex, maxLife = 0.42) {
    const p = this._particles[this._particleCursor];
    this._particleCursor = (this._particleCursor + 1) % this._particles.length;

    p.mesh.position.set(x, y, z);
    p.mesh.scale.setScalar(0.8);
    p.mat.color.setHex(colorHex);
    p.mat.opacity = 0.55;
    p.mesh.visible = true;
    p.life = maxLife;
    p.maxLife = maxLife;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
  }

  _updateWeatherVisuals(weatherId) {
    if (weatherId === this._currentWeather) return;
    this._currentWeather = weatherId;

    const isRain = weatherId === 'rain';
    const skyColor = isRain ? 0x475569 : 0x87b8e8;
    const fogDensity = isRain ? 0.00125 : 0.00045;

    this.scene.background.setHex(skyColor);
    this.scene.fog.color.setHex(skyColor);
    this.scene.fog.density = fogDensity;

    this.sunLight.intensity = isRain ? 0.72 : 1.55;
    this.hemiLight.intensity = isRain ? 0.65 : 0.85;

    if (this.asphaltMaterial) {
      this.asphaltMaterial.roughness = isRain ? 0.22 : 0.85;
      this.asphaltMaterial.metalness = isRain ? 0.42 : 0.05;
    }

    if (this._rainPoints) {
      this._rainPoints.visible = isRain;
    }
  }

  _updateParticles(activeCar, weatherId, dt) {
    // 1. Pioggia 3D centrata attorno alla vettura attiva
    if (this._rainPoints && this._rainPoints.visible && activeCar) {
      this._rainPoints.position.set(activeCar.x, 0, activeCar.z);
      const posAttr = this._rainPoints.geometry.getAttribute('position');
      const arr = posAttr.array;
      const fallDist = 36 * dt;
      for (let i = 1; i < arr.length; i += 3) {
        arr[i] -= fallDist;
        if (arr[i] < 0) arr[i] += 35;
      }
      posAttr.needsUpdate = true;
    }

    // 2. Emissione fumo da bloccaggio gomme anteriori / spray d'acqua posteriore
    if (activeCar) {
      const sinH = Math.sin(activeCar.heading);
      const cosH = Math.cos(activeCar.heading);
      const leftX = cosH;
      const leftZ = -sinH;

      if (activeCar.aeroTire?.wheelLockup) {
        for (const side of [0.85, -0.85]) {
          const wx = activeCar.x + sinH * 1.48 + leftX * side;
          const wz = activeCar.z + cosH * 1.48 + leftZ * side;
          this._emitTireParticle(
            wx,
            0.25,
            wz,
            (Math.random() - 0.5) * 1.5,
            1.2 + Math.random() * 0.8,
            (Math.random() - 0.5) * 1.5,
            0xf8fafc,
            0.45
          );
        }
      } else if (weatherId === 'rain' && Math.abs(activeCar.forwardSpeed) > 18) {
        const rx = activeCar.x - sinH * 2.1;
        const rz = activeCar.z - cosH * 2.1;
        this._emitTireParticle(
          rx + (Math.random() - 0.5) * 0.9,
          0.35,
          rz + (Math.random() - 0.5) * 0.9,
          -sinH * 4 + (Math.random() - 0.5) * 1.5,
          1.6 + Math.random() * 1.1,
          -cosH * 4 + (Math.random() - 0.5) * 1.5,
          0xcbd5e1,
          0.36
        );
      }
    }

    // 3. Aggiornamento vita e dissolvenza particelle
    for (const p of this._particles) {
      if (!p.mesh.visible) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      const ageRatio = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(0.8 + ageRatio * 2.1);
      p.mat.opacity = 0.52 * (1 - ageRatio);
    }
  }

  cycleCameraMode() {
    return this.cameraController.cycleMode();
  }

  getCameraMode() {
    return this.cameraController.getCurrentMode();
  }

  setGarageMode(isOpen, appearance = null, viewMode = 'home') {
    this.isGarageMode = Boolean(isOpen);
    this._garageViewMode = viewMode || 'home';
    const isTrackPreview = this.isGarageMode && this._garageViewMode === 'track';

    this.garageScene.group.visible = this.isGarageMode && !isTrackPreview;
    this.trackGroup.visible = !this.isGarageMode || isTrackPreview;

    if (appearance) {
      this.garageScene.updateAppearance(appearance);
    }
    if (viewMode) {
      this.garageScene.setViewMode(this._garageViewMode);
    }

    if (isTrackPreview) {
      this._currentWeather = null;
      this._updateWeatherVisuals(this._previewWeather || this._lastRenderedWeather || 'dry');
      if (this._rainPoints) this._rainPoints.visible = false;
      for (const carModel of this.carMeshes.values()) {
        carModel.root.visible = false;
      }
    } else if (this.isGarageMode) {
      this.scene.background.setHex(0x07090e);
      this.scene.fog.color.setHex(0x07090e);
      this.scene.fog.density = 0.022;
      this.sunLight.intensity = 0.65;
      this.hemiLight.intensity = 0.85;
      if (this._rainPoints) this._rainPoints.visible = false;
      for (const carModel of this.carMeshes.values()) {
        carModel.root.visible = false;
      }
    } else {
      this._currentWeather = null;
      this._updateWeatherVisuals(this._lastRenderedWeather || 'dry');
      for (const carModel of this.carMeshes.values()) {
        carModel.root.visible = true;
      }
    }
  }

  rotateGarageOrbit(deltaYaw = 0, deltaPitch = 0) {
    this.garageScene.rotateOrbit(deltaYaw, deltaPitch);
  }

  zoomGarageOrbit(deltaZoom = 0) {
    this.garageScene.zoomOrbit(deltaZoom);
  }

  setWeatherPreview(weatherId = 'dry') {
    this._previewWeather = weatherId === 'rain' ? 'rain' : 'dry';
    if (this.isGarageMode && this._garageViewMode === 'track') {
      this._currentWeather = null;
      this._updateWeatherVisuals(this._previewWeather);
      if (this._rainPoints) this._rainPoints.visible = false;
    }
  }

  toggleGarageCameraRotate() {
    return this.garageScene.toggleAutoRotate();
  }

  resetGarageOrbit() {
    this.garageScene.resetOrbit();
  }

  setTrack(trackData) {
    if (!trackData || (this.trackData?.id === trackData.id && this.trackGroup)) {
      return;
    }

    if (this.trackGroup) {
      this.scene.remove(this.trackGroup);
      const disposed = new Set();
      this.trackGroup.traverse((obj) => {
        if (obj.geometry && !disposed.has(obj.geometry)) {
          disposed.add(obj.geometry);
          obj.geometry.dispose();
        }
        const mats = Array.isArray(obj.material)
          ? obj.material
          : obj.material
            ? [obj.material]
            : [];
        for (const mat of mats) {
          if (mat.map && !disposed.has(mat.map)) {
            disposed.add(mat.map);
            mat.map.dispose();
          }
          if (!disposed.has(mat)) {
            disposed.add(mat);
            mat.dispose();
          }
        }
      });
    }

    this.trackData = trackData;
    const builtTrack = buildTrackMeshGroup(this.trackData);
    this.trackGroup = builtTrack.group;
    this.trackSurface = builtTrack.trackSurface;
    this.asphaltMaterial = builtTrack.asphaltMaterial;
    const isTrackPreview = this.isGarageMode && this._garageViewMode === 'track';
    this.trackGroup.visible = !this.isGarageMode || isTrackPreview;
    this.scene.add(this.trackGroup);

    this._currentWeather = null;
    if (!this.isGarageMode || isTrackPreview) {
      this._updateWeatherVisuals(
        isTrackPreview
          ? this._previewWeather || this._lastRenderedWeather || 'dry'
          : this._lastRenderedWeather || 'dry'
      );
      if (isTrackPreview && this._rainPoints) this._rainPoints.visible = false;
    }
  }

  /**
   * Sincronizza tutte le vetture presenti in WorldState, meteo, particelle e camera.
   * @param {import('../core/WorldState.js').WorldState} worldState
   * @param {string} followedCarId
   */
  render(worldState, followedCarId) {
    const nowMs = performance.now();
    const renderDt = Math.min(0.05, Math.max(0.001, (nowMs - this._lastRenderMs) / 1000));
    this._lastRenderMs = nowMs;
    if (!this.isGarageMode) {
      this._lastRenderedWeather = worldState.weather || 'dry';
    }

    if (this.isGarageMode) {
      if (this._garageViewMode === 'track') {
        this.garageScene.group.visible = false;
        this.trackGroup.visible = true;
        const b = this.trackSurface?.bounds || {
          minX: -400,
          maxX: 400,
          minY: 0,
          maxY: 10,
          minZ: -400,
          maxZ: 400,
        };
        const cx = (b.minX + b.maxX) * 0.5;
        const cy = (b.minY + b.maxY) * 0.5;
        const cz = (b.minZ + b.maxZ) * 0.5;
        const span = Math.max(250, b.maxX - b.minX, b.maxZ - b.minZ);
        const orbitRadius = Math.max(260, Math.min(920, span * 0.42));
        const camHeight = Math.max(115, Math.min(340, span * 0.165));

        this._trackOrbitAngle += renderDt * 0.08;
        const targetPos = new THREE.Vector3(
          cx + Math.cos(this._trackOrbitAngle) * orbitRadius,
          cy + camHeight,
          cz + Math.sin(this._trackOrbitAngle) * orbitRadius
        );
        const targetLook = new THREE.Vector3(cx, cy + 4, cz);
        const lerpAlpha = Math.min(1, renderDt * 3.5);
        this._trackCamPos.lerp(targetPos, lerpAlpha);
        this._trackCamLook.lerp(targetLook, lerpAlpha);
        this.menuCamera.up.set(0, 1, 0);
        if (this.menuCamera.fov !== 60) {
          this.menuCamera.fov = 60;
          this.menuCamera.updateProjectionMatrix();
        }
        this.menuCamera.position.copy(this._trackCamPos);
        this.menuCamera.lookAt(this._trackCamLook);

        this.sunLight.position.set(cx + 220, 320, cz + 160);
        this.sunLight.target.position.set(cx, cy, cz);
        this.renderer.render(this.scene, this.menuCamera);
        return;
      }

      this.garageScene.group.visible = true;
      this.trackGroup.visible = false;
      this.garageScene.updateCamera(this.menuCamera, renderDt);
      this.renderer.render(this.scene, this.menuCamera);
      return;
    }

    this.garageScene.group.visible = false;
    this.trackGroup.visible = true;
    this._updateWeatherVisuals(worldState.weather || 'dry');

    for (const [carId, carState] of Object.entries(worldState.cars)) {
      let carModel = this.carMeshes.get(carId);
      if (carModel && carModel._primaryColor !== carState.color) {
        this.scene.remove(carModel.root);
        this.carMeshes.delete(carId);
        carModel = null;
      }
      if (!carModel) {
        carModel = createF1CarMesh({
          primaryColor: carState.color,
          accentColor: carState.secondaryColor,
          wingColor: carState.wingColor,
          helmetColor: carState.helmetColor,
        });
        carModel._primaryColor = carState.color;
        this.carMeshes.set(carId, carModel);
        this.scene.add(carModel.root);
      }
      carModel.root.visible = true;
      carModel.setAppearance({
        roughness: carState.paintRoughness ?? 0.25,
        metalness: carState.paintMetalness ?? 0.35,
      });
      carModel.syncFromState(carState);
    }

    // Rimuove eventuali mesh di vetture non più presenti in WorldState
    for (const [carId, carModel] of this.carMeshes.entries()) {
      if (!worldState.cars[carId]) {
        this.scene.remove(carModel.root);
        this.carMeshes.delete(carId);
      }
    }

    const activeCar = worldState.getCar(followedCarId);
    if (activeCar) {
      this.sunLight.position.set(activeCar.x + 120, 180, activeCar.z + 90);
      this.sunLight.target.position.set(activeCar.x, 0, activeCar.z);
      this.cameraController.update(activeCar, this.carMeshes.get(followedCarId));
    }

    this._updateParticles(activeCar, worldState.weather || 'dry', renderDt);

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
