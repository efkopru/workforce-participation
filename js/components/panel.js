/* Right-hand panel. Two modes:
   - national: US stat cards + highest/lowest states for the current metric
   - state:    rank chip, stat cards, sparklines vs the national average
   The DOM skeleton is rebuilt only when the selection changes; everything
   else (numbers, bars, cursors) updates in place. */

import { FMT, fin, metricById } from '../config.js';

/* sparkline catalogue (state mode) */
const SPARKS = [
  { col: 'lfpr', label: 'Participation rate', fmt: FMT.pct1 },
  { col: 'ur', label: 'Unemployment rate', fmt: FMT.pct1 },
  { col: 'openRate', label: 'Job openings rate', fmt: FMT.pct1 },
  { col: 'quitR', label: 'Quit & hire rate', fmt: FMT.pct1, extra: 'hireR' },
  { col: 'awr', label: 'Unemployed per opening', fmt: FMT.r2, ref: 1 },
];
const SW = 320, SH = 56, SM = { t: 4, b: 4, l: 2, r: 2 };

export function createPanel(data, store, actions) {
  const panel = d3.select('#panel');
  let sparks = [];                      // live refs for cursor updates

  store.subscribe((s, changed) => {
    if (changed.has('selected')) build(s);
    if (changed.has('selected') || changed.has('idx') || changed.has('metricId')) update(s);
  });

  /* ── skeletons ────────────────────────────────────────────────── */
  const statCard = (id, label) => `
    <div class="stat"><div class="s-label">${label}</div>
      <div class="s-value" id="sv-${id}">—</div><div class="s-delta" id="sd-${id}"></div></div>`;
  const statGrid = `
    <div class="stat-grid">
      ${statCard('lfpr', 'Participation')}${statCard('ur', 'Unemployment')}
      ${statCard('open', 'Job openings')}${statCard('awr', 'Unemp / opening')}
    </div>`;

  function build(s) {
    sparks = [];
    if (!s.selected) {
      panel.html(`
        <h2>United States</h2>
        <div class="panel-sub">national aggregate of 50 states + DC · click any state to zoom in</div>
        ${statGrid}
        <div class="rk-section">
          <div class="rk-title" id="rk-hi-title"></div><div id="rk-hi"></div>
          <div class="rk-title" id="rk-lo-title"></div><div id="rk-lo"></div>
        </div>`);
      return;
    }

    const st = data.byState.get(s.selected);
    panel.html(`
      <h2>${st.name}<button class="close-x" id="closeSel" title="Back to national view">✕</button></h2>
      <div class="panel-sub">vs the national picture · click charts to scrub time</div>
      <div class="rank-chip" id="rankChip"></div>
      ${statGrid}
      <div class="spark-legend"><i style="background:#67e8f9"></i>${st.abbr}<i style="background:#8b93a7"></i>US</div>
      <div id="sparks"></div>`);
    d3.select('#closeSel').on('click', () => actions.select(null));
    buildSparks(st);
  }

  function buildSparks(st) {
    const wrap = d3.select('#sparks');
    for (const spec of SPARKS) {
      const block = wrap.append('div').attr('class', 'spark-block');
      const head = block.append('div').attr('class', 'spark-head');
      head.append('span').text(spec.label);
      const valEl = head.append('span').attr('class', 'sv');
      const svg = block.append('svg')
        .attr('viewBox', `0 0 ${SW} ${SH}`).attr('preserveAspectRatio', 'none');

      const stV = st.vals[spec.col], natV = data.national[spec.col];
      const extraV = spec.extra ? st.vals[spec.extra] : null;

      const all = [];
      for (let i = 0; i < data.N; i++)
        for (const arr of [stV, natV, extraV]) if (arr && fin(arr[i])) all.push(arr[i]);
      let [lo, hi] = d3.extent(all);
      if (lo === hi) { lo -= 1; hi += 1; }
      if (spec.ref != null) { lo = Math.min(lo, spec.ref); hi = Math.max(hi, spec.ref); }
      const pad = (hi - lo) * 0.1;

      const x = d3.scaleLinear().domain([0, data.N - 1]).range([SM.l, SW - SM.r]);
      const y = d3.scaleLinear().domain([lo - pad, hi + pad]).range([SH - SM.b, SM.t]);
      const mkLine = arr => d3.line()
        .defined(i => fin(arr[i])).x(i => x(i)).y(i => y(arr[i]))(d3.range(data.N));

      if (spec.ref != null) svg.append('line')
        .attr('x1', SM.l).attr('x2', SW - SM.r).attr('y1', y(spec.ref)).attr('y2', y(spec.ref))
        .attr('stroke', 'rgba(255,255,255,0.18)').attr('stroke-dasharray', '2 4');
      svg.append('path').attr('d', mkLine(natV)).attr('fill', 'none')
        .attr('stroke', '#8b93a7').attr('stroke-width', 1)
        .attr('stroke-dasharray', '2 3').attr('opacity', 0.8);
      if (extraV) svg.append('path').attr('d', mkLine(extraV)).attr('fill', 'none')
        .attr('stroke', '#4ade80').attr('stroke-width', 1.1).attr('opacity', 0.75);
      svg.append('path').attr('d', mkLine(stV)).attr('fill', 'none')
        .attr('stroke', '#67e8f9').attr('stroke-width', 1.6);
      if (fin(stV[data.baseIdx])) svg.append('circle')          // Feb 2020 marker
        .attr('cx', x(data.baseIdx)).attr('cy', y(stV[data.baseIdx]))
        .attr('r', 2).attr('fill', '#fbbf24');

      const cur = svg.append('line').attr('y1', SM.t).attr('y2', SH - SM.b)
        .attr('stroke', '#fff').attr('opacity', 0.5);
      const dot = svg.append('circle').attr('r', 2.6).attr('fill', '#67e8f9')
        .attr('stroke', '#0b0e14').attr('stroke-width', 1);

      const seekHere = ev => {
        actions.pause();
        const [px] = d3.pointer(ev, svg.node());
        actions.seek(Math.round(x.invert(px)));
      };
      svg.on('pointerdown', ev => { svg.node().setPointerCapture(ev.pointerId); seekHere(ev); })
         .on('pointermove', ev => { if (ev.buttons & 1) seekHere(ev); });

      sparks.push({ spec, x, y, cur, dot, valEl, stV, extraV });
    }
  }

  /* ── in-place updates ─────────────────────────────────────────── */
  function update(s) {
    const i = s.idx;
    const src = s.selected ? data.byState.get(s.selected).vals : data.national;

    setStat('lfpr', FMT.pct1(src.lfpr[i]), delta(src.lfpr, i, FMT.pp, false));
    setStat('ur', FMT.pct1(src.ur[i]), delta(src.ur, i, FMT.pp, true));
    setStat('open', FMT.k(src.open[i]),
      fin(src.openD[i]) ? [FMT.pctS(src.openD[i]) + ' vs Feb ’20', src.openD[i] >= 0 ? 'up' : 'down'] : ['', '']);
    setStat('awr', FMT.r2(src.awr[i]),
      fin(src.awr[data.baseIdx]) ? [`Feb ’20: ${FMT.r2(src.awr[data.baseIdx])}`, ''] : ['', '']);

    if (s.selected) { updateRankChip(s); updateSparkCursors(i); }
    else renderRankLists(s);
  }

  function delta(arr, i, fmt, invert) {
    const cur = arr[i], base = arr[data.baseIdx];
    if (!fin(cur) || !fin(base)) return ['', ''];
    const d = cur - base;
    const cls = d > 1e-4 ? (invert ? 'down' : 'up') : d < -1e-4 ? (invert ? 'up' : 'down') : '';
    return [fmt(d) + ' vs Feb ’20', cls];
  }

  function setStat(id, value, [deltaTxt, cls]) {
    const v = document.getElementById('sv-' + id);
    const d = document.getElementById('sd-' + id);
    if (!v) return;
    v.textContent = value;
    d.textContent = deltaTxt;
    d.className = 's-delta ' + cls;
  }

  function ranked(m, i) {
    return [...data.byState.values()]
      .map(st => ({ name: st.name, v: st.vals[m.col][i] }))
      .filter(d => fin(d.v))
      .sort((a, b) => b.v - a.v);
  }

  function updateRankChip(s) {
    const m = metricById(s.metricId);
    const list = ranked(m, s.idx);
    const r = list.findIndex(d => d.name === s.selected);
    document.getElementById('rankChip').textContent =
      r >= 0 ? `#${r + 1} of ${list.length} · ${m.label} · ${m.fmt(list[r].v)}` : 'no data this month';
  }

  function updateSparkCursors(i) {
    for (const sp of sparks) {
      sp.cur.attr('x1', sp.x(i)).attr('x2', sp.x(i));
      const v = sp.stV[i];
      sp.dot.attr('cx', sp.x(i)).attr('cy', fin(v) ? sp.y(v) : sp.y.range()[0])
        .attr('opacity', fin(v) ? 1 : 0);
      sp.valEl.text(sp.extraV ? `${sp.spec.fmt(v)} / ${sp.spec.fmt(sp.extraV[i])}` : sp.spec.fmt(v));
    }
  }

  function renderRankLists(s) {
    const m = metricById(s.metricId);
    const list = ranked(m, s.idx);
    d3.select('#rk-hi-title').text(`Highest · ${m.label}`);
    d3.select('#rk-lo-title').text(`Lowest · ${m.label}`);

    const ext = list.length ? [list[list.length - 1].v, list[0].v] : [0, 1];
    const w = d3.scaleLinear().domain([Math.min(...ext), Math.max(...ext)]).range([8, 100]);
    const row = d => `
      <div class="rk-row" data-state="${d.name}">
        <span class="rk-name">${d.name}</span>
        <span class="rk-bar-wrap"><span class="rk-bar" style="width:${w(d.v)}%;background:${data.fillFor(m, d.v)}"></span></span>
        <span class="rk-val">${m.fmt(d.v)}</span>
      </div>`;
    const empty = '<div class="rk-empty">No data this month.</div>';
    d3.select('#rk-hi').html(list.length ? list.slice(0, 5).map(row).join('') : empty);
    d3.select('#rk-lo').html(list.length ? list.slice(-5).reverse().map(row).join('') : empty);
    panel.selectAll('.rk-row').on('click', function () { actions.select(this.dataset.state); });
  }

  /* initial paint (after all const templates above are initialized) */
  build(store.get());
  update(store.get());
}
