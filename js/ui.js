/* Small UI utilities: toast notifications, the about-modal, the theme switch,
   the sideways-scrolling button rows, and the fatal load-error screen. */

let toastTimer = null;

/* #toast is a live region that stays in the page and is shown by a class: screen readers
   announce text that arrives in a region they already know, not one that was display:none. */
export function toast(msg) {
  const el = d3.select('#toast').text(msg).classed('show', true);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classed('show', false).text(''), 4200);
}

/* The about panel is a native <dialog>: showModal() moves focus into it, keeps Tab inside,
   closes on Esc and hands focus back to the button that opened it. */
export function initModal() {
  const dialog = document.getElementById('about');
  d3.select('#aboutBtn').on('click', () => dialog.showModal());
  d3.select('#modalClose').on('click', () => dialog.close());
  /* the dialog's content fills its box, so a click that lands on the dialog itself is on the backdrop */
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
}

export const isModalOpen = () => document.getElementById('about').open;

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
    <div class="load-error" role="alert">
      <h2>Couldn’t load the data</h2>
      <p><code></code></p>
      <p>Check that <em>State-Grid view.csv</em> sits next to <em>index.html</em>.</p>
    </div>`);
  d3.select('main code').text(String(err.message || err));
  /* the metric pills and the timeline have nothing to drive without data */
  d3.selectAll('#metricBar, #timelineWrap').attr('hidden', '');
}
