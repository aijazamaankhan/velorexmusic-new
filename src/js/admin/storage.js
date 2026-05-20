/* =============================================================================
   Velorex Music — admin Storage helper
   Used by: vlx-admin-2026.html

   The admin's caching layer. Structurally similar to the storefront's
   src/js/storage.js but covers a different set of entities (products,
   orders, categories — not the customer cart) and uses different mutation
   semantics (admin writes go through bulk-replace endpoints).

   Loaded after src/js/utils.js. Reads `API_BASE` from the inline admin
   script that immediately precedes it (admin doesn't share constants.js
   with the storefront — its constants are small enough to live inline).

   3-tier graceful degradation against the localStorage quota is the same
   pattern documented in storage.js — keep both in sync if the strategy
   changes (e.g. switching to IndexedDB).
   ============================================================================= */

    const Storage = {
      // In-memory primary caches. These are populated on every sync and on every
      // mutating write, and ARE the source of truth for everything rendered in
      // this admin session. localStorage below is a best-effort paint cache for
      // the next page load.
      //
      // Why this layering exists: product images are stored as base64 data URLs
      // in the DB (LONGTEXT). A catalog of ~200 products easily exceeds the ~5MB
      // per-origin localStorage quota in Chrome/Safari. Before this fix, the
      // products setItem() filled the quota, the orders setItem() then threw
      // QuotaExceededError, the outer catch swallowed it, and getOrders()
      // returned an empty array from the (now-empty) cache — leaving the
      // admin Customer Orders panel showing "No orders" even though the server
      // had returned the order in the same syncFromServer call.
      _products: null,
      _orders: null,
      _categories: null,

      // Best-effort localStorage write with graceful degradation:
      //   1. Try the full value.
      //   2. If quota exceeded and a `stripper` is supplied, try the stripped variant.
      //   3. Otherwise remove the key — in-memory cache keeps the session working.
      _tryCache(key, value, stripper) {
        try {
          localStorage.setItem(key, JSON.stringify(value));
          return;
        } catch (e) {
          // Most likely QuotaExceededError. Fall through to stripped retry.
        }
        if (typeof stripper === 'function') {
          try {
            localStorage.setItem(key, JSON.stringify(stripper(value)));
            console.info('[Storage] ' + key + ': cached lighter fallback (full value exceeded quota).');
            return;
          } catch (_) {}
        }
        try { localStorage.removeItem(key); } catch (_) {}
        console.info('[Storage] ' + key + ' cache disabled (quota even after stripping).');
      },

      // Heavy-field stripper for products — kills the base64 image fields which
      // are the only thing that pushes a catalog past the quota. The on-page
      // renderer's <img onerror> falls back to a stock placeholder, so the
      // stripped cache still produces a usable first paint.
      _productStripper(list) {
        return list.map(function (p) { return Object.assign({}, p, { image: null, images: null }); });
      },

      // Reader that prefers the in-memory cache (always fresh + complete) and
      // falls back to whatever localStorage has from the previous session.
      _readList(memField, key) {
        if (Array.isArray(this[memField])) return this[memField];
        const stored = localStorage.getItem(key);
        if (!stored) return [];
        try {
          const parsed = JSON.parse(stored);
          return Array.isArray(parsed) ? parsed : [];
        } catch { return []; }
      },

      async syncFromServer() {
        // Server is the source of truth. We unconditionally overwrite the in-memory
        // cache with whatever the server returned (including empty arrays — that means
        // the admin has deleted everything). Each setItem is wrapped in _tryCache so
        // one fetch's storage quota failure doesn't break the others.
        try {
          const [pRes, cRes] = await Promise.all([
            fetch(API_BASE + '/products.php', { cache: 'no-store' }),
            fetch(API_BASE + '/categories.php', { cache: 'no-store' }),
          ]);

          if (pRes.ok) {
            const products = await pRes.json();
            if (Array.isArray(products)) {
              this._products = products;
              this._tryCache('vv_products', products, Storage._productStripper);
            }
          }

          if (cRes.ok) {
            const cats = await cRes.json();
            if (Array.isArray(cats)) {
              this._categories = cats;
              this._tryCache('vv_categories', cats);
            }
          }

          if (sessionStorage.getItem('admin_pass')) {
            const oRes = await fetch(API_BASE + '/orders.php', {
              cache: 'no-store',
              headers: { 'X-Admin-Pass': sessionStorage.getItem('admin_pass') },
            });
            if (oRes.ok) {
              const orders = await oRes.json();
              if (Array.isArray(orders)) {
                this._orders = orders;
                this._tryCache('vv_orders', orders);
              }
            }
          }
        } catch (e) {
          console.warn('[Storage] syncFromServer failed; using cached data:', e.message);
        }
      },

      async _postProducts(products) {
        const res = await fetch(API_BASE + '/products.php', {
          method: 'POST',
          headers: adminAuthHeaders(),
          body: JSON.stringify({ products }),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error('HTTP ' + res.status + ': ' + txt);
        }
        return res.json();
      },

      getProducts() {
        return this._readList('_products', 'vv_products');
      },

      // Per-item upsert. Waits for the server to confirm before touching the local
      // cache, so a failed POST never silently "succeeds" only on the client.
      // Throws on failure — caller is expected to surface the error to the user.
      async upsertProduct(product) {
        if (!product || typeof product.id === 'undefined') {
          throw new Error('Product is missing an id');
        }
        const res = await fetch(API_BASE + '/products.php', {
          method: 'POST',
          headers: adminAuthHeaders(),
          body: JSON.stringify(product),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error('HTTP ' + res.status + (txt ? ': ' + txt : ''));
        }
        // Update the cache row-by-row so we don't trample sibling rows.
        const list = Storage.getProducts().slice();
        const idx = list.findIndex(p => p.id === product.id);
        const isUpdate = idx >= 0;
        if (isUpdate) list[idx] = { ...list[idx], ...product };
        else list.push(product);
        Storage._products = list;
        Storage._tryCache('vv_products', list, Storage._productStripper);
        recordSaveResult({
          status: 'ok',
          op: isUpdate ? 'update' : 'add',
          detail: (isUpdate ? 'Updated' : 'Added') + ' "' + (product.title || ('#' + product.id)) + '"'
        });
        return res.json();
      },

      // Per-item delete. Removes from the server first; only mutates the local
      // cache after the DELETE returns ok.
      async deleteProduct(id) {
        const res = await fetch(API_BASE + '/products.php?id=' + encodeURIComponent(id), {
          method: 'DELETE',
          headers: adminAuthHeaders(),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error('HTTP ' + res.status + (txt ? ': ' + txt : ''));
        }
        const list = Storage.getProducts().filter(p => p.id !== id);
        Storage._products = list;
        Storage._tryCache('vv_products', list, Storage._productStripper);
        recordSaveResult({ status: 'ok', op: 'delete', detail: 'Deleted product #' + id });
        return res.json();
      },

      // Bulk CSV import. Sends the rows the user already validated client-side
      // to /api/products-bulk-upsert.php (additive — does NOT wipe the catalog).
      // The server echoes back the canonical saved rows; we merge those into
      // the local cache rather than trusting our send payload, so server-side
      // normalization (default rating, etc.) shows up immediately in the table.
      async bulkUpsertProducts(products) {
        const res = await fetch(API_BASE + '/products-bulk-upsert.php', {
          method: 'POST',
          headers: adminAuthHeaders(),
          body: JSON.stringify({ products }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          throw new Error(data.error || ('HTTP ' + res.status));
        }
        if (Array.isArray(data.products) && data.products.length) {
          const list = Storage.getProducts();
          const byId = new Map(list.map(p => [p.id, p]));
          for (const p of data.products) byId.set(p.id, p);
          const merged = Array.from(byId.values()).sort((a, b) => a.id - b.id);
          Storage._products = merged;
          Storage._tryCache('vv_products', merged, Storage._productStripper);
        }
        recordSaveResult({
          status: 'ok',
          op: 'bulk',
          detail: 'Bulk: ' + data.inserted + ' added, ' + data.updated + ' updated'
            + (data.errors && data.errors.length ? ', ' + data.errors.length + ' skipped' : ''),
        });
        return data;
      },

      // Legacy bulk-replace path. Kept only for explicit "import the full catalog"
      // operations; every per-item caller should use upsertProduct / deleteProduct.
      // Refuses to wipe the table by accident — the most common way the previous
      // single-product saves clobbered the catalogue was a stale local cache
      // re-POSTing a shrunken list.
      saveProducts(products) {
        if (!Array.isArray(products)) {
          console.error('[Storage.saveProducts] expected array, got', products);
          return;
        }
        if (products.length === 0) {
          console.error('[Storage.saveProducts] refusing to bulk-replace with empty list. Use deleteProduct(id) for individual deletes.');
          if (typeof showToast === 'function') {
            showToast('⚠️ Empty-list bulk save blocked (would wipe the catalog).', 'danger');
          }
          return;
        }
        this._products = products;
        this._tryCache('vv_products', products, Storage._productStripper);
        Storage._postProducts(products).catch(e => {
          console.error('[Storage] Product sync failed:', e);
          if (typeof showToast === 'function') {
            showToast('⚠️ Server sync failed. Changes saved locally only: ' + e.message, 'danger');
          }
        });
      },

      getOrders() {
        return this._readList('_orders', 'vv_orders');
      },

      // Note: order status changes save locally only. Customer-created orders persist via /api/orders.php POST.
      // A future PATCH endpoint can sync status changes if needed.
      saveOrders(orders) {
        this._orders = Array.isArray(orders) ? orders : [];
        this._tryCache('vv_orders', this._orders);
      },

      getCategories() {
        const defaults = ['vinyl', 'cd', 'cassette', 'bluray', 'dvd'];
        const list = this._readList('_categories', 'vv_categories');
        return list.length ? list : defaults;
      },

      saveCategories(categories) {
        this._categories = Array.isArray(categories) ? categories : [];
        this._tryCache('vv_categories', this._categories);
        fetch(API_BASE + '/categories.php', {
          method: 'POST',
          headers: adminAuthHeaders(),
          body: JSON.stringify({ categories }),
        }).then(r => {
          if (!r.ok && typeof showToast === 'function') {
            showToast('⚠️ Categories sync failed: HTTP ' + r.status, 'danger');
          }
        }).catch(e => {
          if (typeof showToast === 'function') {
            showToast('⚠️ Categories sync failed: ' + e.message, 'danger');
          }
        });
      },
    };
