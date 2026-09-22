import assert from 'node:assert/strict';
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};
const {save}=await import('../dream-champion/src/core/save.js');
assert.equal(save.data.settings.controlMode,'follow');
Object.assign(save.data.settings,{controlMode:'twin',controlSize:1.15,controlOpacity:.6,controlInset:38,controlHeight:62,threatWarnings:false,wakeReplay:'skip',seenWake:true});
save.write();save.data=null;save.load();assert.equal(save.data.settings.controlMode,'twin');assert.equal(save.data.settings.controlHeight,62);assert.equal(save.data.settings.seenWake,true);
// Older saved games acquire new preferences without losing progress.
memory.set('knox-nightmares-v2',JSON.stringify({slain:{forest:true},settings:{look:1.4}}));save.load();assert.equal(save.data.slain.forest,true);assert.equal(save.data.settings.look,1.4);assert.equal(save.data.settings.controlMode,'follow');
console.log('PASS: control preferences persist and older saves keep their progress.');
