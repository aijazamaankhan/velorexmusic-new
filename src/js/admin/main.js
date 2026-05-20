/* =============================================================================
   Velorex Music — admin main script
   Used by: vlx-admin-2026.html

   The "framework" layer of the admin panel:
     - adminAuthHeaders()  — replays the admin password as X-Admin-Pass header
     - Last-save badge     — persists the result of the most recent server write
                             so the admin can verify changes were accepted by
                             the server (not just stashed in localStorage).
     - Category helpers    — getCategoryLabel + renderCategorySelectors +
                             addCategory + removeCategory (used by inventory
                             panel + product modals).
     - Auth + layout       — checkAuth, showAdminLayout, handleLogin,
                             handleLogout, window load/storage listeners.
     - Theme toggle        — initTheme, toggleTheme, updateThemeIcon.
     - Sidebar             — toggleAdminSidebar (mobile slide-in drawer).
     - Panel switching     — switchPanel dispatcher (calls per-panel renderers).

   Cross-module touch points (resolved at runtime via script-scope):
     - Storage, escapeHTML                              (loaded earlier)
     - renderProductsTable, renderOrdersTable,
       loadUsersTable                                   (inventory/orders/customers)
     - sessionStorage 'admin_pass'                      (set by handleLogin)
   ============================================================================= */

    // =============================================
    // SECURITY & UTILITIES
    // =============================================

    // =============================================
    // DATA LAYER
    // =============================================

    function adminAuthHeaders() {
      return {
        'Content-Type': 'application/json',
        'X-Admin-Pass': sessionStorage.getItem('admin_pass') || '',
      };
    }

    // =============================================
    // LAST-SAVE STATUS BADGE
    // =============================================
    // Persists the result of the most recent server write so the admin can
    // verify at a glance that their changes were accepted by the server (not
    // just stashed in localStorage). Survives page reloads via localStorage.
    const LAST_SAVE_KEY = 'vv_admin_last_save';

    function recordSaveResult(entry) {
      // entry: { status: 'ok' | 'error', op: string, detail?: string, error?: string }
      var record = {
        at: Date.now(),
        status: entry.status || 'ok',
        op: entry.op || 'save',
        detail: entry.detail || '',
        error: entry.error || ''
      };
      try { localStorage.setItem(LAST_SAVE_KEY, JSON.stringify(record)); } catch (e) {}
      renderLastSaveBadge();
    }

    function getLastSave() {
      try {
        var raw = localStorage.getItem(LAST_SAVE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }

    function relativeTime(ts) {
      var diff = Math.max(0, Date.now() - ts);
      var s = Math.floor(diff / 1000);
      if (s < 30) return 'just now';
      if (s < 60) return s + 's ago';
      var m = Math.floor(s / 60);
      if (m < 60) return m + 'm ago';
      var h = Math.floor(m / 60);
      if (h < 24) return h + 'h ago';
      var d = Math.floor(h / 24);
      if (d < 7) return d + 'd ago';
      return new Date(ts).toLocaleDateString();
    }

    function renderLastSaveBadge() {
      var el = document.getElementById('last-save-badge');
      if (!el) return;
      var r = getLastSave();
      el.classList.remove('is-ok', 'is-err', 'is-empty');
      if (!r) {
        el.classList.add('is-empty');
        el.textContent = '— No saves yet this session';
        el.title = 'Add or edit a product and this badge will show the result of the server save.';
        return;
      }
      var when = relativeTime(r.at);
      var fullTime = new Date(r.at).toLocaleString();
      if (r.status === 'ok') {
        el.classList.add('is-ok');
        el.textContent = '✓ Saved ' + when + (r.detail ? ' · ' + r.detail : '');
        el.title = 'Server confirmed at ' + fullTime + (r.op ? ' (' + r.op + ')' : '');
      } else {
        el.classList.add('is-err');
        el.textContent = '✕ Save FAILED ' + when + ' — ' + (r.error || 'unknown error');
        el.title = 'Attempted at ' + fullTime + (r.op ? ' (' + r.op + ')' : '') + '. ' + (r.error || '');
      }
    }

    // Tick the relative-time label every 30s while the page is open.
    setInterval(function () { renderLastSaveBadge(); }, 30000);


    // =============================================
    // AUTH LOGIC
    // =============================================
    function getCategoryLabel(category) {
      const labels = {
        vinyl: 'Vinyl Record',
        cd: 'Audio CD',
        cassette: 'Cassette',
        bluray: 'Blu-ray',
        dvd: 'DVD'
      };
      return labels[category] || category.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    function renderCategorySelectors() {
      const categories = Storage.getCategories();

      const filterSelect = document.getElementById('adminCatFilter');
      if (filterSelect) {
        filterSelect.innerHTML = '<option value="">All Categories</option>' + categories.map(cat => `
          <option value="${cat}">${getCategoryLabel(cat)}</option>
        `).join('');
      }

      const formSelect = document.getElementById('f-category');
      if (formSelect) {
        formSelect.innerHTML = categories.map(cat => `
          <option value="${cat}">${getCategoryLabel(cat)}</option>
        `).join('');
      }

      const editFormSelect = document.getElementById('e-category');
      if (editFormSelect) {
        editFormSelect.innerHTML = categories.map(cat => `
          <option value="${cat}">${getCategoryLabel(cat)}</option>
        `).join('');
      }

      const categoryList = document.getElementById('admin-category-list');
      if (categoryList) {
        categoryList.innerHTML = categories.map(cat => `
          <span class="category-pill">
            <span>${getCategoryLabel(cat)}</span>
            <button type="button" onclick="removeCategory('${cat}')">×</button>
          </span>
        `).join('');
      }
    }

    function addCategory() {
      const input = document.getElementById('newCategoryInput');
      if (!input) return;
      const value = input.value.trim().toLowerCase();
      if (!value) {
        showToast('Please enter a category name', 'error');
        return;
      }

      const categories = Storage.getCategories();
      if (categories.includes(value)) {
        showToast('Category already exists', 'error');
        return;
      }

      categories.push(value);
      Storage.saveCategories(categories);
      renderCategorySelectors();
      filterAdminProducts();
      input.value = '';
      showToast(`Category "${getCategoryLabel(value)}" added`, 'success');
    }

    function removeCategory(category) {
      const categories = Storage.getCategories().filter(c => c !== category);
      Storage.saveCategories(categories);
      renderCategorySelectors();
      showToast(`Category "${getCategoryLabel(category)}" removed`, 'success');
    }

    function checkAuth() {
      if (sessionStorage.getItem('admin_auth') === 'true') {
        showAdminLayout();
      }
    }

    async function showAdminLayout() {
      const loginScreen = document.getElementById('login-screen');
      const adminLayout = document.getElementById('admin-layout');

      if (!loginScreen || !adminLayout) {
        showToast('❌ Admin UI missing on page', 'danger');
        return;
      }

      loginScreen.style.opacity = '0';
      loginScreen.style.display = 'none';
      adminLayout.style.display = 'grid';

      // Pull latest data from server before rendering anything. Paint
       // skeletons in the destination panel first so the operator sees a
       // loading state during the round-trip rather than blank panels.
      paintPanelSkeleton('dashboard');
      await Storage.syncFromServer();

      try {
        initDashboard();
      } catch (e) {
        console.error(e);
        showToast('❌ Dashboard failed to load (check console)', 'danger');
      }
    }

    function handleLogin(e) {
      console.log('[DEBUG] handleLogin called with event:', e);
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      const user = (document.getElementById('login-user').value || '').trim();
      const pass = (document.getElementById('login-pass').value || '').trim();
      console.log('[DEBUG] User:', user, 'Pass length:', pass.length);

      if (user.toLowerCase() === 'owner' && pass === 'owner123') {
        console.log('[DEBUG] Login credentials valid');
        sessionStorage.setItem('admin_auth', 'true');
        sessionStorage.setItem('admin_pass', pass);
        showToast('✅ Session initialized', 'success');
        showAdminLayout();
      } else {
        console.log('[DEBUG] Login failed - invalid credentials');
        showToast('❌ Access Denied: Invalid Credentials', 'danger');
      }
    }

    function handleLogout() {
      sessionStorage.removeItem('admin_auth');
      sessionStorage.removeItem('admin_pass');
      window.location.reload();
    }

    // Verify functions are accessible
    if (typeof handleLogin !== 'function') {
      console.error('[ERROR] handleLogin is not defined!');
    } else {
      console.log('[INIT] handleLogin function is available');
    }

    // Check on load
    window.addEventListener('load', () => {
      checkAuth();
      initTheme();
    });

    // Refresh orders when store writes new ones (another tab)
    window.addEventListener('storage', function (e) {
      if (e && e.key === 'vv_orders') {
        try { renderOrdersTable(); } catch (ex) {}
      }
    });

    // Robust login binding (avoids relying on inline handlers)
    window.addEventListener('DOMContentLoaded', function () {
      console.log('[INIT] DOMContentLoaded event fired');
      var form = document.getElementById('login-form');
      if (form && !form._bound) {
        form._bound = true;
        // login is handled via button click to avoid submit quirks
      }

      var btn = document.getElementById('login-submit');
      if (btn && !btn._bound) {
        btn._bound = true;
        console.log('[INIT] Attaching click listener to login button');
        btn.addEventListener('click', function (ev) {
          console.log('[CLICK] Login button click detected');
          handleLogin(ev);
        });
      } else {
        console.log('[WARN] Login button not found or already bound');
      }
    });

    // =============================================
    // THEME LOGIC
    // =============================================
    function initTheme() {
      const savedTheme = localStorage.getItem('theme') || 'dark';
      document.documentElement.setAttribute('data-theme', savedTheme);
      updateThemeIcon(savedTheme);
    }

    function toggleTheme() {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      updateThemeIcon(newTheme);
    }

    function updateThemeIcon(theme) {
      const icon = document.querySelector('#themeToggle i');
      if (icon) {
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
      }
    }

    // =============================================
    // UI NAVIGATION
    // =============================================
    // Mobile sidebar toggle. Pass false to force close (used by backdrop +
     // after a nav-link click so the user actually sees the panel they picked).
    function toggleAdminSidebar(force) {
      const sb = document.getElementById('adminSidebar');
      const bd = document.getElementById('sidebarBackdrop');
      if (!sb || !bd) return;
      const open = (force === undefined) ? !sb.classList.contains('open') : !!force;
      sb.classList.toggle('open', open);
      bd.classList.toggle('open', open);
      // Lock body scroll while sidebar is open so the page behind doesn't
      // accidentally scroll under the user's finger.
      document.body.style.overflow = open ? 'hidden' : '';
    }

    async function switchPanel(panelId, el) {
      // Update links
      document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
      if (el) el.classList.add('active');

      // Auto-close the mobile sidebar on selection — the user just picked
      // where to go, no reason to make them swipe it shut.
      toggleAdminSidebar(false);

      // Update panels
      document.querySelectorAll('.panel').forEach(panel => panel.classList.remove('active'));
      const targetPanel = document.getElementById('panel-' + panelId);
      if (targetPanel) targetPanel.classList.add('active');

      // Update header
      const titles = {
        dashboard: { t: 'Inventory Management', s: 'Overview of your music empire' },
        orders: { t: 'Customer Orders', s: 'Track customer purchases and fulfillment' },
        categories: { t: 'Categories', s: 'Manage product categories' },
        users: { t: 'Customer Management', s: 'Search, edit, support and remove customer accounts' },
        settings: { t: 'Store Configuration', s: 'Configure store-wide preferences' }
      };

      const titleEl = document.getElementById('panel-title');
      if (titleEl && titles[panelId]) {
        titleEl.textContent = titles[panelId].t;
      }

      // Paint skeletons in the destination panel BEFORE awaiting the sync.
      // Without this the operator sees stale data from the previous panel
      // render (or the previous switchPanel's leftovers) until the round-
      // trip completes — confusing on a control panel where freshness
      // matters. paintPanelSkeleton is a no-op for panels that don't fetch
      // (categories, settings).
      paintPanelSkeleton(panelId);

      // Pull latest stock/orders from the server so quantities reflect customer
      // purchases made by other users since the admin opened the panel.
      if (panelId === 'dashboard' || panelId === 'orders') {
        await Storage.syncFromServer();
      }

      // Use initDashboard (not renderProductsTable alone) so the stat card +
      // recent-products list also refresh — paintPanelSkeleton above filled
      // both with skeletons, so we need a renderer that clears them.
      if (panelId === 'dashboard') initDashboard();
      if (panelId === 'orders') renderOrdersTable();
      if (panelId === 'users') loadUsersTable();
    }

    // Paint skeleton placeholders into the loading-aware containers of the
    // given panel. Called before any fetch that re-renders panel content so
    // operators see "data refreshing" feedback instead of stale rows.
    function paintPanelSkeleton(panelId) {
      if (panelId === 'dashboard') {
        const stat = document.getElementById('stat-total-products');
        if (stat) stat.innerHTML = Skeleton.inlineLine('2rem');
        const recent = document.getElementById('recent-products-list');
        if (recent) recent.innerHTML = Skeleton.tableRows(5, 4);
        const products = document.getElementById('admin-products-table');
        if (products) products.innerHTML = Skeleton.tableRows(5, 7);
      } else if (panelId === 'orders') {
        const tbody = document.getElementById('orders-table-body');
        if (tbody) tbody.innerHTML = Skeleton.tableRows(5, 8);
      } else if (panelId === 'users') {
        const tbody = document.getElementById('admin-users-table');
        if (tbody) tbody.innerHTML = Skeleton.tableRows(5, 8);
      }
      // categories + settings panels have no async fetch — no skeleton needed.
    }
