/* =============================================================================
   Velorex Music — Spin & Win welcome game (storefront controller)
   Used by: index.html, driven from initPage() in router.js (SpinWheel.onPage)

   WHAT THIS FILE DOES NOT DO: pick the prize.
   POST /api/spin-wheel.php draws the result on the server and mints the
   coupon; the game (src/js/storefront/spin-games.js) then animates towards
   the answer it was given. The words on each prize come from the server too
   (spin_describe() in api/_spin_helpers.php), so no game can advertise a
   condition the coupon does not enforce. See CLAUDE.md §48.

   This file owns the parts every game style shares: the launcher tab, the
   modal, creating an account or signing in, the one POST, and the result.

   Constraints, all deliberate:
     - HOMEPAGE ONLY. Product and category URLs are what people land on from
       search; a game on those pages is an interruption (§15).
     - A TAB, NOT A POPUP. The game opens only when the tab is clicked, so
       nothing covers the page on arrival (the intrusive-interstitial rule the
       promo card also follows — §34).
     - GONE AFTER ONE PLAY. Win or lose, the tab never comes back for that
       account (server) or that browser (localStorage flag).

   Cross-module touch points (resolved at runtime):
     - API_BASE, Auth, Utils.escape, showToast, Storage, Coupon, CouponLink,
       injectNavbar, navigate, SpinGames
   ============================================================================= */

    // Per-style wording. Mirrors SPIN_GAME_STYLES in api/_spin_helpers.php.
    const SPIN_STYLE_TEXT = {
      wheel:    { tab: 'Spin & Win',    icon: 'fa-dharmachakra', eyebrow: 'Welcome gift · one spin',
                  title: 'Your spin is<br><em>ready</em>', lead: 'One spin per member. Most slices win a reward — good luck!',
                  btn: '<i class="fas fa-compact-disc"></i> Spin now' },
      jackpot:  { tab: 'Play & Win',    icon: 'fa-bolt', eyebrow: 'Welcome gift · one pull',
                  title: 'Pull the lever,<br><em>hit the jackpot</em>', lead: 'Three of a kind wins that prize. One pull per member.',
                  btn: '<i class="fas fa-hand-pointer"></i> Pull the lever' },
      scratch:  { tab: 'Scratch & Win', icon: 'fa-ticket', eyebrow: 'Welcome gift · one card',
                  title: 'Scratch to<br><em>reveal your gift</em>', lead: 'Rub the gold foil with your finger or mouse to see what you won.',
                  btn: '<i class="fas fa-hand-sparkles"></i> Reveal it for me' },
      box:      { tab: 'Open & Win',    icon: 'fa-gift', eyebrow: 'Welcome gift · pick one',
                  title: 'Choose a box,<br><em>open your gift</em>', lead: 'Tap any box — your gift is inside.',
                  btn: '<i class="fas fa-gift"></i> Pick one for me' },
      record:   { tab: 'Pick & Win',    icon: 'fa-record-vinyl', eyebrow: 'Welcome gift · pick a sleeve',
                  title: 'Pick a record,<br><em>drop the needle</em>', lead: 'Your prize is printed on the label.',
                  btn: '<i class="fas fa-record-vinyl"></i> Pick one for me' },
      envelope: { tab: 'Open & Win',    icon: 'fa-envelope-open-text', eyebrow: 'Welcome gift · one envelope',
                  title: 'Open your<br><em>lucky envelope</em>', lead: 'Tap the envelope to break the seal.',
                  btn: '<i class="fas fa-envelope-open"></i> Open it' },
    };

    const SpinWheel = {
      DONE_KEY: 'vv_spin_done',
      TERMS_URL: '/offer-terms.html',
      state: null,
      _loading: null,
      _page: null,
      _shownOnce: false,
      _timer: null,
      _game: null,
      _playing: false,     // a play has been committed (button pressed / item picked)
      _animating: false,   // the reveal animation is running; closing would hide it
      _result: null,       // what the server said, once it has
      _shown: false,       // whether the result screen has been shown

      _style() {
        const s = this.state && this.state.gameStyle;
        return SPIN_STYLE_TEXT[s] ? s : 'wheel';
      },
      _text() { return SPIN_STYLE_TEXT[this._style()]; },

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
          if (s.reason === 'spun' || s.reason === 'ordered') this._markDone();
          return;
        }
        // The delay applies to the first appearance only.
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
        const t = this._text();
        if (!b) {
          b = document.createElement('button');
          b.type = 'button';
          b.id = 'spin-launcher';
          b.className = 'spin-launcher';
          b.setAttribute('aria-haspopup', 'dialog');
          b.addEventListener('click', () => this.open());
          document.body.appendChild(b);
        }
        b.innerHTML = '<i class="fas fa-gift" aria-hidden="true"></i><span>' + Utils.escape(t.tab) + '</span>';
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
        this._applyText();
        if (!this._playing) this._mountGame();
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
        if (this._animating) return;   // never close mid-reveal: the result would be lost from view
        ov.classList.remove('is-open');
        ov.hidden = true;
        document.removeEventListener('keydown', this._onKey);
        // Closed after the server answered but before the reveal finished (a
        // half-scratched card). The prize is real and already emailed; say so.
        if (this._result && !this._shown) {
          this._shown = true;
          const r = this._result;
          if (typeof showToast === 'function') {
            showToast(r.win ? ('You won ' + r.title + ' — code ' + r.code + ' is in your email') : 'Thanks for playing!', r.win ? 'success' : 'info');
          }
        }
        if (this._lastFocus && this._lastFocus.focus && document.body.contains(this._lastFocus)) this._lastFocus.focus();
      },

      _onKey(e) { if (e.key === 'Escape') SpinWheel.close(); },

      _buildModal() {
        const agree = '<p class="spin-fine spin-agree">By playing you agree to the '
          + '<a href="' + this.TERMS_URL + '" target="_blank" rel="noopener">Spin &amp; Win Terms</a>.</p>';
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
          +   '<div class="spin-stage" id="spin-stage"></div>'
          +   '<div class="spin-side">'

          // Step: create account
          +     '<form class="spin-step" data-step="signup" onsubmit="event.preventDefault();SpinWheel.signup();">'
          +       '<div class="spin-eyebrow" data-t="eyebrow"></div>'
          +       '<h2 id="spin-heading" class="spin-title">Create your account,<br><em>play to win</em></h2>'
          +       '<p class="spin-lead">New members get one free play. Your prize is saved to your account and ready at checkout.</p>'
          +       '<input class="spin-field" id="spin-first" type="text" placeholder="First name" autocomplete="given-name" required>'
          +       '<input class="spin-field" id="spin-email" type="email" placeholder="you@example.com" autocomplete="email" required>'
          +       '<input class="spin-field" id="spin-pass" type="password" placeholder="Password (8+ characters)" autocomplete="new-password" minlength="8" required>'
          +       '<label class="spin-check"><input type="checkbox" id="spin-optin"> Send me new arrivals &amp; offers (optional)</label>'
          +       '<div class="spin-error" data-err="signup" role="alert"></div>'
          +       '<button type="submit" class="btn btn-primary spin-btn"><i class="fas fa-user-plus"></i> Create account &amp; continue</button>'
          +       '<p class="spin-fine">Already a member? <a href="#" onclick="event.preventDefault();SpinWheel._showStep(\'login\')">Sign in</a></p>'
          +       agree
          +     '</form>'

          // Step: sign in
          +     '<form class="spin-step" data-step="login" hidden onsubmit="event.preventDefault();SpinWheel.login();">'
          +       '<div class="spin-eyebrow" data-t="eyebrow"></div>'
          +       '<h2 class="spin-title">Sign in to<br><em>play</em></h2>'
          +       '<p class="spin-lead">The game is for members who have not placed an order yet.</p>'
          +       '<input class="spin-field" id="spin-login-email" type="email" placeholder="you@example.com" autocomplete="email" required>'
          +       '<input class="spin-field" id="spin-login-pass" type="password" placeholder="Password" autocomplete="current-password" required>'
          +       '<div class="spin-error" data-err="login" role="alert"></div>'
          +       '<button type="submit" class="btn btn-primary spin-btn"><i class="fas fa-right-to-bracket"></i> Sign in &amp; continue</button>'
          +       '<p class="spin-fine">New here? <a href="#" onclick="event.preventDefault();SpinWheel._showStep(\'signup\')">Create an account</a></p>'
          +       agree
          +     '</form>'

          // Step: play
          +     '<div class="spin-step" data-step="spin" hidden>'
          +       '<div class="spin-eyebrow"><i class="fas fa-circle-check"></i> <span id="spin-who"></span></div>'
          +       '<h2 class="spin-title" data-t="title"></h2>'
          +       '<p class="spin-lead" data-t="lead"></p>'
          +       '<div class="spin-error" data-err="spin" role="alert"></div>'
          +       '<button type="button" class="btn btn-primary spin-btn" id="spin-go" onclick="SpinWheel.spin()"></button>'
          +       '<p class="spin-fine">Codes are single use, valid for a limited time and cannot be combined with other coupons.</p>'
          +       agree
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

      _applyText() {
        const t = this._text();
        document.querySelectorAll('#spin-overlay [data-t="eyebrow"]').forEach(function (el) { el.textContent = t.eyebrow; });
        const title = document.querySelector('#spin-overlay [data-t="title"]');
        const lead = document.querySelector('#spin-overlay [data-t="lead"]');
        const go = document.getElementById('spin-go');
        if (title) title.innerHTML = t.title;
        if (lead) lead.textContent = t.lead;
        if (go && !this._playing) { go.innerHTML = t.btn; go.disabled = false; }
      },

      _mountGame() {
        const stage = document.getElementById('spin-stage');
        if (!stage || typeof SpinGames === 'undefined') return;
        const self = this;
        let pending = null;
        const ctx = {
          prizes: (this.state && this.state.prizes) || [],
          reduce: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
          lock() {
            // A visitor who plays before signing in (tapping a box on the
            // sign-up screen) is sent to the form instead.
            if (!(typeof Auth !== 'undefined' && Auth.isLoggedIn())) return;
            self._playing = true;
            const go = document.getElementById('spin-go');
            if (go) { go.disabled = true; go.innerHTML = '<i class="fas fa-compact-disc fa-spin"></i> Good luck…'; }
          },
          request() {
            if (!(typeof Auth !== 'undefined' && Auth.isLoggedIn())) {
              self._err('signup', 'Create your account first — then play.');
              self._mountGame();
              return Promise.resolve(null);
            }
            if (!pending) pending = self._post().then(function (d) {
              if (d) { self._animating = true; }
              return d;
            });
            return pending;
          },
          done(d) {
            self._animating = false;
            self._showResult(d);
          },
        };
        this._game = SpinGames.create(this._style(), ctx);
        this._game.mount(stage);
      },

      _showStep(name) {
        document.querySelectorAll('#spin-overlay .spin-step').forEach(function (el) {
          el.hidden = el.getAttribute('data-step') !== name;
        });
        // The game can only be played from the play step.
        const stage = document.getElementById('spin-stage');
        if (stage) stage.classList.toggle('is-locked', name === 'signup' || name === 'login' || name === 'blocked');
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
            // newsletter form does it. Never blocks the game.
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
        if (typeof injectNavbar === 'function') { try { injectNavbar('home'); } catch (e) {} }
        if (typeof CouponLink !== 'undefined') CouponLink.resumePending();
        const s = await this.load(true);
        if (s && s.enabled && s.eligible) {
          this._applyText();
          this._mountGame();
          this._showStep('spin');
          return;
        }
        this._blocked(s ? s.reason : 'error');
      },

      _blocked(reason) {
        const msgs = {
          spun:     ['You have had your play', 'Each member gets one play, and this account has used it. Check your email for any code you won.'],
          ordered:  ['Thanks for shopping with us', 'The game is a welcome gift for members who have not ordered yet. Keep an eye on your inbox for member offers.'],
          disabled: ['The game is resting', 'Spin & Win is not running right now. Please check back soon.'],
          busy:     ['Please try again tomorrow', 'Too many plays have come from this connection today.'],
          error:    ['Something went wrong', 'We could not start your game. Please try again in a moment.'],
        };
        const m = msgs[reason] || msgs.error;
        document.getElementById('spin-blocked-title').textContent = m[0];
        document.getElementById('spin-blocked-msg').textContent = m[1];
        this._showStep('blocked');
        if (reason === 'spun' || reason === 'ordered') this._markDone();
      },

      // ---------------------------------------------------------------------
      // The play
      // ---------------------------------------------------------------------
      // The side button: every game has an "auto" play for it.
      spin() {
        if (this._playing || !this._game) return;
        this._err('spin', '');
        this._game.auto();
      },

      // The ONE request. Resolves with the server's result, or null after
      // reporting the problem and resetting the game so it can be retried.
      async _post() {
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
          this._playing = false;
          this._animating = false;
          if (data && data.reason && data.reason !== 'error') { this._blocked(data.reason); return null; }
          this._err('spin', (data && data.error) || 'Could not start your game. Please try again.');
          this._applyText();
          this._mountGame();   // a fresh board; the play was not spent
          return null;
        }
        // The play is spent the moment the server answered.
        this._result = data;
        this._markDone();
        return data;
      },

      _showResult(d) {
        this._shown = true;
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
