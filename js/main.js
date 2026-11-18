/* Boot sequence: load data → create store & actions → mount components.
   Data flows one way: components call actions, actions patch the store,
   the store notifies components.

   Every module URL in the app carries the same ?v= tag, so a browser never pairs a cached
   module with a newer one. Changing any module means replacing the tag everywhere at once
   (see "Run it" in the README). */

import { DATA_URL } from './config.js?v=20261118';
import { loadData } from './data.js?v=20261118';
import { createStore } from './store.js?v=20261118';
import { createActions } from './actions.js?v=20261118';
import { initModal, initTheme, isModalOpen, showLoadError } from './ui.js?v=20261118';
import { initialStateFromHash, bindPermalink } from './permalink.js?v=20261118';
import { createMetricBar } from './components/metricBar.js?v=20261118';
import { createViewToggle } from './components/viewToggle.js?v=20261118';
import { createTooltip } from './components/tooltip.js?v=20261118';
import { createMap } from './components/map.js?v=20261118';
import { createTimeline } from './components/timeline.js?v=20261118';
import { createChapters } from './components/chapters.js?v=20261118';
import { createPanel } from './components/panel.js?v=20261118';

async function boot() {
  initTheme();                    // before the data loads, so the switch always works
  initModal();                    // …and so does the about panel
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

  bindPermalink(store, data, actions);
  initKeyboard(actions);

  window.__app = { data, store, actions };   // console / debugging handle
}

function initKeyboard(actions) {
  let tabbed = false;             // focus was last moved with Tab, not by a pointer press
  let spaceTaken = false;         // the Space keydown being handled here, until its keyup

  window.addEventListener('pointerdown', () => { tabbed = false; }, true);
  window.addEventListener('keydown', e => {
    if (e.key === 'Tab') tabbed = true;
    const el = e.target instanceof Element ? e.target : document.body;
    /* Alt+← is the browser's Back, Ctrl/⌘+arrows belong to the system: leave them alone */
    if (e.altKey || e.ctrlKey || e.metaKey || isModalOpen()) return;
    if (el.closest('input, textarea, select, [contenteditable]')) return;

    if (e.key === 'ArrowRight') { actions.step(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { actions.step(-1); e.preventDefault(); }
    else if (e.key === 'Escape') actions.select(null);
    else if (e.key === ' ') {
      /* Space presses a button that Tab brought the focus to, as it does everywhere else.
         On one that merely kept focus after a click, or on no button at all, it plays or
         pauses. (:focus-visible cannot tell the two apart here: once a key goes down,
         Chrome matches it on whatever has focus.) */
      spaceTaken = !(tabbed && el.closest('button'));
      if (!spaceTaken) return;
      if (!e.repeat) actions.togglePlay();
      e.preventDefault();
    }
  });

  /* Older Firefox presses a focused button when Space is released, even after the keydown was
     cancelled (160 no longer does), so the release of a Space handled above is cancelled too */
  window.addEventListener('keyup', e => {
    if (e.key !== ' ' || !spaceTaken) return;
    spaceTaken = false;
    e.preventDefault();
  });
}

boot();
