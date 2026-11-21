// Pedestrians: locals and tourists strolling the pavement loops around each block and along the
// beach, who scatter from gunfire and speeding cars, get knocked down, drop cash, and are
// recycled around the player. The same Ped class is used for mission goons and police on foot.
import * as THREE from 'three';
import { TRAFFIC_TUNING } from './config.js';
import { createCharacter, animateCharacter, SKIN_TONES, SHIRTS, PANTS, HAIR } from './characterModel.js';
import { CITY_COLS, CITY_ROWS, sidewalkLoop, groundHeightAt, BEACH_X, SEA_X, HARBOR_Z } from './cityLayout.js';
import { rng } from './rng.js';

export class Ped {
  constructor(scene, look, x, z, role = 'civilian') {
    this.character = createCharacter(look);
    scene.add(this.character.root);
    this.scene = scene;
    this.position = new THREE.Vector3(x, groundHeightAt(x, z), z);
    this.facing = rng.range(0, Math.PI * 2);
    this.role = role;        // civilian, goon, officer, contact
    this.health = role === 'civilian' ? 40 : role === 'goon' ? 70 : 90;
    this.down = false;
    this.downTimer = 0;
    this.flee = 0;
    this.fleeFrom = new THREE.Vector3();
    this.loop = null; this.loopIndex = 0; this.loopDir = 1;
    this.speed = 0;
    this.knock = new THREE.Vector3();
    this.hostile = false;
    this.fireCooldown = rng.range(0.5, 1.5);
    this.armed = false;
    this.idle = 0;
  }

  hit(damage, from) {
    if (this.down) return false;
    this.health -= damage;
    const away = this.position.clone().sub(from).setY(0).normalize();
    this.knock.addScaledVector(away, 4);
    this.flee = 8; this.fleeFrom.copy(from);
    if (this.health <= 0) { this.down = true; this.downTimer = 0; return true; }
    return false;
  }

  remove() { this.scene.remove(this.character.root); }
}

function randomLook(role) {
  if (role === 'officer') return { skin: rng.pick(SKIN_TONES), shirt: '#1f3f78', pants: '#141c2c', hair: rng.pick(HAIR), hat: '#101626', vest: '#26304a' };
  if (role === 'goon') return { skin: rng.pick(SKIN_TONES), shirt: rng.pick(['#2b2b2b', '#5a1e1e', '#3c3c54']), pants: '#1b1b1b', hair: rng.pick(HAIR), shades: true };
  const tourist = rng.chance(0.3);
  return { skin: rng.pick(SKIN_TONES), shirt: rng.pick(SHIRTS), pants: rng.pick(PANTS), hair: rng.pick(HAIR), hat: tourist ? rng.pick(['#f4e1b5', '#ffffff', '#ff6b6b']) : null, shades: rng.chance(0.4) };
}

export class PedestrianSystem {
  constructor(scene, collision) {
    this.scene = scene;
    this.collision = collision;
    this.peds = [];
    this.enabled = true;
  }

  spawnPed(x, z, role = 'civilian', look = null) {
    const p = new Ped(this.scene, look || randomLook(role), x, z, role);
    this.peds.push(p);
    return p;
  }

  /** A civilian on the pavement loop of a random block near (x, z), or on the beach. */
  spawnCivilianNear(x, z, minDist, maxDist) {
    for (let tries = 0; tries < 20; tries += 1) {
      if (rng.chance(0.15)) {
        const bx = rng.range(BEACH_X + 6, SEA_X - 8); const bz = rng.range(10, HARBOR_Z - 10);
        const d = Math.hypot(bx - x, bz - z);
        if (d < minDist || d > maxDist) continue;
        const p = this.spawnPed(bx, bz);
        p.loop = [{ x: bx, z: bz }, { x: bx + rng.range(-20, 20), z: bz + rng.range(-30, 30) }];
        return p;
      }
      const i = rng.int(0, CITY_COLS - 1); const j = rng.int(0, CITY_ROWS - 1);
      const loop = sidewalkLoop(i, j);
      const k = rng.int(0, 3); const a = loop[k]; const b = loop[(k + 1) % 4];
      const t = rng.next();
      const px = a.x + (b.x - a.x) * t; const pz = a.z + (b.z - a.z) * t;
      const d = Math.hypot(px - x, pz - z);
      if (d < minDist || d > maxDist) continue;
      const p = this.spawnPed(px, pz);
      p.loop = loop; p.loopIndex = (k + 1) % 4; p.loopDir = 1;
      if (rng.chance(0.5)) { p.loopDir = -1; p.loopIndex = k; }
      return p;
    }
    return null;
  }

  populate(x, z, count = TRAFFIC_TUNING.pedestrians) {
    for (let k = 0; k < count * 3 && this.civilianCount() < count; k += 1) this.spawnCivilianNear(x, z, 4, 150);
  }

  civilianCount() { return this.peds.filter((p) => p.role === 'civilian').length; }

  /** Everyone within `radius` of a gunshot or crash runs away from it. */
  scare(pos, radius) {
    for (const p of this.peds) {
      if (p.role !== 'civilian' || p.down) continue;
      if (p.position.distanceTo(pos) < radius) { p.flee = 7; p.fleeFrom.copy(pos); }
    }
  }

  removePed(p) {
    p.remove();
    const i = this.peds.indexOf(p);
    if (i >= 0) this.peds.splice(i, 1);
  }

  update(dt, focus) {
    for (const p of this.peds) {
      if (p.down) {
        p.downTimer += dt;
        animateCharacter(p.character, dt, 0, { down: true });
        p.position.addScaledVector(p.knock, dt);
        p.knock.multiplyScalar(Math.max(0, 1 - dt * 4));
        p.character.root.position.copy(p.position);
        continue;
      }
      if (p.role === 'civilian') this.walkCivilian(p, dt);
      p.position.addScaledVector(p.knock, dt);
      p.knock.multiplyScalar(Math.max(0, 1 - dt * 6));
      this.collision.resolveCircle(p.position, 0.4, 0);
      p.position.y = groundHeightAt(p.position.x, p.position.z);
      if (p.role === 'civilian') animateCharacter(p.character, dt, p.speed, { flee: p.flee > 0 && p.speed > 3 });
      p.character.root.position.copy(p.position);
      p.character.root.rotation.y = p.facing;
    }
    // recycle civilians far from the player, keep the crowd topped up
    for (const p of [...this.peds]) {
      const far = p.position.distanceTo(focus) > 170;
      if ((p.role === 'civilian' && far) || (p.down && p.downTimer > 40 && far)) this.removePed(p);
    }
    if (this.enabled && this.civilianCount() < TRAFFIC_TUNING.pedestrians) this.spawnCivilianNear(focus.x, focus.z, 60, 150);
  }

  walkCivilian(p, dt) {
    let tx; let tz; let speed;
    if (p.flee > 0) {
      p.flee -= dt;
      const away = p.position.clone().sub(p.fleeFrom).setY(0);
      if (away.lengthSq() < 0.01) away.set(1, 0, 0);
      away.normalize();
      tx = p.position.x + away.x * 5; tz = p.position.z + away.z * 5;
      speed = 6.2;
    } else if (p.loop) {
      if (p.idle > 0) { p.idle -= dt; p.speed = 0; return; }
      const t = p.loop[p.loopIndex];
      tx = t.x; tz = t.z; speed = TRAFFIC_TUNING.pedWalk;
      if (Math.hypot(tx - p.position.x, tz - p.position.z) < 0.8) {
        p.loopIndex = (p.loopIndex + p.loopDir + p.loop.length) % p.loop.length;
        if (rng.chance(0.25)) p.idle = rng.range(1, 4);
      }
    } else { p.speed = 0; return; }
    const dx = tx - p.position.x; const dz = tz - p.position.z; const d = Math.hypot(dx, dz) || 1;
    p.speed += (speed - p.speed) * Math.min(1, dt * 5);
    p.position.x += (dx / d) * p.speed * dt; p.position.z += (dz / d) * p.speed * dt;
    const want = Math.atan2(dx, dz);
    let diff = want - p.facing; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    p.facing += diff * Math.min(1, dt * 8);
  }
}
