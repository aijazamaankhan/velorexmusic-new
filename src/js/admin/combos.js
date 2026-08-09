/* =============================================================================
   Velorex Music — admin combo offers
   Used by: vlx-admin-2026.html

   Curated product bundles shown on the storefront. A combo does NOT change the
   price charged: api/payments/create-order.php recomputes every total from DB
   prices, so a discount stored here would be ignored at checkout and the
   customer would pay full price while the page promised less. The editor
   therefore shows the REAL combined total of the chosen products and never
   asks for a bundle price.
   ============================================================================= */

    var COMBOS = [];
    var comboEditingId = null;
    var comboSelectedIds = [];

    function comboAuthHeaders(extra) {
      return Object.assign({ 'X-Admin-Pass': sessionStorage.getItem('admin_pass') || '' }, extra || {});
    }

    // ---------------------------------------------------------------- list ---

    async function loadCombos() {
      const tbody = document.getElementById('combo-tbody');
      if (tbody) tbody.innerHTML = Skeleton.tableRows(3, 5);
      try {
        const res = await fetch(API_BASE + '/combos.php?all=1', {
          headers: comboAuthHeaders(), cache: 'no-store'
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        COMBOS = await res.json();
        renderCombosTable();
      } catch (e) {
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="5" style="padding:2rem;text-align:center;color:var(--danger);">'
            + 'Could not load combos: ' + escapeHTML(e.message) + '</td></tr>';
        }
      }
    }

    function renderCombosTable() {
      const tbody = document.getElementById('combo-tbody');
      if (!tbody) return;
      if (!COMBOS.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="padding:2.5rem;text-align:center;color:var(--text-muted);">'
          + 'No combos yet. Click <strong>New Combo</strong> to bundle products together.</td></tr>';
        return;
      }
      tbody.innerHTML = COMBOS.map(function (c) {
        const live = c.status === 'published';
        const cover = c.image
          ? '<img src="' + escapeHTML(c.image) + '" alt="" style="width:54px;height:38px;object-fit:cover;border-radius:5px;">'
          : (c.products[0] && c.products[0].image
              ? '<img src="' + escapeHTML(c.products[0].image) + '" alt="" style="width:54px;height:38px;object-fit:cover;border-radius:5px;">'
              : '<div style="width:54px;height:38px;border-radius:5px;background:var(--surface);"></div>');
        // Surface a combo that has lost its products — it is hidden from the
        // storefront, and without this the admin would never know why.
        const warn = c.itemCount === 0
          ? '<div style="color:var(--danger);font-size:0.72rem;margin-top:0.2rem;">All products removed — hidden from the site</div>'
          : '';
        return '<tr>'
          + '<td>' + cover + '</td>'
          + '<td><div style="font-weight:600;">' + escapeHTML(c.title) + '</div>'
          + '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.2rem;">'
          + c.itemCount + ' product' + (c.itemCount === 1 ? '' : 's') + ' · ₹' + Number(c.total).toLocaleString('en-IN')
          + '</div>' + warn + '</td>'
          + '<td><span class="badge" style="background:' + (live ? 'rgba(34,197,94,0.15);color:#22c55e' : 'rgba(148,163,184,0.15);color:#94a3b8') + ';">'
          + (live ? 'Published' : 'Draft') + '</span></td>'
          + '<td style="color:var(--text-muted);">' + c.sortOrder + '</td>'
          + '<td style="white-space:nowrap;">'
          + '<button class="btn btn-sm" onclick="openComboEditor(' + c.id + ')">Edit</button> '
          + '<button class="btn btn-sm btn-danger" onclick="confirmDeleteCombo(' + c.id + ')">Delete</button>'
          + '</td></tr>';
      }).join('');
    }

    // -------------------------------------------------------------- editor ---

    async function openComboEditor(id) {
      comboEditingId = id || null;
      comboSelectedIds = [];
      const modal = document.getElementById('combo-modal');
      if (!modal) return;

      document.getElementById('combo-modal-title').textContent = id ? 'Edit Combo' : 'New Combo';
      document.getElementById('combo-title').value = '';
      document.getElementById('combo-description').value = '';
      document.getElementById('combo-image').value = '';
      document.getElementById('combo-sort').value = '0';
      document.getElementById('combo-status').value = 'published';
      document.getElementById('combo-product-search').value = '';
      modal.style.display = 'flex';

      if (id) {
        try {
          const res = await fetch(API_BASE + '/combos.php?id=' + encodeURIComponent(id), {
            headers: comboAuthHeaders(), cache: 'no-store'
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const c = await res.json();
          document.getElementById('combo-title').value = c.title || '';
          document.getElementById('combo-description').value = c.description || '';
          document.getElementById('combo-image').value = c.image || '';
          document.getElementById('combo-sort').value = c.sortOrder || 0;
          document.getElementById('combo-status').value = c.status || 'draft';
          comboSelectedIds = (c.productIds || []).slice();
        } catch (e) {
          showToast('Could not load combo: ' + e.message, 'error');
        }
      }
      renderComboPicker();
      renderComboSelected();
    }

    function closeComboEditor() {
      const m = document.getElementById('combo-modal');
      if (m) m.style.display = 'none';
      comboEditingId = null;
      comboSelectedIds = [];
    }

    // Product picker. Reads the cached product list rather than fetching —
    // the admin already has it loaded for the inventory table.
    function renderComboPicker() {
      const host = document.getElementById('combo-picker');
      if (!host) return;
      const q = (document.getElementById('combo-product-search').value || '').trim().toLowerCase();
      let list = Storage.getProducts() || [];
      if (q) {
        list = list.filter(function (p) {
          return (p.title || '').toLowerCase().indexOf(q) !== -1
              || (p.artist || '').toLowerCase().indexOf(q) !== -1;
        });
      }
      list = list.slice(0, 60);
      if (!list.length) {
        host.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;padding:0.75rem;">No products match.</p>';
        return;
      }
      host.innerHTML = list.map(function (p) {
        const on = comboSelectedIds.indexOf(p.id) !== -1;
        return '<label class="combo-pick' + (on ? ' is-on' : '') + '">'
          + '<input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="toggleComboProduct(' + p.id + ')">'
          + (p.image ? '<img src="' + escapeHTML(p.image) + '" alt="">' : '<span class="combo-pick-noimg"></span>')
          + '<span class="combo-pick-text"><strong>' + escapeHTML(p.title) + '</strong>'
          + '<em>' + escapeHTML(p.artist || '') + ' · ₹' + Number(p.price).toLocaleString('en-IN') + '</em></span>'
          + '</label>';
      }).join('');
    }

    function toggleComboProduct(id) {
      const i = comboSelectedIds.indexOf(id);
      if (i === -1) comboSelectedIds.push(id); else comboSelectedIds.splice(i, 1);
      renderComboPicker();
      renderComboSelected();
    }

    // Live summary of what the customer will see — including the real total,
    // so there is never a moment where the admin thinks they set a bundle price.
    function renderComboSelected() {
      const host = document.getElementById('combo-selected');
      if (!host) return;
      const products = Storage.getProducts() || [];
      const chosen = comboSelectedIds
        .map(function (id) { return products.find(function (p) { return p.id === id; }); })
        .filter(Boolean);
      if (!chosen.length) {
        host.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Nothing selected yet — pick at least 2 products.</p>';
        return;
      }
      const total = chosen.reduce(function (s, p) { return s + Number(p.price || 0); }, 0);
      host.innerHTML = chosen.map(function (p) {
        return '<span class="combo-chip">' + escapeHTML(p.title)
          + '<button type="button" onclick="toggleComboProduct(' + p.id + ')" aria-label="Remove">✕</button></span>';
      }).join('')
      + '<div style="margin-top:0.75rem;font-size:0.9rem;">'
      + '<strong>' + chosen.length + ' products · ₹' + total.toLocaleString('en-IN') + '</strong>'
      + '<div style="color:var(--text-muted);font-size:0.75rem;margin-top:0.25rem;">'
      + 'This is the real combined price and what the customer is charged. '
      + 'Combos group products; they do not apply a discount.</div></div>';
    }

    async function saveCombo(statusOverride) {
      const title = document.getElementById('combo-title').value.trim();
      if (!title) { showToast('Combo title is required', 'error'); return; }
      if (comboSelectedIds.length < 2) { showToast('Pick at least 2 products', 'error'); return; }

      const body = {
        title: title,
        description: document.getElementById('combo-description').value.trim(),
        image: document.getElementById('combo-image').value.trim(),
        sortOrder: parseInt(document.getElementById('combo-sort').value, 10) || 0,
        status: statusOverride || document.getElementById('combo-status').value,
        productIds: comboSelectedIds,
      };
      if (comboEditingId) body.id = comboEditingId;

      try {
        const res = await fetch(API_BASE + '/combos.php', {
          method: 'POST',
          headers: comboAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) throw new Error(data.error || ('HTTP ' + res.status));
        showToast('<i class="fas fa-circle-check"></i> Combo saved');
        closeComboEditor();
        loadCombos();
      } catch (e) {
        showToast('Save failed: ' + e.message, 'error');
      }
    }

    async function confirmDeleteCombo(id) {
      const c = COMBOS.find(function (x) { return x.id === id; });
      const ok = await adminConfirm({
        title: 'Delete this combo?',
        message: 'This removes “' + (c ? c.title : 'the combo') + '” from the site. '
          + 'The products themselves are not affected.',
        confirmLabel: 'Delete combo',
      });
      if (!ok) return;
      try {
        const res = await fetch(API_BASE + '/combos.php?id=' + encodeURIComponent(id), {
          method: 'DELETE', headers: comboAuthHeaders()
        });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) throw new Error(data.error || ('HTTP ' + res.status));
        showToast('Combo deleted', 'success');
        loadCombos();
      } catch (e) {
        showToast('Delete failed: ' + e.message, 'error');
      }
    }
