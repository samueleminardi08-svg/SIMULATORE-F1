/**
 * Definizione geometrica e logica della Pista Semplice di Prova (Step 1).
 * Il rettilineo principale corre lungo X = 0 in direzione +Z,
 * così la vettura parte sul traguardo in (0, 0, 0) con heading = 0.
 */

export const TEST_TRACK_DATA = {
  id: 'test_track_step1',
  name: 'Circuito di Prova F1',
  trackWidth: 14.0,     // metri di larghezza asfalto
  kerbWidth: 1.4,       // metri di larghezza cordoli laterali
  barrierOffset: 15.0,  // metri dal centro pista alle barriere
  startTransform: {
    x: 0,
    y: 0,
    z: 0,
    heading: 0, // Direzione +Z lungo il rettilineo principale
  },
  // Punti di controllo (X, Y, Z) in metri per la spline chiusa
  controlPoints: [
    [0, 0, -110],
    [0, 0, 0],
    [0, 0, 110],
    [-35, 0, 165],
    [-95, 0, 175],
    [-150, 0, 130],
    [-165, 0, 45],
    [-135, 0, -15],
    [-165, 0, -85],
    [-130, 0, -155],
    [-60, 0, -165],
  ],
};
