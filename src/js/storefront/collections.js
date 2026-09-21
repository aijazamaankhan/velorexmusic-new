/* =============================================================================
   Velorex Music — collection graph on the storefront (Phase 2)
   Used by: index.html (loaded before router.js)

   Renders what /api/collections.php computes (api/_collections_helpers.php):
     • the "Keep exploring" block under listings, products and Journal posts
     • composer collections at /artists/<slug>
     • "You may also like" ordering on product pages

   The server prints the same markup on a landing (seo-render.php), so a crawler
   and a visitor get the same links. This file only rebuilds it after
   client-side navigation — the MARKUP below mirrors collections_related_html()
   and velorex_post_related_html() in PHP; keep the class names in step.
   ============================================================================= */

var CollectionLinks = (function () {
  'use strict';

  var GROUPS = [
    ['collections', 'Shop related collections'],
    ['guides', 'Background reading'],
    ['journal', 'From the Velorex Journal']
  ];

  // Internal links route through the SPA; the href is real for crawlers,
  // middle-click and new tabs.
  function linkHtml(l) {
    var href = Utils.escape(l.url);
    return '<li><a href="' + href + '" onclick="return CollectionLinks.go(event, this.getAttribute(\'href\'))">'
      + Utils.escape(l.label) + '</a></li>';
  }

  function html(rel, heading) {
    if (!rel) return '';
    var out = '';
    GROUPS.forEach(function (g) {
      var list = rel[g[0]];
      if (!list || !list.length) return;
      out += '<div class="collection-links-group collection-links-' + g[0] + '">'
        + '<h3 class="collection-links-label">' + g[1] + '</h3>'
        + '<ul class="collection-links-list">' + list.map(linkHtml).join('') + '</ul></div>';
    });
    if (!out) return '';
    heading = heading || 'Keep exploring';
    return '<nav class="collection-links" aria-label="' + Utils.escape(heading) + '">'
      + '<h2 class="collection-links-title">' + Utils.escape(heading) + '</h2>'
      + '<div class="collection-links-groups">' + out + '</div></nav>';
  }

  // Navigate within the SPA when the path is one it owns; otherwise let the
  // browser follow the link (static pages, a modifier-click, a new tab).
  function go(ev, href) {
    if (ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1)) return true;
    var parsed = (typeof Seo !== 'undefined') ? Seo.parsePath(href.split('?')[0], href.split('?')[1] || '') : null;
    if (!parsed || typeof navigate !== 'function') return true;
    navigate(parsed.page, parsed.params);
    return false;
  }

  // Last payload per key, so a re-render after the background product sync
  // does not refetch.
  var cache = {};

  function fetchJson(qs) {
    if (cache[qs]) return Promise.resolve(cache[qs]);
    return fetch(API_BASE + '/collections.php?' + qs, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) cache[qs] = d; return d; })
      .catch(function () { return null; });
  }

  // Fill `containerId` with the related block for a listing path. A failed
  // fetch leaves whatever the server rendered in place.
  function loadPath(containerId, path) {
    var el = document.getElementById(containerId);
    if (!el) return;
    fetchJson('path=' + encodeURIComponent(path)).then(function (d) {
      if (d && d.related) el.innerHTML = html(d.related);
    });
  }

  // Product page: the links block, and the ids for "You may also like".
  function loadProduct(product, onRelatedIds) {
    var el = document.getElementById('product-related-links');
    fetchJson('product=' + encodeURIComponent(product.id)).then(function (d) {
      if (!d) return;
      if (el && d.related) el.innerHTML = html(d.related, 'More like this');
      if (typeof onRelatedIds === 'function' && Array.isArray(d.products)) onRelatedIds(d.products);
    });
  }

  // Under a Journal post — mirrors velorex_post_related_html().
  function postRelatedHtml(rel) {
    if (!rel) return '';
    var out = '';
    if (rel.products && rel.products.length && typeof createProductCard === 'function') {
      out += '<section class="post-related-products"><h2 class="collection-links-title">Records in this article</h2>'
        + '<div class="products-grid">' + rel.products.map(createProductCard).join('') + '</div></section>';
    }
    return out + html({ collections: rel.collections, journal: rel.journal }, 'Keep exploring');
  }

  return { html: html, go: go, loadPath: loadPath, loadProduct: loadProduct, postRelatedHtml: postRelatedHtml, fetchJson: fetchJson };
})();

// Composer collection — /artists/<slug>. Called by initPage() in router.js.
async function initPageArtist(params) {
  var slug = params && params.slug;
  var grid = document.getElementById('artist-grid');
  var d = await CollectionLinks.fetchJson('artist=' + encodeURIComponent(slug || ''));
  if (!d || !d.artist) {
    if (grid && !grid.querySelector('.product-card')) {
      grid.innerHTML = '<p style="grid-column:1/-1;color:var(--text-muted);">This collection is not available.</p>';
    }
    return;
  }
  var a = d.artist;
  var byId = {};
  (Storage.getProducts() || []).forEach(function (p) { byId[p.id] = p; });
  var products = d.products.map(function (id) { return byId[id]; }).filter(Boolean);
  var inStock = products.filter(function (p) { return Number(p.stock) > 0; }).length;

  var t = document.getElementById('artist-title'); if (t) t.textContent = a.name + ' Vinyl Records';
  var c = document.getElementById('artist-count');
  // On a cold cache the ids are known but the cards are not; keep the
  // server's line rather than printing "0 records".
  if (c && products.length) c.textContent = Seo.artistCountLine(products.length, inStock);
  var about = document.getElementById('artist-about');
  if (about) about.innerHTML = a.about.map(function (p) { return '<p>' + Utils.escape(p) + '</p>'; }).join('');
  if (grid && products.length) grid.innerHTML = products.map(createProductCard).join('');
  var rel = document.getElementById('artist-related');
  if (rel) rel.innerHTML = CollectionLinks.html(d.related);

  try { Seo.syncArtist(a); } catch (e) {}
  try { updateBreadcrumbs('artist', { slug: slug, title: a.name }); } catch (e) {}
}
