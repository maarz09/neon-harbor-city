// Boot: create the game and menus, wire the title screen, pause menu, save/load and defeat
// screens, grab the mouse for mouse look, and run the frame loop. With ?shot=<name> it stages a
// deterministic screenshot scene instead (see shots.js) and sets window.__shotReady.
import { Game } from './game.js';
import { MenuSystem } from './menus.js';
import { readSave, applySave, writeSave } from './save.js';
import { stageShot } from './shots.js';
import { BEACH_X } from './cityLayout.js';

const canvas = document.getElementById('game');
const game = new Game(canvas, document.getElementById('hud'));
window.__game = game;
const params = new URLSearchParams(location.search);
const shot = params.get('shot');

function enterPlay() {
  menus.close();
  game.hud.setVisible(true);
  game.input.requestPointerLock();
}

function showTitle() {
  game.state = 'title';
  game.resetWorld();
  game.traffic.populate(BEACH_X - 20, 220);
  game.peds.populate(BEACH_X - 20, 220);
  game.hud.setVisible(false);
  game.dayNight.hour = 18.4;
  menus.showTitle();
}

function loadSaved() {
  const data = readSave();
  if (!data) return;
  game.resetWorld();
  applySave(game, data);
  game.finishSetup();
  game.hud.toast('Game loaded', 'good');
  enterPlay();
}

const menus = new MenuSystem(document.getElementById('menu'), {
  click: () => { game.audio.unlock(); game.audio.uiClick(); },
  newGame: () => { game.newGame(); enterPlay(); },
  continueGame: loadSaved,
  load: loadSaved,
  resume: () => { game.state = 'play'; enterPlay(); },
  save: () => { const ok = writeSave(game); menus.showPause(game); game.hud.toast(ok ? 'Game saved' : 'Could not save (storage blocked)', ok ? 'good' : 'bad'); },
  quit: showTitle,
  drawMap: (c) => game.minimap.drawFullMap(c, game),
});

game.onDefeat = (kind, detail) => menus.showDefeat(kind, detail);
game.onRespawn = () => { menus.close(); game.respawn(); };

function pause() {
  if (game.state !== 'play') return;
  game.state = 'paused';
  menus.showPause(game);
  if (document.pointerLockElement) document.exitPointerLock();
}

window.addEventListener('keydown', (e) => {
  game.audio.unlock();
  if ((e.code === 'Escape' || e.code === 'KeyM') && game.state === 'play') pause();
});
window.addEventListener('mousedown', () => game.audio.unlock());
canvas.addEventListener('click', () => { if (game.state === 'play') game.input.requestPointerLock(); });
let wasLocked = false;
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (wasLocked && !locked && game.state === 'play') pause();
  wasLocked = locked;
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (game.state !== 'paused') game.tick(dt);
  game.render(dt);
  requestAnimationFrame(frame);
}

if (shot) {
  stageShot(game, shot, Number(params.get('seed') || 1), menus).then(() => { window.__shotReady = true; });
} else {
  showTitle();
  requestAnimationFrame(frame);
}
