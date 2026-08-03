# Velorex Music — Project Guide

A reference for anyone (humans or AI assistants) working on this codebase. Read this first.

## 1. What this is

**Velorex Music** (velorexmusic.com) is an e-commerce music store that sells vinyl records, CDs, cassettes, Blu-rays, and DVDs. It has:

- A **customer storefront** — `index.html` (single-page-app with hash routing)
- An **admin panel** — `vlx-admin-2026.html` (inventory + customer management). The file is named off the conventional `/admin` path on purpose so passing customers and bot scanners hitting `/vlx-admin-2026.html` get a 404. Bookmark the real URL.
- A **PHP/MySQL API** — `api/*.php` (data persistence, auth)
- Razorpay (test mode) for payments

Hosted on **Hostinger** shared hosting (`velorexmusic.com`). The local repo deploys to Hostinger via their Git integration — see [§9 Deployment](#9-deployment).

## 2. Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vanilla HTML/CSS/JS — no framework, no build step |
| Backend | PHP 8.x with PDO + prepared statements |
| Database | MySQL 8.x / 9.x (Hostinger ships LiteSpeed + MySQL) |
| Auth | Custom: server-side session tokens stored in `user_sessions`, sent as `Authorization: Bearer <token>` |
| Payments | Razorpay (test or live, switchable via `RAZORPAY_MODE` in secrets). Server creates the order, browser opens Checkout, server verifies the HMAC signature. Webhook backstop in case the handshake fails. See [§10 Razorpay flow](#razorpay-payment-flow). |
| Dev tooling | Playwright + an MCP server for admin-panel browser tests (optional, not required for normal dev) |

No package bundler. No transpilation. What you see in `index.html`/`vlx-admin-2026.html` is what runs in the browser. Edit, save, refresh.

## 3. Repository layout

```
velorexmusic-new/
├── CLAUDE.md                    # ← this file
├── index.html                   # Customer storefront (SPA). ~2.3k lines.
├── vlx-admin-2026.html          # Admin panel. ~3.1k lines. (Renamed off the conventional `/admin.html` path so customers and bot scanners can't trivially discover the login.)
├── src/                         # Extracted modular code (introduced incrementally — see §13)
│   └── styles/
│       ├── tokens.css           # Storefront CSS variables (used by index + 5 static pages)
│       ├── base.css             # Storefront reset + body + scrollbar
│       ├── components/
│       │   ├── buttons.css      # .btn + variants (primary/secondary/outline/danger/gold/sm/lg/block)
│       │   ├── forms.css        # .form-grid, .form-group, .form-label, .form-control
│       │   ├── modal.css        # .modal-overlay > .modal pattern + mobile scroll-the-overlay fix
│       │   ├── payment-modal.css# .payment-modal > .payment-card (Razorpay overlay)
│       │   ├── toast.css        # .toast-container + .toast variants + keyframes
│       │   └── skeleton.css     # Shared skeleton loaders — shimmer keyframe + card/row/
│       │                        # order/stat/drawer shapes. Used by storefront + admin.
│       ├── pages/
│       │   ├── storefront.css   # All page-level storefront CSS (navbar, hero, products grid,
│       │   │                    # cart, profile, footer, status stepper, responsive). Single
│       │   │                    # large file for now — split per-page if a section needs iteration.
│       │   └── static-pages.css # Shared chrome (navbar + brand + glass-card + h1/h2/p + btn
│       │                        # + responsive) for contact / faq / shipping / returns. Not used
│       │                        # by track-order (page-specific btn/control variants) or
│       │                        # maintenance (its own design system).
│       └── admin/
│           ├── tokens.css       # Admin CSS variables (used by vlx-admin-2026.html only)
│           ├── base.css         # Admin reset + body + scrollbar
│           ├── components/
│           │   ├── buttons.css  # Admin .btn + .btn-primary
│           │   ├── forms.css    # Admin .form-grid + .form-control (semi-transparent dark style)
│           │   ├── modal.css    # .modal-overlay > .modal-content (note: different from storefront's .modal)
│           │   └── toast.css    # Single-element admin toast (bottom-right pop)
│           └── pages/
│               └── admin.css    # All page-level admin CSS (sidebar layout, header, panels,
│                                # tables, drawer, login screen, responsive).
├── src/
│   └── js/                      # Extracted JS modules (PR 4). Plain non-module
│       │                        # scripts — they share script-scope with the
│       │                        # inline <script> + onclick= handlers.
│       ├── utils.js             # Utils.escape (HTML escape, returns non-strings unchanged)
│       │                        # + top-level escapeHTML() (coerces null → '', for admin use)
│       ├── api-base.js          # const API_BASE = '/api' — shared by storefront + admin
│       ├── constants.js         # COUNTRIES, IN_STATES, US_STATES, STATE_REQUIRED,
│       │                        # POSTAL_REQUIRED, PEOPLE_LABELS (storefront only)
│       ├── storage.js           # Storefront Storage helper — 3-tier graceful
│       │                        # degradation against localStorage quota, per-user cart
│       ├── auth.js              # Auth — bearer token + session + login/signup/logout
│       ├── addresses.js         # Addresses CRUD wrapper around /api/addresses.php
│       ├── shipping.js          # Shipping.calculate(subtotal, address) — zone-based
│       │                        # tiers (Delhi/NCR ₹49, rest ₹99, remote ₹199; free
│       │                        # pan-India ≥ ₹5,000). PHP mirror in api/_shipping_helpers.php
│       │                        # — keep both files in sync.
│       ├── toast.js             # showToast() — bottom-right pill, auto-dismisses (storefront)
│       ├── confirm-dialog.js    # openConfirmDialog/closeConfirmDialog — styled window.confirm replacement
│       ├── cart.js              # CartHelpers — addToCart/updateQty/getCartCount/getCartTotal + stock guards
│       ├── address-form.js      # openAddressModal + country-aware state/postal/landmark/GSTIN widgets +
│       │                        # submitAddressForm + confirmDeleteAddress (shared by profile + checkout)
│       ├── skeleton.js          # Skeleton.{productGrid, orderCards, statCards, tableRows,
│       │                        # drawerSection, inlineLine} — string-output helpers used by
│       │                        # both storefront + admin for cold-cache placeholder UI.
│       ├── seo.js               # URL vocabulary (buildPath/parsePath/slugify) + live
│       │                        # <title>/description/canonical/robots updates on SPA
│       │                        # navigation. slugify() MUST stay byte-identical to
│       │                        # velorex_slugify() in src/seo/seo-lib.php — see §15.
│       ├── storefront/
│       │   ├── carriers.js      # CARRIERS_META + carrier helpers (inline SVG logos, tracking URLs)
│       │   ├── pages.js         # createProductCard + all initPageXxx + page renderers
│       │   │                    # (login/signup/home/products/product-detail/cart/profile)
│       │   ├── router.js        # injectNavbar + injectFooter + theme/mobile-nav toggles +
│       │   │                    # buildPageUrl/parsePageFromUrl/navigate/initPage dispatcher +
│       │   │                    # currentPage/_detailQty/_detailMax/CURRENT_USER_ORDERS state
│       │   └── checkout.js      # checkoutSPA + processPayment + guest contact/address form +
│       │                        # guest-upgrade modal (Phase 1C) + renderCheckoutAddressPicker
│       └── admin/
│           ├── storage.js       # Admin Storage helper — caches products/orders/categories
│           │                    # with the same 3-tier degradation pattern
│           ├── main.js          # adminAuthHeaders + last-save badge + category helpers +
│           │                    # checkAuth/showAdminLayout/handleLogin/handleLogout +
│           │                    # theme + toggleAdminSidebar + switchPanel + load listeners
│           ├── customers.js     # Customers panel (CustState + table + Guests filter) +
│           │                    # right-side drawer (profile/orders/addresses/sessions/
│           │                    # notes/danger tabs) + all customer mutations
│           ├── orders.js        # Orders panel + order detail modal + status taxonomy +
│           │                    # inline shipment edit + patchOrder + print invoice
│           ├── inventory.js     # Dashboard + products table + product modal (new + edit) +
│           │                    # image gallery + bulk CSV upload
│           └── toast.js         # Admin showToast (single-element pattern, distinct from
│                                # storefront's container+items toast)
├── contact.html, faq.html,      # Static info pages.
│   shipping.html, returns.html,
│   track-order.html, maintenance.html
├── .htaccess                    # Root rewrites: pretty catalogue URLs → seo-render.php,
│                                # HTTPS + non-www canonical, compression, asset caching,
│                                # and denial of .md/.json/scripts/. See §15.
├── .gitattributes               # Forces LF everywhere. NOT cosmetic — scripts/bump-cache.js
│                                # hashes raw bytes, so a CRLF checkout produces cache-bust
│                                # tokens that never match what the Linux host serves. See §15.
├── robots.txt                   # Crawl policy + sitemap pointer.
├── sitemap.php                  # Serves /sitemap.xml (rewritten). Generated from the live
│                                # products table — new products appear with no deploy.
├── seo-render.php               # Front controller that server-renders product + category
│                                # pages at real URLs with per-page metadata and JSON-LD.
├── favicon.svg                  # Vinyl-record mark, matches src/styles/tokens.css colours.
├── src/seo/
│   └── seo-lib.php              # Shared SEO library: slugify, category taxonomy, meta-tag
│                                # builder, JSON-LD builders. Used by seo-render + sitemap.
├── api/
│   ├── .htaccess                # Deny direct access to config*.php, disable LiteSpeed cache
│   ├── config.php               # GITIGNORED. Real DB creds + ADMIN_PASS + shared helpers
│   ├── config.example.php       # Template (tracked in git). Copy to config.php on server.
│   ├── products.php             # GET (lean list — id/title/artist/price/cover URL/etc., NO heavy
│   │                            # description/gallery/specs) / POST (bulk replace, admin-only) / DELETE
│   ├── product.php              # GET ?id=N → full product detail (heavy fields). Phase 1 split.
│   ├── upload-product-image.php # POST multipart (admin-only). Writes image to
│   │                            # public_html/uploads/products/<hash>.<ext>; returns URL.
│   ├── categories.php           # GET / POST (admin-only, replaces full list)
│   ├── orders.php               # GET (admin: all, user: own) / POST (user-only)
│   ├── auth/
│   │   ├── signup.php           # POST { email, password, firstName, lastName }
│   │   ├── login.php            # POST { email, password } → { token, user }
│   │   ├── logout.php           # POST (Bearer token) — deletes the session row
│   │   ├── me.php               # GET (Bearer) → { user (incl. stats) }
│   │   ├── update-profile.php   # POST (Bearer)
│   │   └── change-password.php  # POST (Bearer)
│   ├── admin/
│   │   ├── users.php            # GET (list) / POST (reset-password / update-profile / force-logout / update-notes / delete-user)
│   │   ├── customer-detail.php  # GET ?userId=N → orders, addresses, sessions (batched for the admin drawer)
│   │   └── guest-customers.php  # GET → rolled-up guest checkouts grouped by email (admin Guests filter)
│   ├── _address_helpers.php     # Shared address validation + snapshot helpers (addresses.php + create-order.php)
│   ├── _shipping_helpers.php    # shipping_calculate($subtotal,$address) — server mirror of
│   │                            # src/js/shipping.js. Authoritative at /api/payments/create-order.php
│   │                            # time; keep both files in sync.
│   ├── _mailer.php              # PHPMailer wrapper: send_mail($to,$name,$subject,$html,$text). Never throws.
│   ├── _email_templates.php     # order_receipt_email($orderData) → { subject, html, text }
│   └── lib/PHPMailer/           # PHPMailer v6.9.1 — three vendored files, no Composer
│       ├── PHPMailer.php
│       ├── SMTP.php
│       └── Exception.php
├── package.json                 # Just Playwright + MCP — no app dependencies
├── playwright-mcp-server.js     # MCP server (used optionally for admin-panel browser tests)
├── test-admin-login.js          # Sanity test for admin login
├── scripts/
│   ├── bump-cache.js            # Content-hash cache-bust for HTML asset refs.
│   │                            # `npm run prep-deploy` rewrites every <script>/<link>
│   │                            # ?v= to a SHA-1 of the referenced file. See §9.
│   ├── hooks/pre-push           # Refuses `git push` if cache-bust is stale.
│   │                            # Activate per clone: `git config core.hooksPath scripts/hooks`
│   ├── migrate-product-images.php  # One-shot, idempotent: converts existing
│   │                               # base64 data: URLs in products.image / images
│   │                               # to files under public_html/uploads/products/
│   │                               # and rewrites the DB to point at URLs.
│   │                               # Run once on Hostinger after Phase 1 deploy.
│   ├── ensure-uploads-symlink.sh   # Cron-driven safety net that recreates the
│   │                               # public_html/uploads → ~/uploads symlink
│   │                               # if a deploy wipes it. See §10 ops gotcha.
│   ├── setup.js, start.js,      # Docker-based local dev orchestration (see §8.0)
│   │   stop.js, logs.js
│   └── schema.sql               # Authoritative schema dump applied to fresh DBs
├── .gitignore                   # node_modules, screenshots, api/config.php, etc.
├── .vscode/settings.json        # MCP config for VS Code
├── implementation_plan.md       # Historical: Razorpay integration plan
├── walkthrough.md               # Historical: Razorpay flow walkthrough
├── PLAYWRIGHT_MCP_README.md     # How to run the Playwright MCP server
└── old admin/                   # Archived earlier admin UI — ignore unless doing forensics
```

## 4. Architecture overview

```
┌────────────────────────┐         ┌────────────────────────┐
│  index.html (SPA)      │         │  vlx-admin-2026.html (SPA)      │
│  - Hash-routed pages   │         │  - Sidebar-routed      │
│  - Storage (cache)     │         │  - Storage (cache)     │
│  - Auth (tokens)       │         │  - X-Admin-Pass header │
│  - Razorpay overlay    │         │                        │
└──────────┬─────────────┘         └──────────┬─────────────┘
           │                                  │
           │  fetch()                         │  fetch()
           │                                  │
           v                                  v
┌──────────────────────────────────────────────────────────┐
│  api/*.php  — PHP 8 + PDO                                │
│  - Bearer-token user auth (api/config.php helpers)       │
│  - X-Admin-Pass admin auth                               │
│  - JSON in/out, never-cache headers                      │
└──────────────────────────┬───────────────────────────────┘
                           │ PDO
                           v
                ┌──────────────────────┐
                │  MySQL               │
                │  - products          │
                │  - categories        │
                │  - orders            │
                │  - users             │
                │  - user_sessions     │
                └──────────────────────┘
```

**localStorage is a cache, not state.** Anything the server can answer for, the server is the source of truth. localStorage exists so the next page render can paint instantly while the network call refreshes the cache. Don't ever assume localStorage represents reality without re-fetching.

**Two auth schemes, intentionally separate:**

| Scheme | Header | Used by | Who can set it |
|---|---|---|---|
| Admin | `X-Admin-Pass: <ADMIN_PASS>` | vlx-admin-2026.html → admin-only endpoints | Single value in `api/config.php` (constant `ADMIN_PASS`) |
| Customer | `Authorization: Bearer <token>` | index.html → user-only endpoints | Issued by `login.php`/`signup.php`, stored in `user_sessions` table |

Admin and customer auth never overlap — admin requests don't have a user, customer requests aren't admins. `api/orders.php` is the one endpoint that branches: `is_admin_request()` returns all orders; otherwise `require_user()` returns the caller's orders.

## 5. Database schema

```sql
-- Products. id is NOT auto-increment — the admin UI picks the next id.
CREATE TABLE products (
  id INT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  artist VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  language VARCHAR(50),
  price INT NOT NULL,
  original_price INT,
  description TEXT,
  image LONGTEXT,                   -- primary/cover. LONGTEXT because uploads are stored as base64 data: URLs (too large for TEXT).
  images LONGTEXT,                  -- full gallery as JSON array (uploads + URL entries). LONGTEXT for the same reason.
  rating DECIMAL(2,1) DEFAULT 0,
  reviews INT DEFAULT 0,
  badge VARCHAR(50),                -- 'hot' | 'new' | 'upcoming' | null
  stock INT DEFAULT 0,
  music_director VARCHAR(255),
  track_listing TEXT,
  specs JSON,                       -- { format, speed, label, year, tracks, genre, theme }
  people JSON,                      -- ['rd-burman', 'amitabh-bachchan', ...]
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  name VARCHAR(50) PRIMARY KEY,
  sort_order INT DEFAULT 0
);

CREATE TABLE orders (
  id VARCHAR(50) PRIMARY KEY,        -- 'VD-XXXXX' format
  user_id INT NULL,                  -- null only for legacy orders
  order_data JSON NOT NULL,          -- full order blob: items[], total, paymentId, status, etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,  -- bcrypt via password_hash()
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(30),
  date_of_birth DATE,
  music_preferences VARCHAR(500),
  notes TEXT NULL,                      -- admin-only internal notes (support call history etc.)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE user_sessions (
  token VARCHAR(64) PRIMARY KEY,        -- 64-hex from random_bytes(32)
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,        -- 30 days by default (see create_session_for_user)
  INDEX idx_user (user_id),
  INDEX idx_expires (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Saved shipping addresses. Hard delete; orders snapshot a frozen copy into orders.order_data.
CREATE TABLE addresses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  label VARCHAR(50),                    -- optional free-text ("Home", "Office", ...)
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NOT NULL,           -- includes country code, loose validation
  line1 VARCHAR(255) NOT NULL,
  line2 VARCHAR(255),
  landmark VARCHAR(150),                -- India-only field in the UI
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100),                   -- required by the API for IN/US/CA/AU
  postal_code VARCHAR(20),              -- required by the API for major shipping countries
  country_code CHAR(2) NOT NULL,        -- ISO-3166-1 alpha-2
  gstin VARCHAR(20),                    -- India B2B only, optional
  is_default TINYINT(1) NOT NULL DEFAULT 0,  -- exactly one row per user has this set (enforced in PHP)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Razorpay payment orders. One row per attempted checkout. Lifecycle:
--   created → paid (success path; internal_order_id is set; matching row exists in orders)
--   created → failed (gateway reported failure via webhook)
--   created → (no transition; expires silently after a day or two)
-- The row is created BEFORE the user is sent to Razorpay Checkout — it binds
-- the Razorpay order_id to the canonical amount + items + address, so the
-- browser cannot tamper with what's actually charged.
CREATE TABLE payment_orders (
  razorpay_order_id VARCHAR(64) PRIMARY KEY,
  user_id INT NULL,                               -- NULL for guest checkouts
  guest_contact JSON NULL,                        -- {email, phone, fullName} for guests; NULL for registered orders
  amount_paise BIGINT NOT NULL,                   -- canonical amount; never re-derive from anywhere else
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  mode ENUM('test','live') NOT NULL,              -- which key set was active when the order was minted
  status ENUM('created','paid','failed') NOT NULL DEFAULT 'created',
  items JSON NOT NULL,                            -- item snapshot at order time (id, name, qty, price, lineTotal)
  shipping_address JSON NOT NULL,                 -- frozen address snapshot at order time
  internal_order_id VARCHAR(50) NULL,             -- set when paid → matches orders.id ('VD-XXXXXXXX')
  razorpay_payment_id VARCHAR(64) NULL,           -- the Razorpay pay_… id, populated on capture
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_status (status),
  INDEX idx_internal (internal_order_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO categories (name, sort_order) VALUES
  ('vinyl', 1), ('cd', 2), ('cassette', 3), ('bluray', 4), ('dvd', 5);
```

**JSON columns:** `products.specs`, `products.people`, `orders.order_data` are MySQL JSON. The PHP layer encodes/decodes them — the frontend always sees normal JS objects.

**`products.id` is not auto-increment.** Admin UI picks the next available id and POSTs it. Bulk POST to `/api/products.php` does `DELETE FROM products` then inserts the provided list — i.e. `saveProducts(filteredList)` truly replaces.

**Sessions never auto-expire client-side.** The server checks `expires_at > NOW()` on every authenticated call. To force a logout, delete the row.

## 6. API reference

All responses are JSON. All responses set `Cache-Control: no-store` (see [§10 LiteSpeed gotcha](#10-operational-knowledge--gotchas)).

### Public endpoints

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/api/products.php` | — | `ProductLean[]` — listing shape only (id, title, artist, category, language, price, originalPrice, image, rating, reviews, badge, stock, musicDirector). Heavy fields (description, full gallery, track listing, specs, people) are NOT included; fetch them via `/api/product.php?id=N`. This drops the list payload from ~27 MB to ~30 KB on a 66-product catalog. |
| GET | `/api/product.php?id=N` | — | Full `Product` for that id (or 404 if missing). Heavy fields included. Called on the product-detail page only. |
| GET | `/api/categories.php` | — | `string[]` (sorted by `sort_order`) |
| POST | `/api/auth/signup.php` | `{ email, password, firstName, lastName? }` | `{ ok, token, user }` |
| POST | `/api/auth/login.php` | `{ email, password }` | `{ ok, token, user }` |
| POST | `/api/contact.php` | `{ fullName, email, subject, message }` | `{ ok, message }` — sends a support request from the contact page. |
| POST | `/api/payments/webhook.php` | raw Razorpay event body; auth via `X-Razorpay-Signature` header | `{ ok }` — server-to-server backstop. Verifies HMAC against `RAZORPAY_*_WEBHOOK_SECRET`. Never call this directly. |

### Customer-authenticated endpoints (require `Authorization: Bearer <token>`)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/auth/me.php` | — | `{ user (incl. stats) }` |
| POST | `/api/auth/logout.php` | — | `{ ok }` (invalidates the session row) |
| POST | `/api/auth/update-profile.php` | `{ firstName?, lastName?, email?, phone?, dateOfBirth?, musicPreferences? }` | `{ ok, user }` |
| POST | `/api/auth/change-password.php` | `{ currentPassword, newPassword }` | `{ ok }` (invalidates all OTHER sessions for this user) |
| GET | `/api/orders.php` | — | `Order[]` (caller's orders) |
| ~~POST `/api/orders.php`~~ | — | — | **Disabled** — returns 410. Order creation runs through the verified payment flow below; direct POSTs were a security hole. |
| POST | `/api/payments/create-order.php` | Registered: `{ items: [{id, qty}], addressId }`. Guest (no Bearer token): `{ items: [{id, qty}], contact: {email, phone}, shippingAddress: {fullName, phone, line1, line2?, landmark?, city, state?, postalCode?, countryCode, gstin?, label?} }`. | `{ ok, keyId, razorpayOrderId, amount, currency, mode, subtotal, shipping, total }` — server recomputes the total from DB prices and mints a Razorpay order bound to that amount. For guest payloads the contact + address are validated inline; the snapshot is persisted on `payment_orders` and copied into `orders.order_data` at finalize time. **India-only:** non-IN `countryCode` returns 400 with `code: 'intl_not_supported'` — intl orders go via email enquiry (see [shipping.html](shipping.html) policy + `checkout-intl-block` in [index.html](index.html)). |
| POST | `/api/payments/verify.php` | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` | `{ ok, orderId, alreadyFinalized }` — verifies HMAC, decrements stock, creates the internal `orders` row. Idempotent. Works for both registered and guest payments — for guest rows (where `payment_orders.user_id IS NULL`) the HMAC signature alone is the gate (only Razorpay and the paying browser ever see it), so no Bearer-token session is required. |
| GET | `/api/addresses.php` | — | `Address[]` (caller's saved addresses, default first) |
| POST | `/api/addresses.php` | `{ id?, fullName, phone, line1, line2?, landmark?, city, state?, postalCode?, countryCode, label?, gstin?, isDefault? }` | `{ ok, address }` — `id` present = update, absent = create. Max 10 per user. |
| DELETE | `/api/addresses.php?id=N` | — | `{ ok }` — hard delete; promotes the next address to default if needed |

### Admin-authenticated endpoints (require `X-Admin-Pass: <ADMIN_PASS>`)

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/products.php` | `{ products: Product[] }` (full list) | `{ ok, count }` — transactional replace |
| POST | `/api/products-bulk-upsert.php` | `{ products: Product[] }` (partial list) | `{ ok, inserted, updated, errors[], products[] }` — **additive** upsert; does NOT wipe untouched rows. Rows without an `id` get auto-assigned `MAX(id)+1`. Used by the admin Bulk Upload CSV flow. |
| POST | `/api/upload-product-image.php` | multipart `image` field (JPG/PNG/WebP, ≤5 MB) | `{ ok, url, bytes, mime }` — writes the file to `public_html/uploads/products/<hash>.<ext>` and returns the URL. Content-addressed and idempotent (same bytes → same hash → same URL → single file on disk). Called by the admin product modal in place of the old base64 FileReader path. |
| DELETE | `/api/products.php?id=N` | — | `{ ok }` |
| POST | `/api/categories.php` | `{ categories: string[] }` (full list) | `{ ok, count }` — transactional replace |
| GET | `/api/orders.php` | — | `Order[]` (all orders, joined with user info) |
| GET | `/api/admin/users.php` | — | `User[]` (each row includes `orderCount`, `totalSpent`, `activeSessionCount`, `addressCount`, `notes`) |
| POST | `/api/admin/users.php` | `{ action: "reset-password", userId, newPassword? }` | `{ ok, generated, newPassword? }` — if `newPassword` is omitted the server generates a strong temp password and returns it once. Always invalidates all sessions for the user. |
| POST | `/api/admin/users.php` | `{ action: "update-profile", userId, firstName?, lastName?, email?, phone? }` | `{ ok, user }` — partial update; rejects email collisions with 409. |
| POST | `/api/admin/users.php` | `{ action: "force-logout", userId }` | `{ ok, revoked }` — deletes all `user_sessions` rows for the user. |
| POST | `/api/admin/users.php` | `{ action: "update-notes", userId, notes }` | `{ ok }` — admin-only free-text notes (max 5000 chars). Requires the `users.notes` migration; 503 otherwise. |
| POST | `/api/admin/users.php` | `{ action: "delete-user", userId, confirmEmail? }` | `{ ok }` — cascades to `user_sessions`; `orders.user_id` is set NULL. Pass `confirmEmail` to require the admin to echo the email before deletion. |
| GET | `/api/admin/customer-detail.php?userId=N` | — | `{ orders, addresses, sessions }` — batched read for the admin customer drawer. |
| GET | `/api/admin/guest-customers.php` | — | `GuestCustomer[]` — `[{email, fullName, phone, orderCount, totalSpent, firstOrderAt, lastOrderAt, registeredUserId}]`. Rolled up from `orders` where `user_id IS NULL`, grouped by `LOWER(JSON_UNQUOTE(JSON_EXTRACT(order_data, '$.contact.email')))`. `registeredUserId` is set if the same email now matches a registered user (claim-on-signup/login has already converted them). |

### config.php helper functions (PHP)

Available to every endpoint via `require_once __DIR__ . '/config.php'`:

| Helper | Purpose |
|---|---|
| `db()` | Returns a singleton PDO connection |
| `require_admin()` | 401 if `X-Admin-Pass` doesn't match `ADMIN_PASS` |
| `is_admin_request()` | Boolean; for endpoints that branch on auth |
| `require_user()` | 401 if no valid Bearer token; returns the user_id otherwise |
| `current_user_id_or_null()` | Returns user_id or null; useful for optional auth |
| `read_json_body()` | Reads + decodes the POST JSON body, 400s on invalid |
| `create_session_for_user($userId, $days = 30)` | Inserts a `user_sessions` row, returns the token |
| `user_public_fields($row)` | Strips `password_hash` and renames columns to camelCase for JSON output |

## 7. Frontend conventions

### Routing (customer SPA in `index.html`)

Hash-based. `navigate('profile')` → `#profile`. `navigate('products', { cat: 'vinyl' })` → `#products?cat=vinyl`. `parsePageFromUrl()` reads the hash, `initPage(page, params)` dispatches to the right `initPageXxx` function. All page sections are `<div id="page-XXX" class="page-section">` — only one is visible at a time.

### Storage helper (index.html)

```js
const Storage = {
  syncFromServer(),      // GET /api/products.php, write to localStorage cache. Called on page init.
  getProducts(),         // Read from localStorage cache.
  saveProducts(arr),     // Write to cache. (Admin path; never used in index.html in practice.)
  getOrders(),           // Read recent orders from localStorage (legacy; new flow uses Auth.fetchOrders())
  saveOrder(order),      // Save locally + POST to /api/orders.php (with Bearer token if logged in).
  getCart(),             // Read from per-user key (vv_cart_anon or vv_cart_<id>).
  saveCart(items),       // Write to the per-user key + refresh cart badge.
  _cartKey(),            // Returns 'vv_cart_anon' or 'vv_cart_<userId>' based on Auth state.
}
```

**Cart is per-user.** Each logged-in user has their own localStorage slot (`vv_cart_<id>`). Anonymous browsers use `vv_cart_anon`. On login/signup, `Auth._claimAnonCart()` migrates the anonymous cart to the user's slot (only if they don't already have one). On logout, the user's slot is preserved but `vv_cart_anon` is cleared so the next anonymous browse starts fresh.

### Auth helper (index.html)

```js
const Auth = {
  TOKEN_KEY: 'vv_auth_token',
  USER_KEY: 'vv_auth_user',
  getToken() / getUser() / isLoggedIn(),
  signup({ email, password, firstName, lastName? }),
  login(email, password),
  logout(),
  fetchMe(),             // Refresh cached user from /api/auth/me.php
  updateProfile(data),
  changePassword(currentPassword, newPassword),
  fetchOrders(),
  headers(),             // Returns { Authorization: 'Bearer ...' } when logged in
}
```

The token is sent as `Authorization: Bearer <token>` on every authenticated request. Signup/login/logout all touch the cart (see [§7 cart behavior](#cart-helper)) so the badge stays accurate.

### Admin Storage helper (vlx-admin-2026.html)

Same idea but writes go to the server via POST with `X-Admin-Pass: <password>`. The admin password is stored in `sessionStorage` after login (key: `admin_pass`) and replayed on every write request.

### Common patterns

- **Bulk replace, not partial updates.** Both products and categories use full-list replace semantics: send the entire desired list, the server `DELETE`s then re-inserts inside a transaction. The frontend just calls `saveProducts(arrayWithoutTheDeletedOne)`.
- **`Utils.escape()` for user-rendered strings.** Always HTML-escape product names, user names, etc. before injecting into `innerHTML`.
- **Empty-state placeholders.** Anywhere we render `array.map(card)`, also handle the empty case with a friendly message. The DB can legitimately be empty.

## 8. Local development setup

### 8.0 Fastest path: `npm run setup` (Linux / macOS / Windows)

If you have Node.js installed, the project ships cross-platform scripts that handle the whole Docker-based setup in one command:

```bash
npm run setup    # installs Docker if missing, creates MySQL + PHP containers,
                 # applies schema, prints URLs to access the site
npm start        # resume after a stop (containers exist, just start them)
npm stop         # stop both containers without losing data
npm run logs     # tail PHP container logs
```

After `npm run setup` you'll see:
- Storefront: `http://localhost:5500/`
- Admin: `http://localhost:5500/vlx-admin-2026.html` (login `owner` / `owner123`)
- API health: `http://localhost:5500/api/categories.php`

[scripts/schema.sql](scripts/schema.sql) is the authoritative schema dump applied to fresh databases. If you change the schema locally, re-dump with:
```bash
docker exec velorex-mysql mysqldump --no-data --skip-comments --skip-add-drop-table \
  -u velorex_dev -p'Tftus@12345' velorex_local > scripts/schema.sql
```
and commit the result.

**Docker install per platform:**

| Platform | What `npm run setup` does |
|---|---|
| Linux | Auto-installs Docker via `get.docker.com` (needs `sudo`). Adds your user to the `docker` group — you may need to log out + back in (or `newgrp docker`) before re-running setup. |
| macOS | Auto-installs Docker Desktop via Homebrew (`brew install --cask docker`). After install, launch Docker Desktop once from `/Applications` to start the daemon, then re-run setup. |
| Windows | Prints instructions — Docker Desktop on Windows must be installed interactively (it needs admin rights + WSL2 setup). Install from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop), launch it once, then run `npm run setup`. |

**Networking:** containers run on a Docker bridge network (`velorex-net`). PHP reaches MySQL via the container DNS name `velorex-mysql:3306` — identical on all OSes. (Older container setups using `--network=host` continue to work; the script detects them and doesn't change anything.)

---

### Manual setup (if you don't want Docker)

You need **PHP 8.x** and **MySQL 8.x or 9.x**. Three install paths below — pick whichever fits your OS. Skip to [§8.4 Common steps](#84-common-steps-all-platforms) once you have working `php` and `mysql` commands.

### 8.1 macOS (Homebrew)

```bash
brew install php mysql
brew services start mysql                  # runs MySQL as a background service
mysqladmin ping -u root                    # should print "mysqld is alive"
```

To stop later: `brew services stop mysql`.

### 8.2 Linux

**Ubuntu / Debian:**
```bash
sudo apt update
sudo apt install -y php php-mysql php-json mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql                # auto-start on boot

# Newer Ubuntu uses auth_socket for root. Either run mysql with sudo,
# or set a root password:
sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'rootpass'; FLUSH PRIVILEGES;"
```

**Fedora / RHEL / CentOS:**
```bash
sudo dnf install -y php php-mysqlnd php-json mysql-server
sudo systemctl start mysqld
sudo systemctl enable mysqld
# RHEL-family generates an initial root password — find it with:
sudo grep 'temporary password' /var/log/mysqld.log
# Then run mysql_secure_installation to set your own.
```

**Arch:**
```bash
sudo pacman -S php mariadb
sudo mariadb-install-db --user=mysql --basedir=/usr --datadir=/var/lib/mysql
sudo systemctl start mariadb
```

Verify: `php --version` and `mysql --version`.

### 8.3 Windows

**Option A — Chocolatey (recommended if you have it):**
```powershell
choco install php mysql -y
# Start MySQL as a service:
net start MySQL80
```

**Option B — Scoop:**
```powershell
scoop install php mysql
mysqld --install
net start MySQL
```

**Option C — Manual:**
1. PHP: download the latest non-thread-safe Windows binary from <https://windows.php.net/download/>, extract to `C:\php`, add `C:\php` to your `PATH`.
2. MySQL: download the MySQL Installer (`mysql-installer-community-...msi`) from <https://dev.mysql.com/downloads/installer/>. Run it, pick "Server only", set a root password during setup.

**Option D — XAMPP / WAMP (all-in-one):**
Easiest if you don't want to manage services. Download XAMPP (<https://www.apachefriends.org/>) or WAMP (<https://www.wampserver.com/>), install with defaults, start Apache + MySQL from the control panel. You can still use PHP's built-in dev server (below) instead of XAMPP's Apache if you prefer.

Verify in PowerShell: `php --version` and `mysql --version`.

> **Path note for Windows users:** all commands below assume `php` and `mysql` are on your `PATH`. If they're not, use the full path (e.g., `C:\xampp\php\php.exe -S localhost:5500`).

### 8.4 Common steps (all platforms)

Once you have working `php` and `mysql` commands:

**Step 1 — Create the local database and dev user**

Run the MySQL CLI (`mysql -u root` on Mac/Linux, `mysql -u root -p` on Windows or wherever you set a root password). Then paste:

```sql
CREATE DATABASE velorex_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'velorex_dev'@'localhost' IDENTIFIED BY 'devpass';
GRANT ALL PRIVILEGES ON velorex_local.* TO 'velorex_dev'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

**Step 2 — Apply the schema**

Connect to the new database and paste the schema from [§5](#5-database-schema):

```bash
mysql -u root velorex_local
# (on Windows: mysql -u root -p velorex_local)
# Then paste the entire §5 SQL block, hit Enter, then \q to exit
```

Verify with `SHOW TABLES;` — you should see `categories`, `orders`, `products`, `users`, `user_sessions`.

**Step 3 — Create `api/config.php`**

`api/config.php` is **gitignored** — it doesn't come with the repo. Copy the example:

```bash
# macOS / Linux:
cp api/config.example.php api/config.php

# Windows PowerShell:
Copy-Item api/config.example.php api/config.php

# Windows CMD:
copy api\config.example.php api\config.php
```

Then open `api/config.php` in your editor and set the credentials at the top:

```php
define('DB_HOST', '127.0.0.1');
define('DB_NAME', 'velorex_local');
define('DB_USER', 'velorex_dev');
define('DB_PASS', 'devpass');
define('ADMIN_PASS', 'owner123');     // Used both as admin API token AND vlx-admin-2026.html login password
```

Leave the helper functions and CORS/cache headers untouched.

**Step 4 — Run the dev server**

```bash
# macOS / Linux:
php -S localhost:5500 -t .

# Windows PowerShell or CMD (from the project root):
php -S localhost:5500 -t .
```

PHP's built-in server handles both static files and `.php` execution. No Apache/Nginx/IIS needed. Leave the terminal open; the server runs until you `Ctrl+C`.

Open in your browser:
- <http://localhost:5500/> → storefront
- <http://localhost:5500/vlx-admin-2026.html> → admin panel (login: `owner` / `owner123`)
- <http://localhost:5500/api/categories.php> → should return `["vinyl","cd","cassette","bluray","dvd"]`

**Step 5 — Smoke test with curl** (works on all platforms; Windows 10+ has `curl` built in)

```bash
# Public read
curl http://localhost:5500/api/products.php

# Signup a test user
curl -X POST http://localhost:5500/api/auth/signup.php ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"test@example.com\",\"password\":\"testpass123\",\"firstName\":\"Test\"}"
# (On Mac/Linux use single quotes and \ line continuation instead of ^.)

# Admin list users
curl http://localhost:5500/api/admin/users.php -H "X-Admin-Pass: owner123"
```

### 8.5 Optional: Docker (cross-platform alternative)

If you'd rather not install PHP/MySQL on your host, the project also works fine in Docker. There's no `docker-compose.yml` checked in (yet), but this works:

```bash
# In the project root:
docker run -d --name velorex-mysql -e MYSQL_ROOT_PASSWORD=rootpass \
  -e MYSQL_DATABASE=velorex_local \
  -e MYSQL_USER=velorex_dev -e MYSQL_PASSWORD=devpass \
  -p 3306:3306 mysql:8

# Wait ~10s for MySQL to initialize, then apply the schema:
docker exec -i velorex-mysql mysql -uvelorex_dev -pdevpass velorex_local < /dev/stdin
# (paste the §5 SQL, then Ctrl+D)

# Run PHP server in a container, mounting your code:
docker run --rm -it --network host -v "$PWD:/app" -w /app php:8.2-cli \
  php -S localhost:5500 -t .
```

Set `DB_HOST` to `127.0.0.1` (not `localhost`) in `api/config.php` for the PHP container to reach the MySQL container via host networking. On Mac/Windows where `--network host` isn't fully supported, link the containers instead.

### 8.6 Stopping things

| Action | macOS | Linux | Windows |
|---|---|---|---|
| Stop dev server | Ctrl+C in the terminal running `php -S` | same | same |
| Stop MySQL | `brew services stop mysql` | `sudo systemctl stop mysql` (or `mariadb`) | `net stop MySQL80` (or whatever your service is called) |

## 9. Deployment

The site lives on Hostinger shared hosting. There are **two parts** that have to be in sync:

1. **Code** — deployed via Hostinger's Git integration (auto-pulls from `https://github.com/aijazamaankhan/velorexmusic-new`)
2. **Config** — `api/config.php` is gitignored, so it must be **manually maintained on the server**

### Code deploy (every push)

```bash
npm run prep-deploy        # rewrites cache-bust hashes in every *.html
git add .
git commit -m "your message"
git push origin master
```

Then on Hostinger:
- hPanel → **Advanced** → **Git** → click **Deploy** (or **Pull**) on the registered repo

If you set up the auto-deploy webhook in the repo's Settings → Webhooks, pushes to master deploy automatically with no manual click.

**About `prep-deploy`.** [scripts/bump-cache.js](scripts/bump-cache.js) scans every `*.html` for `<script src=…>` / `<link href=…>` references to local `.js`/`.css` files and rewrites the `?v=…` to the first 8 hex chars of a SHA-1 of the file's contents. Only files that actually changed get a new hash, so customers re-download only what was modified. Skipping this step is what shipped a real customer-facing bug (cart showed "free shipping" while Razorpay charged a different number) — see the postmortem note below.

**One-time setup (per clone) to wire the pre-push safety net:**
```bash
git config core.hooksPath scripts/hooks
```
After that, `git push` runs [scripts/hooks/pre-push](scripts/hooks/pre-push) which invokes `node scripts/bump-cache.js --check`. If any HTML's cache-bust is stale vs. the assets it references, the push is refused with a "Run `npm run prep-deploy`" message. Without the hook configured, you have to remember to run `prep-deploy` manually — the hook just makes forgetting impossible.

### When `api/config.php` needs updating

Whenever `api/config.example.php` changes (new helper functions, new headers, new constants), you must mirror those changes into the server's `api/config.php`. The git pull will NOT touch it.

**Easiest path:**

1. File Manager → `public_html/api/config.example.php` → copy all
2. Open `public_html/api/config.php` → paste, overwriting everything
3. Find the DB credentials block and put back the real Hostinger values:
   - `DB_HOST` = `localhost`
   - `DB_NAME` = `u286479481_velorex`
   - `DB_USER` = `u286479481_velorex_admin`
   - `DB_PASS` = (the real password — never commit this)
   - `ADMIN_PASS` = (your chosen admin password)

### When the schema changes

phpMyAdmin → `u286479481_velorex` → **SQL** tab → paste the migration → **Go**.

There's no migration framework. Treat the schema in [§5](#5-database-schema) as the authoritative version. If you change it locally, update [§5](#5-database-schema) in this doc and run the same SQL in Hostinger phpMyAdmin.

**Pending migration** (run once on Hostinger to enable the multi-image gallery — without it, uploaded photos get silently truncated by the `TEXT` column and render as broken thumbnails):

```sql
ALTER TABLE products MODIFY image LONGTEXT;
ALTER TABLE products ADD COLUMN images LONGTEXT NULL AFTER image;
```

**Pending migration — addresses table** (run once on Hostinger to enable the saved-addresses feature and the checkout shipping-address picker):

```sql
CREATE TABLE addresses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  label VARCHAR(50),
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  line1 VARCHAR(255) NOT NULL,
  line2 VARCHAR(255),
  landmark VARCHAR(150),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100),
  postal_code VARCHAR(20),
  country_code CHAR(2) NOT NULL,
  gstin VARCHAR(20),
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**Pending migration — payment_orders table** (run once on Hostinger before the Razorpay integration can accept payments — without it, `/api/payments/create-order.php` will 500):

```sql
CREATE TABLE payment_orders (
  razorpay_order_id VARCHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  amount_paise BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  mode ENUM('test','live') NOT NULL,
  status ENUM('created','paid','failed') NOT NULL DEFAULT 'created',
  items JSON NOT NULL,
  shipping_address JSON NOT NULL,
  internal_order_id VARCHAR(50) NULL,
  razorpay_payment_id VARCHAR(64) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_status (status),
  INDEX idx_internal (internal_order_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**Pending migration — users.notes** (run once on Hostinger to enable the admin's internal customer-notes feature; without it the notes textarea in the admin customer drawer returns 503 but everything else keeps working):

```sql
ALTER TABLE users ADD COLUMN notes TEXT NULL;
```

**Pending migration — payment_orders for guest checkout** (run once on Hostinger to allow guests to place orders without signing up; without it `/api/payments/create-order.php` rejects guest payloads with a FK error on insert):

```sql
ALTER TABLE payment_orders MODIFY COLUMN user_id INT NULL;
ALTER TABLE payment_orders ADD COLUMN guest_contact JSON NULL AFTER user_id;
```

For guest rows, `user_id` stays `NULL` and `guest_contact` holds `{email, phone, fullName}` so `finalize_payment()` can copy that into `orders.order_data.contact` at capture time. The existing `ON DELETE CASCADE` on the `user_id` foreign key is unaffected — NULL rows simply skip the cascade.

**Pending step — product image migration** (run once on Hostinger after deploying Phase 1; **without it, the storefront's existing products show no images** because the list endpoint stopped shipping base64 inline). This converts the existing `products.image` / `products.images` base64 data: URLs into real files and rewrites the DB columns to URLs. Idempotent and re-runnable; failures on individual rows don't abort the run.

**CRITICAL — read [§10 "Uploaded images live OUTSIDE public_html"](#uploaded-images-live-outside-publichtml-hostinger-deploy-wipes-anything-inside-it) before running this.** The files MUST land outside `public_html/`, accessed via a symlink, or Hostinger's next git deploy will wipe them. The full setup looks like:

```bash
# SSH into Hostinger (hPanel → Advanced → SSH Access)

# 1. Create the persistent uploads directory OUTSIDE public_html
mkdir -p ~/uploads/products
chmod 755 ~/uploads ~/uploads/products

# 2. Add UPLOADS_PERSIST_DIR to the secrets file so config.php's self-heal can find it
#    Edit /home/u286479481/domains/velorexmusic.com/velorex_secrets.php and add:
#       define('UPLOADS_PERSIST_DIR', '/home/u286479481/uploads');

# 3. Take a backup of the products table BEFORE running the migration (cheap insurance)
mysqldump -u u286479481_velorex_admin -p u286479481_velorex products \
  > ~/products-pre-migration-$(date +%Y%m%d).sql

# 4. Create the symlink manually (Hostinger's PHP can't, see §10 ops gotcha):
cd ~/domains/velorexmusic.com/public_html && ln -s ~/uploads uploads && cd -

# 5. Run the migration. Files are written via the symlink so they land
#    in ~/uploads/products/ (safe from deploys).
cd ~/domains/velorexmusic.com/public_html
php scripts/migrate-product-images.php
```

**What changes after the migration runs:**
- `products.image` rows shrink from ~400 KB base64 strings to ~50 byte URLs (`/uploads/products/abc123de.jpg`)
- `/api/products.php` response drops from tens-of-MB to tens-of-KB
- Customers see images via the browser's native `<img>` fetch instead of base64-inline JSON. Browser/CDN can cache them; URL is content-addressed so a re-upload changes the URL (never stale)

**Day-2 ops:** new product images uploaded through the admin panel after Phase 1 deploy already go straight to filesystem via `/api/upload-product-image.php` — no need to re-run the migration. The script is only for the existing base64 backlog.

**If the migration's `Per-image failures` count is non-zero:** the products listed in stderr kept their original base64 in place (no data loss) — just re-upload those images through the admin panel.

**Pending update — secrets file** (the Razorpay integration adds new constants):

After deploying the new code, edit `/home/u286479481/private/velorex_secrets.php` on Hostinger and append the Razorpay block from [api/secrets.example.php](api/secrets.example.php). At minimum:

```php
define('RAZORPAY_MODE', 'test'); // flip to 'live' once tested
define('RAZORPAY_TEST_KEY_ID',         'rzp_test_…');
define('RAZORPAY_TEST_KEY_SECRET',     '…');
define('RAZORPAY_TEST_WEBHOOK_SECRET', '');   // leave empty until you set up the webhook
define('RAZORPAY_LIVE_KEY_ID',         '');
define('RAZORPAY_LIVE_KEY_SECRET',     '');
define('RAZORPAY_LIVE_WEBHOOK_SECRET', '');
```

Without these defines, `/api/payments/create-order.php` returns 502 with a clear "RAZORPAY_… is not configured" message — there's no fallback.

**Pending update — secrets file** (transactional email via Brevo SMTP):

After deploying the new code, append the SMTP block from [api/secrets.example.php](api/secrets.example.php) to `/home/u286479481/private/velorex_secrets.php`. Step-by-step Brevo setup, DNS records and troubleshooting live in §10 → "Transactional email (Brevo SMTP + PHPMailer)". Until `SMTP_HOST` is non-empty, order-receipt emails are silently skipped (the order is still placed); a line is written to PHP's `error_log` so you can spot misconfiguration during the test phase.

**Pending update — secrets file** (store-owner order alerts):

Add `ADMIN_NOTIFY_EMAIL` to `/home/u286479481/private/velorex_secrets.php` (or `api/secrets.local.php` for dev):

```php
define('ADMIN_NOTIFY_EMAIL', 'orders@velorexmusic.com');
// Or notify multiple staff:
// define('ADMIN_NOTIFY_EMAIL', 'owner@example.com, manager@example.com');
```

After this defines, every successful payment triggers a second email to the configured address(es) alongside the customer's receipt. The admin email has subject `🔔 New order #VD-… · ₹… · N items · <city>` and a deep link to the order detail in the admin panel. Reuses Brevo (free at current volumes — counts against the 300/day customer-receipt allowance, so capacity is fine).

If the constant is undefined or empty, admin alerts are silently skipped — the customer receipt still fires regardless.

### Verifying a deploy

After every deploy:

1. `https://velorexmusic.com/api/categories.php` → returns the 5 categories
2. `https://velorexmusic.com/api/products.php` → returns whatever products you have
3. `https://velorexmusic.com/api/auth/me.php` (no token) → `{"error":"Login required"}` with HTTP 401
4. Admin login → sidebar **Customers** → shows registered users

If you get a 500 on any endpoint, the most common causes (in order):
1. Server's `config.php` doesn't have the helper functions it needs — re-sync from `config.example.php`
2. A table doesn't exist — check phpMyAdmin
3. `DB_PASS` is wrong

Temporarily add `ini_set('display_errors','1'); error_reporting(E_ALL);` to the top of `config.php` to surface the real error in the response body. **Remove those lines once debugged** — they leak details.

## 10. Operational knowledge / gotchas

### LiteSpeed page cache (Hostinger)

Hostinger uses LiteSpeed which aggressively caches PHP responses. Without explicit headers, `GET /api/products.php` will return stale data after a POST that updates it — which makes deleted products "reappear" minutes later.

**Mitigations already in place:**
- Every API response sets `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` (set in `api/config.php`)
- `api/.htaccess` has `<IfModule LiteSpeed> CacheDisable public / </IfModule>` for belt-and-suspenders

If you ever see staleness again, the next step is hPanel → Performance → Cache Manager → **Purge All**.

### `api/config.php` is the bridge between code and infrastructure

It's gitignored on purpose — real DB passwords don't belong in git. But that means **the file lives only on the server and your local machine, and the two are independent**. If you add a helper function to `config.example.php` and push, you ALSO need to manually update `config.php` on Hostinger or every endpoint that calls the new helper will 500.

### Uploaded images live OUTSIDE public_html (Hostinger deploy wipes anything inside it)

Hostinger's Git auto-deploy nukes any file under `public_html/` that isn't tracked in the repo. That includes `public_html/uploads/` (where Phase 1 writes product images), which is gitignored on purpose. We learned this the hard way in May 2026 — after one deploy, every customer saw fallback placeholders instead of product photos.

**How it works now:**
- Actual files live at `/home/u286479481/uploads/products/<hash>.<ext>` (outside the deploy zone, never touched by git).
- `public_html/uploads` is a symlink pointing there.
- A **cron job** runs every minute and recreates the symlink if missing. The cron command is the one-liner version of [scripts/ensure-uploads-symlink.sh](scripts/ensure-uploads-symlink.sh). Worst case: 60 seconds of broken images post-deploy, but only on the rare deploy that actually wipes the symlink.

**Why cron and not PHP self-heal?** The first cut of this had a self-heal in [api/config.php](api/config.php) that recreated the symlink on every API request — ideally would close the gap to ~zero. But **Hostinger's web PHP disables `symlink()`** (along with `exec`, `shell_exec`, `system`, `popen`) via `disable_functions` for security. There is no way to create a symlink from PHP on this host. The self-heal block is still in `config.php` because it's harmless when disabled and DOES work on environments without that restriction (local dev, future VPS migration), but on Hostinger the cron is the actual recovery mechanism.

**Persistent path is configured via `UPLOADS_PERSIST_DIR`** in the secrets file (see [api/secrets.example.php](api/secrets.example.php)). The constant isn't strictly needed once the cron is in place (the cron has hard-coded paths), but the upload-product-image endpoint and migration script both write through `public_html/uploads/...` which resolves through the symlink, so the constant is more of an indicator that the operator did the deployment-resilience setup.

**One-time setup on a new server:**

```bash
# 1. SSH in and create the persistent dir
ssh u286479481@<host>
mkdir -p ~/uploads/products
chmod 755 ~/uploads ~/uploads/products

# 2. Create the symlink for immediate use
ln -s ~/uploads ~/domains/velorexmusic.com/public_html/uploads

# 3. Add UPLOADS_PERSIST_DIR to the secrets file
nano ~/domains/velorexmusic.com/velorex_secrets.php
#   define('UPLOADS_PERSIST_DIR', '/home/u286479481/uploads');

# 4. Install the cron — hPanel → Advanced → Cron Jobs → Add new
#    Schedule: every minute (* * * * *)
#    Command:
#      [ -L /home/u286479481/domains/velorexmusic.com/public_html/uploads ] || \
#        ln -s /home/u286479481/uploads /home/u286479481/domains/velorexmusic.com/public_html/uploads
#    (or alternatively call the tracked script:
#      bash /home/u286479481/domains/velorexmusic.com/public_html/scripts/ensure-uploads-symlink.sh)
```

**Verifying the cron works:** SSH in, intentionally break the symlink (`rm public_html/uploads`), wait 60s, run `ls -la public_html/uploads` — the symlink should reappear.

**If images vanish again after a deploy** (i.e. customers see placeholder icons):
1. **First check the symlink** — `ls -la ~/domains/velorexmusic.com/public_html/uploads`. If missing, the cron should restore it within a minute. If you can't wait, run `ln -s ~/uploads ~/domains/velorexmusic.com/public_html/uploads` manually.
2. **Check `~/uploads/products/`** — the files should still be there. If yes, you're fine; only the symlink was wiped.
3. **If the persistent files are ALSO gone** (catastrophic — should never happen because that dir isn't in the deploy zone, but just in case): restore from the most recent `mysqldump` of the products table, set up the persistent dir + symlink + cron, and re-run `scripts/migrate-product-images.php`. The migration is idempotent and writes content-addressed filenames, so URLs in customer browsers stay identical — anyone with the old URLs cached gets an instant render.

**Don't undo any of this** — see [§13 Conventions](#13-conventions-for-ai-assistants-editing-this-repo) "Product images live on disk, not in the DB."

### Admin auth = admin password = API token

There's a single `ADMIN_PASS` constant in `config.php`. The admin panel (vlx-admin-2026.html) prompts for it at login and stores it in `sessionStorage` as `admin_pass`. Every admin-only write replays it as `X-Admin-Pass: <password>`. Same value protects both the UI login and the API endpoints. If you change `ADMIN_PASS`, vlx-admin-2026.html still uses the old check (`if (user.toLowerCase() === 'owner' && pass === 'owner123')`) — keep them in sync.

### Razorpay payment flow

The payment flow is **server-orchestrated**. The browser never decides the price, never holds the Razorpay secret, and never tells the server "the payment succeeded" without proof. The shape:

1. **`/api/payments/create-order.php`** (browser → server, user-authed)
   - Receives `{ items: [{id, qty}], addressId }`.
   - Recomputes the cart total from the **DB** product prices. The client-quoted prices are ignored.
   - Calls Razorpay's `POST /v1/orders` API with that amount and gets back a `razorpay_order_id`.
   - Persists a `payment_orders` row binding `(razorpay_order_id, amount, items, address, user_id)`.
   - Returns the `keyId` (public) + `razorpay_order_id` to the browser. **Never** returns the secret.

2. **Razorpay Checkout** (browser, opened with `new Razorpay({ order_id, key, ... })`). Razorpay collects card / UPI / netbanking / wallet inside their iframe — we never see card details. The bound amount on the Razorpay order cannot be tampered with from the browser.

3. **`/api/payments/verify.php`** (browser → server, user-authed)
   - Receives `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`.
   - Verifies HMAC-SHA256 with `KEY_SECRET` using `hash_equals` (constant-time). If the signature doesn't match, the request is rejected — the payment-success message in the browser was forged.
   - Verifies the `payment_orders` row exists and belongs to the logged-in user (ownership check).
   - Calls `finalize_payment()` in [api/_payment_finalize.php](api/_payment_finalize.php): in a single transaction, decrements stock, creates the internal `orders` row, marks `payment_orders.status='paid'`.
   - Idempotent — a duplicate verify (page refresh, double-click) returns the same `orderId` without re-decrementing stock.

4. **`/api/payments/webhook.php`** (Razorpay → server, signature-authed) — server-to-server backstop in case step 3 doesn't reach the server (browser closed, network drop after payment was captured). Razorpay POSTs the event signed with `WEBHOOK_SECRET`; the handler verifies the signature and calls the same `finalize_payment()`. Because it's idempotent with the browser path, both can fire safely.

**Where the credentials live:** [api/secrets.example.php](api/secrets.example.php) — `RAZORPAY_MODE`, plus two key sets (test + live). The active set is picked by `RAZORPAY_MODE`. Flip from test to live by changing only that one constant in the secrets file; no code change.

**Going live checklist:**

1. In Razorpay Dashboard → Settings → API Keys → generate live keys.
2. Update `RAZORPAY_LIVE_KEY_ID` and `RAZORPAY_LIVE_KEY_SECRET` in the **server's** secrets file (`/home/u286479481/private/velorex_secrets.php` on Hostinger). Don't put live keys in `api/secrets.local.php`.
3. In Razorpay Dashboard → Settings → Webhooks → "Add new webhook" → URL `https://velorexmusic.com/api/payments/webhook.php`. Subscribe to at least `payment.captured` and `payment.failed`. Copy the secret it gives you into `RAZORPAY_LIVE_WEBHOOK_SECRET`.
4. Flip `define('RAZORPAY_MODE', 'live');`.
5. Test with a real ₹1 charge before opening to customers.

**Test cards** (test mode only): `4111 1111 1111 1111`, any future expiry, CVV `123`. See [Razorpay test cards](https://razorpay.com/docs/payments/payments/test-card-upi-details/) for the full list including success/failure variants.

**SECURITY invariants — do not break these:**

- `RAZORPAY_*_KEY_SECRET` and `RAZORPAY_*_WEBHOOK_SECRET` must NEVER appear in any response body, log line, or JS bundle. Only the *key id* (`rzp_test_…` / `rzp_live_…`) is safe to send to the browser.
- Signature comparisons use `hash_equals()` (constant-time). Do not switch to `===` or `strcmp` — those leak timing information.
- Webhook signature is computed over the **raw** request body bytes. `json_decode → json_encode → hash` produces a different byte sequence and will silently fail to verify.
- If the webhook secret is unset, the webhook handler refuses to accept any request (returns 503). Don't add a fallback — an empty secret would let anyone forge events.
- The `orders.php` POST endpoint returns 410 Gone by design. **Do not re-enable it.** Order creation must go through the verified payment flow.
- Amounts crossing the wire are in **paise** (integer). Don't introduce floats — `0.1 + 0.2` style errors on money are unforgiving.

### Transactional email (Brevo SMTP + PHPMailer)

Two emails fire after every successful payment, both from `finalize_payment()`:

```
finalize_payment() (after the DB commit)
  ├─ order_receipt_email($orderData)        → customer (always)
  └─ admin_new_order_email($orderData)      → admin (if ADMIN_NOTIFY_EMAIL set)
     ↓
  send_mail($to, $name, $subject, $html, $text)  in api/_mailer.php
     ↓
  PHPMailer (api/lib/PHPMailer/*) opens SMTP to SMTP_HOST:SMTP_PORT
     ↓
  Brevo's relay accepts the message and delivers
```

The **customer** gets a branded thank-you receipt with a track-order CTA. The **admin** (store owner/manager) gets an operational alert with the order id, total, item count, customer details, and a deep link to the order detail in the admin panel. Subject line carries the key facts (`🔔 New order #VD-12345 · ₹3,499 · 3 items · Mumbai`) so the owner can triage from the inbox without opening the email.

Set `ADMIN_NOTIFY_EMAIL` in the active secrets file to enable admin alerts. Comma/semicolon-separated for multiple recipients. Undefined or empty → admin alerts silently skipped (customer receipt still fires).

**Why the email is sent from `finalize_payment()` and not from `verify.php`/`webhook.php`:** the verify path and the webhook can both fire for the same payment (browser handshake AND Razorpay's server-to-server callback). Putting the email send inside `finalize_payment()` after the commit means it fires exactly once — the idempotent fast-path (`alreadyFinalized: true`) short-circuits before the email send on the second call. This is *verified* with a `finalize_payment()` called twice in the smoke test; Mailpit receives one message.

**Why after the commit, not inside the transaction:** SMTP can hang. If Brevo were down and we sent inside the transaction, we'd hold a long DB write lock + ultimately roll back the order even though the customer's money already moved. `send_mail()` never throws — it returns false and writes to `error_log` if delivery fails. The customer still has a valid order even if the email never lands.

**`SMTP_*` secrets** live in the active secrets file (see [api/secrets.example.php](api/secrets.example.php) for the full list). The mailer auto-skips with an `error_log` warning when `SMTP_HOST` is blank, so the code is safe to deploy ahead of finishing the Brevo setup.

**Going live with Brevo (one-time):**

1. Sign up at [brevo.com](https://www.brevo.com) — free, 300 emails/day forever.
2. Senders, Domains & IPs → **Domains** → add `velorexmusic.com`. Brevo prints three DNS records:
   - SPF (TXT @): `v=spf1 include:spf.brevo.com mx ~all`
   - DKIM (TXT `mail._domainkey`): the value Brevo gives you
   - DMARC (TXT `_dmarc`, optional but recommended): `v=DMARC1; p=none; rua=mailto:orders@velorexmusic.com`

   Paste them into Hostinger hPanel → Domains → DNS / Nameservers → DNS Zone Editor. Wait 5–60 min for propagation; Brevo's domain page shows ✓ green ticks when each record is verified.
3. Senders, Domains & IPs → **Senders** → add `orders@velorexmusic.com`.
4. Create the actual mailbox in hPanel → Emails → **Create email account** → `orders@velorexmusic.com` (or set a forwarder to your personal email). This is where replies land.
5. SMTP & API → **SMTP** → "Generate a new SMTP key". You'll see:
   - SMTP server: `smtp-relay.brevo.com`
   - Port: `587` (STARTTLS)
   - Login: an auto-generated address like `abcafc001@smtp-brevo.com` (NOT your Brevo account email — copy this verbatim into `SMTP_USER`)
   - SMTP key: treat like a password. Brevo shows it once on creation; click the row to reveal/copy. Paste into `SMTP_PASS`.

**⚠️ IP allowlist.** Brevo by default restricts SMTP to an IP allowlist (banner on the SMTP page). Hostinger shared hosting has a dynamic outbound IP, so you can't pin it. Click "Click here" in the banner → either disable the restriction entirely, or add `0.0.0.0/0` if Brevo accepts it. Without this, SMTP auth succeeds but every send is rejected.
6. Edit `/home/u286479481/private/velorex_secrets.php` on Hostinger; set:
   ```php
   define('SMTP_HOST', 'smtp-relay.brevo.com');
   define('SMTP_PORT', 587);
   define('SMTP_USER', 'abcafc001@smtp-brevo.com');         // exact "Login" string from the Brevo SMTP panel
   define('SMTP_PASS', 'paste-the-full-SMTP-key-here');     // value you copied at creation time
   define('SMTP_FROM',      'orders@velorexmusic.com');
   define('SMTP_FROM_NAME', 'Velorex Music');
   define('SMTP_REPLY_TO',  'orders@velorexmusic.com');
   ```
   Leave `SMTP_SECURE` and `SMTP_AUTH` at their defaults (`tls` and true).
7. Place a small test order. Watch Brevo's **Transactional → Email logs** — the message should appear in <5 seconds with status `delivered`.

**Local development:** point at Mailpit (or MailHog) instead of Brevo by overriding three constants in `api/secrets.local.php`:
```php
define('SMTP_HOST', 'velorex-mailpit'); // or 'localhost' if not in docker
define('SMTP_PORT', 1025);
define('SMTP_SECURE', '');     // Mailpit speaks plain SMTP
define('SMTP_AUTH',   false);  // and doesn't require credentials
```
Spin up Mailpit on the same Docker network as the PHP container:
```
docker run -d --name velorex-mailpit --network=velorex-net -p 8025:8025 -p 1025:1025 axllent/mailpit:latest
```
Web UI: `http://localhost:8025` — catches every outgoing email so you can verify rendering without touching the real provider.

**Common failure modes:**

| Symptom in `error_log` | Cause | Fix |
|---|---|---|
| `SMTP not configured — skipping send` | One of `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` is empty in the secrets file | Set the missing constant on the server |
| `SMTP Error: Could not authenticate.` | Wrong SMTP key, OR `SMTP_USER` is the Brevo account email instead of the `…@smtp-brevo.com` login from the SMTP panel | Copy the exact "Login" string from Brevo SMTP & API → SMTP. Generate a new key if needed |
| Auth succeeds but mail never arrives in Brevo's Transactional logs | IP allowlist enabled in Brevo. Hostinger's outbound IP isn't on it | Brevo SMTP & API → SMTP → click the blue IP banner → disable the restriction (or wildcard it) |
| `550 Sender not allowed` from Brevo | `SMTP_FROM` isn't a verified sender in Brevo | Add the address as a Sender in Brevo |
| Email accepted but lands in spam | DKIM/SPF/DMARC not green in Brevo's domain view | Double-check the DNS records; hPanel sometimes adds quotes or merges TXT entries that break the value |
| `STARTTLS command failed Command not implemented` | Pointed at a server that doesn't do STARTTLS (e.g. Mailpit) without flipping `SMTP_SECURE` | Set `SMTP_SECURE=''` and `SMTP_AUTH=false` for local catchers |

### "I deleted everything and it came back"

If you delete all products in admin and they reappear, check:

1. Server cache (see LiteSpeed section above)
2. Multiple admin tabs open with stale localStorage — close them all, log in fresh
3. Customer browsers still have old data in localStorage — this self-heals on their next visit (sync overwrites)

The previous root cause (admin auto-migrating localStorage back to server on login) was fixed in [commit 29807a6](https://github.com/aijazamaankhan/velorexmusic-new/commit/29807a6). If you see this bug again, check `Storage.syncFromServer()` in vlx-admin-2026.html — it should never POST stale localStorage to the server.

### Hostinger's MySQL username has a 14-char cap

The Hostinger MySQL username gets prefixed with `u286479481_`. Anything you type after that has a 14-character limit. The current user is `u286479481_velorex_admin` (`velorex_admin` = 13 chars).

## 11. Common tasks

### Adding a new API endpoint

1. Create `api/your-endpoint.php`
2. Start with `require_once __DIR__ . '/config.php';` — gets you `Content-Type: application/json`, CORS, no-cache headers, and all the helpers
3. Use `$_SERVER['REQUEST_METHOD']` to branch by HTTP method
4. Call `require_admin()` or `require_user()` for protected routes
5. Use `db()` for the PDO handle, always with prepared statements (never string-interpolate values into SQL)
6. Return `echo json_encode([...])`
7. Wrap in a try/catch that emits `{"error": ...}` with 500 on unexpected exceptions

### Adding a new field to products

1. Add the column in MySQL (both locally and on Hostinger via phpMyAdmin):
   ```sql
   ALTER TABLE products ADD COLUMN new_field VARCHAR(100);
   ```
2. Update [api/_products_helpers.php](api/_products_helpers.php):
   - `row_to_product()` to read the new column
   - `upsert_product()` to write it
3. Update `vlx-admin-2026.html` form to capture the new field
4. Update `index.html` if customers should see it
5. Update [§5](#5-database-schema) in this doc with the new column

### Switching Razorpay between test and live mode

1. Edit the **server's** secrets file (`/home/u286479481/private/velorex_secrets.php` on Hostinger; `api/secrets.local.php` locally).
2. Make sure the target mode's three constants are filled in (`RAZORPAY_LIVE_KEY_ID`, `…_KEY_SECRET`, `…_WEBHOOK_SECRET`). The webhook secret is the one Razorpay shows you when you create a webhook in the dashboard — it's not the same as the API secret.
3. Change `define('RAZORPAY_MODE', 'test')` → `'live'` (or back). No deploy needed; the next request picks up the new mode.
4. In Razorpay Dashboard, the webhook URL is the same for both modes: `https://velorexmusic.com/api/payments/webhook.php`. The dashboard has separate Test/Live tabs and each has its own webhook config — make sure the live tab's webhook is enabled before flipping the mode.

If anything is misconfigured (missing constant, mode set to neither `test` nor `live`), `/api/payments/create-order.php` returns 502 with a specific error pointing at the missing constant — there's no silent fallback.

### Bulk-uploading products via CSV

Admin panel → **Products** → click **Bulk Upload** (next to **New Product**).

1. Click **Download CSV Template** to grab a starter file with all supported columns and one example row.
2. Edit the CSV in Excel/Sheets. **Required columns:** `title`, `artist`, `category`, `price`. **Optional:** `id`, `language`, `original_price`, `stock`, `badge` (hot/new/upcoming), `description`, `music_director`, `track_listing`, `people` (pipe-separated, e.g. `rd-burman|amitabh-bachchan`), and the `specs_*` columns (`specs_format`, `specs_speed`, `specs_label`, `specs_year`, `specs_tracks`, `specs_genre`, `specs_theme`).
3. Drop the file on the dropzone (or click to pick). The client parses + validates locally and shows a preview table: how many rows are valid, how many have errors, and *which* error each invalid row has.
4. Click **Import N rows** to commit only the valid rows. Invalid rows are skipped — fix them and re-upload.

**ID semantics:** blank `id` → server auto-assigns the next available id (`MAX(id)+1`). `id` matching an existing product → that product is updated. `id` not yet in the table → inserted with that exact id.

**What bulk upload won't do:**
- It will not upload images. Add them per-product via the existing edit modal after the import. (Decided at design time — CSVs with embedded base64 images get huge and slow to parse.)
- It will not delete products. The endpoint is purely additive/update — anything not in your CSV stays untouched. To remove products, use the per-row delete button.

**Implementation:**
- Endpoint: [api/products-bulk-upsert.php](api/products-bulk-upsert.php) — admin-only (`X-Admin-Pass`), runs in a single transaction. Returns `{ ok, inserted, updated, errors[], products[] }`.
- Shared persistence: [api/_products_helpers.php](api/_products_helpers.php) holds `upsert_product()` / `row_to_product()` / `products_has_images_column()` so both `products.php` and `products-bulk-upsert.php` write rows identically.
- Frontend: `openBulkUploadModal()` / `parseCsv()` / `bulkValidate()` / `confirmBulkImport()` in [vlx-admin-2026.html](vlx-admin-2026.html), plus `Storage.bulkUpsertProducts()` which merges the server-returned canonical rows back into the local cache.

### Resetting a customer's password (support flow)

Admin panel → **Customers** sidebar → find by email → click **Reset Password** → type a new password → tell the customer the new password (out of band). They'll be logged out of all their sessions and have to use the new password to sign in.

### Wiping the local dev database

```bash
mysql -u root -e "DROP DATABASE velorex_local; CREATE DATABASE velorex_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
# Then re-run the schema from §5
```

### Running the Playwright admin test

```bash
npm install            # First time only
npm run test:admin     # Launches Chromium, logs into vlx-admin-2026.html
```

See `PLAYWRIGHT_MCP_README.md` for the optional MCP server setup if you want browser automation tools available in your IDE.

## 12. Known limitations & TODOs

| Area | Status | Notes |
|---|---|---|
| Forgot password (email-based) | Deferred | Currently shows a "contact support" page; admin manually resets via the Customers panel. Implementing email reset requires SMTP creds on Hostinger and PHPMailer. |
| Email verification on signup | Skipped | Users can log in immediately after signup. Same SMTP dependency as above. |
| International checkout | Gated by design | The Razorpay checkout flow is India-only today. Non-IN addresses surface a "We ship within India only — email us for a quote" block at checkout (`checkout-intl-block` in [index.html](index.html); `setCheckoutIntlBlocked` in [src/js/storefront/checkout.js](src/js/storefront/checkout.js)) and `api/payments/create-order.php` rejects them with `code: 'intl_not_supported'`. To re-enable: needs IEC code + Razorpay International KYC + a carrier-quote step. The address book still accepts intl addresses (saving is fine; checkout is what's gated). |
| Address book CRUD | ✅ Shipped | India + international, multi-address per user, default flag, per-country state/postal rules. UI: profile tab + checkout picker. API: `api/addresses.php`. Orders snapshot `shippingAddress` into `orders.order_data` at place-order time. |
| Wishlist persistence | Stub | The Wishlist tab in profile shows the first 3 products as filler. Would need a `wishlist` table or per-user JSON. |
| Order status updates | Local-only | Admin can change an order's status in the UI but it only updates localStorage on the admin's browser. Needs a PATCH endpoint on `orders.php`. |
| Razorpay integration | ✅ Shipped | Server-side order creation + HMAC signature verification + webhook backstop. Both test and live keys live in the secrets file, switched via `RAZORPAY_MODE`. See [§10 Razorpay payment flow](#razorpay-payment-flow). |
| Storefront perf rewrite | Phase 1 ✅ shipped; Phases 2–3 pending | Phase 1 (May 2026) moved product images out of DB-base64 into `public_html/uploads/products/` + split list/detail endpoints. Cut `/api/products.php` from 27 MB / 15 s to 17 KB / 0.7 s. Phases 2 (thumbnails), 3 (CDN), and HTTP cache headers are documented in [§14 Storefront performance roadmap](#14-storefront-performance-roadmap) — none urgent, all independent. |
| SEO / crawlability | ✅ Shipped | Was the single biggest gap: hash routing made the whole catalogue one URL, so no product or category could rank. Now real paths (`/vinyl-records`, `/product/12-sholay-r-d-burman`) server-rendered by `seo-render.php` with per-page metadata + JSON-LD, plus `robots.txt`, a DB-generated sitemap, and real `<a href>` internal links. See [§15 SEO architecture](#15-seo-architecture). Outstanding manual steps (OG image, Search Console, Business Profile) are listed there. |
| Frontend test coverage | Minimal | Only `test-admin-login.js` exists. Worth expanding when there's time. |

## 13. Conventions for AI assistants editing this repo

- **No build step.** Edit `index.html` / `vlx-admin-2026.html` directly. Don't introduce bundlers, frameworks, or transpilers unless explicitly asked.
- **No new dependencies in package.json** unless explicitly asked. The app code uses zero npm packages.
- **Don't commit `api/config.php`.** It's gitignored. Verify with `git status` before pushing.
- **Match the existing pattern.** The codebase is plain JS with `function foo()` and `const Helper = { ... }` objects. Don't refactor unrelated code into modules/classes.
- **Match the existing styling.** UI styling uses CSS variables (`var(--accent)`, `var(--text-muted)`, etc.) defined at the top of each HTML file. Reuse those instead of hardcoding colors.
- **Be careful with `innerHTML`.** Always escape user-controlled strings with `Utils.escape()` (defined in index.html) or the `escapeHTML()` helper in vlx-admin-2026.html. SQL is safe everywhere because every query is prepared.
- **Server is source of truth.** When in doubt, fetch from the API. localStorage is only a render cache.
- **Bulk-replace semantics for products/categories.** Don't try to add per-item PATCH endpoints — the existing pattern is "send the whole list, server replaces atomically." Match that for new collection-type entities.
- **Cache-bust is automatic — don't hand-edit `?v=…`.** Asset version strings on `<script>` / `<link>` tags are SHA-1 content hashes maintained by `npm run prep-deploy`. If you modify a `.js` or `.css` file, run that command before pushing (or rely on the pre-push hook from [§9 Deployment](#code-deploy-every-push) to remind you). Bumping by hand defeats the per-file-only caching and is easy to forget.
- **Product images live on disk, not in the DB.** Phase 1 of the perf rewrite (May 2026) moved images from base64 LONGTEXT columns to filesystem storage. On Hostinger the actual files live at `/home/u286479481/uploads/products/<hash>.<ext>` (OUTSIDE `public_html`) and are exposed via a self-healing symlink — see [§10 "Uploaded images live OUTSIDE public_html"](#uploaded-images-live-outside-publichtml-hostinger-deploy-wipes-anything-inside-it). The DB stores only the URL. Admin uploads go through `/api/upload-product-image.php`. The list endpoint (`/api/products.php`) is intentionally lean — no description/gallery/specs — and the detail page fetches the rest from `/api/product.php?id=N`. Don't put base64 image strings into `products.image` or `products.images` again, and don't move the actual files into `public_html/` (Hostinger's deploy will eat them).
- **Navigation links must be real `<a href>`.** Crawlers follow hrefs and never fire `onclick`. Build the path with `Seo.buildPath()` / `Seo.productPath()` and keep the `onclick` for the SPA transition. Reverting any link to `href="#"` re-hides that part of the site from search. See [§15](#15-seo-architecture).
- **Slug functions are mirrored.** `velorex_slugify()` (PHP) and `Seo.slugify()` (JS) must produce identical output. Change both together or you create duplicate URLs.
- **Don't remove `.gitattributes`.** LF line endings are required for `bump-cache.js` hashes to match between a Windows clone and the Linux host. See [§15](#15-seo-architecture).
- **Update this doc.** If you change the schema, add an endpoint, or change a major convention, update the relevant section in `CLAUDE.md` in the same commit.

## 14. Storefront performance roadmap

Why this section exists: in May 2026 the storefront's listing endpoint was serving 27 MB of JSON (60+ products × ~400 KB of base64-encoded images each), blocking the products page for 15+ seconds. Phase 1 fixed the underlying architecture; Phases 2 and 3 are polish on top. **None are urgent — Phase 1 is the structural win.** Each phase is independent and can be done in any order, though the listed order is roughly cheapest-first.

The freshness invariant carries through all phases: **JSON is always fresh from DB; images are aggressively cached but their URLs change the instant the image content changes** (content-addressed hash in the filename). No phase below relaxes this.

### ✅ Phase 1 — Filesystem images + list/detail split (shipped May 2026)

**What it did**
- Moved product images out of `products.image` / `products.images` (base64 LONGTEXT) and onto disk under `public_html/uploads/products/<hash>.<ext>`.
- Split `/api/products.php` into a **lean list** (id, title, artist, price, cover URL, etc.) + a new `/api/product.php?id=N` for **full detail** (description, full gallery, specs, track listing, people).
- Added `/api/upload-product-image.php` for admin multipart uploads. Content-addressed: identical bytes → same hash → same URL → single file on disk.
- One-shot `scripts/migrate-product-images.php` converted the existing base64 backlog on Hostinger to filesystem URLs. Idempotent and re-runnable.

**Result** (measured on live):
- `/api/products.php`: **27,449 KB → 17 KB** (~1,580× smaller)
- `/api/products.php` time: **15.6 s → 0.7 s** (~23× faster)

**Don't undo any of these** — see §13 "Product images live on disk, not in the DB."

### ⏳ Phase 2 — Thumbnails for listing covers

**What it would do**
- On image upload (in `api/upload-product-image.php`), generate a 200×200 (or 400×400 for retina) square thumb alongside the full image. Store as `<hash>.thumb.<ext>` next to the original. Use PHP GD or Imagick — both are available on Hostinger.
- `row_to_product_lean()` in `api/_products_helpers.php` returns the thumb URL in the `image` field. The full URL remains accessible via `/api/product.php?id=N` for the detail-page gallery.
- One-shot script (`scripts/generate-thumbnails.php`) generates thumbs for existing images on the server.

**When to do it**
- When listing covers feel slow on mobile. With ~66 products today and ~150 KB per cover, the listing page still downloads ~10 MB of images post-Phase-1. A 200×200 thumb is typically ~15 KB → another ~10× reduction.
- Definitely before hitting ~150 products.

**Rough effort:** half a day. The upload endpoint already runs all the validation we need; this just adds an image-resize call after the file is saved. The thumb script is a near-copy of `scripts/migrate-product-images.php` with `imagecopyresampled` instead of base64-decode.

**Files that would change:** [api/upload-product-image.php](api/upload-product-image.php), [api/_products_helpers.php](api/_products_helpers.php) (`row_to_product_lean` returns thumb URL), one new `scripts/generate-thumbnails.php`.

### ⏳ Phase 3 — CDN (Cloudflare free tier)

**What it would do**
- Put Cloudflare's free tier in front of velorexmusic.com (DNS-level — change nameservers at your domain registrar). Edge-caches `/uploads/*` aggressively across ~310 global POPs (Mumbai, Delhi, Bangalore, Chennai all present). Bypass cache for `/api/*`. HTML revalidates lightly.
- Customers globally hit a POP near them instead of Hostinger India. Images load ~10× faster outside India; ~2× faster inside.

**When to do it**
- Anytime after Phase 2 (or even now — works fine without Phase 2). Definitely **before** any marketing push to non-India audiences.

**Rough effort:** ~1 hour. Sign up at cloudflare.com, point velorexmusic.com's nameservers at the two Cloudflare nameservers, wait for DNS propagation, configure 3 cache rules in the Cloudflare dashboard:
- `velorexmusic.com/api/*` → Bypass cache
- `velorexmusic.com/uploads/*` → Cache everything
- Everything else → Default

**Zero code changes.** **Free** at this site's traffic level — the unlimited-bandwidth free tier covers everything a small Indian D2C store needs. Paid features (Image Resizing $5/mo, Pro plan $20/mo, Argo $5/mo) are opt-in for specific features you likely don't need; do not pay for them speculatively.

**Honest trade-offs:**
- Cloudflare outages take your site down (rare — 1–2× a year for ~30 min). Mitigation: revert nameservers in 24 h if needed.
- `$_SERVER['REMOTE_ADDR']` becomes a Cloudflare IP; use `$_SERVER['HTTP_CF_CONNECTING_IP']` if you need the real visitor IP (e.g. for analytics or fraud checks). Small change to `api/config.php`.
- Use Cloudflare's "Full (Strict)" SSL mode so it uses your Hostinger cert end-to-end. Don't pick "Flexible" — that does HTTP between Cloudflare and origin.

### ⏳ HTTP cache headers for `/uploads/`

**What it would do**
- Add an `.htaccess` block under `public_html/uploads/` that sets `Cache-Control: public, max-age=31536000, immutable` on every image response. Tells browsers and any CDN to cache for a year without revalidation.
- Safe because every image URL is content-addressed — different image content always yields a different URL, so "cached forever" can never serve stale.

**When to do it**
- Before Phase 3 (CDN benefits massively from this header — Cloudflare uses it to decide edge-cache lifetime).
- Or anytime if you want returning visitors to instantly re-render the cached site without re-fetching images.

**Rough effort:** 5 minutes. Create `public_html/uploads/.htaccess`:

```
<IfModule mod_headers.c>
  Header set Cache-Control "public, max-age=31536000, immutable"
</IfModule>
```

Apache/LiteSpeed on Hostinger both support this.

### Trigger conditions worth remembering

| When this happens | Reach for |
|---|---|
| Hit ~150 products | Phase 2 (thumbnails — listing image bandwidth scales with catalog size) |
| Marketing push outside India | Phase 3 (CDN — your India server is far from US/EU customers) |
| Customers say "second visit feels slow" | HTTP cache headers (cheapest fix; do this even without Phases 2/3) |
| Phase 2 + 3 are both done and you want more | Lazy-load images below the fold (browser-native `loading="lazy"` — already used elsewhere; add to product cards) |

## 15. SEO architecture

### The problem this solved

The storefront was hash-routed: categories were `#products?cat=vinyl`, products were
`#product?id=5`. **Everything after `#` is never sent to a server**, so Google saw the
entire catalogue as one URL (`velorexmusic.com/`). All 66 products and all 5 category
pages were unrankable — not badly ranked, absent. On top of that there were no meta
descriptions, no canonicals, no Open Graph, no structured data, no `robots.txt`, no
sitemap, and every internal link was `href="#"` with an `onclick`, so a crawler had
nothing to follow even if the URLs had existed.

### URL scheme

Real paths now, served by `.htaccess` → `seo-render.php`:

| URL | Route | Indexable |
|---|---|---|
| `/` | Homepage | ✅ |
| `/products` | Full catalogue | ✅ |
| `/vinyl-records`, `/audio-cds`, `/cassettes`, `/blu-ray-movies`, `/dvd-movies` | Category | ✅ (noindex when empty) |
| `/vinyl-records/hindi`, `/vinyl-records/english` | Category + language facet | ✅ |
| `/product/<id>-<title>-<artist>` | Product detail | ✅ |
| `/products?search=…&sort=…&people=…` | Filter permutation | ❌ canonical → clean category |
| `/cart`, `/profile`, `/login`, `/signup`, `/forgot`, `/track-order.html` | Transactional | ❌ noindex |

The **id is authoritative**, the slug is decorative. `/product/12-anything` 301s to the
current canonical slug, so renaming a product never strands an inbound link or splits
ranking signals across two URLs.

### How a request flows

```
GET /product/12-sholay-r-d-burman
  → .htaccess rewrites to seo-render.php?_route=product&id=12
  → loads the product, 301s if the slug is stale
  → reads index.html, injects into the <head>:
      per-page <title> + meta description + canonical
      Open Graph + Twitter card
      Product/Offer + BreadcrumbList + Organization/WebSite JSON-LD
  → reveals #page-product (it is display:none until the router runs) and
    server-renders the name, price, availability, description and specs
  → browser paints that instantly; the SPA boots and replaces it in place
```

A crawler that never runs JavaScript still gets a complete, indexable page. One that
does run JavaScript gets `src/js/seo.js` keeping the tags correct as the user navigates.

### Slug parity — the one rule that will bite you

`velorex_slugify()` in [src/seo/seo-lib.php](src/seo/seo-lib.php) and `Seo.slugify()` in
[src/js/seo.js](src/js/seo.js) **must produce byte-identical output**. If they diverge,
the browser pushes one URL while the server declares a different canonical, and Google
reads that as duplicate content — the exact problem this work exists to fix.

Transliteration is deliberately **not** done with `iconv('ASCII//TRANSLIT')`: its output
is libc-dependent. glibc turns "Café" into `Cafe`, Windows and musl turn it into `Caf'e`
→ `caf-e`. That means local dev and Hostinger would mint different URLs for the same
product. PHP uses `Normalizer` (ext/intl) when present and an explicit character map
otherwise; both match the JS `normalize('NFD')` + strip-combining-marks approach.

If you change either function, change both, and re-run a parity check across accented
titles before pushing.

### Line endings are load-bearing

[.gitattributes](.gitattributes) pins everything to LF. This is not style policing:
`scripts/bump-cache.js` computes each `?v=` token as a SHA-1 of the file's **raw bytes**.
Under `core.autocrlf=true` with no `.gitattributes`, a Windows clone checks files out as
CRLF while the committed blob is LF, so the same file hashes differently on Windows than
on the Linux host serving it. Symptom: `node scripts/bump-cache.js --check` reports every
HTML file permanently stale, and running `prep-deploy` on Windows rewrites all 58 tokens
to values that never match production. Don't remove `.gitattributes` without reworking
`bump-cache.js` to normalise line endings before hashing.

### Structured data emitted

| Schema | Where | Why |
|---|---|---|
| `Organization`, `WebSite` (+`SearchAction`) | Every page | Brand knowledge panel + sitelinks search box |
| `Product` + `Offer` | Product pages | Price / availability / stars in results — the biggest CTR lever |
| `AggregateRating` | Product pages, **only when `reviews > 0`** | Emitting `reviewCount: 0` is a violation and suppresses the whole rich result |
| `BreadcrumbList` | Product + category | Breadcrumb trail instead of a raw URL in results |
| `ItemList` | Category pages | Marks the page as a curated listing |
| `Store` ×2 (Gurugram, Meerut) | Category pages + contact.html | "record store near me" / local pack |
| `FAQPage` | faq.html | FAQ rich results |

**FAQ answers in the JSON-LD must stay verbatim identical to the visible page copy.**
Schema whose answers don't appear on the page is a manual-action risk, not just a
suppressed result. If you edit an answer in `faq.html`'s body, edit the JSON-LD too.

### Conventions to preserve

- **Never go back to `href="#"` for navigation.** Crawlers follow `<a href>`; they do not
  fire `onclick`. Every nav, footer, breadcrumb and product-card link now carries a real
  path from `Seo.buildPath()` with the `onclick` retained for the SPA transition. This
  also made middle-click and "open in new tab" work, which they never did before.
- **Keep meta tag *names* stable.** `src/js/seo.js` targets them by selector and appends a
  duplicate if one is renamed.
- **New indexable page ⇒ add it to `sitemap.php`.** A sitemap is a statement that a URL
  should be indexed; never list a `noindex` page in it.
- **New category ⇒ add it to `velorex_categories()` AND `Seo.CAT_TO_SLUG` AND the
  `.htaccess` rewrite alternation.** All three, or the URL 404s or renders untitled.

### Still to do (needs a person, not code)

1. **`src/img/og-default.jpg`** — 1200×630 social share image. Spec in
   [src/img/README.md](src/img/README.md). Can't be generated here: PHP on this host has
   no GD. Nothing breaks without it; shared links just render without a thumbnail.
2. **Google Search Console** — add the property, verify via DNS TXT, submit
   `https://velorexmusic.com/sitemap.xml`, then use "Request indexing" on the homepage
   and 2–3 product pages to seed the crawl.
3. **Google Business Profile** — for the local cluster. The name/address/phone must match
   `contact.html` and the `Store` JSON-LD *exactly*; NAP mismatches suppress local
   rankings.
4. **Verify rich results** after deploy — <https://search.google.com/test/rich-results>
   on one product URL and on `/faq.html`.
