// Low-poly car models built from boxes: each model is a body mesh (paint, glass, trim in vertex
// colours), a light mesh (head and tail lamps), four wheels that spin and steer, and a night
// glow sprite set. Every make and name here is invented for Palmira Bay.
import * as THREE from 'three';
import { GeometryBatch } from './geometryBatch.js';
import { paintGlowTexture } from './textures.js';

export const VEHICLE_TYPES = {
  coupe: { name: 'Solace Coupe', len: 4.3, wid: 1.9, hgt: 0.62, cabin: [2.0, 0.55, 1.6], cabinZ: -0.3, wheelR: 0.36, maxSpeed: 46, accel: 1.15, mass: 1.0, colors: ['#e63946', '#f4a261', '#2a9d8f', '#ffffff', '#1d3557', '#ff70a6'] },
  sedan: { name: 'Marlin Sedan', len: 4.7, wid: 1.95, hgt: 0.75, cabin: [2.5, 0.65, 1.7], cabinZ: -0.15, wheelR: 0.36, maxSpeed: 38, accel: 0.9, mass: 1.1, colors: ['#bfc5cc', '#2b2d42', '#8d99ae', '#6d597a', '#e9c46a', '#3a86ff', '#f1faee'] },
  suv: { name: 'Bastion SUV', len: 4.9, wid: 2.1, hgt: 1.0, cabin: [3.0, 0.8, 1.9], cabinZ: -0.3, wheelR: 0.44, maxSpeed: 34, accel: 0.85, mass: 1.5, colors: ['#222222', '#ffffff', '#5c677d', '#7f5539', '#264653'] },
  taxi: { name: 'Bay Cab', len: 4.7, wid: 1.95, hgt: 0.75, cabin: [2.5, 0.65, 1.7], cabinZ: -0.15, wheelR: 0.36, maxSpeed: 37, accel: 0.9, mass: 1.1, colors: ['#ffc300'] },
  van: { name: 'Pelican Van', len: 5.4, wid: 2.1, hgt: 1.7, cabin: [1.2, 0.5, 2.0], cabinZ: 1.4, wheelR: 0.42, maxSpeed: 30, accel: 0.7, mass: 1.8, colors: ['#ffffff', '#f6bd60', '#84a59d', '#90e0ef'] },
  muscle: { name: 'Corsair GT', len: 4.6, wid: 2.0, hgt: 0.66, cabin: [1.9, 0.52, 1.6], cabinZ: -0.5, wheelR: 0.4, maxSpeed: 52, accel: 1.3, mass: 1.15, colors: ['#d4a017', '#7b2cbf', '#06d6a0', '#ef476f'] },
  police: { name: 'Bay PD Interceptor', len: 4.8, wid: 2.0, hgt: 0.75, cabin: [2.4, 0.65, 1.75], cabinZ: -0.2, wheelR: 0.38, maxSpeed: 50, accel: 1.3, mass: 1.3, colors: ['#10141c'] },
};

const GLASS = new THREE.Color('#22364a');
const TRIM = new THREE.Color('#1a1a1a');
const CHROME = new THREE.Color('#c9ced6');
const wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshStandardMaterial({ color: '#1c1c1c', roughness: 0.9 });
const hubMat = new THREE.MeshStandardMaterial({ color: '#c0c4c8', metalness: 0.6, roughness: 0.3 });
const hubGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.04, 8).rotateZ(Math.PI / 2);
const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
let glowTexture = null;
const bodyCache = new Map();

function bodyGeometry(type, color) {
  const key = `${type}|${color}`;
  if (bodyCache.has(key)) return bodyCache.get(key);
  const t = VEHICLE_TYPES[type];
  const paint = new THREE.Color(color);
  const g = new GeometryBatch();
  const L = t.len; const W = t.wid; const H = t.hgt; const base = t.wheelR * 0.75;
  // lower body, slightly narrower skirt, hood and trunk taper
  g.addBox(0, base + H / 2, 0, W, H, L, paint);
  g.addBox(0, base + 0.08, 0, W + 0.04, 0.16, L + 0.06, TRIM);
  g.addBox(0, base + H * 0.55, L / 2 + 0.03, W * 0.92, 0.22, 0.1, TRIM);       // front grille
  g.addBox(0, base + H * 0.35, -L / 2 - 0.03, W * 0.94, 0.18, 0.1, TRIM);      // rear bumper
  const [cl, ch, cw] = t.cabin;
  const cy = base + H + ch / 2;
  // the glasshouse narrows toward the roof so the windscreen and rear window slope
  const taper = type === 'van' ? 0.08 : type === 'suv' ? 0.18 : 0.36;
  const shift = type === 'van' ? 0 : -cl * 0.06;
  g.addBox(0, cy, t.cabinZ, cw, ch, cl, GLASS, { taper, taperShift: shift, taperX: 0.1 });
  g.addBox(0, cy + ch / 2 + 0.03, t.cabinZ + shift, cw * 0.9, 0.07, cl * (1 - taper) * 0.98, paint);  // roof
  g.addBox(cw / 2 - 0.05, cy, t.cabinZ, 0.06, ch, 0.12, paint);                // B pillars
  g.addBox(-cw / 2 + 0.05, cy, t.cabinZ, 0.06, ch, 0.12, paint);
  g.addBox(W / 2 + 0.06, base + H * 0.9, t.cabinZ + cl / 2 - 0.2, 0.12, 0.1, 0.22, TRIM); // mirrors
  g.addBox(-W / 2 - 0.06, base + H * 0.9, t.cabinZ + cl / 2 - 0.2, 0.12, 0.1, 0.22, TRIM);
  g.addBox(W / 2 + 0.01, base + H * 0.55, 0, 0.02, 0.05, L * 0.7, CHROME);    // side strips
  g.addBox(-W / 2 - 0.01, base + H * 0.55, 0, 0.02, 0.05, L * 0.7, CHROME);
  if (type === 'van') {
    g.addBox(0, base + H + 0.35, -0.7, W, 0.7, L - 1.4, paint);
    g.addBox(W / 2 + 0.01, base + H * 0.7, -0.6, 0.02, 0.5, 2.6, new THREE.Color('#e76f51'));
    g.addBox(-W / 2 - 0.01, base + H * 0.7, -0.6, 0.02, 0.5, 2.6, new THREE.Color('#e76f51'));
  }
  if (type === 'muscle') {
    g.addBox(0, base + H + 0.06, 1.2, 0.5, 0.1, 1.3, TRIM);                    // hood scoop
    g.addBox(0, base + H + 0.25, -L / 2 + 0.2, W * 0.9, 0.06, 0.35, TRIM);      // spoiler
    g.addBox(W * 0.38, base + H + 0.12, -L / 2 + 0.25, 0.08, 0.25, 0.08, TRIM);
    g.addBox(-W * 0.38, base + H + 0.12, -L / 2 + 0.25, 0.08, 0.25, 0.08, TRIM);
    g.addBox(0.3, base + H + 0.005, 0, 0.18, 0.02, L * 0.98, new THREE.Color('#111111'));
    g.addBox(-0.3, base + H + 0.005, 0, 0.18, 0.02, L * 0.98, new THREE.Color('#111111'));
  }
  if (type === 'taxi') {
    g.addBox(0, cy + ch / 2 + 0.2, t.cabinZ, 0.7, 0.25, 0.3, new THREE.Color('#ffffff'));
    for (let k = -3; k <= 3; k += 1) g.addBox(W / 2 + 0.012, base + H * 0.3, k * 0.4, 0.02, 0.16, 0.2, k % 2 ? TRIM : new THREE.Color('#ffffff'));
  }
  if (type === 'police') {
    g.addBox(W / 2 + 0.01, base + H * 0.55, 0.1, 0.02, H * 0.7, 2.4, new THREE.Color('#f5f7fa'));
    g.addBox(-W / 2 - 0.01, base + H * 0.55, 0.1, 0.02, H * 0.7, 2.4, new THREE.Color('#f5f7fa'));
    g.addBox(W / 2 + 0.02, base + H * 0.55, 0.1, 0.02, 0.12, 2.4, new THREE.Color('#1f6feb'));
    g.addBox(-W / 2 - 0.02, base + H * 0.55, 0.1, 0.02, 0.12, 2.4, new THREE.Color('#1f6feb'));
    g.addBox(0, cy + ch / 2 + 0.1, t.cabinZ, cw * 0.85, 0.08, 0.3, TRIM);       // light bar base
    g.addBox(0, base + H * 0.5, L / 2 + 0.12, W * 0.7, 0.3, 0.12, TRIM);         // push bar
  }
  const geo = g.build();
  bodyCache.set(key, geo);
  return geo;
}

function lightGeometry(t) {
  const g = new GeometryBatch();
  const base = t.wheelR * 0.75; const y = base + t.hgt * 0.62;
  const head = new THREE.Color('#fffbe0'); const tail = new THREE.Color('#ff2030');
  g.addBox(t.wid / 2 - 0.3, y, t.len / 2 + 0.02, 0.42, 0.14, 0.06, head);
  g.addBox(-t.wid / 2 + 0.3, y, t.len / 2 + 0.02, 0.42, 0.14, 0.06, head);
  g.addBox(t.wid / 2 - 0.25, y, -t.len / 2 - 0.02, 0.36, 0.14, 0.06, tail);
  g.addBox(-t.wid / 2 + 0.25, y, -t.len / 2 - 0.02, 0.36, 0.14, 0.06, tail);
  return g.build();
}

/**
 * Build the scene graph for a car. Returns { root, body, wheels, steerWheels, glow, sirenRed,
 * sirenBlue } where root is moved by physics and body tilts with roll and pitch.
 */
export function createVehicleModel(type, color) {
  const t = VEHICLE_TYPES[type];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const bodyMesh = new THREE.Mesh(bodyGeometry(type, color), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.35 }));
  bodyMesh.castShadow = true;
  body.add(bodyMesh);
  body.add(new THREE.Mesh(lightGeometry(t), lightMat));
  const wheels = []; const steerWheels = [];
  const wx = t.wid / 2 - 0.12; const wz = t.len / 2 - t.wheelR - 0.35;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * wx, t.wheelR, sz * wz);
    const tyre = new THREE.Mesh(wheelGeo, wheelMat);
    tyre.scale.set(0.26, t.wheelR, t.wheelR);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.scale.set(0.27, t.wheelR, t.wheelR);
    tyre.add(hub);
    pivot.add(tyre);
    root.add(pivot);
    wheels.push(tyre);
    if (sz > 0) steerWheels.push(pivot);
  }
  // headlight and taillight glow sprites (shown at night)
  glowTexture = glowTexture || paintGlowTexture();
  const y = t.wheelR * 0.75 + t.hgt * 0.62;
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    t.wid / 2 - 0.3, y, t.len / 2 + 0.2, -t.wid / 2 + 0.3, y, t.len / 2 + 0.2,
    t.wid / 2 - 0.25, y, -t.len / 2 - 0.15, -t.wid / 2 + 0.25, y, -t.len / 2 - 0.15,
  ], 3));
  glowGeo.setAttribute('color', new THREE.Float32BufferAttribute([1, 0.95, 0.8, 1, 0.95, 0.8, 1, 0.1, 0.1, 1, 0.1, 0.1], 3));
  const glow = new THREE.Points(glowGeo, new THREE.PointsMaterial({ map: glowTexture, size: 2.2, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  body.add(glow);
  let sirenRed = null; let sirenBlue = null;
  if (type === 'police') {
    const cy = t.wheelR * 0.75 + t.hgt + t.cabin[1] + 0.16;
    sirenRed = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.26), new THREE.MeshBasicMaterial({ color: '#ff1030', toneMapped: false }));
    sirenBlue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.26), new THREE.MeshBasicMaterial({ color: '#1060ff', toneMapped: false }));
    sirenRed.position.set(0.34, cy, t.cabinZ); sirenBlue.position.set(-0.34, cy, t.cabinZ);
    body.add(sirenRed, sirenBlue);
  }
  return { root, body, bodyMesh, wheels, steerWheels, glow, sirenRed, sirenBlue };
}
