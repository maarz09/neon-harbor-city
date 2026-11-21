// Visual effects: pooled particles (exhaust and wreck smoke, sparks, fire, tyre smoke, dust),
// bullet tracers and muzzle flashes, skid marks laid by drifting tyres, explosion flashes and
// floating cash pop-ups. Everything is allocated once and recycled.
import * as THREE from 'three';
import { paintGlowTexture } from './textures.js';

const MAX_PARTICLES = 900;
const MAX_SKIDS = 700;
const MAX_TRACERS = 40;

class ParticlePool {
  constructor(scene, texture, blending, size) {
    this.alive = 0;
    this.items = [];
    for (let k = 0; k < MAX_PARTICLES; k += 1) this.items.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, grow: 0, drag: 0, lift: 0 });
    this.geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 4);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 4)); // rgba: alpha fades out
    this.material = new THREE.PointsMaterial({ map: texture, size, vertexColors: true, transparent: true, depthWrite: false, blending, sizeAttenuation: true });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
  }

  emit(x, y, z, vx, vy, vz, color, life, drag = 1, lift = 0) {
    const p = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.r = color.r; p.g = color.g; p.b = color.b; p.life = life; p.max = life; p.drag = drag; p.lift = lift;
  }

  update(dt) {
    let n = 0;
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vx *= Math.max(0, 1 - p.drag * dt); p.vz *= Math.max(0, 1 - p.drag * dt);
      p.vy += p.lift * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; }
      const fade = Math.max(0, p.life / p.max);
      this.positions[n * 3] = p.x; this.positions[n * 3 + 1] = p.y; this.positions[n * 3 + 2] = p.z;
      this.colors[n * 4] = p.r; this.colors[n * 4 + 1] = p.g; this.colors[n * 4 + 2] = p.b; this.colors[n * 4 + 3] = fade;
      n += 1;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

export class EffectsSystem {
  constructor(scene) {
    this.scene = scene;
    const glow = paintGlowTexture();
    this.glow = new ParticlePool(scene, glow, THREE.AdditiveBlending, 0.9);   // sparks, fire, flashes
    this.smoke = new ParticlePool(scene, glow, THREE.NormalBlending, 3.2);    // smoke and dust
    this.smoke.material.opacity = 0.45;
    this.big = new ParticlePool(scene, glow, THREE.AdditiveBlending, 6);      // explosion fireballs
    this.flash = new THREE.PointLight('#ffb050', 0, 30, 1.5);
    scene.add(this.flash);
    this.flashTimer = 0;
    this.buildSkids(scene);
    this.buildTracers(scene);
    this.tmpColor = new THREE.Color();
    this.clock = 0;
  }

  buildSkids(scene) {
    this.skidPos = new Float32Array(MAX_SKIDS * 4 * 3);
    const idx = [];
    for (let k = 0; k < MAX_SKIDS; k += 1) idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.skidPos, 3));
    geo.setIndex(idx);
    this.skidGeo = geo;
    this.skidMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#111', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    this.skidMesh.frustumCulled = false;
    scene.add(this.skidMesh);
    this.skidCursor = 0;
    this.lastSkid = new Map();
  }

  buildTracers(scene) {
    this.tracerPos = new Float32Array(MAX_TRACERS * 2 * 3);
    this.tracerCol = new Float32Array(MAX_TRACERS * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3));
    this.tracerGeo = geo;
    this.tracerLife = new Float32Array(MAX_TRACERS);
    this.tracers = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracers.frustumCulled = false;
    scene.add(this.tracers);
    this.tracerCursor = 0;
  }

  /** A skid segment from this wheel's last mark to `pos` (one track per wheel key). */
  skid(key, pos, right, width = 0.28) {
    const last = this.lastSkid.get(key);
    this.lastSkid.set(key, { x: pos.x, z: pos.z, t: this.clock });
    if (!last || this.clock - last.t > 0.12 || Math.hypot(pos.x - last.x, pos.z - last.z) > 3) return;
    const k = this.skidCursor; this.skidCursor = (this.skidCursor + 1) % MAX_SKIDS;
    const y = pos.y + 0.025; const o = k * 12;
    const rx = right.x * width; const rz = right.z * width;
    const a = this.skidPos;
    a[o] = last.x - rx; a[o + 1] = y; a[o + 2] = last.z - rz;
    a[o + 3] = last.x + rx; a[o + 4] = y; a[o + 5] = last.z + rz;
    a[o + 6] = pos.x + rx; a[o + 7] = y; a[o + 8] = pos.z + rz;
    a[o + 9] = pos.x - rx; a[o + 10] = y; a[o + 11] = pos.z - rz;
    this.skidGeo.attributes.position.needsUpdate = true;
  }

  endSkid(key) { this.lastSkid.delete(key); }

  tracer(from, to, color = '#ffe08a') {
    const k = this.tracerCursor; this.tracerCursor = (this.tracerCursor + 1) % MAX_TRACERS;
    this.tracerPos.set([from.x, from.y, from.z, to.x, to.y, to.z], k * 6);
    const c = this.tmpColor.set(color);
    this.tracerCol.set([c.r, c.g, c.b, c.r * 0.3, c.g * 0.3, c.b * 0.3], k * 6);
    this.tracerLife[k] = 0.09;
    this.tracerGeo.attributes.position.needsUpdate = true;
  }

  muzzleFlash(pos) {
    const c = this.tmpColor.set('#ffd27a');
    for (let k = 0; k < 6; k += 1) this.glow.emit(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, c, 0.06);
    this.light(pos, 5, 0.06, '#ffc060');
  }

  sparks(pos, count = 10, color = '#ffd070') {
    const c = this.tmpColor.set(color);
    for (let k = 0; k < count; k += 1) this.glow.emit(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 9, Math.random() * 6, (Math.random() - 0.5) * 9, c, 0.25 + Math.random() * 0.3, 0.5, -14);
  }

  hitPuff(pos) {
    const c = this.tmpColor.set('#c0392b');
    for (let k = 0; k < 8; k += 1) this.glow.emit(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, c, 0.3, 2, -6);
  }

  tyreSmoke(pos) {
    if (Math.random() < 0.6) return;
    const c = this.tmpColor.set('#cfcfcf');
    this.smoke.emit(pos.x, pos.y + 0.3, pos.z, (Math.random() - 0.5), 0.8 + Math.random(), (Math.random() - 0.5), c, 1.2, 1.5, 0.5);
  }

  carSmoke(pos, heavy) {
    const c = this.tmpColor.set(heavy ? '#2a2a2a' : '#9a9a9a');
    this.smoke.emit(pos.x + (Math.random() - 0.5) * 0.6, pos.y, pos.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 2 + Math.random(), (Math.random() - 0.5) * 0.6, c, 2.2, 0.5, 0.6);
  }

  fire(pos) {
    const c = this.tmpColor.set(Math.random() < 0.5 ? '#ff7a1a' : '#ffcc33');
    this.glow.emit(pos.x + (Math.random() - 0.5), pos.y, pos.z + (Math.random() - 0.5), (Math.random() - 0.5), 2.5 + Math.random() * 2, (Math.random() - 0.5), c, 0.5, 0.3, 1);
  }

  dust(pos) {
    const c = this.tmpColor.set('#e6d3a8');
    this.smoke.emit(pos.x, pos.y + 0.2, pos.z, (Math.random() - 0.5) * 2, 0.6, (Math.random() - 0.5) * 2, c, 0.8, 1.5, 0.2);
  }

  explosion(pos) {
    for (let k = 0; k < 60; k += 1) {
      const c = this.tmpColor.set(k % 3 === 0 ? '#ffffff' : k % 3 === 1 ? '#ffb030' : '#ff5010');
      this.big.emit(pos.x, pos.y + 1, pos.z, (Math.random() - 0.5) * 14, Math.random() * 10, (Math.random() - 0.5) * 14, c, 0.5 + Math.random() * 0.6, 2.2, -4);
    }
    for (let k = 0; k < 30; k += 1) this.carSmoke({ x: pos.x, y: pos.y + 1.5, z: pos.z }, true);
    this.sparks({ x: pos.x, y: pos.y + 1, z: pos.z }, 40);
    this.light(pos, 60, 0.5, '#ff9a40');
  }

  light(pos, intensity, time, color) {
    this.flash.position.set(pos.x, pos.y + 1.5, pos.z);
    this.flash.color.set(color);
    this.flash.intensity = intensity;
    this.flashTimer = time;
  }

  update(dt) {
    this.clock += dt;
    this.glow.update(dt); this.smoke.update(dt); this.big.update(dt);
    if (this.flashTimer > 0) { this.flashTimer -= dt; if (this.flashTimer <= 0) this.flash.intensity = 0; }
    let changed = false;
    for (let k = 0; k < MAX_TRACERS; k += 1) {
      if (this.tracerLife[k] <= 0) continue;
      this.tracerLife[k] -= dt;
      if (this.tracerLife[k] <= 0) { this.tracerCol.fill(0, k * 6, k * 6 + 6); changed = true; }
    }
    if (changed) this.tracerGeo.attributes.color.needsUpdate = true;
  }
}
