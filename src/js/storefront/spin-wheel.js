/* =============================================================================
   Velorex Music — Spin & Win welcome wheel (storefront)
   Used by: index.html, driven from initPage() in router.js (SpinWheel.onPage)

   WHAT THIS FILE DOES NOT DO: pick the prize.
   POST /api/spin-wheel.php draws the winning slice on the server and mints
   the coupon; this file then animates the wheel to the slice it was told.
   The words on each slice come from the server too (spin_describe() in
   api/_spin_helpers.php), so the wheel cannot advertise a condition the
   coupon does not enforce. See CLAUDE.md §48.

   Constraints, all deliberate:
     - HOMEPAGE ONLY. Product and category URLs are what people land on from
       search; a game on those pages is an interruption (§15).
     - A TAB, NOT A POPUP. The wheel opens only when the tab is clicked, so
       nothing covers the page on arrival (Google's intrusive-interstitial
       rule, the same one the promo card follows — §34).
     - GONE AFTER ONE SPIN. Win or lose, the tab never comes back for that
       account (server) or that browser (localStorage flag).

   Cross-module touch points (resolved at runtime):
     - API_BASE, Auth, Utils.escape, showToast, Storage, Coupon, CouponLink,
       injectNavbar, navigate
   ============================================================================= */

    const SpinWheel = {
      DONE_KEY: 'vv_spin_done',
      state: null,
      _loading: null,
      _page: null,
      _shownOnce: false,
      _timer: null,
      _rotation: 0,
      _busy: false,

      _done() {
        try { return localStorage.getItem(this.DONE_KEY) === '1'; } catch (e) { return false; }
      },
      _markDone() {
        try { localStorage.setItem(this.DONE_KEY, '1'); } catch (e) { /* private mode */ }
        this._removeLauncher();
      },

      // Called on every SPA navigation. Anything but the homepage hides it.
      onPage(page) {
        this._page = page;
        if (page !== 'index') {
          clearTimeout(this._timer);
          this._hideLauncher();
          this.close();
          return;
        }
        if (this._done()) return;
        this.load(false).then(() => this._maybeOffer());
      },

      load(force) {
        if (this._loading && !force) return this._loading;
        this._loading = fetch(API_BASE + '/spin-wheel.php', {
          headers: (typeof Auth !== 'undefined' ? Auth.headers() : {}),
        })
          .then(r => r.json())
          .then(d => { this.state = d && d.ok ? d : null; return this.state; })
          .catch(() => { this.state = null; return null; });
        return this._loading;
      },

      _maybeOffer() {
        const s = this.state;
        if (this._page !== 'index' || this._done() || !s || !s.enabled) return;
        if (!Array.isArray(s.prizes) || s.prizes.length < 2) return;
        if (s.signedIn && !s.eligible) {
          // Already spun or already a customer: this account never sees it.
          if (s.reason === 'spun' || s.reason === 'ordered') this._markDone();
          return;
        }
        // The delay applies to the first appearance only; coming back to the
        // homepage later shows the tab straight away rather than making the
        // visitor wait for it again.
        const delay = this._shownOnce ? 0 : Math.max(0, Number(s.delaySec) || 0) * 1000;
        clearTimeout(this._timer);
        this._timer = setTimeout(() => {
          if (this._page !== 'index' || this._done()) return;
          this._shownOnce = true;
          const b = this._ensureLauncher();
          requestAnimationFrame(() => b.classList.add('is-in'));
        }, delay);
      },

      _ensureLauncher() {
        let b = document.getElementById('spin-launcher');
        if (b) return b;
        b = document.createElement('button');
        b.type = 'button';
        b.id = 'spin-launcher';
        b.className = 'spin-launcher';
        b.setAttribute('aria-haspopup', 'dialog');
        b.innerHTML = '<i class="fas fa-gift" aria-hidden="true"></i><span>Spin &amp; Win</span>';
        b.addEventListener('click', () => this.open());
        document.body.appendChild(b);
        return b;
      },
      _hideLauncher() {
        const b = document.getElementById('spin-launcher');
        if (b) b.classList.remove('is-in');
      },
      _removeLauncher() {
        const b = document.getElementById('spin-launcher');
        if (b && b.parentNode) b.parentNode.removeChild(b);
      },

      // ---------------------------------------------------------------------
      // The modal
      // ---------------------------------------------------------------------
      open() {
        if (!this.state || !this.state.enabled) return;
        let ov = document.getElementById('spin-overlay');
        if (!ov) ov = this._buildModal();
        this._drawWheel();
        this._showStep(typeof Auth !== 'undefined' && Auth.isLoggedIn() ? 'spin' : 'signup');
        ov.hidden = false;
        requestAnimationFrame(() => ov.classList.add('is-open'));
        this._lastFocus = document.activeElement;
        document.addEventListener('keydown', this._onKey);
        const first = ov.querySelector('.spin-step:not([hidden]) input, .spin-step:not([hidden]) button');
        if (first) first.focus();
      },

      close() {
        const ov = document.getElementById('spin-overlay');
        if (!ov || ov.hidden) return;
        if (this._busy) return;   // never close mid-spin: the result would be lost from view
        ov.classList.remove('is-open');
        ov.hidden = true;
        document.removeEventListener('keydown', this._onKey);
        if (this._lastFocus && this._lastFocus.focus && document.body.contains(this._lastFocus)) this._lastFocus.focus();
      },

      _onKey(e) { if (e.key === 'Escape') SpinWheel.close(); },

      _buildModal() {
        const ov = document.createElement('div');
        ov.id = 'spin-overlay';
        ov.className = 'spin-overlay';
        ov.hidden = true;
        ov.setAttribute('role', 'dialog');
        ov.setAttribute('aria-modal', 'true');
        ov.setAttribute('aria-labelledby', 'spin-heading');
        ov.innerHTML = ''
          + '<div class="spin-modal">'
          +   '<button type="button" class="spin-close" aria-label="Close" onclick="SpinWheel.close()"><i class="fas fa-xmark"></i></button>'
          +   '<div class="spin-wheel-wrap" aria-hidden="true">'
          +     '<div class="spin-pointer"></div>'
          +     '<svg class="spin-wheel" id="spin-wheel-svg" viewBox="-200 -200 400 400"></svg>'
          +     '<div class="spin-hub"><img src="/src/img/logo-mark.svg" alt="" width="64" height="64"></div>'
          +   '</div>'
          +   '<div class="spin-side">'

          // Step: create account
          +     '<form class="spin-step" data-step="signup" onsubmit="event.preventDefault();SpinWheel.signup();">'
          +       '<div class="spin-eyebrow">Welcome gift · one spin</div>'
          +       '<h2 id="spin-heading" class="spin-title">Create your account,<br><em>spin to win</em></h2>'
          +       '<p class="spin-lead">New members get one free spin. Your prize is saved to your account and ready at checkout.</p>'
          +       '<input class="spin-field" id="spin-first" type="text" placeholder="First name" autocomplete="given-name" required>'
          +       '<input class="spin-field" id="spin-email" type="email" placeholder="you@example.com" autocomplete="email" required>'
          +       '<input class="spin-field" id="spin-pass" type="password" placeholder="Password (8+ characters)" autocomplete="new-password" minlength="8" required>'
          +       '<label class="spin-check"><input type="checkbox" id="spin-optin"> Send me new arrivals &amp; offers (optional)</label>'
          +       '<div class="spin-error" data-err="signup" role="alert"></div>'
          +       '<button type="submit" class="btn btn-primary spin-btn"><i class="fas fa-user-plus"></i> Create account &amp; continue</button>'
          +       '<p class="spin-fine">Already a member? <a href="#" onclick="event.preventDefault();SpinWheel._showStep(\'login\')">Sign in</a></p>'
          +     '</form>'

          // Step: sign in
          +     '<form class="spin-step" data-step="login" hidden onsubmit="event.preventDefault();SpinWheel.login();">'
          +       '<div class="spin-eyebrow">Welcome gift · one spin</div>'
          +       '<h2 class="spin-title">Sign in to<br><em>spin the wheel</em></h2>'
          +       '<p class="spin-lead">The wheel is for members who have not placed an order yet.</p>'
          +       '<input class="spin-field" id="spin-login-email" type="email" placeholder="you@example.com" autocomplete="email" required>'
          +       '<input class="spin-field" id="spin-login-pass" type="password" placeholder="Password" autocomplete="current-password" required>'
          +       '<div class="spin-error" data-err="login" role="alert"></div>'
          +       '<button type="submit" class="btn btn-primary spin-btn"><i class="fas fa-right-to-bracket"></i> Sign in &amp; continue</button>'
          +       '<p class="spin-fine">New here? <a href="#" onclick="event.preventDefault();SpinWheel._showStep(\'signup\')">Create an account</a></p>'
          +     '</form>'

          // Step: spin
          +     '<div class="spin-step" data-step="spin" hidden>'
          +       '<div class="spin-eyebrow"><i class="fas fa-circle-check"></i> <span id="spin-who"></span></div>'
          +       '<h2 class="spin-title">Your spin is<br><em>ready</em></h2>'
          +       '<p class="spin-lead">One spin per member. Most slices win a reward — good luck!</p>'
          +       '<div class="spin-error" data-err="spin" role="alert"></div>'
          +       '<button type="button" class="btn btn-primary spin-btn" id="spin-go" onclick="SpinWheel.spin()"><i class="fas fa-compact-disc"></i> Spin now</button>'
          +       '<p class="spin-fine">Codes are single use, valid for a limited time and cannot be combined with other coupons.</p>'
          +     '</div>'

          // Step: not eligible
          +     '<div class="spin-step" data-step="blocked" hidden>'
          +       '<div class="spin-eyebrow"><i class="fas fa-record-vinyl"></i> Spin &amp; Win</div>'
          +       '<h2 class="spin-title" id="spin-blocked-title">Thanks for being here</h2>'
          +       '<p class="spin-lead" id="spin-blocked-msg"></p>'
          +       '<button type="button" class="btn btn-secondary spin-btn" onclick="SpinWheel.close()">Keep browsing</button>'
          +     '</div>'

          // Step: result
          +     '<div class="spin-step" data-step="result" hidden aria-live="polite">'
          +       '<div class="spin-eyebrow" id="spin-res-eyebrow"></div>'
          +       '<div class="spin-prize" id="spin-res-title"></div>'
          +       '<div class="spin-cond" id="spin-res-cond"></div>'
          +       '<div class="spin-code" id="spin-res-codebox">'
          +         '<code id="spin-res-code"></code>'
          +         '<button type="button" onclick="SpinWheel.copy(this)"><i class="far fa-copy"></i> Copy</button>'
          +       '</div>'
          +       '<div class="spin-actions">'
          +         '<button type="button" class="btn btn-primary" id="spin-res-apply" onclick="SpinWheel.applyCode()"><i class="fas fa-bag-shopping"></i> Use it now</button>'
          +         '<button type="button" class="btn btn-secondary" id="spin-res-done" onclick="SpinWheel.close()">Keep shopping</button>'
          +       '</div>'
          +       '<p class="spin-fine" id="spin-res-fine"></p>'
          +     '</div>'
          +   '</div>'
          + '</div>';
        ov.addEventListener('click', (e) => { if (e.target === ov) this.close(); });
        document.body.appendChild(ov);
        return ov;
      },

      _showStep(name) {
        document.querySelectorAll('#spin-overlay .spin-step').forEach(function (el) {
          el.hidden = el.getAttribute('data-step') !== name;
        });
        if (name === 'spin') {
          const u = typeof Auth !== 'undefined' ? Auth.getUser() : null;
          const who = document.getElementById('spin-who');
          if (who) who.textContent = u && u.email ? ('Signed in as ' + u.email) : 'Signed in';
        }
      },

      _err(which, msg) {
        const el = document.querySelector('#spin-overlay [data-err="' + which + '"]');
        if (el) el.textContent = msg || '';
      },

      _polar(r, deg) {
        const a = (deg - 90) * Math.PI / 180;
        return [(r * Math.cos(a)).toFixed(2), (r * Math.sin(a)).toFixed(2)];
      },

      _drawWheel() {
        const svg = document.getElementById('spin-wheel-svg');
        const prizes = (this.state && this.state.prizes) || [];
        if (!svg || !prizes.length) return;
        const n = prizes.length, slice = 360 / n, esc = Utils.escape;
        let html = '<circle r="198" fill="#0d0a14" stroke="#ffd700" stroke-width="4"/>';
        prizes.forEach((p, i) => {
          const a0 = i * slice, a1 = (i + 1) * slice;
          const p0 = this._polar(186, a0), p1 = this._polar(186, a1);
          const large = slice > 180 ? 1 : 0;
          html += '<path d="M0 0 L' + p0[0] + ' ' + p0[1] + ' A186 186 0 ' + large + ' 1 ' + p1[0] + ' ' + p1[1] + ' Z"'
            + ' fill="' + esc(p.color) + '" stroke="#0d0a14" stroke-width="2"/>';
          const ink = this._isDark(p.color) ? '#ffd700' : '#ffffff';
          const big = String(p.label).length > 8 ? 15 : 21;
          html += '<g transform="rotate(' + (a0 + slice / 2) + ')">'
            + '<text y="-128" text-anchor="middle" fill="' + ink + '" font-weight="800" font-size="' + big + '">' + esc(p.label) + '</text>'
            + '<text y="-104" text-anchor="middle" fill="' + ink + '" opacity=".85" font-weight="600" font-size="13">' + esc(p.sub) + '</text>'
            + '</g>';
        });
        // Grooves, so it reads as a record rather than a pie chart.
        for (let r = 70; r < 186; r += 14) html += '<circle r="' + r + '" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="1"/>';
        for (let i = 0; i < 24; i++) {
          const c = this._polar(193, i * 15);
          html += '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="3.2" fill="' + (i % 2 ? '#ffd700' : '#ffffff') + '"/>';
        }
        svg.innerHTML = html;
      },

      // Relative luminance, so the ink on a slice stays readable whatever
      // colour the owner picks.
      _isDark(hex) {
        const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
        if (!m) return true;
        const n = parseInt(m[1], 16);
        const c = [n >> 16, (n >> 8) & 255, n & 255].map(function (v) {
          v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] < 0.12;
      },

      // ---------------------------------------------------------------------
      // Account, then eligibility
      // ---------------------------------------------------------------------
      async signup() {
        const first = (document.getElementById('spin-first').value || '').trim();
        const email = (document.getElementById('spin-email').value || '').trim();
        const pass  = document.getElementById('spin-pass').value || '';
        if (!first || !email) return this._err('signup', 'Enter your first name and email.');
        if (pass.length < 8) return this._err('signup', 'Password must be at least 8 characters.');
        this._err('signup', '');
        const btn = document.querySelector('#spin-overlay [data-step="signup"] button[type="submit"]');
        if (btn) btn.disabled = true;
        try {
          await Auth.signup({ firstName: first, email: email, password: pass });
          if (document.getElementById('spin-optin').checked) {
            // Opt-in is its own request with its own consent, exactly as the
            // newsletter form does it. Never blocks the spin.
            fetch(API_BASE + '/subscribe.php', {
              method: 'POST',
              headers: Object.assign({ 'Content-Type': 'application/json' }, Auth.headers()),
              body: JSON.stringify({ email: email, source: 'spin-wheel' }),
            }).catch(function () {});
          }
          if (typeof showToast === 'function') showToast('Account created — welcome to Velorex Music!', 'success');
          await this._afterAuth();
        } catch (e) {
          this._err('signup', e.message || 'Could not create your account.');
        } finally {
          if (btn) btn.disabled = false;
        }
      },

      async login() {
        const email = (document.getElementById('spin-login-email').value || '').trim();
        const pass  = document.getElementById('spin-login-pass').value || '';
        if (!email || !pass) return this._err('login', 'Enter your email and password.');
        this._err('login', '');
        const btn = document.querySelector('#spin-overlay [data-step="login"] button[type="submit"]');
        if (btn) btn.disabled = true;
        try {
          await Auth.login(email, pass);
          if (typeof showToast === 'function') showToast('Welcome back!', 'success');
          await this._afterAuth();
        } catch (e) {
          this._err('login', e.message || 'Could not sign you in.');
        } finally {
          if (btn) btn.disabled = false;
        }
      },

      async _afterAuth() {
        // The navbar still says "Sign in" until it is re-rendered.
        if (typeof injectNavbar === 'function') { try { injectNavbar('home'); } catch (e) {} }
        if (typeof CouponLink !== 'undefined') CouponLink.resumePending();
        const s = await this.load(true);
        if (s && s.enabled && s.eligible) { this._drawWheel(); this._showStep('spin'); return; }
        this._blocked(s ? s.reason : 'error');
      },

      _blocked(reason) {
        const msgs = {
          spun:     ['You have had your spin', 'Each member gets one spin, and this account has used it. Check your email for any code you won.'],
          ordered:  ['Thanks for shopping with us', 'The wheel is a welcome gift for members who have not ordered yet. Keep an eye on your inbox for member offers.'],
          disabled: ['The wheel is resting', 'Spin & Win is not running right now. Please check back soon.'],
          busy:     ['Please try again tomorrow', 'Too many spins have come from this connection today.'],
          error:    ['Something went wrong', 'We could not start your spin. Please try again in a moment.'],
        };
        const m = msgs[reason] || msgs.error;
        document.getElementById('spin-blocked-title').textContent = m[0];
        document.getElementById('spin-blocked-msg').textContent = m[1];
        this._showStep('blocked');
        if (reason === 'spun' || reason === 'ordered') this._markDone();
      },

      // ---------------------------------------------------------------------
      // The spin
      // ---------------------------------------------------------------------
      async spin() {
        if (this._busy) return;
        this._busy = true;
        this._err('spin', '');
        const btn = document.getElementById('spin-go');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-compact-disc fa-spin"></i> Spinning…'; }

        let data = null;
        try {
          const res = await fetch(API_BASE + '/spin-wheel.php', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, Auth.headers()),
            body: '{}',
          });
          data = await res.json().catch(function () { return null; });
        } catch (e) { data = null; }

        if (!data || !data.ok) {
          this._busy = false;
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-compact-disc"></i> Spin now'; }
          if (data && data.reason && data.reason !== 'error') return this._blocked(data.reason);
          return this._err('spin', (data && data.error) || 'Could not start your spin. Please try again.');
        }

        // Animate to the slice the SERVER chose. If the owner edited the
        // wheel between load and spin and the slice is gone, the result is
        // still shown — the prize is real, only the landing spot is not.
        const prizes = this.state.prizes || [];
        let idx = prizes.findIndex(function (p) { return p.id === data.prizeId; });
        if (idx < 0) idx = 0;
        const slice = 360 / Math.max(prizes.length, 1);
        const jitter = (Math.random() - 0.5) * slice * 0.6;
        const target = 360 - (idx * slice + slice / 2) + jitter;
        this._rotation += 360 * 7 + (((target - this._rotation % 360) % 360) + 360) % 360;
        const svg = document.getElementById('spin-wheel-svg');
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (svg) svg.style.transform = 'rotate(' + this._rotation + 'deg)';

        // The spin is spent the moment the server answered.
        this._markDone();
        setTimeout(() => { this._busy = false; this._showResult(data); }, reduce ? 700 : 5300);
      },

      _showResult(d) {
        this._code = d.code || '';
        document.getElementById('spin-res-title').textContent = d.title || '';
        document.getElementById('spin-res-cond').textContent = d.cond || '';
        const box = document.getElementById('spin-res-codebox');
        const apply = document.getElementById('spin-res-apply');
        const fine = document.getElementById('spin-res-fine');
        if (d.win && d.code) {
          document.getElementById('spin-res-eyebrow').innerHTML = '<i class="fas fa-trophy"></i> You won';
          document.getElementById('spin-res-code').textContent = d.code;
          box.hidden = false; apply.hidden = false;
          const exp = d.expiresAt ? new Date(d.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
          fine.textContent = (exp ? 'Valid till ' + exp + ' · ' : '') + 'single use · saved to your account, and we have emailed it to you.';
          this._confetti();
        } else {
          document.getElementById('spin-res-eyebrow').innerHTML = '<i class="fas fa-record-vinyl"></i> So close';
          box.hidden = true; apply.hidden = true;
          document.getElementById('spin-res-done').textContent = 'Browse the collection';
          fine.textContent = 'Members hear about new offers first — keep an eye on your inbox.';
        }
        this._showStep('result');
      },

      // With items in the cart the code is applied now; with an empty cart it
      // is parked and CouponLink applies it once there is something to price.
      async applyCode() {
        if (!this._code) return;
        const cart = (typeof Storage !== 'undefined' && Storage.getCart) ? (Storage.getCart() || []) : [];
        if (cart.length && typeof Coupon !== 'undefined') {
          const ok = await Coupon.apply(this._code);
          if (ok) { this.close(); if (typeof navigate === 'function') navigate('cart'); return; }
          if (typeof showToast === 'function') showToast('Saved — it will apply once your cart meets the conditions', 'info');
        } else if (typeof CouponLink !== 'undefined') {
          try { sessionStorage.setItem(CouponLink.PENDING_KEY, this._code); } catch (e) {}
          if (typeof showToast === 'function') showToast('Code saved — it applies when you add records to your cart', 'success');
        }
        this.close();
      },

      copy(btn) {
        const code = this._code;
        const done = function () { if (btn) btn.innerHTML = '<i class="fas fa-check"></i> Copied'; };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, done);
        else done();
      },

      _confetti() {
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const cols = ['#ed2c15', '#ffd700', '#ffffff', '#c2410c'];
        for (let i = 0; i < 70; i++) {
          const c = document.createElement('div');
          c.className = 'spin-confetti';
          c.style.left = (Math.random() * 100) + 'vw';
          c.style.background = cols[i % cols.length];
          c.style.animationDuration = (1.6 + Math.random() * 1.6) + 's';
          c.style.animationDelay = (Math.random() * 0.4) + 's';
          document.body.appendChild(c);
          setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 3800);
        }
      },
    };
