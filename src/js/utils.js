/* =============================================================================
   Velorex Music — shared utilities
   Used by: index.html, vlx-admin-2026.html

   Loaded as a plain <script src=...> (NOT type="module") so the existing
   inline scripts and onclick= handlers can resolve `Utils` and `escapeHTML`
   via script-scope. When PR 6+ rips out inline event handlers we can promote
   this to a real ES module.

   The escape() function is the single source of truth for HTML escaping —
   used everywhere user-controlled strings get injected into innerHTML.
   ============================================================================= */

const Utils = {
  /**
   * Escape the five HTML metacharacters that lead to XSS when interpolated
   * into innerHTML. Returns non-strings (null/undefined/numbers) unchanged
   * — callers sometimes pass values that may not be strings, and they
   * expect the function to be a no-op for those.
   */
  escape(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }
};

// Admin scripts historically called a top-level escapeHTML() function with
// slightly different semantics than Utils.escape — it coerces null/undefined
// to an empty string instead of returning the value unchanged. Both behaviors
// are preserved so we don't have to audit every call site in PR 4.
function escapeHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
