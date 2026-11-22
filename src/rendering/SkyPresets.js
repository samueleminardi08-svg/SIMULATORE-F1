/**
 * Catalogo centralizzato dei 9 cieli fotorealistici HDRI 2K Pure Skies (Poly Haven CC0)
 * + selettore 'random' (Casuale).
 *
 * Modifica 100% estetica: ogni preset mappa esclusivamente su `physicsWeather: 'dry' | 'rain'`
 * senza alterare alcuna costante o formula fisica.
 */

const NIGHT_CIRCUIT_IDS = new Set([
  'bahrain_2026',
  'jeddah_2026',
  'qatar_2026',
  'yas_marina_2026',
  'singapore_2026',
  'las_vegas_2026',
]);

export const SKY_PRESET_STORAGE_KEY = 'f1_2026_sky_preset_v1';
export const DEFAULT_SKY_PRESET_OPTION = 'auto';

// Direzione orizzontale del picco solare negli HDRI Pure Skies 2K (u = 0.60 -> +54° da +Z verso +X)
export const PURE_SKY_HDR_SUN_U = 0.60;
export const PURE_SKY_HDR_SUN_HEADING_RAD = (0.25 - (PURE_SKY_HDR_SUN_U - 0.5)) * Math.PI * 2;

export const SKY_PRESETS = {
  clear_day: {
    id: 'clear_day',
    label: 'Giorno Sereno',
    shortLabel: 'Sereno',
    hdriKey: 'clear_day',
    physicsWeather: 'dry',
    rainIntensity: 0,
    isNight: false,
    badgeTheme: 'dry',
    hdrSunU: 0.601,
    alignSunForward: false,
    sunAzimuthDeg: 38,
    sunElevationDeg: 44,
    sunColor: 0xfff6e5,
    sunIntensity: 1.95,
    hemiSkyColor: 0xdbeafe,
    hemiGroundColor: 0x3b5222,
    hemiIntensity: 0.62,
    skyFallbackColor: 0x87b8e8,
    fogColor: 0xb5d3ec,
    fogDensity: 0.00050,
    envMapIntensity: 0.78,
    backgroundIntensity: 0.96,
    backgroundBlurriness: 0.0,
    toneMappingExposure: 0.90,
    skyExposure: 0.84,
    asphaltRoughness: 0.96,
    asphaltMetalness: 0.0,
    asphaltEnvIntensity: 0.16,
    asphaltSpecularIntensity: 0.22,
    asphaltColorScale: 1.0,
  },

  partly_cloudy: {
    id: 'partly_cloudy',
    label: 'Parzialmente Nuvoloso',
    shortLabel: 'Poco Nuvoloso',
    hdriKey: 'partly_cloudy',
    physicsWeather: 'dry',
    rainIntensity: 0,
    isNight: false,
    badgeTheme: 'dry',
    hdrSunU: 0.595,
    alignSunForward: true,
    sunForwardOffsetRad: -0.22,
    sunAzimuthDeg: 52,
    sunElevationDeg: 42,
    sunColor: 0xfff8eb,
    sunIntensity: 1.78,
    hemiSkyColor: 0xdbeafe,
    hemiGroundColor: 0x3e512c,
    hemiIntensity: 0.66,
    skyFallbackColor: 0x90bce2,
    fogColor: 0xbad2e6,
    fogDensity: 0.00052,
    envMapIntensity: 0.78,
    backgroundIntensity: 0.94,
    backgroundBlurriness: 0.0,
    toneMappingExposure: 0.90,
    skyExposure: 0.84,
    asphaltRoughness: 0.96,
    asphaltMetalness: 0.0,
    asphaltEnvIntensity: 0.16,
    asphaltSpecularIntensity: 0.22,
    asphaltColorScale: 1.0,
  },

  sunrise: {
    id: 'sunrise',
    label: 'Alba',
    shortLabel: 'Alba',
    hdriKey: 'sunrise',
    physicsWeather: 'dry',
    rainIntensity: 0,
    isNight: false,
    badgeTheme: 'warm',
    hdrSunU: 0.60,
    alignSunForward: true,
    sunForwardOffsetRad: -0.15,
    sunAzimuthDeg: 82,
    sunElevationDeg: 10,
    sunColor: 0xffb36b,
    sunIntensity: 1.92,
    hemiSkyColor: 0xfde2c8,
    hemiGroundColor: 0x3b2f27,
    hemiIntensity: 0.54,
    skyFallbackColor: 0xd8a384,
    fogColor: 0xe3b18a,
    fogDensity: 0.00048,
    envMapIntensity: 0.80,
    backgroundIntensity: 0.82,
    backgroundBlurriness: 0.0,
    toneMappingExposure: 0.88,
    skyExposure: 0.46,
    skySaturation: 1.40,
    skyContrast: 1.16,
    skyWarmTint: 0xffa652,
    skyWarmStrength: 0.62,
    skyZenithTint: 0x9ec5ff,
    skyZenithStrength: 0.25,
    skySunGlowColor: 0xffae45,
    skySunGlowStrength: 0.60,
    asphaltRoughness: 0.95,
    asphaltMetalness: 0.0,
    asphaltEnvIntensity: 0.18,
    asphaltSpecularIntensity: 0.24,
    asphaltColorScale: 0.94,
  },

  sunset: {
    id: 'sunset',
    label: 'Tramonto',
    shortLabel: 'Tramonto',
    hdriKey: 'sunset',
    physicsWeather: 'dry',
    rainIntensity: 0,
    isNight: false,
    badgeTheme: 'warm',
    hdrSunU: 0.606,
    alignSunForward: true,
    sunForwardOffsetRad: -0.14,
    sunAzimuthDeg: -68,
    sunElevationDeg: 8.5,
    sunColor: 0xff9a44,
    sunIntensity: 2.10,
    hemiSkyColor: 0xf7b279,
    hemiGroundColor: 0x33241c,
    hemiIntensity: 0.54,
    skyFallbackColor: 0xc27652,
    fogColor: 0xd69663,
    fogDensity: 0.00048,
    envMapIntensity: 0.80,
    backgroundIntensity: 0.80,
    backgroundBlurriness: 0.0,
    toneMappingExposure: 0.88,
    skyExposure: 0.64,
    skySaturation: 1.48,
    skyContrast: 1.22,
    skyWarmTint: 0xff8c2b,
    skyWarmStrength: 0.80,
    skyZenithTint: 0x7cb0f5,
    skyZenithStrength: 0.30,
    skySunGlowColor: 0xffa82e,
    skySunGlowStrength: 0.88,
    asphaltRoughness: 0.95,
    asphaltMetalness: 0.0,
    asphaltEnvIntensity: 0.18,
    asphaltSpecularIntensity: 0.24,
    asphaltColorScale: 0.94,
  },

  cloudy_sunset: {
    id: 'cloudy_sunset',
    label: 'Tramonto Nuvoloso',
    shortLabel: 'Tramonto Nuv.',
    hdriKey: 'cloudy_sunset',
    physicsWeather: 'dry',
    rainIntensity: 0,
    isNight: false,
    badgeTheme: 'warm',
    hdrSunU: 0.579,
    alignSunForward: true,
    sunForwardOffsetRad: -0.12,
    sunAzimuthDeg: -54,
    sunElevationDeg: 7.5,
    sunColor: 0xff8940,
    sunIntensity: 1.95,
    hemiSkyColor: 0xd99474,
    hemiGroundColor: 0x2b242c,
    hemiIntensity: 0.56,
    skyFallbackColor: 0x7c5a63,
    fogColor: 0xae7962,
    fogDensity: 0.00054,
    envMapIntensity: 0.80,
    backgroundIntensity: 0.80,
    backgroundBlurriness: 0.0,
    toneMappingExposure: 0.87,
    skyExposure: 0.58,
    skySaturation: 1.50,
    skyContrast: 1.24,
    skyWarmTint: 0xff7e26,
    skyWarmStrength: 0.86,
    skyZenithTint: 0x80a8e8,
    skyZenithStrength: 0.22,
    skySunGlowColor: 0xff9524,
    skySunGlowStrength: 0.82,
    asphaltRoughness: 0.96,
    asphaltMetalness: 0.0,
    asphaltEnvIntensity: 0.17,
    asphaltSpecularIntensity: 0.22,
    asphaltColorScale: 0.92,
  },

  overcast: {
    id: 'overcast',
    label: 'Nuvoloso',
    shortLabel: 'Nuvoloso',
    hdriKey: 'overcast',
    physicsWeather: 'dry',
    rainIntensity: 0,
    isNight: false,
    badgeTheme: 'overcast',
    sunAzimuthDeg: 30,
    sunElevationDeg: 40,
    sunColor: 0xdbe4ef,
    sunIntensity: 1.0,
    hemiSkyColor: 0xb5c2d1,
    hemiGroundColor: 0x363f38,
    hemiIntensity: 0.74,
    skyFallbackColor: 0x7c8a99,
    fogColor: 0x9aa7b4,
    fogDensity: 0.00062,
    envMapIntensity: 0.78,
    backgroundIntensity: 0.92,
    backgroundBlurriness: 0.0,
    toneMappingExposure: 0.88,
    skyExposure: 0.82,
    asphaltRoughness: 0.97,
    asphaltMetalness: 0.0,
    asphaltEnvIntensity: 0.14,
    asphaltSpecularIntensity: 0.20,
    asphaltColorScale: 0.95,
  },

  rain: {
    id: 'rain',
    label: 'Pioggia',
    shortLabel: 'Pioggia',
    hdriKey: 'rain',
    physicsWeather: 'rain',
    rainIntensity: 1.0,
    isNight: false,
    badgeTheme: 'rain',
    sunAzimuthDeg: 25,
    sunElevationDeg: 34,
    sunColor: 0xcbd5e1,
    sunIntensity: 0.76,
    hemiSkyColor: 0x94a3b8,
    hemiGroundColor: 0x2c363f,
    hemiIntensity: 0.64,
    skyFallbackColor: 0x526073,
    fogColor: 0x6c7c8e,
    fogDensity: 0.00092,
    envMapIntensity: 0.80,
    backgroundIntensity: 0.82,
    backgroundBlurriness: 0.02,
    toneMappingExposure: 0.86,
    skyExposure: 0.72,
    asphaltRoughness: 0.58,
    asphaltMetalness: 0.0,
    asphaltEnvIntensity: 0.22,
    asphaltSpecularIntensity: 0.36,
    asphaltColorScale: 0.42,
  },

  heavy_rain: {
    id: 'heavy_rain',
    label: 'Pioggia Forte',
    shortLabel: 'Pioggia Forte',
    hdriKey: 'heavy_rain',
    physicsWeather: 'rain',
    rainIntensity: 1.65,
    isNight: false,
    badgeTheme: 'storm',
    sunAzimuthDeg: 18,
    sunElevationDeg: 28,
    sunColor: 0x9eb2cc,
    sunIntensity: 0.60,
    hemiSkyColor: 0x64748b,
    hemiGroundColor: 0x1e2630,
    hemiIntensity: 0.60,
    skyFallbackColor: 0x2f3b4c,
    fogColor: 0x455365,
    fogDensity: 0.00145,
    envMapIntensity: 0.82,
    backgroundIntensity: 0.76,
    backgroundBlurriness: 0.03,
    toneMappingExposure: 0.85,
    skyExposure: 0.68,
    asphaltRoughness: 0.48,
    asphaltMetalness: 0.0,
    asphaltEnvIntensity: 0.26,
    asphaltSpecularIntensity: 0.42,
    asphaltColorScale: 0.34,
  },

  night_clear: {
    id: 'night_clear',
    label: 'Notte Serena',
    shortLabel: 'Notte',
    hdriKey: 'night_clear',
    physicsWeather: 'dry',
    rainIntensity: 0,
    isNight: true,
    badgeTheme: 'night',
    sunAzimuthDeg: 45,
    sunElevationDeg: 58,
    sunColor: 0xe6f0ff,
    sunIntensity: 1.5,
    hemiSkyColor: 0x5670a6,
    hemiGroundColor: 0x222836,
    hemiIntensity: 0.7,
    skyFallbackColor: 0x091122,
    fogColor: 0x0d1629,
    fogDensity: 0.00062,
    envMapIntensity: 0.78,
    backgroundIntensity: 0.92,
    backgroundBlurriness: 0.0,
    toneMappingExposure: 0.92,
    asphaltRoughness: 0.92,
    asphaltMetalness: 0.0,
    asphaltEnvIntensity: 0.18,
    asphaltSpecularIntensity: 0.26,
    asphaltColorScale: 0.36,
  },
};

export const SKY_PRESET_LIST = Object.values(SKY_PRESETS);

export const SKY_SELECTOR_OPTIONS = [
  { id: 'random', label: 'Casuale' },
  ...SKY_PRESET_LIST.map((p) => ({ id: p.id, label: p.label })),
];

// Pool Opzione A per sorteggio casuale in Carriera e modalità 'random'
export const DAY_TRACK_RANDOM_POOL = [
  'clear_day',
  'partly_cloudy',
  'sunrise',
  'sunset',
  'cloudy_sunset',
  'overcast',
  'rain',
  'heavy_rain',
];

export const NIGHT_TRACK_RANDOM_POOL = [
  'night_clear',
  'sunset',
  'cloudy_sunset',
  'rain',
  'heavy_rain',
];

function isNightCircuit(trackOrBiome) {
  if (!trackOrBiome) return false;
  if (typeof trackOrBiome === 'string') {
    return NIGHT_CIRCUIT_IDS.has(trackOrBiome);
  }
  if (typeof trackOrBiome.isNight === 'boolean') {
    return trackOrBiome.isNight;
  }
  const trackId = trackOrBiome.trackId || trackOrBiome.id;
  return Boolean(trackId && NIGHT_CIRCUIT_IDS.has(trackId));
}

export function getSkyPresetById(id) {
  if (id === 'dry') return SKY_PRESETS.clear_day;
  if (id === 'night') return SKY_PRESETS.night_clear;
  return SKY_PRESETS[id] || SKY_PRESETS.clear_day;
}

/**
 * Risolve un preset richiesto ('random', un ID preset o legacy 'dry'/'rain').
 * Con 'random' applica l'Opzione A confermata (pool realistico per GP notturni vs diurni).
 * @param {string} requestedId
 * @param {string | { id?: string, trackId?: string, isNight?: boolean } | null} [trackOrBiome=null]
 * @param {() => number} [rng=Math.random]
 */
export function resolveSkyPreset(requestedId, trackOrBiome = null, rng = Math.random) {
  if (requestedId === 'random' || !requestedId) {
    const pool = isNightCircuit(trackOrBiome)
      ? NIGHT_TRACK_RANDOM_POOL
      : DAY_TRACK_RANDOM_POOL;
    const r = typeof rng === 'function' ? rng() : Math.random();
    const idx = Math.min(pool.length - 1, Math.max(0, Math.floor(r * pool.length)));
    return SKY_PRESETS[pool[idx]];
  }
  if (requestedId === 'dry') {
    return isNightCircuit(trackOrBiome) ? SKY_PRESETS.night_clear : SKY_PRESETS.clear_day;
  }
  return getSkyPresetById(requestedId);
}

/**
 * Ciclo rapido meteo in pista (tasto R): asciutto -> pioggia -> pioggia forte -> asciutto.
 */
export function getNextWeatherCyclePreset(currentId, trackOrBiome = null) {
  const cur = getSkyPresetById(currentId);
  if (cur.id === 'rain') return SKY_PRESETS.heavy_rain;
  if (cur.id === 'heavy_rain') {
    return isNightCircuit(trackOrBiome) ? SKY_PRESETS.night_clear : SKY_PRESETS.clear_day;
  }
  return SKY_PRESETS.rain;
}

export function loadSavedSkyPresetOption() {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_SKY_PRESET_OPTION;
    const saved = localStorage.getItem(SKY_PRESET_STORAGE_KEY);
    if (!saved) return DEFAULT_SKY_PRESET_OPTION;
    if (saved === 'auto' || saved === 'random' || SKY_PRESETS[saved]) {
      return saved;
    }
    return DEFAULT_SKY_PRESET_OPTION;
  } catch {
    return DEFAULT_SKY_PRESET_OPTION;
  }
}

export function saveSkyPresetOption(optionId) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SKY_PRESET_STORAGE_KEY, optionId || DEFAULT_SKY_PRESET_OPTION);
  } catch {
    // Ignore storage quota / private mode
  }
}
