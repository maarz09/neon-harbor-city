// The Game: builds Palmira Bay, owns every system (traffic, people, police, missions, combat,
// effects, HUD, audio) and runs the fixed-step simulation: getting in and out of cars, driving,
// crashes and explosions, damage, death and arrest, respawning, saving and the title flyover.
import * as THREE from 'three';
import { FIXED_STEP, PLAYER_TUNING } from './config.js';
import { CollisionWorld } from './collision.js';
import { planCity, PLACES, BEACH_X } from './cityLayout.js';
import { buildGround, buildRoads, buildBlocks, buildBuildings, buildSigns } from './cityMeshes.js';
import { buildTrees, buildLamps, buildHarbor } from './props.js';
import { createSky, createSea } from './skyAndWater.js';
import { DayNightCycle } from './dayNight.js';
import { VehicleFleet } from './vehicles.js';
import { VEHICLE_TYPES } from './vehicleModels.js';
import { TrafficSystem } from './traffic.js';
import { PedestrianSystem } from './pedestrians.js';
import { Player } from './player.js';
import { CameraRig } from './cameraRig.js';
import { InputState } from './input.js';
import { WantedSystem } from './wanted.js';
import { PoliceSystem } from './police.js';
import { CombatSystem } from './combat.js';
import { EffectsSystem } from './effects.js';
import { PickupSystem } from './pickups.js';
import { MarkerSystem } from './markers.js';
import { MissionDirector } from './missions.js';
import { Hud } from './hud.js';
import { Minimap } from './minimap.js';
import { AudioEngine } from './audio.js';
import { Radio } from './radio.js';
import { writeSave } from './save.js';
import { animateCharacter } from './characterModel.js';
import { INTRO_CARD } from './story.js';
import { rng } from './rng.js';

export class Game {
  constructor(canvas, hudRoot) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.cameraObj = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 2400);
    this.collision = new CollisionWorld();

    this.buildWorld();

    this.input = new InputState(canvas);
    this.camera = new CameraRig(this.cameraObj, this.collision);
    this.fleet = new VehicleFleet(this.scene);
    this.traffic = new TrafficSystem(this.fleet, this.collision);
    this.peds = new PedestrianSystem(this.scene, this.collision);
    this.player = new Player(this.scene);
    this.wanted = new WantedSystem();
    this.effects = new EffectsSystem(this.scene);
    this.markers = new MarkerSystem(this.scene);
    this.hud = new Hud(hudRoot);
    this.minimap = new Minimap(this.hud.minimapCanvas);
    this.audio = new AudioEngine();
    this.radio = new Radio(this.audio);
    this.police = new PoliceSystem(this);
    this.combat = new CombatSystem(this);
    this.pickups = new PickupSystem(this);
    this.missions = new MissionDirector(this);
    this.progress = { missionIndex: 0, completed: [], conches: [] };
    this.stats = { carsStolen: 0, takedowns: 0, missions: 0 };
    this.state = 'title';
    this.autopilot = null; // screenshot scenes steer the player's car with this
    this.time = 0;
    this.accumulator = 0;
    this.defeatTimer = 0;
    this.saveCooldown = 0;
    this.wanted.onChange = (level, before) => {
      if (level > before) { this.hud.toast(`Wanted: ${this.wanted.lastCrime}`, 'bad'); }
      else if (level === 0 && before > 0) { this.hud.toast('You lost the cops.', 'good'); }
    };
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  buildWorld() {
    this.plan = planCity(11);
    buildGround(this.scene);
    buildRoads(this.scene);
    buildBlocks(this.scene);
    const buildings = buildBuildings(this.scene, this.plan, this.collision);
    this.signs = buildSigns(this.scene, this.plan);
    buildTrees(this.scene, this.plan, this.collision);
    const lamps = buildLamps(this.scene, this.plan);
    buildHarbor(this.scene, this.plan, this.collision);
    const sky = createSky(this.scene);
    const sea = createSea(this.scene);
    this.dayNight = new DayNightCycle(this.scene, sky, sea, lamps, buildings.material);
  }

  resize() {
    const w = window.innerWidth; const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cameraObj.aspect = w / h;
    this.cameraObj.updateProjectionMatrix();
  }

  /** Parked cars along the kerbs and in lots, so there is always something to steal. */
  spawnParkedCars() {
    const types = ['sedan', 'coupe', 'suv', 'muscle', 'van', 'sedan', 'coupe'];
    for (const spot of this.plan.parking) {
      const t = rng.pick(types);
      const v = this.fleet.spawn(t, rng.pick(VEHICLE_TYPES[t].colors), spot.x, spot.z, spot.rotY);
      v.parked = true;
    }
    // a showroom-fresh Corsair outside the safehouse, and a few kerbside cars
    const sh = PLACES.safehouse;
    this.fleet.spawn('muscle', '#ef476f', sh.x - 6, sh.z + 6, 0).parked = true;
    for (let k = 0; k < 14; k += 1) {
      const i = rng.int(0, 7); const j = rng.int(1, 7);
      const t = rng.pick(types);
      const v = this.fleet.spawn(t, rng.pick(VEHICLE_TYPES[t].colors), i * 64 + 32 + rng.range(-12, 12), j * 64 + 5.6, rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
      v.parked = true;
    }
  }

  /** Clear everything and set up a fresh city around a starting point. */
  resetWorld() {
    this.police.clearAll();
    for (const v of [...this.fleet.list]) this.fleet.remove(v);
    this.traffic.drivers = [];
    for (const p of [...this.peds.peds]) this.peds.removePed(p);
    this.missions.contacts = {};
    this.missions.active = null;
    this.missions.spawned = [];
    this.markers.clear();
    for (const it of [...this.pickups.items]) this.pickups.remove(it);
    this.wanted.clear();
    this.player.vehicle = null;
    this.player.character.root.visible = true;
    this.player.dead = false;
    this.spawnParkedCars();
  }

  newGame() {
    this.progress = { missionIndex: 0, completed: [], conches: [] };
    this.stats = { carsStolen: 0, takedowns: 0, missions: 0 };
    this.resetWorld();
    const p = this.player;
    p.health = 100; p.armour = 0; p.money = 500; p.weapons = { fists: Infinity, pistol: 0, smg: 0 }; p.weapon = 'fists';
    p.placeAt(PLACES.saltAndLime.x + 4, PLACES.saltAndLime.z - 3, Math.PI);
    this.dayNight.hour = 17.6;
    this.finishSetup();
    this.hud.storyCard('PALMIRA BAY', INTRO_CARD);
    this.hud.showHint('Walk into the ~pink marker~ to talk to Mari. ~E~ steals cars, ~Esc~ opens the map.', 9);
  }

  finishSetup() {
    const pos = this.player.worldPosition;
    this.traffic.populate(pos.x, pos.z);
    this.peds.populate(pos.x, pos.z);
    this.missions.setupContacts();
    this.pickups.placeWorldPickups(this.progress.conches);
    if (this.progress.conches.length >= 12) this.pickups.add('smg', PLACES.safehouse.x, PLACES.safehouse.z, 120, { respawn: 120 });
    this.saveMarker = this.markers.add('save', PLACES.safehouse.x + 2, PLACES.safehouse.z, { radius: 1.2, label: 'H' });
    this.camera.yaw = this.player.facing;
    this.camera.snap();
    this.state = 'play';
  }

  autosave() { if (writeSave(this)) this.hud.toast('Progress saved', 'good'); }

  animateNpc(ped, dt, speed, aiming) {
    animateCharacter(ped.character, dt, speed, { aim: aiming && ped.armed, gun: ped.armed });
    ped.character.root.position.copy(ped.position);
    ped.character.root.rotation.y = ped.facing;
  }

  damagePlayer(amount) {
    if (this.player.takeDamage(amount)) this.onDeath();
    this.camera.addShake(0.25);
    this.hud.root.classList.add('hurt');
    clearTimeout(this.hurtTimeout);
    this.hurtTimeout = setTimeout(() => this.hud.root.classList.remove('hurt'), 220);
  }

  onDeath() {
    if (this.state !== 'play') return;
    this.state = 'defeat';
    this.defeatKind = 'dead';
    this.defeatTimer = 4;
    this.audio.wasted();
    this.missions.onPlayerLost();
    if (this.onDefeat) this.onDefeat('dead', 'Coral General patched you up. The bill: $250.');
  }

  onBusted() {
    if (this.state !== 'play') return;
    this.state = 'defeat';
    this.defeatKind = 'busted';
    this.defeatTimer = 4;
    this.audio.missionFailed();
    this.missions.onPlayerLost();
    if (this.onDefeat) this.onDefeat('busted', 'A night in the Bay Precinct and a $300 fine.');
  }

  respawn() {
    const p = this.player;
    if (p.inVehicle) p.exitVehicle();
    const busted = this.defeatKind === 'busted';
    const place = busted ? PLACES.precinct : PLACES.hospital;
    p.money = Math.max(0, p.money - (busted ? 300 : 250));
    p.health = 100; p.dead = false; p.invulnerable = 3;
    if (busted) p.armour = 0;
    p.placeAt(place.x, place.z + 1.5, 0);
    this.wanted.clear();
    this.police.clearAll();
    this.camera.yaw = 0; this.camera.snap();
    this.state = 'play';
  }

  /** E / F: get into the nearest car (stealing it if someone is driving) or get out. */
  toggleVehicle() {
    const p = this.player;
    if (p.inVehicle) {
      if (Math.abs(p.vehicle.forwardSpeed) > 12) return;
      p.exitVehicle();
      this.camera.yaw = p.facing;
      return;
    }
    const v = this.fleet.nearest(p.position, PLAYER_TUNING.enterRange, (c) => !c.destroyed);
    if (!v) return;
    if (v.driver === 'traffic') {
      this.traffic.release(v);
      const door = v.doorPosition();
      const victim = this.peds.spawnPed(door.x, door.z);
      victim.flee = 8; victim.fleeFrom.copy(v.position);
      victim.loop = null;
      this.wanted.report('carjack', this.police.activeUnits.length > 0);
      this.hud.toast(`Stole a ~${v.name}~`, '');
      this.stats.carsStolen += 1;
    } else if (v.driver === 'police') {
      const unit = this.police.units.find((u) => u.vehicle === v);
      if (unit) {
        if (unit.officer) unit.officer.loop = null;
        this.police.units.splice(this.police.units.indexOf(unit), 1);
      }
      v.sirenOn = false;
      this.wanted.report('copAssault', true);
      this.stats.carsStolen += 1;
    } else if (!v.owned && !v.tag) {
      this.wanted.report('carjack', false);
      this.stats.carsStolen += 1;
    }
    v.owned = true;
    v.parked = false;
    p.enterVehicle(v);
    this.audio.uiClick();
    if (this.radio.station < 0) { this.radio.tune(0); }
    this.hud.showRadio(this.radio.stationName);
  }

  /** One fixed simulation step while playing. */
  step(dt) {
    const p = this.player; const input = this.input;
    this.time += dt;
    if (input.wasPressed('KeyE', 'KeyF')) this.toggleVehicle();
    if (input.wasPressed('Enter')) this.hud.skipLine();
    if (input.wasPressed('KeyR') && p.inVehicle) this.hud.showRadio(this.radio.next());
    if (input.wasPressed('KeyH') && p.inVehicle) { this.audio.horn(); this.peds.scare(p.vehicle.position, 10); }
    this.camera.applyMouse(input.mouseDX, input.mouseDY);

    if (p.inVehicle) {
      const { f, r } = input.moveAxes();
      const v = p.vehicle;
      const controls = this.autopilot ? this.autopilot(v) : { throttle: f, steer: r, handbrake: input.isDown('Space') };
      const impact = v.drive(dt, controls, this.collision);
      if (impact > 4) this.onVehicleImpact(v, impact, v.position);
      p.position.copy(v.position);
    } else {
      p.updateOnFoot(dt, input, this.camera, this.collision);
      this.combat.updatePlayerAttacks(dt, input);
    }

    this.traffic.update(dt, p.worldPosition, this.peds.peds, p.inVehicle ? null : p.position);
    for (const e of this.fleet.resolveCarCollisions()) this.onCarCrash(e);
    this.peds.update(dt, p.worldPosition);
    this.police.update(dt);
    this.combat.updateRunOvers();
    this.missions.update(dt);
    this.pickups.update(dt);
    this.markers.update(dt);
    this.updateVehicleEffects(dt);
    this.updateSafehouse(dt);
    this.effects.update(dt);
    this.dayNight.update(dt, p.worldPosition);
    for (const v of this.fleet.list) if (!v.isPolice) v.updateLights(this.time, this.dayNight.nightAmount);
  }

  updateSafehouse(dt) {
    this.saveCooldown = Math.max(0, this.saveCooldown - dt);
    const p = this.player; const pos = p.worldPosition;
    if (p.inVehicle || this.saveCooldown > 0) return;
    if (Math.hypot(pos.x - this.saveMarker.x, pos.z - this.saveMarker.z) < 1.6) {
      this.saveCooldown = 8;
      if (this.wanted.level > 0) { this.hud.toast('Lose the cops before you can save.', 'bad'); return; }
      p.health = 100;
      this.autosave();
    }
  }

  onVehicleImpact(v, speed, pos) {
    v.takeDamage(speed * 1.1);
    this.effects.sparks({ x: pos.x, y: 0.8, z: pos.z }, Math.min(25, speed * 1.5));
    if (v.driver === 'player') { this.camera.addShake(Math.min(1, speed / 20)); this.audio.crash(speed); }
  }

  onCarCrash(e) {
    if (e.speed < 3) return;
    for (const v of [e.a, e.b]) v.takeDamage(e.speed * (v.driver === 'player' ? 0.7 : 1.2));
    const involvesPlayer = e.a.driver === 'player' || e.b.driver === 'player';
    if (involvesPlayer) {
      this.camera.addShake(Math.min(1, e.speed / 18));
      this.audio.crash(e.speed);
      this.effects.sparks({ x: e.x, y: 0.8, z: e.z }, 12);
      const other = e.a.driver === 'player' ? e.b : e.a;
      if (other.isPolice && e.speed > 6) this.wanted.report('copAssault', true);
    }
  }

  /** Skid marks, tyre smoke, damage smoke and fire, and wreck explosions for every car. */
  updateVehicleEffects(dt) {
    for (const v of this.fleet.list) {
      if (v.skidding && Math.abs(v.forwardSpeed) > 3) {
        const right = v.right; const fwd = v.forward;
        for (const s of [1, -1]) {
          const wp = v.position.clone().addScaledVector(fwd, -v.spec.len / 2 + 0.8).addScaledVector(right, s * (v.spec.wid / 2 - 0.2));
          this.effects.skid(`${v.id}${s}`, wp, right);
          if (Math.random() < 0.5) this.effects.tyreSmoke(wp);
        }
        if (v.driver === 'player' && Math.random() < 0.1) this.audio.noiseBurst(0.2, 1200, 4, 0.05, 'bandpass');
      } else { this.effects.endSkid(`${v.id}1`); this.effects.endSkid(`${v.id}-1`); }
      if (v.position.x > BEACH_X && Math.abs(v.forwardSpeed) > 6 && Math.random() < 0.4) this.effects.dust(v.position);
      const hood = v.position.clone().addScaledVector(v.forward, v.spec.len / 2 - 0.6); hood.y = 1.1;
      if (!v.destroyed && v.health < 40 && Math.random() < 0.3) this.effects.carSmoke(hood, v.health < 20);
      if (!v.destroyed && v.health < 15) {
        this.effects.fire(hood);
        v.burnTimer += dt;
        if (v.burnTimer > 4) { v.health = 0; v.destroyed = true; }
      }
      if (v.destroyed && !v.exploded) this.explodeVehicle(v);
      if (v.destroyed && Math.random() < 0.3) this.effects.carSmoke({ x: v.position.x, y: 1.2, z: v.position.z }, true);
    }
    // the player's engine and the sirens
    const p = this.player;
    if (p.inVehicle) this.audio.setEngine(true, p.vehicle.forwardSpeed, p.vehicle.spec.maxSpeed, p.vehicle.throttle);
    else this.audio.setEngine(false, 0, 1, 0);
    let nearest = Infinity;
    for (const u of this.police.units) if (u.vehicle.sirenOn) nearest = Math.min(nearest, u.vehicle.position.distanceTo(p.worldPosition));
    this.audio.setSiren(nearest < 140 ? 1 - nearest / 140 : 0, dt);
  }

  explodeVehicle(v) {
    v.exploded = true;
    v.markWrecked();
    this.effects.explosion(v.position);
    this.audio.explosion();
    const p = this.player;
    const d = v.position.distanceTo(p.worldPosition);
    if (d < 25) this.camera.addShake(1 - d / 25);
    if (p.vehicle === v) { p.exitVehicle(); this.damagePlayer(200); }
    else if (d < 6) this.damagePlayer(60 * (1 - d / 6));
    for (const ped of this.peds.peds) if (!ped.down && ped.position.distanceTo(v.position) < 5) ped.hit(100, v.position);
    for (const o of this.fleet.list) if (o !== v && !o.destroyed && o.position.distanceTo(v.position) < 5) o.takeDamage(40);
    this.peds.scare(v.position, 40);
    if (v.isPolice && d < 80) this.wanted.report('copCarWreck', true);
  }

  /** Advance by real elapsed time in fixed steps. */
  tick(realDt) {
    this.accumulator = Math.min(this.accumulator + realDt, FIXED_STEP * 5);
    while (this.accumulator >= FIXED_STEP) {
      if (this.state === 'play') this.step(FIXED_STEP);
      else if (this.state === 'title') this.titleStep(FIXED_STEP);
      else if (this.state === 'defeat') this.defeatStep(FIXED_STEP);
      this.input.endFrame();
      this.accumulator -= FIXED_STEP;
    }
  }

  defeatStep(dt) {
    this.defeatTimer -= dt;
    this.effects.update(dt);
    this.dayNight.update(dt, this.player.worldPosition);
    if (this.defeatTimer <= 0 && this.onRespawn) this.onRespawn();
  }

  /** Title screen: a slow helicopter-style flyover of Coral Parade while traffic runs. */
  titleStep(dt) {
    this.time += dt;
    const t = this.time * 0.05;
    const focus = new THREE.Vector3(BEACH_X - 20 + Math.sin(t) * 30, 0, 220 + Math.cos(t * 0.7) * 120);
    this.traffic.update(dt, focus, this.peds.peds, null);
    this.fleet.resolveCarCollisions();
    this.peds.update(dt, focus);
    this.effects.update(dt);
    this.dayNight.update(dt, focus);
    for (const v of this.fleet.list) v.updateLights(this.time, this.dayNight.nightAmount);
    this.cameraObj.position.set(focus.x + 70, 38 + Math.sin(t * 2) * 6, focus.z + 60);
    this.cameraObj.lookAt(focus.x - 30, 8, focus.z - 20);
    this.cameraObj.fov = 55; this.cameraObj.updateProjectionMatrix();
  }

  /** Camera, HUD, minimap and music: once per rendered frame. */
  render(realDt) {
    const p = this.player;
    if (this.state === 'play' || this.state === 'defeat' || this.state === 'paused') {
      this.camera.update(Math.min(realDt, 0.05), p.worldPosition, {
        inVehicle: p.inVehicle, heading: p.inVehicle ? p.vehicle.heading : p.facing,
        speed: p.inVehicle ? p.vehicle.forwardSpeed : 0, aiming: p.aiming,
      });
      this.hud.update(realDt, this);
      this.minimap.draw(this, realDt);
    }
    const musicOn = this.state === 'title' || (p.inVehicle && this.state === 'play');
    if (this.state === 'title' && this.radio.station !== 0) this.radio.tune(0);
    this.radio.update(musicOn ? (this.state === 'title' ? 0.7 : 1) : 0);
    this.dayNight.sea.uniforms.fogNear.value = this.scene.fog.near;
    this.dayNight.sea.uniforms.fogFar.value = this.scene.fog.far;
    this.renderer.render(this.scene, this.cameraObj);
  }
}
