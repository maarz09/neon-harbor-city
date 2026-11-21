// GeometryBatch collects many coloured boxes and quads into one BufferGeometry, so a whole city
// district or a whole car body is a single draw call. UVs are scaled to world metres so tiling
// textures (facades, paving) keep the same density on every box.
import * as THREE from 'three';

const FACES = [
  // normal, u axis, v axis (unit cube corners are built from these)
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

export class GeometryBatch {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = [];
  }

  get vertexCount() { return this.pos.length / 3; }

  /**
   * Add a box centred at (x, y, z) with size (w, h, d), turned by rotY. `color` is a THREE.Color
   * or hex. Options: uvScale [su, sv] metres per texture tile, uvOffsetV picks an atlas row
   * (0..1), atlasRows the number of rows in the atlas, roofUV a fixed [u, v] for top and bottom.
   */
  addBox(x, y, z, w, h, d, color, opts = {}) {
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    const cos = Math.cos(opts.rotY || 0); const sin = Math.sin(opts.rotY || 0);
    const half = [w / 2, h / 2, d / 2];
    const dims = [w, h, d];
    const [su, sv] = opts.uvScale || [w, h];
    const rows = opts.atlasRows || 1;
    // canvas textures are flipped, so atlas row 0 (top of the canvas) is the highest v band
    const row = rows - 1 - (opts.atlasRow || 0);
    for (let f = 0; f < 6; f += 1) {
      if (opts.skipBottom && f === 3) continue;
      const face = FACES[f];
      const base = this.vertexCount;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const uLen = Math.abs(face.u[0]) * dims[0] + Math.abs(face.u[1]) * dims[1] + Math.abs(face.u[2]) * dims[2];
      const vLen = Math.abs(face.v[0]) * dims[0] + Math.abs(face.v[1]) * dims[1] + Math.abs(face.v[2]) * dims[2];
      const shade = f === 3 ? 0.6 : 1;
      for (const [a, b] of corners) {
        const lx = face.n[0] * half[0] + face.u[0] * a * half[0] + face.v[0] * b * half[0];
        const ly = face.n[1] * half[1] + face.u[1] * a * half[1] + face.v[1] * b * half[1];
        const lz = face.n[2] * half[2] + face.u[2] * a * half[2] + face.v[2] * b * half[2];
        this.pos.push(x + lx * cos + lz * sin, y + ly, z - lx * sin + lz * cos);
        const nx = face.n[0]; const nz = face.n[2];
        this.nor.push(nx * cos + nz * sin, face.n[1], -nx * sin + nz * cos);
        if (f === 2 || f === 3) {
          const r = opts.roofUV || [0.004, 0.996];
          this.uv.push(r[0], (row + r[1]) / rows);
        } else {
          const u = ((a + 1) / 2) * (uLen / su);
          const vv = ((b + 1) / 2) * (vLen / sv);
          // keep v inside this atlas row (callers split tall boxes into one-tile bands)
          this.uv.push(u, (row + 0.004 + Math.min(vv, 1) * 0.992) / rows);
        }
        this.col.push(c.r * shade, c.g * shade, c.b * shade);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  /** A box whose facade tiles repeat vertically: split into storey bands so the atlas row is kept. */
  addTiledBox(x, y, z, w, h, d, color, tile, atlasRow, atlasRows, rotY = 0) {
    const bands = Math.max(1, Math.round(h / tile));
    const bandH = h / bands;
    for (let i = 0; i < bands; i += 1) {
      this.addBox(x, y - h / 2 + bandH * (i + 0.5), z, w, bandH, d, color, {
        uvScale: [tile, bandH], atlasRow, atlasRows, rotY, skipBottom: true,
      });
    }
    // roof cap
    this.addBox(x, y + h / 2 + 0.05, z, w, 0.1, d, color.clone ? color.clone().multiplyScalar(0.7) : color, {
      atlasRow, atlasRows, rotY,
    });
  }

  /**
   * Append any three.js geometry (box, cylinder, cone, icosahedron...) transformed by a Matrix4
   * and painted one colour. Used for palm fronds, lamp posts, cranes and car parts.
   */
  addGeometry(geometry, matrix, color) {
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    const src = geometry;
    const p = src.attributes.position; const n = src.attributes.normal;
    const base = this.vertexCount;
    const v = new THREE.Vector3(); const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    for (let k = 0; k < p.count; k += 1) {
      v.fromBufferAttribute(p, k).applyMatrix4(matrix);
      this.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, k).applyMatrix3(nm).normalize();
      this.nor.push(v.x, v.y, v.z);
      this.uv.push(0.004, 0.996); // a plain wall texel, so props never show windows
      this.col.push(c.r, c.g, c.b);
    }
    if (src.index) for (let k = 0; k < src.index.count; k += 1) this.idx.push(base + src.index.getX(k));
    else for (let k = 0; k < p.count; k += 1) this.idx.push(base + k);
  }

  /** A flat horizontal quad at height y (for road markings, shadows, decals). With localUV the
   * texture spans the quad once (for glow pools) instead of tiling in world metres. */
  addFlatQuad(x, y, z, w, d, color, rotY = 0, localUV = false) {
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    const cos = Math.cos(rotY); const sin = Math.sin(rotY);
    const base = this.vertexCount;
    const pts = [[-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]];
    for (const [px, pz] of pts) {
      this.pos.push(x + px * cos + pz * sin, y, z - px * sin + pz * cos);
      this.nor.push(0, 1, 0);
      if (localUV) this.uv.push(px / w + 0.5, pz / d + 0.5);
      else this.uv.push((x + px) / 4, (z + pz) / 4);
      this.col.push(c.r, c.g, c.b);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.vertexCount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    geo.computeBoundingSphere();
    return geo;
  }
}
