// Screenshot scenes behind ?shot=chase|drive|mission|title (with &seed=N). Each one resets the
// city with a fixed seed, sets the clock, places the player, cars, police and mission state,
// plays the real simulation forward for a moment (the player's car on a lane-keeping autopilot)
// and frames the camera, so the same URL always shows the same moment of real gameplay.
import { reseedGlobalRng } from './rng.js';
import { MISSIONS } from './missions.js';
import { PLACES, BEACH_X } from './cityLayout.js';
import { steerToward } from './traffic.js';
import { WEAPONS, FIXED_STEP } from './config.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/** Drive along a straight line (x or z fixed) at a target speed. */
function laneAutopilot(axis, line, dirSign, speed) {
  return (v) => {
    const ahead = 30 * dirSign;
    const tx = axis === 'x' ? line : v.position.x + ahead;
    const tz = axis === 'x' ? v.position.z + ahead : line;
    const ctl = steerToward(v, tx, tz, speed);
    return { throttle: ctl.throttle, steer: ctl.steer, handbrake: false };
  };
}

/** Jump the mission director straight into a step of a mission (for staging). */
function jumpToMissionStep(game, id, index) {
  const m = game.missions;
  const def = MISSIONS.find((d) => d.id === id);
  game.progress.missionIndex = MISSIONS.indexOf(def);
  game.markers.remove(m.contactMarker); m.contactMarker = null;
  m.active = { def, steps: m.buildSteps(id), index };
  const s = m.active.steps[index];
  if (s.start) s.start(m);
}

/** Remove traffic within `radius` metres so nothing parks between the camera and the action. */
function clearTrafficNear(game, x, z, radius) {
  for (const d of [...game.traffic.drivers]) {
    if (Math.hypot(d.vehicle.position.x - x, d.vehicle.position.z - z) < radius) { game.traffic.release(d.vehicle); game.fleet.remove(d.vehicle); }
  }
  for (const v of [...game.fleet.list]) if (v.parked && Math.hypot(v.position.x - x, v.position.z - z) < radius) game.fleet.remove(v);
}

function simulate(game, seconds) {
  const steps = Math.round(seconds / FIXED_STEP);
  for (let k = 0; k < steps; k += 1) { game.step(FIXED_STEP); game.input.endFrame(); }
}

function startPlay(game, x, z, facing, hour) {
  game.resetWorld();
  game.progress = { missionIndex: 0, completed: [], conches: [] };
  game.player.placeAt(x, z, facing);
  game.player.health = 100;
  game.finishSetup();
  game.dayNight.hour = hour;
  game.dayNight.frozen = true;
  game.hud.setVisible(true);
}

const SCENES = {
  /** A police chase down Coral Parade at sunset, three stars, the beach and hotels alongside. */
  chase(game) {
    const laneX = 8 * 64 + 3.5;
    startPlay(game, laneX, 300, Math.PI, 18.25);
    game.progress.missionIndex = 1; game.progress.completed = ['homecoming'];
    game.player.money = 4820;
    const car = game.fleet.spawn('muscle', '#d4a017', laneX, 300, Math.PI);
    car.velocity.set(0, -30); car.owned = true;
    game.player.enterVehicle(car);
    jumpToMissionStep(game, 'borrowedShine', 5);
    car.tag = 'corsair'; game.missions.spawned.push(car);
    game.wanted.setLevel(3);
    clearTrafficNear(game, laneX, 290, 40);
    game.police.placeUnit(laneX - 4.5, 312, Math.PI, 31);
    game.police.placeUnit(laneX - 0.5, 325, Math.PI, 31);
    game.police.placeUnit(laneX - 6, 339, Math.PI, 30);
    game.police.nextDispatch = 999;
    game.traffic.spawnCar(laneX, 200, 30, 90);
    game.autopilot = laneAutopilot('x', laneX, -1, 31);
    simulate(game, 1.6);
    game.camera.yaw = car.heading + Math.PI * 0.78;
    game.camera.pitch = 0.3;
    game.camera.freeLookTimer = 100;
    game.camera.snap();
    game.hud.toast('Wanted: ~Car alarm tripped~', 'bad');
  },

  /** A night delivery run through the downtown towers, neon and lit windows. */
  drive(game) {
    const laneZ = 3 * 64 + 3.5;
    startPlay(game, 90, laneZ, Math.PI / 2, 19.35);
    game.progress.missionIndex = 3; game.progress.completed = ['homecoming', 'borrowedShine', 'paperTrail'];
    game.player.money = 11950;
    const car = game.fleet.spawn('coupe', '#ff70a6', 90, laneZ, Math.PI / 2);
    car.velocity.set(20, 0); car.owned = true;
    game.player.enterVehicle(car);
    jumpToMissionStep(game, 'nightShift', 2);
    game.missions.timer = 112; game.missions.cpIndex = 1;
    game.markers.remove(game.missions.stepMarker);
    game.missions.stepMarker = game.markers.add('dropoff', 7 * 64 + 32, 7 * 64 + 4, { radius: 3.5 });
    game.radio.tune(1);
    game.autopilot = laneAutopilot('z', laneZ, 1, 24);
    simulate(game, 1.4);
    game.camera.yaw = car.heading - 0.3;
    game.camera.pitch = 0.27;
    game.camera.freeLookTimer = 100;
    game.camera.snap();
    game.hud.showRadio(game.radio.stationName);
  },

  /** On foot at Pelican Marina, pistol drawn, Brandt's crew firing back. */
  mission(game) {
    const m = PLACES.marina;
    const px = m.x - 5; const pz = m.z - 6;
    startPlay(game, px, pz, 0, 17.6);
    clearTrafficNear(game, px, pz, 45);
    game.traffic.enabled = false;
    game.progress.missionIndex = 2; game.progress.completed = ['homecoming', 'borrowedShine'];
    game.player.money = 7340; game.player.armour = 60; game.player.health = 78;
    game.player.giveWeapon('pistol', 41);
    jumpToMissionStep(game, 'paperTrail', 3);
    const goons = game.missions.goons;
    goons[0].position.set(m.x - 1, 0.1, m.z + 9);
    goons[1].position.set(m.x + 8, 0.1, m.z + 11);
    goons[2].position.set(m.x - 9, 0.1, m.z + 7);
    goons[2].hit(200, game.player.position);
    for (const gn of goons) gn.hostile = true;
    game.input.aiming = true;
    simulate(game, 0.8);
    const target = goons[0].position;
    game.camera.yaw = Math.atan2(target.x - game.player.position.x, target.z - game.player.position.z) - 0.12;
    game.camera.pitch = 0.16;
    game.camera.snap();
    game.player.aiming = false; // keep the aiming pose but frame the wider third-person view
    game.camera.pitch = 0.22;
    game.player.facing = game.camera.yaw + 0.12;
    game.player.syncModel();
    for (let k = 0; k < 10; k += 1) game.render(FIXED_STEP);
    game.combat.playerShoot(WEAPONS.pistol);
    game.combat.npcShoot(goons[1].position, game.player.position, 0, 7);
    game.player.weapons.pistol -= 1;
    game.hud.dialogue([['mari', 'Three of Brandt\'s boys guard that ledger. Make it quick.']]);
  },

  /** The title screen over a golden-hour flyover. */
  title(game, menus) {
    game.state = 'title';
    game.resetWorld();
    game.traffic.populate(BEACH_X - 20, 220);
    game.peds.populate(BEACH_X - 20, 220);
    game.hud.setVisible(false);
    game.dayNight.hour = 18.6; game.dayNight.frozen = true;
    for (let k = 0; k < 240; k += 1) game.titleStep(FIXED_STEP);
    menus.showTitle();
  },
};

export async function stageShot(game, name, seed, menus) {
  reseedGlobalRng(seed);
  const scene = SCENES[name] || SCENES.title;
  scene(game, menus);
  for (let k = 0; k < 3; k += 1) {
    game.render(FIXED_STEP);
    await nextFrame();
  }
}
