// The radar: the whole of Palmira Bay is painted once to an off-screen canvas (roads, blocks,
// park, beach, sea, docks), then every frame a rotating, zooming circle of it is drawn around
// the player with blips for police, mission markers, contacts and the safehouse. The pause
// menu's full map reuses the same painting.
import { CITY } from './config.js';
import { CITY_COLS, CITY_ROWS, BEACH_X, SEA_X, HARBOR_Z, HARBOR_WATER_Z, BOUNDS, districtOf, lotRect, PLACES } from './cityLayout.js';
import { MARKER_COLORS } from './markers.js';

const SCALE = 1.6; // pixels per metre on the painted map
const B = CITY.block;
const PAD = 60;

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.origin = { x: BOUNDS.minX - PAD, z: BOUNDS.minZ - PAD };
    this.map = this.paintCity();
    this.zoom = 1;
    this.time = 0;
  }

  toMap(x, z) { return [(x - this.origin.x) * SCALE, (z - this.origin.z) * SCALE]; }

  paintCity() {
    const w = (SEA_X + 300 - this.origin.x) * SCALE; const h = (HARBOR_WATER_Z + 300 - this.origin.z) * SCALE;
    const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h);
    const g = c.getContext('2d');
    g.fillStyle = '#3c6e4a'; g.fillRect(0, 0, c.width, c.height);
    const rect = (x0, z0, x1, z1, color) => { const [a, b] = this.toMap(x0, z0); const [d, e] = this.toMap(x1, z1); g.fillStyle = color; g.fillRect(a, b, d - a, e - b); };
    rect(BEACH_X, -400, SEA_X, HARBOR_WATER_Z, '#e8d6a6');
    rect(SEA_X, -400, SEA_X + 600, HARBOR_WATER_Z + 600, '#2a7fa8');
    rect(-400, HARBOR_WATER_Z, SEA_X + 600, HARBOR_WATER_Z + 600, '#2a7fa8');
    rect(-CITY.road / 2, HARBOR_Z, BEACH_X, HARBOR_WATER_Z, '#8d8a84');
    // roads
    for (let i = 0; i <= CITY_COLS; i += 1) rect(i * B - CITY.road / 2, -CITY.road / 2, i * B + CITY.road / 2, HARBOR_Z, '#d9dde2');
    for (let j = 0; j <= CITY_ROWS; j += 1) rect(-CITY.road / 2, j * B - CITY.road / 2, BEACH_X, j * B + CITY.road / 2, '#d9dde2');
    // blocks by district
    const tint = { downtown: '#6c7a92', residential: '#8a8098', beachfront: '#b08aa8', park: '#4f9a5a', port: '#7a7466', plaza: '#c9a77a' };
    for (let i = 0; i < CITY_COLS; i += 1) {
      for (let j = 0; j < CITY_ROWS; j += 1) {
        const l = lotRect(i, j);
        rect(l.minX - 3, l.minZ - 3, l.maxX + 3, l.maxZ + 3, '#a9a39a');
        rect(l.minX, l.minZ, l.maxX, l.maxZ, tint[districtOf(i, j)]);
      }
    }
    // marina piers
    for (let p = 0; p < 3; p += 1) rect(PLACES.marina.x - 21.5 + p * 18, HARBOR_WATER_Z, PLACES.marina.x - 18.5 + p * 18, HARBOR_WATER_Z + 30, '#9b7b55');
    return c;
  }

  /** Blips: [{x, z, color, label?, shape?}] built from game state. */
  collectBlips(game) {
    const blips = [];
    const flash = Math.floor(this.time * 6) % 2;
    for (const u of game.police.units) if (!u.vehicle.destroyed) blips.push({ x: u.vehicle.position.x, z: u.vehicle.position.z, color: u.vehicle.sirenOn ? (flash ? '#ff2a45' : '#2a6bff') : '#6a8cff', size: 4.5 });
    for (const m of game.markers.markers) {
      blips.push({ x: m.x, z: m.z, color: MARKER_COLORS[m.kind], size: m.kind === 'target' ? 4 : 6, label: m.label, ring: m.kind !== 'target', edge: true });
    }
    blips.push({ x: PLACES.safehouse.x, z: PLACES.safehouse.z, color: '#3ddc84', label: 'H', size: 6, edge: false });
    return blips;
  }

  draw(game, dt) {
    this.time += dt;
    const g = this.ctx; const W = this.canvas.width; const H = this.canvas.height;
    const p = game.player;
    const pos = p.worldPosition;
    const speed = p.inVehicle ? Math.abs(p.vehicle.forwardSpeed) : 0;
    const wantZoom = p.inVehicle ? 1.05 - Math.min(speed, 40) * 0.009 : 1.25;
    this.zoom += (wantZoom - this.zoom) * Math.min(1, dt * 2);
    const yaw = game.camera.yaw;
    const theta = -Math.PI / 2 - Math.atan2(Math.cos(yaw), Math.sin(yaw));
    g.save();
    g.clearRect(0, 0, W, H);
    g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#2a7fa8'; g.fillRect(0, 0, W, H);
    g.translate(W / 2, H / 2);
    g.rotate(theta);
    g.scale(this.zoom, this.zoom);
    const [mx, my] = this.toMap(pos.x, pos.z);
    g.drawImage(this.map, -mx, -my);
    g.restore();
    // blips (kept upright)
    const R = W / 2 - 10;
    const cos = Math.cos(theta); const sin = Math.sin(theta);
    for (const b of this.collectBlips(game)) {
      const dx = (b.x - pos.x) * SCALE * this.zoom; const dz = (b.z - pos.z) * SCALE * this.zoom;
      let sx = dx * cos - dz * sin; let sy = dx * sin + dz * cos;
      const d = Math.hypot(sx, sy);
      if (d > R) { if (!b.edge) continue; sx *= R / d; sy *= R / d; }
      this.drawBlip(g, W / 2 + sx, H / 2 + sy, b);
    }
    // the player arrow
    g.save();
    g.translate(W / 2, H / 2);
    const facing = p.inVehicle ? p.vehicle.heading : p.facing;
    g.rotate(theta + Math.atan2(Math.cos(facing), Math.sin(facing)) + Math.PI / 2);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#111'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3.5); g.lineTo(-6.5, 7); g.closePath();
    g.stroke(); g.fill();
    g.restore();
    // north marker and a ring
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3;
    g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); g.stroke();
    const ang = theta - Math.PI / 2;
    const px = W / 2 + Math.cos(ang) * (W / 2 - 12); const py = H / 2 + Math.sin(ang) * (H / 2 - 12);
    g.fillStyle = '#111'; g.beginPath(); g.arc(px, py, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', px, py + 1);
    g.restore();
  }

  drawBlip(g, x, y, b) {
    g.save();
    g.fillStyle = b.color; g.strokeStyle = '#111'; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, b.size, 0, Math.PI * 2); g.fill(); g.stroke();
    if (b.label) { g.fillStyle = '#111'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.label, x, y + 0.5); }
    g.restore();
  }

  /** The whole city on a larger canvas, for the pause menu map. */
  drawFullMap(canvas, game) {
    const g = canvas.getContext('2d');
    const s = Math.min(canvas.width / ((SEA_X + 60 - this.origin.x) * SCALE), canvas.height / ((HARBOR_WATER_Z + 60 - this.origin.z) * SCALE));
    g.fillStyle = '#2a7fa8'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.save(); g.scale(s, s); g.drawImage(this.map, 0, 0); g.restore();
    const at = (x, z) => { const [a, b] = this.toMap(x, z); return [a * s, b * s]; };
    for (const b of this.collectBlips(game)) { const [x, y] = at(b.x, b.z); this.drawBlip(g, x, y, b); }
    const pos = game.player.worldPosition;
    const [x, y] = at(pos.x, pos.z);
    this.drawBlip(g, x, y, { color: '#ffffff', size: 7, label: 'R' });
    g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center';
    for (const key of ['saltAndLime', 'okaforKustoms', 'brandtTower', 'marina', 'warehouse', 'hospital', 'precinct', 'lighthouse']) {
      const pl = PLACES[key]; const [lx, ly] = at(pl.x, pl.z);
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(lx - 48, ly - 22, 96, 15);
      g.fillStyle = '#fff'; g.fillText(pl.name, lx, ly - 10);
    }
  }
}
