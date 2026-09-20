# Knox & the Nightmares — Dream Champion

A personalized, mobile-first 3D dream adventure. Play in iPhone landscape orientation.

## Play

Move with your left thumb. Hold **BLAST** to aim at the nearest enemy and fire. **DASH** dodges attacks. **PULSE** clears nearby threats and recharges through time and defeats. Red ground warnings show incoming boss attacks.

Nightmare Mode is the default for experienced players. Switch to Hero Mode from the dream selection screen. Pause offers Cinematic/Performance graphics and optional auto-fire. On a keyboard: WASD/arrows move, Space fires, Shift dashes, E uses Pulse, Escape pauses.

Defeat all three dream bosses to unlock the champion celebration and Knox's journey from his parents' bed to his own cozy bed. Completed worlds and the best single-world score are saved in this browser. The story celebrates courage without promising that fear or nightmares disappear forever.

## What changed

- Repaired incorrect hand-bone influence on lower-body and clothing vertices. The original rig pulled parts of the legs and shorts when Knox aimed.
- Added rest-space walking, knee and ankle movement, two-bone arm targeting, and hand-following blaster recoil.
- Used the 2048 × 2048 texture from the supplied GLB; the old game used 1024 × 1024. The supplied animation track is a single pose, not a complete walking animation.
- Added closer cameras, a recognizable hero presentation, cinematic sky, more detailed world dressing, improved color handling, and a new mobile interface.
- Added Dream Pulse, combos, scoring, difficulty selection, auto-fire assistance, and performance controls.
- Added a champion celebration, fireworks, a close bedroom ending, and a cozy blanket.
- Bundled the existing Three.js libraries locally, separated the model and texture for caching, and added scene-resource cleanup and input reset on interruption.

## Hosting

This is a static website. Upload this folder's contents, keeping `index.html`, `game.js`, `style.css`, `assets/`, and `vendor/` together. It works on GitHub Pages or Cloudflare Pages. No build step, API key, account system, or server is required. Use HTTPS. To test locally, serve the folder with a local web server; opening the HTML directly as a file will not load the 3D model reliably.

Changing hosts does not itself improve rendering quality. Graphics are rendered by the phone.

## Validation and limits

- JavaScript syntax validated.
- All three worlds, fire, movement, Pulse, pause, graphics toggle, auto-fire, loss/retry, all three boss reward transitions, and the finale checked in Chrome (boss transitions exercised with local review controls).
- Landscape iPhone-sized layout checked at 852 × 393 CSS pixels; this is not a physical iPhone/Safari performance certification.
- Rig checks: all matrices finite in 16 walking/firing poses; knee motion confirmed; aiming shifts tested lower-body vertices by less than 0.001 model units after repair.
- Browser rig diagnostics also check normalized skin weights and weapon attachment at four gait phases.
- The starting character is an AI-generated mesh with hands resting against the body. Its topology still limits close-up limb separation compared with a professionally modeled and painted character rig. This is an improved browser game, not equivalent to a full AAA production such as Fortnite.

## Assets

Knox geometry and source rig: the owner's original GitHub game and supplied Higgsfield GLB. Sharper texture: the supplied GLB. Sky: generated with the built-in image-generation tool; see `ART-PROMPT.md`. Three.js r128 and included examples: MIT; license in `vendor/THREE-LICENSE.txt`.
