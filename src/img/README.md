# src/img — social share assets

## `og-default.jpg` — REQUIRED, not yet added

This is the fallback image used for `og:image` / `twitter:image` on every page
that has no product cover of its own (home, category pages with no stock, the
static information pages). It is what renders when someone pastes a
velorexmusic.com link into **WhatsApp, Instagram DMs, Facebook or X** — which
is where most of this store's link sharing happens.

It could not be generated in-repo: PHP on this host has no GD extension, so
there is no way to produce a branded raster image from code. It has to be
exported once from a design tool and dropped in here.

### Spec

| Property | Value |
|---|---|
| Filename | `og-default.jpg` (exact — it is referenced by absolute URL) |
| Path | `src/img/og-default.jpg` → `https://velorexmusic.com/src/img/og-default.jpg` |
| Dimensions | **1200 × 630 px** (the 1.91:1 ratio every platform crops to) |
| Format | JPEG, quality ~80 |
| Weight | Under 300 KB — Facebook's scraper times out on large files |

### Content guidance

Keep text large and central. WhatsApp crops to roughly a square on some
clients, so anything within ~150 px of the left/right edge can be cut off.

A safe composition: the Velorex Music wordmark plus a short line such as
"Vinyl · CDs · Cassettes — shipped across India", over a dark background
(`#0d0d0d`) with the gold/orange accent (`#ffb347` → `#ff6b35`) used in
`favicon.svg` and `src/styles/tokens.css`.

### Until it exists

Nothing breaks. Platforms that cannot fetch the image simply render a link
card with no thumbnail, and Google ignores a missing `og:image` entirely — it
is not a ranking factor. It is purely a click-through-rate loss on shared
links, so it is worth doing, just not blocking.

### Verifying after you add it

- Facebook / WhatsApp: <https://developers.facebook.com/tools/debug/> — paste
  the URL and click **Scrape Again** to bust their cache.
- X: <https://cards-dev.twitter.com/validator>
- LinkedIn: <https://www.linkedin.com/post-inspector/>
