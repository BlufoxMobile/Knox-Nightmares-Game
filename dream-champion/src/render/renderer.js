// Renderer + post pipeline: HDR scene RT (MSAA) -> custom bloom -> single composite pass (ACES, grade, vignette, CA, grain, underwater, overlays).
import * as THREE from 'three';
import { TIERS, DynamicResolution } from '../core/quality.js';

const FSQ_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }`;

const BRIGHT_FS = `
uniform sampler2D tex; uniform float threshold; uniform float knee; uniform vec2 texel; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tex, vUv).rgb + texture2D(tex, vUv + texel*vec2(1.,0.)).rgb + texture2D(tex, vUv + texel*vec2(0.,1.)).rgb + texture2D(tex, vUv + texel).rgb; c *= .25;
  float l = max(c.r, max(c.g, c.b)); float s = clamp(l - threshold + knee, 0., 2.*knee); s = s*s/(4.*knee+1e-4); float w = max(s, l - threshold) / max(l, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}`;
const KAWASE_FS = `
uniform sampler2D tex; uniform vec2 texel; uniform float off; varying vec2 vUv;
void main(){ vec2 o = texel * off;
  vec3 c = texture2D(tex, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tex, vUv + vec2(o.x, -o.y)).rgb + texture2D(tex, vUv + vec2(-o.x, o.y)).rgb + texture2D(tex, vUv + vec2(o.x, o.y)).rgb;
  gl_FragColor = vec4(c * .25, 1.0); }`;

const COMPOSITE_FS = `
#include <common>
uniform sampler2D scene; uniform sampler2D bloomA; uniform sampler2D bloomB; uniform float bloomStrength; uniform float exposure;
uniform vec3 lift; uniform vec3 gain; uniform float saturation; uniform float contrast; uniform float vignette; uniform float ca; uniform float grain; uniform float time;
uniform float underwater; uniform float hurt; uniform float flash; uniform vec3 flashColor; uniform float ultRing; uniform vec2 ultCenter; uniform float fade; uniform float desat; uniform float bloomOn;
uniform float visionOn; uniform vec2 res;
varying vec2 vUv;
vec3 aces(vec3 x){ const float a=2.51,b=.03,c=2.43,d=.59,e=.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec2 uv = vUv; vec2 cuv = uv - .5; float r2 = dot(cuv, cuv);
  if (underwater > 0.) { uv += vec2(sin(uv.y*22.+time*1.7), cos(uv.x*19.+time*1.3)) * .0028 * underwater; }
  vec3 col;
  if (ca > 0. && r2 > .06) { vec2 d = cuv * ca * (r2 - .06) * 2.2; col = vec3(texture2D(scene, uv + d).r, texture2D(scene, uv).g, texture2D(scene, uv - d).b); }
  else col = texture2D(scene, uv).rgb;
  if (bloomOn > .5) { vec3 bl = texture2D(bloomA, uv).rgb * .7 + texture2D(bloomB, uv).rgb * .45; col += bl * bloomStrength; }
  col *= exposure;
  col = aces(col);
  // grade
  col = col * gain + lift;
  float lum = dot(col, vec3(.2126,.7152,.0722)); col = mix(vec3(lum), col, saturation);
  col = (col - .5) * contrast + .5;
  if (underwater > 0.) { col = mix(col, col * vec3(.55, .85, 1.1) + vec3(0., .02, .06), underwater * .7); }
  if (desat > 0.) { col = mix(col, vec3(dot(col, vec3(.3,.59,.11))), desat); }
  // vignette
  float vig = smoothstep(.32, 1.05, sqrt(r2) * 1.25); col *= 1. - vig * vignette;
  // nightmare vision
  if (visionOn > 0.) { col = mix(col, vec3(col.r*1.4, col.g*.35, col.b*.3), visionOn * .6); }
  // hurt: red edge
  if (hurt > 0.) { col = mix(col, vec3(.6, 0., .03), hurt * smoothstep(.15, .9, sqrt(r2)*1.3)); }
  // ult ring
  if (ultRing > 0.) { float d = length((uv - ultCenter) * vec2(res.x/res.y, 1.)); float ring = smoothstep(.02, 0., abs(d - ultRing*1.6) - .01) * (1.-ultRing); col += vec3(.3, .9, 1.) * ring * 1.5; }
  // grain
  if (grain > 0.) { float n = hash12(uv * res + fract(time) * 100.) - .5; col += n * grain * (1. - lum * .7); }
  col = mix(col, flashColor, clamp(flash, 0., 1.));
  col *= 1. - fade;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, depth: true, preserveDrawingBuffer: false });
    this.gl = gl; gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.NoToneMapping; gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFShadowMap; gl.autoClear = false; gl.info.autoReset = false;
    this.tierName = 'high'; this.tier = TIERS.high; this.dyn = new DynamicResolution(0.7); this.w = 1; this.h = 1; this.pw = 1; this.ph = 1;
    this.grade = { lift: new THREE.Vector3(0, 0, 0), gain: new THREE.Vector3(1, 1, 1), saturation: 1, contrast: 1, exposure: 1, bloom: 0.6, vignette: 0.45 };
    this.fx = { underwater: 0, hurt: 0, flash: 0, flashColor: new THREE.Color(1, 1, 1), ultRing: 0, ultCenter: new THREE.Vector2(.5, .5), fade: 0, desat: 0, vision: 0 };
    this._buildPost();
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; this.onLost && this.onLost(); });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this._buildPost(); this.resize(true); this.onRestored && this.onRestored(); });
  }
  setTier(name) {
    this.tierName = name; this.tier = TIERS[name]; this.dyn.min = this.tier.dynMin; this.dyn.scale = 1;
    this.gl.shadowMap.enabled = true; this.gl.shadowMap.type = name === 'low' ? THREE.BasicShadowMap : THREE.PCFShadowMap;
    this.direct = false; this.gl.toneMapping = THREE.NoToneMapping;
    this.resize(true);
  }
  _buildPost() {
    const mk = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: FSQ_VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
    this.quadGeo = new THREE.BufferGeometry(); this.quadGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)); this.quadGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(this.quadGeo); this.quad.frustumCulled = false; this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad); this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.matBright = mk(BRIGHT_FS, { tex: { value: null }, threshold: { value: 1.0 }, knee: { value: 0.5 }, texel: { value: new THREE.Vector2() } });
    this.matKawase = mk(KAWASE_FS, { tex: { value: null }, texel: { value: new THREE.Vector2() }, off: { value: 1 } });
    this.matComp = mk(COMPOSITE_FS, { scene: { value: null }, bloomA: { value: null }, bloomB: { value: null }, bloomStrength: { value: 0.6 }, exposure: { value: 1 }, lift: { value: new THREE.Vector3() }, gain: { value: new THREE.Vector3(1, 1, 1) }, saturation: { value: 1 }, contrast: { value: 1 }, vignette: { value: .45 }, ca: { value: 0 }, grain: { value: 0 }, time: { value: 0 }, underwater: { value: 0 }, hurt: { value: 0 }, flash: { value: 0 }, flashColor: { value: new THREE.Color() }, ultRing: { value: 0 }, ultCenter: { value: new THREE.Vector2(.5, .5) }, fade: { value: 1 }, desat: { value: 0 }, bloomOn: { value: 1 }, visionOn: { value: 0 }, res: { value: new THREE.Vector2(1, 1) } });
  }
  resize(force) {
    const w = innerWidth, h = innerHeight; const dpr = Math.min(devicePixelRatio || 1, this.tier.dpr) * this.dyn.scale;
    const pw = Math.max(2, Math.round(w * dpr)), ph = Math.max(2, Math.round(h * dpr));
    if (!force && pw === this.pw && ph === this.ph) return;
    this.w = w; this.h = h; this.pw = pw; this.ph = ph;
    this.gl.setPixelRatio(1); this.gl.setSize(pw, ph, false); this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    const dispose = t => t && t.dispose();
    dispose(this.rtScene); dispose(this.rtA); dispose(this.rtB); dispose(this.rtC);
    this.rtScene = new THREE.WebGLRenderTarget(pw, ph, { type: this.tier.ldr ? THREE.UnsignedByteType : THREE.HalfFloatType, samples: this.tier.msaa, depthBuffer: true, stencilBuffer: false, colorSpace: THREE.LinearSRGBColorSpace });
    const qw = Math.max(1, pw >> 2), qh = Math.max(1, ph >> 2), ew = Math.max(1, pw >> 3), eh = Math.max(1, ph >> 3);
    const opt = { type: THREE.HalfFloatType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter };
    this.rtA = new THREE.WebGLRenderTarget(qw, qh, opt); this.rtB = new THREE.WebGLRenderTarget(qw, qh, opt); this.rtC = new THREE.WebGLRenderTarget(ew, eh, opt);
    this.matComp.uniforms.res.value.set(pw, ph);
  }
  render(scene, camera, time) {
    const gl = this.gl, T = this.tier; if (this.lost) return;
    gl.info.reset();
    gl.setRenderTarget(this.rtScene); gl.clear(true, true, false); gl.render(scene, camera);
    const u = this.matComp.uniforms;
    if (T.bloom) {
      const q = this.quad;
      q.material = this.matBright; this.matBright.uniforms.tex.value = this.rtScene.texture; this.matBright.uniforms.texel.value.set(1 / this.pw, 1 / this.ph); gl.setRenderTarget(this.rtA); gl.render(this.quadScene, this.quadCam);
      q.material = this.matKawase; const K = this.matKawase.uniforms;
      K.tex.value = this.rtA.texture; K.texel.value.set(1 / this.rtA.width, 1 / this.rtA.height); K.off.value = 1.0; gl.setRenderTarget(this.rtB); gl.render(this.quadScene, this.quadCam);
      K.tex.value = this.rtB.texture; K.off.value = 2.0; gl.setRenderTarget(this.rtA); gl.render(this.quadScene, this.quadCam);
      K.tex.value = this.rtA.texture; K.texel.value.set(1 / this.rtC.width, 1 / this.rtC.height); K.off.value = 1.5; gl.setRenderTarget(this.rtC); gl.render(this.quadScene, this.quadCam);
      u.bloomA.value = this.rtA.texture; u.bloomB.value = this.rtC.texture; u.bloomOn.value = 1;
    } else u.bloomOn.value = 0;
    const g = this.grade, f = this.fx;
    u.scene.value = this.rtScene.texture; u.bloomStrength.value = g.bloom; u.exposure.value = g.exposure; u.lift.value.copy(g.lift); u.gain.value.copy(g.gain); u.saturation.value = g.saturation; u.contrast.value = g.contrast; u.vignette.value = g.vignette;
    u.ca.value = T.ca ? 1.5 / this.pw * 3 : 0; u.grain.value = T.grain ? 0.03 : 0; u.time.value = time;
    u.underwater.value = f.underwater; u.hurt.value = f.hurt; u.flash.value = f.flash; u.flashColor.value.copy(f.flashColor); u.ultRing.value = f.ultRing; u.ultCenter.value.copy(f.ultCenter); u.fade.value = f.fade; u.desat.value = f.desat; u.visionOn.value = f.vision;
    this.quad.material = this.matComp; gl.setRenderTarget(null); gl.render(this.quadScene, this.quadCam);
  }
}
