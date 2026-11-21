// Save and load through localStorage: story progress, money, health, armour, weapons, found
// conches, stats, time of day and where the player stood. One slot plus an autosave after
// every mission; storage errors (private windows) are caught and reported, never thrown.
import { SAVE_KEY } from './config.js';

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function writeSave(game) {
  const p = game.player;
  const pos = p.worldPosition;
  const data = {
    version: 1,
    savedAt: new Date().toISOString(),
    progress: game.progress,
    stats: game.stats,
    player: { money: p.money, health: p.health, armour: p.armour, weapons: { ...p.weapons, fists: 1 }, weapon: p.weapon, x: pos.x, z: pos.z },
    hour: game.dayNight.hour,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && data.version === 1 ? data : null;
  } catch {
    return null;
  }
}

/** Apply a save to a freshly reset game. */
export function applySave(game, data) {
  game.progress = { missionIndex: 0, completed: [], conches: [], ...data.progress };
  game.stats = { ...game.stats, ...data.stats };
  const p = game.player;
  p.money = data.player.money; p.health = data.player.health; p.armour = data.player.armour;
  p.weapons = { ...data.player.weapons, fists: Infinity };
  p.weapon = p.weapons[data.player.weapon] > 0 ? data.player.weapon : 'fists';
  p.placeAt(data.player.x, data.player.z, 0);
  game.dayNight.hour = data.hour;
}

export function describeSave(data) {
  if (!data) return 'No save';
  const when = new Date(data.savedAt);
  return `${data.progress.completed.length} jobs done · $${Math.floor(data.player.money).toLocaleString('en-US')} · ${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
