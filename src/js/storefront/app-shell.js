/* =============================================================================
   Velorex Music — phone "app shell": bottom tab bar + drawer accordion.
   Styles: src/styles/components/app-shell.css (tab bar) and the drawer rules in
   src/styles/pages/storefront.css (≤1100px block).

   PRESENTATION ONLY. Every tab is a real <a href> (crawlable, middle-clickable)
   whose onclick calls the same navigate() / VelorexSearch.open() the navbar
   already uses. Nothing here routes, prices, counts or authenticates:
     - active tab   → read from location.pathname
     - cart count   → mirrored from the navbar's #cartBadge, which
                      CartHelpers.updateBadge() already maintains
     - account link → Auth.isLoggedIn(), exactly as injectNavbar() decides it
   It re-syncs whenever injectNavbar() rebuilds #navbar-placeholder, which
   navigate() does on every view, so no router function is wrapped or patched.

   The whole bar is display:none above 1100px (CSS) — the same line where the
   navbar collapses to the hamburger — so desktop is unaffected.
   ============================================================================= */
(function () {
  'use strict';

  var SHOP_PATH = /^\/(products|vinyl-records|audio-cds|cassettes|blu-ray-movies|dvd-movies|merchandise|vinyl-care|pre-owned|combos|product|artists)(\/|$)/;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function loggedIn() {
    try { return typeof Auth !== 'undefined' && Auth.isLoggedIn(); } catch (e) { return false; }
  }

  function tab(key, href, onclick, icon, label, extra) {
    return '<a class="app-tab" data-tab="' + key + '" href="' + esc(href) + '"' + (extra || '') +
      ' onclick="' + onclick + '; return false;">' +
      '<span class="app-tab-icon"><i class="fas ' + icon + '" aria-hidden="true"></i>' +
      (key === 'cart' ? '<span class="app-tab-badge" hidden></span>' : '') +
      '</span><span>' + label + '</span></a>';
  }

  function build() {
    var bar = document.createElement('nav');
    bar.className = 'app-tabbar';
    bar.setAttribute('aria-label', 'Quick navigation');
    document.body.appendChild(bar);
    return bar;
  }

  function render(bar) {
    var acct = loggedIn()
      ? tab('account', '/profile', "navigate('profile')", 'fa-circle-user', 'Account', ' rel="nofollow"')
      : tab('account', '/login', "navigate('login')", 'fa-user', 'Sign in', ' rel="nofollow"');
    var html =
      tab('home', '/', "navigate('index')", 'fa-house', 'Home') +
      tab('shop', '/products', "navigate('products')", 'fa-compact-disc', 'Shop') +
      '<button type="button" class="app-tab" data-tab="search" onclick="if (typeof VelorexSearch !== \'undefined\') VelorexSearch.open()">' +
        '<span class="app-tab-icon"><i class="fas fa-magnifying-glass" aria-hidden="true"></i></span><span>Search</span></button>' +
      tab('cart', '/cart', "navigate('cart')", 'fa-shopping-cart', 'Cart', ' rel="nofollow"') +
      acct;
    // Only touch the DOM when the account state actually flipped, so a sync
    // on every navigation does not re-create five nodes for nothing.
    if (bar.getAttribute('data-auth') !== String(loggedIn())) {
      bar.innerHTML = html;
      bar.setAttribute('data-auth', String(loggedIn()));
    }
  }

  function sync(bar) {
    render(bar);
    var path = location.pathname.replace(/\/+$/, '') || '/';
    var active =
      path === '/' || path === '/index.html' ? 'home' :
      path === '/cart' ? 'cart' :
      /^\/(profile|login|signup|forgot)$/.test(path) ? 'account' :
      SHOP_PATH.test(path) ? 'shop' : '';
    bar.querySelectorAll('.app-tab').forEach(function (t) {
      var on = t.getAttribute('data-tab') === active;
      t.classList.toggle('is-active', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });

    var src = document.getElementById('cartBadge');
    var badge = bar.querySelector('.app-tab-badge');
    if (badge) {
      var n = src ? src.textContent.trim() : '';
      var show = !!(src && src.classList.contains('visible') && n && n !== '0');
      badge.textContent = show ? n : '';
      badge.hidden = !show;
      // Bump only when the count goes UP (an Add landed). Not on first paint,
      // not on removal, not on a navigation that re-renders the same number.
      var count = show ? (parseInt(n, 10) || 99) : 0;
      if (lastCount !== null && count > lastCount) bump(badge, badge.closest('.app-tab'));
      lastCount = count;
    }
  }

  var lastCount = null;
  function bump() {
    Array.prototype.forEach.call(arguments, function (el) {
      if (!el) return;
      el.classList.remove('is-bumping');
      void el.offsetWidth; // restart the animation if it is already running
      el.classList.add('is-bumping');
      setTimeout(function () { el.classList.remove('is-bumping'); }, 600);
    });
  }

  // Drawer accordion: the chevron toggles its group, the label still navigates.
  // Capture phase so it runs before the <a>'s inline onclick navigate().
  function onDrawerClick(e) {
    var arrow = e.target.closest && e.target.closest('.navbar-nav.mobile-open .nav-link .arrow');
    if (!arrow) return;
    e.preventDefault();
    e.stopPropagation();
    var item = arrow.closest('.nav-item');
    var open = !item.classList.contains('sub-open');
    item.parentNode.querySelectorAll('.nav-item.sub-open').forEach(function (i) { i.classList.remove('sub-open'); });
    item.classList.toggle('sub-open', open);
    var link = arrow.closest('.nav-link');
    if (link) link.setAttribute('aria-expanded', String(open));
  }

  function init() {
    document.addEventListener('click', onDrawerClick, true);

    // Hide the bar while typing so the keyboard does not lift it over the field.
    document.addEventListener('focusin', function (e) {
      if (e.target.matches && e.target.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select')) {
        document.body.classList.add('app-typing');
      }
    });
    document.addEventListener('focusout', function () { document.body.classList.remove('app-typing'); });

    var mount = document.getElementById('navbar-placeholder');
    if (!mount) return; // not the SPA shell
    var bar = build();
    document.body.classList.add('has-app-tabbar');
    sync(bar);

    // injectNavbar() rewrites this mount on every navigate() and
    // CartHelpers.updateBadge() rewrites the badge inside it — both are the
    // signals to re-sync. Coalesced to one sync per frame.
    var queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; sync(bar); });
    }).observe(mount, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('popstate', function () { requestAnimationFrame(function () { sync(bar); }); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
