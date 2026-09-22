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
- Aim assist only holds enemies within 30 degrees of the chosen direction;
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
