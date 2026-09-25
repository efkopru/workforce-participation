/* Data layer: fetch the CSV, parse it, derive everything the app needs.
   Pure data — no DOM access. Returns one immutable `data` object. */

import { STATE_INFO, METRICS, FMT, fin, fmtMonth } from './config.js';

/* Missing months are painted with a hatch pattern the map defines under this id,
   so a gap can't be mistaken for a low value. */
export const NO_DATA_ID = 'no-data';

/* Diverging: red below the center ← pale yellow → blue above it (metrics with
   `flip` reverse this). The pale midpoint recedes into the light map. */
const DIVERGING = d3.interpolateRdYlBu;

/* CSV headers → short column keys used everywhere else */
const COLUMNS = {
  pop:    'Population (thousands)',
  lf:     'Labor Force (thousands)',
  lfpr:   'Labor Force Participation Rate (LFPR) (%)',
  lfprD:  'LFPR compared to pre-pandemic levels (%)',
  emp:    'Employment (thousands)',
  unemp:  'Unemployment (thousands)',
  unempD: 'Unemployment compared to pre-pandemic levels (%)',
  ur:     'Unemployment Rate (%)',
  open:   'Job Openings (thousands)',
  openD:  'Job Openings compared to pre-pandemic levels (%)',
  short:  'Labor Shortage or Surplus (thousands)',
  awr:    'Available Worker Ratio',
  quits:  'Quits (thousands)',
  quitR:  'Quit Rate (%)',
  hires:  'Hires (thousands)',
  hireR:  'Hire Rate (%)',
};
const COLS = Object.keys(COLUMNS);
const ALL_COLS = [...COLS, 'openRate'];          // openRate is derived

export async function loadData(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} while fetching ${url}`);
  const text = await res.text();

  const { periods, byState, baseIdx } = parseRows(d3.csvParse(text));
  const national = aggregateNational(byState, periods.length, baseIdx);
  const scales = buildScales(byState, periods.length);
  const chapters = deriveChapters(national, byState, periods, baseIdx);

  return {
    periods, N: periods.length, baseIdx,
    byState, national, chapters,
    /* fill for a metric value (hatch pattern for missing months) */
    fillFor: (metric, v) => fin(v) ? scales.get(metric.id).scale(v) : `url(#${NO_DATA_ID})`,
    /* why a metric has no national value this month ('' when it has one) */
    missingNote: (metric, i) => missingNote(metric, i, national, byState, periods, baseIdx),
    domainOf: metric => scales.get(metric.id).domain,
    scaleOf: metric => scales.get(metric.id).scale,
  };
}

/* ── parsing ────────────────────────────────────────────────────── */
function parseRows(rows) {
  const parseDate = d3.timeParse('%m/%d/%Y');

  const periodIdx = new Map();          // period string → index
  const periods = [...new Set(rows.map(r => r.Period))]
    .map(s => [s, parseDate(s)])
    .sort((a, b) => a[1] - b[1])
    .map(([s, d], i) => (periodIdx.set(s, i), d));

  const byState = new Map(Object.entries(STATE_INFO).map(([name, [abbr, gc, gr]]) => {
    const vals = Object.fromEntries(ALL_COLS.map(c => [c, new Float64Array(periods.length).fill(NaN)]));
    return [name, { name, abbr, gc, gr, vals }];
  }));

  for (const row of rows) {
    const st = byState.get(row.State);
    const i = periodIdx.get(row.Period);
    if (!st || i == null) continue;
    for (const c of COLS) {
      const raw = row[COLUMNS[c]];
      st.vals[c][i] = raw === '' || raw == null ? NaN : +raw;
    }
    const { emp, open } = { emp: st.vals.emp[i], open: st.vals.open[i] };
    st.vals.openRate[i] = fin(emp) && fin(open) ? open / (emp + open) * 100 : NaN;
  }

  return { periods, byState, baseIdx: periodIdx.get('2/1/2020') };
}

/* ── national series: sums for counts, rates re-derived from sums ── */
function aggregateNational(byState, N, baseIdx) {
  const nat = Object.fromEntries(ALL_COLS.map(c => [c, new Float64Array(N).fill(NaN)]));

  for (let i = 0; i < N; i++) {
    /* Labor-force (LAUS) and job-openings (JOLTS) sums are independent: LAUS is
       missing for Oct 2025, and state JOLTS ends before LAUS. Mixed ratios need both. */
    let pop = 0, lf = 0, emp = 0, unemp = 0, open = 0, quits = 0, hires = 0;
    let laus = true, jolts = true;
    for (const st of byState.values()) {
      const v = st.vals;
      if (fin(v.pop[i]) && fin(v.lf[i]) && fin(v.emp[i]) && fin(v.unemp[i])) {
        pop += v.pop[i]; lf += v.lf[i]; emp += v.emp[i]; unemp += v.unemp[i];
      } else laus = false;
      if (fin(v.open[i]) && fin(v.quits[i]) && fin(v.hires[i])) {
        open += v.open[i]; quits += v.quits[i]; hires += v.hires[i];
      } else jolts = false;
    }
    if (laus) {
      nat.pop[i] = pop;     nat.lf[i] = lf;      nat.lfpr[i] = lf / pop * 100;
      nat.emp[i] = emp;     nat.unemp[i] = unemp; nat.ur[i] = unemp / lf * 100;
    }
    if (jolts) { nat.open[i] = open; nat.quits[i] = quits; nat.hires[i] = hires; }
    if (laus && jolts) {
      nat.openRate[i] = open / (emp + open) * 100;
      nat.short[i] = unemp - open;              nat.awr[i] = unemp / open;
      nat.quitR[i] = quits / emp * 100;         nat.hireR[i] = hires / emp * 100;
    }
  }
  for (let i = baseIdx + 1; i < N; i++) {
    nat.lfprD[i]  = nat.lfpr[i] - nat.lfpr[baseIdx];
    nat.unempD[i] = (nat.unemp[i] / nat.unemp[baseIdx] - 1) * 100;
    nat.openD[i]  = (nat.open[i] / nat.open[baseIdx] - 1) * 100;
  }
  return nat;
}

/* ── missing-data notes ─────────────────────────────────────────── */
function lastIndexWith(byState, col) {
  let last = -1;
  for (const st of byState.values())
    for (let i = st.vals[col].length - 1; i > last; i--) if (fin(st.vals[col][i])) { last = i; break; }
  return last;
}

function missingNote(metric, i, national, byState, periods, baseIdx) {
  if (fin(national[metric.col][i])) return '';
  if (metric.kind === 'div' && metric.center === 0 && i <= baseIdx) return 'Baseline months — deltas begin Mar 2020';
  const last = lastIndexWith(byState, metric.col);
  if (i > last) return `State job-openings, hires and quits data end in ${fmtMonth(periods[last])}; BLS publishes them once a year.`;
  return 'BLS has not published state labor-force estimates for this month.';
}

/* ── color scales: fixed across all months, clamped at p2–p98 ───── */
function buildScales(byState, N) {
  const scales = new Map();
  for (const m of METRICS) {
    const all = [];
    for (const st of byState.values())
      for (let i = 0; i < N; i++) { const v = st.vals[m.col][i]; if (fin(v)) all.push(v); }
    all.sort(d3.ascending);
    const p02 = d3.quantileSorted(all, 0.02), p98 = d3.quantileSorted(all, 0.98);

    if (m.kind === 'seq') {
      scales.set(m.id, {
        scale: d3.scaleSequential(m.interp).domain([p02, p98]).clamp(true),
        domain: [p02, p98],
      });
    } else {
      const lo = Math.min(p02, m.center), hi = Math.max(p98, m.center);
      const interp = m.flip ? t => DIVERGING(1 - t) : DIVERGING;
      scales.set(m.id, {
        scale: d3.scaleDiverging(interp).domain([lo, m.center, hi]).clamp(true),
        domain: [lo, m.center, hi],
      });
    }
  }
  return scales;
}

/* ── story chapters, located from the data itself ───────────────── */
function deriveChapters(nat, byState, periods, baseIdx) {
  const argBest = (arr, cmp) => {
    let bi = -1;
    for (let i = 0; i < arr.length; i++) if (fin(arr[i]) && (bi < 0 || cmp(arr[i], arr[bi]))) bi = i;
    return bi;
  };
  const shock = argBest(nat.ur, (a, b) => a > b);
  const resign = argBest(nat.quitR, (a, b) => a > b);
  const shortage = argBest(nat.awr, (a, b) => a < b);
  const gap = nat.lfpr.findIndex((v, i) => !fin(v) && i > 0);
  const last = periods.length - 1;

  let worstUR = null;
  for (const st of byState.values())
    if (!worstUR || st.vals.ur[shock] > worstUR.vals.ur[shock]) worstUR = st;

  const chapters = [
    { id: 'eve', idx: baseIdx, title: 'The Eve', metric: 'lfpr',
      blurb: `The last normal month — ${FMT.pct1(nat.lfpr[baseIdx])} participation, ${FMT.pct1(nat.ur[baseIdx])} unemployment.` },
    { id: 'shock', idx: shock, title: 'The Shock', metric: 'ur',
      blurb: `Unemployment explodes to ${FMT.pct1(nat.ur[shock])} nationally — ${worstUR.name} hits ${FMT.pct1(worstUR.vals.ur[shock])}.` },
    { id: 'resign', idx: resign, title: 'The Great Resignation', metric: 'quitR',
      blurb: `${FMT.k(nat.quits[resign])} Americans quit in a single month (${FMT.pct1(nat.quitR[resign])} of all jobs).` },
    { id: 'shortage', idx: shortage, title: 'Peak Shortage', metric: 'awr',
      blurb: `Just ${FMT.r2(nat.awr[shortage])} unemployed workers per job opening — employers can’t find people.` },
  ];
  if (gap > 0) chapters.push({ id: 'gap', idx: gap, title: 'The Data Gap', metric: null,
    blurb: `BLS has not published state labor-force estimates for ${fmtMonth(periods[gap])}.` });
  chapters.push({ id: 'today', idx: last, title: 'Latest available', metric: null,
    blurb: fin(nat.awr[last])
      ? `Participation ${FMT.pct1(nat.lfpr[last])}, unemployment ${FMT.pct1(nat.ur[last])}, ${FMT.r2(nat.awr[last])} unemployed per opening.`
      : `Participation ${FMT.pct1(nat.lfpr[last])}, unemployment ${FMT.pct1(nat.ur[last])}. State job-openings data end in ${fmtMonth(periods[lastIndexWith(byState, 'open')])}.` });
  return chapters;
}
