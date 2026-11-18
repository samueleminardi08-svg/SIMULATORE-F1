/**
 * Script Node di download e conversione dei 24 circuiti ufficiali F1 2026 in scala 1:1
 * da GeoJSON (`bacinger/f1-circuits`) a file ES module per `src/tracks/calendar2026/`.
 *
 * Uso: node scripts/generate_f1_2026_tracks.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTrackSurface } from '../src/tracks/TrackSurface.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../src/tracks/calendar2026');
const BASE_URL = 'https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits';
const WGS84_RADIUS = 6378137;

const CALENDAR_2026_SPECS = [
  {
    round: 1,
    geoId: 'au-1953',
    id: 'albert_park_2026',
    varName: 'MELBOURNE_TRACK_DATA',
    file: 'melbourne.js',
    gpName: "Gran Premio d'Australia",
    name: 'Albert Park Circuit',
    country: 'Australia',
    city: 'Melbourne',
    officialLength: 5278,
    width: 14.0,
    kerbWidth: 1.4,
    kerbStyle: 'australian',
    sectorSplits: [0.31, 0.64, 1.0],
    isStreet: false,
  },
  {
    round: 2,
    geoId: 'cn-2004',
    id: 'shanghai_2026',
    varName: 'SHANGHAI_TRACK_DATA',
    file: 'shanghai.js',
    gpName: 'Gran Premio di Cina',
    name: 'Shanghai International Circuit',
    country: 'Cina',
    city: 'Shanghai',
    officialLength: 5451,
    width: 15.0,
    kerbWidth: 1.5,
    kerbStyle: 'chinese',
    sectorSplits: [0.32, 0.63, 1.0],
    isStreet: false,
  },
  {
    round: 3,
    geoId: 'jp-1962',
    id: 'suzuka_2026',
    varName: 'SUZUKA_TRACK_DATA',
    file: 'suzuka.js',
    gpName: 'Gran Premio del Giappone',
    name: 'Suzuka International Racing Course',
    country: 'Giappone',
    city: 'Suzuka',
    officialLength: 5807,
    width: 13.5,
    kerbWidth: 1.4,
    kerbStyle: 'japanese',
    sectorSplits: [0.34, 0.65, 1.0],
    isStreet: false,
    elev: [{ centerFrac: 0.8075, halfSpanFrac: 0.045, height: 8.5 }],
  },
  {
    round: 4,
    geoId: 'bh-2002',
    id: 'bahrain_2026',
    varName: 'BAHRAIN_TRACK_DATA',
    file: 'bahrain.js',
    gpName: 'Gran Premio del Bahrain',
    name: 'Bahrain International Circuit',
    country: 'Bahrain',
    city: 'Sakhir',
    officialLength: 5412,
    width: 14.5,
    kerbWidth: 1.5,
    kerbStyle: 'bahrain',
    sectorSplits: [0.31, 0.68, 1.0],
    isStreet: false,
  },
  {
    round: 5,
    geoId: 'sa-2021',
    id: 'jeddah_2026',
    varName: 'JEDDAH_TRACK_DATA',
    file: 'jeddah.js',
    gpName: "Gran Premio dell'Arabia Saudita",
    name: 'Jeddah Corniche Circuit',
    country: 'Arabia Saudita',
    city: 'Gedda',
    officialLength: 6175,
    width: 13.0,
    kerbWidth: 1.3,
    kerbStyle: 'saudi',
    sectorSplits: [0.33, 0.66, 1.0],
    isStreet: true,
  },
  {
    round: 6,
    geoId: 'us-2022',
    id: 'miami_2026',
    varName: 'MIAMI_TRACK_DATA',
    file: 'miami.js',
    gpName: 'Gran Premio di Miami',
    name: 'Miami International Autodrome',
    country: 'USA',
    city: 'Miami',
    officialLength: 5412,
    width: 14.0,
    kerbWidth: 1.4,
    kerbStyle: 'miami',
    sectorSplits: [0.30, 0.67, 1.0],
    isStreet: false,
  },
  {
    round: 7,
    geoId: 'ca-1978',
    id: 'montreal_2026',
    varName: 'MONTREAL_TRACK_DATA',
    file: 'montreal.js',
    gpName: 'Gran Premio del Canada',
    name: 'Circuit Gilles-Villeneuve',
    country: 'Canada',
    city: 'Montréal',
    officialLength: 4361,
    width: 13.0,
    kerbWidth: 1.3,
    kerbStyle: 'standard',
    sectorSplits: [0.33, 0.66, 1.0],
    isStreet: false,
  },
  {
    round: 8,
    geoId: 'mc-1929',
    id: 'monaco_2026',
    varName: 'MONACO_TRACK_DATA',
    file: 'monaco.js',
    gpName: 'Gran Premio di Monaco',
    name: 'Circuit de Monaco',
    country: 'Monaco',
    city: 'Monte Carlo',
    officialLength: 3337,
    width: 12.0,
    kerbWidth: 1.2,
    kerbStyle: 'standard',
    sectorSplits: [0.33, 0.66, 1.0],
    isStreet: true,
    elev: [{ centerFrac: 0.138, halfSpanFrac: 0.035, height: 8.0 }],
  },
  {
    round: 9,
    geoId: 'es-1991',
    id: 'barcelona_2026',
    varName: 'BARCELONA_TRACK_DATA',
    file: 'barcelona.js',
    gpName: 'Gran Premio di Spagna (Barcellona)',
    name: 'Circuit de Barcelona-Catalunya',
    country: 'Spagna',
    city: 'Barcellona',
    officialLength: 4655,
    width: 13.5,
    kerbWidth: 1.4,
    kerbStyle: 'standard',
    sectorSplits: [0.33, 0.66, 1.0],
    isStreet: false,
  },
  {
    round: 10,
    geoId: 'at-1969',
    id: 'red_bull_ring_2026',
    varName: 'AUSTRIA_TRACK_DATA',
    file: 'austria.js',
    gpName: "Gran Premio d'Austria",
    name: 'Red Bull Ring',
    country: 'Austria',
    city: 'Spielberg',
    officialLength: 4318,
    width: 13.5,
    kerbWidth: 1.4,
    kerbStyle: 'standard',
    sectorSplits: [0.33, 0.66, 1.0],
    isStreet: false,
  },
  {
    round: 11,
    geoId: 'gb-1948',
    id: 'silverstone_2026',
    varName: 'SILVERSTONE_TRACK_DATA',
    file: 'silverstone.js',
    gpName: 'Gran Premio di Gran Bretagna',
    name: 'Silverstone Circuit',
    country: 'Gran Bretagna',
    city: 'Silverstone',
    officialLength: 5891,
    width: 14.5,
    kerbWidth: 1.4,
    kerbStyle: 'standard',
    sectorSplits: [0.33, 0.66, 1.0],
    isStreet: false,
  },
  {
    round: 12,
    geoId: 'be-1925',
    id: 'spa_2026',
    varName: 'SPA_TRACK_DATA',
    file: 'spa.js',
    gpName: 'Gran Premio del Belgio',
    name: 'Circuit de Spa-Francorchamps',
    country: 'Belgio',
    city: 'Stavelot',
    officialLength: 7004,
    width: 14.0,
    kerbWidth: 1.4,
    kerbStyle: 'standard',
    sectorSplits: [0.33, 0.66, 1.0],
    isStreet: false,
    elev: [{ centerFrac: 0.18, halfSpanFrac: 0.1, height: 18.0 }],
  },
  {
    round: 13,
    geoId: 'hu-1986',
    id: 'hungaroring_2026',
    varName: 'HUNGARORING_TRACK_DATA',
    file: 'hungaroring.js',
    gpName: "Gran Premio d'Ungheria",
    name: 'Hungaroring',
    country: 'Ungheria',
    city: 'Mogyoród',
    officialLength: 4381,
    width: 13.0,
    kerbWidth: 1.3,
    kerbStyle: 'standard',
    sectorSplits: [0.33, 0.66, 1.0],
    isStreet: false,
  },
  {
    round: 14,
    geoId: 'nl-1948',
    id: 'zandvoort_2026',
    varName: 'ZANDVOORT_TRACK_DATA',
    file: 'zandvoort.js',
    gpName: "Gran Premio d'Olanda",
    name: 'Circuit Zandvoort',
    country: 'Paesi Bassi',
    city: 'Zandvoort',
    officialLength: 4259,
    width: 12.5,
    kerbWidth: 1.3,
    kerbStyle: 'standard',
    sectorSplits: [0.33, 0.66, 1.0],
    isStreet: false,
  },
  {
    round: 15,
    geoId: 'it-1922',
    id: 'monza_2026',
    varName: 'MONZA_TRACK_DATA',
    file: 'monza.js',
    gpName: "Gran Premio d'Italia",
    name: 'Autodromo Nazionale Monza',
    country: 'Italia',
    city: 'Monza',
    officialLength: 5793,
    width: 14.0,
    kerbWidth: 1.5,
    kerbStyle: 'italian',
    sectorSplits: [0.26, 0.52, 1.0],
    isStreet: false,
  },
  {
    round: 16,
    geoId: 'es-2026',
    id: 'madrid_2026',
    varName: 'MADRID_TRACK_DATA',
    file: 'madrid.js',
    gpName: 'Gran Premio di Madrid',
    name: 'Circuito de Madring',
    country: 'Spagna',
    city: 'Madrid',
    officialLength: 5474,
    width: 13.5,
    kerbWidth: 1.3,
    kerbStyle: 'standard',
    sectorSplits: [0.33, 0.66, 1.0],
    isStreet: true,
  },
  {
    round: 17,
    geoId: 'az-2016',
    id: 'baku_2026',
    varName: 'BAKU_TRACK_DATA',
    file: 'baku.js',
    gpName: "Gran Premio dell'Azerbaijan",
    name: 'Baku City Circuit',
    country: 'Azerbaijan',
    city: 'Baku',
    officialLength: 6003,
    width: 12.5,
    kerbWidth: 1.2,
    kerbStyle: 'standard',
    sectorSplits: [0.33, 0.66, 1.0],
    isStreet: true,
    elev: [{ centerFrac: 0.342, halfSpanFrac: 0.045, height: 8.5 }],
  },
  {
    round: 18,
    geoId: 'sg-2008',
    id: 'singapore_2026',
    varName: 'SINGAPORE_TRACK_DATA',
    file: 'singapore.js',
    gpName: 'Gran Premio di Singapore',
    name: 'Marina Bay Street Circuit',
    country: 'Singapore',
    city: 'Singapore',
    officialLength: 4928,
    width: 13.0,
    kerbWidth: 1.3,
    kerbStyle: 'standard',
    sectorSplits: [0.33, 0.66, 1.0],
    isStreet: true,
  },
  {
    round: 19,
    geoId: 'us-2012',
    id: 'austin_2026',
    varName: 'AUSTIN_TRACK_DATA',
    file: 'austin.js',
    gpName: 'Gran Premio degli Stati Uniti',
    name: 'Circuit of the Americas',
    country: 'USA',
    city: 'Austin',
    officialLength: 5514,
    width: 15.0,
    kerbWidth: 1.4,
    kerbStyle: 'standard',
    sectorSplits: [0.33, 0.66, 1.0],
    isStreet: false,
    elev: [{ centerFrac: 0.045, halfSpanFrac: 0.032, height: 12.0 }],
  },
  {
    round: 20,
    geoId: 'mx-1962',
    id: 'mexico_2026',
    varName: 'MEXICO_TRACK_DATA',
    file: 'mexico.js',
    gpName: 'Gran Premio del Messico',
    name: 'Autódromo Hermanos Rodríguez',
    country: 'Messico',
    city: 'Città del Messico',
    officialLength: 4304,
    width: 14.0,
    kerbWidth: 1.4,
    kerbStyle: 'standard',
    sectorSplits: [0.33, 0.66, 1.0],
    isStreet: false,
  },
  {
    round: 21,
    geoId: 'br-1940',
    id: 'interlagos_2026',
    varName: 'INTERLAGOS_TRACK_DATA',
    file: 'interlagos.js',
    gpName: 'Gran Premio del Brasile',
    name: 'Autódromo José Carlos Pace - Interlagos',
    country: 'Brasile',
    city: 'San Paolo',
    officialLength: 4309,
    width: 13.5,
    kerbWidth: 1.4,
    kerbStyle: 'standard',
    sectorSplits: [0.33, 0.66, 1.0],
    isStreet: false,
    elev: [{ centerFrac: 0.45, halfSpanFrac: 0.12, height: 10.0 }],
  },
  {
    round: 22,
    geoId: 'us-2023',
    id: 'las_vegas_2026',
    varName: 'LAS_VEGAS_TRACK_DATA',
    file: 'las_vegas.js',
    gpName: 'Gran Premio di Las Vegas',
    name: 'Las Vegas Street Circuit',
    country: 'USA',
    city: 'Las Vegas',
    officialLength: 6201,
    width: 14.0,
    kerbWidth: 1.3,
    kerbStyle: 'standard',
    sectorSplits: [0.33, 0.66, 1.0],
    isStreet: true,
  },
  {
    round: 23,
    geoId: 'qa-2004',
    id: 'qatar_2026',
    varName: 'QATAR_TRACK_DATA',
    file: 'qatar.js',
    gpName: 'Gran Premio del Qatar',
    name: 'Losail International Circuit',
    country: 'Qatar',
    city: 'Lusail',
    officialLength: 5380,
    width: 14.0,
    kerbWidth: 1.4,
    kerbStyle: 'standard',
    sectorSplits: [0.33, 0.66, 1.0],
    isStreet: false,
  },
  {
    round: 24,
    geoId: 'ae-2009',
    id: 'yas_marina_2026',
    varName: 'ABU_DHABI_TRACK_DATA',
    file: 'abu_dhabi.js',
    gpName: 'Gran Premio di Abu Dhabi',
    name: 'Yas Marina Circuit',
    country: 'Emirati Arabi Uniti',
    city: 'Abu Dhabi',
    officialLength: 5281,
    width: 14.0,
    kerbWidth: 1.4,
    kerbStyle: 'standard',
    sectorSplits: [0.33, 0.66, 1.0],
    isStreet: false,
  },
];

function convertGeoJsonToControlPoints(coords, spec) {
  const ring = coords.slice(0, -1);
  const [lon0, lat0] = ring[0];
  const cosLat = Math.cos((lat0 * Math.PI) / 180);

  const rawPts = ring.map(([lon, lat]) => [
    (lon - lon0) * (Math.PI / 180) * WGS84_RADIUS * cosLat,
    0,
    -(lat - lat0) * (Math.PI / 180) * WGS84_RADIUS,
  ]);

  const cumLen = [0];
  let totalPolyLen = 0;
  for (let i = 0; i < rawPts.length; i++) {
    const a = rawPts[i];
    const b = rawPts[(i + 1) % rawPts.length];
    totalPolyLen += Math.hypot(b[0] - a[0], b[2] - a[2]);
    cumLen.push(totalPolyLen);
  }

  const nControl = Math.max(200, Math.round(totalPolyLen / 16));
  let pts = [];
  let segIdx = 0;
  for (let k = 0; k < nControl; k++) {
    const targetD = (k / nControl) * totalPolyLen;
    while (segIdx < rawPts.length - 1 && cumLen[segIdx + 1] < targetD) {
      segIdx++;
    }
    const d0 = cumLen[segIdx];
    const d1 = cumLen[segIdx + 1];
    const alpha = Math.max(0, Math.min(1, (targetD - d0) / Math.max(1e-6, d1 - d0)));
    const a = rawPts[segIdx];
    const b = rawPts[(segIdx + 1) % rawPts.length];
    pts.push([a[0] + (b[0] - a[0]) * alpha, 0, a[2] + (b[2] - a[2]) * alpha]);
  }

  // Smoothing selettivo sui vertici spigolosi del poligono (mantenendo [0] ancorato a [0, 0, 0])
  const stepApprox = totalPolyLen / nControl;
  for (let iter = 0; iter < 8; iter++) {
    const next = pts.map((p) => [...p]);
    for (let i = 1; i < nControl; i++) {
      const prev = pts[(i - 1 + nControl) % nControl];
      const curr = pts[i];
      const nxt = pts[(i + 1) % nControl];
      const v1x = curr[0] - prev[0];
      const v1z = curr[2] - prev[2];
      const v2x = nxt[0] - curr[0];
      const v2z = nxt[2] - curr[2];
      const angle = Math.abs(Math.atan2(v1x * v2z - v1z * v2x, v1x * v2x + v1z * v2z));
      const curv = angle / stepApprox;
      if (curv > 0.022) {
        const w = Math.min(0.45, (curv - 0.022) * 7.0);
        next[i][0] = curr[0] * (1 - w) + 0.5 * (prev[0] + nxt[0]) * w;
        next[i][2] = curr[2] * (1 - w) + 0.5 * (prev[2] + nxt[2]) * w;
      }
    }
    pts = next;
  }

  // Calibrazione sulla lunghezza ufficiale FIA (in metri 1:1) + profilo elevazione Y
  const rawSurf = createTrackSurface(
    { id: spec.id, name: spec.name, trackWidth: spec.width, controlPoints: pts },
    1600
  );
  const scale = spec.officialLength / rawSurf.totalLength;

  pts = pts.map(([x, _y, z], idx) => {
    const frac = idx / pts.length;
    let elev = 0;
    for (const prof of spec.elev || []) {
      const diff = Math.abs(frac - prof.centerFrac);
      if (diff < prof.halfSpanFrac) {
        elev += prof.height * 0.5 * (1 + Math.cos((Math.PI * diff) / prof.halfSpanFrac));
      }
    }
    return idx === 0
      ? [0, 0, 0]
      : [
          Number((x * scale).toFixed(2)),
          Number(elev.toFixed(2)),
          Number((z * scale).toFixed(2)),
        ];
  });

  const calibratedSurf = createTrackSurface(
    { id: spec.id, name: spec.name, trackWidth: spec.width, controlPoints: pts },
    1600
  );
  const s0 = calibratedSurf.samples[0];
  const startHeading = Number(Math.atan2(s0.tx, s0.tz).toFixed(5));

  return {
    controlPoints: pts,
    startHeading,
    splineLength: calibratedSurf.totalLength,
  };
}

function formatTrackModule(spec, controlPoints, startHeading) {
  const barrierOffset = Number((spec.width * 0.5 + (spec.isStreet ? 3.5 : 7.5)).toFixed(1));
  const pointsLines = controlPoints.map((pt) => `    [${pt[0]}, ${pt[1]}, ${pt[2]}],`).join('\n');

  return `/**
 * Round ${spec.round} Calendario F1 2026: ${spec.name} (${spec.city}, ${spec.country}).
 * Coordinate metriche reali in scala 1:1 da GeoJSON bacinger/f1-circuits (${spec.geoId}).
 * Lunghezza ufficiale FIA: ${spec.officialLength} m.
 */

export const ${spec.varName} = {
  id: '${spec.id}',
  round: ${spec.round},
  geoId: '${spec.geoId}',
  gpName: ${JSON.stringify(spec.gpName)},
  name: ${JSON.stringify(spec.name)},
  country: ${JSON.stringify(spec.country)},
  city: ${JSON.stringify(spec.city)},
  officialLength: ${spec.officialLength},
  trackWidth: ${spec.width},
  kerbWidth: ${spec.kerbWidth},
  barrierOffset: ${barrierOffset},
  kerbStyle: '${spec.kerbStyle}',
  sectorSplits: [${spec.sectorSplits.join(', ')}],
  startTransform: {
    x: 0,
    y: 0,
    z: 0,
    heading: ${startHeading},
  },
  controlPoints: [
${pointsLines}
  ],
};
`;
}

function formatIndexModule(specs) {
  const imports = specs
    .map((s) => `import { ${s.varName} } from './${s.file}';`)
    .join('\n');
  const list = specs.map((s) => `  ${s.varName},`).join('\n');

  return `/**
 * Registro ufficiale dei 24 circuiti del Calendario F1 2026 in scala metrica 1:1.
 */

${imports}

export const CALENDAR_2026_TRACKS = [
${list}
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
`;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const results = [];

  for (const spec of CALENDAR_2026_SPECS) {
    const url = `${BASE_URL}/${spec.geoId}.geojson`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Errore download ${url}: HTTP ${response.status}`);
    }
    const geoJson = await response.json();
    const feat = geoJson.features?.[0];
    if (!feat?.geometry?.coordinates) {
      throw new Error(`GeoJSON non valido per ${spec.geoId}`);
    }

    const { controlPoints, startHeading, splineLength } = convertGeoJsonToControlPoints(
      feat.geometry.coordinates,
      spec
    );

    const moduleCode = formatTrackModule(spec, controlPoints, startHeading);
    await fs.writeFile(path.join(OUT_DIR, spec.file), moduleCode, 'utf-8');

    results.push({
      Round: `R${spec.round}`,
      ID: spec.id,
      FIA_m: spec.officialLength,
      Spline_m: Number(splineLength.toFixed(1)),
      Diff_m: Number((splineLength - spec.officialLength).toFixed(2)),
      Punti: controlPoints.length,
    });
  }

  await fs.writeFile(path.join(OUT_DIR, 'index.js'), formatIndexModule(CALENDAR_2026_SPECS), 'utf-8');
  console.table(results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
