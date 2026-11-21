// Automated play-test: opens the game, starts a new game from the title menu with the keyboard,
// walks into Mari's marker, gets into the nearest car and drives with WASD, raises the wanted
// level to watch the police respond, pauses and saves. Reports console errors and a few
// numbers from the running game, and saves a screenshot of the end state.
//   node tools/playtest.mjs [baseUrl] [screenshotPath]
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://localhost:8080/';
const shotPath = process.argv[3] || '';
const errors = [];

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const read = (expr) => page.evaluate(expr);
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };

console.log('state at load:', await read('window.__game.state'));
await page.keyboard.press('Enter');            // New Game
await page.waitForTimeout(800);
console.log('state after Enter:', await read('window.__game.state'));
// walk toward Mari's contact marker (4 m west, 3 m south of the start)
await read(`(() => { const g = window.__game; g.camera.yaw = Math.atan2(-4, 3); return 0; })()`);
await hold('KeyW', 2500);
console.log('mission active:', await read('window.__game.missions.active ? window.__game.missions.active.def.title : null'));
await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
await page.waitForTimeout(500);
console.log('objective:', await read('window.__game.missions.objectiveText()'));
// teleport beside the nearest car and press E
await read(`(() => { const g = window.__game; const v = g.missions.taggedVehicle('mari-car') || g.fleet.list[0]; const d = v.doorPosition(); g.player.placeAt(d.x, d.z, 0); return v.name; })()`);
await page.keyboard.press('KeyE');
await page.waitForTimeout(300);
console.log('in vehicle:', await read('window.__game.player.inVehicle && window.__game.player.vehicle.name'));
await page.keyboard.down('KeyW');
await page.waitForTimeout(2500);
await hold('KeyD', 600);
await page.keyboard.up('KeyW');
console.log('speed km/h:', await read('Math.round(window.__game.player.vehicle ? window.__game.player.vehicle.speedKmh : -1)'));
await page.keyboard.press('KeyR');
// crime: force two stars and let the police come
await read('window.__game.wanted.setLevel(2)');
await page.waitForTimeout(5000);
console.log('police units:', await read('window.__game.police.units.length'), 'stars:', await read('window.__game.wanted.level'));
// get out, punch the air, switch weapon
await page.keyboard.press('KeyF');
await page.waitForTimeout(300);
await page.mouse.click(640, 360);
await page.waitForTimeout(300);
console.log('on foot:', await read('!window.__game.player.inVehicle'));
if (shotPath) await page.screenshot({ path: shotPath, type: 'jpeg', quality: 75 });
// pause and save
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
console.log('state after Esc:', await read('window.__game.state'));
await read(`document.querySelector('[data-action="save"]').click()`);
console.log('save exists:', await read(`!!localStorage.getItem('neon-harbor-save-v1')`));
console.log('traffic cars:', await read('window.__game.traffic.drivers.length'), 'peds:', await read('window.__game.peds.peds.length'));
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
