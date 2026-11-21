// Rae Castellan, the player: walking, sprinting and jumping relative to the camera, health and
// armour, money and weapons, and getting into (or dragging a driver out of) and out of cars.
import * as THREE from 'three';
import { PLAYER_TUNING, WEAPONS } from './config.js';
import { createCharacter, animateCharacter } from './characterModel.js';
import { groundHeightAt } from './cityLayout.js';

export class Player {
  constructor(scene) {
    this.character = createCharacter({ skin: '#c68642', shirt: '#ff5d8f', pants: '#1d2d44', hair: '#1b1b1b', shades: true });
    scene.add(this.character.root);
    this.position = new THREE.Vector3(0, 0, 0);
    this.velY = 0;
    this.facing = 0;
    this.speed = 0;
    this.health = PLAYER_TUNING.maxHealth;
    this.armour = 0;
    this.money = 500;
    this.weapons = { fists: Infinity, pistol: 0, smg: 0 };
    this.weapon = 'fists';
    this.vehicle = null;
    this.punchTimer = 0;
    this.fireCooldown = 0;
    this.aiming = false;
    this.dead = false;
    this.invulnerable = 0;
  }

  get inVehicle() { return !!this.vehicle; }
  get worldPosition() { return this.vehicle ? this.vehicle.position : this.position; }

  placeAt(x, z, facing = 0) {
    this.position.set(x, groundHeightAt(x, z), z);
    this.facing = facing;
    this.velY = 0;
    this.syncModel();
  }

  /** Cycle to the next weapon the player has ammo for. */
  cycleWeapon(dir = 1) {
    const order = Object.keys(WEAPONS);
    let k = order.indexOf(this.weapon);
    for (let n = 0; n < order.length; n += 1) {
      k = (k + dir + order.length) % order.length;
      if (this.weapons[order[k]] > 0) { this.weapon = order[k]; return; }
    }
  }

  giveWeapon(name, ammo) {
    this.weapons[name] = (this.weapons[name] || 0) + ammo;
    this.weapon = name;
  }

  /** Damage soaks into armour first. Returns true when this blow is fatal. */
  takeDamage(amount) {
    if (this.dead || this.invulnerable > 0) return false;
    const soak = Math.min(this.armour, amount * 0.7);
    this.armour -= soak;
    this.health = Math.max(0, this.health - (amount - soak));
    if (this.health <= 0) { this.dead = true; return true; }
    return false;
  }

  /** On-foot movement for one step. */
  updateOnFoot(dt, input, cameraRig, collision) {
    const { f, r } = input.moveAxes();
    const sprint = input.isDown('ShiftLeft', 'ShiftRight');
    const camFwd = cameraRig.groundForward();
    const camRight = new THREE.Vector3(-camFwd.z, 0, camFwd.x);
    const move = camFwd.multiplyScalar(f).addScaledVector(camRight, r);
    const moving = move.lengthSq() > 0.01;
    const target = moving ? (sprint && !this.aiming ? PLAYER_TUNING.sprint : PLAYER_TUNING.walk * (this.aiming ? 0.6 : 1)) : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * 10);
    if (moving) {
      move.normalize();
      this.position.addScaledVector(move, this.speed * dt);
      if (!this.aiming) {
        const want = Math.atan2(move.x, move.z);
        let diff = want - this.facing; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.facing += diff * Math.min(1, dt * 12);
      }
    }
    if (this.aiming) this.facing = cameraRig.yaw;
    // gravity, jumping and stepping onto kerbs
    const ground = groundHeightAt(this.position.x, this.position.z);
    if (input.wasPressed('Space') && this.position.y <= ground + 0.02) this.velY = PLAYER_TUNING.jump;
    this.velY -= PLAYER_TUNING.gravity * dt;
    this.position.y += this.velY * dt;
    if (this.position.y < ground) { this.position.y = ground; this.velY = 0; }
    collision.resolveCircle(this.position, PLAYER_TUNING.radius, this.position.y);
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    animateCharacter(this.character, dt, moving ? this.speed : 0, {
      aim: this.aiming && this.weapon !== 'fists', gun: this.weapon !== 'fists',
      punch: this.punchTimer > 0 ? 1 - this.punchTimer / 0.35 : 0,
    });
    this.syncModel();
  }

  syncModel() {
    this.character.root.position.copy(this.position);
    this.character.root.rotation.y = this.facing;
  }

  enterVehicle(vehicle) {
    this.vehicle = vehicle;
    vehicle.driver = 'player';
    this.character.root.visible = false;
    this.aiming = false;
  }

  exitVehicle() {
    const v = this.vehicle;
    if (!v) return;
    const door = v.doorPosition();
    this.vehicle = null;
    v.driver = null;
    v.throttle = 0;
    this.placeAt(door.x, door.z, v.heading);
    this.character.root.visible = true;
  }
}
