/* =============================================================================
   Velorex Music — admin Spin Wheel panel (panel-spin)
   Used by: vlx-admin-2026.html, driven from switchPanel('spin')

   Edits the Spin & Win prizes and shows who spun and what they won. The rules
   are ENFORCED in api/_spin_helpers.php (spin_validate_config) and the draw
   happens on the server; the checks here are only a fast answer while typing.

   spinDescribe() MIRRORS spin_describe() in api/_spin_helpers.php. It exists
   so the preview updates as you type; the storefront never uses it — it shows
   the server's text. If you change one, change the other.

   Cross-module touch points (resolved at runtime):
     - API_BASE, escapeHTML, showToast, adminAuthHeaders
   ============================================================================= */

    const SpinState = { cfg: null, stats: null, recent: [], loading: false, error: null, dirty: false };

    const SPIN_TYPES = {
      free_shipping: 'Free delivery',
      percent:       '% off',
      fixed:         '₹ off',
      none:          'Better luck next time',
    };

    // How the result is revealed. Mirrors SPIN_GAME_STYLES in
    // api/_spin_helpers.php; the server rejects anything else.
    const SPIN_STYLES = [
      { id: 'wheel',    icon: 'fa-dharmachakra',       name: 'Spin the Wheel', blurb: 'Every prize visible on the wheel.' },
      { id: 'jackpot',  icon: 'fa-bolt',               name: 'Jackpot',        blurb: '3-reel slot machine, about 8 seconds.' },
      { id: 'scratch',  icon: 'fa-ticket',             name: 'Scratch Card',   blurb: 'Scratch the gold foil. Great on phones.' },
      { id: 'box',      icon: 'fa-gift',               name: 'Mystery Box',    blurb: 'Pick one of three gift boxes.' },
      { id: 'record',   icon: 'fa-record-vinyl',       name: 'Pick a Record',  blurb: 'Record onto a turntable, needle drops.' },
      { id: 'envelope', icon: 'fa-envelope-open-text', name: 'Lucky Envelope', blurb: 'Break the seal. Nice for festivals.' },
    ];

    function spinMoney(n) { return '₹' + (Number(n) || 0).toLocaleString('en-IN'); }

    function spinDescribe(p) {
      if (p.type === 'none') {
        return { label: 'BETTER LUCK', sub: 'NEXT TIME', title: 'Better luck next time',
                 cond: 'No prize this time. Thanks for joining Velorex Music!' };
      }
      const v = Number(p.value) || 0, minOrder = Number(p.minOrder) || 0;
      const minLps = Number(p.minLps) || 0, maxOff = Number(p.maxOff) || 0;
      const label = p.type === 'free_shipping' ? 'FREE' : (p.type === 'percent' ? v + '% OFF' : spinMoney(v) + ' OFF');
      let sub;
      if (p.type === 'free_shipping' && !minOrder && !minLps) sub = 'DELIVERY';
      else if (minLps)   sub = minLps + '+ LPs';
      else if (minOrder) sub = spinMoney(minOrder) + '+';
      else               sub = 'ANY ORDER';
      const title = p.type === 'free_shipping' ? 'Free Delivery' : (p.type === 'percent' ? v + '% off' : spinMoney(v) + ' off');
      const parts = [];
      if (minLps)   parts.push('With ' + minLps + ' or more vinyl LPs in the cart.');
      if (minOrder) parts.push('On orders of ' + spinMoney(minOrder) + ' or more.');
      if (!minLps && !minOrder) parts.push('On any order — no minimum.');
      if (p.type === 'percent' && maxOff) parts.push('Max discount ' + spinMoney(maxOff) + '.');
      return { label: label, sub: sub, title: title, cond: parts.join(' ') };
    }

    function spinLive() {
      return ((SpinState.cfg && SpinState.cfg.prizes) || []).filter(function (p) { return p.on && Number(p.weight) > 0; });
    }

    async function loadSpinWheel() {
      if (SpinState.loading) return;
      SpinState.loading = true;
      SpinState.error = null;
      renderSpinWheel();
      try {
        const res = await fetch(API_BASE + '/admin/spin-wheel.php', { headers: adminAuthHeaders() });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
        SpinState.cfg = data.config;
        SpinState.stats = data.stats || {};
        SpinState.recent = data.recent || [];
        SpinState.dirty = false;
      } catch (e) {
        SpinState.error = e.message;
      } finally {
        SpinState.loading = false;
        renderSpinWheel();
      }
    }

    // Mirrors spin_icon() in api/_spin_helpers.php (the jackpot prints it).
    function spinIcon(p) {
      if (p.type === 'none') return 'fa-face-smile';
      if (p.type === 'free_shipping') return 'fa-truck-fast';
      if (Number(p.minLps) > 0) return 'fa-record-vinyl';
      if (p.type === 'fixed') return 'fa-indian-rupee-sign';
      return Number(p.value) >= 15 ? 'fa-crown' : 'fa-percent';
    }

    // ---------------------------------------------------------------------
    // Live demo of the selected game style.
    //
    // Runs the SAME game code as the storefront (src/js/storefront/
    // spin-games.js), fed with the prizes as currently edited — saved or not.
    // Its ctx.request() never touches the server: it draws locally from the
    // weights on screen and returns a DEMO result, so trying it creates no
    // coupon, uses no one's play, and does not count in the stats.
    // ---------------------------------------------------------------------
    let SpinDemo = null;

    function spinDemoPrizes() {
      return spinLive().map(function (p, i) {
        const d = spinDescribe(p);
        return { id: p.id || ('d' + i), color: p.color, label: d.label, sub: d.sub, icon: spinIcon(p), none: p.type === 'none' };
      });
    }

    function spinMountDemo() {
      const stage = document.getElementById('spw-demo-stage');
      const out = document.getElementById('spw-demo-out');
      if (!stage) return;
      if (typeof SpinGames === 'undefined') {
        stage.innerHTML = '<p class="dash-empty">Preview unavailable — the game script did not load.</p>';
        return;
      }
      const live = spinLive();
      const prizes = spinDemoPrizes();
      if (prizes.length < 2) {
        stage.innerHTML = '<p class="dash-empty">Switch on at least 2 slices to preview the game.</p>';
        return;
      }
      if (out) out.innerHTML = '';
      const btn = document.getElementById('spw-demo-play');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-play"></i> Try it'; }
      const ctx = {
        prizes: prizes,
        reduce: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
        lock: function () {
          if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-compact-disc fa-spin"></i> Playing…'; }
        },
        request: function () {
          const total = live.reduce(function (a, p) { return a + Number(p.weight); }, 0);
          let r = Math.random() * total, i = 0;
          for (; i < live.length - 1; i++) { r -= Number(live[i].weight); if (r < 0) break; }
          const p = live[i], d = spinDescribe(p);
          return Promise.resolve({ prizeId: prizes[i].id, win: p.type !== 'none', title: d.title, cond: d.cond,
                                   code: p.type === 'none' ? null : 'DEMO-CODE' });
        },
        done: function (d) {
          if (out) {
            out.innerHTML = '<div class="spw-demo-res"><span>' + (d.win ? '<i class="fas fa-trophy"></i> Customer would win' : '<i class="fas fa-record-vinyl"></i> Customer would see') + '</span>'
              + '<b>' + escapeHTML(d.title) + '</b><small>' + escapeHTML(d.cond) + '</small></div>';
          }
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-rotate"></i> Play again'; }
        },
      };
      SpinDemo = SpinGames.create(SpinState.cfg.gameStyle || 'wheel', ctx);
      SpinDemo.mount(stage);
    }

    function spinDemoPlay() {
      const btn = document.getElementById('spw-demo-play');
      // A finished demo is remounted fresh before playing again.
      if (btn && btn.textContent.indexOf('Play again') !== -1) { spinMountDemo(); }
      if (SpinDemo) SpinDemo.auto();
    }

    function renderSpinWheel() {
      const root = document.getElementById('spin-body');
      if (!root) return;
      if (SpinState.error) {
        root.innerHTML = '<div class="dash-error"><strong>Could not load the spin wheel.</strong><br>'
          + escapeHTML(SpinState.error)
          + '<div style="margin-top:1rem;"><button type="button" class="btn btn-primary" style="width:auto;" onclick="loadSpinWheel()">Retry</button></div></div>';
        return;
      }
      if (!SpinState.cfg) { root.innerHTML = '<p class="dash-empty">Loading…</p>'; return; }

      const cfg = SpinState.cfg, st = SpinState.stats || {};
      const live = spinLive();
      const total = live.reduce(function (a, p) { return a + Number(p.weight); }, 0) || 1;
      const num = function (i, k, v, dis, min, max) {
        return '<input class="form-control spw-num" type="number" min="' + (min || 0) + '"' + (max ? ' max="' + max + '"' : '')
          + ' value="' + escapeHTML(String(v)) + '"' + (dis ? ' disabled' : '')
          + ' onchange="spinEdit(' + i + ',\'' + k + '\',this)">';
      };

      const rows = cfg.prizes.map(function (p, i) {
        const d = spinDescribe(p);
        const isLive = p.on && Number(p.weight) > 0;
        const odds = isLive ? Math.round(Number(p.weight) / total * 1000) / 10 + '%' : '—';
        return '<tr class="' + (p.on ? '' : 'spw-off') + '">'
          + '<td><input type="checkbox" aria-label="Slice on" ' + (p.on ? 'checked' : '') + ' onchange="spinEdit(' + i + ',\'on\',this)"></td>'
          + '<td><input type="color" class="spw-color" aria-label="Colour" value="' + escapeHTML(p.color) + '" onchange="spinEdit(' + i + ',\'color\',this)"></td>'
          + '<td><select class="form-control" onchange="spinEdit(' + i + ',\'type\',this)">'
          +   Object.keys(SPIN_TYPES).map(function (t) {
                return '<option value="' + t + '"' + (p.type === t ? ' selected' : '') + '>' + SPIN_TYPES[t] + '</option>';
              }).join('')
          + '</select></td>'
          + '<td>' + num(i, 'value', p.value, p.type === 'free_shipping' || p.type === 'none', 0, p.type === 'percent' ? 90 : 100000) + '</td>'
          + '<td>' + num(i, 'minOrder', p.minOrder, p.type === 'none') + '</td>'
          + '<td>' + num(i, 'maxOff', p.maxOff, p.type !== 'percent') + '</td>'
          + '<td>' + num(i, 'minLps', p.minLps, p.type === 'none', 0, 20) + '</td>'
          + '<td>' + num(i, 'weight', p.weight, false, 0, 1000) + '</td>'
          + '<td><strong>' + odds + '</strong></td>'
          + '<td class="cpn-sub"><strong style="color:var(--text);">' + escapeHTML(d.title) + '</strong><br>' + escapeHTML(d.cond) + '</td>'
          + '<td><button type="button" class="btn btn-secondary btn-sm" style="width:auto;" title="Remove slice"'
          +   ' onclick="spinRemove(' + i + ')"><i class="fas fa-trash"></i></button></td>'
          + '</tr>';
      }).join('');

      const recent = SpinState.recent.length
        ? '<div style="overflow-x:auto;"><table class="admin-table"><thead><tr><th>When</th><th>Customer</th><th>Prize</th><th>Code</th><th>Status</th></tr></thead><tbody>'
          + SpinState.recent.map(function (r) {
              const status = !r.code ? '<span class="cpn-sub">No prize</span>'
                : r.used ? '<span style="color:var(--success);font-weight:700;">Used</span>'
                : r.expired ? '<span style="color:var(--text-muted);font-weight:700;">Expired</span>'
                : '<span style="color:var(--info);font-weight:700;">Unused</span>';
              return '<tr><td class="cpn-sub">' + escapeHTML(new Date(r.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })) + '</td>'
                + '<td>' + escapeHTML(r.email) + '</td>'
                + '<td>' + escapeHTML(r.prize) + '</td>'
                + '<td>' + (r.code ? '<span class="cpn-code">' + escapeHTML(r.code) + '</span>' : '—') + '</td>'
                + '<td>' + status + '</td></tr>';
            }).join('')
          + '</tbody></table></div>'
        : '<p class="dash-empty">No plays yet.</p>';

      const stat = function (label, value, sub) {
        return '<div class="dash-card"><div class="dash-card-label">' + escapeHTML(label) + '</div>'
          + '<div class="dash-card-value">' + value + '</div><div class="dash-card-sub">' + (sub || '') + '</div></div>';
      };

      root.innerHTML = ''
        + '<div class="dash-grid">'
        +   stat('Plays', st.spins || 0, (st.today || 0) + ' today')
        +   stat('Prizes won', st.wins || 0, ((st.spins || 0) - (st.wins || 0)) + ' better luck next time')
        +   stat('Codes used', st.used || 0, st.wins ? Math.round((st.used || 0) / st.wins * 100) + '% of prizes won' : 'Once a winner orders')
        +   stat('Discount given', spinMoney(st.discount || 0), 'Free delivery not counted')
        + '</div>'

        + '<section class="admin-card dash-panel">'
        +   '<div class="spw-head">'
        +     '<div>'
        +       '<h3 class="dash-panel-title" style="margin-bottom:0.35rem;">Game settings</h3>'
        +       '<p class="cpn-sub" style="max-width:70ch;">Shown on the homepage only, to signed-up members who have never ordered. '
        +         'One spin per account. The server draws the prize and creates a single-use code reserved to the winner. '
        +         'Changes apply to future spins; codes already won keep their terms.</p>'
        +     '</div>'
        +     '<button type="button" class="btn btn-primary" style="width:auto;" id="spw-save" onclick="saveSpinWheel()"'
        +       (SpinState.dirty ? '' : ' disabled') + '><i class="fas fa-floppy-disk"></i> Save changes</button>'
        +   '</div>'
        +   '<div class="spw-label">Game style <span class="cpn-sub">— same prizes, odds and one-play rule; only the reveal changes</span></div>'
        +   '<div class="spw-styles" role="radiogroup" aria-label="Game style">'
        +     SPIN_STYLES.map(function (st) {
                const on = (cfg.gameStyle || 'wheel') === st.id;
                return '<button type="button" role="radio" aria-checked="' + on + '" class="spw-style' + (on ? ' is-on' : '') + '"'
                  + ' onclick="spinSetStyle(\'' + st.id + '\')">'
                  + '<i class="fas ' + st.icon + '"></i><b>' + st.name + '</b><small>' + st.blurb + '</small></button>';
              }).join('')
        +   '</div>'
        +   '<div class="spw-demo">'
        +     '<div class="spw-demo-stage" id="spw-demo-stage"></div>'
        +     '<div class="spw-demo-side">'
        +       '<div class="spw-label" style="margin:0;">Preview: ' + escapeHTML((SPIN_STYLES.find(function (x) { return x.id === (cfg.gameStyle || 'wheel'); }) || SPIN_STYLES[0]).name) + '</div>'
        +       '<p class="cpn-sub">Plays exactly as customers see it, with the prizes and odds above — including changes you have not saved yet. '
        +         'A demo play creates no code and does not count.</p>'
        +       '<button type="button" class="btn btn-primary" style="width:auto;" id="spw-demo-play" onclick="spinDemoPlay()"><i class="fas fa-play"></i> Try it</button>'
        +       '<div id="spw-demo-out"></div>'
        +     '</div>'
        +   '</div>'
        +   '<div class="spw-bar">'
        +     '<label class="set-toggle spw-live"><input type="checkbox" ' + (cfg.enabled ? 'checked' : '') + ' onchange="spinEditTop(\'enabled\',this)">'
        +       '<span class="set-label">' + (cfg.enabled ? '<strong style="color:var(--success);">Game is live</strong>' : 'Game is off') + '</span></label>'
        +     '<label>Codes valid for <input class="form-control spw-num" type="number" min="1" max="60" value="' + cfg.validDays + '" onchange="spinEditTop(\'validDays\',this)"> days</label>'
        +     '<label>Show tab after <input class="form-control spw-num" type="number" min="0" max="60" value="' + cfg.delaySec + '" onchange="spinEditTop(\'delaySec\',this)"> sec</label>'
        +     '<button type="button" class="btn btn-secondary btn-sm" style="width:auto;" onclick="spinAdd()"><i class="fas fa-plus"></i> Add slice</button>'
        +   '</div>'
        +   '<div class="spw-layout">'
        +     '<div style="overflow-x:auto;"><table class="admin-table spw-table"><thead><tr>'
        +       '<th>On</th><th>Colour</th><th>Prize</th><th>Value</th><th>Min order ₹</th><th>Max off ₹</th><th>Min LPs</th><th>Weight</th><th>Odds</th><th>Customer reads</th><th></th>'
        +     '</tr></thead><tbody>' + rows + '</tbody></table></div>'
        +   '</div>'
        +   '<p class="cpn-sub" style="margin-top:0.75rem;">4–8 slices. Weight is relative — the Odds column works out the chance. '
        +     'Value is the % for "% off" (max 90) or rupees for "₹ off". Min LPs counts vinyl records only. '
        +     'Keep "Better luck next time" rare: people create an account to spin.</p>'
        +   '<p class="cpn-sub" style="margin-top:0.5rem;"><i class="fas fa-file-contract"></i> Customers see the rules and the live chances at '
        +     '<a href="/offer-terms.html" target="_blank" rel="noopener">/offer-terms.html</a>. Edit the wording in Policies → Spin &amp; Win Terms; '
        +     'the prizes table on that page is generated from these settings.</p>'
        +   '<div class="set-error" id="spw-error" hidden></div>'
        + '</section>'

        + '<section class="admin-card dash-panel" style="margin-top:1.5rem;">'
        +   '<h3 class="dash-panel-title">Latest plays</h3>' + recent
        + '</section>';
      spinMountDemo();
    }

    function spinMarkDirty() {
      SpinState.dirty = true;
      renderSpinWheel();
    }

    function spinEdit(i, key, el) {
      const p = SpinState.cfg.prizes[i];
      if (!p) return;
      let v = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? Math.max(0, parseInt(el.value, 10) || 0) : el.value);
      if (key === 'value' && p.type === 'percent') v = Math.min(v, 90);
      p[key] = v;
      if (key === 'type') {
        if (v === 'percent' && !p.value) p.value = 10;
        if (v === 'fixed' && !p.value) p.value = 100;
      }
      spinMarkDirty();
    }

    function spinEditTop(key, el) {
      SpinState.cfg[key] = el.type === 'checkbox' ? el.checked : Math.max(0, parseInt(el.value, 10) || 0);
      spinMarkDirty();
    }

    function spinSetStyle(id) {
      SpinState.cfg.gameStyle = id;
      spinMarkDirty();
    }

    function spinAdd() {
      if (SpinState.cfg.prizes.length >= 8) { showToast('Maximum 8 slices — more is unreadable on a phone', 'error'); return; }
      SpinState.cfg.prizes.push({ id: '', on: true, type: 'fixed', value: 100, minOrder: 1000, maxOff: 0, minLps: 0, color: '#3b2a55', weight: 10 });
      spinMarkDirty();
    }

    function spinRemove(i) {
      if (SpinState.cfg.prizes.length <= 4) { showToast('The wheel needs at least 4 slices', 'error'); return; }
      SpinState.cfg.prizes.splice(i, 1);
      spinMarkDirty();
    }

    async function saveSpinWheel() {
      const btn = document.getElementById('spw-save');
      const err = document.getElementById('spw-error');
      if (btn) btn.disabled = true;
      try {
        const res = await fetch(API_BASE + '/admin/spin-wheel.php', {
          method: 'POST',
          headers: adminAuthHeaders(),
          body: JSON.stringify({ config: SpinState.cfg }),
        });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) {
          const msg = (data.errors && data.errors.join(' ')) || data.error || ('HTTP ' + res.status);
          if (err) { err.textContent = msg; err.hidden = false; }
          showToast('Not saved: ' + (data.error || 'check the settings'), 'error');
          if (btn) btn.disabled = false;
          return;
        }
        SpinState.cfg = data.config;
        SpinState.dirty = false;
        renderSpinWheel();
        showToast(data.config.enabled ? 'Saved — the game is live on the homepage' : 'Saved — the game is off', 'success');
      } catch (e) {
        if (err) { err.textContent = e.message; err.hidden = false; }
        if (btn) btn.disabled = false;
      }
    }
