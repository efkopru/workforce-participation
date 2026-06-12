/* URL-hash sync — every view is shareable:
     #m=ur&t=2020-04&s=Michigan&v=grid
   m = metric id · t = month (YYYY-MM) · s = selected state · v = map|grid */

import { metricById } from './config.js';

const fmtYM = d3.timeFormat('%Y-%m');

/* read the hash once at boot; returns a partial state patch */
export function initialStateFromHash(data) {
  const h = new URLSearchParams(location.hash.slice(1));
  if (![...h.keys()].length) return {};

  const patch = { chapterId: null };        // an explicit link overrides the intro chapter
  const m = h.get('m'), t = h.get('t'), s = h.get('s'), v = h.get('v');

  if (m && metricById(m)) patch.metricId = m;
  if (t) {
    const idx = data.periods.findIndex(d => fmtYM(d) === t);
    if (idx >= 0) patch.idx = idx;
  }
  if (s && data.byState.has(s)) patch.selected = s;
  if (v === 'grid') patch.view = 'grid';
  return patch;
}

/* keep the hash in sync with the store (skipped during playback) */
export function bindPermalink(store, data) {
  store.subscribe((s, changed) => {
    const relevant = ['metricId', 'idx', 'selected', 'view', 'playing'];
    if (!relevant.some(k => changed.has(k))) return;
    if (s.playing) return;                  // don't spam replaceState 3×/second

    const h = new URLSearchParams();
    h.set('m', s.metricId);
    h.set('t', fmtYM(data.periods[s.idx]));
    if (s.selected) h.set('s', s.selected);
    if (s.view === 'grid') h.set('v', 'grid');
    history.replaceState(null, '', '#' + h.toString());
  });
}
