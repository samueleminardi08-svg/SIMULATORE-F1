/**
 * Gestore degli input da tastiera (WASD + Frecce direzionali).
 * Produce uno snapshot serializzabile dei comandi del giocatore per il tick di simulazione.
 */

const MOVEMENT_CODES = new Set([
  'KeyW',
  'KeyS',
  'KeyA',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

const ARROW_CODES = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

export class InputManager {
  constructor(targetWindow = window) {
    /** @type {Set<string>} */
    this._pressedCodes = new Set();
    this._cameraToggleQueued = false;
    this._weatherToggleQueued = false;
    this._menuToggleQueued = false;

    this._onKeyDown = (event) => this._handleKey(event, true);
    this._onKeyUp = (event) => this._handleKey(event, false);
    this._onBlur = () => this.reset();

    targetWindow.addEventListener('keydown', this._onKeyDown);
    targetWindow.addEventListener('keyup', this._onKeyUp);
    targetWindow.addEventListener('blur', this._onBlur);
    this._targetWindow = targetWindow;
  }

  _handleKey(event, isPressed) {
    if (isPressed && event.code === 'Escape' && !event.repeat) {
      this._menuToggleQueued = true;
      return;
    }

    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      return;
    }

    if (ARROW_CODES.has(event.code)) {
      event.preventDefault();
    }

    if (isPressed && event.code === 'KeyC' && !event.repeat) {
      this._cameraToggleQueued = true;
      return;
    }

    if (isPressed && event.code === 'KeyR' && !event.repeat) {
      this._weatherToggleQueued = true;
      return;
    }

    if (!MOVEMENT_CODES.has(event.code)) {
      return;
    }

    if (isPressed) {
      this._pressedCodes.add(event.code);
    } else {
      this._pressedCodes.delete(event.code);
    }
  }

  /**
   * Restituisce true se il tasto ESC è stato premuto per aprire/chiudere il menu (one-shot).
   */
  consumeMenuToggle() {
    if (!this._menuToggleQueued) return false;
    this._menuToggleQueued = false;
    return true;
  }

  /**
   * Restituisce true se il tasto C è stato premuto dall'ultimo controllo (one-shot).
   */
  consumeCameraToggle() {
    if (!this._cameraToggleQueued) return false;
    this._cameraToggleQueued = false;
    return true;
  }

  /**
   * Restituisce true se il tasto R è stato premuto per cambiare meteo (one-shot).
   */
  consumeWeatherToggle() {
    if (!this._weatherToggleQueued) return false;
    this._weatherToggleQueued = false;
    return true;
  }

  /**
   * Restituisce una copia immutabile dello stato attuale degli input.
   */
  getInputSnapshot() {
    return {
      forward: this._pressedCodes.has('KeyW') || this._pressedCodes.has('ArrowUp'),
      backward: this._pressedCodes.has('KeyS') || this._pressedCodes.has('ArrowDown'),
      left: this._pressedCodes.has('KeyA') || this._pressedCodes.has('ArrowLeft'),
      right: this._pressedCodes.has('KeyD') || this._pressedCodes.has('ArrowRight'),
    };
  }

  reset() {
    this._pressedCodes.clear();
    this._cameraToggleQueued = false;
    this._weatherToggleQueued = false;
    this._menuToggleQueued = false;
  }

  dispose() {
    this._targetWindow.removeEventListener('keydown', this._onKeyDown);
    this._targetWindow.removeEventListener('keyup', this._onKeyUp);
    this._targetWindow.removeEventListener('blur', this._onBlur);
  }
}
