/**
 * GameLoop con timestep fisso per la simulazione (60 Hz)
 * e rendering disaccoppiato tramite requestAnimationFrame.
 */

import { FIXED_DT, MAX_ACCUMULATED_TIME } from '../config/constants.js';

export class GameLoop {
  /**
   * @param {{
   *   onSimulationStep: (dt: number) => void,
   *   onRender: (interpolationAlpha: number) => void
   * }} callbacks
   */
  constructor({ onSimulationStep, onRender }) {
    this.onSimulationStep = onSimulationStep;
    this.onRender = onRender;
    this._running = false;
    this._rafId = null;
    this._lastTimeSeconds = 0;
    this._accumulator = 0;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastTimeSeconds = performance.now() / 1000;
    this._accumulator = 0;

    const frame = (nowMs) => {
      if (!this._running) return;

      const nowSeconds = nowMs / 1000;
      let frameTime = nowSeconds - this._lastTimeSeconds;
      this._lastTimeSeconds = nowSeconds;

      if (frameTime > MAX_ACCUMULATED_TIME) {
        frameTime = MAX_ACCUMULATED_TIME;
      }

      this._accumulator += frameTime;

      while (this._accumulator >= FIXED_DT) {
        this.onSimulationStep(FIXED_DT);
        this._accumulator -= FIXED_DT;
      }

      const alpha = this._accumulator / FIXED_DT;
      this.onRender(alpha);

      this._rafId = requestAnimationFrame(frame);
    };

    this._rafId = requestAnimationFrame(frame);
  }

  stop() {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }
}
