# SEO architecture and change log — velorexmusic.com

**Read this before changing routing, templates, `seo-render.php`, `seo.js`,
`sitemap.php`, `robots.txt` or `.htaccess`.** Each rule below exists because the
opposite was tried or shipped and caused a measurable problem. CLAUDE.md §15,
§43, §44 and §45 carry the detailed reasoning; this file is the map.

## Changes

| Date | Phase | Summary |
|---|---|---|
| 2026-05 | Base | Real URLs + `seo-render.php` server rendering, sitemap, robots, JSON-LD (CLAUDE.md §15) |
| 2026-09 | 1 — Technical SEO | Honest structured data, demo customer data removed, visible breadcrumbs, real 404s, redirects, render access for Google |
| 2026-09 | 2 — Growth architecture | Composer pages, collection link graph, Journal ↔ collection/product relations, cannibalisation rules |
| 2026-09 | 3 — QA + production | Security leak closed, private pages noindexed server-side, Journal SEO fields, product scorecard, deferred scripts, CLS fixes |

---

## 1. Rendering model

The storefront is a single-page app (`index.html` + `src/js/`). Search pages
are **server-rendered first** by `seo-render.php`, then the SPA takes over:

```
request → .htaccess rewrite → seo-render.php
        → loads index.html, strips its SEO block (velorex_strip_shell_seo)
        → injects per-page <title>, description, canonical, robots, OG, JSON-LD
        → fills the page section with real content + visible breadcrumbs
        → browser paints it; deferred scripts boot the SPA over it
```

- `/` is served as static `index.html` (its homepage section is visible by
  default; `velorex_shell()` hides it for every other route).
- `<meta name="velorex-ssr">` tells `Seo.update()` to skip its first rewrite,
  so hydration never overwrites what the server declared.
- Every SEO string built on both sides has **one PHP and one JS
  implementation that must return identical output**, enforced by tests:

| PHP (`src/seo/seo-lib.php`) | JS (`src/js/seo.js`) | Test |
|---|---|---|
| `velorex_slugify()` | `Seo.slugify()` | seo-title-parity.js |
| `velorex_product_title()` | `Seo.productTitle()` | seo-title-parity.js |
| `velorex_product_meta_description()` | `Seo.productDescription()` | seo-meta-parity.js |
| `velorex_category_meta()` | `Seo.categoryMeta()` | seo-meta-parity.js |
| `velorex_facet_status()` | `Seo.facetStatus()` | seo-meta-parity.js |
| `velorex_preowned_meta()` | `Seo.preownedMeta()` | seo-meta-parity.js |
| `velorex_blog_meta_title()` / `_description()` | `Seo.blogMetaTitle()` / `…Description()` | seo-meta-parity.js |
| `velorex_product_image_alt()` | `Seo.productImageAlt()` | — |

Run: `node tests/seo-meta-parity.js`, `node tests/seo-title-parity.js`,
`php tests/seo-head-dedupe.php`, `php tests/music-history.php`.

## 2. Metadata system

- One `<title>`, one description, one canonical per page — the shell's own
  copy is stripped before injection (`velorex:seo-head` markers in index.html).
- Product title: name, then artist (if not already in the name), then format and
  brand only while ≤ 60 characters. Nothing is cut mid-word.
- Product description: built from real fields (name, artist, format, label,
  year, condition, price, stock) then as much of the written description as
  fits, always ≤ 160 characters. Never invents a missing field.
- Category/collection copy: hand-written in `velorex_categories()`; describes
  the stock actually on the shelf. Widen it when the stock widens.
- Journal: optional editor SEO title and description; otherwise headline (+
  " | Velorex Journal" only while ≤ 60 chars) and excerpt.
- Open Graph + Twitter on every page; product pages use the product photo.

## 3. Canonical strategy

| URL shape | Canonical |
|---|---|
| Any page | Self, absolute, `https://velorexmusic.com`, no trailing slash |
| `/product/12-old-slug`, `/product/12` | 301 → current slug |
| `?search=`, `?sort=`, `?people=`, `?utm_*`, `?era=` | The clean path (params ignored) |
| `/vinyl-records/hindi` when it holds every product of its parent | Parent category |
| `/pre-owned/<format>` when that format is all the pre-owned stock | `/pre-owned` |
| 404, cart, account, login, checkout | **No canonical** (never the homepage) |

Redirects (`.htaccess`): `www.` → apex, trailing slash → none, external
`/index.html` → `/`. HTTPS is forced at Hostinger's edge — do not add an
http→https rule here (redirect-loop risk, see the comment in `.htaccess`).

## 4. Indexation strategy

| Indexable | Not indexable (and how) |
|---|---|
| Home, `/products`, stocked categories, stocked language facets that differ from their parent (≥ 6 products), `/pre-owned`, composer pages (≥ 8 records), every product, combos with products, Journal listing + posts, Music History, info pages | Empty categories (`noindex, follow`), thin facets (`noindex`), duplicate facets/pre-owned sub-pages (canonical), cart/checkout/account/login/signup/forgot (`noindex` in server HTML), track-order (`noindex`), 404s (`noindex`, status 404), admin (`noindex, nofollow, noarchive` meta — **not** listed in robots.txt), API JSON (`X-Robots-Tag: noindex`) |

Private pages are **crawlable on purpose** — a `Disallow` would stop Google
reading their `noindex`.

## 5. robots.txt

- Allows everything needed to render: `/src/`, `/uploads/`, CSS/JS/images and
  the 9 read-only API endpoints the SPA fetches.
- Disallows: `/api/` (other endpoints), `/scripts/`, `/node_modules/`,
  `/test-results/`, `/seo-render.php`, `/old%20admin/`, and query permutations
  (`?search=`, `?sort=`, `?people=`, `?recover=`, `?coupon=`).
- Does **not** name the admin page (that would publish its hidden URL).
- `Sitemap: https://velorexmusic.com/sitemap.xml`.

`.htaccess` additionally refuses repo scaffolding (`scripts/`, `node_modules/`,
`*.md`, `*.json`, …) and the dev files `test-admin-login.js`,
`playwright-mcp-server.js`, `ids.txt`, `carrier-preview.html`.

## 6. Sitemap

`/sitemap.xml` → `sitemap.php`, generated live from MySQL. Lists only canonical
indexable URLs, applying the **same** rules as the pages (facet status,
pre-owned duplication, composer threshold, published posts only). `lastmod` is
written only from real `updated_at` values; product entries carry
`<image:image>` for real photos only.

## 7. Structured data (JSON-LD)

| Type | Where | Rules |
|---|---|---|
| Organization, WebSite | Every page | Real name, logo, phone, social profiles |
| Store ×2 | Category pages, contact | Gurugram and Meerut branches |
| Product + Offer | Product pages | `brand` = record label (omitted if none); `image` only real photos (omitted if none); `OutOfStock` when stock is 0; `itemCondition` from the product; **no aggregateRating/review** (no review system exists); no invented `priceValidUntil`; `shippingDetails` only when the rate is known |
| BreadcrumbList | All routes | Same trail as the visible breadcrumb bar |
| ItemList | Listings, combos, composer pages | Products actually shown |
| BlogPosting | Journal posts | Author = Person when a real name is set, else the Organization; `dateModified` = real `updated_at` |
| Article | Music History | No dates invented |
| FAQPage | faq.html | Must match visible answers verbatim |

## 8. Collection architecture

- Formats: `/vinyl-records`, `/audio-cds`, `/cassettes`, `/blu-ray-movies`, `/dvd-movies`
- Language facets: `/<format>/hindi|english`
- Departments: `/merchandise`, `/vinyl-care` (+ subcategories)
- `/pre-owned` (+ `/<format>`), `/products`, `/combos`, `/combos/<slug>`
- Composer pages: `/artists/<slug>` — **curated** in
  `velorex_artist_collections()`, never one per artist; indexable only at ≥ 8
  records; written context contains only verifiable facts.

Do **not** add `/collections/*`, `/bollywood-vinyl-records`,
`/buy-vinyl-records-india` or similar — they duplicate existing pages.

## 9. Product SEO

- One `<h1>` = product name (the banner above it is a `<p>`).
- Server-rendered facts table: artist, format, music director, language,
  condition, pressing, label, year, genre, tracks, runtime — only fields that
  exist.
- Track listing server-rendered (with Side A/B markers).
- Visible availability matches the schema: In stock / Out of stock / Coming soon.
- Alt text: "Name by Artist – Format"; placeholder images get `alt=""`.
- **Admin → SEO** ranks product pages by what to fix first; the product form
  has description guidance. Nothing is auto-written.

## 10. Journal architecture

Fields: title (H1), slug, SEO title, search description, author (real person or
blank), published date (set once), updated date (only shown when the text was
revised > 1 day later; re-tagging does not move it), cover image, body
(sanitised server-side on write), related collections, related products.
Rendered with breadcrumbs, BlogPosting schema, "Records in this article" cards,
related collections and more posts.

## 11. Internal linking

One graph in `api/_collections_helpers.php`, used by both the server render and
`/api/collections.php` for the SPA:

- listings → related live collections, Music History background, Journal posts
- products → composer page, language + format collection, reading, "You may
  also like" (same composer first)
- Journal ↔ collections/products via the editor's tags
- every link points at a live, indexable page; anchor text varies by context
- a no-JS fallback footer nav in index.html carries the sitewide links

## 12. Performance rules

- Every storefront `<script src>` in `index.html` is `defer`. Do not add a
  blocking one.
- Razorpay Checkout is deferred (only used on Pay).
- The homepage section is visible in the static HTML; the hero reserves the
  product slides' height on mobile; category banners keep the server's stats
  and intro; product pages keep the server render until the full record
  arrives. Each of these was a measured layout shift.
- Asset URLs carry content-hash `?v=` from `npm run prep-deploy`; never
  hand-edit them. `.gitattributes` (LF) keeps those hashes stable.

## 13. Things that must never come back

- HTML-escaping on the way into the database (CLAUDE.md §22)
- Sample/demo personal data in `index.html`
- Rating or review markup without a real review system
- `PreOrder` availability for items the cart refuses
- A canonical pointing an unrelated page at the homepage
- The admin URL in robots.txt
- Blocking `/api/` read endpoints in robots.txt
- Pages generated per keyword or per artist without real stock and real copy
