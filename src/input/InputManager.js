/**
 * Gestore degli input da tastiera con comandi completamente personalizzabili
 * (default WASD + fallback Frecce direzionali + azioni Pista/Camera/Box/Meteo/Diagnosi).
 * Produce uno snapshot serializzabile dei comandi del giocatore per il tick di simulazione.
 */

import { loadKeybindings, normalizeKeybindings } from '../config/keybindings.js';

const ARROW_CODES = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

const PREVENT_DEFAULT_CODES = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'Backspace',
]);

export class InputManager {
  constructor(targetWindow = typeof window !== 'undefined' ? window : null, initialBindings = null) {
    /** @type {Set<string>} */
    this._pressedCodes = new Set();
    this._cameraToggleQueued = false;
    this._weatherToggleQueued = false;
    this._pitToggleQueued = false;
    this._pitCompoundCycleQueued = false;
    this._resetToTrackQueued = false;
    this._physicsDebugQueued = false;
    this._menuToggleQueued = false;
    this._capturingKeybind = false;

    this._bindings = normalizeKeybindings(initialBindings || loadKeybindings());
    this._rebuildBindingSets();

    this._onKeyDown = (event) => this._handleKey(event, true);
    this._onKeyUp = (event) => this._handleKey(event, false);
    this._onBlur = () => this.reset();

    this._targetWindow = targetWindow;
    if (this._targetWindow) {
      this._targetWindow.addEventListener('keydown', this._onKeyDown);
      this._targetWindow.addEventListener('keyup', this._onKeyUp);
      this._targetWindow.addEventListener('blur', this._onBlur);
    }
  }

  _rebuildBindingSets() {
    const b = this._bindings;
    this._explicitBoundCodes = new Set([
      b.accelerate,
      b.brake,
      b.steerLeft,
      b.steerRight,
      b.camera,
      b.pitRequest,
      b.cyclePitCompound,
      b.resetToTrack,
      b.weather,
      b.physicsDebug,
      b.pause,
    ]);
    this._movementCodes = new Set([
      b.accelerate,
      b.brake,
      b.steerLeft,
      b.steerRight,
    ]);
    if (b.allowArrowFallback) {
      for (const arrowCode of ARROW_CODES) {
        if (!this._explicitBoundCodes.has(arrowCode)) {
          this._movementCodes.add(arrowCode);
        }
      }
    }
  }

  setKeybindings(nextBindings) {
    this._bindings = normalizeKeybindings(nextBindings);
    this._rebuildBindingSets();
    this._pressedCodes.clear();
    return this._bindings;
  }

  getKeybindings() {
    return { ...this._bindings };
  }

  setCapturing(isCapturing) {
    this._capturingKeybind = Boolean(isCapturing);
    if (this._capturingKeybind) {
      this.reset();
    }
  }

  _handleKey(event, isPressed) {
    if (this._capturingKeybind) return;

    const code = event.code;
    const b = this._bindings;

    if (isPressed && (code === b.pause || code === 'Escape') && !event.repeat) {
      this._menuToggleQueued = true;
      return;
    }

    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      return;
    }

    if (
      PREVENT_DEFAULT_CODES.has(code) &&
      (ARROW_CODES.has(code) || this._explicitBoundCodes.has(code))
    ) {
      event.preventDefault();
    }

    if (isPressed && code === b.physicsDebug && !event.repeat) {
      event.preventDefault();
      this._physicsDebugQueued = true;
      return;
    }

    if (isPressed && code === b.camera && !event.repeat) {
      this._cameraToggleQueued = true;
      return;
    }

    if (isPressed && code === b.weather && !event.repeat) {
      this._weatherToggleQueued = true;
      return;
    }

    if (isPressed && code === b.pitRequest && !event.repeat) {
      this._pitToggleQueued = true;
      return;
    }

    if (isPressed && code === b.cyclePitCompound && !event.repeat) {
      this._pitCompoundCycleQueued = true;
      return;
    }

    if (isPressed && code === b.resetToTrack && !event.repeat) {
      event.preventDefault();
      this._resetToTrackQueued = true;
      return;
    }

    if (!this._movementCodes.has(code)) {
      return;
    }

    if (isPressed) {
      this._pressedCodes.add(code);
    } else {
      this._pressedCodes.delete(code);
    }
  }

  /**
   * Restituisce true se il tasto Pausa / ESC è stato premuto per aprire/chiudere il menu (one-shot).
   */
  consumeMenuToggle() {
    if (!this._menuToggleQueued) return false;
    this._menuToggleQueued = false;
    return true;
  }

  /**
   * Restituisce true se il tasto Visuale è stato premuto dall'ultimo controllo (one-shot).
   */
  consumeCameraToggle() {
    if (!this._cameraToggleQueued) return false;
    this._cameraToggleQueued = false;
    return true;
  }

  /**
   * Restituisce true se il tasto Meteo è stato premuto per cambiare meteo (one-shot).
   */
  consumeWeatherToggle() {
    if (!this._weatherToggleQueued) return false;
    this._weatherToggleQueued = false;
    return true;
  }

  /**
   * Restituisce true se il tasto Pit Stop è stato premuto per prenotare/annullare il Pit Stop (one-shot).
   */
  consumePitToggle() {
    if (!this._pitToggleQueued) return false;
    this._pitToggleQueued = false;
    return true;
  }

  /**
   * Restituisce true se il tasto Cambio Mescola Pit Stop è stato premuto (one-shot).
   */
  consumeCyclePitCompound() {
    if (!this._pitCompoundCycleQueued) return false;
    this._pitCompoundCycleQueued = false;
    return true;
  }

  /**
   * Restituisce true se il tasto Rimetti in Pista è stato premuto (one-shot).
   */
  consumeResetToTrack() {
    if (!this._resetToTrackQueued) return false;
    this._resetToTrackQueued = false;
    return true;
  }

  /**
   * Restituisce true se il tasto Diagnosi Fisica è stato premuto (one-shot).
   */
  consumePhysicsDebugToggle() {
    if (!this._physicsDebugQueued) return false;
    this._physicsDebugQueued = false;
    return true;
  }

  /**
   * Restituisce una copia immutabile dello stato attuale degli input.
   */
  getInputSnapshot() {
    const b = this._bindings;
    const allowArrows = Boolean(b.allowArrowFallback);
    const arrowFree = (code) => allowArrows && !this._explicitBoundCodes.has(code);
    return {
      forward:
        this._pressedCodes.has(b.accelerate) ||
        (arrowFree('ArrowUp') && this._pressedCodes.has('ArrowUp')),
      backward:
        this._pressedCodes.has(b.brake) ||
        (arrowFree('ArrowDown') && this._pressedCodes.has('ArrowDown')),
      left:
        this._pressedCodes.has(b.steerLeft) ||
        (arrowFree('ArrowLeft') && this._pressedCodes.has('ArrowLeft')),
      right:
        this._pressedCodes.has(b.steerRight) ||
        (arrowFree('ArrowRight') && this._pressedCodes.has('ArrowRight')),
    };
  }

  reset() {
    this._pressedCodes.clear();
    this._cameraToggleQueued = false;
    this._weatherToggleQueued = false;
    this._pitToggleQueued = false;
    this._pitCompoundCycleQueued = false;
    this._resetToTrackQueued = false;
    this._physicsDebugQueued = false;
    this._menuToggleQueued = false;
  }

  dispose() {
    if (this._targetWindow) {
      this._targetWindow.removeEventListener('keydown', this._onKeyDown);
      this._targetWindow.removeEventListener('keyup', this._onKeyUp);
      this._targetWindow.removeEventListener('blur', this._onBlur);
    }
  }
}
