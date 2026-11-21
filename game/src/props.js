// Street furniture and scenery: palm and mangrove trees, street lamps with night glow pools,
// shipping containers and gantry cranes at the docks, marina boats and piers, beach umbrellas,
// lifeguard towers and the old lighthouse. Everything is batched by material.
import * as THREE from 'three';
import { GeometryBatch } from './geometryBatch.js';
import { BEACH_X, SEA_X, HARBOR_Z, HARBOR_WATER_Z, PLACES } from './cityLayout.js';
import { paintGlowTexture } from './textures.js';
import { createRng } from './rng.js';


function trs(x, y, z, rx, ry, rz, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
  return m;
}

function addPalm(batch, x, z, rand) {
  const height = rand.range(7, 11);
  const lean = rand.range(-0.18, 0.18); const leanDir = rand.range(0, Math.PI * 2);
  const seg = new THREE.CylinderGeometry(0.22, 0.3, 1, 6);
  const segments = 6;
  let px = x; let pz = z;
  for (let s = 0; s < segments; s += 1) {
    const h = height / segments;
    const bend = lean * (s / segments) * 2;
    px += Math.cos(leanDir) * bend * h * 0.4; pz += Math.sin(leanDir) * bend * h * 0.4;
    batch.addGeometry(seg, trs(px, h * (s + 0.5), pz, Math.sin(leanDir) * bend, 0, -Math.cos(leanDir) * bend, 1, h, 1), s % 2 ? '#8a6a48' : '#7a5c3d');
  }
  const leaf = new THREE.BoxGeometry(0.9, 0.08, 4.2);
  const fronds = 8;
  for (let f = 0; f < fronds; f += 1) {
    const yaw = (f / fronds) * Math.PI * 2 + rand.range(0, 0.4);
    const m = new THREE.Matrix4().multiplyMatrices(
      trs(px, height + 0.1, pz, 0, yaw, 0),
      trs(0, -0.6, 1.9, 0.45, 0, 0),
    );
    batch.addGeometry(leaf, m, f % 2 ? '#2f8a3a' : '#3fa34a');
  }
  batch.addGeometry(new THREE.IcosahedronGeometry(0.45, 0), trs(px, height - 0.2, pz, 0, 0, 0), '#6b4a2a');
}

function addRoundTree(batch, x, z, rand) {
  const h = rand.range(3, 5);
  batch.addGeometry(new THREE.CylinderGeometry(0.2, 0.3, h, 6), trs(x, h / 2, z, 0, 0, 0), '#6b4f35');
  const blob = new THREE.IcosahedronGeometry(1, 0);
  for (let k = 0; k < 3; k += 1) {
    const s = rand.range(1.6, 2.4);
    batch.addGeometry(blob, trs(x + rand.range(-0.8, 0.8), h + rand.range(0, 1.2), z + rand.range(-0.8, 0.8), rand.range(0, 3), rand.range(0, 3), 0, s, s * 0.85, s), rand.pick(['#3d7a3a', '#4c8c3f', '#2f6b35', '#5a9b45']));
  }
}

export function buildTrees(scene, plan, collision) {
  const batch = new GeometryBatch();
  const rand = createRng(41);
  for (const t of plan.trees) {
    if (t.kind === 'palm') addPalm(batch, t.x, t.z, rand); else addRoundTree(batch, t.x, t.z, rand);
    if (t.x > -10 && t.z > -10) collision.addBox(t.x - 0.35, t.x + 0.35, t.z - 0.35, t.z + 0.35, 6, 'tree');
  }
  const mesh = new THREE.Mesh(batch.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
}

/** Street lamps; returns the glow objects the day/night cycle shows after dusk. */
export function buildLamps(scene, plan) {
  const poles = new GeometryBatch();
  const heads = new GeometryBatch();
  const pools = new GeometryBatch();
  const glowPositions = [];
  const pole = new THREE.CylinderGeometry(0.09, 0.13, 7, 6);
  const arm = new THREE.BoxGeometry(0.12, 0.12, 2.2);
  const head = new THREE.BoxGeometry(0.5, 0.18, 0.9);
  for (const l of plan.lamps) {
    poles.addGeometry(pole, trs(l.x, 3.5, l.z, 0, 0, 0), '#3b3f45');

    // arms reach over the road: lamps on vertical roads reach -x, on horizontal roads -z
    const ax = l.rotY === Math.PI ? -1 : 0; const az = l.rotY === Math.PI ? 0 : -1;
    poles.addGeometry(arm, trs(l.x + ax * 1.0, 7, l.z + az * 1.0, 0, ax ? Math.PI / 2 : 0, 0), '#3b3f45');
    const hx = l.x + ax * 2.0; const hz = l.z + az * 2.0;
    heads.addGeometry(head, trs(hx, 6.9, hz, 0, ax ? Math.PI / 2 : 0, 0), '#fff2c4');
    glowPositions.push(hx, 6.75, hz);
    pools.addFlatQuad(hx, 0.03, hz, 13, 13, new THREE.Color('#ffb966'), 0, true);
  }
  const poleMesh = new THREE.Mesh(poles.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }));
  poleMesh.castShadow = true;
  const headMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const headMesh = new THREE.Mesh(heads.build(), headMat);
  const glowTex = paintGlowTexture();
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  const poolMesh = new THREE.Mesh(pools.build(), poolMat);
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowPositions, 3));
  const glowMat = new THREE.PointsMaterial({ map: glowTex, color: '#ffc77a', size: 5, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  const glow = new THREE.Points(glowGeo, glowMat);
  scene.add(poleMesh, headMesh, poolMesh, glow);
  return { poolMat, glowMat, headMat };
}

/** Docks: container stacks, two gantry cranes, the marina piers with boats, and the lighthouse. */
export function buildHarbor(scene, plan, collision) {
  const batch = new GeometryBatch();
  const rand = createRng(52);
  for (const c of plan.containers) {
    for (let l = 0; l < c.levels; l += 1) {
      const color = new THREE.Color(c.color).offsetHSL(0, 0, rand.range(-0.08, 0.05));
      batch.addBox(c.x, 0.15 + c.h * (l + 0.5), c.z, c.w, c.h - 0.05, c.d, color);
      for (let r = -2; r <= 2; r += 1) batch.addBox(c.x + c.w / 2 + 0.02, 0.15 + c.h * (l + 0.5), c.z + r * 1.2, 0.05, c.h - 0.3, 0.12, color.clone().multiplyScalar(0.8));
    }
    collision.addBox(c.x - c.w / 2, c.x + c.w / 2, c.z - c.d / 2, c.z + c.d / 2, c.h * c.levels, 'container');
  }
  // gantry cranes on the quay
  for (const cx of [40, 150]) {
    const z = HARBOR_Z + 14; const yellow = '#e8a320';
    for (const [lx, lz] of [[-5, -7], [5, -7], [-5, 7], [5, 7]]) batch.addBox(cx + lx, 12, z + lz, 1, 24, 1, yellow);
    batch.addBox(cx, 24.5, z, 12, 1.4, 16, yellow);
    batch.addBox(cx, 26, z + 10, 2.4, 1.6, 40, '#d8452f');
    batch.addBox(cx, 27.5, z - 3, 4, 3, 4, '#f0efe9');
    for (const [lx, lz] of [[-5, -7], [5, -7], [-5, 7], [5, 7]]) collision.addBox(cx + lx - 0.6, cx + lx + 0.6, z + lz - 0.6, z + lz + 0.6, 24, 'crane');
  }
  // marina piers and moored boats
  const marina = PLACES.marina;
  for (let p = 0; p < 3; p += 1) {
    const px = marina.x - 20 + p * 18;
    batch.addBox(px, 0.05, HARBOR_WATER_Z + 15, 3, 0.3, 30, '#9b7b55');
    for (let k = 0; k < 2; k += 1) {
      const side = k ? 1 : -1; const bz = HARBOR_WATER_Z + 8 + rand.range(0, 14);
      const hull = rand.pick(['#ffffff', '#f2f6fa', '#1f3b5c', '#e74c3c']);
      batch.addBox(px + side * 4, -0.1, bz, 2.8, 1.2, 8, hull);
      batch.addBox(px + side * 4, 0.9, bz - 0.8, 2.2, 1.2, 3.4, '#f5f5f5');
      batch.addBox(px + side * 4, 1.0, bz - 0.8, 2.25, 0.4, 3.45, '#2a4a6a');
    }
  }
  // lifeguard towers and umbrellas on the beach
  const towerCols = ['#ff8fab', '#7ad7f0', '#ffd166'];
  for (let k = 0; k < 3; k += 1) {
    const tx = BEACH_X + 46; const tz = 70 + k * 150;
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) batch.addBox(tx + lx, 1.3, tz + lz, 0.2, 2.6, 0.2, '#f0f0f0');
    batch.addBox(tx, 3.4, tz, 3, 2, 3, towerCols[k]);
    batch.addBox(tx, 4.6, tz, 3.6, 0.3, 3.6, '#ffffff');
    batch.addBox(tx - 2, 1.4, tz, 2.4, 0.15, 1, '#d9d9d9', { rotY: 0 });
    collision.addBox(tx - 1.6, tx + 1.6, tz - 1.6, tz + 1.6, 5, 'prop');
  }
  const cone = new THREE.ConeGeometry(1.6, 0.8, 8);
  const stick = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 4);
  for (let k = 0; k < 26; k += 1) {
    const ux = rand.range(BEACH_X + 20, SEA_X - 14); const uz = rand.range(10, HARBOR_Z - 30);
    batch.addGeometry(stick, trs(ux, 1.2, uz, 0, 0, 0), '#eeeeee');
    batch.addGeometry(cone, trs(ux, 2.5, uz, 0, 0, 0), rand.pick(['#ff5d73', '#ffd23f', '#3bceac', '#4d9de0', '#f78c6b']));
    batch.addBox(ux + 1.2, 0.12, uz + 0.5, 1, 0.04, 2, rand.pick(['#ff9fb2', '#9fd8ff', '#fff3a0']));
  }
  // the lighthouse at the south end of the beach
  const lh = PLACES.lighthouse;
  const ring = new THREE.CylinderGeometry(2.2, 2.6, 4, 14);
  for (let s = 0; s < 5; s += 1) batch.addGeometry(ring, trs(lh.x, 2 + s * 4, lh.z, 0, 0, 0, 1 - s * 0.06, 1, 1 - s * 0.06), s % 2 ? '#d83a3a' : '#fafafa');
  batch.addGeometry(new THREE.CylinderGeometry(1.8, 1.8, 2.5, 10), trs(lh.x, 21.5, lh.z, 0, 0, 0), '#ffe9a8');
  batch.addGeometry(new THREE.ConeGeometry(2.2, 2.2, 10), trs(lh.x, 23.8, lh.z, 0, 0, 0), '#333333');
  collision.addBox(lh.x - 2.4, lh.x + 2.4, lh.z - 2.4, lh.z + 2.4, 25, 'prop');
  // safehouse: a small pastel beach bungalow
  const sh = PLACES.safehouse;
  batch.addBox(sh.x + 8, 2, sh.z, 8, 4, 10, '#9fe2d1');
  batch.addBox(sh.x + 8, 4.3, sh.z, 9, 0.6, 11, '#ffffff');
  batch.addBox(sh.x + 3.95, 1.3, sh.z, 0.1, 2.4, 1.6, '#5b3a29');
  collision.addBox(sh.x + 4, sh.x + 12, sh.z - 5, sh.z + 5, 4, 'building');
  const mesh = new THREE.Mesh(batch.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  return { lighthousePosition: new THREE.Vector3(lh.x, 21.5, lh.z) };
}
