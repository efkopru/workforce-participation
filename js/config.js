/* Static configuration: states, metrics, formatters. No DOM, no app state. */

/* USPS code + tile-grid coordinates [col, row] for the grid view */
export const STATE_INFO = {
  'Alabama': ['AL', 7, 6], 'Alaska': ['AK', 0, 0], 'Arizona': ['AZ', 2, 5],
  'Arkansas': ['AR', 5, 5], 'California': ['CA', 1, 4], 'Colorado': ['CO', 3, 4],
  'Connecticut': ['CT', 10, 3], 'Delaware': ['DE', 10, 4],
  'District of Columbia': ['DC', 9, 5], 'Florida': ['FL', 9, 7],
  'Georgia': ['GA', 8, 6], 'Hawaii': ['HI', 0, 7], 'Idaho': ['ID', 2, 2],
  'Illinois': ['IL', 6, 2], 'Indiana': ['IN', 6, 3], 'Iowa': ['IA', 5, 3],
  'Kansas': ['KS', 4, 5], 'Kentucky': ['KY', 6, 4], 'Louisiana': ['LA', 5, 6],
  'Maine': ['ME', 11, 0], 'Maryland': ['MD', 9, 4], 'Massachusetts': ['MA', 10, 2],
  'Michigan': ['MI', 7, 2], 'Minnesota': ['MN', 5, 2], 'Mississippi': ['MS', 6, 6],
  'Missouri': ['MO', 5, 4], 'Montana': ['MT', 3, 2], 'Nebraska': ['NE', 4, 4],
  'Nevada': ['NV', 2, 3], 'New Hampshire': ['NH', 11, 1], 'New Jersey': ['NJ', 9, 3],
  'New Mexico': ['NM', 3, 5], 'New York': ['NY', 9, 2], 'North Carolina': ['NC', 7, 5],
  'North Dakota': ['ND', 4, 2], 'Ohio': ['OH', 7, 3], 'Oklahoma': ['OK', 4, 6],
  'Oregon': ['OR', 1, 3], 'Pennsylvania': ['PA', 8, 3], 'Rhode Island': ['RI', 11, 2],
  'South Carolina': ['SC', 8, 5], 'South Dakota': ['SD', 4, 3],
  'Tennessee': ['TN', 6, 5], 'Texas': ['TX', 4, 7], 'Utah': ['UT', 2, 4],
  'Vermont': ['VT', 10, 1], 'Virginia': ['VA', 8, 4], 'Washington': ['WA', 1, 2],
  'West Virginia': ['WV', 7, 4], 'Wisconsin': ['WI', 6, 1], 'Wyoming': ['WY', 3, 3],
};

export const DATA_URL = encodeURI('State-Grid view.csv');
export const MISSING = '#e7ecf1';          // base of the hatched "no data" fill on the light map

export const fin = v => v != null && isFinite(v);

/* Honor reduced-motion: all animation durations route through dur() */
export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const dur = ms => (REDUCED ? 0 : ms);

export const fmtMonth = d3.timeFormat('%B %Y');
export const fmtMonYr = d3.timeFormat('%b ’%y');

/* ── formatters ─────────────────────────────────────────────────── */
export const FMT = {
  pct1: v => fin(v) ? v.toFixed(1) + '%' : '—',
  pp:   v => fin(v) ? (v > 0 ? '+' : '') + v.toFixed(1) + ' pp' : '—',
  pctS: v => fin(v) ? (v > 0 ? '+' : '') + d3.format(',.0f')(v) + '%' : '—',
  r2:   v => fin(v) ? v.toFixed(2) : '—',
  k:    v => fin(v) ? (v >= 1000 ? d3.format(',.2~f')(v / 1000) + 'M'
                                 : d3.format(',.0f')(v) + 'K') : '—',
};

/* One yellow–green–blue ramp for every level metric: light = low, dark = high.
   The palest 6% is skipped so the lowest states still stand out on the light map. */
const SEQUENTIAL = t => d3.interpolateYlGnBu(0.06 + 0.94 * t);

/* ── metric catalogue ───────────────────────────────────────────────
   col    → key into the per-state / national value arrays
   kind   → 'seq' (sequential scale) or 'div' (diverging around center)
   flip   → diverging only: reverse the ramp so HIGH values read red (worse)
   fmt    → value formatter; cell → compact label for grid tiles      */
export const METRICS = [
  { id: 'lfpr', col: 'lfpr', label: 'Participation rate', kind: 'seq',
    interp: SEQUENTIAL, fmt: FMT.pct1, cell: v => v.toFixed(1),
    note: 'Share of the 16+ population in the labor force' },
  { id: 'lfprD', col: 'lfprD', label: 'Participation vs Feb ’20', kind: 'div', center: 0,
    fmt: FMT.pp, cell: v => (v > 0 ? '+' : '') + v.toFixed(1),
    note: 'Percentage points vs Feb 2020 · deltas begin Mar 2020' },
  { id: 'ur', col: 'ur', label: 'Unemployment rate', kind: 'seq',
    interp: SEQUENTIAL, fmt: FMT.pct1, cell: v => v.toFixed(1),
    note: 'Unemployed share of the labor force' },
  { id: 'unempD', col: 'unempD', label: 'Unemployed vs Feb ’20', kind: 'div', center: 0, flip: true,
    fmt: FMT.pctS, cell: v => (v > 0 ? '+' : '') + d3.format('.0f')(v),
    note: '% change in number unemployed vs Feb 2020' },
  { id: 'openRate', col: 'openRate', label: 'Job openings rate', kind: 'seq',
    interp: SEQUENTIAL, fmt: FMT.pct1, cell: v => v.toFixed(1),
    note: 'Openings ÷ (employment + openings) — JOLTS definition' },
  { id: 'openD', col: 'openD', label: 'Openings vs Feb ’20', kind: 'div', center: 0,
    fmt: FMT.pctS, cell: v => (v > 0 ? '+' : '') + d3.format('.0f')(v),
    note: '% change in job openings vs Feb 2020' },
  { id: 'awr', col: 'awr', label: 'Unemployed per opening', kind: 'div', center: 1,
    fmt: FMT.r2, cell: v => v.toFixed(2),
    note: '◀ shortage of workers · slack labor market ▶' },
  { id: 'quitR', col: 'quitR', label: 'Quit rate', kind: 'seq',
    interp: SEQUENTIAL, fmt: FMT.pct1, cell: v => v.toFixed(1),
    note: 'Voluntary quits as a share of employment' },
  { id: 'hireR', col: 'hireR', label: 'Hire rate', kind: 'seq',
    interp: SEQUENTIAL, fmt: FMT.pct1, cell: v => v.toFixed(1),
    note: 'Hires as a share of employment' },
];

export const metricById = id => METRICS.find(m => m.id === id);

/* dark or light label text, whichever has more WCAG contrast on the given fill */
const luminance = c => {
  const { r, g, b } = d3.rgb(c);
  const lin = v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const INK_DARK = '#10131b', INK_LIGHT = '#f2f4f8';
const Y_DARK = luminance(INK_DARK), Y_LIGHT = luminance(INK_LIGHT);
export const textOn = c => {
  const y = luminance(c);
  if (!Number.isFinite(y)) return INK_LIGHT;       // pattern fills: the no-data hatch is dark
  return (y + 0.05) / (Y_DARK + 0.05) >= (Y_LIGHT + 0.05) / (y + 0.05) ? INK_DARK : INK_LIGHT;
};
