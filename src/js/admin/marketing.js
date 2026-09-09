/* =============================================================================
   Velorex Music — admin Abandoned + Subscribers panels
   Used by: vlx-admin-2026.html

   Two panels, one file, because they are two views of the same question: who
   nearly bought something, and who may we email about it.

     panel-abandoned    — carts and checkouts that were walked away from
     panel-subscribers  — the newsletter list, split by consent

   THE ONE THING TO KEEP STRAIGHT
   On the subscribers table, "Opted in" and "Customer" are not decoration.
   They are the consent_at column and they decide what may lawfully be sent:
   an opted-in address may receive a campaign, a customer-only address may
   receive order and cart mail and nothing else. The export writes that
   distinction into a column so it survives the trip to any mail tool. Do not
   collapse the two to make the subscriber count look better.

   Cross-module touch points (resolved at runtime):
     - API_BASE, escapeHTML, showToast, Skeleton   (loaded earlier)
     - adminAuthHeaders                            (admin/main.js)
   ============================================================================= */

    // =============================================
    // ABANDONED CARTS + CHECKOUTS (panel-abandoned)
    // =============================================

    const AbandonState = {
      rows: [],
      stats: null,
      mailerReady: true,
      filter: 'all',
      loaded: false,
      busyKey: null,     // "kind:id" of the row whose action is in flight
    };

    function abandonRowKey(row) { return row.kind + ':' + row.id; }

    async function loadAbandoned() {
      const tbody = document.getElementById('abandoned-table-body');
      if (tbody) tbody.innerHTML = Skeleton.tableRows(5, 7);
      try {
        const res = await fetch(API_BASE + '/admin/abandoned.php', {
          cache: 'no-store',
          headers: { 'X-Admin-Pass': sessionStorage.getItem('admin_pass') || '' },
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'HTTP ' + res.status);
        }
        const data = await res.json();
        AbandonState.rows = Array.isArray(data.rows) ? data.rows : [];
        AbandonState.stats = data.stats || null;
        AbandonState.mailerReady = data.mailerReady !== false;
        AbandonState.loaded = true;
        renderAbandonedStats();
        renderAbandoned();
      } catch (e) {
        // An error must not look like an empty inbox. "No abandoned carts" and
        // "we could not ask" are opposite conclusions and the operator has to
        // be able to tell them apart — same rule as the dashboard cards.
        if (tbody) {
          tbody.innerHTML =
            '<tr><td colspan="7" style="padding:1.5rem;text-align:center;color:var(--danger);">'
          + 'Could not load abandoned carts: ' + escapeHTML(e.message)
          + ' <button type="button" class="btn btn-secondary btn-sm" style="width:auto;margin-left:0.75rem;" onclick="loadAbandoned()">Retry</button>'
          + '</td></tr>';
        }
        ['stat-ab-total', 'stat-ab-value', 'stat-ab-email', 'stat-ab-sent'].forEach(function (id) {
          const el = document.getElementById(id);
          if (el) el.textContent = '—';
        });
        const sub = document.getElementById('stat-ab-total-sub');
        if (sub) sub.textContent = 'Could not reach the server';
      }
    }

    function renderAbandonedStats() {
      const s = AbandonState.stats;
      const set = function (id, value, subId, subText) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
        const sEl = document.getElementById(subId);
        if (sEl) sEl.textContent = subText;
      };
      if (!s) return;

      // When nothing has aged into "abandoned" yet but baskets are open right
      // now, say so. Otherwise the panel reads as "nobody has a cart", which
      // is a different and wrong conclusion.
      const activeNote = (s.active || 0) > 0
        ? s.active + ' active now (not yet ' + s.graceMinutes + ' min quiet)'
        : null;

      set('stat-ab-total', String(s.total), 'stat-ab-total-sub',
          s.total === 0 && activeNote
            ? activeNote
            : s.checkouts + ' at payment · ' + s.carts + ' in cart'
              + (activeNote ? ' · ' + activeNote : ''));

      set('stat-ab-value', '₹' + Number(s.value || 0).toLocaleString('en-IN'), 'stat-ab-value-sub',
          'Quiet for ' + s.graceMinutes + '+ min, last ' + s.windowDays + ' days');

      const pct = s.total > 0 ? Math.round((s.withEmail / s.total) * 100) : 0;
      set('stat-ab-email', String(s.withEmail), 'stat-ab-email-sub',
          s.total > 0 ? pct + '% have an email on file' : 'Nothing to chase');

      const sent = AbandonState.rows.filter(function (r) { return (r.recoveryStage || 0) > 0; }).length;
      set('stat-ab-sent', String(sent), 'stat-ab-sent-sub',
          sent === 0 ? 'No reminders sent yet' : 'Reminder emails delivered');

      // Two conditions worth shouting about, because in both cases the panel
      // looks like it is working while quietly doing nothing.
      const warn = document.getElementById('abandoned-mailer-warning');
      if (warn) {
        const problems = [];
        if (!AbandonState.mailerReady) {
          problems.push('<strong>SMTP is not configured</strong>, so no recovery email can be sent — '
            + 'set the <code>SMTP_*</code> constants in the secrets file (CLAUDE.md §10).');
        }
        if (s.paymentOrdersReady === false) {
          problems.push('<strong>Checkout-stage recovery is unavailable</strong> — the recovery columns on '
            + '<code>payment_orders</code> could not be created. Only in-cart abandonment is listed.');
        }
        warn.innerHTML = problems.join('<br>');
        warn.style.display = problems.length ? 'block' : 'none';
      }
    }

    function setAbandonedFilter(filter) {
      AbandonState.filter = filter;
      document.querySelectorAll('#abandoned-chips .cust-chip').forEach(function (el) {
        el.classList.toggle('active', el.getAttribute('data-filter') === filter);
      });
      renderAbandoned();
    }

    function filteredAbandoned() {
      const f = AbandonState.filter;
      return AbandonState.rows.filter(function (r) {
        // Dismissed rows are hidden everywhere except their own chip. They are
        // rows the owner has already judged not worth chasing; leaving them in
        // the default view would slowly make the panel useless.
        if (f === 'dismissed') return !!r.dismissedAt;
        if (r.dismissedAt) return false;

        // Rows inside the grace window are NOT abandoned — someone may be
        // looking at that basket right now. They live behind their own chip
        // and are excluded from every other view, so "abandoned" keeps
        // meaning abandoned.
        if (f === 'active') return !!r.active;
        if (r.active) return false;

        if (f === 'checkout')    return r.kind === 'checkout';
        if (f === 'cart')        return r.kind === 'cart';
        if (f === 'contactable') return !!r.email;
        return true;
      });
    }

    // "3 hours ago" reads faster than a timestamp when the whole point of the
    // column is how cold the lead is.
    function abandonAgo(iso) {
      if (!iso) return '—';
      const then = new Date(String(iso).replace(' ', 'T'));
      if (isNaN(then.getTime())) return escapeHTML(String(iso));
      const mins = Math.floor((Date.now() - then.getTime()) / 60000);
      if (mins < 60)   return mins + ' min ago';
      const hours = Math.floor(mins / 60);
      if (hours < 24)  return hours + ' hour' + (hours === 1 ? '' : 's') + ' ago';
      const days = Math.floor(hours / 24);
      if (days < 30)   return days + ' day' + (days === 1 ? '' : 's') + ' ago';
      return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function renderAbandoned() {
      const tbody = document.getElementById('abandoned-table-body');
      const meta  = document.getElementById('abandoned-meta');
      if (!tbody) return;

      const rows = filteredAbandoned();

      if (!rows.length) {
        const s = AbandonState.stats || {};
        const grace = s.graceMinutes || 60;
        let empty;
        if (AbandonState.filter === 'dismissed') {
          empty = 'Nothing dismissed.';
        } else if (AbandonState.filter === 'active') {
          empty = 'No baskets open right now.';
        } else if ((s.active || 0) > 0) {
          // The case that made this panel look broken: carts exist, they are
          // just too fresh to count. Say which, and how to see them.
          empty = '<strong style="color:var(--text);">' + s.active + ' basket'
                + (s.active === 1 ? ' is' : 's are') + ' open right now</strong>, but nothing has been '
                + 'sitting untouched for ' + grace + ' minutes yet — so nothing counts as abandoned.'
                + '<div style="margin-top:0.6rem;font-size:0.85rem;">Someone may still be shopping. '
                + 'Check back later, or open <button type="button" class="btn btn-secondary btn-sm" '
                + 'style="width:auto;margin:0 0.25rem;" onclick="setAbandonedFilter(\'active\')">Active now</button> '
                + 'to see them.</div>';
        } else {
          empty = 'No abandoned carts, and no baskets open right now.';
        }
        tbody.innerHTML = '<tr><td colspan="7" style="padding:2rem;text-align:center;color:var(--text-muted);line-height:1.6;">'
          + empty + '</td></tr>';
        if (meta) meta.textContent = '';
        return;
      }

      tbody.innerHTML = rows.map(function (r) {
        const key     = abandonRowKey(r);
        const busy    = AbandonState.busyKey === key;
        const stage   = (r.kind === 'checkout'
          ? '<span class="badge-pill" style="background:rgba(255,107,53,0.16);color:#ff8a5c;">At payment</span>'
          : '<span class="badge-pill" style="background:rgba(120,140,255,0.16);color:#93a5ff;">In cart</span>')
          + (r.active
              ? '<div style="margin-top:0.35rem;font-size:0.7rem;color:#5ed99a;">'
                + '<i class="fas fa-circle" style="font-size:0.5em;vertical-align:middle;margin-right:0.3rem;"></i>Still active</div>'
              : '');

        const who = r.email
          ? '<div style="font-weight:600;">' + escapeHTML(r.name || r.email) + '</div>'
            + (r.name ? '<div style="font-size:0.78rem;color:var(--text-muted);">' + escapeHTML(r.email) + '</div>' : '')
            + (r.phone ? '<div style="font-size:0.75rem;color:var(--text-muted);">' + escapeHTML(r.phone) + '</div>' : '')
          : '<div style="color:var(--text-muted);font-style:italic;">Anonymous visitor</div>'
            + '<div style="font-size:0.72rem;color:var(--text-muted);">ref ' + escapeHTML(String(r.ref || '')) + '</div>';

        // The first title, plus a count. The full list is one hover away and
        // putting it inline would make every row four lines tall.
        const items = Array.isArray(r.items) ? r.items : [];
        const firstName = items.length && items[0] ? String(items[0].name || items[0].title || '') : '';
        const titles = items.map(function (i) {
          return (i.qty || 1) + ' x ' + String(i.name || i.title || '?');
        }).join('\n');
        const itemCell = items.length
          ? '<span title="' + escapeHTML(titles) + '" style="cursor:help;border-bottom:1px dotted var(--border);">'
            + escapeHTML(firstName.length > 28 ? firstName.slice(0, 27) + '…' : firstName)
            + (items.length > 1 ? ' <span style="color:var(--text-muted);">+' + (items.length - 1) + '</span>' : '')
            + '</span>'
          : '<span style="color:var(--text-muted);">—</span>';

        const reminders = (r.recoveryStage || 0) === 0
          ? '<span style="color:var(--text-muted);">None</span>'
          : escapeHTML(String(r.recoveryStage)) + ' sent'
            + (r.recoverySentAt ? '<div style="font-size:0.72rem;color:var(--text-muted);">' + abandonAgo(r.recoverySentAt) + '</div>' : '');

        // Why a Send button is unavailable is more useful than the button
        // simply not being there.
        let sendBtn;
        if (r.active) {
          // Emailing "you left this behind" to someone who is still on the
          // site is the fastest way to look automated and clumsy. The cron
          // will not touch this row either — it filters on the same window.
          sendBtn = '<button type="button" class="btn btn-secondary btn-sm" style="width:auto;" disabled '
            + 'title="This basket is still active — they may be shopping right now">Send</button>';
        } else if (!r.email) {
          sendBtn = '<button type="button" class="btn btn-secondary btn-sm" style="width:auto;" disabled title="No email address on file for this visitor">Send</button>';
        } else if ((r.recoveryStage || 0) >= 2) {
          sendBtn = '<button type="button" class="btn btn-secondary btn-sm" style="width:auto;" disabled title="Both reminders have already gone out — a third is how a shop lands in the spam folder">Send</button>';
        } else if (!AbandonState.mailerReady) {
          sendBtn = '<button type="button" class="btn btn-secondary btn-sm" style="width:auto;" disabled title="SMTP is not configured">Send</button>';
        } else {
          sendBtn = '<button type="button" class="btn btn-primary btn-sm" style="width:auto;"'
            + (busy ? ' disabled' : '')
            + ' onclick="sendAbandonedRecovery(' + JSON.stringify(r.kind) + ',' + JSON.stringify(String(r.id)) + ')">'
            + (busy ? 'Sending…' : 'Send') + '</button>';
        }

        const dismissBtn = r.dismissedAt
          ? '<button type="button" class="btn btn-secondary btn-sm" style="width:auto;" onclick="setAbandonedDismissed(' + JSON.stringify(r.kind) + ',' + JSON.stringify(String(r.id)) + ',false)">Restore</button>'
          : '<button type="button" class="btn btn-secondary btn-sm" style="width:auto;" onclick="setAbandonedDismissed(' + JSON.stringify(r.kind) + ',' + JSON.stringify(String(r.id)) + ',true)">Dismiss</button>';

        return '<tr' + (r.dismissedAt ? ' style="opacity:0.55;"' : '') + '>'
          + '<td>' + stage + '</td>'
          + '<td>' + who + '</td>'
          + '<td>' + itemCell + '<div style="font-size:0.72rem;color:var(--text-muted);">'
            + escapeHTML(String(r.itemCount || 0)) + ' item' + ((r.itemCount || 0) === 1 ? '' : 's') + '</div></td>'
          + '<td style="font-weight:700;white-space:nowrap;">₹' + Number(r.subtotal || 0).toLocaleString('en-IN') + '</td>'
          + '<td style="white-space:nowrap;">' + abandonAgo(r.lastActiveAt) + '</td>'
          + '<td>' + reminders + '</td>'
          + '<td><div style="display:flex;gap:0.4rem;flex-wrap:wrap;">' + sendBtn + dismissBtn + '</div></td>'
          + '</tr>';
      }).join('');

      if (meta) {
        meta.textContent = 'Showing ' + rows.length + ' of ' + AbandonState.rows.length + ' rows.';
      }
    }

    async function sendAbandonedRecovery(kind, id) {
      AbandonState.busyKey = kind + ':' + id;
      renderAbandoned();
      try {
        const res = await fetch(API_BASE + '/admin/abandoned.php', {
          method: 'POST',
          headers: adminAuthHeaders(),
          body: JSON.stringify({ action: 'send-recovery', kind: kind, id: id }),
        });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
        showToast('Reminder sent (stage ' + data.stage + ')', 'success');
      } catch (e) {
        showToast('Could not send: ' + e.message, 'error');
      } finally {
        AbandonState.busyKey = null;
        // Re-fetch rather than patching in place: the send advanced the stage
        // server-side, and a stale row would offer the same button again.
        loadAbandoned();
      }
    }

    async function setAbandonedDismissed(kind, id, dismissed) {
      try {
        const res = await fetch(API_BASE + '/admin/abandoned.php', {
          method: 'POST',
          headers: adminAuthHeaders(),
          body: JSON.stringify({ action: dismissed ? 'dismiss' : 'undismiss', kind: kind, id: id }),
        });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
        const row = AbandonState.rows.find(function (r) { return r.kind === kind && String(r.id) === String(id); });
        if (row) row.dismissedAt = dismissed ? new Date().toISOString() : null;
        renderAbandonedStats();
        renderAbandoned();
      } catch (e) {
        showToast('Could not update: ' + e.message, 'error');
      }
    }

    function exportAbandonedCsv() {
      const rows = filteredAbandoned();
      if (!rows.length) { showToast('Nothing to export in this view', 'error'); return; }
      const header = ['Stage', 'Name', 'Email', 'Phone', 'Items', 'Item count', 'Value (INR)',
                      'Last active', 'Reminders sent', 'Recovery link'];
      const body = rows.map(function (r) {
        const items = (Array.isArray(r.items) ? r.items : [])
          .map(function (i) { return (i.qty || 1) + ' x ' + String(i.name || i.title || '?'); })
          .join('; ');
        return [
          r.kind === 'checkout' ? 'Left at payment' : 'Left in cart',
          r.name || '', r.email || '', r.phone || '',
          items, r.itemCount || 0, r.subtotal || 0,
          r.lastActiveAt || '', r.recoveryStage || 0, r.recoveryUrl || '',
        ];
      });
      downloadCsv('velorex-abandoned-' + new Date().toISOString().slice(0, 10) + '.csv', header, body);
    }

    // =============================================
    // NEWSLETTER SUBSCRIBERS (panel-subscribers)
    // =============================================

    const SubState = {
      rows: [],
      stats: null,
      brevoReady: false,
      filter: 'all',
      loaded: false,
    };

    async function loadSubscribers() {
      const tbody = document.getElementById('subscribers-table-body');
      if (tbody) tbody.innerHTML = Skeleton.tableRows(5, 7);
      try {
        const res = await fetch(API_BASE + '/admin/subscribers.php', {
          cache: 'no-store',
          headers: { 'X-Admin-Pass': sessionStorage.getItem('admin_pass') || '' },
        });
        if (!res.ok) {
          const j = await res.json().catch(function () { return {}; });
          throw new Error(j.error || 'HTTP ' + res.status);
        }
        const data = await res.json();
        SubState.rows = Array.isArray(data.rows) ? data.rows : [];
        SubState.stats = data.stats || null;
        SubState.brevoReady = !!data.brevoReady;
        SubState.loaded = true;
        renderSubscriberStats();
        renderSubscribers();
      } catch (e) {
        if (tbody) {
          tbody.innerHTML =
            '<tr><td colspan="7" style="padding:1.5rem;text-align:center;color:var(--danger);">'
          + 'Could not load subscribers: ' + escapeHTML(e.message)
          + ' <button type="button" class="btn btn-secondary btn-sm" style="width:auto;margin-left:0.75rem;" onclick="loadSubscribers()">Retry</button>'
          + '</td></tr>';
        }
      }
    }

    function renderSubscriberStats() {
      const s = SubState.stats;
      const set = function (id, value, subId, subText) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
        const sEl = document.getElementById(subId);
        if (sEl) sEl.textContent = subText;
      };
      if (!s) return;

      set('stat-sub-total', String(s.subscribed), 'stat-sub-total-sub', 'Reachable addresses');
      set('stat-sub-optin', String(s.optedIn), 'stat-sub-optin-sub',
          s.customerOnly + ' more are customer-only');
      set('stat-sub-unsub', String(s.unsubscribed), 'stat-sub-unsub-sub',
          s.unsubscribed === 0 ? 'Nobody has opted out' : 'Never email these');

      const btn = document.getElementById('brevo-sync-btn');
      if (!SubState.brevoReady) {
        set('stat-sub-brevo', '—', 'stat-sub-brevo-sub', 'BREVO_API_KEY not set');
        if (btn) { btn.disabled = true; btn.title = 'Set BREVO_API_KEY in the secrets file to enable contact sync'; }
      } else {
        set('stat-sub-brevo', String(s.subscribed - s.brevoPending), 'stat-sub-brevo-sub',
            s.brevoPending === 0 ? 'All contacts pushed' : s.brevoPending + ' still to push');
        if (btn) { btn.disabled = false; btn.title = ''; }
      }
    }

    function setSubscribersFilter(filter) {
      SubState.filter = filter;
      document.querySelectorAll('#sub-chips .cust-chip').forEach(function (el) {
        el.classList.toggle('active', el.getAttribute('data-filter') === filter);
      });
      renderSubscribers();
    }

    function filteredSubscribers() {
      const q = String((document.getElementById('sub-search-input') || {}).value || '')
        .trim().toLowerCase();
      const f = SubState.filter;
      return SubState.rows.filter(function (r) {
        if (f === 'unsubscribed') { if (r.status !== 'unsubscribed') return false; }
        else if (r.status !== 'subscribed') return false;
        if (f === 'optedin'  && !r.optedIn) return false;
        if (f === 'customer' &&  r.optedIn) return false;
        if (q) {
          const hay = (r.email + ' ' + (r.name || '')).toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      });
    }

    function renderSubscribers() {
      const tbody = document.getElementById('subscribers-table-body');
      const meta  = document.getElementById('subscribers-meta');
      if (!tbody) return;

      const rows = filteredSubscribers();
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="padding:2rem;text-align:center;color:var(--text-muted);">'
          + (SubState.rows.length ? 'No subscribers match this view.' : 'No subscribers yet.')
          + '</td></tr>';
        if (meta) meta.textContent = '';
        return;
      }

      tbody.innerHTML = rows.map(function (r) {
        const consent = r.optedIn
          ? '<span class="badge-pill" style="background:rgba(46,204,113,0.16);color:#5ed99a;" title="Ticked a box asking for email — may receive campaigns">Opted in</span>'
          : '<span class="badge-pill" style="background:rgba(255,255,255,0.1);color:var(--text-muted);" title="We hold this address because they shopped. Order and cart mail only — NOT campaigns.">Customer</span>';

        const status = r.status === 'subscribed'
          ? '<span style="color:#5ed99a;">Subscribed</span>'
          : '<span style="color:var(--text-muted);">Unsubscribed</span>';

        const action = r.status === 'subscribed'
          ? '<button type="button" class="btn btn-secondary btn-sm" style="width:auto;" onclick="setSubscriberStatus(' + JSON.stringify(r.email) + ',false)">Unsubscribe</button>'
          : '<button type="button" class="btn btn-secondary btn-sm" style="width:auto;" onclick="setSubscriberStatus(' + JSON.stringify(r.email) + ',true)">Re-subscribe</button>';

        const added = r.createdAt
          ? new Date(String(r.createdAt).replace(' ', 'T')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
          : '—';

        return '<tr' + (r.status === 'unsubscribed' ? ' style="opacity:0.6;"' : '') + '>'
          + '<td style="font-weight:600;">' + escapeHTML(r.email) + '</td>'
          + '<td>' + (r.name ? escapeHTML(r.name) : '<span style="color:var(--text-muted);">—</span>') + '</td>'
          + '<td>' + consent + '</td>'
          + '<td style="color:var(--text-muted);">' + escapeHTML(r.source || '—') + '</td>'
          + '<td>' + status + '</td>'
          + '<td style="white-space:nowrap;color:var(--text-muted);">' + escapeHTML(added) + '</td>'
          + '<td>' + action + '</td>'
          + '</tr>';
      }).join('');

      if (meta) {
        meta.textContent = 'Showing ' + rows.length + ' of ' + SubState.rows.length + ' addresses.';
      }
    }

    async function setSubscriberStatus(email, subscribe) {
      try {
        const res = await fetch(API_BASE + '/admin/subscribers.php', {
          method: 'POST',
          headers: adminAuthHeaders(),
          body: JSON.stringify({ action: subscribe ? 'resubscribe' : 'unsubscribe', email: email }),
        });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
        showToast(subscribe ? 'Re-subscribed' : 'Unsubscribed', 'success');
        loadSubscribers();
      } catch (e) {
        showToast('Could not update: ' + e.message, 'error');
      }
    }

    async function resyncBrevo() {
      const btn = document.getElementById('brevo-sync-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
      try {
        const res = await fetch(API_BASE + '/admin/subscribers.php', {
          method: 'POST',
          headers: adminAuthHeaders(),
          body: JSON.stringify({ action: 'resync-brevo' }),
        });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
        showToast(
          data.synced + ' contact' + (data.synced === 1 ? '' : 's') + ' pushed to Brevo'
            + (data.remaining ? ' — click again to continue' : ''),
          'success'
        );
        loadSubscribers();
      } catch (e) {
        showToast('Brevo sync failed: ' + e.message, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-cloud-arrow-up"></i> Sync to Brevo'; }
      }
    }

    function exportSubscribersCsv() {
      const rows = filteredSubscribers();
      if (!rows.length) { showToast('Nothing to export in this view', 'error'); return; }
      // "Campaign safe" is the column a mail tool should filter on. Spelling it
      // out beats expecting whoever opens this file to remember what consent_at
      // meant three months from now.
      const header = ['Email', 'Name', 'Consent', 'Campaign safe', 'Source', 'Status', 'Added'];
      const body = rows.map(function (r) {
        return [
          r.email, r.name || '',
          r.optedIn ? 'Opted in' : 'Customer only',
          (r.optedIn && r.status === 'subscribed') ? 'YES' : 'NO',
          r.source || '', r.status, r.createdAt || '',
        ];
      });
      downloadCsv('velorex-subscribers-' + new Date().toISOString().slice(0, 10) + '.csv', header, body);
    }

    // =============================================
    // Shared CSV writer
    // =============================================
    // Excel decides a file's encoding from the BOM. Without it, a customer name
    // with an accent or a ₹ sign in an item list renders as mojibake, which is
    // exactly the kind of thing nobody notices until a list has been mailed.
    function downloadCsv(filename, header, rows) {
      const esc = function (v) {
        const s = String(v === null || v === undefined ? '' : v);
        return '"' + s.replace(/"/g, '""') + '"';
      };
      const csv = [header.map(esc).join(',')]
        .concat(rows.map(function (r) { return r.map(esc).join(','); }))
        .join('\r\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
