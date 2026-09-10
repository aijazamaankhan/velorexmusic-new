/* =============================================================================
   Velorex Music — admin Dashboard panel (panel-overview)
   Used by: vlx-admin-2026.html, driven from switchPanel('overview')

   The sidebar's first item used to be "Inventory", which calls
   switchPanel('dashboard') — so the panel id 'dashboard' was already taken by
   the products table. This panel is 'overview' to avoid colliding with it.

   WHAT BELONGS HERE
   The questions an owner opens the panel to answer, in order: did we make
   money, is anything waiting on me, is anything broken. Everything is a real
   count or sum from /api/admin/dashboard.php.

   WHAT DOES NOT
   Invented numbers. The Inventory stat cards used to read "12% vs last month"
   and "Top 1% Seller" as literal markup that never changed (CLAUDE.md §20). A
   figure we cannot derive renders as an em dash with an honest sub-line — see
   `stat()` below, which is built so the em-dash path is the easy one.

   Cross-module touch points (resolved at runtime):
     - API_BASE, escapeHTML, Skeleton, showToast, switchPanel, adminAuthHeaders
   ============================================================================= */

    const DashState = {
      data: null,
      loading: false,
      error: null,
    };

    function dashMoney(n) {
      const v = Number(n);
      if (!isFinite(v)) return '—';
      return '₹' + Math.round(v).toLocaleString('en-IN');
    }

    function dashAgo(iso) {
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
      return Math.floor(days / 30) + 'mo ago';
    }

    async function loadDashboard() {
      if (DashState.loading) return;
      DashState.loading = true;
      DashState.error = null;
      renderDashboard();
      try {
        const res = await fetch(API_BASE + '/admin/dashboard.php', { headers: adminAuthHeaders() });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
        DashState.data = data;
      } catch (e) {
        // Same rule as the Inventory table (CLAUDE.md §20): a failed load must
        // not look like a slow one. Show the reason and a Retry, never an
        // endless shimmer.
        DashState.error = e.message;
      } finally {
        DashState.loading = false;
        renderDashboard();
      }
    }

    // value === null | undefined  ->  em dash + the honest sub-line.
    function dashStat(label, value, sub, tone) {
      const known = value !== null && value !== undefined;
      const toneCss = tone ? ' style="color:' + tone + ';"' : '';
      return ''
        + '<div class="dash-card">'
        +   '<div class="dash-card-label">' + escapeHTML(label) + '</div>'
        +   '<div class="dash-card-value"' + (known ? toneCss : ' style="color:var(--text-muted);"') + '>'
        +     (known ? value : '—')
        +   '</div>'
        +   '<div class="dash-card-sub">' + (sub || '') + '</div>'
        + '</div>';
    }

    function renderDashboard() {
      const root = document.getElementById('overview-body');
      if (!root) return;

      if (DashState.error) {
        root.innerHTML =
            '<div class="dash-error">'
          +   '<strong>Could not load the dashboard.</strong><br>'
          +   escapeHTML(DashState.error)
          +   '<div style="margin-top:1rem;">'
          +     '<button type="button" class="btn btn-primary" style="width:auto;" onclick="loadDashboard()">Retry</button>'
          +   '</div>'
          + '</div>';
        return;
      }

      if (!DashState.data) {
        root.innerHTML = '<div class="dash-grid">'
          + (typeof Skeleton !== 'undefined' ? Skeleton.statCards(4) : '') + '</div>';
        return;
      }

      const d  = DashState.data;
      const k  = d.kpis || {};
      const n  = d.needsAttention || {};
      const h  = d.health || {};

      // ---- KPI row ----------------------------------------------------------
      const kpis = '<div class="dash-grid">'
        + dashStat('Revenue · 30 days', dashMoney(k.revenue30),
            'All time ' + escapeHTML(dashMoney(k.revenueAll)))
        + dashStat('Orders · 30 days', k.orders30,
            (k.ordersAll || 0) + ' all time')
        + dashStat('Awaiting fulfilment', k.openOrders,
            (k.openOrders > 0
              ? '<a href="#" onclick="switchPanel(\'orders\', document.querySelector(\'[data-nav=orders]\')); return false;">Open the Orders panel →</a>'
              : 'Nothing outstanding'),
            k.openOrders > 0 ? 'var(--warning)' : '')
        + dashStat('Customers', k.customers,
            (k.newCustomers30 || 0) + ' joined in 30 days')
        + '</div>';

      // ---- Stock ------------------------------------------------------------
      const stock = '<div class="dash-grid">'
        + dashStat('Products live', k.products, escapeHTML(dashMoney(k.stockValue)) + ' of stock at retail')
        + dashStat('Out of stock', k.outOfStock,
            k.outOfStock > 0 ? 'Not buyable right now' : 'Everything is buyable',
            k.outOfStock > 0 ? 'var(--danger)' : '')
        + dashStat('Low stock (' + (k.lowThreshold || 3) + ' or fewer)', k.lowStock,
            k.lowStock > 0 ? 'Reorder before these run out' : 'No thin shelves',
            k.lowStock > 0 ? 'var(--warning)' : '')
        + dashStat('Baskets left behind', n.abandonedCount,
            n.abandonedCount === null
              ? 'Cart capture is not set up'
              : escapeHTML(dashMoney(n.abandonedValue)) + ' at risk')
        + '</div>';

      // ---- Recent orders ----------------------------------------------------
      const orders = d.recentOrders || [];
      const ordersHtml = orders.length
        ? '<table class="admin-table"><thead><tr>'
            + '<th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>When</th>'
          + '</tr></thead><tbody>'
          + orders.map(function (o) {
              const status = (typeof normalizeOrderStatus === 'function')
                ? normalizeOrderStatus(o.status) : String(o.status || 'pending');
              // getStatusBadgeHtml lives in admin/orders.js — reused so the
              // Dashboard and the Orders panel can never colour the same
              // status differently.
              const badge = (typeof getStatusBadgeHtml === 'function')
                ? getStatusBadgeHtml(status)
                : '<span class="badge">' + escapeHTML(status) + '</span>';
              return '<tr>'
                + '<td style="font-family:monospace;">' + escapeHTML(o.id) + '</td>'
                + '<td>' + escapeHTML(o.customer || 'Guest')
                  + (o.city ? '<div style="font-size:0.72rem;color:var(--text-muted);">' + escapeHTML(o.city) + '</div>' : '')
                + '</td>'
                + '<td>' + escapeHTML(String(o.itemCount)) + '</td>'
                + '<td style="font-weight:700;white-space:nowrap;">' + escapeHTML(dashMoney(o.total)) + '</td>'
                + '<td>' + badge + '</td>'
                + '<td style="white-space:nowrap;color:var(--text-muted);">' + escapeHTML(dashAgo(o.at)) + '</td>'
                + '</tr>';
            }).join('')
          + '</tbody></table>'
        : '<p class="dash-empty">No orders yet. This fills in the moment the first one lands.</p>';

      // ---- Low stock list ---------------------------------------------------
      const low = n.lowStockProducts || [];
      const lowHtml = low.length
        ? '<ul class="dash-list">' + low.map(function (p) {
            const out = p.stock <= 0;
            return '<li>'
              + '<span class="dash-list-name">' + escapeHTML(p.title)
                + '<span class="dash-list-sub">' + escapeHTML(p.artist || '') + '</span></span>'
              + '<span class="dash-pill" style="background:' + (out ? 'rgba(255,71,87,0.15)' : 'rgba(255,184,0,0.15)')
                + ';color:' + (out ? 'var(--danger)' : 'var(--warning)') + ';">'
                + (out ? 'Out of stock' : p.stock + ' left') + '</span>'
              + '</li>';
          }).join('') + '</ul>'
        : '<p class="dash-empty">Nothing is running low.</p>';

      // ---- Health -----------------------------------------------------------
      // Three things that are otherwise invisible until a customer complains.
      const healthRow = function (label, ok, okText, badText, hint) {
        const unknown = ok === null || ok === undefined;
        const colour = unknown ? 'var(--text-muted)' : (ok ? 'var(--success)' : 'var(--danger)');
        const icon   = unknown ? 'fa-circle-question' : (ok ? 'fa-circle-check' : 'fa-circle-exclamation');
        return '<li>'
          + '<i class="fas ' + icon + '" style="color:' + colour + ';width:1.1rem;"></i> '
          + '<span class="dash-list-name">' + escapeHTML(label)
            + '<span class="dash-list-sub">' + (unknown ? '—' : (ok ? okText : badText)) + '</span></span>'
          + (!unknown && !ok && hint ? '<span class="dash-list-hint">' + hint + '</span>' : '')
          + '</li>';
      };

      const healthHtml = '<ul class="dash-list dash-health">'
        + healthRow('Product image storage', h.uploadsOk,
            (h.uploadsCount === null ? 'Reachable' : h.uploadsCount + ' files reachable'),
            'public_html/uploads is missing — every product photo is 404ing',
            'A cron recreates the symlink within a minute of a deploy (CLAUDE.md §10). If it does not, recreate it over SSH.')
        + healthRow('Transactional email', h.smtpReady,
            'SMTP configured — receipts and reminders can send',
            'SMTP not configured — no receipt or reminder will send',
            'Set the SMTP_* constants in the secrets file (CLAUDE.md §10).')
        + healthRow('Payments', h.razorpayKeyed,
            'Razorpay keys present · <strong>' + escapeHTML(String(h.razorpayMode || '')) + '</strong> mode',
            'Razorpay keys missing or RAZORPAY_MODE unset — checkout will fail',
            'Set RAZORPAY_MODE and the matching key pair in the secrets file.')
        + '</ul>';

      // A live-mode banner, because "we are taking real money" and "we are in
      // test mode" are the two states most worth never confusing.
      const modeBanner = h.razorpayMode === 'test'
        ? '<div class="dash-banner">Razorpay is in <strong>test mode</strong> — real cards will not be charged. '
          + 'Flip <code>RAZORPAY_MODE</code> to <code>live</code> in the secrets file when you are ready.</div>'
        : '';

      root.innerHTML =
          modeBanner
        + kpis
        + stock
        + '<div class="dash-columns">'
        +   '<section class="admin-card dash-panel">'
        +     '<h3 class="dash-panel-title">Recent orders</h3>'
        +     '<div style="overflow-x:auto;">' + ordersHtml + '</div>'
        +   '</section>'
        +   '<section class="admin-card dash-panel">'
        +     '<h3 class="dash-panel-title">Needs restocking</h3>'
        +     lowHtml
        +   '</section>'
        + '</div>'
        + '<section class="admin-card dash-panel">'
        +   '<h3 class="dash-panel-title">Store health</h3>'
        +   healthHtml
        + '</section>';
    }
