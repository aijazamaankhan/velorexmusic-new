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

    function comboCardHtml(c) {
      var items = (c.products || []).map(function (p) {
        return '<li><a href="' + Utils.escape(Seo.productPath(p)) + '"'
          + ' onclick="navigate(\'product\',{id:' + p.id + '});return false;">'
          + Utils.escape(p.title) + '</a>'
          + '<span>₹' + Number(p.price).toLocaleString('en-IN') + '</span></li>';
      }).join('');

      return '<article class="combo-card">'
        + '<div class="combo-card-media">' + comboCoverHtml(c) + '</div>'
        + '<div class="combo-card-body">'
        + '<h3 class="combo-card-title">' + Utils.escape(c.title) + '</h3>'
        + (c.description ? '<p class="combo-card-desc">' + Utils.escape(c.description) + '</p>' : '')
        + '<ul class="combo-card-items">' + items + '</ul>'
        + '<div class="combo-card-foot">'
        + '<div class="combo-card-total"><span>' + c.itemCount + ' items together</span>'
        + '<strong>₹' + Number(c.total).toLocaleString('en-IN') + '</strong></div>'
        + (c.inStock
            ? '<button type="button" class="btn btn-primary btn-sm" onclick="addComboToCart(' + c.id + ')">Add all to cart</button>'
            : '<span class="combo-card-oos">Some items are out of stock</span>')
        + '</div></div></article>';
    }

    // Adds every product in the combo at its normal price. Nothing special
    // happens at checkout — which is the point: the total on the card is the
    // total that gets charged.
    function addComboToCart(comboId) {
      var c = (COMBO_CACHE || []).find(function (x) { return x.id === comboId; });
      if (!c || !c.products || !c.products.length) return;
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
