/* Small UI utilities: toast notifications, the about-modal, and the
   fatal load-error screen. */

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
