// Run JS inside the world test page and screenshot. Usage: node tools/world-eval.mjs <world> <out.png> "<js expression returning value>" [tier] [yaw]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const [,, world = 'forest', out = '/tmp/eval.png', js = '1', tier = 'high', yaw = '0.6'] = process.argv;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 600 }, deviceScaleFactor: 1 });
const logs = []; page.on('console', m => { const s = m.text(); if (!/THREE\.WebGLRenderer/.test(s)) logs.push(m.type() + ': ' + s); }); page.on('pageerror', e => logs.push('pageerror: ' + e.message));
await page.goto(`http://localhost:8790/tools/world-test.html?w=${world}&tier=${tier}&static=1&yaw=${yaw}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
const res = await page.evaluate(async (code) => { const f = new Function('THREE', 'ctx', 'world', 'return (async () => (' + code + '))()'); const v = await f(window.__THREE, window.__ctx, window.__world); const info = window.__shot({}); return { v, info }; }, js);
await page.waitForTimeout(150); await page.screenshot({ path: out });
console.log(JSON.stringify(res)); if (logs.length) console.log(logs.slice(0, 15).join('\n'));
await browser.close();
