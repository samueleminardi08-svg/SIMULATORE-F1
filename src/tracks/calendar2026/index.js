/**
 * Registro ufficiale dei 24 circuiti del Calendario F1 2026 in scala metrica 1:1.
 */

import { MELBOURNE_TRACK_DATA } from './melbourne.js';
import { SHANGHAI_TRACK_DATA } from './shanghai.js';
import { SUZUKA_TRACK_DATA } from './suzuka.js';
import { BAHRAIN_TRACK_DATA } from './bahrain.js';
import { JEDDAH_TRACK_DATA } from './jeddah.js';
import { MIAMI_TRACK_DATA } from './miami.js';
import { MONTREAL_TRACK_DATA } from './montreal.js';
import { MONACO_TRACK_DATA } from './monaco.js';
import { BARCELONA_TRACK_DATA } from './barcelona.js';
import { AUSTRIA_TRACK_DATA } from './austria.js';
import { SILVERSTONE_TRACK_DATA } from './silverstone.js';
import { SPA_TRACK_DATA } from './spa.js';
import { HUNGARORING_TRACK_DATA } from './hungaroring.js';
import { ZANDVOORT_TRACK_DATA } from './zandvoort.js';
import { MONZA_TRACK_DATA } from './monza.js';
import { MADRID_TRACK_DATA } from './madrid.js';
import { BAKU_TRACK_DATA } from './baku.js';
import { SINGAPORE_TRACK_DATA } from './singapore.js';
import { AUSTIN_TRACK_DATA } from './austin.js';
import { MEXICO_TRACK_DATA } from './mexico.js';
import { INTERLAGOS_TRACK_DATA } from './interlagos.js';
import { LAS_VEGAS_TRACK_DATA } from './las_vegas.js';
import { QATAR_TRACK_DATA } from './qatar.js';
import { ABU_DHABI_TRACK_DATA } from './abu_dhabi.js';

export const CALENDAR_2026_TRACKS = [
  MELBOURNE_TRACK_DATA,
  SHANGHAI_TRACK_DATA,
  SUZUKA_TRACK_DATA,
  BAHRAIN_TRACK_DATA,
  JEDDAH_TRACK_DATA,
  MIAMI_TRACK_DATA,
  MONTREAL_TRACK_DATA,
  MONACO_TRACK_DATA,
  BARCELONA_TRACK_DATA,
  AUSTRIA_TRACK_DATA,
  SILVERSTONE_TRACK_DATA,
  SPA_TRACK_DATA,
  HUNGARORING_TRACK_DATA,
  ZANDVOORT_TRACK_DATA,
  MONZA_TRACK_DATA,
  MADRID_TRACK_DATA,
  BAKU_TRACK_DATA,
  SINGAPORE_TRACK_DATA,
  AUSTIN_TRACK_DATA,
  MEXICO_TRACK_DATA,
  INTERLAGOS_TRACK_DATA,
  LAS_VEGAS_TRACK_DATA,
  QATAR_TRACK_DATA,
  ABU_DHABI_TRACK_DATA,
];

export const DEFAULT_TRACK_ID = 'albert_park_2026';

/**
 * Restituisce i dati del tracciato corrispondente all'ID richiesto (fallback al primo circuito).
 * @param {string} [trackId]
 */
export function getTrackById(trackId) {
  return CALENDAR_2026_TRACKS.find((track) => track.id === trackId) || CALENDAR_2026_TRACKS[0];
}

/**
 * Restituisce l'ID del circuito successivo nel calendario disponibile (ciclando dopo l'ultimo).
 * @param {string} [currentTrackId]
 */
export function getNextCalendarTrackId(currentTrackId) {
  const idx = CALENDAR_2026_TRACKS.findIndex((track) => track.id === currentTrackId);
  if (idx < 0) return CALENDAR_2026_TRACKS[0].id;
  return CALENDAR_2026_TRACKS[(idx + 1) % CALENDAR_2026_TRACKS.length].id;
}
