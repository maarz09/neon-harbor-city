// The heads-up display, drawn as HTML over the 3D view: objective panel, money, clock, wanted
// stars, weapon and ammo, health and armour bars under the minimap, district name, speedometer
// and radio station while driving, crosshair, toasts, big banners, subtitles and story cards.
import { WEAPONS } from './config.js';
import { CAST } from './story.js';
import { areaNameAt } from './cityLayout.js';

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

/** "~word~" becomes a highlighted span. */
export function highlight(text) {
  return String(text).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/~([^~]+)~/g, '<b>$1</b>');
}

export class Hud {
  constructor(root) {
    this.root = root;
    this.objective = el('div', 'hud-objective', root);
    this.objectiveTitle = el('div', 'hud-objective-title', this.objective, 'OBJECTIVE');
    this.objectiveText = el('div', 'hud-objective-text', this.objective);
    this.objectiveExtra = el('div', 'hud-objective-extra', this.objective);

    const tr = el('div', 'hud-topright', root);
    this.clock = el('div', 'hud-clock', tr);
    this.money = el('div', 'hud-money', tr);
    this.weapon = el('div', 'hud-weapon', tr);
    this.stars = el('div', 'hud-stars', tr);
    this.starEls = [];
    for (let k = 0; k < 5; k += 1) this.starEls.push(el('span', 'hud-star', this.stars, '★'));

    const bl = el('div', 'hud-bottomleft', root);
    this.minimapCanvas = el('canvas', 'hud-minimap', bl);
    this.minimapCanvas.width = 220; this.minimapCanvas.height = 220;
    const bars = el('div', 'hud-bars', bl);
    this.healthBar = el('div', 'hud-bar-fill health', el('div', 'hud-bar', bars));
    this.armourBar = el('div', 'hud-bar-fill armour', el('div', 'hud-bar', bars));
    this.area = el('div', 'hud-area', root);

    const br = el('div', 'hud-bottomright', root);
    this.vehicleName = el('div', 'hud-vehicle', br);
    this.vehicleHealth = el('div', 'hud-bar-fill vehicle', el('div', 'hud-bar hud-vehicle-bar', br));
    this.speed = el('div', 'hud-speed', br);
    this.radio = el('div', 'hud-radio', root);

    this.crosshair = el('div', 'hud-crosshair', root);
    this.toasts = el('div', 'hud-toasts', root);
    this.bannerEl = el('div', 'hud-banner', root);
    this.subtitle = el('div', 'hud-subtitle', root);
    this.card = el('div', 'hud-card', root);
    this.hint = el('div', 'hud-hint', root);

    this.toastList = [];   // { el, age }: toasts fade by game time, not wall-clock time
    this.queue = [];
    this.lineTimer = 0;
    this.talking = false;
    this.bannerTimer = 0;
    this.cardTimer = 0;
    this.radioTimer = 0;
    this.hintTimer = 0;
    this.lastArea = '';
  }

  toast(text, kind = '') {
    const t = el('div', `hud-toast ${kind}`, this.toasts, highlight(text));
    this.toastList.push({ el: t, age: 0 });
    while (this.toastList.length > 4) this.toastList.shift().el.remove();
  }

  banner(title, sub = '', kind = '') {
    this.bannerEl.className = `hud-banner show ${kind}`;
    this.bannerEl.innerHTML = `<div class="t">${highlight(title)}</div><div class="s">${highlight(sub)}</div>`;
    this.bannerTimer = 3.6;
  }

  storyCard(title, lines) {
    this.card.innerHTML = `<h2>${highlight(title)}</h2>${lines.map((l) => `<p>${highlight(l)}</p>`).join('')}`;
    this.card.classList.add('show');
    this.cardTimer = 9;
  }

  showHint(text, seconds = 5) {
    this.hint.innerHTML = highlight(text);
    this.hint.classList.add('show');
    this.hintTimer = seconds;
  }

  /** Queue lines of dialogue: [castKey, text] pairs shown as subtitles one after another. */
  dialogue(lines) {
    this.queue.push(...lines);
    this.talking = true;
    if (this.lineTimer <= 0) this.nextLine();
  }

  nextLine() {
    const line = this.queue.shift();
    if (!line) { this.talking = false; this.subtitle.classList.remove('show'); return; }
    const who = CAST[line[0]];
    this.subtitle.innerHTML = `<span style="color:${who.color}">${who.name}:</span> ${highlight(line[1])}`;
    this.subtitle.classList.add('show');
    this.lineTimer = 1.6 + line[1].length * 0.045;
  }

  /** Pressing Enter skips the current line. */
  skipLine() { if (this.talking) { this.lineTimer = 0; this.nextLine(); } }

  stopDialogue() { this.queue = []; this.lineTimer = 0; this.talking = false; this.subtitle.classList.remove('show'); }

  showRadio(name) { this.radio.innerHTML = name ? `<span>RADIO</span> ${highlight(name)}` : '<span>RADIO</span> Off'; this.radio.classList.add('show'); this.radioTimer = 3.5; }

  setVisible(v) { this.root.style.display = v ? '' : 'none'; }

  update(dt, game) {
    const p = game.player;
    this.money.textContent = `$${Math.floor(p.money).toLocaleString('en-US')}`;
    this.clock.textContent = game.dayNight.clockText();
    const w = WEAPONS[p.weapon];
    this.weapon.innerHTML = p.weapon === 'fists' ? `<span class="wname">${w.name}</span>` : `<span class="wname">${w.name}</span> <span class="ammo">${p.weapons[p.weapon]}</span>`;
    const lvl = game.wanted.level;
    const flash = game.wanted.searching && Math.floor(performance.now() / 300) % 2 === 0;
    this.starEls.forEach((s, k) => { s.className = `hud-star${k < lvl ? (flash ? ' on dim' : ' on') : ''}`; });
    this.stars.classList.toggle('active', lvl > 0);
    this.healthBar.style.width = `${Math.max(0, p.health)}%`;
    this.healthBar.classList.toggle('low', p.health < 30);
    this.armourBar.style.width = `${Math.max(0, p.armour)}%`;

    const m = game.missions;
    this.objectiveTitle.textContent = m.active ? m.active.def.title.toUpperCase() : 'PALMIRA BAY';
    const activity = game.activities.objectiveText();
    if (activity && !m.active) this.objectiveTitle.textContent = game.activities.race ? 'SUNSET SPRINT' : 'BAY CAB';
    this.objectiveText.innerHTML = highlight(activity && !m.active ? activity : m.objectiveText());
    let extra = m.counter || '';
    if (m.active && m.timer > 0) extra = `<span class="timer">${Math.floor(m.timer / 60)}:${String(Math.floor(m.timer % 60)).padStart(2, '0')}</span> ${extra}`;
    if (game.wanted.level > 0 && game.wanted.searching) extra += ' <span class="search">Cops searching…</span>';
    this.objectiveExtra.innerHTML = extra;

    const pos = p.worldPosition;
    const area = areaNameAt(pos.x, pos.z);
    this.area.textContent = area;
    if (area !== this.lastArea) { this.area.classList.remove('pulse'); void this.area.offsetWidth; this.area.classList.add('pulse'); this.lastArea = area; }

    if (p.inVehicle) {
      this.vehicleName.textContent = p.vehicle.name;
      this.speed.innerHTML = `${Math.round(p.vehicle.speedKmh)}<small>km/h</small>`;
      this.vehicleHealth.style.width = `${p.vehicle.health}%`;
      this.speed.parentElement.classList.add('show');
    } else this.speed.parentElement.classList.remove('show');
    this.crosshair.classList.toggle('show', !p.inVehicle && p.weapon !== 'fists');
    this.crosshair.classList.toggle('aim', p.aiming);

    for (const t of [...this.toastList]) {
      t.age += dt;
      if (t.age > 2.6) t.el.classList.add('out');
      if (t.age > 3.2) { t.el.remove(); this.toastList.splice(this.toastList.indexOf(t), 1); }
    }
        if (this.talking || this.lineTimer > 0) { this.lineTimer -= dt; if (this.lineTimer <= 0) this.nextLine(); }
    if (this.bannerTimer > 0) { this.bannerTimer -= dt; if (this.bannerTimer <= 0) this.bannerEl.classList.remove('show'); }
    if (this.cardTimer > 0) { this.cardTimer -= dt; if (this.cardTimer <= 0) this.card.classList.remove('show'); }
    if (this.radioTimer > 0) { this.radioTimer -= dt; if (this.radioTimer <= 0) this.radio.classList.remove('show'); }
    if (this.hintTimer > 0) { this.hintTimer -= dt; if (this.hintTimer <= 0) this.hint.classList.remove('show'); }
  }
}
