/**
 * Design System & Generatore Grafico Vettoriale 4K (Step 1):
 * - Sfondo poligonale low-poly procedurale dinamico (tinto col colore dominante della scuderia)
 * - Generatore SVG nitido della sagoma di ciascun tracciato 1:1
 * - Barra suggerimenti comandi mouse/tastiera in basso a destra
 */

const DEFAULT_KEY_HINTS = [
  { key: 'Invio', label: 'Seleziona' },
  { key: 'Esc', label: 'Indietro' },
  { key: '← / →', label: 'Naviga' },
  { key: 'Mouse', label: 'Seleziona / Ruota' },
];

let lastAppliedLowPolyKey = '';
let lastAppliedHintsKey = '';

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHexRgb(hex) {
  const clean = String(hex || '#dc0000').replace('#', '').trim();
  const norm =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const val = parseInt(norm, 16);
  if (!Number.isFinite(val)) return { r: 220, g: 0, b: 0 };
  return {
    r: (val >> 16) & 255,
    g: (val >> 8) & 255,
    b: val & 255,
  };
}

function mixRgb(base, tint, factor) {
  const f = Math.max(0, Math.min(1, factor));
  const r = clampByte(base.r * (1 - f) + tint.r * f);
  const g = clampByte(base.g * (1 - f) + tint.g * f);
  const b = clampByte(base.b * (1 - f) + tint.b * f);
  return `rgb(${r},${g},${b})`;
}

function hash2D(ix, iy) {
  let h = ix * 374761393 + iy * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

/**
 * Genera una mesh poligonale SVG 4K-ready a triangoli sfaccettati 3D su base antracite/nero,
 * modulata dal colore dominante della scuderia scelta (stile muro poligonale F1).
 * @param {string} [tintHex='#dc0000']
 * @param {number} [tintStrength=0.28]
 * @returns {string}
 */
export function generateLowPolyBackgroundSvg(tintHex = '#dc0000', tintStrength = 0.28) {
  const width = 1920;
  const height = 1080;
  const cols = 10;
  const rows = 6;
  const cellW = width / cols;
  const cellH = height / rows;

  const tintRgb = parseHexRgb(tintHex);
  const baseShadow = { r: 6, g: 8, b: 12 };
  const baseDark = { r: 12, g: 15, b: 22 };
  const baseMid = { r: 22, g: 27, b: 36 };
  const baseHigh = { r: 34, g: 41, b: 54 };

  const grid = [];
  for (let r = 0; r <= rows; r++) {
    const rowPts = [];
    for (let c = 0; c <= cols; c++) {
      const jitterX = c === 0 || c === cols ? 0 : (hash2D(c * 3 + 11, r * 5 + 7) - 0.5) * cellW * 0.82;
      const jitterY = r === 0 || r === rows ? 0 : (hash2D(c * 7 + 97, r * 3 + 53) - 0.5) * cellH * 0.82;
      rowPts.push([
        Math.round(c * cellW + jitterX),
        Math.round(r * cellH + jitterY),
      ]);
    }
    grid.push(rowPts);
  }

  const polys = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p00 = grid[r][c];
      const p10 = grid[r][c + 1];
      const p01 = grid[r + 1][c];
      const p11 = grid[r + 1][c + 1];
      const flipDiag = hash2D(c + 19, r + 31) > 0.48;

      const tris = flipDiag
        ? [
            [p00, p10, p11],
            [p00, p11, p01],
          ]
        : [
            [p00, p10, p01],
            [p10, p11, p01],
          ];

      for (let t = 0; t < tris.length; t++) {
        const tri = tris[t];
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
        const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        const nx = cx / width;
        const ny = cy / height;

        // Illuminazione 3D simulata sulle sfaccettature: lato sinistro in ombra, centro-destra illuminato
        const noise = hash2D(c * 5 + t * 13, r * 7 + 17);
        const facetTilt = hash2D(c * 11 + r * 3, t * 29 + 5);
        const lightMask = Math.max(0.08, 0.25 + nx * 0.88 - Math.abs(ny - 0.38) * 0.42);
        const leftHeaderShadow = nx < 0.28 && ny < 0.45 ? 0.32 : 1.0;

        let baseColor = baseMid;
        if (facetTilt < 0.24 || nx < 0.16) baseColor = baseShadow;
        else if (facetTilt < 0.56) baseColor = baseDark;
        else if (facetTilt > 0.84) baseColor = baseHigh;

        const localMix = Math.min(
          0.92,
          tintStrength * (0.28 + noise * 0.92) * lightMask * leftHeaderShadow
        );

        const fill = mixRgb(baseColor, tintRgb, localMix);
        const edgeAlpha = (0.028 + facetTilt * 0.045).toFixed(3);
        const ptsStr = `${tri[0][0]},${tri[0][1]} ${tri[1][0]},${tri[1][1]} ${tri[2][0]},${tri[2][1]}`;
        polys.push(
          `<polygon points="${ptsStr}" fill="${fill}" stroke="rgba(255,255,255,${edgeAlpha})" stroke-width="1"/>`
        );
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
    <defs>
      <radialGradient id="f1-vignette" cx="56%" cy="46%" r="72%">
        <stop offset="0%" stop-color="rgba(6,8,13,0.06)"/>
        <stop offset="72%" stop-color="rgba(5,7,11,0.52)"/>
        <stop offset="100%" stop-color="rgba(4,6,10,0.88)"/>
      </radialGradient>
    </defs>
    <g>${polys.join('')}</g>
    <rect width="${width}" height="${height}" fill="url(#f1-vignette)"/>
  </svg>`;
}

/**
 * Genera la sagoma SVG vettoriale nitida a doppia linea di un tracciato a partire dai controlPoints 1:1.
 * @param {Array<[number, number, number]>} controlPoints
 * @param {{ width?: number, height?: number, padding?: number, strokeColor?: string, strokeWidth?: number, showStartDot?: boolean, sectorSplits?: number[] }} [options]
 * @returns {string}
 */
export function generateTrackOutlineSvg(controlPoints, options = {}) {
  const width = options.width ?? 220;
  const height = options.height ?? 140;
  const padding = options.padding ?? 14;
  const strokeColor = options.strokeColor ?? '#f8fafc';
  const strokeWidth = options.strokeWidth ?? 4.2;
  const showStartDot = options.showStartDot !== false;

  if (!Array.isArray(controlPoints) || controlPoints.length < 3) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"></svg>`;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const pt of controlPoints) {
    if (pt[0] < minX) minX = pt[0];
    if (pt[0] > maxX) maxX = pt[0];
    if (pt[2] < minZ) minZ = pt[2];
    if (pt[2] > maxZ) maxZ = pt[2];
  }

  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanZ);
  const offX = (width - spanX * scale) * 0.5;
  const offY = (height - spanZ * scale) * 0.5;

  const mapPt = (x, z) => [
    Number((offX + (x - minX) * scale).toFixed(2)),
    Number((offY + (z - minZ) * scale).toFixed(2)),
  ];

  const mappedPts = controlPoints.map((pt) => mapPt(pt[0], pt[2]));
  const [sx, sy] = mappedPts[0];
  const buildPath = (pts) =>
    pts.map(([mx, my], idx) => `${idx === 0 ? 'M' : 'L'}${mx},${my}`).join(' ');
  const fullD = buildPath(mappedPts) + ' Z';

  // Centroide della pista per posizionare le etichette settore 1 / 2 / 3 verso l'esterno
  let sumX = 0;
  let sumY = 0;
  for (const [mx, my] of mappedPts) {
    sumX += mx;
    sumY += my;
  }
  const centroidX = sumX / mappedPts.length;
  const centroidY = sumY / mappedPts.length;

  const startMarker = showStartDot
    ? `<circle cx="${sx}" cy="${sy}" r="${Math.max(3.2, strokeWidth * 0.92)}" fill="#e10600" stroke="#ffffff" stroke-width="1.3"/>`
    : '';

  const sectorSplits = Array.isArray(options.sectorSplits) ? options.sectorSplits : null;
  if (sectorSplits && sectorSplits.length >= 2 && mappedPts.length >= 6) {
    const n = mappedPts.length;
    const s1Frac = Math.max(0.1, Math.min(0.8, Number(sectorSplits[0]) || 0.33));
    const s2Frac = Math.max(s1Frac + 0.1, Math.min(0.95, Number(sectorSplits[1]) || 0.66));
    const s1End = Math.max(1, Math.min(n - 2, Math.round(s1Frac * n)));
    const s2End = Math.max(s1End + 1, Math.min(n - 1, Math.round(s2Frac * n)));

    const seg1 = buildPath(mappedPts.slice(0, s1End + 1));
    const seg2 = buildPath(mappedPts.slice(s1End, s2End + 1));
    const seg3 = buildPath([...mappedPts.slice(s2End), mappedPts[0]]);

    const [p1x, p1y] = mappedPts[s1End];
    const [p2x, p2y] = mappedPts[s2End];
    const dotR = Math.max(2.8, strokeWidth * 0.78);

    const placeSectorLabel = (idx, numLabel, colorHex) => {
      const [px, py] = mappedPts[Math.max(0, Math.min(n - 1, idx))];
      const vx = px - centroidX;
      const vy = py - centroidY;
      const len = Math.hypot(vx, vy) || 1;
      const push = Math.min(18, Math.max(12, padding * 0.78));
      const lx = Math.max(11, Math.min(width - 11, px + (vx / len) * push));
      const ly = Math.max(12, Math.min(height - 8, py + (vy / len) * push));
      return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="central" fill="${colorHex}" stroke="#07090e" stroke-width="3" paint-order="stroke" font-family="Chakra Petch, sans-serif" font-weight="700" font-size="13">${numLabel}</text>`;
    };

    const label1 = placeSectorLabel(Math.floor(s1End * 0.5), '1', '#ffffff');
    const label2 = placeSectorLabel(Math.floor((s1End + s2End) * 0.5), '2', '#38bdf8');
    const label3 = placeSectorLabel(Math.floor((s2End + n) * 0.5) % n, '3', '#facc15');
    const coreWidth = Math.max(1.5, strokeWidth * 0.44);

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
      <path d="${fullD}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="${strokeWidth + 4.5}" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${fullD}" fill="none" stroke="#ffffff" stroke-width="${strokeWidth + 1.2}" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${fullD}" fill="none" stroke="#080b12" stroke-width="${coreWidth + 0.8}" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${seg1}" fill="none" stroke="#e10600" stroke-width="${coreWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>
      <path d="${seg2}" fill="none" stroke="#38bdf8" stroke-width="${coreWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>
      <path d="${seg3}" fill="none" stroke="#facc15" stroke-width="${coreWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>
      <circle cx="${p1x}" cy="${p1y}" r="${dotR}" fill="#38bdf8" stroke="#ffffff" stroke-width="1"/>
      <circle cx="${p2x}" cy="${p2y}" r="${dotR}" fill="#facc15" stroke="#ffffff" stroke-width="1"/>
      ${startMarker}
      ${options.showSectorNumbers !== false ? `${label1}${label2}${label3}` : ''}
    </svg>`;
  }

  // Sagoma a doppia linea (stile carosello circuiti F1)
  const outerW = Math.max(3.4, strokeWidth);
  const innerCutW = Math.max(1.3, outerW * 0.44);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
    <path d="${fullD}" fill="none" stroke="${strokeColor}" stroke-width="${outerW}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${fullD}" fill="none" stroke="#0c1018" stroke-width="${innerCutW}" stroke-linecap="round" stroke-linejoin="round"/>
    ${startMarker}
  </svg>`;
}

export const TRACK_CORNERS_BY_ID = Object.freeze({
  albert_park_2026: 14,
  shanghai_2026: 16,
  suzuka_2026: 18,
  bahrain_2026: 15,
  jeddah_2026: 27,
  miami_2026: 19,
  montreal_2026: 14,
  monaco_2026: 19,
  barcelona_2026: 14,
  red_bull_ring_2026: 10,
  silverstone_2026: 18,
  spa_2026: 19,
  hungaroring_2026: 14,
  zandvoort_2026: 14,
  monza_2026: 11,
  madrid_2026: 20,
  baku_2026: 20,
  singapore_2026: 19,
  austin_2026: 20,
  mexico_2026: 17,
  interlagos_2026: 15,
  las_vegas_2026: 17,
  qatar_2026: 16,
  yas_marina_2026: 16,
});

/**
 * Restituisce il numero ufficiale di curve per il circuito indicato.
 * @param {string} trackId
 * @returns {number}
 */
export function getTrackCornersCount(trackId) {
  return TRACK_CORNERS_BY_ID[trackId] ?? 16;
}

const TEAM_LOGO_URLS = Object.freeze({
  mclaren: new URL('../assets/logos/mclaren.svg', import.meta.url).href,
  ferrari: new URL('../assets/logos/ferrari.svg', import.meta.url).href,
  red_bull: new URL('../assets/logos/red_bull.svg', import.meta.url).href,
  redbull: new URL('../assets/logos/red_bull.svg', import.meta.url).href,
  mercedes: new URL('../assets/logos/mercedes.svg', import.meta.url).href,
  aston_martin: new URL('../assets/logos/aston_martin.svg', import.meta.url).href,
  aston: new URL('../assets/logos/aston_martin.svg', import.meta.url).href,
  williams: new URL('../assets/logos/williams.png', import.meta.url).href,
  alpine: new URL('../assets/logos/alpine.svg', import.meta.url).href,
  racing_bulls: new URL('../assets/logos/racing_bulls.svg', import.meta.url).href,
  rb: new URL('../assets/logos/racing_bulls.svg', import.meta.url).href,
  haas: new URL('../assets/logos/haas.svg', import.meta.url).href,
  audi: new URL('../assets/logos/audi.svg', import.meta.url).href,
  sauber: new URL('../assets/logos/audi.svg', import.meta.url).href,
  cadillac: new URL('../assets/logos/cadillac.svg', import.meta.url).href,
});

const TEAM_LOGO_DARK_TONE = new Set();

/**
 * Loghi con tratti scuri che su sfondo scuro (torre tempi F1 / Halo HUD)
 * vanno resi chiari/bianchi per mantenere la massima leggibilità broadcast.
 */
export const TEAM_LOGO_INVERT_ON_DARK = new Set([
  'audi',
  'sauber',
  'aston_martin',
  'aston',
  'cadillac',
  'williams',
  'racing_bulls',
  'rb',
]);

/**
 * Restituisce l'URL statico del logo ufficiale della scuderia F1 2026 (o null se assente).
 * @param {string} teamId
 * @returns {string | null}
 */
export function getTeamLogoUrl(teamId) {
  const key = String(teamId || '').toLowerCase();
  return TEAM_LOGO_URLS[key] || null;
}

function escapeAttr(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const TEAM_MONOGRAMS = Object.freeze({
  ferrari: 'SF',
  mclaren: 'MCL',
  mercedes: 'AMG',
  red_bull: 'RBR',
  redbull: 'RBR',
  aston_martin: 'AMR',
  aston: 'AMR',
  alpine: 'ALP',
  williams: 'WIL',
  racing_bulls: 'VCB',
  rb: 'VCB',
  audi: 'AUD',
  sauber: 'AUD',
  haas: 'HAA',
  cadillac: 'CAD',
});

/**
 * Restituisce il badge HTML/SVG con il logo ufficiale della scuderia F1 2026
 * (con fallback vettoriale compatto se l'ID scuderia non è mappato).
 * @param {{ id?: string, name?: string, primaryColor?: string, secondaryColor?: string }} team
 * @returns {string}
 */
export function generateTeamEmblemSvg(team = {}) {
  const id = String(team?.id || '').toLowerCase();
  const rawName = String(team?.name || 'F1').trim();
  const primary = team?.primaryColor || '#e10600';

  const logoUrl = TEAM_LOGO_URLS[id];
  if (logoUrl) {
    const tone = TEAM_LOGO_DARK_TONE.has(id) ? 'dark' : 'light';
    const alt = escapeAttr(rawName || id);
    return `<span class="f1-team-logo-plate" data-logo-tone="${tone}" style="--logo-accent: ${escapeAttr(primary)};"><img class="f1-team-logo-img" src="${escapeAttr(logoUrl)}" alt="${alt}" loading="eager" decoding="async" draggable="false" /></span>`;
  }

  const mono =
    TEAM_MONOGRAMS[id] ||
    rawName
      .split(/[\s-]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((w) => w[0].toUpperCase())
      .join('') ||
    'F1';

  const secondary = team?.secondaryColor || '#ffffff';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
    <polygon points="10,4 58,4 54,52 32,60 6,52" fill="#0d111a" stroke="${primary}" stroke-width="3"/>
    <polygon points="13,9 54,9 52,19 11,19" fill="${primary}"/>
    <polygon points="10,46 52,32 51,48 32,55 10,48" fill="${secondary}" fill-opacity="0.22"/>
    <text x="32" y="40" text-anchor="middle" fill="#ffffff" font-family="Chakra Petch, sans-serif" font-weight="700" font-style="italic" font-size="17" letter-spacing="0.06em">${mono}</text>
  </svg>`;
}

/**
 * Aggiorna il colore dominante della scuderia attiva su variabile CSS e sfondo poligonale.
 * @param {string} [tintHex='#dc0000']
 * @param {boolean} [isTeamSelectActive=false]
 * @param {string} [activeTab='home']
 */
export function setThemeTeamTint(tintHex = '#dc0000', isTeamSelectActive = false, activeTab = null) {
  if (typeof document === 'undefined') return;
  const resolvedTab = activeTab || (isTeamSelectActive ? 'team' : 'home');
  const safeHex = String(tintHex || '#dc0000').trim() || '#dc0000';
  const effectiveTint = resolvedTab === 'track' ? '#475569' : safeHex;
  const strength = isTeamSelectActive ? 0.72 : resolvedTab === 'track' ? 0.28 : 0.16;
  const cacheKey = `${effectiveTint}:${strength}`;

  document.documentElement.style.setProperty('--f1-team-tint', safeHex);
  if (document.body) {
    document.body.dataset.gpActiveTab = resolvedTab;
  }

  const bgEl = document.getElementById('f1-lowpoly-bg');
  if (bgEl && cacheKey !== lastAppliedLowPolyKey) {
    lastAppliedLowPolyKey = cacheKey;
    bgEl.innerHTML = generateLowPolyBackgroundSvg(effectiveTint, strength);
  }
}

/**
 * Classifica il ruolo visivo del suggerimento tasto per il footer in basso a destra.
 * @param {string} keyLabel
 * @returns {'primary' | 'back' | 'nav'}
 */
function resolveHintRole(keyLabel) {
  const norm = String(keyLabel || '').trim().toLowerCase();
  if (norm === 'invio' || norm === 'enter' || norm.startsWith('invio ')) return 'primary';
  if (norm === 'esc' || norm === 'indietro' || norm === 'esci') return 'back';
  return 'nav';
}

/**
 * Renderizza la barra dei suggerimenti comandi mouse/tastiera in basso a destra.
 * @param {Array<{ key: string, label: string }>} [hints]
 */
export function renderKeyHints(hints = DEFAULT_KEY_HINTS) {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('f1-key-hints-bar');
  if (!container) return;

  const list = Array.isArray(hints) && hints.length > 0 ? hints : DEFAULT_KEY_HINTS;
  const cacheKey = JSON.stringify(list);
  if (cacheKey === lastAppliedHintsKey) return;
  lastAppliedHintsKey = cacheKey;

  container.innerHTML = list
    .map((item) => {
      const role = resolveHintRole(item.key);
      return `<span class="f1-hint-item"><kbd class="f1-hint-key" data-hint-role="${role}">${item.key}</kbd><span class="f1-hint-label">${item.label}</span></span>`;
    })
    .join('');
}
