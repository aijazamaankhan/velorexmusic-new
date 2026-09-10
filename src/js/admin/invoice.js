/* =============================================================================
   Velorex Music — printable invoice (ADMIN ONLY)
   Used by: the Print button on the admin order-detail modal (admin/orders.js)

   Opens a clean A4 document in a new window and calls print(); the operator
   picks "Save as PDF" (or a printer) in the browser's own dialog.

   WHY NOT A SERVER-SIDE PDF LIBRARY
   Hostinger shared hosting has no Composer and this project has zero PHP
   dependencies by design (CLAUDE.md §13). Vendoring a PDF library to render a
   page the browser can already render — with correct fonts, correct rupee
   glyphs and correct page breaks — would be a lot of surface for no gain. The
   print dialog's "Save as PDF" produces a real, selectable-text PDF.

   ADMIN ONLY, and that is a data-protection point rather than a UI one. This
   document carries the customer's full name, street address, phone and email.
   It is built from an order the admin panel already holds behind X-Admin-Pass;
   there is deliberately no public URL that renders it.

   The previous implementation printed the dark on-screen order card — grey
   text on near-black, which on paper is illegible and on toner is expensive.
   This is a light document with print styles as the primary styles, not an
   afterthought.

   Cross-module touch points (resolved at runtime):
     - Storage, showToast, escapeHTML, money, fmtAddress   (admin/orders.js)
   ============================================================================= */

    // Shop details printed in the footer. Pulled from the public settings
    // endpoint (Settings -> Contact) so the invoice cannot quote a phone number
    // the storefront stopped using. Falls back to blank rather than to an
    // invented number — an invoice is the wrong place to guess.
    const InvoiceContact = {
      email: '',
      phone: '',
      address: '',
      loaded: false,

      async load() {
        if (this.loaded) return;
        this.loaded = true;
        try {
          const res = await fetch(API_BASE + '/settings.php');
          const data = await res.json();
          const s = (data && data.settings) || {};
          this.email = String(s.contact_email || '');
          this.phone = String(s.contact_phone || '');
          this.address = String(s.store_address || '');
        } catch (e) {
          // Silent: an invoice without a phone number still works.
          console.warn('invoice contact unavailable:', e);
        }
      },
    };

    function invoiceMoney(n) {
      const v = Number(n) || 0;
      return '₹' + v.toLocaleString('en-IN');
    }

    function invoiceDate(order) {
      // orders.order_data.date is already a display string ("3 September 2026")
      // written at finalize time. Prefer it over re-deriving from created_at so
      // the invoice and the receipt email agree.
      if (order && order.date) return String(order.date);
      const t = order && order.createdAt ? Date.parse(order.createdAt) : NaN;
      if (isNaN(t)) return '';
      return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    function buildInvoiceHtml(order) {
      const origin  = window.location.origin;
      const id      = String(order.id || '');
      const items   = Array.isArray(order.items) ? order.items : [];
      const addr    = order.shippingAddress || {};
      const contact = order.contact || {};

      const subtotal = Number(order.subtotal) || items.reduce(function (s, it) {
        return s + (Number(it.lineTotal) || (Number(it.price) || 0) * (Number(it.qty) || 0));
      }, 0);
      const shipping = Number(order.shipping) || 0;
      const total    = Number(order.total) || (subtotal + shipping);

      const name  = String(contact.fullName || addr.fullName || '');
      const email = String(contact.email || '');
      const phone = String(contact.phone || addr.phone || '');

      // Address block, one line per line — never a comma-joined run-on, since
      // this is what gets copied onto a parcel.
      const addrLines = [
        addr.line1, addr.line2, addr.landmark,
        [addr.city, addr.state].filter(Boolean).join(', '),
        [addr.postalCode, addr.countryCode].filter(Boolean).join(', '),
      ].filter(function (l) { return l && String(l).trim(); })
       .map(function (l) { return '<div>' + escapeHTML(String(l)) + '</div>'; })
       .join('');

      const rows = items.map(function (it, i) {
        const qty   = Number(it.qty) || 0;
        const price = Number(it.price) || 0;
        const line  = Number(it.lineTotal) || (price * qty);
        return '<tr>'
          + '<td class="c">' + (i + 1) + '</td>'
          + '<td>' + escapeHTML(String(it.name || ''))
            + (it.artist ? '<span class="sub">' + escapeHTML(String(it.artist)) + '</span>' : '')
          + '</td>'
          + '<td class="c">' + qty + '</td>'
          + '<td class="r">' + invoiceMoney(price) + '</td>'
          + '<td class="r">' + invoiceMoney(line) + '</td>'
          + '</tr>';
      }).join('');

      // Shipping is shown as its own line even when it is zero. An invoice that
      // silently folds delivery into the total is the kind of thing a customer
      // queries, and "Free" is worth stating.
      const totalsRows = ''
        + '<tr class="tot-sub"><td colspan="4" class="r">Subtotal</td><td class="r">' + invoiceMoney(subtotal) + '</td></tr>'
        + '<tr class="tot-sub"><td colspan="4" class="r">Shipping</td><td class="r">'
        +   (shipping > 0 ? invoiceMoney(shipping) : 'Free') + '</td></tr>'
        + '<tr class="tot"><td colspan="4" class="r">Total</td><td class="r">' + invoiceMoney(total) + '</td></tr>';

      const payId = String(order.paymentId || '');

      return ''
+ '<!doctype html><html lang="en"><head><meta charset="utf-8">'
+ '<meta name="viewport" content="width=device-width, initial-scale=1">'
+ '<title>Invoice ' + escapeHTML(id) + ' · Velorex Music</title>'
+ '<style>'
// A4 with a real margin: the browser's default header/footer is turned off by
// the operator in the print dialog, but the margin has to be ours.
+ '@page{size:A4;margin:12mm;}'
+ '*{box-sizing:border-box;}'
+ 'body{margin:0;font-family:"Helvetica Neue",Arial,sans-serif;color:#111;background:#f1f1f4;'
+   '-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
+ '.sheet{width:210mm;min-height:297mm;margin:16px auto;padding:14mm;background:#fff;'
+   'box-shadow:0 8px 40px rgba(0,0,0,0.14);}'
// ---- header
+ '.head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;'
+   'padding-bottom:14px;border-bottom:3px solid #ed2c15;}'
+ '.logo{height:74px;width:auto;}'
+ '.head-meta{text-align:right;font-size:9.5px;letter-spacing:0.14em;line-height:1.9;'
+   'color:#111;font-weight:700;text-transform:uppercase;}'
+ '.head-meta .tag{display:block;margin-top:6px;color:#ed2c15;letter-spacing:0.18em;}'
// ---- invoice title + meta strip
+ '.title-row{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin:20px 0 16px;}'
+ '.title h1{margin:0;font-size:30px;letter-spacing:-0.01em;}'
+ '.title p{margin:4px 0 0;font-size:9.5px;letter-spacing:0.16em;text-transform:uppercase;color:#666;}'
+ '.meta{display:flex;gap:0;border:1px solid #e6e6ea;border-radius:10px;overflow:hidden;}'
+ '.meta div{padding:9px 14px;border-right:1px solid #e6e6ea;min-width:0;}'
+ '.meta div:last-child{border-right:0;}'
+ '.meta .k{font-size:7.5px;letter-spacing:0.14em;text-transform:uppercase;color:#888;font-weight:700;}'
+ '.meta .v{font-size:11.5px;font-weight:700;margin-top:3px;word-break:break-word;}'
// ---- customer
+ '.cust{background:#fdf0ee;border-radius:10px;padding:14px 16px;margin-bottom:20px;}'
+ '.cust h2{margin:0 0 10px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#ed2c15;}'
+ '.cust-row{display:flex;gap:14px;margin-bottom:6px;font-size:12.5px;}'
+ '.cust-row .k{width:74px;flex:0 0 74px;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;'
+   'color:#777;padding-top:3px;}'
+ '.cust-row .v{font-weight:700;line-height:1.55;}'
// ---- items
+ 'h2.sec{font-size:16px;margin:0 0 10px;letter-spacing:-0.01em;}'
+ 'table{width:100%;border-collapse:collapse;font-size:12.5px;}'
+ 'thead th{background:#1c1c22;color:#fff;text-align:left;padding:10px 12px;font-size:9.5px;'
+   'letter-spacing:0.12em;text-transform:uppercase;font-weight:700;}'
+ 'thead th.c,tbody td.c{text-align:center;}'
+ 'thead th.r,tbody td.r{text-align:right;}'
+ 'tbody td{padding:11px 12px;border-bottom:1px solid #ececf0;vertical-align:top;}'
+ 'tbody .sub{display:block;font-size:10px;color:#777;font-weight:400;margin-top:2px;}'
+ 'tr.tot-sub td{background:#fafafc;font-size:12px;color:#444;border-bottom:1px solid #ececf0;}'
+ 'tr.tot td{background:#f4f4f7;font-weight:800;font-size:14px;padding:13px 12px;border-bottom:0;}'
+ 'tr.tot td:last-child{background:#ed2c15;color:#fff;}'
// ---- thanks + footer
+ '.thanks{margin:26px 0 20px;padding-top:18px;border-top:1px solid #ececf0;}'
+ '.thanks .big{font-size:26px;font-weight:800;color:#ed2c15;letter-spacing:-0.01em;}'
+ '.thanks p{margin:6px 0 0;font-size:9.5px;letter-spacing:0.14em;text-transform:uppercase;color:#666;line-height:1.9;}'
+ '.foot{background:#f4f4f7;border-radius:10px;padding:16px 18px;display:flex;gap:26px;flex-wrap:wrap;}'
+ '.foot h3{margin:0 0 2px;font-size:15px;letter-spacing:-0.01em;}'
+ '.foot .k{font-size:8.5px;letter-spacing:0.14em;text-transform:uppercase;color:#888;font-weight:700;}'
+ '.foot .col{min-width:130px;}'
+ '.foot .val{font-size:12px;font-weight:700;margin-top:3px;line-height:1.6;}'
+ '.strip{margin-top:14px;text-align:center;font-size:8.5px;letter-spacing:0.2em;'
+   'text-transform:uppercase;color:#888;}'
// The only screen-only element: the toolbar. Removed from the printed page.
+ '.bar{max-width:210mm;margin:16px auto 0;display:flex;gap:10px;justify-content:flex-end;}'
+ '.bar button{font:inherit;font-size:13px;font-weight:700;padding:9px 18px;border-radius:8px;'
+   'border:1px solid #d5d5dc;background:#fff;cursor:pointer;}'
+ '.bar button.primary{background:#ed2c15;border-color:#ed2c15;color:#fff;}'
+ '@media print{body{background:#fff;} .sheet{margin:0;box-shadow:none;width:auto;min-height:0;padding:0;} .bar{display:none;}}'
+ '</style></head><body>'

+ '<div class="bar">'
+   '<button type="button" onclick="window.close()">Close</button>'
+   '<button type="button" class="primary" onclick="window.print()">Print / Save as PDF</button>'
+ '</div>'

+ '<div class="sheet">'
+   '<div class="head">'
      // Absolute URL: this document is written into about:blank, where a
      // relative src would resolve against nothing and the logo would break.
+     '<img class="logo" src="' + origin + '/src/img/logo-lockup-light.png"'
+       ' alt="Velorex Music">'
+     '<div class="head-meta">Vinyl · Cassettes<br>CDs · Blu-ray · DVD'
+       '<span class="tag">Collect · Listen · Relive</span></div>'
+   '</div>'

+   '<div class="title-row">'
+     '<div class="title"><h1>INVOICE</h1><p>Thank you for your order</p></div>'
+     '<div class="meta">'
+       '<div><div class="k">Order no.</div><div class="v">' + escapeHTML(id) + '</div></div>'
+       '<div><div class="k">Order date</div><div class="v">' + escapeHTML(invoiceDate(order)) + '</div></div>'
+       (payId ? '<div><div class="k">Payment ref</div><div class="v">' + escapeHTML(payId) + '</div></div>' : '')
+     '</div>'
+   '</div>'

+   '<div class="cust">'
+     '<h2>Customer details</h2>'
+     (name  ? '<div class="cust-row"><div class="k">Name</div><div class="v">' + escapeHTML(name) + '</div></div>' : '')
+     (addrLines ? '<div class="cust-row"><div class="k">Address</div><div class="v">' + addrLines + '</div></div>' : '')
+     (phone ? '<div class="cust-row"><div class="k">Phone</div><div class="v">' + escapeHTML(phone) + '</div></div>' : '')
+     (email ? '<div class="cust-row"><div class="k">Email</div><div class="v">' + escapeHTML(email) + '</div></div>' : '')
+   '</div>'

+   '<h2 class="sec">Order items</h2>'
+   '<table><thead><tr>'
+     '<th class="c">#</th><th>Item</th><th class="c">Qty</th><th class="r">Price</th><th class="r">Amount</th>'
+   '</tr></thead><tbody>' + rows + totalsRows + '</tbody></table>'

+   '<div class="thanks">'
+     '<div class="big">Thank you!</div>'
+     '<p>For being a part of the Velorex Music family</p>'
+   '</div>'

+   '<div class="foot">'
+     '<div class="col"><h3>Velorex Music</h3><div class="k">Get in touch</div></div>'
+     (InvoiceContact.phone
        ? '<div class="col"><div class="k">Call us</div><div class="val">' + escapeHTML(InvoiceContact.phone) + '</div></div>' : '')
+     (InvoiceContact.email
        ? '<div class="col"><div class="k">Email us</div><div class="val">' + escapeHTML(InvoiceContact.email) + '</div></div>' : '')
+     (InvoiceContact.address
        // Semicolons separate locations; each becomes its own line.
        ? '<div class="col"><div class="k">Our location</div><div class="val">'
          + InvoiceContact.address.split(';')
              .map(function (l) { return escapeHTML(l.trim()); })
              .filter(Boolean).join('<br>')
          + '</div></div>'
        : '')
+   '</div>'

+   '<div class="strip">Vinyl · Cassettes · CDs · Music Memorabilia</div>'
+ '</div>'
+ '</body></html>';
    }

    // Replaces the old printCurrentOrder(), which printed the dark on-screen
    // order card: grey-on-near-black, illegible on paper and expensive in toner.
    async function printCurrentOrder() {
      const id = window._currentOrderIdForPrint;
      if (!id) return;

      const order = (Storage.getOrders() || []).find(function (o) {
        return String(o.id) === String(id);
      });
      if (!order) { showToast('Order not found', 'error'); return; }

      // Fetch the shop's contact details BEFORE opening the window, so the
      // invoice is complete on first paint and never re-renders under the
      // operator while the print dialog is opening.
      await InvoiceContact.load();

      const w = window.open('', '_blank');
      if (!w) { showToast('Popup blocked — allow popups to print the invoice', 'error'); return; }

      w.document.open();
      w.document.write(buildInvoiceHtml(order));
      w.document.close();
      // The logo has to decode before the print dialog snapshots the page, or
      // the first page comes out with a gap where the header should be.
      w.addEventListener('load', function () {
        setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} }, 350);
      });
    }
