/**
 * Gestore del Rendering 3D (Presentation Layer — Step 5).
 * Legge lo stato da WorldState senza mai modificarlo e aggiorna le mesh Three.js,
 * gli effetti atmosferici (pioggia + asfalto bagnato) e il fumo/spray gomme.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildTrackMeshGroup } from '../tracks/TrackBuilder.js';
import { getTrackBiomeConfig } from '../tracks/TrackBiomes.js';
import { TrackFloodlights } from '../tracks/TrackFloodlights.js';
import { createF1CarMesh } from '../cars/CarModel3D.js';
import { assetManager3D } from './AssetManager3D.js';
import { CameraController } from './CameraController.js';
import { GarageScene3D } from './GarageScene3D.js';
import { DaySkyDome } from './DaySkyDome.js';
import { NightSky } from './NightSky.js';
import { PitGuideOverlay3D } from './PitGuideOverlay3D.js';
import { PitStopAnimator3D } from './PitStopAnimator3D.js';
import { WeatherAndTireFx } from './WeatherAndTireFx.js';
import {
  AUTO_QUALITY_FALLBACK,
  DEFAULT_NIGHT_QUALITY,
  NIGHT_SKY_PARAMS,
  getLowerNightQuality,
  getNightCircuitProfile,
  getNightQualityConfig,
  loadSavedNightQuality,
} from './NightLightingConfig.js';
import {
  DEFAULT_SKY_PRESET_OPTION,
  PURE_SKY_HDR_SUN_HEADING_RAD,
  SKY_PRESETS,
  getSkyPresetById,
  loadSavedSkyPresetOption,
  resolveSkyPreset,
} from './SkyPresets.js';

/**
 * Parametri centralizzati di coesione visiva e fotorealismo (esposti per fine-tuning):
 * ombre dinamiche strette, bilanciamento PBR, nebbia atmosferica, bloom leggero e ACES exposure.
 */
export const SCENE_VISUAL_CONFIG = {
  shadow: {
    frustumHalfSize: 35,     // ±35m stretto attorno alla monoposto del giocatore
    overviewFrustumSize: 165,// frustum più ampio solo nella panoramica Track Select
    mapSize: 2048,           // 2048×2048 nitido con PCFSoftShadowMap
    bias: -0.0004,
    normalBias: 0.02,
    lightDistance: 120,
    near: 10,
    far: 320,
  },
  pbrEnvIntensity: {
    car: 0.74,
    trackHard: 0.18,         // asfalto / cordoli / barriere opachi e realistici
    nature: 0.22,            // terreno / alberi / natura
  },
  fog: {
    dryDensity: 0.00050,
    rainDensity: 0.00092,
    nightDensity: 0.00062,
    nightRainDensity: 0.00118,
  },
  postProcessing: {
    enabled: true,
    maxPixelRatio: 1.5,
    dayBloom: {
      threshold: 0.94,
      strength: 0.16,
      radius: 0.30,
      resolutionScale: 0.5,
    },
    exposureDry: 0.90,
    exposureWarm: 0.88,
    exposureRain: 0.86,
    exposureNight: 0.92,
    vignetteOpacity: 0.13,
  },
};

export class SceneManager {
  constructor(canvas, trackData, options = {}) {
    this.canvas = canvas;
    this.trackData = trackData;
    /** @type {Map<string, ReturnType<typeof createF1CarMesh>>} */
    this.carMeshes = new Map();
    this._currentWeather = null;
    this._previewWeather = null;
    this._envRequestId = 0;
    this._activeEnvKey = null;
    this.isGarageMode = true;
    this._garageViewMode = 'home';
    this._trackOrbitAngle = 0.45;
    this._trackCamPos = new THREE.Vector3(240, 140, 240);
    this._trackCamLook = new THREE.Vector3(0, 0, 0);
    this._tmpTrackTargetPos = new THREE.Vector3();
    this._tmpTrackTargetLook = new THREE.Vector3();
    this._lastRenderMs = performance.now();

    // Stato grafica notturna & preset cielo HDRI (qualità Bassa/Media/Alta + cieli Pure Skies 2K)
    this.nightQuality = getNightQualityConfig(
      options.nightQuality || loadSavedNightQuality() || DEFAULT_NIGHT_QUALITY
    ).id;
    this._requestedSkyPreset =
      options.skyPreset || loadSavedSkyPresetOption() || DEFAULT_SKY_PRESET_OPTION;
    this._activeSkyPreset = SKY_PRESETS.clear_day;
    this._sunDir = new THREE.Vector3(0.45, 0.72, 0.52).normalize();
    this._skyRotationY = 0;
    this.onNightQualityAutoFallback =
      typeof options.onNightQualityAutoFallback === 'function'
        ? options.onNightQualityAutoFallback
        : null;
    this._isNightActive = false;
    this._nightElapsedSec = 0;
    this._nightComposer = null;
    this._nightComposerLoading = false;
    this._nightRenderTarget = null;
    this._nightRenderPass = null;
    this._nightBloomPass = null;
    this._nightOutputPass = null;
    this._floodlightFocusVec = new THREE.Vector3();
    this._nightFallbackState = {
      warmupSec: 0,
      lowFpsSec: 0,
      emaFps: 60,
    };

    // 1. Renderer WebGL (PBR + ACES Filmic Tone Mapping + SRGBColorSpace + pixelRatio capped a 1.5)
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, SCENE_VISUAL_CONFIG.postProcessing.maxPixelRatio)
    );
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = SCENE_VISUAL_CONFIG.postProcessing.exposureDry;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this._currentShadowFrustum = SCENE_VISUAL_CONFIG.shadow.frustumHalfSize;

    // 2. Scena 3D, cielo e nebbia atmosferica
    this.scene = new THREE.Scene();
    this._bgColor = new THREE.Color(0x07090e);
    this.scene.background = this._bgColor;
    this.scene.fog = new THREE.FogExp2(0x07090e, 0.022);

    // 3. Camera pista (2 visuali: Onboard T-Cam e Prima Persona Abitacolo) e camera menù isolata
    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.035,
      6500
    );
    this.menuCamera = new THREE.PerspectiveCamera(
      58,
      window.innerWidth / window.innerHeight,
      0.1,
      6500
    );
    this.cameraController = new CameraController(this.camera, options.defaultCameraMode || null);

    // 4. Illuminazione & Cupole Celesti (Diurna HDRI 2K con grading + Notturna procedurale)
    this._setupLights();
    this.daySkyDome = new DaySkyDome();
    this.daySkyDome.group.visible = false;
    this.scene.add(this.daySkyDome.group);
    this.nightSky = new NightSky();
    this.nightSky.group.visible = false;
    this.nightSky.setPixelRatio(this.renderer.getPixelRatio());
    this.scene.add(this.nightSky.group);

    // 5. Costruzione pista 3D (con PBR 2K per bioma) + torri faro notturne FIA
    const builtTrack = buildTrackMeshGroup(this.trackData);
    this.trackGroup = builtTrack.group;
    this.trackSurface = builtTrack.trackSurface;
    this.asphaltMaterial = builtTrack.asphaltMaterial;
    this.pitAsphaltMaterial = builtTrack.pitAsphaltMaterial || null;
    this.kerbMaterial = builtTrack.kerbMaterial || null;
    this.edgeLineMaterial = builtTrack.edgeLineMaterial || null;
    this.biomeConfig = builtTrack.biome || getTrackBiomeConfig(this.trackData);
    this._disposeTrackPbr = builtTrack.disposePbr || null;
    this.scene.add(this.trackGroup);

    this.pitGuide = new PitGuideOverlay3D();
    this.pitGuide.setTrackSurface(this.trackSurface);
    this.scene.add(this.pitGuide.group);

    this.pitStopAnimator = new PitStopAnimator3D();
    this.scene.add(this.pitStopAnimator.group);

    this.floodlights = null;
    this._syncTrackFloodlights();

    // 6. Effetti atmosferici & Showroom Garage 3D
    this.weatherFx = new WeatherAndTireFx();
    this.weatherFx.setVisible(false);
    this.scene.add(this.weatherFx.group);
    this.garageScene = new GarageScene3D();
    this.scene.add(this.garageScene.group);
    this._recoveryMarker = this._createRecoveryLandingMarker();
    this.scene.add(this._recoveryMarker.group);
    this._applyStudioEnvironment();

    // 7. Gestione resize finestra (aggiorna pixelRatio cap 1.5, camere, renderer e EffectComposer)
    this._onResize = () => {
      const aspect = window.innerWidth / window.innerHeight;
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
      this.menuCamera.aspect = aspect;
      this.menuCamera.updateProjectionMatrix();
      this.renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, SCENE_VISUAL_CONFIG.postProcessing.maxPixelRatio)
      );
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.nightSky?.setPixelRatio(this.renderer.getPixelRatio());
      this._resizeNightComposer();
    };
    window.addEventListener('resize', this._onResize);
  }

  _createRecoveryLandingMarker() {
    const group = new THREE.Group();
    group.visible = false;

    const ringGeo = new THREE.RingGeometry(1.75, 2.15, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    group.add(ringMesh);

    const innerGeo = new THREE.RingGeometry(0.95, 1.15, 36);
    innerGeo.rotateX(-Math.PI / 2);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.position.y = 0.01;
    group.add(innerMesh);

    // Due chevron direzionali orientati lungo +Z locale (= heading della pista)
    const chevShape = new THREE.Shape();
    chevShape.moveTo(0, 0.52);
    chevShape.lineTo(0.62, -0.22);
    chevShape.lineTo(0.40, -0.22);
    chevShape.lineTo(0, 0.24);
    chevShape.lineTo(-0.40, -0.22);
    chevShape.lineTo(-0.62, -0.22);
    chevShape.closePath();
    const chevGeo = new THREE.ShapeGeometry(chevShape);
    chevGeo.rotateX(-Math.PI / 2);
    const chevMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const chevFront = new THREE.Mesh(chevGeo, chevMat);
    chevFront.position.set(0, 0.02, 1.35);
    const chevRear = new THREE.Mesh(chevGeo, chevMat);
    chevRear.position.set(0, 0.02, 0.35);
    group.add(chevFront, chevRear);

    return {
      group,
      ringGeo,
      innerGeo,
      chevGeo,
      ringMat,
      innerMat,
      chevMat,
      innerMesh,
    };
  }

  _updateRecoveryMarker(activeCar) {
    const marker = this._recoveryMarker;
    if (!marker) return;
    const anim = activeCar?.trackRecoveryAnim || null;
    if (!anim) {
      marker.group.visible = false;
      return;
    }
    const u = Math.max(0, Math.min(1, anim.progress ?? 0));
    const pulse = Math.sin(Math.PI * u);
    marker.group.visible = true;
    marker.group.position.set(anim.targetX, (anim.targetY ?? 0) + 0.05, anim.targetZ);
    marker.group.rotation.y = anim.targetHeading ?? 0;
    const scale = 1.24 - 0.30 * u;
    marker.group.scale.set(scale, 1, scale);
    marker.innerMesh.rotation.y = u * Math.PI * 1.5;
    marker.ringMat.opacity = 0.85 * pulse;
    marker.innerMat.opacity = 0.65 * pulse;
    marker.chevMat.opacity = 0.90 * pulse;
  }

  _setShadowFrustumHalfSize(halfSize) {
    if (!this.sunLight?.shadow?.camera || this._currentShadowFrustum === halfSize) return;
    this._currentShadowFrustum = halfSize;
    const cam = this.sunLight.shadow.camera;
    cam.left = -halfSize;
    cam.right = halfSize;
    cam.top = halfSize;
    cam.bottom = -halfSize;
    cam.far = halfSize > 80 ? 520 : SCENE_VISUAL_CONFIG.shadow.far;
    cam.updateProjectionMatrix();
  }

  _setupLights() {
    const sh = SCENE_VISUAL_CONFIG.shadow;
    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x3f6212, 0.72);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.85);
    this.sunLight.position.set(80, 110, 60);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = sh.mapSize;
    this.sunLight.shadow.mapSize.height = sh.mapSize;
    this.sunLight.shadow.camera.near = sh.near;
    this.sunLight.shadow.camera.far = sh.far;
    const d = sh.frustumHalfSize;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = sh.bias;
    this.sunLight.shadow.normalBias = sh.normalBias;
    this.sunLight.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Luce lunare direzionale morbida (attiva solo sui circuiti notturni, zero shadow map)
    this.moonLight = new THREE.DirectionalLight(
      NIGHT_SKY_PARAMS.moonLightColor,
      NIGHT_SKY_PARAMS.moonLightIntensity
    );
    this.moonLight.castShadow = false;
    this.moonLight.visible = false;
    this.scene.add(this.moonLight);
    this.scene.add(this.moonLight.target);
  }

  _syncTrackFloodlights() {
    if (this.floodlights) {
      this.scene.remove(this.floodlights.group);
      this.floodlights.dispose();
      this.floodlights = null;
    }

    if (this.biomeConfig?.isNight && this.trackSurface) {
      this.floodlights = new TrackFloodlights(
        this.trackSurface,
        this.trackData?.id,
        this.nightQuality
      );
      const isTrackPreview = this.isGarageMode && this._garageViewMode === 'track';
      this.floodlights.group.visible = !this.isGarageMode || isTrackPreview;
      this.scene.add(this.floodlights.group);
    }
  }

  _ensureNightComposer() {
    if (this._nightComposer) return this._nightComposer;

    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const pr = this.renderer.getPixelRatio();
    const dayBloom = SCENE_VISUAL_CONFIG.postProcessing.dayBloom;

    const desiredSamples = this.renderer.capabilities.isWebGL2 ? 2 : 0;
    this._nightRenderTarget = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(width * pr)),
      Math.max(1, Math.floor(height * pr)),
      {
        type: THREE.HalfFloatType,
        samples: desiredSamples,
      }
    );

    const composer = new EffectComposer(this.renderer, this._nightRenderTarget);
    composer.setPixelRatio(pr);
    composer.setSize(width, height);

    this._nightRenderPass = new RenderPass(this.scene, this.camera);
    const bloomW = Math.max(1, Math.floor(width * dayBloom.resolutionScale));
    const bloomH = Math.max(1, Math.floor(height * dayBloom.resolutionScale));
    this._nightBloomPass = new UnrealBloomPass(
      new THREE.Vector2(bloomW, bloomH),
      dayBloom.strength,
      dayBloom.radius,
      dayBloom.threshold
    );
    this._nightOutputPass = new OutputPass();

    composer.addPass(this._nightRenderPass);
    composer.addPass(this._nightBloomPass);
    composer.addPass(this._nightOutputPass);

    this._nightComposer = composer;
    this._applyBloomQualitySettings();
    return composer;
  }

  _resizeNightComposer() {
    if (!this._nightComposer) return;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const pr = this.renderer.getPixelRatio();
    const resScale = this._isNightActive
      ? getNightQualityConfig(this.nightQuality).bloomResolutionScale
      : SCENE_VISUAL_CONFIG.postProcessing.dayBloom.resolutionScale;

    this._nightComposer.setPixelRatio(pr);
    this._nightComposer.setSize(width, height);
    if (this._nightBloomPass) {
      this._nightBloomPass.setSize(
        Math.max(1, Math.floor(width * resScale)),
        Math.max(1, Math.floor(height * resScale))
      );
    }
  }

  _applyBloomQualitySettings() {
    if (!this._nightBloomPass) return;
    if (this._isNightActive) {
      const qCfg = getNightQualityConfig(this.nightQuality);
      this._nightBloomPass.enabled = Boolean(qCfg.bloomEnabled);
      this._nightBloomPass.strength = qCfg.bloomStrength;
      this._nightBloomPass.radius = qCfg.bloomRadius;
      this._nightBloomPass.threshold = qCfg.bloomThreshold;
    } else {
      const dayBloom = SCENE_VISUAL_CONFIG.postProcessing.dayBloom;
      this._nightBloomPass.enabled = Boolean(SCENE_VISUAL_CONFIG.postProcessing.enabled);
      this._nightBloomPass.strength = dayBloom.strength;
      this._nightBloomPass.radius = dayBloom.radius;
      this._nightBloomPass.threshold = dayBloom.threshold;
    }
    this._resizeNightComposer();
  }

  _resetNightFallbackTimer() {
    this._nightFallbackState.warmupSec = 0;
    this._nightFallbackState.lowFpsSec = 0;
    this._nightFallbackState.emaFps = 60;
  }

  setNightQuality(qualityId, { isAutoFallback = false } = {}) {
    const qCfg = getNightQualityConfig(qualityId);
    const nextQuality = qCfg.id;
    this.nightQuality = nextQuality;
    this._resetNightFallbackTimer();

    if (this.floodlights) {
      this.floodlights.setQuality(nextQuality);
    }
    if (qCfg.bloomEnabled && this._isNightActive) {
      this._ensureNightComposer();
    }
    this._applyBloomQualitySettings();

    const isTrackPreview = this.isGarageMode && this._garageViewMode === 'track';
    if (!this.isGarageMode || isTrackPreview) {
      this._currentWeather = null;
      const weatherId = isTrackPreview
        ? this._previewWeather || this._lastRenderedWeather || 'dry'
        : this._lastRenderedWeather || 'dry';
      this._updateWeatherVisuals(weatherId);
      if (isTrackPreview) this.weatherFx?.setVisible(false);
    }

    if (!isAutoFallback && this._isNightActive && this.nightSky) {
      const isRain = (this._lastRenderedWeather || this._previewWeather) === 'rain';
      this.nightSky.configure({
        trackId: this.biomeConfig?.trackId || this.trackData?.id,
        qualityId: nextQuality,
        isRain,
      });
    }

    return nextQuality;
  }

  getNightQuality() {
    return this.nightQuality;
  }

  _updateNightAutoFallback(renderDt) {
    if (!AUTO_QUALITY_FALLBACK.enabled || this.isGarageMode || !this._isNightActive) return;
    const nextLower = getLowerNightQuality(this.nightQuality);
    if (!nextLower) return;

    const st = this._nightFallbackState;
    st.warmupSec += renderDt;
    if (st.warmupSec < AUTO_QUALITY_FALLBACK.warmupSeconds) return;

    const instFps = 1 / Math.max(0.004, renderDt);
    st.emaFps = st.emaFps * 0.92 + instFps * 0.08;

    if (st.emaFps < AUTO_QUALITY_FALLBACK.lowFpsThreshold) {
      st.lowFpsSec += renderDt;
    } else {
      st.lowFpsSec = Math.max(0, st.lowFpsSec - renderDt * 1.5);
    }

    if (st.lowFpsSec >= AUTO_QUALITY_FALLBACK.sustainSeconds) {
      const previousQuality = this.nightQuality;
      const measuredFps = st.emaFps;
      this.setNightQuality(nextLower, { isAutoFallback: true });
      this.onNightQualityAutoFallback?.(nextLower, {
        previousQuality,
        measuredFps,
      });
    }
  }

  _renderFrame(activeCamera, usePostProcessing) {
    if (usePostProcessing && SCENE_VISUAL_CONFIG.postProcessing.enabled) {
      const composer = this._ensureNightComposer();
      if (composer && this._nightRenderPass) {
        this._nightRenderPass.camera = activeCamera;
        composer.render();
        return;
      }
    }
    this.renderer.render(this.scene, activeCamera);
  }

  _applyStudioEnvironment() {
    const reqId = ++this._envRequestId;
    this._isNightActive = false;
    if (this.daySkyDome) this.daySkyDome.group.visible = false;
    if (this.nightSky) this.nightSky.group.visible = false;
    if (this.moonLight) this.moonLight.visible = false;
    if (this.floodlights) this.floodlights.group.visible = false;
    this.weatherFx?.setVisible(false);

    this._bgColor.setHex(0x07090e);
    this.scene.background = this._bgColor;
    this.scene.backgroundBlurriness = 0;
    this.scene.backgroundIntensity = 1.0;
    this.scene.backgroundRotation.set(0, 0, 0);
    this.scene.environmentRotation.set(0, 0, 0);
    this.scene.fog.color.setHex(0x07090e);
    this.scene.fog.density = 0.022;
    this.sunLight.castShadow = true;
    this.sunLight.color.setHex(0xfffbeb);
    this.sunLight.intensity = 0.65;
    this.hemiLight.color.setHex(0xdbeafe);
    this.hemiLight.groundColor.setHex(0x1e293b);
    this.hemiLight.intensity = 0.85;
    this.renderer.toneMappingExposure = 1.05;

    assetManager3D.loadHDRI('studio', this.renderer).then((envMap) => {
      if (reqId !== this._envRequestId || !envMap) return;
      this.scene.environment = envMap;
      this.scene.environmentIntensity = 0.85;
      this._activeEnvKey = 'studio';
    });
  }

  _resolveEffectiveSkyPreset(weatherId, biome, explicitSkyPresetId = null) {
    const isRain = weatherId === 'rain';
    const isNightTrack = Boolean(biome?.isNight);
    const isTrackPreview = this.isGarageMode && this._garageViewMode === 'track';

    if (explicitSkyPresetId && SKY_PRESETS[explicitSkyPresetId]) {
      const explicit = SKY_PRESETS[explicitSkyPresetId];
      if (isRain && explicit.physicsWeather !== 'rain') {
        return SKY_PRESETS.rain;
      }
      if (!isRain && explicit.physicsWeather === 'rain') {
        return isNightTrack ? SKY_PRESETS.night_clear : SKY_PRESETS.clear_day;
      }
      return explicit;
    }

    const req = this._requestedSkyPreset || DEFAULT_SKY_PRESET_OPTION;

    if (isTrackPreview) {
      if (req === 'random') {
        const trackKey = biome?.trackId || this.trackData?.id || 'default';
        if (!this._randomSkyCache || this._randomSkyCache.trackKey !== trackKey) {
          this._randomSkyCache = {
            trackKey,
            preset: resolveSkyPreset('random', biome),
          };
        }
        return this._randomSkyCache.preset;
      }
      if (req === 'auto') {
        if (isRain) return SKY_PRESETS.rain;
        return isNightTrack ? SKY_PRESETS.night_clear : SKY_PRESETS.sunset;
      }
      return getSkyPresetById(req);
    }

    if (isRain) {
      if (req === 'heavy_rain') return SKY_PRESETS.heavy_rain;
      return SKY_PRESETS.rain;
    }

    if (req === 'auto') {
      // Sui 6 GP notturni mantiene il cielo notturno stellato; sui 18 diurni esalta di default il Tramonto realistico
      return isNightTrack ? SKY_PRESETS.night_clear : SKY_PRESETS.sunset;
    }

    if (req === 'random') {
      const trackKey = biome?.trackId || this.trackData?.id || 'default';
      if (!this._randomSkyCache || this._randomSkyCache.trackKey !== trackKey) {
        this._randomSkyCache = {
          trackKey,
          preset: resolveSkyPreset('random', biome),
        };
      }
      const chosen = this._randomSkyCache.preset;
      if (chosen.physicsWeather === 'rain') {
        return isNightTrack ? SKY_PRESETS.night_clear : SKY_PRESETS.clear_day;
      }
      return chosen;
    }

    const explicit = getSkyPresetById(req);
    if (explicit.physicsWeather === 'rain') {
      return isNightTrack ? SKY_PRESETS.night_clear : SKY_PRESETS.clear_day;
    }
    return explicit;
  }

  _updateSunAndHorizonAlignment(preset) {
    const s0 = this.trackSurface?.samples?.[0];
    const startHeading = s0 ? Math.atan2(s0.tx, s0.tz) : 0;

    let sunHeading;
    if (preset.alignSunForward) {
      sunHeading = startHeading + (preset.sunForwardOffsetRad ?? -0.14);
      const peakU = preset.hdrSunU ?? 0.60;
      const hdrSunHeading = (0.25 - (peakU - 0.5)) * Math.PI * 2;
      this._skyRotationY = sunHeading - hdrSunHeading;
    } else {
      const azDeg = preset.sunAzimuthDeg ?? 38;
      sunHeading = startHeading + (azDeg * Math.PI) / 180;
      const hdrSunHeading = PURE_SKY_HDR_SUN_HEADING_RAD;
      this._skyRotationY = sunHeading - hdrSunHeading;
    }

    const elRad = ((preset.sunElevationDeg ?? 35) * Math.PI) / 180;
    const cosEl = Math.cos(elRad);
    this._sunDir
      .set(cosEl * Math.sin(sunHeading), Math.sin(elRad), cosEl * Math.cos(sunHeading))
      .normalize();

    this.scene.backgroundRotation.set(0, this._skyRotationY, 0);
    this.scene.environmentRotation.set(0, this._skyRotationY, 0);
  }

  setSkyPreset(skyId) {
    this._requestedSkyPreset = skyId || DEFAULT_SKY_PRESET_OPTION;
    if (this._requestedSkyPreset === 'random') {
      this._randomSkyCache = null;
    }
    this._currentWeather = null;
    const isTrackPreview = this.isGarageMode && this._garageViewMode === 'track';
    if (!this.isGarageMode || isTrackPreview) {
      const weatherId = isTrackPreview
        ? this._previewWeather || this._lastRenderedWeather || 'dry'
        : this._lastRenderedWeather || 'dry';
      this._updateWeatherVisuals(weatherId);
      if (isTrackPreview) this.weatherFx?.setVisible(false);
    }
    return this.getResolvedSkyPreset();
  }

  getResolvedSkyPreset(worldState = null) {
    const biome = this.biomeConfig || getTrackBiomeConfig(this.trackData);
    const isTrackPreview = this.isGarageMode && this._garageViewMode === 'track';
    const weatherId = isTrackPreview
      ? this._previewWeather || this._lastRenderedWeather || 'dry'
      : worldState?.weather || this._lastRenderedWeather || 'dry';
    const explicitId = !this.isGarageMode ? worldState?.skyPresetId || null : null;
    return this._resolveEffectiveSkyPreset(weatherId, biome, explicitId);
  }

  _applyAsphaltSurfaceVisuals({
    roughness,
    metalness,
    envMapIntensity,
    specularIntensity = 0.24,
    colorScale = 1.0,
  }) {
    if (this.asphaltMaterial) {
      this.asphaltMaterial.roughness = roughness;
      this.asphaltMaterial.metalness = metalness;
      this.asphaltMaterial.envMapIntensity = envMapIntensity;
      if ('specularIntensity' in this.asphaltMaterial) {
        this.asphaltMaterial.specularIntensity = specularIntensity;
      }
      this.asphaltMaterial.userData.colorScale = colorScale;
      const baseTintHex =
        this.asphaltMaterial.userData?.baseTintHex ??
        this.biomeConfig?.asphaltTint ??
        0xa4aab4;
      this.asphaltMaterial.color.setHex(baseTintHex).multiplyScalar(colorScale);
      this.asphaltMaterial.needsUpdate = true;
    }
    if (this.pitAsphaltMaterial) {
      this.pitAsphaltMaterial.roughness = Math.max(0.45, roughness - 0.04);
      this.pitAsphaltMaterial.metalness = metalness;
      this.pitAsphaltMaterial.envMapIntensity = envMapIntensity;
      if ('specularIntensity' in this.pitAsphaltMaterial) {
        this.pitAsphaltMaterial.specularIntensity = specularIntensity;
      }
      this.pitAsphaltMaterial.userData.colorScale = Math.min(1.0, colorScale * 1.05);
      const pitBaseTint = this.pitAsphaltMaterial.userData?.baseTintHex ?? 0x8f97a3;
      this.pitAsphaltMaterial.color
        .setHex(pitBaseTint)
        .multiplyScalar(this.pitAsphaltMaterial.userData.colorScale);
      this.pitAsphaltMaterial.needsUpdate = true;
    }
  }

  _updateWeatherVisuals(weatherId, explicitSkyPresetId = null) {
    const biome = this.biomeConfig || getTrackBiomeConfig(this.trackData);
    const preset = this._resolveEffectiveSkyPreset(weatherId, biome, explicitSkyPresetId);
    const isTrackPreview = this.isGarageMode && this._garageViewMode === 'track';
    const isRain = explicitSkyPresetId
      ? preset.physicsWeather === 'rain'
      : isTrackPreview
        ? preset.physicsWeather === 'rain'
        : weatherId === 'rain' || preset.physicsWeather === 'rain';
    const isNight = Boolean(preset.isNight);
    const hdriKey = preset.hdriKey || (isNight ? 'night_clear' : (isRain ? biome.hdriRain : biome.hdriDry));
    const stateKey = `${biome.trackId}:${weatherId}:${preset.id}:${explicitSkyPresetId || ''}:${this._requestedSkyPreset}:${this.nightQuality}`;
    if (stateKey === this._currentWeather) return;
    this._currentWeather = stateKey;
    this._activeSkyPreset = preset;
    this._isNightActive = isNight;

    if (isNight) {
      const profile = getNightCircuitProfile(biome.trackId);
      const qCfg = getNightQualityConfig(this.nightQuality);
      if (this.daySkyDome) this.daySkyDome.group.visible = false;
      this.scene.backgroundRotation.set(0, 0, 0);
      this.scene.environmentRotation.set(0, 0, 0);

      if (this.nightSky) {
        this.nightSky.configure({
          trackId: biome.trackId,
          qualityId: this.nightQuality,
          isRain,
        });
        this.nightSky.group.visible = true;
      }

      if (this.moonLight) {
        const moonDir = this.nightSky
          ? this.nightSky.getMoonDirection()
          : new THREE.Vector3(0.4, 0.5, 0.7).normalize();
        this.moonLight.position.copy(moonDir).multiplyScalar(220);
        this.moonLight.target.position.set(0, 0, 0);
        this.moonLight.color.setHex(NIGHT_SKY_PARAMS.moonLightColor);
        this.moonLight.intensity = qCfg.showMoon
          ? (isRain
              ? NIGHT_SKY_PARAMS.moonLightIntensity * 0.45
              : NIGHT_SKY_PARAMS.moonLightIntensity)
          : 0.18;
        this.moonLight.visible = true;
      }

      if (this.floodlights) {
        this.floodlights.setQuality(this.nightQuality);
        this.floodlights.group.visible = true;
      }

      this._bgColor.setHex(profile.fogColor);
      this.scene.background = this._bgColor;
      this.scene.backgroundBlurriness = 0;
      this.scene.backgroundIntensity = 1.0;

      this.scene.fog.color.setHex(profile.fogColor);
      this.scene.fog.density = isRain
        ? Math.max(SCENE_VISUAL_CONFIG.fog.nightRainDensity, profile.fogDensity * 2.15)
        : Math.max(SCENE_VISUAL_CONFIG.fog.nightDensity, profile.fogDensity);

      // Luce direzionale di riempimento controllata così i fari FIA scolpiscono luce/ombra
      this.sunLight.castShadow = false;
      this.sunLight.color.setHex(isRain ? 0xbcd0f0 : 0xddeaff);
      this.sunLight.intensity = isRain
        ? profile.sunFillIntensity * 0.72
        : profile.sunFillIntensity;
      this.hemiLight.color.setHex(isRain ? 0x3b4d70 : 0x4b6396);
      this.hemiLight.groundColor.setHex(0x161c28);
      this.hemiLight.intensity = isRain
        ? profile.hemiIntensity * 0.85
        : profile.hemiIntensity;
      this.renderer.toneMappingExposure = isRain
        ? Math.min(0.92, profile.exposure * 0.88)
        : Math.min(0.94, profile.exposure * 0.90);

      this._applyAsphaltSurfaceVisuals({
        roughness: isRain ? 0.48 : Math.max(0.90, profile.asphaltNightRoughness),
        metalness: 0.0,
        envMapIntensity: isRain ? 0.26 : Math.min(0.22, profile.asphaltNightEnvIntensity ?? 0.20),
        specularIntensity: isRain ? 0.42 : 0.26,
        colorScale: isRain ? 0.22 : 0.36,
      });
      if (this.kerbMaterial) {
        this.kerbMaterial.roughness = isRain ? 0.52 : 0.88;
        this.kerbMaterial.envMapIntensity = isRain ? 0.46 : 0.30;
        this.kerbMaterial.needsUpdate = true;
      }

      this.weatherFx?.configure({
        isRain: isRain && !this.isGarageMode && !isTrackPreview,
        rainIntensity: isRain ? (preset.rainIntensity || 1.0) : 0,
        isNight: true,
        fogColor: this.scene.fog?.color,
        fogDensity: this.scene.fog?.density ?? 0.0005,
      });

      if (qCfg.bloomEnabled) {
        this._ensureNightComposer();
      }
      this._applyBloomQualitySettings();

      // Carica solo la PMREM envMap per i riflessi PBR su carrozzerie e asfalto bagnato
      const reqId = ++this._envRequestId;
      assetManager3D.loadHDRIBundle(hdriKey, this.renderer).then((bundle) => {
        if (reqId !== this._envRequestId || !bundle?.envMap) return;
        this.scene.environment = bundle.envMap;
        this.scene.environmentIntensity = isRain ? 0.80 : 0.76;
        this._activeEnvKey = hdriKey;
      });
      return;
    }

    // Circuiti diurni / tramonto / alba / nuvoloso / pioggia: cupola HDRI 2K con grading cinematografico
    if (this.nightSky) this.nightSky.group.visible = false;
    if (this.moonLight) this.moonLight.visible = false;
    if (this.floodlights) this.floodlights.group.visible = false;
    this.sunLight.castShadow = !isRain;

    this._updateSunAndHorizonAlignment(preset);

    this._bgColor.setHex(preset.skyFallbackColor ?? (isRain ? biome.skyRainColor : biome.skyDryColor));
    this.scene.background = this._bgColor;
    this.scene.fog.color.setHex(preset.fogColor ?? (isRain ? biome.fogRainColor : biome.fogDryColor));
    this.scene.fog.density = preset.fogDensity ?? (isRain ? biome.fogRainDensity : biome.fogDryDensity);

    if (this.daySkyDome) {
      this.daySkyDome.configure({
        rotationY: this._skyRotationY,
        sunDir: this._sunDir,
        exposure: preset.skyExposure ?? (isRain ? 0.65 : 0.78),
        saturation: preset.skySaturation ?? (isRain ? 0.95 : 1.18),
        contrast: preset.skyContrast ?? 1.12,
        warmTint: preset.skyWarmTint ?? 0xffffff,
        warmStrength: preset.skyWarmStrength ?? 0.0,
        zenithTint: preset.skyZenithTint ?? 0xdbeafe,
        zenithStrength: preset.skyZenithStrength ?? 0.14,
        sunGlowColor: preset.skySunGlowColor ?? 0xffb35c,
        sunGlowStrength: preset.skySunGlowStrength ?? 0.0,
        fallbackColor: preset.skyFallbackColor ?? 0x87b8e8,
      });
      this.daySkyDome.group.visible = true;
    }

    this.sunLight.color.setHex(preset.sunColor ?? (isRain ? biome.sunRainColor : biome.sunDryColor));
    this.sunLight.intensity = preset.sunIntensity ?? (isRain ? biome.sunRainIntensity : biome.sunDryIntensity);
    this.hemiLight.color.setHex(preset.hemiSkyColor ?? (isRain ? biome.hemiRainSky : biome.hemiDrySky));
    this.hemiLight.groundColor.setHex(preset.hemiGroundColor ?? (isRain ? biome.hemiRainGround : biome.hemiDryGround));
    this.hemiLight.intensity = preset.hemiIntensity ?? (isRain ? biome.hemiRainIntensity : biome.hemiDryIntensity);
    this.renderer.toneMappingExposure =
      preset.toneMappingExposure ??
      (isRain ? biome.toneMappingExposureRain : biome.toneMappingExposureDry);

    this._applyAsphaltSurfaceVisuals({
      roughness: preset.asphaltRoughness ?? (isRain ? 0.58 : 0.96),
      metalness: preset.asphaltMetalness ?? 0.0,
      envMapIntensity:
        preset.asphaltEnvIntensity ??
        (isRain ? 0.22 : SCENE_VISUAL_CONFIG.pbrEnvIntensity.trackHard),
      specularIntensity: preset.asphaltSpecularIntensity ?? (isRain ? 0.36 : 0.22),
      colorScale: preset.asphaltColorScale ?? (isRain ? 0.42 : 1.0),
    });
    if (this.kerbMaterial) {
      this.kerbMaterial.roughness = isRain ? 0.56 : 0.88;
      this.kerbMaterial.envMapIntensity = isRain ? 0.46 : 0.30;
      this.kerbMaterial.needsUpdate = true;
    }

    this.weatherFx?.configure({
      isRain: isRain && !this.isGarageMode && !isTrackPreview,
      rainIntensity: isRain ? (preset.rainIntensity || 1.0) : 0,
      isNight: false,
      fogColor: this.scene.fog?.color,
      fogDensity: this.scene.fog?.density ?? 0.0005,
    });

    if (SCENE_VISUAL_CONFIG.postProcessing.enabled) {
      this._ensureNightComposer();
    }
    this._applyBloomQualitySettings();

    const reqId = ++this._envRequestId;
    assetManager3D.loadHDRIBundle(hdriKey, this.renderer).then((bundle) => {
      if (reqId !== this._envRequestId || !bundle?.envMap) return;
      this.scene.environment = bundle.envMap;
      this.scene.environmentIntensity = preset.envMapIntensity ?? 1.0;
      this.scene.environmentRotation.set(0, this._skyRotationY, 0);
      if (this.daySkyDome && bundle.backgroundMap) {
        this.daySkyDome.setTexture(bundle.backgroundMap);
        this.daySkyDome.group.visible = true;
      } else {
        this.scene.background = bundle.backgroundMap || bundle.envMap;
      }
      this._activeEnvKey = hdriKey;
    });
  }

  cycleCameraMode() {
    return this.cameraController.cycleMode();
  }

  setCameraMode(modeId) {
    return this.cameraController.setModeById(modeId);
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
      this.weatherFx?.reset();
      this.weatherFx?.setVisible(false);
      this._updateWeatherVisuals(this._previewWeather || this._lastRenderedWeather || 'dry');
      for (const carModel of this.carMeshes.values()) {
        carModel.root.visible = false;
      }
    } else if (this.isGarageMode) {
      this._currentWeather = null;
      this.weatherFx?.reset();
      this.weatherFx?.setVisible(false);
      this._applyStudioEnvironment();
      for (const carModel of this.carMeshes.values()) {
        carModel.root.visible = false;
      }
    } else {
      this._resetNightFallbackTimer();
      this._currentWeather = null;
      this.weatherFx?.setVisible(true);
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
      this.weatherFx?.setVisible(false);
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
      this._disposeTrackPbr?.();
      this._disposeTrackPbr = null;
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
          for (const texKey of ['map', 'normalMap', 'roughnessMap']) {
            if (mat[texKey] && !disposed.has(mat[texKey])) {
              disposed.add(mat[texKey]);
              mat[texKey].dispose();
            }
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
    this.pitAsphaltMaterial = builtTrack.pitAsphaltMaterial || null;
    this.kerbMaterial = builtTrack.kerbMaterial || null;
    this.edgeLineMaterial = builtTrack.edgeLineMaterial || null;
    this.biomeConfig = builtTrack.biome || getTrackBiomeConfig(this.trackData);
    this._disposeTrackPbr = builtTrack.disposePbr || null;
    const isTrackPreview = this.isGarageMode && this._garageViewMode === 'track';
    this.trackGroup.visible = !this.isGarageMode || isTrackPreview;
    this.scene.add(this.trackGroup);
    this.pitGuide?.setTrackSurface(this.trackSurface);
    if (this.isGarageMode) {
      this.pitStopAnimator?.setVisible(false);
      this.pitGuide?.setVisible(false);
    }

    this._syncTrackFloodlights();
    this._resetNightFallbackTimer();
    this.weatherFx?.reset();
    this._randomSkyCache = null;
    this._currentWeather = null;
    this._activeEnvKey = null;
    if (!this.isGarageMode || isTrackPreview) {
      this._updateWeatherVisuals(
        isTrackPreview
          ? this._previewWeather || this._lastRenderedWeather || 'dry'
          : this._lastRenderedWeather || 'dry'
      );
      if (isTrackPreview) this.weatherFx?.setVisible(false);
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
    this._nightElapsedSec += renderDt;
    if (!this.isGarageMode) {
      this._lastRenderedWeather = worldState.weather || 'dry';
    }

    if (this.isGarageMode) {
      this.pitStopAnimator?.setVisible(false);
      this.pitGuide?.setVisible(false);
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
        this._tmpTrackTargetPos.set(
          cx + Math.cos(this._trackOrbitAngle) * orbitRadius,
          cy + camHeight,
          cz + Math.sin(this._trackOrbitAngle) * orbitRadius
        );
        this._tmpTrackTargetLook.set(cx, cy + 4, cz);
        const lerpAlpha = Math.min(1, renderDt * 3.5);
        this._trackCamPos.lerp(this._tmpTrackTargetPos, lerpAlpha);
        this._trackCamLook.lerp(this._tmpTrackTargetLook, lerpAlpha);
        this.menuCamera.up.set(0, 1, 0);
        if (this.menuCamera.fov !== 60) {
          this.menuCamera.fov = 60;
          this.menuCamera.updateProjectionMatrix();
        }
        this.menuCamera.position.copy(this._trackCamPos);
        this.menuCamera.lookAt(this._trackCamLook);

        this._setShadowFrustumHalfSize(SCENE_VISUAL_CONFIG.shadow.overviewFrustumSize);
        this.sunLight.position.set(
          cx + this._sunDir.x * 240,
          cy + Math.max(0.28, this._sunDir.y) * 240,
          cz + this._sunDir.z * 240
        );
        this.sunLight.target.position.set(cx, cy, cz);
        this.sunLight.target.updateMatrixWorld();

        if (this._isNightActive) {
          const isRainPreview =
            (this._previewWeather || this._lastRenderedWeather || 'dry') === 'rain';
          this.nightSky?.update(this.menuCamera, this._nightElapsedSec);
          if (this.moonLight && this.nightSky) {
            const moonDir = this.nightSky.getMoonDirection();
            this.moonLight.position.set(
              cx + moonDir.x * 260,
              cy + moonDir.y * 260,
              cz + moonDir.z * 260
            );
            this.moonLight.target.position.set(cx, cy, cz);
            this.moonLight.target.updateMatrixWorld();
          }
          const startSample = this.trackSurface?.samples?.[0];
          this._floodlightFocusVec.set(
            startSample ? startSample.x : cx,
            startSample ? (startSample.y ?? 0) : cy,
            startSample ? startSample.z : cz
          );
          this.floodlights?.update(this._floodlightFocusVec, 0, isRainPreview);
        } else {
          this.daySkyDome?.update(this.menuCamera);
        }

        const usePreviewPost = this._isNightActive
          ? getNightQualityConfig(this.nightQuality).bloomEnabled
          : SCENE_VISUAL_CONFIG.postProcessing.enabled;
        this._renderFrame(this.menuCamera, usePreviewPost);
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
    const weatherId = worldState.weather || 'dry';
    const isRain = weatherId === 'rain';
    this._updateWeatherVisuals(weatherId, worldState.skyPresetId || null);

    const activeCar = worldState.getCar(followedCarId);
    const focusX = activeCar ? activeCar.x : 0;
    const focusZ = activeCar ? activeCar.z : 0;

    for (const [carId, carState] of Object.entries(worldState.cars)) {
      const isPlayerCar = carId === followedCarId;
      let carModel = this.carMeshes.get(carId);
      if (
        carModel &&
        (carModel._primaryColor !== carState.color || carModel._isPlayerCar !== isPlayerCar)
      ) {
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
          driverNumber: carState.driverNumber,
          isPlayerCar,
        });
        carModel._primaryColor = carState.color;
        carModel._helmetColor = carState.helmetColor;
        carModel._driverNumber = carState.driverNumber;
        carModel._isPlayerCar = isPlayerCar;
        carModel._lastRoughness = null;
        carModel._lastMetalness = null;
        this.carMeshes.set(carId, carModel);
        this.scene.add(carModel.root);
      }
      carModel.root.visible = true;
      carModel.setNightMode?.(this._isNightActive, isRain);

      if (
        carModel._helmetColor !== carState.helmetColor ||
        carModel._driverNumber !== carState.driverNumber
      ) {
        carModel._helmetColor = carState.helmetColor;
        carModel._driverNumber = carState.driverNumber;
        carModel.setAppearance({
          helmetColor: carState.helmetColor,
          driverNumber: carState.driverNumber,
        });
      }

      const nextRoughness = carState.paintRoughness ?? 0.25;
      const nextMetalness = carState.paintMetalness ?? 0.35;
      if (
        carModel._lastRoughness !== nextRoughness ||
        carModel._lastMetalness !== nextMetalness
      ) {
        carModel._lastRoughness = nextRoughness;
        carModel._lastMetalness = nextMetalness;
        carModel.setAppearance({
          roughness: nextRoughness,
          metalness: nextMetalness,
        });
      }

      if (carModel.setLodState) {
        if (isPlayerCar) {
          carModel.setLodState(true, true);
        } else {
          const dx = carState.x - focusX;
          const dz = carState.z - focusZ;
          const distSq = dx * dx + dz * dz;
          carModel.setLodState(distSq < 2304, distSq < 2704); // 48m detail, 52m shadows
        }
      }

      carModel.syncFromState(carState, {
        trackSurface: this.trackSurface,
        dt: renderDt,
      });
    }

    // Rimuove eventuali mesh di vetture non più presenti in WorldState
    for (const [carId, carModel] of this.carMeshes.entries()) {
      if (!worldState.cars[carId]) {
        this.scene.remove(carModel.root);
        this.carMeshes.delete(carId);
      }
    }

    if (activeCar) {
      this._setShadowFrustumHalfSize(SCENE_VISUAL_CONFIG.shadow.frustumHalfSize);
      const sunDist = SCENE_VISUAL_CONFIG.shadow.lightDistance;
      this.sunLight.position.set(
        activeCar.x + this._sunDir.x * sunDist,
        (activeCar.y || 0) + Math.max(0.22, this._sunDir.y) * sunDist,
        activeCar.z + this._sunDir.z * sunDist
      );
      this.sunLight.target.position.set(activeCar.x, activeCar.y || 0, activeCar.z);
      this.sunLight.target.updateMatrixWorld();
      this.cameraController.update(
        activeCar,
        this.carMeshes.get(followedCarId),
        renderDt,
        this.trackSurface
      );
    }

    if (this._isNightActive) {
      this.nightSky?.update(this.camera, this._nightElapsedSec);
      if (activeCar) {
        if (this.moonLight && this.nightSky) {
          const moonDir = this.nightSky.getMoonDirection();
          this.moonLight.position.set(
            activeCar.x + moonDir.x * 220,
            activeCar.y + moonDir.y * 220,
            activeCar.z + moonDir.z * 220
          );
          this.moonLight.target.position.set(activeCar.x, activeCar.y, activeCar.z);
          this.moonLight.target.updateMatrixWorld();
        }
        this._floodlightFocusVec.set(activeCar.x, activeCar.y, activeCar.z);
        this.floodlights?.update(this._floodlightFocusVec, activeCar.heading || 0, isRain);
      }
      this._updateNightAutoFallback(renderDt);
    } else {
      this.daySkyDome?.update(this.camera);
    }

    const activeRainIntensity = isRain ? (this._activeSkyPreset?.rainIntensity || 1.0) : 0;
    this.weatherFx?.update({
      worldState,
      followedCarId,
      activeCar,
      carMeshes: this.carMeshes,
      camera: this.camera,
      weatherId,
      rainIntensity: activeRainIntensity,
      isNight: this._isNightActive,
      fogColor: this.scene.fog?.color,
      fogDensity: this.scene.fog?.density ?? 0.0005,
      dt: renderDt,
    });

    this.pitGuide?.update({
      worldState,
      activeCar,
      dt: renderDt,
    });

    this.pitStopAnimator?.update(worldState, this.carMeshes, followedCarId, renderDt);
    this._updateRecoveryMarker(activeCar);

    const useTrackPost = this._isNightActive
      ? getNightQualityConfig(this.nightQuality).bloomEnabled
      : SCENE_VISUAL_CONFIG.postProcessing.enabled;
    this._renderFrame(this.camera, useTrackPost);
  }

  dispose() {
    this._disposed = true;
    window.removeEventListener('resize', this._onResize);
    this.daySkyDome?.dispose();
    this.nightSky?.dispose();
    this.floodlights?.dispose();
    this.weatherFx?.dispose();
    this.pitGuide?.dispose();
    this.pitStopAnimator?.dispose();
    if (this._recoveryMarker) {
      this.scene.remove(this._recoveryMarker.group);
      this._recoveryMarker.ringGeo.dispose();
      this._recoveryMarker.innerGeo.dispose();
      this._recoveryMarker.chevGeo.dispose();
      this._recoveryMarker.ringMat.dispose();
      this._recoveryMarker.innerMat.dispose();
      this._recoveryMarker.chevMat.dispose();
      this._recoveryMarker = null;
    }
    this._nightBloomPass?.dispose?.();
    this._nightComposer?.dispose?.();
    this._nightRenderTarget?.dispose?.();
    this._disposeTrackPbr?.();
    this._disposeTrackPbr = null;
    assetManager3D.dispose();
    this.renderer.dispose();
  }
}
