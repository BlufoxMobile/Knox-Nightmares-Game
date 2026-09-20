// Per-world light rig (created once, retuned per world), PMREM environment from the procedural sky, texel-snapped follow shadow.
import * as THREE from 'three';

export class Lighting {
  constructor(renderer, scene, sky) {
    this.renderer = renderer; this.scene = scene; this.sky = sky;
    this.hemi = new THREE.HemisphereLight(0x8090c0, 0x101418, 0.6); scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xbfcfff, 2.0); this.key.castShadow = true; this.key.position.set(-20, 30, -14); this.key.target.position.set(0, 0, 0); scene.add(this.key); scene.add(this.key.target);
    const s = this.key.shadow; s.mapSize.set(1024, 1024); s.camera.left = -14; s.camera.right = 14; s.camera.top = 14; s.camera.bottom = -14; s.camera.near = 2; s.camera.far = 90; s.bias = -0.0006; s.normalBias = 0.035; s.radius = 2;
    this.rim = new THREE.DirectionalLight(0x66ffdc, 0.7); this.rim.position.set(10, 6, 12); scene.add(this.rim);
    // hero lamp (blaster light) + 2 pooled local point lights
    this.lamp = new THREE.SpotLight(0xffe0b0, 0, 16, Math.PI / 5.5, 0.6, 1.6); this.lamp.castShadow = false; scene.add(this.lamp); scene.add(this.lamp.target);
    this.points = [0, 1].map(() => { const p = new THREE.PointLight(0xffb060, 0, 10, 1.8); scene.add(p); return p; });
    this.pmrem = new THREE.PMREMGenerator(renderer.gl); this.pmrem.compileEquirectangularShader();
    this.envScene = new THREE.Scene(); this.envSky = sky.mesh.clone(); this.envSky.material = sky.mat; this.envScene.add(this.envSky);
    this.keyOffset = new THREE.Vector3(-20, 30, -14);
    this._snap = new THREE.Vector3();
  }
  setShadowSize(n) { const s = this.key.shadow; if (s.mapSize.x !== n) { s.mapSize.set(n, n); if (s.map) { s.map.dispose(); s.map = null; } } }
  apply(rig) {
    this.hemi.color.set(rig.hemi[0]); this.hemi.groundColor.set(rig.hemi[1]); this.hemi.intensity = rig.hemi[2];
    this.key.color.set(rig.key[0]); this.key.intensity = rig.key[1]; this.keyOffset.fromArray(rig.keyDir).normalize().multiplyScalar(40);
    this.rim.color.set(rig.rim[0]); this.rim.intensity = rig.rim[1]; this.rim.position.fromArray(rig.rimDir || [10, 6, 12]);
    this.lamp.color.set(rig.lamp?.[0] ?? 0xffe0b0); this.lampIntensity = rig.lamp?.[1] ?? 40; this.lamp.distance = rig.lamp?.[2] ?? 16;
    this.scene.fog = rig.fog ? new THREE.FogExp2(rig.fog[0], rig.fog[1]) : null;
    this.envIntensity = rig.env ?? 0.45;
    this.buildEnv();
  }
  buildEnv() {
    // render the sky into a PMREM env map (cheap, once per world)
    const cube = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
    if (this.scene.environment) this.scene.environment.dispose();
    this.scene.environment = cube.texture; this.scene.environmentIntensity = this.envIntensity;
  }
  // follow the player with the shadow frustum, snapping to texels to avoid shimmer
  update(target, camForward) {
    const s = this.key.shadow; const texel = (s.camera.right - s.camera.left) / s.mapSize.x;
    const tx = target.x + camForward.x * 5, tz = target.z + camForward.z * 5;
    this._snap.set(Math.round(tx / texel) * texel, 0, Math.round(tz / texel) * texel);
    this.key.target.position.copy(this._snap); this.key.position.copy(this._snap).add(this.keyOffset); this.key.target.updateMatrixWorld();
  }
  setLamp(pos, dir, on, intensity = 1) {
    this.lamp.position.copy(pos); this.lamp.target.position.copy(pos).add(dir); this.lamp.target.updateMatrixWorld();
    this.lamp.intensity = on ? this.lampIntensity * intensity : 0;
  }
}
