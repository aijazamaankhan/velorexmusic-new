/* =============================================================================
   Velorex Music — address modal + form (storefront)
   Used by: index.html (profile Addresses tab + checkout flow)

   Exports (all script-scope globals — non-module script):
     - openAddressModal(id?, context?)
     - closeAddressModal()
     - updateAddressFormForCountry()  — wires the state/postal/landmark/GSTIN
                                        widgets to the chosen country.
     - setAddressFormState(value)
     - readAddressFormState()
     - submitAddressForm(event)       — async; POST /api/addresses.php via Addresses helper.
     - confirmDeleteAddress(id)

   Cross-module touch points (resolved at runtime):
     - Auth, Addresses               (src/js/auth.js + addresses.js)
     - COUNTRIES, IN_STATES, US_STATES, STATE_REQUIRED, POSTAL_REQUIRED
                                     (src/js/constants.js)
     - showToast                     (src/js/toast.js)
     - openConfirmDialog             (src/js/confirm-dialog.js)
     - navigate, renderCheckoutAddressPicker, renderAddressesSPA
                                     (still in inline <script>; called at runtime
                                      after user actions, so resolution is fine.)

   The "context" arg distinguishes between the profile tab (default) and the
   checkout flow — when context==='checkout' the modal close path refreshes
   the checkout address picker; otherwise it re-renders the profile list.
   The two contexts share this form because the address shape is identical;
   only the post-save destination differs.
   ============================================================================= */

    function openAddressModal(id, context) {
      var modal = document.getElementById('addressModal'); if (!modal) return;
      if (!Auth.isLoggedIn()) { showToast('Please sign in first', 'info'); navigate('login'); return; }
      // Populate country dropdown once.
      var countrySel = document.getElementById('addr-country');
      if (countrySel && !countrySel.options.length) {
        countrySel.innerHTML = COUNTRIES.map(c => `<option value="${c[0]}">${c[1]}</option>`).join('');
      }
      document.getElementById('addressForm').reset();
      document.getElementById('addr-id').value = '';
      document.getElementById('addr-context').value = context || 'profile';
      document.getElementById('addressFormError').style.display = 'none';
      document.getElementById('addressModalTitle').textContent = id ? 'Edit Address' : 'Add Address';
      document.getElementById('addressSubmitBtn').textContent = id ? 'Save Changes' : 'Save Address';

      if (id) {
        var existing = (Addresses._cached || []).find(a => a.id === id);
        if (!existing) { showToast('Address not found', 'error'); return; }
        document.getElementById('addr-id').value = existing.id;
        document.getElementById('addr-country').value = existing.countryCode;
        document.getElementById('addr-fullName').value = existing.fullName || '';
        document.getElementById('addr-phone').value = existing.phone || '';
        document.getElementById('addr-line1').value = existing.line1 || '';
        document.getElementById('addr-line2').value = existing.line2 || '';
        document.getElementById('addr-landmark').value = existing.landmark || '';
        document.getElementById('addr-city').value = existing.city || '';
        document.getElementById('addr-postal').value = existing.postalCode || '';
        document.getElementById('addr-label').value = existing.label || '';
        document.getElementById('addr-gstin').value = existing.gstin || '';
        document.getElementById('addr-default').checked = !!existing.isDefault;
        updateAddressFormForCountry();
        // Set state AFTER updateAddressFormForCountry has wired up the right widget.
        setAddressFormState(existing.state || '');
      } else {
        document.getElementById('addr-country').value = 'IN';
        updateAddressFormForCountry();
      }

      modal.classList.add('open');
    }

    function closeAddressModal() {
      var m = document.getElementById('addressModal'); if (m) m.classList.remove('open');
    }

    function updateAddressFormForCountry() {
      var code = document.getElementById('addr-country').value;
      var stateLabel = document.getElementById('addr-state-label');
      var postalLabel = document.getElementById('addr-postal-label');
      var stateSelect = document.getElementById('addr-state-select');
      var stateInput = document.getElementById('addr-state-input');
      var landmark = document.getElementById('addr-landmark-group');
      var gstinGroup = document.getElementById('addr-gstin-group');

      // State widget: dropdown for IN + US, free text elsewhere.
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
      if (code !== 'IN') document.getElementById('addr-landmark').value = '';

      // GSTIN is India-only.
      gstinGroup.style.display = code === 'IN' ? '' : 'none';
      if (code !== 'IN') document.getElementById('addr-gstin').value = '';
    }

    function setAddressFormState(val) {
      var sel = document.getElementById('addr-state-select');
      var input = document.getElementById('addr-state-input');
      if (sel.style.display !== 'none') {
        // Make sure the value exists as an option, otherwise leave blank.
        var opt = Array.from(sel.options).find(o => o.value === val);
        sel.value = opt ? val : '';
      } else {
        input.value = val || '';
      }
    }

    function readAddressFormState() {
      var sel = document.getElementById('addr-state-select');
      var input = document.getElementById('addr-state-input');
      return sel.style.display !== 'none' ? sel.value : input.value.trim();
    }

    async function submitAddressForm(ev) {
      ev.preventDefault();
      var errBox = document.getElementById('addressFormError');
      errBox.style.display = 'none';
      var country = document.getElementById('addr-country').value;
      var payload = {
        label: document.getElementById('addr-label').value.trim() || null,
        fullName: document.getElementById('addr-fullName').value.trim(),
        phone: document.getElementById('addr-phone').value.trim(),
        line1: document.getElementById('addr-line1').value.trim(),
        line2: document.getElementById('addr-line2').value.trim() || null,
        landmark: country === 'IN' ? (document.getElementById('addr-landmark').value.trim() || null) : null,
        city: document.getElementById('addr-city').value.trim(),
        state: readAddressFormState() || null,
        postalCode: document.getElementById('addr-postal').value.trim() || null,
        countryCode: country,
        gstin: country === 'IN' ? (document.getElementById('addr-gstin').value.trim().toUpperCase() || null) : null,
        isDefault: document.getElementById('addr-default').checked,
      };
      var idStr = document.getElementById('addr-id').value;
      if (idStr) payload.id = parseInt(idStr, 10);

      // Lightweight client-side guard. The server is authoritative.
      if (!payload.fullName || !payload.phone || !payload.line1 || !payload.city || !payload.countryCode) {
        errBox.textContent = 'Please fill in all required fields.';
        errBox.style.display = 'block';
        return;
      }

      var btn = document.getElementById('addressSubmitBtn');
      var origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        var saved = await Addresses.save(payload);
        closeAddressModal();
        showToast(idStr ? 'Address updated' : 'Address saved', 'success');
        var context = document.getElementById('addr-context').value;
        if (context === 'checkout') {
          // Collapse the picker and show the summary with the just-saved address.
          var picker = document.getElementById('checkout-address-picker');
          var summary = document.getElementById('checkout-address-summary');
          if (picker) picker.style.display = 'none';
          if (summary) summary.style.display = '';
          await renderCheckoutAddressPicker(saved.id);
        } else {
          var user = Auth.getUser();
          renderAddressesSPA(user);
        }
      } catch (e) {
        errBox.textContent = e.message || 'Save failed';
        errBox.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }

    function confirmDeleteAddress(id) {
      openConfirmDialog({
        title: 'Delete Address',
        message: 'Remove this address from your saved addresses? Existing orders are unaffected.',
        confirmText: 'Delete',
        onConfirm: async () => {
          try {
            await Addresses.remove(id);
            showToast('Address deleted', 'success');
            renderAddressesSPA(Auth.getUser());
          } catch (e) {
            showToast(e.message || 'Delete failed', 'error');
          }
        },
      });
    }
