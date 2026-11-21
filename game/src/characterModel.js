// Blocky low-poly people: hips, torso, head with hair, swinging arms and legs on pivots, so
// one walk cycle animates the player, pedestrians, goons and police officers alike.
import * as THREE from 'three';

const boxCache = new Map();
function box(w, h, d) {
  const k = `${w}|${h}|${d}`;
  if (!boxCache.has(k)) boxCache.set(k, new THREE.BoxGeometry(w, h, d).translate(0, -h / 2, 0));
  return boxCache.get(k);
}
const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  return matCache.get(color);
}

export const SKIN_TONES = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0673a'];
export const SHIRTS = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#ffffff', '#1a535c', '#f7a072', '#9b5de5', '#00bbf9', '#f15bb5', '#2ec4b6', '#e9edc9'];
export const PANTS = ['#2b2d42', '#3d405b', '#6b705c', '#a5a58d', '#1d3557', '#e5e5e5', '#8d6e63'];
export const HAIR = ['#1b1b1b', '#3b2412', '#6b4226', '#d4a373', '#222222', '#b5651d'];

/**
 * Build a person. `look` = { skin, shirt, pants, hair, hat?, vest? }. Returns the root group
 * and the limb pivots the animator swings.
 */
export function createCharacter(look) {
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);
  const legL = new THREE.Group(); const legR = new THREE.Group();
  legL.position.set(0.13, 0, 0); legR.position.set(-0.13, 0, 0);
  for (const leg of [legL, legR]) {
    const m = new THREE.Mesh(box(0.2, 0.9, 0.22), mat(look.pants));
    m.castShadow = true;
    const shoe = new THREE.Mesh(box(0.22, 0.1, 0.3), mat('#202020'));
    shoe.position.set(0, -0.86, 0.04);
    leg.add(m, shoe);
    hips.add(leg);
  }
  const torso = new THREE.Mesh(box(0.5, 0.62, 0.28), mat(look.shirt));
  torso.position.y = 0.66;
  torso.castShadow = true;
  hips.add(torso);
  if (look.vest) {
    const vest = new THREE.Mesh(box(0.54, 0.4, 0.32), mat(look.vest));
    vest.position.y = 0.62;
    hips.add(vest);
  }
  const head = new THREE.Group();
  head.position.y = 0.66;
  const skull = new THREE.Mesh(box(0.28, 0.3, 0.28), mat(look.skin));
  skull.position.y = 0.32; skull.castShadow = true;
  const hair = new THREE.Mesh(box(0.3, 0.1, 0.3), mat(look.hair));
  hair.position.y = 0.34;
  head.add(skull, hair);
  if (look.hat) {
    const hat = new THREE.Mesh(box(0.34, 0.08, 0.38), mat(look.hat));
    hat.position.set(0, 0.4, 0.03);
    head.add(hat);
  }
  if (look.shades) {
    const shades = new THREE.Mesh(box(0.26, 0.06, 0.04), mat('#111111'));
    shades.position.set(0, 0.2, 0.15);
    head.add(shades);
  }
  hips.add(head);
  const armL = new THREE.Group(); const armR = new THREE.Group();
  armL.position.set(0.32, 0.64, 0); armR.position.set(-0.32, 0.64, 0);
  for (const arm of [armL, armR]) {
    const sleeve = new THREE.Mesh(box(0.15, 0.3, 0.17), mat(look.shirt));
    const fore = new THREE.Mesh(box(0.13, 0.36, 0.14), mat(look.skin));
    fore.position.y = -0.3;
    sleeve.castShadow = true;
    arm.add(sleeve, fore);
    hips.add(arm);
  }
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.32), mat('#1d1d1d'));
  gun.position.set(0, -0.62, 0.12);
  gun.visible = false;
  armR.add(gun);
  return { root, hips, legL, legR, armL, armR, head, torso, gun, phase: Math.random() * 6 };
}

/**
 * Pose a character: `speed` in m/s drives the walk cycle; `aim` raises the gun arm; `punch`
 * (0..1) swings the right arm forward; `down` lays the body flat (knocked out).
 */
export function animateCharacter(c, dt, speed, opts = {}) {
  if (opts.down) {
    c.hips.rotation.x = THREE.MathUtils.lerp(c.hips.rotation.x, -Math.PI / 2, Math.min(1, dt * 8));
    c.hips.position.y = THREE.MathUtils.lerp(c.hips.position.y, 0.2, Math.min(1, dt * 8));
    return;
  }
  c.hips.rotation.x = 0; c.hips.position.y = 0.95;
  c.phase += dt * (2 + speed * 1.7);
  const swing = Math.min(1, speed / 4) * 0.75;
  const s = Math.sin(c.phase);
  c.legL.rotation.x = s * swing; c.legR.rotation.x = -s * swing;
  c.armL.rotation.x = -s * swing * 0.8;
  c.armR.rotation.x = s * swing * 0.8;
  c.hips.position.y = 0.95 + Math.abs(Math.cos(c.phase)) * 0.05 * Math.min(1, speed / 2);
  if (opts.aim) { c.armR.rotation.x = -Math.PI / 2; c.armL.rotation.x = -Math.PI / 2.4; c.armL.rotation.z = -0.4; } else c.armL.rotation.z = 0;
  if (opts.punch) c.armR.rotation.x = -Math.PI / 2 * Math.sin(opts.punch * Math.PI);
  if (opts.flee) { c.armL.rotation.x = -2.6; c.armR.rotation.x = -2.6; }
  c.gun.visible = !!opts.gun;
}
