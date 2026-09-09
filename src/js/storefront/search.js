/* =============================================================================
   Velorex Music — global search
   Used by: index.html (wired from injectNavbar in src/js/storefront/router.js)

   One search engine, two presentations: the inline navbar field on desktop and
   a full-screen sheet below 1100px, where the navbar collapses to a hamburger.

   Cross-module touch points (resolved at runtime via script-scope):
     Utils.escape, Storage.getProducts, Seo.productPath, navigate

   Search runs entirely against the cached product list — the same lean payload
   the products page filters on. No endpoint, no debounce-against-the-network,
   and it works offline once the cache is warm. At this catalogue size (tens to
   low hundreds of products) scoring every product per keystroke is far below a
   frame; if the catalogue ever reaches thousands this is the thing to revisit,
   not the transport.
   ============================================================================= */

var VelorexSearch = (function () {
  'use strict';

  var MAX_SUGGESTIONS = 6;

  var overlay = null;         // the mobile sheet, built once and reused
  var overlayInput = null;
  var overlayList = null;
  var currentResults = [];
  var currentQuery = '';
  var lastFocus = null;       // element to restore focus to when the sheet closes

  // ---- Matching -----------------------------------------------------------

  function norm(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

  function formatLabel(cat) {
    return cat === 'vinyl' ? 'Vinyl' : cat === 'cd' ? 'CD' : cat === 'cassette' ? 'Cassette'
         : cat === 'bluray' ? 'Blu-ray' : cat === 'dvd' ? 'DVD'
         : cat === 'merchandise' ? 'Merchandise' : cat === 'vinyl-care' ? 'Vinyl Care' : 'Music';
  }

  // Ranked rather than a flat filter, so typing "sho" puts "Sholay" above an
  // album whose music director merely contains the letters. Higher is better.
  function score(product, q) {
    var title = norm(product.title);
    var artist = norm(product.artist);
    if (!title && !artist) return 0;
    if (title === q) return 100;
    if (title.indexOf(q) === 0) return 90;
    if (artist.indexOf(q) === 0) return 70;
    // Word-start inside the title ("raat" in "Fursat Ke Raat Din") beats a
    // mid-word hit, which is usually coincidental.
    if (title.indexOf(' ' + q) > -1) return 65;
    if (title.indexOf(q) > -1) return 55;
    if (artist.indexOf(q) > -1) return 45;
    if (norm(product.musicDirector).indexOf(q) > -1) return 30;
    if (norm(product.category).indexOf(q) > -1) return 20;
    if (norm(product.language).indexOf(q) > -1) return 15;
    return 0;
  }

  function search(raw) {
    var q = norm(raw);
    if (!q) return [];
    var products = [];
    try { products = Storage.getProducts() || []; } catch (e) { return []; }
    var hits = [];
    products.forEach(function (p) {
      if (!p || !p.id) return;
      var s = score(p, q);
      if (s > 0) hits.push({ p: p, s: s });
    });
    hits.sort(function (a, b) {
      return (b.s - a.s)
          || ((b.p.rating || 0) - (a.p.rating || 0))
          || ((b.p.reviews || 0) - (a.p.reviews || 0));
    });
    return hits.map(function (h) { return h.p; });
  }

  // ---- Rendering ----------------------------------------------------------

  // Wrap the matched run in <mark> WITHOUT ever putting unescaped text in the
  // DOM. The match offset is found on the raw string, the three pieces are
  // sliced from the raw string, and each is escaped independently — escaping
  // first would shift every offset the moment a title contains & or '.
  function highlight(text, q) {
    var raw = String(text == null ? '' : text);
    var i = q ? norm(raw).indexOf(norm(q)) : -1;
    if (i < 0) return Utils.escape(raw);
    return Utils.escape(raw.slice(0, i))
      + '<mark>' + Utils.escape(raw.slice(i, i + q.length)) + '</mark>'
      + Utils.escape(raw.slice(i + q.length));
  }

  var FALLBACK_IMG = 'https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=200&h=200&fit=crop';

  function itemHtml(p, q, index) {
    var img = (typeof p.image === 'string' && p.image) ? p.image : FALLBACK_IMG;
    var meta = [formatLabel(p.category), p.artist].filter(Boolean).join(' · ');
    return '<a class="search-item" role="option" data-index="' + index + '" href="' + Seo.productPath(p) + '" data-id="' + p.id + '">'
      + '<img class="search-item-img" src="' + Utils.escape(img) + '" alt="" loading="lazy" decoding="async"'
      + ' onerror="this.onerror=null;this.src=\'' + FALLBACK_IMG + '\'">'
      + '<span class="search-item-body">'
        + '<span class="search-item-title">' + highlight(p.title, q) + '</span>'
        + '<span class="search-item-meta">' + Utils.escape(meta) + '</span>'
      + '</span>'
      + '<span class="search-item-price">₹' + (p.price || 0).toLocaleString('en-IN') + '</span>'
      + '</a>';
  }

  // Shown before anything is typed. Real hrefs to real category paths — the
  // same links the navbar uses, so this is a shortcut, not a dead end.
  function chipsHtml() {
    var chips = [
      ['Vinyl Records', '/vinyl-records'], ['Audio CDs', '/audio-cds'],
      ['Cassettes', '/cassettes'], ['Pre-owned', '/pre-owned'],
      ['Combo Offers', '/combos'], ['All Products', '/products']
    ];
    return '<div class="search-suggest-head">Browse</div><div class="search-chips">'
      + chips.map(function (c) { return '<a class="search-chip" href="' + c[1] + '">' + c[0] + '</a>'; }).join('')
      + '</div>';
  }

  function render(listEl, raw) {
    if (!listEl) return;
    var q = String(raw || '').trim();
    currentQuery = q;

    if (!q) {
      currentResults = [];
      listEl.innerHTML = chipsHtml();
      listEl.hidden = false;
      return;
    }

    var results = search(q);
    currentResults = results.slice(0, MAX_SUGGESTIONS);

    if (!results.length) {
      listEl.innerHTML = '<div class="search-empty"><i class="fas fa-magnifying-glass"></i>'
        + 'No matches for “' + Utils.escape(q) + '”</div>' + chipsHtml();
      listEl.hidden = false;
      return;
    }

    var html = '<div class="search-suggest-head">' + results.length + ' result' + (results.length === 1 ? '' : 's') + '</div>';
    html += currentResults.map(function (p, i) { return itemHtml(p, q, i); }).join('');
    if (results.length > currentResults.length) {
      html += '<a class="search-item search-item-all" href="/products?search=' + encodeURIComponent(q) + '" data-all="1">'
        + '<span>See all ' + results.length + ' results</span><i class="fas fa-arrow-right"></i></a>';
    }
    listEl.innerHTML = html;
    listEl.hidden = false;
  }

  // The highlighted row is tracked ONLY as a class on the element, never also
  // in a module variable. A mirrored index desynced from the DOM the moment
  // anything re-rendered the list between two keystrokes — which is exactly
  // what happened: ArrowDown highlighted a row, a background product sync
  // re-rendered, and the following Enter searched the raw query instead of
  // opening the row the user could see was selected. Reading the DOM cannot
  // disagree with what is on screen.
  function moveActive(listEl, delta) {
    var items = listEl.querySelectorAll('.search-item');
    if (!items.length) return;
    var cur = -1;
    items.forEach(function (el, i) { if (el.classList.contains('is-active')) cur = i; });
    var next = (cur + delta + items.length) % items.length;
    items.forEach(function (el, i) { el.classList.toggle('is-active', i === next); });
    if (items[next] && items[next].scrollIntoView) items[next].scrollIntoView({ block: 'nearest' });
  }

  function submit(raw) {
    var q = String(raw || '').trim();
    if (!q) return;
    closeOverlay();
    navigate('products', { search: q });
  }

  function openProductFromEl(el) {
    var id = el.getAttribute('data-id');
    closeOverlay();
    if (el.getAttribute('data-all') || !id) {
      submit(currentQuery);
      return;
    }
    navigate('product', { id: parseInt(id, 10) });
  }

  // One handler for both presentations. Returns true if it consumed the key.
  function handleKey(e, inputEl, listEl) {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(listEl, 1); return true; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); moveActive(listEl, -1); return true; }
    if (e.key === 'Escape') {
      if (overlay && overlay.classList.contains('is-open')) closeOverlay();
      else { listEl.hidden = true; inputEl.blur(); }
      return true;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      var active = listEl.querySelector('.search-item.is-active');
      if (active) openProductFromEl(active);
      else submit(inputEl.value);
      return true;
    }
    return false;
  }

  // Clicks on a suggestion are intercepted so the SPA handles them, but the
  // rows stay real <a href> so middle-click and "open in new tab" work.
  function wireListClicks(listEl) {
    listEl.addEventListener('click', function (e) {
      var item = e.target.closest && e.target.closest('.search-item');
      if (item) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        openProductFromEl(item);
        return;
      }
      var chip = e.target.closest && e.target.closest('.search-chip');
      if (chip) {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        closeOverlay();
        var to = Seo.parsePath ? Seo.parsePath(chip.getAttribute('href'), '') : null;
        if (to && to.page) navigate(to.page, to.params || {});
        else window.location.href = chip.getAttribute('href');
      }
    });
  }

  // ---- Navbar field -------------------------------------------------------
  //
  // injectNavbar() rebuilds the navbar on every navigation, so this runs again
  // each time against fresh elements. Nothing here is registered on document
  // or window, so repeated calls cannot stack listeners.
  function bindNavbar() {
    var wrap = document.querySelector('.navbar-search');
    var input = document.getElementById('globalSearch');
    if (!wrap || !input) return;

    // Bind each input exactly once.
    //
    // injectNavbar() normally replaces the whole navbar (so a fresh, unflagged
    // input arrives and gets bound), but it does not always, and this function
    // was adding another input/focus/keydown listener on every call to the
    // SAME element. Two keydown handlers meant one Enter ran twice: the first
    // opened the highlighted product, the second saw the list already
    // re-rendered with nothing active and submitted the raw query on top —
    // so choosing a suggestion with the keyboard landed on /products instead
    // of the record. The flag rides on the element, so it cannot get out of
    // step with the DOM the way a module-level "did I bind?" boolean would.
    if (input.dataset.vlxSearchBound === '1') return;
    input.dataset.vlxSearchBound = '1';

    var list = wrap.querySelector('.search-suggest');
    if (!list) {
      list = document.createElement('div');
      list.className = 'search-suggest';
      list.setAttribute('role', 'listbox');
      list.hidden = true;
      wrap.appendChild(list);
      wireListClicks(list);
    }

    function syncValueState() { wrap.classList.toggle('has-value', !!input.value); }
    syncValueState();

    input.addEventListener('input', function () { syncValueState(); render(list, input.value); });
    input.addEventListener('focus', function () { render(list, input.value); });
    input.addEventListener('keydown', function (e) { handleKey(e, input, list); });

    var clear = wrap.querySelector('.search-clear');
    if (clear) {
      clear.addEventListener('click', function () {
        input.value = '';
        syncValueState();
        render(list, '');
        input.focus();
      });
    }

  }

  // ---- Mobile sheet -------------------------------------------------------

  function buildOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'search-overlay';
    overlay.id = 'search-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Search Velorex Music');
    overlay.innerHTML =
      '<div class="search-overlay-bar">' +
        '<div class="search-overlay-field">' +
          '<span class="search-icon"><i class="fas fa-magnifying-glass"></i></span>' +
          '<input type="search" id="mobileSearchInput" placeholder="Search albums, artists..." autocomplete="off" autocorrect="off" spellcheck="false">' +
        '</div>' +
        '<button type="button" class="search-overlay-close" data-search-close>Cancel</button>' +
      '</div>' +
      '<div class="search-overlay-results"><div class="search-suggest" role="listbox"></div></div>';
    document.body.appendChild(overlay);

    overlayInput = overlay.querySelector('#mobileSearchInput');
    overlayList = overlay.querySelector('.search-suggest');
    wireListClicks(overlayList);

    overlayInput.addEventListener('input', function () { render(overlayList, overlayInput.value); });
    overlayInput.addEventListener('keydown', function (e) { handleKey(e, overlayInput, overlayList); });
    overlay.querySelector('[data-search-close]').addEventListener('click', closeOverlay);
  }

  function openOverlay() {
    buildOverlay();
    lastFocus = document.activeElement;
    overlay.hidden = false;
    // Reveal on the next frame so the opacity transition has a frame to run
    // from — setting `hidden = false` and the class together skips it.
    requestAnimationFrame(function () { overlay.classList.add('is-open'); });
    // Stop the page behind the sheet scrolling under it.
    document.body.style.overflow = 'hidden';
    var seed = '';
    try { seed = (currentParams && currentParams.search) || ''; } catch (e) {}
    overlayInput.value = seed;
    render(overlayList, seed);
    overlayInput.focus();
  }

  function closeOverlay() {
    if (!overlay || overlay.hidden) return;
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    // Match the 0.22s opacity transition in search.css before removing it from
    // the layout, so it fades rather than vanishing.
    setTimeout(function () { if (overlay && !overlay.classList.contains('is-open')) overlay.hidden = true; }, 240);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
    lastFocus = null;
  }

  // ---- Global wiring (once) ----------------------------------------------

  function init() {
    // "/" focuses search, the shortcut convention on shopping and docs sites.
    // Ignored while typing somewhere else, or with a modifier held, so it can
    // never swallow a real slash or a browser shortcut.
    document.addEventListener('keydown', function (e) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target;
      var tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      var input = document.getElementById('globalSearch');
      if (input && input.offsetParent !== null) { e.preventDefault(); input.focus(); input.select(); }
      else { e.preventDefault(); openOverlay(); }
    });

    // Close the dropdown on an outside click. Registered ONCE here rather than
    // inside bindNavbar(): the navbar is rebuilt on every navigation, so
    // binding there would add a listener per page view for the life of the
    // session. It re-queries the current wrapper each time, so it keeps
    // working across rebuilds.
    document.addEventListener('click', function (e) {
      var wrap = document.querySelector('.navbar-search');
      if (!wrap) return;
      var list = wrap.querySelector('.search-suggest');
      if (list && !wrap.contains(e.target)) list.hidden = true;
    });

    // The sheet only exists below 1100px. Widening past that leaves a
    // full-screen panel covering a navbar that already has a search field.
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1100) closeOverlay();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { bindNavbar: bindNavbar, open: openOverlay, close: closeOverlay, search: search };
})();
