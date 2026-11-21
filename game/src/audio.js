// Every sound is synthesised with WebAudio at run time, no sample files: the player's engine
// (pitch follows speed and throttle), police sirens that wail louder as cruisers close in,
// gunshots, punches, crashes, explosions, pickups and the mission jingles.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.8;
  }

  /** Browsers only allow audio after a user gesture: call this from a key or click handler. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.volume; this.master.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.7; this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = 0.35; this.music.connect(this.master);
    const len = c.sampleRate; const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
    for (let k = 0; k < len; k += 1) d[k] = Math.random() * 2 - 1;
    this.noise = buf;
    this.buildEngine();
    this.buildSiren();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  buildEngine() {
    const c = this.ctx;
    this.engineGain = c.createGain(); this.engineGain.gain.value = 0;
    this.engineFilter = c.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 600;
    this.engineA = c.createOscillator(); this.engineA.type = 'sawtooth'; this.engineA.frequency.value = 40;
    this.engineB = c.createOscillator(); this.engineB.type = 'square'; this.engineB.frequency.value = 20;
    const bGain = c.createGain(); bGain.gain.value = 0.4;
    this.engineA.connect(this.engineFilter); this.engineB.connect(bGain); bGain.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.sfx);
    this.engineA.start(); this.engineB.start();
  }

  buildSiren() {
    const c = this.ctx;
    this.sirenGain = c.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc = c.createOscillator(); this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 700;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.7;
    this.sirenOsc.connect(f); f.connect(this.sirenGain); this.sirenGain.connect(this.sfx);
    this.sirenOsc.start();
    this.sirenPhase = 0;
  }

  /** Engine tone for the car the player drives (0 speed and active=false silences it). */
  setEngine(active, speed, maxSpeed, throttle) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const ratio = Math.min(1, Math.abs(speed) / maxSpeed);
    // fake gear changes: rpm climbs and drops back within each of four gears
    const gear = Math.min(3, Math.floor(ratio * 4));
    const rpm = 0.25 + ((ratio * 4 - gear) * 0.6) + gear * 0.06;
    this.engineA.frequency.setTargetAtTime(38 + rpm * 120, t, 0.05);
    this.engineB.frequency.setTargetAtTime(19 + rpm * 60, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(400 + rpm * 1400 + Math.max(0, throttle) * 600, t, 0.05);
    this.engineGain.gain.setTargetAtTime(active ? 0.08 + Math.max(0, throttle) * 0.07 : 0, t, 0.08);
  }

  /** Wailing siren, `level` 0..1 from how close the nearest cruiser is. */
  setSiren(level, dt) {
    if (!this.ctx) return;
    this.sirenPhase += dt;
    const t = this.ctx.currentTime;
    const f = 650 + (Math.sin(this.sirenPhase * 2.4) * 0.5 + 0.5) * 550;
    this.sirenOsc.frequency.setTargetAtTime(f, t, 0.03);
    this.sirenGain.gain.setTargetAtTime(level * 0.09, t, 0.1);
  }

  /** A burst of filtered noise with an envelope. */
  noiseBurst(duration, freq, q, gain, type = 'lowpass', delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx; const t = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t, Math.random() * 0.5); src.stop(t + duration + 0.05);
  }

  tone(freq, duration, type = 'sine', gain = 0.2, delay = 0, slideTo = null, out = null) {
    if (!this.ctx) return;
    const c = this.ctx; const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g); g.connect(out || this.sfx);
    o.start(t); o.stop(t + duration + 0.05);
  }

  gunshot(vol = 1) { this.noiseBurst(0.25, 2400, 0.6, 0.9 * vol); this.tone(160, 0.12, 'square', 0.25 * vol, 0, 50); }
  punch() { this.noiseBurst(0.08, 600, 1, 0.8); this.tone(90, 0.1, 'sine', 0.5, 0, 50); }
  whoosh() { this.noiseBurst(0.15, 1500, 2, 0.15, 'bandpass'); }
  thud() { this.tone(70, 0.2, 'sine', 0.6, 0, 40); this.noiseBurst(0.15, 400, 1, 0.5); }
  clank() { this.tone(900, 0.12, 'square', 0.12, 0, 500); this.noiseBurst(0.1, 3000, 2, 0.3, 'bandpass'); }
  crash(intensity) { const v = Math.min(1, intensity / 20); this.noiseBurst(0.35 + v * 0.3, 900, 0.7, 0.4 + v * 0.6); this.tone(60, 0.3, 'sawtooth', 0.2 * v, 0, 35); }
  explosion() { this.noiseBurst(1.6, 300, 0.5, 1.2); this.noiseBurst(0.6, 1800, 0.5, 0.6); this.tone(50, 1.2, 'sine', 0.8, 0, 25); }
  pickup() { this.tone(880, 0.1, 'triangle', 0.2); this.tone(1320, 0.15, 'triangle', 0.2, 0.08); }
  checkpoint() { this.tone(660, 0.12, 'square', 0.12); this.tone(990, 0.2, 'square', 0.12, 0.1); }
  uiClick() { this.tone(520, 0.06, 'triangle', 0.15); }
  horn() { this.tone(370, 0.35, 'sawtooth', 0.12); this.tone(466, 0.35, 'sawtooth', 0.1); }
  alarm() { for (let k = 0; k < 6; k += 1) this.tone(k % 2 ? 900 : 1200, 0.18, 'square', 0.1, k * 0.2); }
  missionStart() { [392, 494, 587].forEach((f, k) => this.tone(f, 0.25, 'triangle', 0.18, k * 0.09)); }
  missionPassed() { [523, 659, 784, 1047].forEach((f, k) => this.tone(f, 0.5, 'triangle', 0.2, k * 0.12)); this.tone(262, 1.2, 'sawtooth', 0.08, 0.36); }
  missionFailed() { [392, 330, 262].forEach((f, k) => this.tone(f, 0.45, 'sawtooth', 0.12, k * 0.18)); }
  wasted() { this.tone(220, 2.5, 'sawtooth', 0.15, 0, 55); this.noiseBurst(1.5, 200, 0.5, 0.4); }
}
