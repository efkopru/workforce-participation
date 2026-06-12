/* Map / Grid toggle in the header. */

export function createViewToggle(store, actions) {
  const buttons = d3.select('#viewToggle').selectAll('button')
    .on('click', function () { actions.setView(this.dataset.view); });

  const render = s => {
    buttons.classed('active', function () { return this.dataset.view === s.view; });
    if (s.geoFailed)
      buttons.filter('[data-view=geo]')
        .attr('disabled', true).style('opacity', 0.35)
        .attr('title', 'Map shapes unavailable (offline?)');
  };

  store.subscribe((s, changed) => {
    if (changed.has('view') || changed.has('geoFailed')) render(s);
  });
  render(store.get());
}
