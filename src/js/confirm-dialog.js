/* =============================================================================
   Velorex Music — confirm dialog (storefront)
   Used by: index.html

   Replaces the native window.confirm() with a styled modal. Callers pass
   { title, message, confirmText, onConfirm } and the dialog wires up the
   confirm button to call onConfirm() after closing.

   Expects the #confirmModal element to exist in the DOM (rendered by index.html
   alongside the other modals). If it's missing the function is a no-op rather
   than throwing — callers should still pre-check critical state.
   ============================================================================= */

function openConfirmDialog(options) {
  var modal = document.getElementById('confirmModal');
  if (!modal) return;
  document.getElementById('confirmModalTitle').textContent = options.title || 'Confirm';
  document.getElementById('confirmModalMessage').textContent = options.message || 'Are you sure?';
  var btn = document.getElementById('confirmModalConfirmBtn');
  btn.textContent = options.confirmText || 'Confirm';
  btn.onclick = function () {
    closeConfirmDialog();
    if (typeof options.onConfirm === 'function') options.onConfirm();
  };
  modal.classList.add('open');
}

function closeConfirmDialog() {
  var m = document.getElementById('confirmModal');
  if (m) m.classList.remove('open');
}
