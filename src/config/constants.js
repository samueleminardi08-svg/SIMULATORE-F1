/**
 * Costanti globali di simulazione e configurazione Step 2.
 * La simulazione gira a tick fisso (60 Hz) per garantire determinismo
 * e predisposizione alla sincronizzazione multiplayer (Step 10).
 */

export const SIMULATION_TICK_RATE = 60;
export const FIXED_DT = 1 / SIMULATION_TICK_RATE;
export const MAX_ACCUMULATED_TIME = 0.25; // Evita spiral-of-death se il tab va in background

// Parametri fisica di guida base e cambio automatico a 8 marce (Step 2)
export const CAR_PHYSICS_CONFIG = {
  // Motore & Cambio Automatico (N, R, 1..8)
  idleRpm: 4000,
  maxRpm: 15000,
  upshiftRpm: 13500,
  downshiftRpm: 8800,
  shiftCooldown: 0.18, // secondi tra una cambiata e la successiva
  // Velocità massime per marcia (m/s): 8ª marcia ≈ 336 km/h
  gearTopSpeeds: [0, 31.0, 44.0, 55.5, 65.5, 74.0, 81.5, 88.0, 93.5],
  gearAccelMultipliers: [0, 1.45, 1.25, 1.10, 0.98, 0.88, 0.78, 0.68, 0.58],
  maxReverseSpeed: 15.0, // ~54 km/h
  reverseAccel: 14.0,

  // Dinamica longitudinale
  baseEngineAccel: 22.0,   // m/s^2 accelerazione base
  maxBrakeDecel: 42.0,     // m/s^2 potenza frenante F1
  rollingResistance: 1.6,  // m/s^2 attrito di rotolamento
  aeroDragCoeff: 0.0012,   // resistenza aerodinamica proporzionale a v^2

  // Dinamica sterzo, quote reali F1 2026 (1 unità = 1 metro) e aderenza laterale
  carWidth: 1.90,              // larghezza massima monoposto F1 2026 (metri)
  carLength: 5.32,             // lunghezza complessiva monoposto F1 2026 (metri)
  wheelbase: 3.40,             // passo vettura F1 2026 (metri)
  maxSteerAngle: 0.48,         // rad (~27.5° per tornanti stretti 1:1)
  steerSpeed: 9.5,             // rapidità sterzata
  steerReturnSpeed: 12.0,      // velocità di riallineamento volante
  highSpeedSteerScale: 24.0,   // velocità di riferimento (m/s) per riduzione angolo sterzo (taratura 6b)
  highSpeedSteerExponent: 1.72,// progressività sterzo alle alte velocità (taratura 6b)
  lateralGripCoeff: 28.0,      // forza di richiamo laterale delle gomme
  maxLateralAccel: 37.5,       // limite base di aderenza laterale (m/s^2, ~3.8G base + downforce)

  wheelRadius: 0.35,           // raggio ruota scalata F1 2026 (metri)
};

// Parametri Filtro Input Virtuale Graduale 0..1 per Tastiera WASD (Step 6b)
export const VIRTUAL_INPUT_CONFIG = {
  throttleAttackTime: 0.26,     // secondi 0 -> 1 premendo W
  throttleReleaseTime: 0.10,    // secondi 1 -> 0 rilasciando W
  throttleInitialStep: 0.16,    // risposta iniziale immediata su W
  brakeAttackTime: 0.36,        // secondi 0 -> 1 premendo S (pressioni brevi modulano senza lockup)
  brakeReleaseTime: 0.08,       // rilascio rapido per cadence braking
  brakeInitialStep: 0.22,       // pressione iniziale pulita al primo tocco S
  steerAttackTimeLow: 0.15,     // sterzo reattivo sotto ~90 km/h (tornanti/chicane)
  steerAttackTimeHigh: 0.27,    // sterzo fluido e progressivo sopra ~230 km/h
  steerReturnTime: 0.095,       // ritorno rapido al centro al rilascio A/D
  steerOppositeBoost: 2.3,      // cambio direzione veloce Sx <-> Dx nelle chicane
  steerLowSpeedMs: 25.0,        // ~90 km/h
  steerHighSpeedMs: 65.0,       // ~234 km/h
  brakeSteerAssistCap: 0.84,    // leggero limite sterzo in frenata intensa su Principiante/Intermedio
};

// Proprietà di aderenza e resistenza per ciascuna superficie (Step 3)
export const SURFACE_PHYSICS = {
  asphalt: {
    gripMultiplier: 1.0,
    tractionMultiplier: 1.0,
    brakeMultiplier: 1.0,
    extraRollingDrag: 0.0,
    yawInstability: 0.0,
    label: 'Asfalto',
  },
  pitlane: {
    gripMultiplier: 1.0,
    tractionMultiplier: 1.0,
    brakeMultiplier: 1.0,
    extraRollingDrag: 0.0,
    yawInstability: 0.0,
    label: 'Pit Lane',
  },
  kerb: {
    gripMultiplier: 0.88,
    tractionMultiplier: 0.92,
    brakeMultiplier: 0.90,
    extraRollingDrag: 1.2,
    yawInstability: 0.04,
    label: 'Cordolo',
  },
  grass: {
    gripMultiplier: 0.32,
    tractionMultiplier: 0.45,
    brakeMultiplier: 0.52,
    extraRollingDrag: 11.5,
    yawInstability: 0.38,
    label: 'Erba (Scivolosa)',
  },
};

export const COLLISION_CONFIG = {
  carRadius: 0.95,             // semilarghezza collisione monoposto F1 2026 (1.90 m / 2)
  restitution: 0.35,           // coefficiente rimbalzo anelastico contro barriera
  minBounceSpeed: 1.8,         // velocità minima di separazione (m/s)
  headingAlignStrength: 0.25,  // riallineamento dolce lungo il guardrail in strisciata
};

// Fisica avanzata: aerodinamica, gomme, bloccaggio, frenate brusche, sospensioni (Step 5)
export const ADVANCED_PHYSICS_CONFIG = {
  downforceGripGain: 0.48,       // bonus massimo aderenza aerodinamica alle alte velocità
  maxDownforceKg: 1250,          // carico aerodinamico massimo a 336 km/h (kg)
  tireWearRateBase: 0.00045,     // consumo base al secondo in velocità
  tireWearCornerMult: 0.0012,    // usura extra in curva
  tireWearLockupMult: 0.013,     // spiattellamento realistico durante il bloccaggio (taratura 6b)
  minTireGripFactor: 0.58,       // grip residuo a gomme completamente usurate (0%)
  lockupBrakeHoldThreshold: 0.22,// soglia temporale frenata piena (s)
  lockupSteerSensitivity: 0.42,  // penalità sterzata durante la frenata (taratura 6b per trail-braking)
  lockupUndersteerFactor: 0.50,  // riduzione sterzo effettivo a ruote bloccate (50% invece di 65%)
  lockupBrakePenalty: 0.78,      // riduzione potere frenante a ruote bloccate
  highSpeedBrakeThresholdMs: 48.0, // > ~173 km/h attiva controllo frenata brusca
  highSpeedBrakeYawTorque: 0.52, // instabilità retrotreno frenando bruscamente in curva ad alta velocità
  suspension: {
    maxPitchRad: 0.038,          // beccheggio max (dive/squat)
    maxRollRad: 0.045,           // rollio max in curva
    maxAeroDropM: 0.045,         // abbassamento corpo vettura da carico aero
    springStiffness: 18.0,       // reattività molle/ammortizzatori
    kerbVibrationAmp: 0.018,     // vibrazione verticale su cordoli ed erba
  },
};

// Mescole pneumatici Pirelli F1 2026 con finestre termiche, graining e blistering (Step 5)
export const TIRE_COMPOUNDS = {
  S: {
    id: 'S',
    name: 'Soft',
    shortName: 'SOFT',
    colorHex: '#ef4444',
    colorInt: 0xef4444,
    gripMult: 1.04,
    wearMult: 1.45,
    optTempMin: 82,
    optTempMax: 108,
    heatRate: 1.28,
    grainingSens: 0.45,
    blisteringSens: 1.45,
    wetGripMult: 0.64,
    dryWearMultOnWetTire: 1.0,
  },
  M: {
    id: 'M',
    name: 'Medium',
    shortName: 'MED',
    colorHex: '#facc15',
    colorInt: 0xfacc15,
    gripMult: 1.00,
    wearMult: 1.00,
    optTempMin: 86,
    optTempMax: 112,
    heatRate: 1.00,
    grainingSens: 0.85,
    blisteringSens: 1.00,
    wetGripMult: 0.62,
    dryWearMultOnWetTire: 1.0,
  },
  H: {
    id: 'H',
    name: 'Hard',
    shortName: 'HARD',
    colorHex: '#f8fafc',
    colorInt: 0xf8fafc,
    gripMult: 0.96,
    wearMult: 0.68,
    optTempMin: 92,
    optTempMax: 118,
    heatRate: 0.78,
    grainingSens: 1.55,
    blisteringSens: 0.65,
    wetGripMult: 0.58,
    dryWearMultOnWetTire: 1.0,
  },
  W: {
    id: 'W',
    name: 'Wet',
    shortName: 'WET',
    colorHex: '#38bdf8',
    colorInt: 0x38bdf8,
    gripMult: 0.88,
    wearMult: 1.10,
    optTempMin: 55,
    optTempMax: 85,
    heatRate: 1.45,
    grainingSens: 0.40,
    blisteringSens: 1.80,
    wetGripMult: 1.18,
    dryWearMultOnWetTire: 2.35,
  },
};

export const TIRE_COMPOUND_IDS = ['S', 'M', 'H', 'W'];

// Configurazione meteo asciutto / pioggia (Step 5)
export const WEATHER_CONFIG = {
  dry: {
    id: 'dry',
    label: 'Asciutto',
    gripMultiplier: 1.0,
    kerbGripMultiplier: 1.0,
    lockupThreshold: 0.92,
    extraDrag: 0.0,
  },
  rain: {
    id: 'rain',
    label: 'Pioggia',
    gripMultiplier: 0.68,
    kerbGripMultiplier: 0.62,
    lockupThreshold: 0.68,
    extraDrag: 0.00025,
  },
};

// Configurazione cronometraggio, 3 settori F1, Track Limits FIA Art. 33.3 e delta (Step 4)
export const TIMING_CONFIG = {
  sectorCount: 3,                      // 3 settori ufficiali (S1, S2, S3)
  defaultSectorSplits: [0.33, 0.66, 1.0],
  referenceCruisingSpeedMs: 66.0,      // velocità media di riferimento per benchmark iniziali
  fiaTrackLimits: {
    whiteLineOuterInsetM: 0.08,        // Bordo esterno linea bianca FIA (TrackBuilder: halfWidth - 0.18 + 0.10)
    frontTrackHalfM: 0.78,             // Semicarreggiata asse anteriore F1 2026 (m)
    rearTrackHalfM: 0.75,              // Semicarreggiata asse posteriore F1 2026 (m)
    frontAxleZ: 1.70,                  // Posizione longitudinale ruote anteriori (+Z)
    rearAxleZ: -1.70,                  // Posizione longitudinale ruote posteriori (-Z)
    frontTireHalfWidthM: 0.155,        // Semilarghezza battistrada anteriore (~310 mm)
    rearTireHalfWidthM: 0.195,         // Semilarghezza battistrada posteriore (~390 mm)
    minViolationDurationS: 0.05,       // 3 tick a 60 Hz con tutte e 4 le ruote oltre la linea bianca
    violationCooldownS: 2.0,           // Anti doppio conteggio nella stessa curva
    finalCornerProgressMin: 0.88,      // Ultima curva (~12% finale): in Qualifica/Libere annulla anche il giro successivo
    justifiedContactGraceS: 1.8,       // Art. 33.3 "justifiable reason": contatto vettura-vettura recente
  },
};

// Le 2 viste della camera commutabili con il tasto C (Onboard T-Cam e Prima Persona Abitacolo)
export const CAMERA_MODES = [
  { id: 'tcam', label: 'Onboard (T-Cam)' },
  { id: 'cockpit', label: 'Prima persona (Abitacolo)' },
];

export const LOCAL_PLAYER_ID = 'player_1';
