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

    function createProductCard(product) {
      const badgeHtml = product.badge ? `<span class="product-badge badge-${product.badge}"><i class="fas fa-${product.badge === 'hot' ? 'fire' : product.badge === 'new' ? 'sparkles' : product.badge === 'upcoming' ? 'clock' : 'tag'}"></i> ${Utils.escape(product.badge === 'hot' ? 'Hot' : product.badge === 'new' ? 'New' : product.badge === 'upcoming' ? 'Soon' : 'Sale')}</span>` : '';
      const stars = '<i class="fas fa-star" style="color:var(--accent);"></i>'.repeat(Math.round(product.rating)) + '<i class="far fa-star" style="color:var(--accent);"></i>'.repeat(5 - Math.round(product.rating));
      const priceHtml = product.originalPrice ? `<span class="product-price">₹${product.price.toLocaleString()}</span><span class="product-price-original">₹${product.originalPrice.toLocaleString()}</span>` : `<span class="product-price">₹${product.price.toLocaleString()}</span>`;
      const catLabel = product.category === 'vinyl' ? '<i class="fas fa-compact-disc"></i> Vinyl' : product.category === 'cd' ? '<i class="fas fa-compact-disc"></i> CD' : product.category === 'cassette' ? '<i class="fas fa-tape"></i> Cassette' : product.category === 'bluray' ? '<i class="fas fa-film"></i> Blu-ray' : '<i class="fas fa-film"></i> DVD';
      const langLabel = product.language === 'hindi' ? '<i class="fas fa-globe"></i> Hindi' : '<i class="fas fa-earth-americas"></i> English';
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
        ? `<img src="${product.image}" alt="${Utils.escape(product.title)}" loading="lazy" decoding="async" onerror="this.src='https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=400&h=400&fit=crop'">`
        : (synced
            ? `<img src="https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=400&h=400&fit=crop" alt="${Utils.escape(product.title)}" loading="lazy" decoding="async">`
            : `<div class="skeleton skeleton-card-image" aria-label="Loading image"></div>`);
      return `
      <div class="product-card" data-id="${product.id}">
        <div class="product-card-image">
          ${imageHtml}
          ${badgeHtml}
          <div class="product-card-actions">
            <button class="quick-action-btn" onclick="CartHelpers.addToCart(${product.id})" title="Add to Cart"><i class="fas fa-shopping-cart"></i></button>
            <a href="#" onclick="return openProduct(${product.id})" class="quick-action-btn" title="Quick View"><i class="fas fa-eye"></i></a>
          </div>
        </div>
        <div class="product-card-body">
          <div class="product-category-tag">${catLabel} · ${langLabel}</div>
          <h3 class="product-title">${Utils.escape(product.title)}</h3>
          <p class="product-artist">${Utils.escape(product.artist)}</p>
          <div class="product-rating"><span class="stars">${stars}</span><span class="rating-count">(${product.reviews})</span></div>
          <div class="product-price-row">
            <div>${priceHtml}</div>
            ${product.stock === 0 ? '<span style="color:var(--danger);font-size:0.75rem;font-weight:700;">Out of Stock</span>' : ''}
          </div>
        </div>
        <div class="product-card-footer">
          <a href="#" onclick="navigate('product',{id:${product.id}});return false;" class="btn btn-primary btn-sm btn-block">View Details</a>
        </div>
      </div>`;
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
        const params = parsePageFromUrl().params;
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
        const params = parsePageFromUrl().params;
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
      var products = Storage.getProducts();
      var bsg = document.getElementById('best-selling-grid'), nrg = document.getElementById('new-releases-grid'), ug = document.getElementById('upcoming-grid');
      // Cold cache: paint skeletons in all three strips + category counts.
      // The background sync in the DOMContentLoaded bootstrap will re-invoke
      // initPageIndex once real data arrives.
      if (!products.length) {
        ['vinyl','cd','cassette','bluray','dvd'].forEach(cat => {
          var el = document.getElementById(cat + '-count');
          if (el) el.innerHTML = Skeleton.inlineLine('5rem');
        });
        if (bsg) bsg.innerHTML = Skeleton.productGrid(4);
        if (nrg) nrg.innerHTML = Skeleton.productGrid(4);
        if (ug)  ug.innerHTML  = Skeleton.productGrid(4);
        return;
      }
      var counts = { vinyl: 0, cd: 0, cassette: 0, bluray: 0, dvd: 0 };
      products.forEach(p => { if (counts[p.category] !== undefined) counts[p.category]++; });
      ['vinyl','cd','cassette','bluray','dvd'].forEach(cat => {
        var el = document.getElementById(cat + '-count');
        if (el) el.textContent = counts[cat] + ' titles available';
      });
      var emptyMsg = function (msg) { return '<p class="text-muted text-center" style="grid-column:1/-1;padding:1rem 0;">' + msg + '</p>'; };
      if (bsg) { var hot = products.filter(p => p.badge === 'hot').slice(0, 4); bsg.innerHTML = hot.length ? hot.map(createProductCard).join('') : emptyMsg('No bestsellers yet'); }
      if (nrg) { var nw = products.filter(p => p.badge === 'new').slice(0, 4); nrg.innerHTML = nw.length ? nw.map(createProductCard).join('') : emptyMsg('No new releases yet'); }
      if (ug) { var up = products.filter(p => p.badge === 'upcoming' || p.stock === 0).slice(0, 4); ug.innerHTML = up.length ? up.map(createProductCard).join('') : emptyMsg('No upcoming releases'); }
      fixProductLinks('page-index');
    }

    function initPageProducts(params) {
      var allProducts = Storage.getProducts();
      // Cold cache: paint skeleton cards in the grid + skip count updates.
      // The DOMContentLoaded bootstrap's post-sync re-invocation will run
      // initPageProducts again with real data.
      if (!allProducts.length) {
        var sg = document.getElementById('products-grid');
        if (sg) sg.innerHTML = Skeleton.productGrid(8);
        var sc = document.getElementById('products-count');
        if (sc) sc.innerHTML = Skeleton.inlineLine('10rem');
        return;
      }
      document.querySelectorAll('#page-products input[name="cat"]').forEach(cb => cb.checked = false);
      document.querySelectorAll('#page-products input[name="lang"]').forEach(cb => cb.checked = false);
      document.querySelectorAll('#page-products input[name="people"]').forEach(cb => cb.checked = false);
      if (params && params.cat) {
        document.querySelectorAll('#page-products input[name="cat"]').forEach(cb => cb.checked = cb.value === params.cat);
        var labels = { vinyl: 'Vinyl Records', cd: 'Audio CDs', cassette: 'Cassettes', bluray: 'Blu-ray Movies', dvd: 'DVD Movies' };
        var pt = document.getElementById('page-title'); if (pt) pt.textContent = labels[params.cat] || 'Products';
      } else { var pt2 = document.getElementById('page-title'); if (pt2) pt2.textContent = 'All Products'; }
      if (params && params.lang) document.querySelectorAll('#page-products input[name="lang"]').forEach(cb => cb.checked = cb.value === params.lang);
      updateCountsProducts(allProducts);
      applyFilters(params ? params.search : null);
    }

    function updateCountsProducts(products) {
      var countMap = {
        'count-vinyl': p => p.category === 'vinyl',
        'count-cd': p => p.category === 'cd',
        'count-cassette': p => p.category === 'cassette',
        'count-bluray': p => p.category === 'bluray',
        'count-dvd': p => p.category === 'dvd',
        'count-hindi': p => p.language === 'hindi',
        'count-english': p => p.language === 'english'
      };
      Object.keys(countMap).forEach(id => {
        var el = document.getElementById(id);
        if (el) el.textContent = products.filter(countMap[id]).length;
      });
      // Update people counts
      Object.keys(PEOPLE_LABELS).forEach(slug => {
        var el = document.getElementById('count-' + slug);
        if (el) el.textContent = products.filter(p => p.people && p.people.indexOf(slug) !== -1).length;
      });
    }

    function applyFilters(searchOverride) {
      var allProds = Storage.getProducts(), filtered = allProds.slice();

      // Category filter
      var selCats = Array.from(document.querySelectorAll('#page-products input[name="cat"]:checked')).map(i => i.value);
      if (selCats.length) filtered = filtered.filter(p => selCats.indexOf(p.category) !== -1);

      // Language filter
      var selLangs = Array.from(document.querySelectorAll('#page-products input[name="lang"]:checked')).map(i => i.value);
      if (selLangs.length) filtered = filtered.filter(p => selLangs.indexOf(p.language) !== -1);

      // Price filter
      var selPrices = Array.from(document.querySelectorAll('#page-products input[name="price"]:checked')).map(i => i.value);
      if (selPrices.length) {
        filtered = filtered.filter(p => selPrices.some(range => {
          var parts = range.split('-').map(Number);
          return p.price >= parts[0] && p.price <= parts[1];
        }));
      }

      // Availability filter
      var selAvail = Array.from(document.querySelectorAll('#page-products input[name="avail"]:checked')).map(i => i.value);
      if (selAvail.length) {
        filtered = filtered.filter(p => (selAvail.indexOf('instock') !== -1 && p.stock > 0) || (selAvail.indexOf('outofstock') !== -1 && p.stock === 0));
      }

      // ---- PEOPLE FILTER ----
      var selPeople = Array.from(document.querySelectorAll('#page-products input[name="people"]:checked')).map(i => i.value);
      if (selPeople.length) {
        filtered = filtered.filter(p => p.people && selPeople.some(slug => p.people.indexOf(slug) !== -1));
      }

      // Search override
      if (searchOverride) {
        var q = searchOverride.toLowerCase();
        filtered = filtered.filter(p => p.title.toLowerCase().indexOf(q) !== -1 || p.artist.toLowerCase().indexOf(q) !== -1);
      }

      // Sort
      var sort = (document.getElementById('sortSelect') || { value: '' }).value;
      if (sort === 'price-asc') filtered.sort((a, b) => a.price - b.price);
      else if (sort === 'price-desc') filtered.sort((a, b) => b.price - a.price);
      else if (sort === 'rating') filtered.sort((a, b) => b.rating - a.rating);
      else if (sort === 'newest') filtered.sort((a, b) => b.id - a.id);
      else if (sort === 'name-asc') filtered.sort((a, b) => a.title.localeCompare(b.title));

      var grid = document.getElementById('products-grid');
      if (grid) {
        grid.innerHTML = !filtered.length
          ? '<div class="no-products" style="grid-column:1/-1;"><div class="no-products-icon">🔍</div><h3>No products found</h3><p>Try adjusting your filters</p></div>'
          : filtered.map(createProductCard).join('');
        fixProductLinks('page-products');
      }
      var countEl = document.getElementById('products-count');
      if (countEl) countEl.textContent = 'Showing ' + filtered.length + ' of ' + allProds.length + ' products';
      renderActiveFiltersProducts();
    }

    function clearAllFilters() {
      document.querySelectorAll('#page-products .filter-option input').forEach(i => i.checked = false);
      var sortEl = document.getElementById('sortSelect'); if (sortEl) sortEl.value = '';
      var pt = document.getElementById('page-title'); if (pt) pt.textContent = 'All Products';
      var ps = document.getElementById('peopleSearch'); if (ps) { ps.value = ''; filterPeopleOptions(''); }
      applyFilters();
    }

    function setView(view) { var g = document.getElementById('products-grid'); if (g) g.style.gridTemplateColumns = view === 'list' ? '1fr' : ''; }

    // ---- People search box inside filter ----
    function filterPeopleOptions(query) {
      var q = query.toLowerCase().trim();
      document.querySelectorAll('#people-filter-options .people-option').forEach(label => {
        var text = label.textContent.toLowerCase();
        label.style.display = (!q || text.indexOf(q) !== -1) ? '' : 'none';
      });
      // Show/hide group labels based on visible siblings
      document.querySelectorAll('#people-filter-options .people-group-label').forEach(header => {
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
      Array.from(document.querySelectorAll('#page-products input[name="cat"]:checked')).forEach(i => {
        var labels = { vinyl: '💿 Vinyl', cd: '💽 CD', cassette: 'Cassette', bluray: '🎬 Blu-ray', dvd: '🎞️ DVD' };
        tags.push({ label: labels[i.value] || i.value, input: i });
      });
      Array.from(document.querySelectorAll('#page-products input[name="lang"]:checked')).forEach(i => {
        tags.push({ label: i.value === 'hindi' ? '🇮🇳 Hindi' : '🌍 English', input: i });
      });
      Array.from(document.querySelectorAll('#page-products input[name="people"]:checked')).forEach(i => {
        tags.push({ label: '🎬 ' + (PEOPLE_LABELS[i.value] || i.value), input: i });
      });
      container.innerHTML = tags.map((tag, idx) => `<span class="filter-tag">${tag.label}<span class="filter-tag-remove" onclick="removeFilterProduct(${idx})">✕</span></span>`).join('');
      window._filterTags = tags;
      // Sync the "Filters" toggle button's count badge with the active set
      // so users on the drawer-mode (≤1023px) can see at a glance how many
      // filters they've applied without opening the drawer.
      var countBadge = document.getElementById('filtersToggleCount');
      if (countBadge) {
        if (tags.length > 0) { countBadge.textContent = tags.length; countBadge.removeAttribute('hidden'); }
        else { countBadge.setAttribute('hidden', ''); }
      }
    }

    // ---- Filters drawer (≤1023px) ----
    // Above 1024px the filter sidebar is sticky-positioned next to the
    // products grid and these handlers are no-ops in practice — the drawer
    // CSS only kicks in below that breakpoint, so opening/closing on
    // desktop is harmless. ESC + backdrop close. Body scroll is locked
    // while open so the page behind doesn't accidentally scroll under
    // touch input.
    function openFiltersDrawer() {
      var sidebar = document.getElementById('filtersSidebar');
      var backdrop = document.getElementById('filtersBackdrop');
      if (!sidebar) return;
      sidebar.classList.add('open');
      if (backdrop) backdrop.classList.add('open');
      document.body.classList.add('filters-drawer-open');
      // Pre-update the "Show results" label with the current product count.
      updateFiltersDrawerCta();
    }
    function closeFiltersDrawer(scrollToGrid) {
      var sidebar = document.getElementById('filtersSidebar');
      var backdrop = document.getElementById('filtersBackdrop');
      if (sidebar) sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('open');
      document.body.classList.remove('filters-drawer-open');
      if (scrollToGrid) {
        var grid = document.getElementById('products-grid');
        if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    function updateFiltersDrawerCta() {
      var label = document.getElementById('filtersDrawerCtaLabel');
      var countEl = document.getElementById('products-count');
      if (!label) return;
      // Best-effort parse of the current count text ("Showing 5 of 67 products").
      var m = countEl && /Showing\s+(\d+)\s+of/.exec(countEl.textContent || '');
      label.textContent = m ? 'Show ' + m[1] + ' results' : 'Show results';
    }
    // ESC closes the drawer (matches the modal UX everywhere else).
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var sidebar = document.getElementById('filtersSidebar');
      if (sidebar && sidebar.classList.contains('open')) closeFiltersDrawer();
    });

    function removeFilterProduct(idx) {
      if (window._filterTags && window._filterTags[idx]) { window._filterTags[idx].input.checked = false; applyFilters(); }
    }

    function openProduct(id) { navigate('product', { id: id }); return false; }

    function initPageProduct(params) {
      if (!params || !params.id) {
        var c = document.getElementById('product-detail-container');
        if (c) c.innerHTML = '<div class="empty-cart"><div class="empty-cart-icon">😔</div><h3>No product selected</h3><a href="#" onclick="navigate(\'products\')" class="btn btn-primary">Browse Products</a></div>';
        return;
      }
      var id = parseInt(params.id), products = Storage.getProducts(), product = products.find(p => p.id === id);
      if (!product) {
        var c2 = document.getElementById('product-detail-container');
        if (c2) c2.innerHTML = '<div class="empty-cart"><div class="empty-cart-icon">😔</div><h3>Product not found</h3><a href="#" onclick="navigate(\'products\')" class="btn btn-primary">Browse Products</a></div>';
        return;
      }
      var dt = document.getElementById('detail-title'); if (dt) dt.textContent = product.title;
      renderProductDetail(product);
      renderRelatedProducts(product, products);
    }

    function renderProductDetail(product) {
      var stars = '★'.repeat(Math.round(product.rating)) + '☆'.repeat(5 - Math.round(product.rating));
      var catLabel = product.category === 'vinyl' ? '💿 Vinyl Record' : product.category === 'cd' ? '💽 Audio CD' : product.category === 'cassette' ? '📼 Cassette' : product.category === 'bluray' ? '🎬 Blu-ray' : '🎞️ DVD';
      var langLabel = product.language === 'hindi' ? '🇮🇳 Hindi' : '🌍 English';
      var isOOS = product.stock === 0;
      var discount = product.originalPrice ? Math.round((1 - product.price / product.originalPrice) * 100) : null;
      var specsHtml = '';
      if (product.specs) {
        var specOrder = ['format', 'tracks', 'label', 'year', 'genre', 'runtime', 'theme'];
        var specLabels = { format: 'Format', tracks: 'Tracks', label: 'Label', year: 'Year', genre: 'Genre', runtime: 'Runtime', theme: 'Theme' };
        specOrder.forEach(key => { if (product.specs[key] !== undefined && product.specs[key] !== '') specsHtml += `<div class="spec-row"><span class="spec-label">${specLabels[key]}</span><span class="spec-value">${product.specs[key]}</span></div>`; });
        Object.entries(product.specs).forEach(([k, v]) => { if (!specOrder.includes(k)) specsHtml += `<div class="spec-row"><span class="spec-label">${k.charAt(0).toUpperCase() + k.slice(1)}</span><span class="spec-value">${v}</span></div>`; });
      }
      var stockWarn = (product.stock <= 5 && product.stock > 0) ? `<span style="color:var(--danger);font-size:0.8rem;font-weight:600;">⚠️ Only ${product.stock} left!</span>` : '';
      var actionBtns = isOOS ? '<button class="btn btn-secondary" disabled style="opacity:0.5;cursor:not-allowed;">❌ Out of Stock</button>'
        : '<div class="product-actions-group"><button class="btn btn-outline-primary btn-lg" id="addCartBtn" onclick="handleAddToCartDetail(' + product.id + ')">🛒 Add to Cart</button><button class="btn btn-gold btn-lg" onclick="handleBuyNowDetail(' + product.id + ')">⚡ Buy Now</button></div>';
      var origPriceHtml = product.originalPrice ? `<span class="product-detail-price-original">₹${product.originalPrice.toLocaleString()}</span>` : '';
      var discountHtml = discount ? `<span class="product-detail-discount">${discount}% OFF</span>` : '';
      var musicDirectorHtml = product.musicDirector ? `<p class="product-detail-music-director">Music Director: <strong>${product.musicDirector}</strong></p>` : '';

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
        return '<button type="button" class="product-detail-thumb' + (i === 0 ? ' active' : '') + '" onclick="selectGalleryThumb(this, \'' + safe + '\')"><img src="' + src + '" alt="thumbnail ' + (i + 1) + '" loading="lazy" decoding="async" onerror="this.style.opacity=0.3"></button>';
      }).join('');
      container.innerHTML = `
      <div class="product-detail">
        <div class="product-detail-gallery">
          <div class="product-detail-main-image"><img src="${primary}" alt="${product.title}" id="mainImage" fetchpriority="high" decoding="async" onerror="this.src='https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=800&h=800&fit=crop'"></div>
          <div class="product-detail-thumbs">${thumbsHtml}</div>
        </div>
        <div class="product-detail-info">
          <div class="product-detail-header">
            <div class="product-detail-tags">
              <span class="product-badge badge-${product.badge || 'new'}">${catLabel}</span>
              <span class="product-detail-pill">${langLabel}</span>
            </div>
            ${stockWarn}
          </div>
          <h1 class="product-detail-title">${product.title}</h1>
          <p class="product-detail-subtitle">by <strong>${product.artist}</strong></p>
          ${musicDirectorHtml}
          ${peopleHtml}
          <div class="product-detail-meta"><div style="display:flex;align-items:center;gap:0.5rem;"><span style="color:var(--accent);">${stars}</span><strong>${product.rating}</strong><span style="color:var(--text-muted);font-size:0.875rem;">(${product.reviews} reviews)</span></div></div>
          <div class="product-detail-price-block">
            <div class="product-detail-price-meta">
              <span class="product-detail-price">₹${product.price.toLocaleString()}</span>${origPriceHtml}
            </div>
            ${discountHtml}
            <div class="product-detail-availability">${product.stock > 0 ? 'In stock: ' + product.stock + ' units' : 'Pre-order available'}</div>
          </div>
          <p class="product-detail-desc">${product.description}</p>
          ${trackListingHtml}
          ${specsHtml ? `<div class="product-specs"><h2 class="specs-title">Product details</h2>${specsHtml}</div>` : ''}
          <div class="product-detail-actions">
            <div>
              <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Quantity</p>
              <div class="quantity-control"><div class="qty-btn" onclick="changeQtyDetail(-1)">−</div><div class="qty-display" id="qtyDisplay">1</div><div class="qty-btn" onclick="changeQtyDetail(1)">+</div></div>
            </div>
            <div class="product-actions-group">${actionBtns}</div>
            <div class="product-detail-footnote">
              <div>🚚 Free shipping on orders above ₹5,000</div>
              <div>🔒 Secure payment</div>
            </div>
          </div>
        </div>
      </div>`;
      _detailQty = product.stock > 0 ? 1 : 0;
      _detailMax = product.stock;
      var qEl = document.getElementById('qtyDisplay'); if (qEl) qEl.textContent = _detailQty;
    }

    function renderRelatedProducts(product, products) {
      var related = products.filter(p => p.id !== product.id && (p.category === product.category || p.language === product.language)).slice(0, 4);
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
      if (btn) { btn.textContent = '✅ Added!'; btn.disabled = true; setTimeout(() => { btn.textContent = '🛒 Add to Cart'; btn.disabled = false; }, 2000); }
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
      if (!cartItems.length) { container.innerHTML = '<div class="empty-cart" style="padding:6rem 2rem;"><div class="empty-cart-icon"><i class="fas fa-shopping-cart"></i></div><h3>Your cart is empty</h3><p>Let\'s fix that!</p><a href="#" onclick="navigate(\'products\')" class="btn btn-primary btn-lg"><i class="fas fa-music"></i> Start Shopping</a></div>'; return; }
      // On the cart page we don't yet know the customer's address, so the
      // exact shipping zone is unresolved. Show "Calculated at checkout"
      // for paid shipping, and "FREE" once the subtotal crosses the
      // pan-India free-shipping threshold. The actual zone-based rate is
      // shown in the payment modal once an address is picked, and the
      // server is authoritative at order-creation time.
      var subtotal = CartHelpers.getCartTotal();
      var quote = Shipping.calculate(subtotal, null);
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
            <span class="cart-item-remove" onclick="removeCartSPA(${item.id})" style="cursor:pointer;">🗑</span>
          </div>
        </div>
        <div class="cart-item-price"><div class="price">₹${(item.price * item.qty).toLocaleString()}</div><div class="unit-price">₹${item.price.toLocaleString()} each</div></div>
      </div>`).join('');
      var shippingHtml = quote.freeShipping
        ? '🚚 ✅ <strong style="color:var(--success);">Free shipping applied!</strong>'
        : `🚚 Add ₹${quote.amountToFree.toLocaleString()} more for <strong style="color:var(--success);">FREE shipping pan-India</strong>`;
      container.innerHTML = `<div class="cart-layout"><div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;"><h2 style="font-family:var(--font-display);font-size:1.25rem;">${cartItems.length} item${cartItems.length > 1 ? 's' : ''} in cart</h2><button class="btn btn-sm btn-danger" onclick="clearCartSPA()"><i class="fas fa-trash-can"></i> Clear Cart</button></div>
        <div class="cart-items-list">${itemsHtml}</div>
        <div style="margin-top:1.5rem;padding:1.25rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);"><i class="fas fa-truck"></i> ${shippingHtml}</div>
      </div>
      <div><div class="cart-summary">
        <h3 class="summary-title">Order Summary</h3>
        <div class="summary-row"><span>Subtotal</span><span>₹${subtotal.toLocaleString()}</span></div>
        <div class="summary-row"><span>Shipping</span><span>${quote.freeShipping ? '<span style="color:var(--success);">FREE</span>' : '<span style="color:var(--text-muted);font-size:0.85em;">Calculated at checkout</span>'}</span></div>
        <div class="summary-row total"><span>Total</span><span class="amount">₹${total.toLocaleString()}${quote.freeShipping ? '' : '<span style="display:block;font-size:0.7rem;color:var(--text-muted);font-weight:400;margin-top:0.2rem;">+ shipping</span>'}</span></div>
        <button class="btn btn-primary btn-lg btn-block" style="margin-top:1.5rem;" onclick="checkoutSPA()">⚡ Proceed to Checkout</button>
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

