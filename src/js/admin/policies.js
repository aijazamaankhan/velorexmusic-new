/* =============================================================================
   Velorex Music — admin Policies panel (panel-policies)
   Used by: vlx-admin-2026.html, driven from switchPanel('policies')

   Edits the body of the shipping, returns, terms and privacy pages. Only the
   body: the <head>, the SEO tags and the page chrome stay in the static file
   and are never touched, which is why making these editable carried no SEO risk
   (see api/_policy_helpers.php).

   The editor is the SAME contenteditable + execCommand approach the blog uses,
   and reuses the blog's toolbar helpers rather than getting its own. Two rich
   editors in one admin would be two sets of paste bugs to fix.

   THE SANITISED HTML IS ECHOED BACK ON SAVE and re-rendered into the editor. If
   the server's allowlist stripped something, the person editing sees it
   immediately instead of discovering it on the live page.

   Cross-module touch points (resolved at runtime):
     - API_BASE, escapeHTML, showToast, adminAuthHeaders, adminConfirm
     - blogExec, blogFormatBlock, blogHandlePaste   (admin/blog.js)
   ============================================================================= */

    const PolicyState = {
      pages: [],
      active: null,   // slug
      loading: false,
      error: null,
      dirty: false,
    };

    async function loadPolicies() {
      if (PolicyState.loading) return;
      PolicyState.loading = true;
      PolicyState.error = null;
      renderPolicies();
      try {
        const res = await fetch(API_BASE + '/admin/policies.php', { headers: adminAuthHeaders() });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
        PolicyState.pages = data.pages || [];
        if (!PolicyState.active && PolicyState.pages.length) {
          PolicyState.active = PolicyState.pages[0].slug;
        }
        PolicyState.dirty = false;
      } catch (e) {
        PolicyState.error = e.message;
      } finally {
        PolicyState.loading = false;
        renderPolicies();
      }
    }

    function policyActive() {
      return PolicyState.pages.find(function (p) { return p.slug === PolicyState.active; }) || null;
    }

    function selectPolicy(slug) {
      // Switching away from unsaved work silently would lose it.
      if (PolicyState.dirty) {
        adminConfirm({
          title: 'Discard changes?',
          message: 'You have unsaved edits to this policy page. Switching pages will lose them.',
          confirmLabel: 'Discard',
        }).then(function (ok) {
          if (!ok) return;
          PolicyState.dirty = false;
          PolicyState.active = slug;
          renderPolicies();
        });
        return;
      }
      PolicyState.active = slug;
      renderPolicies();
    }

    function markPolicyDirty() {
      PolicyState.dirty = true;
      const btn = document.getElementById('policy-save');
      if (btn) { btn.disabled = false; btn.textContent = 'Save changes'; }
    }

    function renderPolicies() {
      const root = document.getElementById('policies-body');
      if (!root) return;

      if (PolicyState.error) {
        root.innerHTML = '<div class="dash-error"><strong>Could not load the policy pages.</strong><br>'
          + escapeHTML(PolicyState.error)
          + '<div style="margin-top:1rem;"><button type="button" class="btn btn-primary" style="width:auto;"'
          + ' onclick="loadPolicies()">Retry</button></div></div>';
        return;
      }
      if (!PolicyState.pages.length) {
        root.innerHTML = '<p class="dash-empty">Loading policy pages…</p>';
        return;
      }

      const active = policyActive();
      const tabs = PolicyState.pages.map(function (p) {
        return '<button type="button" class="cust-chip' + (p.slug === PolicyState.active ? ' active' : '') + '"'
          + ' onclick="selectPolicy(\'' + p.slug + '\')">' + escapeHTML(p.label)
          + (p.overridden ? ' <span class="pol-edited" title="Edited from the version in the code">•</span>' : '')
          + '</button>';
      }).join('');

      root.innerHTML =
          '<div class="cust-chips" style="margin-bottom:1.25rem;">' + tabs + '</div>'
        + (active ? ''
            + '<section class="admin-card dash-panel">'
            +   '<div class="pol-head">'
            +     '<div>'
            +       '<h3 class="dash-panel-title" style="margin-bottom:0.25rem;">' + escapeHTML(active.label) + '</h3>'
            +       '<a class="pol-url" href="' + escapeHTML(active.url) + '" target="_blank" rel="noopener">'
            +         escapeHTML(active.url) + ' <i class="fas fa-arrow-up-right-from-square"></i></a>'
            +     '</div>'
            +     (active.overridden
                    ? '<button type="button" class="btn btn-secondary" style="width:auto;"'
                      + ' onclick="resetPolicy()">Reset to default</button>'
                    : '<span class="pol-default">Showing the version in the code</span>')
            +   '</div>'
            +   '<p class="set-help" style="max-width:70ch;margin:0 0 1rem;">Edit the body of the page. The '
            +     'page title, description and everything else search engines read stay exactly as they are. '
            +     'Formatting is limited to what the storefront can safely render — anything else is stripped '
            +     'when you save, and you will see the result here.</p>'
            +   '<div class="blog-toolbar">'
            +     '<button type="button" onclick="blogFormatBlock(\'h2\')" title="Heading">H2</button>'
            +     '<button type="button" onclick="blogFormatBlock(\'h3\')" title="Sub-heading">H3</button>'
            +     '<button type="button" onclick="blogFormatBlock(\'p\')" title="Paragraph">P</button>'
            +     '<span class="blog-toolbar-sep"></span>'
            +     '<button type="button" onclick="blogExec(\'bold\')" title="Bold"><b>B</b></button>'
            +     '<button type="button" onclick="blogExec(\'italic\')" title="Italic"><i>I</i></button>'
            +     '<span class="blog-toolbar-sep"></span>'
            +     '<button type="button" onclick="blogExec(\'insertUnorderedList\')" title="Bullet list">&bull; List</button>'
            +     '<button type="button" onclick="blogExec(\'insertOrderedList\')" title="Numbered list">1. List</button>'
            +     '<span class="blog-toolbar-sep"></span>'
            +     '<button type="button" onclick="policyInsertLink()" title="Link">Link</button>'
            +   '</div>'
            +   '<div class="blog-editor" id="policy-editor" contenteditable="true"'
            +     ' onpaste="blogHandlePaste(event)" oninput="markPolicyDirty()"></div>'
            +   '<div class="set-actions">'
            +     '<button type="button" class="btn btn-primary" id="policy-save" style="width:auto;"'
            +       (PolicyState.dirty ? '' : ' disabled') + ' onclick="savePolicy()">'
            +       (PolicyState.dirty ? 'Save changes' : 'Saved') + '</button>'
            +   '</div>'
            + '</section>'
          : '');

      // Set the body as HTML AFTER innerHTML, not inside the template string —
      // otherwise the policy markup would be parsed as part of this panel's own
      // markup and could close its containers.
      const ed = document.getElementById('policy-editor');
      if (ed && active) ed.innerHTML = active.html || '';
    }

    // The blog's link prompt allows any URL because a post may cite one. A
    // policy page links to our own pages, so anything else is almost certainly a
    // mistake — and href is a place a bad scheme matters.
    function policyInsertLink() {
      const url = prompt('Link URL (a path like /returns.html, or https://…)');
      if (!url) return;
      const clean = url.trim();
      if (!/^(https?:\/\/|\/|mailto:)/i.test(clean)) {
        showToast('Use a path starting with /, an https:// URL, or mailto:', 'error');
        return;
      }
      blogExec('createLink', clean);
      markPolicyDirty();
    }

    async function savePolicy() {
      const active = policyActive();
      const ed = document.getElementById('policy-editor');
      if (!active || !ed) return;

      const btn = document.getElementById('policy-save');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

      try {
        const res = await fetch(API_BASE + '/admin/policies.php', {
          method: 'POST',
          headers: adminAuthHeaders(),
          body: JSON.stringify({ slug: active.slug, html: ed.innerHTML }),
        });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);

        // Adopt the SANITISED html the server stored.
        active.html = data.html;
        active.overridden = true;
        PolicyState.dirty = false;
        renderPolicies();
        showToast('Policy saved — the live page updates within a couple of minutes', 'success');
      } catch (e) {
        showToast('Could not save: ' + e.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Save changes'; }
      }
    }

    function resetPolicy() {
      const active = policyActive();
      if (!active) return;
      adminConfirm({
        title: 'Reset ' + active.label + '?',
        message: 'This discards your edits and puts back the version that ships in the code. '
          + 'It cannot be undone.',
        confirmLabel: 'Reset page',
      }).then(async function (ok) {
        if (!ok) return;
        try {
          const res = await fetch(API_BASE + '/admin/policies.php', {
            method: 'POST',
            headers: adminAuthHeaders(),
            body: JSON.stringify({ action: 'reset', slug: active.slug }),
          });
          const data = await res.json().catch(function () { return {}; });
          if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
          active.html = data.html;
          active.overridden = false;
          PolicyState.dirty = false;
          renderPolicies();
          showToast('Reset to the default copy', 'success');
        } catch (e) {
          showToast('Could not reset: ' + e.message, 'error');
        }
      });
    }
