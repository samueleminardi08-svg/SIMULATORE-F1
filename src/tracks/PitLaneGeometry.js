/**
 * Geometria matematica pura (Node.js headless safe) della Pit Lane, dei 11 Box Scuderie
 * e dei 22 Stalli Pilota derivata esternamente dai campioni di TrackSurface.
 *
 * Non altera mai `controlPoints` dei tracciati esistenti e fornisce query O(1) ammortizzate
 * per superficie ('pitlane'), collisioni con pit wall/box, apertura barriere e guida 3D.
 */

import { F1_2026_DRIVERS, F1_2026_TEAMS } from '../config/f1_2026_data.js';
import { getPitLaneConfig } from './PitLaneConfig.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep01(t) {
  const u = clamp(t, 0, 1);
  return 0.5 * (1 - Math.cos(Math.PI * u));
}

function wrapArcDistance(dist, totalLength) {
  return ((dist % totalLength) + totalLength) % totalLength;
}

/**
 * Converte una distanza arco assoluta in distanza con segno rispetto a startDist in [-L/2, +L/2].
 */
export function signedArcDelta(arcDist, startDist, totalLength) {
  let d = arcDist - startDist;
  const half = totalLength * 0.5;
  if (d > half) d -= totalLength;
  if (d < -half) d += totalLength;
  return d;
}

/**
 * Campiona la pista a una distanza arco con segno rispetto al traguardo (startDist).
 */
function sampleTrackAtSignedOffset(trackSurface, startDist, signedMeters) {
  const { samples, sampleCount, totalLength, halfTrackWidth, barrierHalfWidth } = trackSurface;
  const arcDist = wrapArcDistance(startDist + signedMeters, totalLength);
  const floatIdx = (arcDist / totalLength) * sampleCount;
  const i0 = Math.floor(floatIdx) % sampleCount;
  const i1 = (i0 + 1) % sampleCount;
  const alpha = floatIdx - Math.floor(floatIdx);

  const a = samples[i0];
  const b = samples[i1];

  const x = a.x + (b.x - a.x) * alpha;
  const y = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * alpha;
  const z = a.z + (b.z - a.z) * alpha;

  const rawTx = a.tx + (b.tx - a.tx) * alpha;
  const rawTz = a.tz + (b.tz - a.tz) * alpha;
  const tLen = Math.max(1e-6, Math.hypot(rawTx, rawTz));
  const tx = rawTx / tLen;
  const tz = rawTz / tLen;
  const nx = tz;
  const nz = -tx;

  const hwA = a.halfWidth ?? halfTrackWidth;
  const hwB = b.halfWidth ?? halfTrackWidth;
  const halfWidth = hwA + (hwB - hwA) * alpha;

  const barLA = a.leftBarrierOffset ?? barrierHalfWidth;
  const barLB = b.leftBarrierOffset ?? barrierHalfWidth;
  const barRA = a.rightBarrierOffset ?? barrierHalfWidth;
  const barRB = b.rightBarrierOffset ?? barrierHalfWidth;

  return {
    sampleIndex: i0,
    arcDist,
    x,
    y,
    z,
    tx,
    tz,
    nx,
    nz,
    halfWidth,
    leftBarrierOffset: barLA + (barLB - barLA) * alpha,
    rightBarrierOffset: barRA + (barRB - barRA) * alpha,
  };
}

/**
 * Costruisce tutti i dati geometrici della pit lane, dei 11 box scuderie e dei 22 stalli.
 * @param {object} trackSurface
 * @param {object} [trackData]
 */
export function buildPitLaneData(trackSurface, trackData = null) {
  if (!trackSurface || !Array.isArray(trackSurface.samples) || trackSurface.samples.length < 16) {
    return null;
  }

  const trackId = trackData?.id || trackSurface.id;
  const config = getPitLaneConfig(trackId);
  const sideSign = config.side === 'left' ? 1 : -1;
  const { samples, sampleCount, totalLength } = trackSurface;

  const startIdxRaw = samples.findIndex((s) => Math.abs(s.x) < 5 && Math.abs(s.z) < 12);
  const startIdx = startIdxRaw >= 0 ? startIdxRaw : 0;
  const startDist = samples[startIdx].distance;

  // Verifica che la pit lane stia comodamente nel giro anche su piste molto corte (es. test_track)
  let entryStartM = config.entryStartM;
  let speedStartM = config.speedStartM;
  let speedEndM = config.speedEndM;
  let exitEndM = config.exitEndM;
  const maxSpan = totalLength * 0.42;
  const rawSpan = exitEndM - entryStartM;
  if (rawSpan > maxSpan && rawSpan > 1) {
    const scale = maxSpan / rawSpan;
    const mid = (entryStartM + exitEndM) * 0.5;
    entryStartM = mid + (entryStartM - mid) * scale;
    speedStartM = mid + (speedStartM - mid) * scale;
    speedEndM = mid + (speedEndM - mid) * scale;
    exitEndM = mid + (exitEndM - mid) * scale;
  }

  const entrySpan = Math.max(18, speedStartM - entryStartM);
  const exitSpan = Math.max(18, exitEndM - speedEndM);
  const speedSpan = Math.max(80, speedEndM - speedStartM);
  const totalPitSpan = exitEndM - entryStartM;

  // Il muretto pit wall inizia leggermente prima della linea 60/80 e termina poco dopo la linea uscita
  const pitWallStartM = speedStartM - Math.min(8, entrySpan * 0.16);
  const pitWallEndM = speedEndM + Math.min(8, exitSpan * 0.16);

  const sampleStepM = 2.5;
  const pitSampleCount = Math.max(48, Math.round(totalPitSpan / sampleStepM));
  const pitSamples = [];

  for (let i = 0; i <= pitSampleCount; i++) {
    const frac = i / pitSampleCount;
    const sMeters = entryStartM + frac * totalPitSpan;
    const tr = sampleTrackAtSignedOffset(trackSurface, startDist, sMeters);
    const hw = tr.halfWidth;
    const mainBar = sideSign > 0 ? tr.leftBarrierOffset : tr.rightBarrierOffset;

    let blend = 1;
    let workingBlend = 1;
    let zone = 'speed_zone';
    if (sMeters < speedStartM) {
      const u = clamp((sMeters - entryStartM) / entrySpan, 0, 1);
      blend = smoothstep01(u);
      workingBlend = smoothstep01((u - 0.58) / 0.42);
      zone = 'entry';
    } else if (sMeters > speedEndM) {
      const u = clamp((exitEndM - sMeters) / exitSpan, 0, 1);
      blend = smoothstep01(u);
      workingBlend = smoothstep01((u - 0.58) / 0.42);
      zone = 'exit';
    }

    const pitWallInner = hw + config.pitWallGap;
    const pitWallOuter = pitWallInner + config.pitWallThickness;
    const fastLaneHalf = config.fastLaneWidth * 0.5;
    const fastLaneCenterFull = pitWallOuter + fastLaneHalf;
    const fastLaneOuterFull = pitWallOuter + config.fastLaneWidth;
    const workingLaneOuterFull = fastLaneOuterFull + config.workingLaneWidth;
    const workingLaneCenterFull = fastLaneOuterFull + config.workingLaneWidth * 0.5;
    const garageBackFull = workingLaneOuterFull + config.garageDepth;

    // La centerline della fast lane si raccorda dolcemente dal margine pista verso fastLaneCenterFull
    const rampStartCenter = hw + 0.65;
    const fastLaneCenter = rampStartCenter + (fastLaneCenterFull - rampStartCenter) * blend;

    const innerEdge =
      zone === 'speed_zone'
        ? pitWallOuter
        : Math.max(hw - 0.45, fastLaneCenter - fastLaneHalf);

    const fastOuterLocal = fastLaneCenter + fastLaneHalf;
    const workingOuterLocal =
      fastOuterLocal + (workingLaneOuterFull - fastOuterLocal) * workingBlend;

    // Barriera esterna dell'ingresso/uscita che si raccorda senza buchi alla barriera principale
    const endCapBlend =
      sMeters < speedStartM
        ? smoothstep01(clamp((sMeters - entryStartM) / Math.min(22, entrySpan * 0.55), 0, 1))
        : sMeters > speedEndM
          ? smoothstep01(clamp((exitEndM - sMeters) / Math.min(22, exitSpan * 0.55), 0, 1))
          : 1;
    const outerBarrierOffset =
      zone === 'speed_zone'
        ? workingLaneOuterFull
        : Math.max(workingOuterLocal + 0.25, mainBar + (workingOuterLocal - mainBar) * endCapBlend);

    const hasPitWall = sMeters >= pitWallStartM && sMeters <= pitWallEndM;

    const fx = tr.x + tr.nx * sideSign * fastLaneCenter;
    const fz = tr.z + tr.nz * sideSign * fastLaneCenter;

    pitSamples.push({
      index: i,
      sMeters,
      pitArcDist: 0,
      trackArcDist: tr.arcDist,
      trackSampleIndex: tr.sampleIndex,
      zone,
      blend,
      workingBlend,
      hasPitWall,
      x: fx,
      y: tr.y,
      z: fz,
      tx: tr.tx,
      tz: tr.tz,
      nx: tr.nx,
      nz: tr.nz,
      trackX: tr.x,
      trackZ: tr.z,
      trackTx: tr.tx,
      trackTz: tr.tz,
      trackNx: tr.nx,
      trackNz: tr.nz,
      trackHalfWidth: hw,
      mainBarrierOffset: mainBar,
      pitWallInner,
      pitWallOuter,
      innerEdge,
      outerEdge: workingOuterLocal,
      outerBarrierOffset,
      fastLaneCenter,
      fastLaneOuter: fastOuterLocal,
      workingLaneCenter: workingLaneCenterFull,
      garageFront: workingLaneOuterFull,
      garageBack: garageBackFull,
    });
  }

  // Calcolo tangenti reali della curva fast lane e distanza arco pit lane + AABB completo
  let pitArc = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < pitSamples.length; i++) {
    const cur = pitSamples[i];
    if (i > 0) {
      const prev = pitSamples[i - 1];
      pitArc += Math.hypot(cur.x - prev.x, cur.z - prev.z);
    }
    cur.pitArcDist = pitArc;

    const a = pitSamples[Math.max(0, i - 1)];
    const b = pitSamples[Math.min(pitSamples.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.max(1e-6, Math.hypot(dx, dz));
    cur.tx = dx / len;
    cur.tz = dz / len;
    cur.nx = cur.tz;
    cur.nz = -cur.tx;

    // Estende la AABB includendo sia il bordo pista che il retro dei box
    const pInnerX = cur.trackX + cur.trackNx * sideSign * cur.trackHalfWidth;
    const pInnerZ = cur.trackZ + cur.trackNz * sideSign * cur.trackHalfWidth;
    const outerSpan = Math.max(cur.outerBarrierOffset, cur.garageBack) + 2.0;
    const pOuterX = cur.trackX + cur.trackNx * sideSign * outerSpan;
    const pOuterZ = cur.trackZ + cur.trackNz * sideSign * outerSpan;

    for (const px of [pInnerX, pOuterX]) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
    }
    for (const pz of [pInnerZ, pOuterZ]) {
      if (pz < minZ) minZ = pz;
      if (pz > maxZ) maxZ = pz;
    }
  }

  // Helper per interpolare un punto qualunque lungo pitSamples per sMeters
  const samplePitAtSMeters = (sTarget) => {
    const clampedS = clamp(sTarget, entryStartM, exitEndM);
    const f = ((clampedS - entryStartM) / totalPitSpan) * (pitSamples.length - 1);
    const i0 = Math.min(pitSamples.length - 2, Math.max(0, Math.floor(f)));
    const a = pitSamples[i0];
    const b = pitSamples[i0 + 1];
    const t = clamp(f - i0, 0, 1);

    const lerp = (va, vb) => va + (vb - va) * t;
    const rawTx = lerp(a.trackTx, b.trackTx);
    const rawTz = lerp(a.trackTz, b.trackTz);
    const tLen = Math.max(1e-6, Math.hypot(rawTx, rawTz));
    const trackTx = rawTx / tLen;
    const trackTz = rawTz / tLen;
    const trackNx = trackTz;
    const trackNz = -trackTx;

    const rawFTx = lerp(a.tx, b.tx);
    const rawFTz = lerp(a.tz, b.tz);
    const fLen = Math.max(1e-6, Math.hypot(rawFTx, rawFTz));

    return {
      sMeters: clampedS,
      pitArcDist: lerp(a.pitArcDist, b.pitArcDist),
      y: lerp(a.y, b.y),
      x: lerp(a.x, b.x),
      z: lerp(a.z, b.z),
      tx: rawFTx / fLen,
      tz: rawFTz / fLen,
      trackX: lerp(a.trackX, b.trackX),
      trackZ: lerp(a.trackZ, b.trackZ),
      trackTx,
      trackTz,
      trackNx,
      trackNz,
      trackHalfWidth: lerp(a.trackHalfWidth, b.trackHalfWidth),
      pitWallInner: lerp(a.pitWallInner, b.pitWallInner),
      pitWallOuter: lerp(a.pitWallOuter, b.pitWallOuter),
      fastLaneCenter: lerp(a.fastLaneCenter, b.fastLaneCenter),
      fastLaneOuter: lerp(a.fastLaneOuter, b.fastLaneOuter),
      workingLaneCenter: lerp(a.workingLaneCenter, b.workingLaneCenter),
      garageFront: lerp(a.garageFront, b.garageFront),
      garageBack: lerp(a.garageBack, b.garageBack),
    };
  };

  // Costruzione 11 Box Scuderie (ordine ufficiale F1_2026_TEAMS)
  const teams = Object.values(F1_2026_TEAMS);
  const garageCount = teams.length; // 11
  const padStart = Math.min(8, speedSpan * 0.05);
  const padEnd = Math.min(8, speedSpan * 0.05);
  const garageRowStartM = speedStartM + padStart;
  const garageRowEndM = speedEndM - padEnd;
  const usableSpan = Math.max(88, garageRowEndM - garageRowStartM);
  const bayWidth = usableSpan / garageCount;

  const garages = [];
  const garageByTeamId = {};

  for (let idx = 0; idx < garageCount; idx++) {
    const team = teams[idx];
    const sCenterM = garageRowStartM + (idx + 0.5) * bayWidth;
    const frame = samplePitAtSMeters(sCenterM);
    const heading = Math.atan2(frame.trackTx, frame.trackTz);

    // Vettore unitario che punta dalla fascia box verso la fast lane (uscita garage)
    const outX = -frame.trackNx * sideSign;
    const outZ = -frame.trackNz * sideSign;
    const garageCenterLat = (frame.garageFront + frame.garageBack) * 0.5;

    const toWorld = (latM, fwdM = 0) => ({
      x: frame.trackX + frame.trackNx * sideSign * latM + frame.trackTx * fwdM,
      y: frame.y,
      z: frame.trackZ + frame.trackNz * sideSign * latM + frame.trackTz * fwdM,
    });

    const garageObj = {
      teamIndex: idx,
      teamId: team.id,
      teamName: team.name,
      primaryColor: team.primaryColor,
      secondaryColor: team.secondaryColor,
      wingColor: team.wingColor,
      sCenterM,
      sStartM: garageRowStartM + idx * bayWidth,
      sEndM: garageRowStartM + (idx + 1) * bayWidth,
      pitArcDist: frame.pitArcDist,
      bayWidth,
      depth: config.garageDepth,
      height: config.garageHeight,
      heading,
      tx: frame.trackTx,
      tz: frame.trackTz,
      nx: frame.trackNx,
      nz: frame.trackNz,
      outX,
      outZ,
      centerPos: toWorld(garageCenterLat),
      frontPos: toWorld(frame.garageFront),
      backPos: toWorld(frame.garageBack),
      pitStopPos: { ...toWorld(frame.workingLaneCenter), heading },
      fastLanePos: { ...toWorld(frame.fastLaneCenter), heading },
      garageFrontOffset: frame.garageFront,
      garageBackOffset: frame.garageBack,
      workingLaneOffset: frame.workingLaneCenter,
      fastLaneOffset: frame.fastLaneCenter,
    };
    garages.push(garageObj);
    garageByTeamId[team.id] = garageObj;
  }

  // Costruzione 22 Stalli Pilota (2 per ogni scuderia)
  const teamSlotCounter = {};
  const stalls = [];
  const stallByDriverId = {};

  for (let i = 0; i < F1_2026_DRIVERS.length; i++) {
    const driver = F1_2026_DRIVERS[i];
    const garage = garageByTeamId[driver.teamId] || garages[i % garages.length];
    const slotInTeam = teamSlotCounter[garage.teamId] ?? 0;
    teamSlotCounter[garage.teamId] = slotInTeam + 1;

    const localLongOffset = (slotInTeam === 0 ? -0.23 : 0.23) * garage.bayWidth;
    const stallSMeters = garage.sCenterM + localLongOffset;
    const frame = samplePitAtSMeters(stallSMeters);

    // Orientamento vettura nel box: muso rivolto verso la fast lane con leggera inclinazione (+28°) verso l'uscita
    const outX = -frame.trackNx * sideSign;
    const outZ = -frame.trackNz * sideSign;
    const exitMixX = outX * 0.88 + frame.trackTx * 0.47;
    const exitMixZ = outZ * 0.88 + frame.trackTz * 0.47;
    const garageHeading = Math.atan2(exitMixX, exitMixZ);
    const laneHeading = Math.atan2(frame.trackTx, frame.trackTz);

    const interiorLat = frame.garageFront + Math.min(config.garageDepth * 0.48, 3.1);
    const mergeFrame = samplePitAtSMeters(Math.min(speedEndM - 3, stallSMeters + 11));

    const stall = {
      stallIndex: i,
      slotInTeam,
      driverId: driver.id,
      driverName: driver.name,
      driverCode: driver.code,
      driverNumber: driver.number,
      teamId: garage.teamId,
      teamIndex: garage.teamIndex,
      sMeters: stallSMeters,
      pitArcDist: frame.pitArcDist,
      garageInteriorPos: {
        x: frame.trackX + frame.trackNx * sideSign * interiorLat,
        y: frame.y,
        z: frame.trackZ + frame.trackNz * sideSign * interiorLat,
        heading: garageHeading,
      },
      pitStopPos: {
        x: garage.pitStopPos.x,
        y: garage.pitStopPos.y,
        z: garage.pitStopPos.z,
        heading: garage.heading,
      },
      mergePointPos: {
        x: mergeFrame.x,
        y: mergeFrame.y,
        z: mergeFrame.z,
        heading: Math.atan2(mergeFrame.tx, mergeFrame.tz),
      },
      laneHeading,
    };

    stalls.push(stall);
    stallByDriverId[driver.id] = stall;
  }

  // Maschera campioni della pista principale dove la barriera lato pit va omessa
  // (sostituita dall'apertura ingresso/uscita + muretto pit wall dedicato)
  // e maschera varchi ingresso/uscita dove aprire anche cordolo e linea bianca sul bordo pista.
  const mainBarrierSkipMask = new Array(sampleCount).fill(false);
  const pitOpeningSkipMask = new Array(sampleCount).fill(false);
  for (let i = 0; i < sampleCount; i++) {
    const sDelta = signedArcDelta(samples[i].distance, startDist, totalLength);
    if (sDelta >= entryStartM - 1.5 && sDelta <= exitEndM + 1.5) {
      mainBarrierSkipMask[i] = true;
    }
    if (
      (sDelta >= entryStartM && sDelta <= pitWallStartM) ||
      (sDelta >= pitWallEndM && sDelta <= exitEndM)
    ) {
      pitOpeningSkipMask[i] = true;
    }
  }

  // Riferimenti linee inizio/fine limite velocità (per segnaletica 3D e Pit Limiter Step 3)
  const speedLimitStartFrame = samplePitAtSMeters(speedStartM);
  const speedLimitEndFrame = samplePitAtSMeters(speedEndM);
  const entryFrame = samplePitAtSMeters(entryStartM);
  const exitFrame = samplePitAtSMeters(exitEndM);

  const midFrame = samplePitAtSMeters((speedStartM + speedEndM) * 0.5);

  return {
    trackId,
    config,
    side: config.side,
    sideSign,
    speedLimitKmh: config.speedLimitKmh,
    speedLimitMs: config.speedLimitKmh / 3.6,
    lengthMeters: config.lengthMeters,
    startIdx,
    startDist,
    entryStartM,
    speedStartM,
    speedEndM,
    exitEndM,
    pitWallStartM,
    pitWallEndM,
    garageRowStartM,
    garageRowEndM,
    bayWidth,
    totalPitArcLength: pitArc,
    pitWallInnerNominal: midFrame.pitWallInner,
    pitWallOuterNominal: midFrame.pitWallOuter,
    fastLaneOffsetNominal: midFrame.fastLaneCenter,
    workingLaneOffsetNominal: midFrame.workingLaneCenter,
    garageFrontNominal: midFrame.garageFront,
    garageBackNominal: midFrame.garageBack,
    samples: pitSamples,
    garages,
    garageByTeamId,
    stalls,
    stallByDriverId,
    mainBarrierSkipMask,
    pitOpeningSkipMask,
    speedLimitStartFrame,
    speedLimitEndFrame,
    entryFrame,
    exitFrame,
    bounds: { minX, maxX, minZ, maxZ },
  };
}

/**
 * Interroga in modo rapido e deterministico la posizione (x, z) rispetto alla pit lane.
 * @param {ReturnType<typeof buildPitLaneData> | null} pitLane
 * @param {number} x
 * @param {number} z
 * @param {string | null} [teamId=null]
 */
export function queryPitLane(pitLane, x, z, teamId = null) {
  if (!pitLane || !pitLane.samples || pitLane.samples.length < 2) {
    return {
      inPitCorridor: false,
      inPitLane: false,
      inGarage: false,
      zone: null,
      pitArcDist: 0,
      sMeters: 0,
      lateralFromTrackCenter: 0,
      lateralFromFastLane: 0,
      distanceToOwnBox: Infinity,
      sample: null,
    };
  }

  const b = pitLane.bounds;
  const pad = 6.0;
  if (x < b.minX - pad || x > b.maxX + pad || z < b.minZ - pad || z > b.maxZ + pad) {
    return {
      inPitCorridor: false,
      inPitLane: false,
      inGarage: false,
      zone: null,
      pitArcDist: 0,
      sMeters: 0,
      lateralFromTrackCenter: 0,
      lateralFromFastLane: 0,
      distanceToOwnBox: Infinity,
      sample: null,
    };
  }

  const { samples, sideSign } = pitLane;
  const n = samples.length;
  let bestDistSq = Infinity;
  let bestIdx = 0;
  let bestT = 0;

  for (let i = 0; i < n - 1; i++) {
    const a = samples[i];
    const c = samples[i + 1];
    // Proietta sulla spina pista adiacente (trackX, trackZ) per avere coordinate (s, d) pulite
    const abx = c.trackX - a.trackX;
    const abz = c.trackZ - a.trackZ;
    const lenSq = Math.max(1e-6, abx * abx + abz * abz);
    const t = clamp(((x - a.trackX) * abx + (z - a.trackZ) * abz) / lenSq, 0, 1);

    const px = a.trackX + abx * t;
    const pz = a.trackZ + abz * t;
    // Misura distanza dal centro della pit lane lungo questo segmento
    const nx = a.trackNx + (c.trackNx - a.trackNx) * t;
    const nz = a.trackNz + (c.trackNz - a.trackNz) * t;
    const fl = a.fastLaneCenter + (c.fastLaneCenter - a.fastLaneCenter) * t;
    const cx = px + nx * sideSign * fl;
    const cz = pz + nz * sideSign * fl;
    const dx = x - cx;
    const dz = z - cz;
    const distSq = dx * dx + dz * dz;

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIdx = i;
      bestT = t;
    }
  }

  const a = samples[bestIdx];
  const c = samples[bestIdx + 1];
  const t = bestT;
  const lerp = (va, vb) => va + (vb - va) * t;

  const trackX = lerp(a.trackX, c.trackX);
  const trackZ = lerp(a.trackZ, c.trackZ);
  const rawTx = lerp(a.trackTx, c.trackTx);
  const rawTz = lerp(a.trackTz, c.trackTz);
  const tLen = Math.max(1e-6, Math.hypot(rawTx, rawTz));
  const trackTx = rawTx / tLen;
  const trackTz = rawTz / tLen;
  const trackNx = trackTz;
  const trackNz = -trackTx;

  // Verifica che il punto non sia oltre gli estremi longitudinali della pit lane
  const longErr = (x - trackX) * trackTx + (z - trackZ) * trackTz;
  if ((bestIdx === 0 && t <= 0.001 && longErr < -2.0) || (bestIdx === n - 2 && t >= 0.999 && longErr > 2.0)) {
    return {
      inPitCorridor: false,
      inPitLane: false,
      inGarage: false,
      zone: null,
      pitArcDist: 0,
      sMeters: 0,
      lateralFromTrackCenter: 0,
      lateralFromFastLane: 0,
      distanceToOwnBox: Infinity,
      sample: null,
    };
  }

  const sMeters = lerp(a.sMeters, c.sMeters);
  const pitArcDist = lerp(a.pitArcDist, c.pitArcDist);
  const elevation = lerp(a.y, c.y);
  const trackHalfWidth = lerp(a.trackHalfWidth, c.trackHalfWidth);
  const pitWallInner = lerp(a.pitWallInner, c.pitWallInner);
  const pitWallOuter = lerp(a.pitWallOuter, c.pitWallOuter);
  const innerEdge = lerp(a.innerEdge, c.innerEdge);
  const outerEdge = lerp(a.outerEdge, c.outerEdge);
  const outerBarrierOffset = lerp(a.outerBarrierOffset, c.outerBarrierOffset);
  const fastLaneCenter = lerp(a.fastLaneCenter, c.fastLaneCenter);
  const garageFront = lerp(a.garageFront, c.garageFront);
  const garageBack = lerp(a.garageBack, c.garageBack);
  const hasPitWall = sMeters >= pitLane.pitWallStartM && sMeters <= pitLane.pitWallEndM;

  // Distanza laterale dal centro pista (positiva verso il lato pit lane)
  const d = ((x - trackX) * trackNx + (z - trackZ) * trackNz) * sideSign;
  const lateralFromFastLane = d - fastLaneCenter;

  // Riconoscimento zona pit lane
  const isSpeedSpan = sMeters >= pitLane.speedStartM && sMeters <= pitLane.speedEndM;
  const isEntrySpan = sMeters < pitLane.speedStartM;
  const inPitCorridor = d >= trackHalfWidth - 0.5 && d <= garageBack + 1.5;

  let inPitLane = false;
  let inGarage = false;
  let zone = null;

  if (isSpeedSpan) {
    if (d >= pitWallOuter - 0.35 && d <= garageFront + 0.4) {
      inPitLane = true;
      zone = 'speed_zone';
    } else if (d > garageFront + 0.4 && d <= garageBack + 0.8) {
      inPitLane = true;
      inGarage = true;
      zone = 'garage';
    }
  } else {
    // Raccordo ingresso o uscita: asfalto pit lane dall'uscita dal bordo pista fino a outerBarrierOffset
    const rampInnerThreshold = Math.max(trackHalfWidth - 0.15, innerEdge - 0.3);
    if (d >= rampInnerThreshold && d <= Math.max(outerEdge, outerBarrierOffset) + 0.35) {
      // Considera 'pitlane' appena il centro vettura supera il bordo pista principale
      if (d > trackHalfWidth + 0.15) {
        inPitLane = true;
        zone = isEntrySpan ? 'entry' : 'exit';
      }
    }
  }

  let distanceToOwnBox = Infinity;
  if (teamId && pitLane.garageByTeamId?.[teamId]) {
    const own = pitLane.garageByTeamId[teamId].pitStopPos;
    distanceToOwnBox = Math.hypot(x - own.x, z - own.z);
  }

  const rawFTx = lerp(a.tx, c.tx);
  const rawFTz = lerp(a.tz, c.tz);
  const fLen = Math.max(1e-6, Math.hypot(rawFTx, rawFTz));

  return {
    inPitCorridor,
    inPitLane,
    inGarage,
    zone,
    hasPitWall,
    pitArcDist,
    sMeters,
    elevation,
    lateralFromTrackCenter: d,
    lateralFromFastLane,
    trackHalfWidth,
    pitWallInner,
    pitWallOuter,
    innerEdge,
    outerEdge,
    outerBarrierOffset,
    fastLaneCenter,
    garageFront,
    garageBack,
    trackX,
    trackZ,
    trackTx,
    trackTz,
    trackNx,
    trackNz,
    tx: rawFTx / fLen,
    tz: rawFTz / fLen,
    sideSign,
    distanceToOwnBox,
    sample: a,
  };
}

/**
 * Verifica se un punto (x, z) ricade nell'ingombro della pit lane / edificio box (con margine).
 * Usata da TrackBuilder.addParkTrees per non generare alberi dentro la pit lane o i box.
 */
export function isInsidePitFootprint(pitLane, x, z, margin = 10.0) {
  if (!pitLane || !pitLane.samples || pitLane.samples.length < 2) return false;
  const b = pitLane.bounds;
  if (
    x < b.minX - margin ||
    x > b.maxX + margin ||
    z < b.minZ - margin ||
    z > b.maxZ + margin
  ) {
    return false;
  }

  const { samples, sideSign } = pitLane;
  for (let i = 0; i < samples.length; i += 2) {
    const s = samples[i];
    const dx = x - s.trackX;
    const dz = z - s.trackZ;
    const along = dx * s.trackTx + dz * s.trackTz;
    if (Math.abs(along) > margin + 5.0) continue;
    const lat = (dx * s.trackNx + dz * s.trackNz) * sideSign;
    if (lat >= s.trackHalfWidth - 2.0 && lat <= s.garageBack + margin) {
      return true;
    }
  }
  return false;
}
