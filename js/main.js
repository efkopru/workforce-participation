/* Boot sequence: load data → create store & actions → mount components.
   Data flows one way: components call actions, actions patch the store,
   the store notifies components. */

import { DATA_URL } from './config.js';
import { loadData } from './data.js?v=20260926-oct';
import { createStore } from './store.js';
import { createActions } from './actions.js?v=20260927-light';
import { initModal, initTheme, isModalOpen, showLoadError } from './ui.js?v=20260927-light';
import { initialStateFromHash, bindPermalink } from './permalink.js';
import { createMetricBar } from './components/metricBar.js?v=20260927-light';
import { createViewToggle } from './components/viewToggle.js?v=20260927-light';
import { createTooltip } from './components/tooltip.js?v=20260926-oct';
import { createMap } from './components/map.js?v=20260927-fit';
import { createTimeline } from './components/timeline.js?v=20260927-light';
import { createChapters } from './components/chapters.js?v=20260927-light';
import { createPanel } from './components/panel.js?v=20260927-light';

async function boot() {
  initTheme();                    // before the data loads, so the switch always works
  let data;
  try {
    data = await loadData(DATA_URL);
  } catch (err) {
    showLoadError(err);
    return;
  }

  const store = createStore({
    metricId: 'lfpr',
    idx: data.baseIdx,            // open on the eve of the pandemic…
    chapterId: 'eve',             // …with its chapter caption showing
    view: 'geo',
    selected: null,
    playing: false,
    geoReady: false,
    geoFailed: false,
    ...initialStateFromHash(data),  // a shared link overrides the defaults
  });
  const actions = createActions(store, data);

  const tooltip = createTooltip(data, store);
  createMetricBar(store, actions);
  createViewToggle(store, actions);
  createMap(data, store, actions, tooltip);
  createTimeline(data, store, actions);
  createChapters(data, store, actions);
  createPanel(data, store, actions);

  bindPermalink(store, data);
  initModal();
  initKeyboard(actions);

  window.__app = { data, store, actions };   // console / debugging handle
}

function initKeyboard(actions) {
  window.addEventListener('keydown', e => {
    if (e.target.closest('input,textarea') || isModalOpen()) return;
    if (e.key === 'ArrowRight') { actions.step(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { actions.step(-1); e.preventDefault(); }
    else if (e.key === ' ') { actions.togglePlay(); e.preventDefault(); }
    else if (e.key === 'Escape') actions.select(null);
  });
}

boot();
