/* =============================================================================
   Velorex Music — admin toast
   Used by: vlx-admin-2026.html

   Note the deliberate naming clash with the storefront's showToast: both
   functions are named showToast but they are different — the storefront
   creates transient pills in a container and supports stacking; the admin's
   showToast is a single fixed element (#toast in the markup) repurposed for
   each message, with a 3-second auto-hide. The admin only ever loads this
   file; the storefront only loads src/js/toast.js. There is no page that
   loads both.

   Visual styling lives in src/styles/admin/components/toast.css.
   ============================================================================= */

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.display = 'block';
  toast.style.borderLeftColor = type === 'success' ? 'var(--success)' : 'var(--danger)';

  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}
