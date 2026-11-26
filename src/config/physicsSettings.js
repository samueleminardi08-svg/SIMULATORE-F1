/**
 * Impostazioni FISICA Modulari & Livello Bot IA indipendente (Step 5 — PIANO PRE STEP 4).
 *
 * Sostituisce i 3 vecchi preset fissi (Principiante / Intermedio / Realistico) con:
 * - 7 toggle indipendenti per ogni meccanica fisica
 * - Slider dedicato "Livello Bot IA" (75%–105%)
 * - Moltiplicatore premi Carriera dinamico (0.90× – 1.45×)
 *
 * Modulo puro JavaScript (Node.js headless safe, persistito in localStorage).
 */

export const PHYSICS_SETTINGS_STORAGE_KEY = 'f1_game_physics_settings_v1';
export const BOT_AI_MIN_LEVEL = 75;
export const BOT_AI_MAX_LEVEL = 105;

export const DEFAULT_PHYSICS_SETTINGS = {
  aerodynamics: true,              // Carico aerodinamico (downforce v² + drag)
  tireDegradation: true,           // Usura gomme, calo grip, graining & blistering
  wheelLockup: true,               // Bloccaggio ruote anteriori in staccata (OFF = ABS)
  tractionControlOff: false,       // Disattiva controllo trazione (ON = sovrasterzo di potenza reale)
  highSpeedBrakeInstability: true, // Instabilità in frenate brusche ad alta velocità
  offTrackPenalties: true,         // Erba scivolosa / resistenza e cordoli severi
  rainPhysics: true,               // Riduzione grip/frenata su pista bagnata
  botAiLevel: 94,                  // Slider indipendente 75..105 (%)
};

export const PHYSICS_TOGGLE_DEFS = [
  {
    key: 'aerodynamics',
    label: 'Aerodinamica (Downforce v²)',
    description: 'Carico aerodinamico progressivo ad alta velocità e resistenza all\'aria.',
  },
  {
    key: 'tireDegradation',
    label: 'Degrado Gomme, Graining & Blistering',
    description: 'Usura mescole S/M/H/W, temperatura battistrada e perdita grip termica/meccanica.',
  },
  {
    key: 'wheelLockup',
    label: 'Bloccaggio Ruote (OFF = ABS)',
    description: 'Bloccaggio dell\'anteriore interna in staccata al limite con fumo e spiattellamento.',
  },
  {
    key: 'tractionControlOff',
    label: 'Controllo Trazione OFF (Pro)',
    description: 'Disattiva il TC: accelerare a fondo in uscita curva genera sovrasterzo di potenza reale.',
  },
  {
    key: 'highSpeedBrakeInstability',
    label: 'Instabilità Frenata Alta Velocità',
    description: 'Scomposizione del retrotreno se si sterza bruscamente in staccata sopra i 170 km/h.',
  },
  {
    key: 'offTrackPenalties',
    label: 'Penalità Fuori Pista & Cordoli',
    description: 'Erba scivolosa con forte attrito/instabilità e cordoli più impegnativi.',
  },
  {
    key: 'rainPhysics',
    label: 'Fisica Pioggia Reale',
    description: 'Riduzione aderenza, frenata più lunga e bloccaggi facilitati su asfalto bagnato.',
  },
];

let memoryFallbackSettings = null;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function resolveStorage(explicitStorage = null) {
  if (explicitStorage) return explicitStorage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  return null;
}

/**
 * Converte un vecchio preset stringa ('beginner' | 'intermediate' | 'realistic')
 * nel corrispondente oggetto PhysicsSettings modulare (retrocompatibilità salvataggi/P2P).
 */
export function physicsSettingsFromLegacyDifficulty(difficultyId) {
  if (difficultyId === 'beginner') {
    return {
      aerodynamics: true,
      tireDegradation: false,
      wheelLockup: false,
      tractionControlOff: false,
      highSpeedBrakeInstability: false,
      offTrackPenalties: false,
      rainPhysics: false,
      botAiLevel: 85,
    };
  }
  if (difficultyId === 'realistic') {
    return {
      aerodynamics: true,
      tireDegradation: true,
      wheelLockup: true,
      tractionControlOff: true,
      highSpeedBrakeInstability: true,
      offTrackPenalties: true,
      rainPhysics: true,
      botAiLevel: 100,
    };
  }
  return { ...DEFAULT_PHYSICS_SETTINGS };
}

export function normalizePhysicsSettings(raw = null) {
  if (typeof raw === 'string') {
    return physicsSettingsFromLegacyDifficulty(raw);
  }
  const src = raw && typeof raw === 'object' ? raw : {};
  const rawAi = Number(src.botAiLevel);
  const botAiLevel = Number.isFinite(rawAi)
    ? clamp(Math.round(rawAi), BOT_AI_MIN_LEVEL, BOT_AI_MAX_LEVEL)
    : DEFAULT_PHYSICS_SETTINGS.botAiLevel;

  return {
    aerodynamics:
      src.aerodynamics !== undefined ? Boolean(src.aerodynamics) : DEFAULT_PHYSICS_SETTINGS.aerodynamics,
    tireDegradation:
      src.tireDegradation !== undefined
        ? Boolean(src.tireDegradation)
        : DEFAULT_PHYSICS_SETTINGS.tireDegradation,
    wheelLockup:
      src.wheelLockup !== undefined ? Boolean(src.wheelLockup) : DEFAULT_PHYSICS_SETTINGS.wheelLockup,
    tractionControlOff:
      src.tractionControlOff !== undefined
        ? Boolean(src.tractionControlOff)
        : DEFAULT_PHYSICS_SETTINGS.tractionControlOff,
    highSpeedBrakeInstability:
      src.highSpeedBrakeInstability !== undefined
        ? Boolean(src.highSpeedBrakeInstability)
        : DEFAULT_PHYSICS_SETTINGS.highSpeedBrakeInstability,
    offTrackPenalties:
      src.offTrackPenalties !== undefined
        ? Boolean(src.offTrackPenalties)
        : DEFAULT_PHYSICS_SETTINGS.offTrackPenalties,
    rainPhysics:
      src.rainPhysics !== undefined ? Boolean(src.rainPhysics) : DEFAULT_PHYSICS_SETTINGS.rainPhysics,
    botAiLevel,
  };
}

export function loadPhysicsSettings(explicitStorage = null) {
  const storage = resolveStorage(explicitStorage);
  let rawJson = null;
  if (storage && typeof storage.getItem === 'function') {
    rawJson = storage.getItem(PHYSICS_SETTINGS_STORAGE_KEY);
  } else if (memoryFallbackSettings) {
    return { ...memoryFallbackSettings };
  }

  if (!rawJson) {
    return { ...DEFAULT_PHYSICS_SETTINGS };
  }
  try {
    return normalizePhysicsSettings(JSON.parse(rawJson));
  } catch {
    return { ...DEFAULT_PHYSICS_SETTINGS };
  }
}

export function savePhysicsSettings(settings, explicitStorage = null) {
  const normalized = normalizePhysicsSettings(settings);
  memoryFallbackSettings = { ...normalized };
  const storage = resolveStorage(explicitStorage);
  if (storage && typeof storage.setItem === 'function') {
    storage.setItem(PHYSICS_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

/**
 * Traduce i 7 toggle FISICA + slider Bot IA nei coefficienti numerici letti
 * da CarPhysics.js, AeroAndTires.js, BotController.js e VirtualInputFilter.js.
 */
export function resolveEffectivePhysicsProfile(physicsSettings) {
  const s = normalizePhysicsSettings(physicsSettings);
  const activeCount = PHYSICS_TOGGLE_DEFS.reduce((acc, d) => acc + (s[d.key] ? 1 : 0), 0);

  return {
    id: 'custom',
    settings: s,
    activeRealisticCount: activeCount,
    totalToggleCount: PHYSICS_TOGGLE_DEFS.length,
    label: `Fisica (${activeCount}/7) • IA ${s.botAiLevel}%`,
    shortLabel: `IA ${s.botAiLevel}%`,
    description: `${activeCount}/${PHYSICS_TOGGLE_DEFS.length} sistemi realistici attivi • Bot IA ${s.botAiLevel}%`,
    // Coefficienti effettivi di simulazione
    aerodynamicsEnabled: s.aerodynamics,
    tireDegradationEnabled: s.tireDegradation,
    absAssist: !s.wheelLockup,
    lockupResistanceMultiplier: s.wheelLockup ? 1.04 : 3.5,
    cadenceAssistGraceTime: s.wheelLockup ? 0.10 : 99.0,
    steerBrakeAssist: s.wheelLockup ? 0.12 : 1.0,
    tractionControl: s.tractionControlOff ? 0.0 : 0.88,
    tractionControlOff: s.tractionControlOff,
    highSpeedBrakeInstabilityMultiplier: s.highSpeedBrakeInstability ? 1.0 : 0.0,
    offTrackPenaltiesEnabled: s.offTrackPenalties,
    minGrassGrip: s.offTrackPenalties ? 0.32 : 0.72,
    grassDragMultiplier: s.offTrackPenalties ? 1.0 : 0.38,
    grassInstabilityMultiplier: s.offTrackPenalties ? 1.0 : 0.08,
    tireWearMultiplier: s.tireDegradation ? 1.0 : 0.0,
    rainPhysicsEnabled: s.rainPhysics,
    rainGripPenaltyMultiplier: s.rainPhysics ? 1.0 : 0.0,
    botAiLevel: s.botAiLevel,
    botPaceMultiplier: s.botAiLevel / 100,
  };
}
