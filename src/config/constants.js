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

  // Dinamica sterzo e aderenza laterale
  wheelbase: 3.6,              // passo vettura (metri)
  maxSteerAngle: 0.40,         // rad (~23°)
  steerSpeed: 9.5,             // rapidità sterzata
  steerReturnSpeed: 12.0,      // velocità di riallineamento volante
  highSpeedSteerScale: 18.0,   // velocità di riferimento (m/s) per riduzione angolo sterzo
  highSpeedSteerExponent: 1.85,// progressività sterzo alle alte velocità
  lateralGripCoeff: 28.0,      // forza di richiamo laterale delle gomme
  maxLateralAccel: 34.0,       // limite base di aderenza laterale (m/s^2, ~3.4G)

  wheelRadius: 0.36,           // raggio ruota (metri)
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
  carRadius: 1.05,             // semilarghezza collisione monoposto (metri)
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
  tireWearLockupMult: 0.018,     // spiattellamento rapido durante il bloccaggio
  minTireGripFactor: 0.58,       // grip residuo a gomme completamente usurate (0%)
  lockupBrakeHoldThreshold: 0.22,// soglia temporale frenata piena (s)
  lockupSteerSensitivity: 0.55,  // penalità sterzata durante la frenata
  lockupUndersteerFactor: 0.35,  // riduzione sterzo effettivo a ruote bloccate
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
    lockupThreshold: 0.64,
    extraDrag: 0.00025,
  },
};

// Configurazione cronometraggio, 3 settori F1 e delta (Step 4)
export const TIMING_CONFIG = {
  sectorCount: 3,                      // 3 settori ufficiali (S1, S2, S3)
  defaultSectorSplits: [0.33, 0.66, 1.0],
  referenceCruisingSpeedMs: 66.0,      // velocità media di riferimento per benchmark iniziali
};

// Le 3 viste della camera commutabili con il tasto C
export const CAMERA_MODES = [
  { id: 'chase', label: 'Da dietro (Chase Cam)' },
  { id: 'cockpit', label: 'Prima persona (Abitacolo)' },
  { id: 'aerial', label: "Dall'alto (Vista Aerea)" },
];

export const LOCAL_PLAYER_ID = 'player_1';
