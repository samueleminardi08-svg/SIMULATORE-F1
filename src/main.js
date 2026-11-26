/**
 * Entry point principale del Gioco F1 3D (Step 11).
 * Integra Selettore Circuiti F1 2026 (Australia, Cina, Giappone, Monza),
 * Showroom Garage 3D, Multigiocatore Online PeerJS + BroadcastChannel
 * con codice stanza e voto unanime per lo skip delle qualifiche, Carriera,
 * Qualifiche Q1/Q2/Q3, Track Limits, Prove Libere e Gara da 10 Giri.
 */

import { LOCAL_PLAYER_ID, TIRE_COMPOUNDS } from './config/constants.js';
import { loadKeybindings } from './config/keybindings.js';
import {
  PHYSICS_TOGGLE_DEFS,
  loadPhysicsSettings,
  normalizePhysicsSettings,
} from './config/physicsSettings.js';
import {
  CAREER_RACE_LAPS,
  RACE_TOTAL_LAPS,
  getCareerWeekendPreset,
} from './config/f1_2026_data.js';
import { WorldState } from './core/WorldState.js';
import { GameLoop } from './core/GameLoop.js';
import { InputManager } from './input/InputManager.js';
import { getTrackById } from './tracks/calendar2026/index.js';
import { SceneManager } from './rendering/SceneManager.js';
import { loadDefaultCameraMode } from './rendering/CameraController.js';
import {
  getNightQualityConfig,
  loadSavedNightQuality,
} from './rendering/NightLightingConfig.js';
import { getSkyPresetById, loadSavedSkyPresetOption } from './rendering/SkyPresets.js';
import { TrackMapHud } from './ui/TrackMapHud.js';
import { PitLaneMapHud } from './ui/PitLaneMapHud.js';
import { LoadingScreenManager } from './ui/LoadingScreenManager.js';
import { HudOverlay } from './ui/HudOverlay.js';
import { MenuManager } from './ui/MenuManager.js';
import { ModalManager } from './ui/ModalManager.js';
import {
  getCareerCurrentTrack,
  loadCareerState,
  recordCareerRaceResult,
} from './career/CareerStorage.js';
import { RoomManager } from './network/RoomManager.js';

function initGame() {
  const canvas = document.getElementById('game-canvas');
  const trackMapCanvas = document.getElementById('track-map-canvas');
  const pitMapCanvas = document.getElementById('pit-map-canvas');
  const pitMapContainer = document.getElementById('pit-map-container');
  const restartBtn = document.getElementById('restart-race-btn');
  const finishOpenMenuBtn = document.getElementById('finish-open-menu-btn');
  const hudSkipStageBtn = document.getElementById('hud-skip-stage-btn');
  const hudSkipQualiBtn = document.getElementById('hud-skip-quali-btn');
  const hudExitPitBtn = document.getElementById('hud-exit-pit-btn');
  const hudQuickPitReturnBtn = document.getElementById('hud-quick-pit-return-btn');
  const hudResetTrackBtn = document.getElementById('hud-reset-track-btn');
  const hudBoxRequestBtn = document.getElementById('hud-box-request-btn');
  const hudNextCompoundBtns = [...document.querySelectorAll('[data-next-compound]')];
  const qualiNextBtn = document.getElementById('quali-next-btn');
  const qualiSkipToRaceBtn = document.getElementById('quali-skip-to-race-btn');
  const pauseModalEl = document.getElementById('pause-modal');
  const pauseMetaTrackEl = document.getElementById('pause-meta-track');
  const pauseMetaModeEl = document.getElementById('pause-meta-mode');
  const pauseMetaWeatherEl = document.getElementById('pause-meta-weather');
  const pauseMetaDifficultyEl = document.getElementById('pause-meta-difficulty');
  const pauseResumeBtn = document.getElementById('pause-resume-btn');
  const pauseRestartBtn = document.getElementById('pause-restart-btn');
  const pauseSettingsBtn = document.getElementById('pause-settings-btn');
  const pauseMenuBtn = document.getElementById('pause-menu-btn');
  const pitCompModalEl = document.getElementById('pit-compound-select-modal');
  const pitCompTitleEl = document.getElementById('pit-comp-modal-title');
  const pitCompSessionPillEl = document.getElementById('pit-comp-session-pill');
  const pitCompWeatherBannerEl = document.getElementById('pit-comp-weather-banner');
  const pitCompWeatherLabelEl = document.getElementById('pit-comp-weather-label');
  const pitCompRecPillEl = document.getElementById('pit-comp-rec-pill');
  const pitCompCardBtns = [...document.querySelectorAll('[data-box-compound]')];
  const pitCompConfirmBtn = document.getElementById('pit-comp-confirm-btn');
  let selectedBoxCompound = 'M';
  let lastGridCompoundPromptedKey = '';

  // 0. Caricamento Carriera persistente da localStorage e circuito attivo
  let careerState = loadCareerState();
  let activeTrack = getCareerCurrentTrack(careerState);
  let menuManager = null;
  let hudOverlay = null;
  let trackMapHud = null;
  let pitLaneMapHud = null;
  const loadingScreen = new LoadingScreenManager();

  // 1. Stato puro della simulazione & gestore input con comandi personalizzabili
  const initialKeybindings = loadKeybindings();
  const worldState = new WorldState(activeTrack);
  const inputManager = new InputManager(window, initialKeybindings);
  const modalManager = new ModalManager(window);

  // 2. Scena 3D (con profilo qualità grafica notturna, cielo 2K Pure Skies e visuale predefinita salvata)
  const initialNightQuality = loadSavedNightQuality();
  const initialSkyPreset = loadSavedSkyPresetOption();
  const initialCameraMode = loadDefaultCameraMode();
  const sceneManager = new SceneManager(canvas, activeTrack, {
    nightQuality: initialNightQuality,
    skyPreset: initialSkyPreset,
    defaultCameraMode: initialCameraMode,
    onNightQualityAutoFallback: (nextQuality, info = {}) => {
      // Il fallback automatico vale per la sessione corrente senza sovrascrivere la preferenza salvata dall'utente
      const label = getNightQualityConfig(nextQuality).label;
      const fpsText = Number.isFinite(info.measuredFps)
        ? `${Math.round(info.measuredFps)} FPS`
        : 'FPS bassi';
      if (menuManager) {
        menuManager.setNightQuality(
          nextQuality,
          `ridotta automaticamente a ${label} per mantenere fluidità (${fpsText})`
        );
      }
    },
  });

  const applyActiveTrack = (trackId) => {
    const nextTrack = getTrackById(trackId);
    if (!nextTrack) return activeTrack;
    if (
      activeTrack?.id === nextTrack.id &&
      worldState.trackData?.id === nextTrack.id &&
      sceneManager.trackData?.id === nextTrack.id
    ) {
      return activeTrack;
    }
    activeTrack = nextTrack;
    worldState.setTrack(activeTrack);
    sceneManager.setTrack(activeTrack);
    if (hudOverlay) {
      hudOverlay.setTrackName(`${activeTrack.name} — ${activeTrack.country}`);
    }
    if (trackMapHud) {
      trackMapHud.setTrackSurface(worldState.trackSurface);
    }
    if (pitLaneMapHud) {
      pitLaneMapHud.setTrackSurface(worldState.trackSurface);
    }
    return activeTrack;
  };

  const formatLoadingModeLabel = (cfg, isMultiplayer = false) => {
    if (cfg?.isCareer && !isMultiplayer) {
      const roundNum = Number.isFinite(Number(cfg.careerRoundIndex))
        ? Number(cfg.careerRoundIndex) + 1
        : (careerState.currentRoundIndex ?? 0) + 1;
      const preset = getCareerWeekendPreset(cfg.careerPresetId || careerState.weekendPresetId);
      const roundTag = `CARRIERA R${String(roundNum).padStart(2, '0')} • ${preset.shortLabel.toUpperCase()} • `;
      if (cfg?.mode === 'qualifying') return `${roundTag}QUALIFICHE Q1–Q3`;
      return `${roundTag}GARA ${preset.raceLaps} GIRI`;
    }
    const prefix = isMultiplayer ? 'MULTIPLAYER • ' : cfg?.isCareer ? 'CARRIERA • ' : '';
    if (cfg?.mode === 'qualifying') return `${prefix}QUALIFICHE Q1–Q3`;
    if (cfg?.mode === 'practice') return `${prefix}PROVE LIBERE`;
    const laps = cfg?.raceLaps ?? cfg?.lapLimit ?? (cfg?.isCareer ? CAREER_RACE_LAPS : RACE_TOTAL_LAPS);
    return `${prefix}GARA ${laps} GIRI`;
  };

  // 3. Gestore Multigiocatore P2P (PeerJS + BroadcastChannel)
  const roomManager = new RoomManager({
    onRosterChange: () => {
      if (menuManager) menuManager.updateMultiplayerUI();
    },
    onStatusChange: (msg, role, code) => {
      if (menuManager) menuManager.updateMultiplayerStatus(msg);
      if (hudOverlay) hudOverlay.setRoomInfo(code, role);
    },
    onSessionStart: (sessionConfig, snapshot) => {
      if (!menuManager) return;
      const incomingTrackId = snapshot?.trackId || sessionConfig?.trackId || activeTrack.id;
      const targetTrack = getTrackById(incomingTrackId);
      const skyId = snapshot?.skyPresetId || sessionConfig?.skyPresetId || menuManager.state.skyPreset;
      loadingScreen.runTransition({
        trackData: targetTrack,
        modeLabel: formatLoadingModeLabel(sessionConfig, true),
        skyPresetId: skyId,
        renderer: sceneManager.renderer,
        prepareFn: () => {
          if (incomingTrackId && incomingTrackId !== activeTrack.id) {
            applyActiveTrack(incomingTrackId);
          }
          menuManager.hasActiveSession = true;
          menuManager.activeTab = 'home';
          menuManager.close({ instant: true });
          modalManager.syncVisibility('pause-modal', false);
          hudOverlay.hideRaceFinish();
          hudOverlay.hideQualifyingModal();
          hudOverlay.resetTrackRecordTracking(incomingTrackId || activeTrack.id);
          hudOverlay.setRoomInfo(roomManager.roomCode, roomManager.role);
          const mpCamMode = sceneManager.setCameraMode(
            menuManager?.state?.defaultCameraMode || loadDefaultCameraMode()
          );
          hudOverlay.setCameraMode(mpCamMode);
          inputManager.reset();
          if (snapshot) {
            worldState.applySnapshot(snapshot);
          } else if (sessionConfig) {
            worldState.startSession(sessionConfig, roomManager.getLocalCarId());
          }
        },
      });
    },
    onSnapshot: (snapshot) => {
      if (roomManager.isClient() && snapshot) {
        const incomingTrackId = snapshot.trackId || snapshot.sessionConfig?.trackId;
        if (incomingTrackId && incomingTrackId !== activeTrack.id) {
          applyActiveTrack(incomingTrackId);
        }
        worldState.applySnapshot(snapshot);
      }
    },
    onRemoteSkipVote: (carId, action) => {
      if (!roomManager.isHost()) return;
      const voteRes = worldState.registerQualifyingSkipVote(carId, action);
      if (voteRes.executed && !worldState.qualifyingState) {
        roomManager.broadcastSessionStart(worldState.sessionConfig, worldState.getSnapshot());
      } else {
        roomManager.broadcastSnapshot(worldState.getSnapshot(), true);
      }
    },
  });

  hudOverlay = new HudOverlay({
    modalManager,
    keybindings: initialKeybindings,
    onTrackRecordUpdated: () => {
      if (menuManager) menuManager.refreshTrackRecords();
    },
    onFinishModalClose: () => {
      inputManager.reset();
      menuManager?.open();
    },
    onQualiModalClose: () => {
      inputManager.reset();
      menuManager?.open();
    },
    onCareerRaceFinished: (ws, playerCar) => {
      const myId = roomManager.getLocalCarId();
      const fastestLap = ws.sessionTiming?.overallBestCarId === myId;
      const polePosition = Boolean(ws.sessionConfig?.qualifiedPole);
      const gridPosition = Number.isFinite(Number(ws.sessionConfig?.playerGridPosition))
        ? Number(ws.sessionConfig.playerGridPosition)
        : Number.isFinite(Number(playerCar.gridPosition))
          ? Number(playerCar.gridPosition)
          : (ws.sessionConfig?.playerGridIndex ?? 0) + 1;
      const result = recordCareerRaceResult(careerState, {
        position: playerCar.racePosition,
        gridPosition,
        difficultyId: ws.difficultyId,
        physicsSettings: ws.physicsSettings,
        fastestLap,
        polePosition,
        standings: ws.raceState?.standings || [],
        playerDriverId: playerCar.driverId,
        presetId: ws.sessionConfig?.careerPresetId || careerState.weekendPresetId,
        raceLaps: ws.raceState?.totalLaps ?? ws.sessionConfig?.raceLaps,
      });
      careerState = result.state;
      sceneManager.setTrophyMuseumCareerData(careerState);
      if (menuManager) {
        menuManager.setCareerState(careerState);
      }
      return { ...result, careerState };
    },
  });
  hudOverlay.setTrackName(`${activeTrack.name} — ${activeTrack.country}`);
  hudOverlay.setCameraMode(sceneManager.getCameraMode());

  trackMapHud = trackMapCanvas
    ? new TrackMapHud(trackMapCanvas, worldState.trackSurface, { size: 220, padding: 20 })
    : null;

  pitLaneMapHud = pitMapCanvas
    ? new PitLaneMapHud(pitMapCanvas, pitMapContainer, worldState.trackSurface, {
        width: 148,
        height: 220,
      })
    : null;

  const startConfiguredSession = (config) => {
    if (config?.trackId) {
      applyActiveTrack(config.trackId);
    }
    modalManager.syncVisibility('pause-modal', false);
    modalManager.syncVisibility('pit-compound-select-modal', false);
    lastGridCompoundPromptedKey = '';
    hudOverlay.resetDismissedModals();
    hudOverlay.hideRaceFinish();
    hudOverlay.hideQualifyingModal();
    hudOverlay.resetTrackRecordTracking(config?.trackId || activeTrack.id);
    hudOverlay.setRoomInfo(roomManager.roomCode, roomManager.role);
    const defaultCam = sceneManager.setCameraMode(
      menuManager?.state?.defaultCameraMode || loadDefaultCameraMode()
    );
    hudOverlay.setCameraMode(defaultCam);
    inputManager.reset();
    worldState.startSession(config, LOCAL_PLAYER_ID);
  };

  const applySelectedBoxCompound = (compoundId) => {
    const safeComp = TIRE_COMPOUNDS[compoundId] ? compoundId : 'M';
    selectedBoxCompound = safeComp;
    pitCompCardBtns.forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.boxCompound === safeComp);
    });
    if (roomManager.isClient()) return;
    const carId = roomManager.getLocalCarId();
    const playerCar = worldState.getCar(carId);
    if (!playerCar) return;
    worldState.fitCarFreshTires(carId, safeComp);
    const totalLaps = worldState.raceState?.totalLaps ?? 10;
    const nextDefault =
      worldState.weather === 'rain'
        ? 'W'
        : safeComp === 'S'
          ? 'M'
          : safeComp === 'H'
            ? 'M'
            : totalLaps >= 8
              ? 'H'
              : 'S';
    playerCar.nextPitCompound = nextDefault;
    if (roomManager.isHost()) {
      roomManager.broadcastSnapshot(worldState.getSnapshot(), true);
    }
  };

  const openPreSessionCompoundModal = () => {
    if (!pitCompModalEl || menuManager?.isOpen || roomManager.isClient()) return;
    const carId = roomManager.getLocalCarId();
    const playerCar = worldState.getCar(carId);
    if (!playerCar) return;

    const isRain = worldState.weather === 'rain';
    const skyPreset = worldState.skyPresetId
      ? getSkyPresetById(worldState.skyPresetId)
      : sceneManager.getResolvedSkyPreset?.(worldState);
    const mode = worldState.raceState?.mode || worldState.sessionConfig?.mode || 'practice';
    const inGarage = playerCar.pitState === 'IN_GARAGE' || mode === 'qualifying';
    const recommended = isRain ? 'W' : mode === 'qualifying' ? 'S' : 'M';
    const recSpec = TIRE_COMPOUNDS[recommended] || TIRE_COMPOUNDS.M;

    if (pitCompTitleEl) {
      pitCompTitleEl.textContent = inGarage
        ? 'Box Scuderia • Scelta Mescola Gomme'
        : mode === 'race'
          ? 'Griglia di Partenza • Scelta Mescola Gomme'
          : 'Pre-Sessione • Scelta Mescola Gomme';
    }
    if (pitCompSessionPillEl) {
      const trackShort = (activeTrack?.name || 'F1 2026').toUpperCase();
      const modeShort =
        mode === 'qualifying'
          ? `QUALIFICHE ${worldState.qualifyingState?.stageId || 'Q1'}`
          : mode === 'race'
            ? `GARA ${worldState.raceState?.totalLaps ?? RACE_TOTAL_LAPS} GIRI`
            : 'PROVE LIBERE';
      pitCompSessionPillEl.textContent = `${trackShort} • ${modeShort}`;
    }
    if (pitCompWeatherBannerEl) {
      pitCompWeatherBannerEl.classList.toggle('is-rain', isRain);
    }
    if (pitCompWeatherLabelEl) {
      const skyName = (skyPreset?.label || (isRain ? 'Pioggia' : 'Asciutto')).toUpperCase();
      const icon = isRain
        ? skyPreset?.id === 'heavy_rain'
          ? '⛈️'
          : '🌧️'
        : skyPreset?.isNight
          ? '🌙'
          : '☀️';
      const trackCond = isRain ? 'ASFALTO BAGNATO' : 'ASFALTO ASCIUTTO';
      pitCompWeatherLabelEl.textContent = `${icon} ${skyName} — ${trackCond}`;
    }
    if (pitCompRecPillEl) {
      pitCompRecPillEl.textContent = `INGEGNERE: CONSIGLIATA ${recSpec.name.toUpperCase()} (${recSpec.id})`;
    }
    if (pitCompConfirmBtn) {
      pitCompConfirmBtn.textContent = inGarage
        ? 'MONTA GOMME NEL BOX ▶'
        : 'MONTA GOMME & INIZIA ▶';
    }

    pitCompCardBtns.forEach((btn) => {
      btn.classList.toggle('is-recommended', btn.dataset.boxCompound === recommended);
    });

    applySelectedBoxCompound(recommended);
    inputManager.reset();
    modalManager.open('pit-compound-select-modal');
  };

  modalManager.register('pit-compound-select-modal', {
    element: pitCompModalEl,
    closeOnBackdrop: false,
    onClose: () => {
      inputManager.reset();
      if (roomManager.isHost()) {
        roomManager.broadcastSnapshot(worldState.getSnapshot(), true);
      }
    },
  });

  pitCompCardBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const comp = btn.dataset.boxCompound;
      if (comp) {
        applySelectedBoxCompound(comp);
      }
    });
  });

  if (pitCompConfirmBtn) {
    pitCompConfirmBtn.addEventListener('click', () => {
      modalManager.close('pit-compound-select-modal', 'confirm');
    });
  }

  const launchSessionWithLoading = (
    config,
    { closeMenuFn = null, isMultiplayer = false, onPrepared = null } = {}
  ) => {
    const targetTrack = getTrackById(config?.trackId || activeTrack.id);
    const skyId = config?.skyPresetId || menuManager?.state?.skyPreset || 'auto';
    loadingScreen.runTransition({
      trackData: targetTrack,
      modeLabel: formatLoadingModeLabel(config, isMultiplayer),
      skyPresetId: skyId,
      renderer: sceneManager.renderer,
      prepareFn: () => {
        if (closeMenuFn) {
          closeMenuFn();
        } else if (menuManager?.isOpen) {
          menuManager.close({ instant: true });
        }
        startConfiguredSession(config);
        onPrepared?.();
      },
      onAfterReveal: () => {
        openPreSessionCompoundModal();
      },
    });
  };

  const syncPauseModalMeta = () => {
    if (pauseMetaTrackEl) {
      pauseMetaTrackEl.textContent = activeTrack?.name || 'Circuito F1';
    }
    if (pauseMetaModeEl) {
      if (worldState.qualifyingState) {
        const qStage = worldState.qualifyingState.stageId || 'Q1';
        if (worldState.sessionConfig?.isCareer) {
          const roundNum = Number.isFinite(Number(worldState.sessionConfig.careerRoundIndex))
            ? Number(worldState.sessionConfig.careerRoundIndex) + 1
            : (careerState.currentRoundIndex ?? 0) + 1;
          const preset = getCareerWeekendPreset(
            worldState.sessionConfig.careerPresetId || careerState.weekendPresetId
          );
          pauseMetaModeEl.textContent = `Carriera R${String(roundNum).padStart(2, '0')} • ${qStage} (${preset.shortLabel})`;
        } else {
          pauseMetaModeEl.textContent = `Qualifiche ${qStage}`;
        }
      } else if (worldState.sessionConfig?.mode === 'practice') {
        pauseMetaModeEl.textContent = 'Prove Libere';
      } else if (worldState.sessionConfig?.isCareer) {
        const preset = getCareerWeekendPreset(
          worldState.sessionConfig.careerPresetId || careerState.weekendPresetId
        );
        const laps =
          worldState.raceState?.totalLaps ??
          worldState.sessionConfig?.raceLaps ??
          preset.raceLaps;
        const roundNum = Number.isFinite(Number(worldState.sessionConfig.careerRoundIndex))
          ? Number(worldState.sessionConfig.careerRoundIndex) + 1
          : (careerState.currentRoundIndex ?? 0) + 1;
        pauseMetaModeEl.textContent = `Carriera R${String(roundNum).padStart(2, '0')} • Gara ${laps} Giri (${preset.shortLabel})`;
      } else {
        const laps =
          worldState.raceState?.totalLaps ??
          worldState.sessionConfig?.raceLaps ??
          worldState.sessionConfig?.lapLimit ??
          RACE_TOTAL_LAPS;
        pauseMetaModeEl.textContent = `Gara ${laps} Giri`;
      }
    }
    if (pauseMetaWeatherEl) {
      const activePreset = worldState.skyPresetId
        ? getSkyPresetById(worldState.skyPresetId)
        : sceneManager.getResolvedSkyPreset(worldState);
      pauseMetaWeatherEl.textContent =
        activePreset?.label || (worldState.weather === 'rain' ? 'Pioggia' : 'Asciutto');
    }
    if (pauseMetaDifficultyEl) {
      const ps = normalizePhysicsSettings(
        worldState.physicsSettings || menuManager?.state?.physicsSettings
      );
      const activeCount = PHYSICS_TOGGLE_DEFS.filter((d) => Boolean(ps[d.key])).length;
      pauseMetaDifficultyEl.textContent = `Fisica ${activeCount}/7 • IA ${ps.botAiLevel}%`;
    }
    if (pauseRestartBtn) {
      pauseRestartBtn.disabled = roomManager.isClient();
    }
  };

  const openPauseModal = () => {
    if (!pauseModalEl || menuManager?.isOpen) return;
    syncPauseModalMeta();
    inputManager.reset();
    modalManager.open('pause-modal');
  };

  modalManager.register('pause-modal', {
    element: pauseModalEl,
    onClose: () => {
      inputManager.reset();
    },
  });

  if (pauseResumeBtn) {
    pauseResumeBtn.addEventListener('click', () => {
      modalManager.close('pause-modal', 'resume');
    });
  }

  if (pauseRestartBtn) {
    pauseRestartBtn.addEventListener('click', () => {
      if (roomManager.isClient()) return;
      modalManager.close('pause-modal', 'restart');
      const baseCfg = worldState.sessionConfig?.isCareer
        ? menuManager.buildSessionConfig()
        : worldState.sessionConfig
          ? {
              ...worldState.sessionConfig,
              difficultyId: menuManager.state.difficultyId,
              physicsSettings: { ...menuManager.state.physicsSettings },
              weather: menuManager.state.weather,
              skyPresetId:
                worldState.sessionConfig.requestedSkyPresetId || menuManager.state.skyPreset,
            }
          : menuManager.buildSessionConfig();
      startConfiguredSession(baseCfg);
      if (roomManager.isHost()) {
        roomManager.broadcastSessionStart(worldState.sessionConfig, worldState.getSnapshot());
      }
      openPreSessionCompoundModal();
    });
  }

  if (pauseSettingsBtn) {
    pauseSettingsBtn.addEventListener('click', () => {
      if (menuManager) {
        menuManager.state.weather = worldState.weather;
        menuManager.setPhysicsSettings(worldState.physicsSettings);
        if (!worldState.sessionConfig?.isCareer && worldState.skyPresetId) {
          menuManager.state.skyPreset = worldState.skyPresetId;
        }
        menuManager._syncUI();
      }
      modalManager.open('gp-settings-popup');
    });
  }

  if (pauseMenuBtn) {
    pauseMenuBtn.addEventListener('click', () => {
      modalManager.close('pause-modal', 'open-menu');
      menuManager.open();
    });
  }

  const initialPhysicsSettings = loadPhysicsSettings();
  worldState.setPhysicsSettings(initialPhysicsSettings);

  // 4. Menu configurazione sessione, Showroom Garage 3D & Lobby Multiplayer
  menuManager = new MenuManager({
    careerState,
    roomManager,
    modalManager,
    nightQuality: initialNightQuality,
    skyPreset: initialSkyPreset,
    physicsSettings: initialPhysicsSettings,
    defaultCameraMode: initialCameraMode,
    keybindings: initialKeybindings,
    onKeybindingsChange: (nextBindings) => {
      inputManager.setKeybindings(nextBindings);
      hudOverlay?.setKeybindings(nextBindings);
    },
    onKeybindCaptureChange: (isCapturing) => {
      inputManager.setCapturing(isCapturing);
      modalManager.setKeyboardSuspended(isCapturing);
    },
    onDefaultCameraChange: (nextCamId) => {
      const mode = sceneManager.setCameraMode(nextCamId);
      hudOverlay?.setCameraMode(mode);
    },
    onPhysicsSettingsChange: (nextPhysics) => {
      if (!roomManager.isClient()) {
        worldState.setPhysicsSettings(nextPhysics);
        if (roomManager.isHost()) {
          roomManager.broadcastSnapshot(worldState.getSnapshot(), true);
        }
      }
      syncPauseModalMeta();
    },
    onNightQualityChange: (nextQuality) => {
      sceneManager.setNightQuality(nextQuality);
    },
    onSkyPresetChange: (nextSky) => {
      if (!menuManager?.isOpen && !roomManager.isClient()) {
        const applied = worldState.setSkyPreset(nextSky);
        if (roomManager.isHost()) {
          roomManager.broadcastSnapshot(worldState.getSnapshot(), true);
        }
        hudOverlay?.setSkyPreset(applied);
        syncPauseModalMeta();
      }
      const resolved = sceneManager.setSkyPreset(nextSky);
      if (resolved) {
        if (menuManager?.isOpen) {
          sceneManager.setWeatherPreview(resolved.physicsWeather);
        }
        if (hudOverlay) {
          hudOverlay.setSkyPreset(resolved);
        }
      }
      return resolved;
    },
    onOpenHudMenu: () => openPauseModal(),
    onSettingsClose: () => syncPauseModalMeta(),
    onCareerChange: (nextCareerState) => {
      careerState = nextCareerState;
      sceneManager.setTrophyMuseumCareerData(careerState);
    },
    onTrackChange: (trackId) => {
      if (!menuManager?.hasActiveSession) {
        applyActiveTrack(trackId);
      } else {
        sceneManager.setTrack(getTrackById(trackId));
      }
    },
    onShowroomUpdate: (isOpen, appearance, viewMode) => {
      sceneManager.setGarageMode(isOpen, appearance, viewMode);
    },
    onToggleCameraRotate: () => sceneManager.toggleGarageCameraRotate(),
    onResetGarageOrbit: () => sceneManager.resetGarageOrbit(),
    onOrbitRotate: (dYaw, dPitch) => sceneManager.rotateGarageOrbit(dYaw, dPitch),
    onOrbitZoom: (dZoom) => sceneManager.zoomGarageOrbit(dZoom),
    onGetMuseumState: () => sceneManager.getTrophyMuseumState(),
    onMuseumAction: (action, payload) => {
      switch (action) {
        case 'cycle_pedestal':
          return sceneManager.cycleTrophyMuseumPedestal(payload);
        case 'enter_wall':
          return sceneManager.enterTrophyMuseumWall(payload);
        case 'return_corridor':
          return sceneManager.returnTrophyMuseumCorridor();
        case 'shelf_preset':
          return sceneManager.setTrophyMuseumShelfPreset(payload);
        case 'inspect_slot':
          return sceneManager.inspectTrophyMuseumGpSlot(payload);
        case 'clear_inspect':
          return sceneManager.clearTrophyMuseumGpInspection();
        case 'select_career':
          return sceneManager.selectTrophyMuseumCareer(payload?.careerId, Boolean(payload?.openWall));
        case 'orbit':
          sceneManager.rotateTrophyMuseumOrbit(payload?.dx || 0, payload?.dy || 0);
          return null;
        case 'zoom':
          sceneManager.zoomTrophyMuseumOrbit(payload || 0);
          return null;
        case 'pointer_hover':
          return sceneManager.hoverTrophyMuseumPointer(payload?.ndcX || 0, payload?.ndcY || 0);
        case 'pointer_click':
          return sceneManager.clickTrophyMuseumPointer(payload?.ndcX || 0, payload?.ndcY || 0);
        default:
          return sceneManager.getTrophyMuseumState();
      }
    },
    onWeatherChange: (weatherId) => {
      sceneManager.setWeatherPreview(weatherId);
      if (!menuManager?.isOpen && !roomManager.isClient()) {
        worldState.setWeather(weatherId);
      }
      syncPauseModalMeta();
    },
    onStartMultiplayerSession: (
      { mode, difficultyId, physicsSettings, weather, skyPresetId, trackId, raceLaps, startingCompound },
      closeMenuFn
    ) => {
      if (!roomManager.isHost()) return;
      const humanPlayers = roomManager.getPlayers();
      const safeRaceLaps = Math.max(
        1,
        Math.min(99, Math.round(Number(raceLaps) || RACE_TOTAL_LAPS))
      );
      const config = {
        trackId: trackId || activeTrack.id,
        mode,
        difficultyId,
        physicsSettings: physicsSettings || menuManager.state.physicsSettings,
        weather,
        skyPresetId: skyPresetId || menuManager.state.skyPreset,
        startingCompound: startingCompound && startingCompound !== 'auto' ? startingCompound : null,
        withBots: true,
        raceLaps: safeRaceLaps,
        lapLimit: mode === 'race' ? safeRaceLaps : null,
        humanPlayers,
        isCareer: false,
      };
      launchSessionWithLoading(config, {
        closeMenuFn,
        isMultiplayer: true,
        onPrepared: () => {
          roomManager.broadcastSessionStart(worldState.sessionConfig, worldState.getSnapshot());
        },
      });
    },
    onStartSession: (config, closeMenuFn) => {
      if (roomManager.isActive()) {
        roomManager.leaveRoom();
      }
      hudOverlay.setRoomInfo('', 'offline');
      launchSessionWithLoading(config, { closeMenuFn });
    },
    onResume: () => {
      hudOverlay.resetDismissedModals();
      sceneManager.setTrack(activeTrack);
      inputManager.reset();
    },
  });

  // Inizializza la vista Showroom Garage 3D & Stanza Museo Trofei 3D dietro al menu iniziale
  sceneManager.setTrophyMuseumCareerData(careerState);
  sceneManager.setWeatherPreview(menuManager.state.weather);
  sceneManager.setGarageMode(
    menuManager.isOpen,
    menuManager.getShowcaseAppearance(),
    menuManager.getShowcaseViewMode()
  );

  // Pre-carica l'anteprima della sessione in pista dietro al menu iniziale
  worldState.startSession(menuManager.buildSessionConfig(), LOCAL_PLAYER_ID);

  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      if (roomManager.isClient()) return;
      const config = worldState.sessionConfig?.isCareer
        ? menuManager.buildSessionConfig()
        : worldState.sessionConfig || menuManager.buildSessionConfig();
      startConfiguredSession(config);
      if (roomManager.isHost()) {
        roomManager.broadcastSessionStart(worldState.sessionConfig, worldState.getSnapshot());
      }
    });
  }

  if (finishOpenMenuBtn) {
    finishOpenMenuBtn.addEventListener('click', () => {
      hudOverlay.hideRaceFinish(true);
      inputManager.reset();
      menuManager.open();
    });
  }

  const submitSkipVote = (action) => {
    inputManager.reset();
    if (roomManager.isClient()) {
      roomManager.sendSkipVote(action);
      return;
    }
    const voteRes = worldState.registerQualifyingSkipVote(roomManager.getLocalCarId(), action);
    if (roomManager.isHost()) {
      if (voteRes.executed && !worldState.qualifyingState) {
        roomManager.broadcastSessionStart(worldState.sessionConfig, worldState.getSnapshot());
      } else {
        roomManager.broadcastSnapshot(worldState.getSnapshot(), true);
      }
    }
  };

  if (hudSkipStageBtn) {
    hudSkipStageBtn.addEventListener('click', () => submitSkipVote('stage'));
  }

  if (hudSkipQualiBtn) {
    hudSkipQualiBtn.addEventListener('click', () => submitSkipVote('all'));
  }

  if (hudExitPitBtn) {
    hudExitPitBtn.addEventListener('click', () => {
      if (roomManager.isClient()) return;
      worldState.requestPlayerPitExit(roomManager.getLocalCarId());
    });
  }

  let clientResetTrackQueued = false;

  if (hudQuickPitReturnBtn) {
    hudQuickPitReturnBtn.addEventListener('click', () => {
      if (roomManager.isClient()) return;
      inputManager.reset();
      worldState.quickReturnToPitEntry(roomManager.getLocalCarId());
      if (roomManager.isHost()) {
        roomManager.broadcastSnapshot(worldState.getSnapshot(), true);
      }
    });
  }

  if (hudResetTrackBtn) {
    hudResetTrackBtn.addEventListener('click', () => {
      hudResetTrackBtn.blur?.();
      if (roomManager.isClient()) {
        clientResetTrackQueued = true;
        hudOverlay?.notifyTrackReset();
        return;
      }
      inputManager.reset();
      const res = worldState.resetCarToTrack(roomManager.getLocalCarId());
      if (res?.ok) {
        hudOverlay?.notifyTrackReset();
        if (roomManager.isHost()) {
          roomManager.broadcastSnapshot(worldState.getSnapshot(), true);
        }
      }
    });
  }

  if (hudBoxRequestBtn) {
    hudBoxRequestBtn.addEventListener('click', () => {
      hudBoxRequestBtn.blur?.();
      if (roomManager.isClient()) return;
      worldState.togglePlayerPitStopRequest(roomManager.getLocalCarId());
      if (roomManager.isHost()) {
        roomManager.broadcastSnapshot(worldState.getSnapshot(), true);
      }
    });
  }

  hudNextCompoundBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.blur?.();
      if (roomManager.isClient()) return;
      const comp = btn.dataset.nextCompound;
      if (!comp) return;
      const carId = roomManager.getLocalCarId();
      const car = worldState.getCar(carId);
      const fittedNow = car?.pitState === 'IN_GARAGE' || car?.pitState === 'IN_PIT_BOX';
      const chosen = worldState.setPlayerNextPitCompound(carId, comp);
      if (chosen) {
        hudOverlay?.notifyPitCompoundChanged(chosen, fittedNow);
      }
      if (roomManager.isHost()) {
        roomManager.broadcastSnapshot(worldState.getSnapshot(), true);
      }
    });
  });

  if (qualiNextBtn) {
    qualiNextBtn.addEventListener('click', () => {
      if (roomManager.isClient()) return;
      hudOverlay.hideQualifyingModal();
      inputManager.reset();
      worldState.advanceQualifyingToNextStage(LOCAL_PLAYER_ID);
      if (roomManager.isHost()) {
        roomManager.broadcastSnapshot(worldState.getSnapshot(), true);
      }
    });
  }

  if (qualiSkipToRaceBtn) {
    qualiSkipToRaceBtn.addEventListener('click', () => submitSkipVote('all'));
  }

  // 5. Avvio GameLoop (simulazione a 60 Hz + sync P2P Host/Client)
  const perfLogEnabled =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('perf') === '1';
  let perfLastTs = 0;
  let perfWindowStart = 0;
  let perfSamples = [];

  let wasMenuOpen = menuManager.isOpen;
  const gameLoop = new GameLoop({
    onSimulationStep: (dt) => {
      if (inputManager.consumeMenuToggle()) {
        inputManager.reset();
        if (!modalManager.handleEscape()) {
          if (!menuManager.isOpen && menuManager.hasActiveSession) {
            openPauseModal();
          } else {
            menuManager.handleEscapeKey();
          }
        }
      }

      const isPauseActive =
        modalManager.isOpen('pause-modal') ||
        modalManager.isOpen('pit-compound-select-modal') ||
        (!menuManager.isOpen && modalManager.isOpen('gp-settings-popup'));
      const blockTrackInput =
        menuManager.isOpen || modalManager.hasOpenModal() || loadingScreen.isLoading;

      if (blockTrackInput && !wasMenuOpen) {
        inputManager.reset();
        wasMenuOpen = true;
      } else if (!blockTrackInput) {
        wasMenuOpen = false;
      }

      const activePlayerId = roomManager.getLocalCarId();
      const localInput = blockTrackInput
        ? { forward: false, backward: false, left: false, right: false }
        : inputManager.getInputSnapshot();

      if (roomManager.isClient()) {
        inputManager.consumeWeatherToggle();
        inputManager.consumePitToggle();
        inputManager.consumeCyclePitCompound();
        const resetRequested =
          (!blockTrackInput && inputManager.consumeResetToTrack()) || clientResetTrackQueued;
        clientResetTrackQueued = false;
        if (blockTrackInput) {
          inputManager.consumeResetToTrack();
        }
        if (resetRequested) {
          hudOverlay?.notifyTrackReset();
        }
        roomManager.sendInput(
          resetRequested ? { ...localInput, resetToTrack: true } : localInput
        );
        return;
      }

      if ((menuManager.isOpen || isPauseActive || loadingScreen.isLoading) && !roomManager.isHost()) {
        inputManager.consumeWeatherToggle();
        inputManager.consumePitToggle();
        inputManager.consumeCyclePitCompound();
        inputManager.consumeResetToTrack();
        return;
      }

      if (!blockTrackInput && inputManager.consumeResetToTrack()) {
        const res = worldState.resetCarToTrack(activePlayerId);
        if (res?.ok) {
          inputManager.reset();
          hudOverlay?.notifyTrackReset();
          if (roomManager.isHost()) {
            roomManager.broadcastSnapshot(worldState.getSnapshot(), true);
          }
        }
      } else if (blockTrackInput) {
        inputManager.consumeResetToTrack();
      }

      if (!blockTrackInput && inputManager.consumeWeatherToggle()) {
        const nextPreset = worldState.cycleWeatherPreset();
        hudOverlay?.setSkyPreset(nextPreset);
        syncPauseModalMeta();
        if (roomManager.isHost()) {
          roomManager.broadcastSnapshot(worldState.getSnapshot(), true);
        }
      } else if (blockTrackInput) {
        inputManager.consumeWeatherToggle();
      }

      if (!blockTrackInput && inputManager.consumePitToggle()) {
        worldState.togglePlayerPitStopRequest(activePlayerId);
        if (roomManager.isHost()) {
          roomManager.broadcastSnapshot(worldState.getSnapshot(), true);
        }
      } else if (blockTrackInput) {
        inputManager.consumePitToggle();
      }

      if (!blockTrackInput && inputManager.consumeCyclePitCompound()) {
        const activeCar = worldState.getCar(activePlayerId);
        const fittedNow =
          activeCar?.pitState === 'IN_GARAGE' || activeCar?.pitState === 'IN_PIT_BOX';
        const nextComp = worldState.cyclePlayerNextPitCompound(activePlayerId);
        if (nextComp) {
          hudOverlay?.notifyPitCompoundChanged(nextComp, fittedNow);
        }
        if (roomManager.isHost()) {
          roomManager.broadcastSnapshot(worldState.getSnapshot(), true);
        }
      } else if (blockTrackInput) {
        inputManager.consumeCyclePitCompound();
      }

      const allInputs = roomManager.isHost()
        ? { [LOCAL_PLAYER_ID]: localInput, ...roomManager.getRemoteInputs() }
        : { [LOCAL_PLAYER_ID]: localInput };

      worldState.step(allInputs, dt, activePlayerId);

      // Dopo il passaggio Qualifiche Q3 -> Griglia Gara, offre la scelta mescola per la gara in base al meteo
      if (
        !menuManager.isOpen &&
        !loadingScreen.isLoading &&
        !roomManager.isClient() &&
        worldState.raceState?.mode === 'race' &&
        worldState.raceState?.status === 'grid_wait' &&
        !modalManager.hasOpenModal()
      ) {
        const gridPromptKey = `${worldState.trackData?.id}:${worldState.sessionConfig?.raceLaps}:grid`;
        if (lastGridCompoundPromptedKey !== gridPromptKey) {
          lastGridCompoundPromptedKey = gridPromptKey;
          openPreSessionCompoundModal();
        }
      }

      if (roomManager.isHost()) {
        roomManager.broadcastSnapshot(worldState.getSnapshot());
      }
    },
    onRender: () => {
      const activePlayerId = roomManager.getLocalCarId();
      if (!menuManager.isOpen && !modalManager.hasOpenModal()) {
        if (inputManager.consumeCameraToggle()) {
          const mode = sceneManager.cycleCameraMode();
          hudOverlay.setCameraMode(mode);
        }
        if (inputManager.consumePhysicsDebugToggle()) {
          hudOverlay.togglePhysicsDebugPanel();
        }
      } else {
        inputManager.consumeCameraToggle();
        inputManager.consumePhysicsDebugToggle();
      }

      sceneManager.render(worldState, activePlayerId);
      if (!menuManager.isOpen) {
        const activePreset = sceneManager.getResolvedSkyPreset?.(worldState);
        if (activePreset) {
          hudOverlay.setSkyPreset(activePreset);
        }
        if (trackMapHud) {
          trackMapHud.render(worldState, activePlayerId);
        }
        if (pitLaneMapHud) {
          pitLaneMapHud.render(worldState, activePlayerId);
        }
        hudOverlay.render(worldState, activePlayerId);
      }

      if (perfLogEnabled) {
        const now = performance.now();
        if (perfLastTs > 0) {
          perfSamples.push(now - perfLastTs);
        }
        perfLastTs = now;
        if (perfWindowStart === 0) {
          perfWindowStart = now;
        }
        const elapsedMs = now - perfWindowStart;
        if (elapsedMs >= 1000 && perfSamples.length > 0) {
          const sorted = [...perfSamples].sort((a, b) => a - b);
          const sum = sorted.reduce((acc, v) => acc + v, 0);
          const avgMs = sum / sorted.length;
          const p95Ms = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
          const maxMs = sorted[sorted.length - 1];
          const fps = (sorted.length * 1000) / elapsedMs;
          const modeTag = menuManager.isOpen
            ? `menu:${menuManager.activeTab}`
            : worldState.sessionConfig?.mode || 'track';
          console.info(
            `[F1-PERF] mode=${modeTag} track=${activeTrack?.id || 'unknown'} nightQ=${sceneManager.getNightQuality()} fps=${fps.toFixed(1)} frames=${sorted.length} avg=${avgMs.toFixed(2)}ms p95=${p95Ms.toFixed(2)}ms max=${maxMs.toFixed(2)}ms`
          );
          perfWindowStart = now;
          perfSamples = [];
        }
      }
    },
  });

  gameLoop.start();
}

initGame();
