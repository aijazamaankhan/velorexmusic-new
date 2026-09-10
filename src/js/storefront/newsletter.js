/* =============================================================================
   Velorex Music — newsletter signup (storefront)
   Used by: index.html (the "Join the Velorex Record Club" block on the homepage)

   The form was markup only: an <input> and a <button> with no handler, no
   endpoint and no table behind them. Every address typed into it since launch
   went nowhere. This wires it to /api/subscribe.php.

   Deliberate choices:
   - The button is disabled while the request is in flight and the field is
     cleared only on success, so a double-click cannot send two signups and a
     failure does not make the customer retype their address.
   - The result replaces the form rather than sitting beside it. A confirmation
     next to a still-empty input reads as "did that work?" and gets clicked again.
   - Errors are shown inline, not as a toast. The person is looking at the field
     they just typed into; that is where the answer belongs.

   Cross-module touch points (resolved at runtime):
     - API_BASE, Utils.escape, Analytics
   ============================================================================= */

    const Newsletter = {
      _busy: false,

      // `source` distinguishes the homepage block from any future placement, so
      // the admin list can report which one actually converts.
      async submit(source) {
        if (this._busy) return;

        const input  = document.getElementById('newsletter-email');
        const button = document.getElementById('newsletter-submit');
        const note   = document.getElementById('newsletter-note');
        if (!input) return;

        const email = String(input.value || '').trim();

        // Validate before spending a round trip. This is the same shape check
        // the server does — the server's is the one that counts, this one just
        // answers instantly.
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          this._note(note, 'Please enter a valid email address.', 'error');
          input.focus();
          return;
        }

        this._busy = true;
        if (button) { button.disabled = true; button.textContent = 'Joining…'; }
        this._note(note, '', '');

        try {
          const res = await fetch(API_BASE + '/subscribe.php', {
            method: 'POST',
            headers: Object.assign(
              { 'Content-Type': 'application/json' },
              (typeof Auth !== 'undefined' && Auth.headers) ? Auth.headers() : {}
            ),
            body: JSON.stringify({ email: email, source: source || 'newsletter' }),
          });
          const data = await res.json().catch(() => ({}));

          if (!res.ok || !data.ok) {
            throw new Error(data.error || 'Could not sign you up just now.');
          }

          // A repeat submit is not a new signup — do not report it to GA as one.
          if (typeof Analytics !== 'undefined' && !data.alreadySubscribed) {
            Analytics.newsletterSignup(source || 'newsletter');
          }

          this._showSuccess(data.alreadySubscribed);
          // A subscribe-triggered code is now unlockable. Checked even when
          // they were already on the list — the coupon may be newer than their
          // subscription, and the server is the one deciding either way.
          if (typeof CouponRewards !== 'undefined') {
            CouponRewards.check('Thanks for subscribing');
          }
        } catch (e) {
          this._note(note, e.message || 'Something went wrong. Please try again.', 'error');
          if (button) { button.disabled = false; button.textContent = 'Subscribe'; }
        } finally {
          this._busy = false;
        }
      },

      _note(el, message, kind) {
        if (!el) return;
        if (!message) { el.style.display = 'none'; el.textContent = ''; return; }
        el.style.display = 'block';
        el.style.color = kind === 'error' ? '#ff8a7a' : 'var(--text-muted)';
        el.textContent = message;
      },

      _showSuccess(alreadySubscribed) {
        const wrap = document.getElementById('newsletter-form');
        const note = document.getElementById('newsletter-note');
        if (!wrap) return;
        wrap.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:center;gap:0.6rem;'
        +      'padding:0.85rem 1.1rem;border-radius:10px;background:rgba(255,255,255,0.12);'
        +      'border:1px solid rgba(255,255,255,0.22);font-size:0.95rem;font-weight:600;">'
        +   '<span aria-hidden="true">✓</span>'
        +   '<span>' + (alreadySubscribed ? 'You are already on the list.' : 'You are on the list!') + '</span>'
        + '</div>';
        this._note(
          note,
          alreadySubscribed
            ? 'Nothing more to do — we already have you.'
            : 'Check your inbox for a hello from us.',
          'info'
        );
      },

      // Enter should submit. The block is styled as a form but is not a <form>
      // element, so there is no implicit submit to inherit.
      bind() {
        const input = document.getElementById('newsletter-email');
        if (!input || input.dataset.vlxNewsletterBound === '1') return;
        input.dataset.vlxNewsletterBound = '1';
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); Newsletter.submit('newsletter'); }
        });
      },
    };
