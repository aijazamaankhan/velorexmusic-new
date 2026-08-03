# src/img — brand + social assets

All generated from the master logo. Regenerate any of them with the scripts
described below rather than editing by hand.

| File | Size | Used for |
|---|---|---|
| `logo.svg` | vector | Master logo (vinyl + V mark **and** wordmark). Source of truth. |
| `logo-full.png` | 5437×3369 | Raster master, artwork on white. Input to the generated files below. |
| `logo-1200.png` | 1200×744 | `Organization.logo` / `Store.image` in JSON-LD. |
| `og-default.jpg` | 1200×630 | `og:image` / `twitter:image` — the social share card. |
| `../../favicon.svg` | vector | Browser favicon (mark only, on a white plate). |
| `../../favicon-32.png`, `favicon-16.png` | 32/16 | Favicon fallback for older browsers. |
| `../../apple-touch-icon.png` | 180×180 | iOS home screen — iOS ignores SVG favicons. |

## Why `logo-1200.png` and `og-default.jpg` are different images

They are not interchangeable, and swapping them degrades both:

- **`og:image`** is a promotional card. It is dark, uses the brand red, and
  carries copy ("Vinyl · CDs · Cassettes · Blu-ray", "Shipped across India").
  That copy is what makes a pasted WhatsApp link look like a shop rather than a
  bare URL.
- **`Organization.logo`** must be a clean rendering of the mark on a plain
  background. Google explicitly does not want a promotional banner with
  overlaid text here — that is why it points at `logo-1200.png` instead.

## A note on the wordmark

`logo.svg` sets "Velorex Music" and the tagline as live `<text>` in
**Aktiv Grotesk Bold** and **Poppins Light**. Browsers will not have those
fonts, so if `logo.svg` is ever rendered directly in a page the wordmark
silently falls back to a different typeface and looks wrong.

That is why every derived asset uses the **raster** `logo-full.png` wherever the
wordmark is visible, and the hand-built `favicon.svg` includes only the
vinyl + V mark (which is pure vector paths and safe to render anywhere).

If you need the wordmark as vector for the web, convert the text to outlines in
Illustrator and export a second SVG.

## Regenerating

Both generators use Playwright (already a dev dependency) to lay the asset out
in HTML and screenshot it — PHP on this host has no GD, and there is no image
library in `node_modules`.

The scripts live in the SEO work's scratch history rather than the repo; the
short version is: render `logo-full.png` centred on the required canvas at the
required size, screenshot at that exact viewport, and keep `og-default.jpg`
**under 300 KB** (Facebook's scraper times out on large files — it is currently
~48 KB, so there is plenty of headroom).

## Verifying after deploy

- Facebook / WhatsApp: <https://developers.facebook.com/tools/debug/> — paste
  the URL and click **Scrape Again** to bust their cache.
- X: <https://cards-dev.twitter.com/validator>
- LinkedIn: <https://www.linkedin.com/post-inspector/>
- Rich results (checks `Organization.logo` loads):
  <https://search.google.com/test/rich-results>

## Safe area

WhatsApp crops the 1200×630 card to roughly a square on some clients. Keep
anything essential more than ~150 px from the left and right edges. The current
card's logo plate spans roughly x=270–930, comfortably inside that.
