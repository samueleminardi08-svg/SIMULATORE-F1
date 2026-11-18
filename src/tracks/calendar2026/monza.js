/**
 * Prima pista reale (Step 3): Autodromo Nazionale Monza (Italia).
 * Layout orario fedele con Rettilineo dei Box, Prima Variante, Curva Biassono,
 * Variante della Roggia, Lesmo 1 & 2, Serraglio, Variante Ascari,
 * Rettilineo Opposto e Curva Alboreto (Parabolica).
 */

export const MONZA_TRACK_DATA = {
  id: 'monza_2026',
  name: 'Autodromo Nazionale Monza',
  country: 'Italia',
  trackWidth: 14.0,     // metri larghezza asfalto
  kerbWidth: 1.5,       // metri larghezza cordoli
  barrierOffset: 15.5,  // distanza dal centro pista alle barriere (lascia ~7m di erba per lato)
  kerbStyle: 'italian', // cordoli rosso-bianco-verdi o biancorossi
  // Frazioni reali dei 3 settori FIA a Monza: S1 fino alla Roggia (0.26), S2 fino ad Ascari (0.52), S3 fino al traguardo (1.0)
  sectorSplits: [0.26, 0.52, 1.0],
  startTransform: {
    x: 0,
    y: 0,
    z: 0,
    heading: 0, // Direzione +Z lungo il rettilineo principale
  },
  controlPoints: [
    // Rettilineo Principale (Main Straight)
    [0, 0, -480],
    [0, 0, -180],
    [0, 0, 0],
    [0, 0, 220],
    [0, 0, 430],
    [0, 0, 510],

    // Prima Variante (Variante del Rettifilo: Destra - Sinistra)
    [-26, 0, 575],
    [-8, 0, 645],
    [-22, 0, 725],

    // Curva Biassono (Curva Grande)
    [-90, 0, 885],
    [-220, 0, 1035],
    [-395, 0, 1115],
    [-535, 0, 1130],

    // Variante della Roggia (Sinistra - Destra)
    [-600, 0, 1100],
    [-660, 0, 1135],
    [-725, 0, 1110],

    // Prima di Lesmo (Lesmo 1)
    [-800, 0, 1035],
    [-815, 0, 920],

    // Seconda di Lesmo (Lesmo 2)
    [-775, 0, 800],
    [-670, 0, 715],

    // Curva del Serraglio -> ingresso Ascari
    [-550, 0, 540],
    [-455, 0, 300],
    [-375, 0, 55],

    // Variante Ascari (Sinistra - Destra - Sinistra)
    [-330, 0, -95],
    [-380, 0, -190],
    [-335, 0, -290],

    // Rettilineo Opposto
    [-340, 0, -540],
    [-340, 0, -840],
    [-340, 0, -1060],

    // Curva Alboreto (Parabolica)
    [-295, 0, -1205],
    [-165, 0, -1255],
    [-45, 0, -1165],
    [-4, 0, -960],
    [0, 0, -720],
  ],
};
