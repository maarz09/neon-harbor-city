// Full-screen menus: the title screen (new game, continue, controls), the pause menu (resume,
// map, save, load, controls, settings, quit) and the FLATLINED / CUFFED screens shown when the
// player dies or is arrested. Keyboard (arrows + Enter) and mouse both work.
import { hasSave, readSave, describeSave } from './save.js';

const CONTROLS = [
  ['W A S D', 'Walk / drive'], ['Mouse', 'Look around'], ['Shift', 'Sprint'], ['Space', 'Jump / handbrake'],
  ['E or F', 'Enter, steal or exit a car'], ['T', 'Look for fares in a Bay Cab'], ['Left click', 'Punch / shoot'], ['Right click', 'Aim'],
  ['Q / wheel / 1-3', 'Switch weapon'], ['R', 'Change radio station'], ['H', 'Horn'], ['Enter', 'Skip dialogue'],
  ['M or Esc', 'Pause menu and map'],
];

function controlsHtml() {
  return `<div class="controls">${CONTROLS.map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`).join('')}</div>`;
}

export class MenuSystem {
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;   // { newGame, continueGame, resume, save, load, quit, setVolume, drawMap }
    this.screen = null;
    this.items = [];
    this.focus = 0;
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  get open() { return !!this.screen; }

  render(html) {
    this.root.innerHTML = html;
    this.root.classList.add('show');
    this.items = [...this.root.querySelectorAll('[data-action]')];
    this.items.forEach((b, k) => {
      b.addEventListener('click', (e) => { e.stopPropagation(); this.activate(k); });
      b.addEventListener('mouseenter', () => this.setFocus(k));
    });
    this.setFocus(0);
  }

  setFocus(k) {
    if (!this.items.length) return;
    this.focus = (k + this.items.length) % this.items.length;
    this.items.forEach((b, n) => b.classList.toggle('focus', n === this.focus));
  }

  activate(k) {
    const b = this.items[k];
    if (!b) return;
    const action = b.dataset.action;
    if (this.handlers.click) this.handlers.click();
    const fn = this[`on_${action}`];
    if (fn) fn.call(this); else if (this.handlers[action]) this.handlers[action]();
  }

  onKey(e) {
    if (!this.open) return;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.setFocus(this.focus + 1); e.preventDefault(); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { this.setFocus(this.focus - 1); e.preventDefault(); }
    else if (e.code === 'Enter' || e.code === 'Space') { this.activate(this.focus); e.preventDefault(); }
    else if (e.code === 'Escape' && this.screen === 'pause') { this.handlers.resume(); }
    else if (e.code === 'Escape' && this.screen === 'sub') { this.back(); }
  }

  close() { this.screen = null; this.root.classList.remove('show'); this.root.innerHTML = ''; }

  showTitle() {
    this.screen = 'title';
    const save = readSave();
    this.render(`
      <div class="title-screen">
        <div class="logo"><span class="neon">NEON</span><span class="harbor">HARBOR</span></div>
        <div class="tagline">Palmira Bay · an open-world crime story</div>
        <div class="menu">
          <button data-action="newGame">New Game</button>
          ${hasSave() ? `<button data-action="continueGame">Continue <small>${describeSave(save)}</small></button>` : ''}
          <button data-action="controls">Controls</button>
        </div>
        <div class="footer">Click to play · original game, all names and places fictional</div>
      </div>`);
    this.backTo = () => this.showTitle();
  }

  showPause(game) {
    this.screen = 'pause';
    this.render(`
      <div class="pause-screen">
        <div class="pause-left">
          <h1>PAUSED</h1>
          <div class="menu">
            <button data-action="resume">Resume</button>
            <button data-action="save">Save game</button>
            <button data-action="load" ${hasSave() ? '' : 'disabled'}>Load game</button>
            <button data-action="controls">Controls</button>
            <button data-action="volume">Volume: ${Math.round(game.audio.volume * 100)}%</button>
            <button data-action="quit">Quit to title</button>
          </div>
          <div class="stats">
            <div>Jobs done <b>${game.progress.completed.length}/5</b></div>
            <div>Golden Conches <b>${game.progress.conches.length}/12</b></div>
            <div>Cars stolen <b>${game.stats.carsStolen}</b></div>
            <div>Takedowns <b>${game.stats.takedowns}</b></div>
            <div>Races won <b>${game.stats.racesWon || 0}</b> · Fares <b>${game.stats.fares || 0}</b></div>
          </div>
        </div>
        <div class="pause-map"><canvas width="760" height="640"></canvas><div class="legend"><span class="m">M/D</span> contacts <span class="y">●</span> objective <span class="g">H</span> safehouse <span class="r">●</span> police</div></div>
      </div>`);
    this.handlers.drawMap(this.root.querySelector('canvas'));
    this.backTo = () => this.showPause(game);
    this.game = game;
  }

  on_controls() {
    const from = this.screen;
    this.screen = 'sub';
    this.render(`<div class="sub-screen"><h1>CONTROLS</h1>${controlsHtml()}<div class="menu"><button data-action="back">Back</button></div></div>`);
    this.backScreen = from;
  }

  on_volume() {
    const g = this.game;
    const next = g.audio.volume >= 0.99 ? 0 : Math.min(1, Math.round((g.audio.volume + 0.2) * 10) / 10);
    g.audio.setVolume(next);
    this.showPause(g);
    this.setFocus(4);
  }

  on_back() { this.back(); }

  back() { this.backTo(); }

  /** FLATLINED or CUFFED: a short screen before respawning. */
  showDefeat(kind, detail) {
    this.screen = 'defeat';
    const title = kind === 'busted' ? 'CUFFED' : 'FLATLINED';
    this.render(`<div class="defeat ${kind}"><div class="big">${title}</div><div class="detail">${detail}</div></div>`);
  }
}
