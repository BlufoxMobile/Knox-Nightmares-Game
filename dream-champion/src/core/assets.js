// Manifest-driven asset loader with byte-weighted progress, grouped lazy loading and caching.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export class Assets {
  constructor(renderer, audio) {
    this.renderer = renderer; this.audio = audio; this.cache = new Map(); this.manifest = null; this.loaded = new Set();
    this.gltf = new GLTFLoader(); this.gltf.setMeshoptDecoder(MeshoptDecoder);
    this.tex = new THREE.TextureLoader();
    this.base = './assets/';
  }
  async init() {
    const r = await fetch(this.base + 'manifest.json?v=' + Date.now()); this.manifest = await r.json(); this.v = this.manifest.version || 1;
  }
  url(u) { return this.base + u + '?v=' + this.v; }
  has(id) { return this.cache.has(id); }
  get(id) { return this.cache.get(id); }
  async loadGroup(name, onProgress) {
    if (this.loaded.has(name)) { onProgress && onProgress(1); return; }
    const items = (this.manifest.groups[name] || []).filter(it => !this.cache.has(it.id));
    const total = items.reduce((s, it) => s + (it.bytes || 100000), 0) || 1; const prog = new Map();
    const report = () => { let done = 0; for (const v of prog.values()) done += v; onProgress && onProgress(Math.min(1, done / total)); };
    const queue = [...items]; const workers = []; const failed = [];
    const run = async () => {
      while (queue.length) {
        const it = queue.shift(); const bytes = it.bytes || 100000;
        for (let attempt = 0; attempt < 3; attempt++) {
          try { const v = await this._load(it, p => { prog.set(it.id, p * bytes); report(); }); if (v !== undefined) this.cache.set(it.id, v); break; }
          catch (e) {
            if (it.optional) { console.info('optional asset missing', it.id); break; }
            if (attempt === 2) { console.warn('asset failed', it.id, e); failed.push(it.id); break; }
            await new Promise(r => setTimeout(r, [500, 1500][attempt]));
          }
        }
        prog.set(it.id, bytes); report();
      }
    };
    for (let i = 0; i < 6; i++) workers.push(run());
    await Promise.all(workers);
    if (failed.length) { const err = new Error('Could not load: ' + failed.join(', ')); err.assets = failed; throw err; }
    this.loaded.add(name); onProgress && onProgress(1);
  }
  prefetch(name) { for (const it of (this.manifest.groups[name] || [])) { if (!this.cache.has(it.id)) fetch(this.url(it.url), { priority: 'low' }).catch(() => { }); } }
  async _load(it, onp) {
    const url = this.url(it.url);
    switch (it.type) {
      case 'glb': return new Promise((res, rej) => this.gltf.load(url, g => res(g), e => { if (e.total) onp(e.loaded / e.total); }, rej));
      case 'texture': { const t = await this.tex.loadAsync(url); t.colorSpace = it.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.flipY = it.flipY !== undefined ? it.flipY : true; t.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy()); if (it.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } t.needsUpdate = true; return t; }
      case 'audio': { const r = await fetch(url); if (!r.ok) throw new Error(r.status); const ab = await r.arrayBuffer(); onp(0.7); return await this.audio.decode(ab); }
      case 'json': { const r = await fetch(url); return await r.json(); }
      case 'text': { const r = await fetch(url); return await r.text(); }
      case 'video': return url; // streamed by <video>
      default: throw new Error('unknown type ' + it.type);
    }
  }
  releaseGroup(name) {
    for (const it of (this.manifest.groups[name] || [])) {
      if (it.type === 'audio') { this.audio.buffers.delete(it.id); this.cache.delete(it.id); }
      else if (it.type === 'glb') { const g = this.cache.get(it.id); if (g) { g.scene.traverse(o => { if (o.isMesh) { o.geometry.dispose(); for (const m of [].concat(o.material)) { for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); } m.dispose(); } } }); this.cache.delete(it.id); } }
      else this.release(it.id);
    }
    this.loaded.delete(name);
  }
  release(id) { const v = this.cache.get(id); if (!v) return; if (v.isTexture) v.dispose(); this.cache.delete(id); }
}
