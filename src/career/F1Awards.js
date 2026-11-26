/**
 * Step 2 — Catalogo Premi & Trofei Ufficiali F1 2026 + Helpers Puri (Node headless safe).
 * Gestisce i premi singoli GP (Qualifica/Gara), i titoli FIA di fine stagione (post-R24)
 * e la generazione deterministica di 1 carriera conclusa simulata per l'anteprima Storico.
 */

import { F1_2026_DRIVERS, F1_2026_TEAMS } from '../config/f1_2026_data.js';
import { CALENDAR_2026_TRACKS } from '../tracks/calendar2026/index.js';

const SIM_POINTS_BY_POSITION = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export const F1_AWARD_ORDER = [
  'pole_position',
  'gp_win',
  'gp_p2',
  'gp_p3',
  'fastest_lap',
  'wdc_champion',
  'wdc_p2',
  'wdc_p3',
  'wcc_champion',
];

export const F1_AWARDS = {
  pole_position: {
    id: 'pole_position',
    category: 'qualifying',
    name: 'Pirelli Pole Position Award',
    shortLabel: 'POLE',
    tier: 'pole',
    accentColor: '#c084fc',
    description: '1° classificato al termine delle Qualifiche Q3.',
  },
  gp_win: {
    id: 'gp_win',
    category: 'race',
    name: 'Trofeo Vincitore GP',
    shortLabel: '1° ORO',
    tier: 'gold',
    accentColor: '#facc15',
    description: 'Vincitore ufficiale del Gran Premio (1° posto al traguardo).',
  },
  gp_p2: {
    id: 'gp_p2',
    category: 'race',
    name: 'Trofeo 2° Classificato GP',
    shortLabel: '2° ARGENTO',
    tier: 'silver',
    accentColor: '#e2e8f0',
    description: 'Secondo posto sul podio del Gran Premio.',
  },
  gp_p3: {
    id: 'gp_p3',
    category: 'race',
    name: 'Trofeo 3° Classificato GP',
    shortLabel: '3° BRONZO',
    tier: 'bronze',
    accentColor: '#d97706',
    description: 'Terzo posto sul podio del Gran Premio.',
  },
  fastest_lap: {
    id: 'fastest_lap',
    category: 'race',
    name: 'DHL Fastest Lap Award',
    shortLabel: 'GIRO VELOCE',
    tier: 'fastest',
    accentColor: '#a855f7',
    description: 'Giro più veloce registrato durante il Gran Premio.',
  },
  wdc_champion: {
    id: 'wdc_champion',
    category: 'season',
    name: 'Campione del Mondo Piloti FIA',
    shortLabel: 'WDC 1°',
    tier: 'gold',
    accentColor: '#facc15',
    description: 'Titolo Mondiale FIA Piloti al termine dei 24 GP stagionali.',
  },
  wdc_p2: {
    id: 'wdc_p2',
    category: 'season',
    name: 'Vicecampione del Mondo Piloti FIA',
    shortLabel: 'WDC 2°',
    tier: 'silver',
    accentColor: '#e2e8f0',
    description: 'Secondo posto finale nel Campionato del Mondo Piloti FIA.',
  },
  wdc_p3: {
    id: 'wdc_p3',
    category: 'season',
    name: '3° Mondiale Piloti FIA',
    shortLabel: 'WDC 3°',
    tier: 'bronze',
    accentColor: '#d97706',
    description: 'Terzo posto finale nel Campionato del Mondo Piloti FIA.',
  },
  wcc_champion: {
    id: 'wcc_champion',
    category: 'season',
    name: 'Campione del Mondo Costruttori FIA',
    shortLabel: 'WCC 1°',
    tier: 'gold',
    accentColor: '#38bdf8',
    description: 'Titolo Mondiale FIA Costruttori conquistato dalla Scuderia.',
  },
};

export function getF1AwardMeta(awardId) {
  return F1_AWARDS[awardId] || null;
}

export function formatAwardsSummary(awardIds = []) {
  if (!Array.isArray(awardIds) || awardIds.length === 0) return '';
  return awardIds
    .map((id) => F1_AWARDS[id]?.name)
    .filter(Boolean)
    .join(', ');
}

export function evaluateGpAwards({
  position,
  polePosition = false,
  fastestLap = false,
} = {}) {
  const safePos = Math.max(1, Math.min(22, Math.floor(Number(position) || 22)));
  const earned = [];
  if (polePosition) earned.push('pole_position');
  if (safePos === 1) earned.push('gp_win');
  else if (safePos === 2) earned.push('gp_p2');
  else if (safePos === 3) earned.push('gp_p3');
  if (fastestLap) earned.push('fastest_lap');
  return earned;
}

export function evaluateSeasonAwards({
  playerDriverPosition,
  playerTeamPosition,
} = {}) {
  const safeDriverPos = Math.max(1, Math.min(22, Math.floor(Number(playerDriverPosition) || 22)));
  const safeTeamPos = Math.max(1, Math.min(11, Math.floor(Number(playerTeamPosition) || 11)));
  const earned = [];
  if (safeDriverPos === 1) earned.push('wdc_champion');
  else if (safeDriverPos === 2) earned.push('wdc_p2');
  else if (safeDriverPos === 3) earned.push('wdc_p3');
  if (safeTeamPos === 1) earned.push('wcc_champion');
  return earned;
}

export function countCareerAwards(roundResults = [], seasonAwards = []) {
  const byId = {};
  for (const id of F1_AWARD_ORDER) {
    byId[id] = 0;
  }

  if (Array.isArray(roundResults)) {
    for (const round of roundResults) {
      if (!round || !Array.isArray(round.awards)) continue;
      for (const awardId of round.awards) {
        if (awardId in byId) {
          byId[awardId] += 1;
        }
      }
    }
  }

  if (Array.isArray(seasonAwards)) {
    for (const awardId of seasonAwards) {
      if (awardId in byId) {
        byId[awardId] += 1;
      }
    }
  }

  const gpWins = byId.gp_win;
  const gpP2 = byId.gp_p2;
  const gpP3 = byId.gp_p3;
  const podiums = gpWins + gpP2 + gpP3;
  const poles = byId.pole_position;
  const fastestLaps = byId.fastest_lap;
  const wdcTitles = byId.wdc_champion;
  const wccTitles = byId.wcc_champion;
  const totalAwards = F1_AWARD_ORDER.reduce((sum, id) => sum + (byId[id] || 0), 0);

  return {
    byId,
    gpWins,
    gpP2,
    gpP3,
    podiums,
    poles,
    fastestLaps,
    wdcTitles,
    wccTitles,
    totalAwards,
  };
}

/**
 * Genera una carriera conclusa simulata completa su tutti i 24 GP 2026:
 * include gare con Pole + Oro + Giro Veloce, podi P2/P3, solo Pole, solo Giro Veloce
 * e diverse gare senza alcun trofeo (solo griglia -> arrivo).
 */
export function createSimulatedCompletedCareer() {
  const ferrari = F1_2026_TEAMS.ferrari || { name: 'Scuderia Ferrari', primaryColor: '#DC0000' };
  const rivals = [
    F1_2026_DRIVERS.find((d) => d.id === 'norris') || { id: 'norris', name: 'Lando Norris', teamId: 'mclaren' },
    F1_2026_DRIVERS.find((d) => d.id === 'verstappen') || { id: 'verstappen', name: 'Max Verstappen', teamId: 'red_bull' },
    F1_2026_DRIVERS.find((d) => d.id === 'russell') || { id: 'russell', name: 'George Russell', teamId: 'mercedes' },
    F1_2026_DRIVERS.find((d) => d.id === 'piastri') || { id: 'piastri', name: 'Oscar Piastri', teamId: 'mclaren' },
    F1_2026_DRIVERS.find((d) => d.id === 'leclerc') || { id: 'leclerc', name: 'Charles Leclerc', teamId: 'ferrari' },
  ];

  // 24 script determinati: [gridPosition, finishPosition, polePosition, fastestLap, rivalIdxWhenNotP1]
  const plan = [
    [1, 1, true, true, 0],   // R01 Melbourne: Pole + Win + Fastest Lap
    [3, 2, false, false, 0], // R02 Shanghai: P2
    [5, 4, false, false, 1], // R03 Suzuka: NO awards
    [2, 1, false, true, 0],  // R04 Bahrain: Win + Fastest Lap
    [7, 6, false, false, 2], // R05 Jeddah: NO awards
    [4, 3, false, false, 0], // R06 Miami: P3
    [1, 4, true, false, 1],  // R07 Montreal: Pole only (P4)
    [1, 1, true, true, 0],   // R08 Monaco: Pole + Win + Fastest Lap
    [10, 8, false, false, 3],// R09 Barcelona: NO awards
    [2, 2, false, true, 1],  // R10 Austria: P2 + Fastest Lap
    [4, 1, false, false, 0], // R11 Silverstone: Win
    [1, 1, true, true, 0],   // R12 Spa: Pole + Win + Fastest Lap
    [8, 5, false, true, 2],  // R13 Hungaroring: Fastest Lap only (P5)
    [12, 9, false, false, 0],// R14 Zandvoort: NO awards
    [1, 1, true, true, 0],   // R15 Monza: Pole + Win + Fastest Lap
    [6, 3, false, false, 1], // R16 Madrid: P3
    [9, 7, false, false, 3], // R17 Baku: NO awards
    [2, 1, false, false, 0], // R18 Singapore: Win
    [3, 2, false, false, 1], // R19 Austin: P2
    [14, 11, false, false, 2],// R20 Mexico: NO awards
    [5, 1, false, true, 0],  // R21 Interlagos: Win + Fastest Lap
    [7, 6, false, false, 0], // R22 Las Vegas: NO awards
    [4, 3, false, false, 1], // R23 Qatar: P3
    [1, 1, true, true, 0],   // R24 Abu Dhabi: Pole + Win + Fastest Lap
  ];

  let totalPoints = 0;
  let wins = 0;
  let podiums = 0;
  let poles = 0;
  let fastestLaps = 0;

  const roundResults = CALENDAR_2026_TRACKS.map((track, idx) => {
    const [gridPos, finishPos, isPole, isFl, rivalIdx] = plan[idx] || [6, 5, false, false, 0];
    const pts = SIM_POINTS_BY_POSITION[finishPos - 1] ?? 0;
    const awards = evaluateGpAwards({
      position: finishPos,
      polePosition: isPole,
      fastestLap: isFl,
    });
    const rival = rivals[rivalIdx % rivals.length];

    totalPoints += pts;
    if (finishPos === 1) wins += 1;
    if (finishPos <= 3) podiums += 1;
    if (isPole) poles += 1;
    if (isFl) fastestLaps += 1;

    return {
      roundIndex: idx,
      round: track.round,
      trackId: track.id,
      gpName: track.gpName,
      trackName: track.name,
      winnerDriverId: finishPos === 1 ? 'hamilton' : rival.id,
      winnerName: finishPos === 1 ? 'Marco Rossi' : rival.name,
      winnerTeamId: finishPos === 1 ? 'ferrari' : rival.teamId,
      gridPosition: gridPos,
      finishPosition: finishPos,
      playerPosition: finishPos,
      playerPoints: pts,
      polePosition: isPole,
      fastestLap: isFl,
      awards,
      presetId: 'standard',
      raceLaps: 5,
    };
  });

  const seasonAwards = evaluateSeasonAwards({
    playerDriverPosition: 1,
    playerTeamPosition: 1,
  });

  return {
    id: 'sim_career_2026_demo',
    isSimulated: true,
    seasonNumber: 1,
    playerName: 'Marco Rossi',
    playerCode: 'ROS',
    teamId: 'ferrari',
    teamName: ferrari.name,
    teamColor: ferrari.primaryColor,
    weekendPresetId: 'standard',
    startedAt: '2026-03-06T09:00:00.000Z',
    completedAt: '2026-12-06T16:30:00.000Z',
    championDriverId: 'hamilton',
    championDriverName: 'Marco Rossi',
    championDriverPoints: totalPoints,
    championTeamId: 'ferrari',
    championTeamName: ferrari.name,
    championTeamPoints: totalPoints + 286,
    playerPosition: 1,
    playerTeamPosition: 1,
    playerPoints: totalPoints,
    playerWins: wins,
    stats: {
      racesCompleted: CALENDAR_2026_TRACKS.length,
      wins,
      podiums,
      poles,
      fastestLaps,
      points: totalPoints,
    },
    seasonAwards,
    awardCounts: countCareerAwards(roundResults, seasonAwards),
    roundResults,
  };
}
