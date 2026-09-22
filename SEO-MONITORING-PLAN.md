# SEO monitoring plan and experiments — velorexmusic.com

How to read Google Search Console (GSC) and Google Analytics 4 (GA4) every week
and month, what each number means for the next piece of work, and how to test
changes one at a time. Setup steps are in SEO-GOOGLE-SEARCH-CONSOLE.md; the
same "where to look" table is in **Admin → SEO**.

No rankings are promised. The job of this plan is to make each change
measurable, so effort goes where results show up.

## Weekly (15 minutes, same day each week)

| Check | Where | Look for | What to do |
|---|---|---|---|
| Indexing problems | GSC → Indexing → Pages | A jump in "not indexed"; new reasons appearing | Open the reason, inspect 2–3 example URLs. "Crawled – not indexed" on products = thin content → PRODUCT-CONTENT-PRIORITY.md |
| Server/technical errors | GSC → Pages (Server error 5xx, Not found 404); Settings → Crawl stats | Any 5xx; 404s on URLs that should exist | 5xx → check hosting/logs today. 404 on a real page → find the broken link |
| Sudden traffic change | GSC → Performance, last 7 days vs previous 7 | Clicks down more than ~30% | Check it is not a holiday/seasonal dip; check Pages for which URL dropped; check for a deploy that week |
| Important queries | GSC → Performance → Queries, filter your watch list (e.g. "r d burman vinyl", "bollywood vinyl records", "buy vinyl records india") | Position or clicks moving sharply | Note it in the experiment log if a change was made |
| Manual actions / security | GSC → Security & Manual actions | Anything other than "No issues" | Stop other work; follow Google's instructions |

## Monthly (60 minutes, first week of the month)

Set the date range to the last 28 days and compare with the previous period;
for trends, use 3 months vs the previous 3.

| Metric | Where | How it should steer work |
|---|---|---|
| **Impressions** | GSC → Performance | Rising = Google shows the site for more searches. Falling across the site = check indexing first |
| **Clicks** | GSC → Performance | The outcome that matters. Compare with impressions to see whether visibility turns into visits |
| **CTR** | GSC → Performance → Pages | A page with good position but low CTR needs a better title/description — the cheapest improvement available |
| **Average position** | GSC → Performance | Watch per query/page, not the site average (which moves when new queries appear) |
| **Top pages** | GSC → Pages tab | Protect them: do not change titles or URLs of pages that already earn clicks without a reason |
| **Top queries** | GSC → Queries tab | Split branded ("velorex") vs non-branded. Non-branded growth is the real measure of SEO |
| **Pages at positions 4–20** | GSC → Queries → sort by position | The closest wins. For each: improve the page that ranks (content, internal links from related pages, title) — do not create a new page for the same query |
| **New queries** | GSC → Queries, compare periods, sort by impressions | New demand signals: a composer, film or format people search for. If the shelf supports it, it may earn an article |
| **Organic revenue** | GA4 → Acquisition → Traffic acquisition → Organic Search → Total revenue | Whether SEO pays. Tie changes to revenue, not just traffic |
| **Organic conversion rate** | Same report → Key events / purchases ÷ sessions | Traffic up but conversion down = visitors landing on the wrong pages; check landing pages |
| **Organic landing pages** | GA4 → Engagement → Landing page, Organic Search | Which pages start sessions that buy. Strengthen internal links from articles to these |
| **Indexed pages** | GSC → Indexing → Pages | Should track the sitemap count (~161 today). A widening gap = content or duplication problem |
| **Rich results** | GSC → Shopping / Enhancements | Errors = fix now. Warnings for missing reviews/GTIN are expected |
| **Core Web Vitals** | GSC → Experience | Once data appears: any "Poor" URL group on mobile gets fixed before new content |

### How the numbers turn into next steps

- **High impressions, low CTR** → rewrite that page's title/meta description
  (experiment type A).
- **Positions 4–20** → improve the ranking page's content and internal links
  (types C, D).
- **Impressions for a product that has no description** → write it (type E).
- **Queries about a topic with no page, which the shelf supports** → a Journal
  article (type D) — never a thin landing page.
- **Traffic without sales** → check the landing pages are commercial and link
  to products.

---

## SEO experiments

Change **one variable on one page (or one small group of similar pages)** at a
time, wait, compare like with like. Changing titles, content and links on the
same page in the same week makes the result unreadable.

### Rules

1. Record the **before** numbers (GSC → Performance, filtered to the page, last
   28 days: impressions, clicks, CTR, average position; GA4 organic sessions
   and revenue for the page if any).
2. Make the change. Note the date.
3. Request indexing for the page in GSC (URL Inspection).
4. Wait **at least 28 days** (longer for pages with few impressions).
5. Record the **after** numbers for the same length of period.
6. Account for seasonality (Diwali, sales) by also noting the change in the
   site's overall clicks for the same periods.
7. Keep what works; revert what clearly hurt; note inconclusive results as
   inconclusive — small pages rarely give clear answers.

### Experiment types

| Type | Change | Good candidates | Primary metric |
|---|---|---|---|
| A — Title | Rewrite the `<title>` / SEO title | Pages ranking 1–10 with low CTR | CTR |
| B — Meta description | Rewrite the description | Same as A | CTR |
| C — Internal links | Add contextual links to a page from 2–3 related pages | Pages at positions 4–20 | Average position, impressions |
| D — Content expansion | Add useful sections to an article/collection intro | Articles at positions 4–20 | Impressions, position |
| E — Product description | Write a real description (PRODUCT-CONTENT-PRIORITY.md) | Products with impressions and no description | Impressions, CTR, organic revenue |
| F — Collection intro | Revise a collection's intro copy (`velorex_categories()`) | Collection pages at positions 4–20 | Position, clicks |

Title and description changes for collection pages live in code
(`src/seo/seo-lib.php` + the mirrored `src/js/seo.js`, with
`node tests/seo-meta-parity.js`); Journal SEO fields and product descriptions
are edited in the admin.

### Log

Copy this table into a spreadsheet or keep it here.

| # | Page | Type | Before (28 days) | Change | Date | After (28 days) | Result / decision |
|---|---|---|---|---|---|---|---|
| 1 | e.g. `/blog/vinyl-records-vs-cds…` | A | imp …, clicks …, CTR …%, pos … | SEO title shortened from 79 to 55 characters | YYYY-MM-DD | … | keep / revert / inconclusive |
| 2 | | | | | | | |
| 3 | | | | | | | |

### First experiments to run (once there are ~4 weeks of GSC data)

1. **Type E** on the 5 products from PRODUCT-CONTENT-PRIORITY.md that show the
   most impressions.
2. **Type A** on the "Vinyl Records vs CDs" post (its headline is 79 characters;
   give it an SEO title under 60).
3. **Type C**: tag the 4 older Journal posts so collection and product pages link
   to them; compare their impressions.
4. **Type F** on whichever collection page sits at positions 4–20 for its main
   query.
