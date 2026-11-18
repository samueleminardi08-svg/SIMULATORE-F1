/**
 * Gestore Showroom Garage 3D & Menu Principale (stile "Crazy Grand Prix"):
 * - Top bar: Budget ($), FREE CASH!, stats gare/vittorie e profilo pilota
 * - Barra inferiore a 4 bottoni: RACE, CUSTOMIZE (TEAM / DRIVER / PROFILE), VEHICLE (PAINT / UPGRADES / LIVERIES), SETTINGS
 * - Sincronizzazione in tempo reale con GarageScene3D (vernice RGB, smoothness, metallic, livrea e camera orbitale)
 */

import { getDifficultyConfig } from '../config/difficulty.js';
import { F1_2026_DRIVERS, F1_2026_TEAMS } from '../config/f1_2026_data.js';
import {
  UPGRADE_CATEGORIES,
  UPGRADE_MAX_LEVEL,
  buildCarSpecsFromUpgrades,
} from '../cars/CarSpecs.js';
import {
  exportCareerJson,
  getRepresentativeDriverForTeam,
  getUpgradeCost,
  grantCareerFreeCash,
  importCareerJson,
  loadCareerState,
  purchaseCareerUpgrade,
  resetCareerState,
  rgbToHex,
  updateCareerPaint,
  updateCareerProfile,
} from '../career/CareerStorage.js';

const UPGRADE_WINDOW_ORDER = ['engine', 'brakes', 'tires', 'aero', 'suspension'];
const TEAM_IDS = Object.keys(F1_2026_TEAMS);

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
    roomManager = null,
    onStartMultiplayerSession = null,
  }) {
    this.onStartSession = onStartSession;
    this.onResume = onResume;
    this.onCareerChange = onCareerChange;
    this.onShowroomUpdate = onShowroomUpdate;
    this.onToggleCameraRotate = onToggleCameraRotate;
    this.roomManager = roomManager;
    this.onStartMultiplayerSession = onStartMultiplayerSession;

    this.careerState = careerState || loadCareerState();
    this.isOpen = true;
    this.hasActiveSession = false;
    this.activeTab = null; // null | 'race' | 'customize' | 'vehicle' | 'multiplayer' | 'settings'
    this.customizeSub = 'team'; // 'team' | 'driver' | 'profile'
    this.mpFormat = 'qualifying';
    this.upgradeWindowOffset = 0; // 0 => [engine, brakes, tires, aero], 1 => [brakes, tires, aero, suspension]
    this.isCameraRotating = false;

    this.modalEl = document.getElementById('session-menu-modal');

    // Top bar
    this.careerMoneyBadgeEl = document.getElementById('career-money-badge');
    this.freeCashBtn = document.getElementById('gp-free-cash-btn');
    this.snapshotBtn = document.getElementById('gp-snapshot-btn');
    this.racesValEl = document.getElementById('gp-races-val');
    this.winsValEl = document.getElementById('gp-wins-val');
    this.profileNameEl = document.getElementById('gp-profile-name');
    this.profileSubEl = document.getElementById('gp-profile-sub');

    // Bottom navigation
    this.navButtons = [...document.querySelectorAll('[data-gp-tab]')];
    this.resumeBtn = document.getElementById('menu-resume-btn');
    this.openMenuHudBtn = document.getElementById('hud-open-menu-btn');

    // Overlays
    this.vehicleOverlayEl = document.getElementById('gp-vehicle-overlay');
    this.customizeStackEl = document.getElementById('gp-customize-stack');
    this.customizeSubcardEl = document.getElementById('gp-customize-subcard');
    this.customizeStackBtns = [...document.querySelectorAll('[data-custom-sub]')];
    this.subTeamEl = document.getElementById('gp-sub-team');
    this.subDriverEl = document.getElementById('gp-sub-driver');
    this.subProfileEl = document.getElementById('gp-sub-profile');
    this.racePopupEl = document.getElementById('gp-race-popup');
    this.settingsPopupEl = document.getElementById('gp-settings-popup');
    this.mpPopupEl = document.getElementById('gp-multiplayer-popup');

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
    this.mpStartSessionBtn = document.getElementById('mp-start-session-btn');
    this.mpLeaveRoomBtn = document.getElementById('mp-leave-room-btn');

    // Paint Sliders & Liveries (Screenshot 3)
    this.sliderR = document.getElementById('paint-slider-r');
    this.sliderG = document.getElementById('paint-slider-g');
    this.sliderB = document.getElementById('paint-slider-b');
    this.sliderSmooth = document.getElementById('paint-slider-smooth');
    this.sliderMetal = document.getElementById('paint-slider-metal');
    this.fillR = document.getElementById('paint-fill-r');
    this.fillG = document.getElementById('paint-fill-g');
    this.fillB = document.getElementById('paint-fill-b');
    this.fillSmooth = document.getElementById('paint-fill-smooth');
    this.fillMetal = document.getElementById('paint-fill-metal');
    this.paintResetTeamBtn = document.getElementById('paint-reset-team-btn');

    this.upgPrevBtn = document.getElementById('upg-prev-btn');
    this.upgNextBtn = document.getElementById('upg-next-btn');
    this.careerUpgradesGridEl = document.getElementById('career-upgrades-grid');
    this.careerFeedbackEl = document.getElementById('career-feedback-msg');

    this.liveryPrevBtn = document.getElementById('livery-prev-btn');
    this.liveryNextBtn = document.getElementById('livery-next-btn');
    this.liveryNameEl = document.getElementById('gp-livery-name');
    this.randomizeBtn = document.getElementById('gp-randomize-btn');
    this.rotateCamBtn = document.getElementById('gp-rotate-cam-btn');

    // Profile, Team, Driver & Race/Settings controls
    this.careerStatsSummaryEl = document.getElementById('career-stats-summary');
    this.careerNameInputEl = document.getElementById('career-player-name');
    this.careerTeamSelectEl = document.getElementById('career-team-select');
    this.careerExportBtn = document.getElementById('career-export-btn');
    this.careerImportBtn = document.getElementById('career-import-btn');
    this.careerImportInputEl = document.getElementById('career-import-input');
    this.careerResetBtn = document.getElementById('career-reset-btn');

    this.modeButtons = [...document.querySelectorAll('[data-menu-mode]')];
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
    this.startBtn = document.getElementById('menu-start-btn');

    this.state = {
      mode: 'career',
      difficultyId: 'intermediate',
      withBots: false,
      lapType: 'infinite',
      finiteLaps: 5,
      carLevel: 'base',
      weather: 'dry',
      playerDriverId: 'leclerc',
    };

    this._populateDrivers();
    this._populateCareerTeams();
    this._bindEvents();
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

  _setCareerFeedback(msg, isError = false) {
    if (!this.careerFeedbackEl) return;
    this.careerFeedbackEl.textContent = msg;
    this.careerFeedbackEl.style.color = isError ? '#fca5a5' : '#86efac';
  }

  getShowcaseAppearance() {
    const team = F1_2026_TEAMS[this.careerState.teamId] || F1_2026_TEAMS.ferrari;
    const paint = this.careerState.paint || {};
    const primaryColor = paint.useCustomPaint
      ? rgbToHex(paint.r, paint.g, paint.b)
      : team.primaryColor;
    const smoothness = paint.smoothness ?? 0.78;
    const metalness = paint.metallic ?? 0.35;
    return {
      primaryColor,
      secondaryColor: team.secondaryColor,
      wingColor: team.wingColor,
      helmetColor: '#18181b',
      roughness: Math.max(0.05, 1.0 - smoothness),
      metalness,
    };
  }

  getShowcaseViewMode() {
    return this.activeTab === 'vehicle' ? 'vehicle' : 'main';
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
    this._syncUI();
  }

  _commitCareerState(nextState) {
    this.careerState = nextState;
    if (this.onCareerChange) {
      this.onCareerChange(nextState);
    }
    this._syncUI();
  }

  _cycleTeam(delta) {
    const idx = Math.max(0, TEAM_IDS.indexOf(this.careerState.teamId));
    const nextIdx = (idx + delta + TEAM_IDS.length) % TEAM_IDS.length;
    const nextTeamId = TEAM_IDS[nextIdx];
    const team = F1_2026_TEAMS[nextTeamId];
    const teamRgb = hexToRgb(team.primaryColor);
    let next = updateCareerProfile(this.careerState, { teamId: nextTeamId });
    next = updateCareerPaint(next, {
      r: teamRgb.r,
      g: teamRgb.g,
      b: teamRgb.b,
      useCustomPaint: false,
    });
    this._commitCareerState(next);
    this._setCareerFeedback(`Livrea: ${team.name}`);
  }

  _bindEvents() {
    // 4 Bottom Navigation Tabs
    this.navButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.gpTab;
        this.activeTab = this.activeTab === tab ? null : tab;
        this._syncUI();
      });
    });

    // Customize Vertical Stack
    this.customizeStackBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.customizeSub = btn.dataset.customSub;
        this._syncUI();
      });
    });

    // Free Cash button (+$250.000)
    if (this.freeCashBtn) {
      this.freeCashBtn.addEventListener('click', () => {
        const next = grantCareerFreeCash(this.careerState, 250000);
        this._commitCareerState(next);
        this._setCareerFeedback('+$250.000 accreditati!');
      });
    }

    if (this.snapshotBtn) {
      this.snapshotBtn.addEventListener('click', () => {
        this.activeTab = this.activeTab === 'vehicle' ? null : 'vehicle';
        this._syncUI();
      });
    }

    // Paint sliders
    const handlePaintChange = () => {
      const next = updateCareerPaint(this.careerState, {
        r: Number(this.sliderR?.value ?? 220),
        g: Number(this.sliderG?.value ?? 0),
        b: Number(this.sliderB?.value ?? 0),
        smoothness: Number(this.sliderSmooth?.value ?? 78) / 100,
        metallic: Number(this.sliderMetal?.value ?? 35) / 100,
        useCustomPaint: true,
      });
      this._commitCareerState(next);
    };

    [this.sliderR, this.sliderG, this.sliderB, this.sliderSmooth, this.sliderMetal].forEach(
      (slider) => {
        if (slider) {
          slider.addEventListener('input', handlePaintChange);
        }
      }
    );

    if (this.paintResetTeamBtn) {
      this.paintResetTeamBtn.addEventListener('click', () => {
        const team = F1_2026_TEAMS[this.careerState.teamId] || F1_2026_TEAMS.ferrari;
        const rgb = hexToRgb(team.primaryColor);
        const next = updateCareerPaint(this.careerState, {
          r: rgb.r,
          g: rgb.g,
          b: rgb.b,
          smoothness: 0.75,
          metallic: 0.35,
          useCustomPaint: false,
        });
        this._commitCareerState(next);
        this._setCareerFeedback(`Colore ufficiale ${team.name} ripristinato.`);
      });
    }

    // Upgrades Carousel Arrows & Purchase Click
    if (this.upgPrevBtn) {
      this.upgPrevBtn.addEventListener('click', () => {
        this.upgradeWindowOffset = this.upgradeWindowOffset === 0 ? 1 : 0;
        this._syncVehicleOverlay();
      });
    }
    if (this.upgNextBtn) {
      this.upgNextBtn.addEventListener('click', () => {
        this.upgradeWindowOffset = this.upgradeWindowOffset === 0 ? 1 : 0;
        this._syncVehicleOverlay();
      });
    }

    if (this.careerUpgradesGridEl) {
      this.careerUpgradesGridEl.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-upgrade-id]');
        if (!btn) return;
        const catId = btn.dataset.upgradeId;
        const res = purchaseCareerUpgrade(this.careerState, catId);
        if (res.ok) {
          this._commitCareerState(res.state);
          const catLabel = UPGRADE_CATEGORIES[catId]?.label ?? catId;
          this._setCareerFeedback(`${catLabel} potenziato al Lv. ${res.newLevel}!`);
        } else {
          this._setCareerFeedback(res.reason || 'Fondi insufficienti.', true);
        }
      });
    }

    // Liveries Arrows + Randomize + Rotate Camera
    if (this.liveryPrevBtn) {
      this.liveryPrevBtn.addEventListener('click', () => this._cycleTeam(-1));
    }
    if (this.liveryNextBtn) {
      this.liveryNextBtn.addEventListener('click', () => this._cycleTeam(1));
    }

    if (this.randomizeBtn) {
      this.randomizeBtn.addEventListener('click', () => {
        const randTeam = TEAM_IDS[Math.floor(Math.random() * TEAM_IDS.length)];
        const r = Math.floor(Math.random() * 230 + 15);
        const g = Math.floor(Math.random() * 230 + 15);
        const b = Math.floor(Math.random() * 230 + 15);
        const smoothness = Number((0.35 + Math.random() * 0.62).toFixed(2));
        const metallic = Number((0.15 + Math.random() * 0.8).toFixed(2));

        let next = updateCareerProfile(this.careerState, { teamId: randTeam });
        next = updateCareerPaint(next, {
          r,
          g,
          b,
          smoothness,
          metallic,
          useCustomPaint: true,
        });
        this._commitCareerState(next);
        this._setCareerFeedback('Livrea & vernice randomizzate!');
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
        const nextTeamId = this.careerTeamSelectEl.value;
        const team = F1_2026_TEAMS[nextTeamId] || F1_2026_TEAMS.ferrari;
        const rgb = hexToRgb(team.primaryColor);
        let next = updateCareerProfile(this.careerState, { teamId: nextTeamId });
        next = updateCareerPaint(next, {
          r: rgb.r,
          g: rgb.g,
          b: rgb.b,
          useCustomPaint: false,
        });
        this._commitCareerState(next);
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

    // Mode, Format, Difficulty, Weather & Practice Options
    this.modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.state.mode = btn.dataset.menuMode;
        this._syncUI();
      });
    });

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
        this._syncUI();
      });
    });

    if (this.driverSelectEl) {
      this.driverSelectEl.addEventListener('change', () => {
        this.state.playerDriverId = this.driverSelectEl.value;
      });
    }

    // Start Session & Resume
    if (this.startBtn) {
      this.startBtn.addEventListener('click', () => {
        if (this.careerNameInputEl) {
          const typed = this.careerNameInputEl.value.trim();
          if (typed && typed !== this.careerState.playerName) {
            this.careerState = updateCareerProfile(this.careerState, { playerName: typed });
          }
        }
        this.hasActiveSession = true;
        this.activeTab = null;
        this.close();
        this.onStartSession(this.buildSessionConfig());
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

    if (this.mpStartSessionBtn) {
      this.mpStartSessionBtn.addEventListener('click', () => {
        if (!this.roomManager?.isHost() || !this.onStartMultiplayerSession) return;
        this.hasActiveSession = true;
        this.activeTab = null;
        this.close();
        this.onStartMultiplayerSession({
          mode: this.mpFormat,
          difficultyId: this.state.difficultyId,
          weather: this.state.weather,
        });
      });
    }
  }

  getLocalPlayerProfile() {
    const paint = this.careerState.paint || {};
    const specs = buildCarSpecsFromUpgrades(this.careerState.upgrades);
    return {
      playerName: this.careerState.playerName,
      playerCode: this.careerState.playerCode,
      teamId: this.careerState.teamId,
      customPrimaryColor: paint.useCustomPaint ? rgbToHex(paint.r, paint.g, paint.b) : null,
      paintRoughness: Math.max(0.05, 1.0 - (paint.smoothness ?? 0.78)),
      paintMetalness: paint.metallic ?? 0.35,
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
  }

  _syncVehicleOverlay() {
    const c = this.careerState;
    if (!c) return;

    const paint = c.paint || {};
    const team = F1_2026_TEAMS[c.teamId] || F1_2026_TEAMS.ferrari;
    const teamRgb = hexToRgb(team.primaryColor);
    const activeR = paint.useCustomPaint ? paint.r : teamRgb.r;
    const activeG = paint.useCustomPaint ? paint.g : teamRgb.g;
    const activeB = paint.useCustomPaint ? paint.b : teamRgb.b;
    const smoothPct = Math.round((paint.smoothness ?? 0.78) * 100);
    const metalPct = Math.round((paint.metallic ?? 0.35) * 100);

    if (this.sliderR) this.sliderR.value = String(activeR);
    if (this.sliderG) this.sliderG.value = String(activeG);
    if (this.sliderB) this.sliderB.value = String(activeB);
    if (this.sliderSmooth) this.sliderSmooth.value = String(smoothPct);
    if (this.sliderMetal) this.sliderMetal.value = String(metalPct);

    if (this.fillR) this.fillR.style.width = `${Math.round((activeR / 255) * 100)}%`;
    if (this.fillG) this.fillG.style.width = `${Math.round((activeG / 255) * 100)}%`;
    if (this.fillB) this.fillB.style.width = `${Math.round((activeB / 255) * 100)}%`;
    if (this.fillSmooth) this.fillSmooth.style.width = `${smoothPct}%`;
    if (this.fillMetal) this.fillMetal.style.width = `${metalPct}%`;

    if (this.liveryNameEl) {
      this.liveryNameEl.textContent = paint.useCustomPaint
        ? `${team.name} (Vernice Custom)`
        : team.name;
    }

    if (this.careerUpgradesGridEl) {
      const visibleIds = UPGRADE_WINDOW_ORDER.slice(
        this.upgradeWindowOffset,
        this.upgradeWindowOffset + 4
      );
      this.careerUpgradesGridEl.innerHTML = visibleIds
        .map((catId) => {
          const cat = UPGRADE_CATEGORIES[catId];
          const lvl = c.upgrades[catId] ?? 0;
          const isMax = lvl >= UPGRADE_MAX_LEVEL;
          const cost = getUpgradeCost(catId, lvl);
          const canAfford = cost !== null && c.money >= cost;
          const labelUpper =
            catId === 'aero'
              ? 'AERO-<br>DYNAMICS'
              : cat.label.toUpperCase();
          const priceLabel = isMax ? 'MAX' : formatDollarCash(cost);

          return `
            <button
              type="button"
              class="gp-gold-btn gp-upg-card-btn"
              data-upgrade-id="${catId}"
              title="${cat.description}"
              ${isMax || !canAfford ? 'disabled' : ''}
            >
              <span class="gp-upg-name">${labelUpper}</span>
              <span class="gp-upg-meta">Lv.${lvl}/${UPGRADE_MAX_LEVEL} • ${priceLabel}</span>
            </button>
          `;
        })
        .join('');
    }
  }

  _syncUI() {
    const c = this.careerState;
    const s = c.stats;

    // Top bar
    if (this.careerMoneyBadgeEl) {
      this.careerMoneyBadgeEl.textContent = formatDollarCash(c.money);
    }
    if (this.racesValEl) this.racesValEl.textContent = String(s.racesCompleted);
    if (this.winsValEl) this.winsValEl.textContent = String(s.wins);
    if (this.profileNameEl) this.profileNameEl.textContent = c.playerName;
    if (this.profileSubEl) {
      if (this.activeTab === 'vehicle') {
        this.profileSubEl.textContent = `${s.racesCompleted} RACES RAN`;
      } else {
        const winRate =
          s.racesCompleted > 0 ? Math.round((s.wins / s.racesCompleted) * 100) : 0;
        this.profileSubEl.textContent = `% ${winRate} WIN RATE`;
      }
    }

    // Bottom active tab highlight
    this.navButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.gpTab === this.activeTab);
    });
    if (this.resumeBtn) {
      this.resumeBtn.style.display = this.hasActiveSession ? 'inline-block' : 'none';
    }

    // Overlays visibility
    if (this.vehicleOverlayEl) {
      this.vehicleOverlayEl.style.display = this.activeTab === 'vehicle' ? 'flex' : 'none';
    }
    const isCustom = this.activeTab === 'customize';
    if (this.customizeStackEl) {
      this.customizeStackEl.style.display = isCustom ? 'flex' : 'none';
    }
    if (this.customizeSubcardEl) {
      this.customizeSubcardEl.style.display = isCustom ? 'flex' : 'none';
    }
    if (isCustom) {
      this.customizeStackBtns.forEach((btn) => {
        btn.classList.toggle('is-selected', btn.dataset.customSub === this.customizeSub);
      });
      if (this.subTeamEl) this.subTeamEl.style.display = this.customizeSub === 'team' ? 'flex' : 'none';
      if (this.subDriverEl) this.subDriverEl.style.display = this.customizeSub === 'driver' ? 'flex' : 'none';
      if (this.subProfileEl) this.subProfileEl.style.display = this.customizeSub === 'profile' ? 'flex' : 'none';
    }

    if (this.racePopupEl) {
      this.racePopupEl.style.display = this.activeTab === 'race' ? 'flex' : 'none';
    }
    if (this.mpPopupEl) {
      this.mpPopupEl.style.display = this.activeTab === 'multiplayer' ? 'flex' : 'none';
    }
    if (this.settingsPopupEl) {
      this.settingsPopupEl.style.display = this.activeTab === 'settings' ? 'flex' : 'none';
    }

    // Sync Race / Practice / Settings states
    this.modeButtons.forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.menuMode === this.state.mode);
    });
    if (this.careerFormatWrapEl) {
      this.careerFormatWrapEl.style.display = this.state.mode === 'career' ? 'flex' : 'none';
    }
    this.careerFormatButtons.forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.careerFormat === c.careerFormat);
    });
    if (this.practiceOptionsSection) {
      this.practiceOptionsSection.style.display = this.state.mode === 'practice' ? 'flex' : 'none';
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
    const paint = this.careerState.paint || {};
    const customPrimaryColor = paint.useCustomPaint
      ? rgbToHex(paint.r, paint.g, paint.b)
      : null;
    const paintRoughness = Math.max(0.05, 1.0 - (paint.smoothness ?? 0.78));
    const paintMetalness = paint.metallic ?? 0.35;

    if (this.state.mode === 'career') {
      const repDriver = getRepresentativeDriverForTeam(this.careerState.teamId);
      const customSpecs = buildCarSpecsFromUpgrades(this.careerState.upgrades);
      const format = this.careerState.careerFormat === 'race' ? 'race' : 'qualifying';
      return {
        mode: format,
        difficultyId: this.state.difficultyId,
        withBots: true,
        lapLimit: format === 'race' ? 10 : null,
        carLevel: customSpecs.id,
        weather: this.state.weather,
        playerDriverId: repDriver.id,
        playerGridIndex: 7,
        isCareer: true,
        careerTeamId: this.careerState.teamId,
        playerCustomName: this.careerState.playerName,
        playerCustomCode: this.careerState.playerCode,
        playerCustomSpecs: customSpecs,
        customPrimaryColor,
        paintRoughness,
        paintMetalness,
      };
    }

    const isPractice = this.state.mode === 'practice';
    const finiteCount = Math.max(
      1,
      Math.min(99, parseInt(this.finiteLapsInput?.value || this.state.finiteLaps, 10) || 5)
    );

    return {
      mode: this.state.mode,
      difficultyId: this.state.difficultyId,
      withBots: isPractice ? this.state.withBots : true,
      lapLimit: isPractice
        ? (this.state.lapType === 'infinite' ? null : finiteCount)
        : this.state.mode === 'qualifying'
          ? null
          : 10,
      carLevel: isPractice ? this.state.carLevel : 'base',
      weather: this.state.weather,
      playerDriverId: this.state.playerDriverId,
      playerGridIndex: isPractice && !this.state.withBots ? 0 : 7,
      isCareer: false,
      customPrimaryColor,
      paintRoughness,
      paintMetalness,
    };
  }

  open() {
    this.isOpen = true;
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
