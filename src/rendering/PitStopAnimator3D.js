/**
 * Animatore 3D del Pit Stop in Gara (Step 5 — PIANO PRE STEP 4):
 * - Riutilizza un pool leggero di piazzole animate (zero allocazioni a runtime,
 *   visibilità 0 quando nessuna vettura è in stato `PIT_STOPPING`).
 * - Mostra martinetto anteriore e posteriore, 10 meccanici stilizzati con tuta
 *   nel colore del team + casco + avvitatore + 4 ruote nuove con banda Pirelli
 *   della mescola selezionata (`S / M / H / W`), oltre al semaforo aereo rosso/verde.
 * - Pilota `carModel.setPitStopVisualState({ jackLiftM, wheelOutOffsetM })`
 *   in sincronia millimetrica con le 3 fasi di `computePitStopVisualState(car)`.
 */

import * as THREE from 'three';
import { TIRE_COMPOUNDS } from '../config/constants.js';
import { computePitStopVisualState } from '../race/PitLaneManager.js';

const MAX_ACTIVE_RIGS = 3;

const CORNER_DEFS = [
  { key: 'fl', sign: 1, z: 1.48 },
  { key: 'fr', sign: -1, z: 1.48 },
  { key: 'rl', sign: 1, z: -1.84 },
  { key: 'rr', sign: -1, z: -1.84 },
];

function createMechanicMesh(suitMat, darkMat, visorMat, withGun = false) {
  const grp = new THREE.Group();

  // Gambe / ginocchia piegate in posizione operativa pit stop
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.56, 0.24), suitMat);
  legs.position.set(0, 0.28, 0);
  legs.castShadow = true;
  grp.add(legs);

  // Busto inclinato leggermente in avanti verso la vettura
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 0.54, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.48, 0.22), suitMat);
  torso.position.set(0, 0.24, 0);
  torso.castShadow = true;
  torsoPivot.add(torso);

  // Casco protettivo con visiera
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 10), darkMat);
  helmet.position.set(0, 0.62, 0.02);
  torsoPivot.add(helmet);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.075, 0.08), visorMat);
  visor.position.set(0, 0.61, 0.11);
  torsoPivot.add(visor);

  // Braccia operative
  const armGeo = new THREE.BoxGeometry(0.10, 0.34, 0.10);
  const leftArm = new THREE.Mesh(armGeo, suitMat);
  leftArm.position.set(0.22, 0.28, 0.15);
  leftArm.rotation.x = -0.95;
  const rightArm = new THREE.Mesh(armGeo, suitMat);
  rightArm.position.set(-0.22, 0.28, 0.15);
  rightArm.rotation.x = -0.95;
  torsoPivot.add(leftArm, rightArm);

  let gunMesh = null;
  if (withGun) {
    gunMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.048, 0.34, 8), darkMat);
    gunMesh.rotation.x = Math.PI / 2;
    gunMesh.position.set(0, 0.22, 0.36);
    torsoPivot.add(gunMesh);
  }

  grp.add(torsoPivot);
  return { root: grp, torsoPivot, gunMesh };
}

function createSpareWheelMesh(rubberMat, rimMat, stripeMat) {
  const wheelGrp = new THREE.Group();
  const tireGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.34, 18);
  tireGeo.rotateZ(Math.PI / 2);
  const tire = new THREE.Mesh(tireGeo, rubberMat);
  tire.castShadow = true;
  wheelGrp.add(tire);

  const rimGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.35, 12);
  rimGeo.rotateZ(Math.PI / 2);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  wheelGrp.add(rim);

  const stripeGeo = new THREE.TorusGeometry(0.265, 0.018, 8, 20);
  stripeGeo.rotateY(Math.PI / 2);
  const s1 = new THREE.Mesh(stripeGeo, stripeMat);
  s1.position.x = 0.174;
  const s2 = new THREE.Mesh(stripeGeo, stripeMat);
  s2.position.x = -0.174;
  wheelGrp.add(s1, s2);

  return wheelGrp;
}

function createPitStopRig() {
  const root = new THREE.Group();
  root.visible = false;

  const suitMat = new THREE.MeshStandardMaterial({
    color: 0xdc0000,
    roughness: 0.72,
    metalness: 0.08,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x161920,
    roughness: 0.42,
    metalness: 0.35,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.3,
    metalness: 0.78,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.14,
    metalness: 0.85,
  });
  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x181a20,
    roughness: 0.78,
    metalness: 0.06,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x2a2f3a,
    roughness: 0.35,
    metalness: 0.65,
  });
  const spareStripeMat = new THREE.MeshBasicMaterial({ color: TIRE_COMPOUNDS.M.colorHex });
  const gantryLedMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.4, 0.12, 0.12),
    toneMapped: false,
  });

  // 1. Martinetto Anteriore + Meccanico Front Jack (1)
  const frontJackPivot = new THREE.Group();
  frontJackPivot.position.set(0, 0.12, 2.38);
  const fPlate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.34), metalMat);
  fPlate.position.set(0, -0.05, -0.18);
  const fHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.05, 8), metalMat);
  fHandle.position.set(0, 0.42, 0.28);
  fHandle.rotation.x = 0.55;
  frontJackPivot.add(fPlate, fHandle);
  root.add(frontJackPivot);

  const frontJackMan = createMechanicMesh(suitMat, darkMat, visorMat, false);
  frontJackMan.root.position.set(0, 0, 3.02);
  frontJackMan.root.rotation.y = Math.PI;
  root.add(frontJackMan.root);

  // 2. Martinetto Posteriore + Meccanico Rear Jack (2)
  const rearJackPivot = new THREE.Group();
  rearJackPivot.position.set(0, 0.12, -2.42);
  const rPlate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.32), metalMat);
  rPlate.position.set(0, -0.05, 0.16);
  const rHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.0, 8), metalMat);
  rHandle.position.set(0, 0.40, -0.28);
  rHandle.rotation.x = -0.55;
  rearJackPivot.add(rPlate, rHandle);
  root.add(rearJackPivot);

  const rearJackMan = createMechanicMesh(suitMat, darkMat, visorMat, false);
  rearJackMan.root.position.set(0, 0, -3.02);
  rearJackMan.root.rotation.y = 0;
  root.add(rearJackMan.root);

  // 3. 8 Meccanici Ruote (2 per angolo: Avvitatore + Portagomme con ruota nuova) -> Totale 10 meccanici
  const corners = CORNER_DEFS.map((def) => {
    const faceCarYaw = def.sign > 0 ? -Math.PI / 2 : Math.PI / 2;

    const gunner = createMechanicMesh(suitMat, darkMat, visorMat, true);
    gunner.root.position.set(def.sign * 1.46, 0, def.z);
    gunner.root.rotation.y = faceCarYaw;
    root.add(gunner.root);

    const carrier = createMechanicMesh(suitMat, darkMat, visorMat, false);
    carrier.root.position.set(def.sign * 1.98, 0, def.z + (def.z > 0 ? -0.56 : 0.56));
    carrier.root.rotation.y = faceCarYaw;
    root.add(carrier.root);

    const spareWheel = createSpareWheelMesh(rubberMat, rimMat, spareStripeMat);
    spareWheel.position.set(def.sign * 1.66, 0.42, def.z + (def.z > 0 ? -0.42 : 0.42));
    root.add(spareWheel);

    return { def, gunner, carrier, spareWheel };
  });

  // 4. Braccio Semaforo Pit Stop Aereo (LED Rosso durante cambio gomme -> Verde al rilascio)
  const gantryGroup = new THREE.Group();
  const gantryArm = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 0.12), darkMat);
  gantryArm.position.set(0, 2.58, 1.05);
  const gantryBox = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.18, 0.16), darkMat);
  gantryBox.position.set(0, 2.46, 1.05);
  const gantryLed = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.18), gantryLedMat);
  gantryLed.position.set(0, 2.46, 1.05);
  gantryGroup.add(gantryArm, gantryBox, gantryLed);
  root.add(gantryGroup);

  return {
    root,
    suitMat,
    spareStripeMat,
    gantryLedMat,
    frontJackPivot,
    rearJackPivot,
    frontJackMan,
    rearJackMan,
    corners,
    dispose() {
      root.traverse((obj) => {
        if (obj.isMesh && obj.geometry) {
          obj.geometry.dispose();
        }
      });
      suitMat.dispose();
      darkMat.dispose();
      metalMat.dispose();
      visorMat.dispose();
      rubberMat.dispose();
      rimMat.dispose();
      spareStripeMat.dispose();
      gantryLedMat.dispose();
    },
  };
}

export class PitStopAnimator3D {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'PitStopAnimator3D';
    this.group.visible = false;
    this._rigs = Array.from({ length: MAX_ACTIVE_RIGS }, () => {
      const rig = createPitStopRig();
      this.group.add(rig.root);
      return rig;
    });
    this._activePitCarIds = new Set();
  }

  setVisible(visible) {
    this.group.visible = Boolean(visible);
  }

  /**
   * Aggiorna tutte le animazioni pit stop attive in gara e sincronizza
   * il sollevamento telaio + scorrimento ruote sulle mesh delle vetture.
   */
  update(worldState, carMeshes, followedCarId, _dt = 1 / 60) {
    if (!worldState?.cars || !carMeshes) {
      this.group.visible = false;
      return;
    }

    // Trova tutte le vetture attualmente in fase PIT_STOPPING (priorità al giocatore)
    const pittingCars = [];
    const nextActiveIds = new Set();
    for (const car of Object.values(worldState.cars)) {
      if (car && car.pitState === 'PIT_STOPPING') {
        pittingCars.push(car);
        nextActiveIds.add(car.id);
      }
    }

    // Ripristina immediatamente il telaio/ruote delle vetture uscite da PIT_STOPPING
    for (const prevId of this._activePitCarIds) {
      if (!nextActiveIds.has(prevId)) {
        const prevModel = carMeshes.get(prevId);
        prevModel?.setPitStopVisualState?.({ jackLiftM: 0, wheelOutOffsetM: 0 });
      }
    }
    this._activePitCarIds = nextActiveIds;

    if (pittingCars.length === 0) {
      this.group.visible = false;
      for (let i = 0; i < this._rigs.length; i++) {
        this._rigs[i].root.visible = false;
      }
      return;
    }

    pittingCars.sort((a, b) => {
      if (a.id === followedCarId) return -1;
      if (b.id === followedCarId) return 1;
      return 0;
    });

    this.group.visible = true;

    for (let i = 0; i < this._rigs.length; i++) {
      const rig = this._rigs[i];
      const car = pittingCars[i] || null;
      if (!car) {
        rig.root.visible = false;
        continue;
      }

      const vis = computePitStopVisualState(car);
      const carModel = carMeshes.get(car.id);
      carModel?.setPitStopVisualState?.({
        jackLiftM: vis.jackLiftM,
        wheelOutOffsetM: vis.wheelOutOffsetM,
      });

      rig.root.visible = true;
      rig.root.position.set(car.x, car.y ?? 0, car.z);
      rig.root.rotation.y = car.heading ?? 0;

      // Colora tute meccanici con la livrea del team
      rig.suitMat.color.set(car.color || '#dc0000');

      // Colora anello Pirelli delle ruote portate dai meccanici (nuova prima dello swap, vecchia dopo)
      const shownSpareCompound = vis.swapped ? vis.oldCompound : vis.newCompound;
      const spareSpec = TIRE_COMPOUNDS[shownSpareCompound] || TIRE_COMPOUNDS.M;
      rig.spareStripeMat.color.set(spareSpec.colorHex);

      // Animazione martinetti (leva abbassata quando l'auto è sollevata)
      const liftRatio = vis.jackLiftM / 0.055;
      rig.frontJackPivot.rotation.x = liftRatio * 0.28;
      rig.rearJackPivot.rotation.x = -liftRatio * 0.28;
      rig.frontJackMan.torsoPivot.rotation.x = 0.16 + liftRatio * 0.22;
      rig.rearJackMan.torsoPivot.rotation.x = 0.16 + liftRatio * 0.22;

      // Animazione meccanici ruote e ruote di scorta durante Fase 2
      const outRatio = Math.min(1, vis.wheelOutOffsetM / 0.45);
      const isWorking = vis.phase === 2;
      const workPulse = isWorking ? Math.sin(vis.elapsed * 26.0) * 0.04 : 0;

      for (let c = 0; c < rig.corners.length; c++) {
        const corner = rig.corners[c];
        const s = corner.def.sign;
        const zBase = corner.def.z;
        const zShift = zBase > 0 ? -0.56 : 0.56;

        // Avvitatore si avvicina in fase 1/2 e arretra leggermente per far passare la ruota
        corner.gunner.root.position.set(s * (1.42 + outRatio * 0.22), 0, zBase);
        corner.gunner.torsoPivot.rotation.x = (isWorking ? 0.36 : 0.18) + workPulse;

        // Portagomme avvicina la ruota nuova verso il mozzo al culmine della Fase 2
        const carrierX = 1.98 - outRatio * 0.24;
        corner.carrier.root.position.set(s * carrierX, 0, zBase + zShift);
        corner.carrier.torsoPivot.rotation.x = 0.22 + outRatio * 0.22;

        // Ruota di scorta portata dal meccanico: si avvicina al mozzo e si scambia con quella smontata
        const spareX = vis.swapped ? 1.56 + (1 - outRatio) * 0.46 : 1.72 - outRatio * 0.28;
        const spareZ = zBase + zShift * (1 - outRatio * 0.48);
        corner.spareWheel.visible = vis.phase <= 2 || vis.elapsed < vis.duration - 0.12;
        corner.spareWheel.position.set(s * spareX, 0.39 + outRatio * 0.05, spareZ);
      }

      // Semaforo aereo: Rosso durante cambio gomme / unsafe release, Verde al termine
      const isReadyGreen =
        vis.elapsed >= vis.duration - 0.08 &&
        (!worldState.pitReleaseStatus || worldState.pitReleaseStatus.isGreen || car.isBot);
      if (isReadyGreen) {
        rig.gantryLedMat.color.setRGB(0.12, 2.8, 0.45);
      } else {
        rig.gantryLedMat.color.setRGB(2.6, 0.12, 0.12);
      }
    }
  }

  dispose() {
    for (let i = 0; i < this._rigs.length; i++) {
      this._rigs[i].dispose();
    }
    this._rigs.length = 0;
    this._activePitCarIds.clear();
  }
}
