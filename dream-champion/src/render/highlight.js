// Enemy readability. Measured before this existed (60 s real-touch play path, 3 worlds): the nearest
// monster was outside the frustum 38-64% of the time, and when it WAS on screen and unoccluded its body
// still failed a pixel-contrast test 52-79% of the time -- the textures are near-black, the worlds are
// near-black, and the blaster lamp only reaches ~4 m. Solid scenery hid an on-screen monster on 0.2-4%
// of frames; that was never the main problem. Three pieces, all cheap:
//   rim    -- a pale fresnel edge on every monster material, scaled up with distance so a far one
//             still reads (shader-only, no extra draws). A self-light term (albedo x k) was tried and
//             dropped: these textures average 0.04 linear, so it added nothing measurable
//   xray   -- a second draw of the mesh with depthFunc GREATER: it only paints where scenery is IN
//             FRONT of the monster, as a dim rim-coloured ghost. Draw order world -> xray -> body,
//             so the ghost never paints over the monster's own visible surface
//   threat -- the numbers hud.threat() needs for an edge marker on every off-screen monster
// Enemy.update() calls update(e) once per frame; nothing here allocates per frame.
import * as THREE from 'three';
import { save } from '../core/save.js';

export const HL = { rim: 0.75, xray: 0.16, far: 26 };
// THE DROWN is lit from everywhere and its monsters are pale already; the full rim turned a shark
// into a lightbulb. The woods are the darkest and need all of it.
const WORLD_K = { forest: 1.0, grave: 0.9, sea: 0.72 };

const _v = new THREE.Vector3(), _cam = { x: NaN, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 0 };
const WHITE = new THREE.Color(1, 1, 1);

// Rim colour per world: pale, and OFF the world's own palette so it separates instead of camouflaging.
// The woods and the sea take their moon pulled toward white; GRAVEROT's moon is mint on a green fog and
// measured no better than no rim at 3-9 m, so it takes the rig's violet rim light instead.
const RIM = { forest: new THREE.Color(0xffc4b4), grave: new THREE.Color(0xdcd2ff), sea: new THREE.Color(0xcdf0ff) };
export function rimColor(theme, out) { const c = RIM[theme.key]; if (c) out.copy(c); else out.set(theme.sky.moonColor).lerp(WHITE, 0.45); return out; }
export function worldK(theme) { return WORLD_K[theme.key] ?? 1; }

// Fresnel rim on a MeshStandardMaterial. Chains an existing onBeforeCompile (the swim patch on the sea
// monsters) and folds its cache key in, so the two patches never share a program by accident.
export function patchRim(mat, rimU) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = sh => {
    if (prev) prev(sh);
    sh.uniforms.uRim = rimU;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uRim;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float fr = 1.0 - saturate(dot(normal, normalize(vViewPosition))); fr *= fr * fr; totalEmissiveRadiance += uRim.rgb * (fr * uRim.a); }');
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : '') + 'rim';
}

const XR_VS = `#include <common>
#include <skinning_pars_vertex>
uniform float uSwim; uniform float uT; varying vec3 vN; varying vec3 vV;
void main(){
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  { float z = transformed.z; float w = sin(uT * 7.0 - z * 2.2) * uSwim * (0.35 + max(-z, 0.0) * 0.45); float c = cos(w), s = sin(w); transformed.x = transformed.x * c - z * s * 0.15; }
  #include <skinning_vertex>
  #include <project_vertex>
  vN = normalMatrix * objectNormal; vV = -mvPosition.xyz;
}`;
const XR_FS = `#include <common>
uniform vec3 uColor; uniform float uA; varying vec3 vN; varying vec3 vV;
void main(){ float fr = 1.0 - saturate(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(uColor * (uA * (0.25 + 0.75 * fr * fr)), 1.0); }`;

// Ghost draw for one mesh of a monster: same geometry, same skeleton (or the same swim uniforms),
// additive, depth GREATER, no depth write, no shadows. Frustum-culled with a padded sphere so an
// off-screen monster costs nothing (the body meshes are deliberately never culled).
export function makeXray(mesh, proto, colorU, alphaU) {
  const mat = new THREE.ShaderMaterial({ vertexShader: XR_VS, fragmentShader: XR_FS, uniforms: { uColor: colorU, uA: alphaU, uSwim: proto.swimU || { value: 0 }, uT: proto.timeU || { value: 0 } }, blending: THREE.AdditiveBlending, transparent: false, depthWrite: false, depthFunc: THREE.GreaterDepth, fog: false });
  let xr;
  if (mesh.isSkinnedMesh) { xr = new THREE.SkinnedMesh(mesh.geometry, mat); xr.bind(mesh.skeleton, mesh.bindMatrix); mesh.geometry.computeBoundingSphere(); xr.boundingSphere = mesh.geometry.boundingSphere.clone(); xr.boundingSphere.radius *= 2; }
  else xr = new THREE.Mesh(mesh.geometry, mat);
  xr.renderOrder = 0.5; xr.castShadow = false; xr.receiveShadow = false; xr.frustumCulled = true; xr.matrixAutoUpdate = false;
  xr.position.copy(mesh.position); xr.quaternion.copy(mesh.quaternion); xr.scale.copy(mesh.scale); xr.updateMatrix();
  mesh.parent.add(xr); return xr;
}

// Camera matrices are refreshed by the renderer at draw time, i.e. AFTER update() -- reading them here
// would project against last frame's view. Recompose only when the camera actually moved.
function syncCam(cam) {
  const p = cam.position, q = cam.quaternion;
  if (p.x === _cam.x && p.y === _cam.y && p.z === _cam.z && q.x === _cam.qx && q.y === _cam.qy && q.z === _cam.qz && q.w === _cam.qw) return;
  _cam.x = p.x; _cam.y = p.y; _cam.z = p.z; _cam.qx = q.x; _cam.qy = q.y; _cam.qz = q.z; _cam.qw = q.w;
  cam.updateMatrixWorld(true); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
}

// Is a solid prop across the camera->monster sightline? Same circle set the camera sweep uses (~130
// circles), so this is a few microseconds and never a scene raycast. Shin-high props are skipped: the
// sightline passes over them. The ghost draw only pays its vertex cost while this is true.
// Knox himself counts: a rotter walking straight at him is behind his back from the camera's seat, and
// that one is the monster about to hit him.
// where along the segment (0..1) the circle sits across it, or -1
function across(cx, cz, dx, dz, L2, ox, oz, rr) { const px = ox - cx, pz = oz - cz; const t = (px * dx + pz * dz) / L2; if (t <= 0.02 || t >= 0.97) return -1; const qx = px - t * dx, qz = pz - t * dz; return qx * qx + qz * qz < rr * rr ? t : -1; }
function propBetween(g, cx, cy, cz, ex, ey, ez) {
  const dx = ex - cx, dz = ez - cz; const L2 = dx * dx + dz * dz || 1e-6; const p = g.player;
  if (across(cx, cz, dx, dz, L2, p.root.position.x, p.root.position.z, 0.35) >= 0) return true;
  const env = g.world && g.world.env; const blk = env && (env.camBlockers || env.obstacles); if (!blk) return false;
  for (let i = 0; i < blk.length; i++) {
    const o = blk[i]; const t = across(cx, cz, dx, dz, L2, o.x, o.z, o.r + 0.3); if (t < 0) continue;
    // a prop with a known height only counts if it reaches the sightline where the line crosses it:
    // GRAVEROT is a field of knee-high slabs and every sightline grazes one
    if (o.h === undefined || o.h > cy + (ey - cy) * t) return true;
  }
  return false;
}

// Per-frame: rim intensity, ghost colour, and the HUD threat marker for this monster.
export function update(e, dt) {
  const g = e.game, cam = g.camera, hud = g.hud, r = e.root.position;
  const dx = r.x - cam.position.x, dy = r.y + e.height * 0.5 - cam.position.y, dz = r.z - cam.position.z; const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const rim = e.rimU.value, hit = e.hitT > 0 ? e.hitT / 0.25 : 0;
  // farther = brighter edge: a 20 m monster is five pixels tall and needs the whole silhouette to glow.
  // The near end is not lower: the lamp cone is 33 degrees, so a monster attacking from the side at
  // 3 m is unlit, and the first pass (0.4 + d * 0.075) left half the 0-3 m samples unreadable.
  const range = Math.min(1.9, 0.55 + d * 0.07) * (e.rimK || 1) * e.rimWorld;
  let k = e.alive ? 1 : Math.max(0, 0.5 - e.deadT * 0.6);   // a corpse stops glowing: dead reads as dead
  if (e.state === 'emerge' && e.kind === 'grave') k *= Math.min(1, e.stT / e.emergeT + 0.3);
  rim.x = e.rimCol.r + (1 - e.rimCol.r) * hit; rim.y = e.rimCol.g + (1 - e.rimCol.g) * hit; rim.z = e.rimCol.b + (1 - e.rimCol.b) * hit;
  rim.w = HL.rim * range * k * (1 + hit * 2.5);
  // ghost through scenery: switched on while a prop sits across the sightline, held 0.3 s so a monster
  // weaving through tree trunks does not strobe
  if (e.alive && d < HL.far && !g.player.buffs.vision && propBetween(g, cam.position.x, cam.position.y, cam.position.z, r.x, r.y + e.height * 0.55, r.z)) e.xrT = 0.3; else e.xrT -= dt;   // nightmare vision already paints them red
  const xrOn = e.xrT > 0;
  const xc = e.xrayColor.value; xc.x = rim.x; xc.y = rim.y; xc.z = rim.z; e.xrayA.value = HL.xray * Math.min(1.6, 0.7 + d * 0.06) * (1 + hit * 2) * Math.min(1, e.xrT * 6);
  for (const x of e.xr) x.visible = xrOn;
  // off-screen threat marker
  if (!e.alive || e.bossIntro || d > 24) { hud.threat(e, null); return; }
  syncCam(cam);
  _v.set(r.x, r.y + e.height * 0.6, r.z).applyMatrix4(cam.matrixWorldInverse);
  const vx = _v.x, vz = _v.z; _v.applyMatrix4(cam.projectionMatrix);
  const on = vz < 0 && Math.abs(_v.x) < 1.02 && Math.abs(_v.y) < 1.02;
  if (on || save.data.settings.threatWarnings === false) hud.threat(e, null); else hud.threat(e, Math.atan2(vx, -vz), d, e.boss);   // same switch as the attack warning
}
