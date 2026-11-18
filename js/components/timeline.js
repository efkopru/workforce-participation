/* The time scrubber — drawn as a chart of the national trend for the
   selected metric (plus the selected state's line), so the shape of the
   series itself invites exploration. Owns the play button, period label,
   and caption. */

import { fin, fmtMonth, fmtMonYr, metricById } from '../config.js?v=20261117';

const H = 68;
const M = { t: 8, r: 12, b: 20, l: 12 };

export function createTimeline(data, store, actions) {
  const svg = d3.select('#timeline');
  const playBtn = d3.select('#playBtn');
  const periodLabel = d3.select('#periodLabel');
  const caption = d3.select('#caption');
  const legend = d3.select('#tlLegend');
  let x, y, cursor, natDot;            // chart internals, rebuilt by build()
  let pressed = null;                  // chapter marker under a press that has not become a drag

  playBtn.on('click', actions.togglePlay);

  store.subscribe((s, changed) => {
    if (changed.has('metricId') || changed.has('selected')) build(s);
    else if (changed.has('idx')) updateCursor(s);
    if (changed.has('playing')) renderPlayIcon(s);
    if (changed.has('idx') || changed.has('metricId') ||
        changed.has('selected') || changed.has('chapterId')) renderCaption(s);
  });

  /* Scrub anywhere on the chart. The press captures the pointer, so a chapter marker never
     receives a click of its own: a press on one opens its chapter on release instead, unless
     the pointer has moved off into a drag by then. */
  svg.attr('aria-valuemin', 0).attr('aria-valuemax', data.N - 1)
    .on('pointerdown', ev => {
      svg.node().setPointerCapture(ev.pointerId);
      const marker = ev.target.closest('.ch');
      pressed = marker ? { chapter: d3.select(marker).datum(), x: ev.clientX } : null;
      if (!pressed) scrub(ev);
    })
    .on('pointermove', ev => {
      if (!(ev.buttons & 1)) return;
      if (pressed && Math.abs(ev.clientX - pressed.x) < 5) return;
      pressed = null;
      scrub(ev);
    })
    .on('pointerup', ev => {
      if (pressed) actions.gotoChapter(pressed.chapter);
      pressed = null;
      if (svg.node().hasPointerCapture(ev.pointerId)) svg.node().releasePointerCapture(ev.pointerId);
    })
    .on('pointercancel', () => { pressed = null; })
    /* the chart is also a slider: ←/→ work page-wide (main.js), these while it has focus */
    .on('keydown', ev => {
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const i = store.get().idx;
      const to = { Home: 0, End: data.N - 1, PageUp: i + 12, PageDown: i - 12,
                   ArrowUp: i + 1, ArrowDown: i - 1 }[ev.key];
      if (to == null) return;
      actions.step(to - i);
      ev.preventDefault();
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
    const W = Math.max(200, document.querySelector('.tl-main').clientWidth);   // true width, so phone labels are not squeezed
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

    /* year gridlines + labels; the first month gets a label of its own only when the data
       does not start in a January, which already has one */
    const years = d3.timeYear.range(d3.timeYear.ceil(data.periods[0]), data.periods[data.N - 1]);
    const labelled = +years[0] === +data.periods[0] ? years : [data.periods[0], ...years];
    svg.selectAll('line.yr').data(years).join('line').attr('class', 'yr')
      .attr('x1', d => x(d)).attr('x2', d => x(d))
      .attr('y1', M.t).attr('y2', H - M.b);
    svg.selectAll('text.yr').data(labelled).join('text').attr('class', 'yr')
      .attr('x', d => x(d) + 4).attr('y', H - 2)
      .attr('font-size', 10)
      .text(d3.timeFormat('’%y'));

    /* reference line: 0 for deltas, 1 for the worker ratio */
    if (m.kind === 'div' && m.center >= y.domain()[0] && m.center <= y.domain()[1])
      svg.append('line').attr('class', 'ref-line')
        .attr('x1', M.l).attr('x2', W - M.r)
        .attr('y1', y(m.center)).attr('y2', y(m.center))
        .attr('stroke-dasharray', '3 4');

    const line = d3.line().defined(p => fin(p.v)).x(p => x(p.d)).y(p => y(p.v));
    const area = d3.area().defined(p => fin(p.v)).x(p => x(p.d)).y0(H - M.b).y1(p => y(p.v));

    /* colours come from the theme stylesheet via these classes */
    svg.append('path').datum(nat).attr('class', 'us-area').attr('d', area);
    svg.append('path').datum(nat).attr('class', 'us-line').attr('d', line)
      .attr('fill', 'none').attr('stroke-width', 1.8);

    if (sel) svg.append('path').datum(sel).attr('class', 'state-line').attr('d', line)
      .attr('fill', 'none').attr('stroke-width', 1.6);
    /* the key sits beside the caption, where it cannot cover the 2020 lines */
    legend.attr('hidden', sel ? null : '')
      .html(sel ? `<i class="key-us"></i>United States<i class="key-state"></i>${s.selected}` : '');

    /* chapter markers in the strip between the plot and the year labels; the stylesheet
       gives each a wide transparent stroke, so the target is bigger than the dot */
    svg.selectAll('circle.ch').data(data.chapters).join('circle').attr('class', 'ch')
      .attr('cx', c => x(data.periods[c.idx])).attr('cy', H - M.b + 5).attr('r', 3)
      .append('title').text(c => `${c.title} · ${fmtMonYr(data.periods[c.idx])}`);

    /* cursor */
    cursor = svg.append('g').style('pointer-events', 'none');
    cursor.append('line').attr('class', 'cursor-line').attr('y1', M.t).attr('y2', H - M.b)
      .attr('stroke-width', 1.2).attr('opacity', 0.85);
    natDot = cursor.append('circle').attr('class', 'cursor-dot').attr('r', 4)
      .attr('stroke-width', 1.5);

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
    svg.attr('aria-valuenow', s.idx).attr('aria-valuetext', fmtMonth(data.periods[s.idx]));
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
    const estimate = data.estimateNote(m, s.idx) ? ' (interpolated)' : '';
    caption.text(s.selected
      ? `${s.selected}: ${m.fmt(data.byState.get(s.selected).vals[m.col][s.idx])} · United States: ${nat}${estimate}`
      : `United States · ${m.label}: ${nat}${estimate}`);
  }

  function renderPlayIcon(s) {
    playBtn.attr('aria-label', s.playing ? 'Pause' : 'Play');
    d3.select('#playIcon').attr('d', s.playing
      ? 'M7 5h4v14H7zM13 5h4v14h-4z'    // pause
      : 'M8 5v14l11-7z');               // play
  }
}
