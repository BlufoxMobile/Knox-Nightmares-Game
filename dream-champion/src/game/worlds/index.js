// World registry: each entry is { THEME, build(ctx, tier) } — see SPEC.md "World builder contract".
import * as forest from './forest.js';
import * as grave from './grave.js';
import * as sea from './sea.js';
import * as home from './home.js';

export const WORLDS = { forest: { THEME: forest.THEME, build: forest.build }, grave: { THEME: grave.THEME, build: grave.build }, sea: { THEME: sea.THEME, build: sea.build }, home: { THEME: home.THEME, build: home.build },
  parents: { THEME: home.PARENTS_THEME, build: (ctx, tier) => home.build(ctx, tier, { parents: true }) } };
export const WORLD_ORDER = ['forest', 'grave', 'sea'];
