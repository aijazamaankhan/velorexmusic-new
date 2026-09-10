/* =============================================================================
   Velorex Music — admin Settings panel (panel-settings)
   Used by: vlx-admin-2026.html, driven from switchPanel('settings')

   The panel used to be three hardcoded <input> values and a "Save Settings"
   button with no handler at all. It looked like configuration and configured
   nothing — type into it, click Save, nothing happened and nothing said so.

   THE FORM IS RENDERED FROM THE SERVER'S SCHEMA, not written out by hand here.
   /api/admin/settings.php sends the field list, types, groups, bounds and help
   text from settings_schema() in api/_settings_helpers.php, so adding a setting
   means editing that one PHP file — the input, its validation and its help
   text all follow. A hand-written form here would drift from the validator the
   first time anyone added a field, and the failure mode of that drift is a
   control that silently does nothing, which is the exact bug being fixed.

   Cross-module touch points (resolved at runtime):
     - API_BASE, escapeHTML, showToast, adminAuthHeaders
   ============================================================================= */

    const SettingsState = {
      schema: null,
      values: null,
      environment: null,
      loading: false,
      saving: false,
      error: null,
      dirty: false,
    };

    async function loadSettings() {
      if (SettingsState.loading) return;
      SettingsState.loading = true;
      SettingsState.error = null;
      renderSettings();
      try {
        const res = await fetch(API_BASE + '/admin/settings.php', { headers: adminAuthHeaders() });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
        SettingsState.schema      = data.schema;
        SettingsState.values      = data.values;
        SettingsState.environment = data.environment;
        SettingsState.dirty       = false;
      } catch (e) {
        SettingsState.error = e.message;
      } finally {
        SettingsState.loading = false;
        renderSettings();
      }
    }

    function settingsField(key, spec, value) {
      const id   = 'set-' + key;
      const help = spec.help
        ? '<div class="set-help">' + escapeHTML(spec.help) + '</div>'
        : '';

      if (spec.type === 'bool') {
        // A real checkbox, not a styled div: it is keyboard-reachable and
        // announced correctly for free.
        return ''
          + '<div class="set-row set-row-bool">'
          +   '<label class="set-toggle" for="' + id + '">'
          +     '<input type="checkbox" id="' + id + '" data-key="' + escapeHTML(key) + '"'
          +       (value ? ' checked' : '') + ' onchange="markSettingsDirty()">'
          +     '<span class="set-label">' + escapeHTML(spec.label) + '</span>'
          +   '</label>'
          +   help
          + '</div>';
      }

      const inputType = spec.type === 'int' ? 'number'
                      : spec.type === 'email' ? 'email'
                      : 'text';
      const bounds = (spec.type === 'int')
        ? (spec.min !== null ? ' min="' + spec.min + '"' : '')
          + (spec.max !== null ? ' max="' + spec.max + '"' : '')
        : (spec.max !== null && spec.type !== 'int' ? ' maxlength="' + spec.max + '"' : '');

      return ''
        + '<div class="set-row">'
        +   '<label class="set-label" for="' + id + '">' + escapeHTML(spec.label) + '</label>'
        +   '<input class="form-control" type="' + inputType + '" id="' + id + '"'
        +     ' data-key="' + escapeHTML(key) + '"' + bounds
        +     ' value="' + escapeHTML(String(value === null || value === undefined ? '' : value)) + '"'
        +     ' oninput="markSettingsDirty()">'
        +   '<div class="set-error" id="' + id + '-err" hidden></div>'
        +   help
        + '</div>';
    }

    function markSettingsDirty() {
      SettingsState.dirty = true;
      const btn = document.getElementById('settings-save');
      if (btn) { btn.disabled = false; btn.textContent = 'Save settings'; }
      const note = document.getElementById('settings-saved-note');
      if (note) note.hidden = true;
    }

    function renderSettings() {
      const root = document.getElementById('settings-body');
      if (!root) return;

      if (SettingsState.error) {
        root.innerHTML = '<div class="dash-error"><strong>Could not load settings.</strong><br>'
          + escapeHTML(SettingsState.error)
          + '<div style="margin-top:1rem;"><button type="button" class="btn btn-primary" style="width:auto;"'
          + ' onclick="loadSettings()">Retry</button></div></div>';
        return;
      }
      if (!SettingsState.schema) {
        root.innerHTML = '<p class="dash-empty">Loading settings…</p>';
        return;
      }

      // Group the flat schema into the sections it declares.
      const groups = {};
      const order  = [];
      Object.keys(SettingsState.schema).forEach(function (key) {
        const spec = SettingsState.schema[key];
        const g = spec.group || 'Other';
        if (!groups[g]) { groups[g] = []; order.push(g); }
        groups[g].push([key, spec]);
      });

      const sections = order.map(function (g) {
        return '<section class="admin-card dash-panel set-group">'
          + '<h3 class="dash-panel-title">' + escapeHTML(g) + '</h3>'
          + groups[g].map(function (pair) {
              return settingsField(pair[0], pair[1], SettingsState.values[pair[0]]);
            }).join('')
          + '</section>';
      }).join('');

      // ---- Environment (read-only) -------------------------------------------
      // From the secrets file, not the database. Here because "is email
      // configured" and "are we on live keys" were previously answerable only
      // by SSHing in and reading a PHP file. Reports whether a secret is SET,
      // never what it is.
      const env = SettingsState.environment || {};
      const envRow = function (label, ok, detail) {
        const colour = ok ? 'var(--success)' : 'var(--danger)';
        const icon   = ok ? 'fa-circle-check' : 'fa-circle-exclamation';
        return '<li><i class="fas ' + icon + '" style="color:' + colour + ';width:1.1rem;"></i> '
          + '<span class="dash-list-name">' + escapeHTML(label)
          + '<span class="dash-list-sub">' + escapeHTML(detail || '') + '</span></span></li>';
      };

      const envHtml = '<section class="admin-card dash-panel">'
        + '<h3 class="dash-panel-title">Environment</h3>'
        + '<p class="set-help" style="margin:-0.5rem 0 1rem;">Read-only. These come from the secrets file on the '
        + 'server, not from this panel — change them over SSH or in hPanel. Whether a secret is set is shown; '
        + 'its value never is.</p>'
        + '<ul class="dash-list dash-health">'
        +   envRow('Transactional email', !!env.smtpConfigured,
              env.smtpConfigured
                ? (env.smtpHost || 'SMTP configured') + (env.smtpFrom ? ' · from ' + env.smtpFrom : '')
                : 'SMTP_HOST / SMTP_USER / SMTP_PASS not set — no receipt or reminder can send')
        +   envRow('Payments', !!env.razorpayMode,
              env.razorpayMode
                ? 'Razorpay in ' + env.razorpayMode + ' mode'
                : 'RAZORPAY_MODE is not set — checkout will fail')
        +   envRow('Order alerts', !!env.adminNotify,
              env.adminNotify || 'ADMIN_NOTIFY_EMAIL not set — nobody is emailed when an order lands')
        +   envRow('Brevo contact sync', !!env.brevoConfigured,
              env.brevoConfigured
                ? 'BREVO_API_KEY set — newsletter signups sync to Brevo'
                : 'Optional. Signups are still stored locally without it')
        + '</ul>'
        + '<p class="set-help" style="margin-top:1rem;">PHP ' + escapeHTML(String(env.phpVersion || '—')) + '</p>'
        + '</section>';

      root.innerHTML = sections + envHtml
        + '<div class="set-actions">'
        +   '<button type="button" class="btn btn-primary" id="settings-save" style="width:auto;"'
        +     (SettingsState.dirty ? '' : ' disabled') + ' onclick="saveSettings()">'
        +     (SettingsState.dirty ? 'Save settings' : 'Saved')
        +   '</button>'
        +   '<span id="settings-saved-note" class="set-saved" hidden>Saved. Storefront changes appear within a minute.</span>'
        + '</div>';
    }

    async function saveSettings() {
      if (SettingsState.saving) return;
      const btn = document.getElementById('settings-save');
      SettingsState.saving = true;
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

      // Clear any previous per-field errors before re-validating.
      document.querySelectorAll('#settings-body .set-error').forEach(function (el) {
        el.hidden = true; el.textContent = '';
      });

      const values = {};
      document.querySelectorAll('#settings-body [data-key]').forEach(function (el) {
        values[el.getAttribute('data-key')] = (el.type === 'checkbox') ? el.checked : el.value;
      });

      try {
        const res = await fetch(API_BASE + '/admin/settings.php', {
          method: 'POST',
          headers: adminAuthHeaders(),
          body: JSON.stringify({ values: values }),
        });
        const data = await res.json().catch(function () { return {}; });

        if (res.status === 422 && data.errors) {
          // Per-field, next to the field. A toast saying "invalid" without
          // saying which of eleven fields is useless.
          Object.keys(data.errors).forEach(function (key) {
            const err = document.getElementById('set-' + key + '-err');
            if (err) { err.textContent = data.errors[key]; err.hidden = false; }
          });
          showToast('Some settings were not saved — see the fields marked below', 'error');
          if (btn) { btn.disabled = false; btn.textContent = 'Save settings'; }
          return;
        }
        if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);

        // Re-render from what the SERVER now holds, not from what was typed:
        // the server clamps ints to their bounds and trims strings, so echoing
        // the form back would show a value that is not what was stored.
        SettingsState.values = data.values;
        SettingsState.dirty  = false;
        renderSettings();
        const note = document.getElementById('settings-saved-note');
        if (note) note.hidden = false;
        showToast('Settings saved', 'success');
      } catch (e) {
        showToast('Could not save: ' + e.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Save settings'; }
      } finally {
        SettingsState.saving = false;
      }
    }
