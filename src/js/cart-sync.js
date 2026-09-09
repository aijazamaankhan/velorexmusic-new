/* =============================================================================
   Velorex Music — server-side cart persistence + recovery links (storefront)
   Used by: index.html

   THE GAP THIS CLOSES
   The cart has always lived only in localStorage (CLAUDE.md §7). A visitor who
   added three records and closed the tab left no trace on the server at all —
   which is most cart abandonment, and it was completely invisible. The admin
   could see checkouts people walked away from (payment_orders rows still at
   status='created') but nothing at all about carts that never got that far.

   This module mirrors the cart to /api/cart-sync.php on a debounce, and reads
   the ?recover= token that the abandoned-cart emails link to.

   WHAT IT DOES NOT DO
   It does not make the server the source of truth for the cart. localStorage
   still owns it; this is a one-way mirror for reporting and recovery. Making
   the server authoritative would mean a failed request could empty a shopper's
   basket, and that trade is not worth it for a feature the shopper never sees.

   Cross-module touch points (resolved at runtime):
     - Storage.getCart / getProducts, CartHelpers.addToCart, Auth.headers
     - showToast, navigate, Analytics
   ============================================================================= */

    const CartSync = {
      VISITOR_KEY: 'vv_visitor',
      DEBOUNCE_MS: 1500,

      _timer: null,
      _lastPayload: null,   // dedupe: skip a POST that would say the same thing
      _disabled: false,     // set after repeated failures — see _fail()
      _failures: 0,

      // A stable, random, first-party visitor id. 128 bits of randomness, held
      // in localStorage. It is not a login and not a tracker: it addresses one
      // row holding the product ids this browser put in its own cart, and it
      // never leaves this origin.
      visitorKey() {
        try {
          let k = localStorage.getItem(this.VISITOR_KEY);
          if (k && /^[a-f0-9]{32}$/.test(k)) return k;
          k = this._randomHex(16);
          localStorage.setItem(this.VISITOR_KEY, k);
          return k;
        } catch (_) {
          // Private mode with storage blocked. Fall back to a per-page id so
          // the sync still works for this session rather than erroring — the
          // row simply will not be recognised on the next visit.
          if (!this._ephemeralKey) this._ephemeralKey = this._randomHex(16);
          return this._ephemeralKey;
        }
      },

      _randomHex(bytes) {
        const out = [];
        if (window.crypto && window.crypto.getRandomValues) {
          const buf = new Uint8Array(bytes);
          window.crypto.getRandomValues(buf);
          for (let i = 0; i < buf.length; i++) out.push(buf[i].toString(16).padStart(2, '0'));
        } else {
          // Ancient browser. Math.random is not cryptographic, but the worst
          // case is a visitor id that collides — which costs one wrong cart
          // snapshot, not a security failure.
          for (let i = 0; i < bytes; i++) {
            out.push(Math.floor(Math.random() * 256).toString(16).padStart(2, '0'));
          }
        }
        return out.join('');
      },

      // Called from Storage.saveCart() on every cart mutation. Debounced because
      // dragging a quantity stepper fires a dozen saves in two seconds and each
      // one would otherwise be a request.
      schedule() {
        if (this._disabled) return;
        if (this._timer) clearTimeout(this._timer);
        this._timer = setTimeout(() => { this._timer = null; this.push(); }, this.DEBOUNCE_MS);
      },

      // `force` bypasses the identical-payload check. Sign-in and sign-up call
      // it that way: the items are usually unchanged, but WHO owns them just
      // changed, and attaching the account (and therefore an email address) to
      // the server row is the entire point of that push.
      async push(force) {
        if (this._disabled) return;
        let cart;
        try {
          cart = Storage.getCart();
        } catch (_) { return; }

        const items = (cart || [])
          .map(l => ({ id: Number(l.id), qty: Number(l.qty) }))
          .filter(l => l.id > 0 && l.qty > 0);

        // Skip an identical repeat. Toggling a filter or reloading the cart
        // page should not cost a request.
        const fingerprint = JSON.stringify(items);
        if (!force && fingerprint === this._lastPayload) return;

        try {
          const res = await fetch(API_BASE + '/cart-sync.php', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, Auth.headers()),
            body: JSON.stringify({ cartKey: this.visitorKey(), items: items }),
            keepalive: true,   // survives the tab closing, which is the case that matters most
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          this._lastPayload = fingerprint;
          this._failures = 0;
        } catch (e) {
          this._fail(e);
        }
      },

      // Give up quietly after a few consecutive failures rather than retrying
      // on every cart change for the rest of the session. If the endpoint is
      // missing (deployed before the DB could create its tables, say) this
      // would otherwise be a failed request per interaction, forever, in the
      // console of every shopper.
      _fail(e) {
        this._failures++;
        if (this._failures >= 3) {
          this._disabled = true;
          console.info('CartSync: disabled for this session after repeated failures.');
        } else {
          console.debug('CartSync: push failed', e && e.message);
        }
      },

      // ---- Recovery links ---------------------------------------------------
      // The abandoned-cart emails link to /?recover=<32hex>. Restore the basket
      // and land the customer on the cart page, so the email returns them to a
      // full basket rather than to a shop they have to rebuild from memory.
      async handleRecoveryLink() {
        let token = null;
        try {
          token = new URLSearchParams(window.location.search).get('recover');
        } catch (_) { return false; }
        if (!token || !/^[a-f0-9]{32}$/.test(token)) return false;

        // Strip the token from the address bar immediately, before any await.
        // It is a capability that reveals a cart's contents, and leaving it in
        // the URL puts it in the browser history, in any screenshot the
        // customer shares, and in the Referer header of every outbound link
        // they click from this page.
        this._stripRecoverParam();

        try {
          const res = await fetch(API_BASE + '/recover-cart.php?token=' + encodeURIComponent(token), {
            cache: 'no-store',
          });
          const data = await res.json().catch(() => ({}));

          if (!res.ok || !data.ok) {
            if (data && data.reason === 'already_purchased') {
              showToast('Good news — that order already went through. 🎵', 'info');
            } else {
              showToast('That cart link has expired. Here is the shop instead.', 'info');
            }
            return false;
          }

          const items = Array.isArray(data.items) ? data.items : [];
          if (!items.length) return false;

          // The product cache has to be warm before CartHelpers.addToCart can
          // resolve ids to products and apply its stock guard.
          if (!Storage.getProducts().length) {
            await Storage.syncFromServer();
          }

          // Re-add through the normal path so the stock rules apply. A record
          // that sold out while the email sat unread must not silently reappear
          // in the basket at a quantity we cannot fulfil — addToCart caps it and
          // says so. silent:true batches the toasts into the single one below.
          let added = 0;
          items.forEach(function (line) {
            if (CartHelpers.addToCart(Number(line.id), Number(line.qty) || 1, { silent: true })) added++;
          });

          if (!added) {
            showToast('Sorry — everything in that cart has since sold out.', 'error');
            return false;
          }

          const partial = data.partial || added < items.length;
          showToast(
            partial
              ? '🛒 Cart restored — some items were no longer available.'
              : '🛒 Welcome back! Your cart has been restored.',
            partial ? 'info' : 'success'
          );

          if (typeof Analytics !== 'undefined') {
            Analytics.cartRecovered(data.source, data.subtotal);
          }

          if (typeof navigate === 'function') navigate('cart');
          return true;
        } catch (e) {
          console.debug('CartSync: recovery failed', e && e.message);
          return false;
        }
      },

      _stripRecoverParam() {
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('recover');
          const qs = url.searchParams.toString();
          window.history.replaceState(
            {}, '',
            url.pathname + (qs ? '?' + qs : '') + url.hash
          );
        } catch (_) { /* history API unavailable — harmless, the param just stays */ }
      },
    };
