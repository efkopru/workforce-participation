/* Hover tooltip for map states / grid tiles. */

import { FMT, fin, fmtMonth, metricById } from '../config.js';

export function createTooltip(data, store) {
  const el = d3.select('#tooltip');

  function show(event, name) {
    const { idx, metricId } = store.get();
    const m = metricById(metricId);
    const v = data.byState.get(name).vals;
    const row = (label, val) =>
      `<div class="tt-row"><span>${label}</span><span class="v">${val}</span></div>`;

    el.attr('hidden', null).html(`
      <div class="tt-state">${name}</div>
      <div class="tt-date">${fmtMonth(data.periods[idx])}${fin(v.lfpr[idx]) ? '' : ' · labor-force data not published'}</div>
      <div class="tt-metric"><span>${m.label}</span><span class="v">${m.fmt(v[m.col][idx])}</span></div>
      ${row('Participation', FMT.pct1(v.lfpr[idx]))}
      ${row('Unemployment', FMT.pct1(v.ur[idx]))}
      ${row('Job openings', FMT.k(v.open[idx]))}
      ${row('Unemployed / opening', FMT.r2(v.awr[idx]))}
      ${row('Quit rate', FMT.pct1(v.quitR[idx]))}
      ${row('Hire rate', FMT.pct1(v.hireR[idx]))}`);

    const node = el.node();
    let x = event.clientX + 16, y = event.clientY + 14;
    if (x + node.offsetWidth > innerWidth - 8) x = event.clientX - node.offsetWidth - 14;
    if (y + node.offsetHeight > innerHeight - 8) y = event.clientY - node.offsetHeight - 12;
    node.style.left = x + 'px';
    node.style.top = y + 'px';
  }

  return { show, hide: () => el.attr('hidden', '') };
}
