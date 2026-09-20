// Procedural sky dome: gradient, stars, moon, drifting cloud noise, aurora/underwater light shafts — all uniform driven per world.
import * as THREE from 'three';

const VS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * .99999; }`;
const FS = `
precision highp float;
uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; uniform vec3 moonColor; uniform vec3 moonDir; uniform float moonSize; uniform float moonGlow; uniform float stars; uniform float clouds; uniform vec3 cloudColor; uniform float time; uniform float lightning; uniform float underwater; uniform float aurora; uniform float blackout; uniform float exposure;
varying vec3 vDir;
float hash(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f); return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s += a*noise(p); p = p*2.03 + vec3(1.7,9.2,3.1); a*=.5; } return s; }
void main(){
  vec3 d = normalize(vDir); float y = d.y;
  vec3 col = mix(horizon, zenith, smoothstep(-.05, .6, y)); col = mix(ground, col, smoothstep(-.35, .0, y));
  // stars
  if (y > 0.) { vec3 sp = d * 260.; float s = hash(floor(sp)); float twinkle = .6 + .4*sin(time*2. + s*60.); float st = step(1. - stars*.002, s) * twinkle; col += vec3(st) * smoothstep(0., .25, y) * 1.4; }
  // moon
  float md = dot(d, normalize(moonDir)); float disc = smoothstep(1. - moonSize, 1. - moonSize*.55, md); float glow = pow(max(md, 0.), 24.) * moonGlow + pow(max(md,0.), 4.) * moonGlow * .12;
  col += moonColor * (disc * 2.2 + glow) * (1. - blackout);
  // clouds (drifting fbm on the dome)
  if (clouds > 0.) { vec3 cp = d / max(y + .25, .05); float c = fbm(vec3(cp.x*.9 + time*.012, cp.z*.9 + time*.006, time*.01)); c = smoothstep(.45, .8, c) * clouds * smoothstep(-.05, .2, y); col = mix(col, cloudColor * (1. + glow*1.5), c * .85); }
  // aurora ribbons
  if (aurora > 0.) { float a = sin(d.x*6. + time*.3 + fbm(d*3. + time*.05)*4.) * .5 + .5; a *= smoothstep(.15, .5, y) * smoothstep(.9, .5, y); col += vec3(.1, .9, .5) * a * aurora * .35; }
  // underwater: light shafts from above
  if (underwater > 0.) { float sh = fbm(vec3(d.x*8. + time*.2, d.z*8. - time*.15, 0.)); float beam = pow(max(y, 0.), 3.) * (0.5 + sh); col = mix(col, col + vec3(.25,.6,.8)*beam, underwater); }
  col += vec3(1.) * lightning;
  col *= exposure * (1. - blackout * .92);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor() {
    this.uniforms = { zenith: { value: new THREE.Color(0x03040c) }, horizon: { value: new THREE.Color(0x141a34) }, ground: { value: new THREE.Color(0x020204) }, moonColor: { value: new THREE.Color(0xffd0c0) }, moonDir: { value: new THREE.Vector3(-0.5, 0.45, -0.7).normalize() }, moonSize: { value: 0.006 }, moonGlow: { value: 0.6 }, stars: { value: 1.0 }, clouds: { value: 0.5 }, cloudColor: { value: new THREE.Color(0x0b0d1a) }, time: { value: 0 }, lightning: { value: 0 }, underwater: { value: 0 }, aurora: { value: 0 }, blackout: { value: 0 }, exposure: { value: 1 } };
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.mat); this.mesh.renderOrder = -1000; this.mesh.frustumCulled = false; this.mesh.scale.setScalar(400);
  }
  apply(p) { const u = this.uniforms; for (const k in p) { if (!u[k]) continue; if (u[k].value.isColor) u[k].value.set(p[k]); else if (u[k].value.isVector3) { if (Array.isArray(p[k])) u[k].value.fromArray(p[k]); else u[k].value.copy(p[k]); u[k].value.normalize(); } else u[k].value = p[k]; } }
  update(t, camPos) { this.uniforms.time.value = t; this.mesh.position.copy(camPos); }
}
