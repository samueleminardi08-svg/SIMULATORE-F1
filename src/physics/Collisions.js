/**
 * Modulo per la gestione delle collisioni con le barriere laterali (Step 3).
 * Mantiene la simulazione pura e serializzabile in WorldState.
 */

import { COLLISION_CONFIG } from '../config/constants.js';
import { queryTrackSurface } from '../tracks/TrackSurface.js';

/**
 * Risolve l'eventuale collisione tra una monoposto e le barriere del tracciato.
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

  const maxAllowedOffset = query.barrierHalfWidth - COLLISION_CONFIG.carRadius;

  if (query.absOffset <= maxAllowedOffset) {
    car.collidingWithBarrier = false;
    car.collisionImpact = 0;
    return;
  }

  // 1. Repulsione geometrica: riporta il centro vettura all'interno del guardrail
  const sideSign = query.lateralOffset >= 0 ? 1 : -1;
  car.x = query.closestX + query.nx * sideSign * maxAllowedOffset;
  car.z = query.closestZ + query.nz * sideSign * maxAllowedOffset;

  const wallNx = query.nx * sideSign;
  const wallNz = query.nz * sideSign;

  // 2. Decomposizione della velocità lungo la tangente del muro e la normale uscente
  const vTangent = car.vx * query.tx + car.vz * query.tz;
  const vOutward = car.vx * wallNx + car.vz * wallNz;

  if (vOutward > 0) {
    // Rimbalzo anelastico verso l'interno + perdita di velocità proporzionale all'impatto
    const vNewNormal = -Math.max(
      vOutward * COLLISION_CONFIG.restitution,
      COLLISION_CONFIG.minBounceSpeed
    );
    const impactRatio = Math.min(1, vOutward / 45);
    const tangentDamp = Math.max(0.42, 1 - impactRatio * 0.45 - 0.08);
    const vNewTangent = vTangent * tangentDamp;

    car.vx = query.tx * vNewTangent + wallNx * vNewNormal;
    car.vz = query.tz * vNewTangent + wallNz * vNewNormal;

    // Riallineamento progressivo del musetto lungo la direzione del guardrail
    const targetDirX = vTangent >= -1 ? query.tx : -query.tx;
    const targetDirZ = vTangent >= -1 ? query.tz : -query.tz;
    const targetHeading = Math.atan2(targetDirX, targetDirZ);
    const angleDiff = Math.atan2(
      Math.sin(targetHeading - car.heading),
      Math.cos(targetHeading - car.heading)
    );
    car.heading += angleDiff * COLLISION_CONFIG.headingAlignStrength;

    // Aggiornamento componenti locali
    const fwdX = Math.sin(car.heading);
    const fwdZ = Math.cos(car.heading);
    const leftX = Math.cos(car.heading);
    const leftZ = -Math.sin(car.heading);
    car.forwardSpeed = car.vx * fwdX + car.vz * fwdZ;
    car.lateralSpeed = car.vx * leftX + car.vz * leftZ;
    car.speed = car.forwardSpeed;

    car.collidingWithBarrier = true;
    car.collisionImpact = vOutward;
  } else {
    car.collidingWithBarrier = true;
    car.collisionImpact = 0;
  }
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

  const rx = 1.92; // somma semi-larghezze (2 * 0.96m)
  const rz = 4.30; // somma semi-lunghezze (2 * 2.15m)
  const restitution = 0.30;

  for (let i = 0; i < count; i++) {
    const carA = cars[i];
    for (let j = i + 1; j < count; j++) {
      const carB = cars[j];
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
