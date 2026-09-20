// Procedural hero gear rigidly attached to the Knox scan's bones: armored sleeves, gauntlets, shoulder pads, belt, and the Dream Blaster.
import * as THREE from 'three';

function armorMaterial(accent) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#1a1c25'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`; g.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 60, Math.random() * 5); }
  g.strokeStyle = '#2e3140'; g.lineWidth = 3; for (let y = 32; y < 256; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const e = document.createElement('canvas'); e.width = 256; e.height = 256; const ge = e.getContext('2d'); ge.fillStyle = '#000'; ge.fillRect(0, 0, 256, 256); ge.strokeStyle = '#fff'; ge.lineWidth = 3; for (let y = 32; y < 256; y += 64) { ge.beginPath(); ge.moveTo(0, y); ge.lineTo(256, y); ge.stroke(); }
  const em = new THREE.CanvasTexture(e); em.colorSpace = THREE.SRGBColorSpace; em.wrapS = em.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0.35, emissive: new THREE.Color(accent), emissiveMap: em, emissiveIntensity: 1.4 });
}

export class HeroGear {
  constructor(scan, accent = 0x4de3ff) {
    this.scan = scan; this.skeleton = scan.skeleton; this.accent = accent;
    this.bone = {}; for (const b of this.skeleton.bones) this.bone[b.name] = b;
    scan.updateMatrixWorld(true);
    this.mat = armorMaterial(accent); this.matGlove = new THREE.MeshStandardMaterial({ color: 0x151720, roughness: 0.7, metalness: 0.2 });
    this.meshes = []; this.build();
  }
  // world->bone-local scale factor (bones live under a 0.01-scaled armature)
  unit(bone) { return 1 / bone.getWorldScale(new THREE.Vector3()).x; }
  local(bone, worldPos) { return bone.worldToLocal(worldPos.clone()); }
  attach(boneName, geo, mat) { const b = this.bone[boneName]; const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; b.add(m); this.meshes.push(m); return m; }
  // tube along bone A toward bone B, in A's local space
  tube(aName, bName, r0, r1, opts = {}) {
    const A = this.bone[aName], B = this.bone[bName]; const u = this.unit(A);
    const end = this.local(A, B.getWorldPosition(new THREE.Vector3())); const len = end.length(); const dir = end.clone().normalize();
    const seg = 12, rings = 6; const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0); const x = new THREE.Vector3().crossVectors(up, dir).normalize(); const y = new THREE.Vector3().crossVectors(dir, x);
    const pos = [], nor = [], uv = [], idx = []; const start = opts.start ?? -0.02, stop = opts.end ?? 1.0;
    for (let ri = 0; ri <= rings; ri++) {
      const t = start + (stop - start) * ri / rings; const r = (r0 + (r1 - r0) * ri / rings) * u;
      for (let s = 0; s <= seg; s++) { const ang = s / seg * Math.PI * 2; const rr = r * (opts.plate ? 1 + 0.07 * Math.cos(ang * 4) : 1); const n = x.clone().multiplyScalar(Math.cos(ang)).add(y.clone().multiplyScalar(Math.sin(ang))); const p = dir.clone().multiplyScalar(t * len).add(n.clone().multiplyScalar(rr)); pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(s / seg * 2, t * 2); }
    }
    for (let ri = 0; ri < rings; ri++) for (let s = 0; s < seg; s++) { const k = ri * (seg + 1) + s; idx.push(k, k + 1, k + seg + 1, k + 1, k + seg + 2, k + seg + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    // cap the start ring
    return g;
  }
  blob(boneName, radius, offsetWorld = [0, 0, 0], scale = [1, 1, 1], detail = 8) {
    const b = this.bone[boneName]; const u = this.unit(b); const g = new THREE.SphereGeometry(radius * u, detail * 2, detail); g.scale(scale[0], scale[1], scale[2]);
    // offset given in world metres: convert the direction into bone-local
    const w = b.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(...offsetWorld)); const l = this.local(b, w); g.translate(l.x, l.y, l.z); return g;
  }
  build() {
    for (const S of ['Left', 'Right']) {
      this.attach(S + 'Arm', this.tube(S + 'Arm', S + 'ForeArm', 0.062, 0.05, { start: -0.12, end: 1.0, plate: true }), this.mat);
      this.attach(S + 'ForeArm', this.tube(S + 'ForeArm', S + 'Hand', 0.05, 0.044, { start: -0.06, end: 1.0, plate: true }), this.mat);
      const f = this.bone[S + 'ForeArm'].getWorldPosition(new THREE.Vector3()), h = this.bone[S + 'Hand'].getWorldPosition(new THREE.Vector3()); const d = h.clone().sub(f).normalize();
      this.attach(S + 'Hand', this.blob(S + 'Hand', 0.052, d.clone().multiplyScalar(0.05).toArray(), [1, 1.15, 0.85], 8), this.matGlove);
      this.attach(S + 'Hand', this.blob(S + 'Hand', 0.03, d.clone().multiplyScalar(0.1).toArray(), [1.3, 0.9, 1.1], 6), this.mat);
      this.attach(S + 'Arm', this.blob(S + 'Arm', 0.085, [S === 'Left' ? 0.01 : -0.01, 0.035, 0], [1.1, 0.75, 1.05], 10), this.mat);
    }
    // belt: torus in hips space (hips local y is not world up, so build in world orientation then convert)
    const hips = this.bone.Hips; const u = this.unit(hips); const hw = hips.getWorldPosition(new THREE.Vector3());
    const belt = new THREE.TorusGeometry(0.19 * u, 0.03 * u, 8, 28); belt.rotateX(Math.PI / 2); belt.scale(1, 1, 0.85);
    const m = new THREE.Matrix4().copy(hips.matrixWorld).invert(); const rotOnly = new THREE.Matrix4().extractRotation(m); belt.applyMatrix4(rotOnly); const lp = this.local(hips, hw.clone().add(new THREE.Vector3(0, -0.02, 0.01))); belt.translate(lp.x, lp.y, lp.z);
    this.attach('Hips', belt, this.mat);
    this.attach('Hips', this.blob('Hips', 0.05, [0, -0.03, 0.17], [1.6, 0.9, 0.7], 6), this.matGlove);
    this.attach('Hips', this.blob('Hips', 0.045, [-0.16, -0.04, 0.08], [0.8, 1.2, 0.8], 6), this.matGlove);
    this.attach('Hips', this.blob('Hips', 0.045, [0.16, -0.04, 0.08], [0.8, 1.2, 0.8], 6), this.matGlove);
    this.blaster = buildBlaster(this.accent); this.bone.RightHand.add(this.blaster.group);
  }
  // orient the blaster: barrel points from the right hand toward the left hand (two-handed hold). Call while a rifle-hold pose is applied.
  fitBlaster() {
    const hand = this.bone.RightHand, other = this.bone.LeftHand; hand.updateWorldMatrix(true, false); other.updateWorldMatrix(true, false);
    const hw = hand.getWorldPosition(new THREE.Vector3()), lw = other.getWorldPosition(new THREE.Vector3());
    const dirW = lw.clone().sub(hw).normalize(); const dirL = this.local(hand, hw.clone().add(dirW)).normalize();
    const g = this.blaster.group; const s = this.unit(hand); g.scale.setScalar(s);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dirL);
    // roll so the grip hangs downward in world (-Y)
    const upL = this.local(hand, hw.clone().add(new THREE.Vector3(0, 1, 0))).normalize();
    const gUp = new THREE.Vector3(0, 1, 0).applyQuaternion(g.quaternion); const side = new THREE.Vector3().crossVectors(dirL, upL); const proj = upL.clone().sub(dirL.clone().multiplyScalar(upL.dot(dirL))).normalize();
    const ang = Math.atan2(new THREE.Vector3().crossVectors(gUp, proj).dot(dirL), gUp.dot(proj)); g.rotateOnAxis(new THREE.Vector3(0, 0, 1), ang);
    g.position.copy(dirL).multiplyScalar(0.02 * s); g.updateMatrixWorld(true);
  }
  setVisible(v) { for (const m of this.meshes) m.visible = v; this.blaster.group.visible = v; }
  dispose() { for (const m of this.meshes) { m.geometry.dispose(); } this.mat.dispose(); this.matGlove.dispose(); }
}

// The Dream Blaster: chunky sci-fi rifle, +Z forward. Parts: receiver, rail, shroud, tri-barrel, glowing core, grip, stock, vents.
export function buildBlaster(accent = 0x4de3ff) {
  const group = new THREE.Group(); const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f2b, roughness: 0.5, metalness: 0.6 }); const light = new THREE.MeshStandardMaterial({ color: 0x3a4052, roughness: 0.45, metalness: 0.7 });
  const glow = new THREE.MeshStandardMaterial({ color: accent, emissive: new THREE.Color(accent), emissiveIntensity: 3, roughness: 0.3, metalness: 0 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; group.add(m); return m; };
  add(new THREE.BoxGeometry(0.09, 0.11, 0.34), dark, 0, 0.0, 0.05);
  add(new THREE.BoxGeometry(0.07, 0.06, 0.16), light, 0, 0.075, 0.02);
  add(new THREE.CylinderGeometry(0.045, 0.05, 0.28, 12), light, 0, 0.0, 0.34, Math.PI / 2);
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; add(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), dark, Math.cos(a) * 0.028, Math.sin(a) * 0.028, 0.4, Math.PI / 2); }
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 12), glow, 0, 0, 0.12, Math.PI / 2);
  add(new THREE.TorusGeometry(0.052, 0.012, 8, 20), glow, 0, 0, 0.47);
  add(new THREE.BoxGeometry(0.05, 0.14, 0.06), dark, 0, -0.1, -0.02, 0.35);
  add(new THREE.BoxGeometry(0.06, 0.07, 0.16), dark, 0, -0.02, -0.18, -0.1);
  add(new THREE.BoxGeometry(0.02, 0.05, 0.08), glow, 0.05, 0.02, 0.1); add(new THREE.BoxGeometry(0.02, 0.05, 0.08), glow, -0.05, 0.02, 0.1);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, 0.5); group.add(muzzle);
  const lamp = new THREE.Object3D(); lamp.position.set(0, -0.05, 0.3); group.add(lamp);
  return { group, muzzle, lamp, glowMat: glow };
}
