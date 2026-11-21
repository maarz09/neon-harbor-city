// Procedural textures painted on canvases at start-up: building facades (day colour and the lit
// windows used at night), asphalt, sand, grass, glow sprites and neon shop signs. No image files.
import * as THREE from 'three';
import { createRng } from './rng.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * Facade atlas: four facade styles stacked vertically (stucco, glass tower, deco hotel, warehouse).
 * The colour map has white walls (tinted by vertex colour) and dark glass; the emissive map holds
 * only the windows that are lit after dark.
 */
export function paintFacadeTextures() {
  const size = 512;
  const [c, g] = canvas(size, size * 4);
  const [e, ge] = canvas(size, size * 4);
  const rand = createRng(77);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, size, size * 4);
  const styles = [
    { wall: '#f4efe6', glass: '#2c3f55', cols: 4, rows: 4, wx: 0.55, wy: 0.5, frame: '#d9d2c4' },
    { wall: '#c9d6df', glass: '#33536e', cols: 6, rows: 6, wx: 0.86, wy: 0.8, frame: '#8aa0b2' },
    { wall: '#fbf6ee', glass: '#3a5a6a', cols: 4, rows: 4, wx: 0.42, wy: 0.56, frame: '#ffffff' },
    { wall: '#e4ddd2', glass: '#46525e', cols: 3, rows: 2, wx: 0.7, wy: 0.22, frame: '#b8afa2' },
  ];
  styles.forEach((s, k) => {
    const y0 = k * size;
    g.fillStyle = s.wall; g.fillRect(0, y0, size, size);
    // grime and texture noise
    for (let i = 0; i < 2600; i += 1) {
      g.fillStyle = `rgba(0,0,0,${rand.range(0.01, 0.05)})`;
      g.fillRect(rand.range(0, size), y0 + rand.range(0, size), rand.range(1, 4), rand.range(1, 4));
    }
    const cw = size / s.cols; const rh = size / s.rows;
    for (let r = 0; r < s.rows; r += 1) {
      for (let col = 0; col < s.cols; col += 1) {
        const w = cw * s.wx; const h = rh * s.wy;
        const x = col * cw + (cw - w) / 2; const y = y0 + r * rh + (rh - h) / 2;
        g.fillStyle = s.frame; g.fillRect(x - 3, y - 3, w + 6, h + 6);
        const grad = g.createLinearGradient(x, y, x + w, y + h);
        grad.addColorStop(0, s.glass); grad.addColorStop(0.55, '#5d86a6'); grad.addColorStop(1, s.glass);
        g.fillStyle = grad; g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, w * 0.25, h);
        if (rand.chance(k === 3 ? 0.25 : 0.42)) {
          const warm = rand.pick(['#ffd28a', '#ffe9b8', '#ffc070', '#bfe3ff', '#ffb6d9']);
          ge.fillStyle = warm; ge.fillRect(x + 2, y + 2, w - 4, h - 4);
          ge.fillStyle = 'rgba(0,0,0,0.35)'; ge.fillRect(x + 2, y + h * 0.55, w - 4, 3);
        }
      }
    }
    if (k === 2) { // deco hotel: horizontal pastel bands
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (let r = 0; r < s.rows; r += 1) g.fillRect(0, y0 + r * rh + 2, size, 8);
    }
    if (k === 3) { // warehouse: corrugated stripes and a roller door row
      g.fillStyle = 'rgba(0,0,0,0.08)';
      for (let x = 0; x < size; x += 12) g.fillRect(x, y0, 5, size);
    }
    // a plain wall strip in the top left corner for roofs
    g.fillStyle = '#9c9890'; g.fillRect(0, y0, 6, 6);
    ge.fillStyle = '#000'; ge.fillRect(0, y0, 6, 6);
  });
  return { map: toTexture(c), emissive: toTexture(e), styles: styles.length };
}

export function paintAsphaltTexture() {
  const [c, g] = canvas(256, 256);
  const rand = createRng(5);
  g.fillStyle = '#4c4f55'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i += 1) {
    const v = rand.int(55, 110);
    g.fillStyle = `rgba(${v},${v},${v + 4},0.35)`;
    g.fillRect(rand.range(0, 256), rand.range(0, 256), 1.5, 1.5);
  }
  for (let i = 0; i < 6; i += 1) {
    g.strokeStyle = 'rgba(25,25,25,0.16)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(rand.range(0, 256), rand.range(0, 256));
    for (let k = 0; k < 5; k += 1) g.lineTo(rand.range(0, 256), rand.range(0, 256));
    g.stroke();
  }
  return toTexture(c);
}

export function paintGroundTexture(base, speck, seed) {
  const [c, g] = canvas(256, 256);
  const rand = createRng(seed);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7000; i += 1) {
    g.fillStyle = rand.pick(speck);
    g.globalAlpha = rand.range(0.2, 0.6);
    g.fillRect(rand.range(0, 256), rand.range(0, 256), rand.range(1, 3), rand.range(1, 3));
  }
  g.globalAlpha = 1;
  return toTexture(c);
}

export function paintPavingTexture() {
  const [c, g] = canvas(256, 256);
  const rand = createRng(19);
  g.fillStyle = '#d6cfc3'; g.fillRect(0, 0, 256, 256);
  // slightly varied slabs, then faint joints between them
  for (let x = 0; x < 256; x += 64) {
    for (let y = 0; y < 256; y += 64) {
      const v = rand.int(-10, 10);
      g.fillStyle = `rgb(${214 + v},${207 + v},${195 + v})`; g.fillRect(x, y, 64, 64);
    }
  }
  g.strokeStyle = 'rgba(110,100,90,0.22)'; g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
  }
  return toTexture(c);
}

/** Soft round glow for street lamps, headlights, sirens and particles. */
export function paintGlowTexture() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** A neon shop sign with the given text and colour, drawn with a blurred glow. */
export function paintNeonSign(text, color, bg = '#140a1e') {
  const [c, g] = canvas(512, 128);
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(8, 8, 496, 112);
  g.font = 'bold 64px "Trebuchet MS", "Segoe UI", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 24;
  g.fillStyle = color; g.fillText(text, 256, 68);
  g.shadowBlur = 6; g.fillStyle = '#fff'; g.globalAlpha = 0.65; g.fillText(text, 256, 68);
  return toTexture(c, false);
}

/** Painted billboard art: a sunset gradient with a brand slogan. */
export function paintBillboard(title, slogan, hueA, hueB) {
  const [c, g] = canvas(512, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, hueA); grad.addColorStop(1, hueB);
  g.fillStyle = grad; g.fillRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(255,240,200,0.85)';
  g.beginPath(); g.arc(400, 150, 70, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(20,10,30,0.8)';
  for (let i = 0; i < 6; i += 1) g.fillRect(0, 190 + i * 10, 512, 4);
  g.font = 'italic bold 66px "Trebuchet MS", sans-serif';
  g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 10;
  g.fillText(title, 24, 90);
  g.font = 'bold 26px "Trebuchet MS", sans-serif';
  g.fillText(slogan, 28, 136);
  return toTexture(c, false);
}

export function paintStarTexture() {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 ? 13 : 30; const a = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.fill();
  return new THREE.CanvasTexture(c);
}
