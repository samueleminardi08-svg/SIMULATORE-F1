/**
 * Profili comportamentali differenziati per tutti i 22 piloti della griglia F1 2026
 * (Step 4 — PIANO PRE STEP 4).
 *
 * Tratti normalizzati:
 * - aggression (0.60..0.98): propensione a staccate all'interno, difesa e sorpassi ravvicinati
 * - brakingSkill (0.72..0.98): punto di staccata tardivo e controllo anti-bloccaggio
 * - corneringConsistency (0.72..0.98): precisione nel colpire l'apex giro dopo giro
 * - trafficManagement (0.70..0.97): capacità di leggere la pista libera senza imbottigliarsi
 * - rainMastery (0.70..0.99): adattamento aderenza e fiducia su pista bagnata
 * - tyreManagement (0.70..0.98): sensibilità nella conservazione delle gomme
 * - mistakeProbability (0.004..0.032): probabilità rara di micro-errori realistici (mai crash assurdi)
 *
 * Modulo puro JavaScript (Node.js headless safe, 100% serializzabile).
 */

export const DEFAULT_DRIVER_PROFILE = {
  aggression: 0.80,
  brakingSkill: 0.85,
  corneringConsistency: 0.85,
  trafficManagement: 0.84,
  rainMastery: 0.83,
  tyreManagement: 0.84,
  mistakeProbability: 0.015,
};

export const F1_2026_DRIVER_PROFILES = {
  // McLaren
  norris: {
    aggression: 0.87,
    brakingSkill: 0.94,
    corneringConsistency: 0.95,
    trafficManagement: 0.93,
    rainMastery: 0.91,
    tyreManagement: 0.92,
    mistakeProbability: 0.008,
  },
  piastri: {
    aggression: 0.85,
    brakingSkill: 0.93,
    corneringConsistency: 0.95,
    trafficManagement: 0.92,
    rainMastery: 0.89,
    tyreManagement: 0.91,
    mistakeProbability: 0.008,
  },

  // Scuderia Ferrari
  leclerc: {
    aggression: 0.93,
    brakingSkill: 0.96,
    corneringConsistency: 0.93,
    trafficManagement: 0.93,
    rainMastery: 0.90,
    tyreManagement: 0.90,
    mistakeProbability: 0.011,
  },
  hamilton: {
    aggression: 0.88,
    brakingSkill: 0.96,
    corneringConsistency: 0.95,
    trafficManagement: 0.96,
    rainMastery: 0.98,
    tyreManagement: 0.97,
    mistakeProbability: 0.007,
  },

  // Red Bull Racing
  verstappen: {
    aggression: 0.97,
    brakingSkill: 0.98,
    corneringConsistency: 0.98,
    trafficManagement: 0.97,
    rainMastery: 0.99,
    tyreManagement: 0.95,
    mistakeProbability: 0.004,
  },
  hadjar: {
    aggression: 0.86,
    brakingSkill: 0.85,
    corneringConsistency: 0.83,
    trafficManagement: 0.81,
    rainMastery: 0.82,
    tyreManagement: 0.81,
    mistakeProbability: 0.022,
  },

  // Mercedes-AMG
  russell: {
    aggression: 0.87,
    brakingSkill: 0.93,
    corneringConsistency: 0.94,
    trafficManagement: 0.92,
    rainMastery: 0.91,
    tyreManagement: 0.91,
    mistakeProbability: 0.009,
  },
  antonelli: {
    aggression: 0.89,
    brakingSkill: 0.89,
    corneringConsistency: 0.87,
    trafficManagement: 0.85,
    rainMastery: 0.88,
    tyreManagement: 0.84,
    mistakeProbability: 0.018,
  },

  // Aston Martin
  alonso: {
    aggression: 0.93,
    brakingSkill: 0.95,
    corneringConsistency: 0.94,
    trafficManagement: 0.97,
    rainMastery: 0.96,
    tyreManagement: 0.96,
    mistakeProbability: 0.007,
  },
  stroll: {
    aggression: 0.76,
    brakingSkill: 0.80,
    corneringConsistency: 0.78,
    trafficManagement: 0.76,
    rainMastery: 0.86,
    tyreManagement: 0.82,
    mistakeProbability: 0.025,
  },

  // Williams
  albon: {
    aggression: 0.81,
    brakingSkill: 0.88,
    corneringConsistency: 0.89,
    trafficManagement: 0.89,
    rainMastery: 0.86,
    tyreManagement: 0.90,
    mistakeProbability: 0.013,
  },
  sainz: {
    aggression: 0.86,
    brakingSkill: 0.92,
    corneringConsistency: 0.93,
    trafficManagement: 0.94,
    rainMastery: 0.90,
    tyreManagement: 0.93,
    mistakeProbability: 0.009,
  },

  // Alpine
  gasly: {
    aggression: 0.84,
    brakingSkill: 0.87,
    corneringConsistency: 0.88,
    trafficManagement: 0.87,
    rainMastery: 0.88,
    tyreManagement: 0.86,
    mistakeProbability: 0.014,
  },
  colapinto: {
    aggression: 0.85,
    brakingSkill: 0.84,
    corneringConsistency: 0.82,
    trafficManagement: 0.80,
    rainMastery: 0.80,
    tyreManagement: 0.81,
    mistakeProbability: 0.023,
  },

  // Racing Bulls
  lawson: {
    aggression: 0.89,
    brakingSkill: 0.86,
    corneringConsistency: 0.85,
    trafficManagement: 0.84,
    rainMastery: 0.84,
    tyreManagement: 0.83,
    mistakeProbability: 0.018,
  },
  lindblad: {
    aggression: 0.84,
    brakingSkill: 0.82,
    corneringConsistency: 0.79,
    trafficManagement: 0.77,
    rainMastery: 0.79,
    tyreManagement: 0.78,
    mistakeProbability: 0.027,
  },

  // Haas F1 Team
  ocon: {
    aggression: 0.88,
    brakingSkill: 0.87,
    corneringConsistency: 0.88,
    trafficManagement: 0.86,
    rainMastery: 0.89,
    tyreManagement: 0.88,
    mistakeProbability: 0.014,
  },
  bearman: {
    aggression: 0.85,
    brakingSkill: 0.85,
    corneringConsistency: 0.84,
    trafficManagement: 0.82,
    rainMastery: 0.83,
    tyreManagement: 0.82,
    mistakeProbability: 0.020,
  },

  // Audi F1 Team
  hulkenberg: {
    aggression: 0.82,
    brakingSkill: 0.89,
    corneringConsistency: 0.90,
    trafficManagement: 0.89,
    rainMastery: 0.90,
    tyreManagement: 0.89,
    mistakeProbability: 0.012,
  },
  bortoleto: {
    aggression: 0.81,
    brakingSkill: 0.84,
    corneringConsistency: 0.84,
    trafficManagement: 0.82,
    rainMastery: 0.82,
    tyreManagement: 0.84,
    mistakeProbability: 0.021,
  },

  // Cadillac F1 Team
  perez: {
    aggression: 0.83,
    brakingSkill: 0.88,
    corneringConsistency: 0.86,
    trafficManagement: 0.90,
    rainMastery: 0.86,
    tyreManagement: 0.95,
    mistakeProbability: 0.015,
  },
  bottas: {
    aggression: 0.72,
    brakingSkill: 0.88,
    corneringConsistency: 0.91,
    trafficManagement: 0.87,
    rainMastery: 0.82,
    tyreManagement: 0.89,
    mistakeProbability: 0.011,
  },
};

/**
 * Restituisce una copia pulita del profilo comportamentale per un pilota.
 * @param {string | null | undefined} driverId
 */
export function getDriverProfile(driverId) {
  const base = (driverId && F1_2026_DRIVER_PROFILES[driverId]) || DEFAULT_DRIVER_PROFILE;
  return { ...base };
}
