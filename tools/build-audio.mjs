// Build v2/assets/audio from generated raw clips: dedupe by job id, transcode music to looping mp3, write manifest audio entries + aliases.
// usage: node build-audio.mjs   (run from v2/tools)
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const SRC = '/home/claude/assets-src/audio'; const OUT = path.resolve('../assets/audio'); const MAN = path.resolve('../assets/manifest.json');
fs.mkdirSync(OUT, { recursive: true });
const jobs = JSON.parse(fs.readFileSync(path.join(SRC, 'jobs.json'), 'utf8'));
const ext = {}; for (const line of fs.readFileSync(path.join(SRC, 'urls.txt'), 'utf8').split('\n')) { const [id, , e] = line.trim().split(/\s+/); if (id) ext[id] = e; }

// names the game asks for that were not generated → nearest generated clip
const ALIAS = {
  sfx_ui: 'sfx_tick', sfx_tick_weak: 'sfx_tick', sfx_tick_kill: 'sfx_coin', sfx_breaker_hit: 'sfx_boss_slam', sfx_depth_explode: 'sfx_boss_slam', sfx_bonesaw_hit: 'sfx_sever',
  sfx_stalker_spawn: 'sfx_whoosh', sfx_stalker_roar: 'sfx_stalker_scream', sfx_stalker_call: 'sfx_stalker_scream',
  sfx_crawler_spawn: 'sfx_whoosh', sfx_crawler_scream: 'sfx_crawler_screech', sfx_crawler_windup: 'sfx_crawler_screech', sfx_crawler_swing: 'sfx_stalker_swing', sfx_crawler_roar: 'sfx_crawler_screech', sfx_crawler_call: 'sfx_crawler_screech',
  sfx_zombie_scream: 'sfx_zombie_spawn', sfx_zombie_roar: 'sfx_zombie_spawn', sfx_zombie_call: 'sfx_zombie_spawn',
  sfx_bloater_spawn: 'sfx_zombie_spawn', sfx_bloater_windup: 'sfx_zombie_windup', sfx_bloater_swing: 'sfx_zombie_swing', sfx_bloater_scream: 'sfx_acid_hiss', sfx_bloater_roar: 'sfx_zombie_spawn', sfx_bloater_call: 'sfx_zombie_spawn',
  sfx_shark_spawn: 'sfx_whirl', sfx_shark_swing: 'sfx_shark_bite', sfx_shark_scream: 'sfx_shark_windup', sfx_shark_roar: 'sfx_shark_rush', sfx_shark_call: 'sfx_sonar',
  sfx_jelly_spawn: 'sfx_whirl', sfx_jelly_windup: 'sfx_jelly_charge', sfx_jelly_swing: 'sfx_jelly_zap', sfx_jelly_scream: 'sfx_jelly_charge', sfx_jelly_roar: 'sfx_jelly_zap', sfx_jelly_call: 'sfx_sonar',
  sfx_stag_spawn: 'sfx_stag_call', sfx_stag_windup: 'sfx_stag_click', sfx_stag_scream: 'sfx_stag_roar', sfx_stag_death: 'sfx_boss_death',
  sfx_king_spawn: 'sfx_king_roar', sfx_king_windup: 'sfx_zombie_windup', sfx_king_scream: 'sfx_king_roar', sfx_king_call: 'sfx_king_roar', sfx_king_death: 'sfx_boss_death',
  sfx_meg_spawn: 'sfx_meg_sub', sfx_meg_windup: 'sfx_shark_windup', sfx_meg_swing: 'sfx_shark_bite', sfx_meg_scream: 'sfx_meg_roar', sfx_meg_call: 'sfx_meg_roar', sfx_meg_death: 'sfx_boss_death', sfx_meg_rush: 'sfx_shark_rush',
  sfx_step_home: 'sfx_step_grave',
};
// dedupe: first name per job id owns the file, later names alias it
const owner = {}; const entries = {};
for (const [name, id] of Object.entries(jobs)) {
  if (owner[id]) { ALIAS[name] = owner[id]; continue; } owner[id] = name;
  const e = ext[id]; if (!e) throw new Error('no ext for ' + name); const src = path.join(SRC, 'raw', id + '.' + e);
  if (name.startsWith('music_')) { const out = path.join(OUT, name + '.mp3'); if (!fs.existsSync(out)) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-ac', '2', '-ar', '44100', '-b:a', '112k', '-af', 'afade=t=in:d=0.02,areverse,afade=t=in:d=0.02,areverse', out]); entries[name] = 'audio/' + name + '.mp3'; }
  else { const out = path.join(OUT, name + '.mp3'); if (e === 'mp3') fs.copyFileSync(src, out); else execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', '44100', '-b:a', '96k', out]); entries[name] = 'audio/' + name + '.mp3'; }
}
const sz = u => fs.statSync(path.resolve('../assets', u)).size;
const item = n => ({ id: n, type: 'audio', url: entries[n], bytes: sz(entries[n]) });
const names = Object.keys(entries);
const world = { forest: ['music_forest_bed', 'music_forest_combat', 'music_forest_boss', 'sfx_stalker_scream', 'sfx_stalker_windup', 'sfx_stalker_swing', 'sfx_stalker_death', 'sfx_crawler_screech', 'sfx_stag_roar', 'sfx_stag_click', 'sfx_stag_call', 'sfx_step_forest', 'sfx_thud'],
  grave: ['music_grave_bed', 'music_grave_combat', 'music_grave_boss', 'sfx_zombie_spawn', 'sfx_zombie_windup', 'sfx_zombie_death', 'sfx_grave_burst', 'sfx_bloater_spit', 'sfx_bloater_death', 'sfx_acid_hiss', 'sfx_king_roar', 'sfx_step_grave'],
  sea: ['music_sea_bed', 'music_sea_combat', 'music_sea_boss', 'sfx_shark_windup', 'sfx_shark_bite', 'sfx_shark_rush', 'sfx_shark_death', 'sfx_jelly_death', 'sfx_jelly_zap', 'sfx_jelly_charge', 'sfx_meg_roar', 'sfx_meg_sub', 'sfx_sonar', 'sfx_whirl', 'sfx_step_sea'],
  home: ['music_home', 'music_ending'] };
for (const g in world) world[g] = world[g].filter(n => { if (entries[n]) return true; if (ALIAS[n]) return false; throw new Error('unknown ' + n); });
const placed = new Set(Object.values(world).flat());
const boot = names.filter(n => !placed.has(n));
const man = JSON.parse(fs.readFileSync(MAN, 'utf8'));
for (const g in man.groups) man.groups[g] = man.groups[g].filter(it => it.type !== 'audio' && it.type !== 'video');
man.groups.boot.push(...boot.map(item)); for (const g in world) man.groups[g].push(...world[g].map(item));
const vid = path.resolve('../assets/video/ending.mp4'); if (fs.existsSync(vid)) man.groups.home.push({ id: 'ending_video', type: 'video', url: 'video/ending.mp4', bytes: fs.statSync(vid).size });
man.aliases = ALIAS;
fs.writeFileSync(MAN, JSON.stringify(man, null, 1).replace(/\n\s+\{/g, ' {').replace(/\n\s+"(id|type|url|bytes)"/g, ' "$1"').replace(/\n\s+\}/g, ' }'));
const tot = g => man.groups[g].filter(i => i.type === 'audio').reduce((a, i) => a + i.bytes, 0);
console.log('files', names.length, 'aliases', Object.keys(ALIAS).length); for (const g in man.groups) console.log(g, man.groups[g].length, 'items', (tot(g) / 1024).toFixed(0) + 'KB audio');
