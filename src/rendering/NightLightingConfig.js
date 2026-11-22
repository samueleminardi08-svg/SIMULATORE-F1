/**
 * Configurazione estetica centralizzata per il cielo notturno, l'alone urbano/desertico,
 * le torri faro, il bloom selettivo e i profili qualità (Bassa / Media / Alta).
 *
 * Modulo 100% Presentation Layer: nessuna costante fisica, compatibile Node.js headless.
 */

export const NIGHT_QUALITY_STORAGE_KEY = 'f1_2026_night_quality_v1';
export const DEFAULT_NIGHT_QUALITY = 'medium';

export const NIGHT_TRACK_IDS = [
  'bahrain_2026',
  'jeddah_2026',
  'singapore_2026',
  'las_vegas_2026',
  'qatar_2026',
  'yas_marina_2026',
];

const NIGHT_TRACK_ID_SET = new Set(NIGHT_TRACK_IDS);

export function isNightTrackId(trackId) {
  return Boolean(trackId && NIGHT_TRACK_ID_SET.has(trackId));
}

export const NIGHT_QUALITY_ORDER = ['low', 'medium', 'high'];

export const NIGHT_QUALITY_LEVELS = {
  low: {
    id: 'low',
    label: 'Bassa',
    description:
      'Stelle essenziali, alone all’orizzonte, 4 fari reali (senza ombre) e nessun bloom: massimi FPS.',
    starCount: 1600,
    showMilkyWay: false,
    showMoon: false,
    showHorizonGlow: true,
    showDistantSkyline: false,
    bloomEnabled: false,
    bloomStrength: 0.0,
    bloomRadius: 0.25,
    bloomThreshold: 1.5,
    bloomResolutionScale: 0.5,
    activeSpotLights: 4,
    shadowLights: 0,
    showLightCones: false,
    showGroundPools: true,
    towerSpacingMeters: 94,
  },
  medium: {
    id: 'medium',
    label: 'Media',
    description:
      'Stelle, Via Lattea, Luna gibbosa, skyline lontano, 6 fari dinamici (1 con ombra) e bloom selettivo (60 FPS).',
    starCount: 3600,
    showMilkyWay: true,
    showMoon: true,
    showHorizonGlow: true,
    showDistantSkyline: true,
    bloomEnabled: true,
    bloomStrength: 0.35,
    bloomRadius: 0.34,
    bloomThreshold: 1.42,
    bloomResolutionScale: 0.5,
    activeSpotLights: 6,
    shadowLights: 1,
    showLightCones: true,
    showGroundPools: true,
    towerSpacingMeters: 74,
  },
  high: {
    id: 'high',
    label: 'Alta',
    description:
      'Campo stellare denso (6.200 stelle), Via Lattea dettagliata, Luna, 10 fari dinamici (2 con ombra) e bloom HQ.',
    starCount: 6200,
    showMilkyWay: true,
    showMoon: true,
    showHorizonGlow: true,
    showDistantSkyline: true,
    bloomEnabled: true,
    bloomStrength: 0.44,
    bloomRadius: 0.42,
    bloomThreshold: 1.32,
    bloomResolutionScale: 0.75,
    activeSpotLights: 10,
    shadowLights: 2,
    showLightCones: true,
    showGroundPools: true,
    towerSpacingMeters: 56,
  },
};

export const AUTO_QUALITY_FALLBACK = {
  enabled: true,
  lowFpsThreshold: 34,
  sustainSeconds: 6.0,
  warmupSeconds: 5.5,
};

/**
 * Parametri astronomici e atmosferici configurabili della cupola celeste notturna.
 */
export const NIGHT_SKY_PARAMS = {
  domeRadius: 4200,
  starSphereRadius: 4120,
  moonDistance: 3940,
  skylineRadius: 3550,
  zenithColor: 0x020611,
  midSkyColor: 0x071228,
  horizonSkyColor: 0x10203d,
  groundBelowHorizonColor: 0x050811,
  starSeed: 20260711,
  starTwinkleSpeed: 0.85,
  starTwinkleAmp: 0.22,
  starExtinctionPower: 2.0,
  milkyWayIntensity: 0.36,
  milkyWayTiltDeg: 54,
  milkyWayAzimuthDeg: 205,
  milkyWayDustStrength: 0.58,
  // Luna default: gibbosa crescente ~75%, elevazione ~17.5° ben visibile nel terzo superiore del cielo
  moonPhase: 0.75,
  moonAzimuthDeg: 24,
  moonElevationDeg: 17.5,
  moonAngularRadius: 0.025,
  moonHaloIntensity: 0.42,
  moonLightColor: 0xa8c6f0,
  moonLightIntensity: 0.38,
};

/**
 * Parametri costruttivi delle torri faro (usati da TrackFloodlights.js).
 */
export const FLOODLIGHT_PARAMS = {
  towerHeight: 17.5,
  armReach: 4.2,
  barrierClearance: 4.8,
  minSafeTrackOffsetExtra: 3.0,
  pitStraightDensityFactor: 0.62,
  cornerDensityFactor: 0.76,
  spotAngleRad: Math.PI / 2.55,
  spotPenumbra: 0.80,
  spotDecay: 1.55,
  spotDistance: 78,
  spotBaseIntensity: 56,
  spotRainIntensityBoost: 1.15,
  poolDecalWidth: 20,
  poolDecalLength: 28,
  poolDecalOpacityDry: 0.06,
  poolDecalOpacityRain: 0.12,
  coneOpacityDry: 0.05,
  coneOpacityRain: 0.11,
  emitterHdrGain: 3.6,
  shadowMapSize: 512,
};

/**
 * Profili estetici notturni per circuito: alone luminoso all'orizzonte,
 * stile skyline lontano, temperatura LED fari e reattività speculare asfalto.
 */
export const NIGHT_CIRCUIT_PROFILES = {
  las_vegas_2026: {
    id: 'las_vegas_2026',
    horizonColor: 0xd47c38,
    horizonAccentColor: 0x6b45c9,
    horizonIntensity: 0.58,
    horizonHeight: 0.15,
    floodlightColor: 0xedf5ff,
    accentWarmColor: 0xffb366,
    warmAccentRatio: 0.38,
    skylineStyle: 'urban',
    skylineHeight: 0.44,
    skylineWindowDensity: 0.85,
    asphaltNightRoughness: 0.92,
    asphaltNightMetalness: 0.0,
    asphaltNightEnvIntensity: 0.22,
    exposure: 1.04,
    sunFillIntensity: 0.34,
    hemiIntensity: 0.36,
    fogColor: 0x0c1020,
    fogDensity: 0.00036,
    moonAzimuthDeg: 118,
  },

  singapore_2026: {
    id: 'singapore_2026',
    horizonColor: 0xd48542,
    horizonAccentColor: 0x2c6896,
    horizonIntensity: 0.54,
    horizonHeight: 0.145,
    floodlightColor: 0xf0f8ff,
    accentWarmColor: 0xffbc75,
    warmAccentRatio: 0.34,
    skylineStyle: 'urban',
    skylineHeight: 0.42,
    skylineWindowDensity: 0.78,
    asphaltNightRoughness: 0.92,
    asphaltNightMetalness: 0.0,
    asphaltNightEnvIntensity: 0.22,
    exposure: 1.04,
    sunFillIntensity: 0.35,
    hemiIntensity: 0.38,
    fogColor: 0x0a1120,
    fogDensity: 0.00038,
    moonAzimuthDeg: 348,
  },

  bahrain_2026: {
    id: 'bahrain_2026',
    horizonColor: 0xbf7d40,
    horizonAccentColor: 0x1d3154,
    horizonIntensity: 0.34,
    horizonHeight: 0.115,
    floodlightColor: 0xf0f7ff,
    accentWarmColor: 0xffd29d,
    warmAccentRatio: 0.12,
    skylineStyle: 'dunes',
    skylineHeight: 0.16,
    skylineWindowDensity: 0.0,
    asphaltNightRoughness: 0.92,
    asphaltNightMetalness: 0.0,
    asphaltNightEnvIntensity: 0.18,
    exposure: 1.02,
    sunFillIntensity: 0.32,
    hemiIntensity: 0.34,
    fogColor: 0x090e1c,
    fogDensity: 0.00034,
    moonAzimuthDeg: 156,
  },

  qatar_2026: {
    id: 'qatar_2026',
    horizonColor: 0xb8783e,
    horizonAccentColor: 0x1a2c4a,
    horizonIntensity: 0.30,
    horizonHeight: 0.11,
    floodlightColor: 0xf2f8ff,
    accentWarmColor: 0xffd6a5,
    warmAccentRatio: 0.08,
    skylineStyle: 'dunes',
    skylineHeight: 0.14,
    skylineWindowDensity: 0.0,
    asphaltNightRoughness: 0.92,
    asphaltNightMetalness: 0.0,
    asphaltNightEnvIntensity: 0.18,
    exposure: 1.02,
    sunFillIntensity: 0.32,
    hemiIntensity: 0.34,
    fogColor: 0x080d1a,
    fogDensity: 0.00032,
    moonAzimuthDeg: 228,
  },

  yas_marina_2026: {
    id: 'yas_marina_2026',
    horizonColor: 0xc28148,
    horizonAccentColor: 0x2c5c94,
    horizonIntensity: 0.42,
    horizonHeight: 0.13,
    floodlightColor: 0xedf6ff,
    accentWarmColor: 0xffc88a,
    warmAccentRatio: 0.18,
    skylineStyle: 'marina',
    skylineHeight: 0.28,
    skylineWindowDensity: 0.45,
    asphaltNightRoughness: 0.92,
    asphaltNightMetalness: 0.0,
    asphaltNightEnvIntensity: 0.20,
    exposure: 1.04,
    sunFillIntensity: 0.34,
    hemiIntensity: 0.36,
    fogColor: 0x0a1122,
    fogDensity: 0.00034,
    moonAzimuthDeg: 78,
  },

  jeddah_2026: {
    id: 'jeddah_2026',
    horizonColor: 0xb67e4c,
    horizonAccentColor: 0x234e6e,
    horizonIntensity: 0.38,
    horizonHeight: 0.125,
    floodlightColor: 0xf2f8ff,
    accentWarmColor: 0xffcca0,
    warmAccentRatio: 0.16,
    skylineStyle: 'coastal',
    skylineHeight: 0.24,
    skylineWindowDensity: 0.35,
    asphaltNightRoughness: 0.92,
    asphaltNightMetalness: 0.0,
    asphaltNightEnvIntensity: 0.20,
    exposure: 1.04,
    sunFillIntensity: 0.34,
    hemiIntensity: 0.36,
    fogColor: 0x09101f,
    fogDensity: 0.00034,
    moonAzimuthDeg: 176,
  },

  default: {
    id: 'default',
    horizonColor: 0xbc7f46,
    horizonAccentColor: 0x22395c,
    horizonIntensity: 0.38,
    horizonHeight: 0.125,
    floodlightColor: 0xf0f7ff,
    accentWarmColor: 0xffcb8c,
    warmAccentRatio: 0.15,
    skylineStyle: 'dunes',
    skylineHeight: 0.15,
    skylineWindowDensity: 0.0,
    asphaltNightRoughness: 0.92,
    asphaltNightMetalness: 0.0,
    asphaltNightEnvIntensity: 0.18,
    exposure: 1.03,
    sunFillIntensity: 0.33,
    hemiIntensity: 0.35,
    fogColor: 0x090f1e,
    fogDensity: 0.00034,
    moonAzimuthDeg: 24,
  },
};

export function getNightQualityConfig(qualityId = DEFAULT_NIGHT_QUALITY) {
  return NIGHT_QUALITY_LEVELS[qualityId] || NIGHT_QUALITY_LEVELS[DEFAULT_NIGHT_QUALITY];
}

export function getLowerNightQuality(qualityId) {
  const idx = NIGHT_QUALITY_ORDER.indexOf(qualityId);
  if (idx <= 0) return null;
  return NIGHT_QUALITY_ORDER[idx - 1];
}

export function getNightCircuitProfile(trackId) {
  if (trackId && NIGHT_CIRCUIT_PROFILES[trackId]) {
    return NIGHT_CIRCUIT_PROFILES[trackId];
  }
  return NIGHT_CIRCUIT_PROFILES.default;
}

export function loadSavedNightQuality() {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_NIGHT_QUALITY;
    const saved = localStorage.getItem(NIGHT_QUALITY_STORAGE_KEY);
    return saved && NIGHT_QUALITY_LEVELS[saved] ? saved : DEFAULT_NIGHT_QUALITY;
  } catch {
    return DEFAULT_NIGHT_QUALITY;
  }
}

export function saveNightQuality(qualityId) {
  const valid = NIGHT_QUALITY_LEVELS[qualityId] ? qualityId : DEFAULT_NIGHT_QUALITY;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(NIGHT_QUALITY_STORAGE_KEY, valid);
    }
  } catch {
    // Ignora storage bloccato (es. privacy mode)
  }
  return valid;
}
