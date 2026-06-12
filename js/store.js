/* Minimal observable store. One state object, shallow-diffed patches,
   subscribers receive (state, changedKeys) — components re-render only
   what they own. All mutations go through actions.js. */

export function createStore(initial) {
  const state = { ...initial };
  const subscribers = [];

  return {
    get: () => state,

    set(patch) {
      const changed = new Set(Object.keys(patch).filter(k => state[k] !== patch[k]));
      if (!changed.size) return;
      Object.assign(state, patch);
      for (const fn of subscribers) fn(state, changed);
    },

    subscribe(fn) { subscribers.push(fn); },
  };
}
