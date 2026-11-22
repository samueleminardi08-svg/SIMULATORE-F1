/**
 * Gestore centralizzato asincrono degli asset 3D (Draco GLB/GLTF, PBR Texture Sets, HDRI PMREM).
 * Legge `public/assets/3d/manifest.json` per evitare qualsiasi richiesta HTTP 404 sugli slot opzionali
 * e funziona in sicurezza anche nei test headless Node.js.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

function createEmptyManifest() {
  return {
    version: 1,
    generatedAt: null,
    dracoDecoderPath: 'draco/',
    textures: {},
    hdri: {},
    models: {
      nature: {},
      track: {},
      garage: {},
      optional: {},
    },
    cars: {},
    drivers: {},
    garage: {},
  };
}

export class AssetManager3D {
  constructor() {
    this._manifest = null;
    this._manifestPromise = null;

    this._gltfLoader = null;
    this._dracoLoader = null;
    this._textureLoader = null;
    this._rgbeLoader = null;

    this._pmremGenerator = null;
    this._pmremRenderer = null;

    this._gltfPromises = new Map();
    this._texturePromises = new Map();
    this._hdriPromises = new Map();
    this._hdriCache = new Map();
    this._pmremTargets = [];
    this._hdriBackgroundTextures = [];
    this._baseTextures = [];
  }

  /**
   * Risolve un percorso relativo dentro `public/` in modo sicuro sia su localhost che su GitHub Pages.
   * @param {string} relPath
   * @returns {string}
   */
  resolvePublicUrl(relPath) {
    const cleanPath = String(relPath || '').replace(/^(\.\/|\/)+/, '');
    if (typeof document !== 'undefined' && document.baseURI) {
      return new URL(cleanPath, document.baseURI).href;
    }
    return `./${cleanPath}`;
  }

  /**
   * Imposta manualmente il manifest in ambiente di test Node headless.
   * @param {object} manifestObj
   */
  setManifestForTest(manifestObj) {
    this._manifest = manifestObj && typeof manifestObj === 'object'
      ? manifestObj
      : createEmptyManifest();
    this._manifestPromise = Promise.resolve(this._manifest);
  }

  getManifest() {
    return this._manifest || createEmptyManifest();
  }

  async loadManifest() {
    if (this._manifest) return this._manifest;
    if (this._manifestPromise) return this._manifestPromise;

    if (typeof window === 'undefined' || typeof fetch !== 'function') {
      this._manifest = createEmptyManifest();
      return this._manifest;
    }

    const url = this.resolvePublicUrl('assets/3d/manifest.json');
    this._manifestPromise = fetch(url, { cache: 'default' })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} loading manifest.json`);
        }
        const json = await res.json();
        this._manifest = { ...createEmptyManifest(), ...json };
        return this._manifest;
      })
      .catch((err) => {
        console.warn('[AssetManager3D] Impossibile caricare manifest.json, uso fallback vuoto:', err);
        this._manifest = createEmptyManifest();
        return this._manifest;
      });

    return this._manifestPromise;
  }

  hasTexture(id) {
    return Boolean(this._manifest?.textures?.[id]?.diff);
  }

  hasHdri(key) {
    return Boolean(this._manifest?.hdri?.[key]);
  }

  hasModel(category, id) {
    return Boolean(this._manifest?.models?.[category]?.[id]?.path);
  }

  hasCar(teamId) {
    return Boolean(this._manifest?.cars?.[teamId]?.path);
  }

  hasDriver(slot) {
    return Boolean(this._manifest?.drivers?.[slot]?.path);
  }

  hasGarage(slot) {
    return Boolean(this._manifest?.garage?.[slot]?.path);
  }

  getGLTFLoader() {
    if (this._gltfLoader) return this._gltfLoader;
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    const decoderRel = this._manifest?.dracoDecoderPath || 'draco/';
    dracoLoader.setDecoderPath(this.resolvePublicUrl(decoderRel));
    dracoLoader.setDecoderConfig({ type: 'wasm' });
    loader.setDRACOLoader(dracoLoader);
    this._dracoLoader = dracoLoader;
    this._gltfLoader = loader;
    return loader;
  }

  async loadGLTF(relPath) {
    if (!relPath) return null;
    if (typeof window === 'undefined') return null;

    await this.loadManifest();
    const url = this.resolvePublicUrl(relPath);

    if (this._gltfPromises.has(url)) {
      return this._gltfPromises.get(url);
    }

    const loader = this.getGLTFLoader();
    const promise = new Promise((resolve) => {
      loader.load(
        url,
        (gltf) => resolve(gltf),
        undefined,
        (err) => {
          console.warn(`[AssetManager3D] Errore caricamento GLTF (${relPath}):`, err);
          resolve(null);
        }
      );
    });

    this._gltfPromises.set(url, promise);
    return promise;
  }

  async loadModel(category, id) {
    const manifest = await this.loadManifest();
    const entry = manifest?.models?.[category]?.[id];
    if (!entry?.path) return null;
    return this.loadGLTF(entry.path);
  }

  async loadCarModel(teamId) {
    const manifest = await this.loadManifest();
    const entry = manifest?.cars?.[teamId];
    if (!entry?.path) return null;
    return this.loadGLTF(entry.path);
  }

  async loadDriverModel(slot) {
    const manifest = await this.loadManifest();
    const entry = manifest?.drivers?.[slot];
    if (!entry?.path) return null;
    return this.loadGLTF(entry.path);
  }

  async loadGarageModel(slot) {
    const manifest = await this.loadManifest();
    const entry = manifest?.garage?.[slot];
    if (!entry?.path) return null;
    return this.loadGLTF(entry.path);
  }

  loadTexture(relPath, options = {}) {
    if (!relPath) return Promise.resolve(null);
    if (typeof window === 'undefined') return Promise.resolve(null);

    const {
      colorSpace = THREE.NoColorSpace,
      wrapS = THREE.RepeatWrapping,
      wrapT = THREE.RepeatWrapping,
      anisotropy = 8,
    } = options;

    const url = this.resolvePublicUrl(relPath);
    const cacheKey = `${url}|${colorSpace}`;
    if (this._texturePromises.has(cacheKey)) {
      return this._texturePromises.get(cacheKey);
    }

    if (!this._textureLoader) {
      this._textureLoader = new THREE.TextureLoader();
    }

    const promise = new Promise((resolve) => {
      this._textureLoader.load(
        url,
        (tex) => {
          tex.colorSpace = colorSpace;
          tex.wrapS = wrapS;
          tex.wrapT = wrapT;
          tex.anisotropy = anisotropy;
          tex.needsUpdate = true;
          this._baseTextures.push(tex);
          resolve(tex);
        },
        undefined,
        (err) => {
          console.warn(`[AssetManager3D] Errore caricamento texture (${relPath}):`, err);
          resolve(null);
        }
      );
    });

    this._texturePromises.set(cacheKey, promise);
    return promise;
  }

  /**
   * Carica un set PBR completo (`map`, `normalMap`, `roughnessMap`) dal manifest.
   * Restituisce cloni leggeri con `repeat` personalizzato che condividono la GPU image.
   * @param {string} id
   * @param {{ repeatX?: number, repeatY?: number, anisotropy?: number, wrapS?: number, wrapT?: number }} [options]
   */
  async loadPBRTextureSet(id, options = {}) {
    const manifest = await this.loadManifest();
    const entry = manifest?.textures?.[id];
    if (!entry?.diff) return null;
    if (typeof window === 'undefined') return null;

    const {
      repeatX = 1,
      repeatY = 1,
      anisotropy = 8,
      wrapS = THREE.RepeatWrapping,
      wrapT = THREE.RepeatWrapping,
    } = options;

    const [baseDiff, baseNor, baseRough] = await Promise.all([
      this.loadTexture(entry.diff, {
        colorSpace: THREE.SRGBColorSpace,
        wrapS,
        wrapT,
        anisotropy,
      }),
      entry.nor_gl
        ? this.loadTexture(entry.nor_gl, {
            colorSpace: THREE.NoColorSpace,
            wrapS,
            wrapT,
            anisotropy,
          })
        : Promise.resolve(null),
      entry.rough
        ? this.loadTexture(entry.rough, {
            colorSpace: THREE.NoColorSpace,
            wrapS,
            wrapT,
            anisotropy,
          })
        : Promise.resolve(null),
    ]);

    if (!baseDiff) return null;

    const configureClone = (baseTex, colorSpace) => {
      if (!baseTex) return null;
      const clone = baseTex.clone();
      clone.colorSpace = colorSpace;
      clone.wrapS = wrapS;
      clone.wrapT = wrapT;
      clone.repeat.set(repeatX, repeatY);
      clone.anisotropy = anisotropy;
      clone.needsUpdate = true;
      return clone;
    };

    return {
      map: configureClone(baseDiff, THREE.SRGBColorSpace),
      normalMap: configureClone(baseNor, THREE.NoColorSpace),
      roughnessMap: configureClone(baseRough, THREE.NoColorSpace),
    };
  }

  /**
   * Carica e pre-filtra un HDRI restituendo sia la cubemap PMREM (`envMap`, per riflessi PBR)
   * sia la texture equirettangolare 2K originale (`backgroundMap`, nitida per `scene.background`).
   * @param {string} keyOrPath
   * @param {THREE.WebGLRenderer} renderer
   * @returns {Promise<{ envMap: THREE.Texture, backgroundMap: THREE.Texture } | null>}
   */
  async loadHDRIBundle(keyOrPath, renderer) {
    if (!keyOrPath || !renderer) return null;
    if (typeof window === 'undefined') return null;

    const manifest = await this.loadManifest();
    const relPath = manifest?.hdri?.[keyOrPath]
      || (String(keyOrPath).toLowerCase().endsWith('.hdr') ? keyOrPath : null);
    if (!relPath) return null;

    const url = this.resolvePublicUrl(relPath);
    if (this._hdriCache.has(url)) {
      return this._hdriCache.get(url);
    }
    if (this._hdriPromises.has(url)) {
      return this._hdriPromises.get(url);
    }

    if (!this._rgbeLoader) {
      this._rgbeLoader = new RGBELoader();
    }

    if (!this._pmremGenerator || this._pmremRenderer !== renderer) {
      this._pmremGenerator?.dispose();
      this._pmremRenderer = renderer;
      this._pmremGenerator = new THREE.PMREMGenerator(renderer);
      this._pmremGenerator.compileEquirectangularShader();
    }

    const promise = new Promise((resolve) => {
      this._rgbeLoader.load(
        url,
        (equirectTexture) => {
          try {
            equirectTexture.mapping = THREE.EquirectangularReflectionMapping;
            equirectTexture.minFilter = THREE.LinearFilter;
            equirectTexture.magFilter = THREE.LinearFilter;
            equirectTexture.needsUpdate = true;

            const pmremTarget = this._pmremGenerator.fromEquirectangular(equirectTexture);
            this._pmremTargets.push(pmremTarget);
            this._hdriBackgroundTextures.push(equirectTexture);

            const bundle = {
              envMap: pmremTarget.texture,
              backgroundMap: equirectTexture,
            };
            this._hdriCache.set(url, bundle);
            resolve(bundle);
          } catch (err) {
            console.warn(`[AssetManager3D] Errore PMREM HDRI (${relPath}):`, err);
            equirectTexture.dispose();
            resolve(null);
          }
        },
        undefined,
        (err) => {
          console.warn(`[AssetManager3D] Errore caricamento HDRI (${relPath}):`, err);
          resolve(null);
        }
      );
    });

    this._hdriPromises.set(url, promise);
    return promise;
  }

  /**
   * Wrapper retrocompatibile che restituisce direttamente la `envMap` PMREM.
   * @param {string} keyOrPath
   * @param {THREE.WebGLRenderer} renderer
   */
  async loadHDRI(keyOrPath, renderer) {
    const bundle = await this.loadHDRIBundle(keyOrPath, renderer);
    return bundle ? bundle.envMap : null;
  }

  dispose() {
    for (const tex of this._baseTextures) {
      tex?.dispose?.();
    }
    this._baseTextures = [];
    for (const bgTex of this._hdriBackgroundTextures) {
      bgTex?.dispose?.();
    }
    this._hdriBackgroundTextures = [];
    for (const rt of this._pmremTargets) {
      rt?.dispose?.();
    }
    this._pmremTargets = [];
    this._pmremGenerator?.dispose?.();
    this._pmremGenerator = null;
    this._pmremRenderer = null;
    this._dracoLoader?.dispose?.();
    this._dracoLoader = null;
    this._gltfLoader = null;
    this._gltfPromises.clear();
    this._texturePromises.clear();
    this._hdriPromises.clear();
    this._hdriCache.clear();
  }
}

export const assetManager3D = new AssetManager3D();
