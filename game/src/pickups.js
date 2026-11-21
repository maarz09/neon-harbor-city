// Things to grab: dropped cash, health kits, body armour, guns and ammo, and the twelve hidden
// Golden Conch shells scattered around Palmira Bay (each pays out, and finding them all unlocks
// a reward at the safehouse). Pickups spin and bob so they read from a distance.
import * as THREE from 'three';
import { BEACH_X, HARBOR_Z, PLACES } from './cityLayout.js';
import { CITY } from './config.js';

const B = CITY.block;

export const CONCH_SPOTS = [
  [BEACH_X + 60, 30], [PLACES.lighthouse.x - 6, PLACES.lighthouse.z + 4], [5 * B + 32, 3 * B + 32], [6 * B + 32, 6 * B + 20],
  [-30, 200], [3 * B + 10, 2 * B + 10], [1 * B + 54, 7 * B + 30], [PLACES.marina.x + 2, PLACES.marina.z + 40],
  [7 * B + 10, 7 * B + 50], [4 * B + 32, -30], [0.5 * B, 4 * B + 32], [BEACH_X + 40, HARBOR_Z - 40],
];

const KINDS = {
  cash: { color: '#3ddc84', geo: () => new THREE.BoxGeometry(0.5, 0.12, 0.28) },
  health: { color: '#ff3b5c', geo: () => new THREE.BoxGeometry(0.55, 0.55, 0.2) },
  armour: { color: '#3a86ff', geo: () => new THREE.BoxGeometry(0.6, 0.7, 0.18) },
  pistol: { color: '#e0e0e0', geo: () => new THREE.BoxGeometry(0.2, 0.25, 0.55) },
  smg: { color: '#ffb703', geo: () => new THREE.BoxGeometry(0.2, 0.3, 0.8) },
  conch: { color: '#ffd166', geo: () => new THREE.ConeGeometry(0.35, 0.8, 7).rotateZ(Math.PI / 2) },
};

export class PickupSystem {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.time = 0;
    this.geos = {};
    for (const [k, v] of Object.entries(KINDS)) this.geos[k] = v.geo();
  }

  add(kind, x, z, amount = 0, opts = {}) {
    const mat = new THREE.MeshStandardMaterial({ color: KINDS[kind].color, emissive: KINDS[kind].color, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.4 });
    const mesh = new THREE.Mesh(this.geos[kind], mat);
    mesh.position.set(x, 1, z);
    mesh.castShadow = true;
    this.game.scene.add(mesh);
    const item = { kind, mesh, amount, x, z, respawn: opts.respawn || 0, hidden: 0, id: opts.id };
    this.items.push(item);
    return item;
  }

  dropCash(pos, amount) { this.add('cash', pos.x + (Math.random() - 0.5), pos.z + (Math.random() - 0.5), amount); }

  /** Fixed pickups around the city plus the conches not yet found. */
  placeWorldPickups(foundConches) {
    const p = PLACES;
    this.add('health', p.hospital.x, p.hospital.z + 2, 50, { respawn: 60 });
    this.add('armour', p.precinct.x + 4, p.precinct.z + 2, 50, { respawn: 90 });
    this.add('armour', p.safehouse.x + 2, p.safehouse.z + 4, 100, { respawn: 120 });
    this.add('health', p.safehouse.x + 2, p.safehouse.z - 4, 100, { respawn: 60 });
    this.add('pistol', 6 * B + 10, 6 * B + 32, 24, { respawn: 90 });
    this.add('health', 3 * B + 32, 5 * B + 9, 40, { respawn: 60 });
    CONCH_SPOTS.forEach(([x, z], k) => { if (!foundConches.includes(k)) this.add('conch', x, z, 500, { id: k }); });
  }

  update(dt) {
    const g = this.game; const p = g.player;
    this.time += dt;
    const pos = p.worldPosition;
    for (const it of [...this.items]) {
      if (it.hidden > 0) {
        it.hidden -= dt;
        it.mesh.visible = it.hidden <= 0;
        continue;
      }
      it.mesh.rotation.y += dt * 2;
      it.mesh.position.y = 0.9 + Math.sin(this.time * 3 + it.x) * 0.15;
      const reach = p.inVehicle ? 2.6 : 1.4;
      if (Math.hypot(pos.x - it.x, pos.z - it.z) > reach) continue;
      if (!this.collect(it)) continue;
      if (it.respawn) { it.hidden = it.respawn; it.mesh.visible = false; } else this.remove(it);
    }
  }

  /** Apply a pickup to the player; false leaves it on the ground (already full). */
  collect(it) {
    const g = this.game; const p = g.player;
    switch (it.kind) {
      case 'cash': p.money += it.amount; g.hud.toast(`+$${it.amount}`, 'cash'); break;
      case 'health': if (p.health >= 100) return false; p.health = Math.min(100, p.health + it.amount); g.hud.toast('Health restored', 'good'); break;
      case 'armour': if (p.armour >= 100) return false; p.armour = Math.min(100, p.armour + it.amount); g.hud.toast('Body armour', 'good'); break;
      case 'pistol': p.giveWeapon('pistol', it.amount); g.hud.toast('Hawk 9 Pistol', 'good'); break;
      case 'smg': p.giveWeapon('smg', it.amount); g.hud.toast('Vespa SMG', 'good'); break;
      case 'conch': {
        g.progress.conches.push(it.id);
        p.money += it.amount;
        const n = g.progress.conches.length;
        g.hud.banner('GOLDEN CONCH', `${n} of ${CONCH_SPOTS.length} found  ·  +$${it.amount}`);
        if (n === CONCH_SPOTS.length) g.hud.toast('All conches found! A Vespa SMG waits at the safehouse.', 'good');
        break;
      }
      default: break;
    }
    g.audio.pickup();
    return true;
  }

  remove(it) {
    this.game.scene.remove(it.mesh);
    this.items.splice(this.items.indexOf(it), 1);
  }

  clearDrops() { for (const it of [...this.items]) if (it.kind === 'cash') this.remove(it); }
}
