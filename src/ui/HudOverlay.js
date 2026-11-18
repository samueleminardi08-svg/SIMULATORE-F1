/**
 * Gestore dell'interfaccia HUD stile F1 TV (Step 4).
 * - A sinistra: pannello delta dei tempi e cronologia giri.
 * - In basso al centro: barra dei 3 settori ufficiali (S1, S2, S3) colorati
 *   in viola/verde/giallo e telemetria centrale (tempo giro m:ss.SSS, delta, marcia, km/h, RPM, superficie).
 */

import {
  CAR_PHYSICS_CONFIG,
  SURFACE_PHYSICS,
  TIMING_CONFIG,
  WEATHER_CONFIG,
} from '../config/constants.js';
import { getDifficultyConfig } from '../config/difficulty.js';
import { getCarSpecsForLevel } from '../cars/CarSpecs.js';
import { formatCurrencyEUR } from '../career/CareerStorage.js';
import { formatDeltaTime, formatLapTime, formatSectorTime } from '../race/TimingSystem.js';
import { ModalManager } from './ModalManager.js';

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
    this.modalManager = options.modalManager || new ModalManager();
    this._careerWalletAmount = null;
    this._roomCode = '';
    this._roomRole = 'offline';

    this.trackNameEl = document.getElementById('track-name');
    this.cameraLabelEl = document.getElementById('camera-label');
    this.modeBadgeEl = document.getElementById('hud-mode-badge');
    this.difficultyBadgeEl = document.getElementById('hud-difficulty-badge');
    this.carLevelBadgeEl = document.getElementById('hud-carlevel-badge');
    this.careerMoneyBadgeEl = document.getElementById('hud-career-money-badge');
    this.roomBadgeEl = document.getElementById('hud-room-badge');

    // Pannello sinistro: Delta, Posizione e Classifica Gara
    this.lapNumberEl = document.getElementById('hud-lap-number');
    this.posBadgeEl = document.getElementById('hud-pos-badge');
    this.leftDeltaBadgeEl = document.getElementById('hud-left-delta');
    this.leftCurrentLapEl = document.getElementById('hud-left-current-lap');
    this.leftLastLapEl = document.getElementById('hud-left-last-lap');
    this.leftBestLapEl = document.getElementById('hud-left-best-lap');
    this.leftOverallBestEl = document.getElementById('hud-left-overall-best');
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
    this.downforceValueEl = document.getElementById('downforce-value');
    this.lockupAlertEl = document.getElementById('lockup-alert');
    this.trackLimitsBadgeEl = document.getElementById('track-limits-badge');
    this.trackLimitsBannerEl = document.getElementById('track-limits-banner');

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
    this._driverRowElements = [];
    this._buildSectorCards();
    this._registerModals();
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

  setTrackName(name) {
    if (this.trackNameEl) {
      this.trackNameEl.textContent = name;
    }
  }

  setCameraLabel(label) {
    if (this.cameraLabelEl) {
      this.cameraLabelEl.textContent = label;
    }
  }

  setCareerBalance(amount) {
    this._careerWalletAmount = amount;
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
      this.surfaceBadgeEl.textContent = 'Urto Barriera!';
      this.surfaceBadgeEl.className = 'surface-badge surface-barrier';
      return;
    }

    const surfaceKey = carState.surface || 'asphalt';
    const props = SURFACE_PHYSICS[surfaceKey] || SURFACE_PHYSICS.asphalt;
    this.surfaceBadgeEl.textContent = props.label;
    this.surfaceBadgeEl.className = `surface-badge surface-${surfaceKey}`;
  }

  _updateSectors(timing) {
    if (!timing || this._sectorCards.length === 0) return;

    const showLastLapTail =
      timing.currentLapTime < 3.5 &&
      Array.isArray(timing.lastLapSectorStatuses) &&
      Array.isArray(timing.lastLapSectorTimes);

    for (let i = 0; i < this._sectorCards.length; i++) {
      const { card, timeEl } = this._sectorCards[i];
      let status = timing.currentSectorStatuses[i] || 'pending';
      let secTime = timing.currentSectorTimes[i];

      if (status === 'pending' && showLastLapTail) {
        status = timing.lastLapSectorStatuses[i] || 'pending';
        secTime = timing.lastLapSectorTimes[i];
      } else if (timing.lapStarted && i === timing.currentSectorIndex && secTime === null) {
        secTime = Math.max(0, timing.currentLapTime - timing.sectorStartTime);
      }

      const isActive = timing.lapStarted && i === timing.currentSectorIndex;
      card.className = `sector-card status-${status}${isActive ? ' is-active' : ''}`;
      timeEl.textContent = formatSectorTime(secTime);
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
      if (isQuali) {
        this.lapNumberEl.textContent = `${q.stageId} • ${formatTimerMMSS(q.timeRemaining)}`;
      } else if (race) {
        if (race.totalLaps !== null) {
          const displayLap = Math.min(t.currentLap, race.totalLaps);
          this.lapNumberEl.textContent = `GIRO ${displayLap} / ${race.totalLaps}`;
        } else {
          this.lapNumberEl.textContent = `GIRO ${t.currentLap} / ∞`;
        }
      } else {
        this.lapNumberEl.textContent = `GIRO ${t.currentLap}`;
      }
    }

    if (this.posBadgeEl) {
      if (isQuali) {
        this.posBadgeEl.style.display = 'inline-block';
        this.posBadgeEl.textContent = `P${playerCar.racePosition} / ${q.activeDriverIds.length}`;
      } else if (race && race.standings.length > 1) {
        this.posBadgeEl.style.display = 'inline-block';
        this.posBadgeEl.textContent = `P${playerCar.racePosition} / ${race.standings.length}`;
      } else {
        this.posBadgeEl.style.display = 'none';
      }
    }

    const lapInvalid =
      Boolean(t.currentLapInvalidated) &&
      (sessionMode === 'qualifying' || sessionMode === 'practice');

    const deltaFormatted = lapInvalid ? 'ANNULLATO' : formatDeltaTime(t.liveDelta);
    const deltaClass = lapInvalid ? 'delta-invalid' : getDeltaColorClass(t.liveDelta, false);

    if (this.leftDeltaBadgeEl) {
      this.leftDeltaBadgeEl.textContent = deltaFormatted;
      this.leftDeltaBadgeEl.className = `delta-pill ${deltaClass}`;
    }
    if (this.leftCurrentLapEl) {
      this.leftCurrentLapEl.textContent = formatLapTime(t.currentLapTime);
      this.leftCurrentLapEl.className = `lap-time-val${lapInvalid ? ' is-invalidated' : ''}`;
    }
    if (this.leftLastLapEl) {
      this.leftLastLapEl.textContent = formatLapTime(t.lastLapTime);
    }
    if (this.leftBestLapEl) {
      this.leftBestLapEl.textContent = formatLapTime(t.bestLapTime);
    }
    if (this.leftOverallBestEl && sessionTiming) {
      this.leftOverallBestEl.textContent = formatLapTime(sessionTiming.overallBestLapTime);
    }

    if (this.leftDriverRowsEl) {
      const standings = race?.standings?.length
        ? race.standings
        : Object.values(worldState.cars).map((car, idx) => ({
            id: car.id,
            position: idx + 1,
            code: car.code || (car.id === localPlayerId ? 'TU' : car.id.slice(0, 3).toUpperCase()),
            driverNumber: car.driverNumber ?? 1,
            color: car.color || '#38bdf8',
            gapToLeader: car.timing ? formatDeltaTime(car.timing.liveDelta) : '±0.000',
            raceFinished: car.raceFinished,
          }));

      while (this._driverRowElements.length < standings.length) {
        const row = document.createElement('div');
        row.className = 'driver-delta-row';

        const posEl = document.createElement('span');
        posEl.className = 'driver-pos';
        const colorEl = document.createElement('span');
        colorEl.className = 'driver-color-bar';
        const codeEl = document.createElement('span');
        codeEl.className = 'driver-code';
        const deltaEl = document.createElement('span');
        deltaEl.className = 'driver-delta';

        row.append(posEl, colorEl, codeEl, deltaEl);
        this.leftDriverRowsEl.appendChild(row);
        this._driverRowElements.push({ row, posEl, colorEl, codeEl, deltaEl });
      }

      for (let i = 0; i < this._driverRowElements.length; i++) {
        const item = this._driverRowElements[i];
        if (i >= standings.length) {
          item.row.style.display = 'none';
          continue;
        }
        const rowData = standings[i];
        const isLocal = rowData.id === localPlayerId;
        const label = `#${rowData.driverNumber ?? ''} ${rowData.code}`;

        item.row.style.display = 'flex';
        item.row.className = `driver-delta-row${isLocal ? ' is-local' : ''}${
          rowData.inEliminationZone ? ' is-elim-zone' : ''
        }`;
        item.posEl.textContent = String(rowData.position);
        item.colorEl.style.backgroundColor = rowData.color || '#38bdf8';
        item.codeEl.textContent = label;
        item.deltaEl.textContent = rowData.gapToLeader;
        item.deltaEl.className = `driver-delta ${
          rowData.position === 1
            ? 'delta-purple'
            : rowData.penaltySeconds > 0
              ? 'delta-invalid'
              : 'delta-neutral'
        }`;
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
      const showGantry = race.status === 'countdown' || race.lightsOutFlashTimer > 0;
      this.startGantryEl.style.display = showGantry ? 'flex' : 'none';

      if (showGantry) {
        for (let i = 0; i < this.startLightEls.length; i++) {
          const el = this.startLightEls[i];
          if (!el) continue;
          if (race.status === 'countdown' && i < race.lightsOn) {
            el.classList.add('is-on');
          } else {
            el.classList.remove('is-on');
          }
        }
        if (this.startLightsStatusEl) {
          if (race.status === 'countdown') {
            this.startLightsStatusEl.textContent = 'ATTENDI IL VIA...';
            this.startLightsStatusEl.className = 'start-status waiting';
          } else {
            this.startLightsStatusEl.textContent = 'VIA! PARTENZA!';
            this.startLightsStatusEl.className = 'start-status go';
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
          let updatedWallet = this._careerWalletAmount;
          if (!worldState.careerRewardGranted && this.onCareerRaceFinished) {
            const res = this.onCareerRaceFinished(worldState, playerCar);
            if (res?.reward) {
              reward = res.reward;
              worldState.careerRewardGranted = true;
              worldState.lastCareerReward = reward;
            }
            if (res?.careerState) {
              updatedWallet = res.careerState.money;
              this._careerWalletAmount = updatedWallet;
            }
          }
          if (reward) {
            const fastestStr = reward.fastestLapBonus > 0 ? ' • Giro Veloce +75.000 €' : '';
            const walletStr =
              updatedWallet !== null && updatedWallet !== undefined
                ? ` • Nuovo Saldo: ${formatCurrencyEUR(updatedWallet)}`
                : '';
            this.careerRewardBoxEl.style.display = 'block';
            this.careerRewardBoxEl.textContent =
              `Premio Carriera (${reward.position}° posto, Difficoltà x${reward.difficultyMultiplier}): +${formatCurrencyEUR(reward.totalPrize)} (+${reward.points} pt)${fastestStr}${walletStr}`;
          }
          if (this.finishOpenMenuBtnEl) {
            this.finishOpenMenuBtnEl.textContent = 'Officina Carriera';
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
      if (this.trackLimitsBannerEl) {
        this.trackLimitsBannerEl.style.display = 'none';
      }
      return;
    }

    this._updateLeftDeltaPanel(worldState, localPlayerId);

    if (playerCar.timing) {
      const lapInvalid =
        Boolean(playerCar.timing.currentLapInvalidated) &&
        (sessionMode === 'qualifying' || sessionMode === 'practice');

      this._updateSectors(playerCar.timing);
      if (this.centerLapTimeEl) {
        this.centerLapTimeEl.textContent = formatLapTime(playerCar.timing.currentLapTime);
        this.centerLapTimeEl.className = `center-lap-time${lapInvalid ? ' is-invalidated' : ''}`;
      }
      if (this.centerDeltaEl) {
        this.centerDeltaEl.textContent = lapInvalid
          ? 'GIRO ANNULLATO'
          : formatDeltaTime(playerCar.timing.liveDelta);
        this.centerDeltaEl.className = `center-delta ${
          lapInvalid ? 'delta-invalid' : getDeltaColorClass(playerCar.timing.liveDelta)
        }`;
      }
    }

    if (this.speedValueEl) {
      const totalSpeedMs = Math.hypot(playerCar.vx, playerCar.vz);
      this.speedValueEl.textContent = String(Math.round(totalSpeedMs * 3.6));
    }
    if (this.gearValueEl) {
      this.gearValueEl.textContent = playerCar.gearLabel;
    }
    if (this.rpmValueEl && this.rpmBarFillEl) {
      const roundedRpm = Math.round(playerCar.rpm);
      this.rpmValueEl.textContent = `${roundedRpm} RPM`;
      const rpmRatio = Math.max(
        0,
        Math.min(1, roundedRpm / CAR_PHYSICS_CONFIG.maxRpm)
      );
      this.rpmBarFillEl.style.width = `${Math.round(rpmRatio * 100)}%`;
      this.rpmBarFillEl.style.backgroundColor = getRpmBarColor(rpmRatio);
    }

    this._updateSurfaceBadge(playerCar);
    this._updateAdvancedPhysics(playerCar, worldState.weather || 'dry');
    this._updateTrackLimitsHud(playerCar, sessionMode);
    this._updateRaceOverlays(worldState, localPlayerId);
  }

  _updateSessionBadges(worldState, playerCar) {
    const mode = worldState.sessionConfig?.mode || worldState.raceState?.mode || 'practice';
    const isCareer = Boolean(worldState.sessionConfig?.isCareer);

    if (this.modeBadgeEl) {
      if (mode === 'qualifying') {
        const stageId = worldState.qualifyingState?.stageId || 'Q1';
        this.modeBadgeEl.textContent = isCareer
          ? `Carriera · ${stageId}`
          : `Qualifiche ${stageId}`;
        this.modeBadgeEl.className = 'session-badge badge-mode-quali';
      } else if (mode === 'race') {
        this.modeBadgeEl.textContent = isCareer ? 'Carriera · Gara' : 'Gara 10 Giri';
        this.modeBadgeEl.className = 'session-badge badge-mode-race';
      } else {
        this.modeBadgeEl.textContent = worldState.sessionConfig?.withBots
          ? 'Prove Libere (Bot)'
          : 'Prove Libere (Solo)';
        this.modeBadgeEl.className = 'session-badge badge-mode-practice';
      }
    }

    if (this.difficultyBadgeEl) {
      const diffCfg = getDifficultyConfig(worldState.difficultyId);
      this.difficultyBadgeEl.textContent = diffCfg.shortLabel;
      this.difficultyBadgeEl.className = `session-badge badge-diff-${diffCfg.id}`;
    }

    if (this.carLevelBadgeEl && playerCar) {
      const specs = playerCar.carSpecs || getCarSpecsForLevel(playerCar.carLevel);
      this.carLevelBadgeEl.textContent = specs.id === 'custom' ? specs.shortLabel : `Auto ${specs.shortLabel}`;
      this.carLevelBadgeEl.className = `session-badge badge-car-${specs.id}`;
    }

    if (this.careerMoneyBadgeEl) {
      if (isCareer && this._careerWalletAmount !== null && this._careerWalletAmount !== undefined) {
        this.careerMoneyBadgeEl.style.display = 'inline-block';
        this.careerMoneyBadgeEl.textContent = formatCurrencyEUR(this._careerWalletAmount);
      } else {
        this.careerMoneyBadgeEl.style.display = 'none';
      }
    }

    if (this.roomBadgeEl) {
      if (this._roomRole !== 'offline' && this._roomCode) {
        this.roomBadgeEl.style.display = 'inline-block';
        const roleTag = this._roomRole === 'host' ? 'HOST' : 'CLIENT';
        this.roomBadgeEl.textContent = `${this._roomCode} · ${roleTag}`;
      } else {
        this.roomBadgeEl.style.display = 'none';
      }
    }
  }

  _updateTrackLimitsHud(playerCar, sessionMode) {
    const t = playerCar?.timing;
    if (!t) return;

    if (this.trackLimitsBadgeEl) {
      if (sessionMode === 'qualifying' || sessionMode === 'practice') {
        if (t.currentLapInvalidated) {
          this.trackLimitsBadgeEl.textContent = 'GIRO ANNULLATO';
          this.trackLimitsBadgeEl.className = 'physics-alert alert-lockup';
        } else {
          this.trackLimitsBadgeEl.textContent = `TL: ${t.trackLimitsCount}`;
          this.trackLimitsBadgeEl.className =
            t.trackLimitsCount > 0 ? 'physics-alert alert-braking' : 'physics-alert alert-ok';
        }
      } else if (t.penaltySeconds > 0) {
        this.trackLimitsBadgeEl.textContent = `PEN +${t.penaltySeconds}s (TL:${t.trackLimitsCount})`;
        this.trackLimitsBadgeEl.className = 'physics-alert alert-lockup';
      } else {
        this.trackLimitsBadgeEl.textContent = `TL: ${t.trackLimitsCount}/3`;
        this.trackLimitsBadgeEl.className =
          t.trackLimitsCount >= 2 ? 'physics-alert alert-braking' : 'physics-alert alert-ok';
      }
    }

    if (this.trackLimitsBannerEl) {
      if (t.trackLimitAlertTimer > 0 && t.trackLimitAlertText) {
        const isSeverityHigh = t.penaltySeconds > 0 || t.currentLapInvalidated;
        this.trackLimitsBannerEl.style.display = 'block';
        this.trackLimitsBannerEl.textContent = t.trackLimitAlertText;
        this.trackLimitsBannerEl.className = isSeverityHigh
          ? 'tl-banner-penalty'
          : 'tl-banner-warn';
      } else {
        this.trackLimitsBannerEl.style.display = 'none';
      }
    }
  }

  _updateQualifyingOverlays(worldState, localPlayerId) {
    const q = worldState.qualifyingState;
    const isQuali = Boolean(q && worldState.raceState?.mode === 'qualifying');

    if (this.qualiHudControlsEl) {
      this.qualiHudControlsEl.style.display = isQuali ? 'flex' : 'none';
    }

    if (!isQuali) {
      this.hideQualifyingModal();
      return;
    }

    if (this.qualiCutoffInfoEl) {
      if (q.stageId === 'Q1') {
        this.qualiCutoffInfoEl.textContent = 'Taglio Q1: Top 16 in Q2 (P17–P22 out)';
      } else if (q.stageId === 'Q2') {
        this.qualiCutoffInfoEl.textContent = 'Taglio Q2: Top 10 in Q3 (P11–P16 out)';
      } else {
        this.qualiCutoffInfoEl.textContent = 'Top 10 Shootout — Pole Position';
      }
    }

    if (this.qualiSkipVotesInfoEl) {
      const req = q.skipVotes?.requiredPlayers || [];
      const approved = q.skipVotes?.approvedBy || [];
      if (req.length > 1 || approved.length > 0) {
        this.qualiSkipVotesInfoEl.style.display = 'block';
        const actionLabel =
          q.skipVotes?.requestedAction === 'all' ? 'Vai alla Gara' : 'Salta Fase';
        this.qualiSkipVotesInfoEl.textContent = `Voti Skip (${actionLabel}): ${approved.length}/${req.length} (unanimità)`;
      } else {
        this.qualiSkipVotesInfoEl.style.display = 'none';
      }
    }

    if (q.status === 'running') {
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
    if (modalKey === this._lastQualiModalKey) {
      return;
    }
    this._lastQualiModalKey = modalKey;

    const isClient = this._roomRole === 'client';

    if (q.status === 'stage_complete') {
      const nextStageLabel = q.stageId === 'Q1' ? 'Q2 (3:30)' : 'Q3 (2:30)';
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
          ? `Sei stato eliminato in ${q.stageId} (${posStr} posto).`
          : `Qualificato alla fase successiva! Hai chiuso ${q.stageId} in ${posStr} posizione.`;
      }
      if (this.qualiNextBtnEl) {
        this.qualiNextBtnEl.disabled = isClient;
        this.qualiNextBtnEl.textContent = isClient
          ? "In attesa dell'Host..."
          : q.allHumansEliminated
            ? 'Simula fino alla Griglia Finale'
            : `Avanza a ${nextStageLabel}`;
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
        this.qualiModalTitleEl.textContent = 'Griglia di Partenza Ufficiale — Gara (10 Giri)';
      }
      if (this.qualiModalSummaryEl) {
        this.qualiModalSummaryEl.textContent = `Pole Position: ${pole?.driverName ?? '-'} (${formatLapTime(pole?.bestLapTime)}) • La tua partenza in griglia: ${playerGridRow ? `${playerGridRow.position}°` : '-'}`;
      }
      if (this.qualiSkipToRaceBtnEl) {
        this.qualiSkipToRaceBtnEl.style.display = 'none';
      }
      if (this.qualiNextBtnEl) {
        this.qualiNextBtnEl.disabled = isClient;
        this.qualiNextBtnEl.textContent = isClient
          ? "In attesa che l'Host avvii la Gara..."
          : 'Avvia Gara (10 Giri)';
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

  _updateAdvancedPhysics(carState, weatherId) {
    if (this.weatherBadgeEl) {
      const wProps = WEATHER_CONFIG[weatherId] || WEATHER_CONFIG.dry;
      this.weatherBadgeEl.textContent = weatherId === 'rain' ? 'Pioggia' : wProps.label;
      this.weatherBadgeEl.className = `weather-badge weather-${weatherId}`;
    }

    const aero = carState.aeroTire;
    if (!aero) return;

    if (this.downforceValueEl) {
      this.downforceValueEl.textContent = `${aero.downforceKg} kg`;
    }

    if (this.tireHealthValueEl && this.tireBarFillEl) {
      const pct = Math.round(aero.tireHealth * 100);
      this.tireHealthValueEl.textContent = `${pct}%`;
      this.tireBarFillEl.style.width = `${pct}%`;
      this.tireBarFillEl.style.backgroundColor =
        pct > 65 ? '#22c55e' : pct > 30 ? '#f59e0b' : '#ef4444';
    }

    if (this.lockupAlertEl) {
      if (aero.wheelLockup) {
        this.lockupAlertEl.textContent = 'BLOCCAGGIO!';
        this.lockupAlertEl.className = 'physics-alert alert-lockup';
      } else if (aero.highSpeedBraking) {
        this.lockupAlertEl.textContent = 'STACCATA AL LIMITE';
        this.lockupAlertEl.className = 'physics-alert alert-braking';
      } else {
        this.lockupAlertEl.textContent = 'GRIP OK';
        this.lockupAlertEl.className = 'physics-alert alert-ok';
      }
    }
  }
}
