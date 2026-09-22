import assert from 'node:assert/strict';
import { Player } from '../dream-champion/src/game/Player.js';
import * as THREE from 'three';
import { angDiff } from '../dream-champion/src/core/math.js';
import { AMMO } from '../dream-champion/src/game/data/enemies.js';

// Run the actual fixed-step movement, target selection, shot creation and camera
// placement. Only rendering, sound, animation and the world are test doubles.
const noop = () => {};
function player(autoBlast = false) {
  const shots = [];
  const p = Object.create(Player.prototype);
  Object.assign(p, { alive:true, x:0, y:0, z:0, vx:0, vz:0, faceYaw:Math.PI,
    hp:100, ult:0, comboT:0, fireCd:0, aimT:0, aimW:0, combatT:0, charging:false,
    buffs:{quick:0,shield:0,overcharge:0,vision:0},
    steering:{active:false}, moveYaw:null, roll:{t:-1,charges:2},
    locked:null, lockT:0, tapLock:0, ammo:AMMO.starfire, ammoKey:'starfire',
    root:new THREE.Group(), muzzleW:new THREE.Vector3(0,1.2,0),
    cam:{yaw:Math.PI,pitch:-0.17,autoT:0,dist:5,targetDist:5,shoulder:0.55,side:0.55,pos:new THREE.Vector3(),lookAt:new THREE.Vector3(),fovKick:0},
    trauma:0,shakeT:0,anim:{upperShot:noop},
  });
  p.game = {autoBlast, save:{data:{settings:{}}},world:{THEME:{radius:10000},env:{obstacles:[]}},
    audio:{play:noop}, projectiles:{fire:s=>shots.push(s)}, lightFlash:noop,onShot:noop};
  p.ctx = {camera:new THREE.PerspectiveCamera(50,16/9,0.05,260),particlesAdd:{one:noop,burst:noop}};
  p.shots=shots;
  return p;
}
const input=(mx,my,fire=false)=>({mx,my,fire,fireHold:0,ldx:0,ldy:0});
function run(p,i,n=120,enemies=[]) {
  for(let k=0;k<n;k++) {
    p.muzzleW.set(p.x,1.2,p.z);
    p.fixedUpdate(1/60,i,enemies);
    p.root.position.set(p.x,p.y,p.z);
    p.updateCamera(1/60);
  }
}
function aligned(a,b,msg,tol=0.04) {assert.ok(Math.abs(angDiff(a,b))<tol,msg);}
for (const [name,mx,my,target] of [['left',-1,0,1.5*Math.PI],['right',1,0,Math.PI/2],['back',0,-1,0],['diagonal',1,1,Math.PI*0.75]]) {
  for (const fire of [false,true]) {
    const p=player(); run(p,input(mx,my,fire));
    aligned(p.faceYaw,target,`${name}: facing`);
    aligned(p.cam.yaw,target,`${name}: camera follows while held`);
    aligned(Math.atan2(p.x,p.z),target,`${name}: travels straight without orbit feedback`);
    const behind=(p.ctx.camera.position.x-p.x)*Math.sin(target)+(p.ctx.camera.position.z-p.z)*Math.cos(target);
    assert.ok(behind < -3,`${name}: actual camera is behind Knox`);
    if(fire) { const shot=p.shots.at(-1); aligned(Math.atan2(shot.dx,shot.dz),target,`${name}: projectile turns`); }
  }
}
for (const auto of [false,true]) {
  const p=player(auto), old={alive:true,x:0,z:-12,y:0,height:2};
  p.locked=old; p.tapLock=2;
  run(p,input(0,-1,true),120,[old]);
  assert.equal(p.locked,null,'old target must not override a turn, even with tap lock');
  assert.ok(p.shots.at(-1).dz>0.9,'fires behind initial position while BLAST held');
}
{
  const p=player(true), rear={alive:true,x:0,z:20,y:0,height:2};
  run(p,input(0,-1,true),90,[rear]);
  assert.equal(p.locked,rear,'can acquire target behind initial camera');
  assert.equal(p.shots.at(-1).target,rear,'homing target follows turn');
}
{
  const p=player(); run(p,input(0,-1));
  const z=p.z; run(p,input(0,1));
  assert.ok(p.z>z+10,'UP after turnaround is forward in new view without lifting');
  run(p,input(0,0),30); const yaw=p.cam.yaw; run(p,input(-1,0));
  aligned(p.cam.yaw,yaw+Math.PI/2,'new push is relative to new view');
}
{
  const p=player(); run(p,input(-1,0),60);
  const yaw=p.moveYaw; run(p,input(-1,0.03),120);
  aligned(p.moveYaw,yaw,'thumb jitter does not continually rebase heading');
  run(p,{...input(-1,0),ldx:5},60);
  assert.ok(p.cam.autoT>0,'manual look overrides follow');
  run(p,input(-1,0),180); aligned(p.cam.yaw,p.moveYaw,'follow resumes after manual look');
}
console.log('PASS: left/right/back/diagonal with and without fire; actual camera placement; straight holds; lock release/reacquisition; projectile heading; direction changes; jitter; manual look.');
{
  const p=player();p.game.save.data.settings.controlMode='twin';
  run(p,input(1,0,true));
  aligned(p.cam.yaw,Math.PI,'independent aim holds camera while strafing');
  aligned(p.faceYaw,Math.PI,'independent aim keeps blaster forward while strafing');
  assert.ok(p.x>10,'left thumb still moves in independent mode');
  const shot=p.shots.at(-1);assert.ok(shot.dz<-.9,'strafe does not redirect shots');
}
{
  const p=player(), far={alive:true,x:0,z:-40,y:0,height:2};
  run(p,input(0,0),60,[far]);assert.equal(p.locked,far,'can track distant target');
  assert.equal(p.targetInRange(),false,'distant target is not falsely in weapon range');
  const shark={alive:true,x:0,z:-10,y:4,height:2};run(p,input(0,0,true),90,[shark]);
  assert.equal(p.shots.at(-1).target,shark);assert.ok(p.shots.at(-1).dy>.25,'aim reaches elevated shark');
}
console.log('PASS: independent move/aim mode, distant target range, elevated shark shots.');
