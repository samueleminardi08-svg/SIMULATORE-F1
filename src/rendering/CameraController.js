/**
 * Gestore delle 3 viste della telecamera (Step 2):
 * 1. Da dietro la macchina (Chase Cam)
 * 2. Prima persona (Abitacolo)
 * 3. Dall'alto al centro (Vista aerea sopra la macchina)
 */

import * as THREE from 'three';
import { CAMERA_MODES } from '../config/constants.js';

export class CameraController {
  /**
   * @param {THREE.PerspectiveCamera} camera
   */
  constructor(camera) {
    this.camera = camera;
    this.modeIndex = 0; // Inizia in Chase Cam
    this._chasePos = new THREE.Vector3();
    this._chaseLookAt = new THREE.Vector3();
    this._initializedChase = false;
  }

  getCurrentMode() {
    return CAMERA_MODES[this.modeIndex];
  }

  cycleMode() {
    this.modeIndex = (this.modeIndex + 1) % CAMERA_MODES.length;
    this._initializedChase = false;
    return this.getCurrentMode();
  }

  _setFov(targetFov) {
    if (this.camera.fov !== targetFov) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Aggiorna posizione, orientamento e FOV della telecamera sullo stato attuale della monoposto.
   * @param {object} carState
   * @param {ReturnType<import('../cars/CarModel3D.js').createF1CarMesh> | undefined} carModel
   */
  update(carState, carModel) {
    if (!carState) return;

    const mode = this.getCurrentMode();
    const sinH = Math.sin(carState.heading);
    const cosH = Math.cos(carState.heading);

    if (mode.id === 'cockpit') {
      if (carModel) carModel.setCockpitView(true);
      this._setFov(72);
      this.camera.up.set(0, 1, 0);

      const suspHeave = carState.suspension?.heave ?? 0;
      const suspPitch = carState.suspension?.pitch ?? 0;

      // Posizione rigida ad altezza occhi pilota all'interno dell'abitacolo con risposta sospensioni
      const eyeX = carState.x + sinH * 0.10;
      const eyeY = carState.y + 0.83 + suspHeave - suspPitch * 0.15;
      const eyeZ = carState.z + cosH * 0.10;
      this.camera.position.set(eyeX, eyeY, eyeZ);

      // Guarda dritto oltre il musetto e l'Halo
      const lookX = carState.x + sinH * 18.0;
      const lookY = carState.y + 0.68 + suspHeave - suspPitch * 8.0;
      const lookZ = carState.z + cosH * 18.0;
      this.camera.lookAt(lookX, lookY, lookZ);
      return;
    }

    if (carModel) carModel.setCockpitView(false);

    if (mode.id === 'aerial') {
      this._setFov(50);
      // Orienta "l'alto" dello schermo nella direzione del musetto della monoposto
      this.camera.up.set(sinH, 0, cosH);
      this.camera.position.set(carState.x, carState.y + 42.0, carState.z);
      this.camera.lookAt(carState.x, carState.y, carState.z);
      return;
    }

    // Default: 'chase' (Da dietro la macchina)
    this._setFov(62);
    this.camera.up.set(0, 1, 0);

    const desiredPos = new THREE.Vector3(
      carState.x - sinH * 6.5,
      carState.y + 2.35,
      carState.z - cosH * 6.5
    );
    const desiredLookAt = new THREE.Vector3(
      carState.x + sinH * 8.0,
      carState.y + 0.75,
      carState.z + cosH * 8.0
    );

    if (!this._initializedChase) {
      this._chasePos.copy(desiredPos);
      this._chaseLookAt.copy(desiredLookAt);
      this._initializedChase = true;
    } else {
      this._chasePos.lerp(desiredPos, 0.2);
      this._chaseLookAt.lerp(desiredLookAt, 0.28);
    }

    this.camera.position.copy(this._chasePos);
    this.camera.lookAt(this._chaseLookAt);
  }
}
