import assert from 'node:assert/strict';
// Minimal DOM event fixture for the real Input bindings, including captured
// button events bubbling to the app. No renderer or browser dependency needed.
class Element extends EventTarget {
  constructor(){super();this.style={};const classes=new Set();this.classList={add:s=>classes.add(s),remove:s=>classes.delete(s),contains:s=>classes.has(s)};}
  closest(){return null;}
  setPointerCapture(){}
}
const app=new Element(), elements=new Map();
for(const id of ['stick','bFire','bDash','bUlt','bPause','bMute']) elements.set(id,new Element());
elements.get('stick').firstElementChild=new Element();
globalThis.document={getElementById:id=>elements.get(id),body:new Element(),addEventListener(){},querySelectorAll:()=>[...elements.values()]};
globalThis.addEventListener=()=>{};
globalThis.innerWidth=852;
const {Input}=await import('../dream-champion/src/core/input.js');
const input=new Input(app), fire=elements.get('bFire');
function emit(el,type,x,y,id=1){const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:id,pointerType:'touch',clientX:x,clientY:y});el.dispatchEvent(e);}
function button(type,x,y){emit(fire,type,x,y);if(type!=='pointerdown')emit(app,type,x,y);}
button('pointerdown',780,320);
assert.equal(input.poll(1/60).fire,true);
button('pointermove',750,320);button('pointermove',700,300);
const s=input.poll(1/60);
assert.equal(s.fire,true,'dragging BLAST must keep shooting');
assert.ok(s.ldx<0 && s.ldy<0,'same finger produces look movement');
button('pointerup',700,300);
assert.equal(input.poll(1/60).fire,false);
assert.equal(input.pointers.size,0);
button('pointerdown',780,320);button('pointermove',740,320);button('pointercancel',740,320);
assert.equal(input.poll(1/60).fire,false);assert.equal(input.tap,null);
button('pointerdown',780,320);button('pointermove',740,320);button('lostpointercapture',740,320);
assert.equal(input.poll(1/60).fire,false);assert.equal(input.pointers.size,0);
emit(app,'pointerdown',140,320,2);emit(app,'pointermove',140,365,2);
assert.ok(input.poll(1/60).my < -0.95,'pulling touch stick back creates full reverse input');
emit(app,'pointercancel',140,365,2);assert.equal(input.poll(1/60).my,0);
console.log('PASS: simultaneous touch fire/look, release, cancellation, lost capture, reverse joystick and release.');
