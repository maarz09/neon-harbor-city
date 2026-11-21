// Fighting: the player's punches and hitscan gunfire aimed through the crosshair (people, cars
// and walls), enemy and police shots at the player, cars mowing people down, and the crimes,
// panic and effects each of those set off.
import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { rng } from './rng.js';

const tmp = new THREE.Vector3();

/** Distance along a ray to a sphere, or Infinity. */
function raySphere(o, d, c, r) {
  const ox = o.x - c.x; const oy = o.y - c.y; const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return Infinity;
  const t = -b - Math.sqrt(h);
  return t > 0 ? t : Infinity;
}

export class CombatSystem {
  constructor(game) {
    this.game = game;
  }

  /** Handle attack input for a player on foot. */
  updatePlayerAttacks(dt, input) {
    const g = this.game; const p = g.player;
    if (p.inVehicle || p.dead) return;
    if (input.wasPressed('KeyQ') || input.wheel > 0) p.cycleWeapon(1);
    if (input.wheel < 0) p.cycleWeapon(-1);
    if (input.wasPressed('Digit1')) p.weapon = 'fists';
    if (input.wasPressed('Digit2') && p.weapons.pistol > 0) p.weapon = 'pistol';
    if (input.wasPressed('Digit3') && p.weapons.smg > 0) p.weapon = 'smg';
    p.aiming = input.aiming && p.weapon !== 'fists';
    const w = WEAPONS[p.weapon];
    if (p.weapon === 'fists') {
      if (input.clicked && p.punchTimer <= 0) this.punch();
    } else if (input.mouseDown && p.fireCooldown <= 0) {
      if (p.weapons[p.weapon] <= 0) { p.cycleWeapon(1); return; }
      p.fireCooldown = w.cooldown;
      p.weapons[p.weapon] -= 1;
      this.playerShoot(w);
    }
  }

  punch() {
    const g = this.game; const p = g.player;
    p.punchTimer = 0.35;
    g.audio.whoosh();
    const fwd = new THREE.Vector3(Math.sin(p.facing), 0, Math.cos(p.facing));
    let best = null; let bestD = WEAPONS.fists.range + 0.6;
    for (const ped of g.peds.peds) {
      if (ped.down) continue;
      tmp.copy(ped.position).sub(p.position); tmp.y = 0;
      const d = tmp.length();
      if (d < bestD && tmp.normalize().dot(fwd) > 0.3) { best = ped; bestD = d; }
    }
    if (!best) return;
    // turn to face what we hit
    p.facing = Math.atan2(best.position.x - p.position.x, best.position.z - p.position.z);
    const killed = best.hit(WEAPONS.fists.damage, p.position);
    g.audio.punch();
    g.effects.hitPuff(tmp.copy(best.position).setY(best.position.y + 1.5));
    g.camera.addShake(0.15);
    this.afterHit(best, killed, false);
  }

  /** Crimes, panic and rewards after the player hurts someone. */
  afterHit(ped, killed, gun) {
    const g = this.game;
    if (ped.role === 'officer') g.wanted.report(killed ? 'copKiller' : 'copAssault', true);
    else if (ped.role === 'civilian') g.wanted.report(killed ? 'homicide' : 'assault', g.police.activeUnits.length > 0);
    if (ped.role === 'civilian' && ped.flee <= 0) { ped.flee = 6; }
    g.peds.scare(ped.position, gun ? 35 : 12);
    if (killed) {
      g.pickups.dropCash(ped.position, ped.role === 'goon' ? rng.int(40, 120) : rng.int(5, 45));
      if (ped.role === 'goon') g.missions.onGoonDown(ped);
      g.stats.takedowns += 1;
    } else if (ped.role === 'goon') ped.hostile = true;
  }

  /** Hitscan from the camera through the crosshair; the tracer starts at the gun. */
  playerShoot(weapon) {
    const g = this.game; const p = g.player; const cam = g.camera.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    dir.x += (Math.random() - 0.5) * weapon.spread * (p.aiming ? 0.4 : 1);
    dir.y += (Math.random() - 0.5) * weapon.spread * (p.aiming ? 0.4 : 1);
    dir.normalize();
    const origin = cam.position.clone();
    // face the shot
    p.facing = Math.atan2(dir.x, dir.z);
    const muzzle = p.position.clone().add(new THREE.Vector3(Math.sin(p.facing) * 0.6, 1.45, Math.cos(p.facing) * 0.6));
    let bestT = g.collision.rayDistance(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, weapon.range);
    let hitPed = null; let hitCar = null;
    for (const ped of g.peds.peds) {
      if (ped.down) continue;
      for (const hy of [0.7, 1.35]) {
        const t = raySphere(origin, dir, tmp.set(ped.position.x, ped.position.y + hy, ped.position.z), 0.42);
        if (t < bestT) { bestT = t; hitPed = ped; hitCar = null; }
      }
    }
    for (const v of g.fleet.list) {
      if (v === p.vehicle) continue;
      const t = raySphere(origin, dir, tmp.set(v.position.x, 0.9, v.position.z), v.spec.wid * 0.62);
      if (t < bestT) { bestT = t; hitCar = v; hitPed = null; }
    }
    const end = origin.clone().addScaledVector(dir, Math.min(bestT, weapon.range));
    g.effects.tracer(muzzle, end);
    g.effects.muzzleFlash(muzzle);
    g.audio.gunshot(1);
    g.camera.addShake(0.08);
    g.peds.scare(p.position, 40);
    g.traffic.panicNear(p.position.x, p.position.z, 60);
    if (hitPed) {
      const killed = hitPed.hit(weapon.damage, p.position);
      g.effects.hitPuff(end);
      this.afterHit(hitPed, killed, true);
    } else if (hitCar) {
      hitCar.takeDamage(weapon.damage * 0.35);
      g.effects.sparks(end, 8);
      g.audio.clank();
      if (hitCar.isPolice) g.wanted.report('copAssault', true);
    } else if (bestT < Infinity) g.effects.sparks(end, 6, '#ffe8b0');
    if (!hitPed || hitPed.role !== 'goon' || !g.missions.sanctionedViolence()) g.wanted.report('gunfire', g.police.activeUnits.length > 0);
  }

  /** An enemy or officer fires at the player: a tracer, and maybe a hit. */
  npcShoot(from, target, hitChance, damage) {
    const g = this.game; const p = g.player;
    const moving = p.inVehicle ? Math.min(1, Math.abs(p.vehicle.forwardSpeed) / 25) : (p.speed > 5 ? 0.4 : 0);
    const hit = rng.chance(hitChance * (1 - moving * 0.6));
    const muzzle = new THREE.Vector3(from.x, from.y > 0.5 ? from.y : 1.4, from.z);
    const aim = new THREE.Vector3(target.x, 1.1, target.z);
    if (!hit) aim.add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 1.5, (Math.random() - 0.5) * 4));
    g.effects.tracer(muzzle, aim, '#ffb070');
    g.effects.muzzleFlash(muzzle);
    g.audio.gunshot(Math.max(0.15, 1 - muzzle.distanceTo(p.worldPosition) / 60));
    if (!hit) return;
    if (p.inVehicle) {
      p.vehicle.takeDamage(damage * 0.6);
      if (rng.chance(0.35)) g.damagePlayer(damage * 0.6);
      g.effects.sparks(aim, 5);
    } else {
      g.damagePlayer(damage);
      g.effects.hitPuff(aim);
    }
  }

  /** Cars hitting people: knock-downs, and crimes when the player is driving. */
  updateRunOvers() {
    const g = this.game;
    for (const v of g.fleet.list) {
      const speed = Math.hypot(v.velocity.x, v.velocity.y);
      if (speed < 3) continue;
      for (const ped of g.peds.peds) {
        if (ped.down) continue;
        const dx = ped.position.x - v.position.x; const dz = ped.position.z - v.position.z;
        if (dx * dx + dz * dz > 9) continue;
        const f = v.forward;
        const along = Math.abs(dx * f.x + dz * f.z); const side = Math.abs(-dx * f.z + dz * f.x);
        if (along > v.spec.len / 2 + 0.3 || side > v.spec.wid / 2 + 0.35) continue;
        const killed = ped.hit(speed * 5, v.position);
        ped.knock.set(v.velocity.x * 0.6, 0, v.velocity.y * 0.6);
        g.audio.thud();
        if (v.driver === 'player') {
          g.camera.addShake(0.2);
          if (ped.role === 'officer') g.wanted.report(killed ? 'copKiller' : 'copAssault', true);
          else if (ped.role === 'civilian') g.wanted.report(killed ? 'homicide' : 'hitAndRun', false);
          if (killed && ped.role === 'goon') g.missions.onGoonDown(ped);
        }
      }
      // pedestrians jump out of the way of fast cars
      if (speed > 8) g.peds.scare(v.position.clone().addScaledVector(v.forward, 6), 5);
    }
  }
}
