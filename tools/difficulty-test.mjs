import assert from 'node:assert/strict';
import {Director} from '../dream-champion/src/game/Director.js';
const noop=()=>{};
function director(difficulty,retries=0){
 const g={difficulty,retryCounts:{forest:retries},world:{THEME:{name:'Forest',key:'forest'},env:{}},hud:{setWorld:noop,banner:noop},audio:{setMusicMix:noop,play:noop}};
 const d=new Director({game:g});Object.assign(d,{worldKey:'forest',waves:[{cap:6,list:[['stalker',8]]}],maxWaveReached:-1,wakesOnWave:0});return d;
}
const brave=director('brave');brave.startLevel();assert.equal(brave.stateT,4);brave.nextWave();assert.equal(brave.cap,4);assert.equal(brave.tokens.melee,2);assert.equal(brave.queue.length,8);
const brutal=director('brutal');brutal.startLevel();assert.equal(brutal.stateT,2.2);brutal.nextWave();assert.equal(brutal.cap,7);assert.equal(brutal.tokens.melee,4);
const retry=director('brave',3);retry.startLevel();retry.nextWave();assert.ok(retry.spawnGap>brave.spawnGap);assert.equal(retry.mercy,2);
console.log('PASS: gentler Brave opening, unchanged Brutal opening, retry assistance survives full-level restarts.');
