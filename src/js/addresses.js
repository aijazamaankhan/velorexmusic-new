/* =============================================================================
   Velorex Music — storefront Addresses helper
   Used by: index.html (profile addresses tab, checkout flow)

   Thin CRUD wrapper around /api/addresses.php. Caches the list in memory so
   the checkout picker doesn't refetch on every open; the cache is dropped on
   any mutating write so the next read sees the server's canonical state.

   Loaded after constants.js (for COUNTRIES) and auth.js (for Auth.headers()).
   ============================================================================= */

    const Addresses = {
      _cached: null,
      async fetchAll(force = false) {
        if (!Auth.isLoggedIn()) return [];
        if (!force && this._cached) return this._cached;
        const res = await fetch(API_BASE + '/addresses.php', { headers: Auth.headers(), cache: 'no-store' });
        if (!res.ok) return [];
        const data = await res.json();
        this._cached = Array.isArray(data) ? data : [];
        return this._cached;
      },
      async save(payload) {
        const res = await fetch(API_BASE + '/addresses.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...Auth.headers() },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Save failed');
        this._cached = null;
        return json.address;
      },
      async remove(id) {
        const res = await fetch(API_BASE + '/addresses.php?id=' + encodeURIComponent(id), {
          method: 'DELETE',
          headers: Auth.headers(),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Delete failed');
        this._cached = null;
        return true;
      },
      invalidate() { this._cached = null; },
      formatOneLine(a) {
        const parts = [a.line1, a.line2, a.landmark, a.city, a.state, a.postalCode, this.countryName(a.countryCode)].filter(Boolean);
        return parts.join(', ');
      },
      countryName(code) {
        const c = COUNTRIES.find(x => x[0] === code);
        return c ? c[1] : code;
      },
    };
