/* =============================================================================
   Velorex Music — admin Customers panel + drawer
   Used by: vlx-admin-2026.html

   Two related concerns in one file:
     1. Customers table (registered users + Guests filter chip)
        — CustState, loadUsersTable, loadGuestsTable, setUsersFilter,
          setUsersSort, filteredSortedUsers, sortValue, renderUsersTable,
          setGuestsSort, filteredSortedGuests, renderGuestsTable,
          viewGuestOrders, formatJoinedDate, exportCustomersCsv.
     2. Right-side customer drawer
        — openCustomerDrawer, closeCustomerDrawer, setDrawerTab, renderDrawer,
          renderProfileTab, renderOrdersTab, renderAddressesTab,
          renderSessionsTab, renderNotesTab, renderDangerTab.
        — Mutating actions: adminAction (request wrapper), saveCustomerProfile,
          generateAndResetPassword, forceLogoutUser, saveCustomerNotes.
        — Sub-modals: openPwResultModal/close/copyResetPassword,
          openDeleteUserModal/close/updateDeleteUserButton/confirmDeleteUser.
        — Escape-key listener for closing the drawer.

   Cross-module touch points (resolved at runtime):
     - API_BASE, escapeHTML, showToast               (loaded earlier)
     - switchPanel, renderOrdersTable                (main.js + orders.js)
   ============================================================================= */

    // =============================================
    // CUSTOMER MANAGEMENT (panel-users)
    // =============================================
    // In-memory cache of the customer list. We re-fetch on demand (Refresh
    // button, panel re-entry, drawer mutations); the list itself is small
    // enough that filter/sort runs entirely client-side. Detail data
    // (orders/addresses/sessions) is fetched per-drawer-open.
    const CustState = {
      users: [],
      guests: [],            // rolled-up guest checkouts (loaded lazily when chip selected)
      guestsLoaded: false,   // gate so we only fetch once per session unless Refresh
      filter: 'all',         // chip — see setUsersFilter()
      sort: { key: 'joined', dir: 'desc' },
      guestSort: { key: 'lastOrder', dir: 'desc' },
      activeUser: null,      // currently-open drawer subject
      activeTab: 'profile',  // drawer tab
      detail: null,          // { orders, addresses, sessions } for activeUser
      pendingPassword: null, // { email, password } captured for the result modal
    };

    async function loadUsersTable() {
      const tbody = document.getElementById('admin-users-table');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="8" style="padding:1.25rem;color:var(--text-muted);text-align:center;">Loading…</td></tr>';
      try {
        const res = await fetch(API_BASE + '/admin/users.php', {
          cache: 'no-store',
          headers: { 'X-Admin-Pass': sessionStorage.getItem('admin_pass') || '' },
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'HTTP ' + res.status);
        }
        const users = await res.json();
        CustState.users = Array.isArray(users) ? users : [];
        // Re-link the open drawer's activeUser to the fresh array entry,
        // otherwise later in-place mutations (notes/sessions/profile) end up
        // on an orphaned object and the cache silently drifts from the DB.
        if (CustState.activeUser) {
          const fresh = CustState.users.find(u => Number(u.id) === Number(CustState.activeUser.id));
          if (fresh) CustState.activeUser = fresh;
        }
        // Refresh button also re-pulls guests if that view has been opened
        // this session — keeps the two tables in sync without an extra click.
        if (CustState.guestsLoaded) {
          CustState.guestsLoaded = false;
          loadGuestsTable();
        }
        renderUsersTable();
      } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" style="padding:1.25rem;color:var(--danger);text-align:center;">Failed to load: ${escapeHTML(e.message)}</td></tr>`;
      }
    }

    async function loadGuestsTable() {
      try {
        const res = await fetch(API_BASE + '/admin/guest-customers.php', {
          cache: 'no-store',
          headers: { 'X-Admin-Pass': sessionStorage.getItem('admin_pass') || '' },
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'HTTP ' + res.status);
        }
        const guests = await res.json();
        CustState.guests = Array.isArray(guests) ? guests : [];
        CustState.guestsLoaded = true;
        if (CustState.filter === 'guests') renderUsersTable();
      } catch (e) {
        if (CustState.filter === 'guests') {
          const tbody = document.getElementById('admin-users-table');
          if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="padding:1.25rem;color:var(--danger);text-align:center;">Failed to load guests: ${escapeHTML(e.message)}</td></tr>`;
        }
      }
    }

    function setUsersFilter(filter) {
      CustState.filter = filter;
      document.querySelectorAll('#cust-chips .cust-chip').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-filter') === filter);
      });
      if (filter === 'guests' && !CustState.guestsLoaded) {
        const tbody = document.getElementById('admin-users-table');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="padding:1.25rem;color:var(--text-muted);text-align:center;">Loading guests…</td></tr>';
        loadGuestsTable();
      }
      renderUsersTable();
    }

    function setUsersSort(key) {
      // Toggle direction if already sorted by this key; otherwise default
      // descending for numeric columns and ascending for textual ones.
      const numeric = ['orders', 'spent', 'joined'].includes(key);
      if (CustState.sort.key === key) {
        CustState.sort.dir = CustState.sort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        CustState.sort.key = key;
        CustState.sort.dir = numeric ? 'desc' : 'asc';
      }
      renderUsersTable();
    }

    function filteredSortedUsers() {
      const q = (document.getElementById('cust-search-input')?.value || '').trim().toLowerCase();
      const filter = CustState.filter;
      const startOfMonth = new Date();
      startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);

      let rows = CustState.users.filter(u => {
        if (q) {
          const hay = [
            u.firstName, u.lastName, u.email, u.phone,
          ].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (filter === 'has-orders' && (u.orderCount || 0) === 0) return false;
        if (filter === 'no-orders'  && (u.orderCount || 0) > 0) return false;
        if (filter === 'joined-month') {
          if (!u.createdAt || new Date(u.createdAt) < startOfMonth) return false;
        }
        if (filter === 'active-session' && (u.activeSessionCount || 0) === 0) return false;
        return true;
      });

      const { key, dir } = CustState.sort;
      const mult = dir === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        const va = sortValue(a, key);
        const vb = sortValue(b, key);
        if (va < vb) return -1 * mult;
        if (va > vb) return  1 * mult;
        return 0;
      });
      return rows;
    }

    function sortValue(u, key) {
      switch (key) {
        case 'name':   return (((u.firstName || '') + ' ' + (u.lastName || '')).trim() || u.email || '').toLowerCase();
        case 'email':  return (u.email || '').toLowerCase();
        case 'orders': return Number(u.orderCount || 0);
        case 'spent':  return Number(u.totalSpent || 0);
        case 'joined':
        default:       return u.createdAt ? new Date(u.createdAt).getTime() : 0;
      }
    }

    function renderUsersTable() {
      const tbody = document.getElementById('admin-users-table');
      const meta = document.getElementById('admin-users-meta');
      const thead = document.getElementById('admin-users-thead');
      if (!tbody) return;

      if (CustState.filter === 'guests') {
        renderGuestsTable(tbody, thead, meta);
        return;
      }

      // Restore the registered-users header if we previously swapped it.
      thead.innerHTML = `
        <tr>
          <th><button type="button" class="cust-sort-btn" data-sort="name"   onclick="setUsersSort('name')">Customer <i class="fas fa-sort"></i></button></th>
          <th><button type="button" class="cust-sort-btn" data-sort="email"  onclick="setUsersSort('email')">Email <i class="fas fa-sort"></i></button></th>
          <th>Phone</th>
          <th>Account</th>
          <th><button type="button" class="cust-sort-btn" data-sort="orders" onclick="setUsersSort('orders')">Orders <i class="fas fa-sort"></i></button></th>
          <th><button type="button" class="cust-sort-btn" data-sort="spent"  onclick="setUsersSort('spent')">Total spent <i class="fas fa-sort"></i></button></th>
          <th><button type="button" class="cust-sort-btn" data-sort="joined" onclick="setUsersSort('joined')">Joined <i class="fas fa-sort"></i></button></th>
          <th>Actions</th>
        </tr>`;

      // Reflect sort state in the header buttons.
      document.querySelectorAll('#panel-users .cust-sort-btn').forEach(btn => {
        const k = btn.getAttribute('data-sort');
        const icon = btn.querySelector('i');
        if (!icon) return;
        if (k === CustState.sort.key) {
          btn.classList.add('active');
          icon.className = CustState.sort.dir === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        } else {
          btn.classList.remove('active');
          icon.className = 'fas fa-sort';
        }
      });

      const rows = filteredSortedUsers();
      if (meta) {
        meta.textContent = rows.length === CustState.users.length
          ? `${rows.length} customer${rows.length === 1 ? '' : 's'}`
          : `Showing ${rows.length} of ${CustState.users.length}`;
      }

      if (rows.length === 0) {
        const msg = CustState.users.length === 0
          ? 'No customers yet.'
          : 'No customers match this search/filter.';
        tbody.innerHTML = `<tr><td colspan="8" style="padding:1.25rem;color:var(--text-muted);text-align:center;">${msg}</td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map(u => {
        const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ') || '—';
        const joined = formatJoinedDate(u.createdAt);
        const spent = Math.round(u.totalSpent || 0);
        const orderCount = u.orderCount || 0;
        return `
          <tr>
            <td>
              <div style="font-weight:600;">${escapeHTML(fullName)}</div>
              <div style="color:var(--text-muted);font-size:0.75rem;margin-top:0.2rem;">#${u.id}</div>
            </td>
            <td style="color:var(--text-muted);font-size:0.875rem;word-break:break-all;">${escapeHTML(u.email || '—')}</td>
            <td style="color:var(--text-muted);font-size:0.875rem;">${escapeHTML(u.phone || '—')}</td>
            <td><span class="badge-account">Registered</span></td>
            <td>${orderCount}</td>
            <td>₹${spent.toLocaleString()}</td>
            <td style="font-size:0.85rem;color:var(--text-muted);">${joined}</td>
            <td>
              <button class="btn btn-sm btn-secondary" style="width:auto;" onclick="openCustomerDrawer(${u.id})"><i class="fas fa-eye"></i> View / Edit</button>
            </td>
          </tr>`;
      }).join('');
    }

    // ---------- Guests view ----------
    function setGuestsSort(key) {
      const numeric = ['orders', 'spent', 'lastOrder', 'firstOrder'].includes(key);
      if (CustState.guestSort.key === key) {
        CustState.guestSort.dir = CustState.guestSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        CustState.guestSort.key = key;
        CustState.guestSort.dir = numeric ? 'desc' : 'asc';
      }
      renderUsersTable();
    }

    function filteredSortedGuests() {
      const q = (document.getElementById('cust-search-input')?.value || '').trim().toLowerCase();
      let rows = CustState.guests.filter(g => {
        if (!q) return true;
        const hay = [g.email, g.fullName, g.phone].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
      const { key, dir } = CustState.guestSort;
      const mult = dir === 'asc' ? 1 : -1;
      const val = (g) => {
        switch (key) {
          case 'name':       return (g.fullName || '').toLowerCase();
          case 'email':      return (g.email || '').toLowerCase();
          case 'orders':     return Number(g.orderCount || 0);
          case 'spent':      return Number(g.totalSpent || 0);
          case 'firstOrder': return g.firstOrderAt ? new Date(g.firstOrderAt).getTime() : 0;
          case 'lastOrder':
          default:           return g.lastOrderAt ? new Date(g.lastOrderAt).getTime() : 0;
        }
      };
      rows.sort((a, b) => {
        const va = val(a); const vb = val(b);
        if (va < vb) return -1 * mult;
        if (va > vb) return  1 * mult;
        return 0;
      });
      return rows;
    }

    function renderGuestsTable(tbody, thead, meta) {
      thead.innerHTML = `
        <tr>
          <th><button type="button" class="cust-sort-btn" data-sort="name"   onclick="setGuestsSort('name')">Guest <i class="fas fa-sort"></i></button></th>
          <th><button type="button" class="cust-sort-btn" data-sort="email"  onclick="setGuestsSort('email')">Email <i class="fas fa-sort"></i></button></th>
          <th>Phone</th>
          <th>Account</th>
          <th><button type="button" class="cust-sort-btn" data-sort="orders" onclick="setGuestsSort('orders')">Orders <i class="fas fa-sort"></i></button></th>
          <th><button type="button" class="cust-sort-btn" data-sort="spent"  onclick="setGuestsSort('spent')">Total spent <i class="fas fa-sort"></i></button></th>
          <th><button type="button" class="cust-sort-btn" data-sort="lastOrder" onclick="setGuestsSort('lastOrder')">Last order <i class="fas fa-sort"></i></button></th>
          <th>Actions</th>
        </tr>`;

      document.querySelectorAll('#panel-users .cust-sort-btn').forEach(btn => {
        const k = btn.getAttribute('data-sort');
        const icon = btn.querySelector('i');
        if (!icon) return;
        if (k === CustState.guestSort.key) {
          btn.classList.add('active');
          icon.className = CustState.guestSort.dir === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        } else {
          btn.classList.remove('active');
          icon.className = 'fas fa-sort';
        }
      });

      if (!CustState.guestsLoaded) {
        tbody.innerHTML = '<tr><td colspan="8" style="padding:1.25rem;color:var(--text-muted);text-align:center;">Loading guests…</td></tr>';
        return;
      }

      const rows = filteredSortedGuests();
      if (meta) {
        meta.textContent = rows.length === CustState.guests.length
          ? `${rows.length} guest checkout${rows.length === 1 ? '' : 's'}`
          : `Showing ${rows.length} of ${CustState.guests.length}`;
      }

      if (rows.length === 0) {
        const msg = CustState.guests.length === 0
          ? 'No guest checkouts yet.'
          : 'No guests match this search.';
        tbody.innerHTML = `<tr><td colspan="8" style="padding:1.25rem;color:var(--text-muted);text-align:center;">${msg}</td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map(g => {
        const last = formatJoinedDate(g.lastOrderAt);
        const spent = Math.round(g.totalSpent || 0);
        const orderCount = g.orderCount || 0;
        // If the guest's email matches a registered account, surface a quick
        // jump to that account rather than re-displaying as a "guest" — the
        // claim-on-login flow may have already converted them.
        const linkedAccount = g.registeredUserId
          ? `<button class="btn btn-sm btn-secondary" style="width:auto;margin-top:0.4rem;" onclick="openCustomerDrawer(${g.registeredUserId})"><i class="fas fa-link"></i> View linked account</button>`
          : '';
        return `
          <tr>
            <td>
              <div style="font-weight:600;">${escapeHTML(g.fullName || '—')}</div>
              ${g.registeredUserId ? '<div style="color:var(--success);font-size:0.7rem;margin-top:0.2rem;"><i class="fas fa-circle-check"></i> account exists</div>' : '<div style="color:var(--text-muted);font-size:0.7rem;margin-top:0.2rem;">no account</div>'}
            </td>
            <td style="color:var(--text-muted);font-size:0.875rem;word-break:break-all;">${escapeHTML(g.email || '—')}</td>
            <td style="color:var(--text-muted);font-size:0.875rem;">${escapeHTML(g.phone || '—')}</td>
            <td><span class="badge-guest">Guest</span></td>
            <td>${orderCount}</td>
            <td>₹${spent.toLocaleString()}</td>
            <td style="font-size:0.85rem;color:var(--text-muted);">${last}</td>
            <td>
              <button class="btn btn-sm btn-secondary" style="width:auto;" onclick="viewGuestOrders('${escapeHTML(g.email || '')}')"><i class="fas fa-receipt"></i> View orders</button>
              ${linkedAccount}
            </td>
          </tr>`;
      }).join('');
    }

    // Click-through from a guest row → switches to the Orders panel and
    // filters by that email. Quick way for an admin to find what a specific
    // guest bought without leaving the Customers context.
    function viewGuestOrders(email) {
      if (!email) return;
      const ordersNav = document.querySelector('.nav-link[onclick*="switchPanel(\'orders\'"]');
      switchPanel('orders', ordersNav).then(() => {
        const input = document.getElementById('ordersSearch');
        if (input) {
          input.value = email;
          // The orders panel's search is wired via oninput; calling
          // renderOrdersTable directly applies the filter without dispatching.
          if (typeof renderOrdersTable === 'function') renderOrdersTable();
        }
      });
    }

    function formatJoinedDate(iso) {
      if (!iso) return '';
      try {
        return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      } catch (e) { return ''; }
    }

    // ---------- CSV export ----------
    function exportCustomersCsv() {
      const rows = filteredSortedUsers();
      if (rows.length === 0) {
        showToast('No customers to export', 'danger');
        return;
      }
      const headers = ['id', 'first_name', 'last_name', 'email', 'phone', 'orders', 'total_spent', 'active_sessions', 'addresses', 'joined'];
      const escape = v => {
        const s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const lines = [headers.join(',')];
      rows.forEach(u => {
        lines.push([
          u.id, u.firstName || '', u.lastName || '', u.email || '', u.phone || '',
          u.orderCount || 0, Math.round(u.totalSpent || 0),
          u.activeSessionCount || 0, u.addressCount || 0,
          u.createdAt || '',
        ].map(escape).join(','));
      });
      const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `velorex-customers-${stamp}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`Exported ${rows.length} customer${rows.length === 1 ? '' : 's'}`, 'success');
    }

    // ---------- Drawer ----------
    async function openCustomerDrawer(userId) {
      const user = CustState.users.find(u => Number(u.id) === Number(userId));
      if (!user) { showToast('Customer not found in list', 'danger'); return; }
      CustState.activeUser = user;
      CustState.activeTab = 'profile';
      CustState.detail = null;

      const initials = (((user.firstName || '')[0] || '') + ((user.lastName || '')[0] || '')).toUpperCase()
        || (user.email || '?')[0].toUpperCase();
      document.getElementById('cust-drawer-avatar').textContent = initials;
      document.getElementById('cust-drawer-title').textContent =
        [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || `Customer #${user.id}`;
      document.getElementById('cust-drawer-subtitle').textContent =
        `${user.email || ''} · #${user.id} · Joined ${formatJoinedDate(user.createdAt)}`;
      document.querySelectorAll('#cust-drawer .drawer-tab').forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-tab') === 'profile');
      });

      const drawer = document.getElementById('cust-drawer');
      const overlay = document.getElementById('cust-drawer-overlay');
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
      overlay.classList.add('open');
      renderDrawer();

      // Fetch detail in the background; the profile tab can paint immediately.
      try {
        const res = await fetch(API_BASE + '/admin/customer-detail.php?userId=' + encodeURIComponent(user.id), {
          cache: 'no-store',
          headers: { 'X-Admin-Pass': sessionStorage.getItem('admin_pass') || '' },
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'HTTP ' + res.status);
        }
        CustState.detail = await res.json();
      } catch (e) {
        CustState.detail = { _error: e.message };
      }
      // If the drawer was closed while we were fetching, bail.
      if (CustState.activeUser && CustState.activeUser.id === user.id) renderDrawer();
    }

    function closeCustomerDrawer() {
      const drawer = document.getElementById('cust-drawer');
      const overlay = document.getElementById('cust-drawer-overlay');
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
      overlay.classList.remove('open');
      CustState.activeUser = null;
      CustState.detail = null;
    }

    function setDrawerTab(tab) {
      CustState.activeTab = tab;
      document.querySelectorAll('#cust-drawer .drawer-tab').forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-tab') === tab);
      });
      renderDrawer();
    }

    function renderDrawer() {
      const body = document.getElementById('cust-drawer-body');
      const u = CustState.activeUser;
      if (!u) { body.innerHTML = ''; return; }
      const tab = CustState.activeTab;
      if (tab === 'profile')   { body.innerHTML = renderProfileTab(u); return; }
      if (tab === 'orders')    { body.innerHTML = renderOrdersTab(u); return; }
      if (tab === 'addresses') { body.innerHTML = renderAddressesTab(u); return; }
      if (tab === 'sessions')  { body.innerHTML = renderSessionsTab(u); return; }
      if (tab === 'notes')     { body.innerHTML = renderNotesTab(u); return; }
      if (tab === 'danger')    { body.innerHTML = renderDangerTab(u); return; }
    }

    function renderProfileTab(u) {
      const spent = Math.round(u.totalSpent || 0).toLocaleString();
      return `
        <div class="drawer-stat-grid">
          <div class="drawer-stat"><div class="label">Orders</div><div class="value">${u.orderCount || 0}</div></div>
          <div class="drawer-stat"><div class="label">Total spent</div><div class="value">₹${spent}</div></div>
          <div class="drawer-stat"><div class="label">Active sessions</div><div class="value">${u.activeSessionCount || 0}</div></div>
          <div class="drawer-stat"><div class="label">Saved addresses</div><div class="value">${u.addressCount || 0}</div></div>
        </div>

        <div class="drawer-section">
          <h4>Contact details</h4>
          <div class="drawer-field"><div class="key">First name</div><div><input type="text" id="edit-firstName" value="${escapeHTML(u.firstName || '')}" placeholder="—"></div></div>
          <div class="drawer-field"><div class="key">Last name</div><div><input type="text" id="edit-lastName" value="${escapeHTML(u.lastName || '')}" placeholder="—"></div></div>
          <div class="drawer-field"><div class="key">Email</div><div><input type="email" id="edit-email" value="${escapeHTML(u.email || '')}" placeholder="—"></div></div>
          <div class="drawer-field"><div class="key">Phone</div><div><input type="tel" id="edit-phone" value="${escapeHTML(u.phone || '')}" placeholder="—"></div></div>
          <div class="drawer-actions">
            <button type="button" class="btn btn-primary btn-sm" style="width:auto;" onclick="saveCustomerProfile()"><i class="fas fa-save"></i> Save changes</button>
            <button type="button" class="btn btn-secondary btn-sm" style="width:auto;" onclick="setDrawerTab('profile')">Reset</button>
          </div>
        </div>

        <div class="drawer-section">
          <h4>Security</h4>
          <p style="color:var(--text-muted);font-size:0.85rem;margin:0 0 0.75rem;">
            Resetting the password generates a strong temporary one, invalidates every active
            session, and shows you the value once so you can send it to the customer.
          </p>
          <div class="drawer-actions">
            <button type="button" class="btn btn-secondary btn-sm" style="width:auto;" onclick="generateAndResetPassword()"><i class="fas fa-key"></i> Reset password</button>
            <button type="button" class="btn btn-secondary btn-sm" style="width:auto;" onclick="forceLogoutUser()"><i class="fas fa-right-from-bracket"></i> Force logout all sessions</button>
          </div>
        </div>
      `;
    }

    function renderOrdersTab() {
      const d = CustState.detail;
      if (!d) return `<div class="drawer-empty">Loading orders…</div>`;
      if (d._error) return `<div class="drawer-empty" style="color:var(--danger);">Failed to load: ${escapeHTML(d._error)}</div>`;
      if (!d.orders || d.orders.length === 0) return `<div class="drawer-empty">This customer hasn't placed an order yet.</div>`;
      return d.orders.map(o => {
        const total = Number(o.total || 0).toLocaleString();
        const status = (o.status || 'pending').toString();
        const items = Array.isArray(o.items) ? o.items.length : 0;
        const when = o.date || (o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '');
        return `
          <div class="drawer-order">
            <div class="drawer-order-head">
              <span class="drawer-order-id">${escapeHTML(o.id || '—')}</span>
              <span class="drawer-order-total">₹${total}</span>
            </div>
            <div class="drawer-order-meta">${getStatusBadgeHtml(status)} · ${items} item${items === 1 ? '' : 's'} · ${escapeHTML(when)}</div>
          </div>`;
      }).join('');
    }

    function renderAddressesTab() {
      const d = CustState.detail;
      if (!d) return `<div class="drawer-empty">Loading addresses…</div>`;
      if (d._error) return `<div class="drawer-empty" style="color:var(--danger);">Failed to load: ${escapeHTML(d._error)}</div>`;
      if (!d.addresses || d.addresses.length === 0) return `<div class="drawer-empty">No saved addresses.</div>`;
      return d.addresses.map(a => {
        const lines = [a.line1, a.line2, a.landmark, [a.city, a.state, a.postalCode].filter(Boolean).join(', '), a.countryCode]
          .filter(Boolean).map(escapeHTML).join('<br>');
        return `
          <div class="drawer-address">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.35rem;gap:0.5rem;">
              <strong>${escapeHTML(a.fullName || '—')}</strong>
              ${a.isDefault ? '<span class="badge-account">Default</span>' : ''}
            </div>
            <div style="color:var(--text-muted);font-size:0.85rem;line-height:1.55;">${lines}</div>
            <div style="color:var(--text-muted);font-size:0.8rem;margin-top:0.4rem;">📞 ${escapeHTML(a.phone || '—')}${a.label ? ' · ' + escapeHTML(a.label) : ''}</div>
          </div>`;
      }).join('');
    }

    function renderSessionsTab(u) {
      const d = CustState.detail;
      const count = u.activeSessionCount || 0;
      const intro = count === 0
        ? `<div class="drawer-empty">No active sessions. This customer is not currently signed in on any device.</div>`
        : `<p style="color:var(--text-muted);font-size:0.85rem;margin:0 0 1rem;">${count} active session${count === 1 ? '' : 's'}. Revoking them will sign the customer out everywhere; their next visit will require a fresh login.</p>`;
      const list = (d && Array.isArray(d.sessions) && d.sessions.length)
        ? d.sessions.map(s => `
            <div class="drawer-session">
              <div style="font-weight:600;">Signed in ${escapeHTML(formatJoinedDate(s.createdAt) || '—')}</div>
              <div style="color:var(--text-muted);font-size:0.8rem;">Expires ${escapeHTML(formatJoinedDate(s.expiresAt) || '—')}</div>
            </div>
          `).join('')
        : '';
      return `
        ${intro}
        ${list}
        ${count > 0 ? `
          <div class="drawer-actions" style="margin-top:1rem;">
            <button type="button" class="btn btn-secondary btn-sm" style="width:auto;" onclick="forceLogoutUser()"><i class="fas fa-right-from-bracket"></i> Revoke all sessions</button>
          </div>` : ''}
      `;
    }

    function renderNotesTab(u) {
      const notes = u.notes || '';
      return `
        <p style="color:var(--text-muted);font-size:0.85rem;margin:0 0 0.75rem;">
          Internal notes are visible only to admins. Use them for support context — call logs,
          unresolved issues, special handling instructions.
        </p>
        <textarea id="cust-notes-input" class="notes-textarea" maxlength="5000" placeholder="No notes yet. Add anything that would help the next admin who picks this up.">${escapeHTML(notes)}</textarea>
        <div class="drawer-actions" style="margin-top:0.75rem;">
          <button type="button" class="btn btn-primary btn-sm" style="width:auto;" onclick="saveCustomerNotes()"><i class="fas fa-save"></i> Save notes</button>
          <span id="cust-notes-status" style="color:var(--text-muted);font-size:0.8rem;align-self:center;"></span>
        </div>
      `;
    }

    function renderDangerTab(u) {
      return `
        <div class="danger-zone">
          <h4 style="margin:0 0 0.5rem;">Delete this account</h4>
          <p style="color:var(--text-muted);font-size:0.85rem;line-height:1.6;margin:0 0 1rem;">
            Removes the user, their sessions and saved addresses. Past orders are kept for reporting
            (the user link becomes anonymous). You'll be asked to type <code>${escapeHTML(u.email || '')}</code> to confirm.
          </p>
          <button type="button" class="btn btn-danger btn-sm" style="width:auto;" onclick="openDeleteUserModal()"><i class="fas fa-trash"></i> Delete account…</button>
        </div>
      `;
    }

    // ---------- Drawer actions ----------
    async function adminAction(payload, successMsg) {
      const res = await fetch(API_BASE + '/admin/users.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Pass': sessionStorage.getItem('admin_pass') || '',
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'HTTP ' + res.status);
      if (successMsg) showToast(successMsg, 'success');
      return json;
    }

    async function saveCustomerProfile() {
      const u = CustState.activeUser; if (!u) return;
      const payload = {
        action: 'update-profile',
        userId: u.id,
        firstName: document.getElementById('edit-firstName').value,
        lastName:  document.getElementById('edit-lastName').value,
        email:     document.getElementById('edit-email').value,
        phone:     document.getElementById('edit-phone').value,
      };
      try {
        const out = await adminAction(payload, 'Profile updated');
        Object.assign(u, out.user || {});
        renderDrawer();
        await loadUsersTable();
      } catch (e) {
        showToast('Save failed: ' + e.message, 'danger');
      }
    }

    async function generateAndResetPassword() {
      const u = CustState.activeUser; if (!u) return;
      if (!confirm(`Reset the password for ${u.email}? A new temporary password will be generated and all active sessions will be revoked.`)) return;
      try {
        const out = await adminAction({ action: 'reset-password', userId: u.id });
        if (!out.generated || !out.newPassword) throw new Error('Server did not return a password');
        CustState.pendingPassword = { email: u.email, password: out.newPassword };
        u.activeSessionCount = 0;
        renderDrawer();
        openPwResultModal();
      } catch (e) {
        showToast('Reset failed: ' + e.message, 'danger');
      }
    }

    async function forceLogoutUser() {
      const u = CustState.activeUser; if (!u) return;
      if ((u.activeSessionCount || 0) === 0) { showToast('No active sessions to revoke.', 'success'); return; }
      if (!confirm(`Sign ${u.email} out of every device?`)) return;
      try {
        const out = await adminAction({ action: 'force-logout', userId: u.id });
        u.activeSessionCount = 0;
        showToast(`Revoked ${out.revoked || 0} session${(out.revoked || 0) === 1 ? '' : 's'}.`, 'success');
        renderDrawer();
      } catch (e) {
        showToast('Force logout failed: ' + e.message, 'danger');
      }
    }

    async function saveCustomerNotes() {
      const u = CustState.activeUser; if (!u) return;
      const notes = document.getElementById('cust-notes-input').value;
      const statusEl = document.getElementById('cust-notes-status');
      if (statusEl) statusEl.textContent = 'Saving…';
      try {
        await adminAction({ action: 'update-notes', userId: u.id, notes });
        u.notes = notes;
        if (statusEl) statusEl.textContent = 'Saved.';
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 1500);
      } catch (e) {
        if (statusEl) statusEl.textContent = '';
        showToast('Save notes failed: ' + e.message, 'danger');
      }
    }

    // ---------- Password-result modal ----------
    function openPwResultModal() {
      const p = CustState.pendingPassword; if (!p) return;
      document.getElementById('pw-result-email').textContent = p.email || '';
      document.getElementById('pw-result-value').textContent = p.password;
      document.getElementById('pw-result-modal').style.display = 'flex';
    }
    function closePwResultModal() {
      document.getElementById('pw-result-modal').style.display = 'none';
      // Drop the password from memory so it's not retained any longer than necessary.
      CustState.pendingPassword = null;
      document.getElementById('pw-result-value').textContent = '—';
    }
    async function copyResetPassword() {
      const value = document.getElementById('pw-result-value').textContent || '';
      try {
        await navigator.clipboard.writeText(value);
        showToast('Password copied to clipboard', 'success');
      } catch (e) {
        // Clipboard API can fail in non-secure contexts — fall back to a manual selection.
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(document.getElementById('pw-result-value'));
        sel.removeAllRanges(); sel.addRange(range);
        showToast('Select and copy manually (clipboard blocked)', 'danger');
      }
    }

    // ---------- Delete-account modal ----------
    function openDeleteUserModal() {
      const u = CustState.activeUser; if (!u) return;
      document.getElementById('delete-user-email').textContent = u.email || '';
      const input = document.getElementById('delete-user-confirm-input');
      input.value = '';
      document.getElementById('delete-user-confirm-btn').disabled = true;
      document.getElementById('delete-user-modal').style.display = 'flex';
      setTimeout(() => input.focus(), 50);
    }
    function closeDeleteUserModal() {
      document.getElementById('delete-user-modal').style.display = 'none';
    }
    function updateDeleteUserButton() {
      const u = CustState.activeUser; if (!u) return;
      const typed = (document.getElementById('delete-user-confirm-input').value || '').trim();
      document.getElementById('delete-user-confirm-btn').disabled =
        typed.toLowerCase() !== (u.email || '').toLowerCase();
    }
    async function confirmDeleteUser() {
      const u = CustState.activeUser; if (!u) return;
      const typed = (document.getElementById('delete-user-confirm-input').value || '').trim();
      try {
        await adminAction({ action: 'delete-user', userId: u.id, confirmEmail: typed });
        showToast(`Deleted ${u.email}`, 'success');
        closeDeleteUserModal();
        closeCustomerDrawer();
        await loadUsersTable();
      } catch (e) {
        showToast('Delete failed: ' + e.message, 'danger');
      }
    }

    // Close the drawer with Escape — matches the modal UX elsewhere.
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      if (document.getElementById('cust-drawer')?.classList.contains('open')) {
        // Only close if no modal is on top of the drawer.
        const pwOpen = document.getElementById('pw-result-modal')?.style.display === 'flex';
        const delOpen = document.getElementById('delete-user-modal')?.style.display === 'flex';
        if (pwOpen) { closePwResultModal(); return; }
        if (delOpen) { closeDeleteUserModal(); return; }
        closeCustomerDrawer();
      }
    });
