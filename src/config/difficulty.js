/**
 * Configurazione dei 3 livelli di difficoltà per Prove Libere e Carriera/Gara (Step 7).
 * Ciascun livello modifica sia le assistenze/quantità di fisica attiva sia la bravura dei bot.
 */

export const DEFAULT_DIFFICULTY_ID = 'intermediate';

export const DIFFICULTY_LEVELS = {
  beginner: {
    id: 'beginner',
    label: 'Principiante (Assistito)',
    shortLabel: 'Principiante',
    description:
      'ABS (nessun bloccaggio), controllo trazione alto, erba e pioggia perdonano, Bot al 85%.',
    absAssist: true,
    lockupResistanceMultiplier: 3.0,
    tractionControl: 1.0,
    minGrassGrip: 0.65,
    grassDragMultiplier: 0.55,
    grassInstabilityMultiplier: 0.15,
    tireWearMultiplier: 0.50,
    rainGripPenaltyMultiplier: 0.50,
    highSpeedBrakeInstabilityMultiplier: 0.0,
    botPaceMultiplier: 0.85,
  },
  intermediate: {
    id: 'intermediate',
    label: 'Intermedio (Bilanciato)',
    shortLabel: 'Intermedio',
    description:
      'Bloccaggio solo se forzi sterzo in staccata, trazione moderata, erba scivolosa, Bot al 94%.',
    absAssist: false,
    lockupResistanceMultiplier: 1.22,
    tractionControl: 0.5,
    minGrassGrip: 0.50,
    grassDragMultiplier: 0.80,
    grassInstabilityMultiplier: 0.55,
    tireWearMultiplier: 1.00,
    rainGripPenaltyMultiplier: 0.80,
    highSpeedBrakeInstabilityMultiplier: 0.55,
    botPaceMultiplier: 0.94,
  },
  realistic: {
    id: 'realistic',
    label: 'Realistico (Simulazione Pro)',
    shortLabel: 'Realistico',
    description:
      'Zero aiuti: bloccaggio reale, erba come ghiaccio, usura e pioggia severe, Bot al 100%.',
    absAssist: false,
    lockupResistanceMultiplier: 1.00,
    tractionControl: 0.0,
    minGrassGrip: 0.32,
    grassDragMultiplier: 1.00,
    grassInstabilityMultiplier: 1.00,
    tireWearMultiplier: 1.25,
    rainGripPenaltyMultiplier: 1.00,
    highSpeedBrakeInstabilityMultiplier: 1.00,
    botPaceMultiplier: 1.00,
  },
};

export function getDifficultyConfig(difficultyId = DEFAULT_DIFFICULTY_ID) {
  return DIFFICULTY_LEVELS[difficultyId] || DIFFICULTY_LEVELS[DEFAULT_DIFFICULTY_ID];
}
