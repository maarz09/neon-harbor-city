// The mission director: contacts waiting at their venues, each mission a list of steps (talk,
// get in a car, drive somewhere, lose the cops, take out goons, grab an item, beat the clock),
// markers and objective text for the step in progress, pass and fail banners, and rewards.
import * as THREE from 'three';
import { PLACES } from './cityLayout.js';
import { DIALOGUE, ENDING } from './story.js';
import { rng } from './rng.js';

export const MISSIONS = [
  { id: 'homecoming', title: 'Homecoming', giver: 'mari', place: 'saltAndLime', reward: 1000 },
  { id: 'borrowedShine', title: 'Borrowed Shine', giver: 'dez', place: 'okaforKustoms', reward: 2500 },
  { id: 'paperTrail', title: 'Paper Trail', giver: 'mari', place: 'saltAndLime', reward: 4000 },
  { id: 'nightShift', title: 'Night Shift', giver: 'dez', place: 'okaforKustoms', reward: 3000 },
  { id: 'harborLights', title: 'Harbor Lights', giver: 'mari', place: 'saltAndLime', reward: 15000 },
];

const GIVER_LOOKS = {
  mari: { skin: '#e0ac69', shirt: '#2ec4b6', pants: '#f4f1de', hair: '#3b2412', shades: false },
  dez: { skin: '#8d5524', shirt: '#f77f00', pants: '#3d405b', hair: '#111111', hat: '#222222' },
};

/** Step builders. Each returns { text, start(m), update(m, dt) -> true when done, end(m) }. */
const step = {
  talk: (lines) => ({ text: '', start: (m) => m.game.hud.dialogue(lines), update: (m) => !m.game.hud.talking }),
  action: (fn) => ({ text: '', start: fn, update: () => true }),
  enterVehicle: (text, tag) => ({
    text,
    start: (m) => {
      if (!tag) return;
      const v = m.taggedVehicle(tag);
      if (v) m.stepMarker = m.game.markers.add('vehicle', v.position.x, v.position.z, { follow: v });
    },
    update: (m) => m.game.player.inVehicle && (!tag || m.game.player.vehicle.tag === tag),
  }),
  goto: (text, place, opts = {}) => ({
    text,
    start: (m) => { m.stepMarker = m.game.markers.add(opts.kind || 'objective', place.x, place.z, { radius: opts.radius || 3 }); },
    update: (m) => {
      const p = m.game.player;
      if (opts.tag && !(p.inVehicle && p.vehicle.tag === opts.tag)) { m.hint = `Get back in the ${m.taggedVehicle(opts.tag)?.name || 'car'}.`; return false; }
      if (opts.inVehicle && !p.inVehicle) { m.hint = 'Get a vehicle.'; return false; }
      if (opts.noWanted && m.game.wanted.level > 0) { m.hint = 'Lose the cops first.'; return false; }
      m.hint = '';
      const pos = p.worldPosition;
      return Math.hypot(pos.x - place.x, pos.z - place.z) < (opts.radius || 3) + (p.inVehicle ? 2 : 0);
    },
  }),
  loseWanted: (text) => ({ text, update: (m) => m.game.wanted.level === 0 }),
  eliminate: (text, spawn) => ({
    text,
    start: (m) => { m.goons = spawn(m); m.sanctioned = true; m.goons.forEach((g) => { g.marker = m.game.markers.add('target', g.position.x, g.position.z, { follow: g }); }); },
    update: (m) => {
      for (const gn of m.goons) if (gn.down && gn.marker) { m.game.markers.remove(gn.marker); gn.marker = null; }
      const left = m.goons.filter((gn) => !gn.down).length;
      m.counter = left ? `${left} left` : '';
      return left === 0;
    },
    end: (m) => { m.sanctioned = false; m.counter = ''; },
  }),
  pickup: (text, place, onPick) => ({
    text,
    start: (m) => {
      m.stepMarker = m.game.markers.add('objective', place.x, place.z, { radius: 1.4 });
      m.stepItem = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: '#c9a227', emissive: '#806010' }));
      m.stepItem.position.set(place.x, 1, place.z);
      m.game.scene.add(m.stepItem);
    },
    update: (m, dt) => {
      m.stepItem.rotation.y += dt * 2;
      const pos = m.game.player.worldPosition;
      if (Math.hypot(pos.x - place.x, pos.z - place.z) > 1.8) return false;
      m.game.scene.remove(m.stepItem);
      m.game.audio.pickup();
      if (onPick) onPick(m);
      return true;
    },
  }),
  checkpoints: (text, points, seconds) => ({
    text,
    start: (m) => { m.cpIndex = 0; m.timer = seconds; m.stepMarker = m.game.markers.add('dropoff', points[0].x, points[0].z, { radius: 3.5 }); },
    update: (m, dt) => {
      m.timer -= dt;
      if (m.timer <= 0) { m.fail('You ran out of time.'); return false; }
      const pos = m.game.player.worldPosition;
      const cp = points[m.cpIndex];
      m.counter = `${m.cpIndex}/${points.length} delivered`;
      if (!m.game.player.inVehicle) { m.hint = 'Get a vehicle.'; return false; }
      m.hint = '';
      if (Math.hypot(pos.x - cp.x, pos.z - cp.z) > 6) return false;
      m.game.audio.checkpoint();
      m.game.hud.toast(`Package ${m.cpIndex + 1} delivered`, 'cash');
      m.cpIndex += 1;
      m.game.markers.remove(m.stepMarker);
      if (m.cpIndex >= points.length) { m.timer = 0; m.counter = ''; return true; }
      m.stepMarker = m.game.markers.add('dropoff', points[m.cpIndex].x, points[m.cpIndex].z, { radius: 3.5 });
      return false;
    },
  }),
};

export class MissionDirector {
  constructor(game) {
    this.game = game;
    this.active = null;     // { def, steps, index }
    this.stepMarker = null;
    this.contactMarker = null;
    this.contacts = {};
    this.goons = [];
    this.sanctioned = false;
    this.hint = '';
    this.counter = '';
    this.timer = 0;
    this.spawned = [];      // vehicles and props owned by the mission
    this.cooldown = 0;
  }

  get progress() { return this.game.progress; }
  get nextMission() { return MISSIONS[this.progress.missionIndex] || null; }

  sanctionedViolence() { return this.sanctioned; }

  /** Place the contacts (Mari at the bar, Dez at the garage) and the next mission's marker. */
  setupContacts() {
    for (const [who, place] of [['mari', PLACES.saltAndLime], ['dez', PLACES.okaforKustoms]]) {
      if (this.contacts[who]) continue;
      const ped = this.game.peds.spawnPed(place.x + 2.2, place.z + 1.2, 'contact', GIVER_LOOKS[who]);
      ped.facing = Math.PI;
      ped.health = 9999;
      this.contacts[who] = ped;
    }
    this.refreshContactMarker();
  }

  refreshContactMarker() {
    this.game.markers.remove(this.contactMarker);
    this.contactMarker = null;
    const next = this.nextMission;
    if (!next || this.active) return;
    const place = PLACES[next.place];
    this.contactMarker = this.game.markers.add('contact', place.x, place.z, { radius: 2, label: next.giver === 'mari' ? 'M' : 'D' });
  }

  taggedVehicle(tag) { return this.game.fleet.list.find((v) => v.tag === tag) || null; }

  spawnTaggedCar(type, color, x, z, heading, tag) {
    const v = this.game.fleet.spawn(type, color, x, z, heading);
    v.tag = tag;
    this.spawned.push(v);
    return v;
  }

  spawnGoons(center, count, spread = 6) {
    const list = [];
    for (let k = 0; k < count; k += 1) {
      const a = (k / count) * Math.PI * 2;
      const gn = this.game.peds.spawnPed(center.x + Math.cos(a) * spread * rng.range(0.6, 1), center.z + Math.sin(a) * spread * rng.range(0.6, 1), 'goon');
      gn.armed = true;
      list.push(gn);
    }
    return list;
  }

  buildSteps(id) {
    const g = this.game; const P = PLACES;
    switch (id) {
      case 'homecoming': return [
        step.action(() => this.spawnTaggedCar('coupe', '#ff70a6', P.saltAndLime.x - 8, P.saltAndLime.z - 2.8, Math.PI / 2, 'mari-car')),
        step.talk(DIALOGUE.homecoming),
        step.enterVehicle('Get in Mari\'s ~Solace Coupe~.', 'mari-car'),
        step.goto('Drive to ~Okafor Kustoms~.', P.okaforKustoms, { tag: 'mari-car', kind: 'dropoff', radius: 4 }),
        step.talk(DIALOGUE.homecomingDone),
      ];
      case 'borrowedShine': return [
        step.talk(DIALOGUE.borrowedShine),
        step.action(() => this.spawnTaggedCar('muscle', '#d4a017', P.brandtTower.x - 10, P.brandtTower.z + 3.5, Math.PI / 2, 'corsair')),
        step.goto('Go to ~Brandt Tower~.', P.brandtTower, { radius: 10 }),
        step.enterVehicle('Steal the gold ~Corsair GT~.', 'corsair'),
        step.action(() => { g.wanted.report('alarm', true); g.hud.toast('The alarm is screaming!', 'bad'); g.audio.alarm(); }),
        step.loseWanted('Lose the ~cops~.'),
        step.goto('Bring the Corsair to ~Okafor Kustoms~.', P.okaforKustoms, { tag: 'corsair', kind: 'dropoff', radius: 4, noWanted: true }),
        step.talk(DIALOGUE.borrowedShineDone),
      ];
      case 'paperTrail': return [
        step.talk(DIALOGUE.paperTrail),
        step.action(() => { g.player.giveWeapon('pistol', 48); g.hud.toast('Hawk 9 Pistol  ·  hold right mouse to aim', 'good'); }),
        step.goto('Go to ~Pelican Marina~.', P.marina, { radius: 14 }),
        step.eliminate('Take out Brandt\'s ~crew~.', () => this.spawnGoons(P.marina, 3, 7)),
        step.pickup('Grab the ~ledger~.', { x: P.marina.x, z: P.marina.z + 4 }),
        step.goto('Take the ledger to the ~Salt & Lime~.', P.saltAndLime, { kind: 'dropoff' }),
        step.talk(DIALOGUE.paperTrailDone),
      ];
      case 'nightShift': return [
        step.talk(DIALOGUE.nightShift),
        step.enterVehicle('Get in a ~vehicle~.'),
        step.checkpoints('Deliver the ~packages~.', [
          { x: 6 * 64 + 4, z: 2 * 64 + 32 }, { x: 7 * 64 + 32, z: 7 * 64 + 4 }, { x: 2 * 64 + 4, z: 4 * 64 + 32 },
        ], 150),
        step.goto('Return to ~Okafor Kustoms~.', P.okaforKustoms, { inVehicle: true, kind: 'dropoff', radius: 4 }),
        step.talk(DIALOGUE.nightShiftDone),
      ];
      case 'harborLights': return [
        step.talk(DIALOGUE.harborLights),
        step.action(() => { g.player.armour = Math.max(g.player.armour, 60); g.player.giveWeapon('pistol', 36); }),
        step.goto('Go to the ~Pier 9 warehouse~.', P.warehouse, { radius: 14 }),
        step.eliminate('Take out the ~guards~.', () => this.spawnGoons(P.warehouse, 4, 9)),
        step.pickup('Grab Brandt\'s ~cash~.', { x: P.warehouse.x + 3, z: P.warehouse.z }, () => { g.wanted.setLevel(3); g.hud.toast('Silent alarm! Three stars.', 'bad'); }),
        step.enterVehicle('Get a ~getaway car~.'),
        step.loseWanted('Lose the ~cops~.'),
        step.goto('Meet Mari at the ~beach safehouse~.', P.safehouse, { kind: 'dropoff', radius: 4, noWanted: true }),
        step.talk(DIALOGUE.harborLightsDone),
      ];
      default: return [];
    }
  }

  start(def) {
    this.game.markers.remove(this.contactMarker);
    this.contactMarker = null;
    this.active = { def, steps: this.buildSteps(def.id), index: -1 };
    this.game.hud.banner(def.title.toUpperCase(), 'Mission');
    this.game.audio.missionStart();
    this.advance();
  }

  advance() {
    const a = this.active;
    const prev = a.steps[a.index];
    if (prev && prev.end) prev.end(this);
    this.game.markers.remove(this.stepMarker);
    this.stepMarker = null;
    a.index += 1;
    if (a.index >= a.steps.length) { this.complete(); return; }
    const s = a.steps[a.index];
    if (s.start) s.start(this);
  }

  complete() {
    const def = this.active.def;
    this.cleanup(false);
    this.active = null;
    const g = this.game;
    g.player.money += def.reward;
    this.progress.missionIndex += 1;
    this.progress.completed.push(def.id);
    g.hud.banner('JOB DONE', `${def.title}  ·  +$${def.reward.toLocaleString('en-US')}`, 'pass');
    g.audio.missionPassed();
    g.stats.missions += 1;
    if (!this.nextMission) g.hud.storyCard('THE END?', ENDING);
    this.cooldown = 3;
    this.refreshContactMarker();
    g.autosave();
  }

  fail(reason) {
    if (!this.active) return;
    const def = this.active.def;
    this.cleanup(true);
    this.active = null;
    this.game.hud.banner('JOB FAILED', reason || def.title, 'fail');
    this.game.audio.missionFailed();
    this.cooldown = 4;
    this.refreshContactMarker();
  }

  cleanup(removeVehicles) {
    this.game.markers.remove(this.stepMarker);
    this.stepMarker = null;
    for (const gn of this.goons) { if (gn.marker) this.game.markers.remove(gn.marker); if (!gn.down) this.game.peds.removePed(gn); }
    this.goons = [];
    this.sanctioned = false;
    this.hint = ''; this.counter = ''; this.timer = 0;
    for (const v of this.spawned) {
      if (removeVehicles && this.game.player.vehicle !== v) this.game.fleet.remove(v);
      else v.tag = null;
    }
    this.spawned = [];
    this.game.hud.stopDialogue();
  }

  onGoonDown() { /* counted in the eliminate step */ }

  /** Called when the player dies or is arrested. */
  onPlayerLost() { if (this.active) this.fail('Rae didn\'t make it.'); }

  update(dt) {
    const g = this.game;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.updateGoons(dt);
    for (const c of Object.values(this.contacts)) {
      const pos = g.player.worldPosition;
      c.facing = Math.atan2(pos.x - c.position.x, pos.z - c.position.z);
      g.animateNpc(c, dt, 0, false);
    }
    if (!this.active) {
      const next = this.nextMission;
      if (!next || this.cooldown > 0 || g.wanted.level > 0 || g.activities.busy) return;
      const place = PLACES[next.place];
      const pos = g.player.worldPosition;
      if (!g.player.inVehicle && Math.hypot(pos.x - place.x, pos.z - place.z) < 2.5) this.start(next);
      return;
    }
    const a = this.active;
    const s = a.steps[a.index];
    if (this.tagGone()) { this.fail('The car was wrecked.'); return; }
    if (s.update(this, dt) && this.active === a) this.advance();
  }

  /** A mission car the current step needs was destroyed. */
  tagGone() {
    for (const v of this.spawned) if (v.destroyed && v.tag) return true;
    return false;
  }

  /** Brandt's goons: wait until the player is close, then fight back with pistols. */
  updateGoons(dt) {
    const g = this.game;
    const target = g.player.worldPosition;
    for (const gn of this.goons) {
      if (gn.down) continue;
      const dx = target.x - gn.position.x; const dz = target.z - gn.position.z; const d = Math.hypot(dx, dz);
      if (d < 28) gn.hostile = true;
      let speed = 0;
      if (gn.hostile) {
        gn.facing = Math.atan2(dx, dz);
        if (d > 14) { speed = 4.5; gn.position.x += (dx / d) * speed * dt; gn.position.z += (dz / d) * speed * dt; }
        gn.fireCooldown -= dt;
        if (gn.fireCooldown <= 0 && d < 30 && g.collision.lineOfSight(gn.position.x, gn.position.z, target.x, target.z)) {
          gn.fireCooldown = rng.range(1.1, 1.9);
          g.combat.npcShoot(gn.position, target, 0.3, 7);
        }
      }
      g.animateNpc(gn, dt, speed, gn.hostile);
    }
  }

  /** Objective line for the HUD: ~words~ are highlighted. */
  objectiveText() {
    if (!this.active) {
      const next = this.nextMission;
      if (!next) return 'Free roam: find the ~Golden Conches~.';
      return `Meet ${next.giver === 'mari' ? '~Mari~ at the Salt & Lime' : '~Dez~ at Okafor Kustoms'} for "${next.title}".`;
    }
    const s = this.active.steps[this.active.index];
    return this.hint || s.text || '';
  }

  /** Where the active objective is, for the minimap's route blip. */
  objectivePosition() {
    const m = this.stepMarker || this.contactMarker;
    return m ? { x: m.x, z: m.z } : null;
  }
}
