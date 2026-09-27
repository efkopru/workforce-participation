/* Story-chapter buttons (dates are derived from the data, see data.js). */

import { fmtMonYr } from '../config.js';
import { keepActiveInView } from '../ui.js?v=20260927-theme';

export function createChapters(data, store, actions) {
  const row = d3.select('#chapters');
  const buttons = row.selectAll('button')
    .data(data.chapters).join('button')
    .html(c => `${c.title} <span style="opacity:.55">· ${fmtMonYr(data.periods[c.idx])}</span>`)
    .on('click', (e, c) => actions.gotoChapter(c));

  const render = s => {
    buttons.classed('active', c => c.id === s.chapterId)
      .attr('aria-pressed', c => c.id === s.chapterId);
    keepActiveInView(row.node());
  };

  store.subscribe((s, changed) => { if (changed.has('chapterId')) render(s); });
  render(store.get());
}
