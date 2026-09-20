// Shared material helpers: height fog + wind + caustics via onBeforeCompile, instancer wrapper, procedural textures.
import * as THREE from 'three';

export const FOG = { density: 0.03, base: 0, falloff: 0.12, time: { value: 0 }, wind: { value: 0.35 }, caustic: { value: 0 }, causticColor: { value: new THREE.Color(0x7fd8ff) } };

// patch any MeshStandardMaterial with height-fog (exp density * height falloff). Fog color comes from scene.fog.
export function patchFog(mat, opts = {}) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = FOG.time; shader.uniforms.uWind = FOG.wind; shader.uniforms.uCaustic = FOG.caustic; shader.uniforms.uCausticColor = FOG.causticColor;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 vWorldPos; uniform float uTime; uniform float uWind; attribute float aPhase;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      ${opts.wind ? `float wph = ${opts.instanced ? 'aPhase' : '0.0'}; float hmask = clamp(position.y / ${(opts.windHeight || 2).toFixed(1)}, 0., 1.); transformed.x += sin(uTime * 1.4 + wph * 6.28 + position.x * .5) * hmask * hmask * uWind * .35; transformed.z += cos(uTime * 1.1 + wph * 6.28) * hmask * hmask * uWind * .2;` : ''}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n vWorldPos = (modelMatrix * ${opts.instanced ? 'instanceMatrix * ' : ''}vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWorldPos; uniform float uTime; uniform float uCaustic; uniform vec3 uCausticColor;
      float chash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float cnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(chash(i), chash(i+vec2(1,0)), f.x), mix(chash(i+vec2(0,1)), chash(i+vec2(1,1)), f.x), f.y); }
      float caustic(vec2 p, float t){ float a = cnoise(p*1.3 + vec2(t*.35, t*.2)); float b = cnoise(p*1.7 - vec2(t*.25, -t*.3)); float c = 1. - abs(a - b) * 2.; return pow(max(c, 0.), 6.); }`)
      .replace('#include <fog_fragment>', `
      #ifdef USE_FOG
        float fogDist = length(vWorldPos - cameraPosition);
        float hf = exp(-max(vWorldPos.y - ${(opts.fogBase ?? 0).toFixed(2)}, 0.) * ${(opts.fogFalloff ?? 0.12).toFixed(3)});
        float ff = 1.0 - exp(-fogDensity * fogDensity * fogDist * fogDist * (0.55 + 0.45 * hf));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, clamp(ff, 0., 1.));
      #endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      ${opts.caustics ? `if (uCaustic > 0.) { float c = caustic(vWorldPos.xz * .35, uTime); totalEmissiveRadiance += uCausticColor * c * uCaustic; }` : ''}`);
  };
  mat.customProgramCacheKey = () => 'fog' + (opts.wind ? 'w' : '') + (opts.instanced ? 'i' : '') + (opts.caustics ? 'c' : '') + (opts.fogBase ?? 0) + (opts.fogFalloff ?? 0.12) + (opts.windHeight || 2);
  return mat;
}

// Instanced mesh with per-instance phase for wind and optional colour variation
export function instancer(geometry, material, count, opts = {}) {
  const m = new THREE.InstancedMesh(geometry, material, count); m.frustumCulled = false; m.castShadow = !!opts.castShadow; m.receiveShadow = opts.receiveShadow !== false;
  const phase = new Float32Array(count); for (let i = 0; i < count; i++) phase[i] = Math.random();
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  return m;
}

// --- procedural textures (canvas) ---
export function noiseTexture(size = 256, opts = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); const img = g.createImageData(size, size); const d = img.data;
  const oct = opts.octaves || 4; const base = opts.base || [40, 40, 40]; const range = opts.range || [30, 30, 30];
  // value noise via random grid layers
  const layers = []; for (let o = 0; o < oct; o++) { const n = 4 << o; const grid = new Float32Array((n + 1) * (n + 1)); for (let i = 0; i < grid.length; i++) grid[i] = Math.random(); layers.push({ n, grid }); }
  const sample = (x, y) => { let v = 0, amp = 1, tot = 0; for (const L of layers) { const fx = x * L.n, fy = y * L.n; const ix = Math.floor(fx) % L.n, iy = Math.floor(fy) % L.n; const tx = fx - Math.floor(fx), ty = fy - Math.floor(fy); const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); const g00 = L.grid[iy * (L.n + 1) + ix], g10 = L.grid[iy * (L.n + 1) + ix + 1], g01 = L.grid[(iy + 1) * (L.n + 1) + ix], g11 = L.grid[(iy + 1) * (L.n + 1) + ix + 1]; v += (g00 * (1 - sx) * (1 - sy) + g10 * sx * (1 - sy) + g01 * (1 - sx) * sy + g11 * sx * sy) * amp; tot += amp; amp *= 0.5; } return v / tot; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const v = sample(x / size, y / size) * 2 - 1; const k = (y * size + x) * 4; for (let ch = 0; ch < 3; ch++) d[k + ch] = Math.max(0, Math.min(255, base[ch] + v * range[ch] + (opts.grain ? (Math.random() - .5) * opts.grain : 0))); d[k + 3] = 255; }
  g.putImageData(img, 0, 0);
  if (opts.draw) opts.draw(g, size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// normal map from a height field (bump -> normal)
export function normalFromNoise(size = 256, strength = 2, octaves = 5) {
  const h = new Float32Array(size * size); const layers = []; for (let o = 0; o < octaves; o++) { const n = 3 << o; const grid = new Float32Array((n + 1) * (n + 1)); for (let i = 0; i < grid.length; i++) grid[i] = Math.random(); layers.push({ n, grid }); }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { let v = 0, amp = 1, tot = 0; for (const L of layers) { const fx = x / size * L.n, fy = y / size * L.n; const ix = Math.floor(fx) % L.n, iy = Math.floor(fy) % L.n; const tx = fx - Math.floor(fx), ty = fy - Math.floor(fy); const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); const W = L.n + 1; v += (L.grid[iy * W + ix] * (1 - sx) * (1 - sy) + L.grid[iy * W + ix + 1] * sx * (1 - sy) + L.grid[(iy + 1) * W + ix] * (1 - sx) * sy + L.grid[(iy + 1) * W + ix + 1] * sx * sy) * amp; tot += amp; amp *= 0.55; } h[y * size + x] = v / tot; }
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); const img = g.createImageData(size, size); const d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)], u = h[((y - 1 + size) % size) * size + x], dn = h[((y + 1) % size) * size + x]; let nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len; const k = (y * size + x) * 4; d[k] = (nx * .5 + .5) * 255; d[k + 1] = (ny * .5 + .5) * 255; d[k + 2] = (nz * .5 + .5) * 255; d[k + 3] = 255; }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; return t;
}
export function radialAlphaTexture(size = 128, inner = 0, outer = 1) { const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); const r = g.createRadialGradient(size / 2, size / 2, size / 2 * inner, size / 2, size / 2, size / 2 * outer); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, size, size); const t = new THREE.CanvasTexture(c); return t; }
