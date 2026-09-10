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
        row.innerHTML = rows.map(r => this._card(r)).join('');
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

        const img = (typeof r.image === 'string' && r.image)
          ? '<img src="' + Utils.escape(r.image) + '" alt="' + Utils.escape(title + ' — ' + artist) +
            '" loading="lazy" decoding="async">'
          : '';

        const where = String(r.location || 'India');
        const when  = this._ago(r.at);
        // "Mumbai, MH · 3 hours ago" — the two facts a sale ticker is for.
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
        if (mins < 2)      return 'just now';
        if (mins < 60)     return mins + ' minutes ago';
        const hours = Math.floor(mins / 60);
        if (hours < 24)    return hours === 1 ? '1 hour ago' : hours + ' hours ago';
        const days = Math.floor(hours / 24);
        if (days < 30)     return days === 1 ? '1 day ago' : days + ' days ago';
        const months = Math.floor(days / 30);
        return months === 1 ? '1 month ago' : months + ' months ago';
      },
    };
