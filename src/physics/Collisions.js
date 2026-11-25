/**
 * Modulo per la gestione delle collisioni con le barriere laterali (Step 3).
 * Mantiene la simulazione pura e serializzabile in WorldState.
 */

import { CAR_PHYSICS_CONFIG, COLLISION_CONFIG } from '../config/constants.js';
import { queryPitLane } from '../tracks/PitLaneGeometry.js';
import { queryTrackSurface } from '../tracks/TrackSurface.js';

const GARAGE_COLLISION_BYPASS_STATES = new Set([
  'IN_GARAGE',
  'EXITING_GARAGE',
  'PIT_STOPPING',
  'AUTO_BOX_STOP',
  'IN_PIT_BOX',
  'AUTO_PARKING',
  'PARKED_STAGE_END',
]);

function applyWallBounce(car, targetX, targetZ, wallNx, wallNz, tangentX, tangentZ) {
  car.x = targetX;
  car.z = targetZ;

  const vTangent = car.vx * tangentX + car.vz * tangentZ;
  const vOutward = car.vx * wallNx + car.vz * wallNz;

  if (vOutward > 0) {
    const vNewNormal = -Math.max(
      vOutward * COLLISION_CONFIG.restitution,
      COLLISION_CONFIG.minBounceSpeed
    );
    const impactRatio = Math.min(1, vOutward / 45);
    const tangentDamp = Math.max(0.42, 1 - impactRatio * 0.45 - 0.08);
    const vNewTangent = vTangent * tangentDamp;

    car.vx = tangentX * vNewTangent + wallNx * vNewNormal;
    car.vz = tangentZ * vNewTangent + wallNz * vNewNormal;

    const targetDirX = vTangent >= -1 ? tangentX : -tangentX;
    const targetDirZ = vTangent >= -1 ? tangentZ : -tangentZ;
    const targetHeading = Math.atan2(targetDirX, targetDirZ);
    const angleDiff = Math.atan2(
      Math.sin(targetHeading - car.heading),
      Math.cos(targetHeading - car.heading)
    );
    car.heading += angleDiff * COLLISION_CONFIG.headingAlignStrength;

    updateCarLocalVelocityFromWorld(car);
    car.collidingWithBarrier = true;
    car.collisionImpact = vOutward;
  } else {
    car.collidingWithBarrier = true;
    car.collisionImpact = 0;
  }
}

/**
 * Risolve l'eventuale collisione tra una monoposto e le barriere del tracciato
 * (includendo apertura ingresso/uscita pit lane, pit wall separatore e fronte box).
 * @param {object} car
 * @param {ReturnType<import('../tracks/TrackSurface.js').createTrackSurface> | null} trackSurface
 */
export function resolveTrackBarrierCollision(car, trackSurface) {
  if (!trackSurface) {
    car.collidingWithBarrier = false;
    car.collisionImpact = 0;
    return;
  }

  const query = queryTrackSurface(trackSurface, car.x, car.z, car.trackSampleIndex);
  car.surface = query.surface;
  car.trackSampleIndex = query.sampleIndex;

  const carRadius = COLLISION_CONFIG.carRadius;
  const pitLane = trackSurface.pitLane;
  const pitQuery = query.pitQuery || (pitLane ? queryPitLane(pitLane, car.x, car.z) : null);

  // Gestione corridoio Pit Lane (solo se la vettura è davvero sul rettilineo/corridoio pit,
  // mai su altri rami del circuito che attraversano la AABB diagonale es. Eau Rouge a Spa!)
  const maxPitCaptureOffset =
    pitQuery?.sample
      ? Math.max(pitQuery.garageBack ?? 0, pitQuery.outerBarrierOffset ?? 0) + 4.5
      : 0;
  const inPitReach = Boolean(
    pitLane &&
      pitQuery &&
      pitQuery.sample &&
      pitQuery.lateralFromTrackCenter > 0 &&
      pitQuery.lateralFromTrackCenter <= maxPitCaptureOffset &&
      Math.abs((car.y ?? 0) - (pitQuery.elevation ?? 0)) < 3.5 &&
      Math.hypot(car.x - pitQuery.trackX, car.z - pitQuery.trackZ) <= maxPitCaptureOffset + 2.5
  );
  if (inPitReach) {
    const d = pitQuery.lateralFromTrackCenter;
    const sSign = pitQuery.sideSign;
    const tx = pitQuery.trackTx;
    const tz = pitQuery.trackTz;
    const nx = pitQuery.trackNx;
    const nz = pitQuery.trackNz;
    const allowGarageInterior = GARAGE_COLLISION_BYPASS_STATES.has(car.pitState);

    if (pitQuery.hasPitWall) {
      const wallMid = (pitQuery.pitWallInner + pitQuery.pitWallOuter) * 0.5;
      if (d < wallMid) {
        // Vettura sul rettilineo principale: contenimento sul lato interno del pit wall
        const maxTrackSide = pitQuery.pitWallInner - carRadius;
        if (d <= maxTrackSide) {
          car.collidingWithBarrier = false;
          car.collisionImpact = 0;
          return;
        }
        applyWallBounce(
          car,
          pitQuery.trackX + nx * sSign * maxTrackSide,
          pitQuery.trackZ + nz * sSign * maxTrackSide,
          nx * sSign,
          nz * sSign,
          tx,
          tz
        );
        return;
      }

      // Vettura dentro la pit lane: contenimento tra faccia esterna del pit wall e fronte/retro box
      const minPitSide = pitQuery.pitWallOuter + carRadius;
      const outerWall = allowGarageInterior ? pitQuery.garageBack : pitQuery.garageFront;
      const maxPitSide = outerWall - carRadius;

      if (d < minPitSide) {
        applyWallBounce(
          car,
          pitQuery.trackX + nx * sSign * minPitSide,
          pitQuery.trackZ + nz * sSign * minPitSide,
          -nx * sSign,
          -nz * sSign,
          tx,
          tz
        );
        return;
      }
      if (d > maxPitSide) {
        applyWallBounce(
          car,
          pitQuery.trackX + nx * sSign * maxPitSide,
          pitQuery.trackZ + nz * sSign * maxPitSide,
          nx * sSign,
          nz * sSign,
          tx,
          tz
        );
        return;
      }
      car.collidingWithBarrier = false;
      car.collisionImpact = 0;
      return;
    }

    // Finestra di apertura ingresso o uscita pit lane: barriera principale aperta, solo barriera esterna rampa
    const maxRampOffset = pitQuery.outerBarrierOffset - carRadius;
    if (d <= maxRampOffset) {
      car.collidingWithBarrier = false;
      car.collisionImpact = 0;
      return;
    }
    applyWallBounce(
      car,
      pitQuery.trackX + nx * sSign * maxRampOffset,
      pitQuery.trackZ + nz * sSign * maxRampOffset,
      nx * sSign,
      nz * sSign,
      pitQuery.tx,
      pitQuery.tz
    );
    return;
  }

  const maxAllowedOffset = query.barrierHalfWidth - carRadius;

  if (query.absOffset <= maxAllowedOffset) {
    car.collidingWithBarrier = false;
    car.collisionImpact = 0;
    return;
  }

  // 1. Repulsione geometrica: riporta il centro vettura all'interno del guardrail
  const sideSign = query.lateralOffset >= 0 ? 1 : -1;
  applyWallBounce(
    car,
    query.closestX + query.nx * sideSign * maxAllowedOffset,
    query.closestZ + query.nz * sideSign * maxAllowedOffset,
    query.nx * sideSign,
    query.nz * sideSign,
    query.tx,
    query.tz
  );
}

function updateCarLocalVelocityFromWorld(car) {
  const fwdX = Math.sin(car.heading);
  const fwdZ = Math.cos(car.heading);
  const leftX = Math.cos(car.heading);
  const leftZ = -Math.sin(car.heading);
  car.forwardSpeed = car.vx * fwdX + car.vz * fwdZ;
  car.lateralSpeed = car.vx * leftX + car.vz * leftZ;
  car.speed = car.forwardSpeed;
}

/**
 * Risolve le collisioni elastiche/anelastiche tra tutte le monoposto in pista (Step 6).
 * @param {Record<string, object>} carsMap
 */
export function resolveCarToCarCollisions(carsMap) {
  const cars = Object.values(carsMap);
  const count = cars.length;
  if (count < 2) return;

  const rx = CAR_PHYSICS_CONFIG.carWidth ?? 1.90; // somma semi-larghezze (2 * 0.95 m)
  const rz = 5.10; // somma semi-lunghezze sagoma rastremata F1 2026 (~5.32 m)
  const restitution = 0.30;

  for (let i = 0; i < count; i++) {
    const carA = cars[i];
    if (GARAGE_COLLISION_BYPASS_STATES.has(carA.pitState)) continue;
    if ((carA.recoveryGhostTimer ?? 0) > 0) continue;
    for (let j = i + 1; j < count; j++) {
      const carB = cars[j];
      if (GARAGE_COLLISION_BYPASS_STATES.has(carB.pitState)) continue;
      if ((carB.recoveryGhostTimer ?? 0) > 0) continue;
      if (Math.abs((carB.y ?? 0) - (carA.y ?? 0)) > 2.5) continue;
      const dx = carB.x - carA.x;
      const dz = carB.z - carA.z;

      if (Math.abs(dx) > 5.0 || Math.abs(dz) > 5.0) continue;

      const avgH = Math.atan2(
        Math.sin(carA.heading) + Math.sin(carB.heading),
        Math.cos(carA.heading) + Math.cos(carB.heading)
      );
      const fwdX = Math.sin(avgH);
      const fwdZ = Math.cos(avgH);
      const leftX = Math.cos(avgH);
      const leftZ = -Math.sin(avgH);

      const localFwd = dx * fwdX + dz * fwdZ;
      const localLeft = dx * leftX + dz * leftZ;

      const nx = localLeft / rx;
      const nz = localFwd / rz;
      const normDist = Math.hypot(nx, nz);

      if (normDist >= 1.0) continue;

      // Direzione di separazione nel sistema locale e mondo
      let colLocalLeft = 1;
      let colLocalFwd = 0;
      if (normDist > 1e-4) {
        const gx = nx / rx;
        const gz = nz / rz;
        const gLen = Math.max(1e-6, Math.hypot(gx, gz));
        colLocalLeft = gx / gLen;
        colLocalFwd = gz / gLen;
      }

      const colNx = leftX * colLocalLeft + fwdX * colLocalFwd;
      const colNz = leftZ * colLocalLeft + fwdZ * colLocalFwd;

      // Stima profondità di compenetrazione lungo il raggio effettivo
      const dirLeft = normDist > 1e-4 ? nx / normDist : 1;
      const dirFwd = normDist > 1e-4 ? nz / normDist : 0;
      const effectiveRadius = Math.hypot(dirLeft * rx, dirFwd * rz);
      const overlapDepth = Math.max(0.02, effectiveRadius * (1.0 - normDist));

      const halfPush = overlapDepth * 0.5;
      carA.x -= colNx * halfPush;
      carA.z -= colNz * halfPush;
      carB.x += colNx * halfPush;
      carB.z += colNz * halfPush;

      // FIA Art. 33.3 "justifiable reason": registra contatto recente per esentare chi viene spinto fuori pista
      carA.recentCarContactTimer = 1.8;
      carB.recentCarContactTimer = 1.8;

      const relVx = carB.vx - carA.vx;
      const relVz = carB.vz - carA.vz;
      const velAlongNormal = relVx * colNx + relVz * colNz;

      if (velAlongNormal < 0) {
        const impulse = -(1 + restitution) * velAlongNormal * 0.5;
        carA.vx -= colNx * impulse;
        carA.vz -= colNz * impulse;
        carB.vx += colNx * impulse;
        carB.vz += colNz * impulse;

        // Leggera perdita di velocità da strisciata
        carA.vx *= 0.97;
        carA.vz *= 0.97;
        carB.vx *= 0.97;
        carB.vz *= 0.97;

        updateCarLocalVelocityFromWorld(carA);
        updateCarLocalVelocityFromWorld(carB);
      }
    }
  }
}
