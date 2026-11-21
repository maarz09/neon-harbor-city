// Takes the entry's screenshots: for each row of shots.json, loads game/index.html?<query>
// from a local static server (node serve.ts --port 8080), waits for window.__shotReady and saves a
// 1280x720 JPEG into screenshots/. Prints any browser console errors it sees.
//   node tools/shots.mjs [baseUrl]
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://localhost:8080/';
const only = process.argv[3] || '';
const shots = JSON.parse(readFileSync(new URL('../shots.json', import.meta.url), 'utf8'));
mkdirSync(new URL('../screenshots/', import.meta.url), { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const shot of shots) {
  if (only && !shot.name.includes(only)) continue;
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${shot.name}] ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => console.log(`[${shot.name}] pageerror: ${e.message}`));
  const t0 = Date.now();
  await page.goto(base + shot.query, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 180000 });
  await page.waitForTimeout(300);
  const path = new URL(`../screenshots/${shot.name}`, import.meta.url).pathname;
  await page.screenshot({ path, type: 'jpeg', quality: shot.quality || 80 });
  console.log(`${shot.name} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await page.close();
}
await browser.close();
