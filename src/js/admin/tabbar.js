/* =============================================================================
   Admin — phone/tablet bottom tab bar. Styles: src/styles/admin/components/tabbar.css

   PRESENTATION ONLY. Each tab calls the existing switchPanel(panel, link) with
   the matching sidebar link, so the sidebar's active state, the panel loaders
   and everything else run exactly as they do from the sidebar. "More" calls the
   existing toggleAdminSidebar() for the remaining panels. The active tab is
   read from the sidebar's own .nav-link.active, so the two can never disagree.
   ============================================================================= */
(function () {
  'use strict';

  var TABS = [
    { nav: 'overview',  icon: 'fa-gauge-high',   label: 'Home' },
    { nav: 'orders',    icon: 'fa-receipt',      label: 'Orders' },
    { nav: 'dashboard', icon: 'fa-compact-disc', label: 'Products' },
    { nav: 'users',     icon: 'fa-users',        label: 'Customers' }
  ];

  function sidebarLink(nav) { return document.querySelector('.sidebar .nav-link[data-nav="' + nav + '"]'); }

  function sync(bar) {
    var active = document.querySelector('.sidebar .nav-link.active');
    var nav = active ? active.getAttribute('data-nav') : '';
    var inTabs = TABS.some(function (t) { return t.nav === nav; });
    bar.querySelectorAll('.admin-tab').forEach(function (b) {
      var key = b.getAttribute('data-nav');
      var on = key === nav || (key === 'more' && nav && !inTabs);
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  function init() {
    var layout = document.getElementById('admin-layout');
    if (!layout || !document.querySelector('.sidebar .nav-link[data-nav]')) return;

    var bar = document.createElement('nav');
    bar.className = 'admin-tabbar';
    bar.setAttribute('aria-label', 'Admin quick navigation');
    bar.innerHTML = TABS.map(function (t) {
      return '<button type="button" class="admin-tab" data-nav="' + t.nav + '">' +
        '<span class="admin-tab-icon"><i class="fas ' + t.icon + '" aria-hidden="true"></i></span>' +
        '<span>' + t.label + '</span></button>';
    }).join('') +
      '<button type="button" class="admin-tab" data-nav="more" aria-label="More panels">' +
      '<span class="admin-tab-icon"><i class="fas fa-bars" aria-hidden="true"></i></span><span>More</span></button>';

    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('.admin-tab');
      if (!btn) return;
      var nav = btn.getAttribute('data-nav');
      if (nav === 'more') {
        if (typeof toggleAdminSidebar === 'function') toggleAdminSidebar(true);
        return;
      }
      if (typeof switchPanel === 'function') switchPanel(nav, sidebarLink(nav));
      window.scrollTo(0, 0);
    });

    // Inside #admin-layout so it is hidden with the layout on the login screen.
    layout.appendChild(bar);
    layout.classList.add('has-admin-tabbar');
    sync(bar);

    var sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      new MutationObserver(function () { sync(bar); })
        .observe(sidebar, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
