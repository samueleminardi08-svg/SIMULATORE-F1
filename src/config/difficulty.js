/**
 * Adapter retrocompatibile per la configurazione fisica & livello Bot IA (Step 5 — PIANO PRE STEP 4).
 * Delega i nuovi oggetti PhysicsSettings a `resolveEffectivePhysicsProfile()` mantenendo
 * la retrocompatibilità con eventuali salvataggi/test legacy ('beginner' | 'intermediate' | 'realistic').
 */

import { resolveEffectivePhysicsProfile } from './physicsSettings.js';

export const DEFAULT_DIFFICULTY_ID = 'intermediate';

export const DIFFICULTY_LEVELS = {
  beginner: {
    id: 'beginner',
    label: 'Principiante (Assistito)',
    shortLabel: 'Principiante',
    description:
      'ABS (nessun bloccaggio), controllo trazione alto, erba e pioggia perdonano, Bot al 85%.',
    aerodynamicsEnabled: true,
    tireDegradationEnabled: true,
    absAssist: true,
    lockupResistanceMultiplier: 3.0,
    cadenceAssistGraceTime: 99.0,
    steerBrakeAssist: 1.0,
    tractionControl: 1.0,
    tractionControlOff: false,
    offTrackPenaltiesEnabled: true,
    minGrassGrip: 0.65,
    grassDragMultiplier: 0.55,
    grassInstabilityMultiplier: 0.15,
    tireWearMultiplier: 0.50,
    rainPhysicsEnabled: true,
    rainGripPenaltyMultiplier: 0.50,
    highSpeedBrakeInstabilityMultiplier: 0.0,
    botAiLevel: 85,
    botPaceMultiplier: 0.85,
  },
  intermediate: {
    id: 'intermediate',
    label: 'Intermedio (Bilanciato)',
    shortLabel: 'Intermedio',
    description:
      'Bloccaggio solo se forzi sterzo in staccata, trazione moderata, erba scivolosa, Bot al 94%.',
    aerodynamicsEnabled: true,
    tireDegradationEnabled: true,
    absAssist: false,
    lockupResistanceMultiplier: 1.22,
    cadenceAssistGraceTime: 0.55,
    steerBrakeAssist: 0.45,
    tractionControl: 0.5,
    tractionControlOff: false,
    offTrackPenaltiesEnabled: true,
    minGrassGrip: 0.50,
    grassDragMultiplier: 0.80,
    grassInstabilityMultiplier: 0.55,
    tireWearMultiplier: 1.00,
    rainPhysicsEnabled: true,
    rainGripPenaltyMultiplier: 0.80,
    highSpeedBrakeInstabilityMultiplier: 0.55,
    botAiLevel: 94,
    botPaceMultiplier: 0.94,
  },
  realistic: {
    id: 'realistic',
    label: 'Realistico (Simulazione Pro)',
    shortLabel: 'Realistico',
    description:
      'Zero aiuti: bloccaggio reale, erba come ghiaccio, usura e pioggia severe, Bot al 100%.',
    aerodynamicsEnabled: true,
    tireDegradationEnabled: true,
    absAssist: false,
    lockupResistanceMultiplier: 1.00,
    cadenceAssistGraceTime: 0.0,
    steerBrakeAssist: 0.0,
    tractionControl: 0.0,
    tractionControlOff: true,
    offTrackPenaltiesEnabled: true,
    minGrassGrip: 0.32,
    grassDragMultiplier: 1.00,
    grassInstabilityMultiplier: 1.00,
    tireWearMultiplier: 1.25,
    rainPhysicsEnabled: true,
    rainGripPenaltyMultiplier: 1.00,
    highSpeedBrakeInstabilityMultiplier: 1.00,
    botAiLevel: 100,
    botPaceMultiplier: 1.00,
  },
};

export function getDifficultyConfig(difficultyOrSettings = DEFAULT_DIFFICULTY_ID) {
  if (difficultyOrSettings && typeof difficultyOrSettings === 'object') {
    if ('botPaceMultiplier' in difficultyOrSettings && 'aerodynamicsEnabled' in difficultyOrSettings) {
      return difficultyOrSettings;
    }
    return resolveEffectivePhysicsProfile(difficultyOrSettings);
  }
  return DIFFICULTY_LEVELS[difficultyOrSettings] || DIFFICULTY_LEVELS[DEFAULT_DIFFICULTY_ID];
}
