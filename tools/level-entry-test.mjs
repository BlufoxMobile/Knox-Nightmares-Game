import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dream-champion/src/game/Game.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('  async _enterWorld(key) {')+'  async _enterWorld(key) {'.length,source.indexOf('  pause() {')).trim().replace(/}\s*$/,'');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
let hidden=true,shown=false,touch=false,starts=0;
const hud=new Proxy({hideUI:x=>hidden=x,show:()=>shown=true,hide:()=>shown=false,setTouchVisible:x=>touch=x},{get:(o,k)=>o[k]||(()=>{})});
const el={classList:{add(){},remove(){}},querySelector:()=>({style:{}})};
const document={getElementById:()=>el};
const save={data:{settings:{seenTut:{forest:true}}}};
const enter=new AsyncFunction('hud','panels','fxdom','document','COPY','isTouchDevice','save','WORLD_ORDER','key',body);
const game={input:{touchActive:true,reset(){},lockMouse(){}},cancel(){},restoreScene(){},loadWorld:async()=>{},player:{hp:100,maxhp:100,setWorld(){}},world:{THEME:{name:'Forest'}},heroLightsOff(){},director:{setup(){},startLevel(){starts++;}},difficulty:'brave',time:0,audio:{setMusic(){},setMusicMix(){}},wake(){},renderer:{dyn:{}},assets:{releaseGroup(){},prefetch(){}},after(){}};
for(let attempt=0;attempt<2;attempt++){
 hidden=true;shown=false;touch=false;
 await enter.call(game,hud,{hide(){}},{fade(){}},document,{worlds:{forest:{name:'Forest'}}},()=>true,save,['forest'],'forest');
 assert.equal(game.state,'play');assert.equal(hidden,false,'level entry clears cinematic hideui');assert.equal(shown,true);assert.equal(touch,true);assert.equal(game.stats.kills,0);
}
assert.equal(starts,2);console.log('PASS: initial level entry and replay restore HUD/touch controls and start a fresh level.');
