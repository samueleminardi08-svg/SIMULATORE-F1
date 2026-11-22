/**
 * Torri di fari FIA per i GP notturni (Presentation Layer):
 * - Posizioni derivate esclusivamente in sola lettura da `TrackSurface` (mai dentro pista/runoff/barriere)
 * - Cluster extra su rettilineo box/partenza e curve lente (`hasKerb`)
 * - Geometria istanziata (`InstancedMesh`): pilone, braccio, testa proiettori, pannello LED emissivo HDR (bloom),
 *   pozze di luce additive sull'asfalto e coni volumetrici leggeri
 * - Pool controllato di SpotLight reali (4 Bassa / 8 Media / 12 Alta, ombre solo su 0/1/2 luci)
 *   riassegnate dinamicamente con slot sticky alle torri più vicine alla camera/vettura.
 */

import * as THREE from 'three';
import { queryTrackSurface } from './TrackSurface.js';
import {
  DEFAULT_NIGHT_QUALITY,
  FLOODLIGHT_PARAMS,
  getNightCircuitProfile,
  getNightQualityConfig,
} from '../rendering/NightLightingConfig.js';

const MAX_POOL_LIGHTS = 12;

function createLightPoolTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof ctx.createRadialGradient !== 'function') return null;

  const grad = ctx.createRadialGradient(128, 128, 6, 128, 128, 124);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.92)');
  grad.addColorStop(0.32, 'rgba(235, 244, 255, 0.56)');
  grad.addColorStop(0.68, 'rgba(205, 224, 250, 0.18)');
  grad.addColorStop(1.0, 'rgba(180, 210, 245, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const CONE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vec4 mvPos = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vNormalView = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const CONE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;

  void main() {
    // Sfuma dolcemente verso il basso (vUv.y = 0 base, 1 cima proiettore) e sui bordi laterali
    float verticalFade = smoothstep(0.0, 0.72, vUv.y) * smoothstep(1.0, 0.84, vUv.y);
    float edgeSoft = pow(abs(dot(normalize(vNormalView), normalize(vViewDir))), 1.45);
    float alpha = verticalFade * edgeSoft * uOpacity;
    if (alpha < 0.002) discard;

    gl_FragColor = vec4(uColor * alpha, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Calcola le posizioni sicure delle torri faro lungo il tracciato in sola lettura.
 * @param {object} trackSurface
 * @param {number} baseSpacingMeters
 * @param {object} profile
 */
export function computeFloodlightTowers(trackSurface, baseSpacingMeters, profile) {
  const { samples, sampleCount, totalLength, barrierHalfWidth, halfTrackWidth } = trackSurface;
  const towers = [];
  if (!samples || sampleCount === 0) return towers;

  const minClearanceExtra = FLOODLIGHT_PARAMS.minSafeTrackOffsetExtra;
  const barrierOffsetExtra = FLOODLIGHT_PARAMS.barrierClearance;

  let nextDist = 14;
  let sideToggle = 1;

  for (let i = 0; i < sampleCount; i++) {
    const s = samples[i];
    const dist = s.distance ?? (i / sampleCount) * totalLength;
    if (dist < nextDist) continue;

    const progress = totalLength > 0 ? dist / totalLength : i / sampleCount;
    const isPitStraight = progress < 0.11 || progress > 0.90;
    const isCornerZone = Boolean(s.hasKerb);

    const localSpacing = isPitStraight
      ? baseSpacingMeters * FLOODLIGHT_PARAMS.pitStraightDensityFactor
      : isCornerZone
        ? baseSpacingMeters * FLOODLIGHT_PARAMS.cornerDensityFactor
        : baseSpacingMeters;

    nextDist = dist + Math.max(26, localSpacing);

    // Sul rettilineo box/partenza posizioniamo fari su entrambi i lati; altrove alternati
    const sides = isPitStraight ? [1, -1] : [sideToggle];
    sideToggle = -sideToggle;

    for (const side of sides) {
      const localBar =
        side > 0
          ? (s.leftBarrierOffset ?? barrierHalfWidth)
          : (s.rightBarrierOffset ?? barrierHalfWidth);
      const distOut = localBar + barrierOffsetExtra;
      const tx = s.x + s.nx * side * distOut;
      const tz = s.z + s.nz * side * distOut;

      // Controllo anti-collisione su tutto il tracciato (es. tornanti o incroci vicini)
      const check = queryTrackSurface(trackSurface, tx, tz);
      const safeBar = check.barrierHalfWidth ?? barrierHalfWidth;
      if (check.absOffset <= safeBar + minClearanceExtra) {
        continue;
      }

      const ty = s.y ?? 0;
      const yaw = Math.atan2(s.x - tx, s.z - tz);
      const trackYaw = Math.atan2(s.tx, s.tz);
      const localHalfW = s.halfWidth ?? halfTrackWidth;

      // Cluster leggermente più caldi sullo sfondo/esterno per Las Vegas e Singapore
      const warmHash = ((i * 2654435761) >>> 0) % 100;
      const isWarmAccent =
        !isPitStraight && warmHash < Math.round((profile.warmAccentRatio || 0) * 100);

      towers.push({
        x: tx,
        y: ty,
        z: tz,
        aimX: s.x,
        aimY: ty + 0.05,
        aimZ: s.z,
        yaw,
        trackYaw,
        localHalfW,
        isPitStraight,
        isWarmAccent,
      });
    }
  }

  return towers;
}

export class TrackFloodlights {
  /**
   * @param {object} trackSurface
   * @param {string} trackId
   * @param {string} [qualityId='medium']
   */
  constructor(trackSurface, trackId, qualityId = DEFAULT_NIGHT_QUALITY) {
    this.trackSurface = trackSurface;
    this.trackId = trackId;
    this.profile = getNightCircuitProfile(trackId);
    this.qualityId = qualityId;
    this.qualityCfg = getNightQualityConfig(qualityId);

    this.group = new THREE.Group();
    this.group.name = `TrackFloodlights_${trackId}`;

    // Calcola layout completo denso alla massima densità, poi filtra per qualità
    this._allTowers = computeFloodlightTowers(
      trackSurface,
      getNightQualityConfig('high').towerSpacingMeters,
      this.profile
    );
    this._activeTowers = [];

    this._instGroup = new THREE.Group();
    this._instGroup.name = 'FloodlightInstances';
    this.group.add(this._instGroup);

    this._poolLights = [];
    this._slotTowerIndices = new Int32Array(MAX_POOL_LIGHTS).fill(-1);
    this._scratchDistances = [];
    this._poolDecalTexture = createLightPoolTexture();
    this._coneUniforms = null;
    this._instResources = [];

    this._createLightPool();
    this._rebuildInstances();
  }

  _createLightPool() {
    for (let i = 0; i < MAX_POOL_LIGHTS; i++) {
      const light = new THREE.SpotLight(
        this.profile.floodlightColor,
        FLOODLIGHT_PARAMS.spotBaseIntensity,
        FLOODLIGHT_PARAMS.spotDistance,
        FLOODLIGHT_PARAMS.spotAngleRad,
        FLOODLIGHT_PARAMS.spotPenumbra,
        FLOODLIGHT_PARAMS.spotDecay
      );
      light.visible = false;
      light.castShadow = false;
      light.shadow.mapSize.width = FLOODLIGHT_PARAMS.shadowMapSize;
      light.shadow.mapSize.height = FLOODLIGHT_PARAMS.shadowMapSize;
      light.shadow.camera.near = 6;
      light.shadow.camera.far = FLOODLIGHT_PARAMS.spotDistance;
      light.shadow.bias = -0.0008;

      this.group.add(light);
      this.group.add(light.target);
      this._poolLights.push(light);
    }
  }

  _disposeInstances() {
    this._instGroup.clear();
    for (const res of this._instResources) {
      res?.dispose?.();
    }
    this._instResources = [];
    this._coneUniforms = null;
    this._poolDecalMat = null;
  }

  _selectTowersForQuality() {
    const highSpacing = getNightQualityConfig('high').towerSpacingMeters;
    const ratio = this.qualityCfg.towerSpacingMeters / highSpacing;
    if (ratio <= 1.05) {
      return this._allTowers;
    }
    const result = [];
    let acc = 0;
    for (let i = 0; i < this._allTowers.length; i++) {
      const t = this._allTowers[i];
      if (t.isPitStraight) {
        // Mantieni sempre densità elevata su partenza/rettilineo box
        if (i % 2 === 0 || ratio < 1.5) result.push(t);
        continue;
      }
      acc += 1;
      if (acc >= ratio) {
        acc -= ratio;
        result.push(t);
      }
    }
    return result;
  }

  _rebuildInstances() {
    this._disposeInstances();
    this._activeTowers = this._selectTowersForQuality();
    this._slotTowerIndices.fill(-1);

    const count = this._activeTowers.length;
    if (count === 0) return;

    const H = FLOODLIGHT_PARAMS.towerHeight;
    const reach = FLOODLIGHT_PARAMS.armReach;

    // 1. Pilone principale + braccio inclinato
    const poleGeo = new THREE.CylinderGeometry(0.16, 0.30, H, 7);
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x242c38,
      roughness: 0.52,
      metalness: 0.72,
    });
    const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, count);
    poleInst.frustumCulled = false;

    const armGeo = new THREE.BoxGeometry(0.28, 0.28, reach);
    const armInst = new THREE.InstancedMesh(armGeo, poleMat, count);
    armInst.frustumCulled = false;

    // 2. Testa portafaro metallica + pannello LED emissivo HDR (alimenta il bloom)
    const housingGeo = new THREE.BoxGeometry(4.4, 1.35, 0.42);
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x161b24,
      roughness: 0.45,
      metalness: 0.65,
    });
    const housingInst = new THREE.InstancedMesh(housingGeo, housingMat, count);
    housingInst.frustumCulled = false;

    const emitterGeo = new THREE.PlaneGeometry(4.1, 1.08);
    // MeshBasicMaterial con colore HDR > 1.0: alimenta selettivamente UnrealBloomPass!
    const emitterMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    });
    const emitterInst = new THREE.InstancedMesh(emitterGeo, emitterMat, count);
    emitterInst.frustumCulled = false;

    // 3. Pozze di luce additive sull'asfalto per tutte le torri (anche quelle lontane)
    let poolDecalInst = null;
    if (this.qualityCfg.showGroundPools) {
      const decalGeo = new THREE.PlaneGeometry(1, 1);
      decalGeo.rotateX(-Math.PI / 2);
      this._poolDecalMat = new THREE.MeshBasicMaterial({
        map: this._poolDecalTexture,
        color: new THREE.Color(this.profile.floodlightColor),
        transparent: true,
        opacity: FLOODLIGHT_PARAMS.poolDecalOpacityDry,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      poolDecalInst = new THREE.InstancedMesh(decalGeo, this._poolDecalMat, count);
      poolDecalInst.renderOrder = 2;
      poolDecalInst.frustumCulled = false;
      this._instResources.push(decalGeo, this._poolDecalMat);
    }

    // 4. Coni volumetrici leggeri (solo Media / Alta)
    let coneInst = null;
    if (this.qualityCfg.showLightCones) {
      const coneGeo = new THREE.ConeGeometry(8.5, 22.0, 14, 1, true);
      coneGeo.translate(0, -11.0, 0);
      this._coneUniforms = {
        uColor: { value: new THREE.Color(this.profile.floodlightColor) },
        uOpacity: { value: FLOODLIGHT_PARAMS.coneOpacityDry },
      };
      const coneMat = new THREE.ShaderMaterial({
        uniforms: this._coneUniforms,
        vertexShader: CONE_VERTEX_SHADER,
        fragmentShader: CONE_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      });
      coneInst = new THREE.InstancedMesh(coneGeo, coneMat, count);
      coneInst.renderOrder = 3;
      coneInst.frustumCulled = false;
      this._instResources.push(coneGeo, coneMat);
    }

    const dummy = new THREE.Object3D();
    const coolHdr = new THREE.Color(this.profile.floodlightColor).multiplyScalar(
      FLOODLIGHT_PARAMS.emitterHdrGain
    );
    const warmHdr = new THREE.Color(this.profile.accentWarmColor).multiplyScalar(
      FLOODLIGHT_PARAMS.emitterHdrGain * 0.92
    );
    const coolDecal = new THREE.Color(this.profile.floodlightColor);
    const warmDecal = new THREE.Color(this.profile.accentWarmColor);
    const dirVec = new THREE.Vector3();
    const upAxis = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion();

    for (let i = 0; i < count; i++) {
      const t = this._activeTowers[i];
      const sinY = Math.sin(t.yaw);
      const cosY = Math.cos(t.yaw);

      // Pilone verticale
      dummy.position.set(t.x, t.y + H * 0.5, t.z);
      dummy.rotation.set(0, t.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poleInst.setMatrixAt(i, dummy.matrix);

      // Braccio a sbalzo verso la pista
      dummy.position.set(t.x + sinY * (reach * 0.45), t.y + H - 0.35, t.z + cosY * (reach * 0.45));
      dummy.rotation.set(0.12, t.yaw, 0);
      dummy.updateMatrix();
      armInst.setMatrixAt(i, dummy.matrix);

      // Testa portafaro inclinata verso l'asfalto
      const headX = t.x + sinY * reach;
      const headY = t.y + H - 0.65;
      const headZ = t.z + cosY * reach;

      dummy.position.set(headX, headY, headZ);
      dummy.rotation.set(0, t.yaw, 0);
      dummy.rotateX(0.56);
      dummy.updateMatrix();
      housingInst.setMatrixAt(i, dummy.matrix);

      // Pannello LED luminoso leggermente avanzato sulla faccia anteriore della testa
      dummy.translateZ(0.24);
      dummy.updateMatrix();
      emitterInst.setMatrixAt(i, dummy.matrix);
      emitterInst.setColorAt(i, t.isWarmAccent ? warmHdr : coolHdr);

      // Pozza di luce sull'asfalto sotto la torre
      if (poolDecalInst) {
        const w = Math.max(14, t.localHalfW * 2.15);
        dummy.position.set(t.aimX, t.aimY + 0.042, t.aimZ);
        dummy.rotation.set(0, t.trackYaw, 0);
        dummy.scale.set(w, 1, FLOODLIGHT_PARAMS.poolDecalLength);
        dummy.updateMatrix();
        poolDecalInst.setMatrixAt(i, dummy.matrix);
        poolDecalInst.setColorAt(i, t.isWarmAccent ? warmDecal : coolDecal);
      }

      // Cono volumetrico orientato dalla testa verso l'asfalto
      if (coneInst) {
        dirVec.set(t.aimX - headX, t.aimY - headY, t.aimZ - headZ);
        const len = Math.max(8, dirVec.length());
        dirVec.normalize().negate(); // Cone apex punta verso +Y, la base scende verso -Y
        quat.setFromUnitVectors(upAxis, dirVec);
        dummy.position.set(headX, headY, headZ);
        dummy.quaternion.copy(quat);
        dummy.scale.set(1.0, len / 22.0, 1.0);
        dummy.updateMatrix();
        coneInst.setMatrixAt(i, dummy.matrix);
      }
    }

    poleInst.instanceMatrix.needsUpdate = true;
    armInst.instanceMatrix.needsUpdate = true;
    housingInst.instanceMatrix.needsUpdate = true;
    emitterInst.instanceMatrix.needsUpdate = true;
    if (emitterInst.instanceColor) emitterInst.instanceColor.needsUpdate = true;

    this._instGroup.add(poleInst, armInst, housingInst, emitterInst);
    this._instResources.push(poleGeo, poleMat, armGeo, housingGeo, housingMat, emitterGeo, emitterMat);

    if (poolDecalInst) {
      poolDecalInst.instanceMatrix.needsUpdate = true;
      if (poolDecalInst.instanceColor) poolDecalInst.instanceColor.needsUpdate = true;
      this._instGroup.add(poolDecalInst);
    }
    if (coneInst) {
      coneInst.instanceMatrix.needsUpdate = true;
      this._instGroup.add(coneInst);
    }

    this._applyLightPoolBudget();
  }

  _applyLightPoolBudget() {
    const activeCount = Math.min(MAX_POOL_LIGHTS, this.qualityCfg.activeSpotLights);
    const shadowCount = Math.min(activeCount, this.qualityCfg.shadowLights);

    for (let i = 0; i < MAX_POOL_LIGHTS; i++) {
      const light = this._poolLights[i];
      if (i >= activeCount) {
        light.visible = false;
        light.castShadow = false;
        this._slotTowerIndices[i] = -1;
      } else {
        light.castShadow = i < shadowCount;
      }
    }
  }

  setQuality(qualityId) {
    const nextCfg = getNightQualityConfig(qualityId);
    if (nextCfg.id === this.qualityId) return;
    this.qualityId = nextCfg.id;
    this.qualityCfg = nextCfg;
    this._rebuildInstances();
  }

  /**
   * Aggiorna il pool dinamico di SpotLight reali in base alla posizione della vettura/camera.
   * Zero allocazioni per frame dopo il riscaldamento.
   * @param {{ x: number, y?: number, z: number }} focusPos
   * @param {number} [heading=0]
   * @param {boolean} [isRain=false]
   */
  update(focusPos, heading = 0, isRain = false) {
    if (!this.group.visible) return;

    if (this._poolDecalMat) {
      this._poolDecalMat.opacity = isRain
        ? FLOODLIGHT_PARAMS.poolDecalOpacityRain
        : FLOODLIGHT_PARAMS.poolDecalOpacityDry;
    }
    if (this._coneUniforms) {
      this._coneUniforms.uOpacity.value = isRain
        ? FLOODLIGHT_PARAMS.coneOpacityRain
        : FLOODLIGHT_PARAMS.coneOpacityDry;
    }

    const towers = this._activeTowers;
    const n = towers.length;
    const activeSlots = Math.min(MAX_POOL_LIGHTS, this.qualityCfg.activeSpotLights, n);
    if (activeSlots === 0 || !focusPos) return;

    // Punto di attenzione spostato 26 m davanti alla vettura per illuminare staccate e curve in arrivo
    const fx = focusPos.x + Math.sin(heading) * 26;
    const fz = focusPos.z + Math.cos(heading) * 26;

    if (this._scratchDistances.length !== n) {
      this._scratchDistances = Array.from({ length: n }, (_, idx) => ({ idx, d2: 0 }));
    }
    for (let i = 0; i < n; i++) {
      const t = towers[i];
      const dx = t.aimX - fx;
      const dz = t.aimZ - fz;
      const entry = this._scratchDistances[i];
      entry.idx = i;
      entry.d2 = dx * dx + dz * dz;
    }

    // Selezione parziale O(N * K) per le K torri più vicine (K <= 12, N ~ 80-110)
    for (let k = 0; k < activeSlots; k++) {
      let best = k;
      let bestD2 = this._scratchDistances[k].d2;
      for (let j = k + 1; j < n; j++) {
        if (this._scratchDistances[j].d2 < bestD2) {
          bestD2 = this._scratchDistances[j].d2;
          best = j;
        }
      }
      if (best !== k) {
        const tmp = this._scratchDistances[k];
        this._scratchDistances[k] = this._scratchDistances[best];
        this._scratchDistances[best] = tmp;
      }
    }

    // Sticky slot assignment: mantiene le torri già assegnate sul loro slot evitando flicker ombre
    const wantedSet = new Set();
    for (let k = 0; k < activeSlots; k++) {
      wantedSet.add(this._scratchDistances[k].idx);
    }

    const assignedTowers = new Set();
    for (let slot = 0; slot < activeSlots; slot++) {
      const curIdx = this._slotTowerIndices[slot];
      if (curIdx >= 0 && wantedSet.has(curIdx)) {
        assignedTowers.add(curIdx);
      } else {
        this._slotTowerIndices[slot] = -1;
      }
    }

    let cursor = 0;
    for (let slot = 0; slot < activeSlots; slot++) {
      if (this._slotTowerIndices[slot] !== -1) continue;
      while (cursor < activeSlots && assignedTowers.has(this._scratchDistances[cursor].idx)) {
        cursor++;
      }
      if (cursor < activeSlots) {
        const nextIdx = this._scratchDistances[cursor].idx;
        this._slotTowerIndices[slot] = nextIdx;
        assignedTowers.add(nextIdx);
        cursor++;
      }
    }

    const H = FLOODLIGHT_PARAMS.towerHeight - 0.7;
    const reach = FLOODLIGHT_PARAMS.armReach;
    const intensity =
      FLOODLIGHT_PARAMS.spotBaseIntensity *
      (isRain ? FLOODLIGHT_PARAMS.spotRainIntensityBoost : 1.0);

    for (let slot = 0; slot < activeSlots; slot++) {
      const tIdx = this._slotTowerIndices[slot];
      const light = this._poolLights[slot];
      if (tIdx < 0 || tIdx >= n) {
        light.visible = false;
        continue;
      }
      const t = towers[tIdx];
      const headX = t.x + Math.sin(t.yaw) * reach;
      const headZ = t.z + Math.cos(t.yaw) * reach;

      light.position.set(headX, t.y + H, headZ);
      light.target.position.set(t.aimX, t.aimY, t.aimZ);
      light.target.updateMatrixWorld();
      light.color.setHex(t.isWarmAccent ? this.profile.accentWarmColor : this.profile.floodlightColor);
      light.intensity = intensity;
      light.visible = true;
    }
  }

  getTowerCount() {
    return this._activeTowers.length;
  }

  getTowers() {
    return this._activeTowers;
  }

  dispose() {
    this._disposeInstances();
    this._poolDecalTexture?.dispose?.();
    this._poolDecalTexture = null;
    for (const light of this._poolLights) {
      light.shadow?.map?.dispose?.();
      light.dispose?.();
    }
    this._poolLights = [];
  }
}
