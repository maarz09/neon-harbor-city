// The plan of Palmira Bay as plain data: which district each block belongs to, every building's
// footprint and height, the named places missions use, the road grid traffic drives on and the
// sidewalk loops pedestrians walk. cityMeshes.js turns this plan into 3D geometry.
import { CITY } from './config.js';
import { createRng } from './rng.js';

const B = CITY.block;
const HALF_ROAD = CITY.road / 2;
export const CITY_COLS = CITY.blocksX - CITY.coastBlocks; // 8 built-up columns
export const CITY_ROWS = CITY.blocksZ;
export const BEACH_X = CITY_COLS * B + HALF_ROAD;          // where the sand starts
export const SEA_X = BEACH_X + 72;                          // where the water starts
export const HARBOR_Z = CITY_ROWS * B + HALF_ROAD;          // south quay edge
export const HARBOR_WATER_Z = HARBOR_Z + 26;
export const BOUNDS = { minX: -40, maxX: SEA_X + 6, minZ: -40, maxZ: HARBOR_WATER_Z + 2 };

export const PASTELS = ['#f7c6c7', '#ffe0a8', '#b9e4d8', '#c8d8f5', '#f5d0e8', '#fff1c9', '#d7f0c1', '#ffd0b0', '#e0d4f7', '#f9f3e8'];
export const TOWER_TINTS = ['#bcd4e6', '#d6dde3', '#a9c3d6', '#e4e8ec', '#c9d8e0'];

/** Which district a block (column i, row j) belongs to. */
export function districtOf(i, j) {
  if (i === 5 && j === 3) return 'park';
  if (i === 6 && j === 6) return 'plaza';
  if (j === CITY_ROWS - 1 && i <= 3) return 'port';
  if (i === CITY_COLS - 1) return 'beachfront';
  if (i >= 2 && i <= 4 && j >= 1 && j <= 4) return 'downtown';
  return 'residential';
}

export const DISTRICT_NAMES = {
  downtown: 'Brandt Heights', residential: 'Little Cayo', beachfront: 'Coral Parade', park: 'Mangrove Park',
  port: 'Saltworks Docks', plaza: 'Sunset Plaza', beach: 'Flamingo Beach',
};

/** Name the area under a world position, for the HUD's location line. */
export function areaNameAt(x, z) {
  if (x > BEACH_X) return DISTRICT_NAMES.beach;
  if (z > HARBOR_Z) return DISTRICT_NAMES.port;
  const i = Math.max(0, Math.min(CITY_COLS - 1, Math.floor(x / B)));
  const j = Math.max(0, Math.min(CITY_ROWS - 1, Math.floor(z / B)));
  return DISTRICT_NAMES[districtOf(i, j)];
}

/** The lot rectangle inside block (i, j), inside its sidewalk ring. */
export function lotRect(i, j) {
  const inset = HALF_ROAD + CITY.sidewalk;
  return { minX: i * B + inset, maxX: (i + 1) * B - inset, minZ: j * B + inset, maxZ: (j + 1) * B - inset };
}

/** Named places the story and missions refer to. Positions are on the pavement by the door. */
export const PLACES = {
  saltAndLime: { name: 'Salt & Lime Bar', x: 6 * B + 32, z: 4 * B + HALF_ROAD + 1.6, block: [6, 4] },
  okaforKustoms: { name: 'Okafor Kustoms', x: 1 * B + 32, z: 5 * B + HALF_ROAD + 1.6, block: [1, 5] },
  brandtTower: { name: 'Brandt Tower', x: 3 * B + 32, z: 2 * B + HALF_ROAD + 1.6 },
  marina: { name: 'Pelican Marina', x: 5 * B + 20, z: HARBOR_Z + 12 },
  warehouse: { name: 'Pier 9 Warehouse', x: 1 * B + 40, z: HARBOR_Z + 10 },
  safehouse: { name: 'Beach Safehouse', x: BEACH_X + 30, z: 2 * B + 20 },
  hospital: { name: 'Coral General', x: 5 * B + 32, z: 1 * B + HALF_ROAD + 1.6, block: [5, 1] },
  precinct: { name: 'Bay Precinct', x: 2 * B + 32, z: 6 * B + HALF_ROAD + 1.6, block: [2, 6] },
  lighthouse: { name: 'Old Lighthouse', x: SEA_X - 18, z: HARBOR_Z - 20 },
};

/** Lay out every building, prop spot and sign for the whole city, deterministic from `seed`. */
export function planCity(seed = 11) {
  const rand = createRng(seed);
  const buildings = [];   // {x,z,w,d,h,style,color,kind}
  const trees = [];       // {x,z,kind}
  const containers = [];  // {x,z,w,h,d,color,rot}
  const signs = [];       // {x,y,z,rotY,text,color}
  const billboards = [];  // {x,y,z,rotY,index}
  const lamps = [];       // {x,z,rotY}
  const parking = [];     // {x,z,rotY} spots where parked cars can sit

  const reserved = new Set(Object.values(PLACES).filter((p) => p.block).map((p) => p.block.join(',')));

  for (let i = 0; i < CITY_COLS; i += 1) {
    for (let j = 0; j < CITY_ROWS; j += 1) {
      const lot = lotRect(i, j);
      const district = districtOf(i, j);
      const cx = (lot.minX + lot.maxX) / 2; const cz = (lot.minZ + lot.maxZ) / 2;
      const size = lot.maxX - lot.minX;
      const key = `${i},${j}`;
      if (district === 'park') {
        for (let k = 0; k < 26; k += 1) trees.push({ x: rand.range(lot.minX + 2, lot.maxX - 2), z: rand.range(lot.minZ + 2, lot.maxZ - 2), kind: rand.chance(0.7) ? 'palm' : 'round' });
        continue;
      }
      if (district === 'plaza') {
        for (let k = 0; k < 8; k += 1) {
          const a = (k / 8) * Math.PI * 2;
          trees.push({ x: cx + Math.cos(a) * 15, z: cz + Math.sin(a) * 15, kind: 'palm' });
        }
        buildings.push({ x: cx, z: cz, w: 6, d: 6, h: 1.2, style: 2, color: '#f2e6d8', kind: 'fountain' });
        continue;
      }
      if (district === 'port') {
        buildings.push({ x: cx - 8, z: cz - 6, w: 26, d: 30, h: 11, style: 3, color: rand.pick(['#c86b4f', '#6f8fa8', '#d9c27a', '#8fa889']), kind: 'warehouse' });
        for (let k = 0; k < 10; k += 1) {
          const stackX = lot.maxX - 6 - (k % 2) * 3; const stackZ = lot.minZ + 4 + Math.floor(k / 2) * 7.5;
          containers.push({ x: stackX, z: stackZ, w: 2.6, h: 2.6, d: 6.1, color: rand.pick(['#c0392b', '#2e86c1', '#d68910', '#1e8449', '#7d3c98', '#f4f6f7']), levels: rand.int(1, 3) });
        }
        continue;
      }
      if (district === 'downtown') {
        const tall = i === 3 && j === 2;
        if (tall) {
          buildings.push({ x: cx, z: cz + 6, w: 28, d: 24, h: 128, style: 1, color: '#9fbfd8', kind: 'tower', crown: true });
          buildings.push({ x: cx, z: cz + 6, w: 40, d: 30, h: 9, style: 1, color: '#d9e2ea', kind: 'podium' });
          parking.push({ x: cx - 12, z: lot.minZ + 2.5, rotY: Math.PI / 2 }, { x: cx + 10, z: lot.minZ + 2.5, rotY: Math.PI / 2 });
        } else {
          const towers = rand.chance(0.5) ? 1 : 2;
          for (let t = 0; t < towers; t += 1) {
            const w = towers === 1 ? rand.range(24, 34) : rand.range(16, 20);
            const d = towers === 1 ? rand.range(24, 34) : rand.range(30, 40);
            const ox = towers === 1 ? 0 : (t === 0 ? -11 : 11);
            buildings.push({ x: cx + ox, z: cz, w, d, h: rand.range(38, 92), style: 1, color: rand.pick(TOWER_TINTS), kind: 'tower', crown: rand.chance(0.4) });
          }
        }
        if (rand.chance(0.7)) billboards.push({ x: cx, y: 0, z: cz, index: billboards.length, onRoof: true });
        continue;
      }
      if (district === 'beachfront') {
        // two deco hotels facing the beach with a gap for a pool deck
        const hotelH = [rand.range(16, 30), rand.range(12, 24)];
        buildings.push({ x: cx + 4, z: cz - 11, w: 30, d: 18, h: hotelH[0], style: 2, color: rand.pick(PASTELS), kind: 'hotel', neon: true });
        buildings.push({ x: cx + 4, z: cz + 12, w: 30, d: 16, h: hotelH[1], style: 2, color: rand.pick(PASTELS), kind: 'hotel', neon: true });
        trees.push({ x: lot.maxX - 1, z: cz, kind: 'palm' }, { x: lot.minX + 2, z: cz, kind: 'palm' });
        continue;
      }
      // residential: a mix of shops and apartments on a 2x2 grid with gaps; reserved mission
      // blocks keep their front open for the venue.
      const cells = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      const special = reserved.has(key);
      cells.forEach(([sx, sz], n) => {
        if (special && n < 2) return; // the north half is the venue
        if (rand.chance(0.12)) { trees.push({ x: cx + sx * size / 4, z: cz + sz * size / 4, kind: 'palm' }); return; }
        const w = rand.range(15, 20); const d = rand.range(15, 20);
        buildings.push({ x: cx + sx * (size / 4 + rand.range(-1, 1)), z: cz + sz * (size / 4 + rand.range(-1, 1)), w, d, h: rand.range(7, 22), style: rand.chance(0.75) ? 0 : 2, color: rand.pick(PASTELS), kind: 'apartment', neon: rand.chance(0.35) });
      });
      if (special) {
        const isGarage = key === '1,5';
        buildings.push({ x: cx + (isGarage ? 6 : 0), z: cz - 10, w: isGarage ? 26 : 30, d: 14, h: isGarage ? 8 : 6, style: isGarage ? 3 : 0, color: isGarage ? '#e0a050' : (key === '5,1' ? '#ffffff' : '#f6c3a5'), kind: 'venue', venue: key });
        parking.push({ x: lot.minX + 3, z: cz + 2, rotY: 0 });
      }
    }
  }

  // street lamps along every road, palms along Coral Parade and the beach
  for (let i = 0; i <= CITY_COLS; i += 1) {
    for (let j = 0; j < CITY_ROWS; j += 1) {
      lamps.push({ x: i * B + HALF_ROAD + 0.6, z: j * B + B / 2, rotY: Math.PI });
    }
  }
  for (let j = 0; j <= CITY_ROWS; j += 1) {
    for (let i = 0; i < CITY_COLS; i += 1) lamps.push({ x: i * B + B / 2, z: j * B + HALF_ROAD + 0.6, rotY: -Math.PI / 2 });
  }
  for (let z = 6; z < HARBOR_Z; z += 14) {
    trees.push({ x: BEACH_X + 3, z, kind: 'palm' });
    if (rand.chance(0.6)) trees.push({ x: BEACH_X + rand.range(14, 50), z: z + rand.range(-4, 4), kind: 'palm' });
  }
  // the west and north edges are wild mangrove scrub
  for (let k = 0; k < 70; k += 1) {
    trees.push({ x: rand.range(-38, -12), z: rand.range(-38, HARBOR_Z), kind: 'round' });
    trees.push({ x: rand.range(-12, BEACH_X), z: rand.range(-38, -12), kind: rand.chance(0.5) ? 'round' : 'palm' });
  }

  const SIGN_TEXT = [
    ['TACO TORNADO', '#ff5ab4'], ['PELICAN PAWN', '#5af0ff'], ['MANGO MOBILE', '#ffb347'], ['KRAKEN ENERGY', '#7bff6a'],
    ['LUMEN PHARMACY', '#73b7ff'], ['FLAMINGO LOUNGE', '#ff6ad5'], ['CAFE CORTADITO', '#ffd36a'], ['SUNBURST MOTEL', '#ff7a45'],
    ['BAY LAUNDRY', '#9af5ff'], ['NITE OWL 24/7', '#d58cff'], ['PALMETTO BANK', '#8cffc8'], ['CONCH SHACK', '#ffe066'],
  ];
  let signIndex = 0;
  for (const b of buildings) {
    if (!b.neon) continue;
    const [text, color] = SIGN_TEXT[signIndex % SIGN_TEXT.length];
    signIndex += 1;
    // face the nearest road: compare the building's position in its block
    const bi = Math.floor(b.x / B); const bj = Math.floor(b.z / B);
    const fx = b.x - (bi * B + B / 2); const fz = b.z - (bj * B + B / 2);
    if (b.kind === 'hotel') signs.push({ x: b.x - b.w / 2 - 0.15, y: Math.min(b.h - 2, 9), z: b.z, rotY: -Math.PI / 2, text, color, scale: 1.4 });
    else if (Math.abs(fx) > Math.abs(fz)) signs.push({ x: b.x + Math.sign(fx) * (b.w / 2 + 0.15), y: 4.5, z: b.z, rotY: Math.sign(fx) * Math.PI / 2, text, color, scale: 1 });
    else signs.push({ x: b.x, y: 4.5, z: b.z + Math.sign(fz) * (b.d / 2 + 0.15), rotY: fz > 0 ? 0 : Math.PI, text, color, scale: 1 });
  }
  const venueSigns = { '6,4': ['SALT & LIME', '#7dffb0'], '1,5': ['OKAFOR KUSTOMS', '#ffb02e'], '5,1': ['CORAL GENERAL', '#ff4d6a'], '2,6': ['BAY PRECINCT', '#5aa0ff'] };
  for (const b of buildings) {
    if (b.kind !== 'venue') continue;
    const [text, color] = venueSigns[b.venue] || ['OPEN', '#fff'];
    signs.push({ x: b.x, y: b.h - 1.5, z: b.z - b.d / 2 - 0.15, rotY: Math.PI, text, color, scale: 1.3 });
  }

  return { buildings, trees, containers, signs, billboards, lamps, parking };
}

/** Road intersections (nodes) and the lanes between them, for traffic and police routing. */
export function buildRoadGraph() {
  const nodes = [];
  const index = (i, j) => j * (CITY_COLS + 1) + i;
  for (let j = 0; j <= CITY_ROWS; j += 1) {
    for (let i = 0; i <= CITY_COLS; i += 1) nodes.push({ id: index(i, j), i, j, x: i * B, z: j * B, links: [] });
  }
  for (const n of nodes) {
    if (n.i > 0) n.links.push(index(n.i - 1, n.j));
    if (n.i < CITY_COLS) n.links.push(index(n.i + 1, n.j));
    if (n.j > 0) n.links.push(index(n.i, n.j - 1));
    if (n.j < CITY_ROWS) n.links.push(index(n.i, n.j + 1));
  }
  return { nodes, index, laneOffset: 3.5 };
}

/** The node nearest a world position. */
export function nearestNode(graph, x, z) {
  const i = Math.max(0, Math.min(CITY_COLS, Math.round(x / B)));
  const j = Math.max(0, Math.min(CITY_ROWS, Math.round(z / B)));
  return graph.nodes[graph.index(i, j)];
}

/** Sidewalk loop (a rectangle of 4 corners) around block (i, j), for pedestrians. */
export function sidewalkLoop(i, j) {
  const o = HALF_ROAD + CITY.sidewalk / 2;
  return [
    { x: i * B + o, z: j * B + o }, { x: (i + 1) * B - o, z: j * B + o },
    { x: (i + 1) * B - o, z: (j + 1) * B - o }, { x: i * B + o, z: (j + 1) * B - o },
  ];
}

/** True when (x, z) is on a road surface (used for spawn checks and the minimap). */
export function isOnRoad(x, z) {
  if (x < -HALF_ROAD || z < -HALF_ROAD || x > BEACH_X || z > HARBOR_Z) return false;
  const dx = Math.abs(x - Math.round(x / B) * B); const dz = Math.abs(z - Math.round(z / B) * B);
  return dx < HALF_ROAD || dz < HALF_ROAD;
}

/** Ground height: pavements and lots sit 15 cm above the asphalt. */
export function groundHeightAt(x, z) {
  if (x > BEACH_X || z > HARBOR_Z) return 0.1;
  if (x < -HALF_ROAD || z < -HALF_ROAD) return 0.05;
  return isOnRoad(x, z) ? 0 : 0.15;
}
