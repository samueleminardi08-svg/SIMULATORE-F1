/**
 * Gestore della Schermata di Caricamento cinematografica F1 (Step 2 — PIANO PRE STEP 4).
 *
 * Maschera integralmente la preparazione del circuito (applyActiveTrack), il caricamento
 * delle texture PBR/HDRI/GLB (con timeout massimo di sicurezza di 3.5 s) e i primi frame
 * di compilazione shader WebGL, dissolvendo poi dolcemente l'overlay sulla pista pronta.
 */

import { assetManager3D } from '../rendering/AssetManager3D.js';
import { getPitLaneConfig } from '../tracks/PitLaneConfig.js';
import { getSkyPresetById } from '../rendering/SkyPresets.js';
import { getTrackBiomeConfig } from '../tracks/TrackBiomes.js';

function nextAnimationFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 16);
    }
  });
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class LoadingScreenManager {
  constructor() {
    this.rootEl = typeof document !== 'undefined' ? document.getElementById('f1-loading-screen') : null;
    this.gpNameEl = typeof document !== 'undefined' ? document.getElementById('f1-loading-gp-name') : null;
    this.circuitMetaEl = typeof document !== 'undefined' ? document.getElementById('f1-loading-circuit-meta') : null;
    this.modeBadgeEl = typeof document !== 'undefined' ? document.getElementById('f1-loading-mode-badge') : null;
    this.skyBadgeEl = typeof document !== 'undefined' ? document.getElementById('f1-loading-sky-badge') : null;
    this.pitLimitBadgeEl = typeof document !== 'undefined' ? document.getElementById('f1-loading-pit-badge') : null;
    this.statusEl = typeof document !== 'undefined' ? document.getElementById('f1-loading-status') : null;
    this.pctEl = typeof document !== 'undefined' ? document.getElementById('f1-loading-pct') : null;
    this.barFillEl = typeof document !== 'undefined' ? document.getElementById('f1-loading-bar-fill') : null;
    this.minimapCanvas = typeof document !== 'undefined' ? document.getElementById('f1-loading-minimap') : null;

    this.isLoading = false;
    this._runToken = 0;
  }

  _setProgress(pct, statusText) {
    const safePct = Math.max(0, Math.min(100, Math.round(pct)));
    if (this.barFillEl) {
      this.barFillEl.style.transform = `scaleX(${(safePct / 100).toFixed(3)})`;
    }
    if (this.pctEl) {
      this.pctEl.textContent = `${safePct}%`;
    }
    if (this.statusEl && statusText) {
      this.statusEl.textContent = statusText;
    }
  }

  _drawTrackPreview(trackData) {
    if (!this.minimapCanvas || !trackData?.controlPoints?.length) return;
    const ctx = this.minimapCanvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const cssW = 190;
    const cssH = 140;
    this.minimapCanvas.width = Math.round(cssW * dpr);
    this.minimapCanvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const pts = trackData.controlPoints;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of pts) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[2] < minZ) minZ = p[2];
      if (p[2] > maxZ) maxZ = p[2];
    }

    const pad = 18;
    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);
    const scale = Math.min((cssW - pad * 2) / spanX, (cssH - pad * 2) / spanZ);
    const ox = (cssW - spanX * scale) * 0.5;
    const oy = (cssH - spanZ * scale) * 0.5;

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = ox + (pts[i][0] - minX) * scale;
      const y = oy + (pts[i][2] - minZ) * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // Alone morbido rosso F1 + profilo circuito nitido
    ctx.strokeStyle = 'rgba(225, 6, 0, 0.35)';
    ctx.lineWidth = 8.5;
    ctx.stroke();

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 3.2;
    ctx.stroke();

    // Punto linea di partenza/traguardo
    const sx = ox + (pts[0][0] - minX) * scale;
    const sy = oy + (pts[0][2] - minZ) * scale;
    ctx.beginPath();
    ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#e10600';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  _populateHeader(trackData, options = {}) {
    const pitCfg = getPitLaneConfig(trackData?.id);
    const biome = getTrackBiomeConfig(trackData);

    if (this.gpNameEl) {
      const roundTag = trackData?.round ? `R${String(trackData.round).padStart(2, '0')} • ` : '';
      this.gpNameEl.textContent = `${roundTag}${trackData?.gpName || trackData?.name || 'Gran Premio F1 2026'}`;
    }
    if (this.circuitMetaEl) {
      const lenKm = trackData?.officialLength
        ? `${(trackData.officialLength / 1000).toFixed(3)} KM`
        : '';
      const loc = [trackData?.name, trackData?.country, lenKm].filter(Boolean).join(' • ');
      this.circuitMetaEl.textContent = loc;
    }
    if (this.modeBadgeEl) {
      this.modeBadgeEl.textContent = options.modeLabel || 'SESSIONE IN PISTA';
    }
    if (this.skyBadgeEl) {
      let skyText = options.skyLabel || '';
      if (!skyText) {
        if (options.skyPresetId && options.skyPresetId !== 'auto' && options.skyPresetId !== 'random') {
          skyText = getSkyPresetById(options.skyPresetId)?.label || '';
        } else if (options.skyPresetId === 'random') {
          skyText = 'Meteo Casuale';
        } else {
          skyText = biome.isNight ? 'Notte Serena' : 'Tramonto';
        }
      }
      this.skyBadgeEl.textContent = skyText;
    }
    if (this.pitLimitBadgeEl) {
      this.pitLimitBadgeEl.textContent = `PIT LIMIT ${pitCfg.speedLimitKmh} KM/H`;
    }

    this._drawTrackPreview(trackData);
  }

  async _awaitCoreAssets(trackData, skyPresetId, renderer = null, maxTimeoutMs = 3500) {
    const biome = getTrackBiomeConfig(trackData);
    const disposeSet = (set) => {
      if (!set) return;
      set.map?.dispose?.();
      set.normalMap?.dispose?.();
      set.roughnessMap?.dispose?.();
    };
    const work = (async () => {
      try {
        await assetManager3D.loadManifest();
        const tasks = [
          assetManager3D
            .loadPBRTextureSet(biome.asphaltTextureId, { repeatX: 1, repeatY: 1 })
            .then(disposeSet),
          assetManager3D
            .loadPBRTextureSet('asphalt_pit_lane', { repeatX: 1, repeatY: 1 })
            .then(disposeSet),
          assetManager3D.loadCarModel('ferrari'),
        ];
        const hdriKey =
          skyPresetId && skyPresetId !== 'auto' && skyPresetId !== 'random'
            ? getSkyPresetById(skyPresetId)?.hdriKey || (biome.isNight ? 'night_clear' : biome.hdriDry)
            : biome.isNight
              ? 'night_clear'
              : 'sunset';
        if (hdriKey && renderer) {
          tasks.push(assetManager3D.loadHDRIBundle(hdriKey, renderer));
        }
        await Promise.allSettled(tasks);
      } catch {
        // Non blocca mai l'ingresso in pista su reti lente o offline
      }
    })();

    await Promise.race([work, sleepMs(maxTimeoutMs)]);
  }

  /**
   * Esegue una transizione completa con schermata di caricamento dedicata.
   * @param {{
   *   trackData: object,
   *   modeLabel?: string,
   *   skyPresetId?: string,
   *   skyLabel?: string,
   *   renderer?: import('three').WebGLRenderer | null,
   *   prepareFn: () => void | Promise<void>,
   *   onBeforeReveal?: () => void,
   *   maxTimeoutMs?: number,
   * }} params
   */
  async runTransition({
    trackData,
    modeLabel = 'SESSIONE IN PISTA',
    skyPresetId = null,
    skyLabel = '',
    renderer = null,
    prepareFn,
    onBeforeReveal = null,
    onAfterReveal = null,
    maxTimeoutMs = 3500,
  }) {
    const token = ++this._runToken;

    if (!this.rootEl) {
      if (prepareFn) await prepareFn();
      if (onBeforeReveal) onBeforeReveal();
      if (onAfterReveal) onAfterReveal();
      return;
    }

    this.isLoading = true;
    this._populateHeader(trackData, { modeLabel, skyPresetId, skyLabel });
    this._setProgress(12, 'Costruzione circuito & pit lane…');

    // Mostra la schermata di caricamento con fade-in immediato (~180 ms)
    this.rootEl.classList.remove('is-hiding');
    this.rootEl.classList.add('is-visible');
    this.rootEl.setAttribute('aria-hidden', 'false');

    // Cede almeno 2 frame al browser per dipingere la schermata prima del lavoro pesante
    await nextAnimationFrame();
    await nextAnimationFrame();
    await sleepMs(90);
    if (token !== this._runToken) return;

    this._setProgress(38, 'Costruzione circuito & 11 box scuderie…');
    if (prepareFn) {
      await prepareFn();
    }
    if (token !== this._runToken) return;

    this._setProgress(64, 'Caricamento texture PBR & cielo 2K…');
    await this._awaitCoreAssets(trackData, skyPresetId, renderer, maxTimeoutMs);
    if (token !== this._runToken) return;

    this._setProgress(88, 'Preparazione monoposto & illuminazione…');
    await nextAnimationFrame();
    await nextAnimationFrame();
    if (token !== this._runToken) return;

    if (onBeforeReveal) {
      onBeforeReveal();
    }
    this._setProgress(100, 'Pronto in pista!');
    await sleepMs(130);
    if (token !== this._runToken) return;

    // Dissolvenza dolce (350 ms) verso la pista già renderizzata
    this.rootEl.classList.add('is-hiding');
    this.rootEl.classList.remove('is-visible');
    this.isLoading = false;
    if (onAfterReveal) {
      onAfterReveal();
    }

    await sleepMs(360);
    if (token !== this._runToken) return;
    this.rootEl.classList.remove('is-hiding');
    this.rootEl.setAttribute('aria-hidden', 'true');
  }

  hideImmediate() {
    this._runToken++;
    this.isLoading = false;
    if (!this.rootEl) return;
    this.rootEl.classList.remove('is-visible', 'is-hiding');
    this.rootEl.setAttribute('aria-hidden', 'true');
  }
}
