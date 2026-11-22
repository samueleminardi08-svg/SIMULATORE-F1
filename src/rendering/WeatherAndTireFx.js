/**
 * Effetti particellari e atmosferici volumetrici ad alte prestazioni (Presentation Layer):
 * 1. Pioggia 3D inclinata dinamicamente dal vettore velocità della monoposto (2 livelli LineSegments)
 * 2. Spray d'acqua volumetrico multi-flusso (rooster tail RL/RR + pennacchio diffusore ~ v²)
 *    per giocatore e avversari entro 65 m
 * 3. Fumo gomme volumetrico dal punto di contatto della sola ruota anteriore interna bloccata
 *    (`resolveLockedFrontWheels`, espansione morbida 0.24 m -> 2.15 m con rotazione e dissolvenza)
 *
 * Modulo 100% estetico: zero modifiche fisiche, pool preallocati a zero GC, Node.js headless safe.
 */

import * as THREE from 'three';
import { resolveLockedFrontWheels } from '../cars/CarModel3D.js';

export const WEATHER_FX_CONFIG = {
  rain: {
    nearMaxDrops: 520,
    farMaxDrops: 780,
    baseIntensity: 1.0,
    heavyIntensity: 1.65,
    nearBox: { halfX: 16, height: 15, halfZ: 24, forwardBias: 10 },
    farBox: { halfX: 46, height: 32, halfZ: 62, forwardBias: 20 },
    baseFallSpeedNear: 29.0,
    baseFallSpeedFar: 24.0,
    windSideNear: 2.2,
    windSideFar: 3.1,
    minStreakLenNear: 0.42,
    maxStreakLenNear: 2.45,
    minStreakLenFar: 0.65,
    maxStreakLenFar: 3.10,
    speedSlantFactorNear: 0.48,
    speedSlantFactorFar: 0.32,
    cockpitMinClearance: 1.35,
    dayColor: 0xcbd5e1,
    nightColor: 0x9fb8d8,
    nearOpacity: 0.56,
    farOpacity: 0.34,
  },
  spray: {
    poolSize: 160,
    maxCarDistance: 65.0,
    maxTrackedBots: 8,
    minSpeedMs: 11.0,
    diffuserMinSpeedMs: 22.0,
    refSpeedMs: 83.33,
    baseEmitRatePlayer: 46,
    baseEmitRateBot: 26,
    roosterTailStartSize: 0.34,
    roosterTailEndSize: 2.45,
    diffuserStartSize: 0.52,
    diffuserEndSize: 3.65,
    lifeMin: 0.48,
    lifeMax: 0.92,
    dayColor: 0xcdd9e6,
    heavyRainColor: 0x9eb0c4,
    nightColor: 0x6f86a6,
    grassColor: 0x8b867a,
  },
  smoke: {
    poolSize: 96,
    maxBotDistance: 65.0,
    maxTrackedBots: 6,
    minSpeedMs: 5.5,
    startSize: 0.24,
    endSize: 2.15,
    emitRatePerWheelPlayer: 34,
    emitRatePerWheelBot: 16,
    lifeMin: 0.62,
    lifeMax: 1.12,
    dayColor: 0xdde3ec,
    nightColor: 0x7c8ea8,
  },
  teleportResetDistance: 45.0,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapSigned(value, half) {
  const span = half * 2;
  return ((((value + half) % span) + span) % span) - half;
}

function wrapPositive(value, span) {
  return ((value % span) + span) % span;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Genera una CanvasTexture nuvolosa multi-lobo con bordo azzerato radialmente
 * così i billboard ruotati non mostrino mai spigoli o aspetti solidi.
 * @param {'spray' | 'smoke'} variant
 */
function createSoftPuffTexture(variant = 'spray') {
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof ctx.createRadialGradient !== 'function') return null;

  const isSmoke = variant === 'smoke';
  const rand = mulberry32(isSmoke ? 20260319 : 20260705);
  const center = size * 0.5;

  ctx.clearRect(0, 0, size, size);

  // Nucleo morbido centrale
  const coreGrad = ctx.createRadialGradient(center, center, 2, center, center, size * 0.38);
  coreGrad.addColorStop(0.0, isSmoke ? 'rgba(246, 248, 252, 0.72)' : 'rgba(242, 247, 255, 0.54)');
  coreGrad.addColorStop(0.45, isSmoke ? 'rgba(232, 236, 242, 0.42)' : 'rgba(232, 240, 250, 0.28)');
  coreGrad.addColorStop(1.0, 'rgba(220, 228, 240, 0.0)');
  ctx.fillStyle = coreGrad;
  ctx.fillRect(0, 0, size, size);

  // 9 lobi sfalsati per profilo organico turbolento
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2 + (rand() - 0.5) * 0.45;
    const dist = (0.08 + rand() * 0.16) * size;
    const lx = center + Math.cos(angle) * dist;
    const ly = center + Math.sin(angle) * dist;
    const lr = (isSmoke ? 0.17 + rand() * 0.11 : 0.15 + rand() * 0.11) * size;
    const shade = Math.round(218 + rand() * 36);
    const alphaPeak = isSmoke ? 0.34 + rand() * 0.18 : 0.25 + rand() * 0.16;

    const lobe = ctx.createRadialGradient(lx, ly, lr * 0.08, lx, ly, lr);
    lobe.addColorStop(0.0, `rgba(${shade}, ${shade + 2}, ${Math.min(255, shade + 6)}, ${alphaPeak.toFixed(3)})`);
    lobe.addColorStop(0.55, `rgba(${shade}, ${shade + 2}, ${Math.min(255, shade + 6)}, ${(alphaPeak * 0.38).toFixed(3)})`);
    lobe.addColorStop(1.0, `rgba(${shade}, ${shade + 2}, ${Math.min(255, shade + 6)}, 0.0)`);
    ctx.fillStyle = lobe;
    ctx.fillRect(0, 0, size, size);
  }

  // Maschera radiale finale: azzera l'alpha prima del bordo canvas (zero clipping ai bordi)
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createRadialGradient(center, center, size * 0.06, center, center, size * 0.485);
  mask.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  mask.addColorStop(0.65, 'rgba(255, 255, 255, 0.72)');
  mask.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const RAIN_VERTEX_SHADER = /* glsl */ `
  attribute float aAlpha;
  attribute float aShade;

  uniform float uOpacity;
  uniform float uNearFadeStart;
  uniform float uNearFadeEnd;

  varying float vAlpha;
  varying float vShade;
  varying float vFogDepth;

  void main() {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    float viewDist = max(0.0, -mvPos.z);
    float nearFade = smoothstep(uNearFadeStart, uNearFadeEnd, viewDist);
    vAlpha = aAlpha * uOpacity * nearFade;
    vShade = aShade;
    vFogDepth = viewDist;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const RAIN_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  varying float vAlpha;
  varying float vShade;
  varying float vFogDepth;

  void main() {
    if (vAlpha <= 0.002) discard;
    vec3 col = uColor * vShade;
    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
    col = mix(col, uFogColor, clamp(fogFactor, 0.0, 0.88));
    gl_FragColor = vec4(col, vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const BILLBOARD_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aOffset;
  attribute vec4 aParams;
  attribute vec3 aColor;

  uniform float uNearFadeStart;
  uniform float uNearFadeEnd;

  varying vec2 vUv;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vFogDepth;

  void main() {
    vUv = uv;
    float scale = aParams.x;
    float rot = aParams.y;
    float alpha = aParams.z;

    vec4 mvCenter = modelViewMatrix * vec4(aOffset, 1.0);
    float viewDist = max(0.0, -mvCenter.z);
    float nearFade = smoothstep(uNearFadeStart, uNearFadeEnd, viewDist);

    float c = cos(rot);
    float s = sin(rot);
    vec2 localPos = position.xy * scale;
    vec2 rotated = vec2(
      localPos.x * c - localPos.y * s,
      localPos.x * s + localPos.y * c
    );

    vec4 mvPos = mvCenter + vec4(rotated, 0.0, 0.0);
    vAlpha = alpha * nearFade;
    vColor = aColor;
    vFogDepth = viewDist;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const BILLBOARD_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  varying vec2 vUv;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vFogDepth;

  void main() {
    if (vAlpha <= 0.002) discard;

    float shapeAlpha = 1.0;
    float shade = 1.0;
    if (uHasMap > 0.5) {
      vec4 tex = texture2D(uMap, vUv);
      shapeAlpha = tex.a;
      shade = tex.r;
    } else {
      vec2 d = vUv - 0.5;
      shapeAlpha = exp(-dot(d, d) * 14.0);
    }

    float finalAlpha = shapeAlpha * vAlpha;
    if (finalAlpha <= 0.002) discard;

    vec3 col = vColor * (0.76 + 0.24 * shade);
    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
    col = mix(col, uFogColor, clamp(fogFactor, 0.0, 0.85));

    gl_FragColor = vec4(col, finalAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class WeatherAndTireFx {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'WeatherAndTireFx';

    this._sprayTex = createSoftPuffTexture('spray');
    this._smokeTex = createSoftPuffTexture('smoke');

    this._isRain = false;
    this._rainIntensity = 0;
    this._isNight = false;
    this._lastFocusCarId = null;
    this._lastFocusX = 0;
    this._lastFocusY = 0;
    this._lastFocusZ = 0;
    this._hasLastFocus = false;

    this._emitAccumMap = new Map();
    this._smokeAccumMap = new Map();
    this._botCandidates = Array.from({ length: 24 }, () => ({
      carId: '',
      car: null,
      distSq: 0,
      speed: 0,
    }));
    this._botCandidateCount = 0;

    this._tmpColor = new THREE.Color();
    this._tmpFogColor = new THREE.Color(0x6c7c8e);
    this._fogDensity = 0.00092;

    this._lastDebugStats = {
      activeRainNear: 0,
      activeRainFar: 0,
      activeSpray: 0,
      activeSmoke: 0,
      rainIntensity: 0,
      isRain: false,
      lastSprayEmitters: { rl: 0, rr: 0, diffuser: 0 },
      lastSmokeWheels: { fl: 0, fr: 0 },
    };

    const rCfg = WEATHER_FX_CONFIG.rain;
    this._rainNear = this._createRainLayer(
      rCfg.nearMaxDrops,
      rCfg.nearBox,
      {
        baseFallSpeed: rCfg.baseFallSpeedNear,
        windSide: rCfg.windSideNear,
        minLen: rCfg.minStreakLenNear,
        maxLen: rCfg.maxStreakLenNear,
        speedSlantFactor: rCfg.speedSlantFactorNear,
        opacity: rCfg.nearOpacity,
        nearFadeStart: 0.7,
        nearFadeEnd: 2.2,
        renderOrder: 15,
        seed: 1337,
      }
    );
    this._rainFar = this._createRainLayer(
      rCfg.farMaxDrops,
      rCfg.farBox,
      {
        baseFallSpeed: rCfg.baseFallSpeedFar,
        windSide: rCfg.windSideFar,
        minLen: rCfg.minStreakLenFar,
        maxLen: rCfg.maxStreakLenFar,
        speedSlantFactor: rCfg.speedSlantFactorFar,
        opacity: rCfg.farOpacity,
        nearFadeStart: 3.5,
        nearFadeEnd: 9.0,
        renderOrder: 14,
        seed: 4242,
      }
    );

    this._sprayPool = this._createBillboardPool(
      WEATHER_FX_CONFIG.spray.poolSize,
      this._sprayTex,
      12,
      0.85,
      2.4
    );
    this._smokePool = this._createBillboardPool(
      WEATHER_FX_CONFIG.smoke.poolSize,
      this._smokeTex,
      13,
      0.65,
      1.9
    );

    this.group.add(
      this._rainFar.lines,
      this._rainNear.lines,
      this._sprayPool.mesh,
      this._smokePool.mesh
    );
  }

  _createRainLayer(maxDrops, boxCfg, params) {
    const rand = mulberry32(params.seed);
    const positions = new Float32Array(maxDrops * 2 * 3);
    const alphas = new Float32Array(maxDrops * 2);
    const shades = new Float32Array(maxDrops * 2);

    const ox = new Float32Array(maxDrops);
    const oy = new Float32Array(maxDrops);
    const oz = new Float32Array(maxDrops);
    const speedScale = new Float32Array(maxDrops);
    const lenScale = new Float32Array(maxDrops);

    for (let i = 0; i < maxDrops; i++) {
      ox[i] = (rand() - 0.5) * 2 * boxCfg.halfX;
      oy[i] = rand() * boxCfg.height;
      oz[i] = (rand() - 0.5) * 2 * boxCfg.halfZ;
      speedScale[i] = 0.84 + rand() * 0.34;
      lenScale[i] = 0.78 + rand() * 0.44;

      const shade = 0.78 + rand() * 0.27;
      shades[i * 2] = shade;
      shades[i * 2 + 1] = shade;
      alphas[i * 2] = 0.96;
      alphas[i * 2 + 1] = 0.08;
    }

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geo.setAttribute('aShade', new THREE.BufferAttribute(shades, 1));
    geo.setDrawRange(0, 0);

    const mat = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERTEX_SHADER,
      fragmentShader: RAIN_FRAGMENT_SHADER,
      uniforms: {
        uColor: { value: new THREE.Color(WEATHER_FX_CONFIG.rain.dayColor) },
        uOpacity: { value: params.opacity },
        uFogColor: { value: this._tmpFogColor.clone() },
        uFogDensity: { value: this._fogDensity },
        uNearFadeStart: { value: params.nearFadeStart },
        uNearFadeEnd: { value: params.nearFadeEnd },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
    });

    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    lines.visible = false;
    lines.renderOrder = params.renderOrder;

    return {
      lines,
      geo,
      mat,
      posAttr,
      positions,
      maxDrops,
      activeDrops: 0,
      box: boxCfg,
      ox,
      oy,
      oz,
      speedScale,
      lenScale,
      baseFallSpeed: params.baseFallSpeed,
      windSide: params.windSide,
      minLen: params.minLen,
      maxLen: params.maxLen,
      speedSlantFactor: params.speedSlantFactor,
      baseOpacity: params.opacity,
      initialized: false,
      prevFocusX: 0,
      prevFocusY: 0,
      prevFocusZ: 0,
    };
  }

  _createBillboardPool(poolSize, texture, renderOrder, nearFadeStart, nearFadeEnd) {
    const basePositions = new Float32Array([
      -0.5, -0.5, 0,
       0.5, -0.5, 0,
       0.5,  0.5, 0,
      -0.5,  0.5, 0,
    ]);
    const baseUvs = new Float32Array([
      0, 0,
      1, 0,
      1, 1,
      0, 1,
    ]);
    const indices = [0, 1, 2, 0, 2, 3];

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(basePositions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(baseUvs, 2));
    geo.setIndex(indices);

    const offsetArr = new Float32Array(poolSize * 3);
    const paramsArr = new Float32Array(poolSize * 4);
    const colorArr = new Float32Array(poolSize * 3);

    const offsetAttr = new THREE.InstancedBufferAttribute(offsetArr, 3);
    offsetAttr.setUsage(THREE.DynamicDrawUsage);
    const paramsAttr = new THREE.InstancedBufferAttribute(paramsArr, 4);
    paramsAttr.setUsage(THREE.DynamicDrawUsage);
    const colorAttr = new THREE.InstancedBufferAttribute(colorArr, 3);
    colorAttr.setUsage(THREE.DynamicDrawUsage);

    geo.setAttribute('aOffset', offsetAttr);
    geo.setAttribute('aParams', paramsAttr);
    geo.setAttribute('aColor', colorAttr);
    geo.instanceCount = 0;

    const mat = new THREE.ShaderMaterial({
      vertexShader: BILLBOARD_VERTEX_SHADER,
      fragmentShader: BILLBOARD_FRAGMENT_SHADER,
      uniforms: {
        uMap: { value: texture },
        uHasMap: { value: texture ? 1.0 : 0.0 },
        uFogColor: { value: this._tmpFogColor.clone() },
        uFogDensity: { value: this._fogDensity },
        uNearFadeStart: { value: nearFadeStart },
        uNearFadeEnd: { value: nearFadeEnd },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = renderOrder;

    const particles = Array.from({ length: poolSize }, () => ({
      active: false,
      isPlayer: false,
      age: 0,
      maxLife: 1,
      x: 0,
      y: 0,
      z: 0,
      minY: 0.04,
      vx: 0,
      vy: 0,
      vz: 0,
      drag: 3.0,
      gravity: 0,
      startSize: 0.3,
      endSize: 2.0,
      growthPower: 0.78,
      rot: 0,
      rotSpeed: 0,
      peakAlpha: 0.4,
      r: 0.72,
      g: 0.76,
      b: 0.82,
      variant: 0,
    }));

    return {
      poolSize,
      geo,
      mat,
      mesh,
      offsetArr,
      paramsArr,
      colorArr,
      offsetAttr,
      paramsAttr,
      colorAttr,
      particles,
      cursor: 0,
      activeCount: 0,
    };
  }

  _spawnBillboard(pool, cfg) {
    const particles = pool.particles;
    const len = pool.poolSize;
    let chosen = null;

    // 1. Cerca slot libero partendo dal cursore circolare
    for (let step = 0; step < len; step++) {
      const idx = (pool.cursor + step) % len;
      if (!particles[idx].active) {
        chosen = particles[idx];
        pool.cursor = (idx + 1) % len;
        break;
      }
    }

    // 2. Se il pool è pieno, sostituisci lo slot più vecchio non-player (evita starving del giocatore)
    if (!chosen) {
      let bestAgeRatio = -1;
      let fallbackIdx = pool.cursor;
      for (let i = 0; i < len; i++) {
        const p = particles[i];
        if (!cfg.isPlayer && p.isPlayer) continue;
        const ratio = p.age / Math.max(0.01, p.maxLife);
        if (!p.isPlayer && ratio > bestAgeRatio) {
          bestAgeRatio = ratio;
          chosen = p;
          fallbackIdx = i;
        }
      }
      if (!chosen) {
        if (!cfg.isPlayer) return null;
        chosen = particles[pool.cursor];
        fallbackIdx = pool.cursor;
      }
      pool.cursor = (fallbackIdx + 1) % len;
    }

    chosen.active = true;
    chosen.isPlayer = Boolean(cfg.isPlayer);
    chosen.age = 0;
    chosen.maxLife = cfg.maxLife;
    chosen.x = cfg.x;
    chosen.y = cfg.y;
    chosen.z = cfg.z;
    chosen.minY = cfg.minY;
    chosen.vx = cfg.vx;
    chosen.vy = cfg.vy;
    chosen.vz = cfg.vz;
    chosen.drag = cfg.drag;
    chosen.gravity = cfg.gravity;
    chosen.startSize = cfg.startSize;
    chosen.endSize = cfg.endSize;
    chosen.growthPower = cfg.growthPower;
    chosen.rot = cfg.rot;
    chosen.rotSpeed = cfg.rotSpeed;
    chosen.peakAlpha = cfg.peakAlpha;
    chosen.r = cfg.r;
    chosen.g = cfg.g;
    chosen.b = cfg.b;
    chosen.variant = cfg.variant;
    return chosen;
  }

  _stepBillboardPool(pool, dt) {
    const particles = pool.particles;
    const len = pool.poolSize;
    const offsetArr = pool.offsetArr;
    const paramsArr = pool.paramsArr;
    const colorArr = pool.colorArr;

    let writeIdx = 0;
    for (let i = 0; i < len; i++) {
      const p = particles[i];
      if (!p.active) continue;

      p.age += dt;
      if (p.age >= p.maxLife) {
        p.active = false;
        continue;
      }

      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vz *= damp;
      p.vy = p.vy * damp + p.gravity * dt;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < p.minY) {
        p.y = p.minY;
        if (p.vy < 0) p.vy = -p.vy * 0.14;
      }
      p.rot += p.rotSpeed * dt;

      const ageRatio = clamp(p.age / p.maxLife, 0, 1);
      const size = p.startSize + (p.endSize - p.startSize) * Math.pow(ageRatio, p.growthPower);
      const fadeIn = ageRatio < 0.10 ? ageRatio / 0.10 : 1.0;
      const fadeOut = Math.pow(1.0 - ageRatio, 1.45);
      const alpha = p.peakAlpha * fadeIn * fadeOut;

      const oBase = writeIdx * 3;
      const pBase = writeIdx * 4;
      offsetArr[oBase] = p.x;
      offsetArr[oBase + 1] = p.y;
      offsetArr[oBase + 2] = p.z;

      paramsArr[pBase] = size;
      paramsArr[pBase + 1] = p.rot;
      paramsArr[pBase + 2] = alpha;
      paramsArr[pBase + 3] = p.variant;

      colorArr[oBase] = p.r;
      colorArr[oBase + 1] = p.g;
      colorArr[oBase + 2] = p.b;

      writeIdx++;
    }

    pool.geo.instanceCount = writeIdx;
    pool.activeCount = writeIdx;
    pool.mesh.visible = writeIdx > 0;

    if (writeIdx > 0) {
      pool.offsetAttr.needsUpdate = true;
      pool.paramsAttr.needsUpdate = true;
      pool.colorAttr.needsUpdate = true;
    }
  }

  _clearPool(pool) {
    for (let i = 0; i < pool.poolSize; i++) {
      pool.particles[i].active = false;
    }
    pool.geo.instanceCount = 0;
    pool.activeCount = 0;
    pool.mesh.visible = false;
  }

  _syncUniforms(fogColor, fogDensity, isNight, rainIntensity) {
    if (fogColor && typeof fogColor.isColor === 'boolean') {
      this._tmpFogColor.copy(fogColor);
    } else if (typeof fogColor === 'number') {
      this._tmpFogColor.setHex(fogColor);
    }
    if (typeof fogDensity === 'number' && Number.isFinite(fogDensity)) {
      this._fogDensity = fogDensity;
    }

    const rCfg = WEATHER_FX_CONFIG.rain;
    const rainColorHex = isNight ? rCfg.nightColor : rCfg.dayColor;
    const intensityNorm = clamp(rainIntensity / rCfg.heavyIntensity, 0, 1);
    const rainOpacityScale = 0.84 + 0.34 * intensityNorm;

    this._rainNear.mat.uniforms.uColor.value.setHex(rainColorHex);
    this._rainNear.mat.uniforms.uOpacity.value = this._rainNear.baseOpacity * rainOpacityScale;
    this._rainNear.mat.uniforms.uFogColor.value.copy(this._tmpFogColor);
    this._rainNear.mat.uniforms.uFogDensity.value = this._fogDensity;

    this._rainFar.mat.uniforms.uColor.value.setHex(rainColorHex);
    this._rainFar.mat.uniforms.uOpacity.value = this._rainFar.baseOpacity * rainOpacityScale;
    this._rainFar.mat.uniforms.uFogColor.value.copy(this._tmpFogColor);
    this._rainFar.mat.uniforms.uFogDensity.value = this._fogDensity;

    this._sprayPool.mat.uniforms.uFogColor.value.copy(this._tmpFogColor);
    this._sprayPool.mat.uniforms.uFogDensity.value = this._fogDensity;

    this._smokePool.mat.uniforms.uFogColor.value.copy(this._tmpFogColor);
    this._smokePool.mat.uniforms.uFogDensity.value = this._fogDensity;
  }

  configure({
    isRain = false,
    rainIntensity = 0,
    isNight = false,
    fogColor = null,
    fogDensity = null,
  } = {}) {
    this._isRain = Boolean(isRain);
    this._rainIntensity = this._isRain
      ? clamp(rainIntensity > 0 ? rainIntensity : WEATHER_FX_CONFIG.rain.baseIntensity, 0.25, 2.0)
      : 0;
    this._isNight = Boolean(isNight);

    this._syncUniforms(fogColor, fogDensity, this._isNight, this._rainIntensity);

    if (!this._isRain || this._rainIntensity <= 0) {
      this._rainNear.lines.visible = false;
      this._rainFar.lines.visible = false;
      this._rainNear.geo.setDrawRange(0, 0);
      this._rainFar.geo.setDrawRange(0, 0);
      this._rainNear.activeDrops = 0;
      this._rainFar.activeDrops = 0;
      this._lastDebugStats.isRain = false;
      this._lastDebugStats.rainIntensity = 0;
      this._lastDebugStats.activeRainNear = 0;
      this._lastDebugStats.activeRainFar = 0;
    } else {
      const ratio = clamp(this._rainIntensity / WEATHER_FX_CONFIG.rain.heavyIntensity, 0, 1);
      const nearCount = Math.max(1, Math.round(this._rainNear.maxDrops * ratio));
      const farCount = Math.max(1, Math.round(this._rainFar.maxDrops * ratio));
      this._rainNear.activeDrops = nearCount;
      this._rainFar.activeDrops = farCount;
      this._rainNear.geo.setDrawRange(0, nearCount * 2);
      this._rainFar.geo.setDrawRange(0, farCount * 2);
      this._rainNear.lines.visible = true;
      this._rainFar.lines.visible = true;
      this._lastDebugStats.isRain = true;
      this._lastDebugStats.rainIntensity = this._rainIntensity;
      this._lastDebugStats.activeRainNear = nearCount;
      this._lastDebugStats.activeRainFar = farCount;
    }
  }

  setVisible(visible) {
    this.group.visible = Boolean(visible);
    if (!this.group.visible) {
      this._rainNear.lines.visible = false;
      this._rainFar.lines.visible = false;
    }
  }

  reset() {
    this._clearPool(this._sprayPool);
    this._clearPool(this._smokePool);
    this._emitAccumMap.clear();
    this._smokeAccumMap.clear();
    this._rainNear.initialized = false;
    this._rainFar.initialized = false;
    this._hasLastFocus = false;
    this._lastDebugStats.activeSpray = 0;
    this._lastDebugStats.activeSmoke = 0;
    this._lastDebugStats.lastSprayEmitters.rl = 0;
    this._lastDebugStats.lastSprayEmitters.rr = 0;
    this._lastDebugStats.lastSprayEmitters.diffuser = 0;
    this._lastDebugStats.lastSmokeWheels.fl = 0;
    this._lastDebugStats.lastSmokeWheels.fr = 0;
  }

  _updateRainLayer(layer, activeCar, cameraPos, rainIntensity, dt, isNear, teleported) {
    const ratio = clamp(rainIntensity / WEATHER_FX_CONFIG.rain.heavyIntensity, 0, 1);
    const activeCount = Math.max(1, Math.round(layer.maxDrops * ratio));
    layer.activeDrops = activeCount;
    layer.geo.setDrawRange(0, activeCount * 2);

    const box = layer.box;
    const heading = activeCar.heading || 0;
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    const focusX = (activeCar.x || 0) + sinH * box.forwardBias;
    const focusY = activeCar.y || 0;
    const focusZ = (activeCar.z || 0) + cosH * box.forwardBias;

    const carVx = Number.isFinite(activeCar.vx)
      ? activeCar.vx
      : sinH * (activeCar.forwardSpeed || 0);
    const carVz = Number.isFinite(activeCar.vz)
      ? activeCar.vz
      : cosH * (activeCar.forwardSpeed || 0);
    const speedMs = Math.hypot(carVx, carVz);

    if (!layer.initialized || teleported) {
      layer.prevFocusX = focusX;
      layer.prevFocusY = focusY;
      layer.prevFocusZ = focusZ;
      layer.initialized = true;
    }

    let dxFocus = focusX - layer.prevFocusX;
    let dyFocus = focusY - layer.prevFocusY;
    let dzFocus = focusZ - layer.prevFocusZ;
    layer.prevFocusX = focusX;
    layer.prevFocusY = focusY;
    layer.prevFocusZ = focusZ;

    if (Math.abs(dxFocus) > box.halfX * 2 || Math.abs(dzFocus) > box.halfZ * 2) {
      dxFocus = 0;
      dyFocus = 0;
      dzFocus = 0;
    }

    const fallSpeed = layer.baseFallSpeed * (0.92 + 0.16 * rainIntensity);
    const windX = layer.windSide * (0.85 + 0.25 * rainIntensity);
    const windZ = layer.windSide * 0.45 * (0.85 + 0.25 * rainIntensity);

    // Velocità relativa della pioggia rispetto all'osservatore/vettura
    const relVx = windX - carVx * layer.speedSlantFactor;
    const relVy = -fallSpeed;
    const relVz = windZ - carVz * layer.speedSlantFactor;
    const relMag = Math.hypot(relVx, relVy, relVz) || 1;
    const dirX = relVx / relMag;
    const dirY = relVy / relMag;
    const dirZ = relVz / relMag;

    const speedNorm = clamp(speedMs / 85.0, 0, 1);
    const baseStreakLen =
      (layer.minLen + (layer.maxLen - layer.minLen) * Math.pow(speedNorm, 0.85)) *
      (0.9 + 0.14 * rainIntensity);

    const minClearSq = isNear
      ? WEATHER_FX_CONFIG.rain.cockpitMinClearance * WEATHER_FX_CONFIG.rain.cockpitMinClearance
      : 0;
    const checkCam = Boolean(isNear && cameraPos);

    const pos = layer.positions;
    const oxArr = layer.ox;
    const oyArr = layer.oy;
    const ozArr = layer.oz;
    const spArr = layer.speedScale;
    const lnArr = layer.lenScale;

    for (let i = 0; i < activeCount; i++) {
      const ox = wrapSigned(oxArr[i] - dxFocus + windX * dt, box.halfX);
      const oy = wrapPositive(oyArr[i] - dyFocus - fallSpeed * spArr[i] * dt, box.height);
      const oz = wrapSigned(ozArr[i] - dzFocus + windZ * dt, box.halfZ);

      oxArr[i] = ox;
      oyArr[i] = oy;
      ozArr[i] = oz;

      const hx = focusX + ox;
      const hy = focusY + oy;
      const hz = focusZ + oz;

      const v0 = i * 6;
      if (checkCam) {
        const cdx = hx - cameraPos.x;
        const cdy = hy - cameraPos.y;
        const cdz = hz - cameraPos.z;
        if (cdx * cdx + cdy * cdy + cdz * cdz < minClearSq) {
          pos[v0] = hx;
          pos[v0 + 1] = hy - 500;
          pos[v0 + 2] = hz;
          pos[v0 + 3] = hx;
          pos[v0 + 4] = hy - 500;
          pos[v0 + 5] = hz;
          continue;
        }
      }

      const len = baseStreakLen * lnArr[i];
      pos[v0] = hx;
      pos[v0 + 1] = hy;
      pos[v0 + 2] = hz;
      pos[v0 + 3] = hx - dirX * len;
      pos[v0 + 4] = hy - dirY * len;
      pos[v0 + 5] = hz - dirZ * len;
    }

    layer.posAttr.needsUpdate = true;
    layer.lines.visible = true;
  }

  _collectNearbyBots(carsMap, followedCarId, focusX, focusZ, maxDist, maxCount, minSpeed) {
    this._botCandidateCount = 0;
    if (!carsMap) return 0;
    const maxDistSq = maxDist * maxDist;

    for (const [carId, car] of Object.entries(carsMap)) {
      if (!car || carId === followedCarId) continue;
      const speed = Math.abs(car.forwardSpeed ?? car.speed ?? Math.hypot(car.vx ?? 0, car.vz ?? 0));
      if (speed < minSpeed) continue;
      const dx = (car.x || 0) - focusX;
      const dz = (car.z || 0) - focusZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > maxDistSq) continue;

      let insertIdx = this._botCandidateCount;
      const cap = this._botCandidates.length;
      if (insertIdx < cap) {
        this._botCandidateCount++;
      } else if (distSq >= this._botCandidates[cap - 1].distSq) {
        continue;
      } else {
        insertIdx = cap - 1;
      }

      while (insertIdx > 0 && this._botCandidates[insertIdx - 1].distSq > distSq) {
        const dst = this._botCandidates[insertIdx];
        const src = this._botCandidates[insertIdx - 1];
        dst.carId = src.carId;
        dst.car = src.car;
        dst.distSq = src.distSq;
        dst.speed = src.speed;
        insertIdx--;
      }

      const slot = this._botCandidates[insertIdx];
      slot.carId = carId;
      slot.car = car;
      slot.distSq = distSq;
      slot.speed = speed;
    }

    return Math.min(this._botCandidateCount, maxCount);
  }

  _emitSprayForCar(carId, car, carModel, isPlayer, rainIntensity, isNight, dt, botScale) {
    const sCfg = WEATHER_FX_CONFIG.spray;
    const heading = car.heading || 0;
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    const leftX = cosH;
    const leftZ = -sinH;
    const carVx = Number.isFinite(car.vx) ? car.vx : sinH * (car.forwardSpeed || 0);
    const carVz = Number.isFinite(car.vz) ? car.vz : cosH * (car.forwardSpeed || 0);
    const absSpeed = Math.hypot(carVx, carVz);
    if (absSpeed < sCfg.minSpeedMs) return;

    const speedRatio = clamp((absSpeed - sCfg.minSpeedMs) / (sCfg.refSpeedMs - sCfg.minSpeedMs), 0, 1.25);
    const vNormSq = clamp((absSpeed / sCfg.refSpeedMs) * (absSpeed / sCfg.refSpeedMs), 0, 1.35);
    const rateBase = isPlayer ? sCfg.baseEmitRatePlayer : sCfg.baseEmitRateBot * botScale;
    const totalRate = rateBase * (0.28 + 0.92 * speedRatio) * clamp(rainIntensity, 0.75, 1.65);

    const prevAccum = this._emitAccumMap.get(carId) || 0;
    const nextAccum = prevAccum + totalRate * dt;
    const count = Math.min(6, Math.floor(nextAccum));
    this._emitAccumMap.set(carId, nextAccum - count);
    if (count <= 0) return;

    const rlWheel = carModel?.wheels?.rl;
    const rrWheel = carModel?.wheels?.rr;
    const rlX = rlWheel?.baseX ?? 0.75;
    const rlZ = rlWheel?.baseZ ?? -1.75;
    const rrX = rrWheel?.baseX ?? -0.75;
    const rrZ = rrWheel?.baseZ ?? -1.75;
    const rearZ = (rlZ + rrZ) * 0.5;
    const carY = car.y || 0;

    // Colore coerente giorno / pioggia forte / notte / fuori pista
    let colorHex = sCfg.dayColor;
    if (car.surface === 'grass') {
      colorHex = sCfg.grassColor;
    } else if (isNight) {
      colorHex = sCfg.nightColor;
    } else if (rainIntensity > 1.3) {
      colorHex = sCfg.heavyRainColor;
    }
    this._tmpColor.setHex(colorHex);
    const r = this._tmpColor.r;
    const g = this._tmpColor.g;
    const b = this._tmpColor.b;

    const canDiffuser = absSpeed >= sCfg.diffuserMinSpeedMs;
    const diffuserWeight = canDiffuser ? clamp(0.18 + 0.34 * vNormSq, 0.15, 0.46) : 0;

    for (let i = 0; i < count; i++) {
      const roll = Math.random();
      let stream = 'rl';
      if (canDiffuser && roll < diffuserWeight) {
        stream = 'diffuser';
      } else if (roll < diffuserWeight + (1 - diffuserWeight) * 0.5) {
        stream = 'rl';
      } else {
        stream = 'rr';
      }

      if (stream === 'diffuser') {
        const latJitter = (Math.random() - 0.5) * 0.36;
        const backOffset = rearZ - 0.58 - Math.random() * 0.28;
        const maxLife = sCfg.lifeMin + 0.14 + Math.random() * (sCfg.lifeMax - sCfg.lifeMin);
        const startSize = sCfg.diffuserStartSize + Math.random() * 0.14;
        const endSize = 2.45 + 1.20 * Math.min(1.15, vNormSq);
        const peakAlpha = clamp(
          (0.15 + 0.22 * vNormSq) * clamp(rainIntensity, 0.8, 1.55) * (isPlayer ? 1.0 : 0.85),
          0.12,
          0.42
        );

        this._spawnBillboard(this._sprayPool, {
          isPlayer,
          maxLife,
          x: car.x + leftX * latJitter + sinH * backOffset,
          y: carY + 0.18 + Math.random() * 0.16,
          z: car.z + leftZ * latJitter + cosH * backOffset,
          minY: carY + 0.05,
          vx: carVx * 0.34 + leftX * (Math.random() - 0.5) * 1.4 - sinH * (1.5 + 2.2 * vNormSq),
          vy: 2.1 + 4.6 * vNormSq + Math.random() * 0.9,
          vz: carVz * 0.34 + leftZ * (Math.random() - 0.5) * 1.4 - cosH * (1.5 + 2.2 * vNormSq),
          drag: 2.8,
          gravity: -1.9,
          startSize,
          endSize,
          growthPower: 0.72,
          rot: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 1.6,
          peakAlpha,
          r,
          g,
          b,
          variant: 1,
        });
        this._lastDebugStats.lastSprayEmitters.diffuser++;
      } else {
        const isLeft = stream === 'rl';
        const baseX = isLeft ? rlX : rrX;
        const baseZ = isLeft ? rlZ : rrZ;
        const sideSign = isLeft ? 1 : -1;
        const backOffset = baseZ - 0.38 - Math.random() * 0.22;
        const maxLife = sCfg.lifeMin + Math.random() * (sCfg.lifeMax - sCfg.lifeMin) * 0.85;
        const startSize = sCfg.roosterTailStartSize + Math.random() * 0.12;
        const endSize = (2.05 + 0.65 * speedRatio) * (rainIntensity > 1.3 ? 1.1 : 1.0);
        const peakAlpha = clamp(
          (0.16 + 0.18 * speedRatio) * clamp(rainIntensity, 0.8, 1.5) * (isPlayer ? 1.0 : 0.82),
          0.14,
          0.38
        );

        this._spawnBillboard(this._sprayPool, {
          isPlayer,
          maxLife,
          x: car.x + leftX * (baseX + (Math.random() - 0.5) * 0.14) + sinH * backOffset,
          y: carY + 0.16 + Math.random() * 0.26,
          z: car.z + leftZ * (baseX + (Math.random() - 0.5) * 0.14) + cosH * backOffset,
          minY: carY + 0.04,
          vx: carVx * 0.38 + leftX * sideSign * (0.45 + Math.random() * 0.75) - sinH * (1.2 + speedRatio * 1.6),
          vy: 1.7 + 2.4 * speedRatio + Math.random() * 0.85,
          vz: carVz * 0.38 + leftZ * sideSign * (0.45 + Math.random() * 0.75) - cosH * (1.2 + speedRatio * 1.6),
          drag: 3.3,
          gravity: -2.4,
          startSize,
          endSize,
          growthPower: 0.76,
          rot: Math.random() * Math.PI * 2,
          rotSpeed: sideSign * (0.9 + Math.random() * 1.2),
          peakAlpha,
          r,
          g,
          b,
          variant: 0,
        });
        if (isLeft) {
          this._lastDebugStats.lastSprayEmitters.rl++;
        } else {
          this._lastDebugStats.lastSprayEmitters.rr++;
        }
      }
    }
  }

  _emitLockupSmokeForCar(carId, car, carModel, isPlayer, isRain, isNight, dt) {
    if (!car?.aeroTire?.wheelLockup) return;
    const smCfg = WEATHER_FX_CONFIG.smoke;
    const carVx = Number.isFinite(car.vx) ? car.vx : Math.sin(car.heading || 0) * (car.forwardSpeed || 0);
    const carVz = Number.isFinite(car.vz) ? car.vz : Math.cos(car.heading || 0) * (car.forwardSpeed || 0);
    const absSpeed = Math.hypot(carVx, carVz);
    if (absSpeed < smCfg.minSpeedMs) return;

    const locked = resolveLockedFrontWheels(car);
    if (!locked.any) return;

    const speedRatio = clamp((absSpeed - smCfg.minSpeedMs) / 55.0, 0.2, 1.0);
    const wheelCount = (locked.fl ? 1 : 0) + (locked.fr ? 1 : 0);
    const rate =
      (isPlayer ? smCfg.emitRatePerWheelPlayer : smCfg.emitRatePerWheelBot) *
      wheelCount *
      (0.55 + 0.65 * speedRatio) *
      (isRain ? 0.55 : 1.0);

    const prevAccum = this._smokeAccumMap.get(carId) || 0;
    const nextAccum = prevAccum + rate * dt;
    const count = Math.min(5, Math.floor(nextAccum));
    this._smokeAccumMap.set(carId, nextAccum - count);
    if (count <= 0) return;

    const heading = car.heading || 0;
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    const leftX = cosH;
    const leftZ = -sinH;
    const carY = car.y || 0;

    const flWheel = carModel?.wheels?.fl;
    const frWheel = carModel?.wheels?.fr;
    const flX = flWheel?.baseX ?? 0.78;
    const flZ = flWheel?.baseZ ?? 1.50;
    const frX = frWheel?.baseX ?? -0.78;
    const frZ = frWheel?.baseZ ?? 1.50;

    const colorHex = isNight ? smCfg.nightColor : smCfg.dayColor;
    this._tmpColor.setHex(colorHex);
    const r = this._tmpColor.r;
    const g = this._tmpColor.g;
    const b = this._tmpColor.b;

    const peakAlpha = (isRain ? 0.28 : 0.54) * (0.65 + 0.35 * speedRatio) * (isPlayer ? 1.0 : 0.78);

    for (let i = 0; i < count; i++) {
      let useFl = locked.fl;
      if (locked.fl && locked.fr) {
        useFl = i % 2 === 0;
      }

      const baseX = useFl ? flX : frX;
      const baseZ = useFl ? flZ : frZ;
      const sideSign = useFl ? 1 : -1;
      const contactZ = baseZ - 0.14 + (Math.random() - 0.5) * 0.12;
      const contactX = baseX + (Math.random() - 0.5) * 0.10;
      const maxLife = smCfg.lifeMin + Math.random() * (smCfg.lifeMax - smCfg.lifeMin);

      this._spawnBillboard(this._smokePool, {
        isPlayer,
        maxLife,
        x: car.x + leftX * contactX + sinH * contactZ,
        y: carY + 0.08 + Math.random() * 0.06,
        z: car.z + leftZ * contactX + cosH * contactZ,
        minY: carY + 0.05,
        vx: carVx * 0.22 + leftX * sideSign * (0.4 + Math.random() * 0.9),
        vy: 0.55 + Math.random() * 0.70,
        vz: carVz * 0.22 + leftZ * sideSign * (0.4 + Math.random() * 0.9),
        drag: 4.2,
        gravity: 0.25,
        startSize: smCfg.startSize,
        endSize: smCfg.endSize,
        growthPower: 0.72,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() < 0.5 ? -1 : 1) * (1.0 + Math.random() * 1.3),
        peakAlpha,
        r,
        g,
        b,
        variant: 2,
      });

      if (useFl) {
        this._lastDebugStats.lastSmokeWheels.fl++;
      } else {
        this._lastDebugStats.lastSmokeWheels.fr++;
      }
    }
  }

  update({
    worldState = null,
    followedCarId = null,
    activeCar = null,
    carMeshes = null,
    camera = null,
    weatherId = 'dry',
    rainIntensity = 0,
    isNight = false,
    fogColor = null,
    fogDensity = null,
    dt = 1 / 60,
  } = {}) {
    if (!this.group.visible) return;

    const safeDt = clamp(
      typeof dt === 'number' && Number.isFinite(dt) && dt > 0 ? dt : 1 / 60,
      0.001,
      0.05
    );
    const isRain = weatherId === 'rain' && rainIntensity > 0;
    const effectiveRainIntensity = isRain ? rainIntensity : 0;

    if (isRain !== this._isRain || Math.abs(effectiveRainIntensity - this._rainIntensity) > 1e-4 || isNight !== this._isNight) {
      this.configure({
        isRain,
        rainIntensity: effectiveRainIntensity,
        isNight,
        fogColor,
        fogDensity,
      });
    } else {
      this._syncUniforms(fogColor, fogDensity, isNight, effectiveRainIntensity);
    }

    // Rilevamento cambio vettura o teletrasporto (> 45 m): reset particelle stantie
    let teleported = false;
    if (activeCar) {
      const fx = activeCar.x || 0;
      const fy = activeCar.y || 0;
      const fz = activeCar.z || 0;
      if (this._lastFocusCarId !== followedCarId || !this._hasLastFocus) {
        teleported = true;
      } else {
        const jumpDist = Math.hypot(fx - this._lastFocusX, fz - this._lastFocusZ);
        if (jumpDist > WEATHER_FX_CONFIG.teleportResetDistance || Math.abs(fy - this._lastFocusY) > 15) {
          teleported = true;
        }
      }
      this._lastFocusCarId = followedCarId;
      this._lastFocusX = fx;
      this._lastFocusY = fy;
      this._lastFocusZ = fz;
      this._hasLastFocus = true;

      if (teleported) {
        this.reset();
        this._lastFocusCarId = followedCarId;
        this._lastFocusX = fx;
        this._lastFocusY = fy;
        this._lastFocusZ = fz;
        this._hasLastFocus = true;
      }
    }

    // 1. Pioggia 3D su 2 livelli di profondità
    if (isRain && activeCar) {
      const cameraPos = camera?.position ?? null;
      this._updateRainLayer(
        this._rainNear,
        activeCar,
        cameraPos,
        effectiveRainIntensity,
        safeDt,
        true,
        teleported
      );
      this._updateRainLayer(
        this._rainFar,
        activeCar,
        cameraPos,
        effectiveRainIntensity,
        safeDt,
        false,
        teleported
      );
    } else {
      this._rainNear.lines.visible = false;
      this._rainFar.lines.visible = false;
      this._rainNear.activeDrops = 0;
      this._rainFar.activeDrops = 0;
    }

    // 2. Emissione spray d'acqua (3 flussi su player + bot vicini <= 65 m)
    const carsMap = worldState?.cars ?? null;
    if (isRain && activeCar) {
      const pCarId = followedCarId || activeCar.id || 'player';
      const pModel = carMeshes?.get?.(pCarId) ?? null;
      this._emitSprayForCar(pCarId, activeCar, pModel, true, effectiveRainIntensity, isNight, safeDt, 1.0);

      if (carsMap) {
        const botCount = this._collectNearbyBots(
          carsMap,
          pCarId,
          activeCar.x || 0,
          activeCar.z || 0,
          WEATHER_FX_CONFIG.spray.maxCarDistance,
          WEATHER_FX_CONFIG.spray.maxTrackedBots,
          WEATHER_FX_CONFIG.spray.minSpeedMs
        );
        const densityScale = botCount > 4 ? 4 / botCount : 1.0;
        for (let i = 0; i < botCount; i++) {
          const cand = this._botCandidates[i];
          const distFactor = 1 - Math.sqrt(cand.distSq) / (WEATHER_FX_CONFIG.spray.maxCarDistance * 1.25);
          const botModel = carMeshes?.get?.(cand.carId) ?? null;
          this._emitSprayForCar(
            cand.carId,
            cand.car,
            botModel,
            false,
            effectiveRainIntensity,
            isNight,
            safeDt,
            clamp(distFactor * densityScale, 0.25, 1.0)
          );
        }
      }
    }

    // 3. Emissione fumo bloccaggio gomme (sola ruota anteriore interna bloccata)
    if (activeCar) {
      const pCarId = followedCarId || activeCar.id || 'player';
      const pModel = carMeshes?.get?.(pCarId) ?? null;
      this._emitLockupSmokeForCar(pCarId, activeCar, pModel, true, isRain, isNight, safeDt);

      if (carsMap) {
        const smokeBots = this._collectNearbyBots(
          carsMap,
          pCarId,
          activeCar.x || 0,
          activeCar.z || 0,
          WEATHER_FX_CONFIG.smoke.maxBotDistance,
          WEATHER_FX_CONFIG.smoke.maxTrackedBots,
          WEATHER_FX_CONFIG.smoke.minSpeedMs
        );
        for (let i = 0; i < smokeBots; i++) {
          const cand = this._botCandidates[i];
          if (!cand.car?.aeroTire?.wheelLockup) continue;
          const botModel = carMeshes?.get?.(cand.carId) ?? null;
          this._emitLockupSmokeForCar(cand.carId, cand.car, botModel, false, isRain, isNight, safeDt);
        }
      }
    }

    // 4. Integrazione particelle & upload GPU
    this._stepBillboardPool(this._sprayPool, safeDt);
    this._stepBillboardPool(this._smokePool, safeDt);

    this._lastDebugStats.activeRainNear = this._rainNear.lines.visible ? this._rainNear.activeDrops : 0;
    this._lastDebugStats.activeRainFar = this._rainFar.lines.visible ? this._rainFar.activeDrops : 0;
    this._lastDebugStats.activeSpray = this._sprayPool.activeCount;
    this._lastDebugStats.activeSmoke = this._smokePool.activeCount;
    this._lastDebugStats.rainIntensity = effectiveRainIntensity;
    this._lastDebugStats.isRain = isRain;
  }

  getDebugStats() {
    return {
      activeRainNear: this._lastDebugStats.activeRainNear,
      activeRainFar: this._lastDebugStats.activeRainFar,
      activeSpray: this._lastDebugStats.activeSpray,
      activeSmoke: this._lastDebugStats.activeSmoke,
      rainIntensity: this._lastDebugStats.rainIntensity,
      isRain: this._lastDebugStats.isRain,
      lastSprayEmitters: { ...this._lastDebugStats.lastSprayEmitters },
      lastSmokeWheels: { ...this._lastDebugStats.lastSmokeWheels },
    };
  }

  dispose() {
    this._rainNear.geo.dispose();
    this._rainNear.mat.dispose();
    this._rainFar.geo.dispose();
    this._rainFar.mat.dispose();
    this._sprayPool.geo.dispose();
    this._sprayPool.mat.dispose();
    this._smokePool.geo.dispose();
    this._smokePool.mat.dispose();
    this._sprayTex?.dispose();
    this._smokeTex?.dispose();
  }
}
