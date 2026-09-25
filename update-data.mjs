/* Rebuilds `State-Grid view.csv` from the BLS bulk time-series files:
   LAUS (labor force, participation, unemployment, population) and state JOLTS
   (openings, hires, quits). Derived columns keep the snapshot's definitions.

   Usage:  BLS_CONTACT=you@example.com node update-data.mjs
   BLS asks automated downloads to carry a contact email in the User-Agent.
   Files are cached in .bls-cache/; without BLS_CONTACT the cache is reused. */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const cache = join(root, '.bls-cache');
const OUTPUT = join(root, 'State-Grid view.csv');
const FIRST = { year: 2020, month: 1 };
const BASE_PERIOD = '2/1/2020';            // pre-pandemic baseline for every delta
const FILES = {
  laSA: 'la/la.data.3.AllStatesS',         // seasonally adjusted statewide LAUS
  laNSA: 'la/la.data.2.AllStatesU',        // civilian noninstitutional population (NSA only)
  openings: 'jt/jt.data.2.JobOpenings',
  hires: 'jt/jt.data.3.Hires',
  quits: 'jt/jt.data.5.Quits',
  states: 'jt/jt.state',
};

async function load(path) {
  const file = join(cache, path.split('/')[1]);
  const contact = process.env.BLS_CONTACT;
  if (contact) {
    const res = await fetch(`https://download.bls.gov/pub/time.series/${path}`,
      { headers: { 'User-Agent': `workforce-atlas-data-refresh (${contact})` } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    await writeFile(file, await res.text());
  } else {
    try { await access(file); }
    catch { throw new Error(`Missing ${file}. Set BLS_CONTACT to your email to download the BLS files.`); }
  }
  return readFile(file, 'utf8');
}

/* series_id → Map("M/1/YYYY" → number); "-" and other placeholders become NaN */
function parseSeries(text, keep) {
  const out = new Map();
  for (const line of text.split('\n').slice(1)) {
    const [id, year, period, value] = line.split('\t').map(s => s?.trim());
    if (!id || !keep(id) || +year < FIRST.year || !/^M(0[1-9]|1[0-2])$/.test(period)) continue;
    if (!out.has(id)) out.set(id, new Map());
    out.get(id).set(`${+period.slice(1)}/1/${year}`, value === '' || isNaN(+value) ? NaN : +value);
  }
  return out;
}

await mkdir(cache, { recursive: true });
const text = Object.fromEntries(await Promise.all(Object.entries(FILES).map(async ([k, p]) => [k, await load(p)])));

const states = text.states.split('\n').slice(1).map(l => l.split('\t').map(s => s.trim()))
  .filter(([code]) => /^\d{2}$/.test(code) && code !== '00')
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));
if (states.length !== 51) throw new Error(`Expected 50 states + DC, found ${states.length}.`);

const stateCodes = new Set(states.map(s => s.code));
const isState = (id, re) => { const m = id.match(re); return !!m && stateCodes.has(m[1]); };
const la = parseSeries(text.laSA, id => isState(id, /^LASST(\d{2})0{11}0[3-68]$/));
const pop = parseSeries(text.laNSA, id => isState(id, /^LAUST(\d{2})0{11}09$/));
const jolts = new Map([text.openings, text.hires, text.quits].flatMap(t =>
  [...parseSeries(t, id => isState(id, /^JTS000000(\d{2})0{7}(JOL|HIL|HIR|QUL|QUR)$/))]));

const laus = (code, measure) => la.get(`LASST${code}00000000000${measure}`) ?? new Map();
const valueAt = (series, p) => series.get(p) ?? NaN;
const jt = (code, element) => jolts.get(`JTS000000${code}0000000${element}`) ?? new Map();

/* periods: January 2020 through the latest month either source publishes */
const all = [...la.values(), ...jolts.values()].flatMap(m => [...m].filter(([, v]) => Number.isFinite(v)).map(([p]) => p));
const key = p => { const [m, , y] = p.split('/'); return +y * 12 + (+m - 1); };
const lastKey = Math.max(...all.map(key));
const periods = [];
for (let k = FIRST.year * 12 + FIRST.month - 1; k <= lastKey; k++) periods.push(`${(k % 12) + 1}/1/${Math.floor(k / 12)}`);

const fixed = (v, digits) => {
  if (!Number.isFinite(v)) return '';
  const s = v.toFixed(digits);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;    // no "-0.0"
};
const thousands = v => fixed(v / 1000, 0);
const pct = (v, base) => base > 0 ? (v / base - 1) * 100 : NaN;

const HEADER = ['State', 'Period', 'Population (thousands)', 'Labor Force (thousands)',
  'Labor Force Participation Rate (LFPR) (%)', 'LFPR compared to pre-pandemic levels (%)',
  'Employment (thousands)', 'Unemployment (thousands)', 'Unemployment compared to pre-pandemic levels (%)',
  'Unemployment Rate (%)', 'Job Openings (thousands)', 'Job Openings compared to pre-pandemic levels (%)',
  'Labor Shortage or Surplus (thousands)', 'Available Worker Ratio', 'Quits (thousands)', 'Quit Rate (%)',
  'Hires (thousands)', 'Hire Rate (%)'];

const rows = [];
for (const period of [...periods].reverse()) {
  const beforeDeltas = key(period) <= key(BASE_PERIOD);
  for (const { code, name } of states) {
    const at = (series, p = period) => valueAt(series, p);
    const P = pop.get(`LAUST${code}0000000000009`) ?? new Map();
    const [LF, U, E, UR, LFPR] = ['06', '04', '05', '03', '08'].map(m => at(laus(code, m)));
    const [JO, HI, HR, QU, QR] = ['JOL', 'HIL', 'HIR', 'QUL', 'QUR'].map(e => at(jt(code, e)));
    const lfprExact = LF / at(P) * 100;
    const lfprBase = at(laus(code, '06'), BASE_PERIOD) / at(P, BASE_PERIOD) * 100;
    rows.push([
      name, period, thousands(at(P)), thousands(LF), fixed(LFPR, 1),
      beforeDeltas ? '' : fixed(lfprExact - lfprBase, 1),
      thousands(E), thousands(U),
      beforeDeltas ? '' : fixed(pct(U, at(laus(code, '04'), BASE_PERIOD)), 1),
      fixed(UR, 1), fixed(JO, 0),
      beforeDeltas ? '' : fixed(pct(JO, at(jt(code, 'JOL'), BASE_PERIOD)), 1),
      fixed(U / 1000 - JO, 0), fixed(U / 1000 / JO, 2),
      fixed(QU, 0), fixed(QR, 1), fixed(HI, 0), fixed(HR, 1),
    ].join(','));
  }
}

await writeFile(OUTPUT, '\uFEFF' + [HEADER.join(','), ...rows].join('\n'));
const lastWith = series => periods.filter(p => states.some(s => Number.isFinite(valueAt(series(s.code), p)))).at(-1);
const lausLast = lastWith(code => laus(code, '06'));
const joltsLast = lastWith(code => jt(code, 'JOL'));
console.log(`Wrote ${rows.length} rows (${states.length} jurisdictions × ${periods.length} months, ${periods[0]}–${periods.at(-1)}).`);
console.log(`LAUS through ${lausLast}; state JOLTS through ${joltsLast}.`);
