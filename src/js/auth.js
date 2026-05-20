/* =============================================================================
   Velorex Music — storefront Auth helper
   Used by: index.html

   Manages the customer session: bearer token + cached user object in
   localStorage. The token is sent as `Authorization: Bearer <token>` on
   protected calls.

   Loaded after utils.js + constants.js (needs API_BASE). Loaded BEFORE
   addresses.js (which uses Auth.headers()) and before the main inline
   <script> block.

   Cross-module touch points (resolved at call time, not load time):
     - _refreshCartBadge() reaches into CartHelpers (defined in inline script).
     - _claimAnonCart() reads/writes the same localStorage keys Storage uses
       (vv_cart_anon, vv_cart_<id>) — keep both in sync if either changes.
   ============================================================================= */

    // ---- Auth ----
    // Manages the customer session: token + cached user object in localStorage.
    // Token is sent as `Authorization: Bearer <token>` on protected calls.
    const Auth = {
      TOKEN_KEY: 'vv_auth_token',
      USER_KEY: 'vv_auth_user',

      getToken() { return localStorage.getItem(this.TOKEN_KEY) || ''; },
      getUser() {
        const raw = localStorage.getItem(this.USER_KEY);
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
      },
      isLoggedIn() { return !!this.getToken(); },

      _setSession(token, user) {
        localStorage.setItem(this.TOKEN_KEY, token);
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
      },
      _clearSession() {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
      },
      // When a user logs in or signs up, claim any anonymous cart in this browser
      // (so the "browse anonymously then sign up at checkout" flow preserves items).
      // If the user already has a saved cart from a previous session, keep that instead.
      _claimAnonCart(userId) {
        const anonKey = 'vv_cart_anon';
        const userKey = 'vv_cart_' + userId;
        const anon = localStorage.getItem(anonKey);
        if (anon !== null && !localStorage.getItem(userKey)) {
          localStorage.setItem(userKey, anon);
        }
        localStorage.removeItem(anonKey);
      },
      _refreshCartBadge() {
        if (typeof CartHelpers !== 'undefined') CartHelpers.updateBadge();
      },

      headers() {
        const t = this.getToken();
        return t ? { 'Authorization': 'Bearer ' + t } : {};
      },

      async signup(data) {
        const res = await fetch(API_BASE + '/auth/signup.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Signup failed');
        this._claimAnonCart(json.user.id);
        this._setSession(json.token, json.user);
        this._refreshCartBadge();
        return json.user;
      },

      async login(email, password) {
        const res = await fetch(API_BASE + '/auth/login.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Login failed');
        this._claimAnonCart(json.user.id);
        this._setSession(json.token, json.user);
        this._refreshCartBadge();
        return json.user;
      },

      async logout() {
        try {
          await fetch(API_BASE + '/auth/logout.php', {
            method: 'POST',
            headers: this.headers(),
          });
        } catch (e) { /* logout is best-effort on the client */ }
        this._clearSession();
        // Keep the user's cart (vv_cart_<id>) so it's still there when they log back in.
        // Clear vv_cart_anon so the next anonymous browser session starts fresh.
        localStorage.removeItem('vv_cart_anon');
        this._refreshCartBadge();
      },

      async fetchMe() {
        if (!this.isLoggedIn()) return null;
        try {
          const res = await fetch(API_BASE + '/auth/me.php', { headers: this.headers(), cache: 'no-store' });
          if (res.status === 401) {
            this._clearSession();
            return null;
          }
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Failed to load profile');
          localStorage.setItem(this.USER_KEY, JSON.stringify(json.user));
          return json.user;
        } catch (e) {
          console.warn('Auth.fetchMe failed:', e.message);
          return this.getUser();
        }
      },

      async updateProfile(data) {
        const res = await fetch(API_BASE + '/auth/update-profile.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this.headers() },
          body: JSON.stringify(data),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Update failed');
        localStorage.setItem(this.USER_KEY, JSON.stringify(json.user));
        return json.user;
      },

      async changePassword(currentPassword, newPassword) {
        const res = await fetch(API_BASE + '/auth/change-password.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this.headers() },
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Password change failed');
        return true;
      },

      async fetchOrders() {
        if (!this.isLoggedIn()) return [];
        const res = await fetch(API_BASE + '/orders.php', { headers: this.headers(), cache: 'no-store' });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      },
    };
