import assert from 'node:assert/strict';
import * as THREE from 'three';
import {aimScreen} from '../dream-champion/src/core/aim-hud.js';
const c=new THREE.PerspectiveCamera(50,844/390,.05,260);c.position.set(0,2,5);c.lookAt(0,2,-10);c.updateMatrixWorld(true);
const mid=aimScreen(new THREE.Vector3(0,2,-10),c,844,390);
const high=aimScreen(new THREE.Vector3(0,5,-10),c,844,390);
assert.ok(mid.visible&&high.visible);assert.ok(high.y<mid.y-40,'crosshair rises with shark height');
const left=aimScreen(new THREE.Vector3(-5,2,-10),c,844,390);assert.ok(left.x<mid.x);
for(const pos of [new THREE.Vector3(0,2,10),new THREE.Vector3(100,2,-1),new THREE.Vector3(0,200,-5)]){
 const s=aimScreen(pos,c,844,390);assert.equal(s.visible,false);assert.ok(s.x>=24&&s.x<=820&&s.y>=24&&s.y<=366);
}
c.lookAt(-5,2,-10);c.updateMatrixWorld(true);const moved=aimScreen(new THREE.Vector3(-5,2,-10),c,844,390);assert.ok(Math.abs(moved.x-422)<1,'projection uses updated camera');
console.log('PASS: elevated/lateral targets, behind-camera and off-screen edge indicators, updated-camera projection.');
const {readFileSync}=await import('node:fs');
const source=readFileSync(new URL('../dream-champion/src/game/Game.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('  updateAimHUD(real) {')+'  updateAimHUD(real) {'.length,source.indexOf('  render(alpha, real)')).trim().replace(/}\s*$/,'');
let ret;const warning={}, feedback={};
globalThis.innerWidth=844;globalThis.innerHeight=390;
const update=new Function('hud','save','aimScreen','_v','document','real',body);
const target={x:0,y:5,z:-10,height:2};
const p={x:0,y:0,z:0,cam:{yaw:Math.PI},shotTarget:()=>target,targetInRange:()=>true,aimPoint:v=>v.set(0,target.y,-10)};
const game={player:p,camera:c,time:1,director:{enemies:[{alive:true,windup:1,x:0,y:0,z:10,height:2}]},audio:{play(){}}};
const doc={getElementById:id=>id==='threat-warning'?warning:feedback};
update.call(game,{reticle:(...a)=>ret=a},{data:{settings:{}}},aimScreen,new THREE.Vector3(),doc,1/60);
assert.equal(ret[0],'lock');assert.match(warning.textContent,/BEHIND/);assert.equal(warning.hidden,false);
target.y=2;const oldY=ret[2];update.call(game,{reticle:(...a)=>ret=a},{data:{settings:{threatWarnings:false}}},aimScreen,new THREE.Vector3(),doc,1/60);
assert.ok(ret[2]>oldY);assert.equal(warning.hidden,true);
console.log('PASS: actual HUD update moves crosshair with target elevation and toggles rear-threat warnings.');
