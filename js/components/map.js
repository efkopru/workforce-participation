/* The choropleth: a tile-grid layer (built instantly from data) and a
   geographic layer (TopoJSON fetched async), crossfaded by view state.
   Owns the legend and the contextual map note. */

import { MISSING, fin, dur, textOn, metricById, fmtMonth } from '../config.js?v=20261118';
import { NO_DATA_ID } from '../data.js?v=20261118';

const TOPO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-albers-10m.json';
/* ^ the -albers variant is pre-projected to the 975×610 viewBox */

const CELL = 70, GAP = 6;
const GRID_X = (975 - 12 * (CELL + GAP)) / 2 + GAP / 2;
const GRID_Y = 8;

export function createMap(data, store, actions, tooltip) {
  const svg = d3.select('#map');
  defineNoDataPattern();
  const gGeo = svg.append('g').attr('class', 'g-geo');
  const gGrid = svg.append('g').attr('class', 'g-grid');
  const legend = d3.select('#legend');
  const note = d3.select('#mapNote');
  const shapes = new Map();             // state name → its path data, once the shapes load
  let hoverOutline, selectedOutline;    // drawn above every shape (see loadGeo)

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

  /* 45° hatch for missing months, distinct from every value color */
  function defineNoDataPattern() {
    const p = svg.append('defs').append('pattern').attr('id', NO_DATA_ID)
      .attr('width', 6).attr('height', 6).attr('patternUnits', 'userSpaceOnUse')
      .attr('patternTransform', 'rotate(45)');
    p.append('rect').attr('width', 6).attr('height', 6).attr('fill', MISSING);
    p.append('line').attr('y2', 6).attr('stroke', '#9aa6b2').attr('stroke-width', 1.5);
  }

  /* ── tile grid layer ──────────────────────────────────────────── */
  function buildGrid() {
    const cells = gGrid.selectAll('g.cell')
      .data([...data.byState.values()], d => d.name).join('g')
      .attr('class', 'cell')
      .attr('transform', d => `translate(${GRID_X + d.gc * (CELL + GAP)},${GRID_Y + d.gr * (CELL + GAP)})`)
      .on('pointermove', (e, d) => tooltip.show(e, d.name))
      .on('pointerleave', tooltip.hide)
      .on('click', (e, d) => actions.select(d.name));
    cells.append('rect').attr('width', CELL).attr('height', CELL).attr('rx', 8).attr('fill', `url(#${NO_DATA_ID})`);
    cells.append('text').attr('class', 'abbr').attr('x', CELL / 2).attr('y', CELL / 2 - 3)
      .attr('text-anchor', 'middle').text(d => d.abbr);
    cells.append('text').attr('class', 'val').attr('x', CELL / 2).attr('y', CELL / 2 + 18)
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
      for (const f of features) shapes.set(f.properties.name, path(f));

      gGeo.selectAll('path.state').data(features, f => f.properties.name).join('path')
        .attr('class', 'state')
        .attr('d', f => shapes.get(f.properties.name))
        .attr('fill', `url(#${NO_DATA_ID})`)
        .on('pointerenter', (e, f) => hoverOutline.attr('d', shapes.get(f.properties.name)))
        .on('pointermove', (e, f) => tooltip.show(e, f.properties.name))
        .on('pointerleave', () => { tooltip.hide(); hoverOutline.attr('d', null); })
        .on('click', (e, f) => actions.select(f.properties.name));
      gGeo.append('path')
        .attr('d', path(topojson.mesh(topo, topo.objects.states, (a, b) => a !== b)))
        .attr('fill', 'none').attr('stroke', 'rgba(255,255,255,0.9)')
        .attr('stroke-width', 0.6).style('pointer-events', 'none');
      /* The selected and the hovered state are outlined by two paths above every shape and
         the border mesh. A stroke on the state itself is half covered by whichever
         neighbours are drawn after it. */
      selectedOutline = gGeo.append('path').attr('class', 'state-outline selected');
      hoverOutline = gGeo.append('path').attr('class', 'state-outline');

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
    /* An immediate change (a new month) also ends a metric fade that is still running: left
       alone, the fade would finish on the colours of the month it started from and overwrite
       this one. */
    const tween = sel => ms > 0 ? sel.transition('fill').duration(ms) : sel.interrupt('fill');

    tween(gGeo.selectAll('path.state'))
      .attr('fill', f => data.fillFor(m, data.byState.get(f.properties.name).vals[m.col][i]));
    if (selectedOutline) selectedOutline.attr('d', shapes.get(s.selected) ?? null);

    const cells = gGrid.selectAll('g.cell')
      .classed('selected', d => d.name === s.selected);
    tween(cells.select('rect'))
      .attr('fill', d => data.fillFor(m, d.vals[m.col][i]));
    cells.select('text.abbr')
      .attr('fill', d => textOn(data.fillFor(m, d.vals[m.col][i])));
    cells.select('text.val')
      .attr('fill', d => textOn(data.fillFor(m, d.vals[m.col][i])))
      .text(d => fin(d.vals[m.col][i]) ? m.cell(d.vals[m.col][i]) : '·');

    svg.attr('aria-label', `Map of U.S. states shaded by ${m.label}, ${fmtMonth(data.periods[i])}`);
    renderNote(s, m, i);
  }

  function renderNote(s, m, i) {
    const text = data.missingNote(m, i) || data.estimateNote(m, i);
    note.attr('hidden', text ? null : '').text(text);
  }

  function renderLegend(s) {
    const m = metricById(s.metricId);
    const domain = data.domainOf(m), ramp = data.scaleOf(m).interpolator();
    /* The bar shows the ramp itself, so its left edge, middle and right edge are the three
       domain values labelled below it. A diverging scale gives each side of its centre half
       the ramp even when the two sides span unequal ranges; sampling the bar evenly by value
       instead would leave the centre label under a colour that is not the centre's. */
    const stops = d3.range(23).map(k => ramp(k / 22));
    /* the scale is clamped, so its two ends also stand for every value beyond them */
    const [lo, hi] = [`≤ ${m.fmt(domain[0])}`, `≥ ${m.fmt(domain[domain.length - 1])}`];
    legend.html(`
      <div class="lg-title">${m.label}</div>
      <div class="lg-bar" style="background:linear-gradient(to right,${stops.join(',')})"></div>
      <div class="lg-labels"><span>${lo}</span><span>${m.kind === 'div' ? m.fmt(domain[1]) : ''}</span><span>${hi}</span></div>
      <div class="lg-nodata"><i></i>No data</div>
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
