/* =============================================================================
   Velorex Music — router + chrome (storefront)
   Used by: index.html

   The framework layer of the storefront:
     - Navbar + footer renderers (injectNavbar, injectFooter)
     - Mobile-nav + theme toggles (toggleMobileNav, toggleTheme, initTheme,
       updateThemeIcon)
     - Hash-based router (buildPageUrl, parsePageFromUrl, navigate,
       updateBreadcrumbs, initPage dispatcher)
     - SPA state vars (currentPage, currentParams, _detailQty, _detailMax,
       CURRENT_USER_ORDERS) — top-level so per-page modules can read/write.

   Cross-module touch points (resolved at runtime via script-scope):
     - Auth, CartHelpers                          (loaded earlier)
     - initPageXxx + handleCustomerLogout         (in pages.js + checkout.js)
   ============================================================================= */

    function injectNavbar(activePage = '') {
      const nav = document.getElementById('navbar-placeholder'); if (!nav) return;
      const isAdmin = activePage === 'admin';
      nav.innerHTML = `
      <nav class="navbar">
        <a href="#" onclick="navigate('index'); return false;" class="navbar-brand">
          <div class="logo-icon"><i class="fas fa-music"></i></div>
          <span class="brand-name">Velorex Music</span>
          ${isAdmin ? '<span style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em;margin-left:0.5rem;border-left:1px solid var(--border);padding-left:0.5rem;">Admin</span>' : ''}
        </a>
        <ul class="navbar-nav" id="mainNav">
          ${isAdmin ? `
            <li class="nav-item"><a href="#" onclick="navigate('index'); return false;" class="nav-link"><i class="fas fa-house"></i> View Store</a></li>
            <li class="nav-item"><span class="nav-link active">Admin Dashboard</span></li>
          ` : `
            <li class="nav-item"><a href="#" onclick="navigate('index'); return false;" class="nav-link ${activePage === 'home' ? 'active' : ''}">Home</a></li>
            <li class="nav-item">
              <a href="#" onclick="navigate('products', {cat:'vinyl'}); return false;" class="nav-link ${activePage === 'vinyl' ? 'active' : ''}">
                Vinyl <span class="arrow"><i class="fas fa-chevron-down" style="font-size:0.7rem;"></i></span>
              </a>
              <div class="dropdown-menu">
                <a href="#" onclick="navigate('products', {cat:'vinyl', lang:'hindi'}); return false;" class="dropdown-item"><i class="fas fa-globe"></i> Hindi Vinyl</a>
                <a href="#" onclick="navigate('products', {cat:'vinyl', lang:'english'}); return false;" class="dropdown-item"><i class="fas fa-earth-americas"></i> English Vinyl</a>
                <div class="dropdown-divider"></div>
                <a href="#" onclick="navigate('products', {cat:'vinyl'}); return false;" class="dropdown-item">All Vinyl</a>
              </div>
            </li>
            <li class="nav-item"><a href="#" onclick="navigate('products', {cat:'cd'}); return false;" class="nav-link ${activePage === 'cd' ? 'active' : ''}">Audio CDs</a></li>
            <li class="nav-item"><a href="#" onclick="navigate('products', {cat:'cassette'}); return false;" class="nav-link ${activePage === 'cassette' ? 'active' : ''}">Cassettes</a></li>
            <li class="nav-item"><a href="#" onclick="navigate('products', {cat:'bluray'}); return false;" class="nav-link ${activePage === 'bluray' ? 'active' : ''}">Blu-rays</a></li>
            <li class="nav-item"><a href="#" onclick="navigate('products', {cat:'dvd'}); return false;" class="nav-link ${activePage === 'dvd' ? 'active' : ''}">DVDs</a></li>
            <li class="nav-item"><a href="#" onclick="navigate('products'); return false;" class="nav-link ${activePage === 'products' ? 'active' : ''}">All Products</a></li>
          `}
        </ul>
        ${isAdmin ? '' : `<div class="navbar-search"><span class="search-icon"><i class="fas fa-magnifying-glass"></i></span><input type="text" id="globalSearch" placeholder="Search albums, artists..." autocomplete="off"></div>`}
        <div class="navbar-actions">
          ${isAdmin ? '' : `<a href="#" onclick="navigate('cart'); return false;" class="nav-action-btn"><i class="fas fa-shopping-cart"></i><span class="cart-badge" id="cartBadge"></span></a>`}
          <button class="nav-action-btn" id="themeToggle" onclick="toggleTheme()" title="Toggle Theme"><i class="fas fa-moon"></i></button>
          ${Auth.isLoggedIn()
            ? `<a href="#" onclick="navigate('profile'); return false;" class="nav-action-btn" title="My Profile"><i class="fas fa-user"></i></a>
               <a href="#" onclick="handleCustomerLogout(); return false;" class="nav-action-btn" title="Sign out"><i class="fas fa-right-from-bracket"></i></a>`
            : `<a href="#" onclick="navigate('login'); return false;" class="nav-action-btn" title="Sign in"><i class="fas fa-right-to-bracket"></i></a>`}
          <div class="hamburger" id="hamburger" onclick="toggleMobileNav()"><span></span><span></span><span></span></div>
        </div>
      </nav>`;
      CartHelpers.updateBadge();
      const searchInput = document.getElementById('globalSearch');
      if (searchInput) {
        searchInput.value = currentParams && currentParams.search ? currentParams.search : '';
        searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && searchInput.value.trim()) navigate('products', { search: searchInput.value.trim() }); });
      }
    }

    function toggleMobileNav() { const nav = document.getElementById('mainNav'); nav.classList.toggle('mobile-open'); }

    function injectFooter() {
      const footer = document.getElementById('footer-placeholder'); if (!footer) return;
      footer.innerHTML = `
      <footer class="footer">
        <div class="container">
          <div class="footer-grid">
            <div class="footer-brand">
              <span class="brand-name"><i class="fas fa-music"></i> Velorex Music</span>
              <p class="footer-desc">Your ultimate destination for premium vinyl records, audio CDs, and cassettes. Curated collections spanning Hindi & English music across all genres.</p>
              <div class="social-links">
                <a href="https://www.facebook.com/share/1H7s3i2jui/" class="social-link" target="_blank"><i class="fab fa-facebook"></i></a>
                <a href="https://instagram.com/vinyl_cassettes_audio_deal" class="social-link" target="_blank"><i class="fab fa-instagram"></i></a>
                <a href="https://whatsapp.com/channel/0029Va6LNYy4yltVj40o1I3i" class="social-link" target="_blank"><i class="fab fa-whatsapp"></i></a>
                <a href="https://youtube.com/channel/UCtUtHqlTQk6jQ-_g4DyB48g" class="social-link" target="_blank"><i class="fab fa-youtube"></i></a>
              </div>
            </div>
            <div>
              <p class="footer-col-title">Shop</p>
              <div class="footer-links">
                <a href="#" onclick="navigate('products', {cat:'vinyl'}); return false;" class="footer-link">Vinyl Records</a>
                <a href="#" onclick="navigate('products', {cat:'cd'}); return false;" class="footer-link">Audio CDs</a>
                <a href="#" onclick="navigate('products', {cat:'cassette'}); return false;" class="footer-link">Cassettes</a>
                <a href="#" onclick="navigate('products', {cat:'bluray'}); return false;" class="footer-link">Blu-rays</a>
                <a href="#" onclick="navigate('products', {cat:'dvd'}); return false;" class="footer-link">DVDs</a>
                <a href="#" onclick="navigate('products', {lang:'hindi'}); return false;" class="footer-link">Hindi Music</a>
                <a href="#" onclick="navigate('products', {lang:'english'}); return false;" class="footer-link">English Music</a>
              </div>
            </div>
            <div>
              <p class="footer-col-title">Account</p>
              <div class="footer-links">
                <a href="#" onclick="navigate('profile'); return false;" class="footer-link">My Profile</a>
                <a href="#" onclick="navigate('cart'); return false;" class="footer-link">Cart</a>
                <a href="#" onclick="navigate('profile'); return false;" class="footer-link">Order History</a>
              </div>
            </div>
            <div>
              <p class="footer-col-title">Help</p>
              <div class="footer-links">
                <a href="shipping.html" class="footer-link">Shipping Policy</a>
                <a href="returns.html" class="footer-link">Returns & Refunds</a>
                <a href="track-order.html" class="footer-link">Track Order</a>
                <a href="contact.html" class="footer-link">Contact Us</a>
                <a href="faq.html" class="footer-link">FAQ</a>
              </div>
            </div>
          </div>
          <div class="footer-bottom">
            <p>© ${new Date().getFullYear()} Velorex Music. All rights reserved.</p>
            <p>Made with 🎵 for music lovers</p>
          </div>
        </div>
      </footer>`;
    }

    document.addEventListener('DOMContentLoaded', () => { CartHelpers.updateBadge(); initTheme(); });

    function initTheme() {
      const t = localStorage.getItem('theme') || 'dark';
      document.documentElement.setAttribute('data-theme', t);
      updateThemeIcon(t);
    }
    function toggleTheme() {
      const cur = document.documentElement.getAttribute('data-theme'), next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      updateThemeIcon(next);
    }
    function updateThemeIcon(theme) {
      const icon = document.querySelector('#themeToggle i');
      if (icon) icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }

    // =============================================
    // SPA ROUTER
    // =============================================
    var currentPage = 'index', _detailQty = 1, _detailMax = 1, currentParams = {};

    // Orders are loaded from the server (see initPageProfile / filterOrders).
    var CURRENT_USER_ORDERS = [];

    function buildPageUrl(page, params) {
      params = params || {};
      var keys = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '');
      if (page === 'index' && keys.length === 0) return window.location.pathname + window.location.search;
      var hash = page;
      if (keys.length) { var s = new URLSearchParams(); keys.forEach(k => s.set(k, params[k])); hash += '?' + s.toString(); }
      return window.location.pathname + window.location.search + '#' + hash;
    }

    function parsePageFromUrl() {
      var hash = window.location.hash.slice(1);
      if (!hash) return { page: 'index', params: {} };
      var parts = hash.split('?'), page = parts[0] || 'index', params = {};
      if (parts[1]) { var sp = new URLSearchParams(parts[1]); sp.forEach((v, k) => { params[k] = k === 'id' ? parseInt(v, 10) || v : v; }); }
      return { page, params };
    }

    function navigate(page, params, options) {
      options = options || {};
      currentPage = page; currentParams = params || {};
      document.querySelectorAll('.page-section').forEach(p => p.style.display = 'none');
      var el = document.getElementById('page-' + page);
      if (el) { el.style.display = 'block'; window.scrollTo(0, 0); }
      updateBreadcrumbs(page, params);
      var highlightPage = page;
      if (page === 'products' && params && params.cat) highlightPage = params.cat;
      injectNavbar(highlightPage);
      var mobileNav = document.getElementById('mainNav');
      if (mobileNav) mobileNav.classList.remove('mobile-open');
      initPage(page, params);
      const footer = document.querySelector('.footer');
      if (footer) footer.style.display = 'block';
      if (options.pushState !== false) {
        var url = buildPageUrl(page, params);
        if (options.replace) window.history.replaceState({ page, params }, '', url);
        else window.history.pushState({ page, params }, '', url);
      }
    }

    window.addEventListener('popstate', function(event) {
      var state = event.state;
      if (state && state.page) navigate(state.page, state.params, { pushState: false });
      else { var parsed = parsePageFromUrl(); navigate(parsed.page, parsed.params, { pushState: false }); }
    });

    function updateBreadcrumbs(page, params) {
      const container = document.querySelector('.breadcrumbs-container'), list = document.getElementById('breadcrumb-list');
      if (!container || !list) return;
      if (page === 'index') { container.style.display = 'none'; return; }
      container.style.display = 'block';
      let items = [{ name: 'Home', link: 'index' }];
      if (page === 'products') {
        if (params && params.cat) {
          items.push({ name: params.cat.toUpperCase(), link: 'products?cat=' + params.cat });
          if (params.lang) items.push({ name: params.lang.toUpperCase(), active: true });
          else items[items.length - 1].active = true;
        } else items.push({ name: 'All Products', active: true });
      } else if (page === 'product') { items.push({ name: 'Products', link: 'products' }); items.push({ name: 'Details', active: true }); }
      else if (page === 'cart') items.push({ name: 'Shopping Cart', active: true });
      else if (page === 'profile') items.push({ name: 'My Profile', active: true });
      else items.push({ name: page.charAt(0).toUpperCase() + page.slice(1), active: true });
      list.innerHTML = items.map(item => `<li class="breadcrumb-item ${item.active ? 'active' : ''}">${item.active ? item.name : `<a href="#" onclick="navigate('${item.link}'); return false;">${item.name}</a>`}</li>`).join('');
    }

    function initPage(page, params) {
      if (page === 'index') initPageIndex();
      else if (page === 'products') initPageProducts(params);
      else if (page === 'product') initPageProduct(params);
      else if (page === 'cart') initPageCart();
      else if (page === 'profile') initPageProfile();
      else if (page === 'login') initPageLogin();
      else if (page === 'signup') initPageSignup();
      else if (page === 'forgot') { /* static page, nothing to init */ }
    }
