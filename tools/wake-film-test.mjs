import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { showWakeFilm } from '../dream-champion/src/ui/wake-film.js';
let outcomes=[], videos=[];
class Element extends EventTarget {
 constructor(tag){super();this.tag=tag;this.children=[];this.currentTime=0;this.paused=true;this.hidden=false;this.style={};}
 append(...els){this.children.push(...els);for(const e of els)e.parent=this;}
 appendChild(el){this.append(el);}
 setAttribute(){} removeAttribute(){} load(){}
 remove(){this.removed=true;}
 pause(){this.paused=true;}
 play(){const next=outcomes.shift();if(next)return Promise.reject(Object.assign(new Error(next),{name:next}));this.paused=false;return Promise.resolve();}
}
globalThis.document={createElement(tag){const e=new Element(tag);if(tag==='video')videos.push(e);return e;}};
const tick=()=>new Promise(r=>setImmediate(r));
{
 outcomes=['NotAllowedError'];const parent=new Element('app');let shown=0;
 const film=showWakeFilm(parent,'wake.mp4',{onVisible:()=>shown++});await tick();
 const v=videos.at(-1);assert.equal(v.muted,true);assert.equal(shown,1);
 assert.equal(v.paused,false,'muted autoplay retries successfully');
 v.dispatchEvent(new Event('pointerdown'));assert.equal(v.paused,false,'stray touch does not skip');
 v.currentTime=9.95;v.dispatchEvent(new Event('ended'));
 assert.equal(await film.finished,true);assert.equal(parent.children[0].removed,undefined,'final frame retained');
 film.dispose();assert.equal(parent.children[0].removed,true);
}
{
 outcomes=['NotAllowedError','NotAllowedError'];const parent=new Element('app');
 const film=showWakeFilm(parent,'wake.mp4');await tick();
 const play=parent.children[0].children[1];assert.equal(play.hidden,false,'offers explicit playback tap');
 play.dispatchEvent(new Event('click'));await tick();assert.equal(videos.at(-1).paused,false);
 videos.at(-1).dispatchEvent(new Event('ended'));assert.equal(await film.finished,true);film.dispose();
}
{
 outcomes=['NotSupportedError'];const film=showWakeFilm(new Element('app'),'missing.mp4');
 assert.equal(await film.finished,false,'decode failure returns to retry flow');film.dispose();
}
{
 outcomes=[];const film=showWakeFilm(new Element('app'),'wake.mp4');
 film.dispose();assert.equal(await film.finished,false);await tick();assert.equal(videos.at(-1).paused,true,'late play resolution cannot restart disposed movie');
}
// Execute the actual game retry handler with scene/UI doubles.
const code=readFileSync(new URL('../dream-champion/src/game/Game.js',import.meta.url),'utf8');
const body=code.slice(code.indexOf('  onWake(a) {')+'  onWake(a) {'.length,code.indexOf('  // ---------- ending')).trim().replace(/}\s*$/,'');
let hides=0;const onWake=new Function('panels','a',body);let restarts=[],disposed=0;
const game={state:'wake',worldKey:'grave',cancel(){},wakeFilm:{dispose(){disposed++;}},clearHome(){},restoreScene(){},input:{reset(){}},loop:{timeScale:0.3},paused:true,enterWorld:k=>restarts.push(k),map(){throw Error('wrong destination');}};
onWake.call(game,{hide(){hides++;}},'retry');onWake.call(game,{hide(){hides++;}},'retry');
assert.deepEqual(restarts,['grave']);assert.equal(disposed,1);assert.equal(hides,1);assert.equal(game.loop.timeScale,1);assert.equal(game.paused,false);
console.log('PASS: muted autoplay recovery, tap-to-play recovery, no accidental skip, retained final frame, decode failure, disposal, same-level restart and double-tap guard.');
