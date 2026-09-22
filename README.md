# Knox-Nightmares-Game

The playable game is in `dream-champion/`.

## Controls

- Push the left stick to choose a travel direction. Knox turns even while firing,
  and the camera swings behind him while the stick is held.
- A steady push keeps its world heading so camera follow does not make him circle.
  Change stick direction deliberately (more than 8 degrees), or release and push
  again, to choose a direction relative to the current view.
- Drag the right side to look. Dragging BLAST also looks while continuing to fire.
  Manual look temporarily pauses automatic follow.
- Aim assist only holds enemies within 45 degrees of the chosen direction;
  turning away releases an old lock. Shots follow Knox during the camera swing.

## Controls regression tests

Requires Node.js 22+; uses the included Three.js files, no package installation.

```sh
node --experimental-loader ./tools/three-loader.mjs tools/controls-test.mjs
node tools/input-test.mjs
```

These exercise the real fixed-step controller, camera placement, projectile
creation, target changes and touch input handlers. They do not replace testing
responsiveness on a physical phone.

## Loss sequence

The bundled `dream-champion/assets/video/wake.mp4` matches Higgsfield take
`ffe074a6-6760-4d72-ab49-5f5bb84cb2b1` (September 21, 2026): Knox wakes,
wipes his forehead and settles back into bed. The film attempts inline playback,
retries muted if audible autoplay is blocked, then offers tap-to-play if needed.
Only the explicit Skip scene button skips it. Its final frame remains behind
“It looks like you woke up. Do you want to try again?” and the bottom Try Again
button, which restarts the current level from wave one. Errors/stalls still
release the retry screen. No new video generation was needed.

Test playback recovery and retry routing with `node tools/wake-film-test.mjs`.

## Mobile playability settings

Pause or open Settings to choose Follow Knox (default) or Independent Aim.
Independent Aim uses camera-relative movement while the right thumb owns aiming;
it does not automatically swing the camera with strafing. Settings also save
button size, opacity, side spacing, height, sensitivity, warning visibility and
whether to skip the wake film after it has been watched once.

The crosshair projects the weapon aim point after the camera update, including
vertical targets and moving-target lead. Amber labels identify out-of-range and
off-screen targets; aim assist may select targets up to 48 m away, but actual
weapon ranges are unchanged. Automatic firing requires an in-range visible
lock. Hits/weak hits/kills appear at the enemy; charged shots pulse gold and
missed targeted projectiles show a short, subdued notice.

Off-screen nearby windups/lunges trigger a directional warning and a throttled
positional cue. Brave gives four seconds to orient at entry and eases the first
two waves; repeated full-level losses retain bounded assistance for that level.
Brutal's opening remains unchanged. Clearing a level resets its retry assistance.

Additional tests (use the Three.js loader for tests importing Three.js):
`aim-hud-test.mjs`, `difficulty-test.mjs`, `shot-feedback-test.mjs`, and
`mobile-settings-test.mjs` in `tools/`. Physical iPhone feel is not verified by
these tests.
