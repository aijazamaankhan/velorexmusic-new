/* =============================================================================
   Velorex Music — homepage hero carousel
   Used by: index.html (via initPageIndex in src/js/storefront/pages.js)

   One banner that auto-switches between the brand slide and a few
   featured-product slides. Plain non-module script, script-scope shared with
   the rest of the storefront bundle — same convention as every other file in
   src/js/storefront/.

   Cross-module touch points (resolved at runtime via script-scope):
     Utils.escape, Storage.getProducts, Seo.productPath, Seo.buildPath,
     navigate, CartHelpers.addToCart

   THE BRAND SLIDE IS NOT BUILT HERE. It is static markup in index.html so a
   crawler that never runs JavaScript still gets the <h1>, the description and
   the category links. This file only appends product slides after it and wires
   up the switching. If this script fails to load, the homepage degrades to
   exactly the single static banner it had before the carousel existed.
   ============================================================================= */

var HeroCarousel = (function () {
  'use strict';

  var DWELL_MS   = 6500;   // how long a slide holds before advancing
  var MAX_SLIDES = 5;      // product slides; + the brand slide = 6 dots max

  var root = null, track = null, dots = null;
  var slides = [];
  var index = 0;
  var timer = null;
  var paused = false;
  var built = false;       // product slides rendered at least once
  var signature = '';      // which products are on screen, to skip no-op rebuilds

  // Auto-advance is motion the visitor did not ask for. Honour the OS setting:
  // the carousel still works, it just waits to be driven by hand.
  function prefersReducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  // ---- Slide selection ----------------------------------------------------
  //
  // Featured first (the admin's Homepage Placement badge), then the
  // best-reviewed of whatever is left, so a shop that has set no badges at all
  // still gets a populated banner instead of a lone brand slide.
  function pickProducts(products) {
    var inStock = products.filter(function (p) {
      return p && p.id && (p.badge === 'upcoming' || (p.stock | 0) > 0);
    });
    var rank = { hot: 0, new: 1, upcoming: 2 };
    var badged = inStock.filter(function (p) { return rank[p.badge] !== undefined; })
      .sort(function (a, b) { return rank[a.badge] - rank[b.badge]; });
    var rest = inStock.filter(function (p) { return rank[p.badge] === undefined; })
      .sort(function (a, b) {
        var d = (b.rating || 0) - (a.rating || 0);
        return d || ((b.reviews || 0) - (a.reviews || 0));
      });
    return badged.concat(rest).slice(0, MAX_SLIDES);
  }

  // ---- Slide markup -------------------------------------------------------

  function metaItem(icon, text, cls) {
    return '<span class="hero-meta-item ' + (cls || '') + '"><i class="fas fa-' + icon + '"></i>' + Utils.escape(text) + '</span>';
  }

  function formatLabel(cat) {
    return cat === 'vinyl' ? 'Vinyl Record'
         : cat === 'cd' ? 'Audio CD'
         : cat === 'cassette' ? 'Cassette'
         : cat === 'bluray' ? 'Blu-ray'
         : cat === 'dvd' ? 'DVD'
         : cat === 'merchandise' ? 'Merchandise'
         : cat === 'vinyl-care' ? 'Vinyl Care'
         : 'Music';
  }

  function pillFor(product) {
    if (product.badge === 'hot') return '<span class="hero-pill hero-pill-hot"><i class="fas fa-fire"></i> Bestseller</span>';
    if (product.badge === 'new') return '<span class="hero-pill hero-pill-new"><i class="fas fa-sparkles"></i> New Arrival</span>';
    if (product.badge === 'upcoming') return '<span class="hero-pill hero-pill-upcoming"><i class="fas fa-clock"></i> Pre-order</span>';
    return '<span class="hero-pill hero-pill-muted"><i class="fas fa-star"></i> Staff Pick</span>';
  }

  function productSlide(product, position) {
    var href = Seo.productPath(product);
    var title = Utils.escape(product.title || '');
    var alt = Utils.escape((product.title || '') + ' — ' + (product.artist || ''));
    // Same fallback cover the product cards use, so a product with no image on
    // the server shows the placeholder rather than a broken-image icon in the
    // largest element on the page. FALLBACK is also wired to onerror: a URL
    // that 404s (a wiped uploads symlink, say — see CLAUDE.md §10) otherwise
    // renders as raw alt text sprawled across the banner's artwork.
    var FALLBACK = 'https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=800&h=800&fit=crop';
    var src = (typeof product.image === 'string' && product.image) ? product.image : FALLBACK;

    // The first product slide is the one most likely to be seen within seconds
    // of load, so it is eager and high-priority; the rest are lazy. Getting
    // this backwards makes the banner the page's LCP element and holds it back
    // behind four covers nobody has looked at yet.
    var loading = position === 0
      ? 'loading="eager" fetchpriority="high"'
      : 'loading="lazy" decoding="async"';

    var pills = pillFor(product);
    if (product.condition === 'pre-owned') pills += '<span class="hero-pill hero-pill-preowned"><i class="fas fa-recycle"></i> Pre-owned</span>';

    var meta = metaItem('compact-disc', formatLabel(product.category));
    if (product.language) meta += metaItem('globe', String(product.language).charAt(0).toUpperCase() + String(product.language).slice(1).toLowerCase());
    if (product.musicDirector) meta += metaItem('music', product.musicDirector);
    if ((product.reviews | 0) > 0) meta += metaItem('star', (Number(product.rating) || 0).toFixed(1) + ' (' + product.reviews + ')');
    var stock = product.stock | 0;
    if (product.badge === 'upcoming') meta += metaItem('calendar-days', 'Releasing soon');
    else if (stock > 0 && stock <= 3) meta += metaItem('bolt', 'Only ' + stock + ' left', 'is-low');

    var price = '<span class="hero-price-now">₹' + (product.price || 0).toLocaleString('en-IN') + '</span>';
    var tag = '<span>₹' + (product.price || 0).toLocaleString('en-IN') + '</span>';
    if (product.originalPrice && product.originalPrice > product.price) {
      var off = Math.round((1 - product.price / product.originalPrice) * 100);
      price += '<span class="hero-price-was">₹' + product.originalPrice.toLocaleString('en-IN') + '</span>'
             + '<span class="hero-price-off">' + off + '% off</span>';
      tag += '<s>₹' + product.originalPrice.toLocaleString('en-IN') + '</s>';
    }

    var slide = document.createElement('article');
    slide.className = 'hero-slide hero-slide-product';
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'slide');
    slide.setAttribute('aria-label', title);
    slide.innerHTML =
      '<div class="hero-container">' +
        '<div class="hero-content">' +
          '<div class="hero-eyebrow hero-rise">' + pills + '</div>' +
          '<h2 class="hero-product-title hero-rise"><a href="' + href + '">' + title + '</a></h2>' +
          '<p class="hero-product-artist hero-rise">by <strong>' + Utils.escape(product.artist || 'Various Artists') + '</strong></p>' +
          '<div class="hero-meta hero-rise">' + meta + '</div>' +
          '<div class="hero-price hero-rise">' + price + '</div>' +
          '<div class="hero-cta hero-rise">' +
            '<a href="' + href + '" class="btn btn-primary btn-lg"><i class="fas fa-circle-info"></i> View Details</a>' +
            (stock > 0
              ? '<button type="button" class="btn btn-secondary btn-lg" data-hero-add="' + product.id + '"><i class="fas fa-cart-plus"></i> Add to Cart</button>'
              : '<a href="/products" class="btn btn-secondary btn-lg" data-hero-link="products"><i class="fas fa-grip"></i> Browse All</a>') +
          '</div>' +
        '</div>' +
        '<div class="hero-visual">' +
          '<a class="hero-sleeve" href="' + href + '" aria-label="' + alt + '">' +
            '<span class="hero-sleeve-disc" aria-hidden="true"></span>' +
            '<span class="hero-sleeve-art"><img src="' + src + '" alt="' + alt + '" ' + loading +
              " onerror=\"this.onerror=null;this.src='" + FALLBACK + "'\"></span>" +
            '<span class="hero-sleeve-tag">' + tag + '</span>' +
          '</a>' +
        '</div>' +
      '</div>';

    // Every product link is a real href (crawlers follow those and never fire
    // onclick), with the SPA transition layered on top — the same contract the
    // product cards keep. Wired here rather than as inline onclick= so the
    // markup above stays free of the id interpolation.
    slide.querySelectorAll('a[href^="/product/"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate('product', { id: product.id });
      });
    });
    var addBtn = slide.querySelector('[data-hero-add]');
    if (addBtn) addBtn.addEventListener('click', function () { CartHelpers.addToCart(product.id); });
    var browse = slide.querySelector('[data-hero-link="products"]');
    if (browse) browse.addEventListener('click', function (e) { e.preventDefault(); navigate('products'); });

    return slide;
  }

  // ---- Switching ----------------------------------------------------------

  function show(next) {
    if (!slides.length) return;
    index = (next + slides.length) % slides.length;
    slides.forEach(function (s, i) { s.classList.toggle('is-active', i === index); });
    if (dots) {
      Array.prototype.forEach.call(dots.children, function (d, i) {
        var on = i === index;
        d.classList.toggle('is-active', on);
        d.setAttribute('aria-selected', on ? 'true' : 'false');
        d.tabIndex = on ? 0 : -1;
      });
      // Restart the dot's fill animation. Reassigning the class alone does not
      // replay a CSS animation on an element that already has it, so the node
      // is cloned — cheaper and more reliable than toggling animation-name.
      var active = dots.children[index];
      if (active) {
        var fill = active.querySelector('.hero-dot-fill');
        if (fill) fill.parentNode.replaceChild(fill.cloneNode(false), fill);
      }
    }
    restart();
  }

  function restart() {
    stop();
    if (paused || slides.length < 2 || prefersReducedMotion()) return;
    timer = setTimeout(function () { show(index + 1); }, DWELL_MS);
  }

  function stop() { if (timer) { clearTimeout(timer); timer = null; } }

  function setPaused(on) {
    paused = !!on;
    if (root) root.classList.toggle('is-paused', paused);
    if (paused) stop(); else restart();
  }

  // ---- Controls -----------------------------------------------------------

  function buildDots() {
    if (!dots) return;
    dots.innerHTML = '';
    slides.forEach(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hero-dot' + (i === index ? ' is-active' : '');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', s.getAttribute('aria-label') || ('Slide ' + (i + 1)));
      b.setAttribute('aria-selected', i === index ? 'true' : 'false');
      b.tabIndex = i === index ? 0 : -1;
      b.innerHTML = '<span class="hero-dot-fill"></span>';
      b.addEventListener('click', function () { show(i); });
      dots.appendChild(b);
    });
    root.classList.toggle('is-single', slides.length < 2);
    root.style.setProperty('--hero-dwell', (DWELL_MS / 1000) + 's');
  }

  function wireOnce() {
    var prev = root.querySelector('[data-hero-prev]');
    var next = root.querySelector('[data-hero-next]');
    if (prev) prev.addEventListener('click', function () { show(index - 1); });
    if (next) next.addEventListener('click', function () { show(index + 1); });

    // Hover and keyboard focus both mean "someone is reading this" — moving the
    // banner out from under them is the single most irritating thing a
    // carousel can do.
    root.addEventListener('mouseenter', function () { setPaused(true); });
    root.addEventListener('mouseleave', function () { setPaused(false); });
    root.addEventListener('focusin',  function () { setPaused(true); });
    root.addEventListener('focusout', function () {
      if (!root.contains(document.activeElement)) setPaused(false);
    });

    root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); show(index - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
    });

    // Swipe. Threshold is deliberately generous and the vertical guard is
    // strict, so a scroll that drifts sideways does not change the slide.
    var x0 = null, y0 = null;
    root.addEventListener('touchstart', function (e) {
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    root.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      var dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(index + (dx < 0 ? 1 : -1));
      x0 = y0 = null;
    }, { passive: true });

    // A banner cycling in a background tab burns battery for nobody.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else restart();
    });
  }

  // ---- Entry point --------------------------------------------------------
  //
  // Safe to call repeatedly: initPageIndex runs on first paint with whatever is
  // in the cache and again after the background sync resolves. A rebuild is
  // skipped unless the chosen products actually changed, so the visitor never
  // sees the slide they were reading get yanked away by a sync that returned
  // the same catalogue.
  function init() {
    root = document.getElementById('hero-carousel');
    if (!root) return;
    track = root.querySelector('[data-hero-track]');
    dots  = root.querySelector('[data-hero-dots]');
    if (!track) return;

    var brand = track.querySelector('.hero-slide-brand');
    var products = [];
    try { products = pickProducts(Storage.getProducts() || []); }
    catch (e) { products = []; }

    var sig = products.map(function (p) { return p.id + ':' + p.price + ':' + (p.image || ''); }).join('|');
    if (built && sig === signature) return;
    signature = sig;

    if (!built) { wireOnce(); built = true; }

    // Rebuild only the product slides; the brand slide is server markup and is
    // never re-created.
    track.querySelectorAll('.hero-slide-product').forEach(function (n) { n.remove(); });
    products.forEach(function (p, i) { track.appendChild(productSlide(p, i)); });

    slides = Array.prototype.slice.call(track.querySelectorAll('.hero-slide'));
    if (!slides.length) return;
    if (brand) brand.setAttribute('aria-roledescription', 'slide');

    index = 0;
    buildDots();
    show(0);
  }

  return { init: init, next: function () { show(index + 1); }, prev: function () { show(index - 1); } };
})();

/**
 * Target of the brand slide's "Shop Categories" button.
 *
 * Declared at top level (not on HeroCarousel) because the button is inline
 * markup in index.html with an onclick= handler, which resolves through
 * script-scope — the same contract every other storefront onclick uses.
 *
 * The href stays "#shop-categories" so the link works, is crawlable and
 * survives this script failing to load; this only upgrades the jump to a
 * smooth scroll that clears the sticky navbar.
 */
function scrollToCategories() {
  var target = document.getElementById('shop-categories');
  if (!target) return false;
  var nav = document.querySelector('.navbar');
  var offset = (nav ? nav.offsetHeight : 0) + 16;
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  window.scrollTo({
    top: Math.max(0, target.getBoundingClientRect().top + window.pageYOffset - offset),
    behavior: reduce ? 'auto' : 'smooth'
  });
  return false;
}
