/**
 * Specifiche prestazionali della monoposto (Step 7 & Step 9):
 * - Livello Base (Standard)
 * - Livello Massimo (Max Upgrade — disponibile in Prove Libere o tramite 5/5 upgrade Carriera)
 * - 5 Aree di Upgrade Carriera (Motore, Gomme, Sospensioni, Freni, Aerodinamica)
 */

export const UPGRADE_MAX_LEVEL = 5;

export const UPGRADE_CATEGORIES = {
  engine: {
    id: 'engine',
    label: 'Motore',
    description: 'Accelerazione fino a +13% e velocità di punta +4.5%',
    costs: [120000, 220000, 360000, 550000, 800000],
  },
  tires: {
    id: 'tires',
    label: 'Gomme',
    description: 'Aderenza fino a +10% e usura ridotta fino a -25%',
    costs: [120000, 220000, 360000, 550000, 800000],
  },
  suspension: {
    id: 'suspension',
    label: 'Sospensioni',
    description: 'Stabilità in frenata brusca e cordoli fino a +22%',
    costs: [120000, 220000, 360000, 550000, 800000],
  },
  brakes: {
    id: 'brakes',
    label: 'Freni',
    description: 'Potenza frenante e resistenza al bloccaggio fino a +14%',
    costs: [120000, 220000, 360000, 550000, 800000],
  },
  aero: {
    id: 'aero',
    label: 'Aerodinamica',
    description: 'Carico deportante (Downforce) in curva fino a +20%',
    costs: [120000, 220000, 360000, 550000, 800000],
  },
};

export const CAR_LEVEL_PRESETS = {
  base: {
    id: 'base',
    label: 'Livello Base (Standard)',
    shortLabel: 'Base',
    engineAccelMult: 1.0,
    topSpeedMult: 1.0,
    brakeMult: 1.0,
    aeroDownforceMult: 1.0,
    tireGripMult: 1.0,
    tireWearMult: 1.0,
    suspensionStabilityMult: 1.0,
  },
  max: {
    id: 'max',
    label: 'Livello Massimo (Max Upgrade)',
    shortLabel: 'MAX',
    engineAccelMult: 1.13,
    topSpeedMult: 1.045,
    brakeMult: 1.14,
    aeroDownforceMult: 1.20,
    tireGripMult: 1.10,
    tireWearMult: 0.75,
    suspensionStabilityMult: 1.22,
  },
};

function clampUpgradeLevel(value) {
  const n = Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(UPGRADE_MAX_LEVEL, n));
}

export function buildCarSpecsFromUpgrades(upgrades = {}) {
  const e = clampUpgradeLevel(upgrades.engine);
  const t = clampUpgradeLevel(upgrades.tires);
  const s = clampUpgradeLevel(upgrades.suspension);
  const b = clampUpgradeLevel(upgrades.brakes);
  const a = clampUpgradeLevel(upgrades.aero);

  const normalizedUpgrades = {
    engine: e,
    tires: t,
    suspension: s,
    brakes: b,
    aero: a,
  };

  const totalLevels = e + t + s + b + a;
  if (totalLevels === 0) {
    return {
      ...CAR_LEVEL_PRESETS.base,
      upgrades: normalizedUpgrades,
    };
  }
  if (totalLevels === 25) {
    return {
      ...CAR_LEVEL_PRESETS.max,
      upgrades: normalizedUpgrades,
    };
  }

  return {
    id: 'custom',
    label: `Vettura Carriera (${totalLevels}/25)`,
    shortLabel: `UPG ${totalLevels}/25`,
    upgrades: normalizedUpgrades,
    engineAccelMult: Number((1.0 + (0.13 * e) / UPGRADE_MAX_LEVEL).toFixed(4)),
    topSpeedMult: Number((1.0 + (0.045 * e) / UPGRADE_MAX_LEVEL).toFixed(4)),
    brakeMult: Number((1.0 + (0.14 * b) / UPGRADE_MAX_LEVEL).toFixed(4)),
    aeroDownforceMult: Number((1.0 + (0.20 * a) / UPGRADE_MAX_LEVEL).toFixed(4)),
    tireGripMult: Number((1.0 + (0.10 * t) / UPGRADE_MAX_LEVEL).toFixed(4)),
    tireWearMult: Number((1.0 - (0.25 * t) / UPGRADE_MAX_LEVEL).toFixed(4)),
    suspensionStabilityMult: Number((1.0 + (0.22 * s) / UPGRADE_MAX_LEVEL).toFixed(4)),
  };
}

export function getCarSpecsForLevel(levelId = 'base') {
  return CAR_LEVEL_PRESETS[levelId] || CAR_LEVEL_PRESETS.base;
}
