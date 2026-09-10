/* =============================================================================
   Velorex Music — admin Coupons panel (panel-coupons)
   Used by: vlx-admin-2026.html, driven from switchPanel('coupons')

   List + editor for discount codes. The rules these fields describe are
   enforced in api/_coupon_helpers.php, not here — the checks below exist to
   give a fast answer while typing, and api/admin/coupons.php re-validates
   everything on write. Same split as the rest of this codebase: the browser is
   allowed to be helpful, never authoritative.

   Cross-module touch points (resolved at runtime):
     - API_BASE, escapeHTML, showToast, adminAuthHeaders, adminConfirm
   ============================================================================= */

    const CouponState = {
      rows: [],
      loading: false,
      error: null,
      editing: null,   // the row being edited, or {} for a new one
    };

    function couponMoney(n) { return '₹' + (Number(n) || 0).toLocaleString('en-IN'); }

    async function loadCoupons() {
      if (CouponState.loading) return;
      CouponState.loading = true;
      CouponState.error = null;
      renderCoupons();
      try {
        const res = await fetch(API_BASE + '/admin/coupons.php', { headers: adminAuthHeaders() });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
        CouponState.rows = data.coupons || [];
      } catch (e) {
        CouponState.error = e.message;
      } finally {
        CouponState.loading = false;
        renderCoupons();
      }
    }

    // What the coupon is worth, as a human would say it.
    function couponValueLabel(c) {
      if (c.type === 'percent') {
        return c.value + '% off'
          + (c.maxDiscount ? ' <span class="cpn-sub">up to ' + couponMoney(c.maxDiscount) + '</span>' : '');
      }
      return couponMoney(c.value) + ' off';
    }

    // "Live", or the specific reason it is not — an owner looking at a code a
    // customer says is broken needs the reason, not a red dot.
    function couponStatusLabel(c) {
      if (c.status === 'disabled') return ['Disabled', 'var(--text-muted)'];
      const now = Date.now();
      if (c.startsAt && Date.parse(c.startsAt + 'T00:00:00') > now) return ['Scheduled', 'var(--info)'];
      if (c.expiresAt && Date.parse(c.expiresAt + 'T23:59:59') < now) return ['Expired', 'var(--danger)'];
      if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return ['Fully claimed', 'var(--warning)'];
      return ['Live', 'var(--success)'];
    }

    function renderCoupons() {
      const root = document.getElementById('coupons-body');
      if (!root) return;

      if (CouponState.error) {
        root.innerHTML = '<div class="dash-error"><strong>Could not load coupons.</strong><br>'
          + escapeHTML(CouponState.error)
          + '<div style="margin-top:1rem;"><button type="button" class="btn btn-primary" style="width:auto;"'
          + ' onclick="loadCoupons()">Retry</button></div></div>';
        return;
      }

      const rows = CouponState.rows;
      const table = rows.length
        ? '<div style="overflow-x:auto;"><table class="admin-table"><thead><tr>'
          + '<th>Code</th><th>Discount</th><th>Conditions</th><th>Used</th><th>Status</th><th>Actions</th>'
          + '</tr></thead><tbody>'
          + rows.map(function (c) {
              const st = couponStatusLabel(c);
              const conds = [];
              if (c.minOrder)     conds.push('Min ' + couponMoney(c.minOrder));
              if (c.perUserLimit) conds.push(c.perUserLimit + ' per customer');
              if (c.customerEmail) conds.push('Only ' + escapeHTML(c.customerEmail));
              if (c.startsAt)     conds.push('From ' + escapeHTML(c.startsAt));
              if (c.expiresAt)    conds.push('Until ' + escapeHTML(c.expiresAt));
              return '<tr>'
                + '<td><span class="cpn-code">' + escapeHTML(c.code) + '</span>'
                  + (c.featured ? '<span class="cpn-featured" title="Shown in the storefront promo">Promoted</span>' : '')
                + '</td>'
                + '<td>' + couponValueLabel(c) + '</td>'
                + '<td class="cpn-sub">' + (conds.length ? conds.join(' · ') : 'No conditions') + '</td>'
                + '<td>' + c.usedCount + (c.usageLimit !== null ? ' / ' + c.usageLimit : '') + '</td>'
                + '<td><span style="color:' + st[1] + ';font-weight:700;font-size:0.8rem;">' + st[0] + '</span></td>'
                + '<td><div style="display:flex;gap:0.4rem;flex-wrap:wrap;">'
                  + '<button type="button" class="btn btn-secondary btn-sm" style="width:auto;"'
                    + ' onclick="openCouponEditor(' + c.id + ')">Edit</button>'
                  + '<button type="button" class="btn btn-secondary btn-sm" style="width:auto;"'
                    + ' onclick="toggleCoupon(' + c.id + ',\'' + (c.status === 'active' ? 'disabled' : 'active') + '\')">'
                    + (c.status === 'active' ? 'Disable' : 'Enable') + '</button>'
                  + '<button type="button" class="btn btn-secondary btn-sm" style="width:auto;"'
                    + ' onclick="deleteCoupon(' + c.id + ')">Delete</button>'
                + '</div></td>'
                + '</tr>';
            }).join('')
          + '</tbody></table></div>'
        : '<p class="dash-empty">No coupons yet. Create one and it becomes usable at checkout immediately.</p>';

      root.innerHTML =
          '<div class="cpn-head">'
        +   '<p class="dash-empty" style="margin:0;max-width:64ch;">Codes are checked and applied on the server at '
        +     'checkout, so a discount shown in the cart is the discount charged. Discounts apply to goods only, '
        +     'never to delivery.</p>'
        +   '<button type="button" class="btn btn-primary" style="width:auto;" onclick="openCouponEditor(0)">'
        +     '<i class="fas fa-plus"></i> New coupon</button>'
        + '</div>'
        + table;
    }

    function openCouponEditor(id) {
      const c = id
        ? CouponState.rows.find(function (r) { return r.id === id; })
        : { id: 0, code: '', type: 'percent', value: 10, minOrder: 0, maxDiscount: null,
            usageLimit: null, perUserLimit: null, startsAt: '', expiresAt: '',
            status: 'active', featured: false, headline: '', customerEmail: '' };
      if (!c) return;
      CouponState.editing = c;

      const f = function (k, v) { return v === null || v === undefined ? '' : String(v); };
      const body = document.getElementById('coupon-editor-body');
      const title = document.getElementById('coupon-editor-title');
      if (title) title.textContent = id ? ('Edit ' + c.code) : 'New coupon';
      if (!body) return;

      body.innerHTML = ''
        + '<input type="hidden" id="cpn-id" value="' + (c.id || 0) + '">'
        + '<div class="form-grid">'
        +   '<div class="form-group">'
        +     '<label class="form-label">Code *</label>'
        +     '<input class="form-control cpn-upper" id="cpn-code" value="' + escapeHTML(f('code', c.code)) + '"'
        +       ' placeholder="SAVE10" autocomplete="off" spellcheck="false">'
        +     '<div class="set-error" id="cpn-code-err" hidden></div>'
        +   '</div>'
        +   '<div class="form-group">'
        +     '<label class="form-label">Type *</label>'
        +     '<select class="form-control" id="cpn-type" onchange="couponTypeChanged()">'
        +       '<option value="percent"' + (c.type === 'percent' ? ' selected' : '') + '>Percentage off</option>'
        +       '<option value="fixed"'   + (c.type === 'fixed'   ? ' selected' : '') + '>Fixed amount off</option>'
        +     '</select>'
        +   '</div>'
        +   '<div class="form-group">'
        +     '<label class="form-label" id="cpn-value-label">Percentage *</label>'
        +     '<input class="form-control" type="number" id="cpn-value" min="1" value="' + escapeHTML(f('value', c.value)) + '">'
        +     '<div class="set-error" id="cpn-value-err" hidden></div>'
        +   '</div>'
        +   '<div class="form-group" id="cpn-max-wrap">'
        +     '<label class="form-label">Maximum discount (₹)</label>'
        +     '<input class="form-control" type="number" id="cpn-maxDiscount" min="0"'
        +       ' value="' + escapeHTML(f('maxDiscount', c.maxDiscount)) + '" placeholder="No cap">'
        +     '<div class="set-help">Caps a percentage coupon. Ignored for a fixed amount.</div>'
        +   '</div>'
        +   '<div class="form-group">'
        +     '<label class="form-label">Minimum order (₹)</label>'
        +     '<input class="form-control" type="number" id="cpn-minOrder" min="0" value="' + escapeHTML(f('minOrder', c.minOrder)) + '">'
        +     '<div class="set-help">Checked against the goods subtotal, before delivery.</div>'
        +   '</div>'
        +   '<div class="form-group">'
        +     '<label class="form-label">Total uses</label>'
        +     '<input class="form-control" type="number" id="cpn-usageLimit" min="1"'
        +       ' value="' + escapeHTML(f('usageLimit', c.usageLimit)) + '" placeholder="Unlimited">'
        +   '</div>'
        +   '<div class="form-group">'
        +     '<label class="form-label">Uses per customer</label>'
        +     '<input class="form-control" type="number" id="cpn-perUserLimit" min="1"'
        +       ' value="' + escapeHTML(f('perUserLimit', c.perUserLimit)) + '" placeholder="Unlimited">'
        +     '<div class="set-help">Counted against the signed-in account, or the email used at guest checkout.</div>'
        +   '</div>'
        +   '<div class="form-group">'
        +     '<label class="form-label">Starts</label>'
        +     '<input class="form-control" type="date" id="cpn-startsAt" value="' + escapeHTML(f('startsAt', c.startsAt)) + '">'
        +     '<div class="set-error" id="cpn-startsAt-err" hidden></div>'
        +   '</div>'
        +   '<div class="form-group">'
        +     '<label class="form-label">Expires</label>'
        +     '<input class="form-control" type="date" id="cpn-expiresAt" value="' + escapeHTML(f('expiresAt', c.expiresAt)) + '">'
        +     '<div class="set-help">Runs to the end of that day.</div>'
        +     '<div class="set-error" id="cpn-expiresAt-err" hidden></div>'
        +   '</div>'
        +   '<div class="form-group full-width">'
        +     '<label class="form-label">Reserve for one customer (optional)</label>'
        +     '<input class="form-control" type="email" id="cpn-customerEmail"'
        +       ' value="' + escapeHTML(f('customerEmail', c.customerEmail)) + '"'
        +       ' placeholder="Anyone can use this code" autocomplete="off">'
        +     '<div class="set-help">Enter a customer email and only they can redeem it — matched against '
        +       'their signed-in account, or the address they type at guest checkout. Leave blank for a '
        +       'public code. A reserved code is never shown in the storefront promo.</div>'
        +     '<div class="set-error" id="cpn-customerEmail-err" hidden></div>'
        +   '</div>'
        +   '<div class="form-group full-width">'
        +     '<label class="form-label">Promo headline</label>'
        +     '<input class="form-control" id="cpn-headline" maxlength="120"'
        +       ' value="' + escapeHTML(f('headline', c.headline)) + '" placeholder="10% off your first order">'
        +     '<div class="set-help">Shown on the storefront promo card. Left blank, it is generated from the discount.</div>'
        +   '</div>'
        +   '<div class="form-group full-width">'
        +     '<label class="set-toggle" for="cpn-featured">'
        +       '<input type="checkbox" id="cpn-featured"' + (c.featured ? ' checked' : '') + '>'
        +       '<span class="set-label">Show this coupon in the storefront promo</span>'
        +     '</label>'
        +     '<div class="set-help">Only one coupon is promoted at a time — turning this on turns it off elsewhere.</div>'
        +   '</div>'
        + '</div>';

      couponTypeChanged();
      const modal = document.getElementById('coupon-editor-modal');
      if (modal) modal.style.display = 'flex';
    }

    // A percentage cap is meaningless on a fixed amount, so the field goes away
    // rather than sitting there doing nothing.
    function couponTypeChanged() {
      const type = (document.getElementById('cpn-type') || {}).value;
      const wrap = document.getElementById('cpn-max-wrap');
      const label = document.getElementById('cpn-value-label');
      if (wrap)  wrap.style.display = type === 'percent' ? '' : 'none';
      if (label) label.textContent  = type === 'percent' ? 'Percentage *' : 'Amount off (₹) *';
    }

    function closeCouponEditor() {
      const modal = document.getElementById('coupon-editor-modal');
      if (modal) modal.style.display = 'none';
      CouponState.editing = null;
    }

    async function saveCoupon() {
      const btn = document.getElementById('coupon-save');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      document.querySelectorAll('#coupon-editor-body .set-error').forEach(function (el) {
        el.hidden = true; el.textContent = '';
      });

      const val = function (id) { const e = document.getElementById(id); return e ? e.value : ''; };
      const coupon = {
        id:           parseInt(val('cpn-id'), 10) || 0,
        code:         val('cpn-code'),
        type:         val('cpn-type'),
        value:        val('cpn-value'),
        minOrder:     val('cpn-minOrder'),
        maxDiscount:  val('cpn-maxDiscount'),
        usageLimit:   val('cpn-usageLimit'),
        perUserLimit: val('cpn-perUserLimit'),
        startsAt:     val('cpn-startsAt'),
        expiresAt:    val('cpn-expiresAt'),
        headline:     val('cpn-headline'),
        customerEmail: val('cpn-customerEmail'),
        featured:     (document.getElementById('cpn-featured') || {}).checked === true,
        status:       'active',
      };

      try {
        const res = await fetch(API_BASE + '/admin/coupons.php', {
          method: 'POST',
          headers: adminAuthHeaders(),
          body: JSON.stringify({ coupon: coupon }),
        });
        const data = await res.json().catch(function () { return {}; });

        if (res.status === 422 && data.errors) {
          Object.keys(data.errors).forEach(function (k) {
            const el = document.getElementById('cpn-' + k + '-err');
            if (el) { el.textContent = data.errors[k]; el.hidden = false; }
          });
          showToast(data.error || 'Please fix the highlighted fields', 'error');
          return;
        }
        if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);

        showToast('Coupon saved', 'success');
        closeCouponEditor();
        loadCoupons();
      } catch (e) {
        showToast('Could not save: ' + e.message, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Save coupon'; }
      }
    }

    async function toggleCoupon(id, status) {
      try {
        const res = await fetch(API_BASE + '/admin/coupons.php', {
          method: 'POST',
          headers: adminAuthHeaders(),
          body: JSON.stringify({ action: 'toggle', id: id, status: status }),
        });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
        loadCoupons();
      } catch (e) {
        showToast('Could not update: ' + e.message, 'error');
      }
    }

    function deleteCoupon(id) {
      const c = CouponState.rows.find(function (r) { return r.id === id; });
      if (!c) return;
      // Deleting is not the same as disabling, and the difference matters when
      // a code is in circulation — say so rather than just asking "are you
      // sure?".
      const msg = c.usedCount > 0
        ? 'Delete ' + c.code + '? It has been used ' + c.usedCount + ' time'
          + (c.usedCount === 1 ? '' : 's') + '. Past orders keep their discount, but anyone '
          + 'holding this code will be told it is invalid. Disabling it does the same thing reversibly.'
        : 'Delete ' + c.code + '? Anyone holding this code will be told it is invalid.';

      // adminConfirm() from admin/inventory.js — the admin's own promise-based
      // dialog, not the storefront's openConfirmDialog.
      adminConfirm({
        title: 'Delete coupon',
        message: msg,
        confirmLabel: 'Delete coupon',
      }).then(async function (ok) {
        if (!ok) return;
        try {
          const res = await fetch(API_BASE + '/admin/coupons.php?id=' + encodeURIComponent(id), {
            method: 'DELETE',
            headers: adminAuthHeaders(),
          });
          const data = await res.json().catch(function () { return {}; });
          if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
          showToast('Coupon deleted', 'success');
          loadCoupons();
        } catch (e) {
          showToast('Could not delete: ' + e.message, 'error');
        }
      });
    }
