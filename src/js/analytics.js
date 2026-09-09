/* =============================================================================
   Velorex Music — GA4 ecommerce events (storefront)
   Used by: index.html

   The GA4 tag (G-N6H3GG17TM) has always been on the page, and router.js sends
   a page_view on every SPA navigation. That answered "how many people came"
   and nothing else: there were no ecommerce events, so GA could say 400
   visitors and could not say that 30 of them added to cart and 8 bought.
   Every funnel report, the whole Monetisation section and all revenue
   attribution were empty.

   This module fills that in with the GA4 recommended-event vocabulary, which
   is what unlocks those built-in reports — a custom event name would still
   record, but would not populate the funnels.

     view_item_list  a grid of products was shown
     select_item     a product card was clicked
     view_item       the product detail page was opened
     add_to_cart     / remove_from_cart
     view_cart       the cart page was opened
     begin_checkout  the payment modal was opened
     add_shipping_info  an address was chosen / entered
     purchase        payment verified server-side
     search          / sign_up / login / newsletter_signup

   RULES THAT MATTER
   1. Nothing here may throw into a caller. These calls sit inside add-to-cart
      and the payment success path; an analytics error must never break a
      purchase. Every entry point is wrapped.
   2. `purchase` fires exactly once per order. GA4 de-duplicates on
      transaction_id, but the verify handler can genuinely run twice (a retry,
      a double-click), and inflated revenue is worse than missing revenue
      because it is believed. Sent order ids are remembered in sessionStorage.
   3. Money is sent in rupees, matching the storefront's own display. The
      payment path uses paise (CLAUDE.md §10) — convert at the boundary, here,
      and never mix the two units in one object.
   4. gtag() is defined by the inline snippet in the document head, so it
      exists before this file runs even while the tag script is still loading.
      The typeof guard is for the case where an extension removed it.
   ============================================================================= */

    const Analytics = {
      CURRENCY: 'INR',

      // Single choke point. Every event goes through here so the "never throw"
      // guarantee is enforced in one place rather than trusted at 12 call sites.
      _send(name, params) {
        try {
          if (typeof window.gtag !== 'function') return;
          window.gtag('event', name, params || {});
        } catch (e) {
          // Deliberately swallowed. An analytics failure is not a customer
          // problem, and the console note is enough for us to notice in dev.
          console.debug('Analytics: ' + name + ' failed', e);
        }
      },

      // Map a storefront product (or a cart line, which is a product plus qty)
      // onto GA4's item shape. Field names are fixed by GA4 — renaming any of
      // them silently drops that dimension from every report.
      _item(p, qty, index) {
        if (!p) return null;
        const item = {
          item_id: String(p.id),
          item_name: String(p.title || p.name || ''),
          item_brand: String(p.artist || ''),
          item_category: String(p.category || ''),
          price: Number(p.price) || 0,
          quantity: Number(qty) || 1,
        };
        if (p.language)    item.item_category2 = String(p.language);
        if (p.subcategory) item.item_category3 = String(p.subcategory);
        if (p.condition)   item.item_variant   = String(p.condition);
        if (typeof index === 'number') item.index = index;
        return item;
      },

      _itemsFromCart(cartLines) {
        return (cartLines || [])
          .map((line, i) => this._item(line, line.qty, i))
          .filter(Boolean);
      },

      _value(items) {
        return (items || []).reduce((sum, i) => sum + (i.price * i.quantity), 0);
      },

      // ---- Browsing ---------------------------------------------------------

      viewItemList(products, listName) {
        const items = (products || []).slice(0, 30).map((p, i) => this._item(p, 1, i)).filter(Boolean);
        if (!items.length) return;
        this._send('view_item_list', {
          item_list_name: listName || 'Products',
          items: items,
        });
      },

      selectItem(product, listName) {
        const item = this._item(product, 1);
        if (!item) return;
        this._send('select_item', { item_list_name: listName || 'Products', items: [item] });
      },

      viewItem(product) {
        const item = this._item(product, 1);
        if (!item) return;
        this._send('view_item', {
          currency: this.CURRENCY,
          value: item.price,
          items: [item],
        });
      },

      search(term) {
        const q = String(term || '').trim();
        if (q === '') return;
        this._send('search', { search_term: q });
      },

      // ---- Cart -------------------------------------------------------------

      addToCart(product, qty) {
        const item = this._item(product, qty);
        if (!item) return;
        this._send('add_to_cart', {
          currency: this.CURRENCY,
          value: item.price * item.quantity,
          items: [item],
        });
      },

      removeFromCart(product, qty) {
        const item = this._item(product, qty);
        if (!item) return;
        this._send('remove_from_cart', {
          currency: this.CURRENCY,
          value: item.price * item.quantity,
          items: [item],
        });
      },

      viewCart(cartLines) {
        const items = this._itemsFromCart(cartLines);
        if (!items.length) return;
        this._send('view_cart', {
          currency: this.CURRENCY,
          value: this._value(items),
          items: items,
        });
      },

      // ---- Checkout ---------------------------------------------------------

      beginCheckout(cartLines) {
        const items = this._itemsFromCart(cartLines);
        if (!items.length) return;
        this._send('begin_checkout', {
          currency: this.CURRENCY,
          value: this._value(items),
          items: items,
        });
      },

      addShippingInfo(cartLines, shippingTier) {
        const items = this._itemsFromCart(cartLines);
        if (!items.length) return;
        this._send('add_shipping_info', {
          currency: this.CURRENCY,
          value: this._value(items),
          shipping_tier: String(shippingTier || 'Standard'),
          items: items,
        });
      },

      // Fired from the verify-success handler, i.e. only after the SERVER has
      // confirmed the HMAC signature and created the order. Never fire this on
      // the browser's own say-so that a payment succeeded — that is exactly the
      // claim api/payments/verify.php exists to refuse to take on trust, and
      // reporting revenue on it would put forged sales in the owner's dashboard.
      purchase(orderId, cartLines, opts) {
        const id = String(orderId || '').trim();
        if (id === '') return;
        if (this._alreadySent(id)) return;

        const o = opts || {};
        const items = this._itemsFromCart(cartLines);
        const subtotal = this._value(items);
        this._send('purchase', {
          transaction_id: id,
          currency: this.CURRENCY,
          // Prefer the server-confirmed total when we have it; the cart sum is
          // a fallback and excludes shipping.
          value: typeof o.total === 'number' ? o.total : subtotal,
          shipping: typeof o.shipping === 'number' ? o.shipping : 0,
          items: items,
        });
        this._markSent(id);
      },

      // ---- Account / marketing ---------------------------------------------

      signUp(method)        { this._send('sign_up', { method: method || 'email' }); },
      login(method)         { this._send('login',   { method: method || 'email' }); },
      newsletterSignup(src) { this._send('newsletter_signup', { method: src || 'footer' }); },

      // Someone arrived from a recovery email and their cart was refilled.
      // Not a GA4 recommended event, so it will not appear in the built-in
      // funnels — mark it as a conversion in GA4 Admin -> Events to report on it.
      cartRecovered(source, value) {
        this._send('cart_recovered', {
          currency: this.CURRENCY,
          value: Number(value) || 0,
          recovery_source: source || 'cart',
        });
      },

      // ---- purchase de-duplication -----------------------------------------
      // sessionStorage, not localStorage: the guard only needs to survive a
      // reload of the success page, and a permanent record of every order id a
      // browser has ever placed is more retained data than this needs.
      _SENT_KEY: 'vv_ga_purchases',

      _alreadySent(orderId) {
        try {
          const raw = sessionStorage.getItem(this._SENT_KEY);
          if (!raw) return false;
          const list = JSON.parse(raw);
          return Array.isArray(list) && list.indexOf(orderId) !== -1;
        } catch (_) {
          // Private mode, or storage disabled. Falling through to "not sent"
          // risks a duplicate on a manual refresh; refusing to send would lose
          // the sale entirely. A slightly over-counted order beats a missing one.
          return false;
        }
      },

      _markSent(orderId) {
        try {
          const raw = sessionStorage.getItem(this._SENT_KEY);
          const list = raw ? JSON.parse(raw) : [];
          const next = Array.isArray(list) ? list : [];
          next.push(orderId);
          sessionStorage.setItem(this._SENT_KEY, JSON.stringify(next.slice(-20)));
        } catch (_) { /* nothing to do — see _alreadySent */ }
      },

      // select_item is wired by DELEGATION rather than by an onclick on each
      // card. Product cards are rendered as HTML strings in half a dozen
      // places (grid, related products, combos, hero, search) and adding a
      // call to each template would guarantee the next new surface forgets
      // one. A single listener on the document catches every card, present
      // and future.
      //
      // Capture phase, because the card's own onclick returns false to keep
      // the SPA transition — a bubble-phase listener would still run, but
      // capture means this cannot be affected by anything a handler does.
      initDelegation() {
        document.addEventListener('click', (ev) => {
          try {
            const card = ev.target && ev.target.closest && ev.target.closest('.product-card[data-id]');
            if (!card) return;
            const id = Number(card.getAttribute('data-id'));
            if (!id) return;
            // Ignore the add-to-cart button inside the card: that is an
            // add_to_cart event, already reported by CartHelpers, and counting
            // it as a list selection too would overstate click-through.
            if (ev.target.closest('.product-card-actions, button')) return;
            const product = Storage.getProducts().find(p => p.id === id);
            if (product) this.selectItem(product, document.title);
          } catch (_) { /* never let analytics interfere with a click */ }
        }, true);
      },
    };

    Analytics.initDelegation();
