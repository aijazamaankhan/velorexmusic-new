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
  // Mirrors VELOREX_SITE_NAME in src/seo/seo-lib.php — productTitle() appends it
  // on both sides and the two must produce the same string.
  var SITE_NAME = 'Velorex Music';

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
    // index MUST match the static tags inside the velorex:seo-head markers in
    // index.html. products MUST match the /products branch of seo-render.php.
    // They differ on purpose: two pages with one title compete with each other.
    index: {
      title: 'Buy Vinyl Records & Cassettes Online in India | Velorex Music',
      description: 'Shop original Bollywood and Hindi film vinyl LPs, new and pre-owned, plus audio cassettes at Velorex Music. Hand-checked and shipped across India.'
    },
    products: {
      title: 'All Products: Vinyl Records, Cassettes & More | Velorex Music',
      description: 'Browse the full Velorex Music catalogue — Bollywood and Hindi film vinyl LPs, pre-owned records and audio cassettes, delivered across India.'
    },
    'not-found': {
      title: 'Page not found | Velorex Music',
      description: 'The page you are looking for is no longer available. Browse our vinyl records and cassettes instead.',
      robots: 'noindex, follow'
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
    // Must stay byte-identical to what seo-render.php's musichistory route
    // injects, or the SPA rewrites the server's tags into different ones on
    // the same URL the moment the page hydrates.
    'music-history': {
      title: 'The Evolution of Music & Audio | History of Recorded Sound',
      description: 'How recorded music worked, from the phonograph and gramophone to vinyl, cassettes, CDs, MP3 and streaming — the dates, the machines and what replaced them.'
    },
    cart:    { title: 'Your Cart | Velorex Music',            description: 'Review the items in your Velorex Music cart before checkout.', robots: 'noindex, follow' },
    profile: { title: 'My Account | Velorex Music',           description: 'Manage your Velorex Music orders, addresses and account details.', robots: 'noindex, nofollow' },
    login:   { title: 'Sign In | Velorex Music',              description: 'Sign in to your Velorex Music account to track orders and manage addresses.', robots: 'noindex, follow' },
    signup:  { title: 'Create an Account | Velorex Music',    description: 'Create a Velorex Music account to track orders and check out faster.', robots: 'noindex, follow' },
    forgot:  { title: 'Password Help | Velorex Music',        description: 'Recover access to your Velorex Music account.', robots: 'noindex, follow' }
  };

  // Category titles + descriptions. MIRRORS velorex_categories() /
  // velorex_category_meta() in src/seo/seo-lib.php, byte for byte: a
  // server-rendered category that the visitor later navigates back to must not
  // be re-titled by the SPA. Guarded by tests/seo-meta-parity.js.
  var CATEGORY_META = {
    'vinyl-records': {
      title: 'Buy Vinyl Records Online in India | Bollywood LPs | Velorex Music',
      description: 'Shop original vinyl records online in India — Bollywood and Hindi film soundtrack LPs from R. D. Burman, A. R. Rahman, Anu Malik and more, new and pre-owned.',
      facets: {
        hindi: {
          title: 'Hindi & Bollywood Vinyl Records | Buy Online in India',
          description: 'Buy Bollywood and Hindi film vinyl records online in India — soundtrack LPs by R. D. Burman, A. R. Rahman, Anu Malik and more. New and pre-owned.'
        }
      }
    },
    'audio-cds': {
      title: 'Buy Audio CDs Online India | Hindi & English Music CDs',
      description: 'Buy audio CDs online in India — Bollywood soundtracks, ghazals, classical and English albums. Sealed and pre-owned music CDs with pan-India delivery.'
    },
    'cassettes': {
      title: 'Buy Audio Cassettes Online in India | Bollywood & Blank Tapes',
      description: 'Shop audio cassettes online in India — Bollywood songs-and-dialogue tapes and blank recording cassettes, delivered across India by Velorex Music.'
    },
    'blu-ray-movies': {
      title: 'Buy Blu-ray Movies Online India | Hindi & English Blu-rays',
      description: 'Buy Blu-ray discs online in India — Bollywood classics, Hindi cinema restorations and English films in HD. Original sealed Blu-rays with pan-India shipping.'
    },
    'dvd-movies': {
      title: 'Buy DVD Movies Online India | Bollywood & English DVDs',
      description: 'Shop DVD movies online in India — Bollywood classics, regional cinema and English films. Original DVDs with pan-India delivery.'
    },
    'merchandise': {
      title: 'Music Merchandise India | Band T-Shirts, Hoodies & Posters',
      description: 'Music merchandise from Velorex Music — band t-shirts, hoodies, caps, tote bags, posters, stickers, mugs, keychains and slipmats. Shipped across India.'
    },
    'vinyl-care': {
      title: 'Vinyl Record Care & Cleaning Products India | Velorex Music',
      description: 'Vinyl record care in India — cleaning brushes and solution, anti-static and outer sleeves, storage boxes, stylus cleaners and record clamps.'
    }
  };
  var CATEGORY_LABELS_BY_SLUG = {
    'vinyl-records': 'Vinyl Records', 'audio-cds': 'Audio CDs', 'cassettes': 'Cassettes',
    'blu-ray-movies': 'Blu-ray Movies', 'dvd-movies': 'DVD Movies',
    'merchandise': 'Merchandise', 'vinyl-care': 'Vinyl Care'
  };

  // cat = DB key ('vinyl'); returns { title, description } or null.
  function categoryMeta(cat, lang, sub) {
    var slug = CAT_TO_SLUG[cat];
    var meta = slug && CATEGORY_META[slug];
    if (!meta) return null;
    var label = CATEGORY_LABELS_BY_SLUG[slug];
    if (sub) {
      var subLabel = SUBCATS[cat] && SUBCATS[cat][sub];
      if (!subLabel) return null;
      return {
        title: 'Buy ' + subLabel + ' Online India | ' + SITE_NAME,
        description: 'Shop ' + subLabel.toLowerCase() + ' at Velorex Music — part of our '
          + label.toLowerCase() + ' range, shipped across India.'
      };
    }
    if (lang) {
      if (!LANGS[lang]) return null;
      if (meta.facets && meta.facets[lang]) return meta.facets[lang];
      var h1 = LANGS[lang] + ' ' + label;
      return {
        title: 'Buy ' + h1 + ' Online India | ' + SITE_NAME,
        description: 'Shop ' + LANGS[lang].toLowerCase() + ' ' + label.toLowerCase()
          + ' online in India at Velorex Music. Original releases and collector titles, delivered pan-India.'
      };
    }
    return { title: meta.title, description: meta.description };
  }

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
    if (page === 'combo') return params.slug ? '/combos/' + params.slug : '/combos';
    if (page === 'blog') return '/blog';
    if (page === 'blog-post') return params.slug ? '/blog/' + params.slug : '/blog';
    // The history section. `era` is a real query parameter rather than a path
    // segment: it selects a panel on one page, it is not a page of its own, and
    // giving it a path would create nine URLs for one document.
    if (page === 'music-history') {
      return params.era ? '/music-history?era=' + encodeURIComponent(params.era) : '/music-history';
    }
    if (page === 'music-history-article') {
      return params.slug ? '/music-history/' + params.slug : '/music-history';
    }

    if (page === 'artist') return params.slug ? '/artists/' + params.slug : '/vinyl-records';
    if (page === 'index') return '/';
    // A 404 stays on the URL that was requested; see parsePageFromUrl().
    if (page === 'not-found') return params.path || '/';
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
    if (path.indexOf('/combos/') === 0) {
      params.slug = path.slice(8);
      return { page: 'combo', params: params };
    }
    if (path === '/blog') return { page: 'blog', params: params };
    var bm = path.match(/^\/blog\/([A-Za-z0-9-]+)$/);
    if (bm) { params.slug = bm[1]; return { page: 'blog-post', params: params }; }

    var am = path.match(/^\/artists\/([a-z0-9-]+)$/);
    if (am) { params.slug = am[1]; return { page: 'artist', params: params }; }

    if (path === '/music-history') return { page: 'music-history', params: params };
    var mh = path.match(/^\/music-history\/([a-z0-9-]+)$/);
    if (mh) { params.slug = mh[1]; return { page: 'music-history-article', params: params }; }

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
  // Product <title> construction
  // ---------------------------------------------------------------------------
  //
  // MIRRORED IN PHP: velorex_product_title() in src/seo/seo-lib.php. The header
  // there carries the full rationale. Both sides run their containment test
  // through slugify(), whose cross-language parity is already enforced, so the
  // two implementations cannot drift on casing, punctuation or accents.
  //
  // The old pair disagreed outright: PHP said "Vinyl Records" and JS said
  // "Vinyl Record" for the same product, so hydration silently rewrote the
  // server's title on every product page.

  // Singular per-item labels. The plural forms name category PAGES; one record
  // is a "Vinyl Record". Departments get none — "Merchandise" is not a format.
  var FORMAT_LABELS = {
    vinyl: 'Vinyl Record', cd: 'Audio CD', cassette: 'Cassette',
    bluray: 'Blu-ray', dvd: 'DVD'
  };
  // Plural page labels, matching velorex_categories() in seo-lib.php. Used only
  // by the generated fallback description, which must also agree across the two
  // implementations.
  var CATEGORY_LABELS = {
    vinyl: 'Vinyl Records', cd: 'Audio CDs', cassette: 'Cassettes',
    bluray: 'Blu-ray Movies', dvd: 'DVD Movies',
    merchandise: 'Merchandise', 'vinyl-care': 'Vinyl Care'
  };

  var TITLE_SOFT_LIMIT = 60;

  function titleContains(haystack, needle) {
    var n = slugify(needle);
    return n !== '' && slugify(haystack).indexOf(n) !== -1;
  }

  // The artist column is free text and sometimes holds a whole cast list; take
  // the first name, which is both the strongest search term and the reason the
  // longest live title reached 225 characters.
  function primaryArtist(artist) {
    var first = String(artist == null ? '' : artist).trim().split(/\s*[,;\/]\s*|\s+&\s+/)[0] || '';
    return first.replace(/\s+/g, ' ').trim();
  }

  function productTitle(p) {
    var name = String((p && p.title) || '').replace(/\s+/g, ' ').trim();
    if (!name) return SITE_NAME;

    var artist = primaryArtist(p && p.artist);
    var format = FORMAT_LABELS[p && p.category] || '';

    // Core: never dropped, because these are the terms people search.
    var title = name;
    if (artist && !titleContains(title, artist)) title += ' — ' + artist;

    // Tail: added only while it fits. Whole parts are dropped, never cut.
    if (format && !titleContains(title, format)
        && (title + ' | ' + format).length <= TITLE_SOFT_LIMIT) {
      title += ' | ' + format;
    }
    if ((title + ' | ' + SITE_NAME).length <= TITLE_SOFT_LIMIT) {
      title += ' | ' + SITE_NAME;
    }
    return title;
  }

  // ---------------------------------------------------------------------------
  // Product meta description
  // ---------------------------------------------------------------------------
  //
  // MIRRORED IN PHP: velorex_product_meta_description() in src/seo/seo-lib.php.
  // Real fields only, then as much of the free-text description as fits, never
  // over 160 characters — see the PHP header. Guarded by
  // tests/seo-meta-parity.js.

  var FORMAT_PHRASES = { vinyl: 'vinyl', cd: 'CD', cassette: 'cassette', bluray: 'Blu-ray', dvd: 'DVD' };

  function collapseWs(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').replace(/^ | $/g, '');
  }

  function inr(n) {
    n = Math.trunc(Number(n) || 0);
    var s = String(Math.abs(n));
    if (s.length > 3) {
      var last3 = s.slice(-3);
      var rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
      s = rest + ',' + last3;
    }
    return (n < 0 ? '-' : '') + s;
  }

  function fitWords(prefix, text, max) {
    text = collapseWs(text);
    if (!text) return prefix;
    var full = prefix === '' ? text : prefix + ' ' + text;
    if (full.length <= max) return full;
    var out = prefix, added = false, words = text.split(' ');
    for (var i = 0; i < words.length; i++) {
      var cand = out === '' ? words[i] : out + ' ' + words[i];
      if (cand.length > max - 1) break;
      out = cand;
      added = true;
    }
    if (!added) return prefix;
    return out.replace(/[\s,.;:–—-]+$/, '') + '…';
  }

  function productDescription(p) {
    var max = 160;
    var name = collapseWs(p && p.title);
    var artist = primaryArtist(p && p.artist);
    var fmt = FORMAT_PHRASES[p && p.category] || '';
    var used = (p && p.condition) === 'pre-owned';

    var lead = 'Buy ' + name;
    if (artist && !titleContains(name, artist)) lead += ' by ' + artist;
    var saidUsed = false;
    if (fmt && !titleContains(name, fmt)) {
      lead += ' on ' + (used ? 'pre-owned ' : '') + fmt;
      saidUsed = used;
    }
    lead += '.';

    var specs = (p && p.specs && typeof p.specs === 'object') ? p.specs : {};
    var label = collapseWs(specs.label);
    var year = collapseWs(specs.year);
    var facts = [];
    if (label && year) facts.push('Label: ' + label + ' (' + year + ').');
    else if (label) facts.push('Label: ' + label + '.');
    else if (year) facts.push('Year: ' + year + '.');
    if (used && !saidUsed) facts.push('Pre-owned.');

    var stock = parseInt(p && p.stock, 10) || 0;
    var avail = stock > 0 ? 'in stock, shipped across India.'
      : ((p && p.badge) === 'upcoming' ? 'coming soon.' : 'currently out of stock.');
    var tail = '₹' + inr(p && p.price) + ' — ' + avail;

    var core = [lead].concat(facts, [tail]).join(' ');
    if (core.length > max) core = lead + ' ' + tail;
    if (core.length > max) return fitWords('', core, max);
    return fitWords(core, p && p.description, max);
  }

  // ---------------------------------------------------------------------------
  // Collection rules — MIRRORS of src/seo/seo-lib.php, guarded by
  // tests/seo-meta-parity.js. The server applies them on a landing; these make
  // a client-side navigation reach the same indexing decision.
  // ---------------------------------------------------------------------------
  var FACET_MIN_PRODUCTS = 6; // VELOREX_FACET_MIN_PRODUCTS

  function facetStatus(facetCount, parentCount) {
    if (facetCount > 0 && facetCount >= parentCount) return 'duplicate';
    if (facetCount < FACET_MIN_PRODUCTS) return 'thin';
    return 'index';
  }

  // formats = DB category keys with pre-owned stock; catSlug = format page or null.
  function preownedMeta(formats, catSlug) {
    var label = catSlug && CATEGORY_LABELS_BY_SLUG[catSlug];
    if (label) {
      return {
        title: 'Pre-owned ' + label + ' | Buy Used ' + label + ' Online India',
        description: 'Shop pre-owned ' + label.toLowerCase() + ' in India at Velorex Music. Second-hand and collector copies, condition-checked before dispatch, with pan-India delivery.',
        h1: 'Pre-owned ' + label
      };
    }
    var uniq = [];
    (formats || []).forEach(function (f) { if (uniq.indexOf(f) === -1) uniq.push(f); });
    if (uniq.length === 1 && uniq[0] === 'vinyl') {
      return {
        title: 'Pre-owned Vinyl Records | Buy Used LPs Online in India',
        description: 'Pre-owned Bollywood and Hindi film vinyl LPs, including first editions and 2LP sets — each copy condition-checked before dispatch and shipped across India.',
        h1: 'Pre-owned Vinyl Records'
      };
    }
    return {
      title: 'Pre-owned Vinyl, CDs & Cassettes | Buy Used Records India',
      description: 'Shop pre-owned vinyl records, audio CDs, cassettes, Blu-rays and DVDs in India. Second-hand and collector copies, condition-checked before dispatch.',
      h1: 'Pre-owned'
    };
  }

  // Composer page count line — mirrors velorex_artist_count_line().
  function artistCountLine(count, inStock) {
    var noun = count === 1 ? 'record' : 'records';
    if (inStock === count) return count + ' ' + noun + ' on the shelf, all in stock';
    return count + ' ' + noun + ' on the shelf · ' + inStock + ' in stock';
  }

  function cachedProducts() {
    try { return Storage.getProducts() || []; } catch (e) { return []; }
  }

  // Image alt text from real fields — mirrors velorex_product_image_alt().
  // n > 1 marks further gallery images.
  function productImageAlt(p, n) {
    var name = collapseWs(p && p.title);
    var artist = primaryArtist(p && p.artist);
    var fmt = FORMAT_LABELS[p && p.category] || '';
    var alt = name;
    if (artist && !titleContains(name, artist)) alt += ' by ' + artist;
    if (fmt && !titleContains(name, fmt)) alt += ' – ' + fmt;
    if (n > 1) alt += ' (image ' + n + ')';
    return alt;
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
    // Must match the default in velorex_meta_block() (src/seo/seo-lib.php) and
    // the static one in index.html, or hydration silently rewrites the robots
    // directive the server sent.
    setMeta('meta[name="robots"]', 'content',
      o.robots || 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
  }

  function absoluteImage(src) {
    src = String(src || '');
    if (!src || src.indexOf('data:') === 0) return ORIGIN + '/src/img/og-default.jpg';
    if (/^https?:\/\//i.test(src)) return src;
    return ORIGIN + '/' + src.replace(/^\/+/, '');
  }

  // seo-render.php stamps <meta name="velorex-ssr" content="<path>"> on every
  // page it renders. The router calls update() once during boot for the page
  // the browser landed on, and that call used to overwrite tags the server had
  // already set correctly — replacing an empty category's "noindex, follow"
  // with "index, follow", and rewriting server titles to different strings.
  // Since Googlebot indexes the rendered DOM, that undid the server's work.
  //
  // So the first update() is skipped when the marker matches the current path.
  // Only the first: every later call is a real client-side navigation to a page
  // the server never rendered, and must update the tags.
  // Read lazily, NOT at module-eval time: seo-render.php injects its block
  // immediately before </head>, which is after this script's own tag, so at the
  // moment this file executes the parser has not reached the marker yet and the
  // lookup would always return null.
  var _ssrHonoured = false;
  function ssrRenderedPath() {
    var m = document.head.querySelector('meta[name="velorex-ssr"]');
    return m ? m.getAttribute('content') : null;
  }

  // Called by router.navigate() on every view change.
  function update(page, params) {
    if (!_ssrHonoured) {
      _ssrHonoured = true;
      var ssr = ssrRenderedPath();
      if (ssr && ssr === window.location.pathname) return;
    }
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
      var cm = params.cat
        ? categoryMeta(params.cat,
            !isDepartment(params.cat) && LANGS[params.lang] ? params.lang : null,
            isDepartment(params.cat) && params.sub ? params.sub : null)
        : null;
      if (cm) {
        var robots = params.search ? 'noindex, follow' : undefined;
        // Language facet: same rule as the server (velorex_facet_status).
        if (!isDepartment(params.cat) && LANGS[params.lang]) {
          var all = cachedProducts();
          var parentN = all.filter(function (p) { return p.category === params.cat; }).length;
          var facetN = all.filter(function (p) {
            return p.category === params.cat && String(p.language || '').trim().toLowerCase() === params.lang;
          }).length;
          if (parentN > 0) {
            var fs = facetStatus(facetN, parentN);
            if (fs === 'duplicate') canonical = ORIGIN + buildPath('products', { cat: params.cat });
            else if (fs === 'thin') robots = 'noindex, follow';
          }
        }
        applyTags({
          title: cm.title,
          description: cm.description,
          canonical: canonical,
          robots: robots
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

    // A history article carries its own title and description in the content
    // library, so PAGE_META cannot hold them — the same situation as a blog
    // post. initPageMusicHistoryArticle() passes the loaded article through.
    if (page === 'music-history-article') {
      var a = params.article;
      if (a && a.metaTitle) {
        applyTags({
          title: a.metaTitle,
          description: a.metaDescription,
          canonical: canonical,
          type: 'article'
        });
        return;
      }
      // Called before the article has loaded. Anything invented here would be
      // wrong for eleven of the twelve topics, so fall back to the hub's copy
      // and let the real tags land when the content arrives.
      applyTags({
        title: PAGE_META['music-history'].title,
        description: PAGE_META['music-history'].description,
        canonical: canonical,
        type: 'article'
      });
      return;
    }

    // Pre-owned: copy follows the formats actually in second-hand stock, and a
    // format page that holds all of it canonicalises to the hub — as on the server.
    if (page === 'preowned') {
      var formats = [];
      cachedProducts().forEach(function (p) {
        if (p.condition === 'pre-owned' && formats.indexOf(p.category) === -1) formats.push(p.category);
      });
      var pslug = params.cat ? CAT_TO_SLUG[params.cat] : null;
      var pm = preownedMeta(formats, pslug);
      applyTags({
        title: pm.title,
        description: pm.description,
        canonical: (pslug && formats.length === 1 && formats[0] === params.cat)
          ? ORIGIN + '/pre-owned' : canonical
      });
      return;
    }

    // Composer collection: real tags arrive with the data (syncArtist); until
    // then, a neutral title rather than one borrowed from another page.
    if (page === 'artist') {
      applyTags({ title: 'Vinyl Records | Velorex Music', canonical: canonical });
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
    applyTags({
      title: productTitle(p),
      description: productDescription(p),
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
  // Mirrors velorex_blog_meta_title() / velorex_blog_meta_description().
  function blogMetaTitle(title, metaTitle) {
    var m = collapseWs(metaTitle);
    if (m) return m;
    var t = collapseWs(title);
    var withSuffix = t + ' | Velorex Journal';
    return withSuffix.length <= TITLE_SOFT_LIMIT ? withSuffix : t;
  }
  function blogMetaDescription(excerpt, metaDescription) {
    var m = collapseWs(metaDescription);
    return fitWords('', m || excerpt || '', 160);
  }

  function syncBlogPost(post) {
    if (!post || !post.slug) return;
    var url = ORIGIN + '/blog/' + post.slug;
    applyTags({
      title: blogMetaTitle(post.title, post.metaTitle),
      description: blogMetaDescription(post.excerpt, post.metaDescription),
      canonical: url,
      image: post.coverImage ? absoluteImage(post.coverImage) : undefined,
      type: 'article'
    });
  }

  // Called by initPageArtist() with the API payload (same strings the server
  // renders from velorex_artist_collections()).
  function syncArtist(a) {
    if (!a || !a.slug) return;
    applyTags({
      title: a.title,
      description: a.description,
      canonical: ORIGIN + '/artists/' + a.slug,
      robots: a.indexable ? undefined : 'noindex, follow'
    });
  }

  // A combo's title and description only exist after its fetch resolves, so
  // PAGE_META cannot cover it — same situation as a blog post.
  function syncCombo(combo) {
    if (!combo || !combo.slug) return;
    var desc = String(combo.description || '').replace(/\s+/g, ' ').trim();
    if (!desc) {
      desc = combo.itemCount + ' items bundled together by Velorex Music, '
        + 'bought as a set at their normal prices. Shipped across India.';
    }
    if (desc.length > 160) desc = desc.slice(0, 157).replace(/\s+\S*$/, '') + '…';
    applyTags({
      title: combo.title + ' | Combo Offer | Velorex Music',
      description: desc,
      canonical: ORIGIN + '/combos/' + combo.slug,
      image: combo.image ? absoluteImage(combo.image) : undefined
    });
  }

  return {
    ORIGIN: ORIGIN,
    slugify: slugify,
    productTitle: productTitle,
    productDescription: productDescription,
    productImageAlt: productImageAlt,
    blogMetaTitle: blogMetaTitle,
    blogMetaDescription: blogMetaDescription,
    facetStatus: facetStatus,
    preownedMeta: preownedMeta,
    artistCountLine: artistCountLine,
    syncArtist: syncArtist,
    categoryMeta: categoryMeta,
    CATEGORY_LABELS: CATEGORY_LABELS,
    syncBlogPost: syncBlogPost,
    syncCombo: syncCombo,
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
