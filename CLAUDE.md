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
│       │   ├── hero-carousel.css # Homepage hero banner — owns .hero and every .hero-*
│       │   │                     # rule. NOT in pages/storefront.css; see §21.
│       │   ├── cursor.css        # Custom cursor. Everything gated behind .vlx-cursor-on,
│       │   │                     # which only cursor.js adds; see §23.
│       │   ├── search.css        # Global search — navbar field, suggestions dropdown
│       │   │                     # and the mobile sheet. Owns .navbar-search; see §24.
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
│       ├── analytics.js         # GA4 ecommerce events. Every call site typeof-guarded; purchase
       │                        # fires ONLY from the verified success path. See §26.
       ├── cart-sync.js         # Mirrors the cart to /api/cart-sync.php on a debounce + handles
       │                        # the ?recover= link from the recovery emails. localStorage stays
       │                        # the source of truth — this is a one-way copy.
       ├── utils.js             # Utils.escape (HTML escape, returns non-strings unchanged)
│       │                        # + top-level escapeHTML() (coerces null → '', for admin use)
│       ├── api-base.js          # const API_BASE = '/api' — shared by storefront + admin
│       ├── constants.js         # COUNTRIES, IN_STATES, US_STATES, STATE_REQUIRED,
│       │                        # POSTAL_REQUIRED, PEOPLE_LABELS (storefront only)
│       ├── storage.js           # Storefront Storage helper — 3-tier graceful
│       │                        # degradation against localStorage quota, per-user cart
│       ├── auth.js              # Auth — bearer token + session + login/signup/logout
│       ├── addresses.js         # Addresses CRUD wrapper around /api/addresses.php
│       ├── shipping.js          # Shipping.calculate(subtotal, address, items) — zone base
│       │                        # rate (Delhi/NCR ₹49, rest ₹99, remote ₹199) overridden
│       │                        # per product by free_shipping / shipping_charge. NO
│       │                        # order-value free threshold — see §16. PHP mirror in
│       │                        # api/_shipping_helpers.php — keep both files in sync.
│       ├── storefront/newsletter.js # The homepage signup block. Was markup with no handler.
       ├── storefront/search.js # Global search — ranked suggestions off the product
│       │                        # cache, inline on desktop, full-screen sheet below
│       │                        # 1100px. See §24.
│       ├── cursor.js            # Custom cursor — red dot + trailing ring that swells over
│       │                        # clickables. Self-initialising, self-disabling on touch
│       │                        # and reduced-motion; see §23.
│       ├── toast.js             # showToast() — bottom-right pill, auto-dismisses (storefront)
│       ├── confirm-dialog.js    # openConfirmDialog/closeConfirmDialog — styled window.confirm replacement
│       ├── cart.js              # CartHelpers — addToCart/updateQty/getCartCount/getCartTotal + stock guards.
│       │                        # addToCart(id, qty, {silent}) — silent batches the toast, never the guard.
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
│       │   ├── hero.js          # Homepage hero carousel — brand slide + featured-product
│       │   │                    # slides, auto-switch, dots/arrows/swipe. The brand slide is
│       │   │                    # static markup in index.html; see §21.
│       │   ├── carriers.js      # CARRIERS_META + carrier helpers (inline SVG logos, tracking URLs)
│       │   ├── pages.js         # createProductCard + all initPageXxx + page renderers
│       │   │                    # (login/signup/home/products/product-detail/cart/profile)
│       │   ├── router.js        # injectNavbar + injectFooter + theme/mobile-nav toggles +
│       │   │                    # buildPageUrl/parsePageFromUrl/navigate/initPage dispatcher +
│       │   │                    # currentPage/_detailQty/_detailMax/CURRENT_USER_ORDERS state
│       │   ├── combos.js        # Combo offers — cards, /combos/<slug> detail page,
│       │   │                    # "Add all to cart" / "Buy Now" / per-item add
│       │   └── checkout.js      # checkoutSPA + processPayment + guest contact/address form +
│       │                        # guest-upgrade modal (Phase 1C) + renderCheckoutAddressPicker
│       └── admin/
│           ├── storage.js       # Admin Storage helper — caches products/orders/categories
│           │                    # with the same 3-tier degradation pattern
│           ├── image-cropper.js # Crop-before-upload modal. Sits between the file picker
│           │                    # and /api/upload-product-image.php. Crop rect is held in
│           │                    # SOURCE pixels, not screen pixels — see §18.
│           ├── main.js          # adminAuthHeaders + last-save badge + category helpers +
│           │                    # checkAuth/showAdminLayout/handleLogin/handleLogout +
│           │                    # theme + toggleAdminSidebar + switchPanel + load listeners
│           ├── customers.js     # Customers panel (CustState + table + Guests filter) +
│           │                    # right-side drawer (profile/orders/addresses/sessions/
│           │                    # notes/danger tabs) + all customer mutations
│           ├── orders.js        # Orders panel + order detail modal + status taxonomy +
│           │                    # inline shipment edit + patchOrder + print invoice
│           ├── combos.js        # Combo Offers panel — list, editor, product picker
│           ├── marketing.js     # Abandoned panel (carts + checkouts, dismiss, manual send) and
           │                    # Subscribers panel (consent split, Brevo sync, CSV export)
           ├── inventory.js     # Dashboard + products table + product modal (new + edit) +
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
│   │   ├── abandoned.php        # GET abandoned carts + checkouts / POST dismiss / send-recovery
│   │   ├── subscribers.php      # GET newsletter list / POST unsubscribe / resubscribe / resync-brevo
│   │   ├── customer-detail.php  # GET ?userId=N → orders, addresses, sessions (batched for the admin drawer)
│   │   └── guest-customers.php  # GET → rolled-up guest checkouts grouped by email (admin Guests filter)
│   ├── combos.php               # GET (public/?all=1 admin/?id=N) / POST (admin upsert) / DELETE (admin)
│   ├── _combo_helpers.php       # combo_offers bootstrap + live product resolution. Auto-creates
│   │                            # the table, like the blog. NO price column — read the header.
│   ├── _address_helpers.php     # Shared address validation + snapshot helpers (addresses.php + create-order.php)
│   ├── _shipping_helpers.php    # shipping_calculate($subtotal,$address) — server mirror of
│   │                            # src/js/shipping.js. Authoritative at /api/payments/create-order.php
│   │                            # time; keep both files in sync.
│   ├── _mailer.php              # PHPMailer wrapper: send_mail($to,$name,$subject,$html,$text,$extraHeaders).
│   │                            # Never throws. $extraHeaders carries List-Unsubscribe for marketing mail.
│   ├── _email_templates.php     # TRANSACTIONAL: order_receipt_email + admin_new_order_email
│   ├── _marketing_templates.php # MARKETING: newsletter_welcome_email + abandoned_cart_email.
│   │                            # Split from the file above on purpose — marketing mail must always
│   │                            # carry an unsubscribe link, transactional mail must never imply
│   │                            # receipts can be switched off. See §26.
│   ├── _marketing_helpers.php   # subscribers + carts table bootstrap, payment_orders recovery
│   │                            # columns, cart re-pricing, Brevo contact API. READ ITS HEADER
│   │                            # before widening where recovery email addresses come from.
│   ├── _recovery.php            # marketing_send_recovery() — the ONE place a recovery email is
│   │                            # sent. Shared by the admin button and the cron so eligibility
│   │                            # rules cannot drift apart.
│   ├── subscribe.php            # POST { email, source? } — newsletter signup (public)
│   ├── unsubscribe.php          # GET shows a confirm button, POST performs the opt-out (public).
│   │                            # GET must never unsubscribe: link scanners prefetch every URL.
│   ├── cart-sync.php            # POST { cartKey, items } — mirrors the browser cart (public)
│   ├── recover-cart.php         # GET ?token= — the ?recover= link target (public)
│   └── lib/PHPMailer/           # PHPMailer v6.9.1 — three vendored files, no Composer
│       ├── PHPMailer.php
│       ├── SMTP.php
│       └── Exception.php
├── package.json                 # Just Playwright + MCP — no app dependencies
├── playwright-mcp-server.js     # MCP server (used optionally for admin-panel browser tests)
├── test-admin-login.js          # Sanity test for admin login
├── scripts/
│   ├── send-abandoned-cart-emails.php  # CLI-only cron: the 2h + 24h recovery
│   │                               # nudges, plus a 90-day prune of cold cart
│   │                               # snapshots. --dry-run reports and sends
│   │                               # nothing. Install per §9.
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

-- Curated product bundles. Created on demand by combos_ensure_table() on the
-- first /api/combos.php hit — one of two tables (with blog_posts) that need no
-- phpMyAdmin step. There is deliberately NO price/discount column: see the
-- header of api/_combo_helpers.php and §17 below.
CREATE TABLE combo_offers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(200) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description VARCHAR(600) NULL,
  image VARCHAR(500) NULL,              -- optional cover; falls back to a collage of product covers
  product_ids JSON NOT NULL,            -- [12, 34, 56] — resolved live on every read
  status ENUM("draft","published") NOT NULL DEFAULT "draft",
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_combo_slug (slug),
  KEY idx_combo_status (status, sort_order)
);

-- Newsletter list. Created on demand by marketing_ensure_tables() — no
-- phpMyAdmin step, like blog_posts and combo_offers.
--
-- consent_at is the column that decides what may lawfully be sent:
--   NOT NULL — they ticked a box asking for email. Campaign-mailable.
--   NULL     — we hold the address because they shopped, and the recovery
--              mailer needed a stable opt-out token for them. Order and cart
--              mail only, NEVER a promotional campaign.
-- Do not backfill consent_at to make the list look bigger. See §26.
CREATE TABLE subscribers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  status ENUM('subscribed','unsubscribed') NOT NULL DEFAULT 'subscribed',
  source VARCHAR(40),                   -- newsletter | checkout | cart-recovery | …
  token CHAR(32) NOT NULL,              -- unsubscribe capability, one per address
  user_id INT NULL,
  consent_at TIMESTAMP NULL,            -- see the note above — load-bearing
  unsubscribed_at TIMESTAMP NULL,
  ip VARCHAR(45),
  brevo_synced TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sub_email (email),
  UNIQUE KEY uq_sub_token (token),
  KEY idx_sub_status (status)
);

-- Server-side cart snapshots — one row per visitor. Also auto-created.
-- This is the ONLY record of a cart abandoned before checkout; the storefront
-- cart lives in localStorage (§7) and was otherwise invisible. Written by
-- /api/cart-sync.php on a debounce; the row is DELETED when the cart empties.
--
-- cart_key is a client-generated 32-hex visitor id held in localStorage. It is
-- not a credential: the row it addresses holds product ids and quantities the
-- same visitor just chose. `email` is written ONLY from an authenticated
-- session — see §26 for why that restriction is not negotiable.
CREATE TABLE carts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  cart_key CHAR(32) NOT NULL,
  user_id INT NULL,
  email VARCHAR(255) NULL,
  items JSON NOT NULL,                  -- re-priced from products on every write
  item_count INT NOT NULL DEFAULT 0,
  subtotal INT NOT NULL DEFAULT 0,
  recovery_token CHAR(32) NOT NULL,     -- the ?recover= link in the email
  recovery_stage TINYINT NOT NULL DEFAULT 0,   -- 0 none, 1 sent 2h, 2 sent 24h
  recovery_sent_at TIMESTAMP NULL,
  converted_at TIMESTAMP NULL,
  dismissed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cart_key (cart_key),
  UNIQUE KEY uq_cart_recovery (recovery_token),
  KEY idx_cart_user (user_id), KEY idx_cart_email (email), KEY idx_cart_updated (updated_at)
);

-- Recovery bookkeeping auto-added to payment_orders by
-- marketing_payment_orders_ready(), the same way products.item_condition is:
--   recovery_stage TINYINT NOT NULL DEFAULT 0
--   recovery_sent_at TIMESTAMP NULL
--   recovery_token CHAR(32) NULL
--   dismissed_at TIMESTAMP NULL

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
| GET | `/api/products.php` | — | `ProductLean[]` — listing shape only (id, title, artist, category, language, price, originalPrice, image, rating, reviews, badge, stock, musicDirector, condition, subcategory, freeShipping, shippingCharge, people). Heavy fields (description, full gallery, track listing, specs) are NOT included; fetch them via `/api/product.php?id=N`. This drops the list payload from ~27 MB to ~30 KB on a 66-product catalog. `people` is in the lean shape despite being a JSON column — it is a short slug array the products-page People filter reads off this payload. |
| GET | `/api/product.php?id=N` | — | Full `Product` for that id (or 404 if missing). Heavy fields included. Called on the product-detail page only. |
| GET | `/api/categories.php` | — | `string[]` (sorted by `sort_order`) |
| GET | `/api/combos.php` | — | `Combo[]` — published combos with their products resolved live, plus the real `total` of current prices, `itemCount` and `inStock`. Combos whose products have all been deleted are omitted. |
| GET | `/api/combos.php?slug=X` | — | One published `Combo`, for the `/combos/<slug>` detail page so a deep link need not pull the whole feed. 404 if missing, unpublished, or left with zero products — a draft is not disclosed by its status code. |
| POST | `/api/auth/signup.php` | `{ email, password, firstName, lastName? }` | `{ ok, token, user }` |
| POST | `/api/auth/login.php` | `{ email, password }` | `{ ok, token, user }` |
| POST | `/api/contact.php` | `{ fullName, email, subject, message }` | `{ ok, message }` — sends a support request from the contact page. |
| POST | `/api/payments/webhook.php` | raw Razorpay event body; auth via `X-Razorpay-Signature` header | `{ ok }` — server-to-server backstop. Verifies HMAC against `RAZORPAY_*_WEBHOOK_SECRET`. Never call this directly. |
| POST | `/api/subscribe.php` | `{ email, source? }` | `{ ok, message, alreadySubscribed }` — newsletter signup. Sends the welcome mail on a genuinely new (or reactivated) address only, so a double-click is not two emails. `source` is validated against an allowlist. |
| GET/POST | `/api/unsubscribe.php?token=<32hex>` | — | HTML page. **GET only shows a confirm button; POST performs the opt-out** — link scanners fetch every URL in an email, and a GET that unsubscribed would silently opt people out. Also the RFC 8058 one-click endpoint (`List-Unsubscribe-Post`). |
| POST | `/api/cart-sync.php` | `{ cartKey, items: [{id, qty}] }` | `{ ok, itemCount, subtotal }` — mirrors the browser cart to `carts`. Re-prices every line from the DB; **never accepts prices, and never accepts an email from an anonymous caller** (§26). An empty `items` array deletes the row. |
| GET | `/api/recover-cart.php?token=<32hex>` | — | `{ ok, source, items, subtotal, partial }` — the `?recover=` link target. Matches `carts.recovery_token` or `payment_orders.recovery_token`; re-prices against today's catalogue. Returns `{ ok: false, reason: 'already_purchased' }` for a completed order. |

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
| GET | `/api/combos.php?all=1` | — | `Combo[]` including drafts |
| POST | `/api/combos.php` | `{ id?, title, description?, image?, productIds: number[], status?, sortOrder? }` | `{ ok, combo }` — `id` present = update. Requires 2–12 product ids and every one must exist. |
| DELETE | `/api/combos.php?id=N` | — | `{ ok }` |
| GET | `/api/orders.php` | — | `Order[]` (all orders, joined with user info) |
| GET | `/api/admin/users.php` | — | `User[]` (each row includes `orderCount`, `totalSpent`, `activeSessionCount`, `addressCount`, `notes`) |
| POST | `/api/admin/users.php` | `{ action: "reset-password", userId, newPassword? }` | `{ ok, generated, newPassword? }` — if `newPassword` is omitted the server generates a strong temp password and returns it once. Always invalidates all sessions for the user. |
| POST | `/api/admin/users.php` | `{ action: "update-profile", userId, firstName?, lastName?, email?, phone? }` | `{ ok, user }` — partial update; rejects email collisions with 409. |
| POST | `/api/admin/users.php` | `{ action: "force-logout", userId }` | `{ ok, revoked }` — deletes all `user_sessions` rows for the user. |
| POST | `/api/admin/users.php` | `{ action: "update-notes", userId, notes }` | `{ ok }` — admin-only free-text notes (max 5000 chars). Requires the `users.notes` migration; 503 otherwise. |
| POST | `/api/admin/users.php` | `{ action: "delete-user", userId, confirmEmail? }` | `{ ok }` — cascades to `user_sessions`; `orders.user_id` is set NULL. Pass `confirmEmail` to require the admin to echo the email before deletion. |
| GET | `/api/admin/customer-detail.php?userId=N` | — | `{ orders, addresses, sessions }` — batched read for the admin customer drawer. |
| GET | `/api/admin/abandoned.php` | — | `{ rows, stats, mailerReady }` — abandoned carts (`kind: 'cart'`) and abandoned checkouts (`kind: 'checkout'`) in one list, newest first. Only rows quiet for `ABANDON_GRACE_MINUTES` are included. |
| POST | `/api/admin/abandoned.php` | `{ action: 'dismiss'\|'undismiss'\|'send-recovery', kind, id }` | `{ ok }` — `send-recovery` goes through the same `marketing_send_recovery()` the cron uses, so the eligibility rules cannot drift between the two paths. |
| GET | `/api/admin/subscribers.php` | — | `{ rows, stats, brevoReady }` — the newsletter list. `optedIn` on each row is `consent_at IS NOT NULL`. |
| POST | `/api/admin/subscribers.php` | `{ action: 'unsubscribe'\|'resubscribe'\|'resync-brevo', email? }` | `{ ok }` — `resync-brevo` pushes up to 200 un-synced contacts per call. |
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

**Pending step — abandoned-cart recovery cron** (nothing sends until this is installed; everything else on the Abandoned panel works without it):

hPanel → Advanced → **Cron Jobs** → Add new.

```
Schedule: */30 * * * *          (every 30 minutes)
Command:
  php /home/u286479481/domains/velorexmusic.com/public_html/scripts/send-abandoned-cart-emails.php
```

Dry-run it over SSH first — it prints exactly what it would send and changes nothing:

```bash
php ~/domains/velorexmusic.com/public_html/scripts/send-abandoned-cart-emails.php --dry-run
```

The script is CLI-only (`PHP_SAPI` guard) and `scripts/` is `[F,L]`-denied in the root `.htaccess`, so there is no HTTP way to trigger a mail run. Every-30-minutes puts the 2-hour email somewhere between 2:00 and 2:30 after abandonment, which is well inside the useful window. The `--limit` flag (default 100) caps the blast radius of any single run.

**Pending update — secrets file** (OPTIONAL, newsletter → Brevo contact sync):

`BREVO_API_KEY` is a **different credential from `SMTP_PASS`** — the SMTP key does not authenticate against `api.brevo.com`. Get it from Brevo → SMTP & API → **API Keys**.

```php
define('BREVO_API_KEY', 'xkeysib-…');
define('BREVO_LIST_ID', 2);   // optional; from Contacts → Lists (it is in the URL)
```

Without it, signups are still stored in the `subscribers` table and the admin panel works normally — only the push to Brevo's contact list is skipped. The Subscribers panel's **Sync to Brevo** button backfills anything unsynced once the key is set.

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

**The template's example rows must match its header count.** They are
`BULK_TEMPLATE_COLUMNS` and `BULK_TEMPLATE_EXAMPLES` in
[src/js/admin/inventory.js](src/js/admin/inventory.js), and they had drifted to
24 headers against 20 values — which silently shifted `description` into
`condition`, `music_director` into `subcategory`, and so on, so anyone filling
in the downloaded template by following its example row imported garbage.
`downloadBulkTemplate()` now refuses to generate a mismatched file. Keep the
example values matching real inventory conventions too (lowercase `hindi`, real
labels like `Saregama`) — for most people this file is the only documentation
they will read before importing.

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
| Combo offers | ✅ Shipped | Curated bundles, admin-managed, showcase-only by design — no discount is applied. See §17. |
| Per-product shipping | ✅ Shipped | `free_shipping` / `shipping_charge` on products; the order-value free threshold was removed. See §16. |
| Wishlist persistence | Stub | The Wishlist tab in profile shows the first 3 products as filler. Would need a `wishlist` table or per-user JSON. |
| Order status updates | Local-only | Admin can change an order's status in the UI but it only updates localStorage on the admin's browser. Needs a PATCH endpoint on `orders.php`. |
| Razorpay integration | ✅ Shipped | Server-side order creation + HMAC signature verification + webhook backstop. Both test and live keys live in the secrets file, switched via `RAZORPAY_MODE`. See [§10 Razorpay payment flow](#razorpay-payment-flow). |
| Storefront perf rewrite | Phase 1 ✅ shipped; Phases 2–3 pending | Phase 1 (May 2026) moved product images out of DB-base64 into `public_html/uploads/products/` + split list/detail endpoints. Cut `/api/products.php` from 27 MB / 15 s to 17 KB / 0.7 s. Phases 2 (thumbnails), 3 (CDN), and HTTP cache headers are documented in [§14 Storefront performance roadmap](#14-storefront-performance-roadmap) — none urgent, all independent. |
| SEO / crawlability | ✅ Shipped | Was the single biggest gap: hash routing made the whole catalogue one URL, so no product or category could rank. Now real paths (`/vinyl-records`, `/product/12-sholay-r-d-burman`) server-rendered by `seo-render.php` with per-page metadata + JSON-LD, plus `robots.txt`, a DB-generated sitemap, and real `<a href>` internal links. See [§15 SEO architecture](#15-seo-architecture). Outstanding manual steps (OG image, Search Console, Business Profile) are listed there. |
| GA4 ecommerce events | ✅ Shipped | `view_item` → `add_to_cart` → `begin_checkout` → `purchase` and the rest of the recommended vocabulary. The tag was always installed but sent page views only, so every funnel and revenue report in GA was empty. See §26. |
| Newsletter signup | ✅ Shipped | The homepage form was markup with no handler, no endpoint and no table — every address typed into it was discarded. Now `/api/subscribe.php` + a `subscribers` table + optional Brevo contact sync. See §26. |
| Admin dashboard | ✅ Shipped | Real KPIs, recent orders, restock list and a store-health block (uploads symlink / SMTP / Razorpay mode). One batched read. See §33. |
| Abandoned cart / checkout recovery | ✅ Shipped | Admin panel over both sources, plus automatic 2-hour and 24-hour emails once the cron is installed (§9). See §26. |
| Server-side cart persistence | ✅ Shipped | `carts` table mirrored from the browser on a debounce. localStorage is still the source of truth — this is a one-way copy for reporting and recovery. See §26. |
| Campaign sending | Manual | There is a consent-correct list and a Brevo sync, but no campaign composer here — write and send those from Brevo's dashboard. Filter on `Campaign safe: YES` in the CSV export, or on the opted-in list in Brevo. |
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
- **Never HTML-escape on the way into the database.** Write payloads store raw text; escape at every point of output instead. Escaping on write put `&#39;` in real product titles and corrupted their canonical URLs — see [§22](#22-never-html-escape-on-the-way-into-the-database).
- **The homepage hero's brand slide stays in `index.html`.** `/` is served as static HTML with no server render, so the `<h1>`, description and category links have to be in the file. Only the product slides are built by JS — see [§21](#21-homepage-hero-carousel).
- **Never let an anonymous request attach an email address to a cart.** `/api/cart-sync.php` takes ids and quantities only; an address comes from a Bearer token or from checkout, never from the request body. Widening this turns the recovery mailer into a way to make our server email a stranger on request. See [§26](#26-marketing-analytics-and-abandonment-recovery).
- **Analytics must never be able to break a purchase.** Every `Analytics.*` call site is `typeof`-guarded and `_send()` swallows everything. `purchase` fires only after `verify.php` has confirmed the signature — never on Razorpay's client-side callback.
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
| `/combos` | Combo offers | ✅ (noindex when empty) |
| `/combos/<slug>` | Single combo | ✅ |
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

### The shell's SEO tags are STRIPPED, not overwritten

`velorex_shell()` calls `velorex_strip_shell_seo()` before any route injects its
own tags. Injection alone left both copies in the document — with the
**homepage's** title, description and canonical **first**, because they sit
higher in `index.html`. Google discards a page's canonical entirely when it
finds more than one, and any crawler that does not execute JavaScript read the
homepage's title on all 72 product pages. `src/js/seo.js` repaired it after
hydration, which is exactly why it went unnoticed for so long.

The strippable tags live between `<!-- velorex:seo-head:start -->` and
`<!-- velorex:seo-head:end -->` in `index.html`. **Only put a tag inside those
markers if `velorex_meta_block()`/`velorex_jsonld_site()` also emit it** — a tag
that is stripped but not re-emitted disappears from every server-rendered page.
`theme-color` and the favicons sit outside the markers for that reason. If the
markers are ever lost, `velorex_strip_shell_seo()` falls back to removing the
exact tags by pattern, so the failure mode is "no duplicates" rather than a
silent return of this bug.

`/` is unaffected: it is served as static `index.html` and never reaches
`seo-render.php`, so it keeps that one correct set.

Guarded by `tests/seo-head-dedupe.php`.

### The SPA must not overwrite server-rendered tags

`velorex_meta_block()` stamps `<meta name="velorex-ssr" content="<path>">`, and
`Seo.update()` skips its **first** call when that marker matches
`location.pathname`. Every later call is a real client-side navigation and
updates tags normally.

Without this the router's boot-time `Seo.update()` replaced what the server had
just rendered — and because Googlebot indexes the rendered DOM, an empty
category's `noindex, follow` came back as `index, follow`, undoing the
thin-page protection. Read the marker **lazily**, inside the call: the injected
block sits immediately before `</head>`, after `seo.js`'s own `<script>`, so a
module-eval-time lookup always finds `null`.

### Product titles are built by one shared function

`velorex_product_title()` (PHP) and `Seo.productTitle()` (JS) must return
identical strings — the same rule as `slugify`, and they had already drifted
("Vinyl Records" vs "Vinyl Record"). Both run their containment test through
`slugify()`, so parity is inherited rather than re-derived.

The formula keeps the product name, adds the artist **only if the name does not
already contain it**, then adds the format and the brand **only while they fit**
60 characters. Nothing is cut mid-word — whole optional parts are dropped, so a
title is always a complete phrase. The old formula
(`<Product> — <Artist> | <Category> | Buy Online India`) stated the artist and
the format twice and averaged 77 characters, past what Google renders; 66 of 72
products exceeded the limit, the worst at 217. Now the average is 53 and one
product exceeds 60.

The `artist` column is free text and sometimes holds a cast list, so only the
first name is used — that is what produced the 217-character title.

Guarded by `tests/seo-title-parity.js` (run with `node tests/seo-title-parity.js`;
pass a products-JSON snapshot to fold the live catalogue into the cases).

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

### Brand assets

Built from the master logo (`src/img/logo.svg`, the 31-07-2026 export). See
[src/img/README.md](src/img/README.md) for the full inventory and how to regenerate.

Two things worth knowing:

- **`og:image` and `Organization.logo` are deliberately different images.**
  `og-default.jpg` is a dark promotional card with copy on it; `logo-1200.png` is the
  clean mark on white. Google does not want a promotional banner for schema `logo`, and
  a bare logo makes a weak social card. Don't collapse them into one file.
- **The wordmark in `logo.svg` is live `<text>` in Aktiv Grotesk + Poppins.** Browsers
  don't have those fonts, so rendering that SVG directly in a page silently falls back to
  a different typeface. Anything showing the wordmark uses the raster `logo-full.png`;
  `favicon.svg` contains only the vinyl + V mark, which is pure vector paths.

**Known inconsistency, not yet resolved:** the logo's brand red is `#ed2c15`, but
`src/styles/tokens.css` still uses an amber/orange palette from the original theme
(`--secondary: #ff6b35`, `--accent: #ffd700`). The favicon and social card use the real
brand red; the site chrome does not. Aligning the tokens is a site-wide visual change and
was left alone deliberately — decide it as a design call, not as a side effect of SEO work.

### Blog

Admin → **Blog** panel. Posts are written by pasting into a contenteditable
editor (bold/headings/lists/links/images survive a Word or Google Docs paste),
with a cover image and draft/published status. They render at `/blog` and
`/blog/<slug>`, server-rendered by `seo-render.php` with `BlogPosting` JSON-LD,
and published posts are added to the sitemap automatically.

| Piece | File |
|---|---|
| Schema bootstrap, sanitiser, shaping | [api/_blog_helpers.php](api/_blog_helpers.php) |
| CRUD endpoint | [api/blog.php](api/blog.php) |
| Image upload | [api/upload-blog-image.php](api/upload-blog-image.php) |
| Admin panel + editor | [src/js/admin/blog.js](src/js/admin/blog.js) |
| Storefront views | [src/js/storefront/blog.js](src/js/storefront/blog.js) |

**The `blog_posts` table is created on first API hit**, unlike every other table
here — there is no phpMyAdmin step. The DDL lives in `blog_ensure_table()`.

**Post bodies are sanitised server-side on WRITE, and that is the security
boundary.** The body is stored as HTML and rendered with `innerHTML` on a public
page, so it is a stored-XSS sink. `blog_sanitize_html()` parses with DOMDocument
and rebuilds against a tag/attribute allowlist: unknown tags are unwrapped
(text kept), `script`/`style`/`iframe`/`form` are destroyed outright, every
attribute not on the tag's allowlist is dropped (this is what kills `on*`
handlers and `style`), and `href`/`src` are checked against a scheme denylist
that tolerates `java\0script:` and `java\tscript:` obfuscation. The admin
editor's paste handler also cleans HTML, but **that is cosmetic only** — never
move the trust boundary into the browser.

Because the stored HTML is already safe, both the storefront renderer and
`seo-render.php` emit it raw. Escaping it there would print tags as visible text.

Drafts are invisible to the public API, excluded from the sitemap, and an empty
blog listing sets `noindex` so a thin page never enters the index.

### Departments (Merchandise / Vinyl Care)

Two non-format categories sit alongside the five music formats: `merchandise`
and `vinyl-care`. Where a format takes a **language** facet
(`/vinyl-records/hindi`), a department takes a **subcategory**
(`/merchandise/t-shirts`, `/vinyl-care/carbon-fiber-brush`). They occupy the
same URL slot; `velorex_subcategories()` is what distinguishes them.

Modelling them as two departments with subcategories, rather than 19 top-level
categories, keeps the navbar and URL surface manageable and avoids writing 19
sets of hand-written SEO copy for pages that are variations on one theme.

**The subcategory taxonomy lives in THREE places and they must agree:**

| File | Symbol |
|---|---|
| [src/seo/seo-lib.php](src/seo/seo-lib.php) | `subs` in `velorex_categories()` — authoritative |
| [src/js/seo.js](src/js/seo.js) | `Seo.SUBCATS` |
| [src/js/admin/inventory.js](src/js/admin/inventory.js) | `ADMIN_SUBCATS` |

The admin panel doesn't load the storefront's `seo.js`, hence the third copy. A
slug present in the client but not on the server pushes a URL the server 404s,
so there is a parity check (slugs *and* labels) in the department test suite.

Stored in `products.subcategory` — auto-added like `item_condition`, and
validated against `^[a-z0-9-]{1,60}$` on write so a stray value can never mint a
URL the router doesn't understand. An unknown subcategory in a URL is **not**
claimed by `parsePath` and 404s server-side, rather than silently rendering the
whole department under an unlimited number of URLs.

Both categories are seeded into the `categories` table by
`categories_seed_departments()` so they appear in the admin's Category dropdown.
Removing one via the Categories panel won't stick — deliberate, since the
storefront routes for it exist regardless and an unassignable route is worse
than an extra pill.

**Navbar:** the five formats are grouped under a single **Music** dropdown. They
were six separate top-level items, which together with the two departments
overflowed the navbar at 1280px and pushed the search box, cart and sign-in off
screen entirely. Every link is still a real `<a href>` in the DOM, so nothing
became less crawlable.

### Pre-owned stock

Products carry a condition, set in the admin product form (**Condition**:
New / Sealed vs Pre-owned) and stored in `products.item_condition`. It drives
three things: the teal **Pre-owned** badge on cards, the `/pre-owned` section,
and schema.org `itemCondition`.

The column is **auto-added on first use** by `products_has_condition_column()`,
like the blog table. Named `item_condition` because `CONDITION` is reserved in
MySQL 8. If the `ALTER` ever fails, every product simply reads as `new` and the
site keeps working — the column is never named in a `SELECT` unless it exists.

URLs: `/pre-owned`, and `/pre-owned/<format>` for the five format slugs. Format
chips are rendered only for formats that actually have pre-owned stock, and the
sitemap lists only those — a link or sitemap entry leading to an empty grid is
worse than none.

`itemCondition` in the Product JSON-LD was previously hardcoded to
`NewCondition`. It now follows the field (`UsedCondition` for pre-owned).
Leaving it hardcoded would have published a false claim about every second-hand
item — a rich-result violation and a consumer-trust problem, not a cosmetic one.

### Intro splash

A brand overlay on first load, in `#intro-splash` (markup in index.html, styles
in `storefront.css`, `initSplash()` in `router.js`). It shows the full stacked
lockup — `logo-stacked-dark.png` / `logo-stacked-light.png`, picked by the same
`.brand-lockup-dark`/`-light` rules the navbar uses — so the wordmark and
tagline come from the artwork and no duplicate brand text is rendered.

**It is deliberately constrained, and the constraints are the point.** A
full-screen overlay on arrival is what Google classifies as an *intrusive
interstitial*, a documented mobile ranking negative. So:

- **Homepage only.** Product, category, pre-owned and blog URLs are what people
  land on from search and never show it. **Do not relax this.**
- Once per session (`sessionStorage`), and skipped entirely when the URL carries
  a query string or hash (that visitor is going somewhere specific).
- Dismissed by any click, tap, key or scroll, plus a 6-second failsafe timer so
  it can never trap anyone.
- Ships with the `hidden` attribute and is revealed by JS, so a crawler that
  does not execute scripts sees the page with no overlay at all.

**`.intro-splash[hidden] { display: none !important }` must stay.** The `hidden`
attribute only works through the UA rule `[hidden]{display:none}`, which loses
to the `.intro-splash` class rule. Without it the overlay stays `position:fixed;
inset:0` over the viewport on every page — invisible enough to pass a
screenshot check, while silently swallowing every click on the site.

### Still to do (needs a person, not code)

1. **Google Search Console** — add the property, verify via DNS TXT, submit
   `https://velorexmusic.com/sitemap.xml`, then use "Request indexing" on the homepage
   and 2–3 product pages to seed the crawl.
2. **Google Business Profile** — for the local cluster. The name/address/phone must match
   `contact.html` and the `Store` JSON-LD *exactly*; NAP mismatches suppress local
   rankings.
3. **Verify rich results** after deploy — <https://search.google.com/test/rich-results>
   on one product URL and on `/faq.html`.
4. **Re-scrape the social caches** so the new card replaces any previously cached blank:
   Facebook's [Sharing Debugger](https://developers.facebook.com/tools/debug/) → "Scrape
   Again" (this also covers WhatsApp).

## 16. Shipping

There is **no order-value free-shipping threshold**. It used to be "free
pan-India over ₹5,000"; the owner asked for per-product control instead, so the
rule now lives on the product.

Two columns on `products`, both auto-added by `products_has_shipping_columns()`
the same way `item_condition` is:

| Column | Meaning |
|---|---|
| `free_shipping` TINYINT(1) | This item ships free. Set in the admin product form. |
| `shipping_charge` INT NULL | A flat charge for this item, overriding the zone rate. `NULL` = use the zone rate. |

The zone rate is the fallback: Delhi/NCR ₹49, rest of India ₹99, remote
(North-East, J&K, Andaman, Lakshadweep) ₹199.

**Mixed carts take the highest charge that applies, not the sum.** A cart of a
free-shipping T-shirt and a ₹149 vinyl ships at ₹149, not ₹149 + ₹99. Charging
per line would punish larger orders, which is the opposite of what a shipping
policy is for. If **every** item in the cart is free-shipping, shipping is ₹0.

```
shipping = 0                              if every item has free_shipping
         = max(shipping_charge ?? zone)   over the items that are NOT free
```

**`api/_shipping_helpers.php` is authoritative** — it runs inside
`/api/payments/create-order.php`, which is what mints the Razorpay amount.
`src/js/shipping.js` is a display mirror. **They must stay in sync**: if the
cart quotes a number the server does not agree with, the customer sees one
figure and is charged another. That exact bug shipped once already (see §9,
"About `prep-deploy`"). When you change one, change the other and re-check the
parity cases.

`Shipping.cartShippingItems()` in the JS mirror builds the per-line shape from
the product cache — one entry **per line, not per unit**, because the rule is a
max over distinct items and multiplying by quantity would silently re-introduce
per-unit charging.

## 17. Combo offers

Admin → **Combos**. A combo is a curated bundle: title, optional cover, a
description, and 2–12 products. Rendered on `/combos` and as a homepage strip,
both server-rendered by `seo-render.php`.

**A combo does not change what anyone is charged, and this is deliberate.**
`api/payments/create-order.php` recomputes every total from DB product prices —
that is the security property that stops a tampered browser from setting its
own price. A discount stored on a combo would therefore be ignored at checkout:
the page would promise ₹4,499 and the till would take ₹5,497. So a combo shows
the **real sum of its products' current prices**, and "Add all to cart" adds
those products at their normal prices. What is shown and what is charged are
the same number by construction.

If a genuine bundle discount is ever wanted, it has to be enforced inside
`create-order.php`. That is a payment-path change with all the care that
implies — not a display tweak, and not something to bolt onto this table.

| Piece | File |
|---|---|
| Table bootstrap, live product resolution | [api/_combo_helpers.php](api/_combo_helpers.php) |
| CRUD endpoint | [api/combos.php](api/combos.php) |
| Admin panel + product picker | [src/js/admin/combos.js](src/js/admin/combos.js) |
| Storefront cards + "Add all to cart" | [src/js/storefront/combos.js](src/js/storefront/combos.js) |
| Server render | `$route === 'combos'` (listing) and `'combo'` (detail) in [seo-render.php](seo-render.php) |

Each combo also has its own page at **`/combos/<slug>`** — the listing cards
link to it rather than carrying the buy actions themselves. That page is where
the descriptive copy and the outbound product links live, so it is the one
worth ranking, and it is what someone lands on from a shared link. It offers
three actions: **Add all to cart**, **Buy Now** (add all, then straight to the
cart, mirroring `handleBuyNowDetail` on a product), and **Add just this** per
product for people who only want one thing out of the bundle.

The server-rendered version of the detail page deliberately omits the buy
buttons. They need the combo in JS memory to work, and a button that silently
does nothing until a script loads is worse than one that appears with the
script. The SPA replaces the whole block on boot.

**Products are resolved live on every read**, never denormalised onto the
combo. A price edit or a deletion is reflected immediately, so the total on the
card cannot drift from what checkout will charge. A product deleted after the
combo was built is skipped rather than rendering a broken row; a published
combo left with zero products is hidden from the public feed (and from the
sitemap) but still shown in the admin so it can be fixed.

**No `Product`/`Offer` JSON-LD is emitted for a combo.** You cannot buy "the
combo" — you buy its members — so marking it up as a purchasable Offer with a
price would be a false claim about a buyable item, which is a rich-result
violation. The SEO value here is the internal linking: each combo is a
hand-curated cluster of related products, which a listing grid cannot express.

**`CartHelpers.addToCart(id, qty, { silent: true })`** exists for this feature.
Without it, adding a twelve-product combo stacks twelve toasts. `silent`
changes what is *said*, never what is *allowed* — the stock guard runs
identically, and a combo containing an out-of-stock item adds what it can and
reports the shortfall once.

## 18. Image cropping (admin)

Every admin image upload goes through a crop step first:
[src/js/admin/image-cropper.js](src/js/admin/image-cropper.js) +
[src/styles/admin/components/cropper.css](src/styles/admin/components/cropper.css),
markup in `#image-cropper-modal`.

| Surface | Default ratio | Entry point |
|---|---|---|
| Product images (Add + Edit modals) | 1:1 | `ImageCropper.run(fileList)` in `addFilesToGallery` / `addEditFilesToGallery` |
| Blog cover | 16:9 | `ImageCropper.open(file, label, {ratio})` in `handleBlogCoverUpload` |
| Blog body image | Free | `handleBlogInlineUpload` |

Three actions: **Crop & save**, **Use original** (upload untouched), **Skip this
image** (never uploads). A multi-file pick opens the modal once per file.

**The crop happens before the upload, not after, and that is the point.**
Uploaded files are content-addressed — the filename is a hash of the bytes. A
server-side crop would necessarily write the original first and the crop
second, leaving a full-size orphan on disk that nothing references and nothing
cleans up.

**The crop rectangle is stored in SOURCE pixels, never screen pixels.** Display
coordinates are derived on every render through the letterbox transform in
`layout()`; pointer deltas are divided by the scale on the way in. This is what
makes a window resize or an orientation change a pure re-render with no
coordinate migration and no drift. Don't "simplify" it by tracking the box in
CSS pixels.

**The preview uses a FileReader `data:` URL, NOT `URL.createObjectURL`.** The
admin page's CSP is `img-src 'self' https: data:` — a `blob:` URL is blocked
outright and the image silently never loads. Widening the CSP for a preview
would be the wrong trade.

Output keeps the source format for jpeg/png/webp; anything else (a GIF the
picker still offers) is re-encoded to JPEG, which the upload endpoint accepts
and a GIF was never accepted. If a re-encode busts the 5 MB ceiling that
`processImageFile` and the server both enforce, it retries at lower JPEG
quality rather than failing the upload with an opaque error.

## 19. Products-page filters

The sidebar on `/products` and every category route. `applyFilters()` in
[src/js/storefront/pages.js](src/js/storefront/pages.js) is the single place
the grid is narrowed; every control feeds it and nothing else filters.

**Facet values are compared case-folded, through `facetVal()`.** The admin form
is free text and MySQL collations are `_ci`, so the same facet arrives in
several casings — the live catalogue holds both `hindi` and `Hindi`. The
server's `WHERE language = :l` matched all of them while JS `===` did not, so
`/vinyl-records/hindi` server-rendered 65 products and the SPA cut it to 56 on
boot, and those nine rows showed an "English" pill. Normalise on read; do not
"fix" it by rewriting rows, which only holds until the next admin entry.

**Category, Condition and Artist options are rendered from the catalogue**, not
hardcoded in `index.html`. Hardcoding listed the five music formats only, so
Merchandise and Vinyl Care had no checkbox at all while formats with no stock
were offered as filters that could only return "No products found". A facet
section with fewer than two live values hides itself — a lone option is not a
choice.

**The routed category is a fallback, not an override.** `applyFilters()` applies
`currentParams.cat` only when the sidebar has no checkbox for it (departments).
Applying it whenever nothing was ticked meant unticking Vinyl on
`/vinyl-records` silently re-applied Vinyl from the URL.

**The search term lives in `currentParams.search`, not in the argument.** Every
`onchange` calls `applyFilters()` with no argument, so reading the query only
from the parameter dropped it the moment any checkbox moved. It is also
rendered as a removable active-filter tag, since a filter that survives but is
invisible has no way to be undone.

**Price buckets may be open-ended** — `value="2000-"` means "no upper bound".
It was `2000-9999`, which hid the ₹12,999 Sholay edition from the one filter
whose label promises the opposite.

The **People** filter needs `products.people` populated by the admin; it is
hidden entirely while nothing is tagged. **Artist** is the one that works on
today's data, since every product has one.

## 20. Admin dashboard stat cards

The four cards on the admin dashboard are filled by `renderDashboardStats()` in
[src/js/admin/inventory.js](src/js/admin/inventory.js). They were previously
literal markup — `12% vs last month`, `5 Urgent`, `24% vs last month`, a `4.9`
rating and `Top 1% Seller` — which never changed and reported pending orders
and a rating the shop did not have. **Don't reintroduce a placeholder number.**
A value that cannot be derived renders as `—` with an honest sub-line
(`No reviews yet`), never as a plausible-looking figure.

Rating is weighted by review count and excludes products with no reviews, so a
single 5-star review cannot outrank a well-reviewed item. Revenue excludes
cancelled orders.

**A failed sync must not look like a slow one.** `Storage._syncError` in
[src/js/admin/storage.js](src/js/admin/storage.js) records why the last
`syncFromServer()` failed; the renderers show an error row with a Retry button
instead of skeletons when the cache is cold *and* the fetch failed. Without it
an offline admin or a host error page left the Inventory table shimmering
forever with nothing on screen saying anything was wrong.

**The last-save badge expires after 24h** (`LAST_SAVE_TTL_MS` in
[src/js/admin/main.js](src/js/admin/main.js)). The record lives in
localStorage and nothing used to clear it, so a months-old failure was replayed
on every page load — reporting a broken server that was fine. Raw error bodies
are summarised by `summariseSaveError()`: an HTML doctype in the response means
the request never reached our JSON API (host error page or WAF), which is a
different problem from an API rejection and reads as such.

## 21. Homepage hero carousel

The banner on `/`. One `<section id="hero-carousel">` that auto-switches
between a **brand slide** (who Velorex is, plus the **All Products** and
**Shop Categories** calls to action) and up to **five product slides** carrying
short details — format, language, music director, rating, stock, price — with
**View Details** and **Add to Cart**.

| Piece | File |
|---|---|
| Brand slide markup + controls | `#hero-carousel` in [index.html](index.html) |
| Slide building + switching | [src/js/storefront/hero.js](src/js/storefront/hero.js) |
| All styling | [src/styles/components/hero-carousel.css](src/styles/components/hero-carousel.css) |
| Entry point | `HeroCarousel.init()` at the top of `initPageIndex()` in [src/js/storefront/pages.js](src/js/storefront/pages.js) |

**The brand slide is static markup and the product slides are not, deliberately.**
The homepage is served as plain `index.html` and never reaches
`seo-render.php` (see §15), so whatever is in that file is all a non-executing
crawler gets. Keeping the `<h1>`, the description and the six category links in
the served HTML means the carousel added zero SEO risk, and it is also what
makes the banner degrade to the plain static hero it replaced if `hero.js`
fails to load. **Don't move the brand slide into JS.**

**`.hero` and every `.hero-*` rule now live in the component file, not in
`pages/storefront.css`.** Both are same-specificity class selectors, so having
two definitions makes the winner depend on `<link>` order — the classic "I
edited the hero and nothing changed" trap. Only `@keyframes spin` stays in
`storefront.css`, because `.loading-spinner` and `payment-modal.css` also
animate with it.

**Slides are grid-stacked (`grid-area: slide`), not absolutely positioned.**
The banner's height is the tallest slide's, so switching never shifts layout
and no height has to be hard-coded. Inactive slides are `visibility: hidden`,
which also removes them from the tab order — that is why there is no `inert`
or `tabindex` bookkeeping.

**`init()` is idempotent.** `initPageIndex()` runs once on first paint with a
cold cache and again after the background sync resolves. A rebuild is skipped
unless the chosen products actually changed, so a sync that returns the same
catalogue cannot yank a slide out from under someone mid-read.

Auto-advance is 6.5 s and stops for: hover, keyboard focus inside the banner, a
hidden tab, a single-slide catalogue, and `prefers-reduced-motion`. The active
dot fills left-to-right over the dwell so the banner says when it is about to
move. Arrows, dots, ←/→ keys and swipe all drive it. **Don't remove the pause
rules** — a banner that moves while someone is reading it or reaching for a
button is the one thing everybody hates about carousels.

Product selection: badged first (`hot` → `new` → `upcoming`, the admin's
Homepage Placement), then best-reviewed, capped at five. Sold-out products are
excluded — featuring an unbuyable item in the largest element on the page is
worse than showing one fewer. `upcoming` is the exception, since a pre-order
with no stock is still buyable-soon; those render **Browse All** instead of
**Add to Cart**.

### Floating vinyl cards

Three glass panels drift around the record on the **brand slide only**
(`#hero-float-cards`). Each is labelled `Vinyl Record` over a title;
`fillFloatCards()` swaps the placeholders in `index.html` for real in-stock
vinyl titles once the cache is warm.

**Only vinyl products are eligible.** The label is fixed, so picking any other
category would print a format that contradicts the product named directly
under it. If three in-stock vinyls are not available the function returns and
the placeholders stand — they are generic collection names that read correctly
under that label, which is why they must stay finished copy and never become
"Loading…".

They live inside `.hero-visual`, so the existing `max-width: 968px` rule that
hides the brand slide's record hides the cards with it. Three drifting panels
over a phone-width hero would cover the copy that does the selling.

## 22. Never HTML-escape on the way INTO the database

The admin product form used to send `Utils.escape(...)` values to the API, so
the DATABASE held entity-encoded text: a title typed as `Gulzar's Fursat Ke
Raat Din` was stored as `Gulzar&#39;s Fursat Ke Raat Din`. It looked fine
anywhere the value reached `innerHTML` and broken everywhere it did not —
breadcrumbs, the detail page-hero, the `<title>` tag, receipt emails — and
`velorex_slugify()` minted `/product/12-gulzar-39-s-fursat-ke-raat-din` as the
canonical URL. It also **compounded**: each re-save escaped the ampersands
again (`&amp;#39;`).

**Escaping is a render-time concern.** Store raw; escape at every point of
output — `Utils.escape()` in the storefront, `velorex_e()` in the SSR layer,
`escapeHTML()` in the admin. Do not reintroduce escaping in a write payload.

`products_decode_text()` in [api/_products_helpers.php](api/_products_helpers.php)
decodes entities on read inside `row_to_product()` and `row_to_product_lean()`,
which is why the heal reaches the SPA, `seo-render.php`, the sitemap and the
mailer from one place. It is not a temporary shim — decoding a clean string is
a no-op, so it stays correct once every row has been re-saved. `sitemap.php`
and `api/payments/create-order.php` call it directly because they read the
`products` table without going through those two shapers.

## 23. Custom cursor

A red dot pinned to the pointer plus a hollow red ring that trails it and
swells over anything clickable. [src/js/cursor.js](src/js/cursor.js) +
[src/styles/components/cursor.css](src/styles/components/cursor.css), loaded by
`index.html` and the five static info pages. **Not the admin panel** — that has
its own design system and is a work tool, not a shop window.

**Every rule that hides the system cursor is gated behind `.vlx-cursor-on`, and
only `cursor.js` adds that class.** So a visitor gets the native cursor if the
script fails, 404s, or bails. Never move `cursor: none` out from behind it: an
un-gated version leaves anyone whose JS did not run with no visible pointer at
all, on every page.

`init()` refuses to run — leaving the native cursor — when:

| Condition | Why |
|---|---|
| `(hover: hover) and (pointer: fine)` fails | Touch and coarse pointers have no cursor to replace. |
| `prefers-reduced-motion: reduce` | A trailing, easing follower is exactly the motion that setting is about. |

The CSS repeats both guards in media queries. That is not redundancy: it means
a stale `.vlx-cursor-on` (a bfcache restore, say) cannot leave a touch user
with a hidden pointer.

**Native cursors are restored on `input`, `textarea`, `select` and
`[contenteditable]`.** The I-beam says a field is editable and shows where the
caret will land; a dot says neither.

**The press state animates size, not `transform`.** `cursor.js` writes
`transform` inline every animation frame to position the ring, and an inline
style beats a stylesheet rule — a `transform: scale()` in the CSS would simply
never apply. It was written that way once and was silently dead.

Both elements are positioned in a single `requestAnimationFrame` loop rather
than in the `mousemove` handler. A mouse fires well above 60 events/sec, and a
transform write per event is layout work the compositor throws away.

The red is the logo's `#ed2c15`, not `--secondary` (the chrome's amber). See
§15 "Brand assets" — the two palettes are knowingly out of step, and a cursor
is a brand element.

## 24. Global search

[src/js/storefront/search.js](src/js/storefront/search.js) +
[src/styles/components/search.css](src/styles/components/search.css), wired from
`injectNavbar()`. One engine, two presentations:

| Width | Presentation |
|---|---|
| > 1100px | Inline pill in the navbar with a suggestions dropdown |
| <= 1100px | A magnifier button in `.navbar-actions` that opens a full-screen sheet |

**Search now exists at every width.** The navbar collapses to a hamburger at
1100px and `.navbar-search` was `display: none` below it, so on every tablet
and every phone the only way into the catalogue was browsing categories —
while "do you have Sholay?" is most of a record shop's traffic.

Matching runs against the cached product list, not an endpoint: it is the same
lean payload the products page already filters on, so there is no round trip
per keystroke and it works offline once the cache is warm. Results are
**ranked**, not filtered — an exact title beats a title prefix beats an artist
prefix beats a word-start beats a substring — so typing `sho` puts *Sholay*
above a record whose music director merely contains those letters. Revisit the
transport only if the catalogue reaches thousands of products.

**`.navbar-search` and every `.search-*` rule live in the component file**, not
in `pages/storefront.css` — same reasoning as `.hero` in §21. The one rule that
stays in the responsive block is `display: none` below 1100px, which is a
navbar layout decision and is what hands over to `.search-trigger`.

Three things here were bugs worth not reintroducing:

- **The field must be bound in exactly one place.** `index.html`'s bootstrap
  used to attach its own Enter handler on top of `bindNavbar()`'s. One keypress
  then ran both: the first opened the highlighted suggestion, the second
  navigated to `/products?search=<raw query>` on top of it, so picking a
  suggestion with the keyboard was impossible. `bindNavbar()` also flags the
  input (`dataset.vlxSearchBound`) so a repeated call on a surviving element
  cannot stack listeners.
- **The highlighted row is tracked only as a class on the element.** A mirrored
  `activeIndex` desynced from the DOM whenever a background sync re-rendered
  the list between two keystrokes.
- **`.search-trigger` is qualified as `.nav-action-btn.search-trigger`.**
  `.nav-action-btn` sets `display: flex` in `storefront.css`, which loads after
  `search.css`, so a bare-class rule lost and the button appeared on desktop
  next to the field it exists to replace.

`highlight()` finds the match offset on the **raw** string, slices, then
escapes each piece separately. Escaping first and searching the escaped string
shifts every offset as soon as a title contains `&` or `'` — and this feature
renders product titles, which is exactly where §22's entities were showing up.

## 25. Artist filter splits credit lists

`products.artist` is free text and often holds a credit list rather than one
act — `Lata Mangeshkar, Mukesh`. Treating the whole string as one facet value
gave a filter row per *combination*: "Lata Mangeshkar" appeared three times
attached to three different co-singers, each with a count of 1, and never once
on her own.

`splitArtists()` in [src/js/storefront/pages.js](src/js/storefront/pages.js)
splits on **commas and explicit featuring markers only** (`feat.`, `ft.`,
`featuring`). It deliberately does **not** split on `&` or `/`: those appear
inside real single acts — Simon & Garfunkel, AC/DC, Hall & Oates — and
splitting them would invent artists who do not exist. A comma is the one
separator that is never part of a band name.

The facet counts each credited artist separately, and `applyFilters()` matches
a product if **any** of its credited artists is selected.

## 26. Marketing, analytics and abandonment recovery

Five pieces shipped together because they are one loop: measure what happens,
capture who it happened to, and follow up when it nearly worked.

| Piece | Where |
|---|---|
| GA4 ecommerce events | [src/js/analytics.js](src/js/analytics.js) |
| Newsletter signup | [api/subscribe.php](api/subscribe.php), [api/unsubscribe.php](api/unsubscribe.php), [src/js/storefront/newsletter.js](src/js/storefront/newsletter.js) |
| Server-side cart mirror | [api/cart-sync.php](api/cart-sync.php), [src/js/cart-sync.js](src/js/cart-sync.js) |
| Recovery emails | [api/_recovery.php](api/_recovery.php), [api/_marketing_templates.php](api/_marketing_templates.php), [scripts/send-abandoned-cart-emails.php](scripts/send-abandoned-cart-emails.php) |
| Admin panels | [api/admin/abandoned.php](api/admin/abandoned.php), [api/admin/subscribers.php](api/admin/subscribers.php), [src/js/admin/marketing.js](src/js/admin/marketing.js) |
| Shared schema + Brevo API | [api/_marketing_helpers.php](api/_marketing_helpers.php) |

### The rule that constrains all of it

**A recovery email address must come from a source that proves the address
belongs to the person holding the browser.** There are exactly two:

- a valid Bearer token — we read the address from `users` by id, and ignore
  whatever the client sent;
- guest checkout — it is already on `payment_orders`, typed on the way to
  paying for something.

`/api/cart-sync.php` therefore does **not** accept an `email` field from an
anonymous caller. If it did, any browser could attach any address to any cart
and make our server mail a stranger on request — a spam cannon with this
domain's sending reputation behind it. A newsletter signup is deliberately not
on the list either: someone can type a victim's address into a signup box (true
of every signup form on the internet), and that must earn one welcome mail with
an unsubscribe link, not enrolment in a drip campaign.

Carts with no known email are still stored and still counted. Knowing that
eleven people abandoned a large basket this week is worth having even when none
of them can be emailed.

### `consent_at` decides what may be sent

`subscribers.consent_at` has two meanings and the admin UI shows both:

| Value | Badge | May receive |
|---|---|---|
| `NOT NULL` | **Opted in** | Campaigns, plus everything below |
| `NULL` | **Customer** | Order mail and cart reminders only — **never a promotional campaign** |

A `NULL` row exists because `marketing_contact_token()` needs a stable opt-out
token for any address a marketing-adjacent email is sent to, including shoppers
who never used the signup form. The CSV export writes a literal
`Campaign safe: YES/NO` column so the distinction survives the trip into
whatever mail tool the list is pasted into. **Do not backfill `consent_at`** to
make the subscriber count look better — the number it would improve is the one
that keeps the sending domain out of trouble.

### Two nudges, then stop

Stage 1 at 2 hours, stage 2 at 24 hours, and no stage 3. `RECOVERY_STAGE1_HOURS`
/ `RECOVERY_STAGE2_HOURS` / `RECOVERY_MAX_AGE_HOURS` live at the top of
[api/_recovery.php](api/_recovery.php). A third email to someone who ignored two
is how a shop ends up in the spam folder for every future *receipt* it sends —
the cost lands on transactional mail, not on the marketing.

`recovery_stage` is stamped **only after SMTP accepts the message**, so a failed
send is retried on the next run rather than silently skipping that customer
forever because of one bad minute.

**The sequence resets when the cart changes.** `ON DUPLICATE KEY UPDATE` in
[api/cart-sync.php](api/cart-sync.php) sets `recovery_stage = 0` on every write,
so a visitor who comes back and adds another record re-enters at stage 1 instead
of receiving a stale stage-2 email about a basket they have since changed.

**No discount code in the recovery email**, and the reason is mechanical as much
as commercial: `create-order.php` recomputes every total from DB prices (§17), so
a code promised in an email could not be honoured at the till without a change to
the payment path. An email must never quote a price the checkout will refuse.

### The checkout half needed no new capture

`payment_orders` rows have always been written *before* the customer is sent to
Razorpay, so every row still at `status='created'` is a checkout someone walked
away from — with their email, phone, items and address attached. That data was
already in the database and nothing read it. The Abandoned panel's
"Left at payment" rows are just a `SELECT`.

The `carts` table is the genuinely new capture, and it is the bigger half: it
covers people who never reached checkout at all.

### "Abandoned" starts after 60 minutes, and the panel must say so

`ABANDON_GRACE_MINUTES` (60) is how long a basket must sit untouched before it
counts. Rows inside that window are still returned by
[api/admin/abandoned.php](api/admin/abandoned.php), flagged `active: true`, and
are excluded from every default view and from all four stat cards — but they
are reachable from the **Active now** chip, and the empty state counts them.

The first version dropped them from the query entirely, and the failure mode was
immediate: put two records in a cart, open the panel, and it said *"No abandoned
carts — that is a good problem to have."* An owner reasonably reads that as
"the feature is broken", when the truth is "the cart is 30 seconds old". **A
panel that cannot distinguish "nobody has a cart" from "the carts are too fresh
to chase" is not telling the truth about the shop.** Keep the two states
distinguishable if you change this.

The manual **Send** button is disabled on an active row, and the cron filters on
the same window — emailing "you left this behind" to someone still browsing the
site is the fastest way to look clumsy.

### GA4

The tag (`G-N6H3GG17TM`) and SPA page views were already there; what was missing
was every ecommerce event, so the whole Monetisation section and all funnel
reports were empty. `Analytics.*` now sends the GA4 **recommended** event names
(`view_item`, `add_to_cart`, `begin_checkout`, `purchase`, …) — a custom name
would still record but would not populate those built-in reports.

Three things not to change:

- **`purchase` fires only from the verify-success handler**, after the server
  has checked the HMAC signature. Firing it on Razorpay's client-side callback
  would put revenue in the dashboard on the browser's unverified say-so, which
  is exactly the claim [api/payments/verify.php](api/payments/verify.php) exists
  to refuse. It is also de-duplicated on `transaction_id` in `sessionStorage`,
  because inflated revenue is worse than missing revenue — it gets believed.
- **Money is in rupees here, paise in the payment path.** Convert at the
  boundary; never mix units in one object.
- **Every call site is `typeof`-guarded** and `Analytics._send()` swallows
  everything. These calls sit inside add-to-cart and the payment success path;
  an analytics error must never break a purchase.

`cart_recovered` is the one non-standard event — mark it as a conversion in
GA4 Admin → Events if you want it in reports.

### Data retention

The cron prunes `carts` rows untouched for 90 days. A cold cart snapshot is
personal data with no remaining purpose: past `RECOVERY_MAX_AGE_HOURS` nothing
will ever be sent about it, and the admin panel's window is shorter still.
Keeping them forever would mean holding a growing record of what strangers
browsed, for no reason worth defending.

## 27. Homepage bands: trust, recently sold, labels

Three strips now sit between the hero and the curated product grids. All three
are **static markup in `index.html`** wherever they can be, for the reason in
§15: `/` is served as plain `index.html` and never reaches `seo-render.php`, so
anything a non-executing crawler should read has to be in the file.

| Band | Markup | Styles | Data |
|---|---|---|---|
| Trust band | `.trust-band` in [index.html](index.html) | [trust-band.css](src/styles/components/trust-band.css) | Static |
| Recently Sold | `#recent-sales` in [index.html](index.html) | [recent-sales.css](src/styles/components/recent-sales.css) | [api/recent-sales.php](api/recent-sales.php) via [recent-sales.js](src/js/storefront/recent-sales.js) |
| Record labels | `.label-band` in [index.html](index.html) | [label-band.css](src/styles/components/label-band.css) | Static |

### The trust band was moved OUT of the hero

`5 Formats / 100% Genuine / Pan-India` used to be `.hero-stats` inside the
carousel's **brand slide** — so they were visible on one slide in six, and on a
phone they sat below the fold. They are now their own full-width marquee under
the carousel.

`.hero-stats` is **gone from `hero-carousel.css`** and must not come back: two
same-specificity definitions in two files makes the winner depend on `<link>`
order, which is the trap called out at the top of that file.

The item group is in the markup **twice** and the track translates `-50%`, so
the loop is seamless with no JS. Keep the two groups byte-identical or it
visibly jumps. The duplicate is `aria-hidden` (a screen reader must not read
the same four claims twice) and is `display: none` under
`prefers-reduced-motion`, where the band becomes a static centred row. It also
pauses on hover and on focus-within — same rule as the carousel (§21).

### Recently Sold mixes real sales with filler, and says which is which

Rows come from `orders`, newest first, **de-duplicated by product** so one
record selling five times is one card. Cancelled/refunded orders are excluded —
showing one as a recent sale is a straightforwardly false claim.

**Privacy is the constraint on this endpoint.** It is public and unauthenticated
and it reads the order book, so it returns only *what* was bought, for how much,
and the buyer's **city/state**. Never a name, email, phone, street address,
order id or payment id. Extend the `SELECT` only after re-reading the header
comment in [api/recent-sales.php](api/recent-sales.php).

When there are fewer real sales than the strip needs, it is topped up with
**filler**: a real, in-stock catalogue product with a *synthesised* city and
timestamp, flagged `demo: true` in the payload. The filler is seeded per
calendar day, so it is stable on refresh and moves on tomorrow — a "sale" that
reshuffles on every reload is obviously fake.

This is **the one place in the codebase that renders something we did not
observe**, and it is here because the owner asked for it. Everywhere else the
rule in §20 stands: a value we cannot derive shows as an em dash. Prices are ₹
and locations are Indian because checkout is India-only (§12); a card reading
"United Kingdom · $58" would advertise a lane the shop cannot serve.

The section ships `display:none` and reveals itself only at four or more rows —
a heading over an empty box reads as a broken shop, and a failed fetch must not
leave one.

### The label band takes logos it does not have yet

Each chip renders the label's **name**; the `<img>` beside it is hidden until
its own `onload` fires, which adds `.has-logo` and swaps the wordmark out. So a
missing file is a finished-looking wordmark, a dropped-in file just starts
working with no code change, and a 404 falls back silently. These are other
companies' trademarks — read
[src/img/labels/README.md](src/img/labels/README.md) before adding artwork.

## 28. Category cards carry real photography

The six cards under "Shop by Category" were flat CSS gradients with an emoji.
They are now real `<img>` — **not** `background-image`, deliberately:

- a background image is invisible to Google Images, and "buy vinyl records
  online india" is exactly what these should be pulling;
- `loading="lazy"` plus intrinsic `width`/`height` means six covers below the
  fold cost nothing on first paint and shift nothing.

**The filenames are the alt text's twin** — `buy-vinyl-records-online-india.jpg`,
not `cat1.jpg`. Files live in [src/img/categories/](src/img/categories/), sized
to 900px wide and re-encoded (~355 KB for all six, down from ~11 MB of source
PNGs). Regenerate the same way if you replace one: the perf rules in §14 apply
to these as much as to product covers.

**Card titles match `velorex_categories()`' labels exactly** — "Blu-ray Movies"
and "DVD Movies", not "Blu-rays"/"DVDs" — so the homepage anchor text matches
the `<h1>` and `<title>` of the page it points at. If you rename a category in
[src/seo/seo-lib.php](src/seo/seo-lib.php), rename the card too.

## 29. Light theme: the failures were systemic, not cosmetic

An audit of every button and text run across home / products / detail / cart /
login / profile / combos found 26 elements below 3:1 contrast in light mode.
Four root causes, all fixed at the source rather than per-component:

| Cause | Symptom | Fix |
|---|---|---|
| `--accent` was `#f59e0b` | 2.1:1 on white. This is the **price** colour (`.product-price`, cart total, order totals), the star colour and the sign-in link colour. | `--accent: #b45309` in the light block of [tokens.css](src/styles/tokens.css) — ~5.4:1, still recognisably the same amber. Dark theme keeps `#ffd700`. |
| `.btn-gold { color: var(--primary) }` | `--primary` flips to `#ffffff` in light, so **"Buy Now" was white on gold**. | A literal `#1a0a2e`. The gold gradient is light in *both* themes, so its ink must be dark in both. |
| `.product-detail-discount` on `#10b981` | White at 2.5:1 — failed in **both** themes, since the pill is its own background. | `#047857`. |
| Newsletter field inline `color: white` | The card sits on `--vinyl-gradient`, which is near-**white** in light mode. You could type and see nothing. | Moved off the inline style into `.newsletter-form input[type="email"]` with a `[data-theme="light"]` override. |

**Do not re-introduce `var(--accent)` or `var(--primary)` as a text colour on a
surface that is light in one theme and dark in the other.** Both tokens flip.
Use a literal when the *background* does not flip.

The hero also read as an empty white page in light mode: the aurora blobs were
at `opacity: 0.4` over `#fdfbff`, the grid lines at 5% alpha, and every artwork
shadow was `rgba(0,0,0,0.55)` — a grey smear on a pale ground. It now has a
tinted gradient ground, aurora at 0.85, visible grid lines, and slate-tinted
shadows. The active carousel dot was also *fainter* than an inactive one
(`0.12` vs `0.15`).

### The admin sidebar must be able to scroll

The nav is eleven items plus a logo and a logout. At phone heights that is
~860px of content in a ~740px drawer, and `.sidebar` had no `overflow-y` — so
the overflow was simply **unreachable**, Logout included, on every phone. It
appeared when Dashboard, Coupons and Policies were added; the list had been one
item short of the fold.

`overflow-y: auto` is on the BASE rule, not just the mobile one — a short laptop
window overflows too. `overscroll-behavior: contain` stops reaching the end of
the list from scrolling the page behind it.

The drawer uses **`100dvh` with a `100vh` fallback line first**. On iOS Safari
`100vh` is the height *without* browser chrome, so a `100vh` drawer runs under
the URL bar and the last item is unreachable even when the list would fit.

Mobile padding and item spacing are tightened so the whole nav fits without
scrolling on a typical phone (390×740). Scrolling works, but not needing to is
better — a drawer is a menu, not a page.

### Add to Cart / Buy Now are one size on every device

`.product-actions-group` is a **grid**, not flex — under flex the two buttons
were different widths at every size, because their labels are different
lengths.

It uses **`repeat(auto-fit, minmax(10rem, 1fr))`, not `repeat(2, minmax(0, 1fr))`.**
Two fixed tracks of `minmax(0, …)` are allowed to shrink below their own label,
and in the product page's narrow right column they did: the pair rendered at
114px each and clipped to *"Add to Ca"* at every desktop width. The floor is the
width the longest label actually needs, so the grid drops to one full-width
column rather than squeezing two — and since every track is `1fr`, the buttons
stay identical to each other either way.

`btn-lg`'s 2.5rem side padding is also trimmed inside this group. The button is
already centred and already fills its track, so that padding bought nothing and
cost ~80px of the space the label needed.

There is deliberately **no media-query override** any more. `auto-fit` already
stacks when two tracks will not fit, and the previous override had to be
specificity-matched by hand to work at all — a second rule deciding the same
thing is a second thing to keep in step.

Verified with no clipping and matching sizes at 1440 / 1200 / 1024 / 900 / 768 /
700 / 560 / 430 / 360 / 320.

### The navbar sign-in was an unreadable glyph

`fa-right-to-bracket` (arrow into a bracket) at 1.1rem reads as an exit, not a
sign-in. It is now a person icon **plus the word "Sign in"**, with the label
dropped below 1100px where the navbar collapses.

## 30. Admin: why a recovery send failed, and what the email says

Two gaps on the Abandoned panel, both of which made a working feature look
broken.

**The real SMTP error was invisible.** `send_mail()` never throws (by design —
§10), and it wrote the failure to `error_log`, which an owner on Hostinger
shared hosting cannot realistically read. The panel said "check error_log"
while the actual answer — `Could not authenticate`, `550 Sender not allowed`,
an IP-allowlist rejection — sat in a file nobody would open.
`mailer_last_error()` in [api/_mailer.php](api/_mailer.php) now records the SMTP
server's own reply and [api/_recovery.php](api/_recovery.php) passes it back, so
the admin toast names the row in §10's troubleshooting table. **Admin-only** —
it can contain the SMTP host's reply and the configured From address, so do not
surface it from a public endpoint.

**There was no way to see the email.** `POST { action: 'preview-recovery' }` on
[api/admin/abandoned.php](api/admin/abandoned.php) returns the exact message a
Send would produce. It runs through `marketing_send_recovery()` in **preview
mode**, not through a second copy of the rules — a preview built separately
would eventually show a cheerful template for a row the real sender refuses,
which is worse than no preview.

Preview is side-effect free, and each part of that matters:

- it does **not** mint a `subscribers` row (`marketing_lookup_optout_token()` is
  the read-only sibling of `marketing_contact_token()`);
- it does **not** persist a freshly minted `recovery_token`;
- it does **not** stamp `recovery_stage`, so opening a preview cannot burn one
  of the two allowed nudges;
- it does **not** require SMTP to be configured — being able to read the
  template while Brevo is still being set up is when it is most useful.

The body renders in a **sandboxed iframe** (`srcdoc`, no `allow-scripts`). The
template interpolates product titles from the `products` table, so it is
untrusted-ish HTML on an authenticated admin page; the sandbox also stops the
email's own CSS leaking into the panel, which a plain `innerHTML` would
guarantee.

## 31. Inline `onclick` arguments must not be built with `JSON.stringify`

Every action button on the Abandoned and Subscribers panels was dead — Send,
Preview, Dismiss, Restore, and both subscriber actions. Clicking one did
nothing at all.

They were built like this:

```js
onclick="sendAbandonedRecovery(' + JSON.stringify(r.kind) + ')"
```

`JSON.stringify` emits **double** quotes, so the rendered markup was

```html
onclick="sendAbandonedRecovery("cart","1")"
```

and the HTML parser ends the attribute at that first inner `"`. The rest became
stray attributes, and the truncated handler threw `Unexpected end of input` on
click — which surfaced as a button that simply did nothing, with no toast and
nothing obviously wrong on screen. This is why "the admin Send button is
broken" was never an SMTP problem.

`jsAttrArg()` in [src/js/admin/marketing.js](src/js/admin/marketing.js) is the
fix: single-quote the JS string literal, escape for JS, then escape for HTML
(`&` first, or it double-encodes the entities the later passes add). **Use it
for every value interpolated into an inline handler.** `JSON.stringify` is fine
for a `fetch` body and wrong for an HTML attribute.

The same trap is why `setBtn()` in
[src/js/storefront/checkout.js](src/js/storefront/checkout.js) now writes
`innerHTML` rather than `textContent`: the Pay Now labels carry a Font Awesome
`<i>`, and `textContent` would print the tag as visible text.

## 32. Buttons use Font Awesome, not emoji

"Add to Cart", "Buy Now", "Proceed to Checkout", "Pay Now" and the combo
actions were labelled with emoji (`🛒`, `⚡`) while every other control on the
site uses `<i class="fas …">`. Emoji render as a different typeface, at a
different size, in a different colour, on every platform — so those buttons
never matched the rest of the UI and could not be tinted with the button's own
colour.

Decorative emoji in **section headings** (`🔥 Best Selling`, `🎁 Combo Offers`)
were left alone: they are part of that heading style and are not trying to look
like an icon in a control.

## 33. The admin Dashboard

Sidebar → **Dashboard**, the landing panel after login.

| Piece | File |
|---|---|
| Batched read | [api/admin/dashboard.php](api/admin/dashboard.php) |
| Renderer | [src/js/admin/dashboard.js](src/js/admin/dashboard.js) |
| Styles | [src/styles/admin/pages/dashboard.css](src/styles/admin/pages/dashboard.css) |
| Markup | `#panel-overview` in [vlx-admin-2026.html](vlx-admin-2026.html) |

**The panel id is `overview`, not `dashboard`.** `switchPanel('dashboard')` has
always meant the *Inventory* products table, and renaming it would touch every
caller for no user-visible gain. The sidebar item labelled "Inventory" still
calls `'dashboard'`; the real dashboard is `'overview'`. Both nav links carry a
`data-nav` attribute so one panel can link to another.

**One round trip, not six.** The panel answers three questions — did we make
money, is anything waiting on me, is anything broken — and every figure is a
real `COUNT` or `SUM`. There is no growth percentage, no "vs last month" and no
rating: §20's rule is enforced structurally here, in that `dashStat()` renders
an em dash plus an honest sub-line whenever the value is `null`. A table that
does not exist yet (`carts`, `subscribers` are created on first use) degrades to
`null` rather than 500-ing the whole panel.

**Store health is the part worth keeping.** Three things are otherwise invisible
until a customer complains:

- **Product image storage** — Hostinger's git deploy wipes
  `public_html/uploads` (a symlink to `~/uploads`), every product photo 404s,
  and nothing anywhere says so; the owner finds out from the storefront. A cron
  restores it within a minute (§10), but until now there was no way to ask "is
  it broken right now?". This is the panel that answers it.
- **Transactional email** — whether `SMTP_*` is set at all.
- **Payments** — whether Razorpay is keyed, and a standing banner while
  `RAZORPAY_MODE` is `test`, because "we are taking real money" and "we are in
  test mode" are the two states most worth never confusing.

A failing row prints the fix next to the problem, so nobody has to go looking it
up while the shop is down.

## 34. Discount coupons

Admin → **Coupons**. Percentage or fixed-amount codes, optionally reserved for
one customer, with a storefront promo card for whichever code is featured.

| Piece | File |
|---|---|
| Schema, validation, the discount calculation | [api/_coupon_helpers.php](api/_coupon_helpers.php) |
| Storefront quote (display only) | [api/coupon-validate.php](api/coupon-validate.php) |
| Featured coupon for the promo | [api/coupons.php](api/coupons.php) |
| Admin CRUD | [api/admin/coupons.php](api/admin/coupons.php) |
| **Where a discount becomes real** | [api/payments/create-order.php](api/payments/create-order.php) |
| Redemption record | `finalize_payment()` in [api/_payment_finalize.php](api/_payment_finalize.php) |
| Admin panel | [src/js/admin/coupons.js](src/js/admin/coupons.js) |
| Cart field + promo card | [src/js/storefront/coupon.js](src/js/storefront/coupon.js) |

### The browser never decides a discount

`coupon_evaluate()` is the **one** place a discount is computed.
`create-order.php` calls it with the subtotal **it** derived from DB prices —
never a number the browser sent — and mints the Razorpay order for the result.
The cart's quote endpoint calls the same function, so what the cart shows and
what the till takes are the same calculation on the same inputs.

The applied coupon travels to checkout as a **code**, never as an amount. A
tampered browser can at most ask for a discount the server then refuses.

This is the property §17 describes for combos, and it is why a combo could not
simply store a discount. **If you ever add a second copy of these checks — for
speed, for a nicer message, anything — you have rebuilt the hole this file
exists to avoid.**

A code the browser sends that fails validation is **ignored**, not a 400: the
cart already reported the failure when it was typed, and a coupon that expired
between the cart and the Pay button should not strand someone ready to pay. The
response carries `couponError`, and the checkout drops the code and says so
before the Razorpay sheet opens.

### Rules worth not changing

- **Discounts never apply to shipping.** Delivery is a real per-parcel cost
  (§16); a percentage eating into it turns a generous-looking offer into a loss
  on small baskets.
- **The discount is clamped to the subtotal.** Otherwise a large fixed-amount
  code produces a negative total and a Razorpay order for a negative amount.
- **Percentage is capped at 90, not 100.** A 100%-off code is a free-order
  generator; if that is genuinely wanted it should be a deliberate decision, not
  a typo in a percentage box.
- **"No such code" and "disabled" return the same message.** Different messages
  would make this endpoint a way to enumerate live codes.
- **Redemption is recorded inside `finalize_payment()`'s transaction**, with a
  `UNIQUE` key on `order_id`. It commits with the order or not at all, so a
  rolled-back payment leaves no phantom redemption, and the verify + webhook
  double-fire cannot double-count. `used_count` only advances when a row was
  genuinely inserted.
- **The coupon is bound to the `payment_orders` row at create time** and is
  *not* re-evaluated at finalize. Re-running the rules minutes later could
  reach a different answer (someone else exhausting the limit, the expiry
  passing mid-payment) and would then disagree with the amount Razorpay already
  captured. The charge is settled; finalize is bookkeeping.

### Customer-specific codes

`coupons.customer_email` reserves a code for one person. The identity it is
matched against comes from the **session** (looked up in `users` by id) or from
the address typed at **guest checkout** — never from a field the browser
supplies, the same rule `/api/cart-sync.php` follows and for the same reason
(§26).

A signed-out visitor quoting a reserved code is told *"Sign in with the account
this coupon was sent to"* rather than "invalid", which would read as a broken
code to the one person it was made for.

A reserved code **can never be the featured promo** — enforced in the admin
validator *and* in the promo query, so the two settings cannot be saved in a
combination that would advertise someone's personal code to every visitor.

### The promo card stays until the code is taken

Two flags, because "I have the code" and "not now" are different answers:

| Flag | Where | Meaning |
|---|---|---|
| `vv_promo_copied` | localStorage | They copied it. **Never shown again**, across sessions — they have what it offers. |
| `vv_promo_dismissed` | sessionStorage | They closed it without copying. Gone for this visit, back on the next one. |

**Nothing is recorded when the card is merely SHOWN.** Being seen is not being
acted on, and marking it on show is what made one stray click lose the offer
permanently. The guard is checked in `show()` as well as `init()`, so the rule
holds wherever it is called from.

The X still works and still suppresses it for the visit, so this can never
become something a visitor cannot get past.

### The promo card is a corner card, not an interstitial

Constrained the same way the intro splash is (§15) and for the same reason: a
full-screen overlay on arrival is what Google classifies as an intrusive
interstitial, a documented mobile ranking negative. So it appears after a
delay, never covers the content, never blocks a click on the page behind it,
shows once per session, and is dismissible by button, Escape or clicking away.
**Don't promote it to a modal.**

### Tables

`coupons` and `coupon_redemptions` are created on first use, like `blog_posts`,
`combo_offers`, `carts` and `store_settings`. `payment_orders.coupon_code` and
`.coupon_discount` are added on demand the same way the recovery columns are —
no phpMyAdmin step. A failure to add them degrades to "no redemption recorded",
never to a broken checkout.

## 35. Editable policy pages

Admin → **Policies**. Edits the body of `shipping.html`, `returns.html`,
`terms.html` and `privacy.html`.

| Piece | File |
|---|---|
| Schema, seed, sanitised write | [api/_policy_helpers.php](api/_policy_helpers.php) |
| Front controller | [policy.php](policy.php) |
| Admin endpoint | [api/admin/policies.php](api/admin/policies.php) |
| Admin panel | [src/js/admin/policies.js](src/js/admin/policies.js) |
| Rewrite | `^(shipping|returns|terms|privacy)\.html$` in [.htaccess](.htaccess) |

### It is a template shim, not a renderer — and that is the point

These pages have hand-written `<title>`, meta description, canonical and Open
Graph tags (§15). Making them database-driven wholesale would have meant
re-deriving all of that at render time: a lot of surface, and a lot of ways to
break indexing, for a feature whose actual request was "let me edit the words".

So **only the body is dynamic.** Each page keeps its file, its head and its
chrome, with the editable region marked by

```html
<!-- velorex:policy:start --> … <!-- velorex:policy:end -->
```

`policy.php` reads the same static file the server would otherwise have served,
swaps that region for the stored HTML when a row exists, and prints the result.
The URL never changes. What this buys:

- **The head is byte-identical** — title, canonical, OG tags untouched. Guarded
  by the round-trip check: swapping the body leaves everything before the start
  marker unchanged.
- **The file in git is the seed AND the fallback.** An empty table, a failed
  query or an unreachable database all render the shop's real policy rather
  than a blank page.
- **Reverting is deleting a row** — that is what "Reset to default" does.

**If you edit a policy page's copy in the repo, that change becomes invisible on
any install that has already overridden it.** Check the panel: an overridden
page carries a dot next to its tab and offers Reset.

### Bodies are sanitised on WRITE

Through `blog_sanitize_html()` — the same allowlist parser and the same trust
boundary as the blog. Unknown tags are unwrapped, `script`/`style`/`iframe`/
`form` are destroyed, attributes off the allowlist are dropped (this is what
kills `on*` handlers and `style`), and `href`/`src` are scheme-checked. Because
the stored HTML is already safe, `policy.php` emits it raw — escaping there
would print tags as visible text.

The **sanitised** HTML is echoed back and re-rendered into the editor on save,
so if the allowlist stripped something the person editing sees it immediately
rather than discovering it on the live page.

A page cannot be saved empty. Blanking a policy is what "Reset to default" is
for, and that is explicit.

`terms.html` and `privacy.html` are new, added to the footer and to
`sitemap.php` at priority 0.3.

## 36. Coupons: emailing a reserved code

A coupon reserved for one customer can be emailed to them — a **Email code**
action on the row, and an "email it when I save" toggle in the editor (which
only appears once there is an address to send to).

- **Only a reserved code can be emailed.** A public code has no one customer to
  send it to, and mailing one to an address we happen to hold is the
  unsolicited send that costs a sending domain its reputation (§26).
- It goes through `marketing_contact_token()`, so **an unsubscribe anywhere is
  honoured here**, and the message carries the unsubscribe link and the
  RFC 8058 `List-Unsubscribe` headers like every other non-transactional email.
  A personal gift is still a message the recipient did not ask for.
- The email **states the conditions** — minimum spend, cap, expiry — not just
  the headline. A code that turns out to need a spend the customer did not know
  about is worse than no email.
- The send happens **after** the save succeeds and never as part of it: a failed
  email must not make it look as though the coupon was not created. The failure
  reason is surfaced, because "they unsubscribed" and "SMTP is down" call for
  completely different responses.

Template: `personal_coupon_email()` in
[api/_marketing_templates.php](api/_marketing_templates.php).

## 37. Store address

`store_address` in Settings → Contact. Multiple locations are separated with a
semicolon; each becomes its own line on the printed invoice.

**If you change it, update `contact.html` and the `Store` JSON-LD to match.**
Google suppresses local rankings when the name, address and phone disagree
across a site (§15), and those two are still hand-written. This is called out in
the field's own help text as well, because the failure is silent.

## 38. Event-unlocked coupons

A coupon can require the customer to have **done something** before it works.
Admin → Coupons → **Unlocked by**.

| Trigger | Satisfied when | Verified against |
|---|---|---|
| `none` | Always | — |
| `signup` | They have a registered account. Optional "within N days of joining". | `users` row via the Bearer session |
| `subscribe` | They are on the newsletter list **and actually opted in** | `subscribers.consent_at IS NOT NULL` |
| `first_order` | They have never completed an order | `orders` count for that identity |
| `repeat_order` | They have completed N orders | same |
| `min_items` | The cart holds N units | The item count the **server** re-priced |

### Every trigger is checked server-side, and that is the whole point

A trigger the browser could assert — "trust me, I subscribed" — is not a
trigger, it is a free discount with extra steps. `coupon_trigger_check()` in
[api/_coupon_helpers.php](api/_coupon_helpers.php) is the only place a trigger is
evaluated, it runs inside `coupon_evaluate()`, and `coupon_evaluate()` is what
`create-order.php` calls to decide the real charge (§34).

`min_items` counts the units the **server** derived while re-pricing the cart —
never a count sent alongside the request. Both call sites pass it:
`coupon-validate.php` from the map it built the subtotal from, and
`create-order.php` from the frozen item snapshot.

**Every failure path refuses.** A lookup that throws, a missing `subscribers`
table, an unrecognised trigger value: all return a refusal, never `''`. That
asymmetry is deliberate — the cost of wrongly refusing is a support email, the
cost of wrongly granting is money. Guarded by 20 cases in the trigger test,
including each throw path.

Identity triggers need an identity, so a signed-out visitor is told **"Sign in
to use this coupon"** rather than "invalid" — the code is real, they are just
not yet someone we can check. Same reasoning as the reserved-customer message.

The trigger is checked **before** the usage counters, so someone who has not met
the condition is told what to do rather than told the code is exhausted.

### Rewards are offered, not announced blindly

`/api/unlocked-coupons.php` answers "what does this visitor qualify for right
now?" and the storefront calls it after each unlocking event — signup, sign-in,
newsletter subscribe, and the cart being rendered.

It re-runs `coupon_evaluate()` for each candidate rather than reading the
trigger column and guessing, so **a code it offers is a code checkout will
honour**. It skips coupons with no trigger: those were always available, and
announcing one as a reward for signing up would be a small lie.

`CouponRewards` in [src/js/storefront/coupon.js](src/js/storefront/coupon.js)
announces each code **once per session**. A reward that re-announces itself on
every cart change stops reading as a reward and starts reading as a pop-up.

**The card applies the code and then reports what actually happened.** It says
"Applying…", and becomes either "Applied to your cart" or "Copy the code — it
did not apply automatically". Claiming success up front and being wrong is the
one case where the customer most needs the truth.

### The promo card moved and drifts

Bottom-**left**, not bottom-right: the right corner is where a support widget, a
back-to-top button and the browser's own download bar all land, and the cart
badge already pulls the eye to the top right.

**The entry transition is opacity-only, deliberately.** `couponFloat` animates
`transform` forever; a transform-based entry transition would fight it and the
card would snap as the animation took the property over. Keeping the two on
different properties means they compose. The drift pauses on hover and
focus-within — a moving copy target is worse than a static one — and stops
entirely under `prefers-reduced-motion`, where the card still appears because it
is information, not decoration.

## 39. WhatsApp order alerts

A message to the shop's own phone when an order lands, alongside the admin
email. [api/_whatsapp.php](api/_whatsapp.php), fired from `finalize_payment()`.

**Same discipline as the mailer, for the same reason.** It runs after the
payment is captured and the order committed, so it never throws, never blocks
for long (8s ceiling, tighter than SMTP's 30 — the customer is watching a
spinner), and can never affect whether an order exists. Silently skipped until
`WHATSAPP_PROVIDER` is set, so it was safe to deploy before any account existed.

| Provider | Trade-off |
|---|---|
| `callmebot` | Working in ~5 minutes, free, **sends only to your own number**. No business account, no template approval. Not commercial-grade. |
| `cloud` | Meta's official Cloud API. Free tier, proper deliverability, but needs a Meta Business account and an **approved message template** — a business-initiated message outside a 24-hour window can only be a template. That is a WhatsApp rule, not a limit of this code. |

**Never used to message a customer.** Receipts go by email (§10). A second
customer channel means a second consent story, and WhatsApp's rules on
business-initiated messaging are stricter than email's.

Template variables are ordered `{{1}}` order id, `{{2}}` amount, `{{3}}` item
count, `{{4}}` customer name, `{{5}}` city — and are whitespace-collapsed before
sending, because a newline inside a template parameter makes WhatsApp reject the
entire message. The amount is written `Rs 1,234` rather than with the ₹ glyph;
template parameters are safest as ASCII.

`whatsapp_last_error()` mirrors `mailer_last_error()` (§30) and carries the
provider's own words — an unapproved template, a number not on the test allow
list — because those name the actual fix. Admin-only; it can contain the
configured phone number.

The Dashboard's Store health block reports it, with **null when no provider is
chosen** so "not set up" prints an em dash rather than a red cross. Setup steps
are in [api/secrets.example.php](api/secrets.example.php).

## 40. AdSense — blog pages only

Off until `adsense_client` **and** `adsense_slot` are set in Settings → Ads.
Nothing loads and no request reaches Google before that.
[src/js/storefront/ads.js](src/js/storefront/ads.js).

### Why blog-only is the entire design

An ad on a product page, a category page or the cart is an invitation to leave
for a competitor, priced in fractions of a rupee, at the moment the customer was
about to spend thousands. The blog is different: it exists to pull search
traffic, most of which was never going to buy today.

**The SPA is what makes this non-trivial.** The storefront never reloads, so a
script appended once stays for the session and any slot left in the DOM keeps
rendering. A naive "add the tag on the blog page" would put ads on the checkout.
So:

- the tag is injected on the **first** blog view and never re-injected;
- `initPage()` in [router.js](src/js/storefront/router.js) calls
  `AdSense.teardown()` on **every** navigation that is not a blog page;
- slots are only ever created by `renderBlogPost()`.

Verified: 1 unit on a long post, 0 on a short one, and **0 on cart, products and
home after visiting a post**. If you add a route, that teardown guard is the
line that keeps this true.

### Policy points baked in

- **Nothing renders under 300 words.** A unit on a two-paragraph post is the
  thin content AdSense declines to serve, and it looks like a content farm.
- **Every unit is labelled "Advertisement"** and sits below a rule. An
  unlabelled block inside an article reads as part of the article — the
  placement AdSense prohibits and readers resent.
- **`min-height` is reserved** so filling the slot does not shove the paragraph
  someone is reading.
- The publisher id is regex-checked (`ca-pub-` + digits) before it goes anywhere
  near a `<script src>`, and the slot must be numeric. Anything else is treated
  as unset.
- **`/privacy.html`'s Cookies section must stay accurate while this is on** —
  AdSense requires a visible disclosure of ad cookies, and that page is now
  editable (§35), so it can drift.

### Turning it on: no code to install, but ads.txt is not optional

The ad-serving code is already deployed and inert. Switching ads on is two
values in Settings → Ads. What is NOT covered by that, and would otherwise be
found the hard way:

**Site verification.** AdSense offers three ways to prove you own the site:
paste their snippet into every page's `<head>`, add a meta tag, or add an
**ads.txt** line. Choose **ads.txt**. The snippet option puts ad code on the
whole storefront, which is precisely what this section exists to prevent.

**`/ads.txt` is served by [ads-txt.php](ads-txt.php)**, rewritten in
`.htaccess`, and generated from the publisher id in Settings — one place to
type it, no static file to forget, and it follows the setting if it changes.

Two details that make an otherwise-correct ads.txt fail:

- The line uses **`pub-…`, not `ca-pub-…`**. Stripping the `ca-` prefix is the
  single most common reason a file that looks right is rejected.
- It **404s when no publisher id is set**, rather than serving an empty file.
  An empty ads.txt is *worse* than none: crawlers cache it and read it as "no
  seller is authorised to sell this inventory", which suppresses ads rather
  than merely failing to enable them.

`f08c47fec0942fa0` in that line is Google's own certification-authority id. It
is identical for every AdSense publisher — not a secret, not account-specific.

AdSense also flags "Earnings at risk" on any live site without an ads.txt, so
this is required once ads are running, not just for verification.

Worth knowing before switching it on: AdSense approval needs original content
and a real privacy policy, and a blog with a handful of posts is often declined
on first application.
