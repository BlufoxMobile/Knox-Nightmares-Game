// Boot: renderer → tier → audio → assets(boot) → Game
import { Renderer } from './render/renderer.js';
import { Assets } from './core/assets.js';
import { Audio } from './core/audio.js';
import { detectTier } from './core/quality.js';
import { save } from './core/save.js';
import { Game } from './game/Game.js';

const $ = id => document.getElementById(id);
function fail(e) { console.error(e); const d = document.createElement('div'); d.className = 'errbox'; d.textContent = 'Something broke while entering the dream.\n\n' + (e && e.stack || e); document.body.appendChild(d); }
window.addEventListener('error', e => { if (!window.__game) fail(e.error || e.message); });
window.addEventListener('unhandledrejection', e => { if (!window.__game) fail(e.reason); });

async function boot() {
  const canvas = $('gl'); const renderer = new Renderer(canvas); const tier = detectTier(renderer); renderer.setTier(tier); console.info('[knox] tier', tier);
  const audio = new Audio(); audio.ensure(); const assets = new Assets(renderer, audio); await assets.init();
  const fill = $('loadfill'), msg = $('loadmsg');
  await assets.loadGroup('boot', f => { fill.style.width = (f * 100).toFixed(0) + '%'; });
  // register audio buffers by id (+ aliases for names that share a clip)
  audio.alias(assets.manifest.aliases || {});
  for (const it of (assets.manifest.groups.boot || [])) if (it.type === 'audio' && assets.has(it.id)) audio.register(it.id, assets.get(it.id));
  const origLoad = assets.loadGroup.bind(assets); assets.loadGroup = async (name, p) => { await origLoad(name, p); for (const it of (assets.manifest.groups[name] || [])) if (it.type === 'audio' && assets.has(it.id)) audio.register(it.id, assets.get(it.id)); };
  msg.textContent = 'ENTERING THE DREAM';
  const game = new Game(renderer, assets, audio); window.__game = game;
  await game.start();
  $('load').classList.add('out');
}
boot().catch(fail);
