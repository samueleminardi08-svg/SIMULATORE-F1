/**
 * Cupola celeste notturna 100% procedurale (Presentation Layer):
 * 1. Gradiente atmosferico profondo + Via Lattea fBm con bande di polvere scura
 *    + alone luminoso caldo/urbano all'orizzonte + aureola lunare
 * 2. Campo stellare astronomico (THREE.Points shader custom): distribuzione realistica
 *    delle magnitudini, temperatura colore stellare, scintillio lento, estinzione all'orizzonte
 * 3. Luna procedurale con fase configurabile (default gibbosa crescente ~75%), mari e crateri
 * 4. Silhouette lontana procedurale leggera (skyline urbano / marina / dune)
 *
 * Segue sempre la posizione della camera (nessun parallasse), non richiede download esterni
 * ed è sicura nei test Node.js headless.
 */

import * as THREE from 'three';
import {
  DEFAULT_NIGHT_QUALITY,
  NIGHT_SKY_PARAMS,
  getNightCircuitProfile,
  getNightQualityConfig,
} from './NightLightingConfig.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function computeGalacticBasis(tiltDeg, azimuthDeg) {
  const tilt = degToRad(tiltDeg);
  const az = degToRad(azimuthDeg);
  const normal = new THREE.Vector3(
    Math.sin(tilt) * Math.cos(az),
    Math.cos(tilt),
    Math.sin(tilt) * Math.sin(az)
  ).normalize();
  const ref = Math.abs(normal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(ref, normal).normalize();
  const up = new THREE.Vector3().crossVectors(normal, right).normalize();
  return { right, up, normal };
}

function computeMoonDirection(azimuthDeg, elevationDeg, outVec = new THREE.Vector3()) {
  const az = degToRad(azimuthDeg);
  const el = degToRad(elevationDeg);
  const cosEl = Math.cos(el);
  return outVec.set(
    cosEl * Math.sin(az),
    Math.sin(el),
    cosEl * Math.cos(az)
  ).normalize();
}

// =============================================================================
// SHADER 1: Cupola atmosferica + Via Lattea fBm + Light Pollution + Moon Halo
// =============================================================================
const DOME_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vWorldDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DOME_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uZenithColor;
  uniform vec3 uMidSkyColor;
  uniform vec3 uHorizonSkyColor;
  uniform vec3 uGroundColor;
  uniform vec3 uHorizonGlowColor;
  uniform vec3 uHorizonAccentColor;
  uniform float uHorizonIntensity;
  uniform float uHorizonHeight;
  uniform float uHorizonEnabled;

  uniform vec3 uGalacticRight;
  uniform vec3 uGalacticUp;
  uniform vec3 uGalacticNormal;
  uniform float uMilkyWayIntensity;
  uniform float uMilkyWayDust;

  uniform vec3 uMoonDir;
  uniform float uMoonHaloIntensity;
  uniform float uMoonEnabled;
  uniform float uRainFactor;

  varying vec3 vWorldDir;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);

    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);
    return mix(nxy0, nxy1, f.z);
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float amp = 0.52;
    for (int i = 0; i < 4; i++) {
      v += amp * noise3(p);
      p = p * 2.07 + vec3(13.7, -7.3, 5.1);
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    float elev = clamp(dir.y, 0.0, 1.0);

    // 1. Gradiente atmosferico profondo (non nero piatto)
    float midBlend = smoothstep(0.0, 0.28, elev);
    float zenBlend = smoothstep(0.18, 0.85, elev);
    vec3 skyCol = mix(uHorizonSkyColor, uMidSkyColor, midBlend);
    skyCol = mix(skyCol, uZenithColor, zenBlend);

    // Leggera velatura nuvolosa durante pioggia notturna
    vec3 rainCloudTint = mix(uHorizonSkyColor * 0.9, uHorizonGlowColor * 0.35, 0.35);
    skyCol = mix(skyCol, rainCloudTint, uRainFactor * 0.45);

    // 2. Alone luminoso all'orizzonte (light pollution per circuito, concentrato in basso)
    float az = atan(dir.z, dir.x);
    float clusterVar = 0.78 + 0.16 * sin(az * 2.0 + 0.9) + 0.10 * cos(az * 5.0 - 1.1) + 0.06 * sin(az * 9.0 + 2.4);
    float hFalloff = exp(-elev / max(0.03, uHorizonHeight));
    float hSharp = exp(-elev / max(0.015, uHorizonHeight * 0.34));
    float horizonMask = smoothstep(-0.03, 0.012, dir.y) * uHorizonEnabled;

    // In pioggia la luce urbana rimbalza sulle nubi basse aumentando leggermente il bagliore diffuso
    float rainGlowBoost = 1.0 + uRainFactor * 0.25;
    float glowAmt = (pow(hFalloff, 1.35) * 0.52 + hSharp * 0.54) * uHorizonIntensity * clusterVar * horizonMask * rainGlowBoost;
    vec3 warmUrban = mix(uHorizonGlowColor, uHorizonAccentColor, 0.22 * (0.5 + 0.5 * sin(az * 3.0 - 0.6)));
    skyCol += warmUrban * glowAmt * 0.40;

    // 3. Via Lattea procedurale (fBm + bande di polvere scura + estinzione orizzonte)
    if (uMilkyWayIntensity > 0.001 && dir.y > 0.02) {
      float gLat = dot(dir, uGalacticNormal);
      vec3 gCoord = vec3(
        dot(dir, uGalacticRight),
        dot(dir, uGalacticUp),
        gLat
      );

      float bandCore = exp(-(gLat * gLat) / 0.042);
      float bandWide = exp(-(gLat * gLat) / 0.16);

      float clouds = fbm(gCoord * 3.8 + vec3(1.2, 4.1, 0.7));
      float fineDetail = fbm(gCoord * 9.5 + vec3(-3.4, 2.1, 6.2));
      float dustRift = smoothstep(0.36, 0.72, fbm(gCoord * 6.2 + vec3(7.1, -2.8, 1.9)))
        * exp(-(gLat * gLat) / 0.011);

      float mw = (bandCore * (0.55 + 0.75 * clouds) + bandWide * 0.30 * fineDetail);
      mw *= (1.0 - dustRift * uMilkyWayDust);

      // Estinzione atmosferica all'orizzonte e attenuazione da inquinamento luminoso + pioggia
      float extinction = smoothstep(0.06, 0.36, elev);
      float urbanWash = clamp(1.0 - glowAmt * 0.62, 0.18, 1.0);
      float mwFinal = max(0.0, mw) * uMilkyWayIntensity * extinction * urbanWash * (1.0 - 0.82 * uRainFactor);

      vec3 mwCol = mix(vec3(0.48, 0.58, 0.82), vec3(0.86, 0.78, 0.68), smoothstep(0.35, 0.78, clouds) * bandCore);
      skyCol += mwCol * mwFinal;
    }

    // 4. Alone atmosferico attorno alla Luna
    if (uMoonEnabled > 0.5 && dir.y > -0.02) {
      float mCos = max(dot(dir, normalize(uMoonDir)), 0.0);
      float wideHalo = pow(mCos, 16.0) * 0.22;
      float tightHalo = pow(mCos, 140.0) * 0.55;
      float horizonFade = smoothstep(-0.01, 0.12, dir.y);
      vec3 moonHaloCol = vec3(0.62, 0.74, 0.96);
      skyCol += moonHaloCol * (wideHalo + tightHalo) * uMoonHaloIntensity * horizonFade * (1.0 - 0.52 * uRainFactor);
    }

    // 5. Sotto l'orizzonte: sfuma pulito verso tono scuro terreno
    float belowMask = smoothstep(0.01, -0.08, dir.y);
    skyCol = mix(skyCol, uGroundColor, belowMask);

    gl_FragColor = vec4(skyCol, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// =============================================================================
// SHADER 2: Campo stellare astronomico (punti circolari sub-pixel + scintillio)
// =============================================================================
const STAR_VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute float aBrightness;
  attribute vec3 aColor;
  attribute float aPhase;
  attribute float aTwinkleRate;

  uniform float uPixelRatio;

  varying float vBrightness;
  varying vec3 vColor;
  varying float vPhase;
  varying float vTwinkleRate;
  varying float vElevation;

  void main() {
    vec3 dir = normalize(position);
    vElevation = dir.y;
    vBrightness = aBrightness;
    vColor = aColor;
    vPhase = aPhase;
    vTwinkleRate = aTwinkleRate;

    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPos;
    gl_PointSize = clamp(aSize * uPixelRatio, 1.25, 7.5);
  }
`;

const STAR_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uTwinkleSpeed;
  uniform float uTwinkleAmp;
  uniform float uExtinctionPower;
  uniform float uHorizonIntensity;
  uniform float uRainFactor;

  varying float vBrightness;
  varying vec3 vColor;
  varying float vPhase;
  varying float vTwinkleRate;
  varying float vElevation;

  void main() {
    if (vElevation <= 0.012) discard;

    vec2 uv = gl_PointCoord - 0.5;
    float r2 = dot(uv, uv);
    if (r2 > 0.25) discard;

    // Profilo ottico circolare morbido (nessun quadratino)
    float core = exp(-r2 * 22.0);
    float halo = exp(-r2 * 6.5) * 0.26;
    float shape = core + halo;

    // Estinzione atmosferica vicino all'orizzonte + impatto inquinamento luminoso
    float ext = pow(smoothstep(0.018, 0.27, vElevation), uExtinctionPower);
    float urbanFade = mix(1.0, clamp(1.0 - uHorizonIntensity * 0.55, 0.35, 1.0), 1.0 - smoothstep(0.06, 0.42, vElevation));

    // Scintillio lento e sottile (più marcato vicino all'orizzonte, calmo allo zenit)
    float altScale = mix(1.0, 0.22, smoothstep(0.06, 0.55, vElevation));
    float amp = uTwinkleAmp * altScale;
    float wave = 0.5 + 0.5 * sin(uTime * uTwinkleSpeed * vTwinkleRate + vPhase);
    float twinkle = (1.0 - amp) + amp * wave;

    float visibility = ext * urbanFade * (1.0 - 0.86 * uRainFactor);
    float intensity = vBrightness * twinkle * visibility;
    if (intensity < 0.004) discard;

    vec3 col = vColor * intensity * shape;
    float alpha = clamp(shape * intensity * 1.15, 0.0, 1.0);

    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// =============================================================================
// SHADER 3: Luna procedurale con fase, mari lunari, crateri e earthshine
// =============================================================================
const MOON_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MOON_FRAGMENT_SHADER = /* glsl */ `
  uniform float uMoonPhase;
  uniform float uRainFactor;

  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm2(vec2 p) {
    float v = 0.0;
    float amp = 0.52;
    for (int i = 0; i < 4; i++) {
      v += amp * noise2(p);
      p = p * 2.15 + vec2(4.7, -3.1);
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r2 = dot(p, p);
    float r = sqrt(r2);
    if (r > 1.0) discard;

    // Normale sulla sfera lunare
    float nz = sqrt(max(0.0, 1.0 - r2));
    vec3 normal = normalize(vec3(p.x, p.y, nz));

    // Direzione sole in base alla fase (0.5 = quarto, 0.75 = gibbosa crescente, 1.0 = piena)
    float phaseAngle = clamp(uMoonPhase, 0.05, 1.0) * 3.14159265;
    vec3 sunDir = normalize(vec3(sin(phaseAngle), 0.16, -cos(phaseAngle)));
    float ndl = dot(normal, sunDir);
    float lit = smoothstep(-0.08, 0.14, ndl) * clamp(ndl * 0.72 + 0.42, 0.0, 1.0);

    // Albedo lunare procedurale (mari basaltici scuri + altopiani chiari + micro-crateri)
    vec2 sphereUv = p * (1.0 + 0.18 * r2);
    float maria = smoothstep(0.42, 0.66, fbm2(sphereUv * 2.4 + vec2(1.7, 0.8)));
    float craters = fbm2(sphereUv * 9.5 + vec2(-2.3, 5.1));
    float albedo = mix(0.86, 0.52, maria * 0.68) * (0.86 + 0.24 * craters);

    // Leggero limb darkening realistico; lato non illuminato trasparente così non scurisce mai il cielo/alone dietro
    float limb = mix(0.76, 1.0, pow(nz, 0.38));
    float cloudDim = 1.0 - 0.58 * uRainFactor;

    // Picco HDR ~1.55 così il bloom selettivo genera un leggero alone naturale attorno alla Luna
    vec3 moonColor = vec3(0.95, 0.96, 1.0) * (albedo * lit * limb * 1.68) * cloudDim;
    float edgeAlpha = smoothstep(1.0, 0.92, r) * smoothstep(0.0, 0.10, lit);

    gl_FragColor = vec4(moonColor, edgeAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// =============================================================================
// SHADER 4: Silhouette lontana procedurale leggera (skyline urbano / marina / dune)
// =============================================================================
const SKYLINE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKYLINE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uSilhouetteColor;
  uniform vec3 uGlowColor;
  uniform float uHeightScale;
  uniform float uWindowDensity;
  uniform float uStyleMode; // 0 = dunes, 1 = coastal/marina, 2 = urban
  uniform float uHorizonIntensity;

  varying vec2 vUv;

  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  void main() {
    float az = vUv.x * 6.2831853;
    float y = vUv.y; // 0 = basso, 1 = alto
    float profileH = 0.0;

    if (uStyleMode < 0.5) {
      // Dune/colline desertiche dolci (Bahrain, Qatar)
      float d1 = 0.5 + 0.5 * sin(az * 5.0 + 0.4);
      float d2 = 0.5 + 0.5 * sin(az * 13.0 - 1.7);
      float d3 = 0.5 + 0.5 * cos(az * 27.0 + 2.1);
      profileH = (0.14 + 0.18 * d1 + 0.09 * d2 + 0.04 * d3) * uHeightScale;
    } else {
      // Skyline urbano/marina a torri quantizzate (Las Vegas, Singapore, Yas Marina, Jeddah)
      float numCols = uStyleMode > 1.5 ? 110.0 : 72.0;
      float colIdx = floor(vUv.x * numCols);
      float r1 = hash11(colIdx + 17.0);
      float r2 = hash11(colIdx * 0.5 + 43.0);
      float cluster = 0.45 + 0.55 * sin(az * 3.0 + 1.1) * cos(az * 2.0 - 0.5);
      float tower = (r1 > 0.72 ? (0.35 + 0.65 * r2) : (0.14 + 0.28 * r1)) * clamp(cluster + 0.35, 0.25, 1.0);
      profileH = (0.10 + tower * 0.78) * uHeightScale;
    }

    if (y > profileH) discard;

    // Sfuma leggermente i bordi superiori della silhouette con il bagliore orizzonte
    float topRim = smoothstep(profileH - 0.035, profileH, y);
    vec3 col = mix(uSilhouetteColor, uGlowColor * 0.28, topRim * 0.6 * uHorizonIntensity);

    // Micro-finestre calde discrete negli edifici urbani/marina
    if (uWindowDensity > 0.05 && y > 0.06 && y < profileH - 0.025) {
      vec2 grid = floor(vec2(vUv.x * 540.0, y * 130.0));
      float wRand = hash21(grid);
      float lit = step(1.0 - uWindowDensity * 0.16, wRand);
      vec3 winTint = mix(vec3(1.0, 0.80, 0.48), vec3(0.78, 0.90, 1.0), step(0.78, hash21(grid + 9.1)));
      col += winTint * lit * 0.26 * (1.0 - topRim);
    }

    float bottomAlpha = smoothstep(0.0, 0.06, y);
    gl_FragColor = vec4(col, 0.88 * bottomAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class NightSky {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'NightSkyDome';
    this.group.visible = false;

    this._qualityId = DEFAULT_NIGHT_QUALITY;
    this._trackId = null;
    this._isRain = false;
    this._moonPhase = NIGHT_SKY_PARAMS.moonPhase;
    this._moonAzimuthDeg = NIGHT_SKY_PARAMS.moonAzimuthDeg;
    this._moonElevationDeg = NIGHT_SKY_PARAMS.moonElevationDeg;
    this._moonDir = computeMoonDirection(this._moonAzimuthDeg, this._moonElevationDeg);

    this._galacticBasis = computeGalacticBasis(
      NIGHT_SKY_PARAMS.milkyWayTiltDeg,
      NIGHT_SKY_PARAMS.milkyWayAzimuthDeg
    );

    this._buildSkyDome();
    this._buildStarfield();
    this._buildMoon();
    this._buildDistantSkyline();
    this.configure({ qualityId: this._qualityId });
  }

  _buildSkyDome() {
    const geo = new THREE.SphereGeometry(NIGHT_SKY_PARAMS.domeRadius, 48, 32);
    this._domeUniforms = {
      uZenithColor: { value: new THREE.Color(NIGHT_SKY_PARAMS.zenithColor) },
      uMidSkyColor: { value: new THREE.Color(NIGHT_SKY_PARAMS.midSkyColor) },
      uHorizonSkyColor: { value: new THREE.Color(NIGHT_SKY_PARAMS.horizonSkyColor) },
      uGroundColor: { value: new THREE.Color(NIGHT_SKY_PARAMS.groundBelowHorizonColor) },
      uHorizonGlowColor: { value: new THREE.Color(0xc98a4e) },
      uHorizonAccentColor: { value: new THREE.Color(0x2a4268) },
      uHorizonIntensity: { value: 0.48 },
      uHorizonHeight: { value: 0.20 },
      uHorizonEnabled: { value: 1.0 },
      uGalacticRight: { value: this._galacticBasis.right.clone() },
      uGalacticUp: { value: this._galacticBasis.up.clone() },
      uGalacticNormal: { value: this._galacticBasis.normal.clone() },
      uMilkyWayIntensity: { value: NIGHT_SKY_PARAMS.milkyWayIntensity },
      uMilkyWayDust: { value: NIGHT_SKY_PARAMS.milkyWayDustStrength },
      uMoonDir: { value: this._moonDir.clone() },
      uMoonHaloIntensity: { value: NIGHT_SKY_PARAMS.moonHaloIntensity },
      uMoonEnabled: { value: 1.0 },
      uRainFactor: { value: 0.0 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this._domeUniforms,
      vertexShader: DOME_VERTEX_SHADER,
      fragmentShader: DOME_FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });

    this._domeMesh = new THREE.Mesh(geo, mat);
    this._domeMesh.renderOrder = -120;
    this._domeMesh.frustumCulled = false;
    this.group.add(this._domeMesh);
  }

  _buildStarfield() {
    const maxStars = getNightQualityConfig('high').starCount;
    const rng = mulberry32(NIGHT_SKY_PARAMS.starSeed);
    const radius = NIGHT_SKY_PARAMS.starSphereRadius;
    const { right, up, normal } = this._galacticBasis;

    const positions = new Float32Array(maxStars * 3);
    const sizes = new Float32Array(maxStars);
    const brightness = new Float32Array(maxStars);
    const colors = new Float32Array(maxStars * 3);
    const phases = new Float32Array(maxStars);
    const rates = new Float32Array(maxStars);

    // Palette temperatura colore stellare (O/B azzurro, A/F bianco, G caldo, K/M arancio tenue)
    const starPalette = [
      [0.74, 0.85, 1.0],
      [0.88, 0.93, 1.0],
      [0.98, 0.98, 1.0],
      [1.0, 0.95, 0.85],
      [1.0, 0.83, 0.66],
    ];
    const tmpDir = new THREE.Vector3();

    for (let i = 0; i < maxStars; i++) {
      // ~22% delle stelle addensate dolcemente lungo la fascia della Via Lattea
      if (rng() < 0.22) {
        const angle = rng() * Math.PI * 2;
        const spread = (rng() + rng() + rng() - 1.5) * 0.26;
        tmpDir
          .copy(right)
          .multiplyScalar(Math.cos(angle))
          .addScaledVector(up, Math.sin(angle))
          .addScaledVector(normal, spread)
          .normalize();
        if (tmpDir.y < 0.015) tmpDir.y = Math.abs(tmpDir.y) + 0.02;
        tmpDir.normalize();
      } else {
        // Distribuzione uniforme sulla semisfera superiore (y > 0.015)
        const u = rng();
        const v = rng();
        const theta = u * Math.PI * 2;
        const y = 0.015 + v * 0.985;
        const rHoriz = Math.sqrt(Math.max(0, 1 - y * y));
        tmpDir.set(rHoriz * Math.cos(theta), y, rHoriz * Math.sin(theta));
      }

      positions[i * 3] = tmpDir.x * radius;
      positions[i * 3 + 1] = tmpDir.y * radius;
      positions[i * 3 + 2] = tmpDir.z * radius;

      // Distribuzione astronomica a legge di potenza: moltissime stelle deboli, poche brillanti
      const magRoll = Math.pow(rng(), 3.6);
      brightness[i] = 0.09 + magRoll * 1.28;
      sizes[i] = 1.35 + Math.pow(magRoll, 0.65) * 3.1;

      // Scelta temperatura colore realistica
      const cRoll = rng();
      const col =
        cRoll < 0.16
          ? starPalette[0]
          : cRoll < 0.44
            ? starPalette[1]
            : cRoll < 0.72
              ? starPalette[2]
              : cRoll < 0.90
                ? starPalette[3]
                : starPalette[4];
      colors[i * 3] = col[0];
      colors[i * 3 + 1] = col[1];
      colors[i * 3 + 2] = col[2];

      phases[i] = rng() * Math.PI * 2;
      rates[i] = 0.45 + rng() * 0.95;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aTwinkleRate', new THREE.BufferAttribute(rates, 1));

    const pr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    this._starUniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: pr },
      uTwinkleSpeed: { value: NIGHT_SKY_PARAMS.starTwinkleSpeed },
      uTwinkleAmp: { value: NIGHT_SKY_PARAMS.starTwinkleAmp },
      uExtinctionPower: { value: NIGHT_SKY_PARAMS.starExtinctionPower },
      uHorizonIntensity: { value: 0.48 },
      uRainFactor: { value: 0.0 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this._starUniforms,
      vertexShader: STAR_VERTEX_SHADER,
      fragmentShader: STAR_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      fog: false,
    });

    this._starPoints = new THREE.Points(geo, mat);
    this._starPoints.renderOrder = -115;
    this._starPoints.frustumCulled = false;
    this.group.add(this._starPoints);
  }

  _buildMoon() {
    const moonDist = NIGHT_SKY_PARAMS.moonDistance;
    const discDiameter = 2 * moonDist * Math.sin(NIGHT_SKY_PARAMS.moonAngularRadius);
    const geo = new THREE.PlaneGeometry(discDiameter, discDiameter);

    this._moonUniforms = {
      uMoonPhase: { value: this._moonPhase },
      uRainFactor: { value: 0.0 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this._moonUniforms,
      vertexShader: MOON_VERTEX_SHADER,
      fragmentShader: MOON_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });

    this._moonMesh = new THREE.Mesh(geo, mat);
    this._moonMesh.renderOrder = -112;
    this._moonMesh.frustumCulled = false;
    this._updateMoonTransform();
    this.group.add(this._moonMesh);
  }

  _updateMoonTransform() {
    computeMoonDirection(this._moonAzimuthDeg, this._moonElevationDeg, this._moonDir);
    this._moonMesh.position.copy(this._moonDir).multiplyScalar(NIGHT_SKY_PARAMS.moonDistance);
    this._moonMesh.lookAt(0, 0, 0);
    this._domeUniforms.uMoonDir.value.copy(this._moonDir);
  }

  _buildDistantSkyline() {
    const r = NIGHT_SKY_PARAMS.skylineRadius;
    const height = 620;
    const geo = new THREE.CylinderGeometry(r, r, height, 128, 1, true);

    this._skylineUniforms = {
      uSilhouetteColor: { value: new THREE.Color(0x090e1a) },
      uGlowColor: { value: new THREE.Color(0xc98a4e) },
      uHeightScale: { value: 0.25 },
      uWindowDensity: { value: 0.0 },
      uStyleMode: { value: 0.0 },
      uHorizonIntensity: { value: 0.48 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this._skylineUniforms,
      vertexShader: SKYLINE_VERTEX_SHADER,
      fragmentShader: SKYLINE_FRAGMENT_SHADER,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });

    this._skylineMesh = new THREE.Mesh(geo, mat);
    this._skylineMesh.position.y = height * 0.36;
    this._skylineMesh.renderOrder = -110;
    this._skylineMesh.frustumCulled = false;
    this.group.add(this._skylineMesh);
  }

  /**
   * Aggiorna profilo circuito, qualità, pioggia e parametri lunari opzionali.
   */
  configure({
    trackId = this._trackId,
    qualityId = this._qualityId,
    isRain = this._isRain,
    moonPhase = NIGHT_SKY_PARAMS.moonPhase,
    moonAzimuthDeg = null,
    moonElevationDeg = NIGHT_SKY_PARAMS.moonElevationDeg,
  } = {}) {
    this._trackId = trackId;
    this._qualityId = qualityId;
    this._isRain = Boolean(isRain);
    this._moonPhase = moonPhase;

    const quality = getNightQualityConfig(qualityId);
    const profile = getNightCircuitProfile(trackId);

    // 1. Orizzonte e light pollution specifici del circuito
    this._domeUniforms.uHorizonGlowColor.value.setHex(profile.horizonColor);
    this._domeUniforms.uHorizonAccentColor.value.setHex(profile.horizonAccentColor);
    this._domeUniforms.uHorizonIntensity.value = profile.horizonIntensity;
    this._domeUniforms.uHorizonHeight.value = profile.horizonHeight;
    this._domeUniforms.uHorizonEnabled.value = quality.showHorizonGlow ? 1.0 : 0.0;

    // 2. Via Lattea & Luna in base al livello qualità
    this._domeUniforms.uMilkyWayIntensity.value = quality.showMilkyWay
      ? NIGHT_SKY_PARAMS.milkyWayIntensity
      : 0.0;
    this._domeUniforms.uMoonEnabled.value = quality.showMoon ? 1.0 : 0.0;
    this._domeUniforms.uRainFactor.value = this._isRain ? 1.0 : 0.0;

    // 3. Stelle (drawRange immediato senza riallocazioni)
    this._starPoints.geometry.setDrawRange(0, quality.starCount);
    this._starUniforms.uHorizonIntensity.value = profile.horizonIntensity;
    this._starUniforms.uRainFactor.value = this._isRain ? 1.0 : 0.0;

    // 4. Luna procedurale
    this._moonMesh.visible = Boolean(quality.showMoon);
    this._moonUniforms.uMoonPhase.value = this._moonPhase;
    this._moonUniforms.uRainFactor.value = this._isRain ? 1.0 : 0.0;
    this._moonAzimuthDeg =
      moonAzimuthDeg !== null
        ? moonAzimuthDeg
        : (typeof profile.moonAzimuthDeg === 'number'
            ? profile.moonAzimuthDeg
            : NIGHT_SKY_PARAMS.moonAzimuthDeg + (profile.moonAzimuthOffsetDeg || 0));
    this._moonElevationDeg = moonElevationDeg;
    this._updateMoonTransform();

    // 5. Silhouette lontana (skyline urbano / marina / dune)
    this._skylineMesh.visible = Boolean(quality.showDistantSkyline);
    this._skylineUniforms.uGlowColor.value.setHex(profile.horizonColor);
    this._skylineUniforms.uHeightScale.value = profile.skylineHeight;
    this._skylineUniforms.uWindowDensity.value = profile.skylineWindowDensity || 0;
    this._skylineUniforms.uHorizonIntensity.value = profile.horizonIntensity;
    this._skylineUniforms.uStyleMode.value =
      profile.skylineStyle === 'urban'
        ? 2.0
        : profile.skylineStyle === 'marina' || profile.skylineStyle === 'coastal'
          ? 1.0
          : 0.0;
  }

  getMoonDirection() {
    return this._moonDir.clone();
  }

  /**
   * Mantiene la cupola centrata sulla camera (zero parallasse) e anima lo scintillio stellare.
   * @param {THREE.Camera} camera
   * @param {number} elapsedSec
   */
  update(camera, elapsedSec) {
    if (!this.group.visible) return;
    if (camera) {
      this.group.position.copy(camera.position);
    }
    this._starUniforms.uTime.value = elapsedSec;
  }

  setPixelRatio(pr) {
    this._starUniforms.uPixelRatio.value = Math.min(pr || 1, 2);
  }

  dispose() {
    this._domeMesh?.geometry?.dispose?.();
    this._domeMesh?.material?.dispose?.();
    this._starPoints?.geometry?.dispose?.();
    this._starPoints?.material?.dispose?.();
    this._moonMesh?.geometry?.dispose?.();
    this._moonMesh?.material?.dispose?.();
    this._skylineMesh?.geometry?.dispose?.();
    this._skylineMesh?.material?.dispose?.();
  }
}
