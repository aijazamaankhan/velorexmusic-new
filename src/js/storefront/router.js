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

    // Real hrefs everywhere, with onclick for the SPA transition.
    //
    // Every link below used to be href="#". That made the whole catalogue
    // undiscoverable: a crawler follows <a href>, it does not synthesise clicks
    // to fire onclick handlers. With real paths the crawler can walk
    // home → category → product, and internal link equity actually flows.
    // The onclick still returns false, so users get the SPA transition and
    // never a full page load — but middle-click and "open in new tab" now work
    // too, which they previously did not.
    const P = (page, params) => Seo.buildPath(page, params);

    function injectNavbar(activePage = '') {
      const nav = document.getElementById('navbar-placeholder'); if (!nav) return;
      const isAdmin = activePage === 'admin';
      nav.innerHTML = `
      <nav class="navbar">
        <a href="/" onclick="navigate('index'); return false;" class="navbar-brand">
          <!-- Full brand lockup (mark + wordmark), in both theme variants.
               Which one shows is decided in CSS by [data-theme]; the other is
               display:none, which also removes it from the accessibility tree,
               so the duplicate alt text is never announced twice.
               These are the designer's PNG exports, NOT the SVG masters — the
               masters set the wordmark as live <text> in Aktiv Grotesk and
               Poppins, fonts no browser has. See src/img/README.md. -->
          <img src="/src/img/logo-lockup-dark.png" class="brand-lockup brand-lockup-dark" alt="Velorex Music" width="760" height="216">
          <img src="/src/img/logo-lockup-light.png" class="brand-lockup brand-lockup-light" alt="Velorex Music" width="760" height="215">
          ${isAdmin ? '<span style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em;margin-left:0.5rem;border-left:1px solid var(--border);padding-left:0.5rem;">Admin</span>' : ''}
        </a>
        <ul class="navbar-nav" id="mainNav">
          ${isAdmin ? `
            <li class="nav-item"><a href="/" onclick="navigate('index'); return false;" class="nav-link"><i class="fas fa-house"></i> View Store</a></li>
            <li class="nav-item"><span class="nav-link active">Admin Dashboard</span></li>
          ` : `
            <li class="nav-item"><a href="/" onclick="navigate('index'); return false;" class="nav-link ${activePage === 'home' ? 'active' : ''}">Home</a></li>
            <!-- All five music formats live under one dropdown. They used to be
                 six separate top-level items, which together with the two new
                 departments overflowed the navbar at 1280px and pushed the
                 search box, cart and sign-in off screen entirely. Grouping them
                 is also the truer structure now that the shop sells things that
                 are not music formats. Every link is still a real <a href> in
                 the DOM, so nothing became less crawlable. -->
            <li class="nav-item">
              <a href="/products" onclick="navigate('products'); return false;" class="nav-link ${['vinyl','cd','cassette','bluray','dvd','products'].indexOf(activePage) !== -1 ? 'active' : ''}">
                Music <span class="arrow"><i class="fas fa-chevron-down" style="font-size:0.7rem;"></i></span>
              </a>
              <div class="dropdown-menu dropdown-menu-tall">
                <a href="${P('products', {cat:'vinyl'})}" onclick="navigate('products', {cat:'vinyl'}); return false;" class="dropdown-item">Vinyl Records</a>
                <a href="${P('products', {cat:'vinyl', lang:'hindi'})}" onclick="navigate('products', {cat:'vinyl', lang:'hindi'}); return false;" class="dropdown-item dropdown-item-sub">Hindi Vinyl</a>
                <a href="${P('products', {cat:'vinyl', lang:'english'})}" onclick="navigate('products', {cat:'vinyl', lang:'english'}); return false;" class="dropdown-item dropdown-item-sub">English Vinyl</a>
                <a href="${P('products', {cat:'cd'})}" onclick="navigate('products', {cat:'cd'}); return false;" class="dropdown-item">Audio CDs</a>
                <a href="${P('products', {cat:'cassette'})}" onclick="navigate('products', {cat:'cassette'}); return false;" class="dropdown-item">Cassettes</a>
                <a href="${P('products', {cat:'bluray'})}" onclick="navigate('products', {cat:'bluray'}); return false;" class="dropdown-item">Blu-ray Movies</a>
                <a href="${P('products', {cat:'dvd'})}" onclick="navigate('products', {cat:'dvd'}); return false;" class="dropdown-item">DVD Movies</a>
                <div class="dropdown-divider"></div>
                <a href="/combos" onclick="navigate('combos'); return false;" class="dropdown-item">🎁 Combo Offers</a>
                <a href="/products" onclick="navigate('products'); return false;" class="dropdown-item">All Products</a>
              </div>
            </li>
            <li class="nav-item">
              <a href="${P('products', {cat:'merchandise'})}" onclick="navigate('products', {cat:'merchandise'}); return false;" class="nav-link ${activePage === 'merchandise' ? 'active' : ''}">
                👕 Merchandise <span class="arrow"><i class="fas fa-chevron-down" style="font-size:0.7rem;"></i></span>
              </a>
              <div class="dropdown-menu dropdown-menu-tall">
                <a href="${P('products', {cat:'merchandise', sub:'t-shirts'})}" onclick="navigate('products', {cat:'merchandise', sub:'t-shirts'}); return false;" class="dropdown-item">T-Shirts</a>
                <a href="${P('products', {cat:'merchandise', sub:'hoodies'})}" onclick="navigate('products', {cat:'merchandise', sub:'hoodies'}); return false;" class="dropdown-item">Hoodies</a>
                <a href="${P('products', {cat:'merchandise', sub:'caps'})}" onclick="navigate('products', {cat:'merchandise', sub:'caps'}); return false;" class="dropdown-item">Caps</a>
                <a href="${P('products', {cat:'merchandise', sub:'tote-bags'})}" onclick="navigate('products', {cat:'merchandise', sub:'tote-bags'}); return false;" class="dropdown-item">Tote Bags</a>
                <a href="${P('products', {cat:'merchandise', sub:'posters'})}" onclick="navigate('products', {cat:'merchandise', sub:'posters'}); return false;" class="dropdown-item">Posters</a>
                <a href="${P('products', {cat:'merchandise', sub:'stickers'})}" onclick="navigate('products', {cat:'merchandise', sub:'stickers'}); return false;" class="dropdown-item">Stickers</a>
                <a href="${P('products', {cat:'merchandise', sub:'mugs'})}" onclick="navigate('products', {cat:'merchandise', sub:'mugs'}); return false;" class="dropdown-item">Mugs</a>
                <a href="${P('products', {cat:'merchandise', sub:'keychains'})}" onclick="navigate('products', {cat:'merchandise', sub:'keychains'}); return false;" class="dropdown-item">Keychains</a>
                <a href="${P('products', {cat:'merchandise', sub:'slipmats'})}" onclick="navigate('products', {cat:'merchandise', sub:'slipmats'}); return false;" class="dropdown-item">Slipmats</a>
                <div class="dropdown-divider"></div>
                <a href="${P('products', {cat:'merchandise'})}" onclick="navigate('products', {cat:'merchandise'}); return false;" class="dropdown-item">All Merchandise</a>
              </div>
            </li>
            <li class="nav-item">
              <a href="${P('products', {cat:'vinyl-care'})}" onclick="navigate('products', {cat:'vinyl-care'}); return false;" class="nav-link ${activePage === 'vinyl-care' ? 'active' : ''}">
                💿 Vinyl Care <span class="arrow"><i class="fas fa-chevron-down" style="font-size:0.7rem;"></i></span>
              </a>
              <div class="dropdown-menu dropdown-menu-tall">
                <a href="${P('products', {cat:'vinyl-care', sub:'record-cleaning-brush'})}" onclick="navigate('products', {cat:'vinyl-care', sub:'record-cleaning-brush'}); return false;" class="dropdown-item">Record Cleaning Brush</a>
                <a href="${P('products', {cat:'vinyl-care', sub:'carbon-fiber-brush'})}" onclick="navigate('products', {cat:'vinyl-care', sub:'carbon-fiber-brush'}); return false;" class="dropdown-item">Carbon Fiber Brush</a>
                <a href="${P('products', {cat:'vinyl-care', sub:'record-cleaning-solution'})}" onclick="navigate('products', {cat:'vinyl-care', sub:'record-cleaning-solution'}); return false;" class="dropdown-item">Record Cleaning Solution</a>
                <a href="${P('products', {cat:'vinyl-care', sub:'microfiber-cloth'})}" onclick="navigate('products', {cat:'vinyl-care', sub:'microfiber-cloth'}); return false;" class="dropdown-item">Microfiber Cloth</a>
                <a href="${P('products', {cat:'vinyl-care', sub:'anti-static-inner-sleeves'})}" onclick="navigate('products', {cat:'vinyl-care', sub:'anti-static-inner-sleeves'}); return false;" class="dropdown-item">Anti-Static Inner Sleeves</a>
                <a href="${P('products', {cat:'vinyl-care', sub:'outer-protective-sleeves'})}" onclick="navigate('products', {cat:'vinyl-care', sub:'outer-protective-sleeves'}); return false;" class="dropdown-item">Outer Protective Sleeves</a>
                <a href="${P('products', {cat:'vinyl-care', sub:'vinyl-storage-boxes'})}" onclick="navigate('products', {cat:'vinyl-care', sub:'vinyl-storage-boxes'}); return false;" class="dropdown-item">Vinyl Storage Boxes</a>
                <a href="${P('products', {cat:'vinyl-care', sub:'stylus-cleaning-gel'})}" onclick="navigate('products', {cat:'vinyl-care', sub:'stylus-cleaning-gel'}); return false;" class="dropdown-item">Stylus Cleaning Gel / Brush</a>
                <a href="${P('products', {cat:'vinyl-care', sub:'turntable-slipmats'})}" onclick="navigate('products', {cat:'vinyl-care', sub:'turntable-slipmats'}); return false;" class="dropdown-item">Turntable Slipmats</a>
                <a href="${P('products', {cat:'vinyl-care', sub:'record-weight-clamp'})}" onclick="navigate('products', {cat:'vinyl-care', sub:'record-weight-clamp'}); return false;" class="dropdown-item">Record Weight / Clamp</a>
                <div class="dropdown-divider"></div>
                <a href="${P('products', {cat:'vinyl-care'})}" onclick="navigate('products', {cat:'vinyl-care'}); return false;" class="dropdown-item">All Vinyl Care</a>
              </div>
            </li>
            <li class="nav-item"><a href="/combos" onclick="navigate('combos'); return false;" class="nav-link ${activePage === 'combos' ? 'active' : ''}">Combos</a></li>
            <li class="nav-item"><a href="/pre-owned" onclick="navigate('preowned'); return false;" class="nav-link ${activePage === 'preowned' ? 'active' : ''}">Pre-owned</a></li>
            <li class="nav-item"><a href="/blog" onclick="navigate('blog'); return false;" class="nav-link ${activePage === 'blog' || activePage === 'blog-post' ? 'active' : ''}">Blog</a></li>
          `}
        </ul>
        ${isAdmin ? '' : `<div class="navbar-search"><span class="search-icon"><i class="fas fa-magnifying-glass"></i></span><input type="text" id="globalSearch" placeholder="Search albums, artists..." autocomplete="off"></div>`}
        <div class="navbar-actions">
          ${isAdmin ? '' : `<a href="/cart" rel="nofollow" onclick="navigate('cart'); return false;" class="nav-action-btn"><i class="fas fa-shopping-cart"></i><span class="cart-badge" id="cartBadge"></span></a>`}
          <button class="nav-action-btn" id="themeToggle" onclick="toggleTheme()" title="Toggle Theme"><i class="fas fa-moon"></i></button>
          ${Auth.isLoggedIn()
            ? `<a href="/profile" rel="nofollow" onclick="navigate('profile'); return false;" class="nav-action-btn" title="My Profile"><i class="fas fa-user"></i></a>
               <a href="#" rel="nofollow" onclick="handleCustomerLogout(); return false;" class="nav-action-btn" title="Sign out"><i class="fas fa-right-from-bracket"></i></a>`
            : `<a href="/login" rel="nofollow" onclick="navigate('login'); return false;" class="nav-action-btn" title="Sign in"><i class="fas fa-right-to-bracket"></i></a>`}
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
              <!-- Theme-aware, same as the navbar. The footer uses var(--surface),
                   which is #1a1a2e in the dark theme but #ffffff in the light one —
                   so a white-wordmark lockup alone would be invisible on light. -->
              <img src="/src/img/logo-lockup-dark.png" class="footer-lockup brand-lockup-dark" alt="Velorex Music" width="760" height="216">
              <img src="/src/img/logo-lockup-light.png" class="footer-lockup brand-lockup-light" alt="Velorex Music" width="760" height="215">
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
                <a href="${P('products', {cat:'vinyl'})}" onclick="navigate('products', {cat:'vinyl'}); return false;" class="footer-link">Vinyl Records</a>
                <a href="${P('products', {cat:'cd'})}" onclick="navigate('products', {cat:'cd'}); return false;" class="footer-link">Audio CDs</a>
                <a href="${P('products', {cat:'cassette'})}" onclick="navigate('products', {cat:'cassette'}); return false;" class="footer-link">Cassettes</a>
                <a href="${P('products', {cat:'bluray'})}" onclick="navigate('products', {cat:'bluray'}); return false;" class="footer-link">Blu-rays</a>
                <a href="${P('products', {cat:'dvd'})}" onclick="navigate('products', {cat:'dvd'}); return false;" class="footer-link">DVDs</a>
                <a href="${P('products', {cat:'vinyl', lang:'hindi'})}" onclick="navigate('products', {cat:'vinyl', lang:'hindi'}); return false;" class="footer-link">Hindi Vinyl</a>
                <a href="${P('products', {cat:'vinyl', lang:'english'})}" onclick="navigate('products', {cat:'vinyl', lang:'english'}); return false;" class="footer-link">English Vinyl</a>
              </div>
            </div>
            <div>
              <p class="footer-col-title">Account</p>
              <div class="footer-links">
                <a href="/profile" rel="nofollow" onclick="navigate('profile'); return false;" class="footer-link">My Profile</a>
                <a href="/cart" rel="nofollow" onclick="navigate('cart'); return false;" class="footer-link">Cart</a>
                <a href="/profile" rel="nofollow" onclick="navigate('profile'); return false;" class="footer-link">Order History</a>
              </div>
            </div>
            <div>
              <p class="footer-col-title">Help</p>
              <div class="footer-links">
                <a href="/combos" onclick="navigate('combos'); return false;" class="footer-link">Combo Offers</a>
                <a href="${P('preowned', {})}" onclick="navigate('preowned'); return false;" class="footer-link">Pre-owned</a>
                <a href="/blog" onclick="navigate('blog'); return false;" class="footer-link">Blog</a>
                <a href="/shipping.html" class="footer-link">Shipping Policy</a>
                <a href="/returns.html" class="footer-link">Returns &amp; Refunds</a>
                <a href="/track-order.html" rel="nofollow" class="footer-link">Track Order</a>
                <a href="/contact.html" class="footer-link">Contact Us</a>
                <a href="/faq.html" class="footer-link">FAQ</a>
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

    // =============================================
    // ANALYTICS — SPA PAGE VIEWS
    // =============================================
    // The gtag snippet in index.html sends ONE page_view when the document
    // loads. After that the storefront never loads another document — every
    // category, product, blog post and cart view is a History API pushState.
    //
    // MEASURED, not assumed. Two control runs with this hook disabled recorded
    // 0/3 and 1/3 navigations respectively — GA4's "page changes based on
    // browser history events" fires unreliably here, so leaning on it alone
    // loses most of the site's traffic. With this hook, every navigation is
    // recorded.
    //
    // The first call is skipped because the gtag config already covered the
    // initial document load; counting it here too would double it.
    //
    // >>> ONE SETTING TO CHANGE IN GA4 <<<
    // Admin → Data Streams → (your stream) → Enhanced measurement → turn OFF
    // "Page changes based on browser history events". GA occasionally fires its
    // own page_view for a pushState in addition to this one, which inflates the
    // count. Turning it off makes this hook the single source of page views.
    // Its own events are identifiable in the network tab: they carry `dl` but
    // no `dp`, whereas this hook always sends `dp`.
    var gaFirstViewSkipped = false;

    function trackPageView() {
      if (typeof window.gtag !== 'function') return;   // tag blocked or not loaded
      if (!gaFirstViewSkipped) { gaFirstViewSkipped = true; return; }
      window.gtag('event', 'page_view', {
        page_title: document.title,
        page_location: window.location.href,
        page_path: window.location.pathname + window.location.search,
      });
    }

    // =============================================
    // INTRO SPLASH
    // =============================================
    // A brand moment on first load. Deliberately constrained, because a
    // full-screen overlay on arrival is precisely what Google treats as an
    // intrusive interstitial — a documented mobile ranking negative:
    //
    //   • HOMEPAGE ONLY. Product, category and blog URLs are the pages people
    //     land on from search, and they never see this. That is the single most
    //     important guard here — do not relax it.
    //   • ONCE PER SESSION, so browsing the shop is not interrupted repeatedly.
    //   • Dismissed by literally any interaction, and auto-dismissed on a timer
    //     so it can never trap someone.
    //   • Added by JS to markup that ships hidden, so a non-executing crawler
    //     sees the page with no overlay at all.
    var SPLASH_KEY = 'vv_splash_seen';
    var splashTimer = null;

    function initSplash(page) {
      var el = document.getElementById('intro-splash');
      if (!el) return;
      if (page !== 'index') return;                       // search landing pages: never
      // A reload or an in-session revisit should not replay it.
      try { if (sessionStorage.getItem(SPLASH_KEY)) return; } catch (e) { return; }
      // Someone arriving deep-linked with a hash or query is going somewhere
      // specific; do not put a curtain in front of them.
      if (window.location.search || window.location.hash) return;

      try { sessionStorage.setItem(SPLASH_KEY, '1'); } catch (e) { /* private mode */ }

      el.hidden = false;
      el.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';

      ['click', 'touchstart', 'keydown', 'wheel'].forEach(function (evt) {
        el.addEventListener(evt, closeSplash, { once: true, passive: true });
      });
      // Failsafe: if an event handler never fires for any reason, the overlay
      // still goes away rather than leaving the shop unreachable.
      splashTimer = setTimeout(closeSplash, 6000);

      var btn = document.getElementById('intro-splash-enter');
      if (btn) setTimeout(function () { try { btn.focus(); } catch (e) {} }, 400);
    }

    function closeSplash() {
      var el = document.getElementById('intro-splash');
      if (!el || el.hidden) return;
      if (splashTimer) { clearTimeout(splashTimer); splashTimer = null; }
      el.classList.add('is-closing');
      document.body.style.overflow = '';
      setTimeout(function () {
        el.hidden = true;
        el.setAttribute('aria-hidden', 'true');
        el.classList.remove('is-closing');
      }, 420);
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

    // URLs are now real paths (/vinyl-records, /product/12-sholay-rd-burman)
    // rather than hash fragments. The hash form is never generated any more,
    // but parsePageFromUrl still understands it — see the back-compat note
    // there. Path vocabulary lives in src/js/seo.js so the server-side
    // renderer and the client agree on exactly one canonical URL per view.
    function buildPageUrl(page, params) {
      return Seo.buildPath(page, params);
    }

    function parsePageFromUrl() {
      var hash = window.location.hash.slice(1);
      var fromPath = Seo.parsePath(window.location.pathname, window.location.search);

      // Legacy hash URLs — "#product?id=12" was the only URL form this site
      // had before the SEO migration, so bookmarks, WhatsApp shares and any
      // already-indexed links still arrive that way. They always look like
      // "/#product?id=12": the PATH is the bare root, which Seo.parsePath
      // quite correctly resolves to the homepage. Checking the path first
      // would therefore swallow every legacy link and dump the visitor on the
      // homepage, so the hash wins whenever the path carries no view of its
      // own. The bootstrap then replaceState()s it onto the canonical path,
      // so the old form never lingers in the address bar or gets re-shared.
      if (hash && (!fromPath || fromPath.page === 'index')) {
        var parts = hash.split('?'), page = parts[0] || 'index', params = {};
        if (parts[1]) { var sp = new URLSearchParams(parts[1]); sp.forEach((v, k) => { params[k] = k === 'id' ? parseInt(v, 10) || v : v; }); }
        return { page, params };
      }

      if (fromPath) return fromPath;
      return { page: 'index', params: {} };
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
      // Keep <title>, meta description, canonical and robots in step with the
      // view. A JS-rendering crawler reads these AFTER scripts run, so stale
      // tags here mean every SPA view gets indexed under the homepage's title.
      try { Seo.update(page, params); } catch (e) { console.warn('SEO tag update failed:', e); }
      // Analytics must be told about the view AFTER Seo.update, so the title
      // and canonical it reports describe the page the visitor actually landed
      // on rather than the one they just left.
      try { trackPageView(); } catch (e) { console.warn('analytics page_view failed:', e); }
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

    // Breadcrumbs carry each crumb as a {page, params} pair rather than a
    // pre-joined string. The previous form emitted navigate('products?cat=vinyl'),
    // which looked for a DOM node with id "page-products?cat=vinyl" and silently
    // did nothing when clicked.
    //
    // These now render real hrefs, and their labels mirror the BreadcrumbList
    // JSON-LD emitted by seo-render.php — Google cross-checks visible
    // breadcrumbs against the structured data before showing the breadcrumb
    // trail in place of a raw URL in results.
    const CAT_LABELS = {
      vinyl: 'Vinyl Records', cd: 'Audio CDs', cassette: 'Cassettes',
      bluray: 'Blu-ray Movies', dvd: 'DVD Movies',
      merchandise: 'Merchandise', 'vinyl-care': 'Vinyl Care'
    };
    const LANG_LABELS = { hindi: 'Hindi', english: 'English' };

    function updateBreadcrumbs(page, params) {
      const container = document.querySelector('.breadcrumbs-container'), list = document.getElementById('breadcrumb-list');
      if (!container || !list) return;
      if (page === 'index') { container.style.display = 'none'; return; }
      container.style.display = 'block';
      params = params || {};

      let items = [{ name: 'Home', page: 'index', params: {} }];
      if (page === 'products') {
        if (params.cat) {
          const catName = CAT_LABELS[params.cat] || params.cat.toUpperCase();
          items.push({ name: catName, page: 'products', params: { cat: params.cat } });
          if (params.lang && LANG_LABELS[params.lang]) {
            items.push({ name: LANG_LABELS[params.lang], active: true });
          } else {
            items[items.length - 1].active = true;
          }
        } else items.push({ name: 'All Products', active: true });
      } else if (page === 'product') {
        items.push({ name: 'All Products', page: 'products', params: {} });
        const title = (document.getElementById('detail-title') || {}).textContent;
        items.push({ name: title && title !== 'Product Details' ? title : 'Details', active: true });
      }
      else if (page === 'preowned') {
        if (params.cat) {
          items.push({ name: 'Pre-owned', page: 'preowned', params: {} });
          items.push({ name: CAT_LABELS[params.cat] || params.cat, active: true });
        } else items.push({ name: 'Pre-owned', active: true });
      }
      else if (page === 'combos') items.push({ name: 'Combo Offers', active: true });
      else if (page === 'combo') {
        items.push({ name: 'Combo Offers', page: 'combos', params: {} });
        items.push({ name: (window.CURRENT_COMBO && CURRENT_COMBO.title) || 'Combo', active: true });
      }
      else if (page === 'blog') items.push({ name: 'Blog', active: true });
      else if (page === 'blog-post') {
        items.push({ name: 'Blog', page: 'blog', params: {} });
        var bt = (document.getElementById('blog-post-title') || {}).textContent;
        items.push({ name: bt && bt !== 'Article' ? bt : 'Post', active: true });
      }
      else if (page === 'cart') items.push({ name: 'Shopping Cart', active: true });
      else if (page === 'profile') items.push({ name: 'My Profile', active: true });
      else items.push({ name: page.charAt(0).toUpperCase() + page.slice(1), active: true });

      list.innerHTML = items.map(item => {
        const label = Utils.escape(item.name);
        if (item.active) return `<li class="breadcrumb-item active">${label}</li>`;
        const href = Seo.buildPath(item.page, item.params);
        const paramsJson = Utils.escape(JSON.stringify(item.params || {}));
        return `<li class="breadcrumb-item"><a href="${href}" onclick='navigate("${item.page}", ${paramsJson}); return false;'>${label}</a></li>`;
      }).join('');
    }

    function initPage(page, params) {
      if (page === 'index') initPageIndex();
      else if (page === 'products') initPageProducts(params);
      else if (page === 'product') initPageProduct(params);
      else if (page === 'cart') initPageCart();
      else if (page === 'profile') initPageProfile();
      else if (page === 'login') initPageLogin();
      else if (page === 'signup') initPageSignup();
      else if (page === 'combos') initPageCombos();
      else if (page === 'combo') initPageCombo(params.slug);
      else if (page === 'preowned') initPagePreowned(params);
      else if (page === 'blog') initPageBlog();
      else if (page === 'blog-post') initPageBlogPost(params);
      else if (page === 'forgot') { /* static page, nothing to init */ }
    }
