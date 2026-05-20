/* =============================================================================
   Velorex Music — toast notifications (storefront)
   Used by: index.html

   showToast(message, type) — creates a transient pill in the bottom-right
   (bottom strip on mobile) and auto-dismisses after 3 seconds. Multiple
   toasts stack; clicks fall through (.toast-container has pointer-events: none).

   The container element is created lazily on first call so we don't have to
   render it in the HTML template.

   Visual styling lives in src/styles/components/toast.css.
   ============================================================================= */

function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = {
    success: '<i class="fas fa-circle-check"></i>',
    error:   '<i class="fas fa-circle-xmark"></i>',
    info:    '<i class="fas fa-circle-info"></i>'
  };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || '🎵'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
