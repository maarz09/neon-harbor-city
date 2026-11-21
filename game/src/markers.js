// Mission markers in the world: a glowing column of light with a ring on the ground and a
// spinning chevron above, coloured by purpose (yellow objective, pink contact, green drop-off,
// red target). The minimap reads the same list to draw its blips.
import * as THREE from 'three';

function beamTexture() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 8, 128);
  return new THREE.CanvasTexture(c);
}

export const MARKER_COLORS = { objective: '#ffd23f', contact: '#ff5ab4', dropoff: '#3ddc84', target: '#ff4040', vehicle: '#5ad1ff', save: '#3ddc84' };

export class MarkerSystem {
  constructor(scene) {
    this.scene = scene;
    this.markers = [];
    this.tex = beamTexture();
    this.time = 0;
  }

  /** Add a marker; `follow` (any object with a position) makes it ride on a car or person. */
  add(kind, x, z, opts = {}) {
    const color = new THREE.Color(MARKER_COLORS[kind] || '#ffffff');
    const group = new THREE.Group();
    const radius = opts.radius || 2.2;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, opts.follow ? 0.01 : 7, 24, 1, true),
      new THREE.MeshBasicMaterial({ map: this.tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    beam.position.y = 3.5;
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.85, radius, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
    ring.position.y = 0.2;
    const chevron = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color }));
    chevron.position.y = opts.follow ? 3.4 : 4.2;
    if (!opts.follow) group.add(beam, ring);
    group.add(chevron);
    group.position.set(x, 0, z);
    this.scene.add(group);
    const marker = { kind, group, chevron, x, z, radius, follow: opts.follow || null, label: opts.label || '' };
    this.markers.push(marker);
    return marker;
  }

  remove(marker) {
    if (!marker) return;
    this.scene.remove(marker.group);
    const i = this.markers.indexOf(marker);
    if (i >= 0) this.markers.splice(i, 1);
  }

  clear() { for (const m of [...this.markers]) this.remove(m); }

  update(dt) {
    this.time += dt;
    for (const m of this.markers) {
      if (m.follow) { m.x = m.follow.position.x; m.z = m.follow.position.z; }
      m.group.position.set(m.x, m.follow ? m.follow.position.y : 0, m.z);
      m.chevron.rotation.y += dt * 2.5;
      m.chevron.position.y = (m.follow ? 3.4 : 4.2) + Math.sin(this.time * 3) * 0.2;
    }
  }
}
