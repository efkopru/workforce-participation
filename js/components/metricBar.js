/* Metric selector pills. */

import { METRICS } from '../config.js';

export function createMetricBar(store, actions) {
  const buttons = d3.select('#metricBar').selectAll('button')
    .data(METRICS).join('button')
    .text(m => m.label)
    .on('click', (e, m) => actions.setMetric(m.id));

  const render = s => buttons.classed('active', m => m.id === s.metricId);

  store.subscribe((s, changed) => { if (changed.has('metricId')) render(s); });
  render(store.get());
}
