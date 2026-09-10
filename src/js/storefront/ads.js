/* =============================================================================
   Velorex Music — Google AdSense, BLOG PAGES ONLY
   Used by: src/js/storefront/blog.js (renderBlogPost)

   Inert until AdSense.CLIENT is set. Nothing loads, nothing renders, and no
   request goes to Google until an owner puts a real publisher id in the
   Settings panel — so this ships safely before the account exists.

   WHY BLOG-ONLY IS THE WHOLE DESIGN
   An ad on a product page, a category page or the cart is an invitation to
   leave for a competitor, priced in fractions of a rupee, at the exact moment
   the customer was about to spend thousands. The blog is different: it exists
   to pull search traffic, and most of that traffic was never going to buy
   today. So the ad surface is exactly one place, and the guard below is what
   keeps it there.

   THE SPA PROBLEM, AND WHY THIS IS BUILT THE WAY IT IS
   The storefront never reloads. A script appended once stays in the document
   for the rest of the session, and any ad slot left in the DOM keeps rendering
   — so a naive "add the AdSense tag on the blog page" would mean ads following
   the customer onto the checkout, which is both the commercial mistake above
   and an AdSense policy problem. So:

     - the tag is injected on the FIRST blog view and never re-injected;
     - every slot is destroyed on navigation away (teardown() from the router);
     - slots are only ever created by renderBlogPost().

   AdSense policy notes worth keeping in view:
     - ads must not sit on thin or empty pages, so nothing renders unless the
       post body has real length;
     - ads must not be placed to look like site navigation or content;
     - the site needs a visible privacy policy that discloses ad cookies —
       /privacy.html covers this (§35), and its Cookies section must stay
       accurate if this is switched on.

   Cross-module touch points (resolved at runtime):
     - SiteSettings (adsense_client / adsense_slot), currentPage
   ============================================================================= */

    const AdSense = {
      _injected: false,

      client() {
        const v = (typeof SiteSettings !== 'undefined')
          ? String(SiteSettings.get('adsense_client') || '').trim() : '';
        // A publisher id, and nothing else. Anything that is not this shape is
        // treated as unset rather than injected into a <script src>.
        return /^ca-pub-\d{10,20}$/.test(v) ? v : '';
      },

      slot() {
        const v = (typeof SiteSettings !== 'undefined')
          ? String(SiteSettings.get('adsense_slot') || '').trim() : '';
        return /^\d{6,20}$/.test(v) ? v : '';
      },

      enabled() {
        return this.client() !== '' && this.slot() !== '';
      },

      // Loads Google's script once per page load. Called only from render().
      _inject() {
        if (this._injected) return;
        const client = this.client();
        if (!client) return;
        this._injected = true;

        const sc = document.createElement('script');
        sc.async = true;
        sc.crossOrigin = 'anonymous';
        sc.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='
          + encodeURIComponent(client);
        document.head.appendChild(sc);
      },

      /**
       * Render an ad unit into `host`. Returns silently when disabled, when the
       * page is too thin, or when the host is missing — every one of those is a
       * reason NOT to show an ad rather than an error.
       *
       * `wordCount` is the post's own length. A unit on a two-paragraph post is
       * the "thin content" AdSense declines to serve, and it looks like a
       * content farm besides.
       */
      render(host, wordCount) {
        if (!host || !this.enabled()) return;
        if ((wordCount || 0) < 300) return;

        this._inject();

        const ins = document.createElement('ins');
        ins.className = 'adsbygoogle vlx-ad';
        ins.style.display = 'block';
        ins.setAttribute('data-ad-client', this.client());
        ins.setAttribute('data-ad-slot', this.slot());
        ins.setAttribute('data-ad-format', 'auto');
        ins.setAttribute('data-full-width-responsive', 'true');

        const wrap = document.createElement('div');
        wrap.className = 'vlx-ad-wrap';
        // Labelled, because an unlabelled ad block inside an article reads as
        // part of the article — which is the placement AdSense prohibits and
        // readers resent.
        wrap.innerHTML = '<span class="vlx-ad-label">Advertisement</span>';
        wrap.appendChild(ins);
        host.appendChild(wrap);

        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (e) {
          // A failed push must never break the article around it.
          console.warn('adsense push failed:', e);
        }
      },

      /**
       * Remove every slot. Called by the router on navigation AWAY from a blog
       * page — without this, a unit rendered on /blog/x would still be sitting
       * in the document when the customer reached the cart.
       */
      teardown() {
        document.querySelectorAll('.vlx-ad-wrap').forEach(function (el) {
          if (el.parentNode) el.parentNode.removeChild(el);
        });
      },
    };
