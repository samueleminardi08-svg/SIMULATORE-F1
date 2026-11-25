/**
 * Gestore delle 2 viste della telecamera (Onboard T-Cam & Prima Persona Abitacolo stile F1 23/26):
 * 1. Onboard (T-Cam) — TV Pod sopra l'airbox / Halo con Broadcast Halo Telemetry HUD
 * 2. Prima persona (Abitacolo) — POV realistico da casco pilota con Halo centrale, specchietti,
 *    gomme anteriori visibili e volante F1 con schermo LCD live e guanti pilota.
 *
 * Persistenza visuale predefinita in localStorage (`f1_game_default_camera_v1`).
 */

import * as THREE from 'three';
import { CAMERA_MODES } from '../config/constants.js';

export const DEFAULT_CAMERA_MODE_ID = 'tcam';
export const CAMERA_STORAGE_KEY = 'f1_game_default_camera_v1';

// Stabilizzazione orizzonte onboard (stile giroscopio T-Cam / Cockpit F1: max ±0.2°)
export const MAX_ONBOARD_HORIZON_PITCH_RAD = (0.2 * Math.PI) / 180;
const MAX_ONBOARD_AERO_HEAVE_M = 0.014;
const ONBOARD_DAMPING_RATE = 10.0;

/**
 * Configurazione "Camera viva": FOV dinamico legato alla velocità + micro-vibrazioni procedurali
 * contenute su cordoli, erba/ghiaia e frenate violente ad alta velocità (anti-nausea in Cockpit).
 */
export const CAMERA_FEEL_CONFIG = {
  fov: {
    tcam: { min: 62, max: 68 },
    cockpit: { min: 72, max: 78 },
    maxSpeedKmh: 315,
    lerpRate: 6.0,
    updateThresholdDeg: 0.05,
  },
  vibration: {
    kerbAmpPos: 0.010,
    kerbAmpPitch: 0.0020,
    kerbAmpRoll: 0.0028,
    grassAmpPos: 0.016,
    grassAmpPitch: 0.0028,
    grassAmpRoll: 0.0040,
    brakeAmpPos: 0.0065,
    brakeAmpPitch: 0.0016,
    brakeAmpRoll: 0.0014,
    cockpitScale: 0.50,
    tcamScale: 0.80,
    envelopeRate: 18.0,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeCameraModeId(modeId) {
  return CAMERA_MODES.some((m) => m.id === modeId) ? modeId : DEFAULT_CAMERA_MODE_ID;
}

export function loadDefaultCameraMode() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_CAMERA_MODE_ID;
  }
  try {
    const raw = window.localStorage.getItem(CAMERA_STORAGE_KEY);
    return normalizeCameraModeId(raw);
  } catch {
    return DEFAULT_CAMERA_MODE_ID;
  }
}

export function saveDefaultCameraMode(modeId) {
  const normalized = normalizeCameraModeId(modeId);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(CAMERA_STORAGE_KEY, normalized);
    } catch {
      // ignore storage quota errors
    }
  }
  return normalized;
}

export class CameraController {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {string} [initialModeId]
   */
  constructor(camera, initialModeId = null) {
    this.camera = camera;
    const resolvedId = normalizeCameraModeId(initialModeId || loadDefaultCameraMode());
    const idx = CAMERA_MODES.findIndex((m) => m.id === resolvedId);
    this.modeIndex = idx >= 0 ? idx : 0;
    this._onboardPitch = 0;
    this._onboardHeave = 0;
    const initRange = CAMERA_FEEL_CONFIG.fov[resolvedId] || CAMERA_FEEL_CONFIG.fov.tcam;
    this._currentFov = initRange.min;
    this._fovInitialized = false;
    this._vibTime = 0;
    this._vibEnvPos = 0;
    this._vibEnvPitch = 0;
    this._vibEnvRoll = 0;
    this._lastVib = { dx: 0, dy: 0, pitch: 0, roll: 0 };
  }

  getCurrentMode() {
    return CAMERA_MODES[this.modeIndex] || CAMERA_MODES[0];
  }

  setModeById(modeId) {
    const normalized = normalizeCameraModeId(modeId);
    const idx = CAMERA_MODES.findIndex((m) => m.id === normalized);
    this.modeIndex = idx >= 0 ? idx : 0;
    this._onboardPitch = 0;
    this._onboardHeave = 0;
    this._fovInitialized = false;
    this._vibEnvPos = 0;
    this._vibEnvPitch = 0;
    this._vibEnvRoll = 0;
    return this.getCurrentMode();
  }

  cycleMode() {
    this.modeIndex = (this.modeIndex + 1) % CAMERA_MODES.length;
    this._onboardPitch = 0;
    this._onboardHeave = 0;
    this._fovInitialized = false;
    this._vibEnvPos = 0;
    this._vibEnvPitch = 0;
    this._vibEnvRoll = 0;
    return this.getCurrentMode();
  }

  _updateDynamicFov(modeId, speedMs, safeDt) {
    const fovCfg = CAMERA_FEEL_CONFIG.fov;
    const range = fovCfg[modeId] || fovCfg.tcam;
    const speedKmh = Math.abs(speedMs) * 3.6;
    const ratio = clamp(speedKmh / fovCfg.maxSpeedKmh, 0, 1);
    const curve = ratio * (0.65 + 0.35 * ratio);
    const targetFov = range.min + (range.max - range.min) * curve;

    if (!this._fovInitialized) {
      this._currentFov = targetFov;
      this._fovInitialized = true;
    } else {
      const alpha = 1 - Math.exp(-fovCfg.lerpRate * safeDt);
      this._currentFov += (targetFov - this._currentFov) * alpha;
    }

    if (Math.abs(this._currentFov - this.camera.fov) > fovCfg.updateThresholdDeg) {
      this.camera.fov = this._currentFov;
      this.camera.updateProjectionMatrix();
    }
  }

  _computeMicroVibration(carState, modeId, speedMs, safeDt) {
    const vCfg = CAMERA_FEEL_CONFIG.vibration;
    const surface = carState.surface || 'asphalt';
    const absSpeed = Math.abs(speedMs);

    let targetPos = 0;
    let targetPitch = 0;
    let targetRoll = 0;

    if (surface === 'kerb' && absSpeed > 4.0) {
      const s = clamp((absSpeed - 4.0) / 30.0, 0.25, 1.0);
      targetPos = Math.max(targetPos, vCfg.kerbAmpPos * s);
      targetPitch = Math.max(targetPitch, vCfg.kerbAmpPitch * s);
      targetRoll = Math.max(targetRoll, vCfg.kerbAmpRoll * s);
    } else if (surface === 'grass' && absSpeed > 3.0) {
      const s = clamp((absSpeed - 3.0) / 25.0, 0.3, 1.0);
      targetPos = Math.max(targetPos, vCfg.grassAmpPos * s);
      targetPitch = Math.max(targetPitch, vCfg.grassAmpPitch * s);
      targetRoll = Math.max(targetRoll, vCfg.grassAmpRoll * s);
    }

    const hardBraking =
      Boolean(carState.aeroTire?.highSpeedBraking) ||
      ((carState.brakeInput ?? 0) > 0.72 && absSpeed > 42.0);
    if (hardBraking) {
      const s = clamp((absSpeed - 38.0) / 36.0, 0.3, 1.0);
      const lockBoost = carState.aeroTire?.wheelLockup ? 1.25 : 1.0;
      targetPos = Math.max(targetPos, vCfg.brakeAmpPos * s * lockBoost);
      targetPitch = Math.max(targetPitch, vCfg.brakeAmpPitch * s * lockBoost);
      targetRoll = Math.max(targetRoll, vCfg.brakeAmpRoll * s * lockBoost);
    }

    const envAlpha = 1 - Math.exp(-vCfg.envelopeRate * safeDt);
    this._vibEnvPos += (targetPos - this._vibEnvPos) * envAlpha;
    this._vibEnvPitch += (targetPitch - this._vibEnvPitch) * envAlpha;
    this._vibEnvRoll += (targetRoll - this._vibEnvRoll) * envAlpha;

    if (targetPos === 0 && this._vibEnvPos < 1e-5) this._vibEnvPos = 0;
    if (targetPitch === 0 && this._vibEnvPitch < 1e-6) this._vibEnvPitch = 0;
    if (targetRoll === 0 && this._vibEnvRoll < 1e-6) this._vibEnvRoll = 0;

    if (this._vibEnvPos === 0 && this._vibEnvPitch === 0 && this._vibEnvRoll === 0) {
      return { dx: 0, dy: 0, pitch: 0, roll: 0 };
    }

    const modeScale = modeId === 'cockpit' ? vCfg.cockpitScale : vCfg.tcamScale;

    this._vibTime += safeDt * (18.0 + clamp(absSpeed / 6.0, 0, 16.0));
    const t = this._vibTime;
    const waveY = Math.sin(t * 2.1) * 0.65 + Math.sin(t * 4.7 + 1.1) * 0.35;
    const waveX = Math.sin(t * 1.7 + 0.6) * 0.6 + Math.cos(t * 3.9) * 0.4;
    const wavePitch = Math.cos(t * 2.4 + 0.4) * 0.65 + Math.sin(t * 5.1) * 0.35;
    const waveRoll = Math.sin(t * 1.45 + 2.0) * 0.7 + Math.cos(t * 3.1) * 0.3;

    return {
      dx: waveX * this._vibEnvPos * 0.65 * modeScale,
      dy: waveY * this._vibEnvPos * modeScale,
      pitch: wavePitch * this._vibEnvPitch * modeScale,
      roll: waveRoll * this._vibEnvRoll * modeScale,
    };
  }

  _updateOnboardStabilization(carState, safeDt) {
    const rawPitch = carState.suspension?.pitch ?? 0;
    const targetPitch = clamp(
      rawPitch * 0.09,
      -MAX_ONBOARD_HORIZON_PITCH_RAD,
      MAX_ONBOARD_HORIZON_PITCH_RAD
    );

    let targetHeave = 0;
    const downforceKg = carState.aeroTire?.downforceKg;
    if (
      typeof downforceKg === 'number' &&
      Number.isFinite(downforceKg) &&
      (downforceKg > 0 || Math.abs(carState.forwardSpeed ?? 0) > 1.0)
    ) {
      targetHeave = -MAX_ONBOARD_AERO_HEAVE_M * clamp(downforceKg / 1250, 0, 1);
    } else if (typeof carState.suspension?.heave === 'number') {
      targetHeave = clamp(carState.suspension.heave * 0.3, -MAX_ONBOARD_AERO_HEAVE_M, 0.004);
    }

    const alpha = 1 - Math.exp(-ONBOARD_DAMPING_RATE * safeDt);
    this._onboardPitch += (targetPitch - this._onboardPitch) * alpha;
    this._onboardHeave += (targetHeave - this._onboardHeave) * alpha;
  }

  /**
   * Aggiorna posizione, orientamento, FOV dinamico e micro-vibrazioni della telecamera.
   * @param {object} carState
   * @param {ReturnType<import('../cars/CarModel3D.js').createF1CarMesh> | undefined} carModel
   * @param {number} [dt=1/60]
   * @param {object | null} [_trackSurface=null]
   */
  update(carState, carModel, dt = 1 / 60, _trackSurface = null) {
    if (!carState) return;

    const safeDt = clamp(
      typeof dt === 'number' && Number.isFinite(dt) && dt > 0 ? dt : 1 / 60,
      0.001,
      0.05
    );
    const mode = this.getCurrentMode();
    const sinH = Math.sin(carState.heading);
    const cosH = Math.cos(carState.heading);
    const leftX = cosH;
    const leftZ = -sinH;
    const speedMs =
      carState.forwardSpeed ??
      carState.speed ??
      Math.hypot(carState.vx ?? 0, carState.vz ?? 0);

    const recAnim = carState.trackRecoveryAnim || null;
    const recU = recAnim ? clamp(recAnim.progress ?? 0, 0, 1) : 0;
    const recBlend = recAnim ? Math.pow(Math.sin(Math.PI * recU), 0.72) : 0;

    if (recBlend > 0.02) {
      const baseRange = CAMERA_FEEL_CONFIG.fov[mode.id] || CAMERA_FEEL_CONFIG.fov.tcam;
      const targetFov = baseRange.min + 5.5 * recBlend;
      this._currentFov = targetFov;
      this._fovInitialized = true;
      if (Math.abs(targetFov - this.camera.fov) > 0.04) {
        this.camera.fov = targetFov;
        this.camera.updateProjectionMatrix();
      }
      this.camera.up.set(0, 1, 0);
      this._vibEnvPos = 0;
      this._vibEnvPitch = 0;
      this._vibEnvRoll = 0;
    } else {
      this._updateDynamicFov(mode.id, speedMs, safeDt);
      const vib = this._computeMicroVibration(carState, mode.id, speedMs, safeDt);

      if (Math.abs(vib.roll) > 1e-6) {
        const sinR = Math.sin(vib.roll);
        this.camera.up.set(leftX * sinR, Math.cos(vib.roll), leftZ * sinR);
      } else {
        this.camera.up.set(0, 1, 0);
      }
      this._lastVib = vib;
    }

    const vib = recBlend > 0.02 ? { dx: 0, dy: 0, pitch: 0, roll: 0 } : this._lastVib;
    this._updateOnboardStabilization(carState, safeDt);

    let onX;
    let onY;
    let onZ;
    let lookOnX;
    let lookOnY;
    let lookOnZ;

    if (mode.id === 'cockpit') {
      if (carModel) carModel.setCockpitView(recBlend <= 0.14);

      const eyeForwardOffset = 0.005;
      onX = carState.x + sinH * eyeForwardOffset + leftX * vib.dx;
      onY = carState.y + 0.790 + this._onboardHeave + vib.dy;
      onZ = carState.z + cosH * eyeForwardOffset + leftZ * vib.dx;

      const lookDist = 18.0;
      lookOnX = carState.x + sinH * lookDist + leftX * vib.dx * 0.4;
      lookOnY =
        carState.y +
        0.62 +
        this._onboardHeave +
        vib.dy * 0.4 -
        Math.tan(this._onboardPitch + vib.pitch) * lookDist;
      lookOnZ = carState.z + cosH * lookDist + leftZ * vib.dx * 0.4;
    } else {
      // Default: 'tcam' (Onboard T-Cam / TV Pod sopra l'airbox con Halo Telemetry HUD)
      if (carModel) carModel.setCockpitView(false);

      onX = carState.x - sinH * 0.30 + leftX * vib.dx;
      onY = carState.y + 1.18 + this._onboardHeave + vib.dy;
      onZ = carState.z - cosH * 0.30 + leftZ * vib.dx;

      lookOnX = carState.x + sinH * 18.0 + leftX * vib.dx * 0.4;
      lookOnY =
        carState.y -
        4.836 +
        this._onboardHeave +
        vib.dy * 0.4 -
        Math.tan(this._onboardPitch + vib.pitch) * 18.30;
      lookOnZ = carState.z + cosH * 18.0 + leftZ * vib.dx * 0.4;
    }

    if (recBlend > 0.001) {
      // Camera cinematica 3/4 rialzata che accompagna la monoposto fino al ritorno in pista
      const sweepLat = 1.15 * Math.sin(Math.PI * recU);
      const cinX = carState.x - sinH * 5.4 + leftX * sweepLat;
      const cinY = carState.y + 2.45;
      const cinZ = carState.z - cosH * 5.4 + leftZ * sweepLat;
      const lookCinX = carState.x + sinH * 4.5;
      const lookCinY = carState.y + 0.42;
      const lookCinZ = carState.z + cosH * 4.5;

      this.camera.position.set(
        onX + (cinX - onX) * recBlend,
        onY + (cinY - onY) * recBlend,
        onZ + (cinZ - onZ) * recBlend
      );
      this.camera.lookAt(
        lookOnX + (lookCinX - lookOnX) * recBlend,
        lookOnY + (lookCinY - lookOnY) * recBlend,
        lookOnZ + (lookCinZ - lookOnZ) * recBlend
      );
      return;
    }

    this.camera.position.set(onX, onY, onZ);
    this.camera.lookAt(lookOnX, lookOnY, lookOnZ);
  }
}
