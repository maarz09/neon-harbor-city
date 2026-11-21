// Turns the city plan into meshes: the ground, the asphalt grid with its lane markings and
// crosswalks, raised pavements, every building batched into one facade mesh, rooftop clutter,
// neon shop signs and billboards. Buildings are also registered with the collision world.
import * as THREE from 'three';
import { CITY } from './config.js';
import { GeometryBatch } from './geometryBatch.js';
import {
  CITY_COLS, CITY_ROWS, BEACH_X, SEA_X, HARBOR_Z, HARBOR_WATER_Z, districtOf, lotRect,
} from './cityLayout.js';
import {
  paintFacadeTextures, paintAsphaltTexture, paintGroundTexture, paintPavingTexture, paintNeonSign, paintBillboard,
} from './textures.js';
import { createRng } from './rng.js';

const B = CITY.block;
const HALF_ROAD = CITY.road / 2;
const STOREY = 3.6;

export function buildGround(scene) {
  const grass = paintGroundTexture('#6f9a4a', ['#5d873c', '#86b05a', '#4f7a33', '#9bbf6a'], 3);
  grass.repeat.set(50, 50);
  // grass inland only: the beach and the sea take over east of the city and south of the quay
  const west = -700; const north = -700;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(BEACH_X - west, HARBOR_WATER_Z - north),
    new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((BEACH_X + west) / 2, -0.03, (HARBOR_WATER_Z + north) / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // sand: the beach strip and a slope down under the sea
  const sandTex = paintGroundTexture('#e9d3a4', ['#d8bf8c', '#f5e4bd', '#cdb27c', '#fff4d8'], 9);
  const sandMat = new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 });
  const sandGeo = new THREE.PlaneGeometry(SEA_X + 140 - BEACH_X, HARBOR_WATER_Z + 140, 24, 4);
  const pos = sandGeo.attributes.position;
  for (let k = 0; k < pos.count; k += 1) {
    const wx = BEACH_X + (pos.getX(k) + (SEA_X + 140 - BEACH_X) / 2);
    pos.setZ(k, wx < SEA_X - 10 ? 0.08 : 0.08 - Math.min(3, (wx - (SEA_X - 10)) * 0.07));
  }
  sandGeo.computeVertexNormals();
  sandTex.repeat.set(14, 30);
  const sand = new THREE.Mesh(sandGeo, sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(BEACH_X + (SEA_X + 140 - BEACH_X) / 2, 0, (HARBOR_WATER_Z + 140) / 2 - 140);
  sand.receiveShadow = true;
  scene.add(sand);
}

export function buildRoads(scene) {
  const asphalt = paintAsphaltTexture();
  const roads = new GeometryBatch();
  const grey = new THREE.Color('#ffffff');
  for (let i = 0; i <= CITY_COLS; i += 1) roads.addFlatQuad(i * B, 0.0, (HARBOR_Z - HALF_ROAD) / 2, CITY.road, HARBOR_Z + HALF_ROAD, grey);
  for (let j = 0; j <= CITY_ROWS; j += 1) roads.addFlatQuad((BEACH_X - HALF_ROAD) / 2, 0.001, j * B, BEACH_X + HALF_ROAD, CITY.road, grey);
  const mesh = new THREE.Mesh(roads.build(), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92, vertexColors: true }));
  mesh.receiveShadow = true;
  scene.add(mesh);

  const marks = new GeometryBatch();
  const yellow = new THREE.Color('#f2c230');
  const white = new THREE.Color('#f4f4f0');
  const y = 0.012;
  const segment = (alongX, line, from, to) => {
    const len = to - from; const mid = (from + to) / 2;
    const quad = (offset, width, color) => (alongX
      ? marks.addFlatQuad(mid, y, line + offset, len, width, color)
      : marks.addFlatQuad(line + offset, y, mid, width, len, color));
    quad(-0.16, 0.14, yellow); quad(0.16, 0.14, yellow);
    quad(-HALF_ROAD + 0.5, 0.15, white); quad(HALF_ROAD - 0.5, 0.15, white);
    // crosswalk stripes at both ends
    for (const end of [from + 1.6, to - 1.6]) {
      for (let s = -HALF_ROAD + 1.2; s <= HALF_ROAD - 1.2; s += 1.25) {
        if (alongX) marks.addFlatQuad(end, y, line + s, 2.6, 0.62, white);
        else marks.addFlatQuad(line + s, y, end, 0.62, 2.6, white);
      }
    }
  };
  for (let i = 0; i <= CITY_COLS; i += 1) {
    for (let j = 0; j < CITY_ROWS; j += 1) segment(false, i * B, j * B + HALF_ROAD, (j + 1) * B - HALF_ROAD);
  }
  for (let j = 0; j <= CITY_ROWS; j += 1) {
    for (let i = 0; i < CITY_COLS; i += 1) segment(true, j * B, i * B + HALF_ROAD, (i + 1) * B - HALF_ROAD);
  }
  const markMesh = new THREE.Mesh(marks.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
  markMesh.receiveShadow = true;
  scene.add(markMesh);
}

/** Raised pavement slabs for every block, with grass or plaza tiles inside the lot. */
export function buildBlocks(scene) {
  const slabs = new GeometryBatch();
  const tops = new GeometryBatch();
  const curb = new THREE.Color('#bdb6aa');
  for (let i = 0; i < CITY_COLS; i += 1) {
    for (let j = 0; j < CITY_ROWS; j += 1) {
      const size = B - CITY.road;
      const cx = i * B + B / 2; const cz = j * B + B / 2;
      slabs.addBox(cx, 0.075, cz, size, 0.15, size, curb, { skipBottom: true });
      const district = districtOf(i, j);
      const lot = lotRect(i, j);
      const tint = district === 'park' ? '#7fb35a' : district === 'port' ? '#a7a39a' : district === 'plaza' ? '#f1dcc0' : district === 'residential' ? '#d8cfc0' : '#e6e1d8';
      tops.addFlatQuad(cx, 0.152, cz, size, size, new THREE.Color('#f0ece4'));
      tops.addFlatQuad(cx, 0.156, cz, lot.maxX - lot.minX, lot.maxZ - lot.minZ, new THREE.Color(tint));
    }
  }
  // the harbor quay along the south edge
  slabs.addBox((BEACH_X - 40) / 2, 0.05, (HARBOR_Z + HARBOR_WATER_Z) / 2, BEACH_X + 40, 0.1, HARBOR_WATER_Z - HARBOR_Z, new THREE.Color('#9a958c'), { skipBottom: true });
  tops.addFlatQuad((BEACH_X - 40) / 2, 0.104, (HARBOR_Z + HARBOR_WATER_Z) / 2, BEACH_X + 40, HARBOR_WATER_Z - HARBOR_Z, new THREE.Color('#c4bcae'));
  const slabMesh = new THREE.Mesh(slabs.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  const paving = paintPavingTexture();
  const topMesh = new THREE.Mesh(tops.build(), new THREE.MeshStandardMaterial({ map: paving, vertexColors: true, roughness: 0.95 }));
  slabMesh.receiveShadow = true; topMesh.receiveShadow = true;
  scene.add(slabMesh, topMesh);
}

/**
 * All buildings in one mesh using the facade atlas, plus their rooftop props. Returns the
 * material so the day/night cycle can turn the lit windows up after sunset.
 */
export function buildBuildings(scene, plan, collision) {
  const facade = paintFacadeTextures();
  const batch = new GeometryBatch();
  const rooftop = new GeometryBatch();
  const rand = createRng(31);
  const tileByStyle = [STOREY * 4, STOREY * 6, STOREY * 4, 8];
  for (const b of plan.buildings) {
    const color = new THREE.Color(b.color);
    if (b.kind === 'fountain') {
      rooftop.addBox(b.x, 0.5, b.z, b.w, 0.8, b.d, color);
      rooftop.addBox(b.x, 1.4, b.z, 1.2, 2, 1.2, color);
      collision.addBox(b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2, 1.2, 'prop');
      continue;
    }
    const tile = tileByStyle[b.style];
    batch.addTiledBox(b.x, 0.15 + b.h / 2, b.z, b.w, b.h, b.d, color, tile, b.style, facade.styles);
    collision.addBox(b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2, b.h + 0.15, 'building');
    const roofY = 0.15 + b.h;
    // ground-floor shopfront band and awning for apartments and hotels
    if (b.kind === 'apartment' || b.kind === 'hotel' || b.kind === 'venue') {
      rooftop.addBox(b.x, 0.15 + 3.3, b.z, b.w + 0.3, 0.35, b.d + 0.3, new THREE.Color('#ffffff'));
    }
    if (b.kind === 'hotel') {
      // deco fins and a rounded-looking corner tower
      rooftop.addBox(b.x - b.w / 2 + 1, roofY + 3, b.z, 2, 6, 3, color.clone().offsetHSL(0, 0.1, -0.05));
      rooftop.addBox(b.x - b.w / 2 - 0.25, roofY / 2, b.z, 0.5, roofY, 1.2, new THREE.Color('#ffffff'));
    }
    if (b.kind === 'tower') {
      if (b.crown) {
        rooftop.addBox(b.x, roofY + 3, b.z, b.w * 0.7, 6, b.d * 0.7, color.clone().multiplyScalar(0.85));
        rooftop.addBox(b.x, roofY + 10, b.z, 0.5, 10, 0.5, new THREE.Color('#dddddd'));
      } else {
        rooftop.addBox(b.x, roofY + 1.5, b.z, b.w * 0.4, 3, b.d * 0.4, new THREE.Color('#8b9096'));
      }
    }
    // AC units and water tanks
    const props = b.kind === 'tower' ? 2 : rand.int(1, 3);
    for (let k = 0; k < props; k += 1) {
      const px = b.x + rand.range(-b.w / 3, b.w / 3); const pz = b.z + rand.range(-b.d / 3, b.d / 3);
      rooftop.addBox(px, roofY + 0.6, pz, rand.range(1.2, 2.5), 1.2, rand.range(1.2, 2.5), new THREE.Color('#b5b2ad'));
    }
    if (b.kind === 'apartment' && rand.chance(0.35)) {
      const m = new THREE.Matrix4().makeTranslation(b.x + b.w / 4, roofY + 2.2, b.z - b.d / 4);
      rooftop.addGeometry(new THREE.CylinderGeometry(1.2, 1.2, 2.2, 10), m, new THREE.Color('#8a6f55'));
    }
  }
  const material = new THREE.MeshStandardMaterial({
    map: facade.map, emissiveMap: facade.emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0,
    vertexColors: true, roughness: 0.75, metalness: 0.05,
  });
  const mesh = new THREE.Mesh(batch.build(), material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const roofMesh = new THREE.Mesh(rooftop.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  roofMesh.castShadow = true; roofMesh.receiveShadow = true;
  scene.add(mesh, roofMesh);
  return { material };
}

/** Neon shop signs and rooftop billboards, each a small textured plane. */
export function buildSigns(scene, plan) {
  const group = new THREE.Group();
  const neonMaterials = [];
  for (const s of plan.signs) {
    const mat = new THREE.MeshBasicMaterial({ map: paintNeonSign(s.text, s.color), toneMapped: false });
    neonMaterials.push(mat);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.5 * s.scale, 1.4 * s.scale), mat);
    mesh.position.set(s.x, s.y, s.z);
    mesh.rotation.y = s.rotY;
    group.add(mesh);
  }
  const ads = [
    ['Kraken Energy', 'Unleash the deep.', '#1b2a6b', '#2dd4bf'],
    ['Sol Cola', 'Taste the sunset.', '#ff7e5f', '#feb47b'],
    ['Palmira Air', 'Fly the bay.', '#5b86e5', '#36d1dc'],
    ['Vance Motors', 'Built for the coast.', '#232526', '#ff512f'],
    ['Mango Mobile', 'Five bars of sunshine.', '#f7971e', '#ffd200'],
  ];
  plan.billboards.forEach((bb, k) => {
    // put the board on the tallest roof in that block
    let roof = 10;
    for (const b of plan.buildings) {
      if (Math.abs(b.x - bb.x) < 22 && Math.abs(b.z - bb.z) < 22) roof = Math.max(roof, b.h + 0.15);
    }
    const [title, slogan, a, c] = ads[k % ads.length];
    const board = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshBasicMaterial({ map: paintBillboard(title, slogan, a, c) }));
    board.position.set(bb.x, roof + 6, bb.z);
    board.rotation.y = k % 2 ? Math.PI / 2 : 0;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(14.6, 7.6, 0.3), new THREE.MeshStandardMaterial({ color: '#333' }));
    frame.position.copy(board.position); frame.rotation.y = board.rotation.y;
    frame.translateZ(-0.2);
    const back = board.clone(); back.rotation.y += Math.PI; back.translateZ(0.4);
    group.add(frame, board, back);
  });
  scene.add(group);
  return { neonMaterials };
}
