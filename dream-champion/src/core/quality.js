// Quality tiers + auto-detect + dynamic resolution.
import { save } from './save.js';

export const TIERS = {
  high:   { dpr: 2.0, msaa: 4, shadow: 2048, shadowCasters: 'all', bloom: true, rays: true, grain: true, ca: true, particles: 2048, decals: 256, grass: 1500, trees: 60, lod: 0, env: 256, aniso: 4, heightFog: true, dynMin: 0.75 },
  medium: { dpr: 1.5, msaa: 2, shadow: 1024, shadowCasters: 'chars', bloom: true, rays: false, grain: true, ca: false, particles: 1024, decals: 128, grass: 700, trees: 40, lod: 0, env: 128, aniso: 2, heightFog: true, dynMin: 0.7 },
  low:    { dpr: 1.25, msaa: 2, ldr: true, shadow: 512, shadowCasters: 'hero', bloom: false, rays: false, grain: false, ca: false, particles: 512, decals: 64, grass: 300, trees: 24, lod: 1, env: 64, aniso: 1, heightFog: false, dynMin: 0.6 },
};
export const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isMobile = isIOS || /Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);

export function detectTier(renderer) {
  const pref = save.data.settings.quality; if (pref && pref !== 'auto' && TIERS[pref]) return pref;
  const dpr = devicePixelRatio || 1;
  if (isIOS) {
    if (navigator.platform === 'MacIntel') return 'high';  // iPad (reports as Mac at dpr 2)
    const px = Math.max(screen.width, screen.height) * dpr;
    const m = navigator.userAgent.match(/OS (\d+)_/); const ios = m ? +m[1] : 17;
    if (dpr < 3 || px < 2400) return 'low';            // XR / 11 / SE
    if (px >= 2556 && ios >= 17) return 'high';          // 14 Pro / 15 / 16 class
    return 'medium';                                     // 12 / 13 / 14
  }
  if (/Android/i.test(navigator.userAgent)) return 'medium';
  try {
    const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    if (/Apple M|NVIDIA|Radeon|RTX|GTX|Arc/i.test(r)) return 'high';
    if (/Intel|Mali|Adreno|PowerVR|SwiftShader|llvmpipe/i.test(r)) return 'medium';
  } catch (_) { }
  return 'high';
}

export class DynamicResolution {
  constructor(min = 0.7) { this.scale = 1; this.min = min; this.samples = []; this.cool = 0; }
  settle(sec = 2) { this.cool = sec; this.samples.length = 0; }
  sample(frameMs, dt) {
    this.samples.push(frameMs); if (this.samples.length > 45) this.samples.shift();
    this.cool -= dt; if (this.cool > 0 || this.samples.length < 45) return false;
    const sorted = [...this.samples].sort((a, b) => a - b); const p90 = sorted[Math.floor(sorted.length * 0.9)];
    let changed = false;
    if (p90 > 19.5 && this.scale > this.min) { this.scale = Math.max(this.min, this.scale - 0.1); changed = true; }
    else if (p90 < 17.5 && this.scale < 1) { this.scale = Math.min(1, this.scale + 0.05); changed = true; }
    if (changed) { this.cool = 2.5; this.samples.length = 0; }
    return changed;
  }
}
