/* =============================================================================
   Velorex Music — storefront combo offers
   Used by: index.html (loaded after pages.js, before router.js)

   Curated bundles. A combo groups products for display; it does NOT discount
   them. The total shown is the real sum of the products' current prices, which
   is exactly what api/payments/create-order.php will charge — so "Add all to
   cart" can never surprise anyone at checkout.

   Rendered in two places:
     homepage  → a strip of the first few combos
     /combos   → the full list
   ============================================================================= */

    var COMBO_CACHE = null;
    // The combo currently on screen. Read by findCombo() (so the buy buttons
    // work on a deep link, before the feed has ever been fetched) and by the
    // breadcrumb renderer in router.js, which needs the title.
    var CURRENT_COMBO = null;

    async function fetchCombos() {
      if (COMBO_CACHE) return COMBO_CACHE;
      try {
        var res = await fetch(API_BASE + '/combos.php', { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        COMBO_CACHE = Array.isArray(data) ? data : [];
      } catch (e) {
        COMBO_CACHE = [];
      }
      return COMBO_CACHE;
    }

    function comboCoverHtml(c) {
      if (c.image) {
        return '<img src="' + Utils.escape(c.image) + '" alt="' + Utils.escape(c.title) + '" loading="lazy" decoding="async">';
      }
      // No cover set: build a small collage from the product covers, so a combo
      // always has an image without the admin having to make one.
      var covers = (c.products || []).filter(function (p) { return p.image; }).slice(0, 3);
      if (!covers.length) return '<div class="combo-cover-empty">🎁</div>';
      return '<div class="combo-collage">' + covers.map(function (p) {
        return '<img src="' + Utils.escape(p.image) + '" alt="' + Utils.escape(p.title) + '" loading="lazy" decoding="async">';
      }).join('') + '</div>';
    }

    function comboPath(c) { return '/combos/' + c.slug; }

    // Card title and cover both link to the combo's own page. Real hrefs, not
    // onclick-only — a crawler follows the href and reaches the detail page,
    // which is where the descriptive copy and the outbound product links are.
    function comboCardHtml(c) {
      var href = Utils.escape(comboPath(c));
      var go = ' href="' + href + '" onclick="navigate(\'combo\',{slug:\''
        + Utils.escape(c.slug) + '\'});return false;"';

      var items = (c.products || []).map(function (p) {
        return '<li><a href="' + Utils.escape(Seo.productPath(p)) + '"'
          + ' onclick="navigate(\'product\',{id:' + p.id + '});return false;">'
          + Utils.escape(p.title) + '</a>'
          + '<span>₹' + Number(p.price).toLocaleString('en-IN') + '</span></li>';
      }).join('');

      return '<article class="combo-card">'
        + '<a class="combo-card-media"' + go + '>' + comboCoverHtml(c) + '</a>'
        + '<div class="combo-card-body">'
        + '<h3 class="combo-card-title"><a' + go + '>' + Utils.escape(c.title) + '</a></h3>'
        + (c.description ? '<p class="combo-card-desc">' + Utils.escape(c.description) + '</p>' : '')
        + '<ul class="combo-card-items">' + items + '</ul>'
        + '<div class="combo-card-foot">'
        + '<div class="combo-card-total"><span>' + c.itemCount + ' items together</span>'
        + '<strong>₹' + Number(c.total).toLocaleString('en-IN') + '</strong></div>'
        + '<a class="btn btn-primary btn-sm"' + go + '>View combo</a>'
        + '</div></div></article>';
    }

    // A combo may be reached three ways: through the feed (homepage strip,
    // /combos), through a deep link to /combos/<slug> that fetched a single
    // combo, or from server-rendered HTML whose buttons fire before any fetch
    // resolves. Look in both places rather than assuming the feed is loaded.
    function findCombo(comboId) {
      if (CURRENT_COMBO && CURRENT_COMBO.id === comboId) return CURRENT_COMBO;
      return (COMBO_CACHE || []).find(function (x) { return x.id === comboId; }) || null;
    }

    // Adds every product in the combo at its normal price. Nothing special
    // happens at checkout — which is the point: the total on the card is the
    // total that gets charged.
    //
    // Returns how many lines were actually added, so buyComboNow() can refuse
    // to send someone to an empty cart.
    function addComboToCart(comboId) {
      var c = findCombo(comboId);
      if (!c || !c.products || !c.products.length) return 0;
      var added = 0;
      c.products.forEach(function (p) {
        // addToCart enforces the stock guard per product, so a combo can never
        // push a line past available stock.
        if (CartHelpers.addToCart(p.id, 1, { silent: true }) !== false) added++;
      });
      showToast(added === c.products.length
        ? '<i class="fas fa-circle-check"></i> ' + added + ' items added to cart'
        : added + ' of ' + c.products.length + ' items added — the rest are out of stock',
        added ? 'success' : 'error');
      CartHelpers.updateBadge();
      return added;
    }

    // Same as above, then straight to the cart — mirrors handleBuyNowDetail on
    // the product page. If nothing could be added (everything sold out between
    // page load and the click) we stay put rather than dumping the customer on
    // an empty cart with no explanation; addComboToCart has already said why.
    function buyComboNow(comboId) {
      if (addComboToCart(comboId) > 0) navigate('cart');
    }

    // ---- /combos/<slug> detail page -----------------------------------------

    function comboDetailHtml(c) {
      var rows = (c.products || []).map(function (p) {
        var href = Utils.escape(Seo.productPath(p));
        var open = ' href="' + href + '" onclick="navigate(\'product\',{id:' + p.id + '});return false;"';
        var oos  = Number(p.stock) < 1;
        var img  = p.image
          ? '<img src="' + Utils.escape(p.image) + '" alt="' + Utils.escape(p.title) + '" loading="lazy" decoding="async">'
          : '<span class="combo-item-noimg">🎵</span>';
        return '<li class="combo-item' + (oos ? ' is-oos' : '') + '">'
          + '<a class="combo-item-media"' + open + '>' + img + '</a>'
          + '<div class="combo-item-info">'
          + '<a class="combo-item-title"' + open + '>' + Utils.escape(p.title) + '</a>'
          + '<span class="combo-item-artist">' + Utils.escape(p.artist || '') + '</span>'
          + (oos ? '<span class="combo-item-oos">Out of stock</span>' : '')
          + '</div>'
          + '<div class="combo-item-actions">'
          + '<span class="combo-item-price">₹' + Number(p.price).toLocaleString('en-IN') + '</span>'
          + (oos ? ''
                 : '<button type="button" class="btn btn-secondary btn-sm"'
                   + ' onclick="handleAddSingleFromCombo(' + p.id + ')">Add just this</button>')
          + '</div></li>';
      }).join('');

      return '<div class="combo-detail">'
        + '<div class="combo-detail-media">' + comboCoverHtml(c) + '</div>'
        + '<div class="combo-detail-main">'
        + '<h1 class="combo-detail-title">' + Utils.escape(c.title) + '</h1>'
        + (c.description ? '<p class="combo-detail-desc">' + Utils.escape(c.description) + '</p>' : '')
        + '<ul class="combo-items">' + rows + '</ul>'
        + '<div class="combo-detail-buy">'
        + '<div class="combo-detail-total">'
        + '<span>' + c.itemCount + ' item' + (c.itemCount === 1 ? '' : 's') + ' together</span>'
        + '<strong>₹' + Number(c.total).toLocaleString('en-IN') + '</strong>'
        // Said plainly rather than left to be discovered at checkout. The price
        // above is the sum of the products' normal prices and is exactly what
        // the server will charge — see api/_combo_helpers.php.
        + '<small>Total of the items above at their normal prices. Shipping is calculated at checkout.</small>'
        + '</div>'
        + (c.inStock
            ? '<div class="combo-detail-actions">'
              + '<button type="button" class="btn btn-outline-primary btn-lg"'
              + ' onclick="addComboToCart(' + c.id + ')">🛒 Add all to cart</button>'
              + '<button type="button" class="btn btn-gold btn-lg"'
              + ' onclick="buyComboNow(' + c.id + ')">⚡ Buy Now</button></div>'
            : '<div class="combo-detail-actions"><span class="combo-card-oos">'
              + 'Some items in this combo are out of stock — you can still add the rest individually.'
              + '</span></div>')
        + '</div></div></div>';
    }

    // Adding one product from the combo list. Not silent: this is a single
    // deliberate action, so the normal per-product toast is the right feedback.
    function handleAddSingleFromCombo(productId) { CartHelpers.addToCart(productId, 1); }

    async function initPageCombo(slug) {
      var host = document.getElementById('combo-detail');
      if (!host) return;
      if (!slug) { navigate('combos'); return; }

      host.innerHTML = '<div class="loading-spinner"></div>';
      var c = null;
      try {
        var res = await fetch(API_BASE + '/combos.php?slug=' + encodeURIComponent(slug), { cache: 'no-store' });
        if (res.ok) c = await res.json();
      } catch (e) { /* falls through to the not-found state below */ }

      if (!c || !c.id) {
        CURRENT_COMBO = null;
        host.innerHTML = '<div style="text-align:center;padding:4rem 1rem;color:var(--text-muted);">'
          + '<div style="font-size:2rem;margin-bottom:0.75rem;">🎁</div>'
          + '<h2 style="color:var(--text);margin-bottom:0.5rem;">Combo not found</h2>'
          + '<p style="margin-bottom:1.5rem;">It may have been removed or is no longer published.</p>'
          + '<a href="/combos" onclick="navigate(\'combos\');return false;" class="btn btn-primary">See all combos</a></div>';
        return;
      }

      CURRENT_COMBO = c;
      host.innerHTML = comboDetailHtml(c);
      // The breadcrumb and the page metadata both name the combo, and neither
      // could know it until this fetch resolved.
      if (typeof updateBreadcrumbs === 'function') updateBreadcrumbs('combo', { slug: slug });
      Seo.syncCombo(c);
    }

    function comboEmptyHtml() {
      return '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:3rem 1rem;">'
        + '<div style="font-size:2rem;margin-bottom:0.75rem;">🎁</div>'
        + '<p>No combo offers right now. Check back soon.</p></div>';
    }

    // ---- /combos page --------------------------------------------------------
    async function initPageCombos() {
      var grid = document.getElementById('combos-grid');
      if (!grid) return;
      grid.innerHTML = '<div class="loading-spinner"></div>';
      var combos = await fetchCombos();
      grid.innerHTML = combos.length ? combos.map(comboCardHtml).join('') : comboEmptyHtml();
    }

    // ---- homepage strip ------------------------------------------------------
    // Hidden entirely when there are no combos, matching how the Best Selling /
    // New Releases strips behave — an empty section with a heading reads as a
    // broken shop.
    async function initHomeCombos() {
      var grid = document.getElementById('home-combos-grid');
      var section = document.getElementById('home-combos');
      if (!grid) return;
      var combos = await fetchCombos();
      if (!combos.length) {
        if (section) section.style.display = 'none';
        grid.innerHTML = '';
        return;
      }
      if (section) section.style.display = '';
      grid.innerHTML = combos.slice(0, 3).map(comboCardHtml).join('');
    }
