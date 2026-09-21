// Screenshot a world with the real renderer under headless Chromium (SwiftShader).
// Usage: node tools/world-shot.mjs <world> <outDir> [tier] [yaw1,yaw2,...] [extraQuery]
// Serve first: cd v2 && python3 -m http.server 8790
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const [,, world = 'forest', outDir = '/tmp/worlds', tier = 'high', yawList = '0.6,2.4,4.2', extra = ''] = process.argv;
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 600 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', m => { const s = m.text(); if (!/THREE\.WebGLRenderer|GPU stall/.test(s)) logs.push(m.type() + ': ' + s); });
page.on('pageerror', e => logs.push('pageerror: ' + e.message));
await page.goto(`http://localhost:8790/tools/world-test.html?w=${world}&tier=${tier}&static=1&yaw=0${extra}`, { waitUntil: 'load' });
try { await page.waitForFunction(() => window.__ready, null, { timeout: 120000 }); }
catch (e) { console.log('not ready; logs:\n' + logs.join('\n')); await browser.close(); process.exit(1); }
const yaws = yawList.split(',').map(Number);
for (let i = 0; i < yaws.length; i++) {
  const info = await page.evaluate((y) => window.__shot({ yaw: y }), yaws[i]);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${outDir}/${world}-${i}.png` });
  console.log(`${world} yaw=${yaws[i]} calls=${info.calls} tris=${info.triangles} worldTris=${info.worldTris}`);
}
if (logs.length) console.log('logs:\n' + logs.slice(0, 20).join('\n'));
await browser.close();
