/* =============================================================================
   Homepage label band — "Discover music from the industry's leading labels".
   Styles: src/styles/components/label-band.css.

   The band is built from the CATALOGUE: every record label that at least one
   product carries (products.specs.label, set in the admin product form's
   "Label" field) becomes a chip, ordered by how many records it has. So a
   label the admin types on a new product appears here by itself, with a link
   that opens /products?label=<slug> showing just that label's records.

   The static chips in index.html stay as they are until this runs — they are
   what a crawler that does not execute JS reads (CLAUDE.md §15, §27). If the
   product list carries no labels at all (an older API, or none entered yet),
   the static band is left untouched rather than emptied.

   Logos: each chip still tries src/img/labels/<slug>.svg and swaps it in on
   load, exactly like the static chips — drop a file in, no code change.
   ============================================================================= */
var LabelBand = (function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  // { slug: { name, count } } — spellings of one label merge through
  // Seo.labelKey() (the same key the products-page filter uses), and the
  // canonical or most common spelling is the one shown.
  function collect(products) {
    var by = {};
    products.forEach(function (p) {
      if (!p || !p.label) return;
      var name = String(p.label).trim(); if (!name) return;
      var slug = Seo.labelKey(name); if (!slug) return;
      var e = by[slug] || (by[slug] = { slug: slug, count: 0, names: {} });
      e.count++;
      e.names[name] = (e.names[name] || 0) + 1;
    });
    return Object.keys(by).map(function (k) {
      var e = by[k];
      e.name = (Seo.LABEL_NAMES && Seo.LABEL_NAMES[e.slug]) ||
        Object.keys(e.names).sort(function (a, b) { return e.names[b] - e.names[a]; })[0];
      return e;
    }).sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
  }

  var lastKey = '';
  function render() {
    var list = document.querySelector('.label-band-list');
    if (!list || typeof Storage === 'undefined' || typeof Seo === 'undefined') return;
    var labels;
    try { labels = collect(Storage.getProducts() || []); } catch (e) { return; }
    if (!labels.length) return; // keep the static band

    var key = labels.map(function (l) { return l.slug + ':' + l.count; }).join('|');
    if (key === lastKey) return; // same catalogue — do not rebuild under the reader
    lastKey = key;

    list.innerHTML = labels.map(function (l) {
      var href = Seo.buildPath('products', { label: l.slug });
      return '<li class="label-chip-item">' +
        '<a class="label-chip" href="' + esc(href) + '" data-label="' + esc(l.slug) + '"' +
        ' aria-label="' + esc(l.name + ' — ' + l.count + (l.count === 1 ? ' record' : ' records')) + '">' +
          '<img class="label-chip-logo" src="/src/img/labels/' + esc(l.slug) + '.svg" alt="' + esc(l.name) + '"' +
          ' loading="lazy" decoding="async" onload="this.parentElement.classList.add(\'has-logo\')">' +
          '<span class="label-chip-name">' + esc(l.name) + '</span>' +
          '<span class="label-chip-count">' + l.count + '</span>' +
        '</a></li>';
    }).join('');
  }

  // SPA transition for the chips (real hrefs stay for middle-click / new tab).
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.label-chip[data-label]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    if (typeof navigate !== 'function') return;
    e.preventDefault();
    navigate('products', { label: a.getAttribute('data-label') });
  });

  return { render: render };
})();
