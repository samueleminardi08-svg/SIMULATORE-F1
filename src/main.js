/**
 * Entry point principale del Gioco F1 3D (Step 11).
 * Integra Selettore Circuiti F1 2026 (Australia, Cina, Giappone, Monza),
 * Showroom Garage 3D, Multigiocatore Online PeerJS + BroadcastChannel
 * con codice stanza e voto unanime per lo skip delle qualifiche, Carriera,
 * Qualifiche Q1/Q2/Q3, Track Limits, Prove Libere e Gara da 10 Giri.
 */

import { LOCAL_PLAYER_ID } from './config/constants.js';
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
      hudOverlay.hideRaceFinish();
      hudOverlay.hideQualifyingModal();
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
  hudOverlay.setCameraLabel(sceneManager.getCameraMode().label);
  hudOverlay.setCareerBalance(careerState.money);

  trackMapHud = trackMapCanvas
    ? new TrackMapHud(trackMapCanvas, worldState.trackSurface, { size: 186, padding: 16 })
    : null;

  const startConfiguredSession = (config) => {
    if (config?.trackId) {
      applyActiveTrack(config.trackId);
    }
    hudOverlay.resetDismissedModals();
    hudOverlay.hideRaceFinish();
    hudOverlay.hideQualifyingModal();
    hudOverlay.setRoomInfo(roomManager.roomCode, roomManager.role);
    inputManager.reset();
    worldState.startSession(config, LOCAL_PLAYER_ID);
  };

  // 4. Menu configurazione sessione, Showroom Garage 3D & Lobby Multiplayer
  menuManager = new MenuManager({
    careerState,
    roomManager,
    modalManager,
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
    onOrbitRotate: (dYaw, dPitch) => sceneManager.rotateGarageOrbit(dYaw, dPitch),
    onOrbitZoom: (dZoom) => sceneManager.zoomGarageOrbit(dZoom),
    onWeatherChange: (weatherId) => sceneManager.setWeatherPreview(weatherId),
    onStartMultiplayerSession: ({ mode, difficultyId, weather, trackId }) => {
      if (!roomManager.isHost()) return;
      const humanPlayers = roomManager.getPlayers();
      const config = {
        trackId: trackId || activeTrack.id,
        mode,
        difficultyId,
        weather,
        withBots: true,
        lapLimit: mode === 'race' ? 10 : null,
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
  let wasMenuOpen = menuManager.isOpen;
  const gameLoop = new GameLoop({
    onSimulationStep: (dt) => {
      if (inputManager.consumeMenuToggle()) {
        inputManager.reset();
        if (!modalManager.handleEscape()) {
          menuManager.handleEscapeKey();
        }
      }

      if (menuManager.isOpen && !wasMenuOpen) {
        inputManager.reset();
        wasMenuOpen = true;
      } else if (!menuManager.isOpen) {
        wasMenuOpen = false;
      }

      const activePlayerId = roomManager.getLocalCarId();
      const localInput = menuManager.isOpen
        ? { forward: false, backward: false, left: false, right: false }
        : inputManager.getInputSnapshot();

      if (roomManager.isClient()) {
        inputManager.consumeWeatherToggle();
        roomManager.sendInput(localInput);
        return;
      }

      if (menuManager.isOpen && !roomManager.isHost()) {
        inputManager.consumeWeatherToggle();
        return;
      }

      if (!menuManager.isOpen && inputManager.consumeWeatherToggle()) {
        worldState.toggleWeather();
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
      if (!menuManager.isOpen) {
        if (inputManager.consumeCameraToggle()) {
          const mode = sceneManager.cycleCameraMode();
          hudOverlay.setCameraLabel(mode.label);
        }
      } else {
        inputManager.consumeCameraToggle();
      }

      sceneManager.render(worldState, activePlayerId);
      hudOverlay.render(worldState, activePlayerId);

      if (trackMapHud) {
        trackMapHud.render(worldState, activePlayerId);
      }
    },
  });

  gameLoop.start();
}

initGame();
