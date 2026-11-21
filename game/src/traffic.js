// Civilian traffic: cars that follow the right-hand lane of the road grid, pick a new street at
// each junction, keep their distance from the car ahead, give way to people in the road, panic
// when shots ring out, and are recycled around the player as they roam the city.
import * as THREE from 'three';
import { TRAFFIC_TUNING } from './config.js';
import { buildRoadGraph, nearestNode } from './cityLayout.js';
import { VEHICLE_TYPES } from './vehicleModels.js';
import { rng } from './rng.js';

const TRAFFIC_MIX = ['sedan', 'sedan', 'sedan', 'coupe', 'suv', 'suv', 'taxi', 'taxi', 'van', 'muscle'];

/** Steering and throttle to drive at `speed` toward a world point. */
export function steerToward(vehicle, tx, tz, speed) {
  const desired = Math.atan2(tx - vehicle.position.x, tz - vehicle.position.z);
  let diff = desired - vehicle.heading;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const steer = THREE.MathUtils.clamp(-diff * 2.2, -1, 1);
  const sharp = Math.abs(diff) > 0.6;
  const want = sharp ? Math.min(speed, 9) : speed;
  const v = vehicle.forwardSpeed;
  const throttle = v < want - 0.5 ? 1 : v > want + 1.5 ? -0.6 : 0.15;
  return { steer, throttle, diff };
}

/** A point on the right-hand lane going from node a to node b, `t` metres from a. */
export function lanePoint(graph, a, b, t) {
  const dx = b.x - a.x; const dz = b.z - a.z; const len = Math.hypot(dx, dz);
  const ux = dx / len; const uz = dz / len;
  return { x: a.x + ux * t - uz * graph.laneOffset, z: a.z + uz * t + ux * graph.laneOffset, len, ux, uz };
}

export class TrafficSystem {
  constructor(fleet, collision) {
    this.fleet = fleet;
    this.collision = collision;
    this.graph = buildRoadGraph();
    this.drivers = [];   // { vehicle, from, to, panic, stuck, ignore }
    this.enabled = true;
  }

  randomRoute(nearX, nearZ, minDist, maxDist) {
    for (let tries = 0; tries < 30; tries += 1) {
      const a = rng.pick(this.graph.nodes);
      const b = this.graph.nodes[rng.pick(a.links)];
      const p = lanePoint(this.graph, a, b, rng.range(12, 52));
      const d = Math.hypot(p.x - nearX, p.z - nearZ);
      if (d >= minDist && d <= maxDist) return { a, b, p };
    }
    return null;
  }

  spawnCar(nearX, nearZ, minDist, maxDist) {
    const route = this.randomRoute(nearX, nearZ, minDist, maxDist);
    if (!route) return null;
    for (const v of this.fleet.list) if (Math.hypot(v.position.x - route.p.x, v.position.z - route.p.z) < 9) return null;
    const type = rng.pick(TRAFFIC_MIX);
    const v = this.fleet.spawn(type, rng.pick(VEHICLE_TYPES[type].colors), route.p.x, route.p.z, Math.atan2(route.b.x - route.a.x, route.b.z - route.a.z));
    v.driver = 'traffic';
    v.velocity.set(Math.sin(v.heading) * 8, Math.cos(v.heading) * 8);
    this.drivers.push({ vehicle: v, from: route.a, to: route.b, panic: 0, stuck: 0, ignore: 0, cruise: TRAFFIC_TUNING.cruise * rng.range(0.85, 1.2) });
    return v;
  }

  /** Fill the city around a point (used at start and by the screenshot scenes). */
  populate(x, z, count = TRAFFIC_TUNING.cars) {
    for (let k = 0; k < count * 3 && this.drivers.length < count; k += 1) this.spawnCar(x, z, 10, 220);
  }

  /** The player (or anyone) took this car: forget its driver AI. */
  release(vehicle) {
    this.drivers = this.drivers.filter((d) => d.vehicle !== vehicle);
  }

  panicNear(x, z, radius) {
    for (const d of this.drivers) if (Math.hypot(d.vehicle.position.x - x, d.vehicle.position.z - z) < radius) d.panic = 8;
  }

  /** Something in front within `range` metres, inside a narrow cone? */
  blockedAhead(v, range, peds, player) {
    const f = v.forward;
    const check = (px, pz, width) => {
      const dx = px - v.position.x; const dz = pz - v.position.z;
      const along = dx * f.x + dz * f.z;
      if (along < 1 || along > range) return false;
      const side = Math.abs(-dx * f.z + dz * f.x);
      return side < width;
    };
    for (const o of this.fleet.list) if (o !== v && check(o.position.x, o.position.z, 2.2)) return true;
    for (const p of peds) if (!p.down && check(p.position.x, p.position.z, 1.6)) return true;
    if (player && check(player.x, player.z, 1.8)) return true;
    return false;
  }

  update(dt, focus, peds, playerPos) {
    const graph = this.graph;
    for (const d of this.drivers) {
      const v = d.vehicle;
      if (v.destroyed) { v.drive(dt, { throttle: 0, steer: 0, handbrake: true }, this.collision); continue; }
      // advance to the next street when the lane end is near
      const end = lanePoint(graph, d.from, d.to, Math.hypot(d.to.x - d.from.x, d.to.z - d.from.z) - 4);
      if (Math.hypot(end.x - v.position.x, end.z - v.position.z) < 6) {
        const options = d.to.links.filter((id) => id !== d.from.id);
        const next = graph.nodes[rng.pick(options.length ? options : d.to.links)];
        d.from = d.to; d.to = next;
      }
      // aim at a point 9 m further along the lane, projected from the car's position
      const seg = lanePoint(graph, d.from, d.to, 0);
      const along = (v.position.x - d.from.x) * seg.ux + (v.position.z - d.from.z) * seg.uz;
      const ahead = Math.min(seg.len - 2, Math.max(6, along + 9));
      const target = lanePoint(graph, d.from, d.to, ahead);
      const cruise = d.panic > 0 ? d.cruise * 1.8 : d.cruise;
      d.panic = Math.max(0, d.panic - dt);
      const ctl = steerToward(v, target.x, target.z, cruise);
      d.ignore = Math.max(0, d.ignore - dt);
      if (d.ignore <= 0 && this.blockedAhead(v, 9 + Math.max(0, v.forwardSpeed) * 0.6, peds, playerPos)) {
        ctl.throttle = v.forwardSpeed > 0.3 ? -1 : 0;
        d.stuck += dt;
        if (d.stuck > 4) { d.ignore = 1.5; d.stuck = 0; }
      } else d.stuck = Math.max(0, d.stuck - dt);
      v.drive(dt, { throttle: ctl.throttle, steer: ctl.steer, handbrake: false }, this.collision);
    }
    this.recycle(focus);
  }

  /** Despawn cars far from the player and spawn fresh ones just out of view. */
  recycle(focus) {
    for (const d of [...this.drivers]) {
      const v = d.vehicle;
      if (v.position.distanceTo(focus) > TRAFFIC_TUNING.despawnRadius) {
        this.release(v);
        this.fleet.remove(v);
      }
    }
    // wrecks and abandoned cars far away are tidied up too
    for (const v of [...this.fleet.list]) {
      if (!v.driver && !v.tag && v.position.distanceTo(focus) > TRAFFIC_TUNING.despawnRadius + 60) this.fleet.remove(v);
    }
    if (this.enabled && this.drivers.length < TRAFFIC_TUNING.cars) this.spawnCar(focus.x, focus.z, 110, 230);
  }

  nearestNodeTo(x, z) { return nearestNode(this.graph, x, z); }
}
