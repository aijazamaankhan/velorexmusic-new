/* =============================================================================
   Velorex Music — admin Orders panel + order detail modal
   Used by: vlx-admin-2026.html

   Major sections:
     - escapeAttr (HTML-attribute escape — used in inline onclick= templates)
     - formatOrderDate (formatter)
     - Status taxonomy: ORDER_STATUSES, ORDER_STATUS_LABELS,
       ORDER_STATUS_ALIASES, CARRIERS, normalizeOrderStatus,
       getStatusBadgeHtml.
     - Panel state: ADMIN_ORDER_FILTER + ADMIN_EXPANDED_ORDERS.
     - Table: setOrderFilter, renderStatusChips, refreshOrders,
       clearOrdersSearch, renderOrdersTable, orderRowMainHtml,
       orderRowDetailHtml, toggleOrderExpand.
     - Inline shipment edit + admin note: onInlineCarrierChange,
       saveShipmentInline, saveAdminNoteForOrder.
     - Mutating actions: confirmDeleteOrder, updateOrderStatus, patchOrder.
     - Order detail modal: viewOrder, closeOrderModal, getOrderCustomer,
       fmtAddress, money, buildOrderDetailsHtml, printCurrentOrder,
       openOrderModal, buildOrderShipmentHtml, buildOrderHistoryHtml,
       onShipmentCarrierChange, saveShipmentForm.

   NOTE — there is a SECOND escapeAttr() at the bottom of this file (a
   JS-string escape variant) that historically shadowed the HTML-attribute
   version because of declaration order in the original inline script. It's
   preserved here for byte-for-byte parity with the pre-extraction behavior.
   Order IDs never contain apostrophes in practice, so the shadow has no
   observable effect — but it's a pre-existing latent bug worth fixing in a
   future PR.

   Cross-module touch points (resolved at runtime):
     - API_BASE, Storage, escapeHTML, showToast
     - adminAuthHeaders, recordSaveResult                  (main.js)
   ============================================================================= */

    function escapeAttr(s) {
      return escapeHTML(s).replace(/'/g, '&#039;');
    }

    // =============================================
    // LIVE ORDERS LOGIC
    // =============================================
    function formatOrderDate(order) {
      if (order && order.date) return String(order.date);
      try {
        // try parse from id time fallback
        return new Date().toLocaleDateString();
      } catch (e) {
        return '';
      }
    }

    var ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    var ORDER_STATUS_LABELS = {
      pending: 'Pending', processing: 'Processing', shipped: 'Shipped',
      delivered: 'Delivered', cancelled: 'Cancelled'
    };
    // Legacy status aliases — collapse to the new 5-status set on display.
    var ORDER_STATUS_ALIASES = {
      confirmed: 'processing', packed: 'processing',
      out_for_delivery: 'shipped', returned: 'cancelled', refunded: 'cancelled',
      canceled: 'cancelled'
    };
    // Carrier codes + display labels. The customer tracking page maps codes to a
    // tracking URL; for 'other' the admin provides the URL manually.
    var CARRIERS = [
      ['delhivery', 'Delhivery'], ['bluedart', 'Bluedart'], ['dtdc', 'DTDC'],
      ['indiapost', 'India Post'], ['fedex', 'FedEx'], ['dhl', 'DHL'], ['other', 'Other']
    ];

    function normalizeOrderStatus(status) {
      var s = (status || '').toLowerCase().trim();
      if (ORDER_STATUS_ALIASES[s]) return ORDER_STATUS_ALIASES[s];
      return ORDER_STATUSES.indexOf(s) >= 0 ? s : 'pending';
    }

    function getStatusBadgeHtml(status) {
      var s = normalizeOrderStatus(status);
      var palette = {
        pending:    ['rgba(255,184,0,0.10)', 'var(--warning)'],
        processing: ['rgba(168,85,247,0.12)', '#c084fc'],
        shipped:    ['rgba(59,130,246,0.12)', 'var(--info)'],
        delivered:  ['rgba(0,212,170,0.10)',  'var(--success)'],
        cancelled:  ['rgba(239,68,68,0.12)',  'var(--danger)']
      };
      var p = palette[s] || palette.pending;
      return '<span class="badge" style="background: ' + p[0] + '; color: ' + p[1] + ';">' + (ORDER_STATUS_LABELS[s] || s) + '</span>';
    }

    // Admin orders panel state (in-memory, lost on reload by design — chips and
    // expansion are transient UI, not user preferences).
    var ADMIN_ORDER_FILTER = 'all';
    var ADMIN_EXPANDED_ORDERS = new Set();

    function escapeAttr(s) {
      return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    function setOrderFilter(s) {
      ADMIN_ORDER_FILTER = s;
      renderOrdersTable();
    }

    function renderStatusChips() {
      var el = document.getElementById('orders-status-chips');
      if (!el) return;
      var orders = Storage.getOrders();
      var counts = { all: orders.length, pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };
      orders.forEach(function (o) {
        var s = normalizeOrderStatus(o.status);
        if (counts[s] !== undefined) counts[s]++;
      });
      var chips = [
        ['all', 'All'], ['pending', 'Pending'], ['processing', 'Processing'],
        ['shipped', 'Shipped'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']
      ];
      el.innerHTML = chips.map(function (c) {
        var active = ADMIN_ORDER_FILTER === c[0] ? ' is-active' : '';
        return '<button type="button" class="status-chip' + active + '" data-status="' + c[0] + '" onclick="setOrderFilter(\'' + c[0] + '\')">' +
          c[1] + ' <span class="count">' + counts[c[0]] + '</span></button>';
      }).join('');
    }

    function refreshOrders() {
      Storage.syncFromServer().then(function () {
        renderOrdersTable();
        showToast('✅ Refreshed from server', 'success');
      });
    }

    function clearOrdersSearch() {
      var inp = document.getElementById('ordersSearch');
      if (inp) inp.value = '';
      ADMIN_ORDER_FILTER = 'all';
      renderOrdersTable();
    }

    function renderOrdersTable() {
      var tbody = document.getElementById('orders-table-body');
      if (!tbody) return;
      renderStatusChips();
      var orders = Storage.getOrders();
      // Cold cache (orders not synced yet): show skeleton rows. The sync
      // pipeline calls renderOrdersTable() again once data lands.
      if (orders === null || (Array.isArray(orders) && orders.length === 0 && !Storage._orders)) {
        tbody.innerHTML = Skeleton.tableRows(5, 8);
        return;
      }
      var q = ((document.getElementById('ordersSearch') || {}).value || '').trim().toLowerCase();

      var filtered = orders.slice();
      if (ADMIN_ORDER_FILTER !== 'all') {
        filtered = filtered.filter(function (o) { return normalizeOrderStatus(o.status) === ADMIN_ORDER_FILTER; });
      }
      if (q) {
        filtered = filtered.filter(function (o) {
          var c = getOrderCustomer(o);
          var s = normalizeOrderStatus(o.status);
          var hay = [o.id, c.name, c.email, s, ORDER_STATUS_LABELS[s] || ''].join(' ').toLowerCase();
          return hay.indexOf(q) >= 0;
        });
      }
      filtered.sort(function (a, b) {
        var ad = Date.parse((a && a.createdAt) || (a && a.date) || '') || 0;
        var bd = Date.parse((b && b.createdAt) || (b && b.date) || '') || 0;
        if (bd !== ad) return bd - ad;
        return String((b && b.id) || '').localeCompare(String((a && a.id) || ''));
      });

      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="padding:1.25rem;color:var(--text-muted);text-align:center;">No orders match the current filter.</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(function (o) {
        return orderRowMainHtml(o) + (ADMIN_EXPANDED_ORDERS.has(o.id) ? orderRowDetailHtml(o) : '');
      }).join('');

      Array.from(tbody.querySelectorAll('.order-status-select')).forEach(function (sel) {
        sel.addEventListener('change', function () {
          updateOrderStatus(sel.getAttribute('data-order-id'), sel.value);
        });
      });
    }

    function orderRowMainHtml(o) {
      var id = o.id || '';
      var customer = getOrderCustomer(o);
      var total = Number(o.total || 0);
      var status = normalizeOrderStatus(o.status);
      var date = formatOrderDate(o);
      var expanded = ADMIN_EXPANDED_ORDERS.has(id);
      var items = Array.isArray(o.items) ? o.items : [];
      var summary = items.length === 0 ? '—'
        : items.length === 1
          ? (Number(items[0].qty || 1) + '× ' + Utils.escape(String(items[0].name || items[0].title || 'Item')))
          : items.length + ' items';

      var statusSelect = '<select class="form-control order-status-select order-row-status" data-order-id="' + escapeAttr(id) + '">' +
        ORDER_STATUSES.map(function (s) {
          return '<option value="' + s + '"' + (status === s ? ' selected' : '') + '>' + ORDER_STATUS_LABELS[s] + '</option>';
        }).join('') + '</select>';

      return '<tr class="' + (expanded ? 'is-expanded' : '') + '">' +
        '<td><button class="chevron-btn" type="button" onclick="toggleOrderExpand(\'' + escapeAttr(id) + '\')"><i class="fas fa-chevron-' + (expanded ? 'up' : 'down') + '"></i></button></td>' +
        '<td><strong style="color: var(--secondary);">' + Utils.escape(String(id)) + '</strong></td>' +
        '<td style="white-space:nowrap;font-size:0.85rem;">' + Utils.escape(String(date || '')) + '</td>' +
        '<td>' +
          '<div style="font-weight:600;font-size:0.85rem;display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;">' +
            Utils.escape(String(customer.name || '—')) +
            (customer.isGuest
              ? '<span style="font-size:0.65rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;padding:0.1rem 0.4rem;border-radius:4px;background:rgba(148,163,184,0.18);color:var(--text-muted);">Guest</span>'
              : '') +
          '</div>' +
          (customer.email ? '<div style="font-size:0.75rem;color:var(--text-muted);">' + Utils.escape(String(customer.email)) + '</div>' : '') +
        '</td>' +
        '<td style="font-size:0.85rem;color:var(--text-muted);">' + summary + '</td>' +
        '<td style="color: var(--accent); font-weight: 700;white-space:nowrap;">₹' + total.toLocaleString() + '</td>' +
        '<td>' + statusSelect + '</td>' +
        '<td style="text-align:right;">' +
          '<button class="order-row-delete" type="button" onclick="confirmDeleteOrder(\'' + escapeAttr(id) + '\')" title="Delete order"><i class="fas fa-trash"></i></button>' +
        '</td>' +
        '</tr>';
    }

    function orderRowDetailHtml(o) {
      var id = o.id || '';
      var customer = getOrderCustomer(o);
      var items = Array.isArray(o.items) ? o.items : [];
      var ship = o.shippingAddress || null;
      var history = Array.isArray(o.statusHistory) ? o.statusHistory.slice().reverse() : [];

      // Order Items
      var itemsHtml = items.length ? items.map(function (it) {
        var name = Utils.escape(String(it.name || it.title || 'Item'));
        var qty = Number(it.qty) || 1;
        var price = Number(it.price || 0);
        var line = price * qty;
        return '<div class="order-detail-item">' +
          '<span>' + qty + '× ' + name + '</span>' +
          '<span>₹' + (isFinite(line) ? line.toLocaleString() : '—') + '</span>' +
          '</div>';
      }).join('') : '<div style="color:var(--text-muted);font-size:0.85rem;">No items recorded.</div>';
      var totalLine = '<div class="order-detail-total"><span>Total</span><span>₹' + Number(o.total || 0).toLocaleString() + '</span></div>';

      // Shipping
      var shippingHtml;
      if (ship && typeof ship === 'object') {
        var parts = [ship.line1, ship.line2, ship.landmark, ship.city, ship.state, ship.postalCode, ship.country || ship.countryCode]
          .filter(Boolean).map(function (s) { return Utils.escape(String(s)); }).join(', ');
        shippingHtml =
          '<div style="font-weight:600;font-size:0.9rem;">' + Utils.escape(String(ship.fullName || customer.name || '—')) + '</div>' +
          (parts ? '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.3rem;line-height:1.4;">' + parts + '</div>' : '') +
          (ship.phone ? '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.25rem;">📞 ' + Utils.escape(String(ship.phone)) + '</div>' : '') +
          (customer.email ? '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.2rem;">✉ ' + Utils.escape(String(customer.email)) + '</div>' : '');
      } else {
        shippingHtml =
          '<div style="font-weight:600;font-size:0.9rem;">' + Utils.escape(String(customer.name || '—')) + '</div>' +
          (customer.email ? '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.3rem;">✉ ' + Utils.escape(String(customer.email)) + '</div>' : '') +
          (customer.phone ? '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.2rem;">📞 ' + Utils.escape(String(customer.phone)) + '</div>' : '');
      }

      // History
      var historyHtml = history.length ? history.map(function (h) {
        var s = normalizeOrderStatus(h.status || 'pending');
        var when = h.at ? new Date(String(h.at).replace(' ', 'T') + 'Z').toLocaleString() : '';
        return '<div class="order-detail-item" style="gap:0.6rem;">' +
          getStatusBadgeHtml(s) +
          '<span style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">' + Utils.escape(when) + '</span>' +
          '</div>';
      }).join('') : '<div style="color:var(--text-muted);font-size:0.85rem;">No history yet.</div>';

      var tracking = Utils.escape(String(o.trackingNumber || ''));
      var adminNote = Utils.escape(String(o.adminNote || ''));
      var shipCarrier = (o.carrier || '').toLowerCase();
      var shipUrl = Utils.escape(String(o.trackingUrl || ''));
      // Build the carrier <select> with the current value pre-selected.
      var inlineCarrierOpts = '<option value="">— Select carrier —</option>' + CARRIERS.map(function (c) {
        return '<option value="' + c[0] + '"' + (shipCarrier === c[0] ? ' selected' : '') + '>' + c[1] + '</option>';
      }).join('');
      // URL field is meaningful only for 'other' (known carriers have a URL template
      // baked into the customer tracker). Hide it otherwise to keep the form tight.
      var inlineUrlRowStyle = shipCarrier === 'other' ? '' : 'display:none;';

      return '<tr class="order-detail-row" data-detail-for="' + escapeAttr(id) + '">' +
        '<td colspan="8" class="order-detail-cell">' +
          '<div class="order-detail-grid">' +
            '<div class="order-detail-panel">' +
              '<h4>🛒 Order Items</h4>' + itemsHtml + totalLine +
            '</div>' +
            '<div class="order-detail-panel">' +
              '<h4>📍 Shipping Details</h4>' + shippingHtml +
              '<h4 style="margin-top:1rem;">🚚 Shipment</h4>' +
              '<div class="shipment-form">' +
                '<label class="shipment-label">Carrier</label>' +
                '<select class="shipment-select" id="ship-car-' + escapeAttr(id) + '" onchange="onInlineCarrierChange(\'' + escapeAttr(id) + '\')">' + inlineCarrierOpts + '</select>' +
                '<label class="shipment-label">Tracking Number</label>' +
                '<div class="shipment-row">' +
                  '<input type="text" class="shipment-input" id="ship-trk-' + escapeAttr(id) + '" value="' + tracking + '" placeholder="e.g. DH123456789" maxlength="100">' +
                  '<button class="shipment-save-btn" type="button" onclick="saveShipmentInline(\'' + escapeAttr(id) + '\')" title="Save"><i class="fas fa-save"></i> Save</button>' +
                '</div>' +
                '<div class="shipment-url-row" id="ship-url-row-' + escapeAttr(id) + '" style="' + inlineUrlRowStyle + '">' +
                  '<label class="shipment-label">Tracking URL <span style="color:var(--text-muted);font-weight:400;">(for "Other" carrier)</span></label>' +
                  '<input type="url" class="shipment-input" id="ship-url-' + escapeAttr(id) + '" value="' + shipUrl + '" placeholder="https://carrier.com/track?n=…" maxlength="500">' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="order-detail-panel">' +
              '<h4>🕓 Status History</h4>' + historyHtml +
              '<h4 style="margin-top:1rem;">📝 Admin Note (Visible to Customer)</h4>' +
              '<textarea class="admin-note-textarea" id="adm-' + escapeAttr(id) + '" placeholder="e.g. Dispatched via DTDC, expect delivery in 3-5 days">' + adminNote + '</textarea>' +
              '<div style="display:flex;justify-content:flex-end;margin-top:0.5rem;">' +
                '<button class="btn btn-secondary btn-sm" type="button" onclick="saveAdminNoteForOrder(\'' + escapeAttr(id) + '\')" style="width:auto;"><i class="fas fa-save"></i> Save Note</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }

    function toggleOrderExpand(id) {
      if (ADMIN_EXPANDED_ORDERS.has(id)) ADMIN_EXPANDED_ORDERS.delete(id);
      else ADMIN_EXPANDED_ORDERS.add(id);
      renderOrdersTable();
    }

    // Show / hide the "Tracking URL" field when carrier is set to "Other".
    // Known carriers have a URL template in the customer tracker (track-order.html);
    // only "Other" needs a manually-pasted URL.
    function onInlineCarrierChange(orderId) {
      var sel = document.getElementById('ship-car-' + orderId);
      var urlRow = document.getElementById('ship-url-row-' + orderId);
      if (!sel || !urlRow) return;
      urlRow.style.display = sel.value === 'other' ? '' : 'none';
    }

    // Save carrier + tracking number (+ URL when carrier='other') in a single PATCH.
    // Replaces the old saveTrackingForOrder which only saved the number.
    function saveShipmentInline(orderId) {
      var carrierEl = document.getElementById('ship-car-' + orderId);
      var trkEl     = document.getElementById('ship-trk-' + orderId);
      var urlEl     = document.getElementById('ship-url-' + orderId);
      if (!carrierEl || !trkEl) return;
      var carrier  = carrierEl.value || null;
      var tracking = trkEl.value.trim() || null;
      var url      = (carrier === 'other' && urlEl) ? (urlEl.value.trim() || null) : null;
      // Guard against a typo'd save where the admin entered a tracking number
      // but forgot to pick a carrier — the customer would see an AWB they can't click.
      if (tracking && !carrier) {
        showToast('Pick a carrier before saving', 'error');
        return;
      }
      patchOrder(orderId, {
        carrier: carrier,
        trackingNumber: tracking,
        trackingUrl: url,
      })
        .then(function () { showToast('✅ Shipment saved', 'success'); })
        .catch(function (e) { showToast('❌ ' + (e.message || 'Save failed'), 'danger'); });
    }

    function saveAdminNoteForOrder(orderId) {
      var t = document.getElementById('adm-' + orderId);
      if (!t) return;
      var val = t.value.trim();
      patchOrder(orderId, { adminNote: val || null })
        .then(function () { showToast('✅ Note saved', 'success'); })
        .catch(function (e) { showToast('❌ ' + (e.message || 'Save failed'), 'danger'); });
    }

    async function confirmDeleteOrder(orderId) {
      if (!confirm('Delete order ' + orderId + '? This permanently removes it from the database.')) return;
      try {
        var pass = sessionStorage.getItem('admin_pass') || '';
        var res = await fetch(API_BASE + '/orders.php?id=' + encodeURIComponent(orderId), {
          method: 'DELETE',
          headers: { 'X-Admin-Pass': pass },
        });
        var json = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(json.error || ('HTTP ' + res.status));
        var list = Storage.getOrders().filter(function (o) { return o.id !== orderId; });
        Storage.saveOrders(list);
        ADMIN_EXPANDED_ORDERS.delete(orderId);
        renderOrdersTable();
        showToast('🗑 Order deleted', 'success');
      } catch (e) {
        showToast('❌ ' + (e.message || 'Delete failed'), 'danger');
      }
    }

    function updateOrderStatus(orderId, nextStatus) {
      patchOrder(orderId, { status: normalizeOrderStatus(nextStatus) })
        .then(function () { showToast('✅ Order status updated', 'success'); })
        .catch(function (e) { showToast('❌ ' + (e.message || 'Update failed'), 'danger'); renderOrdersTable(); });
    }

    // Sends a PATCH to /api/orders.php?id=... with admin auth, updates the local
    // cache row in place, and re-renders the table. The returned order JSON is
    // the authoritative version. Throws on non-2xx so callers can show errors.
    async function patchOrder(orderId, patch) {
      var pass = sessionStorage.getItem('admin_pass') || '';
      var res = await fetch(API_BASE + '/orders.php?id=' + encodeURIComponent(orderId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Pass': pass },
        body: JSON.stringify(patch),
        cache: 'no-store'
      });
      var json = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(json.error || ('HTTP ' + res.status));
      var orders = Storage.getOrders();
      var idx = orders.findIndex(function (o) { return String(o.id) === String(orderId); });
      if (idx === -1) orders.push(json.order); else orders[idx] = json.order;
      Storage.saveOrders(orders);
      renderOrdersTable();
      return json.order;
    }

    function viewOrder(orderId) {
      var orders = Storage.getOrders();
      var order = orders.find(function (o) { return String(o.id) === String(orderId); });
      if (!order) return;
      openOrderModal(order);
    }

    function closeOrderModal() {
      var modal = document.getElementById('order-modal');
      if (modal) modal.style.display = 'none';
    }

    function getOrderCustomer(order) {
      // Three sources, checked in priority order:
      //   1. order.contact  — guest checkout (populated by _payment_finalize.php
      //      from payment_orders.guest_contact). Shape: {email, phone, fullName, isGuest}.
      //   2. order.userEmail/userName — server-side LEFT JOIN to users for registered orders.
      //   3. Legacy fallbacks (order.customer object/string, order.prefill, raw fields)
      //      that older locally-cached orders may still carry.
      //
      // The previous version stopped at `order.customer` and `order.prefill`, so
      // every guest order showed "Valued Customer" with no email — even though
      // the contact block was sitting right there in order.contact.
      var c = (order && typeof order.contact === 'object' && order.contact) ? order.contact : null;
      var legacy = (order && typeof order.customer === 'object' && order.customer) ? order.customer : null;

      var name = (c && c.fullName)
        || order.userName
        || (legacy && legacy.name)
        || order.customerName
        || (typeof order.customer === 'string' ? order.customer : null)
        || (order.prefill && order.prefill.name)
        || 'Valued Customer';

      var email = (c && c.email)
        || order.userEmail
        || (legacy && legacy.email)
        || (order.prefill && order.prefill.email)
        || (typeof order.email === 'string' ? order.email : '')
        || '';

      var phone = (c && c.phone)
        || (legacy && (legacy.phone || legacy.mobile || legacy.contact))
        || (order.prefill && order.prefill.contact)
        || (typeof order.contact === 'string' ? order.contact : '')
        || '';

      // userId is NULL for guest orders; the contact block also has an isGuest flag
      // populated at finalize-time. Either signal is sufficient.
      var isGuest = !!(c && c.isGuest) || (order && (order.userId === null || typeof order.userId === 'undefined'));

      return { name: name, email: email, phone: phone, isGuest: isGuest };
    }

    function fmtAddress(addr) {
      if (!addr) return '—';
      if (typeof addr === 'string') return addr.trim() || '—';
      var parts = [];
      ['name', 'line1', 'line2', 'landmark', 'city', 'state', 'pincode', 'country'].forEach(function (k) {
        if (addr[k]) parts.push(String(addr[k]).trim());
      });
      return parts.filter(Boolean).join(', ') || '—';
    }

    function money(n) {
      return '₹' + Number(n || 0).toLocaleString();
    }

    function buildOrderDetailsHtml(order) {
      var id = order.id || '';
      var status = normalizeOrderStatus(order.status);
      var date = formatOrderDate(order);
      var total = Number(order.total || 0);
      var subtotal = Number(order.subtotal || order.amount || 0);
      var shipping = (order.shipping !== undefined) ? Number(order.shipping || 0) : null;
      var discount = (order.discount !== undefined) ? Number(order.discount || 0) : null;
      var coupon = order.coupon || '';

      var customer = getOrderCustomer(order);
      var payment = order.payment || {};
      var paymentId = order.paymentId || payment.id || '';
      var method = order.paymentMethod || payment.method || '';
      var gateway = payment.gateway || (paymentId ? 'Razorpay' : '');

      var billing = order.billingAddress || (order.addresses && order.addresses.billing) || null;
      var shippingAddr = order.shippingAddress || (order.addresses && order.addresses.shipping) || null;

      var items = Array.isArray(order.items) ? order.items : [];
      var itemsHtml = items.length ? items.map(function (it) {
        var name = it.name || it.title || 'Item';
        var sku = it.sku || it.id || '';
        var qty = Number(it.qty || 1);
        var price = Number(it.price || 0);
        var lineTotal = price * qty;
        return (
          '<div class="order-item-row">' +
          '<div>' +
          '<div class="order-item-name">' + Utils.escape(String(name)) + '</div>' +
          '<div class="order-item-sub">' +
          (sku ? ('SKU/ID: ' + Utils.escape(String(sku)) + ' · ') : '') +
          'Qty: ' + qty + ' · Unit: ' + money(price) +
          '</div>' +
          '</div>' +
          '<div style="font-weight:900;color:var(--accent);">' + money(lineTotal) + '</div>' +
          '</div>'
        );
      }).join('') : '<div style="padding:1rem;color:var(--text-muted);">No items found in this order.</div>';

      var breakdownRows = '';
      if (subtotal) breakdownRows += '<div class="order-total-bar" style="background:transparent;border-top:none;"><span>Subtotal</span><span>' + money(subtotal) + '</span></div>';
      if (shipping !== null) breakdownRows += '<div class="order-total-bar" style="background:transparent;border-top:none;"><span>Shipping</span><span>' + money(shipping) + '</span></div>';
      if (discount !== null && discount > 0) breakdownRows += '<div class="order-total-bar" style="background:transparent;border-top:none;"><span>Discount</span><span>− ' + money(discount) + '</span></div>';
      if (coupon) breakdownRows += '<div class="order-total-bar" style="background:transparent;border-top:none;"><span>Coupon</span><span>' + Utils.escape(String(coupon)) + '</span></div>';

      return (
        '<div class="order-details-grid">' +
        '<div class="order-details-card"><div class="order-details-label">Order Number</div><div class="order-details-value">#' + Utils.escape(String(id)) + '</div></div>' +
        '<div class="order-details-card"><div class="order-details-label">Status</div><div class="order-details-value">' + getStatusBadgeHtml(status) + '</div></div>' +
        '<div class="order-details-card"><div class="order-details-label">Order Date</div><div class="order-details-value">' + Utils.escape(String(date)) + '</div></div>' +
        '<div class="order-details-card"><div class="order-details-label">Total</div><div class="order-details-value" style="color:var(--accent);">' + money(total) + '</div></div>' +
        '</div>' +

        '<div class="order-details-grid" style="margin-top:0.75rem;">' +
        '<div class="order-details-card"><div class="order-details-label">Customer</div><div class="order-details-value">' + Utils.escape(String(customer.name || '—')) + '</div><div class="order-item-sub" style="margin-top:0.5rem;">' +
        (customer.email ? ('Email: ' + Utils.escape(String(customer.email)) + '<br>') : '') +
        (customer.phone ? ('Phone: ' + Utils.escape(String(customer.phone))) : '') +
        (!customer.email && !customer.phone ? '—' : '') +
        '</div></div>' +
        '<div class="order-details-card"><div class="order-details-label">Payment</div><div class="order-details-value">' + Utils.escape(String(gateway || '—')) + '</div><div class="order-item-sub" style="margin-top:0.5rem;">' +
        (paymentId ? ('Payment ID: ' + Utils.escape(String(paymentId)) + '<br>') : '') +
        (method ? ('Method: ' + Utils.escape(String(method))) : '') +
        (!paymentId && !method ? '—' : '') +
        '</div></div>' +
        '</div>' +

        '<div class="order-details-grid" style="margin-top:0.25rem;">' +
        '<div class="order-details-card"><div class="order-details-label">Billing Address</div><div class="order-details-value" style="font-weight:700;">' + Utils.escape(fmtAddress(billing)) + '</div></div>' +
        '<div class="order-details-card"><div class="order-details-label">Shipping Address</div><div class="order-details-value" style="font-weight:700;">' + Utils.escape(fmtAddress(shippingAddr)) + '</div></div>' +
        '</div>' +

        '<div class="order-items" style="margin-top:0.75rem;">' +
        itemsHtml +
        (breakdownRows ? ('<div style="border-top:1px solid var(--border);">' + breakdownRows + '</div>') : '') +
        '<div class="order-total-bar"><span>Order Total</span><span>' + money(total) + '</span></div>' +
        '</div>'
      );
    }

    function printCurrentOrder() {
      var id = window._currentOrderIdForPrint;
      if (!id) return;
      var orders = Storage.getOrders();
      var order = orders.find(function (o) { return String(o.id) === String(id); });
      if (!order) return;

      var html = buildOrderDetailsHtml(order);
      var w = window.open('', '_blank');
      if (!w) {
        showToast('❌ Popup blocked. Allow popups to print.', 'danger');
        return;
      }

      w.document.open();
      w.document.write(
        '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<title>Order #' + (order.id || '') + '</title>' +
        '<style>' +
        'body{margin:0;padding:24px;font-family:system-ui,Segoe UI,Roboto,Arial;background:#050508;color:#f8fafc;}' +
        '.wrap{max-width:980px;margin:0 auto;}' +
        '.hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;}' +
        '.brand{font-weight:900;font-size:18px;letter-spacing:-0.02em;}' +
        '.muted{color:#94a3b8;font-size:12px;}' +
        '.badge{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;font-weight:800;font-size:12px;border:1px solid rgba(255,255,255,0.08);}' +
        '.order-details-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;}' +
        '.order-details-card{background:#11111e;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:14px;}' +
        '.order-details-label{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;font-weight:900;margin-bottom:6px;}' +
        '.order-details-value{font-weight:900;word-break:break-word;}' +
        '.order-items{background:#11111e;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;}' +
        '.order-item-row{display:grid;grid-template-columns:1fr auto;gap:12px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);align-items:center;}' +
        '.order-item-row:last-child{border-bottom:none;}' +
        '.order-item-name{font-weight:900;}' +
        '.order-item-sub{font-size:12px;color:#94a3b8;margin-top:2px;}' +
        '.order-total-bar{display:flex;justify-content:space-between;align-items:center;padding:14px;background:rgba(255,215,0,0.08);border-top:1px solid rgba(255,215,0,0.18);font-weight:900;}' +
        '@media print{body{background:#fff;color:#111} .order-details-card,.order-items{border-color:#ddd} .order-total-bar{background:#f6f6f6;border-top-color:#ddd} .order-item-sub,.order-details-label{color:#555}}' +
        '</style></head><body><div class="wrap">' +
        '<div class="hdr"><div><div class="brand">Velorex Music</div><div class="muted">Order print · Use “Save as PDF” in the print dialog</div></div>' +
        '<div class="muted">#' + (order.id || '') + '</div></div>' +
        html +
        '<script>setTimeout(()=>{window.print();},250);<\\/script>' +
        '</div></body></html>'
      );
      w.document.close();
    }

    function openOrderModal(order) {
      var modal = document.getElementById('order-modal');
      var body = document.getElementById('order-modal-body');
      var title = document.getElementById('order-modal-title');
      if (!modal || !body) return;

      var id = order.id || '';
      if (title) title.textContent = 'Order #' + id;

      // Remember current order for print + shipment form binding
      window._currentOrderIdForPrint = id;

      // Details (printed) + shipment editor + history timeline (admin-only, not printed).
      body.innerHTML = buildOrderDetailsHtml(order)
        + buildOrderShipmentHtml(order)
        + buildOrderHistoryHtml(order);

      modal.style.display = 'flex';
    }

    function buildOrderShipmentHtml(order) {
      var id = order.id || '';
      var status = normalizeOrderStatus(order.status);
      var carrier = (order.carrier || '').toLowerCase();
      var awb = order.trackingNumber || '';
      var url = order.trackingUrl || '';

      var statusOpts = ORDER_STATUSES.map(function (s) {
        return '<option value="' + s + '"' + (status === s ? ' selected' : '') + '>' + ORDER_STATUS_LABELS[s] + '</option>';
      }).join('');

      var carrierOpts = '<option value="">— Select carrier —</option>' + CARRIERS.map(function (c) {
        return '<option value="' + c[0] + '"' + (carrier === c[0] ? ' selected' : '') + '>' + c[1] + '</option>';
      }).join('');

      var otherStyle = carrier === 'other' ? '' : 'display:none;';

      return (
        '<div class="card" style="margin-top:1rem;">' +
        '<h3 style="font-family:var(--font-display);margin-bottom:0.75rem;">Shipment & Status</h3>' +
        '<div class="order-details-grid">' +
          '<div class="order-details-card">' +
            '<div class="order-details-label">Status</div>' +
            '<select id="shipment-status" class="form-control" style="margin-top:0.4rem;">' + statusOpts + '</select>' +
          '</div>' +
          '<div class="order-details-card">' +
            '<div class="order-details-label">Carrier</div>' +
            '<select id="shipment-carrier" class="form-control" style="margin-top:0.4rem;" onchange="onShipmentCarrierChange()">' + carrierOpts + '</select>' +
          '</div>' +
        '</div>' +
        '<div class="order-details-grid" style="margin-top:0.5rem;">' +
          '<div class="order-details-card">' +
            '<div class="order-details-label">Tracking Number (AWB)</div>' +
            '<input id="shipment-awb" class="form-control" type="text" maxlength="100" value="' + Utils.escape(String(awb)) + '" placeholder="e.g. ABC123456789" style="margin-top:0.4rem;">' +
          '</div>' +
          '<div class="order-details-card" id="shipment-url-card" style="' + otherStyle + '">' +
            '<div class="order-details-label">Custom Tracking URL</div>' +
            '<input id="shipment-url" class="form-control" type="url" maxlength="500" value="' + Utils.escape(String(url)) + '" placeholder="https://carrier.com/track?n=…" style="margin-top:0.4rem;">' +
          '</div>' +
        '</div>' +
        '<div style="margin-top:0.5rem;">' +
          '<div class="order-details-label" style="margin-bottom:0.4rem;">Note (optional)</div>' +
          '<textarea id="shipment-note" class="form-control" rows="2" placeholder="Visible to customer in the timeline"></textarea>' +
        '</div>' +
        '<div style="margin-top:0.75rem;display:flex;justify-content:flex-end;">' +
          '<button type="button" class="btn btn-primary" style="width:auto;" onclick="saveShipmentForm(\'' + Utils.escape(String(id)) + '\')">💾 Save Shipment</button>' +
        '</div>' +
        '</div>'
      );
    }

    function buildOrderHistoryHtml(order) {
      var hist = Array.isArray(order.statusHistory) ? order.statusHistory : [];
      if (!hist.length) return '';
      var rows = hist.slice().reverse().map(function (h) {
        var s = normalizeOrderStatus(h.status);
        var when = h.at ? new Date(h.at.replace(' ', 'T') + 'Z').toLocaleString() : '';
        var note = h.note ? '<div style="color:var(--text-muted);font-size:0.85rem;margin-top:0.25rem;">' + Utils.escape(String(h.note)) + '</div>' : '';
        return '<div style="display:flex;gap:0.75rem;padding:0.5rem 0;border-bottom:1px solid var(--border);">' +
          '<div style="min-width:160px;font-size:0.85rem;color:var(--text-muted);">' + Utils.escape(when) + '</div>' +
          '<div style="flex:1;">' + getStatusBadgeHtml(s) +
          '<span style="margin-left:0.5rem;font-size:0.8rem;color:var(--text-muted);">by ' + Utils.escape(String(h.by || 'system')) + '</span>' +
          note + '</div></div>';
      }).join('');
      return (
        '<div class="card" style="margin-top:1rem;">' +
        '<h3 style="font-family:var(--font-display);margin-bottom:0.5rem;">Status History</h3>' +
        rows +
        '</div>'
      );
    }

    function onShipmentCarrierChange() {
      var sel = document.getElementById('shipment-carrier');
      var card = document.getElementById('shipment-url-card');
      if (!sel || !card) return;
      card.style.display = sel.value === 'other' ? '' : 'none';
    }

    function saveShipmentForm(orderId) {
      var statusEl = document.getElementById('shipment-status');
      var carrierEl = document.getElementById('shipment-carrier');
      var awbEl = document.getElementById('shipment-awb');
      var urlEl = document.getElementById('shipment-url');
      var noteEl = document.getElementById('shipment-note');
      if (!statusEl || !carrierEl) return;
      var payload = {
        status: statusEl.value,
        carrier: carrierEl.value || null,
        trackingNumber: (awbEl && awbEl.value.trim()) || null,
        trackingUrl: carrierEl.value === 'other' ? ((urlEl && urlEl.value.trim()) || null) : null,
        note: (noteEl && noteEl.value.trim()) || ''
      };
      patchOrder(orderId, payload)
        .then(function () { showToast('✅ Shipment updated', 'success'); })
        .catch(function (e) { showToast('❌ ' + (e.message || 'Update failed'), 'danger'); });
    }
