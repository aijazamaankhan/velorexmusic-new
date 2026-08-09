/* =============================================================================
   Velorex Music — client-side SEO layer
   Used by: index.html (loaded before router.js)

   Two jobs:

   1. URL VOCABULARY. The single source of truth for translating between the
      SPA's (page, params) model and real crawlable paths. router.js delegates
      buildPageUrl()/parsePageFromUrl() to the functions here, so URL shape is
      defined in exactly one place instead of being smeared across the router.

   2. LIVE METADATA. A crawler that renders JavaScript reads the DOM *after*
      scripts run. Whatever <title>, description, canonical and robots values
      end up in the DOM at that moment are what get indexed — so they have to
      track SPA navigation, not stay frozen at whatever index.html shipped.

   SLUG PARITY: Seo.slugify() is mirrored by velorex_slugify() in
   src/seo/seo-lib.php. Both must produce identical output — if they diverge,
   the client pushes one URL while the server declares a different canonical,
   which Google reads as duplicate content. Change both together.
   ============================================================================= */

var Seo = (function () {
  'use strict';

  var ORIGIN = 'https://velorexmusic.com';

  // DB category value → URL slug. Mirrors velorex_categories() in seo-lib.php.
  var CAT_TO_SLUG = {
    vinyl:        'vinyl-records',
    cd:           'audio-cds',
    cassette:     'cassettes',
    bluray:       'blu-ray-movies',
    dvd:          'dvd-movies',
    // Departments. Unlike the five formats above these are subcategory-driven
    // rather than language-faceted — see SUBCATS. Their slug happens to equal
    // their DB key, which the formats' do not.
    merchandise:  'merchandise',
    'vinyl-care': 'vinyl-care'
  };
  var SLUG_TO_CAT = {};
  Object.keys(CAT_TO_SLUG).forEach(function (k) { SLUG_TO_CAT[CAT_TO_SLUG[k]] = k; });

  // Second level under the departments. MUST stay in sync with the `subs` maps
  // in velorex_categories() (src/seo/seo-lib.php) — the server declares the
  // canonical URL for these pages, so a slug present here but not there would
  // push a URL the server 404s.
  var SUBCATS = {
    merchandise: {
      't-shirts': 'T-Shirts', 'hoodies': 'Hoodies', 'caps': 'Caps',
      'tote-bags': 'Tote Bags', 'posters': 'Posters', 'stickers': 'Stickers',
      'mugs': 'Mugs', 'keychains': 'Keychains', 'slipmats': 'Slipmats'
    },
    'vinyl-care': {
      'record-cleaning-brush': 'Record Cleaning Brush',
      'carbon-fiber-brush': 'Carbon Fiber Brush',
      'record-cleaning-solution': 'Record Cleaning Solution',
      'microfiber-cloth': 'Microfiber Cloth',
      'anti-static-inner-sleeves': 'Anti-Static Inner Sleeves',
      'outer-protective-sleeves': 'Outer Protective Sleeves',
      'vinyl-storage-boxes': 'Vinyl Storage Boxes',
      'stylus-cleaning-gel': 'Stylus Cleaning Gel / Brush',
      'turntable-slipmats': 'Turntable Slipmats',
      'record-weight-clamp': 'Record Weight / Clamp'
    }
  };
  function isDepartment(cat) { return !!SUBCATS[cat]; }

  var LANGS = { hindi: 'Hindi', english: 'English' };

  // Per-view metadata for the SPA pages that have no server-rendered variant.
  // `robots: 'noindex, follow'` on transactional views: they hold no ranking
  // value, and a cart URL surfacing in search results is actively bad.
  var PAGE_META = {
    index: {
      title: 'Velorex Music | Buy Vinyl Records, CDs & Cassettes Online India',
      description: 'Buy original vinyl records, audio CDs, cassettes, Blu-rays and DVDs online in India. Hindi film soundtracks, English albums and rare collector pressings. Delivered across India.'
    },
    products: {
      title: 'Buy Vinyl Records, CDs & Cassettes Online India | Velorex Music',
      description: 'Browse the full Velorex Music catalogue — vinyl records, audio CDs, cassettes, Blu-rays and DVDs. Hindi and English titles shipped across India.'
    },
    preowned: {
      title: 'Pre-owned Vinyl, CDs & Cassettes | Buy Used Records India',
      description: 'Shop pre-owned vinyl records, audio CDs, cassettes, Blu-rays and DVDs in India. Second-hand and collector copies, condition-checked before dispatch.'
    },
    combos: {
      title: 'Combo Offers | Vinyl Bundles & Starter Kits | Velorex Music',
      description: 'Curated vinyl bundles from Velorex Music — records paired with the care kit to keep them clean, and sets from the same era. Shipped across India.'
    },
    blog: {
      title: 'Velorex Journal | Vinyl, Hindi Film Music & Collecting',
      description: 'Notes on vinyl records, Hindi film music and the pressings worth collecting — from the Velorex Music team in India.'
    },
    cart:    { title: 'Your Cart | Velorex Music',            description: 'Review the items in your Velorex Music cart before checkout.', robots: 'noindex, follow' },
    profile: { title: 'My Account | Velorex Music',           description: 'Manage your Velorex Music orders, addresses and account details.', robots: 'noindex, nofollow' },
    login:   { title: 'Sign In | Velorex Music',              description: 'Sign in to your Velorex Music account to track orders and manage addresses.', robots: 'noindex, follow' },
    signup:  { title: 'Create an Account | Velorex Music',    description: 'Create a Velorex Music account to track orders and check out faster.', robots: 'noindex, follow' },
    forgot:  { title: 'Password Help | Velorex Music',        description: 'Recover access to your Velorex Music account.', robots: 'noindex, follow' }
  };

  // ---------------------------------------------------------------------------
  // Slug + URL construction
  // ---------------------------------------------------------------------------

  function slugify(s) {
    s = String(s == null ? '' : s);
    // Decompose accents then strip the combining marks, so "Café" → "cafe".
    // This is the JS equivalent of the iconv ASCII//TRANSLIT step in PHP.
    if (String.prototype.normalize) {
      s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    s = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (s.length > 80) {
      s = s.slice(0, 80);
      var lastDash = s.lastIndexOf('-');
      if (lastDash > 0) s = s.slice(0, lastDash);
      s = s.replace(/-+$/, '');
    }
    return s || 'item';
  }

  function productPath(product) {
    if (!product || !product.id) return '/products';
    var base = String(product.title || '') + ' ' + String(product.artist || '');
    var slug = slugify(base);
    return '/product/' + product.id + (slug && slug !== 'item' ? '-' + slug : '');
  }

  // Build a path for a (page, params) pair. Always root-absolute — never
  // relative to the current location, which would compound on every navigation
  // once we are already on a nested path like /product/12-x.
  function buildPath(page, params) {
    params = params || {};
    var qs = [];

    if (page === 'product') {
      if (!params.id) return '/products';
      // Prefer the cached product so the URL carries a descriptive slug.
      // On a cold cache we emit the bare /product/<id>, which the server
      // 301s to the canonical form; syncProductUrl() below also upgrades it
      // in place as soon as the detail fetch resolves.
      var cached = null;
      try {
        cached = (Storage.getProducts() || []).find(function (p) { return String(p.id) === String(params.id); }) || null;
      } catch (e) { /* Storage unavailable — fall through to the bare id */ }
      return cached ? productPath(cached) : '/product/' + params.id;
    }

    if (page === 'products') {
      var path;
      var slug = params.cat ? CAT_TO_SLUG[params.cat] : null;
      if (slug) {
        path = '/' + slug;
        // Departments take a subcategory in the facet slot; formats take a
        // language. They can never collide because a category is one or the
        // other, never both.
        if (isDepartment(params.cat)) {
          if (params.sub && SUBCATS[params.cat][params.sub]) path += '/' + params.sub;
        } else if (params.lang && LANGS[params.lang]) {
          // Only hindi/english get a clean facet path; they are the two facets
          // with enough inventory to justify their own indexable page.
          path += '/' + params.lang;
        }
      } else {
        path = '/products';
        if (params.lang && LANGS[params.lang]) qs.push('lang=' + encodeURIComponent(params.lang));
      }
      // Everything else stays a query string: these are filter permutations,
      // not destinations, and robots.txt keeps them out of the crawl.
      if (params.search) qs.push('search=' + encodeURIComponent(params.search));
      if (params.people) qs.push('people=' + encodeURIComponent(params.people));
      if (params.sort)   qs.push('sort=' + encodeURIComponent(params.sort));
      if (slug && params.lang && !LANGS[params.lang]) qs.push('lang=' + encodeURIComponent(params.lang));
      return path + (qs.length ? '?' + qs.join('&') : '');
    }

    // /pre-owned, optionally narrowed to one format: /pre-owned/vinyl-records
    if (page === 'preowned') {
      var pslug = params.cat ? CAT_TO_SLUG[params.cat] : null;
      return pslug ? '/pre-owned/' + pslug : '/pre-owned';
    }
    if (page === 'combos') return '/combos';
    if (page === 'blog') return '/blog';
    if (page === 'blog-post') return params.slug ? '/blog/' + params.slug : '/blog';

    if (page === 'index') return '/';
    return '/' + page;
  }

  // Reverse of buildPath. Returns { page, params } or null when the path is
  // not one we own (in which case the caller falls back to hash parsing).
  function parsePath(pathname, search) {
    var path = String(pathname || '/').replace(/\/+$/, '') || '/';
    var params = {};
    var sp = new URLSearchParams(search || '');
    sp.forEach(function (v, k) { params[k] = k === 'id' ? (parseInt(v, 10) || v) : v; });

    if (path === '/' || path === '/index.html') return { page: 'index', params: params };

    var m = path.match(/^\/product\/(\d+)/);
    if (m) { params.id = parseInt(m[1], 10); return { page: 'product', params: params }; }

    if (path === '/products') return { page: 'products', params: params };

    if (path === '/pre-owned') return { page: 'preowned', params: params };
    var pom = path.match(/^\/pre-owned\/([a-z-]+)$/);
    if (pom && SLUG_TO_CAT[pom[1]]) { params.cat = SLUG_TO_CAT[pom[1]]; return { page: 'preowned', params: params }; }

    if (path === '/combos') return { page: 'combos', params: params };
    if (path === '/blog') return { page: 'blog', params: params };
    var bm = path.match(/^\/blog\/([A-Za-z0-9-]+)$/);
    if (bm) { params.slug = bm[1]; return { page: 'blog-post', params: params }; }

    var parts = path.slice(1).split('/');
    if (SLUG_TO_CAT[parts[0]]) {
      params.cat = SLUG_TO_CAT[parts[0]];
      if (parts[1]) {
        if (isDepartment(params.cat)) {
          // Unknown subcategory is NOT claimed, so it falls through to a 404
          // rather than silently rendering the whole department under a URL
          // the server does not consider canonical.
          if (!SUBCATS[params.cat][parts[1]]) return null;
          params.sub = parts[1];
        } else if (LANGS[parts[1]]) {
          params.lang = parts[1];
        }
      }
      return { page: 'products', params: params };
    }

    if (['cart', 'profile', 'login', 'signup', 'forgot'].indexOf(parts[0]) !== -1) {
      return { page: parts[0], params: params };
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // DOM metadata
  // ---------------------------------------------------------------------------

  function setMeta(selector, attr, value) {
    var el = document.head.querySelector(selector);
    if (!el) {
      el = document.createElement('meta');
      // selector looks like 'meta[name="x"]' or 'meta[property="x"]'
      var parsed = selector.match(/\[(name|property)="([^"]+)"\]/);
      if (!parsed) return;
      el.setAttribute(parsed[1], parsed[2]);
      document.head.appendChild(el);
    }
    el.setAttribute(attr, value);
  }

  function setCanonical(href) {
    var el = document.head.querySelector('link[rel="canonical"]');
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', 'canonical');
      document.head.appendChild(el);
    }
    el.setAttribute('href', href);
  }

  function applyTags(o) {
    if (o.title) {
      document.title = o.title;
      setMeta('meta[property="og:title"]', 'content', o.title);
      setMeta('meta[name="twitter:title"]', 'content', o.title);
    }
    if (o.description) {
      setMeta('meta[name="description"]', 'content', o.description);
      setMeta('meta[property="og:description"]', 'content', o.description);
      setMeta('meta[name="twitter:description"]', 'content', o.description);
    }
    if (o.canonical) {
      setCanonical(o.canonical);
      setMeta('meta[property="og:url"]', 'content', o.canonical);
    }
    if (o.image) {
      setMeta('meta[property="og:image"]', 'content', o.image);
      setMeta('meta[name="twitter:image"]', 'content', o.image);
    }
    setMeta('meta[property="og:type"]', 'content', o.type || 'website');
    setMeta('meta[name="robots"]', 'content',
      o.robots || 'index, follow, max-image-preview:large, max-snippet:-1');
  }

  function absoluteImage(src) {
    src = String(src || '');
    if (!src || src.indexOf('data:') === 0) return ORIGIN + '/src/img/og-default.jpg';
    if (/^https?:\/\//i.test(src)) return src;
    return ORIGIN + '/' + src.replace(/^\/+/, '');
  }

  // Called by router.navigate() on every view change.
  function update(page, params) {
    params = params || {};
    var canonical = ORIGIN + buildPath(page, params);

    // A filtered or searched listing is a permutation of a canonical page, not
    // a page in its own right. Point the canonical at the clean version so
    // ranking signals consolidate there instead of fragmenting across facets.
    if (page === 'products' && (params.search || params.people || params.sort)) {
      var clean = { cat: params.cat, lang: params.lang };
      canonical = ORIGIN + buildPath('products', clean);
    }

    if (page === 'products') {
      var catLabels = {
        vinyl: 'Vinyl Records', cd: 'Audio CDs', cassette: 'Cassettes',
        bluray: 'Blu-ray Movies', dvd: 'DVD Movies',
        merchandise: 'Merchandise', 'vinyl-care': 'Vinyl Care'
      };
      var label = params.cat ? catLabels[params.cat] : null;
      // A department subcategory is the specific thing being sold, so it leads
      // the title ("Buy T-Shirts Online India") rather than the department.
      if (label && isDepartment(params.cat) && params.sub && SUBCATS[params.cat][params.sub]) {
        var subLabel = SUBCATS[params.cat][params.sub];
        applyTags({
          title: 'Buy ' + subLabel + ' Online India | Velorex Music',
          description: 'Shop ' + subLabel.toLowerCase() + ' at Velorex Music. '
            + 'Part of our ' + label.toLowerCase() + ' range, shipped across India.',
          canonical: canonical
        });
        return;
      }
      var langLabel = params.lang && LANGS[params.lang] ? LANGS[params.lang] : null;

      if (label) {
        var full = (langLabel ? langLabel + ' ' : '') + label;
        applyTags({
          title: 'Buy ' + full + ' Online India | Velorex Music',
          description: 'Shop ' + full.toLowerCase() + ' online in India at Velorex Music. '
            + 'Original pressings, collector titles and current releases, delivered pan-India.',
          canonical: canonical,
          robots: params.search ? 'noindex, follow' : undefined
        });
        return;
      }
      applyTags({
        title: params.search
          ? 'Search: ' + params.search + ' | Velorex Music'
          : PAGE_META.products.title,
        description: PAGE_META.products.description,
        canonical: canonical,
        robots: params.search ? 'noindex, follow' : undefined
      });
      return;
    }

    // Product detail starts from whatever the cache knows; syncProductUrl()
    // refines it once the full record arrives.
    if (page === 'product') {
      var p = null;
      try {
        p = (Storage.getProducts() || []).find(function (x) { return String(x.id) === String(params.id); }) || null;
      } catch (e) { /* cold cache */ }
      if (p) { applyProduct(p, canonical); return; }
      applyTags({ title: 'Product | Velorex Music', canonical: canonical, type: 'product' });
      return;
    }

    var meta = PAGE_META[page] || PAGE_META.index;
    applyTags({
      title: meta.title,
      description: meta.description,
      canonical: canonical,
      robots: meta.robots
    });
  }

  function applyProduct(p, canonical) {
    var catLabels = {
      vinyl: 'Vinyl Record', cd: 'Audio CD', cassette: 'Cassette',
      bluray: 'Blu-ray', dvd: 'DVD'
    };
    var catLabel = catLabels[p.category] || 'Music';
    var price = Number(p.price || 0).toLocaleString('en-IN');
    var desc = String(p.description || '').replace(/\s+/g, ' ').trim();
    if (!desc) {
      desc = 'Buy ' + p.title + ' by ' + p.artist + ' on ' + catLabel
        + ' at Velorex Music. ₹' + price + '. '
        + ((p.stock > 0) ? 'In stock and ready to ship across India.' : 'Available to pre-order.');
    } else {
      desc = '₹' + price + ' · ' + desc;
    }
    if (desc.length > 160) desc = desc.slice(0, 157).replace(/\s+\S*$/, '') + '…';

    applyTags({
      title: p.title + ' — ' + p.artist + ' | ' + catLabel + ' | Buy Online India',
      description: desc,
      canonical: canonical || (ORIGIN + productPath(p)),
      image: absoluteImage(p.image),
      type: 'product'
    });
  }

  // Called from initPageProduct() once the full product has been fetched.
  // Upgrades a bare /product/12 to the canonical /product/12-title-artist
  // without adding a history entry, and refreshes the tags with real data.
  function syncProductUrl(product) {
    if (!product || !product.id) return;
    var path = productPath(product);
    applyProduct(product, ORIGIN + path);
    try {
      if (window.location.pathname !== path) {
        window.history.replaceState(
          { page: 'product', params: { id: product.id } },
          '',
          path + window.location.search
        );
      }
    } catch (e) { /* replaceState can throw in exotic sandboxes; tags are what matter */ }
  }

  // Called from renderBlogPost() once the post has been fetched. The listing
  // page and the SPA shell can't know a post's title or cover in advance, so
  // this is what gives a JS-rendering crawler correct per-article metadata.
  function syncBlogPost(post) {
    if (!post || !post.slug) return;
    var url = ORIGIN + '/blog/' + post.slug;
    var desc = String(post.excerpt || '').replace(/\s+/g, ' ').trim();
    if (desc.length > 160) desc = desc.slice(0, 157).replace(/\s+\S*$/, '') + '…';
    applyTags({
      title: post.title + ' | Velorex Journal',
      description: desc,
      canonical: url,
      image: post.coverImage ? absoluteImage(post.coverImage) : undefined,
      type: 'article'
    });
  }

  return {
    ORIGIN: ORIGIN,
    slugify: slugify,
    syncBlogPost: syncBlogPost,
    productPath: productPath,
    buildPath: buildPath,
    parsePath: parsePath,
    update: update,
    syncProductUrl: syncProductUrl,
    CAT_TO_SLUG: CAT_TO_SLUG,
    SLUG_TO_CAT: SLUG_TO_CAT,
    SUBCATS: SUBCATS,
    isDepartment: isDepartment
  };
})();
