// In-car radio with three original stations, all composed live by a small sequencer: chord
// progressions, a bass line, pads, an arpeggiated lead and a drum machine, each station with
// its own tempo, key and sound. The title screen plays Coral 101.5 softly.

const STATIONS = [
  { name: 'Coral 101.5 · Sunset Synth', bpm: 96, root: 45, scale: [0, 2, 3, 5, 7, 8, 10], chords: [0, 5, 3, 6], lead: 'sawtooth', bass: 'sawtooth', swing: 0, drums: 'synth' },
  { name: 'Bay Bass FM · Night Drive', bpm: 118, root: 41, scale: [0, 2, 3, 5, 7, 8, 11], chords: [0, 0, 5, 4], lead: 'square', bass: 'square', swing: 0, drums: 'break' },
  { name: 'Radio Mangrove · Island Groove', bpm: 104, root: 48, scale: [0, 2, 4, 5, 7, 9, 11], chords: [0, 4, 5, 3], lead: 'triangle', bass: 'triangle', swing: 0.12, drums: 'island' },
];

const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

export class Radio {
  constructor(audio) {
    this.audio = audio;
    this.station = -1;     // -1 = off
    this.nextTime = 0;
    this.step = 0;
    this.seed = 1;
    this.volume = 1;
  }

  get stationName() { return this.station >= 0 ? STATIONS[this.station].name : ''; }

  tune(index) {
    this.station = index;
    this.step = 0;
    if (this.audio.ctx) this.nextTime = this.audio.ctx.currentTime + 0.05;
  }

  /** Cycle stations (and off). Returns the new station name. */
  next() {
    this.tune(this.station + 1 >= STATIONS.length ? -1 : this.station + 1);
    return this.stationName;
  }

  random() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }

  /** Schedule the notes of the next ~0.25 s. Call every frame. */
  update(targetVolume) {
    const a = this.audio;
    if (!a.ctx) return;
    a.music.gain.setTargetAtTime(0.32 * targetVolume, a.ctx.currentTime, 0.3);
    if (this.station < 0 || targetVolume <= 0) return;
    const s = STATIONS[this.station];
    const sixteenth = 60 / s.bpm / 4;
    if (this.nextTime < a.ctx.currentTime - 0.5) this.nextTime = a.ctx.currentTime + 0.05;
    while (this.nextTime < a.ctx.currentTime + 0.25) {
      const swing = this.step % 2 ? s.swing * sixteenth : 0;
      this.playStep(s, this.step, this.nextTime + swing, sixteenth);
      this.nextTime += sixteenth;
      this.step += 1;
    }
  }

  degree(s, deg, octave = 0) {
    const n = s.scale.length;
    const o = Math.floor(deg / n);
    return s.root + s.scale[((deg % n) + n) % n] + 12 * (o + octave);
  }

  note(freq, time, dur, type, gain, cutoff = 2400) {
    const c = this.audio.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, time); g.gain.exponentialRampToValueAtTime(gain, time + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(f); f.connect(g); g.connect(this.audio.music);
    o.start(time); o.stop(time + dur + 0.05);
  }

  hit(time, freq, dur, gain, type = 'lowpass', noise = true) {
    const a = this.audio; const c = a.ctx;
    if (noise) {
      const src = c.createBufferSource(); src.buffer = a.noise;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      const g = c.createGain(); g.gain.setValueAtTime(gain, time); g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      src.connect(f); f.connect(g); g.connect(a.music); src.start(time, Math.random()); src.stop(time + dur + 0.02);
    } else {
      const o = c.createOscillator(); o.frequency.setValueAtTime(freq, time); o.frequency.exponentialRampToValueAtTime(40, time + dur);
      const g = c.createGain(); g.gain.setValueAtTime(gain, time); g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      o.connect(g); g.connect(a.music); o.start(time); o.stop(time + dur + 0.02);
    }
  }

  playStep(s, step, t, six) {
    const bar = Math.floor(step / 16); const beat = step % 16;
    const chord = s.chords[bar % s.chords.length];
    if (beat === 0) this.seed = 1 + bar * 7919 + this.station * 31;
    // drums
    if (s.drums === 'synth') {
      if (beat % 4 === 0) this.hit(t, 150, 0.3, 0.9, 'lowpass', false);
      if (beat === 4 || beat === 12) this.hit(t, 1800, 0.18, 0.35, 'bandpass');
      if (beat % 2 === 0) this.hit(t, 8000, 0.04, 0.12, 'highpass');
    } else if (s.drums === 'break') {
      if (beat === 0 || beat === 10) this.hit(t, 140, 0.25, 0.9, 'lowpass', false);
      if (beat === 4 || beat === 12 || beat === 15) this.hit(t, 2000, 0.15, 0.35, 'bandpass');
      this.hit(t, 9000, 0.03, beat % 2 ? 0.06 : 0.12, 'highpass');
    } else {
      if (beat === 0 || beat === 6 || beat === 8) this.hit(t, 120, 0.22, 0.8, 'lowpass', false);
      if (beat === 4 || beat === 12) this.hit(t, 3000, 0.08, 0.3, 'bandpass');
      if (beat % 4 === 2) this.hit(t, 6000, 0.05, 0.15, 'highpass');
    }
    // bass on eighths following the chord root
    if (beat % 2 === 0) {
      const octave = beat % 4 === 2 ? 1 : 0;
      this.note(midiToHz(this.degree(s, chord, -1) + 12 * octave), t, six * 1.8, s.bass, 0.16, 500);
    }
    // pad chord at each bar
    if (beat === 0) for (const d of [0, 2, 4]) this.note(midiToHz(this.degree(s, chord + d, 1)), t, six * 16, 'triangle', 0.045, 1600);
    // arpeggio lead: a seeded pattern over the chord tones
    if (beat % 2 === 0 || s.drums === 'break') {
      const r = this.random();
      if (r < 0.72) {
        const tones = [0, 2, 4, 7];
        const d = chord + tones[Math.floor(this.random() * tones.length)];
        this.note(midiToHz(this.degree(s, d, 2)), t, six * 1.5, s.lead, 0.05, 2600);
      }
    }
  }
}
