# Record-label logos

Drop-in artwork for the "Discover music from the industry's leading labels"
band on the homepage (`.label-band` in [index.html](../../../index.html),
styled by [label-band.css](../../styles/components/label-band.css)).

## How the band behaves

Each chip renders the label's **name as text** by default. The `<img>` next to
it is `display: none` until its own `onload` fires, at which point the chip gets
`.has-logo` and the artwork replaces the wordmark.

That means:

| State | What the visitor sees |
|---|---|
| No file at the expected path (today) | The themed wordmark. Nothing broken, no console error a customer can see. |
| A file is added | It starts rendering on the next page load. **No code change needed.** |
| The file 404s or fails to decode | `onload` never fires, so the wordmark stands. |

There is deliberately no flash of the wrong state — the wordmark is the default
and the logo only ever replaces something that already looked finished.

## Expected filenames

Exactly these, as SVG (preferred) at the path `src/img/labels/<slug>.svg`:

```
t-series.svg
saregama.svg
sony-music.svg
universal-music-group.svg
tips-music.svg
zee-music.svg
```

To use a PNG instead, change that one chip's `src` in `index.html`. Keep the
artwork under ~2 rem tall when rendered (`max-height: 2rem` in the CSS) — a
wide wordmark is fine, a tall stacked lockup is not.

## Before you add one — these are other companies' trademarks

Naming a label you genuinely stock is ordinary descriptive use. Reproducing
their **logo artwork** is a separate thing, and two rules matter:

1. **Take the file from the label's own press / brand-assets page**, not from a
   search-result thumbnail or a logo-aggregator site. Those are usually
   redrawn, wrong-coloured, or themselves infringing, and a blurry wrong-colour
   logo reads as a fake shop.
2. **Follow whatever their brand guidelines say** about clear space, recolouring
   and minimum size. Most explicitly forbid recolouring the mark — which is why
   the CSS here does not tint or filter the image.

If a label has no public brand-asset page, leave it as a wordmark. The wordmark
version is the safe default and is why it is the fallback rather than a
placeholder box.

Do not let the band imply endorsement, sponsorship or distributorship. The
heading says "Discover music from the industry's leading labels" — a statement
about the catalogue — and it should stay that kind of statement.
