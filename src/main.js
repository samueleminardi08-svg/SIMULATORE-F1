/**
 * Entry point principale del Gioco F1 3D (Step 11).
 * Integra Selettore Circuiti F1 2026 (Australia, Cina, Giappone, Monza),
 * Showroom Garage 3D, Multigiocatore Online PeerJS + BroadcastChannel
 * con codice stanza e voto unanime per lo skip delle qualifiche, Carriera,
 * Qualifiche Q1/Q2/Q3, Track Limits, Prove Libere e Gara da 10 Giri.
 */

import { LOCAL_PLAYER_ID } from './config/constants.js';
import { getDifficultyConfig } from './config/difficulty.js';
import { CAREER_RACE_LAPS, RACE_TOTAL_LAPS } from './config/f1_2026_data.js';
import { WorldState } from './core/WorldState.js';
import { GameLoop } from './core/GameLoop.js';
import { InputManager } from './input/InputManager.js';
import { getTrackById, getNextCalendarTrackId } from './tracks/calendar2026/index.js';
import { SceneManager } from './rendering/SceneManager.js';
import { TrackMapHud } from './ui/TrackMapHud.js';
import { HudOverlay } from './ui/HudOverlay.js';
import { MenuManager } from './ui/MenuManager.js';
import { ModalManager } from './ui/ModalManager.js';
import {
  loadCareerState,
  recordCareerRaceResult,
  updateCareerProfile,
} from './career/CareerStorage.js';
import { RoomManager } from './network/RoomManager.js';

function initGame() {
  const canvas = document.getElementById('game-canvas');
  const trackMapCanvas = document.getElementById('track-map-canvas');
  const restartBtn = document.getElementById('restart-race-btn');
  const finishOpenMenuBtn = document.getElementById('finish-open-menu-btn');
  const hudSkipStageBtn = document.getElementById('hud-skip-stage-btn');
  const hudSkipQualiBtn = document.getElementById('hud-skip-quali-btn');
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

  // 0. Caricamento Carriera persistente da localStorage e circuito attivo
  let careerState = loadCareerState();
  let activeTrack = getTrackById(careerState.selectedTrackId);
  let menuManager = null;
  let hudOverlay = null;
  let trackMapHud = null;

  // 1. Stato puro della simulazione & gestore input (WASD + Frecce + C + R + ESC)
  const worldState = new WorldState(activeTrack);
  const inputManager = new InputManager(window);
  const modalManager = new ModalManager(window);

  // 2. Scena 3D
  const sceneManager = new SceneManager(canvas, activeTrack);

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
    return activeTrack;
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
      const incomingTrackId = snapshot?.trackId || sessionConfig?.trackId;
      if (incomingTrackId && incomingTrackId !== activeTrack.id) {
        applyActiveTrack(incomingTrackId);
      }
      menuManager.hasActiveSession = true;
      menuManager.activeTab = 'home';
      menuManager.close();
      modalManager.syncVisibility('pause-modal', false);
      hudOverlay.hideRaceFinish();
      hudOverlay.hideQualifyingModal();
      hudOverlay.resetTrackRecordTracking(incomingTrackId || activeTrack.id);
      hudOverlay.setRoomInfo(roomManager.roomCode, roomManager.role);
      inputManager.reset();
      if (snapshot) {
        worldState.applySnapshot(snapshot);
      } else if (sessionConfig) {
        worldState.startSession(sessionConfig, roomManager.getLocalCarId());
      }
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
      const result = recordCareerRaceResult(careerState, {
        position: playerCar.racePosition,
        difficultyId: ws.difficultyId,
        fastestLap,
        polePosition,
      });
      const nextTrackId = getNextCalendarTrackId(activeTrack.id);
      careerState = updateCareerProfile(result.state, { selectedTrackId: nextTrackId });
      result.state = careerState;
      hudOverlay.setCareerBalance(careerState.money);
      if (menuManager) {
        menuManager.setCareerState(careerState);
      }
      return { ...result, careerState };
    },
  });
  hudOverlay.setTrackName(`${activeTrack.name} — ${activeTrack.country}`);
  hudOverlay.setCameraMode(sceneManager.getCameraMode());
  hudOverlay.setCareerBalance(careerState.money);

  window.addEventListener('keydown', (event) => {
    if (event.code === 'F3' && !event.repeat && !menuManager?.isOpen) {
      event.preventDefault();
      hudOverlay.togglePhysicsDebugPanel();
    }
  });

  trackMapHud = trackMapCanvas
    ? new TrackMapHud(trackMapCanvas, worldState.trackSurface, { size: 220, padding: 20 })
    : null;

  const startConfiguredSession = (config) => {
    if (config?.trackId) {
      applyActiveTrack(config.trackId);
    }
    modalManager.syncVisibility('pause-modal', false);
    hudOverlay.resetDismissedModals();
    hudOverlay.hideRaceFinish();
    hudOverlay.hideQualifyingModal();
    hudOverlay.resetTrackRecordTracking(config?.trackId || activeTrack.id);
    hudOverlay.setRoomInfo(roomManager.roomCode, roomManager.role);
    inputManager.reset();
    worldState.startSession(config, LOCAL_PLAYER_ID);
  };

  const syncPauseModalMeta = () => {
    if (pauseMetaTrackEl) {
      pauseMetaTrackEl.textContent = activeTrack?.name || 'Circuito F1';
    }
    if (pauseMetaModeEl) {
      if (worldState.qualifyingState) {
        pauseMetaModeEl.textContent = `Qualifiche ${worldState.qualifyingState.stage || 'Q1'}`;
      } else if (worldState.sessionConfig?.mode === 'practice') {
        pauseMetaModeEl.textContent = 'Prove Libere';
      } else if (worldState.sessionConfig?.isCareer) {
        const laps =
          worldState.raceState?.totalLaps ??
          worldState.sessionConfig?.raceLaps ??
          CAREER_RACE_LAPS;
        pauseMetaModeEl.textContent = `Carriera • ${laps} Giri`;
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
      pauseMetaWeatherEl.textContent = worldState.weather === 'rain' ? 'Pioggia' : 'Asciutto';
    }
    if (pauseMetaDifficultyEl) {
      const diffId = worldState.difficultyId || menuManager?.state?.difficultyId;
      pauseMetaDifficultyEl.textContent = getDifficultyConfig(diffId)?.label || 'Intermedio';
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
              weather: menuManager.state.weather,
            }
          : menuManager.buildSessionConfig();
      startConfiguredSession(baseCfg);
      if (roomManager.isHost()) {
        roomManager.broadcastSessionStart(worldState.sessionConfig, worldState.getSnapshot());
      }
    });
  }

  if (pauseSettingsBtn) {
    pauseSettingsBtn.addEventListener('click', () => {
      if (menuManager) {
        menuManager.state.weather = worldState.weather;
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

  // 4. Menu configurazione sessione, Showroom Garage 3D & Lobby Multiplayer
  menuManager = new MenuManager({
    careerState,
    roomManager,
    modalManager,
    onOpenHudMenu: () => openPauseModal(),
    onSettingsClose: () => syncPauseModalMeta(),
    onCareerChange: (nextCareerState) => {
      careerState = nextCareerState;
      hudOverlay.setCareerBalance(careerState.money);
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
    onWeatherChange: (weatherId) => {
      sceneManager.setWeatherPreview(weatherId);
      if (!menuManager?.isOpen && !roomManager.isClient()) {
        worldState.setWeather(weatherId);
      }
      syncPauseModalMeta();
    },
    onStartMultiplayerSession: ({ mode, difficultyId, weather, trackId, raceLaps }) => {
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
        weather,
        withBots: true,
        raceLaps: safeRaceLaps,
        lapLimit: mode === 'race' ? safeRaceLaps : null,
        humanPlayers,
        isCareer: false,
      };
      startConfiguredSession(config);
      roomManager.broadcastSessionStart(worldState.sessionConfig, worldState.getSnapshot());
    },
    onStartSession: (config) => {
      if (roomManager.isActive()) {
        roomManager.leaveRoom();
      }
      hudOverlay.setRoomInfo('', 'offline');
      startConfiguredSession(config);
    },
    onResume: () => {
      hudOverlay.resetDismissedModals();
      sceneManager.setTrack(activeTrack);
      inputManager.reset();
    },
  });

  // Inizializza la vista Showroom Garage 3D dietro al menu iniziale
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
        (!menuManager.isOpen && modalManager.isOpen('gp-settings-popup'));
      const blockTrackInput = menuManager.isOpen || modalManager.hasOpenModal();

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
        roomManager.sendInput(localInput);
        return;
      }

      if ((menuManager.isOpen || isPauseActive) && !roomManager.isHost()) {
        inputManager.consumeWeatherToggle();
        return;
      }

      if (!blockTrackInput && inputManager.consumeWeatherToggle()) {
        worldState.toggleWeather();
      } else if (blockTrackInput) {
        inputManager.consumeWeatherToggle();
      }

      const allInputs = roomManager.isHost()
        ? { [LOCAL_PLAYER_ID]: localInput, ...roomManager.getRemoteInputs() }
        : { [LOCAL_PLAYER_ID]: localInput };

      worldState.step(allInputs, dt, activePlayerId);

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
      } else {
        inputManager.consumeCameraToggle();
      }

      sceneManager.render(worldState, activePlayerId);
      if (!menuManager.isOpen) {
        if (trackMapHud) {
          trackMapHud.render(worldState, activePlayerId);
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
            `[F1-PERF] mode=${modeTag} fps=${fps.toFixed(1)} frames=${sorted.length} avg=${avgMs.toFixed(2)}ms p95=${p95Ms.toFixed(2)}ms max=${maxMs.toFixed(2)}ms`
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
