/* =============================================================================
   Velorex Music — "Recently Sold" strip (storefront)
   Used by: index.html (homepage), driven from initPageIndex() in pages.js

   Renders /api/recent-sales.php as a scrollable row of small cards: cover,
   title, price, and the city it shipped to. Each card is a real <a href> to the
   product's canonical path, so this is also a block of internal links into the
   catalogue rather than decoration.

   Deliberate choices:
   - The whole <section> stays hidden until there is something to show, the same
     rule the curated Best Selling / New Releases strips follow. An empty strip
     under a heading reads as a broken shop, and a failed fetch must not leave a
     "Recently Sold" heading over a blank rectangle.
   - It fetches ONCE per page load and remembers the result. initPageIndex()
     runs twice (cold cache, then again after the background product sync
     resolves) and the strip must not re-request or visibly re-shuffle on the
     second pass.
   - Timestamps are humanised here rather than on the server, so the label stays
     honest on a page left open for an hour.

   Cross-module touch points (resolved at runtime):
     - API_BASE, Utils.escape, Seo.productPath
   ============================================================================= */

    const RecentSales = {
      // 'idle' | 'loading' | 'done'. Guards against the double init described
      // above and against a second fetch racing the first.
      _state: 'idle',
      _rows: null,
      _raf: null,

      async init() {
        if (this._state === 'loading') return;
        // Already fetched: re-render from memory so a second initPageIndex()
        // still repaints if the DOM was swapped, without a second round trip.
        if (this._state === 'done') { this._render(); return; }

        const section = document.getElementById('recent-sales');
        if (!section) return;
        this._state = 'loading';

        try {
          const res = await fetch(API_BASE + '/recent-sales.php?limit=12', { cache: 'no-store' });
          const data = await res.json();
          this._rows = (data && Array.isArray(data.rows)) ? data.rows : [];
        } catch (e) {
          // Silent. This strip is garnish — it must never announce a failure or
          // block anything else on the homepage.
          console.warn('recent sales failed:', e);
          this._rows = [];
        }
        this._state = 'done';
        this._render();
      },

      _render() {
        const section = document.getElementById('recent-sales');
        const row     = document.getElementById('recent-sales-row');
        if (!section || !row) return;

        const rows = this._rows || [];
        // Below four cards the row cannot scroll and reads as a stub. Hide the
        // whole section rather than showing two lonely cards under a heading
        // that promises a stream of sales.
        if (rows.length < 4) {
          section.style.display = 'none';
          row.innerHTML = '';
          return;
        }
        // '' rather than 'block' so the section falls back to whatever display
        // its CSS defines instead of being pinned forever.
        section.style.display = '';

        const cards = rows.map(r => this._card(r)).join('');
        // The list is rendered TWICE so the drift can loop seamlessly: when the
        // scroll passes the first group, we jump back by exactly that group's
        // width and the second copy is already sitting where the first was.
        // The duplicate is aria-hidden — a screen reader must not read the same
        // twelve sales twice — and it is skipped entirely under reduced motion,
        // where there is no loop to hide the seam of.
        if (this._reduced()) {
          row.innerHTML = '<div class="recent-sales-group">' + cards + '</div>';
          return;
        }
        row.innerHTML =
            '<div class="recent-sales-group">' + cards + '</div>'
          + '<div class="recent-sales-group" aria-hidden="true">' + cards + '</div>';
        this._autoScroll(row);
      },

      _reduced() {
        return typeof window.matchMedia === 'function'
          && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      },

      // Continuous drift, driven by NATIVE scrollLeft rather than a CSS
      // transform on the track.
      //
      // A transform marquee cannot be scrolled, dragged or reached with the
      // keyboard — the content would only ever be readable at the speed we
      // chose. Moving the real scroll position instead means a drag, a
      // trackpad swipe, a shift-wheel and Tab-to-next-card all keep working
      // exactly as they did, and the drift simply yields while someone is
      // using them.
      _autoScroll(row) {
        // init() is called twice per page load (cold cache, then post-sync), so
        // a second rAF loop would double the speed and fight the first.
        if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }

        const SPEED = 22; // px per second — slow enough to read a card in passing
        let last = null;
        // Set on any deliberate interaction; the drift resumes a beat later so
        // it does not fight a finger still on the screen.
        let resumeAt = 0;

        if (!row.dataset.vlxAutoBound) {
          row.dataset.vlxAutoBound = '1';
          const hold = () => { resumeAt = Date.now() + 2500; };
          ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(function (ev) {
            row.addEventListener(ev, hold, { passive: true });
          });
          this._hold = hold;
        }

        const step = (now) => {
          const dt = last === null ? 0 : Math.min(80, now - last);
          last = now;

          const first = row.firstElementChild;
          const loopWidth = first ? first.getBoundingClientRect().width : 0;

          const paused = row.matches(':hover')
            || row.contains(document.activeElement)
            || document.hidden
            || Date.now() < resumeAt
            || loopWidth <= 0;

          if (!paused) {
            row.scrollLeft += (SPEED * dt) / 1000;
            // Past the first copy: rewind by exactly one group. The second copy
            // is pixel-identical and already in that position, so nothing
            // visibly jumps.
            if (row.scrollLeft >= loopWidth) row.scrollLeft -= loopWidth;
          }
          this._raf = requestAnimationFrame(step);
        };
        this._raf = requestAnimationFrame(step);
      },

      _card(r) {
        const title  = String(r.title || '');
        const artist = String(r.artist || '');
        const id     = parseInt(r.productId, 10) || 0;
        // Seo.productPath needs the same {id, title, artist} shape a product
        // has, so the slug matches the canonical URL exactly (CLAUDE.md §15).
        const href   = (typeof Seo !== 'undefined' && id)
          ? Seo.productPath({ id: id, title: title, artist: artist })
          : '/products';

        const priceNum = Number(r.price) || 0;
        const price    = '₹' + priceNum.toLocaleString('en-IN');

        // alt="" — DECORATIVE, on purpose. The product name is the link text
        // right beside it, so a descriptive alt would just be read twice. It
        // also fixes a visible bug: these thumbs are lazy AND inside a
        // horizontal scroller, so the browser defers the ones off to the right
        // and paints their alt text into a 3rem box until they decode — the
        // strip showed "Jab Harry", "Kaho", "Meltrac" instead of covers.
        // onerror removes a genuinely broken image rather than leaving the
        // browser's broken-image glyph in the card.
        const img = (typeof r.image === 'string' && r.image)
          ? '<img src="' + Utils.escape(r.image) + '" alt="" loading="lazy" decoding="async"' +
            ' onerror="this.remove()">'
          : '';

        // CITY only. The payload carries "Hyderabad, Telangana" but the card is
        // ~15rem wide, and city + state + relative time overflowed every time —
        // it truncated to "Hyderabad, Telangana …" and ate the one part that
        // makes this a *recent*-sales strip. The state disambiguates nothing a
        // shopper cares about here.
        const where = String(r.location || 'India').split(',')[0].trim() || 'India';
        const when  = this._ago(r.at);
        const meta  = when ? (where + ' · ' + when) : where;

        return '' +
          '<a class="recent-sale-card" href="' + href + '"' +
             ' onclick="navigate(\'product\',{id:' + id + '});return false;">' +
            '<span class="recent-sale-thumb">' + img + '</span>' +
            '<span class="recent-sale-body">' +
              '<span class="recent-sale-title">' + Utils.escape(title) + '</span>' +
              '<span class="recent-sale-price">' + price + '</span>' +
              '<span class="recent-sale-meta">' +
                '<span class="recent-sale-dot" aria-hidden="true"></span>' +
                '<span class="recent-sale-where">' + Utils.escape(meta) + '</span>' +
              '</span>' +
            '</span>' +
            '<i class="fas fa-arrow-up-right-from-square recent-sale-go" aria-hidden="true"></i>' +
          '</a>';
      },

      // Coarse on purpose. "3 hours ago" is the useful resolution for a sale
      // ticker; "3 hours 12 minutes ago" is just noise, and a precise clock on
      // a public page is also a slightly sharper picture of the order book than
      // this strip has any reason to publish.
      _ago(iso) {
        if (!iso) return '';
        const then = Date.parse(iso);
        if (isNaN(then)) return '';
        const mins = Math.floor((Date.now() - then) / 60000);
        if (mins < 2)   return 'just now';
        if (mins < 60)  return mins + 'm ago';
        const hours = Math.floor(mins / 60);
        if (hours < 24) return hours + 'h ago';
        const days = Math.floor(hours / 24);
        if (days < 30)  return days + 'd ago';
        const months = Math.floor(days / 30);
        return months + 'mo ago';
      },
    };
