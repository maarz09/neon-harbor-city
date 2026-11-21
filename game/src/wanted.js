// The wanted level: crimes raise it (with a chance that nobody saw a minor one), the police
// keep it up while they can see the player, and staying out of sight long enough drops it one
// star at a time. The HUD flashes the stars while the cops are searching.
import { POLICE_TUNING } from './config.js';
import { rng } from './rng.js';

export const CRIMES = {
  assault: { stars: 1, witness: 0.6, label: 'Assault' },
  carjack: { stars: 1, witness: 0.7, label: 'Vehicle theft' },
  hitAndRun: { stars: 1, witness: 0.8, label: 'Hit and run' },
  gunfire: { stars: 2, witness: 0.9, label: 'Discharging a firearm' },
  homicide: { stars: 2, witness: 0.9, label: 'Homicide' },
  copAssault: { stars: 2, witness: 1, label: 'Assaulting an officer' },
  copKiller: { stars: 3, witness: 1, label: 'Officer down' },
  copCarWreck: { stars: 3, witness: 1, label: 'Destroying police property' },
  alarm: { stars: 2, witness: 1, label: 'Car alarm tripped' },
  heist: { stars: 3, witness: 1, label: 'Armed robbery' },
};

export class WantedSystem {
  constructor() {
    this.level = 0;
    this.heat = 0;          // crimes stacked on the current level, pushes it toward the next star
    this.hiddenTimer = 0;   // seconds out of police sight
    this.seen = false;
    this.lastCrime = '';
    this.maxLevel = 5;
    this.onChange = null;
  }

  get searching() { return this.level > 0 && !this.seen; }

  /** Seconds the player must stay hidden to drop a star at the current level. */
  get loseTime() { return POLICE_TUNING.loseSeconds + this.level * 2.5; }

  report(crimeName, policeNearby = false) {
    const crime = CRIMES[crimeName];
    if (!crime) return;
    if (!policeNearby && this.level === 0 && !rng.chance(crime.witness)) return;
    this.lastCrime = crime.label;
    const before = this.level;
    if (this.level < crime.stars) this.level = crime.stars;
    else {
      this.heat += crime.stars;
      if (this.heat >= 3 + this.level) { this.level = Math.min(this.maxLevel, this.level + 1); this.heat = 0; }
    }
    this.hiddenTimer = 0;
    if (this.level !== before && this.onChange) this.onChange(this.level, before);
  }

  setLevel(level) {
    const before = this.level;
    this.level = Math.max(0, Math.min(this.maxLevel, level));
    this.heat = 0; this.hiddenTimer = 0;
    if (this.level !== before && this.onChange) this.onChange(this.level, before);
  }

  clear() { this.setLevel(0); }

  /** Call every step with whether any officer currently sees the player. */
  update(dt, seen) {
    this.seen = seen;
    if (this.level === 0) return;
    if (seen) { this.hiddenTimer = 0; return; }
    this.hiddenTimer += dt;
    if (this.hiddenTimer >= this.loseTime) {
      this.hiddenTimer = 0;
      this.setLevel(this.level - 1);
    }
  }
}
