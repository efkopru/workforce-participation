/* All state transitions live here — components never call store.set
   directly, so every behavior (play, scrub, chapter jumps, selection)
   has exactly one implementation. */

import { toast } from './ui.js';

const TICK_MS = 340;          // playback speed: one month per tick

export function createActions(store, data) {
  let timer = null;

  function seek(idx) {
    idx = Math.max(0, Math.min(data.N - 1, idx));
    const s = store.get();
    /* a chapter stays "active" only while the clock sits on its month */
    const ch = s.chapterId && data.chapters.find(c => c.id === s.chapterId);
    store.set({ idx, chapterId: ch && ch.idx === idx ? s.chapterId : null });
  }

  function play() {
    if (store.get().playing) return;
    if (store.get().idx >= data.N - 1) seek(0);          // replay from start
    store.set({ playing: true });
    timer = d3.interval(() => {
      const s = store.get();
      if (s.idx >= data.N - 1) pause();
      else seek(s.idx + 1);
    }, TICK_MS);
  }

  function pause() {
    if (timer) { timer.stop(); timer = null; }
    store.set({ playing: false });
  }

  return {
    seek,
    play,
    pause,
    togglePlay: () => (store.get().playing ? pause() : play()),
    step: delta => { pause(); seek(store.get().idx + delta); },

    setMetric: id => store.set({ metricId: id }),

    /* click toggles: same state again → back to national view */
    select: name => {
      const s = store.get();
      store.set({ selected: name && name !== s.selected ? name : null });
    },

    setView: view => {
      const s = store.get();
      if (view === 'geo' && !s.geoReady) {
        if (!s.geoFailed) toast('Map shapes are still loading…');
        return;
      }
      store.set({ view });
    },

    gotoChapter: ch => {
      pause();
      store.set({
        idx: ch.idx,
        chapterId: ch.id,
        ...(ch.metric ? { metricId: ch.metric } : {}),
      });
    },

    /* called by the map component when the TopoJSON arrives / fails */
    geoLoaded: () => store.set({ geoReady: true }),
    geoFailed: () => {
      const s = store.get();
      store.set({ geoFailed: true, ...(s.view === 'geo' ? { view: 'grid' } : {}) });
      toast('Geographic shapes couldn’t load — showing grid view.');
    },
  };
}
