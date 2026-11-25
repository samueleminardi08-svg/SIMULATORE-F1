/**
 * Guida Olografica 3D per il rientro ai box (Step 1 — PIANO PRE STEP 4).
 *
 * Mostra:
 * 1. Una scia animata di frecce chevron verdi olografiche a terra dall'ingresso pit lane
 *    lungo la fast lane fino alla piazzola del box della propria scuderia.
 * 2. Una freccia 3D verticale verde rivolta verso il basso, flottante e pulsante
 *    (y ≈ 2.3..3.0 m) sopra lo stallo del proprio box + anello luminoso a terra.
 *
 * Compatibile con Node.js headless (nessun accesso non protetto a DOM/canvas).
 */

import * as THREE from 'three';

const WAVE_BUCKET_COUNT = 8;

function createChevronTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, 256, 256);

  // Alone morbido circolare
  const radGrad = ctx.createRadialGradient(128, 128, 14, 128, 128, 118);
  radGrad.addColorStop(0, 'rgba(74, 222, 128, 0.42)');
  radGrad.addColorStop(0.55, 'rgba(34, 197, 94, 0.18)');
  radGrad.addColorStop(1, 'rgba(34, 197, 94, 0.0)');
  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, 256, 256);

  // Doppio chevron direzionale orientato verso +Y canvas (che mappa verso +Z / direzione di marcia)
  const drawChevron = (tipY, alpha, lineW) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(42, tipY + 66);
    ctx.lineTo(128, tipY);
    ctx.lineTo(214, tipY + 66);
    ctx.lineTo(190, tipY + 90);
    ctx.lineTo(128, tipY + 42);
    ctx.lineTo(66, tipY + 90);
    ctx.closePath();

    ctx.shadowColor = 'rgba(74, 222, 128, 0.95)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = `rgba(74, 222, 128, ${alpha})`;
    ctx.fill();

    ctx.lineWidth = lineW;
    ctx.strokeStyle = `rgba(220, 252, 231, ${Math.min(1, alpha + 0.12)})`;
    ctx.stroke();
    ctx.restore();
  };

  drawChevron(26, 0.94, 3.5);
  drawChevron(122, 0.72, 2.5);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function smoothstep01(t) {
  const u = clamp(t, 0, 1);
  return 0.5 * (1 - Math.cos(Math.PI * u));
}

export class PitGuideOverlay3D {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'PitGuideOverlay3D';
    this.group.visible = false;

    this.trackSurface = null;
    this._builtKey = null;
    this._targetGarage = null;
    this._elapsed = 0;

    this._chevronTexture = createChevronTexture();
    this._chevronGeo = new THREE.PlaneGeometry(2.15, 2.55);
    this._chevronGeo.rotateX(-Math.PI / 2);

    /** @type {THREE.MeshBasicMaterial[]} */
    this._waveMaterials = [];
    for (let i = 0; i < WAVE_BUCKET_COUNT; i++) {
      this._waveMaterials.push(
        new THREE.MeshBasicMaterial({
          map: this._chevronTexture,
          color: 0x4ade80,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        })
      );
    }

    this._trailGroup = new THREE.Group();
    this._trailGroup.name = 'PitGuideChevronTrail';
    this.group.add(this._trailGroup);

    // Beacon verticale flottante sopra lo stallo box del giocatore
    this._beaconRoot = new THREE.Group();
    this._beaconRoot.name = 'PitGuideBoxBeacon';
    this.group.add(this._beaconRoot);

    this._beaconMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this._beaconCoreMat = new THREE.MeshBasicMaterial({
      color: 0xbbf7d0,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this._ringMat = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this._arrowSpinGroup = new THREE.Group();
    const coneGeo = new THREE.ConeGeometry(0.62, 1.05, 14);
    coneGeo.rotateX(Math.PI); // Punta verso il basso
    const coneMesh = new THREE.Mesh(coneGeo, this._beaconMat);
    coneMesh.position.y = -0.35;

    const innerConeGeo = new THREE.ConeGeometry(0.32, 0.72, 10);
    innerConeGeo.rotateX(Math.PI);
    const innerConeMesh = new THREE.Mesh(innerConeGeo, this._beaconCoreMat);
    innerConeMesh.position.y = -0.34;

    const shaftGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.85, 12);
    const shaftMesh = new THREE.Mesh(shaftGeo, this._beaconMat);
    shaftMesh.position.y = 0.56;

    const haloGeo = new THREE.TorusGeometry(0.86, 0.055, 8, 24);
    haloGeo.rotateX(Math.PI / 2);
    const haloMesh = new THREE.Mesh(haloGeo, this._ringMat);
    haloMesh.position.y = 0.12;

    this._arrowSpinGroup.add(coneMesh, innerConeMesh, shaftMesh, haloMesh);
    this._arrowSpinGroup.position.y = 2.65;
    this._beaconRoot.add(this._arrowSpinGroup);

    const padRingGeo = new THREE.RingGeometry(1.3, 1.72, 32);
    padRingGeo.rotateX(-Math.PI / 2);
    this._padRingMesh = new THREE.Mesh(padRingGeo, this._ringMat);
    this._padRingMesh.position.y = 0.095;
    this._beaconRoot.add(this._padRingMesh);

    this._staticBeaconGeos = [coneGeo, innerConeGeo, shaftGeo, haloGeo, padRingGeo];
  }

  setTrackSurface(trackSurface) {
    if (this.trackSurface === trackSurface) return;
    this.trackSurface = trackSurface || null;
    this._builtKey = null;
    this._targetGarage = null;
    this._clearTrail();
  }

  setVisible(visible) {
    this.group.visible = Boolean(visible);
  }

  _clearTrail() {
    while (this._trailGroup.children.length > 0) {
      this._trailGroup.remove(this._trailGroup.children[0]);
    }
  }

  _rebuildForTeam(teamId) {
    const pitLane = this.trackSurface?.pitLane;
    if (!pitLane || !pitLane.samples || pitLane.samples.length < 4) {
      this._clearTrail();
      this._targetGarage = null;
      this._builtKey = null;
      return;
    }

    const resolvedTeamId = teamId && pitLane.garageByTeamId?.[teamId] ? teamId : pitLane.garages[0]?.teamId;
    const key = `${pitLane.trackId}:${resolvedTeamId}`;
    if (key === this._builtKey) return;

    this._builtKey = key;
    this._clearTrail();

    const garage = pitLane.garageByTeamId?.[resolvedTeamId] || pitLane.garages[0];
    this._targetGarage = garage || null;
    if (!garage) return;

    const { samples, sideSign } = pitLane;
    const rawPath = [];

    // 1. Breve tratto di invito prima dell'ingresso pit lane lungo il bordo pista
    const first = samples[0];
    const leadInDist = 30;
    const leadSteps = 4;
    for (let k = leadSteps; k >= 1; k--) {
      const backM = (k / leadSteps) * leadInDist;
      const lat = Math.max(0.5, first.trackHalfWidth - 1.5 - (k / leadSteps) * 0.8);
      rawPath.push({
        x: first.trackX - first.trackTx * backM + first.trackNx * sideSign * lat,
        y: first.y,
        z: first.trackZ - first.trackTz * backM + first.trackNz * sideSign * lat,
      });
    }

    // 2. Percorso lungo rampa ingresso + fast lane fino a ~18m prima del proprio box,
    //    poi curva dolce verso la piazzola pitStopPos sulla working lane
    const turnInStartM = garage.sCenterM - 18.0;
    const targetEndM = garage.sCenterM;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      if (s.sMeters > targetEndM + 1.5) break;

      let lat = s.fastLaneCenter;
      if (s.sMeters >= turnInStartM) {
        const u = clamp((s.sMeters - turnInStartM) / Math.max(4, targetEndM - turnInStartM), 0, 1);
        lat = s.fastLaneCenter + (s.workingLaneCenter - s.fastLaneCenter) * smoothstep01(u);
      }

      rawPath.push({
        x: s.trackX + s.trackNx * sideSign * lat,
        y: s.y,
        z: s.trackZ + s.trackNz * sideSign * lat,
      });
    }

    // Assicura terminazione esatta sul centro della piazzola pit stop del giocatore
    rawPath.push({
      x: garage.pitStopPos.x,
      y: garage.pitStopPos.y,
      z: garage.pitStopPos.z,
    });

    // 3. Ricampionamento a passo uniforme (4.6 m) per i chevron olografici a terra
    const spacingM = 4.6;
    let accum = 0;
    let nextEmit = 1.5;
    let chevronIdx = 0;

    for (let i = 1; i < rawPath.length; i++) {
      const a = rawPath[i - 1];
      const b = rawPath[i];
      const segDx = b.x - a.x;
      const segDz = b.z - a.z;
      const segLen = Math.hypot(segDx, segDz);
      if (segLen < 1e-3) continue;

      const heading = Math.atan2(segDx, segDz);
      while (nextEmit <= accum + segLen) {
        const alpha = (nextEmit - accum) / segLen;
        const px = a.x + segDx * alpha;
        const py = a.y + (b.y - a.y) * alpha;
        const pz = a.z + segDz * alpha;

        // Evita sovrapposizione con l'anello centrale della piazzola
        const distToStop = Math.hypot(px - garage.pitStopPos.x, pz - garage.pitStopPos.z);
        if (distToStop > 2.3) {
          const mat = this._waveMaterials[chevronIdx % WAVE_BUCKET_COUNT];
          const mesh = new THREE.Mesh(this._chevronGeo, mat);
          mesh.position.set(px, py + 0.085, pz);
          // PlaneGeometry ruotata di -PI/2 ha il top canvas (+V) verso -Z, quindi +PI punta nella direzione heading
          mesh.rotation.y = heading + Math.PI;
          mesh.renderOrder = 3;
          this._trailGroup.add(mesh);
          chevronIdx++;
        }

        nextEmit += spacingM;
      }
      accum += segLen;
    }

    // 4. Posizionamento beacon verticale sopra lo stallo del box del giocatore
    this._beaconRoot.position.set(
      garage.pitStopPos.x,
      garage.pitStopPos.y,
      garage.pitStopPos.z
    );
  }

  /**
   * Aggiorna visibilità, team target e animazione onda/pulsazione.
   */
  update({ worldState = null, activeCar = null, dt = 0.016, forceVisible = false } = {}) {
    const pitLane = this.trackSurface?.pitLane;
    if (!pitLane || !activeCar) {
      this.group.visible = false;
      return;
    }

    const teamId = activeCar.teamId || worldState?.sessionConfig?.careerTeamId || 'ferrari';
    this._rebuildForTeam(teamId);

    const pitState = activeCar.pitState || null;
    if (
      pitState === 'IN_PIT_BOX' ||
      pitState === 'PIT_EXIT_LANE' ||
      pitState === 'IN_GARAGE' ||
      pitState === 'EXITING_GARAGE' ||
      pitState === 'PARKED_STAGE_END'
    ) {
      this.group.visible = false;
      return;
    }
    const explicitGuide = Boolean(
      forceVisible ||
        worldState?.pitGuideActive ||
        activeCar.pitGuideActive ||
        activeCar.pitStopRequested ||
        pitState === 'IN_LAP' ||
        pitState === 'PIT_ENTRY_LANE' ||
        pitState === 'PIT_STOPPING' ||
        pitState === 'AUTO_BOX_STOP' ||
        pitState === 'AUTO_PARKING'
    );
    const inPitSurface = activeCar.surface === 'pitlane';

    let nearPitInPractice = false;
    const isPractice = worldState?.sessionConfig?.mode === 'practice';
    if (isPractice && this._targetGarage) {
      const distEntry = Math.hypot(
        activeCar.x - pitLane.entryFrame.x,
        activeCar.z - pitLane.entryFrame.z
      );
      const distBox = Math.hypot(
        activeCar.x - this._targetGarage.pitStopPos.x,
        activeCar.z - this._targetGarage.pitStopPos.z
      );
      nearPitInPractice = distEntry < 280 || distBox < 280;
    }

    const shouldShow = Boolean(explicitGuide || inPitSurface || nearPitInPractice);
    this.group.visible = shouldShow;
    if (!shouldShow) return;

    this._elapsed += Math.min(0.05, Math.max(0.001, dt));

    // Onda luminosa scorrevole lungo i chevron verso il box del giocatore
    for (let i = 0; i < WAVE_BUCKET_COUNT; i++) {
      const phase = (i / WAVE_BUCKET_COUNT) * Math.PI * 2 - this._elapsed * 5.2;
      const wave = 0.5 + 0.5 * Math.sin(phase);
      const pulse = 0.24 + 0.70 * Math.pow(wave, 1.6);
      this._waveMaterials[i].opacity = pulse;
    }

    // Freccia 3D verticale fluttuante e pulsante sopra il proprio box (y = 2.3..3.0 m)
    const bob = Math.sin(this._elapsed * 3.5);
    this._arrowSpinGroup.position.y = 2.65 + bob * 0.35;
    this._arrowSpinGroup.rotation.y = this._elapsed * 1.45;
    this._beaconMat.opacity = 0.72 + 0.24 * (0.5 + 0.5 * bob);
    this._ringMat.opacity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(this._elapsed * 3.5 + 1.0));
    const ringScale = 1.0 + 0.08 * Math.sin(this._elapsed * 3.5);
    this._padRingMesh.scale.set(ringScale, ringScale, 1);
  }

  dispose() {
    this._clearTrail();
    this._chevronGeo?.dispose?.();
    this._chevronTexture?.dispose?.();
    for (const mat of this._waveMaterials) {
      mat?.dispose?.();
    }
    for (const geo of this._staticBeaconGeos) {
      geo?.dispose?.();
    }
    this._beaconMat?.dispose?.();
    this._beaconCoreMat?.dispose?.();
    this._ringMat?.dispose?.();
  }
}
