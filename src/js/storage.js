/* =============================================================================
   Velorex Music — storefront Storage helper
   Used by: index.html

   Wraps the products cache (3-tier graceful degradation against localStorage
   quota), the local orders cache, and the per-user cart key strategy.

   Loaded after utils.js + constants.js because it references API_BASE from
   constants.js. Loaded as a plain <script src=...> (not type="module") so
   the existing inline script and onclick handlers can resolve Storage via
   script-scope.

   Storage.saveCart() calls CartHelpers.updateBadge(). CartHelpers is defined
   later in the inline <script> block — Storage methods are invoked at runtime
   (after the inline script has executed), so the reference resolves fine.
   getCart() also uses Auth — same deal.

   Why this layering exists: product images are stored as base64 data URLs
   in the DB (LONGTEXT). A catalog of ~200 products with images regularly
   crosses the 5MB per-origin localStorage quota in Chrome/Safari. When that
   write throws, the storefront previously fell back to the (now-empty)
   localStorage cache and showed "0 products" even though the server returned
   a healthy response. The 3-tier _tryCache helper below is the fix.
   ============================================================================= */

    const Storage = {
      // In-memory cache populated by syncFromServer. This is the primary source
      // of truth for the current page session — localStorage is only a best-effort
      // paint cache for the next visit.
      //
      // Why this layering exists: product images are stored as base64 data URLs
      // in the DB (LONGTEXT). A catalog of ~200 products with images regularly
      // crosses the 5MB per-origin localStorage quota in Chrome/Safari. When
      // that write throws, the storefront previously fell back to the
      // (now-empty) localStorage cache and showed "0 products" even though the
      // server returned a healthy response — see the bug fixed in this commit.
      _memory: null,

      async syncFromServer() {
        try {
          const res = await fetch(API_BASE + '/products.php', { cache: 'no-store' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const products = await res.json();
          if (!Array.isArray(products)) throw new Error('Invalid response shape');
          this._memory = products;
          Storage._tryCache(products);
        } catch (e) {
          console.warn('Storage.syncFromServer failed; in-memory cache unchanged:', e.message);
        }
      },

      // Try to persist the catalog to localStorage. Graceful degradation:
      //   1. Full catalog (with base64 images) — ideal, gives instant paint with real images on next visit.
      //   2. Metadata-only (images stripped) — the next visit paints with placeholder images until syncFromServer refreshes. createProductCard's onerror falls back to a stock image, so the page still works.
      //   3. No cache at all — the next visit just waits for syncFromServer.
      // In all three cases the current page session is fine because _memory is populated.
      _tryCache(products) {
        try {
          localStorage.setItem('vv_products', JSON.stringify(products));
          return;
        } catch (quotaErr) {
          // Most likely QuotaExceededError. Strip the heavy fields and retry.
        }
        try {
          const stripped = products.map(p => ({ ...p, image: null, images: null }));
          localStorage.setItem('vv_products', JSON.stringify(stripped));
          console.info('Storage: catalog exceeded localStorage quota; cached metadata-only fallback (images will reload from server on next visit).');
          return;
        } catch (_) {
          // Even the stripped version didn't fit. Drop the cache entirely; next visit will fetch from server.
        }
        try { localStorage.removeItem('vv_products'); } catch (_) {}
        console.info('Storage: localStorage cache disabled (quota even after stripping images).');
      },

      getProducts() {
        // In-memory wins after the first sync — always has the freshest data
        // including images. Fallback path is the localStorage paint cache
        // (which may be metadata-only with image=null; createProductCard's
        // onerror handler will pick up a stock placeholder image).
        if (Array.isArray(this._memory)) return this._memory;
        const stored = localStorage.getItem('vv_products');
        if (!stored) return [];
        try {
          const parsed = JSON.parse(stored);
          return Array.isArray(parsed) ? parsed : [];
        } catch { return []; }
      },

      saveProducts(products) {
        const list = Array.isArray(products) ? products : [];
        this._memory = list;
        Storage._tryCache(list);
      },
      getOrders() { const s = localStorage.getItem('vv_orders'); return s ? JSON.parse(s) : []; },
      // Local cache only. Server-side order creation now happens through the
      // signature-verified payment flow (api/payments/verify.php), so this
      // function intentionally does NOT POST anywhere. Direct POSTs to
      // /api/orders.php now return 410 Gone by design.
      saveOrder(order) {
        const o = this.getOrders();
        o.unshift(order);
        localStorage.setItem('vv_orders', JSON.stringify(o));
      },
      // Cart is stored per-user: vv_cart_anon for anonymous browsers, vv_cart_<id> for logged-in users.
      // This way user A's cart survives logout/login, and user B never sees A's items.
      _cartKey() {
        const u = (typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser()) ? Auth.getUser().id : null;
        return u ? 'vv_cart_' + u : 'vv_cart_anon';
      },
      getCart() {
        // One-time migration from the old un-segmented `vv_cart` key
        const legacy = localStorage.getItem('vv_cart');
        if (legacy !== null) {
          const target = this._cartKey();
          if (!localStorage.getItem(target)) localStorage.setItem(target, legacy);
          localStorage.removeItem('vv_cart');
        }
        const s = localStorage.getItem(this._cartKey());
        if (!s) return [];
        try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
      },
      saveCart(cart) {
        localStorage.setItem(this._cartKey(), JSON.stringify(cart));
        CartHelpers.updateBadge();
      },
    };
