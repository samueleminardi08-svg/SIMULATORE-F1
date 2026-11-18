/**
 * Minimappa 2D del tracciato in basso a sinistra (HUD).
 * Mostra il disegno fedele della pista suddivisa nei 3 settori (S1, S2, S3)
 * con colori reattivi (viola/verde/giallo) e tacche di confine, oltre a un
 * puntino e una freccia direzionale per ogni pilota presente in WorldState.
 */

import { getSectorIndex } from '../race/TimingSystem.js';

const PENDING_SECTOR_COLORS = ['#60a5fa', '#cbd5e1', '#94a3b8'];

const STATUS_COLORS = {
  purple: '#a855f7',
  green: '#22c55e',
  yellow: '#eab308',
};

export class TrackMapHud {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {ReturnType<import('../tracks/TrackSurface.js').createTrackSurface>} trackSurface
   * @param {{ size?: number, padding?: number }} [options]
   */
  constructor(canvas, trackSurface, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = options.size ?? 186;
    this.padding = options.padding ?? 18;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = this.size * this.dpr;
    this.canvas.height = this.size * this.dpr;
    this.canvas.style.width = `${this.size}px`;
    this.canvas.style.height = `${this.size}px`;

    this.trackSurface = null;
    this._scale = 1;
    this._offsetX = 0;
    this._offsetY = 0;
    this._maxX = 0;
    this._maxZ = 0;

    this._sectorBuckets = [[], [], []];
    this._sectorBoundaries = [];
    this._sectorLabelCoords = [];

    this._staticBaseCanvas = document.createElement('canvas');
    this._staticBaseCanvas.width = this.canvas.width;
    this._staticBaseCanvas.height = this.canvas.height;

    if (trackSurface) {
      this.setTrackSurface(trackSurface);
    }
  }

  /**
   * Aggiorna il tracciato visualizzato nella minimappa, calcola i 3 settori e prepara la base.
   */
  setTrackSurface(trackSurface) {
    this.trackSurface = trackSurface;
    if (!trackSurface) return;

    const { minX, maxX, minZ, maxZ } = trackSurface.bounds;
    this._maxX = maxX;
    this._maxZ = maxZ;

    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);
    const drawable = this.size - this.padding * 2;

    this._scale = Math.min(drawable / spanX, drawable / spanZ);
    const drawnWidth = spanX * this._scale;
    const drawnHeight = spanZ * this._scale;

    this._offsetX = (this.size - drawnWidth) * 0.5;
    this._offsetY = (this.size - drawnHeight) * 0.5;

    this._computeSectorGeometry();
    this._renderStaticBase();
  }

  _worldToMap(x, z) {
    return {
      x: this._offsetX + (this._maxX - x) * this._scale,
      y: this._offsetY + (this._maxZ - z) * this._scale,
    };
  }

  _computeSectorGeometry() {
    const { samples, sampleCount, totalLength, sectorSplits } = this.trackSurface;
    const splits = sectorSplits || [0.33, 0.66, 1.0];

    const startSampleIdx = samples.findIndex((s) => Math.abs(s.x) < 5 && Math.abs(s.z) < 12);
    const baseIdx = startSampleIdx >= 0 ? startSampleIdx : 0;
    const startDist = samples[baseIdx].distance;

    // Ordina i campioni a partire dalla linea del traguardo e li suddivide in 3 gruppi contigui
    this._sectorBuckets = [[], [], []];
    for (let k = 0; k <= sampleCount; k++) {
      const idx = (baseIdx + k) % sampleCount;
      const s = samples[idx];
      const relProgress =
        k === sampleCount
          ? 0.9999
          : ((s.distance - startDist + totalLength) % totalLength) / totalLength;
      const secIdx = getSectorIndex(relProgress, splits);
      const mapPt = this._worldToMap(s.x, s.z);
      this._sectorBuckets[secIdx].push({ ...mapPt, sample: s, progress: relProgress });
    }

    // Collega la fine di ciascun settore al primo punto del settore successivo per continuità
    for (let sec = 0; sec < 3; sec++) {
      const nextBucket = this._sectorBuckets[(sec + 1) % 3];
      if (this._sectorBuckets[sec].length > 0 && nextBucket.length > 0) {
        this._sectorBuckets[sec].push(nextBucket[0]);
      }
    }

    // Punti di confine dei 3 settori (S1/S2, S2/S3, Traguardo S3/S1)
    const boundaries = [
      { frac: 0, label: 'SF', isStartFinish: true },
      { frac: splits[0], label: 'S1|S2', isStartFinish: false },
      { frac: splits[1], label: 'S2|S3', isStartFinish: false },
    ];
    this._sectorBoundaries = boundaries.map((b) => {
      const targetIdx = (baseIdx + Math.round(b.frac * sampleCount)) % sampleCount;
      const s = samples[targetIdx];
      const pt = this._worldToMap(s.x, s.z);
      const nLen = Math.max(1e-6, Math.hypot(s.nx, s.nz));
      return {
        x: pt.x,
        y: pt.y,
        mnx: -s.nx / nLen,
        mnz: -s.nz / nLen,
        isStartFinish: b.isStartFinish,
      };
    });

    // Posizione etichette S1, S2, S3 spostate leggermente all'esterno del centro di ciascun settore
    const mapCenter = { x: this.size * 0.5, y: this.size * 0.5 };
    this._sectorLabelCoords = this._sectorBuckets.map((bucket, idx) => {
      if (bucket.length === 0) return { x: 0, y: 0, label: `S${idx + 1}` };
      const mid = bucket[Math.floor(bucket.length * 0.5)];
      const vx = mid.x - mapCenter.x;
      const vy = mid.y - mapCenter.y;
      const vLen = Math.max(1, Math.hypot(vx, vy));
      return {
        x: mid.x + (vx / vLen) * 12,
        y: mid.y + (vy / vLen) * 12,
        label: `S${idx + 1}`,
      };
    });
  }

  _renderStaticBase() {
    const sCtx = this._staticBaseCanvas.getContext('2d');
    sCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    sCtx.clearRect(0, 0, this.size, this.size);

    const samples = this.trackSurface.samples;
    if (!samples || samples.length === 0) return;

    sCtx.lineJoin = 'round';
    sCtx.lineCap = 'round';
    sCtx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const pt = this._worldToMap(samples[i].x, samples[i].z);
      if (i === 0) sCtx.moveTo(pt.x, pt.y);
      else sCtx.lineTo(pt.x, pt.y);
    }
    sCtx.closePath();
    sCtx.strokeStyle = 'rgba(15, 23, 42, 0.94)';
    sCtx.lineWidth = 8.5;
    sCtx.stroke();
  }

  _drawSectors(ctx, timing) {
    const showLastLapTail =
      timing &&
      timing.currentLapTime < 3.5 &&
      Array.isArray(timing.lastLapSectorStatuses);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (let sec = 0; sec < 3; sec++) {
      const bucket = this._sectorBuckets[sec];
      if (!bucket || bucket.length < 2) continue;

      let status = timing?.currentSectorStatuses?.[sec] || 'pending';
      if (status === 'pending' && showLastLapTail) {
        status = timing.lastLapSectorStatuses[sec] || 'pending';
      }

      const isActive = timing?.lapStarted && timing.currentSectorIndex === sec;
      const strokeColor = STATUS_COLORS[status] || PENDING_SECTOR_COLORS[sec];

      ctx.beginPath();
      for (let i = 0; i < bucket.length; i++) {
        if (i === 0) ctx.moveTo(bucket[i].x, bucket[i].y);
        else ctx.lineTo(bucket[i].x, bucket[i].y);
      }
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isActive ? 5.2 : 3.8;
      ctx.globalAlpha = status !== 'pending' || isActive ? 0.98 : 0.65;
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;

    // Tacche di separazione tra S1, S2 e S3 + Linea di partenza/traguardo
    for (const b of this._sectorBoundaries) {
      const halfLen = b.isStartFinish ? 6.5 : 5.2;
      ctx.beginPath();
      ctx.moveTo(b.x - b.mnx * halfLen, b.y - b.mnz * halfLen);
      ctx.lineTo(b.x + b.mnx * halfLen, b.y + b.mnz * halfLen);
      ctx.strokeStyle = b.isStartFinish ? '#e10600' : '#ffffff';
      ctx.lineWidth = b.isStartFinish ? 2.6 : 1.8;
      ctx.stroke();
    }

    // Etichette S1, S2, S3 sulla minimappa
    ctx.font = '700 9px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let sec = 0; sec < this._sectorLabelCoords.length; sec++) {
      const lbl = this._sectorLabelCoords[sec];
      let status = timing?.currentSectorStatuses?.[sec] || 'pending';
      if (status === 'pending' && showLastLapTail) {
        status = timing.lastLapSectorStatuses[sec] || 'pending';
      }
      const isActive = timing?.lapStarted && timing.currentSectorIndex === sec;
      ctx.fillStyle = STATUS_COLORS[status] || (isActive ? '#ffffff' : '#cbd5e1');
      ctx.fillText(lbl.label, lbl.x, lbl.y);
    }
  }

  _drawDriverMarker(ctx, carState, isLocalPlayer) {
    const pos = this._worldToMap(carState.x, carState.z);
    const fillColor = isLocalPlayer ? '#e10600' : (carState.color || '#38bdf8');
    const dotRadius = isLocalPlayer ? 4.4 : 3.5;

    const dirX = -Math.sin(carState.heading);
    const dirY = -Math.cos(carState.heading);
    const angle = Math.atan2(dirY, dirX);

    ctx.save();
    ctx.translate(pos.x, pos.y);

    // Freccia direzionale davanti al puntino
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(dotRadius + 7.5, 0);
    ctx.lineTo(dotRadius + 1.0, -3.6);
    ctx.lineTo(dotRadius + 2.4, 0);
    ctx.lineTo(dotRadius + 1.0, 3.6);
    ctx.closePath();
    ctx.fillStyle = isLocalPlayer ? '#facc15' : fillColor;
    ctx.fill();
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
    ctx.restore();

    // Puntino sulla posizione del pilota
    ctx.beginPath();
    ctx.arc(0, 0, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.lineWidth = isLocalPlayer ? 1.8 : 1.2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Aggiorna la minimappa disegnando i 3 settori e tutti i piloti presenti in WorldState.
   * @param {import('../core/WorldState.js').WorldState} worldState
   * @param {string} localPlayerId
   */
  render(worldState, localPlayerId) {
    if (!this.trackSurface || !worldState) return;

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this._staticBaseCanvas, 0, 0);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const localCar = worldState.getCar(localPlayerId);
    this._drawSectors(ctx, localCar?.timing || null);

    const cars = Object.values(worldState.cars);
    for (const car of cars) {
      if (car.id !== localPlayerId) {
        this._drawDriverMarker(ctx, car, false);
      }
    }
    if (localCar) {
      this._drawDriverMarker(ctx, localCar, true);
    }
  }
}
