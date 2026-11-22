/**
 * Gestore delle 3 viste della telecamera (Step 2):
 * 1. Da dietro la macchina (Chase Cam)
 * 2. Prima persona (Abitacolo)
 * 3. Onboard T-Cam (TV Pod sopra l'airbox / Halo, stile regia F1)
 */

import * as THREE from 'three';
import { CAMERA_MODES } from '../config/constants.js';

// Stabilizzazione orizzonte onboard (stile giroscopio T-Cam / Cockpit F1: max ±0.2°)
export const MAX_ONBOARD_HORIZON_PITCH_RAD = (0.2 * Math.PI) / 180;
const MAX_ONBOARD_AERO_HEAVE_M = 0.014;
const ONBOARD_DAMPING_RATE = 10.0;
const CHASE_POS_SMOOTH_RATE = 13.5;
const CHASE_LOOK_SMOOTH_RATE = 20.0;

/**
 * Configurazione "Camera viva": FOV dinamico legato alla velocità + micro-vibrazioni procedurali
 * contenute su cordoli, erba/ghiaia e frenate violente ad alta velocità (anti-nausea in Cockpit).
 */
export const CAMERA_FEEL_CONFIG = {
  fov: {
    chase: { min: 58, max: 72 },
    tcam: { min: 62, max: 68 },
    cockpit: { min: 60, max: 74 },
    maxSpeedKmh: 315,
    lerpRate: 6.0,
    updateThresholdDeg: 0.05,
  },
  vibration: {
    kerbAmpPos: 0.011,
    kerbAmpPitch: 0.0022,
    kerbAmpRoll: 0.0032,
    grassAmpPos: 0.017,
    grassAmpPitch: 0.0030,
    grassAmpRoll: 0.0045,
    brakeAmpPos: 0.007,
    brakeAmpPitch: 0.0018,
    brakeAmpRoll: 0.0015,
    cockpitScale: 0.55,
    tcamScale: 0.80,
    chaseScale: 1.0,
    envelopeRate: 18.0,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class CameraController {
  /**
   * @param {THREE.PerspectiveCamera} camera
   */
  constructor(camera) {
    this.camera = camera;
    this.modeIndex = 0; // Inizia in Chase Cam
    this._chasePos = new THREE.Vector3();
    this._chaseLookAt = new THREE.Vector3();
    this._desiredPos = new THREE.Vector3();
    this._desiredLookAt = new THREE.Vector3();
    this._initializedChase = false;
    this._onboardPitch = 0;
    this._onboardHeave = 0;
    this._currentFov = CAMERA_FEEL_CONFIG.fov.chase.min;
    this._fovInitialized = false;
    this._vibTime = 0;
    this._vibEnvPos = 0;
    this._vibEnvPitch = 0;
    this._vibEnvRoll = 0;
  }

  getCurrentMode() {
    return CAMERA_MODES[this.modeIndex];
  }

  cycleMode() {
    this.modeIndex = (this.modeIndex + 1) % CAMERA_MODES.length;
    this._initializedChase = false;
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
    const range = fovCfg[modeId] || fovCfg.chase;
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

    const modeScale =
      modeId === 'cockpit'
        ? vCfg.cockpitScale
        : modeId === 'tcam'
          ? vCfg.tcamScale
          : vCfg.chaseScale;

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
   */
  update(carState, carModel, dt = 1 / 60) {
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

    this._updateDynamicFov(mode.id, speedMs, safeDt);
    const vib = this._computeMicroVibration(carState, mode.id, speedMs, safeDt);

    if (Math.abs(vib.roll) > 1e-6) {
      const sinR = Math.sin(vib.roll);
      this.camera.up.set(leftX * sinR, Math.cos(vib.roll), leftZ * sinR);
    } else {
      this.camera.up.set(0, 1, 0);
    }

    if (mode.id === 'cockpit') {
      if (carModel) carModel.setCockpitView(true);
      this._updateOnboardStabilization(carState, safeDt);

      // Posizione stabile ad altezza occhi pilota con micro-reazione orizzonte max ±0.2°
      const eyeX = carState.x + sinH * 0.10 + leftX * vib.dx;
      const eyeY = carState.y + 0.83 + this._onboardHeave + vib.dy;
      const eyeZ = carState.z + cosH * 0.10 + leftZ * vib.dx;
      this.camera.position.set(eyeX, eyeY, eyeZ);

      // Orizzonte stabilizzato oltre il musetto e l'Halo (distanza focale orizzontale 17.9 m)
      const lookX = carState.x + sinH * 18.0 + leftX * vib.dx * 0.5;
      const lookY =
        carState.y +
        0.68 +
        this._onboardHeave +
        vib.dy * 0.5 -
        Math.tan(this._onboardPitch + vib.pitch) * 17.9;
      const lookZ = carState.z + cosH * 18.0 + leftZ * vib.dx * 0.5;
      this.camera.lookAt(lookX, lookY, lookZ);
      return;
    }

    if (carModel) carModel.setCockpitView(false);

    if (mode.id === 'tcam') {
      this._updateOnboardStabilization(carState, safeDt);

      // Posizione T-Cam sempre rigorosamente centrata sull'asse longitudinale X=0 (sopra airbox / Halo)
      const podX = carState.x - sinH * 0.30 + leftX * vib.dx;
      const podY = carState.y + 1.18 + this._onboardHeave + vib.dy;
      const podZ = carState.z - cosH * 0.30 + leftZ * vib.dx;
      this.camera.position.set(podX, podY, podZ);

      // Inquadratura broadcast F1 sempre centrata (tilt -18.2°, distanza focale orizzontale 18.30 m)
      const lookX = carState.x + sinH * 18.0 + leftX * vib.dx * 0.4;
      const lookY =
        carState.y -
        4.836 +
        this._onboardHeave +
        vib.dy * 0.4 -
        Math.tan(this._onboardPitch + vib.pitch) * 18.30;
      const lookZ = carState.z + cosH * 18.0 + leftZ * vib.dx * 0.4;
      this.camera.lookAt(lookX, lookY, lookZ);
      return;
    }

    // Default: 'chase' (Da dietro la macchina, smoothing dt-indipendente + micro-vibrazione)
    this._desiredPos.set(
      carState.x - sinH * 6.6 + leftX * vib.dx,
      carState.y + 2.58 + vib.dy,
      carState.z - cosH * 6.6 + leftZ * vib.dx
    );
    this._desiredLookAt.set(
      carState.x + sinH * 8.0,
      carState.y + 0.05 - Math.tan(vib.pitch) * 14.6,
      carState.z + cosH * 8.0
    );

    if (
      !this._initializedChase ||
      this._chasePos.distanceToSquared(this._desiredPos) > 400
    ) {
      this._chasePos.copy(this._desiredPos);
      this._chaseLookAt.copy(this._desiredLookAt);
      this._initializedChase = true;
    } else {
      const posAlpha = 1 - Math.exp(-CHASE_POS_SMOOTH_RATE * safeDt);
      const lookAlpha = 1 - Math.exp(-CHASE_LOOK_SMOOTH_RATE * safeDt);
      this._chasePos.lerp(this._desiredPos, posAlpha);
      this._chaseLookAt.lerp(this._desiredLookAt, lookAlpha);
    }

    this.camera.position.copy(this._chasePos);
    this.camera.lookAt(this._chaseLookAt);
  }
}
