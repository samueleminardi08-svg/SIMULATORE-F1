/**
 * Gestore dell'interfaccia HUD 4K stile F1 TV (Step 4 & Step 5).
 * - A sinistra a tutta altezza: sessione, tempi 2x2 e torre delta con tutti i 22 piloti senza scroll
 *   e scorrimento GPU (translate3d) delle righe durante i sorpassi con dirty-checking DOM a 60 FPS.
 * - In basso al centro: barra dei 3 settori ufficiali (S1, S2, S3) colorati
 *   in viola/verde/giallo e telemetria centrale (tempo giro m:ss.SSS, delta, marcia, km/h, RPM, superficie).
 */

import {
  CAR_PHYSICS_CONFIG,
  SURFACE_PHYSICS,
  TIMING_CONFIG,
  TIRE_COMPOUNDS,
  WEATHER_CONFIG,
} from '../config/constants.js';
import { getDifficultyConfig } from '../config/difficulty.js';
import {
  formatKeyCodeLabel,
  loadKeybindings,
  normalizeKeybindings,
} from '../config/keybindings.js';
import { PHYSICS_TOGGLE_DEFS, normalizePhysicsSettings } from '../config/physicsSettings.js';
import { computePitStopVisualState } from '../race/PitLaneManager.js';
import { CAREER_RACE_LAPS, RACE_TOTAL_LAPS } from '../config/f1_2026_data.js';
import { formatAwardsSummary } from '../career/F1Awards.js';
import { evaluateLapRecord, evaluateSectorRecord } from '../career/TrackRecordsStorage.js';
import { formatDeltaTime, formatLapTime, formatSectorTime } from '../race/TimingSystem.js';
import { computeCarTelemetrySnapshot } from '../physics/PhysicsDiagnostics.js';
import { queryPitLane } from '../tracks/PitLaneGeometry.js';
import { getCarTrackRecoveryState } from '../core/WorldState.js';
import { ModalManager } from './ModalManager.js';
import { getTeamLogoUrl, TEAM_LOGO_INVERT_ON_DARK } from './UiTheme.js';
import { getSkyPresetById } from '../rendering/SkyPresets.js';

const COMPOUND_POOL = ['S', 'S', 'M', 'M', 'H'];

function resolveDriverCompound(rowData, sessionMode, weather, carRef = null) {
  const realComp = carRef?.aeroTire?.compound;
  if (realComp && TIRE_COMPOUNDS[realComp]) return realComp;
  if (weather === 'rain') return 'W';
  if (sessionMode === 'qualifying') return 'S';
  const seed = Number(rowData?.driverNumber) || Number(rowData?.position) || 1;
  return COMPOUND_POOL[seed % COMPOUND_POOL.length];
}

function getLogoClassName(teamId, baseClass) {
  const key = String(teamId || '').toLowerCase();
  if (TEAM_LOGO_INVERT_ON_DARK.has(key)) return `${baseClass} is-invert-dark`;
  if (key === 'alpine') return `${baseClass} is-alpine-tint`;
  return baseClass;
}

function extractDriverSurname(driverName, fallbackCode) {
  const clean = String(driverName || '').trim();
  if (!clean) return String(fallbackCode || 'PIL').replace(/\*$/, '').toUpperCase();
  const parts = clean.split(/\s+/);
  return parts[parts.length - 1].toUpperCase();
}

function getRpmBarColor(rpmRatio) {
  if (rpmRatio >= 0.88) return '#a855f7'; // Viola cambiata
  if (rpmRatio >= 0.72) return '#ef4444'; // Rosso zona alta
  if (rpmRatio >= 0.5) return '#f59e0b';  // Ambra
  return '#22c55e';                       // Verde
}

function getDeltaColorClass(deltaSeconds, isOverallBestPace = false) {
  if (deltaSeconds === null || deltaSeconds === undefined || !Number.isFinite(deltaSeconds)) {
    return 'delta-neutral';
  }
  if (isOverallBestPace && deltaSeconds < -0.001) return 'delta-purple';
  if (deltaSeconds < -0.001) return 'delta-green';
  if (deltaSeconds > 0.001) return 'delta-yellow';
  return 'delta-neutral';
}

function formatTimerMMSS(seconds) {
  const safe = Math.max(0, Math.ceil(seconds ?? 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export class HudOverlay {
  constructor(options = {}) {
    this.onCareerRaceFinished = options.onCareerRaceFinished || null;
    this.onFinishModalClose = options.onFinishModalClose || null;
    this.onQualiModalClose = options.onQualiModalClose || null;
    this.onTrackRecordUpdated = options.onTrackRecordUpdated || null;
    this.modalManager = options.modalManager || new ModalManager();
    this._roomCode = '';
    this._roomRole = 'offline';

    this.trackNameEl = document.getElementById('track-name');
    this.cameraLabelEl = document.getElementById('camera-label');
    this.roomBadgeEl = document.getElementById('hud-room-badge');

    // Pannello sinistro: Hero Giri / Cronometro Q, Best Lap & Settori in risalto, Classifica Gara
    this.heroSessionBoxEl = document.getElementById('hud-hero-session-box');
    this.heroStageEl = document.getElementById('hud-hero-stage');
    this.lapNumberEl = document.getElementById('hud-lap-number');
    this.posBadgeEl = document.getElementById('hud-pos-badge');
    this.leftDeltaBadgeEl = document.getElementById('hud-left-delta');
    this.leftCurrentLapEl = document.getElementById('hud-left-current-lap');
    this.leftLastLapEl = document.getElementById('hud-left-last-lap');
    this.bestLapCardEl = document.getElementById('hud-best-lap-card');
    this.recLapCardEl = document.getElementById('hud-rec-lap-card');
    this.leftBestLapEl = document.getElementById('hud-left-best-lap');
    this.leftOverallBestEl = document.getElementById('hud-left-overall-best');
    this.leftSectorItems = [1, 2, 3].map((n) => ({
      box: document.getElementById(`hud-left-s${n}`),
      timeEl: document.getElementById(`hud-left-s${n}-time`),
    }));
    this.leftDriverRowsEl = document.getElementById('hud-driver-rows');

    // Semaforo partenza F1 (5 luci rosse) & Modale fine gara
    this.startGantryEl = document.getElementById('start-lights-gantry');
    this.startLightsStatusEl = document.getElementById('start-lights-status');
    this.startLightEls = [1, 2, 3, 4, 5].map((n) => document.getElementById(`start-light-${n}`));
    this.raceFinishModalEl = document.getElementById('race-finish-modal');
    this.finishTitleEl = document.getElementById('race-finish-title');
    this.finishSummaryEl = document.getElementById('race-finish-summary');
    this.careerRewardBoxEl = document.getElementById('race-career-reward-box');
    this.finishOpenMenuBtnEl = document.getElementById('finish-open-menu-btn');
    this.finishTableBodyEl = document.getElementById('race-finish-table-body');
    this._finishShown = false;

    // Pannello in basso al centro: 3 Settori F1 e telemetria
    this.sectorsContainerEl = document.getElementById('sectors-bar');
    this.centerLapTimeEl = document.getElementById('center-lap-time');
    this.centerDeltaEl = document.getElementById('center-delta-value');
    this.gearValueEl = document.getElementById('gear-value');
    this.speedValueEl = document.getElementById('speed-value');
    this.rpmValueEl = document.getElementById('rpm-value');
    this.rpmBarFillEl = document.getElementById('rpm-bar-fill');
    this.surfaceBadgeEl = document.getElementById('surface-badge');
    this.weatherBadgeEl = document.getElementById('weather-badge');
    this.tireHealthValueEl = document.getElementById('tire-health-value');
    this.tireBarFillEl = document.getElementById('tire-bar-fill');
    this.tireCompoundBadgeEl = document.getElementById('hud-tire-compound-badge');
    this.tireTempEl = document.getElementById('hud-tire-temp');
    this.grainingChipEl = document.getElementById('hud-graining-chip');
    this.blisteringChipEl = document.getElementById('hud-blistering-chip');
    this.racePitWidgetEl = document.getElementById('hud-race-pit-widget');
    this.boxRequestBtnEl = document.getElementById('hud-box-request-btn');
    this.pitCompLabelEl = document.getElementById('hud-pit-comp-label');
    this.pitCompToastEl = document.getElementById('hud-pit-comp-toast');
    this.nextCompoundBtns = [...document.querySelectorAll('[data-next-compound]')];
    this.pdiagKeyBadgeEl = document.getElementById('pdiag-key-badge');
    this._keybindings = normalizeKeybindings(options.keybindings || loadKeybindings());
    this._pitToastText = '';
    this._pitToastUntil = 0;
    this.pitStopTimerEl = document.getElementById('hud-pitstop-timer');
    this.pitStopClockEl = document.getElementById('hud-pitstop-clock');
    this.pitStopPhaseEl = document.getElementById('hud-pitstop-phase');
    this.pitStopCompoundEl = document.getElementById('hud-pitstop-compound');

    // Grafica AWS F1 TYRE PERFORMANCE in basso a destra
    this.tyreCardEl = document.getElementById('hud-tyre-perf-card');
    this.tyreTeamBarEl = document.getElementById('tyre-card-team-bar');
    this.tyreDriverEl = document.getElementById('tyre-card-driver');
    this.tyrePctEls = {
      fl: document.getElementById('tyre-pct-fl'),
      fr: document.getElementById('tyre-pct-fr'),
      rl: document.getElementById('tyre-pct-rl'),
      rr: document.getElementById('tyre-pct-rr'),
    };
    this.tyreTempEls = {
      fl: document.getElementById('tyre-temp-fl'),
      fr: document.getElementById('tyre-temp-fr'),
      rl: document.getElementById('tyre-temp-rl'),
      rr: document.getElementById('tyre-temp-rr'),
    };
    this.tyreSvgEls = {
      fl: document.getElementById('tyre-svg-fl'),
      fr: document.getElementById('tyre-svg-fr'),
      rl: document.getElementById('tyre-svg-rl'),
      rr: document.getElementById('tyre-svg-rr'),
    };
    this.tyreCompBadgeEl = document.getElementById('tyre-card-comp-badge');
    this.tyreCompNameEl = document.getElementById('tyre-card-comp-name');
    this.tyreStintLapsEl = document.getElementById('tyre-card-stint-laps');
    this.tyreDegBadgeEl = document.getElementById('tyre-card-deg-badge');
    this.downforceValueEl = document.getElementById('downforce-value');
    this.lockupAlertEl = document.getElementById('lockup-alert');
    this.trackLimitsBadgeEl = document.getElementById('track-limits-badge');
    this.trackLimitsBannerEl = document.getElementById('track-limits-banner');
    this.pitReleaseIndicatorEl = document.getElementById('pit-release-indicator');
    this.pitReleaseTextEl = document.getElementById('pit-release-text');
    this.pitReleaseMetaEl = document.getElementById('pit-release-meta');
    this.pitActionBarEl = document.getElementById('hud-pit-action-bar');
    this.pitActionTextEl = document.getElementById('hud-pit-action-text');
    this.exitPitBtnEl = document.getElementById('hud-exit-pit-btn');
    this.quickPitReturnBtnEl = document.getElementById('hud-quick-pit-return-btn');
    this.resetTrackBtnEl = document.getElementById('hud-reset-track-btn');
    this.recoveryProgressEl = document.getElementById('hud-recovery-progress');
    this.recoveryProgressFillEl = document.getElementById('hud-recovery-progress-fill');
    this.recoveryVignetteEl = document.getElementById('recovery-fx-vignette');
    this.trackRecordBannerEl = document.getElementById('track-record-banner');
    this.trackRecordBadgeEl = document.getElementById('track-record-badge');
    this.trackRecordTitleEl = document.getElementById('track-record-title');
    this.trackRecordSubEl = document.getElementById('track-record-sub');
    this._recordsTrackId = null;
    this._seenSectorSeq = 0;
    this._seenLapSeq = 0;
    this._recordBannerUntil = 0;
    this._recordBannerState = null;

    // Qualifiche Q1/Q2/Q3 & Modale riepilogo (Step 8–10)
    this.qualiHudControlsEl = document.getElementById('qualifying-hud-controls');
    this.qualiCutoffInfoEl = document.getElementById('quali-cutoff-info');
    this.qualiSkipVotesInfoEl = document.getElementById('quali-skip-votes-info');
    this.qualiModalEl = document.getElementById('qualifying-modal');
    this.qualiModalTitleEl = document.getElementById('quali-modal-title');
    this.qualiModalSummaryEl = document.getElementById('quali-modal-summary');
    this.qualiModalTableBodyEl = document.getElementById('quali-modal-table-body');
    this.qualiNextBtnEl = document.getElementById('quali-next-btn');
    this.qualiSkipToRaceBtnEl = document.getElementById('quali-skip-to-race-btn');
    this._finishDismissed = false;
    this._lastQualiModalKey = '';
    this._activeQualiModalKey = '';
    this._dismissedQualiModalKey = '';

    this._sectorCards = [];
    this._driverRowById = new Map();
    this._activeDriverIds = new Set();
    this._cameraModeId = 'tcam';

    // Elementi Halo Onboard Telemetry HUD (F1 2026 Broadcast)
    this.haloHudEl = document.getElementById('f1-halo-hud');
    this.haloSpeedKmhEl = document.getElementById('halo-speed-kmh');
    this.haloSpeedMphEl = document.getElementById('halo-speed-mph');
    this.haloSpeedArcEl = document.getElementById('halo-speed-arc');
    this.haloRpmArcEl = document.getElementById('halo-rpm-arc');
    this.haloRechargeArcEl = document.getElementById('halo-recharge-arc');
    this.haloDeployArcEl = document.getElementById('halo-deploy-arc');
    this.haloTireFillEl = document.getElementById('halo-tire-fill');
    this.haloStatusPrimaryEl = document.getElementById('halo-status-primary');
    this.haloStatusPrimaryBgEl = document.getElementById('halo-status-primary-bg');
    this.haloStatusSecondaryEl = document.getElementById('halo-status-secondary');
    this.haloStatusSecondaryBgEl = document.getElementById('halo-status-secondary-bg');
    this.haloDownforceValEl = document.getElementById('halo-downforce-val');
    this.haloTurnStatusEl = document.getElementById('halo-turn-status');
    this.haloTlStatusEl = document.getElementById('halo-tl-status');
    this.haloRivalAheadEl = document.getElementById('halo-rival-ahead');
    this.haloPlayerTagEl = document.getElementById('halo-player-tag');
    this.haloPlayerAccentEl = document.getElementById('halo-player-accent');
    this.haloBrakeSegs = Array.from({ length: 10 }, (_, idx) =>
      document.getElementById(`halo-brake-seg-${idx}`)
    );
    this.haloThrottleSegs = Array.from({ length: 10 }, (_, idx) =>
      document.getElementById(`halo-throttle-seg-${idx}`)
    );
    this.haloGearMap = {
      N: document.getElementById('halo-gear-N'),
      1: document.getElementById('halo-gear-1'),
      2: document.getElementById('halo-gear-2'),
      3: document.getElementById('halo-gear-3'),
      4: document.getElementById('halo-gear-4'),
      5: document.getElementById('halo-gear-5'),
      6: document.getElementById('halo-gear-6'),
      7: document.getElementById('halo-gear-7'),
      8: document.getElementById('halo-gear-8'),
    };
    this.haloCardPosEl = document.getElementById('halo-card-pos');
    this.haloCardLogoEl = document.getElementById('halo-card-logo');
    this.haloCardNameEl = document.getElementById('halo-card-name');
    this.haloCardCompoundEl = document.getElementById('halo-card-compound');
    this.haloCardAccentEl = document.getElementById('halo-card-accent');
    this.haloCardLapEl = document.getElementById('halo-card-lap');
    this.haloCardRefTimeEl = document.getElementById('halo-card-ref-time');
    this.haloCardRefLabelEl = document.getElementById('halo-card-ref-label');
    this.haloSectorEls = [
      document.getElementById('halo-s1'),
      document.getElementById('halo-s2'),
      document.getElementById('halo-s3'),
    ];

    // Pannello temporaneo Diagnosi Fisica Step 6a (toggle F3)
    this._physicsDebugVisible = false;
    this.pdiagPanelEl = document.getElementById('physics-debug-panel');
    this.pdiagInputsEl = document.getElementById('pdiag-inputs');
    this.pdiagSteerEl = document.getElementById('pdiag-steer');
    this.pdiagRadiusEl = document.getElementById('pdiag-radius');
    this.pdiagLockupRatioEl = document.getElementById('pdiag-lockup-ratio');
    this.pdiagLockupStateEl = document.getElementById('pdiag-lockup-state');
    this.pdiagEnvEl = document.getElementById('pdiag-env');

    this._activeSkyLabel = null;
    this._activeSkyPreset = null;
    this._buildSectorCards();
    this._registerModals();
    this.setKeybindings(this._keybindings);
  }

  setKeybindings(nextBindings) {
    this._keybindings = normalizeKeybindings(nextBindings);
    if (this.pdiagKeyBadgeEl) {
      this._setText(this.pdiagKeyBadgeEl, `[${formatKeyCodeLabel(this._keybindings.physicsDebug)}]`);
    }
    if (this.exitPitBtnEl) {
      this._setText(
        this.exitPitBtnEl,
        `Esci dai Box [${formatKeyCodeLabel(this._keybindings.accelerate)}]`
      );
    }
    if (this.resetTrackBtnEl) {
      this._setText(
        this.resetTrackBtnEl,
        `Rimetti in Pista [${formatKeyCodeLabel(this._keybindings.resetToTrack)}]`
      );
    }
  }

  notifyTrackReset() {
    this._pitToastText = 'VETTURA RIMESSA IN PISTA — PROTEZIONE 2s';
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this._pitToastUntil = now + 2600;
  }

  notifyPitCompoundChanged(compoundId, fittedNow = false) {
    const spec = TIRE_COMPOUNDS[compoundId];
    if (!spec) return;
    this._pitToastText = fittedNow
      ? `GOMME MONTATE AI BOX: ${spec.name.toUpperCase()} (${spec.id})`
      : `PROSSIMO PIT STOP: ${spec.name.toUpperCase()} (${spec.id})`;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this._pitToastUntil = now + 2600;
  }

  setSkyLabel(label) {
    this._activeSkyLabel = label || null;
  }

  setSkyPreset(preset) {
    this._activeSkyPreset = preset || null;
    this._activeSkyLabel = preset?.label || preset?.shortLabel || null;
  }

  _setAttr(el, name, value) {
    if (!el) return;
    const str = String(value ?? '');
    const cache = (el.__hudAttrs ||= {});
    if (cache[name] !== str) {
      cache[name] = str;
      el.setAttribute(name, str);
    }
  }

  _setText(el, value) {
    if (!el) return;
    const str = String(value ?? '');
    if (el.__hudText !== str) {
      el.__hudText = str;
      el.textContent = str;
    }
  }

  _setClass(el, className) {
    if (!el) return;
    if (el.__hudClass !== className) {
      el.__hudClass = className;
      el.className = className;
    }
  }

  _setDisplay(el, display) {
    if (!el) return;
    if (el.__hudDisplay !== display) {
      el.__hudDisplay = display;
      el.style.display = display;
    }
  }

  _setStyle(el, prop, value) {
    if (!el) return;
    const cache = (el.__hudStyles ||= {});
    if (cache[prop] !== value) {
      cache[prop] = value;
      el.style[prop] = value;
    }
  }

  _setCssVar(el, name, value) {
    if (!el) return;
    const cache = (el.__hudVars ||= {});
    if (cache[name] !== value) {
      cache[name] = value;
      el.style.setProperty(name, value);
    }
  }

  _registerModals() {
    this.modalManager.register('race-finish-modal', {
      element: this.raceFinishModalEl,
      onClose: () => {
        this._finishShown = false;
        this._finishDismissed = true;
        if (this.careerRewardBoxEl) {
          this.careerRewardBoxEl.style.display = 'none';
        }
        if (this.onFinishModalClose) {
          this.onFinishModalClose();
        }
      },
    });

    this.modalManager.register('qualifying-modal', {
      element: this.qualiModalEl,
      onClose: () => {
        this._dismissedQualiModalKey = this._activeQualiModalKey;
        this._lastQualiModalKey = '';
        if (this.onQualiModalClose) {
          this.onQualiModalClose();
        }
      },
    });
  }

  resetDismissedModals() {
    this._dismissedQualiModalKey = '';
  }

  resetTrackRecordTracking(trackId = null) {
    this._recordsTrackId = trackId || null;
    this._seenSectorSeq = 0;
    this._seenLapSeq = 0;
    this._recordBannerUntil = 0;
    this._recordBannerState = null;
    this._setDisplay(this.trackRecordBannerEl, 'none');
  }

  setTrackName(name) {
    this._setText(this.trackNameEl, name);
  }

  setCameraLabel(label) {
    this._setText(this.cameraLabelEl, label);
  }

  setCameraMode(mode) {
    if (!mode) return;
    this._cameraModeId = mode.id || 'tcam';
    this.setCameraLabel(mode.label || '');
    if (typeof document !== 'undefined' && document.body) {
      document.body.dataset.cameraMode = this._cameraModeId;
    }
  }

  togglePhysicsDebugPanel(forceState = null) {
    this._physicsDebugVisible =
      typeof forceState === 'boolean' ? forceState : !this._physicsDebugVisible;
    if (this.pdiagPanelEl) {
      this._setClass(
        this.pdiagPanelEl,
        this._physicsDebugVisible ? 'is-visible' : ''
      );
      this._setAttr(
        this.pdiagPanelEl,
        'aria-hidden',
        this._physicsDebugVisible ? 'false' : 'true'
      );
    }
    return this._physicsDebugVisible;
  }

  setRoomInfo(roomCode = '', role = 'offline') {
    this._roomCode = roomCode || '';
    this._roomRole = role || 'offline';
    this._lastQualiModalKey = '';
  }

  _buildSectorCards() {
    if (!this.sectorsContainerEl) return;
    this.sectorsContainerEl.innerHTML = '';
    this._sectorCards = [];

    const count = TIMING_CONFIG.sectorCount;
    for (let i = 0; i < count; i++) {
      const card = document.createElement('div');
      card.className = 'sector-card status-pending';

      const headerRow = document.createElement('div');
      headerRow.className = 'sector-card-header';

      const labelEl = document.createElement('span');
      labelEl.className = 'sector-card-label';
      labelEl.textContent = `SETTORE ${i + 1}`;

      const timeEl = document.createElement('span');
      timeEl.className = 'sector-card-time';
      timeEl.textContent = '--.---';

      headerRow.append(labelEl, timeEl);

      const barEl = document.createElement('div');
      barEl.className = 'sector-card-bar';

      card.append(headerRow, barEl);
      this.sectorsContainerEl.appendChild(card);
      this._sectorCards.push({ card, timeEl });
    }
  }

  _updateSurfaceBadge(carState) {
    if (!this.surfaceBadgeEl) return;

    if (carState.collidingWithBarrier) {
      this._setText(this.surfaceBadgeEl, 'Urto Barriera!');
      this._setClass(this.surfaceBadgeEl, 'surface-badge surface-barrier');
      return;
    }

    if (carState.pitState === 'IN_GARAGE') {
      this._setText(this.surfaceBadgeEl, 'Nel Box');
      this._setClass(this.surfaceBadgeEl, 'surface-badge surface-pitlane');
      return;
    }
    if (carState.pitState === 'EXITING_GARAGE') {
      this._setText(this.surfaceBadgeEl, 'Uscita Box');
      this._setClass(this.surfaceBadgeEl, 'surface-badge surface-pitlane');
      return;
    }
    if (carState.pitState === 'AUTO_PARKING') {
      this._setText(this.surfaceBadgeEl, 'Parcheggio Box');
      this._setClass(this.surfaceBadgeEl, 'surface-badge surface-pitlane');
      return;
    }
    if (carState.pitState === 'PARKED_STAGE_END') {
      this._setText(this.surfaceBadgeEl, 'Ai Box');
      this._setClass(this.surfaceBadgeEl, 'surface-badge surface-pitlane');
      return;
    }
    if (carState.pitState === 'AUTO_BOX_STOP') {
      this._setText(this.surfaceBadgeEl, 'Ingresso Box (Auto)');
      this._setClass(this.surfaceBadgeEl, 'surface-badge surface-pitlane');
      return;
    }
    if (carState.pitState === 'PIT_STOPPING') {
      this._setText(this.surfaceBadgeEl, 'Pit Stop');
      this._setClass(this.surfaceBadgeEl, 'surface-badge surface-pitlane');
      return;
    }
    if (carState.pitState === 'IN_PIT_BOX') {
      this._setText(this.surfaceBadgeEl, 'Fermo al Box');
      this._setClass(this.surfaceBadgeEl, 'surface-badge surface-pitlane');
      return;
    }
    if (carState.pitQueueAutoActive) {
      this._setText(this.surfaceBadgeEl, 'Coda Auto (2m)');
      this._setClass(this.surfaceBadgeEl, 'surface-badge surface-pitlane');
      return;
    }
    if (carState.pitLimiterActive) {
      this._setText(this.surfaceBadgeEl, `Pit Limit ${carState.pitLimitKmh || 80}`);
      this._setClass(this.surfaceBadgeEl, 'surface-badge surface-pitlane');
      return;
    }

    const surfaceKey = carState.surface || 'asphalt';
    const props = SURFACE_PHYSICS[surfaceKey] || SURFACE_PHYSICS.asphalt;
    this._setText(this.surfaceBadgeEl, props.label);
    this._setClass(this.surfaceBadgeEl, `surface-badge surface-${surfaceKey}`);
  }

  _updateSectors(timing) {
    if (!timing) return;

    const showLastLapTail =
      timing.currentLapTime < 3.5 &&
      Array.isArray(timing.lastLapSectorStatuses) &&
      Array.isArray(timing.lastLapSectorTimes);

    const sectorCount = Math.max(this._sectorCards.length, this.leftSectorItems.length);
    for (let i = 0; i < sectorCount; i++) {
      let status = timing.currentSectorStatuses[i] || 'pending';
      let secTime = timing.currentSectorTimes[i];

      if (status === 'pending' && showLastLapTail) {
        status = timing.lastLapSectorStatuses[i] || 'pending';
        secTime = timing.lastLapSectorTimes[i];
      } else if (timing.lapStarted && i === timing.currentSectorIndex && secTime === null) {
        secTime = Math.max(0, timing.currentLapTime - timing.sectorStartTime);
      }

      const isActive = timing.lapStarted && i === timing.currentSectorIndex;
      const formattedTime = formatSectorTime(secTime);

      const bottomItem = this._sectorCards[i];
      if (bottomItem) {
        this._setClass(bottomItem.card, `sector-card status-${status}${isActive ? ' is-active' : ''}`);
        this._setText(bottomItem.timeEl, formattedTime);
      }

      const leftItem = this.leftSectorItems[i];
      if (leftItem?.box) {
        this._setClass(leftItem.box, `left-sector-box status-${status}${isActive ? ' is-active' : ''}`);
        this._setText(leftItem.timeEl, formattedTime);
      }
    }
  }

  _updateLeftDeltaPanel(worldState, localPlayerId) {
    const playerCar = worldState.getCar(localPlayerId);
    const sessionTiming = worldState.sessionTiming;
    const race = worldState.raceState;
    if (!playerCar || !playerCar.timing) return;

    const t = playerCar.timing;

    const q = worldState.qualifyingState;
    const isQuali = Boolean(q && race?.mode === 'qualifying');
    const sessionMode = worldState.sessionConfig?.mode || race?.mode || 'practice';

    if (this.lapNumberEl) {
      let stageTag = 'GIRO';
      let heroVal;
      let heroCls = 'hud-hero-session is-race';

      if (isQuali) {
        stageTag = q.stageId || 'Q1';
        const rem = Math.max(0, q.timeRemaining ?? 0);
        const isFlagged = q.status === 'chequered_flag' || q.status === 'in_lap' || rem <= 0;
        heroVal = isFlagged ? '00:00' : formatTimerMMSS(rem);
        heroCls = `hud-hero-session is-quali${
          isFlagged ? ' is-flag' : rem <= 15 ? ' is-urgent' : rem <= 45 ? ' is-warn' : ''
        }`;
      } else if (race && race.totalLaps !== null) {
        stageTag = playerCar.raceFinished ? 'FINE' : 'GIRO';
        const displayLap = Math.min(t.currentLap, race.totalLaps);
        heroVal = `${displayLap} / ${race.totalLaps}`;
        heroCls = 'hud-hero-session is-race';
      } else {
        stageTag = 'GIRO';
        heroVal = `${t.currentLap} / ∞`;
        heroCls = 'hud-hero-session is-practice';
      }

      this._setText(this.heroStageEl, stageTag);
      this._setText(this.lapNumberEl, heroVal);
      this._setClass(this.heroSessionBoxEl, heroCls);
    }

    if (this.posBadgeEl) {
      if (isQuali) {
        this._setDisplay(this.posBadgeEl, 'inline-block');
        this._setText(this.posBadgeEl, `P${playerCar.racePosition} / ${q.activeDriverIds.length}`);
      } else if (race && race.standings.length > 1) {
        this._setDisplay(this.posBadgeEl, 'inline-block');
        this._setText(this.posBadgeEl, `P${playerCar.racePosition} / ${race.standings.length}`);
      } else {
        this._setDisplay(this.posBadgeEl, 'none');
      }
    }

    const lapInvalid =
      Boolean(t.currentLapInvalidated) &&
      (sessionMode === 'qualifying' || sessionMode === 'practice');

    const deltaFormatted = lapInvalid ? 'ANNULLATO' : formatDeltaTime(t.liveDelta);
    const deltaClass = lapInvalid ? 'delta-invalid' : getDeltaColorClass(t.liveDelta, false);

    if (this.leftDeltaBadgeEl) {
      this._setText(this.leftDeltaBadgeEl, deltaFormatted);
      this._setClass(this.leftDeltaBadgeEl, `delta-pill ${deltaClass}`);
    }
    if (this.leftCurrentLapEl) {
      this._setText(this.leftCurrentLapEl, formatLapTime(t.currentLapTime));
      this._setClass(this.leftCurrentLapEl, `lap-time-val${lapInvalid ? ' is-invalidated' : ''}`);
    }
    if (this.leftLastLapEl) {
      this._setText(this.leftLastLapEl, formatLapTime(t.lastLapTime));
    }
    if (this.leftBestLapEl) {
      this._setText(this.leftBestLapEl, formatLapTime(t.bestLapTime));
    }
    if (this.bestLapCardEl) {
      const holdsOverallBest =
        t.bestLapTime !== null &&
        sessionTiming?.overallBestLapTime !== null &&
        Math.abs(t.bestLapTime - sessionTiming.overallBestLapTime) < 0.0005;
      this._setClass(
        this.bestLapCardEl,
        `lap-highlight-card is-personal${holdsOverallBest ? ' is-overall-holder' : ''}`
      );
    }
    if (this.leftOverallBestEl && sessionTiming) {
      this._setText(this.leftOverallBestEl, formatLapTime(sessionTiming.overallBestLapTime));
    }

    if (this.leftDriverRowsEl) {
      const standings = race?.standings?.length
        ? race.standings
        : Object.values(worldState.cars).map((car, idx) => ({
            id: car.id,
            position: idx + 1,
            code: car.code || (car.id === localPlayerId ? 'TU' : car.id.slice(0, 3).toUpperCase()),
            driverNumber: car.driverNumber ?? 1,
            teamId: car.teamId || 'ferrari',
            color: car.color || '#38bdf8',
            bestLapTime: car.timing?.bestLapTime ?? null,
            gapToLeader: car.timing ? formatDeltaTime(car.timing.liveDelta) : '±0.000',
            raceFinished: car.raceFinished,
          }));

      this._setCssVar(
        this.leftDriverRowsEl,
        '--tower-count',
        String(Math.max(1, standings.length))
      );

      const weather = worldState.weather || 'dry';
      this._activeDriverIds.clear();
      for (let i = 0; i < standings.length; i++) {
        const rowData = standings[i];
        const carId = String(rowData.id ?? `slot-${i}`);
        this._activeDriverIds.add(carId);

        let item = this._driverRowById.get(carId);
        if (!item) {
          const row = document.createElement('div');
          row.className = 'driver-delta-row';

          const posEl = document.createElement('span');
          posEl.className = 'driver-pos';
          const colorEl = document.createElement('span');
          colorEl.className = 'driver-color-bar';
          const logoWrapEl = document.createElement('span');
          logoWrapEl.className = 'driver-team-logo-wrap';
          const logoEl = document.createElement('img');
          logoEl.className = 'driver-team-logo';
          logoEl.alt = '';
          logoEl.draggable = false;
          logoWrapEl.appendChild(logoEl);
          const codeEl = document.createElement('span');
          codeEl.className = 'driver-code';
          const deltaEl = document.createElement('span');
          deltaEl.className = 'driver-delta';
          const compoundEl = document.createElement('span');
          compoundEl.className = 'driver-compound compound-s';

          row.append(posEl, colorEl, logoWrapEl, codeEl, deltaEl, compoundEl);
          this._setCssVar(row, '--slot', String(i));
          this._setDisplay(row, 'flex');
          this.leftDriverRowsEl.appendChild(row);

          item = {
            row,
            posEl,
            colorEl,
            logoEl,
            codeEl,
            deltaEl,
            compoundEl,
            lastSlot: i,
            lastVisible: true,
          };
          this._driverRowById.set(carId, item);
        } else if (!item.lastVisible) {
          // Posiziona sullo slot prima di mostrare la riga per evitare animazioni residue dalla sessione precedente
          this._setCssVar(item.row, '--slot', String(i));
          this._setDisplay(item.row, 'flex');
          item.lastVisible = true;
          item.lastSlot = i;
        } else if (item.lastSlot !== i) {
          this._setCssVar(item.row, '--slot', String(i));
          item.lastSlot = i;
        }

        const isLocal = rowData.id === localPlayerId;
        const isLeader = rowData.position === 1;
        const isCutoffFirst =
          Boolean(rowData.inEliminationZone) &&
          (i === 0 || !standings[i - 1]?.inEliminationZone);
        const cleanCode = String(rowData.code || 'PIL').replace(/\*$/, '').toUpperCase();
        const carRef = worldState.cars?.[rowData.id];
        const teamId = rowData.teamId || carRef?.teamId || 'ferrari';
        const logoUrl = getTeamLogoUrl(teamId);
        const compound = resolveDriverCompound(rowData, sessionMode, weather, carRef);

        let gapDisplay = rowData.gapToLeader;
        if (
          isLeader &&
          sessionMode === 'practice' &&
          rowData.bestLapTime !== null &&
          rowData.bestLapTime !== undefined
        ) {
          gapDisplay = formatLapTime(rowData.bestLapTime);
        }

        this._setClass(
          item.row,
          `driver-delta-row${isLeader ? ' is-leader' : ''}${isLocal ? ' is-local' : ''}${
            rowData.inEliminationZone ? ' is-elim-zone' : ''
          }${isCutoffFirst ? ' is-elim-cutoff' : ''}`
        );
        this._setText(item.posEl, String(rowData.position));
        this._setStyle(item.colorEl, 'backgroundColor', rowData.color || '#38bdf8');
        if (logoUrl) {
          this._setAttr(item.logoEl, 'src', logoUrl);
          this._setClass(item.logoEl, getLogoClassName(teamId, 'driver-team-logo'));
          this._setDisplay(item.logoEl, 'block');
        } else {
          this._setDisplay(item.logoEl, 'none');
        }
        this._setText(item.codeEl, cleanCode);
        this._setText(item.deltaEl, gapDisplay);
        this._setClass(
          item.deltaEl,
          `driver-delta ${
            isLeader
              ? 'delta-purple'
              : rowData.penaltySeconds > 0
                ? 'delta-invalid'
                : 'delta-neutral'
          }`
        );
        this._setText(item.compoundEl, compound);
        this._setClass(item.compoundEl, `driver-compound compound-${compound.toLowerCase()}`);
      }

      for (const [carId, item] of this._driverRowById.entries()) {
        if (!this._activeDriverIds.has(carId) && item.lastVisible) {
          this._setDisplay(item.row, 'none');
          item.lastVisible = false;
          item.lastSlot = -1;
        }
      }
    }
  }

  hideRaceFinish(keepDismissed = false) {
    this._finishShown = false;
    if (!keepDismissed) {
      this._finishDismissed = false;
    }
    this.modalManager.syncVisibility('race-finish-modal', false);
    if (this.careerRewardBoxEl) {
      this.careerRewardBoxEl.style.display = 'none';
    }
  }

  hideQualifyingModal() {
    this._lastQualiModalKey = '';
    this.modalManager.syncVisibility('qualifying-modal', false);
  }

  _updateRaceOverlays(worldState, localPlayerId) {
    const race = worldState.raceState;
    if (!race) return;

    if (this.startGantryEl) {
      const showGantry =
        race.status === 'grid_wait' ||
        race.status === 'countdown' ||
        race.lightsOutFlashTimer > 0;
      this._setDisplay(this.startGantryEl, showGantry ? 'flex' : 'none');

      if (showGantry) {
        for (let i = 0; i < this.startLightEls.length; i++) {
          const el = this.startLightEls[i];
          if (!el) continue;
          const isLit = race.status === 'countdown' && i < race.lightsOn;
          this._setClass(el, isLit ? 'start-light is-on' : 'start-light');
        }
        if (this.startLightsStatusEl) {
          if (race.status === 'grid_wait') {
            const waitSec = Math.max(1, Math.ceil(race.gridWaitTimer ?? 0));
            this._setText(
              this.startLightsStatusEl,
              `GRIGLIA DI PARTENZA — SEMAFORI TRA ${waitSec}s`
            );
            this._setClass(this.startLightsStatusEl, 'start-status waiting');
          } else if (race.status === 'countdown') {
            this._setText(this.startLightsStatusEl, 'ATTENDI IL VIA...');
            this._setClass(this.startLightsStatusEl, 'start-status waiting');
          } else {
            this._setText(this.startLightsStatusEl, 'VIA! PARTENZA!');
            this._setClass(this.startLightsStatusEl, 'start-status go');
          }
        }
      }
    }

    if (race.status !== 'finished') {
      this._finishDismissed = false;
      if (this._finishShown) {
        this.hideRaceFinish();
      }
    }

    if (
      race.status === 'finished' &&
      !this._finishShown &&
      !this._finishDismissed &&
      this.raceFinishModalEl
    ) {
      this._finishShown = true;
      this.modalManager.syncVisibility('race-finish-modal', true);

      const playerCar = worldState.getCar(localPlayerId);
      const winner = race.standings[0];
      if (this.finishTitleEl) {
        const lapsText = race.totalLaps !== null ? `${race.totalLaps} Giri` : 'Sessione';
        const modeTitle = race.mode === 'practice' ? 'Fine Prove Libere' : 'Fine Gara';
        this.finishTitleEl.textContent = `Bandiera a Scacchi — ${modeTitle} (${lapsText})`;
      }
      if (this.finishSummaryEl && playerCar) {
        if (race.standings.length === 1) {
          this.finishSummaryEl.textContent = `Sessione completata — Miglior giro: ${formatLapTime(playerCar.timing?.bestLapTime)}`;
        } else {
          this.finishSummaryEl.textContent = `Hai concluso ${playerCar.racePosition}° su ${race.standings.length} — Vincitore: ${winner?.driverName ?? ''} (${winner?.teamName ?? ''})`;
        }
      }

      if (this.careerRewardBoxEl) {
        const isCareer = Boolean(worldState.sessionConfig?.isCareer && race.mode === 'race');
        if (isCareer && playerCar) {
          let reward = worldState.lastCareerReward;
          let careerMetaRes = worldState._lastCareerFinishMeta || null;
          if (!worldState.careerRewardGranted && this.onCareerRaceFinished) {
            const res = this.onCareerRaceFinished(worldState, playerCar);
            if (res?.reward) {
              reward = res.reward;
              worldState.careerRewardGranted = true;
              worldState.lastCareerReward = reward;
            }
            careerMetaRes = res || null;
            worldState._lastCareerFinishMeta = careerMetaRes;
          }
          if (reward) {
            const gridPos = reward.gridPosition ?? playerCar.gridPosition ?? reward.position;
            const finishPos = reward.finishPosition ?? reward.position;
            const awardsSummary = formatAwardsSummary(reward.awards);
            const awardsStr = awardsSummary ? ` • Premi F1: ${awardsSummary}` : '';
            let seasonProgressStr = '';
            if (careerMetaRes?.seasonCompleted && careerMetaRes?.seasonSummary) {
              const ss = careerMetaRes.seasonSummary;
              const fiaSummary = formatAwardsSummary(ss.seasonAwards);
              const fiaStr = fiaSummary ? ` • Titoli FIA: ${fiaSummary}` : '';
              seasonProgressStr = ` • CARRIERA COMPLETATA! Campione Piloti: ${ss.championDriverName} (${ss.championDriverPoints} pt) • Campione Costruttori: ${ss.championTeamName} • Tu: P${ss.playerPosition} (${ss.playerPoints} pt)${fiaStr} — Carriera archiviata nello Storico!`;
            } else if (careerMetaRes?.nextTrack && careerMetaRes?.careerState) {
              const nextR = (careerMetaRes.careerState.currentRoundIndex ?? 0) + 1;
              seasonProgressStr = ` • Prossimo GP: R${String(nextR).padStart(2, '0')}/24 ${careerMetaRes.nextTrack.gpName}`;
            }
            this.careerRewardBoxEl.style.display = 'block';
            this.careerRewardBoxEl.textContent =
              `Risultato Carriera: Griglia P${gridPos} → Arrivo P${finishPos} (+${reward.points} pt)${awardsStr}${seasonProgressStr}`;
          }
          if (this.finishOpenMenuBtnEl) {
            this.finishOpenMenuBtnEl.textContent = 'Menu Carriera';
          }
        } else {
          this.careerRewardBoxEl.style.display = 'none';
          if (this.finishOpenMenuBtnEl) {
            this.finishOpenMenuBtnEl.textContent = 'Menu Sessione';
          }
        }
      }

      if (this.finishTableBodyEl) {
        this.finishTableBodyEl.innerHTML = race.standings
          .map((row) => {
            const isLocal = row.id === localPlayerId;
            const penTag =
              row.penaltySeconds > 0
                ? ` <span class="pen-inline-badge">+${row.penaltySeconds}s TL (${row.trackLimitsCount})</span>`
                : '';
            const timeOrGap =
              row.position === 1 ? `${formatLapTime(row.finishTime)}${penTag}` : row.gapToLeader;
            return `
              <tr class="${isLocal ? 'finish-row-local' : ''}">
                <td>${row.position}°</td>
                <td><span class="finish-team-dot" style="background:${row.color}"></span>#${row.driverNumber} ${row.driverName}</td>
                <td>${row.teamName}</td>
                <td>${formatLapTime(row.bestLapTime)}</td>
                <td>${timeOrGap}</td>
              </tr>
            `;
          })
          .join('');
      }
    }
  }

  /**
   * Aggiorna tutti gli elementi HUD a partire dallo stato corrente di WorldState.
   * @param {import('../core/WorldState.js').WorldState} worldState
   * @param {string} localPlayerId
   */
  render(worldState, localPlayerId) {
    const playerCar = worldState.getCar(localPlayerId);
    const sessionMode = worldState.sessionConfig?.mode || worldState.raceState?.mode || 'practice';

    this._updateSessionBadges(worldState, playerCar);
    this._updateQualifyingOverlays(worldState, localPlayerId);

    if (!playerCar) {
      this._setDisplay(this.trackLimitsBannerEl, 'none');
      this._setDisplay(this.trackRecordBannerEl, 'none');
      this._setDisplay(this.pitActionBarEl, 'none');
      this._setDisplay(this.tyreCardEl, 'none');
      this._setDisplay(this.racePitWidgetEl, 'none');
      this._setDisplay(this.pitStopTimerEl, 'none');
      this._setDisplay(this.recoveryProgressEl, 'none');
      if (this.recoveryVignetteEl) {
        this._setStyle(this.recoveryVignetteEl, 'opacity', '0');
      }
      if (this.pitReleaseIndicatorEl) {
        this._setClass(this.pitReleaseIndicatorEl, 'is-green');
      }
      return;
    }

    this._updateLeftDeltaPanel(worldState, localPlayerId);
    this._checkAndUpdateTrackRecordBanner(worldState, playerCar, sessionMode);

    if (playerCar.timing) {
      const lapInvalid =
        Boolean(playerCar.timing.currentLapInvalidated) &&
        (sessionMode === 'qualifying' || sessionMode === 'practice');

      this._updateSectors(playerCar.timing);
      if (this.centerLapTimeEl) {
        this._setText(this.centerLapTimeEl, formatLapTime(playerCar.timing.currentLapTime));
        this._setClass(this.centerLapTimeEl, `center-lap-time${lapInvalid ? ' is-invalidated' : ''}`);
      }
      if (this.centerDeltaEl) {
        this._setText(
          this.centerDeltaEl,
          lapInvalid ? 'GIRO ANNULLATO' : formatDeltaTime(playerCar.timing.liveDelta)
        );
        this._setClass(
          this.centerDeltaEl,
          `center-delta ${lapInvalid ? 'delta-invalid' : getDeltaColorClass(playerCar.timing.liveDelta)}`
        );
      }
    }

    if (this.speedValueEl) {
      const totalSpeedMs = Math.hypot(playerCar.vx, playerCar.vz);
      this._setText(this.speedValueEl, String(Math.round(totalSpeedMs * 3.6)));
    }
    if (this.gearValueEl) {
      this._setText(this.gearValueEl, playerCar.gearLabel);
    }
    if (this.rpmValueEl && this.rpmBarFillEl) {
      const roundedRpm = Math.round(playerCar.rpm);
      this._setText(this.rpmValueEl, `${roundedRpm} RPM`);
      const rpmRatio = Math.max(
        0,
        Math.min(1, roundedRpm / CAR_PHYSICS_CONFIG.maxRpm)
      );
      const scaleX = (Math.round(rpmRatio * 1000) / 1000).toFixed(3);
      this._setStyle(this.rpmBarFillEl, 'transform', `scaleX(${scaleX})`);
      this._setStyle(this.rpmBarFillEl, 'backgroundColor', getRpmBarColor(rpmRatio));
    }

    this._updateSurfaceBadge(playerCar);
    this._updateAdvancedPhysics(
      playerCar,
      worldState.weather || 'dry',
      worldState.skyPresetId || null
    );
    this._updateTrackLimitsHud(playerCar, sessionMode);
    this._updatePitReleaseIndicator(worldState, playerCar);
    this._updateTyrePerformanceCard(worldState, playerCar);
    this._updateRacePitHud(worldState, playerCar, sessionMode);
    this._updateRaceOverlays(worldState, localPlayerId);
    if (this._cameraModeId === 'tcam') {
      this._updateHaloHud(worldState, playerCar, localPlayerId, sessionMode);
    }
    if (this._physicsDebugVisible) {
      this._updatePhysicsDebugPanel(
        playerCar,
        worldState.weather || 'dry',
        worldState.physicsSettings || worldState.difficultyId
      );
    }
  }

  _checkAndUpdateTrackRecordBanner(worldState, playerCar, sessionMode) {
    const t = playerCar?.timing;
    const trackId = worldState.trackData?.id || worldState.sessionConfig?.trackId || null;

    if (trackId !== this._recordsTrackId) {
      this._recordsTrackId = trackId;
      this._seenSectorSeq = 0;
      this._seenLapSeq = 0;
      this._recordBannerUntil = 0;
      this._recordBannerState = null;
    }

    if (t && trackId && !playerCar.isBot) {
      const curSecSeq = t.sectorCompletionSeq ?? 0;
      const curLapSeq = t.lapCompletionSeq ?? 0;
      if (curSecSeq < this._seenSectorSeq) this._seenSectorSeq = 0;
      if (curLapSeq < this._seenLapSeq) this._seenLapSeq = 0;

      const meta = {
        driverName: playerCar.driverName,
        driverCode: String(playerCar.code || 'PIL').replace(/\*$/, '').toUpperCase(),
        teamId: playerCar.teamId,
        teamName: playerCar.teamName,
        mode: sessionMode,
      };

      let sectorRes = null;
      if (
        t.lastCompletedSector &&
        t.lastCompletedSector.seq > 0 &&
        t.lastCompletedSector.seq !== this._seenSectorSeq
      ) {
        this._seenSectorSeq = t.lastCompletedSector.seq;
        if (t.lastCompletedSector.valid) {
          sectorRes = evaluateSectorRecord(
            trackId,
            t.lastCompletedSector.sectorIndex,
            t.lastCompletedSector.duration,
            meta
          );
        }
      }

      let lapRes = null;
      if (
        t.lastCompletedLap &&
        t.lastCompletedLap.seq > 0 &&
        t.lastCompletedLap.seq !== this._seenLapSeq
      ) {
        this._seenLapSeq = t.lastCompletedLap.seq;
        if (t.lastCompletedLap.valid) {
          lapRes = evaluateLapRecord(
            trackId,
            t.lastCompletedLap.sessionMode || sessionMode,
            t.lastCompletedLap.lapTime,
            meta
          );
        }
      }

      const nowMs =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();

      if (lapRes?.isNewRecord) {
        const catLabel =
          lapRes.category === 'qualifying'
            ? 'QUALIFICA'
            : lapRes.category === 'race'
              ? 'GARA'
              : 'PROVE LIBERE';
        const badge = lapRes.isOverallTrackRecord
          ? 'RECORD ASSOLUTO PISTA'
          : `RECORD ${catLabel}`;
        const title = `NUOVO RECORD ${catLabel} • ${formatLapTime(lapRes.time)}`;
        let sub =
          lapRes.delta !== null
            ? `${formatDeltaTime(lapRes.delta)}s (prec. ${formatLapTime(lapRes.previousTime)})`
            : 'Primo record assoluto su questo circuito!';
        if (sectorRes?.isNewRecord) {
          sub += ` • + RECORD S${sectorRes.sectorIndex + 1} (${formatSectorTime(sectorRes.time)})`;
        }
        this._recordBannerState = { variant: 'trb-lap', badge, title, sub };
        this._recordBannerUntil = nowMs + 5000;
        if (this.onTrackRecordUpdated) {
          this.onTrackRecordUpdated(trackId);
        }
      } else if (sectorRes?.isNewRecord) {
        const secNum = sectorRes.sectorIndex + 1;
        const badge = `RECORD ASSOLUTO S${secNum}`;
        const title = `NUOVO MIGLIOR SETTORE ${secNum} DI SEMPRE • ${formatSectorTime(sectorRes.time)}`;
        const sub =
          sectorRes.delta !== null
            ? `${formatDeltaTime(sectorRes.delta)}s (prec. ${formatSectorTime(sectorRes.previousTime)})`
            : 'Primo miglior settore assoluto su questa pista!';
        this._recordBannerState = { variant: 'trb-sector', badge, title, sub };
        this._recordBannerUntil = nowMs + 4200;
        if (this.onTrackRecordUpdated) {
          this.onTrackRecordUpdated(trackId);
        }
      }
    }

    if (this.trackRecordBannerEl) {
      const nowMs =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      if (this._recordBannerState && nowMs < this._recordBannerUntil) {
        this._setDisplay(this.trackRecordBannerEl, 'flex');
        this._setClass(this.trackRecordBannerEl, this._recordBannerState.variant);
        this._setText(this.trackRecordBadgeEl, this._recordBannerState.badge);
        this._setText(this.trackRecordTitleEl, this._recordBannerState.title);
        this._setText(this.trackRecordSubEl, this._recordBannerState.sub);
      } else {
        this._setDisplay(this.trackRecordBannerEl, 'none');
      }
    }
  }

  _updatePhysicsDebugPanel(playerCar, weatherId, difficultyId) {
    const snap = computeCarTelemetrySnapshot(playerCar, weatherId, difficultyId);
    if (!snap) return;

    this._setText(
      this.pdiagInputsEl,
      `${snap.throttleInput.toFixed(2)} / ${snap.brakeInput.toFixed(2)} / ${snap.steerInput.toFixed(2)}`
    );
    this._setText(
      this.pdiagSteerEl,
      `${snap.steerAngleDeg.toFixed(1)}° → ${snap.effectiveSteerDeg.toFixed(1)}°`
    );
    const radiusStr = snap.turnRadiusM !== null ? `${snap.turnRadiusM.toFixed(1)} m` : '∞ m';
    this._setText(this.pdiagRadiusEl, `${radiusStr} / ${snap.lateralG.toFixed(2)} G`);

    const resStr = Number.isFinite(snap.lockupResistance)
      ? snap.lockupResistance.toFixed(2)
      : 'ABS';
    this._setText(this.pdiagLockupRatioEl, `${snap.brakeDemand.toFixed(2)} / ${resStr}`);
    this._setClass(
      this.pdiagLockupRatioEl,
      `pdiag-val ${snap.wheelLockup ? 'is-danger' : snap.brakeDemand > 0 ? 'is-warn' : ''}`
    );

    const holdMs = Math.round(snap.brakeHoldTime * 1000);
    if (snap.wheelLockup) {
      this._setText(this.pdiagLockupStateEl, `LOCKUP (${holdMs}ms)`);
      this._setClass(this.pdiagLockupStateEl, 'pdiag-val is-danger');
    } else if (snap.highSpeedBraking) {
      this._setText(this.pdiagLockupStateEl, `HARD BRAKE (${holdMs}ms)`);
      this._setClass(this.pdiagLockupStateEl, 'pdiag-val is-warn');
    } else {
      this._setText(this.pdiagLockupStateEl, `GRIP OK (${holdMs}ms)`);
      this._setClass(this.pdiagLockupStateEl, 'pdiag-val is-ok');
    }

    this._setText(
      this.pdiagEnvEl,
      `${snap.surface} / ${snap.weatherId} • [${snap.compound}] ${snap.tireTempC}°C G:${snap.grainingPct}% B:${snap.blisteringPct}%`
    );
  }

  _updateHaloHud(worldState, playerCar, localPlayerId, sessionMode) {
    if (!this.haloHudEl || !playerCar) return;

    const totalSpeedMs = Math.hypot(playerCar.vx, playerCar.vz);
    const speedKmh = Math.round(totalSpeedMs * 3.6);
    const speedMph = Math.round(speedKmh * 0.621371);
    this._setText(this.haloSpeedKmhEl, String(speedKmh));
    this._setText(this.haloSpeedMphEl, String(speedMph));

    // Arco circolare velocità (270° max -> 334 su circonferenza 446)
    if (this.haloSpeedArcEl) {
      const speedRatio = Math.max(0, Math.min(1, speedKmh / 355));
      const dashOffset = (446 - speedRatio * 334).toFixed(1);
      this._setAttr(this.haloSpeedArcEl, 'stroke-dashoffset', dashOffset);
      this._setAttr(
        this.haloSpeedArcEl,
        'stroke',
        speedRatio > 0.86 ? '#a855f7' : speedRatio > 0.65 ? '#38bdf8' : '#22d3ee'
      );
    }

    // Arco RPM x1000 (lunghezza 172)
    const roundedRpm = Math.round(playerCar.rpm || 0);
    const rpmRatio = Math.max(0, Math.min(1, roundedRpm / CAR_PHYSICS_CONFIG.maxRpm));
    if (this.haloRpmArcEl) {
      const rpmOffset = (172 * (1 - rpmRatio)).toFixed(1);
      this._setAttr(this.haloRpmArcEl, 'stroke-dashoffset', rpmOffset);
      this._setAttr(this.haloRpmArcEl, 'stroke', getRpmBarColor(rpmRatio));
    }

    // Marce R / N / 1..8 lungo l'arco destro (il primo slot mostra 'R' in rosso in retromarcia)
    const activeGear = String(playerCar.gearLabel || 'N');
    const isReverse = activeGear === 'R';
    for (const [gearKey, gearEl] of Object.entries(this.haloGearMap)) {
      if (!gearEl) continue;
      if (gearKey === 'N') {
        this._setText(gearEl, isReverse ? 'R' : 'N');
        this._setAttr(
          gearEl,
          'class',
          isReverse
            ? 'halo-gear-item is-active is-reverse'
            : activeGear === 'N'
              ? 'halo-gear-item is-active'
              : 'halo-gear-item'
        );
      } else {
        this._setAttr(
          gearEl,
          'class',
          gearKey === activeGear ? 'halo-gear-item is-active' : 'halo-gear-item'
        );
      }
    }

    // Segmenti BRAKE (10) e THROTTLE (10)
    const brakeLit = Math.round(Math.max(0, Math.min(1, playerCar.brakeInput || 0)) * 10);
    for (let i = 0; i < this.haloBrakeSegs.length; i++) {
      const seg = this.haloBrakeSegs[i];
      if (!seg) continue;
      this._setAttr(seg, 'fill-opacity', i < brakeLit ? '0.96' : '0.16');
    }

    const throttleLit = Math.round(Math.max(0, Math.min(1, playerCar.throttleInput || 0)) * 10);
    for (let i = 0; i < this.haloThrottleSegs.length; i++) {
      const seg = this.haloThrottleSegs[i];
      if (!seg) continue;
      this._setAttr(seg, 'fill-opacity', i < throttleLit ? '0.96' : '0.16');
    }

    // Barre RECHARGE / DEPLOY / Gomme
    const aero = playerCar.aeroTire;
    const tirePct = Math.max(0, Math.min(1, aero?.tireHealth ?? 1));
    const downforceKg = Math.round(aero?.downforceKg ?? 0);
    if (this.haloRechargeArcEl) {
      const rechargeRatio = Math.max(0.12, Math.min(1, 0.2 + (playerCar.brakeInput || 0) * 0.8));
      this._setAttr(this.haloRechargeArcEl, 'stroke-dashoffset', (74 * (1 - rechargeRatio)).toFixed(1));
    }
    if (this.haloDeployArcEl) {
      const deployRatio = Math.max(0.12, Math.min(1, 0.15 + (playerCar.throttleInput || 0) * 0.85));
      this._setAttr(this.haloDeployArcEl, 'stroke-dashoffset', (74 * (1 - deployRatio)).toFixed(1));
    }
    if (this.haloTireFillEl) {
      this._setAttr(this.haloTireFillEl, 'width', (48 * tirePct).toFixed(1));
      this._setAttr(
        this.haloTireFillEl,
        'fill',
        tirePct > 0.55 ? '#38bdf8' : tirePct > 0.25 ? '#facc15' : '#ef4444'
      );
    }
    this._setText(this.haloDownforceValEl, `${downforceKg} KG`);

    // Pillole centrali BOOST / OVERTAKE / LOCKUP / PIOGGIA / PIOGGIA FORTE
    const isRain = worldState.weather === 'rain';
    const isHeavyRain = worldState.skyPresetId === 'heavy_rain';
    if (aero?.wheelLockup) {
      this._setText(this.haloStatusPrimaryEl, 'LOCKUP');
      this._setAttr(this.haloStatusPrimaryBgEl, 'fill', 'rgba(220,38,38,0.86)');
    } else if (isRain) {
      this._setText(this.haloStatusPrimaryEl, isHeavyRain ? 'PIOGGIA FORTE' : 'PIOGGIA');
      this._setAttr(
        this.haloStatusPrimaryBgEl,
        'fill',
        isHeavyRain ? 'rgba(14,116,144,0.92)' : 'rgba(2,132,199,0.78)'
      );
    } else if (speedKmh >= 295 && (playerCar.throttleInput || 0) > 0.8) {
      this._setText(this.haloStatusPrimaryEl, 'BOOST');
      this._setAttr(this.haloStatusPrimaryBgEl, 'fill', 'rgba(56,189,248,0.45)');
    } else {
      this._setText(this.haloStatusPrimaryEl, 'ERS OK');
      this._setAttr(this.haloStatusPrimaryBgEl, 'fill', 'rgba(148,163,184,0.26)');
    }

    if (aero?.highSpeedBraking) {
      this._setText(this.haloStatusSecondaryEl, 'FRENATA');
      this._setAttr(this.haloStatusSecondaryBgEl, 'fill', 'rgba(234,88,12,0.88)');
    } else if (speedKmh >= 270 && (playerCar.throttleInput || 0) > 0.85) {
      this._setText(this.haloStatusSecondaryEl, 'OVERTAKE');
      this._setAttr(this.haloStatusSecondaryBgEl, 'fill', 'rgba(34,197,94,0.82)');
    } else {
      this._setText(this.haloStatusSecondaryEl, 'GRIP OK');
      this._setAttr(this.haloStatusSecondaryBgEl, 'fill', 'rgba(22,163,74,0.72)');
    }

    // Superficie e Track Limits sull'ala sinistra (etichetta breve per zero collisioni)
    const surfaceProps = SURFACE_PHYSICS[playerCar.surface || 'asphalt'] || SURFACE_PHYSICS.asphalt;
    const shortSurfaceLabel = String(surfaceProps.label || 'ASFALTO').split(' ')[0].toUpperCase();
    this._setText(
      this.haloTurnStatusEl,
      playerCar.collidingWithBarrier ? 'URTO!' : shortSurfaceLabel
    );
    const t = playerCar.timing;
    if (t) {
      const tlText =
        t.penaltySeconds > 0
          ? `PEN +${t.penaltySeconds}S`
          : sessionMode === 'race'
            ? t.blackAndWhiteFlag
              ? 'B/W 3/3'
              : `TL ${t.trackLimitsCount}/3`
            : t.currentLapInvalidated
              ? 'GIRO ANN.'
              : `TL ${t.trackLimitsCount}`;
      this._setText(this.haloTlStatusEl, tlText);
    }

    // Tag rivale davanti e pilota locale sull'ala sinistra
    const standings = worldState.raceState?.standings || [];
    const localIdx = standings.findIndex((r) => r.id === localPlayerId);
    const rivalAhead = localIdx > 0 ? standings[localIdx - 1] : null;
    const playerSurname = extractDriverSurname(playerCar.driverName, playerCar.code);
    const playerPos = playerCar.racePosition || (localIdx >= 0 ? localIdx + 1 : 1);

    if (rivalAhead) {
      const rivalSurname = extractDriverSurname(rivalAhead.driverName, rivalAhead.code);
      this._setText(this.haloRivalAheadEl, `${rivalAhead.position}  ${rivalSurname}`);
    } else {
      this._setText(this.haloRivalAheadEl, 'P1  LEADER');
    }
    this._setText(this.haloPlayerTagEl, `${playerPos}  ${playerSurname}`);
    this._setAttr(this.haloPlayerAccentEl, 'stroke', playerCar.color || '#00d2be');

    // Card Broadcast Pilota in basso a sinistra dell'Halo
    this._setText(this.haloCardPosEl, String(playerPos));
    this._setText(this.haloCardNameEl, playerSurname);
    this._setStyle(this.haloCardAccentEl, 'backgroundColor', playerCar.color || '#00d2be');

    const logoUrl = getTeamLogoUrl(playerCar.teamId);
    if (this.haloCardLogoEl) {
      if (logoUrl) {
        this._setAttr(this.haloCardLogoEl, 'src', logoUrl);
        this._setClass(this.haloCardLogoEl, getLogoClassName(playerCar.teamId, 'halo-card-logo'));
        this._setDisplay(this.haloCardLogoEl, 'block');
      } else {
        this._setDisplay(this.haloCardLogoEl, 'none');
      }
    }

    const compound = resolveDriverCompound(
      { driverNumber: playerCar.driverNumber, position: playerPos },
      sessionMode,
      worldState.weather || 'dry',
      playerCar
    );
    this._setText(this.haloCardCompoundEl, compound);
    this._setClass(
      this.haloCardCompoundEl,
      `halo-card-compound compound-${compound.toLowerCase()}`
    );

    if (t) {
      const lapInvalid =
        Boolean(t.currentLapInvalidated) &&
        (sessionMode === 'qualifying' || sessionMode === 'practice');
      this._setText(this.haloCardLapEl, formatLapTime(t.currentLapTime));
      this._setClass(this.haloCardLapEl, `halo-card-lap${lapInvalid ? ' is-invalidated' : ''}`);

      const overallBest = worldState.sessionTiming?.overallBestLapTime ?? null;
      const overallBestCarId = worldState.sessionTiming?.overallBestCarId ?? null;
      const holderCar = overallBestCarId ? worldState.cars?.[overallBestCarId] : null;
      const holderRow =
        holderCar ||
        (overallBestCarId ? standings.find((r) => r.id === overallBestCarId) : null) ||
        standings[0] ||
        null;
      if (overallBest !== null) {
        this._setText(this.haloCardRefTimeEl, formatLapTime(overallBest));
        const holderLabel = holderRow
          ? extractDriverSurname(holderRow.driverName, holderRow.code)
          : 'RECORD';
        this._setText(this.haloCardRefLabelEl, holderLabel);
      } else if (t.bestLapTime !== null) {
        this._setText(this.haloCardRefTimeEl, formatLapTime(t.bestLapTime));
        this._setText(this.haloCardRefLabelEl, 'PERSONAL BEST');
      } else {
        this._setText(this.haloCardRefTimeEl, formatDeltaTime(t.liveDelta));
        this._setText(this.haloCardRefLabelEl, 'DELTA');
      }

      const showLastLapTail =
        t.currentLapTime < 3.5 && Array.isArray(t.lastLapSectorStatuses);
      for (let i = 0; i < this.haloSectorEls.length; i++) {
        const el = this.haloSectorEls[i];
        if (!el) continue;
        let status = t.currentSectorStatuses?.[i] || 'pending';
        if (status === 'pending' && showLastLapTail) {
          status = t.lastLapSectorStatuses[i] || 'pending';
        }
        const isActive = t.lapStarted && i === t.currentSectorIndex;
        this._setClass(el, `halo-sector-chip status-${status}${isActive ? ' is-active' : ''}`);
      }
    }
  }

  _updateSessionBadges() {
    if (this.roomBadgeEl) {
      if (this._roomRole !== 'offline' && this._roomCode) {
        this._setDisplay(this.roomBadgeEl, 'inline-block');
        const roleTag = this._roomRole === 'host' ? 'HOST' : 'CLIENT';
        this._setText(this.roomBadgeEl, `${this._roomCode} · ${roleTag}`);
      } else {
        this._setDisplay(this.roomBadgeEl, 'none');
      }
    }
  }

  _updateTrackLimitsHud(playerCar, sessionMode) {
    const t = playerCar?.timing;
    if (!t) return;

    if (this.trackLimitsBadgeEl) {
      if (sessionMode === 'qualifying' || sessionMode === 'practice') {
        if (t.currentLapInvalidated) {
          this._setText(this.trackLimitsBadgeEl, 'GIRO ANNULLATO');
          this._setClass(this.trackLimitsBadgeEl, 'physics-alert alert-lockup');
        } else {
          this._setText(this.trackLimitsBadgeEl, `TL: ${t.trackLimitsCount}`);
          this._setClass(
            this.trackLimitsBadgeEl,
            t.trackLimitsCount > 0 ? 'physics-alert alert-braking' : 'physics-alert alert-ok'
          );
        }
      } else if (t.penaltySeconds > 0) {
        this._setText(
          this.trackLimitsBadgeEl,
          `PEN +${t.penaltySeconds}s (TL:${t.trackLimitsCount})`
        );
        this._setClass(this.trackLimitsBadgeEl, 'physics-alert alert-lockup');
      } else if (t.blackAndWhiteFlag) {
        this._setText(this.trackLimitsBadgeEl, '⚑ B/W (3/3)');
        this._setClass(this.trackLimitsBadgeEl, 'physics-alert alert-bw-flag');
      } else {
        this._setText(this.trackLimitsBadgeEl, `TL: ${t.trackLimitsCount}/3`);
        this._setClass(
          this.trackLimitsBadgeEl,
          t.trackLimitsCount >= 2 ? 'physics-alert alert-braking' : 'physics-alert alert-ok'
        );
      }
    }

    if (this.trackLimitsBannerEl) {
      if (t.trackLimitAlertTimer > 0 && t.trackLimitAlertText) {
        const sev = t.trackLimitAlertSeverity;
        const bannerCls =
          sev === 'bw_flag'
            ? 'tl-banner-bw-flag'
            : sev === 'penalty' || t.penaltySeconds > 0 || (t.currentLapInvalidated && sessionMode !== 'race')
              ? 'tl-banner-penalty'
              : 'tl-banner-warn';
        this._setDisplay(this.trackLimitsBannerEl, 'block');
        this._setText(this.trackLimitsBannerEl, t.trackLimitAlertText);
        this._setClass(this.trackLimitsBannerEl, bannerCls);
      } else {
        this._setDisplay(this.trackLimitsBannerEl, 'none');
      }
    }
  }

  _updateQualifyingOverlays(worldState, localPlayerId) {
    const q = worldState.qualifyingState;
    const isQuali = Boolean(q && worldState.raceState?.mode === 'qualifying');

    if (this.qualiHudControlsEl) {
      this._setDisplay(this.qualiHudControlsEl, isQuali ? 'flex' : 'none');
    }

    if (!isQuali) {
      this.hideQualifyingModal();
      return;
    }

    if (this.qualiCutoffInfoEl) {
      const cutoffText =
        q.stageId === 'Q1'
          ? 'Taglio Q1: Top 16 in Q2 (P17–P22 out)'
          : q.stageId === 'Q2'
            ? 'Taglio Q2: Top 10 in Q3 (P11–P16 out)'
            : 'Top 10 Shootout — Pole Position';
      this._setText(this.qualiCutoffInfoEl, cutoffText);
    }

    if (this.qualiSkipVotesInfoEl) {
      const req = q.skipVotes?.requiredPlayers || [];
      const approved = q.skipVotes?.approvedBy || [];
      if (req.length > 1 || approved.length > 0) {
        this._setDisplay(this.qualiSkipVotesInfoEl, 'block');
        const actionLabel =
          q.skipVotes?.requestedAction === 'all' ? 'Vai alla Gara' : 'Salta Fase';
        this._setText(
          this.qualiSkipVotesInfoEl,
          `Voti Skip (${actionLabel}): ${approved.length}/${req.length} (unanimità)`
        );
      } else {
        this._setDisplay(this.qualiSkipVotesInfoEl, 'none');
      }
    }

    if (q.status === 'running' || q.status === 'chequered_flag' || q.status === 'in_lap') {
      this._dismissedQualiModalKey = '';
      this._activeQualiModalKey = '';
      this.hideQualifyingModal();
      return;
    }

    const reqCount = q.skipVotes?.requiredPlayers?.length || 1;
    const appCount = q.skipVotes?.approvedBy?.length || 0;
    const modalKey = `${q.stageId}:${q.status}:${q.playerEliminated}:${q.standings.length}:${q.finalGrid.length}:${appCount}/${reqCount}:${this._roomRole}`;
    this._activeQualiModalKey = modalKey;

    if (this._dismissedQualiModalKey && modalKey === this._dismissedQualiModalKey) {
      this.modalManager.syncVisibility('qualifying-modal', false);
      return;
    }

    this.modalManager.syncVisibility('qualifying-modal', true);

    const isClient = this._roomRole === 'client';
    const autoSec = Math.max(0, Math.ceil(q.autoAdvanceTimer ?? 0));
    const raceLaps =
      worldState.sessionConfig?.raceLaps ??
      worldState.sessionConfig?.lapLimit ??
      RACE_TOTAL_LAPS;

    // Aggiorna sempre il countdown live (10s -> 1s) sul bottone primario senza ricostruire la tabella
    if (this.qualiNextBtnEl) {
      this.qualiNextBtnEl.disabled = isClient;
      if (q.status === 'stage_complete') {
        const nextShort = q.stageId === 'Q1' ? 'Q2' : 'Q3';
        this._setText(
          this.qualiNextBtnEl,
          isClient
            ? `Avvio ${nextShort} tra ${autoSec}s…`
            : q.allHumansEliminated
              ? `Griglia Finale tra ${autoSec}s… (Avanza ora)`
              : `Avvio ${nextShort} tra ${autoSec}s… (Avanza ora)`
        );
      } else if (q.status === 'qualifying_complete') {
        this._setText(
          this.qualiNextBtnEl,
          isClient
            ? `Schieramento in griglia tra ${autoSec}s…`
            : `Schieramento in griglia tra ${autoSec}s… (Avvia Gara ${raceLaps} Giri)`
        );
      }
    }

    if (modalKey === this._lastQualiModalKey) {
      return;
    }
    this._lastQualiModalKey = modalKey;

    if (q.status === 'stage_complete') {
      const playerRow = q.standings.find(
        (r) => r.id === localPlayerId || r.driverId === q.playerDriverId
      );
      const localEliminated = playerRow ? Boolean(playerRow.inEliminationZone) : q.playerEliminated;

      if (this.qualiModalTitleEl) {
        this.qualiModalTitleEl.textContent = `Bandiera a Scacchi — Fine ${q.stageLabel}`;
      }
      if (this.qualiModalSummaryEl) {
        const posStr = playerRow ? `${playerRow.position}°` : '-';
        this.qualiModalSummaryEl.textContent = localEliminated
          ? `Sei stato eliminato in ${q.stageId} (${posStr} posto) • Avanzamento automatico in 10s.`
          : `Qualificato alla fase successiva! Hai chiuso ${q.stageId} in ${posStr} posizione • Avanzamento automatico in 10s.`;
      }
      if (this.qualiSkipToRaceBtnEl) {
        this.qualiSkipToRaceBtnEl.style.display = 'inline-block';
        this.qualiSkipToRaceBtnEl.disabled = false;
        this.qualiSkipToRaceBtnEl.textContent =
          reqCount > 1
            ? `Vota Skip Qualifiche (${appCount}/${reqCount})`
            : 'Salta Qualifiche → Gara';
      }
      if (this.qualiModalTableBodyEl) {
        this.qualiModalTableBodyEl.innerHTML = q.standings
          .map((row) => {
            const isLocal = row.id === localPlayerId || row.driverId === q.playerDriverId;
            const statusText = row.inEliminationZone ? 'ELIMINATO' : 'AVANZA';
            return `
              <tr class="${isLocal ? 'finish-row-local' : ''}${row.inEliminationZone ? ' quali-row-elim' : ''}">
                <td>${row.position}°</td>
                <td><span class="finish-team-dot" style="background:${row.color}"></span>#${row.driverNumber} ${row.driverName}</td>
                <td>${row.teamName}</td>
                <td>${formatLapTime(row.bestLapTime)}</td>
                <td>${row.position === 1 ? 'LEADER' : row.gapToLeader} · ${statusText}</td>
              </tr>
            `;
          })
          .join('');
      }
      return;
    }

    if (q.status === 'qualifying_complete') {
      const grid = q.finalGrid || [];
      const pole = grid[0];
      const playerGridRow =
        grid.find((r) => r.id === localPlayerId) ||
        grid.find((r) => r.driverId === q.playerDriverId);
      if (this.qualiModalTitleEl) {
        this.qualiModalTitleEl.textContent = `Griglia di Partenza Ufficiale — Gara (${raceLaps} Giri)`;
      }
      if (this.qualiModalSummaryEl) {
        this.qualiModalSummaryEl.textContent = `Pole Position: ${pole?.driverName ?? '-'} (${formatLapTime(pole?.bestLapTime)}) • La tua partenza in griglia: ${playerGridRow ? `${playerGridRow.position}°` : '-'} • Schieramento automatico in 10s.`;
      }
      if (this.qualiSkipToRaceBtnEl) {
        this.qualiSkipToRaceBtnEl.style.display = 'none';
      }
      if (this.qualiModalTableBodyEl) {
        this.qualiModalTableBodyEl.innerHTML = grid
          .map((row) => {
            const isLocal = row.id === localPlayerId || row.driverId === q.playerDriverId;
            return `
              <tr class="${isLocal ? 'finish-row-local' : ''}">
                <td>${row.position}°</td>
                <td><span class="finish-team-dot" style="background:${row.color}"></span>#${row.driverNumber} ${row.driverName}</td>
                <td>${row.teamName}</td>
                <td>${formatLapTime(row.bestLapTime)}</td>
                <td>${row.stageEliminated}</td>
              </tr>
            `;
          })
          .join('');
      }
    }
  }

  _updatePitReleaseIndicator(worldState, playerCar) {
    if (!this.pitReleaseIndicatorEl) return;

    const pitLane = worldState?.trackSurface?.pitLane || null;
    const speedLimitKmh = pitLane?.speedLimitKmh ?? 80;
    const explicit = worldState?.pitReleaseStatus || playerCar?.pitReleaseSafety || null;

    let visible = false;
    let isGreen = true;
    let statusText = 'VIA LIBERA — ESCI';
    let metaText = `${speedLimitKmh} KM/H`;

    if (explicit) {
      visible = explicit.visible !== false;
      isGreen = Boolean(explicit.isGreen);
      if (isGreen) {
        statusText = explicit.label || 'VIA LIBERA — ESCI';
      } else if (
        explicit.reason === 'UNSAFE_APPROACHING' ||
        explicit.reason === 'UNSAFE_OCCUPIED' ||
        explicit.reason === 'UNSAFE_ADJACENT_EXIT'
      ) {
        statusText = explicit.label || 'STOP — UNSAFE RELEASE FIA';
      } else if (explicit.reason === 'PIT_EXIT_QUEUE' || explicit.reason === 'PIT_EXIT_LIGHT') {
        statusText = explicit.label || 'SEMAFORO USCITA PIT — ATTENDI';
      } else {
        statusText = explicit.label || 'ATTENDI — TRAFFICO IN PIT LANE';
      }
      if (!isGreen && Number.isFinite(explicit.waitSeconds) && explicit.waitSeconds > 0.05) {
        metaText = `${explicit.waitSeconds.toFixed(1)}s`;
      } else {
        metaText = `${speedLimitKmh} KM/H`;
      }
    } else if (playerCar && pitLane) {
      const pitState = playerCar.pitState || null;
      if (pitState === 'AUTO_BOX_STOP') {
        visible = true;
        isGreen = false;
        statusText = 'INGRESSO AL BOX — COMANDI BLOCCATI';
        metaText = 'AUTO';
      } else if (pitState === 'IN_PIT_BOX') {
        visible = true;
        const holdLeft = playerCar.pitBoxHoldTimer ?? 0;
        if (holdLeft > 0.05) {
          isGreen = false;
          statusText = 'FERMO AL BOX — ATTENDI';
          metaText = `${holdLeft.toFixed(1)}s`;
        } else {
          const myPq = queryPitLane(pitLane, playerCar.x, playerCar.z, playerCar.teamId);
          let hasTraffic = false;
          const refS = myPq.sample ? myPq.sMeters : 0;
          for (const other of Object.values(worldState.cars || {})) {
            if (!other || other.id === playerCar.id) continue;
            const opq = queryPitLane(pitLane, other.x, other.z);
            if (!opq.inPitLane || opq.inGarage) continue;
            const deltaS = refS - opq.sMeters;
            if (deltaS >= -18 && deltaS <= 45) {
              hasTraffic = true;
              break;
            }
          }
          isGreen = !hasTraffic;
          const accKey = formatKeyCodeLabel(this._keybindings.accelerate);
          statusText = isGreen
            ? `VIA LIBERA — PREMI ${accKey} PER USCIRE`
            : 'ATTENDI — TRAFFICO IN PIT LANE';
          metaText = `${speedLimitKmh} KM/H`;
        }
      } else {
        const inReleaseState =
          pitState === 'IN_GARAGE' || pitState === 'EXITING_GARAGE' || pitState === 'PIT_STOPPING';
        const speedMs = Math.hypot(playerCar.vx || 0, playerCar.vz || 0);
        const stoppedInPit = playerCar.surface === 'pitlane' && speedMs < 4.5;

        if (inReleaseState || stoppedInPit) {
          const myPq = queryPitLane(pitLane, playerCar.x, playerCar.z, playerCar.teamId);
          if (inReleaseState || myPq.zone === 'speed_zone' || myPq.zone === 'garage') {
            visible = true;
            let hasTraffic = false;
            const refS = myPq.sample ? myPq.sMeters : 0;
            for (const other of Object.values(worldState.cars || {})) {
              if (!other || other.id === playerCar.id) continue;
              const opq = queryPitLane(pitLane, other.x, other.z);
              if (!opq.inPitLane || opq.inGarage) continue;
              const deltaS = refS - opq.sMeters;
              if (deltaS >= -18 && deltaS <= 45) {
                hasTraffic = true;
                break;
              }
            }
            isGreen = !hasTraffic;
            statusText = isGreen ? 'VIA LIBERA — ESCI' : 'ATTENDI — TRAFFICO IN PIT LANE';
            metaText = `${speedLimitKmh} KM/H`;
          }
        }
      }
    }

    const cls = `${isGreen ? 'is-green' : 'is-red'}${visible ? ' is-visible' : ''}`;
    this._setClass(this.pitReleaseIndicatorEl, cls);
    if (visible) {
      this._setText(this.pitReleaseTextEl, statusText);
      this._setText(this.pitReleaseMetaEl, metaText);
    }

    // Barra azioni contestuali: ESCI DAI BOX [W] o BANDIERA A SCACCHI o RECUPERO IN PISTA
    if (this.pitActionBarEl) {
      const q = worldState?.qualifyingState || null;
      const isQuali = Boolean(q && worldState?.raceState?.mode === 'qualifying');
      const ps = playerCar?.pitState || null;
      const recAnim = playerCar?.trackRecoveryAnim || null;

      if (recAnim) {
        const u = Math.max(0, Math.min(1, recAnim.progress ?? 0));
        this._setDisplay(this.pitActionBarEl, 'flex');
        this._setClass(this.pitActionBarEl, 'is-recovering');
        this._setText(this.pitActionTextEl, 'RIPOSIZIONAMENTO IN PISTA...');
        this._setDisplay(this.exitPitBtnEl, 'none');
        this._setDisplay(this.quickPitReturnBtnEl, 'none');
        this._setDisplay(this.resetTrackBtnEl, 'none');
        this._setDisplay(this.recoveryProgressEl, 'block');
        if (this.recoveryProgressFillEl) {
          this._setStyle(this.recoveryProgressFillEl, 'transform', `scaleX(${u.toFixed(3)})`);
        }
        if (this.recoveryVignetteEl) {
          const glow = (Math.sin(Math.PI * u) * 0.9).toFixed(2);
          this._setStyle(this.recoveryVignetteEl, 'opacity', glow);
        }
      } else {
        this._setDisplay(this.recoveryProgressEl, 'none');
        if (this.recoveryVignetteEl) {
          this._setStyle(this.recoveryVignetteEl, 'opacity', '0');
        }

        if (ps === 'IN_GARAGE' && (!isQuali || q.status === 'running')) {
          const accKey = formatKeyCodeLabel(this._keybindings.accelerate);
          this._setDisplay(this.pitActionBarEl, 'flex');
          this._setClass(this.pitActionBarEl, isGreen ? 'is-inlap' : '');
          this._setText(
            this.pitActionTextEl,
            isGreen
              ? `PRONTO IN BOX — PREMI ${accKey} PER USCIRE`
              : 'UNSAFE RELEASE FIA — ATTENDI VIA LIBERA'
          );
          this._setText(this.exitPitBtnEl, `Esci dai Box [${accKey}]`);
          this._setDisplay(this.exitPitBtnEl, 'inline-block');
          this._setDisplay(this.quickPitReturnBtnEl, 'none');
          this._setDisplay(this.resetTrackBtnEl, 'none');
          if (this.exitPitBtnEl) {
            this.exitPitBtnEl.disabled = !isGreen;
          }
        } else if (ps === 'PIT_EXIT_LANE' && playerCar?.pitQueueAutoActive && isQuali && q.status === 'running') {
          this._setDisplay(this.pitActionBarEl, 'flex');
          this._setClass(this.pitActionBarEl, '');
          const pos = playerCar.pitQueuePosition ?? 1;
          this._setText(
            this.pitActionTextEl,
            pos > 1
              ? `BLOCCO AUTOMATICO A ~2m (${pos}° IN CODA) — AVANZA CON L'AUTO DAVANTI`
              : 'AL SEMAFORO DI USCITA — ATTESA 10s POI USCITA AUTOMATICA'
          );
          this._setDisplay(this.exitPitBtnEl, 'none');
          this._setDisplay(this.quickPitReturnBtnEl, 'none');
          this._setDisplay(this.resetTrackBtnEl, 'none');
        } else if (isQuali && q.status === 'chequered_flag') {
          this._setDisplay(this.pitActionBarEl, 'flex');
          this._setClass(this.pitActionBarEl, 'is-chequered');
          this._setText(this.pitActionTextEl, 'BANDIERA A SCACCHI — COMPLETA IL GIRO LANCIATO');
          this._setDisplay(this.exitPitBtnEl, 'none');
          this._setDisplay(this.quickPitReturnBtnEl, 'none');
          this._setDisplay(this.resetTrackBtnEl, 'none');
        } else if (
          isQuali &&
          q.status === 'in_lap' &&
          ps !== 'AUTO_PARKING' &&
          ps !== 'PARKED_STAGE_END'
        ) {
          this._setDisplay(this.pitActionBarEl, 'flex');
          this._setClass(this.pitActionBarEl, 'is-inlap');
          this._setText(this.pitActionTextEl, 'BANDIERA A SCACCHI — RIENTRA AI BOX');
          this._setDisplay(this.exitPitBtnEl, 'none');
          this._setDisplay(this.resetTrackBtnEl, 'none');
          const showQuickBtn = ps !== 'PIT_ENTRY_LANE';
          this._setDisplay(this.quickPitReturnBtnEl, showQuickBtn ? 'inline-block' : 'none');
        } else {
          const recovery = getCarTrackRecoveryState(worldState, playerCar);
          if (recovery.showPrompt) {
            const resetKey = formatKeyCodeLabel(this._keybindings.resetToTrack);
            const msg =
              recovery.reason === 'off_track'
                ? `FUORI PISTA — PREMI [${resetKey}] PER RIMETTERTI IN PISTA`
                : `BLOCCATO / CONTROMANO — PREMI [${resetKey}] PER RIMETTERTI IN PISTA`;
            this._setDisplay(this.pitActionBarEl, 'flex');
            this._setClass(this.pitActionBarEl, 'is-reset-track');
            this._setText(this.pitActionTextEl, msg);
            this._setDisplay(this.exitPitBtnEl, 'none');
            this._setDisplay(this.quickPitReturnBtnEl, 'none');
            this._setText(this.resetTrackBtnEl, `Rimetti in Pista [${resetKey}]`);
            this._setDisplay(this.resetTrackBtnEl, 'inline-block');
          } else {
            this._setDisplay(this.pitActionBarEl, 'none');
            this._setDisplay(this.resetTrackBtnEl, 'none');
          }
        }
      }
    }
  }

  _getTyrePerformanceColor(health01) {
    if (health01 >= 0.72) return '#22c55e';
    if (health01 >= 0.50) return '#eab308';
    if (health01 >= 0.28) return '#f97316';
    return '#ef4444';
  }

  _updateTyrePerformanceCard(worldState, playerCar) {
    if (!this.tyreCardEl) return;
    if (!playerCar) {
      this._setDisplay(this.tyreCardEl, 'none');
      return;
    }
    this._setDisplay(this.tyreCardEl, 'flex');

    const aero = playerCar.aeroTire || {};
    const avgHealth = Math.max(0, Math.min(1, aero.tireHealth ?? 1));
    const wh = aero.wheelHealth || {
      fl: avgHealth,
      fr: avgHealth,
      rl: avgHealth,
      rr: avgHealth,
    };
    const avgTemp = aero.tireTempC ?? 76;
    const wt = aero.wheelTempC || {
      fl: avgTemp,
      fr: avgTemp,
      rl: avgTemp,
      rr: avgTemp,
    };

    const surname = extractDriverSurname(playerCar.driverName, playerCar.code);
    this._setText(this.tyreDriverEl, surname);
    this._setStyle(this.tyreTeamBarEl, 'backgroundColor', playerCar.color || '#dc0000');

    for (const key of ['fl', 'fr', 'rl', 'rr']) {
      const h = Math.max(0, Math.min(1, wh[key] ?? avgHealth));
      const pct = Math.round(h * 100);
      const col = this._getTyrePerformanceColor(h);
      this._setText(this.tyrePctEls[key], `${pct}%`);
      this._setStyle(this.tyrePctEls[key], 'color', h < 0.30 ? '#fca5a5' : '#f8fafc');
      this._setText(this.tyreTempEls[key], `${Math.round(wt[key] ?? avgTemp)}°`);
      this._setAttr(this.tyreSvgEls[key], 'fill', col);
    }

    const compId = TIRE_COMPOUNDS[aero.compound] ? aero.compound : 'M';
    const compSpec = TIRE_COMPOUNDS[compId] || TIRE_COMPOUNDS.M;
    this._setText(this.tyreCompBadgeEl, compId);
    this._setClass(this.tyreCompBadgeEl, `compound-${compId.toLowerCase()}`);
    this._setText(this.tyreCompNameEl, compSpec.name.toUpperCase());

    const completedLaps = playerCar.timing?.completedLaps ?? 0;
    const stintLaps = Math.max(0, completedLaps - (aero.stintStartLap ?? 0));
    this._setText(this.tyreStintLapsEl, stintLaps === 1 ? '1 LAP' : `${stintLaps} LAPS`);

    if (this.tyreDegBadgeEl) {
      const gPct = Math.round((aero.grainingLevel ?? 0) * 100);
      const bPct = Math.round((aero.blisteringLevel ?? 0) * 100);
      if (bPct >= 10 && bPct >= gPct) {
        this._setText(this.tyreDegBadgeEl, `BLS ${bPct}%`);
        this._setClass(this.tyreDegBadgeEl, 'is-blistering');
      } else if (gPct >= 10) {
        this._setText(this.tyreDegBadgeEl, `GRN ${gPct}%`);
        this._setClass(this.tyreDegBadgeEl, 'is-graining');
      } else {
        this._setText(this.tyreDegBadgeEl, '');
        this._setClass(this.tyreDegBadgeEl, '');
      }
    }
  }

  _updateRacePitHud(worldState, playerCar, sessionMode) {
    const hasPitLane = Boolean(worldState?.trackSurface?.pitLane);
    const showPitWidget =
      hasPitLane &&
      (sessionMode === 'race' || sessionMode === 'practice' || sessionMode === 'qualifying') &&
      !playerCar.raceFinished;

    if (this.racePitWidgetEl) {
      this._setDisplay(this.racePitWidgetEl, showPitWidget ? 'flex' : 'none');
    }

    if (showPitWidget) {
      const pitKey = formatKeyCodeLabel(this._keybindings.pitRequest);
      const compKey = formatKeyCodeLabel(this._keybindings.cyclePitCompound);
      const isQuali = sessionMode === 'qualifying';
      const inBoxNow =
        playerCar.pitState === 'IN_GARAGE' || playerCar.pitState === 'IN_PIT_BOX';
      const requested = Boolean(playerCar.pitStopRequested);

      if (this.boxRequestBtnEl) {
        this._setDisplay(this.boxRequestBtnEl, isQuali ? 'none' : 'inline-flex');
        this._setText(
          this.boxRequestBtnEl,
          requested ? `BOX ATTIVO [${pitKey}]` : `BOX [${pitKey}]`
        );
        this._setClass(this.boxRequestBtnEl, requested ? 'is-active' : '');
      }

      if (this.pitCompLabelEl) {
        this._setText(
          this.pitCompLabelEl,
          inBoxNow ? `GOMME [${compKey}]` : `PIT [${compKey}]`
        );
      }

      const activeSelectComp = inBoxNow
        ? playerCar.aeroTire?.compound || playerCar.nextPitCompound || 'M'
        : playerCar.nextPitCompound || playerCar.aeroTire?.compound || 'M';
      for (let i = 0; i < this.nextCompoundBtns.length; i++) {
        const btn = this.nextCompoundBtns[i];
        const isSel = btn.dataset.nextCompound === activeSelectComp;
        this._setClass(btn, isSel ? 'hud-pit-comp-btn is-selected' : 'hud-pit-comp-btn');
      }

      if (this.pitCompToastEl) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const showToast = now < this._pitToastUntil && Boolean(this._pitToastText);
        if (showToast) {
          this._setDisplay(this.pitCompToastEl, 'block');
          this._setText(this.pitCompToastEl, this._pitToastText);
        } else if (requested && !isQuali) {
          const nextSpec = TIRE_COMPOUNDS[activeSelectComp] || TIRE_COMPOUNDS.M;
          this._setDisplay(this.pitCompToastEl, 'block');
          this._setText(
            this.pitCompToastEl,
            `BOX PRENOTATO • MONTA ${nextSpec.name.toUpperCase()} (${nextSpec.id})`
          );
        } else {
          this._setDisplay(this.pitCompToastEl, 'none');
        }
      }
    } else if (this.pitCompToastEl) {
      this._setDisplay(this.pitCompToastEl, 'none');
    }

    if (this.pitStopTimerEl) {
      const isStopping = playerCar.pitState === 'PIT_STOPPING';
      this._setDisplay(this.pitStopTimerEl, isStopping ? 'flex' : 'none');
      if (isStopping) {
        const vis = computePitStopVisualState(playerCar);
        this._setText(this.pitStopClockEl, `${vis.elapsed.toFixed(1)}s`);
        const phaseLabel =
          vis.elapsed >= vis.duration
            ? 'CONTROLLO UNSAFE RELEASE'
            : vis.phase === 1
              ? 'SOLLEVAMENTO MARTINETTI'
              : vis.phase === 2
                ? (vis.swapped ? 'SERRAGGIO RUOTE NUOVE' : 'SOSTITUZIONE 4 GOMME')
                : 'ABBASSAMENTO & RILASCIO';
        this._setText(this.pitStopPhaseEl, phaseLabel);
        this._setText(this.pitStopCompoundEl, `${vis.oldCompound} → ${vis.newCompound}`);
      }
    }
  }

  _updateAdvancedPhysics(carState, weatherId, skyPresetId = null) {
    if (this.weatherBadgeEl) {
      const wProps = WEATHER_CONFIG[weatherId] || WEATHER_CONFIG.dry;
      const preset = skyPresetId ? getSkyPresetById(skyPresetId) : this._activeSkyPreset;
      const badgeText =
        preset?.label ||
        this._activeSkyLabel ||
        (weatherId === 'rain' ? 'Pioggia' : wProps.label);
      const badgeTheme = preset?.badgeTheme || weatherId;
      this._setText(this.weatherBadgeEl, badgeText);
      this._setClass(this.weatherBadgeEl, `weather-badge weather-${badgeTheme}`);
    }

    const aero = carState.aeroTire;
    if (!aero) return;

    if (this.downforceValueEl) {
      this._setText(this.downforceValueEl, `${aero.downforceKg} kg`);
    }

    if (this.tireHealthValueEl && this.tireBarFillEl) {
      const pct = Math.round(aero.tireHealth * 100);
      const clampedRatio = Math.max(0, Math.min(1, aero.tireHealth));
      const scaleX = (Math.round(clampedRatio * 100) / 100).toFixed(2);
      this._setText(this.tireHealthValueEl, `${pct}%`);
      this._setStyle(this.tireBarFillEl, 'transform', `scaleX(${scaleX})`);
      this._setStyle(
        this.tireBarFillEl,
        'backgroundColor',
        pct > 65 ? '#22c55e' : pct > 30 ? '#f59e0b' : '#ef4444'
      );
    }

    const compId = TIRE_COMPOUNDS[aero.compound] ? aero.compound : 'M';
    const compSpec = TIRE_COMPOUNDS[compId] || TIRE_COMPOUNDS.M;
    if (this.tireCompoundBadgeEl) {
      this._setText(this.tireCompoundBadgeEl, compId);
      this._setClass(
        this.tireCompoundBadgeEl,
        `hud-tire-compound-badge compound-${compId.toLowerCase()}`
      );
    }
    if (this.tireTempEl) {
      const tempC = Math.round(aero.tireTempC ?? 92);
      this._setText(this.tireTempEl, `${tempC}°C`);
      const tempCls =
        tempC < compSpec.optTempMin - 4
          ? 'hud-tire-temp is-cold'
          : tempC > compSpec.optTempMax + 10
            ? 'hud-tire-temp is-overheat'
            : tempC > compSpec.optTempMax + 3
              ? 'hud-tire-temp is-hot'
              : 'hud-tire-temp';
      this._setClass(this.tireTempEl, tempCls);
    }
    if (this.grainingChipEl) {
      const gPct = Math.round((aero.grainingLevel ?? 0) * 100);
      if (gPct >= 8) {
        this._setText(this.grainingChipEl, `GRN ${gPct}%`);
        this._setClass(this.grainingChipEl, 'hud-tire-deg-chip is-graining');
      } else {
        this._setClass(this.grainingChipEl, 'hud-tire-deg-chip is-graining is-hidden');
      }
    }
    if (this.blisteringChipEl) {
      const bPct = Math.round((aero.blisteringLevel ?? 0) * 100);
      if (bPct >= 8) {
        this._setText(this.blisteringChipEl, `BLS ${bPct}%`);
        this._setClass(this.blisteringChipEl, 'hud-tire-deg-chip is-blistering');
      } else {
        this._setClass(this.blisteringChipEl, 'hud-tire-deg-chip is-blistering is-hidden');
      }
    }

    if (this.lockupAlertEl) {
      if (aero.wheelLockup) {
        this._setText(this.lockupAlertEl, 'BLOCCAGGIO!');
        this._setClass(this.lockupAlertEl, 'physics-alert alert-lockup');
      } else if (aero.highSpeedBraking) {
        this._setText(this.lockupAlertEl, 'STACCATA AL LIMITE');
        this._setClass(this.lockupAlertEl, 'physics-alert alert-braking');
      } else {
        this._setText(this.lockupAlertEl, 'GRIP OK');
        this._setClass(this.lockupAlertEl, 'physics-alert alert-ok');
      }
    }
  }
}
