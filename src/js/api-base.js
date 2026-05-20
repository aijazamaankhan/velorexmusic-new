/* =============================================================================
   Velorex Music — shared API base path
   Used by: index.html, vlx-admin-2026.html

   Both storefront and admin make fetch() calls to /api/*.php. This constant
   is split into its own tiny file (rather than living in constants.js)
   because admin doesn't need the storefront's country/state lookups but
   does need API_BASE, and the script-scope sharing semantics of non-module
   scripts make a single shared file the cleanest way to express that.
   ============================================================================= */

const API_BASE = '/api';
