/**
 * Classificazione visuale e PBR/HDRI dei 24 circuiti del calendario F1 2026 in 4 biomi:
 * - european_park: parchi/autodromi verdi europei, asiatici e americani
 * - tropical_coastal: circuiti costieri, dune sabbiose e climi caldi
 * - desert_night: GP notturni nel deserto (Bahrain, Jeddah, Qatar, Abu Dhabi)
 * - urban_street: circuiti cittadini (Monaco, Madrid, Baku, Singapore, Las Vegas)
 *
 * Tutti gli ID texture e HDRI corrispondono esclusivamente a risorse verificate in
 * `public/assets/3d/manifest.json` (zero richieste HTTP 404).
 */

export const BIOME_PRESETS = {
  european_park: {
    biomeId: 'european_park',
    vegetationProfile: 'park',
    isNight: false,
    hdriDry: 'clear_day',
    hdriRain: 'rain',
    asphaltTextureId: 'asphalt_track',
    asphaltTint: 0xa4aab4,
    groundTextureId: 'grass_004',
    groundTint: 0x82ae64,
    groundFallbackBase: '#2d5a27',
    groundFallbackAlt: '#33652c',
    groundTileMeters: 22,
    runoffTextureId: 'gravelly_sand',
    runoffTint: 0xb8b2a6,
    wallTextureId: 'concrete_wall_007',
    metalTextureId: 'metal_plate',
    skyDryColor: 0x87b8e8,
    fogDryColor: 0x9ec4e6,
    fogDryDensity: 0.00032,
    sunDryColor: 0xfff5e4,
    sunDryIntensity: 1.75,
    hemiDrySky: 0xdbeafe,
    hemiDryGround: 0x3b5222,
    hemiDryIntensity: 0.62,
    envMapIntensity: 0.9,
    toneMappingExposureDry: 1.04,
    skyRainColor: 0x526073,
    fogRainColor: 0x5c6b7e,
    fogRainDensity: 0.00088,
    sunRainColor: 0xcbd5e1,
    sunRainIntensity: 0.68,
    hemiRainSky: 0x94a3b8,
    hemiRainGround: 0x2c363f,
    hemiRainIntensity: 0.58,
    rainEnvIntensity: 0.9,
    toneMappingExposureRain: 0.95,
  },

  tropical_coastal: {
    biomeId: 'tropical_coastal',
    vegetationProfile: 'tropical',
    isNight: false,
    hdriDry: 'clear_day',
    hdriRain: 'rain',
    asphaltTextureId: 'asphalt_track',
    asphaltTint: 0xa8aeb8,
    groundTextureId: 'grass_004',
    groundTint: 0x96b868,
    groundFallbackBase: '#3d6b34',
    groundFallbackAlt: '#46763b',
    groundTileMeters: 24,
    runoffTextureId: 'asphalt_pit_lane',
    runoffTint: 0x96a1b0,
    wallTextureId: 'concrete_wall_007',
    metalTextureId: 'metal_plate',
    skyDryColor: 0x7bc2f5,
    fogDryColor: 0x9dd1f5,
    fogDryDensity: 0.0003,
    sunDryColor: 0xfff7df,
    sunDryIntensity: 1.9,
    hemiDrySky: 0xe0f2fe,
    hemiDryGround: 0x6b6a3b,
    hemiDryIntensity: 0.68,
    envMapIntensity: 0.95,
    toneMappingExposureDry: 1.06,
    skyRainColor: 0x4b5b6e,
    fogRainColor: 0x56677a,
    fogRainDensity: 0.00088,
    sunRainColor: 0xcbd5e1,
    sunRainIntensity: 0.68,
    hemiRainSky: 0x94a3b8,
    hemiRainGround: 0x334155,
    hemiRainIntensity: 0.58,
    rainEnvIntensity: 0.9,
    toneMappingExposureRain: 0.95,
  },

  desert_night: {
    biomeId: 'desert_night',
    vegetationProfile: 'desert',
    isNight: true,
    hdriDry: 'night_clear',
    hdriRain: 'night_clear',
    asphaltTextureId: 'asphalt_track',
    asphaltTint: 0xb0b6c2,
    groundTextureId: 'coast_sand_01',
    groundTint: 0xc8b28d,
    groundFallbackBase: '#7c6a4d',
    groundFallbackAlt: '#877455',
    groundTileMeters: 28,
    runoffTextureId: 'asphalt_pit_lane',
    runoffTint: 0x8690a0,
    wallTextureId: 'concrete_wall_007',
    metalTextureId: 'metal_plate',
    skyDryColor: 0x0b1326,
    fogDryColor: 0x0e172a,
    fogDryDensity: 0.00048,
    sunDryColor: 0xeaf2ff,
    sunDryIntensity: 1.55,
    hemiDrySky: 0x5b74a8,
    hemiDryGround: 0x2e271e,
    hemiDryIntensity: 0.72,
    envMapIntensity: 1.05,
    toneMappingExposureDry: 1.15,
    skyRainColor: 0x09101f,
    fogRainColor: 0x111a2e,
    fogRainDensity: 0.001,
    sunRainColor: 0xbfd4f5,
    sunRainIntensity: 1.0,
    hemiRainSky: 0x475c82,
    hemiRainGround: 0x1c222e,
    hemiRainIntensity: 0.6,
    rainEnvIntensity: 1.08,
    toneMappingExposureRain: 1.08,
  },

  urban_street: {
    biomeId: 'urban_street',
    vegetationProfile: 'urban',
    isNight: false,
    hdriDry: 'clear_day',
    hdriRain: 'rain',
    asphaltTextureId: 'asphalt_track',
    asphaltTint: 0x9ca2ac,
    groundTextureId: 'asphalt_pit_lane',
    groundTint: 0x8d97a6,
    groundFallbackBase: '#333b48',
    groundFallbackAlt: '#3b4453',
    groundTileMeters: 20,
    runoffTextureId: 'asphalt_pit_lane',
    runoffTint: 0x828c9c,
    wallTextureId: 'concrete_wall_007',
    metalTextureId: 'metal_plate',
    skyDryColor: 0x8cbde8,
    fogDryColor: 0xa4cbe8,
    fogDryDensity: 0.00042,
    sunDryColor: 0xfff6e5,
    sunDryIntensity: 1.72,
    hemiDrySky: 0xdbeafe,
    hemiDryGround: 0x3b4252,
    hemiDryIntensity: 0.64,
    envMapIntensity: 0.92,
    toneMappingExposureDry: 1.04,
    skyRainColor: 0x475569,
    fogRainColor: 0x526176,
    fogRainDensity: 0.0012,
    sunRainColor: 0xcbd5e1,
    sunRainIntensity: 0.66,
    hemiRainSky: 0x94a3b8,
    hemiRainGround: 0x262f3d,
    hemiRainIntensity: 0.56,
    rainEnvIntensity: 0.98,
    toneMappingExposureRain: 0.96,
  },
};

const NIGHT_URBAN_OVERRIDES = {
  isNight: true,
  hdriDry: 'night_clear',
  hdriRain: 'night_clear',
  skyDryColor: 0x091122,
  fogDryColor: 0x111c33,
  fogDryDensity: 0.00056,
  sunDryColor: 0xe6efff,
  sunDryIntensity: 1.38,
  hemiDrySky: 0x5872a6,
  hemiDryGround: 0x222938,
  hemiDryIntensity: 0.68,
  envMapIntensity: 1.08,
  toneMappingExposureDry: 1.15,
  skyRainColor: 0x070d1a,
  fogRainColor: 0x111a2c,
  fogRainDensity: 0.00128,
  sunRainColor: 0xc2d4f0,
  sunRainIntensity: 0.96,
  hemiRainSky: 0x475d85,
  hemiRainGround: 0x1b2230,
  hemiRainIntensity: 0.58,
  rainEnvIntensity: 1.14,
  toneMappingExposureRain: 1.08,
};

/**
 * Mappatura esplicita di tutti i 24 tracciati del calendario F1 2026.
 */
export const TRACK_BIOME_MAP = {
  // 10 circuiti european_park
  albert_park_2026: { biomeId: 'european_park' },
  suzuka_2026: { biomeId: 'european_park' },
  montreal_2026: { biomeId: 'european_park' },
  barcelona_2026: { biomeId: 'european_park', groundTint: 0x92ad68 },
  red_bull_ring_2026: { biomeId: 'european_park', groundTint: 0x7ca95c },
  silverstone_2026: { biomeId: 'european_park' },
  spa_2026: { biomeId: 'european_park', groundTint: 0x729f58 },
  hungaroring_2026: { biomeId: 'european_park', groundTint: 0x90ad68 },
  monza_2026: { biomeId: 'european_park', groundTint: 0x7aa85c },
  interlagos_2026: { biomeId: 'european_park', groundTint: 0x84b064 },

  // 5 circuiti tropical_coastal
  miami_2026: { biomeId: 'tropical_coastal', runoffTint: 0x7caac2 },
  zandvoort_2026: {
    biomeId: 'tropical_coastal',
    groundTextureId: 'coast_sand_01',
    groundTint: 0xd8c6a0,
    groundFallbackBase: '#9a8a64',
    groundFallbackAlt: '#a5956d',
    runoffTextureId: 'gravelly_sand',
    groundTileMeters: 26,
  },
  austin_2026: {
    biomeId: 'tropical_coastal',
    groundTextureId: 'gravelly_sand',
    groundTint: 0xb5aa84,
    groundFallbackBase: '#6f6c47',
    groundFallbackAlt: '#7a774f',
  },
  mexico_2026: { biomeId: 'tropical_coastal', groundTint: 0xaeb989 },
  shanghai_2026: { biomeId: 'tropical_coastal', groundTint: 0xa5bc90 },

  // 4 circuiti desert_night
  bahrain_2026: { biomeId: 'desert_night' },
  jeddah_2026: {
    biomeId: 'desert_night',
    vegetationProfile: 'tropical',
    runoffTextureId: 'asphalt_pit_lane',
  },
  qatar_2026: { biomeId: 'desert_night', groundTint: 0xc2ab84 },
  yas_marina_2026: { biomeId: 'desert_night', runoffTint: 0x5c85a8 },

  // 5 circuiti urban_street
  monaco_2026: { biomeId: 'urban_street', vegetationProfile: 'tropical' },
  madrid_2026: { biomeId: 'urban_street' },
  baku_2026: { biomeId: 'urban_street', groundTint: 0x9a9894 },
  singapore_2026: {
    biomeId: 'urban_street',
    vegetationProfile: 'tropical',
    ...NIGHT_URBAN_OVERRIDES,
  },
  las_vegas_2026: {
    biomeId: 'urban_street',
    ...NIGHT_URBAN_OVERRIDES,
  },
};

/**
 * Restituisce la configurazione bioma/PBR/HDRI completa per un tracciato o un ID circuito.
 * @param {string | { id?: string, isStreet?: boolean }} trackOrId
 */
export function getTrackBiomeConfig(trackOrId) {
  const trackId = typeof trackOrId === 'string' ? trackOrId : trackOrId?.id;
  const override = trackId ? TRACK_BIOME_MAP[trackId] : null;
  const fallbackBiome =
    typeof trackOrId === 'object' && trackOrId?.isStreet
      ? 'urban_street'
      : 'european_park';
  const biomeId = override?.biomeId || fallbackBiome;
  const preset = BIOME_PRESETS[biomeId] || BIOME_PRESETS.european_park;
  return {
    ...preset,
    ...(override || {}),
    biomeId,
    trackId: trackId || 'unknown',
  };
}
