/* =============================================================================
   Velorex Music — coupons (storefront)
   Used by: the cart's Order Summary, and the promo popup on the homepage.

   WHAT THIS FILE DOES NOT DO: decide a price.
   /api/coupon-validate.php gives the cart a QUOTE so the customer can see the
   discount before committing, and api/payments/create-order.php runs the same
   coupon_evaluate() against a subtotal it derives itself. The applied code
   travels to checkout as a code, never as an amount, so a tampered browser can
   at most ask for a discount the server then refuses.

   The applied code lives in sessionStorage rather than localStorage: a coupon
   is a shopping-trip thing, and a code that silently re-applies itself weeks
   later — quite possibly after it expired — is a support ticket.

   Cross-module touch points (resolved at runtime):
     - API_BASE, Utils.escape, Storage, showToast, initPageCart, currentPage
   ============================================================================= */

    const Coupon = {
      KEY: 'vv_coupon',

      applied() {
        try {
          const raw = sessionStorage.getItem(this.KEY);
          return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
      },

      _store(v) {
        try {
          if (v) sessionStorage.setItem(this.KEY, JSON.stringify(v));
          else sessionStorage.removeItem(this.KEY);
        } catch (e) { /* private mode — the coupon just does not persist */ }
      },

      // The code to hand to create-order.php. Only ever a code.
      code() {
        const a = this.applied();
        return a && a.code ? String(a.code) : '';
      },

      // Last known discount, for DISPLAY only. Re-quoted whenever the cart
      // changes, because a percentage coupon's value moves with the basket.
      discount() {
        const a = this.applied();
        return a && a.discount ? Number(a.discount) || 0 : 0;
      },

      clear(silent) {
        this._store(null);
        if (!silent && typeof showToast === 'function') showToast('Coupon removed', 'info');
        this._repaintCart();
      },

      // Re-render the cart ONLY when the cart is what is on screen. clear() is
      // also called from the checkout flow when the server refuses a code, and
      // re-running initPageCart there would repaint a page the customer is not
      // looking at, mid-payment.
      _repaintCart() {
        if (typeof currentPage !== 'undefined' && currentPage !== 'cart') return;
        if (typeof initPageCart === 'function') initPageCart();
      },

      async apply(code) {
        code = String(code || '').trim().toUpperCase();
        if (!code) { showToast('Enter a coupon code', 'error'); return; }

        const btn = document.getElementById('coupon-apply');
        const err = document.getElementById('coupon-error');
        if (err) { err.textContent = ''; err.hidden = true; }
        if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }

        try {
          const items = (Storage.getCart() || []).map(function (i) {
            return { id: i.id, qty: i.qty };
          });
          const res = await fetch(API_BASE + '/coupon-validate.php', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' },
                                   (typeof Auth !== 'undefined' ? Auth.headers() : {})),
            body: JSON.stringify({ code: code, items: items }),
          });
          const data = await res.json().catch(function () { return {}; });

          if (!data.ok) {
            // The reason goes next to the field, not into a toast that has
            // vanished by the time they retype.
            if (err) { err.textContent = data.error || 'That coupon code is not valid'; err.hidden = false; }
            this._store(null);
            return false;
          }

          this._store({ code: data.code, discount: Number(data.discount) || 0, label: data.label || '' });
          showToast(data.label ? (data.label + ' applied') : 'Coupon applied', 'success');
          this._repaintCart();
          // Returned so callers that ANNOUNCE the result — the reward card —
          // can say what actually happened rather than what was attempted.
          return true;
        } catch (e) {
          if (err) { err.textContent = 'Could not check that coupon right now'; err.hidden = false; }
          return false;
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = 'Apply'; }
        }
      },

      // Re-quote a code already applied, against the cart as it now stands.
      // Called from initPageCart, so adding an item to a basket that was below
      // a coupon's minimum makes the discount appear rather than requiring the
      // customer to retype it.
      async refresh() {
        const a = this.applied();
        if (!a || !a.code) return;
        // In-flight guard. refresh() is called from initPageCart's render, and
        // it can itself trigger a re-render when the amount changes — without
        // this the pair would loop, one fetch per frame.
        if (this._refreshing) return;
        this._refreshing = true;
        try {
          const items = (Storage.getCart() || []).map(function (i) {
            return { id: i.id, qty: i.qty };
          });
          if (!items.length) { this._store(null); return; }
          const res = await fetch(API_BASE + '/coupon-validate.php', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' },
                                   (typeof Auth !== 'undefined' ? Auth.headers() : {})),
            body: JSON.stringify({ code: a.code, items: items }),
          });
          const data = await res.json().catch(function () { return {}; });
          const before = this.discount();
          if (!data.ok) {
            // It no longer applies (cart dropped below the minimum, expired
            // while they shopped). Drop it and say so — a summary quietly
            // showing a discount the till will not honour is the one outcome
            // worth avoiding.
            this._store(null);
            if (typeof showToast === 'function') showToast(data.error || 'Coupon no longer applies', 'error');
          } else {
            this._store({ code: data.code, discount: Number(data.discount) || 0, label: data.label || '' });
          }
          if (before !== this.discount()) this._repaintCart();
        } catch (e) {
          /* leave the last known quote; checkout re-checks anyway */
        } finally {
          this._refreshing = false;
        }
      },

      // The Order Summary block. Rendered by initPageCart.
      summaryHtml() {
        const a = this.applied();
        if (a && a.code) {
          return ''
            + '<div class="coupon-applied">'
            +   '<span class="coupon-tag"><i class="fas fa-tag"></i> ' + Utils.escape(a.code) + '</span>'
            +   '<button type="button" class="coupon-remove" onclick="Coupon.clear()">Remove</button>'
            + '</div>';
        }
        return ''
          + '<div class="coupon-form">'
          +   '<input type="text" id="coupon-code" class="coupon-input" placeholder="Coupon code"'
          +     ' autocomplete="off" autocapitalize="characters" spellcheck="false"'
          +     ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();Coupon.apply(this.value);}">'
          +   '<button type="button" id="coupon-apply" class="btn btn-secondary coupon-btn"'
          +     ' onclick="Coupon.apply(document.getElementById(\'coupon-code\').value)">Apply</button>'
          + '</div>'
          + '<div class="coupon-error" id="coupon-error" hidden></div>';
      },
    };

    /* ---------------------------------------------------------------------------
       Promo popup — the "flash" announcement of the featured coupon.

       Constrained the same way the intro splash is (CLAUDE.md §15), and for the
       same reason: a full-screen overlay on arrival is what Google classifies as
       an intrusive interstitial, a documented mobile ranking negative. So this
       one is a CORNER CARD, not a full-screen curtain — it never covers the
       content, it appears after a delay rather than on arrival, it shows once
       per session, and it is dismissible by button, Escape or clicking away.
       Don't promote it to a full-screen modal.
       --------------------------------------------------------------------------- */
    const CouponPromo = {
      // TWO flags, because "I have the code" and "not now" are different
      // answers and deserve different lifetimes:
      //   COPIED_KEY  localStorage  — they took the code. Never show it again,
      //                              across sessions: they have what it offers.
      //   DISMISS_KEY sessionStorage — they closed it without copying. Stays
      //                              gone for this visit and comes back on the
      //                              next one, so an offer is not lost to one
      //                              stray click.
      // The card therefore keeps appearing until the code is actually taken,
      // which is what it is for — while the X still works, so it can never
      // become something a visitor cannot get past.
      COPIED_KEY: 'vv_promo_copied',
      DISMISS_KEY: 'vv_promo_dismissed',
      DELAY_MS: 6000,

      async init() {
        try {
          if (localStorage.getItem(this.COPIED_KEY)) return;
          if (sessionStorage.getItem(this.DISMISS_KEY)) return;
        } catch (e) { return; }
        if (typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          // Still shown — it is information, not decoration — but with the
          // slide-in animation suppressed by CSS.
        }

        let coupon = null;
        try {
          const res = await fetch(API_BASE + '/coupons.php');
          const data = await res.json();
          coupon = data && data.coupon;
        } catch (e) { return; }
        if (!coupon || !coupon.code) return;

        setTimeout(() => this.show(coupon), this.DELAY_MS);
      },

      show(c) {
        if (document.getElementById('coupon-promo')) return;
        // The guard lives HERE as well as in init(), so "never again once
        // copied" holds wherever show() is called from rather than only on the
        // one path that happens to check first.
        try { if (localStorage.getItem(this.COPIED_KEY)) return; } catch (e) {}
        // Nothing is recorded on SHOW. Being seen is not being acted on, and
        // marking it here is what made a dismissed offer disappear for good.

        const headline = c.headline
          || (c.type === 'percent' ? (c.value + '% off your order') : ('₹' + c.value + ' off your order'));
        const min = c.minOrder > 0
          ? '<div class="promo-min">On orders over ₹' + Number(c.minOrder).toLocaleString('en-IN') + '</div>'
          : '';

        const el = document.createElement('div');
        el.id = 'coupon-promo';
        el.className = 'coupon-promo';
        el.setAttribute('role', 'complementary');
        el.setAttribute('aria-label', 'Discount offer');
        el.innerHTML = ''
          + '<button type="button" class="promo-close" aria-label="Dismiss offer"'
          +   ' onclick="CouponPromo.dismiss()">&#10005;</button>'
          + '<div class="promo-eyebrow"><i class="fas fa-tag"></i> Offer</div>'
          + '<div class="promo-headline">' + Utils.escape(headline) + '</div>'
          + min
          + '<button type="button" class="promo-code" onclick="CouponPromo.copy(this)"'
          +   ' title="Copy this code">'
          +   '<span>' + Utils.escape(c.code) + '</span>'
          +   '<i class="fas fa-copy" aria-hidden="true"></i>'
          + '</button>'
          + '<div class="promo-hint">Apply it in your cart at checkout</div>';

        document.body.appendChild(el);
        requestAnimationFrame(function () { el.classList.add('is-in'); });

        this._onKey = (e) => { if (e.key === 'Escape') this.dismiss(); };
        document.addEventListener('keydown', this._onKey);
      },

      copy(btn) {
        const code = btn.querySelector('span') ? btn.querySelector('span').textContent : '';
        const done = () => {
          btn.classList.add('is-copied');
          const i = btn.querySelector('i');
          if (i) i.className = 'fas fa-check';
          if (typeof showToast === 'function') showToast('Code ' + code + ' copied — apply it in your cart', 'success');
          // THIS is what retires the card, for good and across sessions. The
          // code is on their clipboard; showing it again is nagging.
          try { localStorage.setItem(CouponPromo.COPIED_KEY, code); } catch (e) {}
          // Leave the tick on screen long enough to read, then get out of the way.
          setTimeout(function () { CouponPromo.dismiss(); }, 1400);
        };
        // navigator.clipboard needs a secure context and can still reject; the
        // textarea fallback is what makes this work on plain http and in older
        // mobile browsers.
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(done).catch(function () { CouponPromo._legacyCopy(code, done); });
        } else {
          this._legacyCopy(code, done);
        }
      },

      _legacyCopy(text, done) {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          done();
        } catch (e) {
          if (typeof showToast === 'function') showToast('Copy failed — the code is ' + text, 'info');
        }
      },

      // `soft` = retired because the code was copied; the session flag is not
      // needed then, because the localStorage one already covers it.
      dismiss() {
        const el = document.getElementById('coupon-promo');
        if (!el) return;
        try {
          if (!localStorage.getItem(this.COPIED_KEY)) {
            sessionStorage.setItem(this.DISMISS_KEY, '1');
          }
        } catch (e) {}
        el.classList.remove('is-in');
        if (this._onKey) { document.removeEventListener('keydown', this._onKey); this._onKey = null; }
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
      },
    };

    /* ---------------------------------------------------------------------------
       Arriving from a coupon email: /?coupon=CODE

       A personal code only works for the customer it was issued to — the server
       matches it against the signed-in account, or the address typed at guest
       checkout (CLAUDE.md §34). So someone landing here signed OUT has to sign
       in before the code can do anything, and the honest thing is to say that
       up front rather than let them shop, reach the cart, and be told the code
       is "reserved for another customer".

       The pending code is held in sessionStorage across the login round trip
       and applied by Coupon.resumePending(), which the login and signup
       handlers call on success.
       --------------------------------------------------------------------------- */
    const CouponLink = {
      PENDING_KEY: 'vv_coupon_pending',

      // Called once on boot, before the router paints.
      init() {
        let code = '';
        try {
          code = new URLSearchParams(window.location.search).get('coupon') || '';
        } catch (e) { return; }
        code = String(code).trim().toUpperCase();
        if (!code || !/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) return;

        // Take the code out of the URL either way. Leaving it there means a
        // reload re-triggers this, and it would end up in shared links and in
        // analytics referrers.
        try {
          const u = new URL(window.location.href);
          u.searchParams.delete('coupon');
          window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
        } catch (e) {}

        if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
          this._applyNow(code);
          return;
        }

        // Signed out: park the code and send them to sign in, with the reason.
        try { sessionStorage.setItem(this.PENDING_KEY, code); } catch (e) {}
        if (typeof showToast === 'function') {
          showToast('Sign in to use your ' + code + ' discount', 'info');
        }
        if (typeof navigate === 'function') {
          // redirect:'cart' so that after signing in they land somewhere the
          // discount is actually visible, rather than back on a product page.
          navigate('login', { redirect: 'cart', coupon: code }, { replace: true });
        }
      },

      // After a successful sign-in or sign-up.
      resumePending() {
        let code = '';
        try {
          code = sessionStorage.getItem(this.PENDING_KEY) || '';
          sessionStorage.removeItem(this.PENDING_KEY);
        } catch (e) { return; }
        if (code) this._applyNow(code);
      },

      _applyNow(code) {
        if (typeof Coupon === 'undefined') return;
        // An empty cart cannot be quoted, so remember the code and let the cart
        // apply it as soon as there is something in it. Telling someone their
        // code "does not apply" because they have not chosen anything yet would
        // be technically true and completely unhelpful.
        const cart = (typeof Storage !== 'undefined' && Storage.getCart()) || [];
        if (!cart.length) {
          try { sessionStorage.setItem(this.PENDING_KEY, code); } catch (e) {}
          if (typeof showToast === 'function') {
            showToast('Your ' + code + ' discount is ready — add something to your cart', 'success');
          }
          return;
        }
        Coupon.apply(code);
      },
    };

    /* ---------------------------------------------------------------------------
       Event-unlocked coupons — "you just unlocked X"

       Called right after something happens that might qualify the visitor for a
       code: a signup, a newsletter subscription, or the cart crossing an item
       threshold. It asks /api/unlocked-coupons.php what they NOW qualify for and
       announces the best one.

       IT DOES NOT DECIDE ANYTHING. The server re-runs the same coupon_evaluate()
       the cart quote and the payment path use, so a code offered here is a code
       checkout will honour — that is the point of asking rather than reading a
       trigger flag locally and guessing.

       Announced ONCE per code per session. A reward that re-announces itself on
       every cart change stops reading as a reward and starts reading as a
       pop-up.
       --------------------------------------------------------------------------- */
    const CouponRewards = {
      SEEN_KEY: 'vv_rewards_seen',

      _seen() {
        try { return JSON.parse(sessionStorage.getItem(this.SEEN_KEY) || '[]'); }
        catch (e) { return []; }
      },

      _markSeen(code) {
        try {
          const seen = this._seen();
          if (seen.indexOf(code) === -1) seen.push(code);
          sessionStorage.setItem(this.SEEN_KEY, JSON.stringify(seen));
        } catch (e) { /* private mode — it will simply announce again */ }
      },

      // `why` is only used to phrase the message; the server decides eligibility.
      async check(why) {
        // A code already applied is the answer to this question — offering a
        // second one over the top of it would just be noise.
        if (typeof Coupon !== 'undefined' && Coupon.code()) return;

        let list = [];
        try {
          const items = (typeof Storage !== 'undefined' ? (Storage.getCart() || []) : [])
            .map(function (i) { return { id: i.id, qty: i.qty }; });
          const res = await fetch(API_BASE + '/unlocked-coupons.php', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' },
                                   (typeof Auth !== 'undefined' ? Auth.headers() : {})),
            body: JSON.stringify({ items: items }),
          });
          const data = await res.json().catch(function () { return {}; });
          list = (data && Array.isArray(data.coupons)) ? data.coupons : [];
        } catch (e) {
          return; // a reward that fails to load is not an error worth showing
        }

        const seen = this._seen();
        const pick = list.find(function (c) { return seen.indexOf(c.code) === -1; });
        if (!pick) return;

        this._markSeen(pick.code);
        this.show(pick, why);
      },

      show(c, why) {
        const headline = c.headline
          || (c.type === 'percent' ? (c.value + '% off your order')
                                   : ('₹' + Number(c.value).toLocaleString('en-IN') + ' off your order'));

        // Applied straight away when there is a cart to apply it to — the code
        // is already known to be valid for this exact cart, so making someone
        // copy and paste it back in would be busywork. With an empty cart it is
        // parked, and CouponLink.resumePending() applies it once there is one.
        const hasCart = typeof Storage !== 'undefined' && (Storage.getCart() || []).length > 0;
        if (!hasCart && typeof CouponLink !== 'undefined') {
          try { sessionStorage.setItem(CouponLink.PENDING_KEY, c.code); } catch (e) {}
        }

        const el = document.createElement('div');
        el.id = 'coupon-reward';
        el.className = 'coupon-promo coupon-reward';
        el.setAttribute('role', 'status');
        el.innerHTML = ''
          + '<button type="button" class="promo-close" aria-label="Dismiss"'
          +   ' onclick="CouponRewards.dismiss()">&#10005;</button>'
          + '<div class="promo-eyebrow"><i class="fas fa-gift"></i> Unlocked</div>'
          + '<div class="promo-headline">' + Utils.escape(headline) + '</div>'
          + (why ? '<div class="promo-min">' + Utils.escape(why) + '</div>' : '')
          + '<button type="button" class="promo-code" onclick="CouponPromo.copy(this)" title="Copy this code">'
          +   '<span>' + Utils.escape(c.code) + '</span>'
          +   '<i class="fas fa-copy" aria-hidden="true"></i>'
          + '</button>'
          + '<div class="promo-hint" id="coupon-reward-hint">'
          +   (hasCart ? 'Applying…' : 'It will apply as soon as you add something')
          + '</div>';

        // Replace rather than stack: two offer cards in a corner is clutter.
        const old = document.getElementById('coupon-reward');
        if (old && old.parentNode) old.parentNode.removeChild(old);
        const promo = document.getElementById('coupon-promo');
        if (promo && typeof CouponPromo !== 'undefined') CouponPromo.dismiss();

        document.body.appendChild(el);
        requestAnimationFrame(function () { el.classList.add('is-in'); });

        this._onKey = (e) => { if (e.key === 'Escape') this.dismiss(); };
        document.addEventListener('keydown', this._onKey);
        // Rewards self-dismiss. Unlike the promo card there is nothing to chase
        // here — it has already been applied or parked.
        this._timer = setTimeout(() => this.dismiss(), 12000);

        // Apply AFTER the card is on screen, and report what actually happened.
        // Claiming "applied to your cart" up front and finding out later that
        // the server refused would make the card a liar in exactly the case
        // where the customer most needs the truth.
        if (hasCart && typeof Coupon !== 'undefined') {
          Promise.resolve(Coupon.apply(c.code)).then(function (ok) {
            const hint = document.getElementById('coupon-reward-hint');
            if (!hint) return;
            hint.textContent = ok
              ? 'Applied to your cart'
              : 'Copy the code — it did not apply automatically';
          });
        }
      },

      dismiss() {
        const el = document.getElementById('coupon-reward');
        if (this._timer) { clearTimeout(this._timer); this._timer = null; }
        if (this._onKey) { document.removeEventListener('keydown', this._onKey); this._onKey = null; }
        if (!el) return;
        el.classList.remove('is-in');
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
      },
    };
