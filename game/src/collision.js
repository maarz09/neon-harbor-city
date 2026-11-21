// Static collision for the city: building and container boxes in a coarse spatial hash, with
// circle push-out for people and cars, a segment test for line of sight and a ray cast for bullets.
import { BOUNDS, SEA_X, HARBOR_WATER_Z } from './cityLayout.js';

const CELL = 32;

export class CollisionWorld {
  constructor() {
    this.boxes = [];
    this.grid = new Map();
  }

  key(cx, cz) { return cx * 4096 + cz; }

  addBox(minX, maxX, minZ, maxZ, height = 50, tag = 'building') {
    const box = { minX, maxX, minZ, maxZ, height, tag };
    this.boxes.push(box);
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx += 1) {
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz += 1) {
        const k = this.key(cx, cz);
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(box);
      }
    }
    return box;
  }

  nearby(x, z) {
    const list = this.grid.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL)));
    return list || [];
  }

  /**
   * Push a circle at pos (x, z) of radius r out of any box it overlaps. Returns the push normal
   * of the deepest hit (or null) so cars can bounce and scrape.
   */
  resolveCircle(pos, r, y = 0) {
    let hit = null;
    for (let pass = 0; pass < 2; pass += 1) {
      const candidates = new Set([
        ...this.nearby(pos.x - r, pos.z - r), ...this.nearby(pos.x + r, pos.z - r),
        ...this.nearby(pos.x - r, pos.z + r), ...this.nearby(pos.x + r, pos.z + r),
      ]);
      for (const b of candidates) {
        if (y > b.height) continue;
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        let dx = pos.x - cx; let dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 < 1e-6) { // centre inside the box: push out along the shortest side
          const left = pos.x - b.minX; const right = b.maxX - pos.x; const top = pos.z - b.minZ; const bottom = b.maxZ - pos.z;
          const m = Math.min(left, right, top, bottom);
          if (m === left) { dx = -1; dz = 0; pos.x = b.minX - r; } else if (m === right) { dx = 1; dz = 0; pos.x = b.maxX + r; } else if (m === top) { dx = 0; dz = -1; pos.z = b.minZ - r; } else { dx = 0; dz = 1; pos.z = b.maxZ + r; }
          hit = { nx: dx, nz: dz, box: b };
          continue;
        }
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r; pos.z = cz + (dz / d) * r;
        hit = { nx: dx / d, nz: dz / d, box: b };
      }
    }
    // the edges of the playable map: scrub, the sea and the harbor
    if (pos.x < BOUNDS.minX + r) { pos.x = BOUNDS.minX + r; hit = hit || { nx: 1, nz: 0 }; }
    if (pos.z < BOUNDS.minZ + r) { pos.z = BOUNDS.minZ + r; hit = hit || { nx: 0, nz: 1 }; }
    if (pos.x > SEA_X - r) { pos.x = SEA_X - r; hit = hit || { nx: -1, nz: 0 }; }
    if (pos.z > HARBOR_WATER_Z - r) { pos.z = HARBOR_WATER_Z - r; hit = hit || { nx: 0, nz: -1 }; }
    return hit;
  }

  /** Is the straight line between two points clear of buildings (sampled every 3 m)? */
  lineOfSight(ax, az, bx, bz, y = 1.5) {
    const dx = bx - ax; const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.ceil(len / 3);
    for (let s = 1; s < steps; s += 1) {
      const x = ax + (dx * s) / steps; const z = az + (dz * s) / steps;
      for (const b of this.nearby(x, z)) {
        if (y < b.height && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return false;
      }
    }
    return true;
  }

  /** Distance along a 3D ray to the first box it enters, or Infinity (slab test on nearby cells). */
  rayDistance(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = Infinity;
    const seen = new Set();
    for (let t = 0; t <= maxDist; t += CELL / 2) {
      for (const b of this.nearby(ox + dx * t, oz + dz * t)) {
        if (seen.has(b)) continue;
        seen.add(b);
        const hit = raySlab(ox, oy, oz, dx, dy, dz, b);
        if (hit < best) best = hit;
      }
      if (best < t) break;
    }
    return best <= maxDist ? best : Infinity;
  }
}

function raySlab(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0; let tmax = Infinity;
  const axes = [[ox, dx, b.minX, b.maxX], [oy, dy, 0, b.height], [oz, dz, b.minZ, b.maxZ]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-8) { if (o < lo || o > hi) return Infinity; continue; }
    let t1 = (lo - o) / d; let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}
