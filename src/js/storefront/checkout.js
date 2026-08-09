/* =============================================================================
   Velorex Music — checkout + payment flow (storefront)
   Used by: index.html (checkout modal, Razorpay handoff, guest-upgrade modal)

   Contents (search by header):
     - Cart-page mutations (updateCartQtySPA, removeCartSPA, clearCartSPA)
     - Checkout entry (checkoutSPA) — opens payment modal, switches registered
       vs guest UI based on Auth state.
     - Guest contact + address form helpers (initGuestCheckoutForm,
       updateGuestAddressFormForCountry, toggleGuestSaveInfo).
     - Checkout sign-in shortcut + payment modal close.
     - Guest-upgrade post-purchase flow (Phase 1C — handleGuestPostPurchase,
       openGuestUpgradeModal/close/submit/attemptGuestUpgrade).
     - Checkout address picker (registered users).
     - processPayment — the server-orchestrated Razorpay flow:
         POST /api/payments/create-order.php  → mint Razorpay order
         open Razorpay Checkout (browser → Razorpay)
         POST /api/payments/verify.php        → HMAC-verify, finalize, decrement stock

   The browser NEVER decides the price or holds the secret. See CLAUDE.md §10
   "Razorpay payment flow" for the security model that gates this flow.

   Cross-module touch points (resolved at runtime):
     - Auth, Storage, Addresses, CartHelpers, COUNTRIES, IN_STATES, US_STATES,
       STATE_REQUIRED, POSTAL_REQUIRED
     - showToast, openConfirmDialog
     - navigate (router.js)
   ============================================================================= */

    function updateCartQtySPA(id, qty) { if (qty <= 0) CartHelpers.removeFromCart(id); else CartHelpers.updateQty(id, qty); initPageCart(); }
    function removeCartSPA(id) { CartHelpers.removeFromCart(id); showToast('Item removed', 'info'); initPageCart(); }
    function clearCartSPA() { openConfirmDialog({ title: 'Clear Cart', message: 'Clear all items from cart?', confirmText: 'Clear Cart', onConfirm: () => { Storage.saveCart([]); initPageCart(); showToast('Cart cleared', 'success'); } }); }
    // Selected shipping address id for the current checkout session. Cleared when the modal closes.
    let CHECKOUT_SELECTED_ADDRESS_ID = null;

    // Returns an {countryCode, state, postalCode}-shaped object describing the
    // address currently selected/entered in the checkout modal, or null when
    // nothing is selected yet (e.g. guest with empty form). Tolerates partial
    // input — the Shipping module treats missing fields as "rest of India".
    function readCurrentCheckoutAddress() {
      if (Auth.isLoggedIn()) {
        var picked = (Addresses._cached || []).find(a => a.id === CHECKOUT_SELECTED_ADDRESS_ID);
        return picked || null;
      }
      var countryEl = document.getElementById('guest-addr-country');
      if (!countryEl || !countryEl.value) return null;
      return {
        countryCode: countryEl.value,
        state: typeof readGuestAddressFormState === 'function' ? readGuestAddressFormState() : '',
        postalCode: (document.getElementById('guest-addr-postal') || {}).value || '',
      };
    }

    // Returns true if the address is non-IN (and country is set). Used to
    // gate checkout — intl orders are by email enquiry only today.
    function isCheckoutAddressIntl(addr) {
      if (!addr) return false;
      var cc = (addr.countryCode || '').toUpperCase();
      return cc !== '' && cc !== 'IN';
    }

    // Toggles the "international order? email us" block + disables the
    // Pay Now button. Idempotent. Called from every code path that can
    // change the currently-selected address (registered picker, guest
    // country select). Server-side gate in create-order.php mirrors this.
    function setCheckoutIntlBlocked(blocked, countryCode) {
      var block = document.getElementById('checkout-intl-block');
      var sumLine = document.getElementById('payment-summary-line');
      var payBtn = document.getElementById('payment-pay-btn');
      var nameEl = document.getElementById('checkout-intl-country-name');
      if (block) block.style.display = blocked ? '' : 'none';
      if (sumLine) sumLine.style.display = blocked ? 'none' : '';
      if (payBtn) {
        payBtn.disabled = !!blocked;
        payBtn.innerHTML = blocked ? '🌍 International orders: email us' : '⚡ Pay Now';
        payBtn.style.opacity = blocked ? '0.5' : '';
        payBtn.style.cursor = blocked ? 'not-allowed' : '';
      }
      if (blocked && nameEl) {
        var label = '';
        if (Array.isArray(COUNTRIES)) {
          var row = COUNTRIES.find(function (c) { return c[0] === (countryCode || '').toUpperCase(); });
          if (row) label = row[1];
        }
        nameEl.textContent = label || 'another country';
      }
    }

    // Recomputes the preview total + shipping line in the payment modal based
    // on the cart subtotal and the currently selected/entered address. Safe to
    // call multiple times; idempotent. The server is authoritative at
    // /api/payments/create-order.php time — this is preview-only.
    //
    // When the address is non-IN, defers to setCheckoutIntlBlocked() for UX —
    // we don't paint a misleading "Subtotal + Shipping ₹X" preview for an
    // order we won't actually take through Razorpay.
    function recomputeCheckoutShipping() {
      var subtotal = CartHelpers.getCartTotal();
      var addr = readCurrentCheckoutAddress();

      if (isCheckoutAddressIntl(addr)) {
        setCheckoutIntlBlocked(true, addr.countryCode);
        return;
      }
      setCheckoutIntlBlocked(false);

      var quote = Shipping.calculate(subtotal, addr, Shipping.cartShippingItems());
      var total = subtotal + quote.shipping;

      var amtEl = document.getElementById('payment-amount-display');
      if (amtEl) amtEl.textContent = '₹' + total.toLocaleString();

      var lineEl = document.getElementById('payment-summary-line');
      if (!lineEl) return;
      var subPart = 'Subtotal ₹' + subtotal.toLocaleString();
      var shipPart;
      if (quote.freeShipping) {
        shipPart = ' · Shipping <span style="color:var(--success);font-weight:600;">FREE</span>';
      } else if (addr) {
        shipPart = ' · Shipping (' + Utils.escape(quote.zoneLabel) + ') ₹' + quote.shipping;
      } else {
        shipPart = ' · <span style="font-style:italic;">+ shipping once address is set</span>';
      }
      lineEl.innerHTML = subPart + shipPart;
    }

    async function checkoutSPA() {
      // Guest checkout is allowed — no login redirect here. The modal swaps
      // between the address-picker (registered) and the inline contact+address
      // form (guest) based on Auth state.
      if (!CartHelpers.getCartWithDetails().length) {
        showToast('Your cart is empty', 'error');
        return;
      }

      // Amount + breakdown shown here are a preview — the server recomputes
      // the canonical total from DB prices in /api/payments/create-order.php
      // before opening Razorpay Checkout, applying the same zone rules
      // (mirrored from src/js/shipping.js in api/_shipping_helpers.php). If
      // they ever differ, the server wins.
      recomputeCheckoutShipping();

      var payBtn = document.getElementById('payment-pay-btn');
      if (payBtn) { payBtn.innerHTML = '⚡ Pay Now'; payBtn.disabled = false; }

      document.getElementById('payment-modal').classList.add('active');
      document.getElementById('payment-main-view').style.display = 'block';
      document.getElementById('payment-processing-view').classList.remove('active');
      CHECKOUT_SELECTED_ADDRESS_ID = null;

      // Flip the UI between registered and guest variants.
      var isGuest = !Auth.isLoggedIn();
      document.getElementById('checkout-signin-hint').style.display    = isGuest ? '' : 'none';
      document.getElementById('checkout-guest-contact').style.display  = isGuest ? '' : 'none';
      document.getElementById('checkout-guest-address').style.display  = isGuest ? '' : 'none';
      document.getElementById('checkout-address-section').style.display = isGuest ? 'none' : '';
      document.getElementById('checkout-guest-error').style.display    = 'none';
      document.getElementById('checkout-guest-upgrade').style.display  = isGuest ? '' : 'none';
      // Reset upgrade form state on each open so the previous session's
      // checked/typed values don't leak into the next checkout.
      var saveInfoChk = document.getElementById('guest-save-info');
      var saveInfoPw  = document.getElementById('guest-save-info-password');
      var saveInfoPwWrap = document.getElementById('guest-save-info-password-wrap');
      if (saveInfoChk) saveInfoChk.checked = false;
      if (saveInfoPw)  saveInfoPw.value = '';
      if (saveInfoPwWrap) saveInfoPwWrap.style.display = 'none';

      if (isGuest) {
        initGuestCheckoutForm();
      } else {
        await renderCheckoutAddressPicker();
      }
    }

    // Reveal/hide the password field as the "Save my info" checkbox is toggled.
    function toggleGuestSaveInfo() {
      var chk = document.getElementById('guest-save-info');
      var wrap = document.getElementById('guest-save-info-password-wrap');
      var pw = document.getElementById('guest-save-info-password');
      if (!chk || !wrap) return;
      wrap.style.display = chk.checked ? '' : 'none';
      if (chk.checked && pw) {
        setTimeout(function () { pw.focus(); }, 50);
      } else if (pw) {
        pw.value = '';
      }
    }

    // First-time + reset state for the guest contact/address form. Idempotent
    // so re-opening the checkout modal doesn't double-populate the country dropdown.
    function initGuestCheckoutForm() {
      var countrySel = document.getElementById('guest-addr-country');
      if (countrySel && !countrySel.options.length) {
        countrySel.innerHTML = COUNTRIES.map(c => `<option value="${c[0]}">${c[1]}</option>`).join('');
        countrySel.value = 'IN';
      }
      // Wire change listeners that drive the shipping preview. Idempotent guard
      // (data-wired) so re-opening the modal doesn't stack duplicate handlers.
      var stateSel = document.getElementById('guest-addr-state-select');
      var stateInp = document.getElementById('guest-addr-state-input');
      var postalInp = document.getElementById('guest-addr-postal');
      [stateSel, stateInp, postalInp].forEach(function (el) {
        if (!el || el.dataset.shippingWired === '1') return;
        el.addEventListener('change', recomputeCheckoutShipping);
        el.addEventListener('blur', recomputeCheckoutShipping);
        el.dataset.shippingWired = '1';
      });
      updateGuestAddressFormForCountry();
    }

    function updateGuestAddressFormForCountry() {
      var code = document.getElementById('guest-addr-country').value;
      var stateLabel = document.getElementById('guest-addr-state-label');
      var postalLabel = document.getElementById('guest-addr-postal-label');
      var stateSelect = document.getElementById('guest-addr-state-select');
      var stateInput = document.getElementById('guest-addr-state-input');
      var landmark = document.getElementById('guest-addr-landmark-group');

      if (code === 'IN') {
        stateSelect.innerHTML = '<option value="">Select state…</option>' + IN_STATES.map(s => `<option value="${s}">${s}</option>`).join('');
        stateSelect.style.display = '';
        stateInput.style.display = 'none';
        stateInput.value = '';
      } else if (code === 'US') {
        stateSelect.innerHTML = '<option value="">Select state…</option>' + US_STATES.map(s => `<option value="${s[1]}">${s[1]}</option>`).join('');
        stateSelect.style.display = '';
        stateInput.style.display = 'none';
        stateInput.value = '';
      } else {
        stateSelect.style.display = 'none';
        stateSelect.innerHTML = '';
        stateInput.style.display = '';
      }
      stateLabel.textContent = STATE_REQUIRED.has(code) ? 'State / Region *' : 'State / Region';
      postalLabel.textContent = POSTAL_REQUIRED.has(code) ? 'Postal Code *' : 'Postal Code';

      // Landmark is an India-ism — hide elsewhere to keep the form tidy.
      landmark.style.display = code === 'IN' ? '' : 'none';
      if (code !== 'IN') document.getElementById('guest-addr-landmark').value = '';

      // Country change can flip the shipping zone (e.g. IN → intl).
      recomputeCheckoutShipping();
    }

    function readGuestAddressFormState() {
      var sel = document.getElementById('guest-addr-state-select');
      var input = document.getElementById('guest-addr-state-input');
      return sel.style.display !== 'none' ? sel.value : input.value.trim();
    }

    // Builds and returns the guest payload, or returns null after surfacing
    // a validation message in #checkout-guest-error. Mirrors the server's
    // validate_address_payload() loosely so users see the same error before
    // the request even goes out.
    function readGuestCheckoutPayload() {
      var errEl = document.getElementById('checkout-guest-error');
      var show = (msg) => { errEl.textContent = msg; errEl.style.display = ''; };
      errEl.style.display = 'none';

      var email = document.getElementById('guest-email').value.trim();
      var phone = document.getElementById('guest-phone').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { show('Enter a valid email address.'); return null; }
      if (!/^[\d\s\-\+\(\)]{6,20}$/.test(phone))     { show('Enter a valid phone number.');  return null; }

      var country = document.getElementById('guest-addr-country').value;
      var fullName = document.getElementById('guest-addr-fullName').value.trim();
      var line1 = document.getElementById('guest-addr-line1').value.trim();
      var city = document.getElementById('guest-addr-city').value.trim();
      if (!fullName || !line1 || !city || !country) { show('Please fill in name, address, city and country.'); return null; }

      var state = readGuestAddressFormState();
      var postal = document.getElementById('guest-addr-postal').value.trim();
      if (STATE_REQUIRED.has(country) && !state)  { show('State / region is required for ' + country + '.'); return null; }
      if (POSTAL_REQUIRED.has(country) && !postal) { show('Postal code is required for ' + country + '.'); return null; }

      return {
        contact: { email, phone },
        shippingAddress: {
          fullName,
          phone, // the address phone defaults to the contact phone for guests
          line1,
          line2: document.getElementById('guest-addr-line2').value.trim() || null,
          landmark: document.getElementById('guest-addr-landmark').value.trim() || null,
          city,
          state: state || null,
          postalCode: postal || null,
          countryCode: country,
        },
      };
    }

    // Stub for the "Sign in" hint link. Closes the payment modal and routes
    // the user to /#login with a redirect back to /#cart. Keeps the cart
    // intact so they don't lose their selection.
    function openCheckoutSignIn() {
      closePaymentModal();
      navigate('login', { redirect: 'cart' });
    }
    function closePaymentModal() {
      document.getElementById('payment-modal').classList.remove('active');
      CHECKOUT_SELECTED_ADDRESS_ID = null;
    }

    // -------- Guest post-purchase upgrade --------
    // Holds the data we need to fall back to the public-tracking page if the
    // upgrade is skipped or fails. Populated by handleGuestPostPurchase().
    const GUEST_UPGRADE_STATE = { orderId: null, email: null, name: null };

    // Called after a successful guest payment. Drives one of three outcomes:
    //   1. Inline password supplied → silent signup → /#profile
    //   2. No inline password → open the post-purchase modal
    //   3. Both above fall back to track-order page on any failure/decline
    async function handleGuestPostPurchase(orderId, createBody) {
      const email = (createBody.contact && createBody.contact.email) || '';
      const fullName = (createBody.shippingAddress && createBody.shippingAddress.fullName) || '';
      GUEST_UPGRADE_STATE.orderId = orderId;
      GUEST_UPGRADE_STATE.email = email;
      GUEST_UPGRADE_STATE.name = fullName;

      const saveInfoChk = document.getElementById('guest-save-info');
      const saveInfoPw  = document.getElementById('guest-save-info-password');
      const inlinePw = saveInfoChk && saveInfoChk.checked && saveInfoPw ? saveInfoPw.value : '';
      // Clear out the password before doing anything else so it doesn't sit
      // in the DOM (and the user re-opening the modal sees a clean form).
      if (saveInfoPw) saveInfoPw.value = '';

      if (inlinePw && inlinePw.length >= 8 && email) {
        // Path 1: silent inline upgrade. Best-effort — on any failure we
        // gracefully fall through to the post-purchase modal so the
        // customer still gets a chance to claim the order.
        const ok = await attemptGuestUpgrade(email, inlinePw, fullName);
        if (ok) {
          showToast('✅ Account created — you\'re signed in!', 'success');
          navigate('profile');
          return;
        }
        // Inline path failed (most often: email already taken). Open the modal
        // with a clear hint so the customer can pick a different action.
        openGuestUpgradeModal(true);
        return;
      }

      // Path 2: post-purchase modal.
      openGuestUpgradeModal(false);
    }

    function openGuestUpgradeModal(showAccountExistsHint) {
      const m = document.getElementById('guestUpgradeModal'); if (!m) return;
      document.getElementById('guest-upgrade-order-id').textContent = '#' + (GUEST_UPGRADE_STATE.orderId || '');
      document.getElementById('guest-upgrade-email').textContent = GUEST_UPGRADE_STATE.email || '';
      const pw = document.getElementById('guest-upgrade-password');
      if (pw) pw.value = '';
      const err = document.getElementById('guestUpgradeError');
      if (err) {
        if (showAccountExistsHint) {
          err.innerHTML = 'An account with this email already exists. <a href="#" onclick="closeGuestUpgradeModal(true); navigate(\'login\', { redirect: \'profile\' }); return false;" style="color:var(--secondary);text-decoration:underline;">Sign in</a> to claim this order.';
          err.style.display = '';
        } else {
          err.textContent = '';
          err.style.display = 'none';
        }
      }
      m.classList.add('open');
      // The modal-overlay base style isn't quite the same as payment-modal —
      // the existing modals use display flex on .open. Make sure it's visible.
      m.style.display = 'flex';
      setTimeout(function () { pw && pw.focus(); }, 100);
    }

    function closeGuestUpgradeModal(redirectToTracking) {
      const m = document.getElementById('guestUpgradeModal'); if (!m) return;
      m.classList.remove('open');
      m.style.display = 'none';
      if (redirectToTracking) {
        const id = GUEST_UPGRADE_STATE.orderId;
        const email = GUEST_UPGRADE_STATE.email;
        if (id && email) {
          window.location.href = 'track-order.html?id=' + encodeURIComponent(id) + '&email=' + encodeURIComponent(email);
        } else if (id) {
          window.location.href = 'track-order.html?id=' + encodeURIComponent(id);
        }
      }
    }

    async function submitGuestUpgrade(ev) {
      ev.preventDefault();
      const pw = document.getElementById('guest-upgrade-password');
      const err = document.getElementById('guestUpgradeError');
      const btn = document.getElementById('guestUpgradeSubmit');
      err.style.display = 'none'; err.textContent = '';
      const password = pw ? pw.value : '';
      if (password.length < 8) {
        err.textContent = 'Password must be at least 8 characters.';
        err.style.display = '';
        return;
      }
      const origBtn = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = 'Creating…';
      try {
        const ok = await attemptGuestUpgrade(GUEST_UPGRADE_STATE.email, password, GUEST_UPGRADE_STATE.name, err);
        if (ok) {
          closeGuestUpgradeModal(false);
          showToast('✅ Account created — you\'re signed in!', 'success');
          navigate('profile');
        }
      } finally {
        btn.disabled = false;
        btn.innerHTML = origBtn;
      }
    }

    // Calls /api/auth/signup.php with the upgrade data. Returns true on
    // success (and Auth state is mutated to the new logged-in user). On
    // failure returns false and, if an error element was supplied, writes
    // a human-readable message into it.
    async function attemptGuestUpgrade(email, password, fullName, errEl) {
      const parts = (fullName || '').trim().split(/\s+/);
      const firstName = parts[0] || 'Friend';
      const lastName = parts.slice(1).join(' ');
      try {
        const res = await fetch(API_BASE + '/auth/signup.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, firstName, lastName }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok && data.token) {
          // Mirror what Auth.signup() does so the rest of the SPA recognizes us.
          localStorage.setItem(Auth.TOKEN_KEY, data.token);
          if (data.user) localStorage.setItem(Auth.USER_KEY, JSON.stringify(data.user));
          if (typeof Auth._claimAnonCart === 'function') {
            try { Auth._claimAnonCart(); } catch (_) {}
          }
          return true;
        }
        // Show the error inline if we have a target element.
        if (errEl) {
          if (res.status === 409) {
            errEl.innerHTML = 'An account with this email already exists. <a href="#" onclick="closeGuestUpgradeModal(true); navigate(\'login\', { redirect: \'profile\' }); return false;" style="color:var(--secondary);text-decoration:underline;">Sign in</a> instead.';
          } else {
            errEl.textContent = data.error || ('Could not create account (HTTP ' + res.status + ').');
          }
          errEl.style.display = '';
        }
        return false;
      } catch (e) {
        if (errEl) { errEl.textContent = 'Network error. Please try again.'; errEl.style.display = ''; }
        return false;
      }
    }

    async function renderCheckoutAddressPicker(preferredId) {
      var summary = document.getElementById('checkout-address-summary');
      var picker = document.getElementById('checkout-address-picker');
      if (!summary || !picker) return;
      var list = [];
      try { list = await Addresses.fetchAll(true); } catch (e) { /* fall through */ }

      // Pick selection: preferred id (just-saved) → existing selection → default → first.
      var selected = null;
      if (preferredId) selected = list.find(a => a.id === preferredId);
      if (!selected && CHECKOUT_SELECTED_ADDRESS_ID) selected = list.find(a => a.id === CHECKOUT_SELECTED_ADDRESS_ID);
      if (!selected) selected = list.find(a => a.isDefault) || list[0] || null;
      CHECKOUT_SELECTED_ADDRESS_ID = selected ? selected.id : null;

      if (!list.length) {
        summary.innerHTML = `
          <div style="color:var(--text-muted);">No saved addresses. Please add a shipping address to continue.</div>
          <button type="button" class="btn btn-sm btn-primary" style="margin-top:0.5rem;" onclick="openAddressModal(null,'checkout')">+ Add Address</button>`;
        picker.style.display = 'none';
        picker.innerHTML = '';
        return;
      }

      summary.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;flex-wrap:wrap;">
          <div style="flex:1;min-width:0;">
            <strong style="display:block;font-size:0.9rem;color:var(--text);">${Utils.escape(selected.fullName)}${selected.label ? ' · ' + Utils.escape(selected.label) : ''}</strong>
            <span style="color:var(--text-muted);">${Utils.escape(Addresses.formatOneLine(selected))}</span><br>
            <span style="color:var(--text-muted);">📞 ${Utils.escape(selected.phone)}</span>
          </div>
          <button type="button" class="btn btn-sm btn-secondary" onclick="toggleCheckoutAddressPicker()">Change</button>
        </div>`;

      picker.innerHTML = list.map(a => {
        var checked = a.id === CHECKOUT_SELECTED_ADDRESS_ID ? 'checked' : '';
        return `
          <label style="display:flex;gap:0.5rem;padding:0.5rem 0;cursor:pointer;border-bottom:1px solid var(--border);">
            <input type="radio" name="checkout-addr" value="${a.id}" ${checked} onchange="selectCheckoutAddress(${a.id})" style="margin-top:0.25rem;">
            <div style="flex:1;font-size:0.85rem;">
              <strong>${Utils.escape(a.fullName)}${a.label ? ' · ' + Utils.escape(a.label) : ''}</strong>${a.isDefault ? ' <span style="color:var(--success);font-size:0.7rem;">(default)</span>' : ''}<br>
              <span style="color:var(--text-muted);">${Utils.escape(Addresses.formatOneLine(a))}</span>
            </div>
          </label>`;
      }).join('') + `
        <button type="button" class="btn btn-sm btn-primary" style="margin-top:0.75rem;" onclick="openAddressModal(null,'checkout')">+ Add new address</button>`;

      // Default/just-saved pick may belong to a different zone than the
      // generic "rest" fallback rendered when the modal first opens.
      recomputeCheckoutShipping();
    }

    // Summary card (showing the current pick) and picker (the radio list of all
    // addresses) are mutually exclusive — showing both at once duplicates the
    // selected address visually (it appears as the summary AND as the checked
    // option in the list), which looks like a bug to the customer.
    function toggleCheckoutAddressPicker() {
      var picker = document.getElementById('checkout-address-picker');
      var summary = document.getElementById('checkout-address-summary');
      var opening = picker.style.display === 'none';
      picker.style.display = opening ? 'block' : 'none';
      if (summary) summary.style.display = opening ? 'none' : '';
    }

    function selectCheckoutAddress(id) {
      CHECKOUT_SELECTED_ADDRESS_ID = id;
      // After picking, collapse the picker and show the summary of the new selection.
      var picker = document.getElementById('checkout-address-picker');
      var summary = document.getElementById('checkout-address-summary');
      if (picker) picker.style.display = 'none';
      if (summary) summary.style.display = '';
      renderCheckoutAddressPicker();
    }
    // ============================================================
    // Payment flow — secure, server-orchestrated.
    //
    // The browser never decides the price, never holds the Razorpay secret,
    // and never tells the server "the payment succeeded" without proof.
    //
    //   1. POST /api/payments/create-order.php with the cart's (productId, qty)
    //      list. The server recomputes the total from DB prices, mints a
    //      Razorpay order_id bound to that amount, and returns it (plus the
    //      public key id).
    //   2. Open Razorpay Checkout with that order_id. Razorpay collects card /
    //      UPI / netbanking / wallet inside their iframe.
    //   3. On Razorpay's success callback, POST /api/payments/verify.php with
    //      { razorpay_order_id, razorpay_payment_id, razorpay_signature }. The
    //      server verifies the HMAC signature, decrements stock, creates the
    //      internal order, and returns the order id.
    //   4. Clear cart, navigate to profile.
    //
    // If anything fails between steps 2 and 3 (e.g. browser closed after pay),
    // the Razorpay webhook (api/payments/webhook.php) is the backstop: it
    // calls the same idempotent finalize_payment() and the order shows up on
    // the user's next visit.
    // ============================================================
    async function processPayment() {
      const payBtn = document.getElementById('payment-pay-btn');
      const setBtn = (label, disabled) => {
        if (!payBtn) return;
        payBtn.textContent = label;
        payBtn.disabled = !!disabled;
      };

      const cartItems = CartHelpers.getCartWithDetails();
      if (!cartItems.length) {
        showToast('Your cart is empty', 'error');
        closePaymentModal();
        return;
      }

      // Two payloads, one endpoint. The server picks the variant based on
      // whether an Authorization header is present (current_user_id_or_null
      // in api/payments/create-order.php).
      const isGuest = !Auth.isLoggedIn();
      let createBody;
      let shippingAddress; // used later for Razorpay's prefill + display
      if (isGuest) {
        const guest = readGuestCheckoutPayload();
        if (!guest) return; // validation message already shown inline
        createBody = {
          items: cartItems.map(i => ({ id: i.id, qty: i.qty })),
          contact: guest.contact,
          shippingAddress: guest.shippingAddress,
        };
        shippingAddress = guest.shippingAddress;
      } else {
        const picked = (Addresses._cached || []).find(a => a.id === CHECKOUT_SELECTED_ADDRESS_ID);
        if (!picked) {
          showToast('Please select or add a shipping address', 'error');
          const picker = document.getElementById('checkout-address-picker');
          if (picker) picker.style.display = 'block';
          return;
        }
        createBody = {
          items: cartItems.map(i => ({ id: i.id, qty: i.qty })),
          addressId: picked.id,
        };
        shippingAddress = picked;
      }

      // Defense in depth — the Pay Now button is already disabled for intl
      // addresses, but if anything bypasses that, refuse to start the flow
      // before hitting the server (server-side check in create-order.php
      // would reject too, but a clean inline error is friendlier).
      if (isCheckoutAddressIntl(shippingAddress)) {
        setCheckoutIntlBlocked(true, shippingAddress.countryCode);
        showToast('We ship to India only — email orders@velorexmusic.com for international orders.', 'error');
        return;
      }

      setBtn('Preparing…', true);

      // ----- Step 1: ask the server to mint a Razorpay order with the
      // canonical total. The reply is the only thing we trust for amount/key.
      let createRes;
      try {
        createRes = await fetch(API_BASE + '/payments/create-order.php', {
          method: 'POST',
          headers: { ...Auth.headers(), 'Content-Type': 'application/json' },
          body: JSON.stringify(createBody),
        });
      } catch (e) {
        setBtn('⚡ Pay Now', false);
        showToast('Network error — could not start payment: ' + e.message, 'error');
        return;
      }
      const created = await createRes.json().catch(() => ({}));
      if (!createRes.ok || !created.ok) {
        setBtn('⚡ Pay Now', false);
        showToast(created.error || ('Could not create order (HTTP ' + createRes.status + ')'), 'error');
        return;
      }

      // ----- Step 2: open Razorpay Checkout with the server-issued order id.
      // Note: we pass `order_id` — that binds the payment to the server's
      // record so the amount cannot be tampered with from the browser.
      const addressForDisplay = {
        fullName: shippingAddress.fullName,
        phone: shippingAddress.phone,
        line1: shippingAddress.line1,
        city: shippingAddress.city,
        state: shippingAddress.state,
        postalCode: shippingAddress.postalCode,
        country: Addresses.countryName(shippingAddress.countryCode),
      };

      const options = {
        key:       created.keyId,                  // public key only
        order_id:  created.razorpayOrderId,        // server-issued; amount is bound to it
        amount:    created.amount,                 // display only — Razorpay enforces the bound amount
        currency:  created.currency || 'INR',
        name:      'Velorex Music',
        description: 'Vinyl Vault Purchase',
        image:     'https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=120&h=120&fit=crop',
        prefill: {
          name:    shippingAddress.fullName || '',
          email:   isGuest ? createBody.contact.email : ((Auth.getUser() || {}).email || ''),
          contact: shippingAddress.phone || (isGuest ? createBody.contact.phone : ''),
        },
        notes: { address_line: addressForDisplay.line1 || '' },
        theme: { color: '#ff6b35' },
        modal: {
          ondismiss: function () {
            // User closed Checkout without completing — nothing to do, the
            // payment_orders row stays in 'created' state and just expires.
            setBtn('⚡ Pay Now', false);
          },
        },
        handler: async function (response) {
          // ----- Step 3: verify on the server.
          document.getElementById('payment-main-view').style.display = 'none';
          document.getElementById('payment-processing-view').classList.add('active');
          try {
            const verifyRes = await fetch(API_BASE + '/payments/verify.php', {
              method: 'POST',
              headers: { ...Auth.headers(), 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature:  response.razorpay_signature,
              }),
            });
            const verified = await verifyRes.json().catch(() => ({}));
            if (!verifyRes.ok || !verified.ok) {
              // Payment captured but verification failed → don't show success.
              // The webhook will finalize the order if it really did go through;
              // the user can refresh their profile shortly to see it appear.
              throw new Error(verified.error || ('Verification failed (HTTP ' + verifyRes.status + ')'));
            }
            Storage.saveCart([]);
            Storage.syncFromServer().catch(() => {});
            showToast('🎉 Payment Successful! Order ID: ' + verified.orderId, 'success');
            closePaymentModal();
            // After a successful guest order we offer an account upgrade.
            // Two paths:
            //   (a) Customer ticked "Save my info" inline during checkout and
            //       gave us a password → call signup silently. On success
            //       they're logged in and the order is already attached
            //       (claim-on-signup in signup.php). Land them on /#profile.
            //   (b) They didn't tick it → pop the post-purchase upgrade modal.
            //       If they accept it, same outcome. If they decline ("No
            //       thanks"), continue to the public tracking page as before.
            // The whole flow is best-effort: if any of the upgrade calls fail
            // we never block the customer from landing on a useful page.
            if (isGuest) {
              await handleGuestPostPurchase(verified.orderId, createBody);
            } else {
              navigate('profile');
            }
          } catch (err) {
            // Surface a calm message — the user's money has already moved, so
            // we don't want to make them panic. The webhook will finalize.
            showToast('Payment received — verifying with our server. Check your orders in a moment. (' + err.message + ')', 'info');
            closePaymentModal();
            if (isGuest) {
              // Fallback: we don't yet have the internal VD-… id. Drop the
              // customer onto the empty tracking form with email pre-filled so
              // they can paste the id from the email receipt the webhook
              // finalizer is sending in parallel.
              const guestEmail = (createBody.contact && createBody.contact.email) || '';
              window.location.href = 'track-order.html'
                + (guestEmail ? '?email=' + encodeURIComponent(guestEmail) : '');
            } else {
              navigate('profile');
            }
          }
        },
      };

      const rzp = new Razorpay(options);
      rzp.on('payment.failed', response => {
        setBtn('⚡ Pay Now', false);
        const desc = (response && response.error && response.error.description) || 'Payment failed';
        showToast('Payment Failed: ' + desc, 'error');
      });
      rzp.open();
      // Re-enable the button after Razorpay takes over so the user can retry
      // if they dismiss the modal without paying.
      setBtn('⚡ Pay Now', false);
    }
