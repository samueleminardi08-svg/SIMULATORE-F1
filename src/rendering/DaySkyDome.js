/**
 * Cupola cielo fotografica HDRI 2K con color-grading cinematografico (Presentation Layer):
 * - Campiona la texture equirettangolare 2K Pure Skies (`backgroundMap`) con rotazione azimutale esatta
 * - Controlla esposizione cielo indipendente da quella di pista/vetture (evita cieli bianchi sovraesposti)
 * - Esalta contrasto, saturazione e calore dorato/arancione sulle nuvole al tramonto/alba
 *   preservando l'azzurro profondo negli squarci di cielo.
 */

import * as THREE from 'three';

const DAY_SKY_VERT = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vWorldDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DAY_SKY_FRAG = /* glsl */ `
  uniform sampler2D uSkyTex;
  uniform float uHasTex;
  uniform float uRotationY;
  uniform float uExposure;
  uniform float uSaturation;
  uniform float uContrast;
  uniform vec3 uWarmTint;
  uniform float uWarmStrength;
  uniform vec3 uZenithTint;
  uniform float uZenithStrength;
  uniform vec3 uSunDir;
  uniform vec3 uSunGlowColor;
  uniform float uSunGlowStrength;
  uniform vec3 uFallbackColor;

  varying vec3 vWorldDir;

  const float PI = 3.14159265359;
  const float INV_TWO_PI = 0.15915494309;

  vec3 adjustSaturation(vec3 c, float sat) {
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(luma), c, sat);
  }

  void main() {
    vec3 dir = normalize(vWorldDir);

    if (uHasTex < 0.5) {
      gl_FragColor = vec4(uFallbackColor, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }

    // Ruota la direzione attorno a Y per allineare il sole dell'HDRI con il rettilineo/sunLight
    float cs = cos(-uRotationY);
    float sn = sin(-uRotationY);
    vec3 rDir = vec3(
      dir.x * cs + dir.z * sn,
      dir.y,
      -dir.x * sn + dir.z * cs
    );

    float u = fract(atan(rDir.z, rDir.x) * INV_TWO_PI + 0.5);
    float v = clamp(asin(clamp(rDir.y, -1.0, 1.0)) / PI + 0.5, 0.001, 0.999);

    vec3 raw = texture2D(uSkyTex, vec2(u, v)).rgb;

    // 1. Esposizione controllata + compressione morbida delle alte luci prima del tone mapping
    //    (evita che il sole e le nuvole luminose diventino bianco latte piatto)
    vec3 col = raw * uExposure;
    col = col / (1.0 + col * 0.28);

    // 2. Contrasto & saturazione sulle nuvole fotografiche
    col = pow(max(col, vec3(0.0)), vec3(uContrast));
    col = adjustSaturation(col, uSaturation);

    // 3. Calore dorato/arancione concentrato nella fascia bassa/media (orizzonte e bordi nuvole)
    float elev = clamp(dir.y, 0.0, 1.0);
    float horizonBand = exp(-elev * 4.2);
    float cloudWarmMask = smoothstep(0.08, 0.75, dot(col, vec3(0.3, 0.5, 0.2)));
    vec3 warmGraded = col * mix(vec3(1.0), uWarmTint, uWarmStrength * (0.45 + 0.55 * horizonBand));
    col = mix(col, warmGraded, clamp(0.35 + 0.65 * cloudWarmMask, 0.0, 1.0));

    // Leggero rinforzo blu profondo verso lo zenit (contrasto caldo/freddo stile tramonto reale)
    float zenBand = smoothstep(0.18, 0.75, elev);
    col = mix(col, col * uZenithTint, uZenithStrength * zenBand);

    // 4. Bagliore solare dorato morbido allineato al sole
    if (uSunGlowStrength > 0.001) {
      float cosSun = max(dot(dir, normalize(uSunDir)), 0.0);
      float wideGlow = pow(cosSun, 6.0) * 0.32 * (0.4 + 0.6 * horizonBand);
      float midGlow = pow(cosSun, 36.0) * 0.55;
      float coreGlow = pow(cosSun, 320.0) * 1.15;
      col += uSunGlowColor * (wideGlow + midGlow + coreGlow) * uSunGlowStrength;
    }

    gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class DaySkyDome {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'DaySkyDome';
    this.group.visible = false;

    this._uniforms = {
      uSkyTex: { value: null },
      uHasTex: { value: 0.0 },
      uRotationY: { value: 0.0 },
      uExposure: { value: 0.72 },
      uSaturation: { value: 1.25 },
      uContrast: { value: 1.1 },
      uWarmTint: { value: new THREE.Color(1.0, 0.85, 0.65) },
      uWarmStrength: { value: 0.0 },
      uZenithTint: { value: new THREE.Color(0.85, 0.94, 1.12) },
      uZenithStrength: { value: 0.15 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.2, 0.8).normalize() },
      uSunGlowColor: { value: new THREE.Color(1.0, 0.65, 0.25) },
      uSunGlowStrength: { value: 0.0 },
      uFallbackColor: { value: new THREE.Color(0x87b8e8) },
    };

    const geo = new THREE.SphereGeometry(4300, 48, 28);
    const mat = new THREE.ShaderMaterial({
      uniforms: this._uniforms,
      vertexShader: DAY_SKY_VERT,
      fragmentShader: DAY_SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });

    this._mesh = new THREE.Mesh(geo, mat);
    this._mesh.renderOrder = -125;
    this._mesh.frustumCulled = false;
    this.group.add(this._mesh);
  }

  setTexture(equirectTexture) {
    this._uniforms.uSkyTex.value = equirectTexture || null;
    this._uniforms.uHasTex.value = equirectTexture ? 1.0 : 0.0;
  }

  configure({
    rotationY = 0,
    sunDir = null,
    exposure = 0.72,
    saturation = 1.2,
    contrast = 1.08,
    warmTint = 0xffffff,
    warmStrength = 0.0,
    zenithTint = 0xdbeafe,
    zenithStrength = 0.12,
    sunGlowColor = 0xffa040,
    sunGlowStrength = 0.0,
    fallbackColor = 0x87b8e8,
  } = {}) {
    this._uniforms.uRotationY.value = rotationY;
    this._uniforms.uExposure.value = exposure;
    this._uniforms.uSaturation.value = saturation;
    this._uniforms.uContrast.value = contrast;
    this._uniforms.uWarmTint.value.setHex(warmTint);
    this._uniforms.uWarmStrength.value = warmStrength;
    this._uniforms.uZenithTint.value.setHex(zenithTint);
    this._uniforms.uZenithStrength.value = zenithStrength;
    this._uniforms.uSunGlowColor.value.setHex(sunGlowColor);
    this._uniforms.uSunGlowStrength.value = sunGlowStrength;
    this._uniforms.uFallbackColor.value.setHex(fallbackColor);
    if (sunDir) {
      this._uniforms.uSunDir.value.copy(sunDir).normalize();
    }
  }

  update(camera) {
    if (!this.group.visible || !camera) return;
    this.group.position.copy(camera.position);
  }

  dispose() {
    this._mesh?.geometry?.dispose?.();
    this._mesh?.material?.dispose?.();
  }
}
