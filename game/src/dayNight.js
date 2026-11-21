// The 24-hour clock of Palmira Bay: moves the sun across the sky, blends sky, fog and light
// colours between dawn, noon, golden hour, dusk and night, and turns on street lamps, lit
// windows and neon after sunset. One in-game hour passes every 50 real seconds.
import * as THREE from 'three';

const KEYS = [
  { h: 0, top: '#060a1c', hor: '#1b2346', sun: '#8aa0ff', sunI: 0.12, hemiS: '#2a3a6a', hemiG: '#141020', hemiI: 0.35, fog: '#131a33', night: 1 },
  { h: 5.2, top: '#101a3a', hor: '#3a3358', sun: '#8aa0ff', sunI: 0.15, hemiS: '#3a4a7a', hemiG: '#1a1420', hemiI: 0.4, fog: '#262a48', night: 1 },
  { h: 6.4, top: '#3a5fa8', hor: '#ff9e7a', sun: '#ffb07a', sunI: 1.2, hemiS: '#9fb5e0', hemiG: '#5a4a40', hemiI: 0.7, fog: '#d9a79a', night: 0.3 },
  { h: 9, top: '#2f78d6', hor: '#bfe1ff', sun: '#fff1d6', sunI: 2.6, hemiS: '#bcdcff', hemiG: '#7a6a50', hemiI: 1.0, fog: '#c4dcef', night: 0 },
  { h: 14, top: '#2a73d8', hor: '#cde7ff', sun: '#fff6e0', sunI: 2.9, hemiS: '#c4e0ff', hemiG: '#7a6a50', hemiI: 1.05, fog: '#cfe2f2', night: 0 },
  { h: 17.2, top: '#3b68b8', hor: '#ffc98a', sun: '#ffcf8a', sunI: 2.5, hemiS: '#c5c8ea', hemiG: '#7a5a40', hemiI: 0.95, fog: '#f2c9a0', night: 0 },
  { h: 18.6, top: '#3a3f8f', hor: '#ff7a4a', sun: '#ff8a4a', sunI: 1.9, hemiS: '#b49ad0', hemiG: '#6a4038', hemiI: 0.8, fog: '#f08a68', night: 0.35 },
  { h: 19.6, top: '#1e2160', hor: '#c8508a', sun: '#ff6a6a', sunI: 0.6, hemiS: '#6a5aa0', hemiG: '#2a1a30', hemiI: 0.55, fog: '#6a3a6a', night: 0.8 },
  { h: 21, top: '#080c22', hor: '#24264f', sun: '#8aa0ff', sunI: 0.15, hemiS: '#2a3a6a', hemiG: '#141020', hemiI: 0.38, fog: '#161c38', night: 1 },
  { h: 24, top: '#060a1c', hor: '#1b2346', sun: '#8aa0ff', sunI: 0.12, hemiS: '#2a3a6a', hemiG: '#141020', hemiI: 0.35, fog: '#131a33', night: 1 },
];

const tmpA = new THREE.Color(); const tmpB = new THREE.Color();
function lerpColor(a, b, t, out) { return out.copy(tmpA.set(a)).lerp(tmpB.set(b), t); }

export class DayNightCycle {
  constructor(scene, sky, sea, lamps, buildingMaterial) {
    this.scene = scene; this.sky = sky; this.sea = sea; this.lamps = lamps; this.buildingMaterial = buildingMaterial;
    this.hour = 17.8;
    this.secondsPerHour = 50;
    this.frozen = false;
    this.sunDir = new THREE.Vector3();
    this.fogColor = new THREE.Color();
    this.nightAmount = 0;

    this.hemi = new THREE.HemisphereLight('#bcdcff', '#7a6a50', 1);
    this.sun = new THREE.DirectionalLight('#fff1d6', 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 10; sc.far = 400;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = new THREE.Fog('#cfe2f2', 140, 620);
  }

  /** Clock text for the HUD, e.g. "18:42". */
  clockText() {
    const h = Math.floor(this.hour); const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  update(dt, focus) {
    if (!this.frozen) this.hour = (this.hour + dt / this.secondsPerHour) % 24;
    let k = 0;
    while (k < KEYS.length - 2 && KEYS[k + 1].h <= this.hour) k += 1;
    const a = KEYS[k]; const b = KEYS[k + 1];
    const t = THREE.MathUtils.clamp((this.hour - a.h) / (b.h - a.h), 0, 1);

    // sun path: rises over the sea (east, +x), sets behind the city (west), slightly south
    const dayAngle = ((this.hour - 6) / 12) * Math.PI;
    const elevation = Math.sin(dayAngle);
    const sunUp = elevation > -0.05;
    if (sunUp) this.sunDir.set(Math.cos(dayAngle), Math.max(elevation, 0.06), 0.35).normalize();
    else this.sunDir.set(-0.3, 0.8, 0.4).normalize(); // the moon stands in for the sun
    this.sun.color.copy(lerpColor(a.sun, b.sun, t, new THREE.Color()));
    this.sun.intensity = THREE.MathUtils.lerp(a.sunI, b.sunI, t);
    this.hemi.color.copy(lerpColor(a.hemiS, b.hemiS, t, new THREE.Color()));
    this.hemi.groundColor.copy(lerpColor(a.hemiG, b.hemiG, t, new THREE.Color()));
    this.hemi.intensity = THREE.MathUtils.lerp(a.hemiI, b.hemiI, t);
    lerpColor(a.fog, b.fog, t, this.fogColor);
    this.scene.fog.color.copy(this.fogColor);
    this.nightAmount = THREE.MathUtils.lerp(a.night, b.night, t);

    this.sun.position.copy(focus).addScaledVector(this.sunDir, 180);
    this.sun.target.position.copy(focus);

    const u = this.sky.uniforms;
    lerpColor(a.top, b.top, t, u.topColor.value);
    lerpColor(a.hor, b.hor, t, u.horizonColor.value);
    u.groundColor.value.copy(this.fogColor).multiplyScalar(0.6);
    u.sunDir.value.copy(sunUp ? this.sunDir : this.sunDir.clone().set(-0.3, 0.6, 0.4));
    u.sunColor.value.copy(this.sun.color).multiplyScalar(sunUp ? 1 : 0.35);
    u.starAmount.value = this.nightAmount;
    this.sky.dome.position.copy(focus);

    const s = this.sea.uniforms;
    s.time.value += dt;
    s.sunDir.value.copy(this.sunDir);
    s.sunColor.value.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.45);
    s.skyColor.value.copy(u.horizonColor.value).lerp(u.topColor.value, 0.3);
    s.fogColor.value.copy(this.fogColor);
    s.deepColor.value.set('#0b5f86').multiplyScalar(1 - this.nightAmount * 0.8);
    s.shallowColor.value.set('#29c3c9').multiplyScalar(1 - this.nightAmount * 0.8);

    const n = this.nightAmount;
    this.lamps.poolMat.opacity = n * 0.55;
    this.lamps.glowMat.opacity = n * 0.9;
    this.buildingMaterial.emissiveIntensity = n * 1.1;
  }
}
