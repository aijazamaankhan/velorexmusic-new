/* =============================================================================
   Velorex Music — cart helpers (storefront)
   Used by: index.html

   The shopping-cart side of state: adds, removes, qty updates, totals, and
   the small badge in the navbar. The cart itself is persisted by Storage
   (per-user vv_cart_<id> or vv_cart_anon) — these helpers are the read/write
   layer with stock-awareness baked in.

   Cross-module touch points (all resolved at runtime via script-scope):
     - Storage.getProducts / getCart / saveCart   (src/js/storage.js)
     - showToast                                  (src/js/toast.js)
   The stock checks below are belt-and-suspenders against the customer
   over-ordering — the server still re-validates at /api/payments/create-order.php
   and the canonical stock decrement happens in finalize_payment().
   ============================================================================= */

    const CartHelpers = {
      // opts.silent suppresses this function's own toasts and lets the caller
      // report once for the whole batch. Added for "Add all to cart" on a combo,
      // which would otherwise stack up to twelve toasts. Stock guards are
      // unaffected — silent changes what is SAID, never what is allowed.
      addToCart(productId, qty = 1, opts = {}) {
        const say = (msg, kind) => { if (!opts.silent) showToast(msg, kind); };
        const products = Storage.getProducts();
        const product = products.find(p => p.id === productId);
        if (!product || qty <= 0) return false;
        if (product.stock === 0) { say('This item is out of stock', 'error'); return false; }
        let cart = Storage.getCart();
        const existing = cart.find(item => item.id === productId);
        const reservedQty = existing ? existing.qty : 0;
        const available = Math.max(0, product.stock - reservedQty);
        if (available === 0) { say('⚠️ Only ' + product.stock + ' available in stock', 'error'); return false; }
        const addQty = Math.min(qty, available);
        if (existing) existing.qty += addQty; else cart.push({ id: productId, qty: addQty });
        Storage.saveCart(cart);
        CartHelpers.updateBadge();
        if (addQty < qty) say('⚠️ Only ' + product.stock + ' available. Cart quantity capped to stock.', 'error');
        else say('"' + product.title + '" added to cart! 🎵', 'success');
        return true;
      },
      removeFromCart(productId) { let cart = Storage.getCart().filter(item => item.id !== productId); Storage.saveCart(cart); this.updateBadge(); },
      updateQty(productId, qty) {
        let cart = Storage.getCart();
        const item = cart.find(i => i.id === productId);
        if (!item) return;
        const product = Storage.getProducts().find(p => p.id === productId);
        if (!product) return;
        if (qty <= 0) { this.removeFromCart(productId); return; }
        if (qty > product.stock) {
          if (product.stock === 0) { this.removeFromCart(productId); showToast('❌ Product is out of stock and removed from cart', 'error'); return; }
          item.qty = product.stock; Storage.saveCart(cart); this.updateBadge();
          showToast('⚠️ Only ' + product.stock + ' available in stock. Quantity adjusted.', 'error'); return;
        }
        item.qty = qty; Storage.saveCart(cart); this.updateBadge();
      },
      getCartWithDetails() {
        const cart = Storage.getCart(), products = Storage.getProducts();
        return cart.map(item => { const p = products.find(p => p.id === item.id); return p ? {...p, qty: item.qty} : null; }).filter(Boolean);
      },
      getCartCount() { return Storage.getCart().reduce((sum, item) => sum + item.qty, 0); },
      getCartTotal() { return this.getCartWithDetails().reduce((sum, item) => sum + item.price * item.qty, 0); },
      updateBadge() {
        const badges = document.querySelectorAll('.cart-badge'), count = this.getCartCount();
        badges.forEach(b => { b.textContent = count > 99 ? '99+' : count; b.classList.toggle('visible', count > 0); });
      }
    };
