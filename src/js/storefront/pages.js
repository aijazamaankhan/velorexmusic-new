/* =============================================================================
   Velorex Music — storefront page inits + renderers
   Used by: index.html

   The application layer of the storefront. Everything that's not framework
   (router.js), payments (checkout.js), or carrier metadata (carriers.js).

   Major sections (search by header):
     - createProductCard (shared card renderer for index/products/related)
     - initPageLogin + initPageSignup + handleCustomerLogin/Signup/Logout
     - initPageIndex (home)
     - initPageProducts + helpers (updateCountsProducts, filterPeopleOptions,
       renderActiveFiltersProducts, setView, openProduct)
     - initPageProduct + renderProductDetail + renderRelatedProducts +
       handleAddToCartDetail + handleBuyNowDetail
     - initPageCart (the cart page)
     - initPageProfile + populateProfileFromUser + renderAddressesSPA +
       addressCard + setDefaultAddress + saveProfile + handleChangePassword +
       showTab + renderWishlistSPA + filterOrders + renderOrdersSPA +
       renderOrdersStepper + normalizeCustomerOrderStatus +
       CUSTOMER_STATUS_* constants
     - fixProductLinks (post-render link rewiring)

   PEOPLE_LABELS lives in src/js/constants.js (loaded earlier).

   Cross-module touch points (resolved at runtime via script-scope):
     - All the leaf helpers from src/js/ (Utils, Auth, Storage, Addresses,
       CartHelpers, COUNTRIES, IN_STATES, PEOPLE_LABELS, showToast,
       openConfirmDialog, openAddressModal, ...)
     - navigate, currentPage, currentParams, CURRENT_USER_ORDERS, _detailQty,
       _detailMax — from router.js
     - carrierBadgeHtml, carrierTrackingUrl — from carriers.js
     - All checkout entry points — from checkout.js
   ============================================================================= */

    // Facet values are compared case-insensitively everywhere.
    //
    // The admin form is free text and the DB collation is *_ci, so the same
    // facet arrives in several casings — the live catalogue holds both "hindi"
    // and "Hindi". MySQL does not care (seo-render.php's `WHERE language = :l`
    // matched all of them), but JS `===` does, so the server-rendered
    // /vinyl-records/hindi listed 65 products and the SPA cut it to 56 the
    // instant it booted. Those nine also rendered a "English" pill on their
    // card. Normalise on read rather than rewriting the rows: this keeps
    // working whatever casing the next admin entry uses.
    function facetVal(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

    // products.artist is free text and frequently holds a CREDIT LIST rather
    // than one act — "Lata Mangeshkar, Mukesh", "Kishore Kumar, Asha Bhosle".
    // Treating the whole string as one facet value produced a filter row per
    // combination, so "Lata Mangeshkar" appeared three times attached to three
    // different co-singers and never once on its own, each with a count of 1.
    //
    // Split on commas and on explicit featuring markers ONLY. Deliberately NOT
    // on "&" or "/": those are inside real single acts (Simon & Garfunkel,
    // AC/DC, Hall & Oates) and splitting them would invent artists who do not
    // exist. A comma is the one separator that is never part of a band name.
    function splitArtists(raw) {
      return String(raw == null ? '' : raw)
        .split(/,|feat\.?|ft\.?|featuring/i)
        .map(function (x) { return x.trim(); })
        .filter(Boolean);
    }

    // The case-folded keys a product should match against in the artist facet.
    function artistKeys(p) {
      return splitArtists(p && p.artist).map(facetVal).filter(Boolean);
    }

    function createProductCard(product) {
      const badgeHtml = product.badge ? `<span class="product-badge badge-${product.badge}"><i class="fas fa-${product.badge === 'hot' ? 'fire' : product.badge === 'new' ? 'sparkles' : product.badge === 'upcoming' ? 'clock' : 'tag'}"></i> ${Utils.escape(product.badge === 'hot' ? 'Hot' : product.badge === 'new' ? 'New' : product.badge === 'upcoming' ? 'Soon' : 'Sale')}</span>` : '';
      const stars = '<i class="fas fa-star" style="color:var(--accent);"></i>'.repeat(Math.round(product.rating)) + '<i class="far fa-star" style="color:var(--accent);"></i>'.repeat(5 - Math.round(product.rating));
      const priceHtml = product.originalPrice ? `<span class="product-price">₹${product.price.toLocaleString()}</span><span class="product-price-original">₹${product.originalPrice.toLocaleString()}</span>` : `<span class="product-price">₹${product.price.toLocaleString()}</span>`;
      const catLabel = product.category === 'vinyl' ? '<i class="fas fa-compact-disc"></i> Vinyl' : product.category === 'cd' ? '<i class="fas fa-compact-disc"></i> CD' : product.category === 'cassette' ? '<i class="fas fa-tape"></i> Cassette' : product.category === 'bluray' ? '<i class="fas fa-film"></i> Blu-ray' : '<i class="fas fa-film"></i> DVD';
      // Only a language the product actually records. Anything that was not
      // 'hindi' used to be labelled English, including the rows with no language
      // at all — a false fact on the card.
      const langKey = facetVal(product.language);
      const langLabel = langKey === 'hindi' ? '<i class="fas fa-globe"></i> Hindi'
        : langKey === 'english' ? '<i class="fas fa-earth-americas"></i> English' : '';
      // Three image states:
      //   1. image is a real string         → render <img>
      //   2. image missing + not synced yet → render skeleton (stripped cache;
      //      the bg sync will re-render with real data)
      //   3. image missing + synced         → render <img> with onerror →
      //      unsplash fallback (this product genuinely has no image on the
      //      server; the previous "always skeleton if missing" rule made the
      //      shimmer linger forever for these products).
      //
      // Storage._memory is null until syncFromServer() resolves successfully,
      // then becomes an array — that's our "synced" signal.
      const hasImage = typeof product.image === 'string' && product.image.length > 0;
      const synced = Array.isArray(Storage._memory);
      const imageHtml = hasImage
        ? `<img src="${product.image}" alt="${Utils.escape(Seo.productImageAlt(product))}" loading="lazy" decoding="async" onerror="this.src='https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=400&h=400&fit=crop'">`
        : (synced
            // No photo on file: a stock placeholder, so alt="" — naming the record
            // on it would describe an image that is not the record (matches
            // velorex_render_card() in seo-render.php).
            ? `<img src="https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=400&h=400&fit=crop" alt="" loading="lazy" decoding="async">`
            : `<div class="skeleton skeleton-card-image" aria-label="Loading image"></div>`);
      // Real href to the product's canonical path. Crawlers discover products
      // by following <a href> — they do not fire onclick handlers, so while
      // these were href="#" the entire catalogue was undiscoverable. The
      // onclick still returns false so users keep the SPA transition, and
      // middle-click / "open in new tab" now work as well.
      const href = Seo.productPath(product);
      // Condition chip. Sits alongside the existing hot/new/upcoming badge
      // rather than replacing it — they answer different questions ("is this
      // featured?" vs "is this second-hand?") and a product can be both.
      const condHtml = product.condition === 'pre-owned'
        ? '<span class="product-badge badge-preowned">Pre-owned</span>'
        : '';
      // Descriptive alt text: "<title> — <artist> <format>" reads naturally and
      // is what Google Images matches against for cover-art queries.
      const altText = Utils.escape(Seo.productImageAlt(product));
      // Add to Cart is the primary action on the card now, with the detail page
      // one tap away on the eye. The old hover-only quick actions duplicated
      // both and never appeared at all on a touch screen, so they are gone.
      //
      // A sold-out card says so on a disabled button instead of offering an
      // add that CartHelpers' stock guard would only refuse with a toast.
      // "upcoming" with no stock is a pre-order in waiting, not a dead item.
      const soldOut = Number(product.stock) < 1;
      const cartBtn = soldOut
        ? `<button type="button" class="btn btn-secondary btn-sm product-card-cart" disabled>${product.badge === 'upcoming' ? '<i class="fas fa-clock"></i> Coming Soon' : 'Out of Stock'}</button>`
        : `<button type="button" class="btn btn-primary btn-sm product-card-cart" onclick="CartHelpers.addToCart(${product.id})"><i class="fas fa-cart-shopping"></i> Add<span class="product-card-cart-long"> to Cart</span></button>`;
      return `
      <div class="product-card" data-id="${product.id}">
        <div class="product-card-image">
          <a href="${href}" onclick="navigate('product',{id:${product.id}});return false;" aria-label="${altText}">${imageHtml}</a>
          ${badgeHtml}
          ${condHtml}
        </div>
        <div class="product-card-body">
          <div class="product-category-tag">${catLabel}${langLabel ? ' · ' + langLabel : ''}</div>
          <h3 class="product-title"><a href="${href}" onclick="navigate('product',{id:${product.id}});return false;">${Utils.escape(product.title)}</a></h3>
          <p class="product-artist">${Utils.escape(product.artist)}</p>
          <div class="product-rating" data-reviews="${Number(product.reviews) || 0}"><span class="stars">${stars}</span><span class="rating-count">(${product.reviews})</span></div>
          <div class="product-price-row">
            <div>${priceHtml}</div>
          </div>
        </div>
        <div class="product-card-footer">
          ${cartBtn}
          <a href="${href}" onclick="navigate('product',{id:${product.id}});return false;" class="product-card-view" title="View details" aria-label="View details: ${altText}"><i class="fas fa-eye"></i></a>
        </div>
      </div>`;
    }

    // ---- Page banners ---------------------------------------------------------
    // The accented half of a banner heading. MUST match
    // velorex_banner_title_html() in seo-render.php, or a server-rendered page
    // re-colours its own heading the instant the SPA boots.
    //   "Hindi Vinyl Records" (language page) → the language: [Hindi] Vinyl Records
    //   "Combo Offers"                        → the last word: Combo [Offers]
    //   "Pre-owned", "T-Shirts"               → after the hyphen: Pre-[owned]
    //   "Merchandise"                         → the second half: Merch[andise]
    //   anything shorter than 8 letters       → no accent
    // Only the colour changes — the spans add no characters, so the heading's
    // text (what a screen reader and a crawler read) is untouched.
    function heroTitleHtml(text, accentLead) {
      var t = String(text == null ? '' : text).trim();
      var e = Utils.escape;
      var sp = t.indexOf(' ');
      if (accentLead && sp > 0) return '<span>' + e(t.slice(0, sp)) + '</span>' + e(t.slice(sp));
      var lastSp = t.lastIndexOf(' ');
      if (lastSp > 0) return e(t.slice(0, lastSp + 1)) + '<span>' + e(t.slice(lastSp + 1)) + '</span>';
      var hy = t.lastIndexOf('-');
      if (hy > 0 && hy < t.length - 1) return e(t.slice(0, hy + 1)) + '<span>' + e(t.slice(hy + 1)) + '</span>';
      if (t.length >= 8) {
        var half = Math.floor(t.length / 2);
        return e(t.slice(0, half)) + '<span>' + e(t.slice(half)) + '</span>';
      }
      return e(t);
    }

    // Copy for the Music variant's description, by format. The server render
    // puts the longer SEO intro from seo-lib.php here instead, and that is kept
    // on first boot (see renderProductsBanner) — this only runs on client-side
    // navigation.
    var MUSIC_BANNER_NOUNS = {
      vinyl: 'vinyl records', cd: 'audio CDs', cassette: 'cassettes',
      bluray: 'Blu-ray movies', dvd: 'DVD movies'
    };
    var DEPARTMENT_BANNER_DESC = {
      merchandise: 'Explore exclusive merchandise inspired by legendary artists, iconic albums and timeless sounds.',
      'vinyl-care': 'Everything you need to clean, protect and preserve your vinyl records — because great music deserves a longer life.'
    };
    var LANG_ADJECTIVES = { hindi: 'Hindi', english: 'English' };

    function isDepartmentCat(cat) { return !!(cat && Seo.SUBCATS && Seo.SUBCATS[cat]); }

    // The shelf a route stands for, before any sidebar filter: the routed
    // category (and language). The banner's counts describe this, and on a
    // department it is also what the sidebar's options are built from.
    function routeBaseProducts(all, params) {
      params = params || {};
      return all.filter(function (p) {
        if (params.cat && facetVal(p.category) !== facetVal(params.cat)) return false;
        if (params.sub && facetVal(p.subcategory) !== facetVal(params.sub)) return false;
        if (params.lang && facetVal(p.language) !== facetVal(params.lang)) return false;
        return true;
      });
    }

    // Heading = the product page's h1 and the banner around it. Also mirrored
    // by the category route in seo-render.php (heading text, accent, data-banner,
    // stats markup).
    function renderProductsBanner(params, allProducts) {
      params = params || {};
      var banner = document.getElementById('products-banner');
      var dept = isDepartmentCat(params.cat);
      if (banner) banner.setAttribute('data-banner', dept ? params.cat : 'music');

      var subLabel = dept ? (Seo.SUBCATS[params.cat] || {})[params.sub] : null;
      var lang = !dept && params.cat ? LANG_ADJECTIVES[params.lang] : null;
      var heading = subLabel
        || (params.cat ? (lang ? lang + ' ' : '') + catLabel(params.cat) : 'All Products');
      var pt = document.getElementById('page-title');
      if (pt) pt.innerHTML = heroTitleHtml(heading, !!lang);

      var desc = document.getElementById('page-banner-desc');
      if (desc) {
        // The server wrote this route's unique SEO intro (data-ssr). Keep it
        // for as long as the visitor is on THAT path — including the re-render
        // after the background product sync, which used to overwrite it with
        // the generic sentence below. That swap shifted the page and left the
        // rendered DOM (what Google indexes) with the weaker copy.
        if (desc.hasAttribute('data-ssr')) {
          desc.setAttribute('data-ssr-path', location.pathname);
          desc.removeAttribute('data-ssr');
        }
        if (desc.getAttribute('data-ssr-path') === location.pathname) {
          /* keep the server's intro */
        } else if (dept) {
          desc.removeAttribute('data-ssr-path');
          desc.textContent = DEPARTMENT_BANNER_DESC[params.cat];
        } else {
          desc.removeAttribute('data-ssr-path');
          var noun = MUSIC_BANNER_NOUNS[params.cat] || 'records, CDs, cassettes and films';
          desc.textContent = 'Rediscover timeless melodies. Explore our curated collection of '
            + (lang ? lang + ' ' : '') + noun + ' from legendary artists and iconic films.';
        }
      }

      var stats = document.getElementById('page-banner-stats');
      if (stats && !dept) {
        // Cold cache on first boot: leave whatever is there (the server's real
        // counts) rather than blanking the row and re-growing it after the
        // sync — that blank-then-fill was a measured layout shift.
        if (!allProducts || !allProducts.length) return;
        var base = routeBaseProducts(allProducts, params);
        var artists = {};
        base.forEach(function (p) { artistKeys(p).forEach(function (k) { artists[k] = true; }); });
        var film = params.cat === 'bluray' || params.cat === 'dvd' || !params.cat;
        stats.innerHTML = bannerStatsHtml(base.length, Object.keys(artists).length, film ? 'Titles' : 'Albums');
      }
    }

    // Mirrors velorex_banner_stats_html() in seo-render.php.
    function bannerStatsHtml(titles, artists, titleNoun) {
      var item = function (icon, strong, small) {
        return '<li class="page-banner-feature"><i class="fas ' + icon + '" aria-hidden="true"></i>'
          + '<div><strong>' + strong + '</strong><small>' + small + '</small></div></li>';
      };
      return item('fa-compact-disc', titles.toLocaleString('en-IN'), titles === 1 ? titleNoun.replace(/s$/, '') : titleNoun)
        + item('fa-users', artists.toLocaleString('en-IN'), artists === 1 ? 'Artist' : 'Artists')
        + item('fa-star', 'Vintage', 'Sound, Forever');
    }

    // ---- Catalogue empty state -------------------------------------------------
    // Mirrors velorex_catalog_empty_html() in seo-render.php (the "unstocked"
    // variant — a server render never has filters applied). Styles in
    // src/styles/components/catalog-empty.css, which explains why the two
    // variants must never share a message.
    function catalogEmptyArt() {
      return '<svg class="catalog-empty-art" viewBox="0 0 240 190" aria-hidden="true" focusable="false">'
        + '<defs>'
        + '<radialGradient id="ceGlow" cx="50%" cy="58%" r="52%"><stop offset="0" stop-color="#ff6b35" stop-opacity="0.32"/><stop offset="1" stop-color="#ff6b35" stop-opacity="0"/></radialGradient>'
        + '<linearGradient id="ceBoxL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#57506f"/><stop offset="1" stop-color="#2c2939"/></linearGradient>'
        + '<linearGradient id="ceBoxR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#433d58"/><stop offset="1" stop-color="#211f2b"/></linearGradient>'
        + '</defs>'
        + '<ellipse cx="120" cy="104" rx="112" ry="84" fill="url(#ceGlow)"/>'
        + '<path d="M60 110 42 90 102 74 120 92Z" fill="#3b3650"/>'
        + '<path d="M180 110 198 90 138 74 120 92Z" fill="#332f45"/>'
        + '<path d="M60 110 120 92 180 110 120 128Z" fill="#14121b"/>'
        + '<g class="ce-disc">'
        + '<circle cx="120" cy="80" r="44" fill="#0f0e14" stroke="#2e2b39" stroke-width="1.5"/>'
        + '<circle cx="120" cy="80" r="36" fill="none" stroke="#ffffff" stroke-opacity="0.07"/>'
        + '<circle cx="120" cy="80" r="29" fill="none" stroke="#ffffff" stroke-opacity="0.06"/>'
        + '<circle cx="120" cy="80" r="16" fill="#ff6b35"/>'
        + '<circle cx="120" cy="80" r="3" fill="#0f0e14"/>'
        + '<path d="M91 56a38 38 0 0 1 22-13" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="2.5" stroke-linecap="round"/>'
        + '</g>'
        + '<path d="M60 110 120 128 120 180 60 160Z" fill="url(#ceBoxL)"/>'
        + '<path d="M180 110 120 128 120 180 180 160Z" fill="url(#ceBoxR)"/>'
        + '<path d="M60 110 120 128 101 147 39 127Z" fill="#625b7c"/>'
        + '<path d="M180 110 120 128 139 147 201 127Z" fill="#4d4764"/>'
        + '<path d="M60 110 120 128 180 110" fill="none" stroke="#ff6b35" stroke-opacity="0.55" stroke-width="1.5"/>'
        + '<g fill="#ff8a4c">'
        + '<g class="ce-note"><ellipse cx="46" cy="58" rx="5" ry="4"/><rect x="49.2" y="38" width="1.8" height="20"/><path d="M51 38c5 2 8 5 6 10-1-3-3-5-6-5z"/></g>'
        + '<g class="ce-note"><ellipse cx="190" cy="50" rx="5" ry="4"/><rect x="193.2" y="30" width="1.8" height="20"/><path d="M195 30c5 2 8 5 6 10-1-3-3-5-6-5z"/></g>'
        + '<g class="ce-note"><ellipse cx="170" cy="22" rx="4" ry="3.2"/><rect x="172.6" y="6" width="1.5" height="16"/><path d="M174 6c4 1.6 6.5 4 5 8-.8-2.4-2.4-4-5-4z"/></g>'
        + '</g>'
        + '<path d="M72 30l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill="#ffb020" fill-opacity="0.8"/>'
        + '<path d="M212 88l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="#ffb020" fill-opacity="0.7"/>'
        + '</svg>';
    }

    // opts: { variant: 'filtered'|'unstocked', noun, onClear, onAdjust }
    // noun is plural lower-case ("merchandise", "pre-owned items").
    function catalogEmptyHtml(opts) {
      opts = opts || {};
      var noun = Utils.escape(opts.noun || 'products');
      var browse = '<a href="/products" class="btn btn-secondary" onclick="navigate(\'products\');return false;">'
        + '<i class="fas fa-compact-disc" aria-hidden="true"></i> Browse All Products</a>';
      var body = opts.variant === 'filtered'
        ? '<h3 class="catalog-empty-title">No products found</h3>'
          + '<p class="catalog-empty-text">We couldn\'t find any ' + noun + ' matching your current filters.</p>'
          + '<div class="catalog-empty-actions">'
          + '<button type="button" class="btn btn-primary" onclick="' + (opts.onAdjust || 'adjustProductFilters()') + '"><i class="fas fa-sliders" aria-hidden="true"></i> Adjust Filters</button>'
          + '<button type="button" class="btn btn-secondary" onclick="' + (opts.onClear || 'clearAllFilters()') + '"><i class="fas fa-rotate" aria-hidden="true"></i> Clear All</button>'
          + '</div>'
        : '<h3 class="catalog-empty-title">Nothing on this shelf yet</h3>'
          + '<p class="catalog-empty-text">We don\'t have any ' + noun + ' listed right now — new stock is on its way. In the meantime, explore the rest of the collection.</p>'
          + '<div class="catalog-empty-actions">' + browse + '</div>';
      return '<div class="catalog-empty" role="status">' + catalogEmptyArt() + body
        + '<div class="catalog-empty-help"><i class="far fa-lightbulb" aria-hidden="true"></i>'
        + '<div><strong>Looking for something specific?</strong>'
        + '<span>Try different filters or explore our other categories.</span></div>'
        + '<a href="/#shop-categories" class="btn btn-secondary btn-sm" onclick="goToHomeCategories();return false;">Browse All Categories <i class="fas fa-arrow-right" aria-hidden="true"></i></a>'
        + '</div></div>';
    }

    // The homepage's Shop by Category grid is the one place every department
    // is listed with a picture, so "Browse All Categories" goes there.
    function goToHomeCategories() {
      navigate('index');
      setTimeout(function () {
        var el = document.getElementById('shop-categories');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }

    // "Adjust Filters": on desktop the sidebar is right there, so bring it into
    // view and flash it; below 1024px there is no sidebar, so open the first
    // chip's popover instead.
    function adjustProductFilters() {
      var sidebar = document.getElementById('filtersSidebar');
      var visible = sidebar && sidebar.offsetParent !== null;
      if (!visible) {
        var chip = document.querySelector('#filterChipsStrip .filter-chip.active') || document.querySelector('#filterChipsStrip .filter-chip');
        if (chip) chip.click();
        return;
      }
      sidebar.scrollIntoView({ behavior: 'smooth', block: 'start' });
      sidebar.classList.remove('is-flash');
      void sidebar.offsetWidth;
      sidebar.classList.add('is-flash');
    }
    function initPageLogin() {
      const err = document.getElementById('login-error');
      if (err) err.style.display = 'none';
      const emailEl = document.getElementById('login-email');
      if (emailEl && !emailEl.value) setTimeout(() => emailEl.focus(), 100);
      // If already logged in, send them to their profile
      if (Auth.isLoggedIn()) navigate('profile', {}, { replace: true });
    }

    function initPageSignup() {
      const err = document.getElementById('signup-error');
      if (err) err.style.display = 'none';
      const firstEl = document.getElementById('signup-first');
      if (firstEl && !firstEl.value) setTimeout(() => firstEl.focus(), 100);
      if (Auth.isLoggedIn()) navigate('profile', {}, { replace: true });
    }

    function showAuthError(elId, msg) {
      const el = document.getElementById(elId);
      if (!el) return;
      el.textContent = msg;
      el.style.display = 'block';
    }

    async function handleCustomerLogin() {
      const email = (document.getElementById('login-email').value || '').trim();
      const password = document.getElementById('login-password').value || '';
      const btn = document.querySelector('#login-form-customer button[type="submit"]');
      if (!email || !password) { showAuthError('login-error', 'Please enter your email and password'); return; }
      if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }
      try {
        await Auth.login(email, password);
        showToast('Welcome back!', 'success');
        // Signing in is what makes an identity-shaped trigger checkable at all
        // (subscribe / first_order / repeat_order), so this is the first moment
        // we can honestly tell them what they qualify for.
        if (typeof CouponRewards !== 'undefined') {
          CouponRewards.check('Welcome back');
        }
        const params = parsePageFromUrl().params;
        // A coupon parked by the email link is applied now that we know who
        // they are — see CouponLink in coupon.js.
        if (typeof CouponLink !== 'undefined') CouponLink.resumePending();
        navigate(params.redirect || 'profile');
      } catch (e) {
        showAuthError('login-error', e.message);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🚀 Sign In'; }
      }
    }

    async function handleCustomerSignup() {
      const firstName = (document.getElementById('signup-first').value || '').trim();
      const lastName = (document.getElementById('signup-last').value || '').trim();
      const email = (document.getElementById('signup-email').value || '').trim();
      const password = document.getElementById('signup-password').value || '';
      const confirm = document.getElementById('signup-password-confirm').value || '';
      const btn = document.querySelector('#signup-form-customer button[type="submit"]');

      if (!firstName || !email || !password) { showAuthError('signup-error', 'Please fill all required fields'); return; }
      if (password.length < 8) { showAuthError('signup-error', 'Password must be at least 8 characters'); return; }
      if (password !== confirm) { showAuthError('signup-error', 'Passwords do not match'); return; }

      if (btn) { btn.disabled = true; btn.textContent = 'Creating account...'; }
      try {
        await Auth.signup({ firstName, lastName, email, password });
        showToast('Account created — welcome to Velorex Music!', 'success');
        // The account now EXISTS, so a signup- or first-order-triggered code
        // has just become usable. Asked, not assumed: the server re-runs the
        // same evaluator checkout will.
        if (typeof CouponRewards !== 'undefined') {
          CouponRewards.check('Thanks for joining');
        }
        const params = parsePageFromUrl().params;
        // A coupon parked by the email link is applied now that we know who
        // they are — see CouponLink in coupon.js.
        if (typeof CouponLink !== 'undefined') CouponLink.resumePending();
        navigate(params.redirect || 'profile');
      } catch (e) {
        showAuthError('signup-error', e.message);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🎉 Create Account'; }
      }
    }

    async function handleCustomerLogout() {
      await Auth.logout();
      showToast('Signed out', 'success');
      navigate('index');
    }

    function initPageIndex() {
      // Combos come from their own endpoint, not the product cache, so this
      // runs regardless of which branch below returns. It hides its own
      // section when there is nothing to show.
      if (typeof initHomeCombos === 'function') initHomeCombos();
      // Hero banner. Above the cold-cache early return below, because the brand
      // slide is static markup that is worth wiring up (arrows, swipe, dots)
      // even when there are no products to feature yet. init() is idempotent
      // and skips the rebuild unless the featured set actually changed, so the
      // post-sync re-invocation does not yank a slide out from under a reader.
      if (typeof HeroCarousel !== 'undefined') {
        try { HeroCarousel.init(); } catch (e) { console.warn('hero carousel failed:', e); }
      }
      // Label band: rebuilt from the catalogue's record labels (idempotent —
      // skips the rebuild when the labels and counts have not changed).
      if (typeof LabelBand !== 'undefined') {
        try { LabelBand.render(); } catch (e) { console.warn('label band failed:', e); }
      }
      var products = Storage.getProducts();
      var bsg = document.getElementById('best-selling-grid'), nrg = document.getElementById('new-releases-grid'), ug = document.getElementById('upcoming-grid');
      // Cold cache: skeleton the category counts, but keep the three curated
      // strips HIDDEN rather than skeletoning them.
      //
      // We can't know yet whether any of them has featured products, and a
      // skeleton that resolves to "nothing" is worse than showing nothing: the
      // customer sees three shimmering placeholder rows collapse a moment
      // later, which is both confusing and a Cumulative Layout Shift hit. The
      // strips are below the fold (hero + category cards come first), so
      // revealing them a beat late costs nothing. The background sync in the
      // DOMContentLoaded bootstrap re-invokes initPageIndex with real data.
      if (!products.length) {
        ['vinyl','cd','cassette','bluray','dvd'].forEach(cat => {
          var el = document.getElementById(cat + '-count');
          if (el) el.innerHTML = Skeleton.inlineLine('5rem');
        });
        ['best-selling', 'new-releases', 'upcoming'].forEach(id => {
          var s = document.getElementById(id);
          if (s) s.style.display = 'none';
        });
        if (bsg) bsg.innerHTML = '';
        if (nrg) nrg.innerHTML = '';
        if (ug)  ug.innerHTML  = '';
        return;
      }
      var counts = { vinyl: 0, cd: 0, cassette: 0, bluray: 0, dvd: 0 };
      products.forEach(p => { if (counts[p.category] !== undefined) counts[p.category]++; });
      ['vinyl','cd','cassette','bluray','dvd'].forEach(cat => {
        var el = document.getElementById(cat + '-count');
        if (el) el.textContent = counts[cat] + ' titles available';
      });
      // Homepage strips are curated: a section exists on the page only when the
      // admin has actually placed products in it (Homepage Placement in the
      // product form → products.badge). An empty strip used to render its
      // heading, subtitle and a "No bestsellers yet" placeholder, which reads to
      // a customer as a broken or abandoned shop rather than an empty shelf.
      //
      // Hiding the whole <section> — not just emptying the grid — is what
      // removes the "⏳ Upcoming / Pre-order before they're gone" heading too.
      var renderStrip = function (gridEl, sectionId, items) {
        if (!gridEl) return;
        var section = document.getElementById(sectionId);
        if (!items.length) {
          if (section) section.style.display = 'none';
          gridEl.innerHTML = '';
          return;
        }
        // Reset to '' rather than 'block' so the section falls back to whatever
        // display its CSS defines, instead of being pinned to block forever.
        if (section) section.style.display = '';
        gridEl.innerHTML = items.map(createProductCard).join('');
      };

      renderStrip(bsg, 'best-selling', products.filter(p => p.badge === 'hot').slice(0, 4));
      renderStrip(nrg, 'new-releases', products.filter(p => p.badge === 'new').slice(0, 4));
      // Upcoming is driven ONLY by the badge. It previously also matched
      // `p.stock === 0`, which meant every sold-out product quietly turned up
      // under "Upcoming" — sold out and not-yet-released are different things,
      // and it took the section out of the admin's control.
      renderStrip(ug, 'upcoming', products.filter(p => p.badge === 'upcoming').slice(0, 4));
      fixProductLinks('page-index');
    }

    function initPageProducts(params) {
      var allProducts = Storage.getProducts();
      // Cold cache: paint skeleton cards in the grid + skip count updates.
      // The DOMContentLoaded bootstrap's post-sync re-invocation will run
      // initPageProducts again with real data.
      // The banner and heading are known from the route alone, so they are
      // painted before the cold-cache return — only the counts wait for data.
      renderProductsBanner(params, allProducts);
      restoreView('products-grid');
      _artistExpanded = false;
      if (!allProducts.length) {
        var sg = document.getElementById('products-grid');
        if (sg) sg.innerHTML = Skeleton.productGrid(8);
        var sc = document.getElementById('products-count');
        if (sc) sc.innerHTML = Skeleton.inlineLine('10rem');
        return;
      }
      // A department (Merchandise, Vinyl Care) builds its sidebar from its OWN
      // stock. Built from the whole catalogue, /merchandise offered "Vinyl
      // Records 112", "Hindi 104" and a list of film composers — options that
      // could only ever return an empty grid on a T-shirt page. The music
      // formats keep the whole catalogue, where ticking a second format
      // alongside the routed one is a real choice.
      var facetSource = isDepartmentCat(params && params.cat)
        ? routeBaseProducts(allProducts, { cat: params.cat, sub: params.sub })
        : allProducts;
      // Rebuild the data-driven sections first — the pre-tick below queries
      // the inputs this creates.
      renderCategoryFilterOptions(facetSource);
      ['cat', 'cond', 'artist', 'lang', 'people', 'price', 'avail'].forEach(function (name) {
        document.querySelectorAll('#page-products input[name="' + name + '"]').forEach(cb => cb.checked = false);
      });
      // Not on a department: its single category box is hidden (see the
      // category fallback in applyFilters), and a ticked box nobody can see
      // would count as an active filter everywhere else that asks.
      if (params && params.cat && !isDepartmentCat(params.cat)) {
        document.querySelectorAll('#page-products input[name="cat"]').forEach(cb => cb.checked = facetVal(cb.value) === facetVal(params.cat));
      }
      if (params && params.lang) document.querySelectorAll('#page-products input[name="lang"]').forEach(cb => cb.checked = cb.value === params.lang);
      updateCountsProducts(facetSource);
      applyFilters(params ? params.search : null);
    }

    // One label per category for the products page: the sidebar, the
    // active-filter tags and the page heading. These lived in three separate
    // literals before, which is how Merchandise and Vinyl Care ended up
    // present in one and absent from the others. Named apart from router.js's
    // CAT_LABELS — these scripts share one script scope, so two top-level
    // declarations of the same name is a hard SyntaxError that takes the whole
    // storefront down, not a shadowed variable.
    // icon is a Font Awesome class, not an emoji — emoji render in a different
    // face, size and colour on every platform and cannot take the row's colour
    // (the same reason buttons moved off them, CLAUDE.md §32).
    var FILTER_CAT_LABELS = {
      vinyl:        { icon: 'fa-record-vinyl',          long: 'Vinyl Records',  short: 'Vinyl' },
      cd:           { icon: 'fa-compact-disc',          long: 'Audio CDs',      short: 'CD' },
      cassette:     { icon: 'fa-tape',                  long: 'Cassettes',      short: 'Cassette' },
      bluray:       { icon: 'fa-film',                  long: 'Blu-ray Movies', short: 'Blu-ray' },
      dvd:          { icon: 'fa-video',                 long: 'DVD Movies',     short: 'DVD' },
      merchandise:  { icon: 'fa-shirt',                 long: 'Merchandise',    short: 'Merch' },
      'vinyl-care': { icon: 'fa-spray-can-sparkles',    long: 'Vinyl Care',     short: 'Vinyl Care' }
    };
    function catLabel(cat, key) {
      var e = FILTER_CAT_LABELS[cat];
      return e ? e[key || 'long'] : String(cat || '');
    }
    function faIcon(cls) { return '<i class="fas ' + cls + '" aria-hidden="true"></i>'; }

    var COND_LABELS = { 'new': { icon: 'fa-certificate', long: 'New / Sealed' }, 'pre-owned': { icon: 'fa-recycle', long: 'Pre-owned' } };

    // Build the Category and Condition options from the catalogue rather than
    // from a hand-written list, so the sidebar can never disagree with what is
    // actually for sale. Anything with zero products is left out: an option
    // whose only outcome is an empty grid is a dead end, and an unknown value
    // coming back from the admin still gets a row (labelled by its raw slug)
    // instead of being silently unfilterable.
    //
    // Must run BEFORE initPageProducts pre-ticks a box from the URL, or the
    // re-render would wipe that tick.
    function renderFacetOptions(products, opts) {
      var host = document.getElementById(opts.hostId);
      if (!host) return;
      var counts = {};
      products.forEach(function (p) {
        var v = opts.valueOf(p);
        if (v) counts[v] = (counts[v] || 0) + 1;
      });
      // Known values first, in taxonomy order; then anything unexpected.
      var labels = opts.labels;
      var keys = Object.keys(labels).filter(function (k) { return counts[k]; });
      Object.keys(counts).forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); });

      // Preserve ticks across a re-render — Storage.syncFromServer() can land
      // mid-session and re-run this while the shopper has boxes checked.
      var wasChecked = Array.from(host.querySelectorAll('input:checked')).map(function (i) { return i.value; });

      host.innerHTML = keys.map(function (k) {
        var meta = labels[k];
        var text = meta ? (faIcon(meta.icon) + ' ' + Utils.escape(meta.long)) : Utils.escape(k);
        return '<label class="filter-option"><input type="checkbox" name="' + opts.inputName + '" value="' + Utils.escape(k) + '"'
             + (wasChecked.indexOf(k) !== -1 ? ' checked' : '')
             + ' onchange="applyFilters()">' + text
             + '<span class="filter-count">' + counts[k] + '</span></label>';
      }).join('');

      // A single option is not a choice — ticking it changes nothing. Hide the
      // section rather than offering a no-op control.
      var section = document.getElementById(opts.sectionId);
      if (section) section.hidden = keys.length < 2;
    }

    // Artist is high-cardinality and free text, so it gets a search box and is
    // ordered by stock depth rather than by a fixed taxonomy — the names a
    // shopper is most likely to want are the ones the shop actually has most
    // of. Values are the raw artist strings; matching is case-folded via
    // facetVal so "R. D. Burman" and "r. d. burman" are one row, not two.
    function renderArtistFilterOptions(products) {
      var host = document.getElementById('artist-filter-options');
      var section = document.getElementById('fsec-artist');
      if (!host) return;
      var counts = {}, display = {};
      products.forEach(function (p) {
        // One row per credited artist, not per credit string. A product with
        // two singers counts towards both.
        splitArtists(p.artist).forEach(function (name) {
          var key = facetVal(name);
          if (!key) return;
          counts[key] = (counts[key] || 0) + 1;
          if (!display[key]) display[key] = name;
        });
      });
      var keys = Object.keys(counts).sort(function (a, b) {
        return counts[b] - counts[a] || display[a].localeCompare(display[b]);
      });
      var wasChecked = Array.from(host.querySelectorAll('input:checked')).map(function (i) { return i.value; });
      host.innerHTML = keys.map(function (k) {
        return '<label class="filter-option people-option"><input type="checkbox" name="artist" value="' + Utils.escape(k) + '"'
             + (wasChecked.indexOf(k) !== -1 ? ' checked' : '')
             + ' onchange="applyFilters()">' + Utils.escape(display[k])
             + '<span class="filter-count">' + counts[k] + '</span></label>';
      }).join('');
      if (section) section.hidden = keys.length < 2;
      applyOptionVisibility('artist-filter-options');
    }

    function renderCategoryFilterOptions(products) {
      renderArtistFilterOptions(products);
      renderFacetOptions(products, {
        hostId: 'category-filter-options', sectionId: 'fsec-cat', inputName: 'cat', labels: FILTER_CAT_LABELS,
        valueOf: function (p) { return facetVal(p.category); }
      });
      renderFacetOptions(products, {
        hostId: 'condition-filter-options', sectionId: 'fsec-cond', inputName: 'cond', labels: COND_LABELS,
        // A row with no condition set is New — the same default
        // row_to_product_lean() applies — not an unlabelled third bucket.
        valueOf: function (p) { return facetVal(p.condition) || 'new'; }
      });
    }

    function updateCountsProducts(products) {
      // Category counts are emitted inline by renderFacetOptions(); only the
      // static Language rows still need filling in here.
      var countMap = {
        'count-hindi': p => facetVal(p.language) === 'hindi',
        'count-english': p => facetVal(p.language) === 'english'
      };
      var langsWithStock = 0;
      Object.keys(countMap).forEach(id => {
        var el = document.getElementById(id);
        var n = products.filter(countMap[id]).length;
        if (n) langsWithStock++;
        if (el) el.textContent = n;
      });
      // Same rule as renderFacetOptions: fewer than two live values is not a
      // choice. Merchandise has no language at all, and a "Hindi 0 / English 0"
      // block there only suggested the page was broken. A box ticked by the URL
      // (/vinyl-records/hindi) keeps the section, so it can still be unticked.
      var langSection = document.getElementById('fsec-lang');
      if (langSection) {
        var langTicked = document.querySelector('#page-products input[name="lang"]:checked');
        langSection.hidden = langsWithStock < 2 && !langTicked;
      }
      // Update people counts, and mark the ones no product carries.
      //
      // The People list is 33 hand-written names covering a catalogue that may
      // have tagged none of them. An option whose only possible outcome is
      // "No products found" is not a filter, it is a dead end, so a zero-count
      // row is flagged here and hidden by applyOptionVisibility() — which also
      // owns the search box's show/hide so the two cannot fight over the same
      // style property. The section header goes with the last visible row.
      var anyPeople = false;
      Object.keys(PEOPLE_LABELS).forEach(slug => {
        var n = products.filter(p => p.people && p.people.indexOf(slug) !== -1).length;
        var el = document.getElementById('count-' + slug);
        if (el) el.textContent = n;
        var opt = el && el.closest ? el.closest('.people-option') : null;
        if (opt) opt.dataset.empty = n ? '' : '1';
        if (n) anyPeople = true;
      });
      var peopleSection = document.getElementById('fsec-people');
      // Hide the whole section (and keep it out of the mobile chip strip) when
      // nothing in the catalogue is tagged at all.
      if (peopleSection) peopleSection.hidden = !anyPeople;
      applyOptionVisibility('people-filter-options');
    }

    // searchOverride is optional. Every `onchange` in the sidebar calls
    // applyFilters() with no argument, so taking the argument as the only
    // source of the query silently dropped it the moment any checkbox or the
    // sort dropdown was touched: search "sholay", tick Vinyl, and the grid
    // jumped back to the whole catalogue while the URL still said
    // ?search=sholay. Fall back to the routed param, which is what the URL and
    // the navbar box already agree on.
    function applyFilters(searchOverride) {
      var allProds = Storage.getProducts(), filtered = allProds.slice();
      var search = (searchOverride != null && searchOverride !== '')
        ? searchOverride
        : (currentParams && currentParams.search) || '';

      // Category filter.
      //
      // The sidebar only offers a checkbox for a category that has stock, so
      // the routed category still needs a fallback: /merchandise would
      // otherwise find nothing ticked, conclude "no filter", and show the
      // whole catalogue.
      //
      // But the fallback must apply ONLY when the sidebar has no checkbox for
      // that category. Firing it whenever nothing is ticked meant unticking
      // Vinyl on /vinyl-records re-applied Vinyl from the URL — the box moved,
      // the grid did not, and the filter looked broken.
      //
      // A hidden Category section (a department, whose sidebar is built from
      // its own stock and so holds a single category) is not a control the
      // shopper can see — its lone checkbox must not decide anything, or
      // removing its active-filter tag would widen /merchandise to the whole
      // catalogue under a Merchandise heading.
      var catSection = document.getElementById('fsec-cat');
      var catBoxes = (catSection && catSection.hidden)
        ? []
        : Array.from(document.querySelectorAll('#page-products input[name="cat"]'));
      var selCats = catBoxes.filter(i => i.checked).map(i => facetVal(i.value));
      var routedCat = currentParams && currentParams.cat ? facetVal(currentParams.cat) : '';
      if (selCats.length) {
        filtered = filtered.filter(p => selCats.indexOf(facetVal(p.category)) !== -1);
      } else if (routedCat && !catBoxes.some(i => facetVal(i.value) === routedCat)) {
        filtered = filtered.filter(p => facetVal(p.category) === routedCat);
      }

      // Condition (New / Sealed vs Pre-owned). row_to_product_lean() defaults a
      // missing value to 'new', but the cache can predate that, so an absent
      // condition reads as 'new' here too rather than matching nothing.
      var selCond = Array.from(document.querySelectorAll('#page-products input[name="cond"]:checked')).map(i => facetVal(i.value));
      if (selCond.length) {
        filtered = filtered.filter(p => selCond.indexOf(facetVal(p.condition) || 'new') !== -1);
      }

      // Subcategory (departments only) — always driven by the URL, since there
      // is no sidebar control for it.
      if (currentParams && currentParams.sub) {
        filtered = filtered.filter(p => facetVal(p.subcategory) === facetVal(currentParams.sub));
      }

      // Record label — from the homepage label band (/products?label=saregama).
      // URL-driven like the subcategory; matched through Seo.labelKey() so every
      // spelling of one label in the admin ("Sony" / "Sony Music") is one label.
      if (currentParams && currentParams.label) {
        var wantLabel = Seo.labelKey(currentParams.label);
        filtered = filtered.filter(p => p.label && Seo.labelKey(p.label) === wantLabel);
      }

      // Language filter
      var selLangs = Array.from(document.querySelectorAll('#page-products input[name="lang"]:checked')).map(i => i.value);
      if (selLangs.length) filtered = filtered.filter(p => selLangs.indexOf(facetVal(p.language)) !== -1);

      // Price filter.
      //
      // The top bucket is open-ended and its value carries no upper bound
      // ("2000-"). It used to be "2000-9999", which quietly hid anything dearer
      // than ₹9,999 from the one filter whose label ("₹2,000+") promises the
      // opposite — the ₹12,999 Sholay 50th Anniversary edition, the most
      // expensive thing in the catalogue, was unreachable from the sidebar.
      var selPrices = Array.from(document.querySelectorAll('#page-products input[name="price"]:checked')).map(i => i.value);
      if (selPrices.length) {
        filtered = filtered.filter(p => selPrices.some(range => {
          var parts = String(range).split('-');
          var min = Number(parts[0]) || 0;
          var max = (parts[1] === undefined || parts[1] === '') ? Infinity : Number(parts[1]);
          return p.price >= min && p.price <= max;
        }));
      }

      // Availability filter
      var selAvail = Array.from(document.querySelectorAll('#page-products input[name="avail"]:checked')).map(i => i.value);
      if (selAvail.length) {
        filtered = filtered.filter(p => (selAvail.indexOf('instock') !== -1 && p.stock > 0) || (selAvail.indexOf('outofstock') !== -1 && p.stock === 0));
      }

      // ---- ARTIST FILTER ----
      var selArtists = Array.from(document.querySelectorAll('#page-products input[name="artist"]:checked')).map(i => facetVal(i.value));
      if (selArtists.length) {
        filtered = filtered.filter(function (p) {
          return artistKeys(p).some(function (k) { return selArtists.indexOf(k) !== -1; });
        });
      }

      // ---- PEOPLE FILTER ----
      var selPeople = Array.from(document.querySelectorAll('#page-products input[name="people"]:checked')).map(i => i.value);
      if (selPeople.length) {
        filtered = filtered.filter(p => p.people && selPeople.some(slug => p.people.indexOf(slug) !== -1));
      }

      // Search. Also matches the music director, which is the field people
      // actually type when they are hunting a soundtrack by its composer.
      if (search) {
        var q = String(search).toLowerCase().trim();
        filtered = filtered.filter(p =>
          facetVal(p.title).indexOf(q) !== -1 ||
          facetVal(p.artist).indexOf(q) !== -1 ||
          facetVal(p.musicDirector).indexOf(q) !== -1);
      }

      // Sort
      var sort = (document.getElementById('sortSelect') || { value: '' }).value;
      if (sort === 'price-asc') filtered.sort((a, b) => a.price - b.price);
      else if (sort === 'price-desc') filtered.sort((a, b) => b.price - a.price);
      else if (sort === 'rating') filtered.sort((a, b) => b.rating - a.rating);
      else if (sort === 'newest') filtered.sort((a, b) => b.id - a.id);
      else if (sort === 'name-asc') filtered.sort((a, b) => a.title.localeCompare(b.title));

      // "Of how many" is the shelf the route stands for on a department page —
      // "Showing 0 of 116 products" on /merchandise counted records that were
      // never going to be on it.
      var dept = isDepartmentCat(currentParams && currentParams.cat);
      var shelf = dept ? routeBaseProducts(allProds, { cat: currentParams.cat, sub: currentParams.sub }) : allProds;

      var grid = document.getElementById('products-grid');
      if (grid) {
        if (!filtered.length) {
          var routed = currentParams && currentParams.cat;
          var noun = !routed ? 'products'
            : (MUSIC_BANNER_NOUNS[routed] || catLabel(routed).toLowerCase());
          // If the routed shelf itself (category + sub + language, before any
          // sidebar choice) is empty, nothing the shopper did emptied it — say
          // so. Only a non-empty shelf filtered down to nothing is "filtered".
          var routeShelf = routeBaseProducts(allProds, currentParams || {});
          grid.innerHTML = catalogEmptyHtml({
            variant: routeShelf.length ? 'filtered' : 'unstocked',
            noun: noun
          });
        } else {
          grid.innerHTML = filtered.map(createProductCard).join('');
        }
        fixProductLinks('page-products');
      }
      var countEl = document.getElementById('products-count');
      if (countEl) countEl.textContent = 'Showing ' + filtered.length + ' of ' + shelf.length + ' ' + (shelf.length === 1 ? 'product' : 'products');
      renderActiveFiltersProducts();

      // view_item_list — what the visitor was actually shown after filtering,
      // which is the list GA4's "items viewed" report should reflect. Naming
      // the list by the routed category (rather than a constant "Products")
      // is what makes the report say which sections earn their place.
      if (typeof Analytics !== 'undefined') {
        Analytics.viewItemList(
          filtered,
          (currentParams && currentParams.cat) ? String(currentParams.cat) : 'All products'
        );
      }
    }

    function clearAllFilters() {
      document.querySelectorAll('#page-products .filter-option input').forEach(i => i.checked = false);
      var sortEl = document.getElementById('sortSelect'); if (sortEl) sortEl.value = '';
      var ps = document.getElementById('peopleSearch'); if (ps) { ps.value = ''; filterPeopleOptions(''); }
      var as = document.getElementById('artistSearch'); if (as) { as.value = ''; filterArtistOptions(''); }
      // "Clear All" has to include the routed category/subcategory and the
      // search, or it unticks every box and leaves the grid exactly as narrow
      // as it was — the fallbacks in applyFilters() re-apply them from the URL.
      var wasDept = isDepartmentCat(currentParams && currentParams.cat);
      if (currentParams) { delete currentParams.cat; delete currentParams.sub; delete currentParams.lang; }
      // Now on "All Products": banner, heading and — if we were on a
      // department, whose sidebar held only its own stock — the facets.
      var all = Storage.getProducts();
      renderProductsBanner(currentParams || {}, all);
      if (wasDept && all.length) { renderCategoryFilterOptions(all); updateCountsProducts(all); }
      if (typeof updateBreadcrumbs === 'function') updateBreadcrumbs('products', currentParams || {});
      clearProductSearch();
    }

    // Grid or list, for any product grid with a .view-toggle beside it. The
    // choice is remembered per browser — someone who prefers a list prefers it
    // on every shelf.
    function setView(view, gridId) {
      var g = document.getElementById(gridId || 'products-grid');
      if (!g) return;
      var list = view === 'list';
      g.classList.toggle('is-list', list);
      g.style.gridTemplateColumns = '';
      var main = g.closest('.products-main') || document;
      main.querySelectorAll('.view-btn').forEach(function (b) {
        var on = b.getAttribute('data-view') === (list ? 'list' : 'grid');
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      try { localStorage.setItem('vv_grid_view', list ? 'list' : 'grid'); } catch (e) {}
    }
    function restoreView(gridId) {
      var v = 'grid';
      try { v = localStorage.getItem('vv_grid_view') || 'grid'; } catch (e) {}
      setView(v, gridId);
    }

    // ---- Search boxes inside the Artist and People filters ----
    function filterPeopleOptions(query) { setOptionQuery('people-filter-options', query); }
    function filterArtistOptions(query) { setOptionQuery('artist-filter-options', query); }

    var _optionQueries = {};
    var ARTIST_PREVIEW = 5;
    var _artistExpanded = false;
    function toggleArtistShowMore() {
      _artistExpanded = !_artistExpanded;
      applyOptionVisibility('artist-filter-options');
    }
    function setOptionQuery(hostId, query) {
      _optionQueries[hostId] = String(query || '').toLowerCase().trim();
      applyOptionVisibility(hostId);
    }

    // Single owner of a searchable option list's visibility. A row shows when
    // it has at least one product AND matches the search box. Two independent
    // writers to .style.display would race — the search would resurrect rows
    // that match nothing, and re-counting would undo an active search.
    function applyOptionVisibility(hostId) {
      var host = document.getElementById(hostId);
      if (!host) return;
      var q = _optionQueries[hostId] || '';
      // Artist shows its top ARTIST_PREVIEW rows until "Show more" — unless a
      // search is typed (then every match), or a row further down is ticked
      // (a selected filter is never hidden from the person who selected it).
      var capped = hostId === 'artist-filter-options' && !q && !_artistExpanded;
      var shown = 0, overflow = 0;
      host.querySelectorAll('.people-option').forEach(label => {
        var isEmpty = label.dataset.empty === '1';
        var matches = !q || label.textContent.toLowerCase().indexOf(q) !== -1;
        var visible = !isEmpty && matches;
        if (visible && hostId === 'artist-filter-options') {
          var ticked = label.querySelector('input:checked');
          if (shown >= ARTIST_PREVIEW && !ticked) {
            overflow++;
            if (capped) visible = false;
          }
          if (visible) shown++;
        }
        label.style.display = visible ? '' : 'none';
      });
      if (hostId === 'artist-filter-options') {
        var more = document.getElementById('artistShowMore');
        if (more) {
          more.hidden = !!q || overflow === 0;
          more.textContent = _artistExpanded ? 'Show less' : 'Show ' + overflow + ' more';
        }
      }
      // Show/hide group labels based on visible siblings (People only — the
      // artist list is flat, so this finds nothing and no-ops).
      host.querySelectorAll('.people-group-label').forEach(header => {
        var next = header.nextElementSibling;
        var anyVisible = false;
        while (next && next.classList.contains('people-option')) {
          if (next.style.display !== 'none') { anyVisible = true; break; }
          next = next.nextElementSibling;
        }
        header.style.display = anyVisible ? '' : 'none';
      });
    }

    function renderActiveFiltersProducts() {
      var container = document.getElementById('activeFilters'); if (!container) return;
      var tags = [];
      var catHidden = (document.getElementById('fsec-cat') || {}).hidden;
      if (!catHidden) Array.from(document.querySelectorAll('#page-products input[name="cat"]:checked')).forEach(i => {
        var meta = FILTER_CAT_LABELS[i.value];
        tags.push({ label: meta ? faIcon(meta.icon) + ' ' + meta.short : Utils.escape(i.value), input: i });
      });
      Array.from(document.querySelectorAll('#page-products input[name="cond"]:checked')).forEach(i => {
        var meta = COND_LABELS[i.value];
        tags.push({ label: meta ? faIcon(meta.icon) + ' ' + meta.long : Utils.escape(i.value), input: i });
      });
      Array.from(document.querySelectorAll('#page-products input[name="lang"]:checked')).forEach(i => {
        tags.push({ label: faIcon('fa-globe') + ' ' + (i.value === 'hindi' ? 'Hindi' : 'English'), input: i });
      });
      Array.from(document.querySelectorAll('#page-products input[name="artist"]:checked')).forEach(i => {
        // The checkbox value is the case-folded key; the label text alongside
        // it is the artist as the catalogue spells them.
        var shown = i.parentElement ? i.parentElement.textContent.replace(/\s*\d+\s*$/, '').trim() : i.value;
        tags.push({ label: faIcon('fa-microphone-lines') + ' ' + Utils.escape(shown), input: i });
      });
      Array.from(document.querySelectorAll('#page-products input[name="people"]:checked')).forEach(i => {
        tags.push({ label: faIcon('fa-film') + ' ' + Utils.escape(PEOPLE_LABELS[i.value] || i.value), input: i });
      });
      // Price and stock narrow the grid as much as any other box, and a stale
      // tick carried in from a previous visit had no visible trace at all.
      ['price', 'avail'].forEach(function (name) {
        Array.from(document.querySelectorAll('#page-products input[name="' + name + '"]:checked')).forEach(i => {
          var text = i.parentElement ? i.parentElement.textContent.trim() : i.value;
          tags.push({ label: faIcon(name === 'price' ? 'fa-indian-rupee-sign' : 'fa-box') + ' ' + Utils.escape(text), input: i });
        });
      });
      // The search term narrows the grid exactly like a checkbox does, and now
      // that it survives a filter change it has to be visible and removable —
      // otherwise a stale query from a previous navigation silently suppresses
      // results with nothing on screen to explain why.
      if (currentParams && currentParams.search) {
        tags.push({ label: '🔍 ' + Utils.escape(currentParams.search), search: true });
      }
      if (currentParams && currentParams.label) {
        tags.push({ label: faIcon('fa-record-vinyl') + ' ' + Utils.escape(Seo.labelNameFor(currentParams.label)), recordLabel: true });
      }
      container.innerHTML = tags.map((tag, idx) => `<span class="filter-tag">${tag.label}<button type="button" class="filter-tag-remove" onclick="removeFilterProduct(${idx})" aria-label="Remove filter"><i class="fas fa-xmark" aria-hidden="true"></i></button></span>`).join('');
      window._filterTags = tags;
      // Refresh the mobile/tablet chip strip too — count bubbles flip as
      // filters are toggled. Cheap to re-render the strip on every change.
      renderFilterChips();
    }

    // ============================================================
    // Mobile/tablet filter UX (chip strip + popover) — pattern D
    // ============================================================
    // At ≤1023px the sidebar is display:none. Filtering happens via a
    // horizontal scrollable chip strip below the page hero. Each chip
    // corresponds to one .filter-section (Category/Language/Price/Stock/
    // People) and shows an orange count bubble when that section has
    // active filters. Tapping a chip moves the matching .filter-section
    // DOM node into a fixed-position popover and shows it; closing moves
    // it back into the (hidden) sidebar so applyFilters() — which queries
    // inputs by name within #page-products — keeps finding them.
    //
    // Why DOM-move and not clone: the checkboxes are the same elements
    // pre/post-move. No state sync needed. applyFilters() just works.

    // Ordered list of filter section ids, the chip label and the input
    // name used to count active selections. Add a new filter section?
    // Add a row here too.
    var FILTER_CHIP_SECTIONS = [
      { id: 'fsec-cat',    icon: 'fa-folder',             label: 'Category',  inputName: 'cat' },
      { id: 'fsec-artist', icon: 'fa-microphone-lines',   label: 'Artist',    inputName: 'artist' },
      { id: 'fsec-lang',   icon: 'fa-globe',              label: 'Language',  inputName: 'lang' },
      { id: 'fsec-price',  icon: 'fa-indian-rupee-sign',  label: 'Price',     inputName: 'price' },
      { id: 'fsec-cond',   icon: 'fa-tag',                label: 'Condition', inputName: 'cond' },
      { id: 'fsec-avail',  icon: 'fa-box',                label: 'Stock',     inputName: 'avail' },
      { id: 'fsec-people', icon: 'fa-film',               label: 'People',    inputName: 'people' },
    ];

    function renderFilterChips() {
      var bar = document.getElementById('filterChipsBar');
      var strip = document.getElementById('filterChipsStrip');
      if (!bar || !strip) return;
      // The bar is hidden on desktop via CSS, but the chips still render so
      // the markup is ready the moment the viewport shrinks.
      bar.removeAttribute('hidden');
      var totalActive = 0;
      var html = FILTER_CHIP_SECTIONS.filter(function (s) {
        // updateCountsProducts() hides a section with nothing to offer (People,
        // when no product is tagged). A chip opening an empty popover is worse
        // than no chip.
        var el = document.getElementById(s.id);
        return el && !el.hidden;
      }).map(function (s) {
        var checked = document.querySelectorAll('#page-products input[name="' + s.inputName + '"]:checked').length;
        totalActive += checked;
        var activeCls = checked > 0 ? ' active' : '';
        var countBubble = checked > 0 ? '<span class="chip-count">' + checked + '</span>' : '';
        return '<button type="button" class="filter-chip' + activeCls + '" data-fsec="' + s.id + '" onclick="openFilterPopover(\'' + s.id + '\')">' + faIcon(s.icon) + ' ' + s.label + countBubble + ' <span class="chip-arrow">⏷</span></button>';
      }).join('');
      // Clear-all chip — shown only when at least one filter is active.
      if (totalActive > 0) {
        html += '<button type="button" class="filter-chip filter-chip-clear" onclick="clearAllFilters()">Clear all ✕</button>';
      }
      strip.innerHTML = html;
    }

    function openFilterPopover(sectionId) {
      var section = document.getElementById(sectionId);
      var popover = document.getElementById('filterPopover');
      var backdrop = document.getElementById('filterPopoverBackdrop');
      var body = document.getElementById('filterPopoverBody');
      var titleEl = document.getElementById('filterPopoverTitle');
      if (!section || !popover || !body) return;
      // Find the chip definition for this section to get the display label.
      var def = FILTER_CHIP_SECTIONS.find(function (s) { return s.id === sectionId; });
      if (titleEl) titleEl.textContent = def ? def.label : 'Filter';
      // Stash the original parent so closeFilterPopover() can put the
      // section back exactly where it came from in the sidebar.
      section.dataset.originalParent = section.parentElement && section.parentElement.id
        ? '#' + section.parentElement.id
        : '.filters-sidebar';
      body.appendChild(section);
      popover.removeAttribute('hidden');
      // Two-step add for the CSS transition to animate.
      requestAnimationFrame(function () {
        popover.classList.add('open');
        if (backdrop) backdrop.classList.add('open');
      });
      document.body.classList.add('filter-popover-open');
    }

    function closeFilterPopover() {
      var popover = document.getElementById('filterPopover');
      var backdrop = document.getElementById('filterPopoverBackdrop');
      var body = document.getElementById('filterPopoverBody');
      if (!popover || !body) return;
      // Move any .filter-section back to the sidebar where it belongs.
      Array.from(body.querySelectorAll('.filter-section')).forEach(function (section) {
        var sidebar = document.getElementById('filtersSidebar');
        if (sidebar) sidebar.appendChild(section);
      });
      popover.classList.remove('open');
      if (backdrop) backdrop.classList.remove('open');
      document.body.classList.remove('filter-popover-open');
      // Hide after the transition completes so screen readers don't see it.
      setTimeout(function () {
        if (!popover.classList.contains('open')) popover.setAttribute('hidden', '');
      }, 200);
    }

    // ESC closes the popover.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var popover = document.getElementById('filterPopover');
      if (popover && popover.classList.contains('open')) closeFilterPopover();
    });

    function removeFilterProduct(idx) {
      var tag = window._filterTags && window._filterTags[idx];
      if (!tag) return;
      if (tag.search) { clearProductSearch(); return; }
      if (tag.recordLabel) { clearProductLabel(); return; }
      tag.input.checked = false;
      applyFilters();
    }

    // Drop the search term from the route, the URL and the navbar box together.
    // Clearing only one of the three leaves the others asserting a query that
    // is no longer being applied.
    function clearProductSearch() {
      if (currentParams) delete currentParams.search;
      var box = document.getElementById('globalSearch'); if (box) box.value = '';
      try {
        window.history.replaceState(
          { page: 'products', params: currentParams || {} },
          '',
          Seo.buildPath('products', currentParams || {})
        );
      } catch (e) { /* history is best-effort; the grid is the thing that matters */ }
      applyFilters();
    }

    // Drop the label filter from the route and the URL together (same reason as
    // clearProductSearch: a URL still asserting a filter the grid no longer
    // applies is a lie in the address bar).
    function clearProductLabel() {
      if (currentParams) delete currentParams.label;
      try {
        window.history.replaceState(
          { page: 'products', params: currentParams || {} },
          '',
          Seo.buildPath('products', currentParams || {})
        );
      } catch (e) { /* best-effort */ }
      applyFilters();
    }

    function openProduct(id) { navigate('product', { id: id }); return false; }

    // Phase 1: the products list endpoint no longer ships description / specs /
    // gallery / track listing — those fields live behind /api/product.php?id=N.
    // So this page does a two-step render:
    //   1. If we have a lean entry in Storage cache, paint header + cover image
    //      immediately so the page feels instant (~0 ms perceived latency).
    //   2. Fetch full detail from /api/product.php and re-render with the
    //      heavy fields (~100–300 ms typical).
    // If the customer hits this URL cold (no lean cache, e.g. shared link or
    // bookmark), step 1 falls back to a skeleton.
    async function initPageProduct(params) {
      var container = document.getElementById('product-detail-container');
      if (!params || !params.id) {
        if (container) container.innerHTML = '<div class="empty-cart"><div class="empty-cart-icon">😔</div><h3>No product selected</h3><a href="#" onclick="navigate(\'products\')" class="btn btn-primary">Browse Products</a></div>';
        return;
      }
      var id = parseInt(params.id);
      var products = Storage.getProducts();
      var leanProduct = products.find(p => p.id === id) || null;

      // Landed on a server-rendered product page: seo-render.php already put
      // the COMPLETE detail (description, tracks, facts) in the container and
      // marked it data-ssr-id. Painting the lean version over it shrank the
      // block and then grew it back when the full record arrived — the page
      // below jumped twice (CLS 1.3 measured in the September 2026 QA). Keep
      // the server's render until the full record replaces it once.
      var ssrPainted = container && container.getAttribute('data-ssr-id') === String(id);
      if (container) container.removeAttribute('data-ssr-id');

      if (ssrPainted) {
        /* keep the server render */
      } else if (leanProduct) {
        // Paint the lean version immediately. renderProductDetail tolerates
        // missing description/specs/people/trackListing — they just render as
        // empty sections until the full fetch arrives.
        var dt = document.getElementById('detail-title'); if (dt) dt.textContent = leanProduct.title;
        renderProductDetail(Object.assign({}, leanProduct, {
          description: '',
          images: leanProduct.image ? [leanProduct.image] : [],
          specs: null,
          people: [],
          trackListing: '',
        }));
      } else if (container) {
        container.innerHTML = '<div style="padding:4rem 2rem;text-align:center;color:var(--text-muted);">Loading product…</div>';
      }

      try {
        var res = await fetch(API_BASE + '/product.php?id=' + encodeURIComponent(id), { cache: 'no-store' });
        if (res.status === 404) {
          if (container) container.innerHTML = '<div class="empty-cart"><div class="empty-cart-icon">😔</div><h3>Product not found</h3><a href="#" onclick="navigate(\'products\')" class="btn btn-primary">Browse Products</a></div>';
          return;
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var product = await res.json();
        var dtFinal = document.getElementById('detail-title'); if (dtFinal) dtFinal.textContent = product.title;
        renderProductDetail(product);
        // view_item — fired on the full record, not on the lean paint above,
        // so the event always carries a real category and price. The lean
        // paint can happen twice on one visit (cold cache, then sync).
        if (typeof Analytics !== 'undefined') Analytics.viewItem(product);
        renderRelatedProducts(product, products);
        // Now that the full record is in hand: upgrade a bare /product/12 to
        // the canonical /product/12-title-artist (replaceState, so no extra
        // history entry) and rewrite the meta/OG tags with the real title,
        // description and cover image.
        try { Seo.syncProductUrl(product); } catch (e) { console.warn('SEO product sync failed:', e); }
        updateBreadcrumbs('product', { id: product.id });
      } catch (e) {
        if (container && !leanProduct) {
          container.innerHTML = '<div class="empty-cart"><div class="empty-cart-icon">😔</div><h3>Could not load product</h3><p style="color:var(--text-muted);font-size:0.85rem;">' + Utils.escape(e.message || 'Network error') + '</p><a href="#" onclick="navigate(\'products\')" class="btn btn-primary">Browse Products</a></div>';
        }
        // If a lean version was already painted, leave it visible — better
        // than blowing away a usable page on a transient fetch failure.
      }
    }

    function renderProductDetail(product) {
      var stars = '★'.repeat(Math.round(product.rating)) + '☆'.repeat(5 - Math.round(product.rating));
      var catLabel = product.category === 'vinyl' ? '💿 Vinyl Record' : product.category === 'cd' ? '💽 Audio CD' : product.category === 'cassette' ? '📼 Cassette' : product.category === 'bluray' ? '🎬 Blu-ray' : '🎞️ DVD';
      var langKey = facetVal(product.language);
      var langLabel = langKey === 'hindi' ? '🇮🇳 Hindi' : langKey === 'english' ? '🌍 English' : '';
      var isOOS = product.stock === 0;
      var discount = product.originalPrice ? Math.round((1 - product.price / product.originalPrice) * 100) : null;
      var specsHtml = '';
      if (product.specs) {
        var specOrder = ['format', 'tracks', 'label', 'year', 'genre', 'runtime', 'theme'];
        var specLabels = { format: 'Format', tracks: 'Tracks', label: 'Label', year: 'Year', genre: 'Genre', runtime: 'Runtime', theme: 'Theme' };
        specOrder.forEach(key => { if (product.specs[key] !== undefined && product.specs[key] !== '') specsHtml += `<div class="spec-row"><span class="spec-label">${specLabels[key]}</span><span class="spec-value">${product.specs[key]}</span></div>`; });
        Object.entries(product.specs).forEach(([k, v]) => { if (!specOrder.includes(k)) specsHtml += `<div class="spec-row"><span class="spec-label">${k.charAt(0).toUpperCase() + k.slice(1)}</span><span class="spec-value">${v}</span></div>`; });
      }
      // Settings -> Commerce -> low-stock threshold. Was a hardcoded 5 here
      // while the admin's restock list used 3, so the shop said "Only 4 left!"
      // on products the owner's own panel called healthy. One number now.
      var lowAt = (typeof SiteSettings !== 'undefined') ? Number(SiteSettings.get('low_stock_threshold')) : 3;
      if (!isFinite(lowAt) || lowAt < 1) lowAt = 3;
      var stockWarn = (product.stock <= lowAt && product.stock > 0) ? `<span style="color:var(--danger);font-size:0.8rem;font-weight:600;"><i class="fas fa-triangle-exclamation"></i> Only ${product.stock} left!</span>` : '';
      var actionBtns = isOOS ? '<button class="btn btn-secondary" disabled style="opacity:0.5;cursor:not-allowed;">❌ Out of Stock</button>'
        : '<div class="product-actions-group"><button class="btn btn-outline-primary btn-lg" id="addCartBtn" onclick="handleAddToCartDetail(' + product.id + ')"><i class="fas fa-cart-shopping"></i> Add to Cart</button><button class="btn btn-gold btn-lg" onclick="handleBuyNowDetail(' + product.id + ')"><i class="fas fa-bolt"></i> Buy Now</button></div>';
      var origPriceHtml = product.originalPrice ? `<span class="product-detail-price-original">₹${product.originalPrice.toLocaleString()}</span>` : '';
      var discountHtml = discount ? `<span class="product-detail-discount">${discount}% OFF</span>` : '';
      var musicDirectorHtml = product.musicDirector ? `<p class="product-detail-music-director">Music Director: <strong>${Utils.escape(product.musicDirector)}</strong></p>` : '';

      // People tags on product detail
      var peopleHtml = '';
      if (product.people && product.people.length) {
        var peopleTagsHtml = product.people.map(slug => {
          var label = PEOPLE_LABELS[slug] || slug;
          return `<a href="#" onclick="navigate('products',{people_filter:'${slug}'});return false;" style="display:inline-flex;align-items:center;gap:0.3rem;background:rgba(255,107,53,0.1);border:1px solid rgba(255,107,53,0.25);color:var(--secondary);padding:0.2rem 0.6rem;border-radius:50px;font-size:0.75rem;font-weight:600;transition:var(--transition);" onmouseover="this.style.background='rgba(255,107,53,0.2)'" onmouseout="this.style.background='rgba(255,107,53,0.1)'">${label}</a>`;
        }).join('');
        peopleHtml = `<div style="margin-bottom:0.75rem;"><p style="font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted);margin-bottom:0.5rem;">🎬 Associated</p><div style="display:flex;flex-wrap:wrap;gap:0.4rem;">${peopleTagsHtml}</div></div>`;
      }

      var trackListingHtml = '';
      function parseTrackLines(raw) {
        if (!raw) return [];
        return String(raw).split(/\r?\n/).map(t => t.trim()).map(t => t.replace(/^\s*\d+[\.)]?\s*/, '')).filter(t => t && !/^(tracks|track listing)$/i.test(t));
      }
      // Parse [Side X] markers embedded in trackListing text; admin saves filled sides only.
      function parseSidesFromMarkers(raw) {
        if (!raw) return null;
        var lines = String(raw).split(/\r?\n/);
        var sides = {};
        var current = null;
        var found = false;
        for (var i = 0; i < lines.length; i++) {
          var t = lines[i].trim();
          if (!t) continue;
          var m = t.match(/^\[Side\s+([A-D])\]$/i);
          if (m) {
            current = m[1].toUpperCase();
            found = true;
            if (!sides[current]) sides[current] = '';
          } else if (current) {
            sides[current] += (sides[current] ? '\n' : '') + t;
          }
        }
        return found ? sides : null;
      }
      var sidesData = (product.trackListingSides && typeof product.trackListingSides === 'object')
        ? product.trackListingSides
        : parseSidesFromMarkers(product.trackListing);
      if (sidesData) {
        var sidesOrder = [{ key: 'A', label: 'Side A' }, { key: 'B', label: 'Side B' }, { key: 'C', label: 'Side C' }, { key: 'D', label: 'Side D' }];
        var sideHtml2 = '';
        sidesOrder.forEach(s => {
          var raw = sidesData[s.key] || sidesData[s.key.toLowerCase()] || sidesData['side' + s.key] || '';
          var sideTracks2 = parseTrackLines(raw);
          if (!sideTracks2.length) return;
          sideHtml2 += `<div class="track-side"><h3>${s.label}</h3><ul>${sideTracks2.map(t => `<li>${Utils.escape(t)}</li>`).join('')}</ul></div>`;
        });
        if (sideHtml2) trackListingHtml = `<div class="track-list"><h2 class="specs-title">Track Listing</h2>${sideHtml2}</div>`;
      } else if (product.trackListing) {
        var tracks = parseTrackLines(product.trackListing);
        if (tracks.length) {
          var sideNames = ['Side A', 'Side B', 'Side C', 'Side D'];
          var sideCount = Math.min(4, tracks.length), perSide = Math.ceil(tracks.length / sideCount), sideHtml = '';
          for (var i = 0; i < sideCount; i++) {
            var sideTracks = tracks.slice(i * perSide, (i + 1) * perSide);
            if (!sideTracks.length) continue;
            sideHtml += `<div class="track-side"><h3>${sideNames[i]}</h3><ul>${sideTracks.map(t => `<li>${Utils.escape(t)}</li>`).join('')}</ul></div>`;
          }
          if (sideHtml) trackListingHtml = `<div class="track-list"><h2 class="specs-title">Track Listing</h2>${sideHtml}</div>`;
        }
      }

      var container = document.getElementById('product-detail-container'); if (!container) return;
      // Gallery: prefer the full `images` array (uploads + URL entries) saved by
      // the admin; fall back to the single `image` for legacy rows.
      var gallery = Array.isArray(product.images) && product.images.length
        ? product.images
        : (product.image ? [product.image] : []);
      var primary = gallery[0] || 'https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=800&h=800&fit=crop';
      var thumbsHtml = gallery.map(function (src, i) {
        var safe = String(src).replace(/'/g, "\\'");
        return '<button type="button" class="product-detail-thumb' + (i === 0 ? ' active' : '') + '" onclick="selectGalleryThumb(this, \'' + safe + '\')"><img src="' + src + '" alt="' + Utils.escape(Seo.productImageAlt(product, i + 1)) + '" loading="lazy" decoding="async" onerror="this.style.opacity=0.3"></button>';
      }).join('');
      container.innerHTML = `
      <div class="product-detail">
        <div class="product-detail-gallery">
          <div class="product-detail-main-image"><img src="${primary}" alt="${gallery.length ? Utils.escape(Seo.productImageAlt(product)) : ''}" id="mainImage" fetchpriority="high" decoding="async" onerror="this.src='https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=800&h=800&fit=crop'"></div>
          <div class="product-detail-thumbs">${thumbsHtml}</div>
        </div>
        <div class="product-detail-info">
          <div class="product-detail-header">
            <div class="product-detail-tags">
              <span class="product-badge badge-${product.badge || 'new'}">${catLabel}</span>
              ${langLabel ? `<span class="product-detail-pill">${langLabel}</span>` : ''}
              ${product.condition === 'pre-owned' ? '<span class="product-detail-condition">Pre-owned</span>' : ''}
            </div>
            ${stockWarn}
          </div>
          <h1 class="product-detail-title">${Utils.escape(product.title)}</h1>
          <p class="product-detail-subtitle">by <strong>${Utils.escape(product.artist)}</strong></p>
          ${musicDirectorHtml}
          ${peopleHtml}
          ${/* Only when real reviews exist. A row of empty stars reading "0 (0 reviews)"
               presented an admin-typed number as if it were a customer rating. */ ''}
          ${Number(product.reviews) > 0 ? `<div class="product-detail-meta"><div style="display:flex;align-items:center;gap:0.5rem;"><span style="color:var(--accent);">${stars}</span><strong>${product.rating}</strong><span style="color:var(--text-muted);font-size:0.875rem;">(${product.reviews} reviews)</span></div></div>` : ''}
          <div class="product-detail-price-block">
            <div class="product-detail-price-meta">
              <span class="product-detail-price">₹${product.price.toLocaleString()}</span>${origPriceHtml}
            </div>
            ${discountHtml}
            <div class="product-detail-availability">${product.stock > 0 ? 'In stock: ' + product.stock + ' units' : (product.badge === 'upcoming' ? 'Coming soon' : 'Out of stock')}</div>
          </div>
          <p class="product-detail-desc">${Utils.escape(product.description)}</p>
          ${trackListingHtml}
          ${specsHtml ? `<div class="product-specs"><h2 class="specs-title">Product details</h2>${specsHtml}</div>` : ''}
          <div class="product-detail-actions">
            <div>
              <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Quantity</p>
              <div class="quantity-control"><div class="qty-btn" onclick="changeQtyDetail(-1)">−</div><div class="qty-display" id="qtyDisplay">1</div><div class="qty-btn" onclick="changeQtyDetail(1)">+</div></div>
            </div>
            <div class="product-actions-group">${actionBtns}</div>
            <div class="product-detail-footnote">
              <!-- Delivery is per product now, so this states THIS product's
                   terms rather than a blanket promise the cart may not keep. -->
              <div>${product.freeShipping
                ? '🚚 <strong style="color:var(--success);">Free delivery</strong> on this item'
                : (product.shippingCharge !== null && product.shippingCharge !== undefined
                    ? '🚚 Delivery ₹' + Number(product.shippingCharge).toLocaleString()
                    : '🚚 Delivery calculated at checkout')}</div>
              <div>🔒 Secure payment</div>
            </div>
          </div>
        </div>
      </div>`;
      _detailQty = product.stock > 0 ? 1 : 0;
      _detailMax = product.stock;
      var qEl = document.getElementById('qtyDisplay'); if (qEl) qEl.textContent = _detailQty;
    }

    // "You may also like": same music director first, then same format and
    // language; in-stock before sold-out; newest first. MIRRORS
    // collections_related_products() in api/_collections_helpers.php so the
    // grid a crawler saw on the server render is the one a visitor sees.
    function relatedProducts(product, products, limit) {
      var norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
      var md = norm(product.musicDirector);
      var lang = String(product.language || '').trim().toLowerCase();
      return products.map(function (q) {
        if (q.id === product.id) return null;
        var s = 0;
        if (md && norm(q.musicDirector) === md) s += 2;
        if (q.category === product.category && String(q.language || '').trim().toLowerCase() === lang) s += 1;
        return s ? { s: s, stock: Number(q.stock) > 0 ? 1 : 0, id: Number(q.id), q: q } : null;
      }).filter(Boolean).sort(function (a, b) {
        return (b.s - a.s) || (b.stock - a.stock) || (b.id - a.id);
      }).slice(0, limit || 4).map(function (x) { return x.q; });
    }

    function renderRelatedProducts(product, products) {
      // Composer, language and format collections + reading, below the details.
      if (typeof CollectionLinks !== 'undefined') CollectionLinks.loadProduct(product);
      var related = relatedProducts(product, products, 4);
      var sec = document.getElementById('related-section'), grid = document.getElementById('related-grid');
      if (related.length && sec && grid) { sec.style.display = 'block'; grid.innerHTML = related.map(createProductCard).join(''); fixProductLinks('page-product'); }
      else if (sec) sec.style.display = 'none';
    }

    function changeQtyDetail(d) {
      if (_detailMax <= 0) { showToast('❌ Product is out of stock', 'danger'); _detailQty = 0; var el = document.getElementById('qtyDisplay'); if (el) el.textContent = _detailQty; return; }
      var nextQty = _detailQty + d;
      if (nextQty > _detailMax) { showToast('⚠️ Only ' + _detailMax + ' available in stock', 'danger'); return; }
      _detailQty = Math.max(1, nextQty);
      var el = document.getElementById('qtyDisplay'); if (el) el.textContent = _detailQty;
    }
    function handleAddToCartDetail(id) {
      if (!CartHelpers.addToCart(id, _detailQty)) return;
      var btn = document.getElementById('addCartBtn');
      if (btn) { btn.innerHTML = '<i class="fas fa-check"></i> Added!'; btn.disabled = true; setTimeout(() => { btn.innerHTML = '<i class="fas fa-cart-shopping"></i> Add to Cart'; btn.disabled = false; }, 2000); }
    }
    function handleBuyNowDetail(id) { if (CartHelpers.addToCart(id, _detailQty)) navigate('cart'); }

    function selectGalleryThumb(btn, src) {
      var main = document.getElementById('mainImage');
      if (main) main.src = src;
      var thumbs = document.querySelectorAll('.product-detail-thumb');
      thumbs.forEach(function (t) { t.classList.remove('active'); });
      if (btn) btn.classList.add('active');
    }

    function initPageCart() {
      var cartItems = CartHelpers.getCartWithDetails(), container = document.getElementById('cart-main'); if (!container) return;
      if (typeof Analytics !== 'undefined') Analytics.viewCart(cartItems);
      if (!cartItems.length) { container.innerHTML = '<div class="empty-cart" style="padding:6rem 2rem;"><div class="empty-cart-icon"><i class="fas fa-shopping-cart"></i></div><h3>Your cart is empty</h3><p>Let\'s fix that!</p><a href="#" onclick="navigate(\'products\')" class="btn btn-primary btn-lg"><i class="fas fa-music"></i> Start Shopping</a></div>'; return; }
      // On the cart page we don't yet know the customer's address, so the
      // exact shipping zone is unresolved. Show "Calculated at checkout"
      // for paid shipping, and "FREE" once the subtotal crosses the
      // pan-India free-shipping threshold. The actual zone-based rate is
      // shown in the payment modal once an address is picked, and the
      // server is authoritative at order-creation time.
      var subtotal = CartHelpers.getCartTotal();
      var quote = Shipping.calculate(subtotal, null, Shipping.cartShippingItems());
      // Cart total shows the subtotal only — shipping is either free (≥ threshold)
      // or unknown until the address is picked at checkout. The order summary's
      // shipping line reflects that distinction.
      var total = subtotal;
      var itemsHtml = cartItems.map(item => `
      <div class="cart-item">
        <div class="cart-item-image" onclick="navigate('product',{id:${item.id}})" style="cursor:pointer;">${
          (typeof item.image === 'string' && item.image.length > 0)
            ? `<img src="${item.image}" alt="${Utils.escape(item.title)}" loading="lazy" decoding="async" onerror="this.src='https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=200&fit=crop'">`
            : (Array.isArray(Storage._memory)
                ? `<img src="https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=200&fit=crop" alt="${Utils.escape(item.title)}" loading="lazy" decoding="async">`
                : `<div class="skeleton skeleton-card-image" style="height:100%;aspect-ratio:auto;" aria-label="Loading image"></div>`)
        }</div>
        <div>
          <h4 class="cart-item-title" onclick="navigate('product',{id:${item.id}})" style="cursor:pointer;">${Utils.escape(item.title)}</h4>
          <p class="cart-item-meta">${Utils.escape(item.artist)} · ${item.category.toUpperCase()}</p>
          <div class="cart-item-qty">
            <button class="cart-qty-btn" onclick="updateCartQtySPA(${item.id},${item.qty - 1})">−</button>
            <span class="cart-qty-num">${item.qty}</span>
            <button class="cart-qty-btn" onclick="updateCartQtySPA(${item.id},${item.qty + 1})">+</button>
            <button type="button" class="cart-item-remove" onclick="removeCartSPA(${item.id})" aria-label="Remove from cart" title="Remove"><i class="fas fa-trash-can"></i></button>
          </div>
        </div>
        <div class="cart-item-price"><div class="price">₹${(item.price * item.qty).toLocaleString()}</div><div class="unit-price">₹${item.price.toLocaleString()} each</div></div>
      </div>`).join('');
        // quote.amountToFree is gone along with the spend threshold — using it
        // here would have printed "Add ₹undefined more". Delivery now depends on
        // what is in the cart, so state that rather than dangling a target the
        // customer can no longer reach by spending more.
        // Coupon, for DISPLAY. The code — never this amount — is what travels to
        // create-order.php, which re-derives the discount server-side.
        // refresh() re-quotes it against the cart as it now stands, so adding
        // an item to a basket that was below a coupon's minimum makes the
        // discount appear without the customer retyping anything.
        var couponDiscount = (typeof Coupon !== 'undefined') ? Coupon.discount() : 0;
        var couponCode     = (typeof Coupon !== 'undefined') ? Coupon.code() : '';
        if (couponDiscount > subtotal) couponDiscount = subtotal;
        var cartTotal = Math.max(0, total - couponDiscount);
        if (typeof Coupon !== 'undefined') Coupon.refresh();
        // A code parked by the email link (arrived with an empty cart, or
        // before signing in) applies itself as soon as there is a cart to
        // quote it against.
        if (typeof CouponLink !== 'undefined' && !couponCode) CouponLink.resumePending();
        // A min_items coupon becomes usable as the basket grows. Announced once
        // per code per session, so this cannot nag on every quantity change.
        if (typeof CouponRewards !== 'undefined' && !couponCode) {
          CouponRewards.check('For adding ' + cartItems.length + ' item' + (cartItems.length === 1 ? '' : 's'));
        }

        var shippingHtml = quote.freeShipping
          ? '🚚 ✅ <strong style="color:var(--success);">Free delivery on this order</strong>'
          : `🚚 Delivery ₹${Number(quote.shipping || 0).toLocaleString()} — charged once per order, not per item`;
      container.innerHTML = `<div class="cart-layout"><div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;"><h2 style="font-family:var(--font-display);font-size:1.25rem;">${cartItems.length} item${cartItems.length > 1 ? 's' : ''} in cart</h2><button class="btn btn-sm btn-danger" onclick="clearCartSPA()"><i class="fas fa-trash-can"></i> Clear Cart</button></div>
        <div class="cart-items-list">${itemsHtml}</div>
        <div style="margin-top:1.5rem;padding:1.25rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);"><i class="fas fa-truck"></i> ${shippingHtml}</div>
      </div>
      <div><div class="cart-summary">
        <h3 class="summary-title">Order Summary</h3>
        <div class="summary-row"><span>Subtotal</span><span>₹${subtotal.toLocaleString()}</span></div>
        ${couponDiscount > 0 ? `<div class="summary-row discount"><span>Discount${couponCode ? ' (' + Utils.escape(couponCode) + ')' : ''}</span><span>−₹${couponDiscount.toLocaleString()}</span></div>` : ''}
        <div class="summary-row"><span>Shipping</span><span>${quote.freeShipping ? '<span style="color:var(--success);">FREE</span>' : '<span style="color:var(--text-muted);font-size:0.85em;">Calculated at checkout</span>'}</span></div>
        <div class="summary-row total"><span>Total</span><span class="amount">₹${cartTotal.toLocaleString()}${quote.freeShipping ? '' : '<span style="display:block;font-size:0.7rem;color:var(--text-muted);font-weight:400;margin-top:0.2rem;">+ shipping</span>'}</span></div>
        ${typeof Coupon !== 'undefined' ? Coupon.summaryHtml() : ''}
        <button class="btn btn-primary btn-lg btn-block" style="margin-top:1.5rem;" onclick="checkoutSPA()"><i class="fas fa-bolt"></i> Proceed to Checkout</button>
        <a href="#" onclick="navigate('products')" class="btn btn-secondary btn-block" style="margin-top:0.75rem;">← Continue Shopping</a>
      </div></div></div>`;
    }

    async function initPageProfile() {
      if (!Auth.isLoggedIn()) {
        navigate('login', { redirect: 'profile' }, { replace: true });
        return;
      }
      const user = await Auth.fetchMe();
      if (!user) {
        navigate('login', { redirect: 'profile' }, { replace: true });
        return;
      }
      populateProfileFromUser(user);
      // Paint order-card skeletons while the orders fetch is in flight —
      // the API call can take 500ms+ on a cold DB connection.
      var ordersList = document.getElementById('orders-list');
      if (ordersList) ordersList.innerHTML = Skeleton.orderCards(3);
      try {
        CURRENT_USER_ORDERS = await Auth.fetchOrders();
      } catch (e) { CURRENT_USER_ORDERS = []; }
      renderOrdersSPA(CURRENT_USER_ORDERS);
      renderWishlistSPA();
      renderAddressesSPA(user);
    }

    function populateProfileFromUser(user) {
      const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || 'Velorex Member';
      const nameEl = document.getElementById('profile-name');
      const emailEl = document.getElementById('profile-email');
      if (nameEl) nameEl.textContent = full;
      if (emailEl) emailEl.textContent = user.email || '';

      // Stats
      const stats = user.stats || { orderCount: 0, totalSpent: 0 };
      const statItems = document.querySelectorAll('#page-profile .p-stat .p-stat-value');
      if (statItems[0]) statItems[0].textContent = stats.orderCount;
      if (statItems[1]) statItems[1].textContent = '₹' + Math.round(stats.totalSpent).toLocaleString();

      // Account form
      const firstEl = document.getElementById('firstName');
      const lastEl = document.getElementById('lastName');
      const userEmailEl = document.getElementById('userEmail');
      if (firstEl) firstEl.value = user.firstName || '';
      if (lastEl) lastEl.value = user.lastName || '';
      if (userEmailEl) userEmailEl.value = user.email || '';

      // Phone + DOB + preferences if those inputs exist
      const accountInputs = document.querySelectorAll('#tab-account .form-control');
      accountInputs.forEach(input => {
        if (input.type === 'tel' && !input.id) input.value = user.phone || '';
        if (input.type === 'date' && !input.id) input.value = user.dateOfBirth || '';
        if (input.placeholder && input.placeholder.toLowerCase().includes('rock') && !input.id) input.value = user.musicPreferences || '';
      });
    }

    async function renderAddressesSPA(user) {
      var container = document.getElementById('addresses-list'); if (!container) return;
      // Skeleton order-card-shaped blocks while /api/addresses.php loads.
      container.innerHTML = Skeleton.orderCards(2);
      var list = [];
      try { list = await Addresses.fetchAll(true); } catch (e) { /* fall through to empty render */ }
      if (!list.length) {
        container.innerHTML = `
          <div class="order-card" style="grid-column:1/-1;text-align:center;">
            <div style="font-size:2.5rem;margin-bottom:0.75rem;">📭</div>
            <p style="color:var(--text-muted);margin-bottom:1rem;">No saved addresses yet.</p>
            <button class="btn btn-sm btn-primary" onclick="openAddressModal()">+ Add Address</button>
          </div>`;
        return;
      }
      container.innerHTML = list.map(addressCard).join('');
    }

    function addressCard(a) {
      var label = a.label ? `<span style="font-size:0.75rem;background:var(--surface-2,rgba(255,255,255,0.06));border:1px solid var(--border);padding:0.15rem 0.5rem;border-radius:999px;">${Utils.escape(a.label)}</span>` : '';
      var def = a.isDefault ? `<span style="font-size:0.7rem;background:rgba(34,197,94,0.15);color:var(--success);border:1px solid rgba(34,197,94,0.4);padding:0.15rem 0.5rem;border-radius:999px;font-weight:600;">DEFAULT</span>` : '';
      var setDefBtn = a.isDefault ? '' : `<button class="btn btn-sm btn-secondary" onclick="setDefaultAddress(${a.id})"><i class="fas fa-star"></i> Set Default</button>`;
      var lines = [a.line1, a.line2, a.landmark].filter(Boolean).map(l => Utils.escape(l)).join('<br>');
      var loc = [a.city, a.state, a.postalCode].filter(Boolean).map(l => Utils.escape(l)).join(', ');
      var gstinRow = a.gstin ? `<p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.4rem;">GSTIN: ${Utils.escape(a.gstin)}</p>` : '';
      return `
        <div class="order-card" style="display:flex;flex-direction:column;gap:0.5rem;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
              <strong style="font-size:0.95rem;">${Utils.escape(a.fullName)}</strong>
              ${label}${def}
            </div>
          </div>
          <p style="font-size:0.85rem;line-height:1.5;">${lines}</p>
          <p style="font-size:0.85rem;color:var(--text-muted);">${loc}<br>${Utils.escape(Addresses.countryName(a.countryCode))}</p>
          <p style="font-size:0.8rem;color:var(--text-muted);">📞 ${Utils.escape(a.phone)}</p>
          ${gstinRow}
          <div style="display:flex;gap:0.5rem;margin-top:0.5rem;flex-wrap:wrap;">
            <button class="btn btn-sm btn-secondary" onclick="openAddressModal(${a.id})"><i class="fas fa-pen"></i> Edit</button>
            ${setDefBtn}
            <button class="btn btn-sm btn-danger" onclick="confirmDeleteAddress(${a.id})"><i class="fas fa-trash"></i> Delete</button>
          </div>
        </div>`;
    }


    async function setDefaultAddress(id) {
      var existing = (Addresses._cached || []).find(a => a.id === id);
      if (!existing) return;
      try {
        await Addresses.save({ ...existing, isDefault: true });
        showToast('Default address updated', 'success');
        renderAddressesSPA(Auth.getUser());
      } catch (e) {
        showToast(e.message || 'Update failed', 'error');
      }
    }

    // Canonical 5-status set (mirrors the server enum). Legacy values from older
    // rows get collapsed by normalizeCustomerOrderStatus.
    var CUSTOMER_STATUS_ORDER = ['pending', 'processing', 'shipped', 'delivered'];
    var CUSTOMER_STATUS_LABELS = {
      pending: 'Pending', processing: 'Processing', shipped: 'Shipped',
      delivered: 'Delivered', cancelled: 'Cancelled'
    };
    var CUSTOMER_STATUS_ICONS = {
      pending: 'fa-box', processing: 'fa-box-open',
      shipped: 'fa-truck', delivered: 'fa-house'
    };
    var CUSTOMER_STATUS_ALIASES = {
      confirmed: 'processing', packed: 'processing',
      out_for_delivery: 'shipped', returned: 'cancelled', refunded: 'cancelled', canceled: 'cancelled'
    };
    function normalizeCustomerOrderStatus(s) {
      var v = String(s || '').toLowerCase().trim();
      if (CUSTOMER_STATUS_ALIASES[v]) return CUSTOMER_STATUS_ALIASES[v];
      if (CUSTOMER_STATUS_LABELS[v]) return v;
      return 'pending';
    }

    function renderOrdersStepper(currentStatus) {
      // Cancelled orders use a different visual (no stepper, just a banner).
      if (currentStatus === 'cancelled') return '<div class="o-cancelled-banner">This order was cancelled.</div>';
      var currentIdx = CUSTOMER_STATUS_ORDER.indexOf(currentStatus);
      if (currentIdx === -1) currentIdx = 0;
      var steps = CUSTOMER_STATUS_ORDER.map(function (s, i) {
        var cls = i < currentIdx ? 'is-done' : (i === currentIdx ? 'is-current' : '');
        return '<div class="o-step ' + cls + '">' +
          '<div class="o-dot"><i class="fas ' + CUSTOMER_STATUS_ICONS[s] + '"></i></div>' +
          '<div class="o-label">' + CUSTOMER_STATUS_LABELS[s] + '</div>' +
          '</div>';
      }).join('');
      return '<div class="o-stepper">' + steps + '</div>';
    }

    function renderOrdersSPA(orders) {
      var container = document.getElementById('orders-list'); if (!container) return;
      if (!orders.length) {
        container.innerHTML = '<div class="no-products"><div class="no-products-icon"><i class="fas fa-box"></i></div><p>No orders yet — find something you love in the store and your orders will appear here.</p></div>';
        return;
      }

      container.innerHTML = orders.map(function (order) {
        var status = normalizeCustomerOrderStatus(order.status);
        var statusLabel = CUSTOMER_STATUS_LABELS[status];
        var items = Array.isArray(order.items) ? order.items : [];
        var itemsHtml = items.length
          ? '<div style="font-size:0.85rem;line-height:1.7;">' +
              items.map(function (it) {
                var name = Utils.escape(String(it.name || it.title || 'Item'));
                var qty = Number(it.qty) || 1;
                var price = Number(it.price || 0);
                return '• ' + qty + '× ' + name + ' — ₹' + (price * qty).toLocaleString();
              }).join('<br>') +
            '</div>'
          : '<div style="color:var(--text-muted);font-size:0.85rem;">No items recorded.</div>';

        var dateStr = order.createdAt
          ? new Date(String(order.createdAt).replace(' ', 'T') + 'Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
          : (order.date || '');

        // Compact tracking display: carrier logo (with hover/focus tooltip) +
        // tracking number, optionally wrapped in a link to the carrier's
        // live tracker. The carrier badge is NOT the link — tapping it on
        // mobile reveals the tooltip; the AWB text is the link target.
        var trackingLine = '';
        if (order.trackingNumber) {
          var trkUrl = carrierTrackingUrl(order);
          var carrierBadge = order.carrier ? carrierBadgeHtml(order.carrier) : '';
          var awbHtml = trkUrl
            ? '<a href="' + Utils.escape(trkUrl) + '" target="_blank" rel="noopener" class="o-awb-link">' + Utils.escape(String(order.trackingNumber)) + ' <i class="fas fa-external-link-alt" style="font-size:0.65em;opacity:0.7;"></i></a>'
            : '<span class="o-awb-text">' + Utils.escape(String(order.trackingNumber)) + '</span>';
          trackingLine =
            '<div class="o-tracking-row">' +
              carrierBadge +
              '<span class="o-awb-wrap">' + awbHtml + '</span>' +
            '</div>';
        }

        var adminNoteHtml = order.adminNote
          ? '<div class="o-admin-note"><span class="o-note-label">📌 Update from seller</span>' + Utils.escape(String(order.adminNote)) + '</div>'
          : '';

        return '<div class="order-card">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;">' +
            '<div>' +
              '<div style="font-weight:700;font-size:1.05rem;letter-spacing:0.01em;">' + Utils.escape(String(order.id || '')) + '</div>' +
              '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.2rem;">' + Utils.escape(String(dateStr)) + '</div>' +
            '</div>' +
            '<div style="text-align:right;">' +
              '<span class="o-status-badge o-status-' + status + '">' + statusLabel + '</span>' +
              '<div style="font-weight:700;font-size:1.1rem;margin-top:0.5rem;color:var(--accent);">₹' + Number(order.total || 0).toLocaleString() + '</div>' +
              trackingLine +
            '</div>' +
          '</div>' +
          '<hr style="border:none;border-top:1px dashed var(--border);margin:1rem 0 0.75rem;">' +
          '<div style="font-weight:600;font-size:0.9rem;margin-bottom:0.4rem;">Items:</div>' +
          itemsHtml +
          adminNoteHtml +
          renderOrdersStepper(status) +
        '</div>';
      }).join('');
    }

    function filterOrders(status) {
      var filtered = status === 'all' ? CURRENT_USER_ORDERS : CURRENT_USER_ORDERS.filter(o => normalizeCustomerOrderStatus(o.status) === status);
      renderOrdersSPA(filtered);
    }

    function renderWishlistSPA() {
      var grid = document.getElementById('wishlist-grid'); if (!grid) return;
      grid.innerHTML = Storage.getProducts().slice(0, 3).map(createProductCard).join('');
      fixProductLinks('page-profile');
    }

    function showTab(name, el) {
      document.querySelectorAll('#page-profile .profile-tab').forEach(t => t.style.display = 'none');
      document.querySelectorAll('#page-profile .profile-nav-item').forEach(i => i.classList.remove('active'));
      var tab = document.getElementById('tab-' + name); if (tab) tab.style.display = 'block';
      if (el) el.classList.add('active');
    }

    async function saveProfile() {
      if (!Auth.isLoggedIn()) { navigate('login'); return; }
      var first = document.getElementById('firstName')?.value.trim() || '';
      var last = document.getElementById('lastName')?.value.trim() || '';
      var email = document.getElementById('userEmail')?.value.trim() || '';

      // Phone, DOB, prefs — pull from form by position since they don't have ids
      var phoneEl = document.querySelector('#tab-account input[type="tel"]');
      var dobEl = document.querySelector('#tab-account input[type="date"]');
      var prefsEl = document.querySelector('#tab-account input[placeholder*="Rock"]') || document.querySelector('#tab-account input[placeholder*="Bollywood"]');

      try {
        const updated = await Auth.updateProfile({
          firstName: first,
          lastName: last,
          email: email,
          phone: phoneEl ? phoneEl.value.trim() : '',
          dateOfBirth: dobEl ? dobEl.value : '',
          musicPreferences: prefsEl ? prefsEl.value.trim() : '',
        });
        populateProfileFromUser({ ...updated, stats: Auth.getUser()?.stats });
        showToast('Profile updated', 'success');
      } catch (e) {
        showToast('Update failed: ' + e.message, 'error');
      }
    }

    async function handleChangePassword(btn) {
      if (!Auth.isLoggedIn()) { navigate('login'); return; }
      const card = btn.closest('.admin-form-card');
      const inputs = card ? card.querySelectorAll('input[type="password"]') : [];
      if (inputs.length < 3) { showToast('Form not found', 'error'); return; }
      const current = inputs[0].value;
      const next = inputs[1].value;
      const confirm = inputs[2].value;
      if (!current || !next) { showToast('Fill all password fields', 'error'); return; }
      if (next.length < 8) { showToast('New password must be at least 8 characters', 'error'); return; }
      if (next !== confirm) { showToast('New passwords do not match', 'error'); return; }
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'Updating...';
      try {
        await Auth.changePassword(current, next);
        inputs.forEach(i => i.value = '');
        showToast('Password updated', 'success');
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    }
    function fixProductLinks(pageId) {
      var section = document.getElementById(pageId); if (!section) return;
      section.querySelectorAll('.product-card').forEach(card => {
        var id = parseInt(card.dataset.id); if (!id) return;
        card.querySelectorAll('a.btn, a.btn-primary, a.btn-sm').forEach(btn => {
          btn.setAttribute('href', '#');
          btn.onclick = (pid => e => { e.preventDefault(); navigate('product', { id: pid }); return false; })(id);
        });
        card.querySelectorAll('.quick-action-btn').forEach(btn => {
          if (btn.title === 'Quick View') {
            btn.setAttribute('href', '#');
            btn.onclick = (pid => e => { e.preventDefault(); navigate('product', { id: pid }); return false; })(id);
          }
        });
      });
    }

    // ---- Product detail gallery thumb selector ----
    // Swap the main detail image to the clicked thumbnail's src. Used by the
    // product detail page's gallery thumbs (rendered in renderProductDetail).
    function selectGalleryThumb(btn, src) {
      var main = document.getElementById('mainImage');
      if (main) main.src = src;
      var thumbs = document.querySelectorAll('.product-detail-thumb');
      thumbs.forEach(function (t) { t.classList.remove('active'); });
      if (btn) btn.classList.add('active');
    }


    // =============================================
    // PRE-OWNED
    // =============================================
    // Second-hand stock across every format. Driven by products.item_condition,
    // set per product in the admin panel (Condition field).
    //
    // Reads from the same Storage cache as every other listing rather than a
    // dedicated endpoint — the lean product list already carries `condition`,
    // so a separate round-trip would buy nothing.
    var PREOWNED_LABELS = {
      vinyl: 'Vinyl Records', cd: 'Audio CDs', cassette: 'Cassettes',
      bluray: 'Blu-ray Movies', dvd: 'DVD Movies'
    };

    var _preownedParams = {};

    function initPagePreowned(params) {
      params = params || {};
      _preownedParams = params;
      var grid = document.getElementById('preowned-grid');
      var countEl = document.getElementById('preowned-count');
      var titleEl = document.getElementById('preowned-title');
      var chips = document.getElementById('preowned-chips');
      var catHost = document.getElementById('preowned-cat-options');
      if (!grid) return;
      restoreView('preowned-grid');

      if (titleEl) {
        titleEl.innerHTML = heroTitleHtml(params.cat
          ? 'Pre-owned ' + (PREOWNED_LABELS[params.cat] || 'Products')
          : 'Pre-owned');
      }

      var all = Storage.getProducts();
      if (!all.length) {
        grid.innerHTML = Skeleton.productGrid(8);
        if (countEl) countEl.innerHTML = Skeleton.inlineLine('9rem');
        return;
      }

      var preowned = all.filter(function (p) { return p.condition === 'pre-owned'; });
      var counts = {};
      preowned.forEach(function (p) { counts[p.category] = (counts[p.category] || 0) + 1; });

      // Format chips and the sidebar's Category list are the same links in two
      // places (the chips are what a phone gets). Built only for formats that
      // actually have pre-owned stock — a link to an empty grid is worse than
      // no link.
      var links = [{ cat: '', label: 'All', n: preowned.length }];
      Object.keys(PREOWNED_LABELS).forEach(function (cat) {
        if (counts[cat]) links.push({ cat: cat, label: PREOWNED_LABELS[cat], n: counts[cat] });
      });
      var linkAttrs = function (l) {
        return ' href="' + (l.cat ? Seo.buildPath('preowned', { cat: l.cat }) : '/pre-owned') + '"'
          + ' onclick="navigate(\'preowned\'' + (l.cat ? ',{cat:\'' + l.cat + '\'}' : '') + ');return false;"';
      };
      var isOn = function (l) { return (params.cat || '') === l.cat; };
      if (chips) {
        chips.innerHTML = preowned.length ? links.map(function (l) {
          return '<a' + linkAttrs(l) + ' class="preowned-chip' + (isOn(l) ? ' active' : '') + '"'
            + (isOn(l) ? ' aria-current="page"' : '') + '>'
            + Utils.escape(l.label) + ' (' + l.n + ')</a>';
        }).join('') : '';
      }
      if (catHost) {
        catHost.innerHTML = links.map(function (l) {
          return '<a' + linkAttrs(l) + ' class="filter-option filter-link' + (isOn(l) ? ' is-active' : '') + '"'
            + (isOn(l) ? ' aria-current="page"' : '') + '>'
            + '<span class="filter-link-box" aria-hidden="true"></span>' + Utils.escape(l.label)
            + '<span class="filter-count">' + l.n + '</span></a>';
        }).join('');
      }

      renderPreownedGrid();
    }

    // Price, stock and sort narrow the grid in place; the format is the route.
    function renderPreownedGrid() {
      var params = _preownedParams || {};
      var grid = document.getElementById('preowned-grid');
      var countEl = document.getElementById('preowned-count');
      if (!grid) return;
      var preowned = Storage.getProducts().filter(function (p) { return p.condition === 'pre-owned'; });
      var shelf = params.cat
        ? preowned.filter(function (p) { return p.category === params.cat; })
        : preowned;

      var prices = Array.from(document.querySelectorAll('#page-preowned input[name="po-price"]:checked')).map(function (i) { return i.value; });
      var avail = Array.from(document.querySelectorAll('#page-preowned input[name="po-avail"]:checked')).map(function (i) { return i.value; });
      var shown = shelf.filter(function (p) {
        if (prices.length && !prices.some(function (range) {
          var parts = String(range).split('-');
          var min = Number(parts[0]) || 0;
          var max = parts[1] ? Number(parts[1]) : Infinity;
          return p.price >= min && p.price <= max;
        })) return false;
        if (avail.length && !((avail.indexOf('instock') !== -1 && p.stock > 0) || (avail.indexOf('outofstock') !== -1 && p.stock < 1))) return false;
        return true;
      });

      var sort = (document.getElementById('preownedSort') || { value: '' }).value;
      if (sort === 'price-asc') shown.sort(function (a, b) { return a.price - b.price; });
      else if (sort === 'price-desc') shown.sort(function (a, b) { return b.price - a.price; });
      else if (sort === 'rating') shown.sort(function (a, b) { return b.rating - a.rating; });
      else if (sort === 'newest') shown.sort(function (a, b) { return b.id - a.id; });
      else if (sort === 'name-asc') shown.sort(function (a, b) { return a.title.localeCompare(b.title); });

      if (countEl) {
        countEl.textContent = shown.length
          ? 'Showing ' + shown.length + ' pre-owned ' + (shown.length === 1 ? 'item' : 'items')
          : '';
      }
      grid.innerHTML = shown.length
        ? shown.map(createProductCard).join('')
        : catalogEmptyHtml({
            variant: shelf.length ? 'filtered' : 'unstocked',
            noun: params.cat ? 'pre-owned ' + (MUSIC_BANNER_NOUNS[params.cat] || 'items') : 'pre-owned items',
            onClear: 'clearPreownedFilters()',
            onAdjust: "document.getElementById('preownedSidebar').scrollIntoView({behavior:'smooth',block:'start'})"
          });
    }

    function clearPreownedFilters() {
      document.querySelectorAll('#page-preowned .filters-sidebar input').forEach(function (i) { i.checked = false; });
      var s = document.getElementById('preownedSort'); if (s) s.value = '';
      if (_preownedParams && _preownedParams.cat) { navigate('preowned'); return; }
      renderPreownedGrid();
    }
