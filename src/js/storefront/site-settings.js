/* =============================================================================
   Velorex Music — storefront settings + announcement bar
   Used by: index.html, fetched once on boot from /api/settings.php

   The admin Settings panel used to be three hardcoded <input> values and a Save
   button with no handler — it looked like configuration and configured
   nothing. These are the storefront half of the real thing.

   DESIGN RULE: every consumer has a working default and applies the setting
   only once it arrives. So a slow, failed or 404ing /api/settings.php leaves
   the shop exactly as it is today rather than blanking a section — the fetch is
   an enhancement, never a dependency. Nothing here is awaited by page render.

   Cross-module touch points (resolved at runtime):
     - API_BASE, Utils.escape, navigate
   ============================================================================= */

    const SiteSettings = {
      // Mirrors the `public` half of settings_schema() in
      // api/_settings_helpers.php. These are the values in force until (and if)
      // the fetch resolves, so they must match that file's defaults.
      values: {
        announcement_enabled:  false,
        announcement_text:     '',
        announcement_link:     '',
        intro_splash_enabled:  true,
        recently_sold_enabled: true,
        low_stock_threshold:   3,
        contact_email:         '',
        contact_phone:         '',
        store_address:         '',
      },
      loaded: false,

      get(key) {
        return this.values[key];
      },

      async load() {
        if (this.loaded) return this.values;
        try {
          const res = await fetch(API_BASE + '/settings.php');
          const data = await res.json();
          if (data && data.settings && typeof data.settings === 'object') {
            Object.keys(data.settings).forEach((k) => {
              // Only adopt keys we already know about. An unexpected key from a
              // newer server should not silently appear in storefront state.
              if (Object.prototype.hasOwnProperty.call(this.values, k)) {
                this.values[k] = data.settings[k];
              }
            });
          }
        } catch (e) {
          // Deliberately silent: the defaults above are a working shop.
          console.warn('site settings unavailable, using defaults:', e);
        }
        this.loaded = true;
        this.apply();
        return this.values;
      },

      // Applied after the fetch resolves. Kept to things that are safe to
      // change a beat late — an announcement bar appearing, a strip being
      // hidden. Nothing here moves content the customer is already reading.
      apply() {
        this.renderAnnouncement();

        // Recently Sold: hide on request. RecentSales does its own hiding when
        // there is nothing to show, so this only ever removes.
        if (this.values.recently_sold_enabled === false) {
          const strip = document.getElementById('recent-sales');
          if (strip) strip.style.display = 'none';
        }
      },

      renderAnnouncement() {
        const host = document.getElementById('announcement-bar');
        if (!host) return;

        const on   = this.values.announcement_enabled === true;
        const text = String(this.values.announcement_text || '').trim();
        if (!on || !text) { host.hidden = true; host.innerHTML = ''; return; }

        // The link is validated server-side to be a site-relative path (see the
        // 'path' case in settings_save) — an arbitrary URL here would make the
        // Settings panel an open-redirect sink. Escaped again on the way out
        // regardless: escaping is a render-time concern, every time
        // (CLAUDE.md §22).
        const link = String(this.values.announcement_link || '').trim();
        const body = Utils.escape(text);

        host.innerHTML = link
          ? '<a class="announcement-link" href="' + Utils.escape(link) + '"'
            + ' onclick="return VelorexAnnouncement.go(this)">' + body
            + ' <i class="fas fa-arrow-right" aria-hidden="true"></i></a>'
          : '<span>' + body + '</span>';
        host.hidden = false;
      },
    };

    // Kept off SiteSettings so the inline onclick above has a short global to
    // call. Routes through the SPA when the path is one the router knows, and
    // otherwise lets the browser do a normal navigation.
    const VelorexAnnouncement = {
      go(anchor) {
        const href = anchor.getAttribute('href') || '';
        if (typeof Seo !== 'undefined' && typeof navigate === 'function') {
          const parsed = Seo.parsePath ? Seo.parsePath(href) : null;
          if (parsed && parsed.page) {
            navigate(parsed.page, parsed.params || {});
            return false;
          }
        }
        return true; // real navigation
      },
    };
