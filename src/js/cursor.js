/* =============================================================================
   Velorex Music — custom cursor
   Used by: index.html + the static info pages. NOT the admin panel.

   A red dot pinned to the true pointer position and a hollow red ring that
   trails it and swells over anything clickable.

   Plain non-module script, same convention as the rest of src/js/. Self-
   initialising — nothing else has to call it.

   PROGRESSIVE ENHANCEMENT, and this is the important part: the CSS that hides
   the system cursor is gated behind the `.vlx-cursor-on` class that this file
   adds to <html>. If this script never runs, or bails out below, the native
   cursor is untouched. Never move `cursor: none` out from behind that class.
   ============================================================================= */

(function () {
  'use strict';

  // The ring's easing factor per frame. 1 would pin it to the pointer (no
  // trail); lower is a longer, softer tail. 0.2 lands about 3 frames behind at
  // normal speeds — visible as a trail, never as lag.
  var EASE = 0.2;

  // What counts as "clickable" and therefore swells the ring. Deliberately
  // includes [onclick]: this codebase drives a lot of its UI from inline
  // handlers on plain elements (see the storefront's onclick= convention), and
  // those are clickable to a visitor even though they are not <a> or <button>.
  var CLICKABLE = 'a[href], button, [role="button"], [role="tab"], input[type="submit"],' +
    ' input[type="button"], input[type="checkbox"], input[type="radio"], select, summary,' +
    ' label[for], .btn, .hero-dot, .hero-arrow, .hero-chip, .quick-action-btn,' +
    ' .product-card, .category-card, [onclick], [data-hero-add], [data-hero-prev], [data-hero-next]';

  function init() {
    var root = document.documentElement;

    // Bail on anything without a real mouse, and on reduced-motion. Both cases
    // keep the native cursor: replacing a pointer you cannot see the position
    // of, or animating for someone who asked us not to, are both worse than
    // the default. matchMedia is wrapped because a few embedded browsers throw.
    var fine = false, reduce = false;
    try {
      fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { return; }
    if (!fine || reduce) return;

    var ring = document.createElement('div');
    ring.className = 'vlx-cursor vlx-cursor-ring';
    var dot = document.createElement('div');
    dot.className = 'vlx-cursor vlx-cursor-dot';
    ring.setAttribute('aria-hidden', 'true');
    dot.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ring);
    document.body.appendChild(dot);
    root.classList.add('vlx-cursor-on');

    var tx = 0, ty = 0;     // true pointer position
    var rx = 0, ry = 0;     // ring's eased position
    var started = false;
    var frame = null;

    function render() {
      rx += (tx - rx) * EASE;
      ry += (ty - ry) * EASE;
      // The dot is written every frame alongside the ring rather than inside
      // the mousemove handler: a mouse can fire well above 60 events/sec, and
      // writing a transform per event does layout work the compositor then
      // throws away. One write per frame is both smoother and cheaper.
      dot.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0) translate(-50%,-50%)';
      ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0) translate(-50%,-50%)';
      frame = requestAnimationFrame(render);
    }

    document.addEventListener('mousemove', function (e) {
      tx = e.clientX;
      ty = e.clientY;
      if (!started) {
        // Drop both elements straight onto the first known pointer position
        // instead of easing in from 0,0 — otherwise the ring flies across the
        // page from the top-left corner on the very first move.
        started = true;
        rx = tx; ry = ty;
        ring.classList.add('vlx-cursor-ready');
        dot.classList.add('vlx-cursor-ready');
        frame = requestAnimationFrame(render);
      }
      // closest() walks up from the actual target, so hovering the <i> icon
      // inside a .btn still counts as hovering the button.
      var hit = e.target && e.target.closest ? e.target.closest(CLICKABLE) : null;
      root.classList.toggle('is-pointing', !!hit);
    }, { passive: true });

    document.addEventListener('mousedown', function () { root.classList.add('is-pressing'); }, { passive: true });
    document.addEventListener('mouseup',   function () { root.classList.remove('is-pressing'); }, { passive: true });

    // Pointer left the document (browser chrome, another window, a dev-tools
    // panel). Hide rather than leave two marks frozen at the last position.
    document.addEventListener('mouseleave', function () {
      ring.classList.add('vlx-cursor-hidden');
      dot.classList.add('vlx-cursor-hidden');
    });
    document.addEventListener('mouseenter', function () {
      ring.classList.remove('vlx-cursor-hidden');
      dot.classList.remove('vlx-cursor-hidden');
    });

    // A background tab should not hold a rAF loop open.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (frame) { cancelAnimationFrame(frame); frame = null; }
      } else if (started && !frame) {
        frame = requestAnimationFrame(render);
      }
    });

    // The SPA swaps whole pages under the cursor without a pointer move, so
    // the hover state can be left stale on an element that no longer exists.
    // Clearing it on navigation costs nothing and the next mousemove is
    // authoritative again.
    window.addEventListener('popstate', function () { root.classList.remove('is-pointing'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
