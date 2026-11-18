/* URL-hash sync — every view is shareable:
     #m=ur&t=2020-04&s=Michigan&v=grid
   m = metric id · t = month (YYYY-MM) · s = selected state · v = map|grid */

import { metricById } from './config.js?v=20261117';

const fmtYM = d3.timeFormat('%Y-%m');

/* the view a hash describes, as a partial state patch ({} when the hash names nothing) */
function stateFromHash(data) {
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

/* read the hash once at boot */
export const initialStateFromHash = stateFromHash;

export function bindPermalink(store, data, actions) {
  const writeHash = () => {
    const s = store.get();
    const h = new URLSearchParams();
    h.set('m', s.metricId);
    h.set('t', fmtYM(data.periods[s.idx]));
    if (s.selected) h.set('s', s.selected);
    if (s.view === 'grid') h.set('v', 'grid');
    history.replaceState(null, '', '#' + h.toString());
  };

  /* keep the hash in sync with the store (skipped during playback) */
  store.subscribe((s, changed) => {
    const relevant = ['metricId', 'idx', 'selected', 'view', 'playing'];
    if (!relevant.some(k => changed.has(k))) return;
    if (s.playing) return;                  // don't spam replaceState 3×/second
    writeHash();
  });

  /* A shared link pasted into the address bar of the open atlas changes only the hash, so
     the page does not reload: show the view it describes. A link that names no state shows
     the nation, and one without &v=grid the map. */
  window.addEventListener('hashchange', () => {
    const { view = 'geo', ...patch } = stateFromHash(data);
    if (!('chapterId' in patch)) return;    // an empty hash describes nothing
    actions.pause();
    store.set({ selected: null, ...patch });
    if (view !== store.get().view) actions.setView(view);
    writeHash();                            // whatever the link got wrong is dropped from the address
  });
}
