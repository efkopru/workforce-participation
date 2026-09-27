/* Metric selector pills. */

import { METRICS } from '../config.js';
import { keepActiveInView } from '../ui.js?v=20260927-theme';

export function createMetricBar(store, actions) {
  const bar = d3.select('#metricBar');
  const buttons = bar.selectAll('button')
    .data(METRICS).join('button')
    .text(m => m.label)
    .on('click', (e, m) => actions.setMetric(m.id));

  const render = s => {
    buttons.classed('active', m => m.id === s.metricId)
      .attr('aria-pressed', m => m.id === s.metricId);
    keepActiveInView(bar.node());
  };

  store.subscribe((s, changed) => { if (changed.has('metricId')) render(s); });
  render(store.get());
}
