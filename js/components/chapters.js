/* Story-chapter buttons (dates are derived from the data, see data.js). */

import { fmtMonYr } from '../config.js';

export function createChapters(data, store, actions) {
  const buttons = d3.select('#chapters').selectAll('button')
    .data(data.chapters).join('button')
    .html(c => `${c.title} <span style="opacity:.55">· ${fmtMonYr(data.periods[c.idx])}</span>`)
    .on('click', (e, c) => actions.gotoChapter(c));

  const render = s => buttons.classed('active', c => c.id === s.chapterId);

  store.subscribe((s, changed) => { if (changed.has('chapterId')) render(s); });
  render(store.get());
}
