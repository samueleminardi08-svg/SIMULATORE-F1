/**
 * Minimappa 2D dedicata esclusivamente alla Pit Lane (Step 2 — PIANO PRE STEP 4).
 *
 * - Posizionata in alto a destra subito a sinistra della minimappa principale.
 * - Visibile con transizione fluida solo quando il giocatore è nei box o in pit lane.
 * - Orienta la pit lane in verticale pulito (INGRESSO in basso → 11 BOX → USCITA in alto),
 *   rispettando il lato reale (box a destra o a sinistra rispetto al tracciato principale),
 *   evidenzia il proprio box in verde/oro pulsante e mostra tutte le vetture in transito
 *   con frecce direzionali e allerta rossa anti unsafe-release.
 * - Costo GPU/CPU nullo quando nascosta.
 */

import { queryPitLane, signedArcDelta } from '../tracks/PitLaneGeometry.js';

const PIT_MAP_ACTIVE_STATES = new Set([
  'IN_GARAGE',
  'EXITING_GARAGE',
  'PIT_EXIT_LANE',
  'PIT_ENTRY_LANE',
  'PIT_STOPPING',
  'AUTO_BOX_STOP',
  'IN_PIT_BOX',
  'AUTO_PARKING',
  'PARKED_STAGE_END',
]);

const TEAM_SHORT_TAGS = {
  mclaren: 'MCL',
  ferrari: 'FER',
  red_bull: 'RBR',
  mercedes: 'MER',
  aston_martin: 'AST',
  williams: 'WIL',
  alpine: 'ALP',
  racing_bulls: 'VCB',
  haas: 'HAA',
  audi: 'AUD',
  cadillac: 'CAD',
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export class PitLaneMapHud {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement | null} containerEl
   * @param {ReturnType<import('../tracks/TrackSurface.js').createTrackSurface> | null} trackSurface
   * @param {{ width?: number, height?: number }} [options]
   */
  constructor(canvas, containerEl, trackSurface = null, options = {}) {
    this.canvas = canvas;
    this.containerEl = containerEl || null;
    this.speedBadgeEl =
      typeof document !== 'undefined' ? document.getElementById('pit-map-limit-badge') : null;
    this.ctx = canvas?.getContext?.('2d') || null;
    this.width = options.width ?? 148;
    this.height = options.height ?? 220;
    this.dpr =
      typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;

    if (this.canvas) {
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
    }

    this.trackSurface = null;
    this.isVisible = false;
    this._lastStaticSig = '';
    this._pulsePhase = 0;
    this._lastRenderMs = 0;

    this._staticBaseCanvas =
      typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (this._staticBaseCanvas) {
      this._staticBaseCanvas.width = Math.round(this.width * this.dpr);
      this._staticBaseCanvas.height = Math.round(this.height * this.dpr);
    }

    // Geometria layout 2D pre-calcolata
    this._padTop = 18;
    this._padBottom = 18;
    this._padSide = 10;

    if (trackSurface) {
      this.setTrackSurface(trackSurface);
    }
  }

  setTrackSurface(trackSurface) {
    this.trackSurface = trackSurface || null;
    this._lastStaticSig = '';
    const pit = this.trackSurface?.pitLane;
    if (this.speedBadgeEl && pit) {
      this.speedBadgeEl.textContent = `${pit.speedLimitKmh} KM/H`;
    }
  }

  setVisible(visible) {
    const next = Boolean(visible);
    if (next === this.isVisible) return;
    this.isVisible = next;
    if (this.containerEl) {
      this.containerEl.classList.toggle('is-visible', next);
      this.containerEl.setAttribute('aria-hidden', next ? 'false' : 'true');
    }
  }

  /**
   * Determina se la minimappa pit lane debba essere visibile nello stato corrente.
   */
  shouldBeVisible(worldState, localCar) {
    if (!this.trackSurface?.pitLane || !localCar) return false;
    if (worldState?.forceShowPitMap) return true;
    if (localCar.surface === 'pitlane') return true;
    if (localCar.pitState && PIT_MAP_ACTIVE_STATES.has(localCar.pitState)) return true;
    if (worldState?.pitGuideActive || localCar.pitGuideActive || localCar.pitStopRequested) {
      return true;
    }
    return false;
  }

  /**
   * Converte coordinate locali pit (sMeters, lateralFromTrackCenter) nel canvas 2D verticale:
   * - Y: INGRESSO in basso (height - padBottom) → USCITA in alto (padTop)
   * - X: rispetta il lato reale della pit lane (box a destra se side='right', a sinistra se side='left')
   */
  _pitCoordsToCanvas(pit, sMeters, lateralFromTrackCenter) {
    const spanS = Math.max(1, pit.exitEndM - pit.entryStartM);
    const tS = clamp((sMeters - pit.entryStartM) / spanS, 0, 1);
    const y = this.height - this._padBottom - tS * (this.height - this._padTop - this._padBottom);

    // Intervallo laterale mappato: [0 (asse pista) .. garageBack + 1]
    const maxLat = Math.max(18, pit.garageBackNominal + 1.5);
    const tLat = clamp(lateralFromTrackCenter / maxLat, 0, 1);
    const innerW = this.width - this._padSide * 2;
    const x =
      pit.side === 'left'
        ? this.width - this._padSide - tLat * innerW
        : this._padSide + tLat * innerW;

    return { x, y };
  }

  _ensureStaticBase(pit, ownTeamId) {
    if (!this._staticBaseCanvas || !pit) return;
    const sig = `${pit.trackId}:${ownTeamId || ''}`;
    if (sig === this._lastStaticSig) return;
    this._lastStaticSig = sig;

    const ctx = this._staticBaseCanvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    const isLeft = pit.side === 'left';
    const topY = this._padTop;
    const botY = this.height - this._padBottom;

    // 1. Fascia rettilineo pista principale adiacente
    const trackEdge0 = this._pitCoordsToCanvas(pit, pit.entryStartM, 0);
    const trackEdgeHw = this._pitCoordsToCanvas(pit, pit.entryStartM, pit.samples[0]?.trackHalfWidth ?? 7);
    const mainMinX = Math.min(trackEdge0.x, trackEdgeHw.x);
    const mainW = Math.max(10, Math.abs(trackEdgeHw.x - trackEdge0.x));

    ctx.fillStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.fillRect(mainMinX, topY - 6, mainW, botY - topY + 12);

    // Linea bordo pista principale
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(trackEdgeHw.x, topY - 6);
    ctx.lineTo(trackEdgeHw.x, botY + 6);
    ctx.stroke();

    // 2. Poligono asfalto pit lane (entry + fast/working lane + exit)
    ctx.beginPath();
    for (let i = 0; i < pit.samples.length; i++) {
      const s = pit.samples[i];
      const p = this._pitCoordsToCanvas(pit, s.sMeters, s.innerEdge);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    for (let i = pit.samples.length - 1; i >= 0; i--) {
      const s = pit.samples[i];
      const p = this._pitCoordsToCanvas(pit, s.sMeters, s.outerEdge);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(30, 41, 59, 0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 3. Muretto Pit Wall separatore (rosso/grigio)
    const wallStart = this._pitCoordsToCanvas(pit, pit.pitWallStartM, (pit.pitWallInnerNominal + pit.pitWallOuterNominal) * 0.5);
    const wallEnd = this._pitCoordsToCanvas(pit, pit.pitWallEndM, (pit.pitWallInnerNominal + pit.pitWallOuterNominal) * 0.5);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(wallStart.x, wallStart.y);
    ctx.lineTo(wallEnd.x, wallEnd.y);
    ctx.stroke();

    // 4. Linea bianca tratteggiata separatrice Fast Lane / Working Lane
    const fastDivStart = this._pitCoordsToCanvas(pit, pit.speedStartM, pit.fastLaneOffsetNominal + pit.config.fastLaneWidth * 0.5);
    const fastDivEnd = this._pitCoordsToCanvas(pit, pit.speedEndM, pit.fastLaneOffsetNominal + pit.config.fastLaneWidth * 0.5);
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(241, 245, 249, 0.52)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fastDivStart.x, fastDivStart.y);
    ctx.lineTo(fastDivEnd.x, fastDivEnd.y);
    ctx.stroke();
    ctx.restore();

    // 5. Linee di inizio (rossa/bianca) e fine (verde/bianca) limite velocità
    const drawLimitLine = (sM, color) => {
      const a = this._pitCoordsToCanvas(pit, sM, pit.pitWallOuterNominal);
      const b = this._pitCoordsToCanvas(pit, sM, pit.garageFrontNominal);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };
    drawLimitLine(pit.speedStartM, '#ef4444');
    drawLimitLine(pit.speedEndM, '#22c55e');

    // 6. Gli 11 Box Scuderie con colore ufficiale e codice breve
    ctx.font = '700 7.5px "Chakra Petch", sans-serif';
    ctx.textBaseline = 'middle';

    for (const g of pit.garages) {
      const pTop = this._pitCoordsToCanvas(pit, g.sEndM, g.garageFrontOffset);
      const pBot = this._pitCoordsToCanvas(pit, g.sStartM, g.garageBackOffset);
      const rx = Math.min(pTop.x, pBot.x);
      const ry = Math.min(pTop.y, pBot.y);
      const rw = Math.max(16, Math.abs(pBot.x - pTop.x));
      const rh = Math.max(7, Math.abs(pBot.y - pTop.y) - 1.4);
      const isOwn = g.teamId === ownTeamId;

      ctx.fillStyle = isOwn ? 'rgba(16, 185, 129, 0.28)' : 'rgba(15, 23, 42, 0.92)';
      ctx.fillRect(rx, ry + 0.7, rw, rh);

      // Barra colore scuderia lato working lane
      const accentW = 3.2;
      const accentX = isLeft ? rx + rw - accentW : rx;
      ctx.fillStyle = g.primaryColor || '#94a3b8';
      ctx.fillRect(accentX, ry + 0.7, accentW, rh);

      ctx.strokeStyle = isOwn ? '#4ade80' : 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = isOwn ? 1.4 : 0.7;
      ctx.strokeRect(rx, ry + 0.7, rw, rh);

      const tag = TEAM_SHORT_TAGS[g.teamId] || g.teamId.slice(0, 3).toUpperCase();
      ctx.fillStyle = isOwn ? '#fef08a' : '#cbd5e1';
      ctx.textAlign = 'center';
      const textX = isLeft ? rx + (rw - accentW) * 0.5 : rx + accentW + (rw - accentW) * 0.5;
      ctx.fillText(tag, textX, ry + 0.7 + rh * 0.5 + 0.4);
    }

    // 7. Etichette direzione INGRESSO (in basso) e USCITA (in alto)
    ctx.font = '800 8px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const laneCenterX = this._pitCoordsToCanvas(pit, (pit.speedStartM + pit.speedEndM) * 0.5, pit.fastLaneOffsetNominal).x;

    ctx.fillStyle = '#4ade80';
    ctx.fillText('▲ USCITA PIT', laneCenterX, 9);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('▲ INGRESSO', laneCenterX, this.height - 9);
  }

  _drawCarMarker(ctx, x, y, car, isLocalPlayer, isTrafficThreat) {
    const r = isLocalPlayer ? 4.4 : 3.2;
    const fill = isLocalPlayer ? '#e10600' : isTrafficThreat ? '#ef4444' : (car.color || '#38bdf8');

    ctx.save();
    ctx.translate(x, y);

    if (isTrafficThreat) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 4.0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else if (isLocalPlayer) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 2.6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.9)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }

    // Freccetta verso l'alto (senso di marcia pit lane)
    ctx.beginPath();
    ctx.moveTo(0, -r - 4.2);
    ctx.lineTo(-3.0, -r + 0.6);
    ctx.lineTo(3.0, -r + 0.6);
    ctx.closePath();
    ctx.fillStyle = isLocalPlayer ? '#facc15' : fill;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = isLocalPlayer ? 1.5 : 1.0;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Aggiorna visibilità e renderizza la minimappa pit lane solo quando attiva.
   * @param {import('../core/WorldState.js').WorldState} worldState
   * @param {string} localPlayerId
   */
  render(worldState, localPlayerId) {
    if (!this.trackSurface?.pitLane || !worldState || !this.ctx) {
      this.setVisible(false);
      return;
    }

    const localCar = worldState.getCar(localPlayerId);
    const show = this.shouldBeVisible(worldState, localCar);
    this.setVisible(show);
    if (!show) return;

    const pit = this.trackSurface.pitLane;
    const ownTeamId = localCar?.teamId || worldState.sessionConfig?.careerTeamId || 'ferrari';
    const ownGarage = pit.garageByTeamId?.[ownTeamId] || pit.garages[0];
    this._ensureStaticBase(pit, ownTeamId);

    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = this._lastRenderMs > 0 ? Math.min(0.1, (nowMs - this._lastRenderMs) / 1000) : 0.016;
    this._lastRenderMs = nowMs;
    this._pulsePhase += dt * 4.2;
    const pulse = 0.5 + 0.5 * Math.sin(this._pulsePhase);

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this._staticBaseCanvas, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Evidenziazione pulsante verde/oro sul proprio box e sulla propria piazzola pit-stop
    if (ownGarage) {
      const pTop = this._pitCoordsToCanvas(pit, ownGarage.sEndM, ownGarage.garageFrontOffset);
      const pBot = this._pitCoordsToCanvas(pit, ownGarage.sStartM, ownGarage.garageBackOffset);
      const rx = Math.min(pTop.x, pBot.x);
      const ry = Math.min(pTop.y, pBot.y);
      const rw = Math.max(16, Math.abs(pBot.x - pTop.x));
      const rh = Math.max(7, Math.abs(pBot.y - pTop.y) - 1.4);

      ctx.save();
      ctx.strokeStyle = `rgba(74, 222, 128, ${0.55 + 0.45 * pulse})`;
      ctx.lineWidth = 1.8 + pulse * 0.8;
      ctx.strokeRect(rx - 1, ry - 0.3, rw + 2, rh + 2);

      // Piazzola target sulla working lane davanti al proprio box
      const stopPt = this._pitCoordsToCanvas(pit, ownGarage.sCenterM, ownGarage.workingLaneOffset);
      ctx.beginPath();
      ctx.arc(stopPt.x, stopPt.y, 3.2 + pulse * 1.4, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(250, 204, 21, ${0.5 + 0.45 * pulse})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
    }

    // Identifica tutte le vetture dentro la pit lane / raccordi e rileva eventuale traffico in arrivo sul box giocatore
    const pitCars = [];
    let hasTrafficThreat = false;

    for (const car of Object.values(worldState.cars)) {
      const pq = queryPitLane(pit, car.x, car.z, ownTeamId);
      if (!pq.sample) continue;
      if (!pq.inPitLane && !pq.inPitCorridor) continue;

      const isLocal = car.id === localPlayerId;
      let isThreat = false;
      if (!isLocal && ownGarage && pq.inPitLane && !pq.inGarage) {
        const deltaS = ownGarage.sCenterM - pq.sMeters;
        // Vettura nella fast lane in avvicinamento allo stallo del giocatore (-45m..+18m)
        if (deltaS >= -18 && deltaS <= 45) {
          isThreat = true;
          hasTrafficThreat = true;
        }
      }

      const pt = this._pitCoordsToCanvas(pit, pq.sMeters, pq.lateralFromTrackCenter);
      pitCars.push({ car, pt, isLocal, isThreat });
    }

    // Fascia di allerta rossa sulla fast lane se c'è traffico in arrivo verso il proprio box
    if (hasTrafficThreat && ownGarage) {
      const a = this._pitCoordsToCanvas(pit, Math.max(pit.entryStartM, ownGarage.sCenterM - 42), pit.pitWallOuterNominal);
      const b = this._pitCoordsToCanvas(pit, Math.min(pit.exitEndM, ownGarage.sCenterM + 16), pit.fastLaneOffsetNominal + pit.config.fastLaneWidth * 0.5);
      const ax = Math.min(a.x, b.x);
      const ay = Math.min(a.y, b.y);
      const aw = Math.max(6, Math.abs(b.x - a.x));
      const ah = Math.max(12, Math.abs(b.y - a.y));
      ctx.fillStyle = `rgba(239, 68, 68, ${0.18 + 0.22 * pulse})`;
      ctx.fillRect(ax, ay, aw, ah);
    }

    // Fallback: se localCar è appena fuori dal corridoio ma la mappa è forzata/attiva, proiettala comunque sul bordo
    const hasLocal = pitCars.some((item) => item.isLocal);
    if (!hasLocal && localCar) {
      const sDelta = signedArcDelta(
        localCar.timing?.rawLapProgress != null
          ? localCar.timing.rawLapProgress * this.trackSurface.totalLength
          : pit.startDist,
        0,
        this.trackSurface.totalLength
      );
      const clampedS = clamp(sDelta, pit.entryStartM, pit.exitEndM);
      const pt = this._pitCoordsToCanvas(pit, clampedS, 3.0);
      pitCars.push({ car: localCar, pt, isLocal: true, isThreat: false });
    }

    // Disegna prima i bot, poi il giocatore in primo piano
    for (const item of pitCars) {
      if (!item.isLocal) {
        this._drawCarMarker(ctx, item.pt.x, item.pt.y, item.car, false, item.isThreat);
      }
    }
    for (const item of pitCars) {
      if (item.isLocal) {
        this._drawCarMarker(ctx, item.pt.x, item.pt.y, item.car, true, false);
      }
    }
  }
}
