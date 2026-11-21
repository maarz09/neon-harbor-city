// Vehicle physics and the fleet: an arcade drive model (throttle, brake, reverse, grip and a
// handbrake drift), collisions with buildings and with other cars, damage leading to smoke, fire
// and explosions, and the registry every car in the city lives in (parked, traffic, police).
import * as THREE from 'three';
import { CAR_TUNING } from './config.js';
import { VEHICLE_TYPES, createVehicleModel } from './vehicleModels.js';
import { groundHeightAt } from './cityLayout.js';

let nextVehicleId = 1;

export class Vehicle {
  constructor(type, color, x, z, heading) {
    const t = VEHICLE_TYPES[type];
    this.id = nextVehicleId++;
    this.type = type;
    this.spec = t;
    this.name = t.name;
    this.color = color || t.colors[0];
    this.model = createVehicleModel(type, this.color);
    this.position = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.velocity = new THREE.Vector2(0, 0);
    this.forwardSpeed = 0;
    this.lateralSpeed = 0;
    this.steer = 0;
    this.throttle = 0;
    this.handbrake = false;
    this.health = 100;
    this.destroyed = false;
    this.driver = null;          // 'player', 'traffic', 'police' or null when parked
    this.isPolice = type === 'police';
    this.sirenOn = false;
    this.locked = false;
    this.tag = null;             // missions mark special cars
    this.skidding = 0;
    this.lastImpact = 0;
    this.roll = 0; this.pitch = 0;
    this.burnTimer = 0;
    this.syncModel();
  }

  get forward() { return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  get right() { return new THREE.Vector3(-Math.cos(this.heading), 0, Math.sin(this.heading)); }
  get speedKmh() { return Math.abs(this.forwardSpeed) * 3.6; }

  /** Where someone stands to get in or out: beside the driver's (left) door. */
  doorPosition() {
    return this.position.clone().addScaledVector(this.right, -(this.spec.wid / 2 + 0.9));
  }

  /**
   * Advance the drive model. `controls` = { throttle -1..1, steer -1..1 (right positive),
   * handbrake bool }. Returns the impact speed of any collision this step (for damage and sound).
   */
  drive(dt, controls, collision) {
    if (this.destroyed) { controls = { throttle: 0, steer: 0, handbrake: true }; }
    const t = this.spec;
    const fwd = this.forward; const right = this.right;
    let vF = this.velocity.x * fwd.x + this.velocity.y * fwd.z;
    let vR = this.velocity.x * right.x + this.velocity.y * right.z;
    const throttle = controls.throttle;
    this.throttle = throttle;
    if (throttle > 0) {
      if (vF < -0.5) vF += CAR_TUNING.brake * dt;
      else vF += CAR_TUNING.accel * t.accel * throttle * dt * Math.max(0.05, 1 - vF / t.maxSpeed);
    } else if (throttle < 0) {
      if (vF > 0.5) vF -= CAR_TUNING.brake * dt * -throttle;
      else vF = Math.max(-12, vF - CAR_TUNING.reverse * -throttle * dt);
    } else {
      const roll = CAR_TUNING.roll * dt;
      vF = Math.abs(vF) <= roll ? 0 : vF - Math.sign(vF) * roll;
    }
    vF -= vF * Math.abs(vF) * 0.0009 * CAR_TUNING.drag * 10 * dt;
    this.handbrake = controls.handbrake;
    if (controls.handbrake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 9 * dt);
    const grip = controls.handbrake ? CAR_TUNING.handbrakeGrip : CAR_TUNING.grip;
    vR *= Math.exp(-grip * dt);

    // steering: smooth input, weaker at high speed, reversed when backing up
    this.steer += (controls.steer - this.steer) * Math.min(1, dt * 8);
    const speedFactor = THREE.MathUtils.clamp(vF / 7, -1, 1) * (1 - 0.45 * Math.min(Math.abs(vF) / t.maxSpeed, 1));
    const yawRate = -this.steer * CAR_TUNING.steer * speedFactor * (controls.handbrake ? 1.35 : 1);
    this.heading += yawRate * dt;
    // drifting: the handbrake lets the back swing out
    if (controls.handbrake && Math.abs(vF) > 8) vR += yawRate * Math.abs(vF) * 0.08 * dt * 10;

    this.skidding = Math.abs(vR) > 3.2 || (controls.handbrake && Math.abs(vF) > 6) || (throttle < 0 && vF > 12) ? 1 : 0;
    this.forwardSpeed = vF; this.lateralSpeed = vR;
    const nf = this.forward; const nr = this.right;
    this.velocity.set(nf.x * vF + nr.x * vR, nf.z * vF + nr.z * vR);
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.y * dt;
    const impact = this.collideWithCity(collision);
    this.animate(dt, yawRate);
    return impact;
  }

  /** Two circles (front and back) pushed out of buildings; bounces and scrapes speed off. */
  collideWithCity(collision) {
    const fwd = this.forward; const half = this.spec.len / 2 - this.spec.wid / 2;
    let impact = 0;
    for (const s of [1, -1]) {
      const p = { x: this.position.x + fwd.x * half * s, z: this.position.z + fwd.z * half * s };
      const ox = p.x; const oz = p.z;
      const hit = collision.resolveCircle(p, this.spec.wid / 2 + 0.05);
      if (hit) {
        this.position.x += p.x - ox; this.position.z += p.z - oz;
        const vn = this.velocity.x * hit.nx + this.velocity.y * hit.nz;
        if (vn < 0) {
          impact = Math.max(impact, -vn);
          this.velocity.x -= hit.nx * vn * 1.35; this.velocity.y -= hit.nz * vn * 1.35;
          this.velocity.multiplyScalar(0.8);
          const f = this.forward; const r = this.right;
          this.forwardSpeed = this.velocity.x * f.x + this.velocity.y * f.z;
          this.lateralSpeed = this.velocity.x * r.x + this.velocity.y * r.z;
        }
      }
    }
    return impact;
  }

  takeDamage(amount) {
    if (this.destroyed) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.destroyed = true;
  }

  /** Spin the wheels, steer the fronts, roll and pitch the body with the forces on it. */
  animate(dt, yawRate) {
    const m = this.model;
    for (const w of m.wheels) w.rotation.x += (this.forwardSpeed * dt) / this.spec.wheelR;
    for (const p of m.steerWheels) p.rotation.y = -this.steer * 0.5;
    const targetRoll = THREE.MathUtils.clamp(yawRate * this.forwardSpeed * 0.006, -0.09, 0.09);
    const targetPitch = THREE.MathUtils.clamp(-this.throttle * 0.025 + (this.throttle < 0 && this.forwardSpeed > 1 ? 0.04 : 0), -0.05, 0.05);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 6);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 5);
    m.body.rotation.z = this.roll;
    m.body.rotation.x = this.pitch;
    this.syncModel();
  }

  syncModel() {
    this.position.y = groundHeightAt(this.position.x, this.position.z);
    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = this.heading;
  }

  /** Flash the light bar and show lamp glows at night. */
  updateLights(time, night) {
    const m = this.model;
    m.glow.material.opacity = this.destroyed ? 0 : night * (this.driver ? 1 : 0.15);
    if (m.sirenRed) {
      const on = this.sirenOn && !this.destroyed;
      const phase = Math.floor(time * 7) % 2;
      m.sirenRed.material.color.set(on && phase ? '#ff2040' : '#501018');
      m.sirenBlue.material.color.set(on && !phase ? '#2070ff' : '#101850');
    }
  }

  /** Blacken and drop a wrecked car. */
  markWrecked() {
    this.model.bodyMesh.material.color.set('#2a2a2a');
    this.model.bodyMesh.material.metalness = 0;
    this.model.body.position.y = -0.15;
    this.model.body.rotation.z = 0.06;
  }
}

/** Every car in the world. Handles car-to-car shoves and gives quick spatial look-ups. */
export class VehicleFleet {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  spawn(type, color, x, z, heading) {
    const v = new Vehicle(type, color, x, z, heading);
    this.scene.add(v.model.root);
    this.list.push(v);
    return v;
  }

  remove(v) {
    this.scene.remove(v.model.root);
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
  }

  nearest(pos, maxDist, filter = () => true) {
    let best = null; let bestD = maxDist;
    for (const v of this.list) {
      if (!filter(v)) continue;
      const d = v.position.distanceTo(pos);
      if (d < bestD) { best = v; bestD = d; }
    }
    return best;
  }

  /** Separate overlapping cars and swap some momentum; returns impact events. */
  resolveCarCollisions() {
    const events = [];
    const n = this.list.length;
    for (let a = 0; a < n; a += 1) {
      const va = this.list[a];
      for (let b = a + 1; b < n; b += 1) {
        const vb = this.list[b];
        const dx = vb.position.x - va.position.x; const dz = vb.position.z - va.position.z;
        const reach = (va.spec.len + vb.spec.len) * 0.36;
        const d2 = dx * dx + dz * dz;
        if (d2 > reach * reach || d2 < 1e-6) continue;
        // a finer test with front/back circles
        const hit = circlePairOverlap(va, vb);
        if (!hit) continue;
        const { nx, nz, depth } = hit;
        const ma = va.spec.mass * (va.driver === 'player' ? 1.4 : 1); const mb = vb.spec.mass;
        const total = ma + mb;
        va.position.x -= nx * depth * (mb / total); va.position.z -= nz * depth * (mb / total);
        vb.position.x += nx * depth * (ma / total); vb.position.z += nz * depth * (ma / total);
        const rvx = vb.velocity.x - va.velocity.x; const rvz = vb.velocity.y - va.velocity.y;
        const vn = rvx * nx + rvz * nz;
        if (vn < 0) {
          const j = (-(1.3) * vn) / (1 / ma + 1 / mb);
          va.velocity.x -= (j / ma) * nx; va.velocity.y -= (j / ma) * nz;
          vb.velocity.x += (j / mb) * nx; vb.velocity.y += (j / mb) * nz;
          for (const v of [va, vb]) {
            const f = v.forward; const r = v.right;
            v.forwardSpeed = v.velocity.x * f.x + v.velocity.y * f.z;
            v.lateralSpeed = v.velocity.x * r.x + v.velocity.y * r.z;
          }
          events.push({ a: va, b: vb, speed: -vn, x: (va.position.x + vb.position.x) / 2, z: (va.position.z + vb.position.z) / 2 });
        }
        va.syncModel(); vb.syncModel();
      }
    }
    return events;
  }
}

function circlePairOverlap(va, vb) {
  let best = null;
  const ra = va.spec.wid / 2; const rb = vb.spec.wid / 2;
  const fa = va.forward; const fb = vb.forward;
  const ha = va.spec.len / 2 - ra; const hb = vb.spec.len / 2 - rb;
  for (const sa of [-1, 0, 1]) {
    const ax = va.position.x + fa.x * ha * sa; const az = va.position.z + fa.z * ha * sa;
    for (const sb of [-1, 0, 1]) {
      const bx = vb.position.x + fb.x * hb * sb; const bz = vb.position.z + fb.z * hb * sb;
      const dx = bx - ax; const dz = bz - az; const d = Math.hypot(dx, dz);
      const depth = ra + rb - d;
      if (depth > 0 && d > 1e-4 && (!best || depth > best.depth)) best = { nx: dx / d, nz: dz / d, depth };
    }
  }
  return best;
}
