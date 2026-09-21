/* =============================================================================
   Velorex Music — Admin → SEO panel
   Used by: vlx-admin-2026.html

   Two jobs, both read-only:
     1. Product content scorecard (/api/admin/seo.php): which product pages to
        improve first and which REAL fields are empty. It never fills a gap —
        the fix is always the owner adding a fact they know, via Edit.
     2. Measurement: where each organic-search number lives. No tracking code
        is added here; GA4 is already installed in index.html and Search
        Console needs no code at all.
   ============================================================================= */

    var SEO_ROWS = [];
    var SEO_FILTER = 'issues';

    function seoAuthHeaders() {
      return { 'X-Admin-Pass': sessionStorage.getItem('admin_pass') || '' };
    }

    async function loadSeoPanel() {
      var tbody = document.getElementById('seo-tbody');
      if (tbody) tbody.innerHTML = Skeleton.tableRows(6, 4);
      // Edit opens the inventory modal, which reads the product cache — warm
      // it if this panel is the first one visited, or Edit says "not found".
      if (!(Storage.getProducts() || []).length) {
        try { await Storage.syncFromServer(); } catch (e) { /* Edit will toast */ }
      }
      try {
        var res = await fetch(API_BASE + '/admin/seo.php', { headers: seoAuthHeaders(), cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        SEO_ROWS = data.products || [];
        renderSeoSummary(data.summary || {});
        renderSeoTable();
      } catch (e) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="padding:2rem;text-align:center;color:var(--danger);">'
          + 'Could not load the scorecard: ' + escapeHTML(e.message) + '</td></tr>';
      }
    }

    function renderSeoSummary(s) {
      var el = document.getElementById('seo-summary');
      if (!el) return;
      var top = Object.entries(s.byIssue || {}).slice(0, 6).map(function (e) {
        return '<li><strong>' + e[1] + '</strong> ' + escapeHTML(e[0].toLowerCase()) + '</li>';
      }).join('');
      el.innerHTML = '<p style="margin:0 0 0.6rem;"><strong>' + (s.withIssues || 0) + '</strong> of '
        + (s.total || 0) + ' product pages are missing something a buyer (and Google) would use.</p>'
        + '<ul style="margin:0;padding-left:1.1rem;color:var(--text-muted);font-size:0.85rem;display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:0.2rem 1rem;">' + top + '</ul>';
    }

    function setSeoFilter(f, btn) {
      SEO_FILTER = f;
      document.querySelectorAll('[data-seo-filter]').forEach(function (b) { b.classList.toggle('btn-primary', b === btn); });
      renderSeoTable();
    }

    function renderSeoTable() {
      var tbody = document.getElementById('seo-tbody');
      if (!tbody) return;
      var rows = SEO_ROWS.filter(function (r) {
        if (SEO_FILTER === 'issues') return r.issues.length > 0;
        if (SEO_FILTER === 'instock') return r.stock > 0 && r.issues.length > 0;
        return true;
      });
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding:2rem;text-align:center;color:var(--text-muted);">Nothing to fix in this view.</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(function (r) {
        var chips = r.issues.map(function (i) {
          return '<span style="display:inline-block;margin:0 0.3rem 0.3rem 0;padding:0.1rem 0.5rem;border-radius:999px;font-size:0.72rem;background:rgba(255,107,53,0.12);color:var(--secondary,#ff6b35);">' + escapeHTML(i) + '</span>';
        }).join('') || '<span style="color:#22c55e;font-size:0.8rem;">Complete</span>';
        return '<tr>'
          + '<td style="text-align:center;font-weight:700;">' + r.priority + '</td>'
          + '<td><div style="font-weight:600;">' + escapeHTML(r.title) + '</div>'
          + '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.2rem;">#' + r.id
          + ' · ' + (r.stock > 0 ? r.stock + ' in stock' : 'out of stock')
          + (r.composer ? ' · composer page' : '') + '</div></td>'
          + '<td>' + chips + '</td>'
          + '<td style="white-space:nowrap;">'
          + '<a class="btn btn-sm" href="' + escapeHTML(r.url) + '" target="_blank" rel="noopener" style="background:var(--surface);border:1px solid var(--border);color:var(--text);text-decoration:none;">View</a> '
          + '<button class="btn btn-sm" onclick="editProduct(' + r.id + ')">Edit</button></td></tr>';
      }).join('');
    }
