# Knox & the Nightmares — v2 engine spec (module contracts)

Static site, ES modules, import map (`three` → vendor/three/three.module.js, `three/addons/` → vendor/three/addons/). No bundler, no CDN. Three r186.
Target: iPhone landscape first (852×393 pt, DPR ≤2), desktop second. 60 fps on iPhone 13 (Medium tier).

## Directory
```
src/main.js                 boot: renderer → tier → assets(boot) → Game.start()
src/core/{math,events,pool,save,input,quality,loop,assets,audio}.js   (DONE)
src/render/{renderer,sky,lighting,particles,decals,fx}.js             (DONE)
src/anim/AnimGraph.js                                                  (DONE)
src/game/HeroGear.js                                                   (DONE)
src/game/Game.js            state machine: boot → title → play(world) → wake/cleared → map → ending
src/game/Player.js          Knox: movement, roll, blaster, ult, animation graph, gear, camera rig
src/game/Enemy.js, Boss.js  pooled skinned monsters, AI brains, telegraphs, gore
src/game/Director.js        waves, spawn places, tokens, pickups, rubber banding
src/game/Projectiles.js     instanced player shots (3 ammo styles) + enemy shots
src/game/data/*.js          themes (per world), enemies, waves, copy (all on-screen text)
src/game/worlds/{forest,grave,sea,home}.js   environment builders (AGENT: worlds)
src/ui/{hud,panels}.js      DOM HUD + overlays (AGENT: ui)
```

## Shared objects (passed as `ctx`)
```js
ctx = { scene, camera, renderer /*Renderer wrapper: .gl, .grade, .fx, .tier, .tierName*/, sky, lighting, particlesAdd, particlesAlpha, decals, assets, audio, input, loop, save, bus, time /*seconds*/, world /*current World instance*/, player }
```

## World builder contract — `src/game/worlds/<name>.js`
```js
export const THEME = { key:'forest', name:'THE HOLLOW WOODS', sub:'Skinwalkers', tagline:'Something is wearing the forest.', boss:'hollowstag', bossName:'THE HOLLOW STAG', bossTitle:'NIGHTMARE ALPHA', bossQuote:'"I\'ve been wearing your dreams, Knox."', ammo:'starfire', accent:0xff7a2f, radius:19, underwater:false,
  sky:{ zenith:0x03040c, horizon:0x0e1426, ground:0x020204, moonColor:0xff5a3c, moonDir:[-0.5,0.4,-0.75], moonSize:0.02, moonGlow:1.2, stars:1, clouds:0.55, cloudColor:0x0b0d18, aurora:0 },
  rig:{ hemi:[0x3a4670,0x050608,0.45], key:[0xbfcfff,1.6], keyDir:[-0.5,0.8,-0.5], rim:[0xff7a2f,0.6], rimDir:[10,6,12], lamp:[0xffd9a0,60,16], fog:[0x05070f,0.045], env:0.35 },
  grade:{ exposure:0.95, lift:[0,0,0.01], gain:[1,0.96,1.02], saturation:0.9, contrast:1.08, bloom:0.5, vignette:0.55 },
  music:{ bed:'forest_bed', combat:'forest_combat', boss:'forest_boss' } };
export function build(ctx, tier) {
  // adds ground (patched with patchFog, receiveShadow), boundary dressing that hides the edge (tree wall / cliffs / abyss), instanced props, ambient particle emitters
  // returns { group, update(dt, t, playerPos), dispose(), spawnPoints:[{x,z,kind:'treeline'|'grave'|'water'}], bossSpawn:{x,z}, obstacles:[{x,z,r}] /* circles the player & enemies collide with */, lampsOff(n), blackout(v 0..1), lightning() }
}
```
Rules: ground = flat disc y=0 radius = THEME.radius + 8 (playable radius THEME.radius); everything beyond the playable radius is impassable dressing. Use `instancer()` + `patchFog(material,{wind:true,instanced:true})` from render/fx.js for repeated props; ≤ 6 InstancedMesh draws + ≤ 6 merged static meshes per world. castShadow only on trees/gravestones/large rocks (tier 'high'), never on grass/particles. Textures: procedural via fx.noiseTexture / normalFromNoise (no external files) unless present in assets manifest. Keep total geometry ≤ 120k tris (high), ≤ 60k (low: tier.lod===1).

## Enemy defs — `src/game/data/enemies.js`
```js
export const ENEMIES = {
  stalker: { glb:'stalker', hp:36, speed:3.4, sprint:7.5, r:0.55, height:2.1, ai:'stalker', score:100, scale:1, clips:{idle:'alert',move:'walk',rush:'run',attack:'attack',hit:'hit',death:'death'}, attack:{windup:0.6,range:1.8,dmg:20,cone:70}, gore:'ash', voice:'stalker' },
  crawler:  { glb:'stalker', scale:0.7, hp:24, speed:4.6, ai:'pouncer', ... },
  rotter, bloater(ranged), reaper(shark: ai 'charger', swims y 0.5..3), lantern(jelly: ai 'drift', shock ring), hollowstag/rotking/megalodon (bosses, see Boss.js)
}
```

## Copy — `src/game/data/copy.js` (single source for all text; from the creator review): title, taglines, world names, banners (THEY'RE HERE. / MORE OF THEM. / THE WHOLE FOREST IS AWAKE. / CLEAR. / …SOMETHING BIGGER IS COMING. / IT'S ANGRY NOW.), multikill stamps, kill feed lines, wake-up screen, cleared screen, map header, final victory, pickups, secrets.

## HUD/panels contract — `src/ui/hud.js`
```js
export const hud = { show(), hide(), setHP(hp,max,hurt), setKills(n), setStreak(mult, frac /*bar 0..1*/, shatter), setUlt(frac), setDash(charges,max), setWorld(name, objectiveText), reticle(state:'off'|'free'|'lock'|'weak'), hitmarker(kind:'body'|'weak'|'kill'), damageNumber(screenX,screenY,text,kind), damageDir(angleRad /*0 = from front*/), banner(text, size:'big'|'normal'|'small'), stamp(text, color:'gold'|'red'|'cyan'|'white'), killfeed(line), pickup(text), ghost(text|null), boss(name,sub|null) , bossHP(frac, flash), low(on), setTouchVisible(bool), lefty(bool) }
export const panels = { title(cb), map(state, cb), pause(cb, settings), wake(cb, lines), cleared(stats, cb), victory(cb), settings(cb), hide() }   // DOM overlays in #ov; callbacks receive action strings
export const fxdom = { flash(alpha,ms), tear(), fade(to0or1, ms), letterbox(on) }
```
The HUD writes DOM only when a value changes (cache last values). No layout thrash; use transforms/opacity.

## Game rules (locked numbers)
Player: HP 100 (5 segments). Speed 6.4 m/s (5.6 underwater). Roll 0.45 s / 4.5 m, i-frames 40–300 ms, 2 charges, 1.8 s refill each, perfect dodge → 0.35× slow-mo 0.5 s, +15% ult. Ult (NIGHTMARE BREAKER): starts 0%, +6%/kill, +1.5%/s, r=7 m, 60 dmg, 1.2 s stagger; lifts enemies, freeze 0.6 s, simultaneous detonation.
Blaster: STARFIRE 6/s 12 dmg (18 head) 60 m/s; BONE-SAW 2.2/s 32 AoE r2.2 (limbs off); DEPTH CHARGE 4/s 14 homing 22 m/s. Charge shot on hold ≥ 0.6 s then release.
Camera: over-shoulder, pivot chest 1.3 m, dist 3.6 (4.4 boss, 2.9 aim), vFOV 46°, τ 0.12 s, auto-yaw follow, soft-lock target yaw bias.
Aim assist: soft lock scoring (angle 55%, dist 30%, threat 15%), hysteresis .15, magnetism 240°/s no-input / 60°/s with input, bullet bend 60°/s within 1.2 m, tap-to-target 2 s. Auto-Blast default ON on touch.
Hit feedback: hitmarker, damage numbers, emissive flash 60 ms, hit-stop 40/70/120/400 ms, trauma shake (trauma² model), knockback, red vignette + directional indicator, heartbeat < 40 HP.
Telegraphs: windup ≥ 0.55 s melee / 0.9 s ranged / 1.2 s boss; ground decal fills; 2 melee + 1 ranged attack tokens; no contact damage without windup.
Waves: 3 waves + boss per world (45 s / 60 s / 75 s targets), breather 8 s with chest (heart + power-up), boss 3 phases (100/66/33) with intro (letterbox, title card, roar), enrage banner at 40%, kill-cam slow-mo on death.
Difficulty: Brave (default) / Brutal (×1.35 HP, ×1.1 speed). Silent rubber-banding after 2 wakes on the same wave (HP −10%, cap −30%).
Fail = "YOU WOKE UP." (tear fx → gasp → bedroom) then GO BACK IN reloads the wave (boss keeps phase). Win all 3 → ending video + "KNOX — NIGHTMARE SLAYER. Sleep well, legend."
Gore: blood decals (colour per enemy), skull-pop on headshot (chunks + spray), limb loss via bone collapse + chunk particles, corpses persist ≤ 20 then sink; underwater = blood clouds (alpha particles) not chunks.
