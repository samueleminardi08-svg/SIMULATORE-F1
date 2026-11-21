/**
 * Gestore Showroom Garage 3D & Menu Principale (stile "Crazy Grand Prix"):
 * - Top bar: Budget ($), FREE CASH!, stats gare/vittorie e profilo pilota
 * - Barra inferiore a 4 bottoni: RACE, CUSTOMIZE (TEAM / DRIVER / PROFILE), VEHICLE (PAINT / UPGRADES / LIVERIES), SETTINGS
 * - Sincronizzazione in tempo reale con GarageScene3D (vernice RGB, smoothness, metallic, livrea e camera orbitale)
 */

import { getDifficultyConfig } from '../config/difficulty.js';
import {
  CAREER_RACE_LAPS,
  F1_2026_DRIVERS,
  F1_2026_TEAMS,
  RACE_TOTAL_LAPS,
} from '../config/f1_2026_data.js';
import { CALENDAR_2026_TRACKS, getTrackById } from '../tracks/calendar2026/index.js';
import { ModalManager } from './ModalManager.js';
import {
  generateTeamEmblemSvg,
  generateTrackOutlineSvg,
  getTrackCornersCount,
  renderKeyHints,
  setThemeTeamTint,
} from './UiTheme.js';
import {
  UPGRADE_CATEGORIES,
  UPGRADE_MAX_LEVEL,
  buildCarSpecsFromUpgrades,
} from '../cars/CarSpecs.js';
import {
  exportCareerJson,
  getRepresentativeDriverForTeam,
  getUpgradeCost,
  importCareerJson,
  loadCareerState,
  purchaseCareerUpgrade,
  resetCareerState,
  updateCareerPaint,
  updateCareerProfile,
} from '../career/CareerStorage.js';
import { getTheoreticalBestLap, getTrackRecord } from '../career/TrackRecordsStorage.js';
import { formatLapTime, formatSectorTime } from '../race/TimingSystem.js';

const UPGRADE_WINDOW_ORDER = ['engine', 'aero', 'tires', 'brakes', 'suspension'];
const TEAM_IDS = Object.keys(F1_2026_TEAMS);

const UPGRADE_UI_META = {
  engine: {
    accent: '#ef4444',
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h2l2-3h7l2 3h3v6h-3l-2 2H8l-2-2H4v-6Z"/><path d="M9 7V4h6v3"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M12 11v4"/></svg>`,
    statSummary: (lvl) => {
      const accel = ((13 * lvl) / UPGRADE_MAX_LEVEL).toFixed(1);
      const top = ((4.5 * lvl) / UPGRADE_MAX_LEVEL).toFixed(1);
      if (lvl >= UPGRADE_MAX_LEVEL) return `Attuale: <strong>+${accel}% Accel · +${top}% Top Speed</strong>`;
      const nAccel = ((13 * (lvl + 1)) / UPGRADE_MAX_LEVEL).toFixed(1);
      const nTop = ((4.5 * (lvl + 1)) / UPGRADE_MAX_LEVEL).toFixed(1);
      return `Accel +${accel}% → <strong>+${nAccel}%</strong> · Top +${top}% → <strong>+${nTop}%</strong>`;
    },
  },
  aero: {
    accent: '#38bdf8',
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h13a4 4 0 0 0 0-8"/><path d="M3 13h16a3 3 0 1 1 0 6"/><path d="M3 18h9"/></svg>`,
    statSummary: (lvl) => {
      const df = ((20 * lvl) / UPGRADE_MAX_LEVEL).toFixed(0);
      if (lvl >= UPGRADE_MAX_LEVEL) return `Attuale: <strong>+${df}% Carico Deportante (Downforce)</strong>`;
      const nDf = ((20 * (lvl + 1)) / UPGRADE_MAX_LEVEL).toFixed(0);
      return `Downforce +${df}% → <strong>+${nDf}%</strong> in curva`;
    },
  },
  tires: {
    accent: '#22c55e',
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/></svg>`,
    statSummary: (lvl) => {
      const grip = ((10 * lvl) / UPGRADE_MAX_LEVEL).toFixed(0);
      const wear = ((25 * lvl) / UPGRADE_MAX_LEVEL).toFixed(0);
      if (lvl >= UPGRADE_MAX_LEVEL) return `Attuale: <strong>+${grip}% Grip · -${wear}% Usura Gomme</strong>`;
      const nGrip = ((10 * (lvl + 1)) / UPGRADE_MAX_LEVEL).toFixed(0);
      const nWear = ((25 * (lvl + 1)) / UPGRADE_MAX_LEVEL).toFixed(0);
      return `Grip +${grip}% → <strong>+${nGrip}%</strong> · Usura -${wear}% → <strong>-${nWear}%</strong>`;
    },
  },
  brakes: {
    accent: '#f59e0b',
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M19.5 7.5A9.5 9.5 0 0 1 21 12a9.5 9.5 0 0 1-1.5 4.5"/></svg>`,
    statSummary: (lvl) => {
      const brk = ((14 * lvl) / UPGRADE_MAX_LEVEL).toFixed(1);
      if (lvl >= UPGRADE_MAX_LEVEL) return `Attuale: <strong>+${brk}% Potenza Frenante &amp; Anti-Lock</strong>`;
      const nBrk = ((14 * (lvl + 1)) / UPGRADE_MAX_LEVEL).toFixed(1);
      return `Frenata +${brk}% → <strong>+${nBrk}%</strong> · Minor bloccaggio`;
    },
  },
  suspension: {
    accent: '#a855f7',
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v3"/><path d="M8 5h8"/><path d="M9 7l6 2.5L9 12l6 2.5L9 17"/><path d="M8 19h8"/><path d="M12 19v3"/></svg>`,
    statSummary: (lvl) => {
      const stab = ((22 * lvl) / UPGRADE_MAX_LEVEL).toFixed(1);
      if (lvl >= UPGRADE_MAX_LEVEL) return `Attuale: <strong>+${stab}% Stabilità Cordoli &amp; Frenata</strong>`;
      const nStab = ((22 * (lvl + 1)) / UPGRADE_MAX_LEVEL).toFixed(1);
      return `Stabilità +${stab}% → <strong>+${nStab}%</strong> su cordoli`;
    },
  },
};

function formatDollarCash(amount) {
  const num = Math.max(0, Math.round(Number(amount) || 0));
  return `$${String(num).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function hexToRgb(hex) {
  const clean = String(hex || '#dc0000').replace('#', '');
  if (clean.length !== 6) return { r: 220, g: 0, b: 0 };
  return {
    r: parseInt(clean.slice(0, 2), 16) || 0,
    g: parseInt(clean.slice(2, 4), 16) || 0,
    b: parseInt(clean.slice(4, 6), 16) || 0,
  };
}

export class MenuManager {
  constructor({
    onStartSession,
    onResume,
    careerState = null,
    onCareerChange = null,
    onShowroomUpdate = null,
    onToggleCameraRotate = null,
    onResetGarageOrbit = null,
    onOrbitRotate = null,
    onOrbitZoom = null,
    onWeatherChange = null,
    onTrackChange = null,
    roomManager = null,
    modalManager = null,
    onStartMultiplayerSession = null,
    onOpenHudMenu = null,
    onSettingsClose = null,
  }) {
    this.onStartSession = onStartSession;
    this.onResume = onResume;
    this.onCareerChange = onCareerChange;
    this.onShowroomUpdate = onShowroomUpdate;
    this.onToggleCameraRotate = onToggleCameraRotate;
    this.onResetGarageOrbit = onResetGarageOrbit;
    this.onOrbitRotate = onOrbitRotate;
    this.onOrbitZoom = onOrbitZoom;
    this.onWeatherChange = onWeatherChange;
    this.onTrackChange = onTrackChange;
    this.roomManager = roomManager;
    this.modalManager = modalManager || new ModalManager();
    this.onStartMultiplayerSession = onStartMultiplayerSession;
    this.onOpenHudMenu = onOpenHudMenu;
    this.onSettingsClose = onSettingsClose;

    this.careerState = careerState || loadCareerState();
    this.isOpen = true;
    this.hasActiveSession = false;
    this.activeTab = 'home'; // 'home' | 'team' | 'track' | 'vehicle' | 'multiplayer' | 'settings'
    this.profileModalOpen = false;
    this.quickMode = 'qualifying'; // Modalità selezionata nella card Sessione Rapida ('qualifying' | 'practice' | 'race')
    this.mpFormat = 'qualifying';
    this.mpRaceLaps = RACE_TOTAL_LAPS;
    this.isCameraRotating = false;
    this._lastCarouselTab = null;
    this._lastCarouselTeamId = null;
    this._lastCarouselTrackId = null;
    this._lastHomeTeamId = '';
    this._lastHomeTrackId = '';
    this._lastTeamHeroId = '';
    this._lastGarageTeamId = '';
    this._lastTrackDetailId = '';
    this._homeQuickFocusIdx = -1;

    this.modalEl = document.getElementById('session-menu-modal');

    // Header Bar & Player Badge
    this.careerMoneyBadgeEl = document.getElementById('career-money-badge');
    this.racesValEl = document.getElementById('gp-races-val');
    this.winsValEl = document.getElementById('gp-wins-val');
    this.profileTriggerBtn = document.getElementById('gp-profile-trigger');
    this.profileNameEl = document.getElementById('gp-profile-name');
    this.profileSubEl = document.getElementById('gp-profile-sub');

    // Top Navigation Tabs & Resume
    this.navButtons = [...document.querySelectorAll('[data-gp-tab]')];
    this.resumeBtn = document.getElementById('menu-resume-btn');
    this.openMenuHudBtn = document.getElementById('hud-open-menu-btn');

    // Screen Containers (Step 2)
    this.homeScreenEl = document.getElementById('f1-screen-home');
    this.teamScreenEl = document.getElementById('f1-screen-team');
    this.trackScreenEl = document.getElementById('f1-screen-track');

    // Screen 1: HOME
    this.homeTeamEmblemEl = document.getElementById('home-team-emblem');
    this.homeCareerTeamNameEl = document.getElementById('home-career-team-name');
    this.homeCareerDriverNameEl = document.getElementById('home-career-driver-name');
    this.homeChangeTeamBtn = document.getElementById('home-change-team-btn');
    this.homeNextTrackSvgEl = document.getElementById('home-next-track-svg');
    this.homeNextGpTitleEl = document.getElementById('home-next-gp-title');
    this.homeNextTrackMetaEl = document.getElementById('home-next-track-meta');
    this.homeNextTrackRecordsEl = document.getElementById('home-next-track-records');
    this.homeStartCareerBtn = document.getElementById('home-start-career-btn');
    this.homeGoTrackBtn = document.getElementById('home-go-track-btn');
    this.quickTabBtns = [...document.querySelectorAll('[data-quick-tab]')];
    this.quickTeamValEl = document.getElementById('quick-team-val');
    this.quickTrackValEl = document.getElementById('quick-track-val');
    this.quickMpValEl = document.getElementById('quick-mp-val');
    this.quickGarageValEl = document.getElementById('quick-garage-val');

    // Screen 2: TEAM SELECT
    this.teamOrbitZoneEl = document.getElementById('f1-team-orbit-zone');
    this.teamHeroEmblemEl = document.getElementById('team-hero-emblem');
    this.teamHeroNameEl = document.getElementById('team-hero-name');
    this.teamHeroPaceEl = document.getElementById('team-hero-pace');
    this.teamDriversListEl = document.getElementById('team-drivers-list');
    this.teamGotoGarageBtn = document.getElementById('team-goto-garage-btn');
    this.teamOpenProfileBtn = document.getElementById('team-open-profile-btn');
    this.teamResetCamBtn = document.getElementById('team-reset-cam-btn');
    this.teamCarouselEl = document.getElementById('f1-team-carousel');
    this.teamCarouselPrevBtn = document.getElementById('team-carousel-prev');
    this.teamCarouselNextBtn = document.getElementById('team-carousel-next');

    // Screen 3: TRACK SELECT
    this.trackHeroNameEl = document.getElementById('track-hero-name');
    this.trackHeroSubEl = document.getElementById('track-hero-sub');
    this.trackDetailSvgEl = document.getElementById('track-detail-svg');
    this.trackStatLengthEl = document.getElementById('track-stat-length');
    this.trackStatCornersEl = document.getElementById('track-stat-corners');
    this.trackStatWidthEl = document.getElementById('track-stat-width');
    this.trackStatLapsEl = document.getElementById('track-stat-laps');
    this.trackLapsDecBtn = document.getElementById('track-laps-dec-btn');
    this.trackLapsIncBtn = document.getElementById('track-laps-inc-btn');
    this.trackScreenStartBtn = document.getElementById('track-screen-start-btn');
    this.trackRecIdealEl = document.getElementById('track-rec-ideal');
    this.trackRecQualiTimeEl = document.getElementById('track-rec-quali-time');
    this.trackRecQualiMetaEl = document.getElementById('track-rec-quali-meta');
    this.trackRecRaceTimeEl = document.getElementById('track-rec-race-time');
    this.trackRecRaceMetaEl = document.getElementById('track-rec-race-meta');
    this.trackRecSectorTimeEls = [
      document.getElementById('track-rec-s1-time'),
      document.getElementById('track-rec-s2-time'),
      document.getElementById('track-rec-s3-time'),
    ];
    this.trackRecSectorMetaEls = [
      document.getElementById('track-rec-s1-meta'),
      document.getElementById('track-rec-s2-meta'),
      document.getElementById('track-rec-s3-meta'),
    ];
    this.trackCarouselEl = document.getElementById('f1-track-carousel');
    this.trackCarouselPrevBtn = document.getElementById('track-carousel-prev');
    this.trackCarouselNextBtn = document.getElementById('track-carousel-next');

    // Overlays & Popups
    this.vehicleOverlayEl = document.getElementById('gp-vehicle-overlay');
    this.customizeSubcardEl = document.getElementById('gp-customize-subcard');
    this.profileCloseBtn = document.getElementById('gp-profile-close-btn');
    this.settingsPopupEl = document.getElementById('gp-settings-popup');
    this.settingsCloseBtn = document.getElementById('gp-settings-close-btn');
    this.mpPopupEl = document.getElementById('gp-multiplayer-popup');
    this.mpCloseBtn = document.getElementById('gp-mp-close-btn');

    // Multiplayer Lobby controls (Step 10)
    this.mpStatusBadgeEl = document.getElementById('mp-status-badge');
    this.mpRoomCodeBoxEl = document.getElementById('mp-room-code-box');
    this.mpRoomCodeValEl = document.getElementById('mp-room-code-val');
    this.mpCopyCodeBtn = document.getElementById('mp-copy-code-btn');
    this.mpConnectControlsEl = document.getElementById('mp-connect-controls');
    this.mpCreateRoomBtn = document.getElementById('mp-create-room-btn');
    this.mpJoinInputEl = document.getElementById('mp-join-code-input');
    this.mpJoinRoomBtn = document.getElementById('mp-join-room-btn');
    this.mpRosterSectionEl = document.getElementById('mp-roster-section');
    this.mpPlayersListEl = document.getElementById('mp-players-list');
    this.mpHostControlsEl = document.getElementById('mp-host-controls');
    this.mpFormatButtons = [...document.querySelectorAll('[data-mp-format]')];
    this.mpRaceLapsButtons = [...document.querySelectorAll('[data-mp-racelaps]')];
    this.mpRaceLapsInput = document.getElementById('mp-race-laps-input');
    this.mpStartSessionBtn = document.getElementById('mp-start-session-btn');
    this.mpLeaveRoomBtn = document.getElementById('mp-leave-room-btn');

    // Garage & R&D Upgrades (auto in primo piano + 5 potenziamenti completi)
    this.garageOrbitZoneEl = document.getElementById('f1-garage-orbit-zone');
    this.garageTeamEmblemEl = document.getElementById('garage-team-emblem');
    this.garageTeamNameEl = document.getElementById('garage-team-name');
    this.garageSpecBadgeEl = document.getElementById('garage-spec-badge');
    this.garageBudgetPillEl = document.getElementById('garage-budget-pill');
    this.garageTotalLvlPillEl = document.getElementById('garage-total-lvl-pill');
    this.garageOverallBarFillEl = document.getElementById('garage-overall-bar-fill');
    this.garageResetCamBtn = document.getElementById('garage-reset-cam-btn');
    this.rotateCamBtn = document.getElementById('gp-rotate-cam-btn');
    this.careerUpgradesGridEl = document.getElementById('career-upgrades-grid');
    this.careerFeedbackEl = document.getElementById('career-feedback-msg');
    this.gtelEls = {
      speedVal: document.getElementById('gtel-val-speed'),
      speedBar: document.getElementById('gtel-bar-speed'),
      accelVal: document.getElementById('gtel-val-accel'),
      accelBar: document.getElementById('gtel-bar-accel'),
      aeroVal: document.getElementById('gtel-val-aero'),
      aeroBar: document.getElementById('gtel-bar-aero'),
      brakesVal: document.getElementById('gtel-val-brakes'),
      brakesBar: document.getElementById('gtel-bar-brakes'),
      gripVal: document.getElementById('gtel-val-grip'),
      gripBar: document.getElementById('gtel-bar-grip'),
    };

    // Profile, Team, Driver & Race/Settings controls
    this.careerStatsSummaryEl = document.getElementById('career-stats-summary');
    this.careerNameInputEl = document.getElementById('career-player-name');
    this.careerTeamSelectEl = document.getElementById('career-team-select');
    this.careerExportBtn = document.getElementById('career-export-btn');
    this.careerImportBtn = document.getElementById('career-import-btn');
    this.careerImportInputEl = document.getElementById('career-import-input');
    this.careerResetBtn = document.getElementById('career-reset-btn');

    this.modeButtons = [...document.querySelectorAll('[data-menu-mode]')];
    this.raceLapsSectionEl = document.getElementById('menu-race-laps-section');
    this.raceLapsButtons = [...document.querySelectorAll('[data-menu-racelaps]')];
    this.raceLapsInput = document.getElementById('menu-race-laps-input');
    this.careerFormatWrapEl = document.getElementById('gp-career-format-wrap');
    this.careerFormatButtons = [...document.querySelectorAll('[data-career-format]')];
    this.practiceOptionsSection = document.getElementById('menu-practice-options');
    this.botsButtons = [...document.querySelectorAll('[data-menu-bots]')];
    this.lapTypeButtons = [...document.querySelectorAll('[data-menu-laptype]')];
    this.finiteLapsWrap = document.getElementById('menu-finite-laps-wrap');
    this.finiteLapsInput = document.getElementById('menu-finite-laps-input');
    this.carLevelButtons = [...document.querySelectorAll('[data-menu-carlevel]')];
    this.difficultyButtons = [...document.querySelectorAll('[data-menu-difficulty]')];
    this.difficultyDescEl = document.getElementById('menu-difficulty-desc');
    this.weatherButtons = [...document.querySelectorAll('[data-menu-weather]')];
    this.driverSelectEl = document.getElementById('menu-driver-select');
    this.trackSelectEl = document.getElementById('menu-track-select');
    this.mpTrackSelectEl = document.getElementById('mp-track-select');
    this.startBtn = document.getElementById('menu-start-btn');

    this.state = {
      mode: 'career',
      difficultyId: 'intermediate',
      withBots: false,
      lapType: 'infinite',
      finiteLaps: 5,
      raceLaps: RACE_TOTAL_LAPS,
      carLevel: 'base',
      weather: 'dry',
      playerDriverId: 'leclerc',
      trackId: getTrackById(this.careerState.selectedTrackId).id,
    };

    this._populateDrivers();
    this._populateCareerTeams();
    this._populateTracks();
    this._populateCarousels();
    this._registerModals();
    this._bindEvents();
    this._syncUI();
  }

  _registerModals() {
    this.modalManager.register('gp-customize-subcard', {
      element: this.customizeSubcardEl,
      onClose: () => {
        if (this.profileModalOpen) {
          this.profileModalOpen = false;
          this._syncUI();
        }
      },
    });

    this.modalManager.register('gp-settings-popup', {
      element: this.settingsPopupEl,
      onClose: () => {
        if (this.activeTab === 'settings') {
          this.setActiveTab('home');
        }
        if (this.onSettingsClose) {
          this.onSettingsClose();
        }
      },
    });

    this.modalManager.register('gp-multiplayer-popup', {
      element: this.mpPopupEl,
      onClose: () => {
        if (this.activeTab === 'multiplayer') {
          this.setActiveTab('home');
        }
      },
    });
  }

  _populateTracks() {
    const optionsHtml = CALENDAR_2026_TRACKS.map(
      (t) => `<option value="${t.id}">R${t.round} • ${t.name} (${t.country})</option>`
    ).join('');
    if (this.trackSelectEl) {
      this.trackSelectEl.innerHTML = optionsHtml;
      this.trackSelectEl.value = this.state.trackId;
    }
    if (this.mpTrackSelectEl) {
      this.mpTrackSelectEl.innerHTML = optionsHtml;
      this.mpTrackSelectEl.value = this.state.trackId;
    }
  }

  _handleTrackSelection(rawTrackId) {
    const resolved = getTrackById(rawTrackId);
    this.state.trackId = resolved.id;
    const next = updateCareerProfile(this.careerState, { selectedTrackId: resolved.id });
    this._commitCareerState(next);
    if (this.onTrackChange) {
      this.onTrackChange(resolved.id);
    }
  }

  _populateDrivers() {
    if (!this.driverSelectEl) return;
    this.driverSelectEl.innerHTML = F1_2026_DRIVERS.map((d) => {
      const team = F1_2026_TEAMS[d.teamId];
      return `<option value="${d.id}">#${d.number} ${d.name} (${team?.name ?? d.teamId})</option>`;
    }).join('');
    this.driverSelectEl.value = this.state.playerDriverId;
  }

  _populateCareerTeams() {
    if (!this.careerTeamSelectEl) return;
    this.careerTeamSelectEl.innerHTML = Object.values(F1_2026_TEAMS)
      .map((team) => `<option value="${team.id}">${team.name}</option>`)
      .join('');
    this.careerTeamSelectEl.value = this.careerState.teamId;
  }

  _populateCarousels() {
    if (this.teamCarouselEl) {
      this.teamCarouselEl.innerHTML = Object.values(F1_2026_TEAMS)
        .map((team) => {
          const teamDrivers = F1_2026_DRIVERS.filter((d) => d.teamId === team.id)
            .map((d) => d.code)
            .join(' • ');
          const pacePct = Math.round((team.pace ?? 0.96) * 100);
          return `
            <button type="button" class="f1-carousel-card f1-team-card" data-team-card="${team.id}">
              <span class="f1-team-card-bar" style="background: linear-gradient(90deg, ${team.primaryColor} 65%, ${team.secondaryColor} 100%);"></span>
              <span class="f1-team-card-emblem">${generateTeamEmblemSvg(team)}</span>
              <div style="width: 100%;">
                <div class="f1-card-title">${team.name}</div>
                <div class="f1-card-sub">${teamDrivers || '2026'} • ${pacePct}%</div>
              </div>
            </button>
          `;
        })
        .join('');
    }

    if (this.trackCarouselEl) {
      this.trackCarouselEl.innerHTML = CALENDAR_2026_TRACKS.map((track) => {
        const outlineSvg = generateTrackOutlineSvg(track.controlPoints, {
          width: 170,
          height: 54,
          padding: 5,
          strokeColor: 'currentColor',
          strokeWidth: 4.0,
          showStartDot: true,
        });
        const kmStr = (track.officialLength / 1000).toFixed(2);
        return `
          <button type="button" class="f1-carousel-card f1-track-card" data-track-card="${track.id}">
            <div class="f1-track-card-top">
              <span class="f1-card-title">${track.country || track.city || track.name}</span>
              <span class="f1-card-sub">R${String(track.round).padStart(2, '0')} • ${kmStr} KM</span>
            </div>
            <div class="f1-track-card-svg">${outlineSvg}</div>
          </button>
        `;
      }).join('');
    }
  }

  _setCareerFeedback(msg, isError = false) {
    if (!this.careerFeedbackEl) return;
    this.careerFeedbackEl.textContent = msg;
    this.careerFeedbackEl.style.color = isError ? '#fca5a5' : '#86efac';
  }

  getShowcaseAppearance() {
    const team = F1_2026_TEAMS[this.careerState.teamId] || F1_2026_TEAMS.ferrari;
    return {
      primaryColor: team.primaryColor,
      secondaryColor: team.secondaryColor,
      wingColor: team.wingColor,
      helmetColor: '#18181b',
      roughness: 0.22,
      metalness: 0.35,
    };
  }

  getShowcaseViewMode() {
    if (this.activeTab === 'vehicle') return 'vehicle';
    if (this.activeTab === 'team') return 'team';
    if (this.activeTab === 'track') return 'track';
    return 'home';
  }

  setActiveTab(tab = 'home') {
    const allowed = new Set(['home', 'team', 'track', 'vehicle', 'multiplayer', 'settings']);
    const nextTab = allowed.has(tab) ? tab : 'home';
    if (this.activeTab !== nextTab) {
      this.isCameraRotating = false;
      this.rotateCamBtn?.classList.remove('is-active');
    }
    this.activeTab = nextTab;
    this.profileModalOpen = false;
    this._setHomeQuickFocus(-1);
    this._syncUI();
  }

  _setHomeQuickFocus(nextIdx) {
    if (!Array.isArray(this.quickTabBtns) || this.quickTabBtns.length === 0) {
      this._homeQuickFocusIdx = -1;
      return;
    }
    const len = this.quickTabBtns.length;
    const resolved = nextIdx < 0 ? -1 : ((nextIdx % len) + len) % len;
    this._homeQuickFocusIdx = resolved;
    this.quickTabBtns.forEach((btn, idx) => {
      btn.classList.toggle('is-selected', idx === resolved);
    });
    if (resolved >= 0) {
      this.quickTabBtns[resolved]?.focus({ preventScroll: true });
    }
  }

  handleEscapeKey() {
    if (this.modalManager.handleEscape()) {
      return;
    }
    if (!this.isOpen) {
      if (this.hasActiveSession) {
        this.open();
      }
      return;
    }
    if (this.profileModalOpen) {
      this.profileModalOpen = false;
      this._syncUI();
      return;
    }
    if (this.activeTab !== 'home') {
      this.setActiveTab('home');
      return;
    }
    if (this.hasActiveSession) {
      this.toggle();
    }
  }

  _notifyShowroom() {
    if (this.onShowroomUpdate) {
      this.onShowroomUpdate(
        this.isOpen,
        this.getShowcaseAppearance(),
        this.getShowcaseViewMode()
      );
    }
  }

  setCareerState(nextState) {
    this.careerState = nextState;
    if (nextState?.selectedTrackId) {
      this.state.trackId = getTrackById(nextState.selectedTrackId).id;
    }
    this._syncUI();
  }

  _commitCareerState(nextState) {
    this.careerState = nextState;
    if (nextState?.selectedTrackId) {
      this.state.trackId = getTrackById(nextState.selectedTrackId).id;
    }
    if (this.onCareerChange) {
      this.onCareerChange(nextState);
    }
    this._syncUI();
  }

  _selectTeamById(rawTeamId, feedbackMsg = null) {
    const team = F1_2026_TEAMS[rawTeamId] || F1_2026_TEAMS.ferrari;
    const teamRgb = hexToRgb(team.primaryColor);
    const repDriver = getRepresentativeDriverForTeam(team.id);
    if (repDriver?.id) {
      this.state.playerDriverId = repDriver.id;
    }

    let next = updateCareerProfile(this.careerState, { teamId: team.id });
    next = updateCareerPaint(next, {
      r: teamRgb.r,
      g: teamRgb.g,
      b: teamRgb.b,
      useCustomPaint: false,
    });
    this._commitCareerState(next);
    if (feedbackMsg) {
      this._setCareerFeedback(feedbackMsg);
    }
  }

  _cycleTeam(delta) {
    if (
      typeof document !== 'undefined' &&
      document.activeElement &&
      this.teamCarouselEl?.contains(document.activeElement) &&
      typeof document.activeElement.blur === 'function'
    ) {
      document.activeElement.blur();
    }
    const idx = Math.max(0, TEAM_IDS.indexOf(this.careerState.teamId));
    const nextIdx = (idx + delta + TEAM_IDS.length) % TEAM_IDS.length;
    const nextTeam = F1_2026_TEAMS[TEAM_IDS[nextIdx]];
    this._selectTeamById(nextTeam.id, `Livrea: ${nextTeam.name}`);
  }

  _cycleTrack(delta) {
    if (
      typeof document !== 'undefined' &&
      document.activeElement &&
      this.trackCarouselEl?.contains(document.activeElement) &&
      typeof document.activeElement.blur === 'function'
    ) {
      document.activeElement.blur();
    }
    const idx = Math.max(
      0,
      CALENDAR_2026_TRACKS.findIndex((t) => t.id === this.state.trackId)
    );
    const nextIdx = (idx + delta + CALENDAR_2026_TRACKS.length) % CALENDAR_2026_TRACKS.length;
    this._handleTrackSelection(CALENDAR_2026_TRACKS[nextIdx].id);
  }

  _launchSession(forcedMode = null) {
    if (forcedMode) {
      this.state.mode = forcedMode;
    }
    if (this.careerNameInputEl) {
      const typed = this.careerNameInputEl.value.trim();
      if (typed && typed !== this.careerState.playerName) {
        this.careerState = updateCareerProfile(this.careerState, { playerName: typed });
      }
    }
    this.hasActiveSession = true;
    this.profileModalOpen = false;
    this.activeTab = 'home';
    this.close();
    this.onStartSession(this.buildSessionConfig());
  }

  _bindEvents() {
    // Header Navigation Tabs
    this.navButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setActiveTab(btn.dataset.gpTab);
      });
    });

    // Home Quick Action Cards & Shortcut Buttons
    this.quickTabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setActiveTab(btn.dataset.quickTab);
      });
    });
    if (this.homeChangeTeamBtn) {
      this.homeChangeTeamBtn.addEventListener('click', () => this.setActiveTab('team'));
    }
    if (this.homeGoTrackBtn) {
      this.homeGoTrackBtn.addEventListener('click', () => this.setActiveTab('track'));
    }
    if (this.teamGotoGarageBtn) {
      this.teamGotoGarageBtn.addEventListener('click', () => this.setActiveTab('vehicle'));
    }

    // Profile Modal Triggers (chiusura delegata al ModalManager unificato)
    const openProfileModal = () => {
      this.profileModalOpen = !this.profileModalOpen;
      this._syncUI();
    };
    if (this.profileTriggerBtn) {
      this.profileTriggerBtn.addEventListener('click', openProfileModal);
    }
    if (this.teamOpenProfileBtn) {
      this.teamOpenProfileBtn.addEventListener('click', () => {
        this.profileModalOpen = true;
        this._syncUI();
      });
    }

    // Interactive 360° Orbit Drag & Wheel Zoom (Team Select & Garage Showroom)
    const bindOrbitZone = (zoneEl, targetTab) => {
      if (!zoneEl) return;
      let isDragging = false;
      let lastX = 0;
      let lastY = 0;

      zoneEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        zoneEl.classList.add('is-dragging');
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging || !this.isOpen || this.activeTab !== targetTab) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        if (this.onOrbitRotate) {
          this.onOrbitRotate(dx * 0.0085, dy * 0.006);
        }
      });

      const stopDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        zoneEl.classList.remove('is-dragging');
      };
      window.addEventListener('mouseup', stopDrag);
      window.addEventListener('blur', stopDrag);

      zoneEl.addEventListener(
        'wheel',
        (e) => {
          if (!this.isOpen || this.activeTab !== targetTab) return;
          e.preventDefault();
          if (this.onOrbitZoom) {
            this.onOrbitZoom(Math.sign(e.deltaY) * 0.42);
          }
        },
        { passive: false }
      );
    };

    bindOrbitZone(this.teamOrbitZoneEl, 'team');
    bindOrbitZone(this.garageOrbitZoneEl, 'vehicle');

    if (this.teamResetCamBtn) {
      this.teamResetCamBtn.addEventListener('click', () => {
        this.isCameraRotating = false;
        this.rotateCamBtn?.classList.remove('is-active');
        if (this.onResetGarageOrbit) {
          this.onResetGarageOrbit();
        }
      });
    }

    if (this.garageResetCamBtn) {
      this.garageResetCamBtn.addEventListener('click', () => {
        this.isCameraRotating = false;
        this.rotateCamBtn?.classList.remove('is-active');
        if (this.onResetGarageOrbit) {
          this.onResetGarageOrbit();
        }
      });
    }

    // Team & Track Carousels
    if (this.teamCarouselEl) {
      this.teamCarouselEl.addEventListener('click', (event) => {
        const card = event.target.closest('[data-team-card]');
        if (!card) return;
        this._selectTeamById(card.dataset.teamCard);
      });
    }
    if (this.teamCarouselPrevBtn) {
      this.teamCarouselPrevBtn.addEventListener('click', () => this._cycleTeam(-1));
    }
    if (this.teamCarouselNextBtn) {
      this.teamCarouselNextBtn.addEventListener('click', () => this._cycleTeam(1));
    }

    if (this.teamDriversListEl) {
      this.teamDriversListEl.addEventListener('click', (event) => {
        const pill = event.target.closest('[data-driver-id]');
        if (!pill) return;
        this.state.playerDriverId = pill.dataset.driverId;
        this._syncUI();
      });
    }

    if (this.trackCarouselEl) {
      this.trackCarouselEl.addEventListener('click', (event) => {
        const card = event.target.closest('[data-track-card]');
        if (!card) return;
        this._handleTrackSelection(card.dataset.trackCard);
      });
    }
    if (this.trackCarouselPrevBtn) {
      this.trackCarouselPrevBtn.addEventListener('click', () => this._cycleTrack(-1));
    }
    if (this.trackCarouselNextBtn) {
      this.trackCarouselNextBtn.addEventListener('click', () => this._cycleTrack(1));
    }

    // Menu Keyboard Navigation (← / → su Home, Team & Track; ↑ / ↓ meteo Track; Enter conferma/avvia)
    window.addEventListener('keydown', (event) => {
      if (!this.isOpen || this.profileModalOpen || this.modalManager.hasOpenModal()) return;
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (event.code === 'ArrowLeft') {
        if (this.activeTab === 'team') {
          event.preventDefault();
          this._cycleTeam(-1);
        } else if (this.activeTab === 'track') {
          event.preventDefault();
          this._cycleTrack(-1);
        } else if (this.activeTab === 'home') {
          event.preventDefault();
          const startIdx = this._homeQuickFocusIdx < 0 ? this.quickTabBtns.length - 1 : this._homeQuickFocusIdx - 1;
          this._setHomeQuickFocus(startIdx);
        }
      } else if (event.code === 'ArrowRight') {
        if (this.activeTab === 'team') {
          event.preventDefault();
          this._cycleTeam(1);
        } else if (this.activeTab === 'track') {
          event.preventDefault();
          this._cycleTrack(1);
        } else if (this.activeTab === 'home') {
          event.preventDefault();
          const startIdx = this._homeQuickFocusIdx < 0 ? 0 : this._homeQuickFocusIdx + 1;
          this._setHomeQuickFocus(startIdx);
        }
      } else if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
        if (this.activeTab === 'track') {
          event.preventDefault();
          this.state.weather = this.state.weather === 'dry' ? 'rain' : 'dry';
          if (this.onWeatherChange) {
            this.onWeatherChange(this.state.weather);
          }
          this._syncUI();
        } else if (this.activeTab === 'home' && event.code === 'ArrowUp' && this._homeQuickFocusIdx >= 0) {
          event.preventDefault();
          this._setHomeQuickFocus(-1);
          if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
          }
        }
      } else if (event.code === 'Enter' && tag !== 'BUTTON') {
        if (this.activeTab === 'team') {
          event.preventDefault();
          this.setActiveTab('home');
        } else if (this.activeTab === 'track') {
          event.preventDefault();
          this._launchSession(this.state.mode);
        } else if (this.activeTab === 'home') {
          event.preventDefault();
          if (this._homeQuickFocusIdx >= 0) {
            const tabTarget = this.quickTabBtns[this._homeQuickFocusIdx]?.dataset?.quickTab;
            if (tabTarget) {
              this.setActiveTab(tabTarget);
              return;
            }
          }
          this._launchSession('career');
        }
      }
    });

    // R&D Upgrades Purchase Click & Garage Auto-Rotate
    if (this.careerUpgradesGridEl) {
      this.careerUpgradesGridEl.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-upgrade-id]');
        if (!btn) return;
        const catId = btn.dataset.upgradeId;
        const res = purchaseCareerUpgrade(this.careerState, catId);
        if (res.ok) {
          this._commitCareerState(res.state);
          const catLabel = UPGRADE_CATEGORIES[catId]?.label ?? catId;
          this._setCareerFeedback(`${catLabel} potenziato al Lv. ${res.newLevel}/5!`);
        } else {
          this._setCareerFeedback(res.reason || 'Fondi insufficienti.', true);
        }
      });
    }

    if (this.rotateCamBtn) {
      this.rotateCamBtn.addEventListener('click', () => {
        if (this.onToggleCameraRotate) {
          this.isCameraRotating = this.onToggleCameraRotate();
          this.rotateCamBtn.classList.toggle('is-active', this.isCameraRotating);
        }
      });
    }

    // Profile & Team in CUSTOMIZE
    if (this.careerNameInputEl) {
      this.careerNameInputEl.addEventListener('input', () => {
        const val = this.careerNameInputEl.value;
        if (!val.trim()) return;
        const next = updateCareerProfile(this.careerState, { playerName: val });
        this._commitCareerState(next);
      });
    }

    if (this.careerTeamSelectEl) {
      this.careerTeamSelectEl.addEventListener('change', () => {
        this._selectTeamById(this.careerTeamSelectEl.value);
      });
    }

    if (this.careerExportBtn) {
      this.careerExportBtn.addEventListener('click', () => {
        const json = exportCareerJson(this.careerState);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `carriera_${this.careerState.playerCode.toLowerCase()}.json`;
        link.click();
        URL.revokeObjectURL(url);
        this._setCareerFeedback('Salvataggio esportato in JSON!');
      });
    }

    if (this.careerImportBtn && this.careerImportInputEl) {
      this.careerImportBtn.addEventListener('click', () => {
        this.careerImportInputEl.click();
      });
      this.careerImportInputEl.addEventListener('change', () => {
        const file = this.careerImportInputEl.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const imported = importCareerJson(String(reader.result || ''));
            this._commitCareerState(imported);
            this._setCareerFeedback(`Carriera di ${imported.playerName} caricata!`);
          } catch (err) {
            this._setCareerFeedback(err.message || 'Errore lettura JSON.', true);
          }
          this.careerImportInputEl.value = '';
        };
        reader.readAsText(file);
      });
    }

    if (this.careerResetBtn) {
      this.careerResetBtn.addEventListener('click', () => {
        const next = resetCareerState({
          playerName: this.careerNameInputEl?.value || 'Pilota F1',
          teamId: this.careerTeamSelectEl?.value || 'ferrari',
        });
        this._commitCareerState(next);
        this._setCareerFeedback('Nuova Carriera inizializzata ($200.000).');
      });
    }

    // Mode, Format, Race Laps, Difficulty, Weather & Practice Options
    this.modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.quickMode = btn.dataset.menuMode;
        this.state.mode = this.quickMode;
        this._syncUI();
      });
    });

    const setQuickRaceLaps = (rawVal) => {
      const parsed = Math.max(1, Math.min(99, Math.round(Number(rawVal) || RACE_TOTAL_LAPS)));
      this.state.raceLaps = parsed;
      this._syncUI();
    };

    this.raceLapsButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        setQuickRaceLaps(btn.dataset.menuRacelaps);
      });
    });

    if (this.raceLapsInput) {
      this.raceLapsInput.addEventListener('input', () => {
        const val = parseInt(this.raceLapsInput.value, 10);
        if (Number.isFinite(val) && val >= 1 && val <= 99) {
          this.state.raceLaps = val;
          this.raceLapsButtons.forEach((b) => {
            b.classList.toggle('is-selected', Number(b.dataset.menuRacelaps) === val);
          });
        }
      });
      this.raceLapsInput.addEventListener('blur', () => {
        setQuickRaceLaps(this.raceLapsInput.value);
      });
    }

    if (this.trackLapsDecBtn) {
      this.trackLapsDecBtn.addEventListener('click', () => {
        if (this.state.mode === 'career') return;
        if (this.state.mode === 'practice' && this.state.lapType === 'finite') {
          this.state.finiteLaps = Math.max(1, (this.state.finiteLaps || 5) - 1);
          if (this.finiteLapsInput) this.finiteLapsInput.value = String(this.state.finiteLaps);
          this._syncUI();
          return;
        }
        setQuickRaceLaps((this.state.raceLaps || RACE_TOTAL_LAPS) - 1);
      });
    }

    if (this.trackLapsIncBtn) {
      this.trackLapsIncBtn.addEventListener('click', () => {
        if (this.state.mode === 'career') return;
        if (this.state.mode === 'practice' && this.state.lapType === 'finite') {
          this.state.finiteLaps = Math.min(99, (this.state.finiteLaps || 5) + 1);
          if (this.finiteLapsInput) this.finiteLapsInput.value = String(this.state.finiteLaps);
          this._syncUI();
          return;
        }
        setQuickRaceLaps((this.state.raceLaps || RACE_TOTAL_LAPS) + 1);
      });
    }

    this.careerFormatButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = updateCareerProfile(this.careerState, {
          careerFormat: btn.dataset.careerFormat,
        });
        this._commitCareerState(next);
      });
    });

    this.difficultyButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.state.difficultyId = btn.dataset.menuDifficulty;
        this._syncUI();
      });
    });

    this.botsButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.state.withBots = btn.dataset.menuBots === 'true';
        this._syncUI();
      });
    });

    this.lapTypeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.state.lapType = btn.dataset.menuLaptype;
        this._syncUI();
      });
    });

    if (this.finiteLapsInput) {
      this.finiteLapsInput.addEventListener('input', () => {
        const val = parseInt(this.finiteLapsInput.value, 10);
        if (Number.isFinite(val) && val >= 1 && val <= 99) {
          this.state.finiteLaps = val;
        }
      });
    }

    this.carLevelButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.state.carLevel = btn.dataset.menuCarlevel;
        this._syncUI();
      });
    });

    this.weatherButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.state.weather = btn.dataset.menuWeather;
        if (this.onWeatherChange) {
          this.onWeatherChange(this.state.weather);
        }
        this._syncUI();
      });
    });

    if (this.driverSelectEl) {
      this.driverSelectEl.addEventListener('change', () => {
        this.state.playerDriverId = this.driverSelectEl.value;
        this._syncUI();
      });
    }

    if (this.trackSelectEl) {
      this.trackSelectEl.addEventListener('change', () => {
        this._handleTrackSelection(this.trackSelectEl.value);
      });
    }

    if (this.mpTrackSelectEl) {
      this.mpTrackSelectEl.addEventListener('change', () => {
        this._handleTrackSelection(this.mpTrackSelectEl.value);
      });
    }

    // Start Session (Home Carriera / Home Sessione Rapida / Track Select) & Resume
    if (this.homeStartCareerBtn) {
      this.homeStartCareerBtn.addEventListener('click', () => {
        this._launchSession('career');
      });
    }

    if (this.startBtn) {
      this.startBtn.addEventListener('click', () => {
        this._launchSession(this.quickMode);
      });
    }

    if (this.trackScreenStartBtn) {
      this.trackScreenStartBtn.addEventListener('click', () => {
        this._launchSession(this.state.mode);
      });
    }

    if (this.resumeBtn) {
      this.resumeBtn.addEventListener('click', () => {
        if (!this.hasActiveSession) return;
        this.close();
        if (this.onResume) this.onResume();
      });
    }

    if (this.openMenuHudBtn) {
      this.openMenuHudBtn.addEventListener('click', () => {
        if (this.onOpenHudMenu && !this.isOpen && this.hasActiveSession) {
          this.onOpenHudMenu();
          return;
        }
        this.open();
      });
    }

    // Eventi Lobby Multigiocatore PeerJS (Step 10)
    if (this.mpCreateRoomBtn) {
      this.mpCreateRoomBtn.addEventListener('click', () => {
        if (!this.roomManager) return;
        this.roomManager.createRoom(this.getLocalPlayerProfile());
        this.updateMultiplayerUI();
      });
    }

    if (this.mpJoinRoomBtn && this.mpJoinInputEl) {
      this.mpJoinRoomBtn.addEventListener('click', () => {
        if (!this.roomManager) return;
        this.roomManager.joinRoom(this.mpJoinInputEl.value, this.getLocalPlayerProfile());
        this.updateMultiplayerUI();
      });
    }

    if (this.mpLeaveRoomBtn) {
      this.mpLeaveRoomBtn.addEventListener('click', () => {
        if (!this.roomManager) return;
        this.roomManager.leaveRoom();
        this.updateMultiplayerUI();
      });
    }

    if (this.mpCopyCodeBtn) {
      this.mpCopyCodeBtn.addEventListener('click', () => {
        const code = this.roomManager?.roomCode;
        if (!code) return;
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(code).catch(() => {});
        }
        this.mpCopyCodeBtn.textContent = 'Copiato!';
        setTimeout(() => {
          this.mpCopyCodeBtn.textContent = 'Copia Codice';
        }, 1500);
      });
    }

    this.mpFormatButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.mpFormat = btn.dataset.mpFormat === 'race' ? 'race' : 'qualifying';
        this.updateMultiplayerUI();
      });
    });

    const setMpRaceLaps = (rawVal) => {
      this.mpRaceLaps = Math.max(1, Math.min(99, Math.round(Number(rawVal) || RACE_TOTAL_LAPS)));
      this.updateMultiplayerUI();
    };

    this.mpRaceLapsButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        setMpRaceLaps(btn.dataset.mpRacelaps);
      });
    });

    if (this.mpRaceLapsInput) {
      this.mpRaceLapsInput.addEventListener('input', () => {
        const val = parseInt(this.mpRaceLapsInput.value, 10);
        if (Number.isFinite(val) && val >= 1 && val <= 99) {
          this.mpRaceLaps = val;
          this.mpRaceLapsButtons.forEach((b) => {
            b.classList.toggle('is-selected', Number(b.dataset.mpRacelaps) === val);
          });
        }
      });
      this.mpRaceLapsInput.addEventListener('blur', () => {
        setMpRaceLaps(this.mpRaceLapsInput.value);
      });
    }

    if (this.mpStartSessionBtn) {
      this.mpStartSessionBtn.addEventListener('click', () => {
        if (!this.roomManager?.isHost() || !this.onStartMultiplayerSession) return;
        this.hasActiveSession = true;
        this.profileModalOpen = false;
        this.activeTab = 'home';
        this.close();
        this.onStartMultiplayerSession({
          mode: this.mpFormat,
          difficultyId: this.state.difficultyId,
          weather: this.state.weather,
          trackId: this.state.trackId,
          raceLaps: this.mpRaceLaps,
        });
      });
    }
  }

  getLocalPlayerProfile() {
    const specs = buildCarSpecsFromUpgrades(this.careerState.upgrades);
    return {
      playerName: this.careerState.playerName,
      playerCode: this.careerState.playerCode,
      teamId: this.careerState.teamId,
      customPrimaryColor: null,
      paintRoughness: 0.22,
      paintMetalness: 0.35,
      carSpecs: specs,
    };
  }

  updateMultiplayerStatus(msg) {
    if (this.mpStatusBadgeEl) {
      this.mpStatusBadgeEl.textContent = msg || 'Modalità offline';
    }
  }

  updateMultiplayerUI() {
    const rm = this.roomManager;
    if (!rm) return;

    this.updateMultiplayerStatus(rm.statusMessage);
    const active = rm.isActive();

    if (this.mpConnectControlsEl) {
      this.mpConnectControlsEl.style.display = active ? 'none' : 'flex';
    }
    if (this.mpRoomCodeBoxEl) {
      this.mpRoomCodeBoxEl.style.display = active ? 'flex' : 'none';
    }
    if (this.mpRoomCodeValEl) {
      this.mpRoomCodeValEl.textContent = rm.roomCode || 'F1-0000';
    }
    if (this.mpRosterSectionEl) {
      this.mpRosterSectionEl.style.display = active ? 'flex' : 'none';
    }
    if (this.mpHostControlsEl) {
      this.mpHostControlsEl.style.display = rm.isHost() ? 'flex' : 'none';
    }
    if (this.mpLeaveRoomBtn) {
      this.mpLeaveRoomBtn.style.display = active ? 'block' : 'none';
    }

    this.mpFormatButtons.forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.mpFormat === this.mpFormat);
    });
    this.mpRaceLapsButtons.forEach((btn) => {
      btn.classList.toggle('is-selected', Number(btn.dataset.mpRacelaps) === this.mpRaceLaps);
    });
    if (this.mpRaceLapsInput && document.activeElement !== this.mpRaceLapsInput) {
      this.mpRaceLapsInput.value = String(this.mpRaceLaps);
    }

    if (this.mpPlayersListEl) {
      const players = rm.getPlayers();
      this.mpPlayersListEl.innerHTML = players
        .map((p) => {
          const team = F1_2026_TEAMS[p.teamId] || F1_2026_TEAMS.ferrari;
          const color = p.customPrimaryColor || team.primaryColor;
          const roleLabel = p.isHost ? 'HOST' : p.carId === rm.localCarId ? 'TU' : 'AMICO';
          return `
            <div class="mp-player-item" style="border-left-color: ${color};">
              <span>${p.playerName} (${team.name})</span>
              <span>${roleLabel}</span>
            </div>
          `;
        })
        .join('');
    }
    if (this.quickMpValEl) {
      this.quickMpValEl.textContent = active
        ? `Stanza ${rm.roomCode} • ${rm.getPlayers().length} piloti`
        : 'Crea stanza o unisciti con codice';
    }
  }

  _syncVehicleOverlay() {
    const c = this.careerState;
    if (!c) return;

    const team = F1_2026_TEAMS[c.teamId] || F1_2026_TEAMS.ferrari;
    const maxTotal = UPGRADE_WINDOW_ORDER.length * UPGRADE_MAX_LEVEL;
    const totalLvl = UPGRADE_WINDOW_ORDER.reduce(
      (acc, key) => acc + (c.upgrades?.[key] ?? 0),
      0
    );
    const specs = buildCarSpecsFromUpgrades(c.upgrades);

    if (this.garageTeamEmblemEl && this._lastGarageTeamId !== team.id) {
      this.garageTeamEmblemEl.innerHTML = generateTeamEmblemSvg(team);
      this._lastGarageTeamId = team.id;
    }
    if (this.garageTeamNameEl) {
      this.garageTeamNameEl.textContent = team.name;
    }
    if (this.garageSpecBadgeEl) {
      const tierLabel =
        totalLvl === 0
          ? 'SPEC BASE'
          : totalLvl >= maxTotal
            ? 'SPEC MAX R&D'
            : 'SVILUPPO ATTIVO';
      this.garageSpecBadgeEl.textContent = `${tierLabel} • LV. ${totalLvl}/${maxTotal}`;
    }
    if (this.garageBudgetPillEl) {
      this.garageBudgetPillEl.textContent = formatDollarCash(c.money);
    }
    if (this.garageTotalLvlPillEl) {
      this.garageTotalLvlPillEl.textContent = `SVILUPPO ${totalLvl} / ${maxTotal}`;
    }
    if (this.garageOverallBarFillEl) {
      this.garageOverallBarFillEl.style.width = `${Math.round((totalLvl / maxTotal) * 100)}%`;
    }

    // Aggiorna la strip telemetrica prestazioni live della monoposto
    const setGauge = (valEl, barEl, pctBoost, maxPct) => {
      if (valEl) valEl.textContent = `+${pctBoost.toFixed(1)}%`;
      if (barEl) {
        const fill = Math.min(100, Math.round(16 + (pctBoost / maxPct) * 84));
        barEl.style.width = `${fill}%`;
      }
    };
    setGauge(this.gtelEls.speedVal, this.gtelEls.speedBar, (specs.topSpeedMult - 1) * 100, 4.5);
    setGauge(this.gtelEls.accelVal, this.gtelEls.accelBar, (specs.engineAccelMult - 1) * 100, 13.0);
    setGauge(this.gtelEls.aeroVal, this.gtelEls.aeroBar, (specs.aeroDownforceMult - 1) * 100, 20.0);
    setGauge(this.gtelEls.brakesVal, this.gtelEls.brakesBar, (specs.brakeMult - 1) * 100, 14.0);
    setGauge(this.gtelEls.gripVal, this.gtelEls.gripBar, (specs.tireGripMult - 1) * 100, 10.0);

    // Renderizza tutti e 5 i potenziamenti R&D contemporaneamente con icone, segmenti livello e delta prestazionale
    if (this.careerUpgradesGridEl) {
      this.careerUpgradesGridEl.innerHTML = UPGRADE_WINDOW_ORDER.map((catId) => {
        const cat = UPGRADE_CATEGORIES[catId];
        const meta = UPGRADE_UI_META[catId] || {};
        const lvl = c.upgrades?.[catId] ?? 0;
        const isMax = lvl >= UPGRADE_MAX_LEVEL;
        const cost = getUpgradeCost(catId, lvl);
        const canAfford = cost !== null && c.money >= cost;

        const segmentsHtml = Array.from({ length: UPGRADE_MAX_LEVEL }, (_, idx) => {
          const segClass =
            idx < lvl
              ? 'f1-rd-seg is-filled'
              : idx === lvl && !isMax
                ? 'f1-rd-seg is-next'
                : 'f1-rd-seg';
          return `<span class="${segClass}"></span>`;
        }).join('');

        const ctaHtml = isMax
          ? `<button type="button" class="f1-rd-buy-btn is-maxed-btn" disabled>
               <span class="f1-rd-buy-action">MAX</span>
               <span class="f1-rd-buy-price">LV. 5/5</span>
             </button>`
          : `<button type="button" class="f1-rd-buy-btn" data-upgrade-id="${catId}" ${!canAfford ? 'disabled' : ''}>
               <span class="f1-rd-buy-action">${canAfford ? 'POTENZIA' : 'BLOCCATO'}</span>
               <span class="f1-rd-buy-price">${formatDollarCash(cost)}</span>
             </button>`;

        return `
          <div class="f1-rd-card${isMax ? ' is-maxed' : ''}" style="--rd-accent: ${meta.accent || '#38bdf8'};" title="${cat.description}">
            <div class="f1-rd-icon" aria-hidden="true">${meta.icon || ''}</div>
            <div class="f1-rd-info">
              <div class="f1-rd-card-top">
                <span class="f1-rd-name">${cat.label}</span>
                <span class="f1-rd-lvl">LV. ${lvl}/${UPGRADE_MAX_LEVEL}</span>
              </div>
              <div class="f1-rd-delta">${meta.statSummary ? meta.statSummary(lvl) : cat.description}</div>
              <div class="f1-rd-segments" aria-label="Livello ${lvl} su ${UPGRADE_MAX_LEVEL}">${segmentsHtml}</div>
            </div>
            ${ctaHtml}
          </div>
        `;
      }).join('');
    }
  }

  _getHintsForActiveTab() {
    if (this.activeTab === 'team') {
      return [
        { key: 'Drag', label: 'Ruota 360°' },
        { key: 'Wheel', label: 'Zoom' },
        { key: '← / →', label: 'Scuderia' },
        { key: 'Enter', label: 'Conferma' },
        { key: 'Esc', label: 'Home' },
      ];
    }
    if (this.activeTab === 'vehicle') {
      return [
        { key: 'Drag', label: 'Ruota Auto 360°' },
        { key: 'Wheel', label: 'Zoom' },
        { key: 'Click', label: 'Potenzia R&D' },
        { key: 'Esc', label: 'Home' },
      ];
    }
    if (this.activeTab === 'track') {
      return [
        { key: '↑ / ↓', label: 'Meteo' },
        { key: '← / →', label: 'Circuito' },
        { key: 'Enter', label: 'Scendi in Pista' },
        { key: 'Esc', label: 'Home' },
      ];
    }
    if (this.activeTab === 'home') {
      const base = [
        { key: '← / →', label: 'Seleziona' },
        { key: 'Invio', label: 'Avvia Carriera' },
      ];
      if (this.hasActiveSession) {
        base.push({ key: 'Esc', label: 'Torna in Pista' });
      }
      return base;
    }
    return [
      { key: 'Mouse', label: 'Modifica' },
      { key: 'Esc', label: 'Home' },
    ];
  }

  _syncHomeScreen(career, activeTeam, activeTrack) {
    if (this.homeTeamEmblemEl && this._lastHomeTeamId !== activeTeam.id) {
      this.homeTeamEmblemEl.innerHTML = generateTeamEmblemSvg(activeTeam);
      this._lastHomeTeamId = activeTeam.id;
    }
    if (this.homeCareerTeamNameEl) {
      this.homeCareerTeamNameEl.textContent = activeTeam.name;
    }
    if (this.homeCareerDriverNameEl) {
      const totalLvl = UPGRADE_WINDOW_ORDER.reduce(
        (acc, key) => acc + (career.upgrades?.[key] ?? 0),
        0
      );
      const maxTotal = UPGRADE_WINDOW_ORDER.length * UPGRADE_MAX_LEVEL;
      this.homeCareerDriverNameEl.textContent = `Pilota: ${career.playerName} • Upgrade ${totalLvl}/${maxTotal}`;
    }
    if (this.homeNextTrackSvgEl && this._lastHomeTrackId !== activeTrack.id) {
      this.homeNextTrackSvgEl.innerHTML = generateTrackOutlineSvg(activeTrack.controlPoints, {
        width: 145,
        height: 82,
        padding: 8,
        sectorSplits: activeTrack.sectorSplits,
        strokeWidth: 3.4,
      });
      this._lastHomeTrackId = activeTrack.id;
    }
    if (this.homeNextGpTitleEl) {
      this.homeNextGpTitleEl.textContent = `R${String(activeTrack.round).padStart(2, '0')} • ${activeTrack.gpName}`;
    }
    if (this.homeNextTrackMetaEl) {
      const km = (activeTrack.officialLength / 1000).toFixed(3);
      const corners = getTrackCornersCount(activeTrack.id);
      this.homeNextTrackMetaEl.textContent = `${km} KM • ${corners} CURVE • ${activeTrack.name.toUpperCase()}`;
    }
    if (this.homeNextTrackRecordsEl) {
      const rec = getTrackRecord(activeTrack.id);
      const qStr = rec.qualifyingBestLap ? formatLapTime(rec.qualifyingBestLap.time) : '--:--.---';
      const rStr = rec.raceBestLap ? formatLapTime(rec.raceBestLap.time) : '--:--.---';
      this.homeNextTrackRecordsEl.textContent = `Record Q: ${qStr} • G: ${rStr}`;
    }

    if (this.quickTeamValEl) {
      const drivers = F1_2026_DRIVERS.filter((d) => d.teamId === activeTeam.id)
        .map((d) => d.code)
        .join(' / ');
      this.quickTeamValEl.textContent = `${activeTeam.name}${drivers ? ` (${drivers})` : ''}`;
    }
    if (this.quickTrackValEl) {
      const weatherLabel = this.state.weather === 'rain' ? 'Pioggia' : 'Asciutto';
      this.quickTrackValEl.textContent = `R${String(activeTrack.round).padStart(2, '0')} ${activeTrack.name} • ${weatherLabel}`;
    }
    if (this.quickGarageValEl) {
      const totalLvl = UPGRADE_WINDOW_ORDER.reduce(
        (acc, key) => acc + (career.upgrades?.[key] ?? 0),
        0
      );
      this.quickGarageValEl.textContent = `Sviluppo Auto ${totalLvl}/${UPGRADE_WINDOW_ORDER.length * UPGRADE_MAX_LEVEL}`;
    }
  }

  _prefersReducedMotion() {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  _syncTeamScreen(activeTeam) {
    if (this.teamHeroEmblemEl && this._lastTeamHeroId !== activeTeam.id) {
      this.teamHeroEmblemEl.innerHTML = generateTeamEmblemSvg(activeTeam);
      this._lastTeamHeroId = activeTeam.id;
    }
    if (this.teamHeroNameEl) {
      this.teamHeroNameEl.textContent = activeTeam.name;
    }
    if (this.teamHeroPaceEl) {
      const pacePct = ((activeTeam.pace ?? 0.96) * 100).toFixed(1);
      this.teamHeroPaceEl.textContent = `PASSO TELAIO 2026: ${pacePct}%`;
    }
    if (this.teamDriversListEl) {
      const teamDrivers = F1_2026_DRIVERS.filter((d) => d.teamId === activeTeam.id);
      this.teamDriversListEl.innerHTML = teamDrivers
        .map(
          (d) => `
            <button
              type="button"
              class="f1-driver-pill ${this.state.playerDriverId === d.id ? 'is-selected' : ''}"
              data-driver-id="${d.id}"
            >
              <span class="f1-driver-num">#${d.number}</span>
              <span>${d.name} (${d.code})</span>
            </button>
          `
        )
        .join('');
    }
    if (this.teamCarouselEl) {
      let selectedCard = null;
      this.teamCarouselEl.querySelectorAll('[data-team-card]').forEach((card) => {
        const isSel = card.dataset.teamCard === activeTeam.id;
        card.classList.toggle('is-selected', isSel);
        if (isSel) selectedCard = card;
      });
      if (
        selectedCard &&
        this.activeTab === 'team' &&
        (this._lastCarouselTeamId !== activeTeam.id || this._lastCarouselTab !== 'team')
      ) {
        selectedCard.scrollIntoView({
          behavior: this._prefersReducedMotion() ? 'auto' : 'smooth',
          inline: 'center',
          block: 'nearest',
        });
        this._lastCarouselTeamId = activeTeam.id;
      }
    }
  }

  _syncTrackScreen(activeTrack) {
    if (this.trackHeroNameEl) {
      this.trackHeroNameEl.textContent = activeTrack.name;
    }
    if (this.trackHeroSubEl) {
      this.trackHeroSubEl.textContent = `R${String(activeTrack.round).padStart(2, '0')} • ${activeTrack.city}, ${activeTrack.country} • ${activeTrack.gpName}`;
    }
    if (this.trackDetailSvgEl && this._lastTrackDetailId !== activeTrack.id) {
      this.trackDetailSvgEl.innerHTML = generateTrackOutlineSvg(activeTrack.controlPoints, {
        width: 340,
        height: 170,
        padding: 16,
        sectorSplits: activeTrack.sectorSplits,
        strokeWidth: 4.5,
        showStartDot: true,
      });
      this._lastTrackDetailId = activeTrack.id;
    }
    if (this.trackStatLengthEl) {
      this.trackStatLengthEl.textContent = `${(activeTrack.officialLength / 1000).toFixed(3)} km`;
    }
    if (this.trackStatCornersEl) {
      this.trackStatCornersEl.textContent = String(getTrackCornersCount(activeTrack.id));
    }
    if (this.trackStatWidthEl) {
      const w = Number(activeTrack.width ?? activeTrack.trackWidth ?? 14);
      const straightW = Number(activeTrack.mainStraightWidth ?? w);
      this.trackStatWidthEl.textContent =
        straightW > w + 0.05
          ? `${w.toFixed(1)} m (Rettilineo ${straightW.toFixed(1)} m)`
          : `${w.toFixed(1)} m`;
    }
    if (this.trackStatLapsEl) {
      const isCareerMode = this.state.mode === 'career';
      const isInfinitePractice =
        this.state.mode === 'practice' && this.state.lapType === 'infinite';
      const canAdjustOnTrack = !isCareerMode && !isInfinitePractice;

      if (isCareerMode) {
        this.trackStatLapsEl.textContent = `${CAREER_RACE_LAPS} Giri (Carriera)`;
      } else if (isInfinitePractice) {
        this.trackStatLapsEl.textContent = '∞ Giri';
      } else if (this.state.mode === 'practice') {
        this.trackStatLapsEl.textContent = `${this.state.finiteLaps} Giri`;
      } else {
        this.trackStatLapsEl.textContent = `${this.state.raceLaps} Giri`;
      }

      if (this.trackLapsDecBtn) {
        this.trackLapsDecBtn.style.display = canAdjustOnTrack ? 'inline-flex' : 'none';
      }
      if (this.trackLapsIncBtn) {
        this.trackLapsIncBtn.style.display = canAdjustOnTrack ? 'inline-flex' : 'none';
      }
    }

    if (this.trackCarouselEl) {
      let selectedCard = null;
      this.trackCarouselEl.querySelectorAll('[data-track-card]').forEach((card) => {
        const isSel = card.dataset.trackCard === activeTrack.id;
        card.classList.toggle('is-selected', isSel);
        if (isSel) selectedCard = card;
      });
      if (
        selectedCard &&
        this.activeTab === 'track' &&
        (this._lastCarouselTrackId !== activeTrack.id || this._lastCarouselTab !== 'track')
      ) {
        selectedCard.scrollIntoView({
          behavior: this._prefersReducedMotion() ? 'auto' : 'smooth',
          inline: 'center',
          block: 'nearest',
        });
        this._lastCarouselTrackId = activeTrack.id;
      }
    }

    this._syncTrackRecordsUI(activeTrack);
  }

  refreshTrackRecords() {
    const activeTrack = getTrackById(this.state.trackId);
    this._syncTrackRecordsUI(activeTrack);
    if (this.homeNextTrackRecordsEl) {
      const rec = getTrackRecord(activeTrack.id);
      const qStr = rec.qualifyingBestLap ? formatLapTime(rec.qualifyingBestLap.time) : '--:--.---';
      const rStr = rec.raceBestLap ? formatLapTime(rec.raceBestLap.time) : '--:--.---';
      this.homeNextTrackRecordsEl.textContent = `Record Q: ${qStr} • G: ${rStr}`;
    }
  }

  _syncTrackRecordsUI(activeTrack) {
    if (!activeTrack) return;
    const rec = getTrackRecord(activeTrack.id);
    const ideal = getTheoreticalBestLap(rec);

    if (this.trackRecIdealEl) {
      if (ideal !== null) {
        this.trackRecIdealEl.style.display = 'inline';
        this.trackRecIdealEl.textContent = `Ideale: ${formatLapTime(ideal)}`;
      } else {
        this.trackRecIdealEl.style.display = 'none';
      }
    }

    if (this.trackRecQualiTimeEl) {
      this.trackRecQualiTimeEl.textContent = rec.qualifyingBestLap
        ? formatLapTime(rec.qualifyingBestLap.time)
        : '--:--.---';
    }
    if (this.trackRecQualiMetaEl) {
      this.trackRecQualiMetaEl.textContent = rec.qualifyingBestLap
        ? `${rec.qualifyingBestLap.driverCode} • ${rec.qualifyingBestLap.teamName}`
        : 'Nessun tempo';
    }

    if (this.trackRecRaceTimeEl) {
      this.trackRecRaceTimeEl.textContent = rec.raceBestLap
        ? formatLapTime(rec.raceBestLap.time)
        : '--:--.---';
    }
    if (this.trackRecRaceMetaEl) {
      this.trackRecRaceMetaEl.textContent = rec.raceBestLap
        ? `${rec.raceBestLap.driverCode} • ${rec.raceBestLap.teamName}`
        : 'Nessun tempo';
    }

    for (let i = 0; i < 3; i++) {
      const sec = rec.bestSectors?.[i] || null;
      const timeEl = this.trackRecSectorTimeEls?.[i];
      const metaEl = this.trackRecSectorMetaEls?.[i];
      if (timeEl) {
        timeEl.textContent = sec ? formatSectorTime(sec.time) : '--.---';
      }
      if (metaEl) {
        const modeTag =
          sec?.mode === 'qualifying' ? 'Q' : sec?.mode === 'race' ? 'G' : sec ? 'L' : '';
        metaEl.textContent = sec ? `${sec.driverCode} (${modeTag})` : '—';
      }
    }
  }

  _syncUI() {
    const c = this.careerState;
    const s = c.stats;

    // Header Bar & Theme Tint
    const activeTeam = F1_2026_TEAMS[c.teamId] || F1_2026_TEAMS.ferrari;
    const activeTrack = getTrackById(this.state.trackId);
    const isTeamSelectActive = this.activeTab === 'team';
    setThemeTeamTint(activeTeam.primaryColor, isTeamSelectActive, this.activeTab);
    renderKeyHints(this._getHintsForActiveTab());

    if (this.careerMoneyBadgeEl) {
      this.careerMoneyBadgeEl.textContent = formatDollarCash(c.money);
    }
    if (this.racesValEl) this.racesValEl.textContent = String(s.racesCompleted);
    if (this.winsValEl) this.winsValEl.textContent = String(s.wins);
    if (this.profileNameEl) this.profileNameEl.textContent = c.playerName;
    if (this.profileSubEl) {
      if (this.activeTab === 'vehicle') {
        this.profileSubEl.textContent = `${activeTeam.name} • ${s.racesCompleted} GARE`;
      } else {
        const winRate =
          s.racesCompleted > 0 ? Math.round((s.wins / s.racesCompleted) * 100) : 0;
        this.profileSubEl.textContent = `${activeTeam.name} • ${winRate}% WIN`;
      }
    }

    // Header Tab Highlights & Resume CTA
    this.navButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.gpTab === this.activeTab);
    });
    if (this.resumeBtn) {
      this.resumeBtn.style.display = this.hasActiveSession ? 'inline-block' : 'none';
    }

    // Main Screens Visibility & GPU entrance animations (Step 5)
    if (this.homeScreenEl) {
      const showHome = this.activeTab === 'home';
      this.homeScreenEl.style.display = showHome ? 'flex' : 'none';
      this.homeScreenEl.classList.toggle('is-screen-active', showHome);
    }
    if (this.teamScreenEl) {
      const showTeam = this.activeTab === 'team';
      this.teamScreenEl.style.display = showTeam ? 'block' : 'none';
      this.teamScreenEl.classList.toggle('is-screen-active', showTeam);
    }
    if (this.trackScreenEl) {
      const showTrack = this.activeTab === 'track';
      this.trackScreenEl.style.display = showTrack ? 'block' : 'none';
      this.trackScreenEl.classList.toggle('is-screen-active', showTrack);
    }

    // Sub-Overlays & Popups Visibility (Step 3: gestiti tramite ModalManager centrato)
    if (this.vehicleOverlayEl) {
      const showVehicle = this.activeTab === 'vehicle';
      this.vehicleOverlayEl.style.display = showVehicle ? 'flex' : 'none';
      this.vehicleOverlayEl.classList.toggle('is-screen-active', showVehicle);
    }
    if (this.isOpen) {
      this.modalManager.syncVisibility(
        'gp-customize-subcard',
        this.profileModalOpen
      );
      this.modalManager.syncVisibility(
        'gp-multiplayer-popup',
        this.activeTab === 'multiplayer' && !this.profileModalOpen
      );
      this.modalManager.syncVisibility(
        'gp-settings-popup',
        this.activeTab === 'settings' && !this.profileModalOpen
      );
    }

    // Sync Screen 1, Screen 2 & Screen 3 Contents
    this._syncHomeScreen(c, activeTeam, activeTrack);
    this._syncTeamScreen(activeTeam);
    this._syncTrackScreen(activeTrack);
    this._lastCarouselTab = this.activeTab;

    // Sync Quick Mode / Race Laps / Career Format / Practice / Settings states
    this.modeButtons.forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.menuMode === this.quickMode);
    });
    if (this.raceLapsSectionEl) {
      this.raceLapsSectionEl.style.display =
        this.quickMode === 'race' || this.quickMode === 'qualifying' ? 'flex' : 'none';
    }
    this.raceLapsButtons.forEach((btn) => {
      btn.classList.toggle('is-selected', Number(btn.dataset.menuRacelaps) === this.state.raceLaps);
    });
    if (this.raceLapsInput && document.activeElement !== this.raceLapsInput) {
      this.raceLapsInput.value = String(this.state.raceLaps);
    }
    this.careerFormatButtons.forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.careerFormat === c.careerFormat);
    });
    if (this.practiceOptionsSection) {
      this.practiceOptionsSection.style.display = this.quickMode === 'practice' ? 'flex' : 'none';
    }

    this.botsButtons.forEach((btn) => {
      btn.classList.toggle('is-selected', (btn.dataset.menuBots === 'true') === this.state.withBots);
    });
    this.lapTypeButtons.forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.menuLaptype === this.state.lapType);
    });
    if (this.finiteLapsWrap) {
      this.finiteLapsWrap.style.display = this.state.lapType === 'finite' ? 'flex' : 'none';
    }
    this.carLevelButtons.forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.menuCarlevel === this.state.carLevel);
    });
    this.difficultyButtons.forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.menuDifficulty === this.state.difficultyId);
    });
    const diffCfg = getDifficultyConfig(this.state.difficultyId);
    if (this.difficultyDescEl && diffCfg) {
      this.difficultyDescEl.textContent = diffCfg.description;
    }
    this.weatherButtons.forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.menuWeather === this.state.weather);
    });
    if (this.trackSelectEl) {
      this.trackSelectEl.value = this.state.trackId;
    }
    if (this.mpTrackSelectEl) {
      this.mpTrackSelectEl.value = this.state.trackId;
    }
    if (this.driverSelectEl) {
      this.driverSelectEl.value = this.state.playerDriverId;
    }

    // Sync Profile controls
    if (this.careerNameInputEl && document.activeElement !== this.careerNameInputEl) {
      this.careerNameInputEl.value = c.playerName;
    }
    if (this.careerTeamSelectEl) {
      this.careerTeamSelectEl.value = c.teamId;
    }
    if (this.careerStatsSummaryEl) {
      this.careerStatsSummaryEl.textContent =
        `Gare: ${s.racesCompleted} • Vittorie: ${s.wins} • Podi: ${s.podiums} • Pole: ${s.poles} • Punti: ${s.points}`;
    }

    this._syncVehicleOverlay();
    this.updateMultiplayerUI();
    this._notifyShowroom();
  }

  buildSessionConfig() {
    if (this.state.mode === 'career') {
      const repDriver = getRepresentativeDriverForTeam(this.careerState.teamId);
      const customSpecs = buildCarSpecsFromUpgrades(this.careerState.upgrades);
      const format = this.careerState.careerFormat === 'race' ? 'race' : 'qualifying';
      return {
        trackId: this.state.trackId,
        mode: format,
        difficultyId: this.state.difficultyId,
        withBots: true,
        raceLaps: CAREER_RACE_LAPS,
        lapLimit: format === 'race' ? CAREER_RACE_LAPS : null,
        carLevel: customSpecs.id,
        weather: this.state.weather,
        playerDriverId: repDriver.id,
        playerGridIndex: 7,
        isCareer: true,
        careerTeamId: this.careerState.teamId,
        playerCustomName: this.careerState.playerName,
        playerCustomCode: this.careerState.playerCode,
        playerCustomSpecs: customSpecs,
        customPrimaryColor: null,
        paintRoughness: 0.22,
        paintMetalness: 0.35,
      };
    }

    const isPractice = this.state.mode === 'practice';
    const finiteCount = Math.max(
      1,
      Math.min(99, parseInt(this.finiteLapsInput?.value || this.state.finiteLaps, 10) || 5)
    );
    const chosenRaceLaps = Math.max(
      1,
      Math.min(99, parseInt(this.raceLapsInput?.value || this.state.raceLaps, 10) || RACE_TOTAL_LAPS)
    );

    return {
      trackId: this.state.trackId,
      mode: this.state.mode,
      difficultyId: this.state.difficultyId,
      withBots: isPractice ? this.state.withBots : true,
      raceLaps: chosenRaceLaps,
      lapLimit: isPractice
        ? (this.state.lapType === 'infinite' ? null : finiteCount)
        : this.state.mode === 'qualifying'
          ? null
          : chosenRaceLaps,
      carLevel: isPractice ? this.state.carLevel : 'base',
      weather: this.state.weather,
      playerDriverId: this.state.playerDriverId,
      playerGridIndex: isPractice && !this.state.withBots ? 0 : 7,
      isCareer: false,
      customPrimaryColor: null,
      paintRoughness: 0.22,
      paintMetalness: 0.35,
    };
  }

  open() {
    this.isOpen = true;
    this.modalManager.syncVisibility('pause-modal', false);
    if (typeof document !== 'undefined') {
      document.body.classList.add('is-garage-open');
    }
    this._syncUI();
    if (this.modalEl) {
      this.modalEl.style.display = 'flex';
    }
    this._notifyShowroom();
  }

  close() {
    this.isOpen = false;
    this.profileModalOpen = false;
    if (this.activeTab === 'settings' || this.activeTab === 'multiplayer') {
      this.activeTab = 'home';
    }
    this.modalManager.syncVisibility('gp-customize-subcard', false);
    this.modalManager.syncVisibility('gp-multiplayer-popup', false);
    this.modalManager.syncVisibility('gp-settings-popup', false);
    if (typeof document !== 'undefined') {
      document.body.classList.remove('is-garage-open');
    }
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
    }
    this._notifyShowroom();
  }

  toggle() {
    if (!this.hasActiveSession) return;
    if (this.isOpen) {
      this.close();
      if (this.onResume) this.onResume();
    } else {
      this.open();
    }
  }
}
