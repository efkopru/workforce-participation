/* Boot sequence: load data → create store & actions → mount components.
   Data flows one way: components call actions, actions patch the store,
   the store notifies components. */

import { DATA_URL } from './config.js';
import { loadData } from './data.js';
import { createStore } from './store.js';
import { createActions } from './actions.js';
import { initModal, isModalOpen, showLoadError } from './ui.js';
import { initialStateFromHash, bindPermalink } from './permalink.js';
import { createMetricBar } from './components/metricBar.js';
import { createViewToggle } from './components/viewToggle.js';
import { createTooltip } from './components/tooltip.js';
import { createMap } from './components/map.js';
import { createTimeline } from './components/timeline.js';
import { createChapters } from './components/chapters.js';
import { createPanel } from './components/panel.js';

async function boot() {
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
