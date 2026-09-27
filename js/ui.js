/* Small UI utilities: toast notifications, the about-modal, the theme switch,
   the sideways-scrolling button rows, and the fatal load-error screen. */

let toastTimer = null;

export function toast(msg) {
  const el = d3.select('#toast').attr('hidden', null).text(msg);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.attr('hidden', ''), 4200);
}

export function initModal() {
  const back = d3.select('#modalBack');
  d3.select('#aboutBtn').on('click', () => back.attr('hidden', null));
  d3.select('#modalClose').on('click', () => back.attr('hidden', ''));
  back.on('click', e => { if (e.target.id === 'modalBack') back.attr('hidden', ''); });
}

export const isModalOpen = () => !document.getElementById('modalBack').hidden;

/* Light/dark theme. Light is the default; an inline script in index.html applies
   a saved choice before first paint. This wires the header switch and remembers
   the choice. All colours come from CSS variables, so nothing needs redrawing. */
const THEME_KEY = 'atlas-theme';

export function initTheme() {
  const root = document.documentElement;
  const btn = d3.select('#themeBtn');
  const apply = theme => {
    root.setAttribute('data-theme', theme);
    const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;
    btn.attr('aria-label', label).attr('title', label);
  };

  btn.on('click', () => {
    const theme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode: not remembered */ }
    apply(theme);
  });
  apply(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
}

/* On phones the metric and chapter buttons scroll sideways in one row; keep the
   active one visible after it changes. */
export function keepActiveInView(row) {
  const el = row.querySelector('.active');
  if (!el || row.scrollWidth <= row.clientWidth) return;
  const r = row.getBoundingClientRect(), b = el.getBoundingClientRect();
  if (b.left >= r.left && b.right <= r.right) return;
  row.scrollLeft += b.left - r.left - (r.width - b.width) / 2;
}

/* Shown when the CSV can't be fetched over HTTP (moved/renamed/404).
   The file:// case never reaches this module — modules don't load there;
   an inline guard in index.html handles it. */
export function showLoadError(err) {
  d3.select('main').html(`
    <div class="load-error">
      <h2>Couldn’t load the data</h2>
      <p><code>${String(err.message || err)}</code></p>
      <p>Check that <em>State-Grid view.csv</em> sits next to <em>index.html</em>.</p>
    </div>`);
}
