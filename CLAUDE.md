# Velorex Music — Project Guide

A reference for anyone (humans or AI assistants) working on this codebase. Read this first.

## 1. What this is

**Velorex Music** (velorexmusic.com) is an e-commerce music store that sells vinyl records, CDs, cassettes, Blu-rays, and DVDs. It has:

- A **customer storefront** — `index.html` (single-page-app with hash routing)
- An **admin panel** — `admin.html` (inventory + customer management)
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

No package bundler. No transpilation. What you see in `index.html`/`admin.html` is what runs in the browser. Edit, save, refresh.

## 3. Repository layout

```
velorexmusic-new/
├── CLAUDE.md                    # ← this file
├── index.html                   # Customer storefront (SPA). ~2.3k lines.
├── admin.html                   # Admin panel. ~3.1k lines.
├── contact.html, faq.html,      # Static info pages.
│   shipping.html, returns.html,
│   track-order.html, maintenance.html
├── api/
│   ├── .htaccess                # Deny direct access to config*.php, disable LiteSpeed cache
│   ├── config.php               # GITIGNORED. Real DB creds + ADMIN_PASS + shared helpers
│   ├── config.example.php       # Template (tracked in git). Copy to config.php on server.
│   ├── products.php             # GET (list) / POST (bulk replace, admin-only) / DELETE
│   ├── categories.php           # GET / POST (admin-only, replaces full list)
│   ├── orders.php               # GET (admin: all, user: own) / POST (user-only)
│   ├── auth/
│   │   ├── signup.php           # POST { email, password, firstName, lastName }
│   │   ├── login.php            # POST { email, password } → { token, user }
│   │   ├── logout.php           # POST (Bearer token) — deletes the session row
│   │   ├── me.php               # GET (Bearer) → { user (incl. stats) }
│   │   ├── update-profile.php   # POST (Bearer)
│   │   └── change-password.php  # POST (Bearer)
│   └── admin/
│       └── users.php            # GET (list) / POST (reset-password / delete-user)
├── package.json                 # Just Playwright + MCP — no app dependencies
├── playwright-mcp-server.js     # MCP server (used optionally for admin-panel browser tests)
├── test-admin-login.js          # Sanity test for admin login
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
│  index.html (SPA)      │         │  admin.html (SPA)      │
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
| Admin | `X-Admin-Pass: <ADMIN_PASS>` | admin.html → admin-only endpoints | Single value in `api/config.php` (constant `ADMIN_PASS`) |
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
  user_id INT NOT NULL,
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
| GET | `/api/products.php` | — | `Product[]` |
| GET | `/api/categories.php` | — | `string[]` (sorted by `sort_order`) |
| POST | `/api/auth/signup.php` | `{ email, password, firstName, lastName? }` | `{ ok, token, user }` |
| POST | `/api/auth/login.php` | `{ email, password }` | `{ ok, token, user }` |
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
| POST | `/api/payments/create-order.php` | `{ items: [{id, qty}], addressId }` | `{ ok, keyId, razorpayOrderId, amount, currency, mode, subtotal, shipping, total }` — server recomputes the total from DB prices and mints a Razorpay order bound to that amount |
| POST | `/api/payments/verify.php` | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` | `{ ok, orderId, alreadyFinalized }` — verifies HMAC, decrements stock, creates the internal `orders` row. Idempotent. |
| GET | `/api/addresses.php` | — | `Address[]` (caller's saved addresses, default first) |
| POST | `/api/addresses.php` | `{ id?, fullName, phone, line1, line2?, landmark?, city, state?, postalCode?, countryCode, label?, gstin?, isDefault? }` | `{ ok, address }` — `id` present = update, absent = create. Max 10 per user. |
| DELETE | `/api/addresses.php?id=N` | — | `{ ok }` — hard delete; promotes the next address to default if needed |

### Admin-authenticated endpoints (require `X-Admin-Pass: <ADMIN_PASS>`)

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/products.php` | `{ products: Product[] }` (full list) | `{ ok, count }` — transactional replace |
| POST | `/api/products-bulk-upsert.php` | `{ products: Product[] }` (partial list) | `{ ok, inserted, updated, errors[], products[] }` — **additive** upsert; does NOT wipe untouched rows. Rows without an `id` get auto-assigned `MAX(id)+1`. Used by the admin Bulk Upload CSV flow. |
| DELETE | `/api/products.php?id=N` | — | `{ ok }` |
| POST | `/api/categories.php` | `{ categories: string[] }` (full list) | `{ ok, count }` — transactional replace |
| GET | `/api/orders.php` | — | `Order[]` (all orders, joined with user info) |
| GET | `/api/admin/users.php` | — | `User[]` (with order count + total spent) |
| POST | `/api/admin/users.php` | `{ action: "reset-password", userId, newPassword }` | `{ ok }` (also logs the user out of all sessions) |
| POST | `/api/admin/users.php` | `{ action: "delete-user", userId }` | `{ ok }` (cascades to user_sessions; orders.user_id set NULL) |

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

### Admin Storage helper (admin.html)

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
- Admin: `http://localhost:5500/admin.html` (login `owner` / `owner123`)
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
define('ADMIN_PASS', 'owner123');     // Used both as admin API token AND admin.html login password
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
- <http://localhost:5500/admin.html> → admin panel (login: `owner` / `owner123`)
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
git add .
git commit -m "your message"
git push origin master
```

Then on Hostinger:
- hPanel → **Advanced** → **Git** → click **Deploy** (or **Pull**) on the registered repo

If you set up the auto-deploy webhook in the repo's Settings → Webhooks, pushes to master deploy automatically with no manual click.

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

### Admin auth = admin password = API token

There's a single `ADMIN_PASS` constant in `config.php`. The admin panel (admin.html) prompts for it at login and stores it in `sessionStorage` as `admin_pass`. Every admin-only write replays it as `X-Admin-Pass: <password>`. Same value protects both the UI login and the API endpoints. If you change `ADMIN_PASS`, admin.html still uses the old check (`if (user.toLowerCase() === 'owner' && pass === 'owner123')`) — keep them in sync.

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

### "I deleted everything and it came back"

If you delete all products in admin and they reappear, check:

1. Server cache (see LiteSpeed section above)
2. Multiple admin tabs open with stale localStorage — close them all, log in fresh
3. Customer browsers still have old data in localStorage — this self-heals on their next visit (sync overwrites)

The previous root cause (admin auto-migrating localStorage back to server on login) was fixed in [commit 29807a6](https://github.com/aijazamaankhan/velorexmusic-new/commit/29807a6). If you see this bug again, check `Storage.syncFromServer()` in admin.html — it should never POST stale localStorage to the server.

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
3. Update `admin.html` form to capture the new field
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
- Frontend: `openBulkUploadModal()` / `parseCsv()` / `bulkValidate()` / `confirmBulkImport()` in [admin.html](admin.html), plus `Storage.bulkUpsertProducts()` which merges the server-returned canonical rows back into the local cache.

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
npm run test:admin     # Launches Chromium, logs into admin.html
```

See `PLAYWRIGHT_MCP_README.md` for the optional MCP server setup if you want browser automation tools available in your IDE.

## 12. Known limitations & TODOs

| Area | Status | Notes |
|---|---|---|
| Forgot password (email-based) | Deferred | Currently shows a "contact support" page; admin manually resets via the Customers panel. Implementing email reset requires SMTP creds on Hostinger and PHPMailer. |
| Email verification on signup | Skipped | Users can log in immediately after signup. Same SMTP dependency as above. |
| Address book CRUD | ✅ Shipped | India + international, multi-address per user, default flag, per-country state/postal rules. UI: profile tab + checkout picker. API: `api/addresses.php`. Orders snapshot `shippingAddress` into `orders.order_data` at place-order time. |
| Wishlist persistence | Stub | The Wishlist tab in profile shows the first 3 products as filler. Would need a `wishlist` table or per-user JSON. |
| Order status updates | Local-only | Admin can change an order's status in the UI but it only updates localStorage on the admin's browser. Needs a PATCH endpoint on `orders.php`. |
| Razorpay integration | ✅ Shipped | Server-side order creation + HMAC signature verification + webhook backstop. Both test and live keys live in the secrets file, switched via `RAZORPAY_MODE`. See [§10 Razorpay payment flow](#razorpay-payment-flow). |
| Frontend test coverage | Minimal | Only `test-admin-login.js` exists. Worth expanding when there's time. |

## 13. Conventions for AI assistants editing this repo

- **No build step.** Edit `index.html` / `admin.html` directly. Don't introduce bundlers, frameworks, or transpilers unless explicitly asked.
- **No new dependencies in package.json** unless explicitly asked. The app code uses zero npm packages.
- **Don't commit `api/config.php`.** It's gitignored. Verify with `git status` before pushing.
- **Match the existing pattern.** The codebase is plain JS with `function foo()` and `const Helper = { ... }` objects. Don't refactor unrelated code into modules/classes.
- **Match the existing styling.** UI styling uses CSS variables (`var(--accent)`, `var(--text-muted)`, etc.) defined at the top of each HTML file. Reuse those instead of hardcoding colors.
- **Be careful with `innerHTML`.** Always escape user-controlled strings with `Utils.escape()` (defined in index.html) or the `escapeHTML()` helper in admin.html. SQL is safe everywhere because every query is prepared.
- **Server is source of truth.** When in doubt, fetch from the API. localStorage is only a render cache.
- **Bulk-replace semantics for products/categories.** Don't try to add per-item PATCH endpoints — the existing pattern is "send the whole list, server replaces atomically." Match that for new collection-type entities.
- **Update this doc.** If you change the schema, add an endpoint, or change a major convention, update the relevant section in `CLAUDE.md` in the same commit.
