// The Bay PD: patrol cars dispatched to match the wanted level, routed along the road grid
// toward the player and driving straight at them once in sight, ramming, shooting from the
// window at three stars and up, officers who jump out to arrest or shoot a player on foot,
// and units that break off and leave once the stars are gone.
import * as THREE from 'three';
import { POLICE_TUNING } from './config.js';
import { steerToward } from './traffic.js';
import { rng } from './rng.js';

export class PoliceSystem {
  constructor(game) {
    this.game = game;
    this.units = [];          // { vehicle, officer, nextNode, prevNode, stuck, reverse, shootTimer, leaving }
    this.bustTimer = 0;
    this.lights = [new THREE.PointLight('#ff2040', 0, 26, 1.6), new THREE.PointLight('#2060ff', 0, 26, 1.6)];
    for (const l of this.lights) game.scene.add(l);
    this.time = 0;
  }

  get activeUnits() { return this.units.filter((u) => !u.leaving && !u.vehicle.destroyed); }

  /** Dispatch a patrol car at a junction about `distance` metres from the player. */
  dispatch(target, distance = POLICE_TUNING.spawnDistance) {
    const { graph } = this.game.traffic;
    let best = null; let bestScore = Infinity;
    for (let k = 0; k < 24; k += 1) {
      const n = rng.pick(graph.nodes);
      const d = Math.hypot(n.x - target.x, n.z - target.z);
      const visible = this.game.collision.lineOfSight(n.x, n.z, target.x, target.z);
      const score = Math.abs(d - distance) + (visible && d < 60 ? 80 : 0);
      if (score < bestScore) { bestScore = score; best = n; }
    }
    const heading = Math.atan2(target.x - best.x, target.z - best.z);
    const v = this.game.fleet.spawn('police', null, best.x, best.z, heading);
    v.driver = 'police'; v.sirenOn = true;
    const unit = { vehicle: v, officer: null, nextNode: best, prevNode: null, stuck: 0, reverse: 0, shootTimer: rng.range(1, 2), leaving: false };
    this.units.push(unit);
    return unit;
  }

  /** Spawn a unit at an exact spot (screenshot scenes and mission set pieces). */
  placeUnit(x, z, heading, speed = 0) {
    const v = this.game.fleet.spawn('police', null, x, z, heading);
    v.driver = 'police'; v.sirenOn = true;
    v.velocity.set(Math.sin(heading) * speed, Math.cos(heading) * speed);
    const unit = { vehicle: v, officer: null, nextNode: this.game.traffic.nearestNodeTo(x, z), prevNode: null, stuck: 0, reverse: 0, shootTimer: 1.5, leaving: false };
    this.units.push(unit);
    return unit;
  }

  /** Choose the junction neighbouring `node` that gets closest to the target. */
  nextJunction(node, prev, target) {
    const { graph } = this.game.traffic;
    let best = null; let bestD = Infinity;
    for (const id of node.links) {
      const n = graph.nodes[id];
      if (prev && n.id === prev.id && node.links.length > 1) continue;
      const d = Math.hypot(n.x - target.x, n.z - target.z);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  update(dt) {
    const g = this.game;
    this.time += dt;
    const player = g.player;
    const target = player.worldPosition;
    const level = g.wanted.level;
    // match the number of units to the stars
    const want = POLICE_TUNING.unitsPerStar[level];
    if (this.activeUnits.length < want && (!this.nextDispatch || this.time > this.nextDispatch)) {
      this.dispatch(target);
      this.nextDispatch = this.time + 2.5;
    }
    if (level === 0) for (const u of this.units) u.leaving = true;

    let seen = false;
    for (const u of [...this.units]) {
      const v = u.vehicle;
      const d = v.position.distanceTo(target);
      if (u.leaving) {
        v.sirenOn = false;
        if (u.officer && !u.officer.down) { g.peds.removePed(u.officer); u.officer = null; }
        if (d > 140 || v.destroyed) { this.despawn(u); continue; }
        this.driveUnit(u, dt, { x: v.position.x + Math.sin(v.heading) * 40, z: v.position.z + Math.cos(v.heading) * 40 }, 12, false);
        continue;
      }
      if (v.destroyed) {
        if (d > 150) this.despawn(u);
        this.updateOfficer(u, dt, target);
        continue;
      }
      const los = d < POLICE_TUNING.sightRadius && g.collision.lineOfSight(v.position.x, v.position.z, target.x, target.z);
      if (los || d < 30) seen = true;
      if (d > 320) { this.despawn(u); continue; }
      const officerOut = !!u.officer;
      if (!player.inVehicle && d < 16 && !officerOut && v.forwardSpeed < 6 && rng.chance(dt * 3)) this.deployOfficer(u);
      if (u.officer) {
        v.drive(dt, { throttle: 0, steer: 0, handbrake: true }, g.collision);
        this.updateOfficer(u, dt, target);
        if (u.officer && !u.officer.down) {
          const od = u.officer.position.distanceTo(target);
          if (od < POLICE_TUNING.sightRadius * 0.6) seen = true;
          // back into the car if the player drives away
          if (player.inVehicle && d > 25 && u.officer.position.distanceTo(v.position) < 3) { g.peds.removePed(u.officer); u.officer = null; }
        }
        continue;
      }
      let tx; let tz;
      if (los && d < 70) {
        const lead = player.inVehicle ? 0.6 : 0.2;
        const pv = player.inVehicle ? player.vehicle.velocity : { x: 0, y: 0 };
        tx = target.x + pv.x * lead; tz = target.z + pv.y * lead;
      } else {
        if (!u.nextNode || Math.hypot(u.nextNode.x - v.position.x, u.nextNode.z - v.position.z) < 9) {
          const from = u.nextNode || g.traffic.nearestNodeTo(v.position.x, v.position.z);
          u.prevNode = from;
          u.nextNode = this.nextJunction(from, u.prevNode === from ? null : u.prevNode, target);
        }
        tx = u.nextNode.x; tz = u.nextNode.z;
      }
      const speed = POLICE_TUNING.speedByStar[level] * (d < 12 && !player.inVehicle ? 0.2 : 1);
      this.driveUnit(u, dt, { x: tx, z: tz }, speed, true);
      if (level >= 3 && los && d < 32) this.shootFromCar(u, dt, d);
    }
    g.wanted.update(dt, seen);
    this.updateBust(dt, target);
    this.updateLights();
  }

  /** Drive toward a point with stuck recovery (reverse out with opposite lock). */
  driveUnit(u, dt, point, speed, aggressive) {
    const v = u.vehicle;
    if (u.reverse > 0) {
      u.reverse -= dt;
      v.drive(dt, { throttle: -1, steer: u.reverseSteer, handbrake: false }, this.game.collision);
      return;
    }
    const ctl = steerToward(v, point.x, point.z, speed);
    if (aggressive && Math.abs(ctl.diff) < 0.4) ctl.throttle = Math.max(ctl.throttle, v.forwardSpeed < speed ? 1 : 0.2);
    if (ctl.throttle > 0.5 && Math.abs(v.forwardSpeed) < 1.2) u.stuck += dt; else u.stuck = Math.max(0, u.stuck - dt * 2);
    if (u.stuck > 1.4) { u.reverse = 1.1; u.reverseSteer = -ctl.steer || 1; u.stuck = 0; }
    v.drive(dt, { throttle: ctl.throttle, steer: ctl.steer, handbrake: Math.abs(ctl.diff) > 1.2 && v.forwardSpeed > 12 }, this.game.collision);
  }

  deployOfficer(u) {
    const door = u.vehicle.doorPosition();
    const o = this.game.peds.spawnPed(door.x, door.z, 'officer');
    o.armed = this.game.wanted.level >= 2 || this.game.player.weapon !== 'fists';
    u.officer = o;
  }

  updateOfficer(u, dt, target) {
    const o = u.officer;
    if (!o) return;
    if (o.down) { u.officer = null; return; }
    const g = this.game;
    const dx = target.x - o.position.x; const dz = target.z - o.position.z; const d = Math.hypot(dx, dz);
    o.facing = Math.atan2(dx, dz);
    const keep = o.armed ? 8 : 1.1;
    let speed = 0;
    if (d > keep) {
      speed = 5.8;
      o.position.x += (dx / d) * speed * dt; o.position.z += (dz / d) * speed * dt;
    }
    o.character.root.rotation.y = o.facing;
    const aiming = o.armed && d < 26;
    o.speed = speed;
    o.fireCooldown -= dt;
    if (aiming && o.fireCooldown <= 0 && g.collision.lineOfSight(o.position.x, o.position.z, target.x, target.z)) {
      o.fireCooldown = rng.range(0.9, 1.6);
      g.combat.npcShoot(o.position, target, 0.45, 9);
    }
    g.animateNpc(o, dt, speed, aiming);
  }

  shootFromCar(u, dt, d) {
    u.shootTimer -= dt;
    if (u.shootTimer > 0) return;
    u.shootTimer = rng.range(0.8, 1.4);
    const from = u.vehicle.position.clone(); from.y = 1.3;
    this.game.combat.npcShoot(from, this.game.player.worldPosition, d < 15 ? 0.45 : 0.3, 7);
  }

  /** Low-level arrest: officers next to a player on foot at one or two stars cuff them. */
  updateBust(dt, target) {
    const g = this.game;
    if (g.wanted.level === 0 || g.player.inVehicle) { this.bustTimer = 0; return; }
    let close = false;
    for (const u of this.units) {
      if (u.officer && !u.officer.down && !u.officer.armed && u.officer.position.distanceTo(target) < 1.9) close = true;
    }
    // a cruiser pulled up right beside a player on foot at low stars counts too
    for (const u of this.units) if (!u.leaving && u.vehicle.position.distanceTo(target) < 3.2 && Math.abs(u.vehicle.forwardSpeed) < 1 && g.wanted.level <= 2) close = true;
    this.bustTimer = close ? this.bustTimer + dt : Math.max(0, this.bustTimer - dt);
    if (this.bustTimer > POLICE_TUNING.bustSeconds) { this.bustTimer = 0; g.onBusted(); }
  }

  /** Two shared point lights ride on the nearest wailing cars, alternating red and blue. */
  updateLights() {
    const focus = this.game.player.worldPosition;
    const wailing = this.units.filter((u) => u.vehicle.sirenOn && !u.vehicle.destroyed)
      .sort((a, b) => a.vehicle.position.distanceTo(focus) - b.vehicle.position.distanceTo(focus));
    const phase = Math.floor(this.time * 7) % 2;
    this.lights.forEach((l, k) => {
      const u = wailing[k];
      if (!u) { l.intensity = 0; return; }
      l.position.copy(u.vehicle.position).setY(2.2);
      l.color.set(phase ? '#ff2040' : '#2060ff');
      l.intensity = 14;
    });
    for (const u of this.units) u.vehicle.updateLights(this.time, this.game.dayNight.nightAmount);
  }

  despawn(u) {
    if (u.officer) this.game.peds.removePed(u.officer);
    this.game.fleet.remove(u.vehicle);
    this.units.splice(this.units.indexOf(u), 1);
  }

  clearAll() { for (const u of [...this.units]) this.despawn(u); this.bustTimer = 0; }

  /** A police car was destroyed or an officer hurt: who is responsible is the caller's business. */
  isPoliceVehicle(v) { return this.units.some((u) => u.vehicle === v); }
}
