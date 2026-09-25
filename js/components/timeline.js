/* The time scrubber — drawn as a chart of the national trend for the
   selected metric (plus the selected state's line), so the shape of the
   series itself invites exploration. Owns the play button, period label,
   and caption. */

import { fin, fmtMonth, metricById } from '../config.js';

const H = 116;
const M = { t: 8, r: 12, b: 20, l: 12 };

export function createTimeline(data, store, actions) {
  const svg = d3.select('#timeline');
  const periodLabel = d3.select('#periodLabel');
  const caption = d3.select('#caption');
  let x, y, cursor, natDot;            // chart internals, rebuilt by build()

  d3.select('#playBtn').on('click', actions.togglePlay);

  store.subscribe((s, changed) => {
    if (changed.has('metricId') || changed.has('selected')) build(s);
    else if (changed.has('idx')) updateCursor(s);
    if (changed.has('playing')) renderPlayIcon(s);
    if (changed.has('idx') || changed.has('metricId') ||
        changed.has('selected') || changed.has('chapterId')) renderCaption(s);
  });

  build(store.get());
  renderCaption(store.get());
  renderPlayIcon(store.get());

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => build(store.get()), 150);
  });

  /* ── chart ─────────────────────────────────────────────────────── */
  function build(s) {
    const W = Math.max(420, document.querySelector('.tl-main').clientWidth);
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'none');
    svg.selectAll('*').remove();

    const m = metricById(s.metricId);
    const series = arr => data.periods.map((d, i) => ({ d, v: arr[i], i }));
    const nat = series(data.national[m.col]);
    const sel = s.selected ? series(data.byState.get(s.selected).vals[m.col]) : null;

    x = d3.scaleTime().domain(d3.extent(data.periods)).range([M.l, W - M.r]);
    const values = nat.concat(sel ?? []).map(p => p.v).filter(fin);
    let [lo, hi] = d3.extent(values);
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.12;
    y = d3.scaleLinear().domain([lo - pad, hi + pad]).range([H - M.b, M.t]);

    /* year gridlines + labels */
    const years = d3.timeYear.range(d3.timeYear.ceil(data.periods[0]), data.periods[data.N - 1]);
    svg.selectAll('line.yr').data(years).join('line').attr('class', 'yr')
      .attr('x1', d => x(d)).attr('x2', d => x(d))
      .attr('y1', M.t).attr('y2', H - M.b)
      .attr('stroke', 'rgba(255,255,255,0.06)');
    svg.selectAll('text.yr').data([data.periods[0], ...years]).join('text').attr('class', 'yr')
      .attr('x', d => x(d) + 4).attr('y', H - 7)
      .attr('fill', '#5b6377').attr('font-size', 10)
      .text(d3.timeFormat('’%y'));

    /* reference line: 0 for deltas, 1 for the worker ratio */
    if (m.kind === 'div' && m.center >= y.domain()[0] && m.center <= y.domain()[1])
      svg.append('line')
        .attr('x1', M.l).attr('x2', W - M.r)
        .attr('y1', y(m.center)).attr('y2', y(m.center))
        .attr('stroke', 'rgba(255,255,255,0.18)').attr('stroke-dasharray', '3 4');

    const line = d3.line().defined(p => fin(p.v)).x(p => x(p.d)).y(p => y(p.v));
    const area = d3.area().defined(p => fin(p.v)).x(p => x(p.d)).y0(H - M.b).y1(p => y(p.v));

    svg.append('path').datum(nat).attr('d', area).attr('fill', 'rgba(251,191,36,0.09)');
    svg.append('path').datum(nat).attr('d', line)
      .attr('fill', 'none').attr('stroke', '#fbbf24').attr('stroke-width', 1.8);

    if (sel) {
      svg.append('path').datum(sel).attr('d', line)
        .attr('fill', 'none').attr('stroke', '#67e8f9').attr('stroke-width', 1.6);
      const lg = svg.append('g').attr('font-size', 10)
        .attr('transform', `translate(${M.l + 6},${M.t + 4})`);
      lg.append('rect').attr('x', -4).attr('y', -8).attr('width', 150).attr('height', 28)
        .attr('rx', 5).attr('fill', 'rgba(11,14,20,0.6)');
      lg.append('line').attr('x2', 14).attr('stroke', '#fbbf24').attr('stroke-width', 2);
      lg.append('text').attr('x', 18).attr('y', 3).attr('fill', '#8b93a7').text('United States');
      lg.append('line').attr('x2', 14).attr('y1', 13).attr('y2', 13).attr('stroke', '#67e8f9').attr('stroke-width', 2);
      lg.append('text').attr('x', 18).attr('y', 16).attr('fill', '#8b93a7').text(s.selected);
    }

    /* chapter markers on the axis */
    svg.selectAll('circle.ch').data(data.chapters).join('circle').attr('class', 'ch')
      .attr('cx', c => x(data.periods[c.idx])).attr('cy', H - M.b + 6).attr('r', 3)
      .attr('fill', '#fbbf24').attr('opacity', 0.7).style('cursor', 'pointer')
      .on('click', (e, c) => actions.gotoChapter(c))
      .append('title').text(c => c.title);

    /* cursor */
    cursor = svg.append('g').style('pointer-events', 'none');
    cursor.append('line').attr('y1', M.t).attr('y2', H - M.b)
      .attr('stroke', '#fff').attr('stroke-width', 1.2).attr('opacity', 0.85);
    natDot = cursor.append('circle').attr('r', 4).attr('fill', '#fbbf24')
      .attr('stroke', '#0b0e14').attr('stroke-width', 1.5);

    /* scrub anywhere on the chart */
    svg.on('pointerdown', ev => { svg.node().setPointerCapture(ev.pointerId); scrub(ev); })
       .on('pointermove', ev => { if (ev.buttons & 1) scrub(ev); })
       .on('pointerup', ev => svg.node().releasePointerCapture(ev.pointerId));

    updateCursor(s);
  }

  function scrub(ev) {
    actions.pause();
    const [px] = d3.pointer(ev, svg.node());
    const t = x.invert(px);
    let best = 0, bestDist = Infinity;
    data.periods.forEach((d, i) => {
      const dist = Math.abs(d - t);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    actions.seek(best);
  }

  function updateCursor(s) {
    if (!cursor) return;
    cursor.attr('transform', `translate(${x(data.periods[s.idx])},0)`);
    const v = data.national[metricById(s.metricId).col][s.idx];
    natDot.attr('cy', fin(v) ? y(v) : H - M.b).attr('opacity', fin(v) ? 1 : 0.25);
  }

  /* ── labels ───────────────────────────────────────────────────── */
  function renderCaption(s) {
    periodLabel.text(fmtMonth(data.periods[s.idx]));

    const chapter = s.chapterId && data.chapters.find(c => c.id === s.chapterId);
    if (chapter) {
      caption.classed('chapter', true).text(chapter.blurb);
      return;
    }
    caption.classed('chapter', false);

    const m = metricById(s.metricId);
    const missing = data.missingNote(m, s.idx);
    if (missing) {
      caption.text(missing);
      return;
    }
    const nat = m.fmt(data.national[m.col][s.idx]);
    caption.text(s.selected
      ? `${s.selected}: ${m.fmt(data.byState.get(s.selected).vals[m.col][s.idx])} · United States: ${nat}`
      : `United States · ${m.label}: ${nat}`);
  }

  function renderPlayIcon(s) {
    d3.select('#playIcon').attr('d', s.playing
      ? 'M7 5h4v14H7zM13 5h4v14h-4z'    // pause
      : 'M8 5v14l11-7z');               // play
  }
}
