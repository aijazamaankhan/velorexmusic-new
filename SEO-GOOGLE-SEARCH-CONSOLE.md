# Google Search Console — checklist for velorexmusic.com

A practical checklist for the site owner. Search Console is free, needs no code
on the site, and is the only place Google tells you what it actually indexed,
what it could not, and which searches your pages appeared for.

Work through sections 1–6 once, after deploying. Sections 7–11 are the
recurring routine.

> The admin panel has the same "where to look" table under **Admin → SEO**, next
> to the list of product pages that most need better content.

---

## 1. Verify the domain

1. Go to <https://search.google.com/search-console> and click **Add property**.
2. Choose **Domain** (left box), not "URL prefix", and enter `velorexmusic.com`.
   A Domain property covers `https://`, `http://`, `www.` and any subdomain in
   one place.
3. Google shows a **TXT record**. Copy it exactly — use the value Google gives
   you; nothing in this repository contains or generates it.
4. In Hostinger: **hPanel → Domains → DNS / Nameservers → DNS Zone Editor →
   Add record**. Type `TXT`, Name `@`, Value = the string you copied.
5. Back in Search Console, click **Verify**. DNS can take from a few minutes to
   a few hours; if it fails, wait and retry rather than adding a second record.

**Why:** nothing else in this list works until the property is verified.

## 2. Submit the sitemap

1. **Indexing → Sitemaps**.
2. Enter `sitemap.xml` and click **Submit**.
3. After a few hours the status should read **Success** with a "Discovered
   pages" count close to the number of indexable pages (about 157 at the time of
   writing: home, collections, composer pages, every product, Journal posts,
   Music History articles and the information pages).

**What the sitemap contains:** only canonical, indexable URLs. It is generated
live from the database (`sitemap.php`), so new products and published Journal
posts appear automatically. Empty categories, thin language pages, duplicate
pre-owned pages, cart/account pages and filter URLs are deliberately left out.

**Why:** it tells Google every page you want indexed and when each last changed.

## 3. Inspect the homepage

1. Paste `https://velorexmusic.com/` into the search bar at the top
   (**URL Inspection**).
2. Click **Test live URL**, then **View tested page → Screenshot**. You should
   see the real homepage with products, not a blank shell.
3. Check **Page indexing → Indexing allowed? Yes** and **User-declared
   canonical** = `https://velorexmusic.com/`.
4. Click **Request indexing**.

**Why:** confirms Google can render the site the way customers see it.

## 4. Inspect the main collection pages

Repeat the URL Inspection steps for:

- `https://velorexmusic.com/vinyl-records`
- `https://velorexmusic.com/vinyl-records/hindi`
- `https://velorexmusic.com/pre-owned`
- `https://velorexmusic.com/artists/r-d-burman`
- `https://velorexmusic.com/artists/a-r-rahman`
- `https://velorexmusic.com/products`

Request indexing for each. Expect the canonical to equal the URL you inspected.

## 5. Inspect representative product pages

Pick 4–5: two in stock, one out of stock, one pre-owned, one with a full
description. For each:

1. **Test live URL** → check indexable + canonical.
2. Under **Enhancements**, look for **Product snippets**, **Merchant listings**
   and **Breadcrumbs** as detected.
3. Request indexing.

You do not need to request indexing for every product — the sitemap handles
that. Use this for new or important records.

## 6. Inspect Journal pages

Inspect `https://velorexmusic.com/blog` and 2–3 posts. Check the article is
indexable, the canonical is the post's own URL, and **Breadcrumbs** are detected.
Request indexing for each new post the day it is published.

---

## 7. Monitor Page Indexing (weekly at first, then monthly)

**Indexing → Pages.**

- **Indexed** should grow towards the sitemap count over the first weeks.
- **Why pages aren't indexed** — expected, and correct:
  - *Excluded by 'noindex' tag*: cart, account, login, empty categories
    (Audio CDs, Blu-ray, DVD until stocked), thin language pages, 404s.
  - *Alternate page with proper canonical tag*: filter/sort URLs,
    `/pre-owned/vinyl-records` (points at `/pre-owned`), `/cassettes/hindi`.
  - *Page with redirect*: old slugs, `www.`, trailing slashes, `/index.html`.
- **Worth acting on:**
  - *Crawled – currently not indexed* on product pages → usually thin content.
    Improve those products first (Admin → SEO lists them).
  - *Duplicate without user-selected canonical* → a real duplicate. Check the
    near-duplicate listings flagged in Admin → SEO.
  - *Not found (404)* on URLs that should exist → a broken link somewhere.

## 8. Monitor Core Web Vitals (monthly)

**Experience → Core Web Vitals.** Needs real Chrome traffic before it shows
data, which can take weeks on a small site.

- **LCP** (loading): aim < 2.5 s.
- **INP** (responsiveness): aim < 200 ms.
- **CLS** (visual stability): aim < 0.1.

Fix mobile first — most visitors are on phones. For a single URL, run
<https://pagespeed.web.dev/>. Measured before this release: CLS 0.12–1.3 on
key pages and ~8.6 s first paint on a throttled phone; the September 2026 QA
brought measured CLS under 0.1 on every tested page and removed the 32
render-blocking scripts.

## 9. Monitor Search Performance (weekly, 10 minutes)

**Performance → Search results.** Tick all four: **Clicks, Impressions, CTR,
Average position**. Set the date range to the last 28 days, compare with the
previous period.

| Tab | What to look for |
|---|---|
| **Queries** | What people typed. Filter *doesn't contain* `velorex` for non-branded demand. Sort by Position: queries at **4–20** with impressions are the closest wins. |
| **Pages** | Which pages earn impressions. Low CTR at a good position → rewrite that page's title/description. |
| **Countries** | Should be mostly India (checkout is India-only). |
| **Devices** | Compare mobile vs desktop CTR and position. |
| **Search appearance** | Product snippets, merchant listings — shows whether rich results earn clicks. |

**Export** (top right) Queries and Pages for the last 3 months once a month and
keep the files. The next round of SEO work should start from this real data,
not from assumptions.

## 10. Monitor structured data (monthly, and after any template change)

**Shopping → Product snippets / Merchant listings** and **Enhancements →
Breadcrumbs.**

- **Errors** must be fixed — they block the rich result.
- **Warnings you can expect and ignore** (the shop genuinely has no data for
  them): missing `gtin`/`mpn`, missing `aggregateRating`/`review` (there is no
  review system — none is ever faked), missing `shippingDetails` on products
  that use the address-based zone rate.
- **"Missing field image"** on a product = that product has no photo. Add one.

Test any single page at <https://search.google.com/test/rich-results>.

## 11. Monitor crawl issues (monthly)

**Settings → Crawl stats** (bottom of Settings).

- **Host status** should be green. Red = the server or robots.txt was
  unreachable when Google tried.
- **By response**: a rising share of 5xx means server errors; a rising share of
  404 means links to missing pages.
- **By file type**: HTML and images should dominate. JSON appears too — Google
  fetches `/api/products.php` etc. to render pages; that is intended.

Also check **Security & Manual actions** occasionally — both should read "No
issues detected".

---

## Also worth doing once

- **Google Analytics 4 ↔ Search Console link:** GA4 → Admin → Product links →
  Search Console links. Puts queries next to sessions and revenue.
- **Google Business Profile** for the Gurugram and Meerut stores. Name, address
  and phone must match `contact.html` exactly.
- **Google Merchant Center** (optional, free listings in the Shopping tab):
  link it to Search Console; product data comes from the site's structured data.

## Measurement plan — where each number lives

| Metric | Where |
|---|---|
| Organic sessions, revenue, conversion rate | GA4 → Reports → Acquisition → Traffic acquisition, filter *Session default channel group = Organic Search* |
| Organic landing pages | GA4 → Reports → Engagement → Landing page, same filter |
| Top organic products / collections / Journal | Same report, filter page path by `/product/`, `/vinyl-records`, `/artists/`, `/pre-owned`, `/blog/` |
| Organic ecommerce | GA4 → Monetization → Ecommerce purchases, comparison *Organic Search* |
| Impressions, clicks, CTR, position | Search Console → Performance |
| Branded vs non-branded | Search Console → Performance → Query *contains / doesn't contain* "velorex" |
| Indexed pages | Search Console → Indexing → Pages |
| Rich-result eligibility | Search Console → Shopping / Enhancements |
| Core Web Vitals | Search Console → Experience → Core Web Vitals; PageSpeed Insights per URL |

GA4 (`G-N6H3GG17TM`) is already installed with ecommerce events
(`view_item`, `add_to_cart`, `begin_checkout`, `purchase`). **Do not add a second
analytics or tag-manager script** — it would double-count every session.
