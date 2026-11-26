/**
 * Gestore Showroom Garage 3D & Menu Principale:
 * - Top bar: HOME, TEAM SELECT, TRACK SELECT, MULTIPLAYER, IMPOSTAZIONI + stats gare/vittorie e profilo pilota
 * - Sincronizzazione in tempo reale con GarageScene3D e camera orbitale
 */

import { getDifficultyConfig } from '../config/difficulty.js';
import {
  DEFAULT_PHYSICS_SETTINGS,
  PHYSICS_TOGGLE_DEFS,
  loadPhysicsSettings,
  normalizePhysicsSettings,
  savePhysicsSettings,
} from '../config/physicsSettings.js';
import {
  KEYBIND_ACTIONS,
  formatKeyCodeLabel,
  isBindableKeyCode,
  loadKeybindings,
  normalizeKeybindings,
  rebindActionKey,
  resetKeybindings,
  saveKeybindings,
} from '../config/keybindings.js';
import {
  CAREER_RACE_LAPS,
  F1_2026_DRIVERS,
  F1_2026_TEAMS,
  RACE_TOTAL_LAPS,
  getCareerWeekendPreset,
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
  exportCareerJson,
  getCareerConstructorStandings,
  getCareerCurrentTrack,
  getCareerDriverStandings,
  getRepresentativeDriverForTeam,
  importCareerJson,
  loadCareerState,
  resetActiveCareer,
  resetCareerState,
  startNewCareer,
  updateCareerPaint,
  updateCareerProfile,
} from '../career/CareerStorage.js';
import { F1_AWARDS, countCareerAwards } from '../career/F1Awards.js';
import { getTheoreticalBestLap, getTrackRecord } from '../career/TrackRecordsStorage.js';
import { formatLapTime, formatSectorTime } from '../race/TimingSystem.js';
import {
  DEFAULT_NIGHT_QUALITY,
  getNightQualityConfig,
  loadSavedNightQuality,
  saveNightQuality,
} from '../rendering/NightLightingConfig.js';
import {
  DEFAULT_SKY_PRESET_OPTION,
  SKY_PRESETS,
  SKY_SELECTOR_OPTIONS,
  loadSavedSkyPresetOption,
  saveSkyPresetOption,
} from '../rendering/SkyPresets.js';
import {
  DEFAULT_CAMERA_MODE_ID,
  loadDefaultCameraMode,
  normalizeCameraModeId,
  saveDefaultCameraMode,
} from '../rendering/CameraController.js';

const TEAM_IDS = Object.keys(F1_2026_TEAMS);

const AWARD_BADGE_CLASS = {
  gp_win: 'is-gold',
  gp_p2: 'is-silver',
  gp_p3: 'is-bronze',
  wdc_champion: 'is-gold',
  wdc_p2: 'is-silver',
  wdc_p3: 'is-bronze',
  wcc_champion: 'is-wcc',
  pole_position: 'is-pole',
  fastest_lap: 'is-fastest',
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getAwardSvgIcon(awardId) {
  if (awardId === 'pole_position') {
    return `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>`;
  }
  if (awardId === 'fastest_lap') {
    return `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.4 1.8 4.4 4.1 4.9.6 1.5 2 2.6 3.9 2.9V19H7v2h10v-2h-4v-3.2c1.9-.3 3.3-1.4 3.9-2.9C19.2 12.4 21 10.4 21 8V7c0-1.1-.9-2-2-2ZM5 8V7h2v3.7C5.8 10.2 5 9.2 5 8Zm14 0c0 1.2-.8 2.2-2 2.7V7h2v1Z"/></svg>`;
}

function renderAwardBadgeHtml(awardId) {
  const meta = F1_AWARDS[awardId];
  if (!meta) return '';
  const cls = AWARD_BADGE_CLASS[awardId] || '';
  return `<span class="f1-award-badge ${cls}" title="${escapeHtml(meta.description)}">${getAwardSvgIcon(awardId)}<span>${escapeHtml(meta.name)}</span></span>`;
}

function getFinishPosClass(pos) {
  if (pos === 1) return 'is-p1';
  if (pos === 2) return 'is-p2';
  if (pos === 3) return 'is-p3';
  return '';
}

function renderChronologicalRoundsHtml(
  roundResults = [],
  { activeRoundIndex = -1, careerActive = false } = {}
) {
  const results = Array.isArray(roundResults) ? roundResults : [];
  return CALENDAR_2026_TRACKS.map((track, idx) => {
    const res = results[idx] || null;
    if (res) {
      const gridPos = res.gridPosition ?? (res.polePosition ? 1 : res.finishPosition ?? res.playerPosition ?? '—');
      const finishPos = res.finishPosition ?? res.playerPosition ?? '—';
      const pts = Number(res.playerPoints) || 0;
      const awards = Array.isArray(res.awards) ? res.awards.filter((id) => Boolean(F1_AWARDS[id])) : [];
      const awardsHtml = awards.length > 0 ? awards.map((id) => renderAwardBadgeHtml(id)).join('') : '';
      const gridCls = gridPos === 1 ? 'is-pole' : '';
      const finishCls = getFinishPosClass(finishPos);

      return `
        <div class="f1-trophies-round-row">
          <span class="f1-round-num-badge">R${String(track.round).padStart(2, '0')}</span>
          <div class="f1-round-gp-cell">
            <span class="f1-round-gp-name">${escapeHtml(track.gpName)}</span>
            <span class="f1-round-circuit-name">${escapeHtml(track.name)} • ${escapeHtml(track.country)}</span>
          </div>
          <div>
            <span class="f1-pos-chip ${gridCls}">P${gridPos}</span>
          </div>
          <div>
            <span class="f1-pos-chip ${finishCls}">P${finishPos}</span>${pts > 0 ? `<span class="f1-pos-pts-sub">+${pts}pt</span>` : ''}
          </div>
          <div class="f1-round-awards-cell">${awardsHtml}</div>
        </div>
      `;
    }

    const isNextUp = careerActive && idx === activeRoundIndex;
    const statusLabel = isNextUp ? 'PROSSIMO GP' : 'IN PROGRAMMA';
    return `
      <div class="f1-trophies-round-row is-pending${isNextUp ? ' is-next-up' : ''}">
        <span class="f1-round-num-badge">R${String(track.round).padStart(2, '0')}</span>
        <div class="f1-round-gp-cell">
          <span class="f1-round-gp-name">${escapeHtml(track.gpName)}</span>
          <span class="f1-round-circuit-name">${escapeHtml(track.name)} • ${escapeHtml(track.country)}</span>
        </div>
        <div><span class="f1-pos-chip">—</span></div>
        <div><span class="f1-pos-chip">${statusLabel}</span></div>
        <div class="f1-round-awards-cell"></div>
      </div>
    `;
  }).join('');
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
    nightQuality = null,
    onNightQualityChange = null,
    skyPreset = null,
    onSkyPresetChange = null,
    physicsSettings = null,
    onPhysicsSettingsChange = null,
    defaultCameraMode = null,
    onDefaultCameraChange = null,
    keybindings = null,
    onKeybindingsChange = null,
    onKeybindCaptureChange = null,
    onGetMuseumState = null,
    onMuseumAction = null,
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
    this.onNightQualityChange = onNightQualityChange;
    this.onSkyPresetChange = onSkyPresetChange;
    this.onPhysicsSettingsChange = onPhysicsSettingsChange;
    this.onDefaultCameraChange = onDefaultCameraChange;
    this.onKeybindingsChange = onKeybindingsChange;
    this.onKeybindCaptureChange = onKeybindCaptureChange;
    this.onGetMuseumState = onGetMuseumState;
    this.onMuseumAction = onMuseumAction;
    this.museumHistoryOpen = false;
    this.activeSettingsTab = 'physics';
    this.activeSeasonTab = 'calendar';
    this._capturingActionId = null;
    this._keybindStatusMessage = 'Clicca su un tasto per cambiarlo. Premi ESC per annullare la modifica.';
    this._nightQualityAutoNote = '';
    this._menuCloseTimer = null;
    this._menuOpenRaf = null;

    this.careerState = careerState || loadCareerState();
    this.isOpen = true;
    this.hasActiveSession = false;
    this.activeTab = 'home'; // 'home' | 'team' | 'track' | 'trophies' | 'multiplayer' | 'settings'
    this.activeTrophiesTab = 'cabinet'; // 'cabinet' | 'history'
    this.selectedHistoryCareerId = this.careerState.completedCareers?.[0]?.id || null;
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
    this._lastTrackDetailId = '';
    this._homeQuickFocusIdx = -1;

    this.modalEl = document.getElementById('session-menu-modal');

    // Header Bar & Player Badge
    this.racesValEl = document.getElementById('gp-races-val');
    this.winsValEl = document.getElementById('gp-wins-val');
    this.profileTriggerBtn = document.getElementById('gp-profile-trigger');
    this.profileNameEl = document.getElementById('gp-profile-name');
    this.profileSubEl = document.getElementById('gp-profile-sub');

    // Top Navigation Tabs & Resume
    this.navButtons = [...document.querySelectorAll('[data-gp-tab]')];
    this.resumeBtn = document.getElementById('menu-resume-btn');
    this.openMenuHudBtn = document.getElementById('hud-open-menu-btn');

    // Screen Containers (Step 2 + Step 3 Trophies)
    this.homeScreenEl = document.getElementById('f1-screen-home');
    this.teamScreenEl = document.getElementById('f1-screen-team');
    this.trackScreenEl = document.getElementById('f1-screen-track');
    this.trophiesScreenEl = document.getElementById('f1-screen-trophies');

    // Screen 1: HOME
    this.homeCareerSeasonPillEl = document.getElementById('home-career-season-pill');
    this.homeTeamEmblemEl = document.getElementById('home-team-emblem');
    this.homeCareerTeamNameEl = document.getElementById('home-career-team-name');
    this.homeCareerDriverNameEl = document.getElementById('home-career-driver-name');
    this.homeChangeTeamBtn = document.getElementById('home-change-team-btn');
    this.homeTeamLockedBadgeEl = document.getElementById('home-team-locked-badge');
    this.homeNextTrackSvgEl = document.getElementById('home-next-track-svg');
    this.homeNextGpKickerEl = document.getElementById('home-next-gp-kicker');
    this.homeNextGpTitleEl = document.getElementById('home-next-gp-title');
    this.homeNextTrackMetaEl = document.getElementById('home-next-track-meta');
    this.homeNextTrackRecordsEl = document.getElementById('home-next-track-records');
    this.homeCareerWdcValEl = document.getElementById('home-career-wdc-val');
    this.homeCareerWccValEl = document.getElementById('home-career-wcc-val');
    this.homeCareerProgressValEl = document.getElementById('home-career-progress-val');
    this.homeOpenSeasonModalBtn = document.getElementById('home-open-season-modal-btn');
    this.homeStartCareerBtn = document.getElementById('home-start-career-btn');
    this.homeResetCareerBtn = document.getElementById('home-reset-career-btn');
    this.homeGoTrackBtn = document.getElementById('home-go-track-btn');
    this.quickTabBtns = [...document.querySelectorAll('[data-quick-tab]')];
    this.quickTeamValEl = document.getElementById('quick-team-val');
    this.quickTrackValEl = document.getElementById('quick-track-val');
    this.quickMpValEl = document.getElementById('quick-mp-val');
    this.quickTrophiesValEl = document.getElementById('quick-trophies-val');

    // Screen 2: TEAM SELECT
    this.teamOrbitZoneEl = document.getElementById('f1-team-orbit-zone');
    this.teamCareerLockBannerEl = document.getElementById('team-career-lock-banner');
    this.teamHeroEmblemEl = document.getElementById('team-hero-emblem');
    this.teamHeroNameEl = document.getElementById('team-hero-name');
    this.teamHeroPaceEl = document.getElementById('team-hero-pace');
    this.teamDriversListEl = document.getElementById('team-drivers-list');
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

    // Screen 4: MUSEO TROFEI 3D & STORICO
    this.museumInteractZoneEl = document.getElementById('f1-museum-interact-zone');
    this.museumHoverTooltipEl = document.getElementById('f1-museum-hover-tooltip');
    this.museumTooltipTitleEl = document.getElementById('f1-museum-tooltip-title');
    this.museumTooltipSubEl = document.getElementById('f1-museum-tooltip-sub');
    this.museumTopbarEl = document.getElementById('f1-museum-topbar');
    this.museumRoomBadgeEl = document.getElementById('museum-room-badge');
    this.museumCareerWinBadgeEl = document.getElementById('museum-career-win-badge');
    this.museumCareerHeadlineEl = document.getElementById('museum-career-headline');
    this.museumCareerSublineEl = document.getElementById('museum-career-subline');
    this.museumKpiEls = {
      gold: document.getElementById('museum-kpi-gold'),
      silver: document.getElementById('museum-kpi-silver'),
      bronze: document.getElementById('museum-kpi-bronze'),
      pole: document.getElementById('museum-kpi-pole'),
      fl: document.getElementById('museum-kpi-fl'),
    };
    this.museumReturnCorridorBtn = document.getElementById('museum-return-corridor-btn');
    this.museumHistoryToggleBtn = document.getElementById('museum-history-toggle-btn');
    this.trophiesHistoryCountBadgeEl = document.getElementById('trophies-history-count-badge');
    this.museumHistoryDrawerEl = document.getElementById('f1-museum-history-drawer');
    this.museumHistoryCloseBtn = document.getElementById('museum-history-close-btn');
    this.trophiesHistoryListEl = document.getElementById('trophies-history-list');

    this.museumGpInspectorEl = document.getElementById('f1-museum-gp-inspector');
    this.museumInspRoundEl = document.getElementById('museum-insp-round');
    this.museumInspTitleEl = document.getElementById('museum-insp-title');
    this.museumInspCircuitEl = document.getElementById('museum-insp-circuit');
    this.museumInspGridEl = document.getElementById('museum-insp-grid');
    this.museumInspFinishEl = document.getElementById('museum-insp-finish');
    this.museumInspAwardsEl = document.getElementById('museum-insp-awards');
    this.museumInspCloseBtn = document.getElementById('museum-insp-close-btn');
    this.museumInspPrevBtn = document.getElementById('museum-insp-prev-btn');
    this.museumInspNextBtn = document.getElementById('museum-insp-next-btn');

    this.museumCorridorControlsEl = document.getElementById('museum-corridor-controls');
    this.museumPedestalPrevBtn = document.getElementById('museum-pedestal-prev-btn');
    this.museumPedestalNextBtn = document.getElementById('museum-pedestal-next-btn');
    this.museumPedestalCounterEl = document.getElementById('museum-pedestal-counter');
    this.museumEnterWallBtn = document.getElementById('museum-enter-wall-btn');
    this.museumWallControlsEl = document.getElementById('museum-wall-controls');
    this.museumShelfBtns = [...document.querySelectorAll('[data-museum-shelf]')];

    // Overlays & Popups
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

    // Profile, Team, Driver & Race/Settings controls
    this.careerStatsSummaryEl = document.getElementById('career-stats-summary');
    this.careerNameInputEl = document.getElementById('career-player-name');
    this.careerTeamSelectEl = document.getElementById('career-team-select');
    this.careerTeamLockNoteEl = document.getElementById('career-team-lock-note');
    this.careerExportBtn = document.getElementById('career-export-btn');
    this.careerImportBtn = document.getElementById('career-import-btn');
    this.careerImportInputEl = document.getElementById('career-import-input');
    this.careerResetBtn = document.getElementById('career-reset-btn');
    this.careerResetModalEl = document.getElementById('career-reset-confirm-modal');
    this.careerResetConfirmCopyEl = document.getElementById('career-reset-confirm-copy');
    this.careerResetConfirmBtn = document.getElementById('career-reset-confirm-btn');

    this.modeButtons = [...document.querySelectorAll('[data-menu-mode]')];
    this.raceLapsSectionEl = document.getElementById('menu-race-laps-section');
    this.raceLapsButtons = [...document.querySelectorAll('[data-menu-racelaps]')];
    this.raceLapsInput = document.getElementById('menu-race-laps-input');
    this.careerPresetWrapEl = document.getElementById('gp-career-preset-wrap');
    this.careerPresetButtons = [...document.querySelectorAll('[data-career-preset]')];
    this.careerSeasonModalEl = document.getElementById('career-season-modal');
    this.careerSeasonTitleEl = document.getElementById('career-season-modal-title');
    this.seasonTabBtns = [...document.querySelectorAll('[data-season-tab]')];
    this.seasonPanelEls = [...document.querySelectorAll('[data-season-panel]')];
    this.careerCalendarListEl = document.getElementById('career-calendar-list');
    this.careerStandingsDriversEl = document.getElementById('career-standings-drivers');
    this.careerStandingsTeamsEl = document.getElementById('career-standings-teams');
    this.practiceOptionsSection = document.getElementById('menu-practice-options');
    this.botsButtons = [...document.querySelectorAll('[data-menu-bots]')];
    this.lapTypeButtons = [...document.querySelectorAll('[data-menu-laptype]')];
    this.finiteLapsWrap = document.getElementById('menu-finite-laps-wrap');
    this.finiteLapsInput = document.getElementById('menu-finite-laps-input');
    this.physicsToggleEls = [...document.querySelectorAll('[data-physics-toggle]')];
    this.botAiSliderEl = document.getElementById('menu-bot-ai-slider');
    this.botAiValEl = document.getElementById('menu-bot-ai-val');
    this.physicsSummaryEl = document.getElementById('menu-physics-summary');
    this.defaultCameraButtons = [...document.querySelectorAll('[data-menu-default-camera]')];
    this.defaultCameraDescEl = document.getElementById('menu-default-camera-desc');
    this.settingsTabBtns = [...document.querySelectorAll('[data-settings-tab]')];
    this.settingsPanelEls = [...document.querySelectorAll('[data-settings-panel]')];
    this.resetPhysicsBtn = document.getElementById('settings-reset-physics-btn');
    this.keybindsDrivingEl = document.getElementById('settings-keybinds-driving');
    this.keybindsActionsEl = document.getElementById('settings-keybinds-actions');
    this.allowArrowsToggleEl = document.getElementById('settings-allow-arrows-toggle');
    this.keybindsStatusEl = document.getElementById('settings-keybinds-status');
    this.resetKeybindsBtn = document.getElementById('settings-reset-keybinds-btn');
    this.weatherButtons = [...document.querySelectorAll('[data-menu-weather]')];
    this.skySelectEls = [
      document.getElementById('menu-sky-select'),
      document.getElementById('quick-sky-select'),
      document.getElementById('track-sky-select'),
      document.getElementById('mp-sky-select'),
    ].filter(Boolean);
    this.nightQualityButtons = [...document.querySelectorAll('[data-menu-night-quality]')];
    this.nightQualityDescEl = document.getElementById('menu-night-quality-desc');
    this.driverSelectEl = document.getElementById('menu-driver-select');
    this.trackSelectEl = document.getElementById('menu-track-select');
    this.mpTrackSelectEl = document.getElementById('mp-track-select');
    this.startBtn = document.getElementById('menu-start-btn');

    const resolvedInitialSkyPreset =
      skyPreset || loadSavedSkyPresetOption() || DEFAULT_SKY_PRESET_OPTION;
    const resolvedInitialWeather =
      SKY_PRESETS[resolvedInitialSkyPreset]?.physicsWeather || 'dry';

    const resolvedPhysicsSettings = physicsSettings
      ? normalizePhysicsSettings(physicsSettings)
      : loadPhysicsSettings();
    const resolvedDefaultCamera = normalizeCameraModeId(
      defaultCameraMode || loadDefaultCameraMode() || DEFAULT_CAMERA_MODE_ID
    );
    const resolvedKeybindings = normalizeKeybindings(keybindings || loadKeybindings());

    this.state = {
      mode: 'career',
      difficultyId: 'custom',
      physicsSettings: resolvedPhysicsSettings,
      defaultCameraMode: resolvedDefaultCamera,
      keybindings: resolvedKeybindings,
      withBots: false,
      lapType: 'infinite',
      finiteLaps: 5,
      raceLaps: RACE_TOTAL_LAPS,
      weather: resolvedInitialWeather,
      skyPreset: resolvedInitialSkyPreset,
      nightQuality: nightQuality || loadSavedNightQuality() || DEFAULT_NIGHT_QUALITY,
      playerDriverId: 'leclerc',
      quickTeamId: this.careerState.teamId || 'ferrari',
      trackId: getCareerCurrentTrack(this.careerState).id,
    };

    this._populateDrivers();
    this._populateCareerTeams();
    this._populateTracks();
    this._populateSkyOptions();
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
        this._cancelKeybindCapture();
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

    this.modalManager.register('career-season-modal', {
      element: this.careerSeasonModalEl,
    });

    this.modalManager.register('career-reset-confirm-modal', {
      element: this.careerResetModalEl,
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
    if (this.onTrackChange) {
      this.onTrackChange(resolved.id);
    }
    this._syncUI();
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

  getShowcaseAppearance() {
    const teamId =
      this.activeTab === 'team'
        ? this.state.quickTeamId || this.careerState.teamId
        : this.careerState.teamId;
    const team = F1_2026_TEAMS[teamId] || F1_2026_TEAMS.ferrari;
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
    if (this.activeTab === 'team') return 'team';
    if (this.activeTab === 'track') return 'track';
    if (this.activeTab === 'trophies') return 'trophies';
    return 'home';
  }

  setActiveTab(tab = 'home') {
    const allowed = new Set(['home', 'team', 'track', 'trophies', 'multiplayer', 'settings']);
    const nextTab = allowed.has(tab) ? tab : 'home';
    if (this.activeTab !== nextTab) {
      this.isCameraRotating = false;
      if (nextTab === 'trophies') {
        this.museumHistoryOpen = false;
        this._dispatchMuseum('return_corridor');
      }
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
    if (this.activeTab === 'trophies') {
      if (this.museumHistoryOpen) {
        this.museumHistoryOpen = false;
        this._syncUI();
        return;
      }
      const mState = this._getMuseumState();
      if (mState?.inspectedRoundIndex !== null && mState?.inspectedRoundIndex !== undefined) {
        this._dispatchMuseum('clear_inspect');
        return;
      }
      if (mState?.room === 'wall') {
        this._dispatchMuseum('return_corridor');
        return;
      }
      this.setActiveTab('home');
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
    if (nextState?.careerStatus !== 'active' && nextState?.teamId) {
      this.state.quickTeamId = nextState.teamId;
    }
    this._syncUI();
  }

  _commitCareerState(nextState) {
    this.careerState = nextState;
    if (nextState?.careerStatus !== 'active' && nextState?.teamId) {
      this.state.quickTeamId = nextState.teamId;
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
    this.state.quickTeamId = team.id;
    if (repDriver?.id) {
      this.state.playerDriverId = repDriver.id;
    }

    if (this.careerState.careerStatus === 'active') {
      // Con Carriera avviata la scuderia Carriera è bloccata: TEAM SELECT aggiorna solo Sessione Rapida / MP
      this._syncUI();
      return;
    }

    let next = updateCareerProfile(this.careerState, { teamId: team.id });
    next = updateCareerPaint(next, {
      r: teamRgb.r,
      g: teamRgb.g,
      b: teamRgb.b,
      useCustomPaint: false,
    });
    this._commitCareerState(next);
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
    const currentTeamId = this.state.quickTeamId || this.careerState.teamId;
    const idx = Math.max(0, TEAM_IDS.indexOf(currentTeamId));
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

  _startCareerFromHome() {
    const typedName = this.careerNameInputEl?.value?.trim() || this.careerState.playerName;
    const next = startNewCareer(this.careerState, {
      teamId: this.careerState.teamId,
      playerName: typedName,
      weekendPresetId: this.careerState.weekendPresetId,
    });
    this._commitCareerState(next);
  }

  _openCareerResetConfirmModal() {
    const team = F1_2026_TEAMS[this.careerState.teamId] || F1_2026_TEAMS.ferrari;
    const roundNum = Math.max(1, (Number(this.careerState.currentRoundIndex) || 0) + 1);
    if (this.careerResetConfirmCopyEl) {
      this.careerResetConfirmCopyEl.innerHTML =
        `Stai per azzerare la Carriera attiva con <strong>${escapeHtml(team.name)}</strong> (Round ${roundNum}/${CALENDAR_2026_TRACKS.length}). Tutti i punti, i risultati GP e i trofei della stagione in corso verranno eliminati.`;
    }
    this.profileModalOpen = false;
    this._syncUI();
    this.modalManager.open('career-reset-confirm-modal');
  }

  _confirmResetCareer() {
    const next = resetActiveCareer(this.careerState);
    this.state.quickTeamId = next.teamId;
    this.modalManager.syncVisibility('career-reset-confirm-modal', false);
    this._commitCareerState(next);
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
    const config = this.buildSessionConfig();
    if (this.onStartSession) {
      this.onStartSession(config, () => this.close({ instant: true }));
    } else {
      this.close();
    }
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

    if (this.teamResetCamBtn) {
      this.teamResetCamBtn.addEventListener('click', () => {
        this.isCameraRotating = false;
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
        } else if (this.activeTab === 'trophies') {
          event.preventDefault();
          const mState = this._getMuseumState();
          if (mState?.room === 'corridor') {
            this._dispatchMuseum('cycle_pedestal', -1);
          } else if (mState?.room === 'wall' && mState.inspectedRoundIndex !== null) {
            this._dispatchMuseum('inspect_slot', (mState.inspectedRoundIndex - 1 + 24) % 24);
          }
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
        } else if (this.activeTab === 'trophies') {
          event.preventDefault();
          const mState = this._getMuseumState();
          if (mState?.room === 'corridor') {
            this._dispatchMuseum('cycle_pedestal', 1);
          } else if (mState?.room === 'wall' && mState.inspectedRoundIndex !== null) {
            this._dispatchMuseum('inspect_slot', (mState.inspectedRoundIndex + 1) % 24);
          }
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
          this._launchSession(this.quickMode || 'qualifying');
        } else if (this.activeTab === 'trophies') {
          event.preventDefault();
          const mState = this._getMuseumState();
          if (mState?.room === 'corridor') {
            this._dispatchMuseum('enter_wall', mState.activeCareer?.id || null);
          }
        } else if (this.activeTab === 'home') {
          event.preventDefault();
          if (this._homeQuickFocusIdx >= 0) {
            const tabTarget = this.quickTabBtns[this._homeQuickFocusIdx]?.dataset?.quickTab;
            if (tabTarget) {
              this.setActiveTab(tabTarget);
              return;
            }
          }
          if (this.careerState.careerStatus === 'active') {
            this._launchSession('career');
          } else {
            this._startCareerFromHome();
          }
        }
      }
    });

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
          } catch {
            // File JSON non valido ignorato
          }
          this.careerImportInputEl.value = '';
        };
        reader.readAsText(file);
      });
    }

    if (this.careerResetBtn) {
      this.careerResetBtn.addEventListener('click', () => {
        if (this.careerState.careerStatus === 'active') {
          this._openCareerResetConfirmModal();
          return;
        }
        const next = resetActiveCareer(this.careerState);
        this.state.quickTeamId = next.teamId;
        this._commitCareerState(next);
      });
    }

    if (this.homeResetCareerBtn) {
      this.homeResetCareerBtn.addEventListener('click', () => {
        this._openCareerResetConfirmModal();
      });
    }

    if (this.careerResetConfirmBtn) {
      this.careerResetConfirmBtn.addEventListener('click', () => {
        this._confirmResetCareer();
      });
    }

    // Museo Trofei 3D — Raycast click/hover, drag camera, bottoni dock e drawer Storico
    if (this.museumInteractZoneEl) {
      let downX = 0;
      let downY = 0;
      let lastX = 0;
      let lastY = 0;
      let isDown = false;
      let dragged = false;

      const toNdc = (clientX, clientY) => ({
        ndcX: (clientX / Math.max(1, window.innerWidth)) * 2 - 1,
        ndcY: -((clientY / Math.max(1, window.innerHeight)) * 2 - 1),
      });

      const updateTooltip = (hit, clientX, clientY) => {
        if (!this.museumHoverTooltipEl) return;
        if (!hit || dragged || !this.isOpen || this.activeTab !== 'trophies') {
          this.museumHoverTooltipEl.style.display = 'none';
          this.museumInteractZoneEl.classList.remove('is-hover-interactive');
          return;
        }
        if (this.museumTooltipTitleEl) this.museumTooltipTitleEl.textContent = hit.label || '';
        if (this.museumTooltipSubEl) this.museumTooltipSubEl.textContent = hit.sublabel || '';
        this.museumInteractZoneEl.classList.add('is-hover-interactive');
        this.museumHoverTooltipEl.style.display = 'block';
        const tx = Math.min(window.innerWidth - 350, clientX + 16);
        const ty = Math.max(70, Math.min(window.innerHeight - 90, clientY + 14));
        this.museumHoverTooltipEl.style.left = `${Math.max(12, tx)}px`;
        this.museumHoverTooltipEl.style.top = `${ty}px`;
      };

      this.museumInteractZoneEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDown = true;
        dragged = false;
        downX = e.clientX;
        downY = e.clientY;
        lastX = e.clientX;
        lastY = e.clientY;
        this.museumInteractZoneEl.classList.add('is-dragging');
      });

      window.addEventListener('mousemove', (e) => {
        if (!this.isOpen || this.activeTab !== 'trophies') return;
        if (isDown) {
          const dx = e.clientX - lastX;
          const dy = e.clientY - lastY;
          lastX = e.clientX;
          lastY = e.clientY;
          if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) {
            dragged = true;
          }
          if (dragged) {
            updateTooltip(null, e.clientX, e.clientY);
            this._dispatchMuseum('orbit', { dx: dx * 0.008, dy: dy * 0.006 }, false);
          }
          return;
        }
        if (e.target === this.museumInteractZoneEl) {
          const ndc = toNdc(e.clientX, e.clientY);
          const hit = this.onMuseumAction ? this.onMuseumAction('pointer_hover', ndc) : null;
          updateTooltip(hit, e.clientX, e.clientY);
        } else {
          updateTooltip(null, e.clientX, e.clientY);
        }
      });

      const handlePointerUp = (e) => {
        if (!isDown) return;
        const wasDragged = dragged;
        isDown = false;
        dragged = false;
        this.museumInteractZoneEl.classList.remove('is-dragging');
        const isInZone =
          e?.target === this.museumInteractZoneEl || this.museumInteractZoneEl.contains(e?.target);
        if (!wasDragged && this.isOpen && this.activeTab === 'trophies' && isInZone) {
          updateTooltip(null, 0, 0);
          const ndc = toNdc(e.clientX, e.clientY);
          this._dispatchMuseum('pointer_click', ndc, true);
        }
      };

      window.addEventListener('mouseup', handlePointerUp);
      window.addEventListener('blur', () => {
        isDown = false;
        dragged = false;
        this.museumInteractZoneEl.classList.remove('is-dragging');
        updateTooltip(null, 0, 0);
      });
      this.museumInteractZoneEl.addEventListener('mouseleave', () => updateTooltip(null, 0, 0));

      this.museumInteractZoneEl.addEventListener(
        'wheel',
        (e) => {
          if (!this.isOpen || this.activeTab !== 'trophies') return;
          e.preventDefault();
          this._dispatchMuseum('zoom', Math.sign(e.deltaY) * 0.75, false);
        },
        { passive: false }
      );
    }

    if (this.museumPedestalPrevBtn) {
      this.museumPedestalPrevBtn.addEventListener('click', () => this._dispatchMuseum('cycle_pedestal', -1));
    }
    if (this.museumPedestalNextBtn) {
      this.museumPedestalNextBtn.addEventListener('click', () => this._dispatchMuseum('cycle_pedestal', 1));
    }
    if (this.museumEnterWallBtn) {
      this.museumEnterWallBtn.addEventListener('click', () => {
        const mState = this._getMuseumState();
        this._dispatchMuseum('enter_wall', mState?.activeCareer?.id || null);
      });
    }
    if (this.museumReturnCorridorBtn) {
      this.museumReturnCorridorBtn.addEventListener('click', () => this._dispatchMuseum('return_corridor'));
    }
    this.museumShelfBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this._dispatchMuseum('shelf_preset', btn.dataset.museumShelf || 'all');
      });
    });

    if (this.museumHistoryToggleBtn) {
      this.museumHistoryToggleBtn.addEventListener('click', () => {
        this.museumHistoryOpen = !this.museumHistoryOpen;
        this._syncTrophiesScreen(this.careerState);
      });
    }
    if (this.museumHistoryCloseBtn) {
      this.museumHistoryCloseBtn.addEventListener('click', () => {
        this.museumHistoryOpen = false;
        this._syncTrophiesScreen(this.careerState);
      });
    }

    if (this.trophiesHistoryListEl) {
      this.trophiesHistoryListEl.addEventListener('click', (event) => {
        const actionBtn = event.target.closest('[data-history-action]');
        const card = event.target.closest('[data-history-career-id]');
        const cid = actionBtn?.dataset?.historyCareerId || card?.dataset?.historyCareerId;
        if (!cid) return;
        this.selectedHistoryCareerId = cid;
        const openWall = actionBtn?.dataset?.historyAction === 'wall';
        this._dispatchMuseum('select_career', { careerId: cid, openWall });
      });
    }

    if (this.museumInspCloseBtn) {
      this.museumInspCloseBtn.addEventListener('click', () => this._dispatchMuseum('clear_inspect'));
    }
    if (this.museumInspPrevBtn) {
      this.museumInspPrevBtn.addEventListener('click', () => {
        const cur = this._getMuseumState()?.inspectedRoundIndex ?? 0;
        this._dispatchMuseum('inspect_slot', (cur - 1 + 24) % 24);
      });
    }
    if (this.museumInspNextBtn) {
      this.museumInspNextBtn.addEventListener('click', () => {
        const cur = this._getMuseumState()?.inspectedRoundIndex ?? 0;
        this._dispatchMuseum('inspect_slot', (cur + 1) % 24);
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
        if (this.quickMode === 'practice' && this.state.lapType === 'finite') {
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
        if (this.quickMode === 'practice' && this.state.lapType === 'finite') {
          this.state.finiteLaps = Math.min(99, (this.state.finiteLaps || 5) + 1);
          if (this.finiteLapsInput) this.finiteLapsInput.value = String(this.state.finiteLaps);
          this._syncUI();
          return;
        }
        setQuickRaceLaps((this.state.raceLaps || RACE_TOTAL_LAPS) + 1);
      });
    }

    this.careerPresetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = updateCareerProfile(this.careerState, {
          weekendPresetId: btn.dataset.careerPreset,
        });
        this._commitCareerState(next);
      });
    });

    if (this.homeOpenSeasonModalBtn) {
      this.homeOpenSeasonModalBtn.addEventListener('click', () => {
        this._syncCareerSeasonModal(this.careerState);
        this.modalManager.open('career-season-modal');
      });
    }

    this.seasonTabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeSeasonTab = btn.dataset.seasonTab || 'calendar';
        this._syncSeasonTabsUI();
      });
    });

    const commitPhysicsSettings = (patch) => {
      this.state.physicsSettings = savePhysicsSettings({
        ...this.state.physicsSettings,
        ...patch,
      });
      if (this.onPhysicsSettingsChange) {
        this.onPhysicsSettingsChange(this.state.physicsSettings);
      }
      this._syncPhysicsUI();
    };

    this.physicsToggleEls.forEach((inputEl) => {
      inputEl.addEventListener('change', () => {
        const key = inputEl.dataset.physicsToggle;
        if (!key) return;
        commitPhysicsSettings({ [key]: Boolean(inputEl.checked) });
      });
    });

    if (this.botAiSliderEl) {
      this.botAiSliderEl.addEventListener('input', () => {
        const val = parseInt(this.botAiSliderEl.value, 10);
        if (Number.isFinite(val)) {
          commitPhysicsSettings({ botAiLevel: val });
        }
      });
    }

    this.defaultCameraButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextCam = saveDefaultCameraMode(btn.dataset.menuDefaultCamera);
        this.state.defaultCameraMode = nextCam;
        if (this.onDefaultCameraChange) {
          this.onDefaultCameraChange(nextCam);
        }
        this._syncUI();
      });
    });

    this.settingsTabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this._cancelKeybindCapture();
        this.activeSettingsTab = btn.dataset.settingsTab || 'physics';
        this._syncSettingsTabsUI();
      });
    });

    if (this.resetPhysicsBtn) {
      this.resetPhysicsBtn.addEventListener('click', () => {
        commitPhysicsSettings({ ...DEFAULT_PHYSICS_SETTINGS });
      });
    }

    if (this.allowArrowsToggleEl) {
      this.allowArrowsToggleEl.addEventListener('change', () => {
        this.state.keybindings = saveKeybindings({
          ...this.state.keybindings,
          allowArrowFallback: Boolean(this.allowArrowsToggleEl.checked),
        });
        if (this.onKeybindingsChange) {
          this.onKeybindingsChange(this.state.keybindings);
        }
        this._syncKeybindingsUI();
      });
    }

    if (this.resetKeybindsBtn) {
      this.resetKeybindsBtn.addEventListener('click', () => {
        this._cancelKeybindCapture();
        this.state.keybindings = resetKeybindings();
        this._keybindStatusMessage = 'Comandi ripristinati ai valori predefiniti (WASD + C / P / T / BACK / R / F3 / ESC).';
        if (this.onKeybindingsChange) {
          this.onKeybindingsChange(this.state.keybindings);
        }
        this._syncKeybindingsUI();
        this._syncUI();
      });
    }

    this._onCaptureKeyDown = (event) => {
      if (!this._capturingActionId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      if (event.repeat) return;

      const actionId = this._capturingActionId;
      const actionDef = KEYBIND_ACTIONS.find((a) => a.id === actionId);
      if (event.code === 'Escape' && actionId !== 'pause') {
        this._cancelKeybindCapture('Modifica tasto annullata.');
        return;
      }
      if (!isBindableKeyCode(event.code)) {
        this._keybindStatusMessage = 'Tasto non assegnabile. Scegli un altro tasto o premi ESC per annullare.';
        this._syncKeybindingsUI();
        return;
      }

      const { bindings: nextBindings, swappedWith } = rebindActionKey(
        this.state.keybindings,
        actionId,
        event.code
      );
      this.state.keybindings = saveKeybindings(nextBindings);
      const keyLabel = formatKeyCodeLabel(event.code);
      if (swappedWith) {
        const swappedDef = KEYBIND_ACTIONS.find((a) => a.id === swappedWith);
        this._keybindStatusMessage = `${actionDef?.label || actionId} assegnato a [${keyLabel}] (scambiato con ${swappedDef?.label || swappedWith}).`;
      } else {
        this._keybindStatusMessage = `${actionDef?.label || actionId} assegnato a [${keyLabel}].`;
      }
      this._cancelKeybindCapture(null);
      if (this.onKeybindingsChange) {
        this.onKeybindingsChange(this.state.keybindings);
      }
      this._syncKeybindingsUI();
      this._syncUI();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onCaptureKeyDown, true);
    }

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

    this.weatherButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextWeather = btn.dataset.menuWeather;
        this.state.weather = nextWeather;
        if (nextWeather === 'rain') {
          if (this.state.skyPreset !== 'heavy_rain') {
            this.state.skyPreset = 'rain';
          }
        } else if (SKY_PRESETS[this.state.skyPreset]?.physicsWeather === 'rain') {
          this.state.skyPreset = DEFAULT_SKY_PRESET_OPTION;
        }
        saveSkyPresetOption(this.state.skyPreset);
        if (this.onSkyPresetChange) {
          this.onSkyPresetChange(this.state.skyPreset);
        }
        if (this.onWeatherChange) {
          this.onWeatherChange(this.state.weather);
        }
        this._syncUI();
      });
    });

    this.skySelectEls.forEach((selectEl) => {
      selectEl.addEventListener('change', () => {
        const nextSky = selectEl.value || DEFAULT_SKY_PRESET_OPTION;
        this.state.skyPreset = nextSky;
        saveSkyPresetOption(nextSky);
        const presetCfg = SKY_PRESETS[nextSky];
        if (presetCfg) {
          this.state.weather = presetCfg.physicsWeather;
          if (this.onWeatherChange) {
            this.onWeatherChange(this.state.weather);
          }
        } else if (nextSky === 'auto' && this.state.weather === 'rain') {
          this.state.weather = 'dry';
          if (this.onWeatherChange) {
            this.onWeatherChange('dry');
          }
        }
        if (this.onSkyPresetChange) {
          const resolvedPreview = this.onSkyPresetChange(nextSky);
          if (nextSky === 'random' && resolvedPreview?.physicsWeather) {
            this.state.weather = resolvedPreview.physicsWeather;
          }
        }
        this._syncUI();
      });
    });

    this.nightQualityButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextQuality = getNightQualityConfig(btn.dataset.menuNightQuality).id;
        this.state.nightQuality = nextQuality;
        this._nightQualityAutoNote = '';
        saveNightQuality(nextQuality);
        if (this.onNightQualityChange) {
          this.onNightQualityChange(nextQuality);
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
        if (this.careerState.careerStatus !== 'active') {
          this._startCareerFromHome();
          return;
        }
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
        this._launchSession(this.quickMode || 'qualifying');
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
        this.onStartMultiplayerSession(
          {
            mode: this.mpFormat,
            difficultyId: this.state.difficultyId,
            physicsSettings: { ...this.state.physicsSettings },
            weather: this.state.weather,
            skyPresetId: this.state.skyPreset,
            startingCompound: this.state.startingCompound,
            trackId: this.state.trackId,
            raceLaps: this.mpRaceLaps,
          },
          () => this.close({ instant: true })
        );
      });
    }
  }

  getLocalPlayerProfile() {
    return {
      playerName: this.careerState.playerName,
      playerCode: this.careerState.playerCode,
      teamId: this.state.quickTeamId || this.careerState.teamId,
      customPrimaryColor: null,
      paintRoughness: 0.22,
      paintMetalness: 0.35,
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
    if (this.activeTab === 'track') {
      return [
        { key: '↑ / ↓', label: 'Meteo' },
        { key: '← / →', label: 'Circuito' },
        { key: 'Enter', label: 'Scendi in Pista' },
        { key: 'Esc', label: 'Home' },
      ];
    }
    if (this.activeTab === 'trophies') {
      const mState = this._getMuseumState();
      if (mState?.room === 'wall') {
        return [
          { key: 'Click GP', label: 'Zoom & Targhetta' },
          { key: 'Drag / Wheel', label: 'Sposta / Zoom' },
          { key: 'Esc', label: 'Torna al Corridoio' },
        ];
      }
      return [
        { key: 'Click Coppa', label: 'Entra Sala 24 GP' },
        { key: '← / →', label: 'Cambia Piedistallo' },
        { key: 'Esc', label: 'Home' },
      ];
    }
    if (this.activeTab === 'home') {
      const enterLabel =
        this.careerState.careerStatus === 'active' ? 'Avvia Weekend' : 'Inizia Carriera';
      const base = [
        { key: '← / →', label: 'Seleziona' },
        { key: 'Invio', label: enterLabel },
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

  _syncHomeScreen(career, activeTeam, careerTrack, quickTrack = careerTrack) {
    const roundIdx = Math.max(
      0,
      Math.min(CALENDAR_2026_TRACKS.length - 1, Number(career.currentRoundIndex) || 0)
    );
    const totalRounds = CALENDAR_2026_TRACKS.length;
    const seasonNum = Math.max(1, Number(career.seasonNumber) || 1);
    const preset = getCareerWeekendPreset(career.weekendPresetId);
    const isActive = career.careerStatus === 'active';

    if (this.homeCareerSeasonPillEl) {
      this.homeCareerSeasonPillEl.textContent = isActive
        ? seasonNum > 1
          ? `STAGIONE ${seasonNum} ATTIVA • ROUND ${roundIdx + 1}/${totalRounds}`
          : `STAGIONE ATTIVA • ROUND ${roundIdx + 1}/${totalRounds}`
        : 'NUOVA CARRIERA • 24 GP';
    }
    if (this.homeChangeTeamBtn) {
      this.homeChangeTeamBtn.style.display = isActive ? 'none' : 'inline-flex';
    }
    if (this.homeTeamLockedBadgeEl) {
      this.homeTeamLockedBadgeEl.style.display = isActive ? 'inline-flex' : 'none';
    }
    if (this.homeTeamEmblemEl && this._lastHomeTeamId !== activeTeam.id) {
      this.homeTeamEmblemEl.innerHTML = generateTeamEmblemSvg(activeTeam);
      this._lastHomeTeamId = activeTeam.id;
    }
    if (this.homeCareerTeamNameEl) {
      this.homeCareerTeamNameEl.textContent = activeTeam.name;
    }
    if (this.homeCareerDriverNameEl) {
      this.homeCareerDriverNameEl.textContent = `Pilota: ${career.playerName}`;
    }
    if (this.homeNextGpKickerEl) {
      this.homeNextGpKickerEl.textContent = isActive
        ? 'Calendario Ufficiale Fisso • Prossimo GP'
        : 'Gara Inaugurale Stagione 2026 • Round 01/24';
    }
    if (this.homeNextTrackSvgEl && this._lastHomeTrackId !== careerTrack.id) {
      this.homeNextTrackSvgEl.innerHTML = generateTrackOutlineSvg(careerTrack.controlPoints, {
        width: 145,
        height: 82,
        padding: 8,
        sectorSplits: careerTrack.sectorSplits,
        strokeWidth: 3.4,
      });
      this._lastHomeTrackId = careerTrack.id;
    }
    if (this.homeNextGpTitleEl) {
      this.homeNextGpTitleEl.textContent = `R${String(careerTrack.round).padStart(2, '0')} • ${careerTrack.gpName}`;
    }
    if (this.homeNextTrackMetaEl) {
      const km = (careerTrack.officialLength / 1000).toFixed(3);
      const corners = getTrackCornersCount(careerTrack.id);
      this.homeNextTrackMetaEl.textContent = `${km} KM • ${corners} CURVE • ${careerTrack.name.toUpperCase()}`;
    }
    if (this.homeNextTrackRecordsEl) {
      const rec = getTrackRecord(careerTrack.id);
      const qStr = rec.qualifyingBestLap ? formatLapTime(rec.qualifyingBestLap.time) : '--:--.---';
      const rStr = rec.raceBestLap ? formatLapTime(rec.raceBestLap.time) : '--:--.---';
      this.homeNextTrackRecordsEl.textContent = `Record Q: ${qStr} • G: ${rStr}`;
    }

    const driverStandings = getCareerDriverStandings(career);
    const teamStandings = getCareerConstructorStandings(career);
    const completedCount = (career.roundResults || []).filter(Boolean).length;
    const playerWdc = driverStandings.find((d) => d.isPlayer);
    const playerWcc = teamStandings.find((t) => t.isPlayerTeam);
    if (this.homeCareerWdcValEl) {
      this.homeCareerWdcValEl.textContent = playerWdc
        ? `Piloti: P${playerWdc.position} • ${playerWdc.points} pt`
        : 'Piloti: P— • 0 pt';
    }
    if (this.homeCareerWccValEl) {
      this.homeCareerWccValEl.textContent = playerWcc
        ? `Team: P${playerWcc.position} • ${playerWcc.points} pt`
        : 'Team: P— • 0 pt';
    }
    if (this.homeCareerProgressValEl) {
      this.homeCareerProgressValEl.textContent = `${completedCount}/${totalRounds} GP`;
    }
    if (this.homeStartCareerBtn) {
      this.homeStartCareerBtn.textContent = isActive
        ? `AVVIA WEEKEND R${String(careerTrack.round).padStart(2, '0')} (${preset.shortLabel.toUpperCase()} • ${preset.raceLaps} GIRI) ▶`
        : 'INIZIA CARRIERA 2026 ▶';
    }
    if (this.homeResetCareerBtn) {
      this.homeResetCareerBtn.style.display = isActive ? 'inline-flex' : 'none';
    }

    if (this.quickTeamValEl) {
      const quickTeam = F1_2026_TEAMS[this.state.quickTeamId] || activeTeam;
      const drivers = F1_2026_DRIVERS.filter((d) => d.teamId === quickTeam.id)
        .map((d) => d.code)
        .join(' / ');
      this.quickTeamValEl.textContent = `${quickTeam.name}${drivers ? ` (${drivers})` : ''}`;
    }
    if (this.quickTrophiesValEl) {
      const counts = countCareerAwards(career.roundResults, []);
      const historyCount = Array.isArray(career.completedCareers) ? career.completedCareers.length : 0;
      const premiWord = counts.totalAwards === 1 ? 'Premio' : 'Premi';
      this.quickTrophiesValEl.textContent = `${counts.totalAwards} ${premiWord} • ${historyCount} in Storico`;
    }
    if (this.quickTrackValEl) {
      const skyId = this.state.skyPreset;
      const skyLabel =
        skyId === 'random'
          ? 'Casuale'
          : skyId === 'auto'
            ? (this.state.weather === 'rain' ? 'Pioggia' : 'Auto')
            : SKY_PRESETS[skyId]?.shortLabel ||
              SKY_PRESETS[skyId]?.label ||
              (this.state.weather === 'rain' ? 'Pioggia' : 'Asciutto');
      this.quickTrackValEl.textContent = `R${String(quickTrack.round).padStart(2, '0')} ${quickTrack.name} • ${skyLabel}`;
    }

    this._syncCareerSeasonModal(career, driverStandings, teamStandings);
  }

  _syncSeasonTabsUI() {
    const active = this.activeSeasonTab || 'calendar';
    this.seasonTabBtns.forEach((btn) => {
      const isAct = btn.dataset.seasonTab === active;
      btn.classList.toggle('is-active', isAct);
      btn.setAttribute('aria-selected', isAct ? 'true' : 'false');
    });
    this.seasonPanelEls.forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.seasonPanel === active);
    });
  }

  _syncCareerSeasonModal(
    career,
    precomputedDrivers = null,
    precomputedTeams = null
  ) {
    if (!this.careerSeasonModalEl) return;
    const seasonNum = Math.max(1, Number(career?.seasonNumber) || 1);
    const roundIdx = Math.max(
      0,
      Math.min(CALENDAR_2026_TRACKS.length - 1, Number(career?.currentRoundIndex) || 0)
    );
    if (this.careerSeasonTitleEl) {
      this.careerSeasonTitleEl.textContent = `Stagione ${seasonNum} — Campionato F1 2026 (Round ${roundIdx + 1}/${CALENDAR_2026_TRACKS.length})`;
    }
    this._syncSeasonTabsUI();

    if (this.careerCalendarListEl) {
      const results = Array.isArray(career?.roundResults) ? career.roundResults : [];
      this.careerCalendarListEl.innerHTML = CALENDAR_2026_TRACKS.map((track, idx) => {
        const res = results[idx];
        const isCurrent = idx === roundIdx;
        const isDone = Boolean(res);
        const stateCls = isCurrent ? 'is-current' : isDone ? 'is-done' : '';
        const badgeText = isDone
          ? `TU P${res.playerPosition} (+${res.playerPoints}) • WIN ${res.winnerName.split(' ').slice(-1)[0].toUpperCase()}`
          : isCurrent
            ? 'PROSSIMO GP'
            : 'IN PROGRAMMA';
        return `
          <div class="f1-season-cal-item ${stateCls}">
            <div class="f1-season-cal-left">
              <span class="f1-season-cal-round">ROUND ${String(track.round).padStart(2, '0')} • ${track.country.toUpperCase()}</span>
              <span class="f1-season-cal-gp">${track.gpName}</span>
              <span class="f1-season-cal-track">${track.name} (${(track.officialLength / 1000).toFixed(2)} km)</span>
            </div>
            <span class="f1-season-cal-badge">${badgeText}</span>
          </div>
        `;
      }).join('');
    }

    const driverRows = precomputedDrivers || getCareerDriverStandings(career);
    if (this.careerStandingsDriversEl) {
      this.careerStandingsDriversEl.innerHTML = driverRows
        .map(
          (row) => `
          <div class="f1-standings-row${row.isPlayer ? ' is-player' : ''}">
            <span class="f1-standings-pos">P${row.position}</span>
            <span class="f1-standings-bar" style="background:${row.color};"></span>
            <div class="f1-standings-name">
              <span class="f1-standings-main">#${row.number} ${row.driverName} (${row.code})</span>
              <span class="f1-standings-sub">${row.teamName}${row.wins > 0 ? ` • ${row.wins}V` : ''}</span>
            </div>
            <span class="f1-standings-pts">${row.points} pt</span>
          </div>
        `
        )
        .join('');
    }

    const teamRows = precomputedTeams || getCareerConstructorStandings(career);
    if (this.careerStandingsTeamsEl) {
      this.careerStandingsTeamsEl.innerHTML = teamRows
        .map(
          (row) => `
          <div class="f1-standings-row${row.isPlayerTeam ? ' is-player' : ''}">
            <span class="f1-standings-pos">P${row.position}</span>
            <span class="f1-standings-bar" style="background:${row.color};"></span>
            <div class="f1-standings-name">
              <span class="f1-standings-main">${row.teamName}</span>
              <span class="f1-standings-sub">${row.wins > 0 ? `${row.wins} vittorie` : '2026 Grid'}</span>
            </div>
            <span class="f1-standings-pts">${row.points} pt</span>
          </div>
        `
        )
        .join('');
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
    if (this.teamCareerLockBannerEl) {
      if (this.careerState.careerStatus === 'active') {
        const lockedTeam = F1_2026_TEAMS[this.careerState.teamId] || activeTeam;
        this.teamCareerLockBannerEl.style.display = 'block';
        this.teamCareerLockBannerEl.textContent = `🔒 CARRIERA ATTIVA BLOCCATA SU ${lockedTeam.name.toUpperCase()} — La scuderia scelta qui vale per Sessione Rapida, Prove Libere e Multiplayer.`;
      } else {
        this.teamCareerLockBannerEl.style.display = 'none';
      }
    }
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

  _getMuseumState() {
    return typeof this.onGetMuseumState === 'function' ? this.onGetMuseumState() : null;
  }

  _dispatchMuseum(action, payload = null, syncHud = true) {
    const res = typeof this.onMuseumAction === 'function' ? this.onMuseumAction(action, payload) : null;
    if (syncHud) {
      this._syncTrophiesScreen(this.careerState);
      renderKeyHints(this._getHintsForActiveTab());
    }
    return res;
  }

  _syncTrophiesScreen(career) {
    if (!career) return;
    const mState = this._getMuseumState();
    const room = mState?.room || 'corridor';
    const careersList = Array.isArray(mState?.careers) && mState.careers.length > 0
      ? mState.careers
      : Array.isArray(career.completedCareers)
        ? career.completedCareers
        : [];
    const activeEntry = mState?.activeCareer || careersList[0] || null;
    const teamColor = activeEntry?.teamColor || '#dc0000';

    if (this.museumTopbarEl) {
      this.museumTopbarEl.style.setProperty('--museum-team-color', teamColor);
    }
    if (this.museumRoomBadgeEl) {
      this.museumRoomBadgeEl.textContent =
        room === 'wall' ? 'STANZA 2 • SALA TROFEI 24 GP' : 'STANZA 1 • CORRIDOIO DEL MUSEO';
    }
    if (this.museumCareerWinBadgeEl) {
      this.museumCareerWinBadgeEl.textContent = mState?.activeCareerShortLabel
        ? `🏆 ${mState.activeCareerShortLabel}`
        : activeEntry
          ? `🏆 ${activeEntry.teamName}`
          : 'MUSEO F1 2026';
    }
    if (this.museumCareerHeadlineEl) {
      this.museumCareerHeadlineEl.textContent =
        mState?.activeCareerHeadline || (activeEntry ? `${activeEntry.teamName} • ${activeEntry.playerName}` : 'Museo Trofei F1 2026');
    }
    if (this.museumCareerSublineEl) {
      if (room === 'wall') {
        this.museumCareerSublineEl.textContent =
          'Clicca su qualsiasi trofeo o slot GP sugli scaffali per ispezionare la targhetta completa (Griglia, Arrivo, Premi).';
      } else {
        this.museumCareerSublineEl.textContent =
          'Clicca sulla Coppa del Mondo FIA sul piedistallo (o usa il pulsante in basso) per accedere alla Sala Trofei dei 24 Gran Premi.';
      }
    }

    const counts = activeEntry?.awardCounts || countCareerAwards(activeEntry?.roundResults || [], activeEntry?.seasonAwards || []);
    if (this.museumKpiEls.gold) this.museumKpiEls.gold.textContent = String(counts.gpWins);
    if (this.museumKpiEls.silver) this.museumKpiEls.silver.textContent = String(counts.gpP2);
    if (this.museumKpiEls.bronze) this.museumKpiEls.bronze.textContent = String(counts.gpP3);
    if (this.museumKpiEls.pole) this.museumKpiEls.pole.textContent = String(counts.poles);
    if (this.museumKpiEls.fl) this.museumKpiEls.fl.textContent = String(counts.fastestLaps);

    if (this.museumReturnCorridorBtn) {
      this.museumReturnCorridorBtn.style.display = room === 'wall' ? 'inline-flex' : 'none';
    }
    if (this.museumCorridorControlsEl) {
      this.museumCorridorControlsEl.style.display = room === 'corridor' ? 'flex' : 'none';
    }
    if (this.museumWallControlsEl) {
      this.museumWallControlsEl.style.display = room === 'wall' ? 'flex' : 'none';
    }
    if (this.museumPedestalCounterEl) {
      const idx = (mState?.focusedPedestalIndex ?? 0) + 1;
      const tot = Math.max(1, mState?.careerCount ?? careersList.length);
      this.museumPedestalCounterEl.textContent = `${idx} / ${tot}`;
    }

    const activeShelf = mState?.wallShelfPreset || 'all';
    this.museumShelfBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.museumShelf === activeShelf);
    });

    if (this.museumHoverTooltipEl && this.activeTab !== 'trophies') {
      this.museumHoverTooltipEl.style.display = 'none';
    }

    // Card Ispettore Targhetta GP ingrandita (Stanza 2)
    const insp = room === 'wall' ? mState?.inspectedSlot : null;
    if (this.museumGpInspectorEl) {
      this.museumGpInspectorEl.classList.toggle('is-open', Boolean(insp));
      if (insp?.track) {
        const t = insp.track;
        const r = insp.roundResult;
        const awards = Array.isArray(insp.awards) ? insp.awards : [];
        if (this.museumInspRoundEl) {
          this.museumInspRoundEl.textContent = `ROUND ${String(t.round).padStart(2, '0')} / 24 • ${t.gpName}`;
        }
        if (this.museumInspTitleEl) {
          this.museumInspTitleEl.textContent = t.country || t.city || t.name;
        }
        if (this.museumInspCircuitEl) {
          this.museumInspCircuitEl.textContent = `${t.name} • ${t.city || ''}`;
        }
        if (this.museumInspGridEl) {
          this.museumInspGridEl.textContent = r?.gridPosition ? `P${r.gridPosition}` : '—';
        }
        if (this.museumInspFinishEl) {
          this.museumInspFinishEl.textContent = r?.finishPosition ? `P${r.finishPosition}` : 'Da disputare';
        }
        if (this.museumInspAwardsEl) {
          this.museumInspAwardsEl.innerHTML =
            awards.length > 0
              ? awards.map((id) => renderAwardBadgeHtml(id)).join('')
              : '<span style="font-size:11.5px; color:#94a3b8;">Nessun trofeo conquistato in questo Gran Premio (scaffale vuoto).</span>';
        }
      }
    }

    // Drawer laterale Storico Carriere con indicazione esplicita della scuderia vincitrice
    if (this.trophiesHistoryCountBadgeEl) {
      this.trophiesHistoryCountBadgeEl.textContent = String(careersList.length);
    }
    if (this.museumHistoryToggleBtn) {
      this.museumHistoryToggleBtn.classList.toggle('is-active', Boolean(this.museumHistoryOpen));
    }
    if (this.museumHistoryDrawerEl) {
      this.museumHistoryDrawerEl.classList.toggle('is-open', Boolean(this.museumHistoryOpen));
    }
    if (this.trophiesHistoryListEl) {
      this.trophiesHistoryListEl.innerHTML = careersList
        .map((entry) => {
          const isSel = entry.id === activeEntry?.id;
          const cnt = entry.awardCounts || countCareerAwards(entry.roundResults, entry.seasonAwards);
          const team = F1_2026_TEAMS[entry.teamId] || { id: entry.teamId, name: entry.teamName, primaryColor: entry.teamColor };
          const sAwards = Array.isArray(entry.seasonAwards) ? entry.seasonAwards : [];
          const wonWdc = sAwards.includes('wdc_champion') || (!entry.isActiveSeason && Number(entry.playerPosition) === 1);
          const wonWcc = sAwards.includes('wcc_champion');
          const winBanner = wonWdc
            ? `🏆 Carriera vinta con ${entry.teamName}${wonWcc ? ' (Piloti + Costruttori)' : ''}`
            : wonWcc
              ? `🏆 Costruttori vinto con ${entry.teamName}`
              : entry.isActiveSeason
                ? entry.careerStatus === 'active'
                  ? `Stagione ${entry.seasonNumber || 1} in corso con ${entry.teamName}`
                  : `Prossima Carriera: ${entry.teamName}`
                : `Completata con ${entry.teamName} • P${entry.playerPosition || '--'}`;

          const tagCls = entry.isActiveSeason ? '' : entry.isSimulated ? '' : ' is-real';
          const tagLabel = entry.isActiveSeason
            ? 'STAGIONE ATTIVA'
            : entry.isSimulated
              ? 'ANTEPRIMA SIMULATA'
              : `STAGIONE ${entry.seasonNumber || 1}`;
          const metaLine = entry.isActiveSeason
            ? `${entry.playerName} • ${entry.completedRoundsCount || 0}/24 GP disputati • ${entry.playerPoints || 0} pt`
            : `${entry.playerName} • Piloti P${entry.playerPosition} (${entry.playerPoints} pt) • Costruttori P${entry.playerTeamPosition}`;

          return `
            <div
              class="f1-history-card${isSel ? ' is-selected' : ''}"
              data-history-career-id="${escapeHtml(entry.id)}"
              style="--hist-color: ${escapeHtml(entry.teamColor || '#dc0000')};"
            >
              <div class="f1-history-card-top">
                <span class="f1-history-card-title">${escapeHtml(team.name)}</span>
                <span class="f1-history-sim-badge${tagCls}">${tagLabel}</span>
              </div>
              <div class="f1-history-win-callout">${escapeHtml(winBanner)}</div>
              <div class="f1-history-card-meta">${escapeHtml(metaLine)}</div>
              <div class="f1-history-card-stats">${cnt.gpWins} Oro • ${cnt.gpP2} Arg • ${cnt.gpP3} Bro • ${cnt.poles} Pole • ${cnt.fastestLaps} G.V.</div>
              <div class="f1-history-card-actions">
                <button type="button" class="f1-history-action-btn" data-history-action="pedestal" data-history-career-id="${escapeHtml(entry.id)}">Vai al Piedistallo</button>
                <button type="button" class="f1-history-action-btn is-primary" data-history-action="wall" data-history-career-id="${escapeHtml(entry.id)}">Sala 24 GP →</button>
              </div>
            </div>
          `;
        })
        .join('');
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
      const trackMode = this.quickMode || 'qualifying';
      const isInfinitePractice =
        trackMode === 'practice' && this.state.lapType === 'infinite';
      const canAdjustOnTrack = !isInfinitePractice;

      if (isInfinitePractice) {
        this.trackStatLapsEl.textContent = '∞ Giri';
      } else if (trackMode === 'practice') {
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
      const careerTrack = getCareerCurrentTrack(this.careerState);
      const rec = getTrackRecord(careerTrack.id);
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
    const isCareerActive = c.careerStatus === 'active';
    const displayTeam = isCareerActive
      ? F1_2026_TEAMS[this.state.quickTeamId] || activeTeam
      : activeTeam;
    const activeTrack = getTrackById(this.state.trackId);
    const isTeamSelectActive = this.activeTab === 'team';
    const themeColor = isTeamSelectActive ? displayTeam.primaryColor : activeTeam.primaryColor;
    setThemeTeamTint(themeColor, isTeamSelectActive, this.activeTab);
    renderKeyHints(this._getHintsForActiveTab());

    if (this.racesValEl) this.racesValEl.textContent = String(s.racesCompleted);
    if (this.winsValEl) this.winsValEl.textContent = String(s.wins);
    if (this.profileNameEl) this.profileNameEl.textContent = c.playerName;
    if (this.profileSubEl) {
      const winRate =
        s.racesCompleted > 0 ? Math.round((s.wins / s.racesCompleted) * 100) : 0;
      this.profileSubEl.textContent = `${activeTeam.name} • ${winRate}% WIN`;
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
    if (this.trophiesScreenEl) {
      const showTrophies = this.activeTab === 'trophies';
      this.trophiesScreenEl.style.display = showTrophies ? 'flex' : 'none';
      this.trophiesScreenEl.classList.toggle('is-screen-active', showTrophies);
    }

    // Sub-Overlays & Popups Visibility (Step 3: gestiti tramite ModalManager centrato)
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

    // Sync Screen 1, Screen 2, Screen 3 & Screen 4 Contents
    const careerTrack = getCareerCurrentTrack(c);
    this._syncHomeScreen(c, activeTeam, careerTrack, activeTrack);
    this._syncTeamScreen(displayTeam);
    this._syncTrackScreen(activeTrack);
    this._syncTrophiesScreen(c);
    this._lastCarouselTab = this.activeTab;

    // Sync Quick Mode / Race Laps / Career Preset / Practice / Settings states
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
    const activePresetId = getCareerWeekendPreset(c.weekendPresetId).id;
    this.careerPresetButtons.forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.careerPreset === activePresetId);
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
    this._syncPhysicsUI();
    this._syncSettingsTabsUI();
    this._syncKeybindingsUI();
    this.defaultCameraButtons.forEach((btn) => {
      btn.classList.toggle(
        'is-selected',
        btn.dataset.menuDefaultCamera === this.state.defaultCameraMode
      );
    });
    if (this.defaultCameraDescEl) {
      const camKey = formatKeyCodeLabel(this.state.keybindings?.camera || 'KeyC');
      this.defaultCameraDescEl.textContent =
        this.state.defaultCameraMode === 'cockpit'
          ? `Ogni sessione inizierà in Prima Persona (Abitacolo) con Halo centrale, specchietti e volante F1 LCD live (premi ${camKey} in pista per cambiare).`
          : `Ogni sessione inizierà in Onboard (T-Cam) con Halo Telemetry HUD broadcast (premi ${camKey} in pista per passare in Prima Persona).`;
    }
    this.weatherButtons.forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.menuWeather === this.state.weather);
    });
    this.skySelectEls.forEach((selectEl) => {
      selectEl.value = this.state.skyPreset;
    });
    this.nightQualityButtons.forEach((btn) => {
      btn.classList.toggle(
        'is-selected',
        btn.dataset.menuNightQuality === this.state.nightQuality
      );
    });
    const nightQCfg = getNightQualityConfig(this.state.nightQuality);
    if (this.nightQualityDescEl && nightQCfg) {
      this.nightQualityDescEl.textContent = this._nightQualityAutoNote
        ? `${nightQCfg.description} (${this._nightQualityAutoNote})`
        : nightQCfg.description;
    }
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
      this.careerTeamSelectEl.disabled = isCareerActive;
    }
    if (this.careerTeamLockNoteEl) {
      this.careerTeamLockNoteEl.style.display = isCareerActive ? 'block' : 'none';
    }
    if (this.careerStatsSummaryEl) {
      this.careerStatsSummaryEl.textContent =
        `Gare: ${s.racesCompleted} • Vittorie: ${s.wins} • Podi: ${s.podiums} • Pole: ${s.poles} • Punti: ${s.points}`;
    }

    this.updateMultiplayerUI();
    this._notifyShowroom();
  }

  _populateSkyOptions() {
    if (!this.skySelectEls || this.skySelectEls.length === 0) return;
    const options = [
      SKY_SELECTOR_OPTIONS[0],
      { id: 'auto', label: 'Automatico (Tramonto / Notte GP)' },
      ...SKY_SELECTOR_OPTIONS.slice(1),
    ];
    const markup = options
      .map((opt) => `<option value="${opt.id}">${opt.label}</option>`)
      .join('');
    for (const sel of this.skySelectEls) {
      sel.innerHTML = markup;
      sel.value = this.state.skyPreset;
    }
  }

  setPhysicsSettings(nextSettings) {
    this.state.physicsSettings = normalizePhysicsSettings(nextSettings);
    this._syncPhysicsUI();
  }

  _syncPhysicsUI() {
    const ps = normalizePhysicsSettings(this.state.physicsSettings);
    this.state.physicsSettings = ps;

    for (const inputEl of this.physicsToggleEls) {
      const key = inputEl.dataset.physicsToggle;
      if (key && key in ps) {
        inputEl.checked = Boolean(ps[key]);
      }
    }
    if (this.botAiSliderEl && document.activeElement !== this.botAiSliderEl) {
      this.botAiSliderEl.value = String(ps.botAiLevel);
    }
    if (this.botAiValEl) {
      this.botAiValEl.textContent = `${ps.botAiLevel}%`;
    }
    if (this.physicsSummaryEl) {
      const activeCount = PHYSICS_TOGGLE_DEFS.filter((d) => Boolean(ps[d.key])).length;
      const diffProfile = getDifficultyConfig(ps);
      this.physicsSummaryEl.textContent =
        `${activeCount}/${PHYSICS_TOGGLE_DEFS.length} moduli fisici attivi • Bot IA ${ps.botAiLevel}% (${diffProfile.label}).`;
    }
  }

  _syncSettingsTabsUI() {
    const active = this.activeSettingsTab || 'physics';
    this.settingsTabBtns.forEach((btn) => {
      const isAct = btn.dataset.settingsTab === active;
      btn.classList.toggle('is-active', isAct);
      btn.setAttribute('aria-selected', isAct ? 'true' : 'false');
    });
    this.settingsPanelEls.forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.settingsPanel === active);
    });
  }

  _startKeybindCapture(actionId) {
    const def = KEYBIND_ACTIONS.find((a) => a.id === actionId);
    if (!def) return;
    this._capturingActionId = actionId;
    this._keybindStatusMessage = `Premi il nuovo tasto per "${def.label}"… (ESC per annullare)`;
    if (this.onKeybindCaptureChange) {
      this.onKeybindCaptureChange(true);
    }
    this._syncKeybindingsUI();
  }

  _cancelKeybindCapture(statusNote = null) {
    if (!this._capturingActionId) return;
    this._capturingActionId = null;
    if (statusNote) {
      this._keybindStatusMessage = statusNote;
    }
    if (this.onKeybindCaptureChange) {
      this.onKeybindCaptureChange(false);
    }
    this._syncKeybindingsUI();
  }

  _syncKeybindingsUI() {
    const bindings = normalizeKeybindings(this.state.keybindings);
    this.state.keybindings = bindings;

    const renderGroup = (containerEl, groupKey) => {
      if (!containerEl) return;
      const items = KEYBIND_ACTIONS.filter((a) => a.group === groupKey);
      containerEl.innerHTML = items
        .map((action) => {
          const isListening = this._capturingActionId === action.id;
          const labelText = isListening
            ? 'PREMI TASTO…'
            : formatKeyCodeLabel(bindings[action.id]);
          return `
            <div class="f1-keybind-row">
              <div class="f1-keybind-copy">
                <span class="f1-keybind-label">${action.label}</span>
                <span class="f1-keybind-desc">${action.desc}</span>
              </div>
              <button
                type="button"
                class="f1-keybind-btn${isListening ? ' is-listening' : ''}"
                data-rebind-action="${action.id}"
                title="Clicca per cambiare il tasto di ${action.label}"
              >${labelText}</button>
            </div>
          `;
        })
        .join('');

      containerEl.querySelectorAll('[data-rebind-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.rebindAction;
          if (!id) return;
          if (this._capturingActionId === id) {
            this._cancelKeybindCapture('Modifica tasto annullata.');
          } else {
            this._startKeybindCapture(id);
          }
        });
      });
    };

    renderGroup(this.keybindsDrivingEl, 'driving');
    renderGroup(this.keybindsActionsEl, 'actions');

    if (this.allowArrowsToggleEl) {
      this.allowArrowsToggleEl.checked = Boolean(bindings.allowArrowFallback);
    }
    if (this.keybindsStatusEl) {
      this.keybindsStatusEl.textContent = this._keybindStatusMessage;
    }
  }

  setNightQuality(level, note = '') {
    const resolved = getNightQualityConfig(level).id;
    this.state.nightQuality = resolved;
    this._nightQualityAutoNote = note || '';
    this._syncUI();
  }

  buildSessionConfig() {
    if (this.state.mode === 'career') {
      const repDriver = getRepresentativeDriverForTeam(this.careerState.teamId);
      const careerTrack = getCareerCurrentTrack(this.careerState);
      const preset = getCareerWeekendPreset(this.careerState.weekendPresetId);
      return {
        trackId: careerTrack.id,
        mode: 'qualifying',
        difficultyId: this.state.difficultyId,
        physicsSettings: { ...this.state.physicsSettings },
        withBots: true,
        raceLaps: preset.raceLaps,
        lapLimit: null,
        qualifyingStageDurations: { ...preset.qualifyingDurations },
        skyPresetId: 'random',
        playerDriverId: repDriver.id,
        playerGridIndex: 7,
        isCareer: true,
        careerTeamId: this.careerState.teamId,
        careerPresetId: preset.id,
        careerRoundIndex: this.careerState.currentRoundIndex ?? 0,
        careerSeasonNumber: this.careerState.seasonNumber ?? 1,
        playerCustomName: this.careerState.playerName,
        playerCustomCode: this.careerState.playerCode,
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
      physicsSettings: { ...this.state.physicsSettings },
      withBots: isPractice ? this.state.withBots : true,
      raceLaps: chosenRaceLaps,
      lapLimit: isPractice
        ? (this.state.lapType === 'infinite' ? null : finiteCount)
        : this.state.mode === 'qualifying'
          ? null
          : chosenRaceLaps,
      weather: this.state.weather,
      skyPresetId: this.state.skyPreset,
      playerDriverId: this.state.playerDriverId,
      playerGridIndex: isPractice && !this.state.withBots ? 0 : 7,
      isCareer: false,
      customPrimaryColor: null,
      paintRoughness: 0.22,
      paintMetalness: 0.35,
    };
  }

  open() {
    if (this._menuCloseTimer) {
      clearTimeout(this._menuCloseTimer);
      this._menuCloseTimer = null;
    }
    if (this._menuOpenRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._menuOpenRaf);
      this._menuOpenRaf = null;
    }
    this.isOpen = true;
    this.modalManager.syncVisibility('pause-modal', false);
    if (typeof document !== 'undefined') {
      document.body.classList.add('is-garage-open');
    }
    this._syncUI();
    if (this.modalEl) {
      this.modalEl.classList.remove('is-menu-closing');
      this.modalEl.classList.add('is-menu-entering');
      this.modalEl.style.display = 'flex';
      if (typeof requestAnimationFrame === 'function') {
        this._menuOpenRaf = requestAnimationFrame(() => {
          this._menuOpenRaf = null;
          this.modalEl?.classList.remove('is-menu-entering');
        });
      } else {
        this.modalEl.classList.remove('is-menu-entering');
      }
    }
    this._notifyShowroom();
  }

  close(options = {}) {
    const instant = Boolean(options?.instant);
    if (this._menuCloseTimer) {
      clearTimeout(this._menuCloseTimer);
      this._menuCloseTimer = null;
    }
    if (this._menuOpenRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._menuOpenRaf);
      this._menuOpenRaf = null;
    }
    this.isOpen = false;
    this.profileModalOpen = false;
    if (this.activeTab === 'settings' || this.activeTab === 'multiplayer') {
      this.activeTab = 'home';
    }
    this.modalManager.syncVisibility('gp-customize-subcard', false);
    this.modalManager.syncVisibility('gp-multiplayer-popup', false);
    this.modalManager.syncVisibility('gp-settings-popup', false);
    this.modalManager.syncVisibility('career-season-modal', false);
    this.modalManager.syncVisibility('career-reset-confirm-modal', false);
    if (typeof document !== 'undefined') {
      document.body.classList.remove('is-garage-open');
    }
    if (this.modalEl) {
      this.modalEl.classList.remove('is-menu-entering');
      if (instant) {
        this.modalEl.classList.remove('is-menu-closing');
        this.modalEl.style.display = 'none';
      } else {
        this.modalEl.classList.add('is-menu-closing');
        this._menuCloseTimer = setTimeout(() => {
          this._menuCloseTimer = null;
          if (!this.isOpen && this.modalEl) {
            this.modalEl.style.display = 'none';
            this.modalEl.classList.remove('is-menu-closing');
          }
        }, 235);
      }
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
