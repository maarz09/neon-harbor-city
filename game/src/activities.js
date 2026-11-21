// Side activities between story missions: the Sunset Sprint street race (checkpoints across
// the city against two rival drivers, with a position read-out and prize money) and Bay Cab
// fares (drive any taxi, pick up passengers at the kerb and drop them off before the meter's
// patience runs out). Both are started by walking or driving into their blue markers.
import { CITY } from './config.js';
import { steerToward } from './traffic.js';
import { VEHICLE_TYPES } from './vehicleModels.js';
import { rng } from './rng.js';

const B = CITY.block;
const RACE_START = { x: 6 * B + 3.5, z: 6 * B + 40 };
const RACE_ROUTE = [
  { x: 6 * B + 3.5, z: 5 * B }, { x: 6 * B, z: 2 * B - 3.5 }, { x: 8 * B - 3.5, z: 2 * B }, { x: 8 * B, z: 6 * B + 3.5 },
  { x: 4 * B, z: 6 * B }, { x: 4 * B, z: 7 * B }, { x: 6 * B, z: 7 * B }, { x: 6 * B + 3.5, z: 6 * B + 30 },
];
const RACE_PRIZE = 1500;

export class ActivitySystem {
  constructor(game) {
    this.game = game;
    this.race = null;
    this.fare = null;
    this.raceMarker = null;
    this.cooldown = 0;
    this.bestLap = null;
  }

  get busy() { return !!(this.race || this.fare); }

  /** The race start marker (shown when no story mission is running). */
  placeMarkers() {
    this.game.markers.remove(this.raceMarker);
    this.raceMarker = this.game.markers.add('vehicle', RACE_START.x, RACE_START.z, { radius: 3, label: 'R' });
  }

  update(dt) {
    const g = this.game;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.race) { this.updateRace(dt); return; }
    if (this.fare) { this.updateFare(dt); return; }
    if (g.missions.active || this.cooldown > 0) return;
    const p = g.player; const pos = p.worldPosition;
    if (p.inVehicle && this.raceMarker && Math.hypot(pos.x - RACE_START.x, pos.z - RACE_START.z) < 5 && g.wanted.level === 0) this.startRace();
    else if (p.inVehicle && p.vehicle.type === 'taxi' && Math.abs(p.vehicle.forwardSpeed) < 1 && g.input.wasPressed('KeyT')) this.startFare();
    else if (p.inVehicle && p.vehicle.type === 'taxi' && !this.taxiHintShown) { this.taxiHintShown = true; g.hud.showHint('Bay Cab: stop and press ~T~ to look for fares.', 5); }
  }

  // ---- Sunset Sprint ----------------------------------------------------------------------

  startRace() {
    const g = this.game; const v = g.player.vehicle;
    const rivals = [];
    for (let k = 0; k < 2; k += 1) {
      const type = k ? 'coupe' : 'muscle';
      const r = g.fleet.spawn(type, rng.pick(VEHICLE_TYPES[type].colors), RACE_START.x - 3.5 - k * 3.5, RACE_START.z + 4 + k * 6, Math.PI);
      r.driver = 'racer'; r.tag = 'racer';
      rivals.push({ vehicle: r, cp: 0, done: false, skill: 0.9 + k * 0.06 });
    }
    v.position.set(RACE_START.x, 0, RACE_START.z); v.heading = Math.PI; v.velocity.set(0, 0);
    this.race = { cp: 0, time: 0, countdown: 3, rivals, marker: null, finished: 0 };
    g.markers.remove(this.raceMarker); this.raceMarker = null;
    g.hud.banner('SUNSET SPRINT', 'Street race · first place pays $1,500');
    g.audio.missionStart();
  }

  racePosition() {
    const r = this.race;
    const progress = (cp, pos) => cp * 1000 - Math.hypot(RACE_ROUTE[Math.min(cp, RACE_ROUTE.length - 1)].x - pos.x, RACE_ROUTE[Math.min(cp, RACE_ROUTE.length - 1)].z - pos.z);
    const mine = progress(r.cp, this.game.player.worldPosition);
    return 1 + r.rivals.filter((x) => x.done || progress(x.cp, x.vehicle.position) > mine).length;
  }

  updateRace(dt) {
    const g = this.game; const r = this.race; const p = g.player;
    if (r.countdown > 0) {
      const before = Math.ceil(r.countdown);
      r.countdown -= dt;
      if (p.inVehicle) { p.vehicle.velocity.set(0, 0); }
      if (Math.ceil(r.countdown) !== before) { g.hud.banner(r.countdown > 0 ? String(Math.ceil(r.countdown)) : 'GO!', ''); g.audio.checkpoint(); }
      if (r.countdown <= 0) r.marker = g.markers.add('vehicle', RACE_ROUTE[0].x, RACE_ROUTE[0].z, { radius: 5 });
      for (const x of r.rivals) x.vehicle.drive(dt, { throttle: 0, steer: 0, handbrake: true }, g.collision);
      return;
    }
    r.time += dt;
    for (const x of r.rivals) {
      if (x.done) { x.vehicle.drive(dt, { throttle: 0, steer: 0, handbrake: true }, g.collision); continue; }
      const t = RACE_ROUTE[x.cp];
      const ctl = steerToward(x.vehicle, t.x, t.z, 34 * x.skill);
      x.vehicle.drive(dt, { throttle: ctl.throttle, steer: ctl.steer, handbrake: Math.abs(ctl.diff) > 1 && x.vehicle.forwardSpeed > 14 }, g.collision);
      if (Math.hypot(t.x - x.vehicle.position.x, t.z - x.vehicle.position.z) < 9) { x.cp += 1; if (x.cp >= RACE_ROUTE.length) { x.done = true; r.finished += 1; } }
    }
    if (!p.inVehicle) { this.endRace(false, 'You left your car.'); return; }
    const cp = RACE_ROUTE[r.cp];
    const pos = p.worldPosition;
    if (Math.hypot(cp.x - pos.x, cp.z - pos.z) < 9) {
      r.cp += 1;
      g.audio.checkpoint();
      g.markers.remove(r.marker);
      if (r.cp >= RACE_ROUTE.length) { this.endRace(true); return; }
      r.marker = g.markers.add('vehicle', RACE_ROUTE[r.cp].x, RACE_ROUTE[r.cp].z, { radius: 5 });
    }
    if (r.time > 150) this.endRace(false, 'Too slow.');
  }

  endRace(finished, reason) {
    const g = this.game; const r = this.race;
    g.markers.remove(r.marker);
    const place = finished ? 1 + r.finished : 0;
    for (const x of r.rivals) { x.vehicle.tag = null; x.vehicle.driver = null; }
    this.race = null;
    this.cooldown = 6;
    this.placeMarkers();
    if (!finished) { g.hud.banner('RACE LOST', reason, 'fail'); g.audio.missionFailed(); return; }
    const prize = place === 1 ? RACE_PRIZE : place === 2 ? 500 : 0;
    g.player.money += prize;
    if (!this.bestLap || r.time < this.bestLap) this.bestLap = r.time;
    g.hud.banner(place === 1 ? 'FIRST PLACE' : `PLACE ${place}`, `${r.time.toFixed(1)} s${prize ? `  ·  +$${prize}` : ''}`, place === 1 ? 'pass' : '');
    if (place === 1) g.audio.missionPassed(); else g.audio.checkpoint();
    g.stats.racesWon = (g.stats.racesWon || 0) + (place === 1 ? 1 : 0);
  }

  // ---- Bay Cab fares ----------------------------------------------------------------------

  /** A passenger waits at a kerb 60-200 m away; the destination is picked on pick-up. */
  startFare() {
    const g = this.game; const pos = g.player.worldPosition;
    const spot = this.kerbSpot(pos, 60, 200);
    const ped = g.peds.spawnPed(spot.x, spot.z);
    ped.loop = null;
    this.fare = { stage: 'pickup', ped, spot, marker: g.markers.add('objective', spot.x, spot.z, { radius: 3 }), timer: 60, dest: null };
    g.hud.toast('Fare waiting: pick them up', '');
  }

  kerbSpot(near, minD, maxD) {
    for (let k = 0; k < 40; k += 1) {
      const i = rng.int(0, 7); const j = rng.int(0, 8);
      const x = i * B + rng.range(14, 50); const z = j * B + 5.5;
      const d = Math.hypot(x - near.x, z - near.z);
      if (d > minD && d < maxD) return { x, z };
    }
    return { x: near.x + 80, z: Math.round(near.z / B) * B + 5.5 };
  }

  updateFare(dt) {
    const g = this.game; const f = this.fare; const p = g.player;
    f.timer -= dt;
    if (!p.inVehicle || p.vehicle.type !== 'taxi') { this.endFare('You left the cab.'); return; }
    if (f.timer <= 0) { this.endFare('The passenger gave up.'); return; }
    const pos = p.worldPosition;
    const target = f.stage === 'pickup' ? f.spot : f.dest;
    if (Math.hypot(target.x - pos.x, target.z - pos.z) > 6 || Math.abs(p.vehicle.forwardSpeed) > 3) return;
    g.markers.remove(f.marker);
    if (f.stage === 'pickup') {
      g.peds.removePed(f.ped);
      f.stage = 'dropoff';
      f.dest = this.kerbSpot(pos, 150, 420);
      f.timer = 25 + Math.hypot(f.dest.x - pos.x, f.dest.z - pos.z) / 9;
      f.pay = Math.round(40 + Math.hypot(f.dest.x - pos.x, f.dest.z - pos.z) * 0.6);
      f.marker = g.markers.add('dropoff', f.dest.x, f.dest.z, { radius: 3 });
      g.hud.dialogue([['rae', rng.pick(['Where to?', 'Buckle up.', 'Bay Cab, at your service.'])]]);
    } else {
      const tip = Math.round(f.timer * 2);
      g.player.money += f.pay + tip;
      g.hud.toast(`Fare paid: +$${f.pay}${tip ? ` (+$${tip} tip)` : ''}`, 'cash');
      g.audio.pickup();
      g.stats.fares = (g.stats.fares || 0) + 1;
      this.fare = null;
      this.startFare();
    }
  }

  endFare(reason) {
    const g = this.game; const f = this.fare;
    g.markers.remove(f.marker);
    if (f.stage === 'pickup') g.peds.removePed(f.ped);
    this.fare = null;
    this.cooldown = 2;
    g.hud.toast(`Bay Cab shift over: ${reason}`, 'bad');
  }

  /** Objective line while an activity runs (the HUD prefers it over the story line). */
  objectiveText() {
    if (this.race) {
      const r = this.race;
      if (r.countdown > 0) return 'Get ready…';
      return `Race: checkpoint ~${r.cp + 1}/${RACE_ROUTE.length}~ · position ~${this.racePosition()}/3~ · ${r.time.toFixed(1)} s`;
    }
    if (this.fare) return this.fare.stage === 'pickup' ? `Pick up the ~passenger~ (${Math.ceil(this.fare.timer)} s)` : `Drive the passenger to the ~drop-off~ (${Math.ceil(this.fare.timer)} s)`;
    return '';
  }

  cancel() {
    if (this.race) this.endRace(false, 'Race abandoned.');
    if (this.fare) this.endFare('Shift abandoned.');
  }
}
