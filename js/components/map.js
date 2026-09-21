/* The choropleth: a tile-grid layer (built instantly from data) and a
   geographic layer (TopoJSON fetched async), crossfaded by view state.
   Owns the legend and the contextual map note. */

import { MISSING, fin, dur, textOn, metricById } from '../config.js';

const TOPO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-albers-10m.json';
/* ^ the -albers variant is pre-projected to the 975×610 viewBox */

const CELL = 70, GAP = 6;
const GRID_X = (975 - 12 * (CELL + GAP)) / 2 + GAP / 2;
const GRID_Y = 8;

export function createMap(data, store, actions, tooltip) {
  const svg = d3.select('#map');
  const gGeo = svg.append('g').attr('class', 'g-geo');
  const gGrid = svg.append('g').attr('class', 'g-grid');
  const legend = d3.select('#legend');
  const note = d3.select('#mapNote');

  buildGrid();
  loadGeo();

  /* ── reactive wiring ──────────────────────────────────────────── */
  store.subscribe((s, changed) => {
    if (changed.has('metricId')) renderLegend(s);
    if (changed.has('metricId') || changed.has('idx') || changed.has('selected'))
      renderFills(s, changed.has('metricId') ? dur(420) : s.playing ? dur(200) : 0);
    if (changed.has('view') || changed.has('geoReady')) applyView(s, false);
  });
  renderLegend(store.get());
  renderFills(store.get(), 0);
  applyView(store.get(), true);          // grid first; crossfade when shapes load

  /* ── tile grid layer ──────────────────────────────────────────── */
  function buildGrid() {
    const cells = gGrid.selectAll('g.cell')
      .data([...data.byState.values()], d => d.name).join('g')
      .attr('class', 'cell')
      .attr('transform', d => `translate(${GRID_X + d.gc * (CELL + GAP)},${GRID_Y + d.gr * (CELL + GAP)})`)
      .on('pointermove', (e, d) => tooltip.show(e, d.name))
      .on('pointerleave', tooltip.hide)
      .on('click', (e, d) => actions.select(d.name));
    cells.append('rect').attr('width', CELL).attr('height', CELL).attr('rx', 8).attr('fill', MISSING);
    cells.append('text').attr('class', 'abbr').attr('x', CELL / 2).attr('y', CELL / 2 - 2)
      .attr('text-anchor', 'middle').text(d => d.abbr);
    cells.append('text').attr('class', 'val').attr('x', CELL / 2).attr('y', CELL / 2 + 16)
      .attr('text-anchor', 'middle');
  }

  /* ── geographic layer ─────────────────────────────────────────── */
  async function loadGeo() {
    const loading = d3.select('#mapWrap').append('div')
      .attr('id', 'loadingGeo').text('loading map shapes…');
    try {
      const topo = await fetch(TOPO_URL).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
      const features = topojson.feature(topo, topo.objects.states).features
        .filter(f => data.byState.has(f.properties.name));
      const path = d3.geoPath();        // pre-projected → identity

      gGeo.selectAll('path.state').data(features, f => f.properties.name).join('path')
        .attr('class', 'state')
        .attr('d', path)
        .attr('fill', MISSING)
        .on('pointermove', (e, f) => tooltip.show(e, f.properties.name))
        .on('pointerleave', tooltip.hide)
        .on('click', (e, f) => actions.select(f.properties.name));
      gGeo.append('path')
        .attr('d', path(topojson.mesh(topo, topo.objects.states, (a, b) => a !== b)))
        .attr('fill', 'none').attr('stroke', 'rgba(255,255,255,0.09)')
        .attr('stroke-width', 0.6).style('pointer-events', 'none');

      renderFills(store.get(), 0);
      actions.geoLoaded();              // → store → applyView crossfade
    } catch {
      actions.geoFailed();
    } finally {
      loading.remove();
    }
  }

  /* ── painting ─────────────────────────────────────────────────── */
  function renderFills(s, ms) {
    const m = metricById(s.metricId), i = s.idx;
    const tween = sel => ms > 0 ? sel.transition('fill').duration(ms) : sel;

    tween(gGeo.selectAll('path.state')
        .classed('selected', f => f.properties.name === s.selected))
      .attr('fill', f => data.fillFor(m, data.byState.get(f.properties.name).vals[m.col][i]));

    const cells = gGrid.selectAll('g.cell')
      .classed('selected', d => d.name === s.selected);
    tween(cells.select('rect'))
      .attr('fill', d => data.fillFor(m, d.vals[m.col][i]));
    cells.select('text.abbr')
      .attr('fill', d => textOn(data.fillFor(m, d.vals[m.col][i])));
    cells.select('text.val')
      .attr('fill', d => textOn(data.fillFor(m, d.vals[m.col][i])))
      .text(d => fin(d.vals[m.col][i]) ? m.cell(d.vals[m.col][i]) : '·');

    renderNote(s, m, i);
  }

  function renderNote(s, m, i) {
    const gapMonth = !fin(data.national.lfpr[i]);
    const preDelta = m.kind === 'div' && m.center === 0 && i <= data.baseIdx;
    note.attr('hidden', gapMonth || preDelta ? null : '')
      .text(gapMonth ? 'Observations for this month are missing from the supplied snapshot.'
          : preDelta ? 'Baseline months — deltas begin Mar 2020' : '');
  }

  function renderLegend(s) {
    const m = metricById(s.metricId);
    const domain = data.domainOf(m), scale = data.scaleOf(m);
    const [a, b] = [domain[0], domain[domain.length - 1]];
    const stops = d3.range(0, 1.001, 1 / 22).map(t => scale(a + t * (b - a)));
    const labels = m.kind === 'div'
      ? [m.fmt(domain[0]), m.fmt(domain[1]), m.fmt(domain[2])]
      : [m.fmt(domain[0]), '', m.fmt(domain[1])];
    legend.html(`
      <div class="lg-title">${m.label}</div>
      <div style="width:230px;height:10px;border-radius:5px;background:linear-gradient(to right,${stops.join(',')})"></div>
      <div class="lg-labels"><span>${labels[0]}</span><span>${labels[1]}</span><span>${labels[2]}</span></div>
      ${m.note ? `<div class="lg-note">${m.note}</div>` : ''}`);
  }

  /* crossfade between layers; instant on boot / reduced motion */
  function applyView(s, instant) {
    const geo = s.view === 'geo' && s.geoReady;
    const t = sel => instant || !dur(1) ? sel : sel.transition().duration(300);
    t(gGeo.style('pointer-events', geo ? 'all' : 'none')).style('opacity', geo ? 1 : 0);
    t(gGrid.style('pointer-events', geo ? 'none' : 'all')).style('opacity', geo ? 0 : 1);
  }
}
