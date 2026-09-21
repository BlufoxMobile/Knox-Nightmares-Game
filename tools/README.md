# Knox & the Nightmares — build tools

Everything the game *runs* lives in the public repo at
`BlufoxMobile/Knox-Nightmares-Game` under `dream-champion/` (it ships
unbundled ES modules, so the deployed folder IS the source).

These are the offline tools that were used to *produce* that folder's
assets. They are not needed to play or edit the game — only to
regenerate assets from raw inputs.

- `../SPEC.md` — the design/architecture spec for the v2 rebuild.
- `tools/reskin.mjs`, `reweight.mjs` — rebind the Higgsfield photogrammetry
  scan of Knox to a skeleton; `reweight` does nearest-bone-segment skinning
  with anatomical gates (this is what made the legs animate).
- `tools/build-monster.mjs` — bakes a monster GLB (mesh + clips) into the
  runtime format.
- `tools/build-audio.mjs` — dedupes generated audio clips by job id,
  transcodes, and writes the manifest + alias map.
- `tools/merge-clips.mjs` — merges animation clips into one GLB.
- `tools/shrink.mjs`, `dist.mjs` — texture compression and the deploy build.
- `tools/world-*.mjs`, `ui-*` — headless screenshot/eval harnesses.

They expect `@gltf-transform/*` and `three` in `tools/node_modules`
(`npm i @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions three`)
and Node 20+. `ui-shots.py` needs Playwright.

## Source assets

`source/knox-textured.glb` is the textured Higgsfield photogrammetry scan of
Knox as it came out of the scanner, before any rigging. It is the master the
playable model is derived from: `reskin.mjs` binds it to a skeleton and
`reweight.mjs` fixes the skinning weights, producing
`dream-champion/assets/characters/knox.glb`. Keep it — it cannot be
regenerated without re-scanning him.
