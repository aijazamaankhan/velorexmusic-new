/* =============================================================================
   Velorex Music — admin Inventory + product editor + bulk upload
   Used by: vlx-admin-2026.html

   The biggest single file in the admin (~1200 lines). Three related concerns:

     1. Inventory dashboard + table
        — initDashboard, filterAdminProducts, renderProductsTable,
          openProductModal (legacy), closeProductModal.

     2. Bulk upload CSV flow
        — BULK_REQUIRED_COLS, BULK_VALID_BADGES, bulkParsedRows,
          openBulkUploadModal/close/reset, downloadBulkTemplate,
          bulkRowToCsv, parseCsv, handleBulkFileSelect, processBulkRows,
          bulkBuildProduct, bulkValidate, renderBulkPreview, confirmBulkImport.

     3. Product editor (new + edit, with image gallery)
        — Shared image-gallery helpers, form helpers, new + edit submission,
          deleteProduct.

   The new/edit code is largely duplicated — the edit modal was added later
   and rather than refactoring the new-product form, it grew its own parallel
   set of helpers. Worth deduplicating in a future PR but out of scope for
   the extraction.

   Cross-module touch points (resolved at runtime):
     - API_BASE, Storage, escapeHTML, showToast
     - adminAuthHeaders, recordSaveResult, getCategoryLabel  (main.js)
   ============================================================================= */


    // =============================================
    // DASHBOARD LOGIC
    // =============================================
    function initDashboard() {
      renderCategorySelectors();
      renderLastSaveBadge();
      const products = Storage.getProducts();
      const totalEl = document.getElementById('stat-total-products');
      // Cold cache: replace the stat value with an inline shimmer until the
      // sync pipeline calls initDashboard again with real data.
      if (totalEl) {
        if (products.length) totalEl.textContent = products.length;
        else totalEl.innerHTML = Skeleton.inlineLine('2rem');
      }
      renderOrdersTable();
      renderProductsTable();

      const recentList = document.getElementById('recent-products-list');
      if (!recentList) return;
      if (!products.length) {
        recentList.innerHTML = Skeleton.tableRows(5, 4);
        return;
      }
      const recent = products.slice(-5).reverse();

      recentList.innerHTML = recent.map(p => {
        const statusClass = p.stock === 0 ? 'status-oos' : p.stock < 5 ? 'status-low' : 'status-instock';
        const statusText = p.stock === 0 ? 'OOS' : p.stock < 5 ? 'Low' : 'In Stock';

        return `
          <tr>
            <td>
              <div class="product-cell">
                ${typeof p.image === 'string' && p.image.length > 0
                  ? `<img src="${p.image}" class="product-img" loading="lazy" decoding="async" onerror="this.src='https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=100&h=100&fit=crop'">`
                  : (Array.isArray(Storage._products)
                      ? `<img src="https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=100&h=100&fit=crop" class="product-img" loading="lazy" decoding="async">`
                      : `<span class="skeleton skeleton-thumb" aria-label="Loading image"></span>`)}
                <div>
                  <div style="font-weight: 700;">${Utils.escape(p.title)}</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">${Utils.escape(p.artist)}</div>
                </div>
              </div>
            </td>
            <td><span class="badge badge-${p.category}">${p.category}</span></td>
            <td style="color: var(--accent); font-weight: 700;">₹${p.price.toLocaleString()}</td>
            <td><span class="status-pill ${statusClass}"></span>${statusText}</td>
          </tr>
        `;
      }).join('');
    }

    // =============================================
    // PRODUCTS LOGIC
    // =============================================
    function filterAdminProducts() {
      renderProductsTable();
    }

    function renderProductsTable() {
      const allProducts = Storage.getProducts();
      const searchQuery = document.getElementById('adminSearch').value.toLowerCase();
      const catFilter = document.getElementById('adminCatFilter').value;

      const filtered = allProducts.filter(p => {
        const matchesSearch = p.title.toLowerCase().includes(searchQuery) || p.artist.toLowerCase().includes(searchQuery);
        const matchesCat = !catFilter || p.category === catFilter;
        return matchesSearch && matchesCat;
      });

      const tbody = document.getElementById('admin-products-table');
      if (!tbody) return;

      // Cold cache + no search query: skeleton rows. Suppress skeleton if the
      // user has applied a search/filter so an "0 results" doesn't flash as
      // skeletons.
      if (!allProducts.length && !searchQuery && !catFilter) {
        tbody.innerHTML = Skeleton.tableRows(5, 7);
        return;
      }

      tbody.innerHTML = filtered.map(p => {
        const stock = Number.isFinite(p.stock) ? p.stock : 0;
        const stockClass = stock === 0 ? 'status-oos' : (stock < 5 ? 'status-low' : 'status-instock');
        const stockLabel = stock === 0 ? 'Out of stock' : (stock < 5 ? 'Low stock' : 'In stock');
        return `
          <tr>
            <td>
              <div class="product-info">
                ${typeof p.image === 'string' && p.image.length > 0
                  ? `<img src="${p.image}" class="product-img" loading="lazy" decoding="async" onerror="this.src='https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=100&h=100&fit=crop'">`
                  : (Array.isArray(Storage._products)
                      ? `<img src="https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=100&h=100&fit=crop" class="product-img" loading="lazy" decoding="async">`
                      : `<span class="skeleton skeleton-thumb" aria-label="Loading image"></span>`)}
                <div class="product-name-artist">
                  <div class="product-name">${Utils.escape(p.title)}</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">${Utils.escape(p.artist)}</div>
                </div>
              </div>
            </td>
            <td><span class="badge badge-${p.category}">${p.category}</span></td>
            <td style="font-weight: 700;">₹${p.price.toLocaleString()}</td>
            <td>
              <div class="qty-display" title="${stockLabel} — edit in the product modal">
                <span class="status-pill ${stockClass}"></span>
                <span class="qty-display-value">${stock}</span>
              </div>
            </td>
            <td>
              <div style="display: flex; gap: 0.5rem;">
                <button class="action-btn action-btn-edit" onclick="editProduct(${p.id})">
                  <i class="fas fa-edit"></i> Edit
                </button>
                <button class="action-btn action-btn-delete" onclick="deleteProduct(${p.id})">
                  <i class="fas fa-trash"></i> Delete
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      // Update total products stat
      const totalStat = document.getElementById('stat-total-products');
      if (totalStat) totalStat.textContent = allProducts.length;
    }

    function openProductModal(isEdit = false) {
      document.getElementById('product-modal').style.display = 'flex';
      if (!isEdit) {
        document.getElementById('product-form').reset();
        window.currentEditId = null;
        document.getElementById('edit-id').value = '';
        document.getElementById('modal-title').textContent = 'Add New Release';
        document.getElementById('modal-submit-btn').textContent = '💾 Save Product';

        // Reset specifications
        setSpecificationsData({});
        renderSubcategoryOptions('f', null);
        toggleShippingCharge('f');

        // Reset images (URLs + uploads)
        resetImageGallery();

        // Reset discount display
        calculateDiscount();
      }

      // Set up discount calculation listeners
      setupDiscountListeners();
    }

    function closeProductModal() {
      document.getElementById('product-modal').style.display = 'none';
      // Reset image upload
      resetImageGallery();
    }

    // =============================================
    // BULK UPLOAD (CSV → Validate → Confirm → Import)
    // =============================================
    // CSV columns (header row required, case-insensitive):
    //   Required: title, artist, category, price
    //   Optional: id, language, original_price, stock, badge, description,
    //             music_director, track_listing, people (pipe-separated),
    //             specs_format, specs_speed, specs_label, specs_year,
    //             specs_tracks, specs_genre, specs_theme
    // Images are NOT supported in bulk by design — add per-product afterward.

    const BULK_REQUIRED_COLS = ['title', 'artist', 'category', 'price'];
    const BULK_VALID_BADGES = ['hot', 'new', 'upcoming'];

    // Holds the validated, ready-to-import payload between the preview step
    // and the confirm button. Reset on modal open/close.
    let bulkParsedRows = [];

    function openBulkUploadModal() {
      resetBulkUpload();
      document.getElementById('bulk-upload-modal').style.display = 'flex';
    }

    function closeBulkUploadModal() {
      document.getElementById('bulk-upload-modal').style.display = 'none';
      resetBulkUpload();
    }

    function resetBulkUpload() {
      bulkParsedRows = [];
      document.getElementById('bulk-step-pick').style.display = '';
      document.getElementById('bulk-step-preview').style.display = 'none';
      document.getElementById('bulk-preview-body').innerHTML = '';
      document.getElementById('bulk-preview-summary').innerHTML = '';
      const input = document.getElementById('bulk-file-input');
      if (input) input.value = '';
    }

    function downloadBulkTemplate() {
      const headers = [
        'id', 'title', 'artist', 'category', 'price',
        'language', 'original_price', 'stock', 'badge', 'condition', 'subcategory',
        'free_shipping', 'shipping_charge', 'description',
        'music_director', 'track_listing', 'people',
        'specs_format', 'specs_speed', 'specs_label', 'specs_year',
        'specs_tracks', 'specs_genre', 'specs_theme',
      ];
      const example = [
        '', 'Sholay', 'R. D. Burman', 'vinyl', '1499',
        'Hindi', '1999', '5', 'hot',
        'Original soundtrack from the 1975 Bollywood classic.',
        'R. D. Burman', 'Title Music|Mehbooba Mehbooba|Yeh Dosti',
        'rd-burman|amitabh-bachchan',
        'LP', '33 RPM', 'EMI', '1975', '8', 'Bollywood', 'Soundtrack',
      ];
      const csv = bulkRowToCsv(headers) + '\n' + bulkRowToCsv(example) + '\n';
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'velorex-products-template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function bulkRowToCsv(row) {
      return row.map(cell => {
        const s = cell == null ? '' : String(cell);
        if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      }).join(',');
    }

    // Minimal RFC-4180-ish CSV parser. Handles quoted cells, escaped quotes
    // ("" → "), commas and newlines inside quotes. Returns array of arrays.
    function parseCsv(text) {
      const rows = [];
      let cur = [];
      let field = '';
      let inQuotes = false;
      // Strip UTF-8 BOM so Excel-saved CSVs don't poison the first header cell.
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
          if (c === '"') {
            if (text[i + 1] === '"') { field += '"'; i++; continue; }
            inQuotes = false; continue;
          }
          field += c; continue;
        }
        if (c === '"') { inQuotes = true; continue; }
        if (c === ',') { cur.push(field); field = ''; continue; }
        if (c === '\r') continue; // swallow CR; \n handles the line break
        if (c === '\n') { cur.push(field); field = ''; rows.push(cur); cur = []; continue; }
        field += c;
      }
      if (field.length || cur.length) { cur.push(field); rows.push(cur); }
      return rows;
    }

    function handleBulkFileSelect(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      // 5MB cap — well above any plausible CSV (no embedded images supported).
      if (file.size > 5 * 1024 * 1024) {
        showToast('File too large (>5MB). CSV-only — no embedded images.', 'danger');
        return;
      }
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const rows = parseCsv(String(e.target.result));
          processBulkRows(rows);
        } catch (err) {
          console.error('[Bulk] CSV parse failed:', err);
          showToast('Failed to read CSV: ' + err.message, 'danger');
        }
      };
      reader.onerror = function () { showToast('Could not read file', 'danger'); };
      reader.readAsText(file);
    }

    function processBulkRows(rows) {
      if (!rows.length) { showToast('CSV is empty', 'danger'); return; }
      const header = rows[0].map(h => String(h || '').trim().toLowerCase());
      // Drop entirely-blank rows so a trailing newline in Excel doesn't show up as an error.
      const dataRows = rows.slice(1).filter(r => r.some(cell => String(cell || '').trim() !== ''));

      const missing = BULK_REQUIRED_COLS.filter(c => header.indexOf(c) === -1);
      if (missing.length) {
        showToast('Missing required columns: ' + missing.join(', '), 'danger');
        return;
      }
      if (!dataRows.length) {
        showToast('No data rows found (only a header).', 'danger');
        return;
      }

      const validCategories = Storage.getCategories();
      const previewRows = dataRows.map((cells, i) => {
        const obj = {};
        header.forEach((h, j) => { obj[h] = j < cells.length ? cells[j] : ''; });
        const item = bulkBuildProduct(obj);
        const errors = bulkValidate(item, obj, validCategories);
        return { rowNum: i + 2, item, errors }; // +2 — header occupies row 1, data is 1-indexed
      });

      bulkParsedRows = previewRows.filter(r => !r.errors.length).map(r => r.item);
      renderBulkPreview(previewRows);
    }

    function bulkBuildProduct(obj) {
      const trim = v => (v == null ? '' : String(v).trim());
      const num = v => {
        const t = trim(v);
        if (t === '') return null;
        const n = Number(t);
        return Number.isFinite(n) ? n : NaN;
      };
      const pipeList = v => trim(v).split('|').map(s => s.trim()).filter(Boolean);

      const specs = {};
      ['format', 'speed', 'label', 'year', 'tracks', 'genre', 'theme'].forEach(k => {
        const v = trim(obj['specs_' + k]);
        if (v === '') return;
        if (k === 'year' || k === 'tracks') {
          const n = Number(v);
          specs[k] = Number.isFinite(n) ? n : v;
        } else {
          specs[k] = v;
        }
      });

      const p = {
        title: trim(obj.title),
        artist: trim(obj.artist),
        category: trim(obj.category).toLowerCase(),
        price: num(obj.price),
      };
      const idVal = trim(obj.id);
      if (idVal !== '') p.id = Number(idVal);

      const lang = trim(obj.language); if (lang) p.language = lang;
      const op = num(obj.original_price); if (op !== null && Number.isFinite(op)) p.originalPrice = op;
      const stock = num(obj.stock); if (stock !== null && Number.isFinite(stock)) p.stock = stock;
      const badge = trim(obj.badge).toLowerCase(); if (badge) p.badge = badge;
      const cond = trim(obj.condition).toLowerCase();
      if (cond) p.condition = (cond === 'pre-owned' || cond === 'preowned' || cond === 'used') ? 'pre-owned' : 'new';
      const sub = trim(obj.subcategory).toLowerCase();
      if (sub) p.subcategory = sub;
      const fs2 = trim(obj.free_shipping).toLowerCase();
      if (fs2) p.freeShipping = (fs2 === '1' || fs2 === 'yes' || fs2 === 'true' || fs2 === 'free');
      const sc = trim(obj.shipping_charge);
      if (sc !== '') p.shippingCharge = sc;
      const desc = trim(obj.description); if (desc) p.description = desc;
      const md = trim(obj.music_director); if (md) p.musicDirector = md;
      const tl = trim(obj.track_listing); if (tl) p.trackListing = tl;
      const people = pipeList(obj.people); if (people.length) p.people = people;
      if (Object.keys(specs).length) p.specs = specs;
      return p;
    }

    function bulkValidate(p, raw, validCategories) {
      const errs = [];
      if (!p.title) errs.push('title is required');
      if (!p.artist) errs.push('artist is required');
      if (!p.category) errs.push('category is required');
      else if (validCategories.length && validCategories.indexOf(p.category) === -1) {
        errs.push("unknown category '" + p.category + "' (expected: " + validCategories.join(', ') + ')');
      }
      if (p.price === null || p.price === undefined) errs.push('price is required');
      else if (!Number.isFinite(p.price) || p.price < 0 || !Number.isInteger(p.price)) errs.push('price must be a non-negative integer');
      const idRaw = String(raw.id == null ? '' : raw.id).trim();
      if (idRaw !== '' && (!Number.isFinite(p.id) || !Number.isInteger(p.id) || p.id <= 0)) {
        errs.push('id must be a positive integer');
      }
      if (p.originalPrice !== undefined && (!Number.isFinite(p.originalPrice) || p.originalPrice < 0 || !Number.isInteger(p.originalPrice))) {
        errs.push('original_price must be a non-negative integer');
      }
      if (p.stock !== undefined && (!Number.isFinite(p.stock) || p.stock < 0 || !Number.isInteger(p.stock))) {
        errs.push('stock must be a non-negative integer');
      }
      if (p.badge && BULK_VALID_BADGES.indexOf(p.badge) === -1) {
        errs.push('badge must be one of: ' + BULK_VALID_BADGES.join(', '));
      }
      return errs;
    }

    function renderBulkPreview(previewRows) {
      const validCount = previewRows.filter(r => !r.errors.length).length;
      const errCount = previewRows.length - validCount;

      const summary = document.getElementById('bulk-preview-summary');
      summary.innerHTML =
        '<span class="ok">' + validCount + ' valid</span>'
        + (errCount ? ' &middot; <span class="err">' + errCount + ' with errors (will be skipped)</span>' : '')
        + ' &middot; ' + previewRows.length + ' total rows';

      const body = document.getElementById('bulk-preview-body');
      body.innerHTML = previewRows.map(r => {
        const ok = !r.errors.length;
        const cls = ok ? 'bulk-row-ok' : 'bulk-row-err';
        const status = ok
          ? '<span class="' + cls + '">✓ ready</span>'
          : '<span class="' + cls + '">✕ ' + Utils.escape(r.errors.join('; ')) + '</span>';
        const idCell = r.item.id != null
          ? Utils.escape(String(r.item.id))
          : '<em style="color:var(--text-muted)">auto</em>';
        const priceCell = r.item.price != null ? Utils.escape(String(r.item.price)) : '';
        return '<tr>'
          + '<td>' + r.rowNum + '</td>'
          + '<td>' + idCell + '</td>'
          + '<td>' + Utils.escape(r.item.title || '') + '</td>'
          + '<td>' + Utils.escape(r.item.artist || '') + '</td>'
          + '<td>' + Utils.escape(r.item.category || '') + '</td>'
          + '<td>' + priceCell + '</td>'
          + '<td>' + status + '</td>'
          + '</tr>';
      }).join('');

      document.getElementById('bulk-step-pick').style.display = 'none';
      document.getElementById('bulk-step-preview').style.display = '';

      const btn = document.getElementById('bulk-confirm-btn');
      btn.disabled = validCount === 0;
      btn.textContent = validCount === 0
        ? 'Nothing valid to import'
        : 'Import ' + validCount + ' row' + (validCount === 1 ? '' : 's');
    }

    async function confirmBulkImport() {
      if (!bulkParsedRows.length) return;
      const btn = document.getElementById('bulk-confirm-btn');
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Importing…';
      try {
        const result = await Storage.bulkUpsertProducts(bulkParsedRows);
        const errCount = (result.errors && result.errors.length) || 0;
        showToast(
          'Imported ' + result.inserted + ' new, ' + result.updated + ' updated'
            + (errCount ? ' (' + errCount + ' server-side issue' + (errCount === 1 ? '' : 's') + ')' : ''),
          'success'
        );
        closeBulkUploadModal();
        if (typeof renderProductsTable === 'function') renderProductsTable();
        renderLastSaveBadge();
      } catch (e) {
        console.error('[Bulk] import failed:', e);
        recordSaveResult({ status: 'error', op: 'bulk', error: e.message });
        renderLastSaveBadge();
        showToast('Bulk import failed: ' + e.message, 'danger');
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    }

    // Drag-and-drop support for the dropzone. Runs once at script load —
    // safe because the modal markup is above this <script>.
    (function setupBulkDropzone() {
      const dz = document.getElementById('bulk-dropzone');
      if (!dz) return;
      ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => {
        e.preventDefault(); e.stopPropagation();
        dz.classList.add('dragover');
      }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => {
        e.preventDefault(); e.stopPropagation();
        dz.classList.remove('dragover');
      }));
      dz.addEventListener('drop', e => {
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) return;
        document.getElementById('bulk-file-input').files = e.dataTransfer.files;
        handleBulkFileSelect({ target: { files: [file] } });
      });
    })();

    // =============================================
    // MULTI IMAGE URL + UPLOAD (Product Gallery)
    // =============================================
    function ensureImageState() {
      if (!Array.isArray(window.uploadedImagesData)) window.uploadedImagesData = [];
    }

    function addImageUrlRow(value) {
      var list = document.getElementById('image-url-list');
      if (!list) return;
      var idx = list.querySelectorAll('input[type="url"]').length;
      var row = document.createElement('div');
      row.className = 'image-url-row';

      var input = document.createElement('input');
      input.type = 'url';
      input.className = 'form-control';
      input.id = 'f-image-url-' + idx;
      input.placeholder = 'https://...';
      input.value = value ? String(value) : '';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-sm btn-danger';
      btn.title = 'Remove URL';
      btn.style.height = '42px';
      btn.textContent = '✕';
      btn.onclick = function () { removeImageUrlRow(btn); };

      row.appendChild(input);
      row.appendChild(btn);
      list.appendChild(row);
    }

    function removeImageUrlRow(btn) {
      var row = btn && btn.closest ? btn.closest('.image-url-row') : null;
      if (!row) return;
      row.remove();
    }

    function getImageUrlsFromForm() {
      var list = document.getElementById('image-url-list');
      if (!list) return [];
      var urls = Array.from(list.querySelectorAll('input[type="url"]'))
        .map(function (i) { return (i.value || '').trim(); })
        .filter(Boolean);
      // de-dupe while preserving order
      return urls.filter(function (u, idx) { return urls.indexOf(u) === idx; });
    }

    function setCoverImageByIndex(idx) {
      ensureImageState();
      if (idx <= 0) return;
      if (idx >= window.uploadedImagesData.length) return;
      var item = window.uploadedImagesData.splice(idx, 1)[0];
      window.uploadedImagesData.unshift(item);
      renderImagePreviewGrid();
    }

    function removeUploadedImageByIndex(idx) {
      ensureImageState();
      if (idx < 0 || idx >= window.uploadedImagesData.length) return;
      window.uploadedImagesData.splice(idx, 1);
      renderImagePreviewGrid();
    }

    function renderImagePreviewGrid() {
      ensureImageState();
      var grid = document.getElementById('image-preview-grid');
      if (!grid) return;

      if (!window.uploadedImagesData.length) {
        grid.style.display = 'none';
        return;
      }

      grid.style.display = 'grid';
      grid.innerHTML = window.uploadedImagesData.map(function (src, idx) {
        var isCover = idx === 0;
        var coverBtn = isCover
          ? '<button type="button" class="img-action-btn" disabled style="opacity:0.7;cursor:default;">Cover</button>'
          : '<button type="button" class="img-action-btn" onclick="setCoverImageByIndex(' + idx + ')">Set cover</button>';
        return (
          '<div class="img-tile">' +
          '<img src="' + src + '" alt="Image ' + (idx + 1) + '">' +
          '<div class="img-actions">' +
          coverBtn +
          '<button type="button" class="img-action-btn" onclick="removeUploadedImageByIndex(' + idx + ')" style="border-color: rgba(239,68,68,0.35);">Remove</button>' +
          '</div>' +
          '</div>'
        );
      }).join('');
    }

    // Upload an image file to the server and resolve to its public URL.
    // Phase 1 of the perf rewrite — previously this resolved to a base64
    // data: URL via FileReader, which made product saves 10× larger than
    // necessary and bloated /api/products.php to 27 MB. Now the bytes go to
    // /api/upload-product-image.php which writes them to disk under
    // /uploads/products/<hash>.<ext> and returns that URL. The rest of the
    // admin UI (gallery preview, save) doesn't care whether the string is
    // a data: URL or an https URL — <img src="..."> handles both.
    //
    // Same 5 MB / image-mime client check as before, kept so the user gets
    // an immediate error before paying the network cost.
    async function processImageFile(file) {
      if (!file || !file.type || !file.type.startsWith('image/')) {
        throw new Error('invalid_type');
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('too_large');
      }
      var fd = new FormData();
      fd.append('image', file);
      var res;
      try {
        res = await fetch(API_BASE + '/upload-product-image.php', {
          method: 'POST',
          // X-Admin-Pass only — DO NOT set Content-Type. The browser sets
          // multipart boundary automatically; setting it manually breaks the
          // upload because the boundary in the header won't match the body.
          headers: { 'X-Admin-Pass': sessionStorage.getItem('admin_pass') || '' },
          body: fd,
        });
      } catch (e) {
        throw new Error('network_error');
      }
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.ok || !data.url) {
        throw new Error(data.error || ('upload_failed_' + res.status));
      }
      return data.url;
    }

    async function addFilesToGallery(fileList) {
      ensureImageState();
      // Crop first, upload second — see src/js/admin/image-cropper.js. The
      // admin can drop a file per image; anything they skip never reaches the
      // server, so no orphaned full-size file is left on disk.
      var files = await ImageCropper.run(fileList);
      if (!files.length) return;

      for (var i = 0; i < files.length; i++) {
        try {
          var dataUrl = await processImageFile(files[i]);
          // de-dupe
          if (window.uploadedImagesData.indexOf(dataUrl) === -1) window.uploadedImagesData.push(dataUrl);
        } catch (err) {
          if (String(err && err.message) === 'too_large') showToast('❌ One image exceeded 5MB (skipped)', 'danger');
          else showToast('❌ Failed to add an image (skipped)', 'danger');
        }
      }

      renderImagePreviewGrid();
    }

    function resetImageGallery() {
      ensureImageState();
      var upload = document.getElementById('f-image-upload');
      if (upload) upload.value = '';
      window.uploadedImagesData = [];
      renderImagePreviewGrid();

      // Reset URL list to a single empty row
      var list = document.getElementById('image-url-list');
      if (list) {
        list.innerHTML =
          '<div class="image-url-row">' +
          '<input type="url" class="form-control" id="f-image-url-0" placeholder="https://...">' +
          '<button type="button" class="btn btn-sm btn-danger" title="Remove URL" onclick="removeImageUrlRow(this)" style="height:42px;">✕</button>' +
          '</div>';
      }
    }

    // Initialize image upload listeners
    document.addEventListener('DOMContentLoaded', function() {
      // Wire each modal's upload area to its own gallery handler so the Add and
      // Edit modals don't share state.
      wireUploadArea('f-image-upload', addFilesToGallery);
      wireUploadArea('e-image-upload', addEditFilesToGallery);
    });

    function wireUploadArea(inputId, addHandler) {
      const input = document.getElementById(inputId);
      if (!input) return;
      input.addEventListener('change', function (e) {
        // Copy out of the live FileList BEFORE clearing the input — clearing
        // empties the list itself, so a reference to it would go blank.
        const picked = Array.from(e.target.files || []);
        // Clear the input so picking the same file again still fires `change`.
        // That used to be harmless; now it blocks a re-crop after "Skip".
        input.value = '';
        addHandler(picked);
      });
      // The upload-area sits next to the file input; find it by walking up to
      // the nearest .image-upload-section.
      const section = input.closest('.image-upload-section');
      const uploadArea = section ? section.querySelector('.upload-area') : null;
      if (!uploadArea) return;
      uploadArea.addEventListener('dragover', function (e) {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--secondary)';
        uploadArea.style.background = 'rgba(255, 107, 53, 0.1)';
      });
      uploadArea.addEventListener('dragleave', function (e) {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--border)';
        uploadArea.style.background = 'rgba(255, 255, 255, 0.02)';
      });
      uploadArea.addEventListener('drop', function (e) {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--border)';
        uploadArea.style.background = 'rgba(255, 255, 255, 0.02)';
        if (e.dataTransfer.files.length > 0) addHandler(e.dataTransfer.files);
      });
    }

    // =============================================
    // DISCOUNT CALCULATION FUNCTIONS
    // =============================================
    function setupDiscountListeners() {
      const originalPriceInput = document.getElementById('f-original-price');
      const sellingPriceInput = document.getElementById('f-price');

      // Remove existing listeners to avoid duplicates
      originalPriceInput.removeEventListener('input', calculateDiscount);
      sellingPriceInput.removeEventListener('input', calculateDiscount);

      // Add listeners
      originalPriceInput.addEventListener('input', calculateDiscount);
      sellingPriceInput.addEventListener('input', calculateDiscount);
    }

    function calculateDiscount() {
      const orig = parseFloat(document.getElementById('f-original-price').value);
      const sell = parseFloat(document.getElementById('f-price').value);
      const display = document.getElementById('discount-display');
      if (!display) return;
      const text = display.querySelector('.discount-text');
      if (!text) return;
      if (Number.isFinite(orig) && Number.isFinite(sell) && orig > sell && orig > 0) {
        const pct = Math.round(((orig - sell) / orig) * 100);
        text.textContent = pct + '% off (₹' + (orig - sell).toLocaleString() + ' saved)';
        text.classList.add('discount');
      } else {
        text.textContent = 'No discount';
        text.classList.remove('discount');
      }
    }

    function getSpecificationsData() {
      const specs = {};

      const tracks = document.getElementById('f-tracks').value.trim();
      const label = document.getElementById('f-label').value.trim();
      const year = document.getElementById('f-year').value.trim();
      const genre = document.getElementById('f-genre').value.trim();
      const runtime = document.getElementById('f-runtime').value.trim();

      if (tracks) specs.tracks = parseInt(tracks);
      if (label) specs.label = Utils.escape(label);
      if (year) specs.year = Utils.escape(year);
      if (genre) specs.genre = Utils.escape(genre);
      if (runtime) specs.runtime = Utils.escape(runtime);
      const theme = document.getElementById('f-theme').value.trim();
      if (theme) specs.theme = Utils.escape(theme);

      return specs;
    }

    function setSpecificationsData(specs) {
      document.getElementById('f-tracks').value = specs.tracks || '';
      document.getElementById('f-label').value = specs.label || '';
      document.getElementById('f-year').value = specs.year || '';
      document.getElementById('f-genre').value = specs.genre || '';
      document.getElementById('f-runtime').value = specs.runtime || '';
      document.getElementById('f-theme').value = specs.theme || '';
    }

    function normalizeTrackLines(raw) {
      if (!raw) return '';
      return raw
        .split(/\r?\n/)
        .map(function (t) { return t.trim(); })
        .map(function (t) { return t.replace(/^\s*\d+[\.)]?\s*/, ''); })
        .filter(Boolean)
        .join('\n');
    }

    function getTrackListingSidesData() {
      var a = normalizeTrackLines((document.getElementById('f-track-side-a') || {}).value || '');
      var b = normalizeTrackLines((document.getElementById('f-track-side-b') || {}).value || '');
      var c = normalizeTrackLines((document.getElementById('f-track-side-c') || {}).value || '');
      var d = normalizeTrackLines((document.getElementById('f-track-side-d') || {}).value || '');

      return {
        A: a,
        B: b,
        C: c,
        D: d
      };
    }

    function parseSidesFromMarkers(raw) {
      if (!raw) return null;
      var lines = String(raw).split(/\r?\n/);
      var sides = {};
      var current = null;
      var foundMarker = false;
      for (var i = 0; i < lines.length; i++) {
        var t = lines[i].replace(/\s+$/, '');
        if (!t.trim()) continue;
        var m = t.trim().match(/^\[Side\s+([A-D])\]$/i);
        if (m) {
          current = m[1].toUpperCase();
          foundMarker = true;
          if (!sides[current]) sides[current] = '';
        } else if (current) {
          sides[current] += (sides[current] ? '\n' : '') + t;
        }
      }
      return foundMarker ? sides : null;
    }

    function setTrackListingSidesData(product) {
      var sides = (product && product.trackListingSides && typeof product.trackListingSides === 'object')
        ? product.trackListingSides
        : null;

      // Prefer markers embedded in track_listing text (what we now persist).
      if (!sides && product && product.trackListing) {
        sides = parseSidesFromMarkers(product.trackListing);
      }

      // Back-compat: if only a flat trackListing exists (no markers), distribute across sides
      if (!sides && product && product.trackListing) {
        var tracks = normalizeTrackLines(product.trackListing)
          .split(/\r?\n/)
          .map(function (t) { return t.trim(); })
          .filter(Boolean);
        if (tracks.length) {
          var sideCount = Math.min(4, tracks.length);
          var perSide = Math.ceil(tracks.length / sideCount);
          sides = { A: '', B: '', C: '', D: '' };
          for (var i = 0; i < sideCount; i++) {
            var sideTracks = tracks.slice(i * perSide, (i + 1) * perSide);
            if (!sideTracks.length) continue;
            var key = ['A', 'B', 'C', 'D'][i];
            sides[key] = sideTracks.join('\n');
          }
        }
      }

      var aEl = document.getElementById('f-track-side-a');
      var bEl = document.getElementById('f-track-side-b');
      var cEl = document.getElementById('f-track-side-c');
      var dEl = document.getElementById('f-track-side-d');
      if (aEl) aEl.value = (sides && (sides.A || sides.a || sides.sideA)) || '';
      if (bEl) bEl.value = (sides && (sides.B || sides.b || sides.sideB)) || '';
      if (cEl) cEl.value = (sides && (sides.C || sides.c || sides.sideC)) || '';
      if (dEl) dEl.value = (sides && (sides.D || sides.d || sides.sideD)) || '';
    }

    async function handleProductSubmit(e) {
      e.preventDefault();
      const products = Storage.getProducts();
      const rawEditId = (window.currentEditId != null && window.currentEditId !== '')
        ? window.currentEditId
        : document.getElementById('edit-id').value;
      const editIdNum = rawEditId !== '' && rawEditId != null ? parseInt(rawEditId) : NaN;
      const isEditing = Number.isFinite(editIdNum);
      const trackListingSides = getTrackListingSidesData();
      // Persist side info inside track_listing text using [Side X] markers so the
      // customer page can show only the sides that were filled in.
      const flattenedTrackListing = ['A', 'B', 'C', 'D']
        .map(function (k) { return { key: k, val: (trackListingSides[k] || '').trim() }; })
        .filter(function (s) { return s.val; })
        .map(function (s) { return '[Side ' + s.key + ']\n' + s.val; })
        .join('\n');
      ensureImageState();
      const urlImages = getImageUrlsFromForm();
      const uploadedImages = (window.uploadedImagesData || []).slice();
      const images = uploadedImages.concat(urlImages).filter(Boolean).filter(function (u, idx, arr) { return arr.indexOf(u) === idx; });
      const primaryImage = images[0] || urlImages[0] || 'https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=400&h=400&fit=crop';

      const productData = {
        id: isEditing ? editIdNum : Math.floor(Date.now() / 1000),
        title: Utils.escape(document.getElementById('f-title').value),
        artist: Utils.escape(document.getElementById('f-artist').value),
        category: document.getElementById('f-category').value,
        language: document.getElementById('f-language').value,
        price: parseInt(document.getElementById('f-price').value),
        originalPrice: parseInt(document.getElementById('f-original-price').value) || null,
        stock: parseInt(document.getElementById('f-stock').value),
        rating: parseFloat(document.getElementById('f-rating').value),
        image: primaryImage,
        images: images,
        description: Utils.escape(document.getElementById('f-description').value),
        musicDirector: Utils.escape(document.getElementById('f-music-director').value.trim()),
        trackListing: flattenedTrackListing,
        trackListingSides: trackListingSides,
        reviews: 0,
        // Homepage placement. Empty string is normalised to null so the DB
        // stores NULL rather than '' — initPageIndex() compares with === 'hot'
        // etc., and upsert_product() writes whatever it is given.
        //
        // This field was previously absent from the payload entirely, which
        // silently WIPED the badge every time a product was saved: the server
        // does REPLACE INTO with `badge => $p['badge'] ?? null`, so a missing
        // key blanked the column. Any product featured via CSV lost its
        // placement the first time someone edited it in the admin UI.
        badge: (document.getElementById('f-badge') || {}).value || null,
        // Stored as products.item_condition. Same reasoning as `badge` above:
        // omit the key and REPLACE INTO silently resets it to the default.
        condition: (document.getElementById('f-condition') || {}).value || 'new',
        subcategory: (document.getElementById('f-subcategory') || {}).value || null,
        freeShipping: (document.getElementById('f-free-shipping') || {}).value === '1',
        // Blank stays blank: null means "use the zone rate", which is NOT the
        // same as 0 ("charge nothing").
        shippingCharge: ((document.getElementById('f-shipping-charge') || {}).value || '').trim() || null,
        specs: getSpecificationsData()
      };

      // Match by id so an edit always updates the same row, never duplicates.
      const existingIdx = products.findIndex(p => p.id === productData.id);
      const isUpdate = existingIdx >= 0;
      const mergedProduct = isUpdate
        ? { ...products[existingIdx], ...productData }
        : productData;

      try {
        await Storage.upsertProduct(mergedProduct);
        window.currentEditId = null;
        showToast(isUpdate
          ? '<i class="fas fa-circle-check"></i> Product Updated Successfully'
          : '<i class="fas fa-rocket"></i> New Release Added to Catalog');
        closeProductModal();
        renderProductsTable();
      } catch (err) {
        recordSaveResult({ status: 'error', op: isUpdate ? 'update' : 'add', error: err.message });
        showToast('❌ Save failed: ' + err.message, 'danger');
      }
    }

    // editProduct now opens a dedicated Edit Release modal (not the Add modal).
    // The modal pre-fills with the product's current saved values; submitting
    // sends the merged record through Storage.upsertProduct (single-item POST).
    function editProduct(id) {
      openProductEditModal(id);
    }

    // ---- Edit Release modal: own state, own helpers ----
    function ensureEditImageState() {
      if (!Array.isArray(window.editUploadedImagesData)) window.editUploadedImagesData = [];
    }

    async function openProductEditModal(id) {
      const cached = Storage.getProducts().find(p => p.id === id);
      if (!cached) {
        showToast('⚠️ Product not found. Refresh and try again.', 'danger');
        return;
      }

      // Make sure category options exist before we try to set a value.
      renderCategorySelectors();

      const modal = document.getElementById('product-edit-modal');
      if (!modal) return;
      modal.style.display = 'flex';

      // Reset any stale state from a previous edit session. (Runs before the
      // detail fetch below so the form is blank — not showing a prior product's
      // values — during the brief load.)
      const form = document.getElementById('product-edit-form');
      if (form) form.reset();
      resetEditImageGallery();

      // The cached record comes from the LEAN /api/products.php list, which omits
      // heavy fields (description, specs, trackListing, full image gallery — see
      // the Phase 1 list/detail split). Fetch the full product so those fields
      // populate with the real saved values instead of showing blank.
      let product = cached;
      try {
        const res = await fetch(API_BASE + '/product.php?id=' + encodeURIComponent(id), { cache: 'no-store' });
        if (res.ok) {
          const full = await res.json();
          if (full && full.id != null) product = Object.assign({}, cached, full);
        } else {
          showToast('⚠️ Couldn\'t load full product details — specs & track listing may be blank.', 'danger');
        }
      } catch (e) {
        showToast('⚠️ Couldn\'t load full product details — specs & track listing may be blank.', 'danger');
      }

      document.getElementById('e-id').value = product.id;
      document.getElementById('e-title').value = product.title || '';
      document.getElementById('e-artist').value = product.artist || '';
      const catEl = document.getElementById('e-category');
      if (catEl) catEl.value = product.category || '';
      const langEl = document.getElementById('e-language');
      if (langEl) langEl.value = product.language || 'hindi';
      document.getElementById('e-price').value = product.price != null ? product.price : '';
      document.getElementById('e-original-price').value = product.originalPrice || '';
      document.getElementById('e-stock').value = Number.isFinite(product.stock) ? product.stock : 0;
      document.getElementById('e-rating').value = product.rating != null ? product.rating : 4.5;
      // Pre-select the product's current homepage placement. Without this the
      // select would always open on "Not featured", so saving an unrelated edit
      // would quietly demote a featured product.
      var eBadge = document.getElementById('e-badge');
      if (eBadge) eBadge.value = product.badge || '';
      var eCond = document.getElementById('e-condition');
      if (eCond) eCond.value = product.condition === 'pre-owned' ? 'pre-owned' : 'new';
      // Must run AFTER e-category has been set above, since the options shown
      // depend on the selected category.
      renderSubcategoryOptions('e', product.subcategory || null);
      var eFree = document.getElementById('e-free-shipping');
      if (eFree) eFree.value = product.freeShipping ? '1' : '0';
      var eChg = document.getElementById('e-shipping-charge');
      if (eChg) eChg.value = (product.shippingCharge === null || product.shippingCharge === undefined) ? '' : product.shippingCharge;
      toggleShippingCharge('e');
      document.getElementById('e-description').value = product.description || '';
      document.getElementById('e-music-director').value = product.musicDirector || '';

      setEditTrackListingSidesData(product);
      setEditSpecificationsData(product.specs || {});

      // Images: load every existing image (uploaded files AND any legacy
      // data:/external URLs) into the single visual gallery. New uploads append
      // to the same list. The first item is the cover. There is no separate
      // "Image URLs" text list in the edit modal anymore — everything is shown
      // as a thumbnail the admin can reorder (Set cover) or delete.
      ensureEditImageState();
      let imgs = [];
      if (Array.isArray(product.images) && product.images.length) imgs = product.images.slice();
      else if (product.image) imgs = [product.image];
      window.editUploadedImagesData = imgs.filter(Boolean)
        .filter((u, idx, arr) => arr.indexOf(u) === idx);
      renderEditImagePreviewGrid();

      setupEditDiscountListeners();
      calculateEditDiscount();
    }

    function closeProductEditModal() {
      const modal = document.getElementById('product-edit-modal');
      if (modal) modal.style.display = 'none';
      resetEditImageGallery();
    }

    function renderEditImagePreviewGrid() {
      ensureEditImageState();
      const grid = document.getElementById('image-preview-grid-edit');
      if (!grid) return;
      if (!window.editUploadedImagesData.length) {
        grid.style.display = 'none';
        grid.innerHTML = '';
        return;
      }
      grid.style.display = 'grid';
      grid.innerHTML = window.editUploadedImagesData.map((src, idx) => {
        const isCover = idx === 0;
        const coverBtn = isCover
          ? '<button type="button" class="img-action-btn" disabled style="opacity:0.7;cursor:default;">★ Cover</button>'
          : '<button type="button" class="img-action-btn" onclick="setEditCoverImageByIndex(' + idx + ')">Set cover</button>';
        return (
          '<div class="img-tile">' +
          '<img src="' + src + '" alt="Image ' + (idx + 1) + '">' +
          '<button type="button" class="img-delete-btn" title="Delete image" aria-label="Delete image" onclick="confirmRemoveEditImage(' + idx + ')">✕</button>' +
          '<div class="img-actions">' +
          coverBtn +
          '</div>' +
          '</div>'
        );
      }).join('');
    }

    function setEditCoverImageByIndex(idx) {
      ensureEditImageState();
      if (idx <= 0 || idx >= window.editUploadedImagesData.length) return;
      const item = window.editUploadedImagesData.splice(idx, 1)[0];
      window.editUploadedImagesData.unshift(item);
      renderEditImagePreviewGrid();
    }

    function removeEditUploadedImageByIndex(idx) {
      ensureEditImageState();
      if (idx < 0 || idx >= window.editUploadedImagesData.length) return;
      window.editUploadedImagesData.splice(idx, 1);
      renderEditImagePreviewGrid();
    }

    // Delete an image from the edit gallery, but only after the admin confirms.
    // The removal is staged in-memory — it isn't persisted until the admin
    // clicks "Update Product" (so the underlying file on disk is untouched and
    // a Cancel discards the change).
    async function confirmRemoveEditImage(idx) {
      ensureEditImageState();
      if (idx < 0 || idx >= window.editUploadedImagesData.length) return;
      const wasCover = idx === 0;
      const ok = await adminConfirm({
        title: 'Delete this image?',
        message: 'It will be removed from this product when you click "Update Product".'
          + (wasCover ? ' This is the current cover — the next image will become the cover.' : ''),
        confirmLabel: 'Delete image',
      });
      if (ok) removeEditUploadedImageByIndex(idx);
    }

    async function addEditFilesToGallery(fileList) {
      ensureEditImageState();
      const files = await ImageCropper.run(fileList);   // see addFilesToGallery
      if (!files.length) return;
      for (let i = 0; i < files.length; i++) {
        try {
          const dataUrl = await processImageFile(files[i]);
          if (window.editUploadedImagesData.indexOf(dataUrl) === -1) {
            window.editUploadedImagesData.push(dataUrl);
          }
        } catch (err) {
          if (String(err && err.message) === 'too_large') showToast('❌ One image exceeded 5MB (skipped)', 'danger');
          else showToast('❌ Failed to add an image (skipped)', 'danger');
        }
      }
      renderEditImagePreviewGrid();
    }

    function resetEditImageGallery() {
      const upload = document.getElementById('e-image-upload');
      if (upload) upload.value = '';
      window.editUploadedImagesData = [];
      renderEditImagePreviewGrid();
    }

    function getEditSpecificationsData() {
      const specs = {};
      const tracks = document.getElementById('e-tracks').value.trim();
      const label = document.getElementById('e-label').value.trim();
      const year = document.getElementById('e-year').value.trim();
      const genre = document.getElementById('e-genre').value.trim();
      const runtime = document.getElementById('e-runtime').value.trim();
      const theme = document.getElementById('e-theme').value.trim();
      if (tracks) specs.tracks = parseInt(tracks);
      if (label) specs.label = Utils.escape(label);
      if (year) specs.year = Utils.escape(year);
      if (genre) specs.genre = Utils.escape(genre);
      if (runtime) specs.runtime = Utils.escape(runtime);
      if (theme) specs.theme = Utils.escape(theme);
      return specs;
    }

    function setEditSpecificationsData(specs) {
      document.getElementById('e-tracks').value = specs.tracks || '';
      document.getElementById('e-label').value = specs.label || '';
      document.getElementById('e-year').value = specs.year || '';
      document.getElementById('e-genre').value = specs.genre || '';
      document.getElementById('e-runtime').value = specs.runtime || '';
      document.getElementById('e-theme').value = specs.theme || '';
    }

    function getEditTrackListingSidesData() {
      return {
        A: normalizeTrackLines((document.getElementById('e-track-side-a') || {}).value || ''),
        B: normalizeTrackLines((document.getElementById('e-track-side-b') || {}).value || ''),
        C: normalizeTrackLines((document.getElementById('e-track-side-c') || {}).value || ''),
        D: normalizeTrackLines((document.getElementById('e-track-side-d') || {}).value || ''),
      };
    }

    function setEditTrackListingSidesData(product) {
      let sides = (product && product.trackListingSides && typeof product.trackListingSides === 'object')
        ? product.trackListingSides
        : null;
      if (!sides && product && product.trackListing) {
        sides = parseSidesFromMarkers(product.trackListing);
      }
      if (!sides && product && product.trackListing) {
        const tracks = normalizeTrackLines(product.trackListing).split(/\r?\n/).map(t => t.trim()).filter(Boolean);
        if (tracks.length) {
          const sideCount = Math.min(4, tracks.length);
          const perSide = Math.ceil(tracks.length / sideCount);
          sides = { A: '', B: '', C: '', D: '' };
          for (let i = 0; i < sideCount; i++) {
            const slice = tracks.slice(i * perSide, (i + 1) * perSide);
            if (!slice.length) continue;
            sides[['A', 'B', 'C', 'D'][i]] = slice.join('\n');
          }
        }
      }
      document.getElementById('e-track-side-a').value = (sides && (sides.A || sides.a || sides.sideA)) || '';
      document.getElementById('e-track-side-b').value = (sides && (sides.B || sides.b || sides.sideB)) || '';
      document.getElementById('e-track-side-c').value = (sides && (sides.C || sides.c || sides.sideC)) || '';
      document.getElementById('e-track-side-d').value = (sides && (sides.D || sides.d || sides.sideD)) || '';
    }

    function calculateEditDiscount() {
      const orig = parseFloat(document.getElementById('e-original-price').value);
      const sell = parseFloat(document.getElementById('e-price').value);
      const display = document.getElementById('discount-display-edit');
      if (!display) return;
      const text = display.querySelector('.discount-text');
      if (!text) return;
      if (Number.isFinite(orig) && Number.isFinite(sell) && orig > sell && orig > 0) {
        const pct = Math.round(((orig - sell) / orig) * 100);
        text.textContent = pct + '% off (₹' + (orig - sell).toLocaleString() + ' saved)';
        text.classList.add('discount');
      } else {
        text.textContent = 'No discount';
        text.classList.remove('discount');
      }
    }

    function setupEditDiscountListeners() {
      const orig = document.getElementById('e-original-price');
      const sell = document.getElementById('e-price');
      if (!orig || !sell) return;
      orig.removeEventListener('input', calculateEditDiscount);
      sell.removeEventListener('input', calculateEditDiscount);
      orig.addEventListener('input', calculateEditDiscount);
      sell.addEventListener('input', calculateEditDiscount);
    }

    async function handleProductEditSubmit(e) {
      e.preventDefault();
      const products = Storage.getProducts();
      const editId = parseInt(document.getElementById('e-id').value);
      if (!Number.isFinite(editId)) {
        showToast('⚠️ Edit session lost. Re-open the edit modal.', 'danger');
        return;
      }
      const existingIdx = products.findIndex(p => p.id === editId);
      if (existingIdx < 0) {
        showToast('⚠️ Product no longer exists. It may have been deleted.', 'danger');
        closeProductEditModal();
        renderProductsTable();
        return;
      }

      const trackSides = getEditTrackListingSidesData();
      const flattenedTrackListing = ['A', 'B', 'C', 'D']
        .map(k => ({ key: k, val: (trackSides[k] || '').trim() }))
        .filter(s => s.val)
        .map(s => '[Side ' + s.key + ']\n' + s.val)
        .join('\n');

      ensureEditImageState();
      const images = (window.editUploadedImagesData || []).slice().filter(Boolean)
        .filter((u, idx, arr) => arr.indexOf(u) === idx);
      const fallbackImg = 'https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=400&h=400&fit=crop';
      const primaryImage = images[0] || products[existingIdx].image || fallbackImg;

      const stockVal = parseInt(document.getElementById('e-stock').value);
      const updates = {
        id: editId,
        title: Utils.escape(document.getElementById('e-title').value),
        artist: Utils.escape(document.getElementById('e-artist').value),
        category: document.getElementById('e-category').value,
        language: document.getElementById('e-language').value,
        price: parseInt(document.getElementById('e-price').value),
        originalPrice: parseInt(document.getElementById('e-original-price').value) || null,
        stock: Number.isFinite(stockVal) && stockVal >= 0 ? stockVal : 0,
        rating: parseFloat(document.getElementById('e-rating').value),
        image: primaryImage,
        images: images,
        description: Utils.escape(document.getElementById('e-description').value),
        musicDirector: Utils.escape(document.getElementById('e-music-director').value.trim()),
        trackListing: flattenedTrackListing,
        trackListingSides: trackSides,
        // See the note on `badge` in handleProductSubmit. It must be present in
        // this payload too: `merged` spreads updates over the existing row, so
        // omitting the key would leave the OLD badge in place and an admin
        // changing the value to "Not featured" would silently do nothing.
        badge: (document.getElementById('e-badge') || {}).value || null,
        condition: (document.getElementById('e-condition') || {}).value || 'new',
        subcategory: (document.getElementById('e-subcategory') || {}).value || null,
        freeShipping: (document.getElementById('e-free-shipping') || {}).value === '1',
        shippingCharge: ((document.getElementById('e-shipping-charge') || {}).value || '').trim() || null,
        specs: getEditSpecificationsData(),
      };

      const merged = { ...products[existingIdx], ...updates };
      try {
        await Storage.upsertProduct(merged);
        closeProductEditModal();
        renderProductsTable();
        showToast('<i class="fas fa-circle-check"></i> Product Updated Successfully');
      } catch (err) {
        recordSaveResult({ status: 'error', op: 'update', error: err.message });
        showToast('❌ Save failed: ' + err.message, 'danger');
      }
    }

    async function deleteProduct(id) {
      if (!confirm('Are you sure you want to delete this title?')) return;
      try {
        await Storage.deleteProduct(id);
        renderProductsTable();
        showToast('🗑 Product Removed from Catalog');
      } catch (err) {
        recordSaveResult({ status: 'error', op: 'delete', error: err.message });
        showToast('❌ Delete failed: ' + err.message, 'danger');
      }
    }

    // Promise-based styled confirmation popup. Resolves true on confirm, false
    // on cancel / overlay-click / ✕. Falls back to window.confirm() if the
    // #admin-confirm-modal markup is missing (defensive). Generic — currently
    // used by the image-delete flow; reuse for other admin confirmations.
    function adminConfirm(opts) {
      opts = opts || {};
      return new Promise(function (resolve) {
        const modal = document.getElementById('admin-confirm-modal');
        if (!modal) { resolve(window.confirm(opts.message || 'Are you sure?')); return; }
        const titleEl = document.getElementById('admin-confirm-title');
        const msgEl = document.getElementById('admin-confirm-message');
        const okBtn = document.getElementById('admin-confirm-ok');
        const cancelBtn = document.getElementById('admin-confirm-cancel');
        const closeX = document.getElementById('admin-confirm-close');
        if (titleEl) titleEl.textContent = opts.title || 'Are you sure?';
        if (msgEl) msgEl.textContent = opts.message || '';
        if (okBtn) {
          okBtn.textContent = opts.confirmLabel || 'Confirm';
          okBtn.className = 'btn ' + (opts.danger === false ? 'btn-primary' : 'btn-danger');
          okBtn.style.width = 'auto';
        }

        function cleanup(result) {
          modal.style.display = 'none';
          if (okBtn) okBtn.onclick = null;
          if (cancelBtn) cancelBtn.onclick = null;
          if (closeX) closeX.onclick = null;
          modal.onclick = null;
          resolve(result);
        }
        if (okBtn) okBtn.onclick = function () { cleanup(true); };
        if (cancelBtn) cancelBtn.onclick = function () { cleanup(false); };
        if (closeX) closeX.onclick = function () { cleanup(false); };
        modal.onclick = function (e) { if (e.target === modal) cleanup(false); };
        modal.style.display = 'flex';
      });
    }

    // =============================================
    // SUBCATEGORIES (Merchandise / Vinyl Care)
    // =============================================
    // Mirrors velorex_subcategories() in src/seo/seo-lib.php and Seo.SUBCATS in
    // src/js/seo.js. Three copies is one more than ideal, but the admin panel
    // does not load the storefront's seo.js and the server is the only one that
    // can validate — so this is the admin's local view of the same taxonomy.
    // If you add a subcategory, update all three.
    var ADMIN_SUBCATS = {
      merchandise: {
        't-shirts': 'T-Shirts', 'hoodies': 'Hoodies', 'caps': 'Caps',
        'tote-bags': 'Tote Bags', 'posters': 'Posters', 'stickers': 'Stickers',
        'mugs': 'Mugs', 'keychains': 'Keychains', 'slipmats': 'Slipmats'
      },
      'vinyl-care': {
        'record-cleaning-brush': 'Record Cleaning Brush',
        'carbon-fiber-brush': 'Carbon Fiber Brush',
        'record-cleaning-solution': 'Record Cleaning Solution',
        'microfiber-cloth': 'Microfiber Cloth',
        'anti-static-inner-sleeves': 'Anti-Static Inner Sleeves',
        'outer-protective-sleeves': 'Outer Protective Sleeves',
        'vinyl-storage-boxes': 'Vinyl Storage Boxes',
        'stylus-cleaning-gel': 'Stylus Cleaning Gel / Brush',
        'turntable-slipmats': 'Turntable Slipmats',
        'record-weight-clamp': 'Record Weight / Clamp'
      }
    };

    // Fill (and show/hide) the subcategory select for a given prefix — 'f' for
    // the New Product modal, 'e' for Edit. The wrapper is hidden entirely for
    // the five music formats, which have no subcategories, so the form does not
    // show a control that can never do anything.
    function renderSubcategoryOptions(prefix, selected) {
      var catEl  = document.getElementById(prefix + '-category');
      var subEl  = document.getElementById(prefix + '-subcategory');
      var wrap   = document.getElementById(prefix + '-subcategory-wrap');
      if (!catEl || !subEl || !wrap) return;

      var subs = ADMIN_SUBCATS[catEl.value];
      if (!subs) {
        wrap.style.display = 'none';
        subEl.innerHTML = '<option value="">— none —</option>';
        subEl.value = '';
        return;
      }
      wrap.style.display = '';
      subEl.innerHTML = '<option value="">— none —</option>'
        + Object.keys(subs).map(function (k) {
            return '<option value="' + escapeHTML(k) + '">' + escapeHTML(subs[k]) + '</option>';
          }).join('');
      // Only restore the previous value if it belongs to the newly chosen
      // category; otherwise switching category would leave a stale subcategory
      // attached to the product.
      subEl.value = (selected && subs[selected]) ? selected : '';
    }

    // Bind once, after the modals exist. Changing Category re-renders the
    // dependent select for that modal only.
    document.addEventListener('DOMContentLoaded', function () {
      ['f', 'e'].forEach(function (prefix) {
        var catEl = document.getElementById(prefix + '-category');
        if (catEl) {
          catEl.addEventListener('change', function () { renderSubcategoryOptions(prefix, null); });
        }
      });
    });

    // Hide the charge box when a product is marked free delivery — an amount
    // that will never be used is just a way to confuse the next admin.
    function toggleShippingCharge(prefix) {
      var sel = document.getElementById(prefix + '-free-shipping');
      var wrap = document.getElementById(prefix + '-shipping-charge-wrap');
      if (!sel || !wrap) return;
      wrap.style.display = sel.value === '1' ? 'none' : '';
    }
