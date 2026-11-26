/**
 * Stanza dei Trofei 3D "Bright Museum Showroom" (Three.js + Blender PBR .glb + Raycasting):
 * - Architettura identica a showroom_option2_bright_museum: pannelli murari bianco perla con giunti neri,
 *   campate laterali in cemento architettonico, fascia orizzontale nel colore scuderia, lucernari a soffitto 3x2,
 *   pavimento chiaro riflettente e piedistalli circolari scuri con anello LED (ZERO monoposto).
 * - Stanza 1 (Corridoio del Museo): piedistalli per ogni carriera (conclusa + stagione attiva) con
 *   la vera Coppa del Mondo FIA Piloti/Costruttori e targhetta esplicita della scuderia vincitrice.
 * - Stanza 2 (Sala Muro Trofei 24 GP): parete con insegna carriera e 3 scaffali x 8 slot cronologici (R01..R24);
 *   ogni GP premiato espone i trofei 3D affiancati + targhetta sottostante (Griglia/Arrivo/Premi);
 *   i GP senza premi lasciano lo scaffale pulito/vuoto con la sola targhetta Griglia/Arrivo.
 * - Sicuro per import ed esecuzione headless in Node.js (guard `typeof document/window !== 'undefined'`).
 */

import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { assetManager3D } from './AssetManager3D.js';
import { F1_2026_TEAMS } from '../config/f1_2026_data.js';
import { CALENDAR_2026_TRACKS } from '../tracks/calendar2026/index.js';
import { F1_AWARDS, countCareerAwards } from '../career/F1Awards.js';

const PEDESTAL_PITCH_X = 5.6;
const SHELF_Y = [4.10, 2.58, 1.06];
const SHELF_SLOT_PITCH_X = 2.08;
const WALL_Z = -32.2;
const SHELF_Z = -31.76;

const GP_TROPHY_MODEL_CYCLE = [
  'gp_classic',
  'gp_monaco',
  'gp_modern',
  'gp_chalice',
];

const ALL_TROPHY_IDS = [
  'fia_wdc',
  'fia_wcc',
  'pirelli_pole',
  'dhl_fastest_lap',
  'gp_classic',
  'gp_monaco',
  'gp_modern',
  'gp_chalice',
];

const GP_TIER_COLORS = {
  gold: { hex: 0xf4c43a, roughness: 0.14, metalness: 0.96 },
  silver: { hex: 0xe2e8f0, roughness: 0.14, metalness: 0.96 },
  bronze: { hex: 0xcd7f32, roughness: 0.22, metalness: 0.90 },
};

export function formatCareerWinHeadline(entry) {
  if (!entry) return 'MUSEO F1 2026';
  const teamUpper = String(entry.teamName || 'Scuderia F1').toUpperCase();
  const awards = Array.isArray(entry.seasonAwards) ? entry.seasonAwards : [];
  const wonWdc = awards.includes('wdc_champion') || (!entry.isActiveSeason && Number(entry.playerPosition) === 1);
  const wonWcc = awards.includes('wcc_champion');
  if (wonWdc && wonWcc) {
    return `🏆 CARRIERA VINTA CON ${teamUpper} • PILOTI & COSTRUTTORI`;
  }
  if (wonWdc) {
    return `🏆 CARRIERA VINTA CON ${teamUpper}`;
  }
  if (wonWcc) {
    return `🏆 MONDIALE COSTRUTTORI VINTO CON ${teamUpper}`;
  }
  if (entry.isActiveSeason) {
    const seasonNum = Math.max(1, Number(entry.seasonNumber) || 1);
    return entry.careerStatus === 'active'
      ? `STAGIONE ${seasonNum} IN CORSO • ${teamUpper}`
      : `CARRIERA NON AVVIATA • ${teamUpper}`;
  }
  return `CARRIERA COMPLETATA CON ${teamUpper} • P${entry.playerPosition || '--'} PILOTI`;
}

export function formatCareerShortLabel(entry) {
  if (!entry) return '';
  const awards = Array.isArray(entry.seasonAwards) ? entry.seasonAwards : [];
  const wonWdc = awards.includes('wdc_champion') || (!entry.isActiveSeason && Number(entry.playerPosition) === 1);
  if (wonWdc) {
    return `Carriera vinta con ${entry.teamName}`;
  }
  if (entry.isActiveSeason) {
    return entry.careerStatus === 'active'
      ? `Stagione ${Math.max(1, Number(entry.seasonNumber) || 1)} in corso • ${entry.teamName}`
      : `Stagione pronta • ${entry.teamName}`;
  }
  return `${entry.teamName} • P${entry.playerPosition || '--'} Piloti`;
}

function createMuseumStoneFloorTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#dde2e8';
  ctx.fillRect(0, 0, 512, 512);

  // Griglia pietra levigata molto delicata stile showroom museo
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.16)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.anisotropy = 8;
  return tex;
}

function makeCanvasTexture(width, height, drawFn, trackedTextures) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  if (trackedTextures) {
    trackedTextures.push(tex);
  }
  return tex;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  const str = String(text || '');
  if (ctx.measureText(str).width <= maxWidth) return str;
  let clipped = str;
  while (clipped.length > 3 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

function drawPedestalPlaque(ctx, w, h, entry) {
  const accent = entry.teamColor || '#dc0000';
  const counts = entry.awardCounts || countCareerAwards(entry.roundResults, entry.seasonAwards);

  // Fondo ardesia spazzolata ad altissimo contrasto museale
  ctx.fillStyle = '#121620';
  ctx.fillRect(0, 0, w, h);

  // Cornice esterna chiara + banda colore scuderia in alto
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  ctx.fillStyle = accent;
  ctx.fillRect(14, 14, w - 28, 22);

  // Badge superiore tipo carriera
  const tagText = entry.isSimulated
    ? 'ANTEPRIMA SIMULATA • STAGIONE 24 GP'
    : entry.isActiveSeason
      ? entry.careerStatus === 'active'
        ? `CARRIERA ATTIVA • ROUND ${Math.min(24, (entry.completedRoundsCount || 0) + 1)}/24`
        : 'CARRIERA DA AVVIARE'
      : `CARRIERA ARCHIVIATA • STAGIONE ${entry.seasonNumber || 1}`;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '700 24px "Chakra Petch", "Segoe UI", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(tagText, 42, 74);

  // Titolo esplicito scuderia vincitrice / carriera
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 34px "Chakra Petch", "Segoe UI", sans-serif';
  ctx.fillText(fitText(ctx, formatCareerWinHeadline(entry), w - 84), 42, 128);

  // Pilota & classifica mondiale
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '700 30px "Inter", "Segoe UI", sans-serif';
  const driverLine = `${entry.playerName} (${entry.playerCode})  •  ${entry.teamName}`;
  ctx.fillText(fitText(ctx, driverLine, w - 84), 42, 182);

  // Riga piazzamenti Piloti & Costruttori
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '600 26px "JetBrains Mono", "Consolas", monospace';
  const standingLine = entry.isActiveSeason
    ? `${entry.completedRoundsCount || 0}/24 GP DISPUTATI  •  ${entry.playerPoints || 0} PT`
    : `MONDIALE PILOTI P${entry.playerPosition || '--'} (${entry.playerPoints || 0} PT)  •  COSTRUTTORI P${entry.playerTeamPosition || '--'}`;
  ctx.fillText(fitText(ctx, standingLine, w - 84), 42, 232);

  // Riquadro contatori premi
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  drawRoundedRect(ctx, 40, 266, w - 80, 114, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const kpis = [
    { val: String(counts.gpWins), lbl: '1° ORO', col: '#facc15' },
    { val: String(counts.gpP2), lbl: '2° ARG', col: '#e2e8f0' },
    { val: String(counts.gpP3), lbl: '3° BRON', col: '#f59e0b' },
    { val: String(counts.poles), lbl: 'POLE', col: '#c084fc' },
    { val: String(counts.fastestLaps), lbl: 'G. VEL.', col: '#e879f9' },
  ];
  const colW = (w - 100) / kpis.length;
  ctx.textAlign = 'center';
  kpis.forEach((k, idx) => {
    const cx = 50 + colW * (idx + 0.5);
    ctx.fillStyle = k.col;
    ctx.font = '800 40px "JetBrains Mono", "Consolas", monospace';
    ctx.fillText(k.val, cx, 322);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 18px "Chakra Petch", "Segoe UI", sans-serif';
    ctx.fillText(k.lbl, cx, 358);
  });

  // Footer CTA cliccabile
  ctx.fillStyle = accent;
  drawRoundedRect(ctx, 40, 408, w - 80, 66, 12);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 26px "Chakra Petch", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CLICCA LA COPPA PER LA SALA TROFEI 24 GP →', w * 0.5, 450);
}

function drawWallBannerTexture(ctx, w, h, entry) {
  const accent = entry.teamColor || '#dc0000';
  const counts = entry.awardCounts || countCareerAwards(entry.roundResults, entry.seasonAwards);

  ctx.fillStyle = '#141923';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 24, h);
  ctx.fillRect(w - 24, 0, 24, h);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  // Titolo principale a sinistra
  ctx.textAlign = 'left';
  ctx.fillStyle = '#facc15';
  ctx.font = '800 46px "Chakra Petch", "Segoe UI", sans-serif';
  ctx.fillText(fitText(ctx, formatCareerWinHeadline(entry), 1320), 62, 82);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 32px "Inter", "Segoe UI", sans-serif';
  const sub = entry.isActiveSeason
    ? `${entry.playerName} (${entry.playerCode})  •  Stagione ${entry.seasonNumber || 1} (${entry.completedRoundsCount || 0}/24 GP disputati)`
    : `${entry.playerName} (${entry.playerCode})  •  Mondiale Piloti P${entry.playerPosition} (${entry.playerPoints} pt)  •  Costruttori P${entry.playerTeamPosition}`;
  ctx.fillText(fitText(ctx, sub, 1320), 62, 142);

  // Riepilogo trofei a destra
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 40px "JetBrains Mono", "Consolas", monospace';
  ctx.fillText(`${counts.totalAwards} TROFEI`, w - 62, 82);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '700 24px "Chakra Petch", "Segoe UI", sans-serif';
  ctx.fillText(
    `${counts.gpWins} ORO  •  ${counts.gpP2} ARG  •  ${counts.gpP3} BRON  •  ${counts.poles} POLE  •  ${counts.fastestLaps} G.V.`,
    w - 62,
    138
  );
}

function drawGpSlotPlaque(ctx, w, h, track, roundResult) {
  const awards = Array.isArray(roundResult?.awards) ? roundResult.awards : [];
  const hasAwards = awards.length > 0;
  const finishPos = roundResult?.finishPosition ?? null;
  const gridPos = roundResult?.gridPosition ?? null;

  let accent = '#475569';
  let badgeLabel = 'DA DISPUTARE';
  let badgeBg = '#1e293b';
  let badgeFg = '#94a3b8';

  if (roundResult) {
    if (awards.includes('gp_win') || finishPos === 1) {
      accent = '#facc15';
      badgeLabel = '1° ORO';
      badgeBg = '#facc15';
      badgeFg = '#0f172a';
    } else if (awards.includes('gp_p2') || finishPos === 2) {
      accent = '#e2e8f0';
      badgeLabel = '2° ARG';
      badgeBg = '#e2e8f0';
      badgeFg = '#0f172a';
    } else if (awards.includes('gp_p3') || finishPos === 3) {
      accent = '#d97706';
      badgeLabel = '3° BRO';
      badgeBg = '#d97706';
      badgeFg = '#ffffff';
    } else {
      accent = hasAwards ? '#c084fc' : '#64748b';
      badgeLabel = finishPos ? `P${finishPos}` : '--';
      badgeBg = '#1e293b';
      badgeFg = '#e2e8f0';
    }
  }

  // Sfondo targhetta museale
  ctx.fillStyle = roundResult ? '#121722' : '#1b2230';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, w, 12);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, w - 4, h - 4);

  // Riga 1: Round & GP + Badge piazzamento
  const roundCode = `R${String(track.round).padStart(2, '0')}`;
  const gpTitle = String(track.country || track.city || track.name || '').toUpperCase();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 32px "Chakra Petch", "Segoe UI", sans-serif';
  ctx.fillText(fitText(ctx, `${roundCode} • ${gpTitle}`, w - 190), 22, 54);

  ctx.fillStyle = badgeBg;
  drawRoundedRect(ctx, w - 154, 22, 134, 42, 8);
  ctx.fill();
  ctx.fillStyle = badgeFg;
  ctx.textAlign = 'center';
  ctx.font = '800 24px "Chakra Petch", "Segoe UI", sans-serif';
  ctx.fillText(badgeLabel, w - 87, 51);

  // Riga 2: Sempre Griglia + Arrivo (o stato non disputato)
  ctx.textAlign = 'left';
  if (roundResult) {
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '700 26px "JetBrains Mono", "Consolas", monospace';
    const gridStr = gridPos ? `P${gridPos}` : '--';
    const finStr = finishPos ? `P${finishPos}` : '--';
    ctx.fillText(`GRIGLIA ${gridStr}   •   ARRIVO ${finStr}`, 22, hasAwards ? 104 : 122);
  } else {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 23px "Chakra Petch", "Segoe UI", sans-serif';
    ctx.fillText('GP NON ANCORA DISPUTATO', 22, 118);
  }

  // Riga 3: SOLO se il GP ha premi conquistati (GP senza premi -> solo Griglia & Arrivo)
  if (hasAwards) {
    const tags = [];
    if (awards.includes('gp_win')) tags.push('ORO');
    else if (awards.includes('gp_p2')) tags.push('ARGENTO');
    else if (awards.includes('gp_p3')) tags.push('BRONZO');
    if (awards.includes('pole_position')) tags.push('PIRELLI POLE');
    if (awards.includes('fastest_lap')) tags.push('DHL G.V.');

    ctx.fillStyle = '#facc15';
    ctx.font = '800 21px "Chakra Petch", "Segoe UI", sans-serif';
    ctx.fillText(fitText(ctx, tags.join('  •  '), w - 44), 22, 148);
  }
}

export class TrophyMuseumScene3D {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'TrophyMuseumScene3D';
    this.group.visible = false;

    this.room = 'corridor'; // 'corridor' | 'wall'
    this.careers = [];
    this.focusedPedestalIndex = 0;
    this.activeWallCareerId = null;
    this.wallShelfPreset = 'all'; // 'all' | 'top' | 'mid' | 'bot'
    this.inspectedRoundIndex = null;

    this._orbitYaw = 0;
    this._orbitPitch = 0;
    this._zoomOffset = 0;
    this._camPos = new THREE.Vector3(0.0, 2.2, 5.2);
    this._camLook = new THREE.Vector3(0.0, 1.45, 0.0);
    this._hoveredTarget = null;
    this._elapsedSec = 0;

    this._gltfTemplates = new Map();
    this._loadingStarted = false;
    this._dynamicTextures = [];
    this._dynamicGeometries = [];
    this._dynamicMaterials = [];
    this._accentMaterials = [];
    this._pedestalEntries = [];
    this._slotEntries = [];
    this._hitTargets = [];
    this._turntables = [];

    this._raycaster = new THREE.Raycaster();
    this._pointerNdc = new THREE.Vector2();

    this._staticGroup = new THREE.Group();
    this._corridorDynamicGroup = new THREE.Group();
    this._wallDynamicGroup = new THREE.Group();
    this.group.add(this._staticGroup, this._corridorDynamicGroup, this._wallDynamicGroup);

    this._buildStaticArchitecture();
    this._startAssetLoading();
  }

  _trackGeo(g) {
    this._dynamicGeometries.push(g);
    return g;
  }

  _trackMat(m) {
    this._dynamicMaterials.push(m);
    return m;
  }

  _clearDynamicGroup(grp) {
    while (grp.children.length > 0) {
      grp.remove(grp.children[0]);
    }
  }

  _disposeDynamicResources() {
    for (const tex of this._dynamicTextures) tex.dispose();
    for (const geo of this._dynamicGeometries) geo.dispose();
    for (const mat of this._dynamicMaterials) mat.dispose();
    this._dynamicTextures = [];
    this._dynamicGeometries = [];
    this._dynamicMaterials = [];
  }

  _startAssetLoading() {
    if (this._loadingStarted || typeof window === 'undefined') return;
    this._loadingStarted = true;

    Promise.all(
      ALL_TROPHY_IDS.map((id) =>
        assetManager3D
          .loadModel('trophies', id)
          .then((gltf) => {
            if (gltf?.scene) {
              this._gltfTemplates.set(id, gltf.scene);
            }
          })
          .catch(() => null)
      )
    ).then(() => {
      // Sostituisce eventuali placeholder con i modelli .glb reali appena caricati
      if (this.careers.length > 0) {
        this._rebuildCorridorAndWall();
      }
    });

    if (this._concreteWallMat) {
      assetManager3D
        .loadPBRTextureSet('concrete_wall_007', { repeatX: 3, repeatY: 1.5, anisotropy: 8 })
        .then((pbr) => {
          if (!pbr || !this._concreteWallMat) return;
          this._concreteWallMat.map = pbr.map || null;
          this._concreteWallMat.normalMap = pbr.normalMap || null;
          this._concreteWallMat.roughnessMap = pbr.roughnessMap || null;
          this._concreteWallMat.needsUpdate = true;
        })
        .catch(() => null);
    }
  }

  _buildStaticArchitecture() {
    // 1. Pavimento chiaro riflettente stile showroom museo Luminoso
    const floorTex = createMuseumStoneFloorTexture();
    if (typeof window !== 'undefined') {
      const mirrorGeo = new THREE.PlaneGeometry(54, 48);
      const mirror = new Reflector(mirrorGeo, {
        clipBias: 0.003,
        textureWidth: 1024,
        textureHeight: 1024,
        color: 0xc2cbd6,
      });
      mirror.rotation.x = -Math.PI / 2;
      mirror.position.set(6, 0.001, -13);
      this._staticGroup.add(mirror);
    }

    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xdde3eb,
      map: floorTex,
      roughness: 0.19,
      metalness: 0.06,
      transparent: true,
      opacity: 0.76,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(58, 52), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(6, 0.004, -13);
    floor.receiveShadow = true;
    this._staticGroup.add(floor);

    this._whitePanelMat = new THREE.MeshStandardMaterial({
      color: 0xe6eaf0,
      roughness: 0.56,
      metalness: 0.04,
    });
    this._jointMat = new THREE.MeshStandardMaterial({
      color: 0x161b24,
      roughness: 0.65,
      metalness: 0.15,
    });
    this._concreteWallMat = new THREE.MeshStandardMaterial({
      color: 0xc8ced8,
      roughness: 0.80,
      metalness: 0.04,
    });
    this._nicheWallMat = new THREE.MeshStandardMaterial({
      color: 0xcbd2de,
      roughness: 0.60,
      metalness: 0.05,
    });
    this._cofferDarkMat = new THREE.MeshStandardMaterial({
      color: 0x2c333f,
      roughness: 0.55,
      metalness: 0.2,
    });
    this._skylightGlowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this._teamStripeMat = new THREE.MeshStandardMaterial({
      color: 0xdc0000,
      emissive: 0xdc0000,
      emissiveIntensity: 0.38,
      roughness: 0.25,
      metalness: 0.3,
    });
    this._accentMaterials.push(this._teamStripeMat);

    // 2. Stanza 2 — Parete Trofei Principale (z = WALL_Z) & Galleria di collegamento
    const wallWidth = 24.0;
    const wallHeight = 6.75;
    const wall2Group = new THREE.Group();

    // Parete di fondo bianco perla
    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(wallWidth, wallHeight),
      this._whitePanelMat
    );
    backWall.position.set(0, wallHeight * 0.5, WALL_Z);
    wall2Group.add(backWall);

    // Giunti verticali neri tra i pannelli modulari della Stanza 2
    for (let px = -10.4; px <= 10.41; px += 2.6) {
      const mullion = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, wallHeight, 0.03),
        this._jointMat
      );
      mullion.position.set(px, wallHeight * 0.5, WALL_Z + 0.015);
      wall2Group.add(mullion);
    }

    // Zoccolino basso scuro
    const skirt2 = new THREE.Mesh(
      new THREE.BoxGeometry(wallWidth, 0.13, 0.05),
      this._jointMat
    );
    skirt2.position.set(0, 0.065, WALL_Z + 0.02);
    wall2Group.add(skirt2);

    // Nicchia museale satinata dietro i 3 scaffali per massimo stacco cromatico di Oro/Argento/Bronzo/Pirelli/DHL
    const nicheBack = new THREE.Mesh(
      new THREE.PlaneGeometry(17.8, 4.72),
      this._nicheWallMat
    );
    nicheBack.position.set(0, 2.66, WALL_Z + 0.012);
    wall2Group.add(nicheBack);

    const nicheTrimTop = new THREE.Mesh(new THREE.BoxGeometry(17.95, 0.08, 0.05), this._jointMat);
    nicheTrimTop.position.set(0, 5.02, WALL_Z + 0.025);
    const nicheTrimLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 4.72, 0.05), this._jointMat);
    nicheTrimLeft.position.set(-8.94, 2.66, WALL_Z + 0.025);
    const nicheTrimRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 4.72, 0.05), this._jointMat);
    nicheTrimRight.position.set(8.94, 2.66, WALL_Z + 0.025);
    wall2Group.add(nicheTrimTop, nicheTrimLeft, nicheTrimRight);

    // Fascia orizzontale team-color lungo i laterali della Stanza 2
    for (const sx of [-11.96, 11.96]) {
      const sideWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, wallHeight, 17.5),
        this._concreteWallMat
      );
      sideWall.position.set(sx, wallHeight * 0.5, -23.5);
      wall2Group.add(sideWall);

      const sideStripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.11, 17.4),
        this._teamStripeMat
      );
      sideStripe.position.set(sx + (sx < 0 ? 0.03 : -0.03), 2.18, -23.5);
      wall2Group.add(sideStripe);
    }

    // Galleria di connessione Stanza 1 <-> Stanza 2 (z: -5.6 -> -15.0)
    for (const sx of [-4.2, 4.2]) {
      const tunnelWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 5.8, 9.6),
        this._whitePanelMat
      );
      tunnelWall.position.set(sx, 2.9, -10.3);
      wall2Group.add(tunnelWall);

      const tunnelStripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.17, 0.10, 9.5),
        this._teamStripeMat
      );
      tunnelStripe.position.set(sx + (sx < 0 ? 0.02 : -0.02), 2.15, -10.3);
      wall2Group.add(tunnelStripe);
    }

    // Soffitto e griglia lucernari 3x2 Stanza 2
    const ceiling2 = new THREE.Mesh(
      new THREE.BoxGeometry(wallWidth, 0.25, 18.0),
      this._cofferDarkMat
    );
    ceiling2.position.set(0, wallHeight + 0.12, -23.5);
    wall2Group.add(ceiling2);

    for (const lx of [-5.2, 0.0, 5.2]) {
      for (const lz of [-20.5, -27.2]) {
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(3.8, 4.2),
          this._skylightGlowMat
        );
        panel.rotation.x = Math.PI / 2;
        panel.position.set(lx, wallHeight - 0.02, lz);
        wall2Group.add(panel);
      }
    }

    // Luci museali Stanza 2 per far brillare ogni trofeo sugli scaffali senza sovraesporre
    const wallKeyLight1 = new THREE.PointLight(0xffffff, 26, 28, 1.3);
    wallKeyLight1.position.set(-4.5, 5.2, -25.2);
    const wallKeyLight2 = new THREE.PointLight(0xffffff, 26, 28, 1.3);
    wallKeyLight2.position.set(4.5, 5.2, -25.2);
    const wallFillLight = new THREE.DirectionalLight(0xfffbeb, 0.55);
    wallFillLight.position.set(0, 6.0, -18.0);
    wall2Group.add(wallKeyLight1, wallKeyLight2, wallFillLight);

    // Scaffali fisici architettonici Stanza 2 (3 ripiani illuminati)
    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0xf4f6fa,
      roughness: 0.34,
      metalness: 0.08,
    });
    const shelfLipMat = new THREE.MeshStandardMaterial({
      color: 0x1e2430,
      roughness: 0.35,
      metalness: 0.55,
    });
    const shelfLedMat = new THREE.MeshBasicMaterial({ color: 0xfff8e7 });
    const dividerMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.25,
      metalness: 0.1,
      transparent: true,
      opacity: 0.42,
    });

    const shelfWidth = 17.4;
    for (const sy of SHELF_Y) {
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(shelfWidth, 0.075, 0.88),
        shelfMat
      );
      slab.position.set(0, sy, SHELF_Z);
      slab.receiveShadow = true;
      wall2Group.add(slab);

      const frontLip = new THREE.Mesh(
        new THREE.BoxGeometry(shelfWidth + 0.02, 0.08, 0.03),
        shelfLipMat
      );
      frontLip.position.set(0, sy, SHELF_Z + 0.44);
      wall2Group.add(frontLip);

      const underLed = new THREE.Mesh(
        new THREE.PlaneGeometry(shelfWidth - 0.4, 0.045),
        shelfLedMat
      );
      underLed.rotation.x = Math.PI / 2;
      underLed.position.set(0, sy - 0.04, SHELF_Z + 0.14);
      wall2Group.add(underLed);

      // Divisori verticali tra gli 8 slot cronologici
      for (let c = 0; c <= 8; c++) {
        const divX = (c - 4.0) * SHELF_SLOT_PITCH_X;
        const divMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.02, 0.62, 0.78),
          dividerMat
        );
        divMesh.position.set(divX, sy + 0.35, SHELF_Z);
        wall2Group.add(divMesh);
      }
    }

    this._staticGroup.add(wall2Group);
  }

  _buildCorridorShell(careerCount) {
    const corridorSpanRight = Math.max(10.5, (careerCount - 1) * PEDESTAL_PITCH_X + 7.5);
    const xMin = -7.5;
    const xMax = corridorSpanRight;
    const width = xMax - xMin;
    const centerX = (xMin + xMax) * 0.5;
    const ceilH = 6.2;

    // Parete posteriore continua Stanza 1 (z = -5.6), single-sided (+Z) per transizione fluida verso Stanza 2
    const corridorBackWall = new THREE.Mesh(
      this._trackGeo(new THREE.PlaneGeometry(width, ceilH)),
      this._whitePanelMat
    );
    corridorBackWall.position.set(centerX, ceilH * 0.5, -5.6);
    this._corridorDynamicGroup.add(corridorBackWall);

    // Fascia orizzontale continua nel colore della scuderia lungo tutta la parete (fronte +Z)
    const corridorStripe = new THREE.Mesh(
      this._trackGeo(new THREE.PlaneGeometry(width, 0.11)),
      this._teamStripeMat
    );
    corridorStripe.position.set(centerX, 2.15, -5.585);
    this._corridorDynamicGroup.add(corridorStripe);

    // Zoccolino inferiore nero (fronte +Z)
    const corridorSkirt = new THREE.Mesh(
      this._trackGeo(new THREE.PlaneGeometry(width, 0.13)),
      this._jointMat
    );
    corridorSkirt.position.set(centerX, 0.065, -5.582);
    this._corridorDynamicGroup.add(corridorSkirt);

    // Giunti verticali neri sottili tra pannelli modulari (ogni 2.6m, style Bright Museum)
    for (let px = Math.ceil(xMin); px <= Math.floor(xMax); px += 2.6) {
      const mul = new THREE.Mesh(this._trackGeo(new THREE.PlaneGeometry(0.048, ceilH)), this._jointMat);
      mul.position.set(px, ceilH * 0.5, -5.59);
      this._corridorDynamicGroup.add(mul);
    }

    // Pareti laterali in cemento architettonico Stanza 1
    for (const sx of [xMin, xMax]) {
      const side = new THREE.Mesh(
        this._trackGeo(new THREE.BoxGeometry(0.18, ceilH, 14.5)),
        this._concreteWallMat
      );
      side.position.set(sx, ceilH * 0.5, 1.5);
      this._corridorDynamicGroup.add(side);
    }

    // Parete alle spalle della telecamera (z = +8.6)
    const frontCloseWall = new THREE.Mesh(
      this._trackGeo(new THREE.BoxGeometry(width, ceilH, 0.18)),
      this._whitePanelMat
    );
    frontCloseWall.position.set(centerX, ceilH * 0.5, 8.6);
    this._corridorDynamicGroup.add(frontCloseWall);

    // Soffitto Stanza 1 con griglia lucernari 3x2 bianchi luminosi (esattamente come riferimento)
    const ceilDeck = new THREE.Mesh(
      this._trackGeo(new THREE.BoxGeometry(width, 0.24, 14.4)),
      this._cofferDarkMat
    );
    ceilDeck.position.set(centerX, ceilH + 0.12, 1.5);
    this._corridorDynamicGroup.add(ceilDeck);

    for (let sx = Math.floor(xMin + 2.5); sx <= Math.ceil(xMax - 2.0); sx += 4.6) {
      for (const sz of [-2.0, 2.6]) {
        const panel = new THREE.Mesh(
          this._trackGeo(new THREE.PlaneGeometry(3.4, 3.0)),
          this._skylightGlowMat
        );
        panel.rotation.x = Math.PI / 2;
        panel.position.set(sx, ceilH - 0.015, sz);
        this._corridorDynamicGroup.add(panel);
      }
    }
  }

  _instantiateTrophyModel(modelId, targetHeight, gpTier = null) {
    const tpl = this._gltfTemplates.get(modelId);
    if (!tpl) {
      return this._createFallbackTrophy(modelId, targetHeight, gpTier);
    }

    const clone = tpl.clone(true);
    const tierCfg = gpTier ? GP_TIER_COLORS[gpTier] : null;
    clone.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const srcMats = Array.isArray(node.material) ? node.material : [node.material];
      const nextMats = srcMats.map((m) => {
        const c = m.clone();
        this._trackMat(c);
        if (tierCfg && m.name === 'GP_Metal_Primary') {
          c.color.setHex(tierCfg.hex);
          c.roughness = tierCfg.roughness;
          c.metalness = tierCfg.metalness;
        }
        return c;
      });
      node.material = Array.isArray(node.material) ? nextMats : nextMats[0];
      node.castShadow = true;
      node.receiveShadow = true;
    });

    // Normalizza scala e poggia perfettamente a y = 0 locale
    clone.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const safeH = Math.max(0.05, size.y);
    const scale = targetHeight / safeH;
    const holder = new THREE.Group();
    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    holder.add(clone);
    return holder;
  }

  _createFallbackTrophy(modelId, targetHeight, gpTier = null) {
    // Fallback geometrico pulito usato solo durante il brevissimo fetch .glb o in Node headless
    const holder = new THREE.Group();
    const baseMat = this._trackMat(new THREE.MeshStandardMaterial({ color: 0x151922, roughness: 0.3, metalness: 0.3 }));
    const colorHex =
      gpTier && GP_TIER_COLORS[gpTier]
        ? GP_TIER_COLORS[gpTier].hex
        : modelId === 'pirelli_pole'
          ? 0x181b22
          : modelId === 'dhl_fastest_lap'
            ? 0xd40511
            : 0xf2c544;
    const mainMat = this._trackMat(new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.2, metalness: 0.85 }));

    const plinth = new THREE.Mesh(
      this._trackGeo(new THREE.CylinderGeometry(targetHeight * 0.22, targetHeight * 0.25, targetHeight * 0.2, 24)),
      baseMat
    );
    plinth.position.y = targetHeight * 0.1;
    const body = new THREE.Mesh(
      this._trackGeo(new THREE.CylinderGeometry(targetHeight * 0.14, targetHeight * 0.09, targetHeight * 0.65, 24)),
      mainMat
    );
    body.position.y = targetHeight * 0.52;
    holder.add(plinth, body);

    if (modelId === 'fia_wdc') {
      const globeMat = this._trackMat(new THREE.MeshStandardMaterial({ color: 0x1241a6, roughness: 0.15, metalness: 0.3 }));
      const globe = new THREE.Mesh(this._trackGeo(new THREE.SphereGeometry(targetHeight * 0.13, 20, 14)), globeMat);
      globe.position.y = targetHeight * 0.88;
      holder.add(globe);
    }
    return holder;
  }

  _buildCareersList(careerState) {
    const rawCompleted = Array.isArray(careerState?.completedCareers) ? careerState.completedCareers : [];
    const list = rawCompleted.map((entry, i) => {
      const team = F1_2026_TEAMS[entry.teamId] || { name: entry.teamName || 'Scuderia F1', primaryColor: '#dc0000' };
      const roundResults = Array.isArray(entry.roundResults) ? entry.roundResults : [];
      const seasonAwards = Array.isArray(entry.seasonAwards) ? entry.seasonAwards : [];
      return {
        ...entry,
        id: entry.id || `completed_${i}`,
        isActiveSeason: false,
        teamName: entry.teamName || team.name,
        teamColor: entry.teamColor || team.primaryColor || '#dc0000',
        completedRoundsCount: roundResults.filter(Boolean).length,
        awardCounts: entry.awardCounts || countCareerAwards(roundResults, seasonAwards),
      };
    });

    // Aggiunge la Stagione Corrente / Attiva come piedistallo dedicato in coda al corridoio
    const activeTeam = F1_2026_TEAMS[careerState?.teamId] || F1_2026_TEAMS.ferrari;
    const activeRounds = Array.isArray(careerState?.roundResults) ? careerState.roundResults : [];
    list.push({
      id: 'active_season',
      isActiveSeason: true,
      isSimulated: false,
      careerStatus: careerState?.careerStatus || 'not_started',
      seasonNumber: Math.max(1, Number(careerState?.seasonNumber) || 1),
      teamId: activeTeam.id,
      teamName: activeTeam.name,
      teamColor: activeTeam.primaryColor || '#dc0000',
      playerName: careerState?.playerName || 'Pilota F1',
      playerCode: careerState?.playerCode || 'PIL',
      playerPosition: null,
      playerTeamPosition: null,
      playerPoints: careerState?.stats?.points ?? 0,
      championDriverName: 'Stagione in corso',
      roundResults: activeRounds,
      seasonAwards: [],
      completedRoundsCount: activeRounds.filter(Boolean).length,
      awardCounts: countCareerAwards(activeRounds, []),
    });

    return list;
  }

  setCareerData(careerState) {
    this.careers = this._buildCareersList(careerState);
    if (this.focusedPedestalIndex >= this.careers.length) {
      this.focusedPedestalIndex = 0;
    }
    if (!this.activeWallCareerId || !this.careers.some((c) => c.id === this.activeWallCareerId)) {
      this.activeWallCareerId = this.careers[0]?.id || null;
    }
    this._rebuildCorridorAndWall();
    this._syncTeamAccentColor();
  }

  _syncTeamAccentColor() {
    const activeCareer =
      this.room === 'wall'
        ? this.careers.find((c) => c.id === this.activeWallCareerId) || this.careers[0]
        : this.careers[this.focusedPedestalIndex] || this.careers[0];
    const hex = activeCareer?.teamColor || '#dc0000';
    for (const mat of this._accentMaterials) {
      mat.color.set(hex);
      if (mat.emissive) mat.emissive.set(hex);
    }
  }

  _rebuildCorridorAndWall() {
    this._clearDynamicGroup(this._corridorDynamicGroup);
    this._clearDynamicGroup(this._wallDynamicGroup);
    this._disposeDynamicResources();
    this._pedestalEntries = [];
    this._slotEntries = [];
    this._hitTargets = [];
    this._turntables = [];

    this._buildCorridorShell(this.careers.length);

    // 1. Stanza 1 — Piedistalli nel Corridoio del Museo
    const darkSlateMat = this._trackMat(new THREE.MeshStandardMaterial({ color: 0x202631, roughness: 0.34, metalness: 0.28 }));
    const topSteelMat = this._trackMat(new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.22, metalness: 0.85 }));
    const plaqueFrameMat = this._trackMat(new THREE.MeshStandardMaterial({ color: 0x161b24, roughness: 0.35, metalness: 0.45 }));

    this.careers.forEach((entry, idx) => {
      const px = idx * PEDESTAL_PITCH_X;
      const bay = new THREE.Group();
      bay.position.set(px, 0, 0);

      // Base circolare a gradoni stile showroom + anello LED scuderia
      const stepBottom = new THREE.Mesh(
        this._trackGeo(new THREE.CylinderGeometry(1.18, 1.24, 0.10, 64)),
        darkSlateMat
      );
      stepBottom.position.y = 0.05;
      const bodyCyl = new THREE.Mesh(
        this._trackGeo(new THREE.CylinderGeometry(0.92, 0.98, 0.76, 64)),
        darkSlateMat
      );
      bodyCyl.position.y = 0.48;
      const topCap = new THREE.Mesh(
        this._trackGeo(new THREE.CylinderGeometry(0.98, 0.96, 0.08, 64)),
        darkSlateMat
      );
      topCap.position.y = 0.90;
      const turntablePad = new THREE.Mesh(
        this._trackGeo(new THREE.CylinderGeometry(0.56, 0.58, 0.03, 48)),
        topSteelMat
      );
      turntablePad.position.y = 0.955;

      const ledMat = this._trackMat(
        new THREE.MeshStandardMaterial({
          color: entry.teamColor,
          emissive: entry.teamColor,
          emissiveIntensity: 1.45,
          roughness: 0.2,
          metalness: 0.3,
        })
      );
      const ledRing = new THREE.Mesh(
        this._trackGeo(new THREE.RingGeometry(1.25, 1.32, 72)),
        ledMat
      );
      ledRing.rotation.x = -Math.PI / 2;
      ledRing.position.y = 0.012;

      bay.add(stepBottom, bodyCyl, topCap, turntablePad, ledRing);

      // Trofei sul piedistallo
      const turntableGroup = new THREE.Group();
      turntableGroup.position.set(0, 0.97, 0);

      const awards = Array.isArray(entry.seasonAwards) ? entry.seasonAwards : [];
      const wonWdc = awards.includes('wdc_champion') || (!entry.isActiveSeason && Number(entry.playerPosition) === 1);
      const wonWcc = awards.includes('wcc_champion');

      if (wonWdc) {
        const wdcModel = this._instantiateTrophyModel('fia_wdc', 1.46);
        turntableGroup.add(wdcModel);
        if (wonWcc) {
          const wccModel = this._instantiateTrophyModel('fia_wcc', 1.05);
          wccModel.position.set(0.56, -0.025, -0.18);
          bay.add(wccModel);
          wccModel.position.y = 0.94;
        }
      } else if (awards.includes('wdc_p2') || awards.includes('wdc_p3')) {
        const tier = awards.includes('wdc_p2') ? 'silver' : 'bronze';
        const podiumCup = this._instantiateTrophyModel('gp_classic', 1.08, tier);
        turntableGroup.add(podiumCup);
      } else if (wonWcc) {
        const wccOnly = this._instantiateTrophyModel('fia_wcc', 1.24);
        turntableGroup.add(wccOnly);
      } else {
        // Espositore museale per stagione in corso o piazzamento fuori dal podio mondiale
        const statusTier = entry.completedRoundsCount > 0 ? 'silver' : 'bronze';
        const crestModel = this._instantiateTrophyModel('gp_modern', 0.98, statusTier);
        turntableGroup.add(crestModel);
      }

      bay.add(turntableGroup);
      this._turntables.push(turntableGroup);

      // Targhetta 3D frontale incisa con indicazione scuderia vincitrice
      const plaqueGroup = new THREE.Group();
      plaqueGroup.position.set(0, 0.56, 1.02);
      plaqueGroup.rotation.x = -0.34;

      const pBacking = new THREE.Mesh(
        this._trackGeo(new THREE.BoxGeometry(1.36, 0.68, 0.04)),
        plaqueFrameMat
      );
      const pTex = makeCanvasTexture(
        1024,
        512,
        (ctx, cw, ch) => drawPedestalPlaque(ctx, cw, ch, entry),
        this._dynamicTextures
      );
      const pFaceMat = this._trackMat(
        new THREE.MeshBasicMaterial({ map: pTex, color: 0xffffff })
      );
      const pFace = new THREE.Mesh(
        this._trackGeo(new THREE.PlaneGeometry(1.30, 0.64)),
        pFaceMat
      );
      pFace.position.z = 0.022;
      plaqueGroup.add(pBacking, pFace);
      bay.add(plaqueGroup);

      // Luce dedicata sopra ogni piedistallo
      const pedLight = new THREE.PointLight(0xffffff, 12, 9.5, 1.4);
      pedLight.position.set(0.4, 3.8, 1.6);
      bay.add(pedLight);

      // Hitbox raycast invisibile (material.visible DEVE restare true in Three.js, opacity=0 & colorWrite=false!)
      const hitMat = this._trackMat(
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0.0,
          depthWrite: false,
          colorWrite: false,
        })
      );
      const hitMesh = new THREE.Mesh(
        this._trackGeo(new THREE.CylinderGeometry(1.38, 1.38, 2.7, 18)),
        hitMat
      );
      hitMesh.position.y = 1.35;
      hitMesh.userData = {
        museumHitType: 'pedestal',
        careerId: entry.id,
        careerIndex: idx,
        label: wonWdc ? '🏆 Coppa del Mondo FIA Formula 1' : entry.teamName,
        sublabel: `${formatCareerShortLabel(entry)} • Clicca per la Sala Trofei 24 GP`,
      };
      bay.add(hitMesh);
      this._hitTargets.push(hitMesh);

      this._pedestalEntries.push({ entry, idx, bay, ledMat });
      this._corridorDynamicGroup.add(bay);
    });

    // 2. Stanza 2 — Muro Trofei 24 GP per la carriera selezionata
    const wallCareer =
      this.careers.find((c) => c.id === this.activeWallCareerId) || this.careers[0] || null;
    if (!wallCareer) return;

    // Insegna intestazione carriera sulla parete della Stanza 2
    const bannerTex = makeCanvasTexture(
      2048,
      256,
      (ctx, cw, ch) => drawWallBannerTexture(ctx, cw, ch, wallCareer),
      this._dynamicTextures
    );
    const bannerMat = this._trackMat(new THREE.MeshBasicMaterial({ map: bannerTex, color: 0xffffff }));
    const bannerMesh = new THREE.Mesh(this._trackGeo(new THREE.PlaneGeometry(16.6, 1.18)), bannerMat);
    bannerMesh.position.set(0, 5.56, WALL_Z + 0.045);
    this._wallDynamicGroup.add(bannerMesh);

    const frameMat = this._trackMat(new THREE.MeshStandardMaterial({ color: 0x141822, roughness: 0.4, metalness: 0.4 }));

    CALENDAR_2026_TRACKS.forEach((track, i) => {
      const row = Math.floor(i / 8); // 0 = top (R01..R08), 1 = mid (R09..R16), 2 = bot (R17..R24)
      const col = i % 8;
      const slotX = (col - 3.5) * SHELF_SLOT_PITCH_X;
      const sy = SHELF_Y[row];
      const shelfTopY = sy + 0.038;

      const res = wallCareer.roundResults?.[i] || null;
      const awards = Array.isArray(res?.awards) ? res.awards : [];

      // Trofei 3D sullo scaffale SOLO se il GP ha premi conquistati
      if (awards.length > 0) {
        const items = [];
        if (awards.includes('gp_win')) {
          items.push({ id: GP_TROPHY_MODEL_CYCLE[i % GP_TROPHY_MODEL_CYCLE.length], h: 0.64, tier: 'gold' });
        } else if (awards.includes('gp_p2')) {
          items.push({ id: GP_TROPHY_MODEL_CYCLE[i % GP_TROPHY_MODEL_CYCLE.length], h: 0.60, tier: 'silver' });
        } else if (awards.includes('gp_p3')) {
          items.push({ id: GP_TROPHY_MODEL_CYCLE[i % GP_TROPHY_MODEL_CYCLE.length], h: 0.56, tier: 'bronze' });
        }
        if (awards.includes('pole_position')) {
          items.push({ id: 'pirelli_pole', h: 0.45, tier: null });
        }
        if (awards.includes('fastest_lap')) {
          items.push({ id: 'dhl_fastest_lap', h: 0.47, tier: null });
        }

        const offsets =
          items.length === 1
            ? [0.0]
            : items.length === 2
              ? [-0.36, 0.36]
              : [-0.56, 0.0, 0.56];

        items.forEach((spec, tIdx) => {
          const trophyMesh = this._instantiateTrophyModel(spec.id, spec.h, spec.tier);
          trophyMesh.position.set(slotX + offsets[tIdx], shelfTopY, SHELF_Z + 0.04);
          this._wallDynamicGroup.add(trophyMesh);
        });
      }

      // Targhetta informativa montata sotto il trofeo/slot
      const plaqueTex = makeCanvasTexture(
        640,
        176,
        (ctx, cw, ch) => drawGpSlotPlaque(ctx, cw, ch, track, res),
        this._dynamicTextures
      );
      const plaqueMat = this._trackMat(new THREE.MeshBasicMaterial({ map: plaqueTex, color: 0xffffff }));
      const pBacking = new THREE.Mesh(this._trackGeo(new THREE.BoxGeometry(1.92, 0.50, 0.024)), frameMat);
      pBacking.position.set(slotX, sy - 0.32, WALL_Z + 0.032);
      const pPlane = new THREE.Mesh(this._trackGeo(new THREE.PlaneGeometry(1.88, 0.48)), plaqueMat);
      pPlane.position.set(slotX, sy - 0.32, WALL_Z + 0.048);
      this._wallDynamicGroup.add(pBacking, pPlane);

      // Highlight bordo slot al passaggio mouse o ispezione
      const highlightMat = this._trackMat(
        new THREE.MeshBasicMaterial({
          color: wallCareer.teamColor || '#dc0000',
          transparent: true,
          opacity: 0.0,
        })
      );
      const highlightMesh = new THREE.Mesh(
        this._trackGeo(new THREE.PlaneGeometry(1.98, 1.32)),
        highlightMat
      );
      highlightMesh.position.set(slotX, sy + 0.14, WALL_Z + 0.025);
      this._wallDynamicGroup.add(highlightMesh);

      const awardSummary =
        awards.length > 0
          ? awards.map((id) => F1_AWARDS[id]?.shortLabel || id).join(' + ')
          : res
            ? `Griglia P${res.gridPosition || '--'} → Arrivo P${res.finishPosition || '--'}`
            : 'Non ancora disputato';

      const slotHitMat = this._trackMat(
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0.0,
          depthWrite: false,
          colorWrite: false,
        })
      );
      const slotHit = new THREE.Mesh(
        this._trackGeo(new THREE.BoxGeometry(1.98, 1.36, 0.92)),
        slotHitMat
      );
      slotHit.position.set(slotX, sy + 0.14, SHELF_Z + 0.05);
      slotHit.userData = {
        museumHitType: 'gp_slot',
        roundIndex: i,
        careerId: wallCareer.id,
        label: `R${String(track.round).padStart(2, '0')} • ${track.country || track.name}`,
        sublabel: `${awardSummary} • Clicca per zoom`,
      };
      this._wallDynamicGroup.add(slotHit);
      this._hitTargets.push(slotHit);

      this._slotEntries.push({
        roundIndex: i,
        track,
        roundResult: res,
        awards,
        row,
        col,
        slotX,
        shelfY: sy,
        highlightMat,
      });
    });
  }

  getState() {
    const activeCareer =
      this.room === 'wall'
        ? this.careers.find((c) => c.id === this.activeWallCareerId) || this.careers[0] || null
        : this.careers[this.focusedPedestalIndex] || this.careers[0] || null;

    let inspectedSlot = null;
    if (this.room === 'wall' && this.inspectedRoundIndex !== null) {
      inspectedSlot = this._slotEntries[this.inspectedRoundIndex] || null;
    }

    return {
      room: this.room,
      focusedPedestalIndex: this.focusedPedestalIndex,
      careerCount: this.careers.length,
      careers: this.careers,
      activeCareer,
      activeCareerHeadline: formatCareerWinHeadline(activeCareer),
      activeCareerShortLabel: formatCareerShortLabel(activeCareer),
      wallShelfPreset: this.wallShelfPreset,
      inspectedRoundIndex: this.inspectedRoundIndex,
      inspectedSlot: inspectedSlot
        ? {
            roundIndex: inspectedSlot.roundIndex,
            track: inspectedSlot.track,
            roundResult: inspectedSlot.roundResult,
            awards: inspectedSlot.awards,
          }
        : null,
    };
  }

  focusPedestal(index) {
    if (this.careers.length === 0) return;
    const clamped = Math.max(0, Math.min(this.careers.length - 1, Math.round(Number(index) || 0)));
    this.focusedPedestalIndex = clamped;
    this.resetCameraOffset();
    this._syncTeamAccentColor();
  }

  cyclePedestal(delta = 1) {
    if (this.careers.length === 0) return;
    const n = this.careers.length;
    this.focusedPedestalIndex = ((this.focusedPedestalIndex + delta) % n + n) % n;
    this.resetCameraOffset();
    this._syncTeamAccentColor();
  }

  enterWallRoom(careerId = null) {
    const target =
      (careerId && this.careers.find((c) => c.id === careerId)) ||
      this.careers[this.focusedPedestalIndex] ||
      this.careers[0];
    if (!target) return;

    const changedCareer = this.activeWallCareerId !== target.id;
    this.activeWallCareerId = target.id;
    const idx = this.careers.findIndex((c) => c.id === target.id);
    if (idx >= 0) this.focusedPedestalIndex = idx;

    this.room = 'wall';
    this.wallShelfPreset = 'all';
    this.inspectedRoundIndex = null;
    this.resetCameraOffset();

    if (changedCareer) {
      this._rebuildCorridorAndWall();
    }
    this._syncTeamAccentColor();
  }

  returnToCorridor() {
    this.room = 'corridor';
    this.inspectedRoundIndex = null;
    this.wallShelfPreset = 'all';
    this.resetCameraOffset();
    this._syncTeamAccentColor();
  }

  setWallShelfPreset(preset = 'all') {
    const allowed = new Set(['all', 'top', 'mid', 'bot']);
    this.wallShelfPreset = allowed.has(preset) ? preset : 'all';
    this.inspectedRoundIndex = null;
    this.resetCameraOffset();
  }

  inspectGpSlot(roundIndex) {
    const idx = Math.max(0, Math.min(CALENDAR_2026_TRACKS.length - 1, Math.round(Number(roundIndex) || 0)));
    if (this.room !== 'wall') {
      this.enterWallRoom(this.activeWallCareerId);
    }
    this.inspectedRoundIndex = idx;
    this.resetCameraOffset();
  }

  clearGpInspection() {
    this.inspectedRoundIndex = null;
    this.resetCameraOffset();
  }

  selectCareerInMuseum(careerId, openWall = false) {
    const idx = this.careers.findIndex((c) => c.id === careerId);
    if (idx < 0) return;
    this.focusedPedestalIndex = idx;
    if (openWall) {
      this.enterWallRoom(careerId);
    } else {
      this.room = 'corridor';
      this.inspectedRoundIndex = null;
      this.resetCameraOffset();
      this._syncTeamAccentColor();
    }
  }

  rotateOrbit(deltaYaw = 0, deltaPitch = 0) {
    if (this.room === 'corridor') {
      this._orbitYaw = Math.max(-0.55, Math.min(0.55, this._orbitYaw - deltaYaw * 0.7));
      this._orbitPitch = Math.max(-0.18, Math.min(0.28, this._orbitPitch + deltaPitch * 0.5));
    } else {
      this._orbitYaw = Math.max(-3.6, Math.min(3.6, this._orbitYaw - deltaYaw * 2.2));
      this._orbitPitch = Math.max(-1.1, Math.min(1.1, this._orbitPitch + deltaPitch * 1.4));
    }
  }

  zoomOrbit(deltaZoom = 0) {
    const minZ = this.room === 'corridor' ? -1.4 : -3.5;
    const maxZ = this.room === 'corridor' ? 2.1 : 3.2;
    this._zoomOffset = Math.max(minZ, Math.min(maxZ, this._zoomOffset + deltaZoom * 0.85));
  }

  resetCameraOffset() {
    this._orbitYaw = 0;
    this._orbitPitch = 0;
    this._zoomOffset = 0;
  }

  _raycastMuseum(ndcX, ndcY, camera) {
    if (!camera || this._hitTargets.length === 0) return null;
    camera.updateMatrixWorld(true);
    this._pointerNdc.set(ndcX, ndcY);
    this._raycaster.setFromCamera(this._pointerNdc, camera);
    const hits = this._raycaster.intersectObjects(this._hitTargets, false);
    for (const h of hits) {
      const ud = h.object?.userData;
      if (!ud) continue;
      if (this.room === 'corridor' && ud.museumHitType === 'pedestal') {
        return ud;
      }
      if (this.room === 'wall' && ud.museumHitType === 'gp_slot') {
        return ud;
      }
    }
    return null;
  }

  handlePointerHover(ndcX, ndcY, camera) {
    this._hoveredTarget = this._raycastMuseum(ndcX, ndcY, camera);
    return this._hoveredTarget;
  }

  handlePointerClick(ndcX, ndcY, camera) {
    const hit = this._raycastMuseum(ndcX, ndcY, camera);
    if (!hit) {
      if (this.room === 'wall' && this.inspectedRoundIndex !== null) {
        this.clearGpInspection();
      }
      return null;
    }

    if (hit.museumHitType === 'pedestal') {
      this.enterWallRoom(hit.careerId);
      return hit;
    }

    if (hit.museumHitType === 'gp_slot') {
      if (this.inspectedRoundIndex === hit.roundIndex) {
        this.clearGpInspection();
      } else {
        this.inspectGpSlot(hit.roundIndex);
      }
      return hit;
    }

    return null;
  }

  update(dt = 1 / 60) {
    this._elapsedSec += dt;

    for (let i = 0; i < this._turntables.length; i++) {
      const tt = this._turntables[i];
      if (tt) {
        tt.rotation.y += dt * 0.24;
      }
    }

    // Evidenziazione visiva hover/focus su piedistalli & slot
    for (const ped of this._pedestalEntries) {
      const isHovered = this._hoveredTarget?.museumHitType === 'pedestal' && this._hoveredTarget.careerIndex === ped.idx;
      const isFocused = ped.idx === this.focusedPedestalIndex;
      const targetGlow = isHovered ? 2.5 : isFocused ? 1.65 : 0.75;
      ped.ledMat.emissiveIntensity += (targetGlow - ped.ledMat.emissiveIntensity) * Math.min(1, dt * 8);
    }

    for (const slot of this._slotEntries) {
      const isHovered = this._hoveredTarget?.museumHitType === 'gp_slot' && this._hoveredTarget.roundIndex === slot.roundIndex;
      const isInspected = this.inspectedRoundIndex === slot.roundIndex;
      const targetOpacity = isInspected ? 0.22 : isHovered ? 0.14 : 0.0;
      slot.highlightMat.opacity += (targetOpacity - slot.highlightMat.opacity) * Math.min(1, dt * 10);
    }
  }

  updateCamera(camera, dt = 1 / 60) {
    if (!camera) return;
    camera.up.set(0, 1, 0);

    let desiredFov = 50;
    const targetPos = new THREE.Vector3();
    const targetLook = new THREE.Vector3();

    if (this.room === 'corridor') {
      const px = this.focusedPedestalIndex * PEDESTAL_PITCH_X;
      const dist = 4.65 + this._zoomOffset;
      const yaw = this._orbitYaw;
      const pitchY = 1.88 + this._orbitPitch * 2.0;
      targetPos.set(px + Math.sin(yaw) * dist, pitchY, Math.cos(yaw) * dist);
      targetLook.set(px, 1.36, -0.25);
      desiredFov = 50;
    } else if (this.inspectedRoundIndex !== null && this._slotEntries[this.inspectedRoundIndex]) {
      const slot = this._slotEntries[this.inspectedRoundIndex];
      const baseZ = WALL_Z + 3.45 + this._zoomOffset * 0.35;
      const offsetCenterX = slot.slotX - 0.36;
      targetPos.set(
        offsetCenterX + this._orbitYaw * 0.28,
        slot.shelfY + 0.14 + this._orbitPitch * 0.25,
        Math.min(-26.5, baseZ)
      );
      targetLook.set(offsetCenterX, slot.shelfY + 0.08, SHELF_Z);
      desiredFov = 46;
    } else {
      let baseY = 3.05;
      let baseZ = WALL_Z + 17.0;
      let lookY = 2.95;

      if (this.wallShelfPreset === 'top') {
        baseY = SHELF_Y[0] + 0.14;
        baseZ = WALL_Z + 9.2;
        lookY = SHELF_Y[0] + 0.06;
      } else if (this.wallShelfPreset === 'mid') {
        baseY = SHELF_Y[1] + 0.14;
        baseZ = WALL_Z + 9.2;
        lookY = SHELF_Y[1] + 0.06;
      } else if (this.wallShelfPreset === 'bot') {
        baseY = SHELF_Y[2] + 0.22;
        baseZ = WALL_Z + 9.2;
        lookY = SHELF_Y[2] + 0.06;
      }

      targetPos.set(
        this._orbitYaw * 1.15,
        Math.max(1.05, Math.min(5.6, baseY - this._orbitPitch * 0.7)),
        Math.max(WALL_Z + 6.8, Math.min(-13.8, baseZ + this._zoomOffset))
      );
      targetLook.set(this._orbitYaw * 0.85, lookY, SHELF_Z);
      desiredFov = 48;
    }

    if (Math.abs(camera.fov - desiredFov) > 0.05) {
      camera.fov += (desiredFov - camera.fov) * Math.min(1, dt * 6);
      camera.updateProjectionMatrix();
    }

    const alpha = Math.min(1, dt * 5.8);
    this._camPos.lerp(targetPos, alpha);
    this._camLook.lerp(targetLook, alpha);

    camera.position.copy(this._camPos);
    camera.lookAt(this._camLook);
  }

  dispose() {
    this._clearDynamicGroup(this._corridorDynamicGroup);
    this._clearDynamicGroup(this._wallDynamicGroup);
    this._disposeDynamicResources();
  }
}
