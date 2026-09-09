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
  // trail); lower is a longer, softer tail.
  //
  // Frames to close 90% of the gap is log(0.1)/log(1-EASE), so at 60fps:
  //   0.2  -> 10.3 frames -> ~172 ms   (what this was; reads as lag, not trail)
  //   0.4  ->  4.5 frames -> ~75 ms    (still visibly a tail, but keeps up)
  //   0.6  ->  2.5 frames -> ~42 ms    (barely a trail at all)
  // 0.4 is the point where the ring stops feeling like it is dragging behind
  // the pointer while still reading as a deliberate effect rather than a
  // second cursor.
  var EASE = 0.4;

  // Below this many pixels of remaining distance the ring is snapped to the
  // pointer and the animation loop STOPS. Sub-pixel easing is invisible, and
  // a requestAnimationFrame loop that never exits keeps the compositor awake
  // for the entire time the page is open.
  var SETTLE_PX = 0.1;

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

    // Hover-test state. `hoverTarget` is the element the pointer is currently
    // over; `testedTarget` is the one we last ran the CLICKABLE match against.
    // While they are equal there is nothing to do.
    var hoverTarget = null;
    var testedTarget = null;
    var pointing = false;

    function kick() {
      if (frame === null) frame = requestAnimationFrame(render);
    }

    function render() {
      var dx = tx - rx, dy = ty - ry;
      if (Math.abs(dx) < SETTLE_PX && Math.abs(dy) < SETTLE_PX) {
        rx = tx; ry = ty;
      } else {
        rx += dx * EASE;
        ry += dy * EASE;
      }

      // The dot is written every frame alongside the ring rather than inside
      // the mousemove handler: a mouse can fire well above 60 events/sec, and
      // writing a transform per event does layout work the compositor then
      // throws away. One write per frame is both smoother and cheaper.
      dot.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0) translate(-50%,-50%)';
      ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0) translate(-50%,-50%)';

      // Hover test, moved out of the mousemove handler. CLICKABLE is a
      // twenty-selector list and closest() re-tests all of it at each ancestor
      // up to <html>, so running it per mousemove event ran it hundreds of
      // times a second.
      //
      // MEASURED, so nobody re-litigates this from intuition: one call costs
      // ~0.0005 ms on a 13-deep target on /products, i.e. ~0.5 ms per second
      // even at 1000 events/sec. It was NOT what made the cursor feel slow —
      // that was EASE. This is worth keeping anyway (it is free, and the cost
      // scales with page depth, not with anything we control), but do not
      // reach for it first if the cursor feels heavy again. Check EASE.
      //
      // Two guards: at most once per animation frame, and only when the
      // element under the pointer actually CHANGED. Sweeping across one large
      // element does no work at all.
      if (hoverTarget !== testedTarget) {
        testedTarget = hoverTarget;
        var hit = hoverTarget && hoverTarget.closest ? hoverTarget.closest(CLICKABLE) : null;
        // Only touch classList when the answer flips — an unconditional
        // toggle() with a force argument still costs a style invalidation.
        if (!!hit !== pointing) {
          pointing = !!hit;
          root.classList.toggle('is-pointing', pointing);
        }
      }

      // Stop once the ring has caught up and there is no hover test waiting.
      // The next mousemove calls kick() and the loop resumes. An idle pointer
      // costs nothing.
      if (rx !== tx || ry !== ty || hoverTarget !== testedTarget) {
        frame = requestAnimationFrame(render);
      } else {
        frame = null;
      }
    }

    document.addEventListener('mousemove', function (e) {
      tx = e.clientX;
      ty = e.clientY;
      hoverTarget = e.target;
      if (!started) {
        // Drop both elements straight onto the first known pointer position
        // instead of easing in from 0,0 — otherwise the ring flies across the
        // page from the top-left corner on the very first move.
        started = true;
        rx = tx; ry = ty;
        ring.classList.add('vlx-cursor-ready');
        dot.classList.add('vlx-cursor-ready');
      }
      kick();
    }, { passive: true });

    document.addEventListener('mousedown', function () { root.classList.add('is-pressing'); }, { passive: true });
    document.addEventListener('mouseup',   function () { root.classList.remove('is-pressing'); }, { passive: true });

    // Pointer left the document (browser chrome, another window, a dev-tools
    // panel). Hide rather than leave two marks frozen at the last position.
    document.addEventListener('mouseleave', function () {
      ring.classList.add('vlx-cursor-hidden');
      dot.classList.add('vlx-cursor-hidden');
    }, { passive: true });
    document.addEventListener('mouseenter', function () {
      ring.classList.remove('vlx-cursor-hidden');
      dot.classList.remove('vlx-cursor-hidden');
    }, { passive: true });

    // A background tab should not hold a rAF loop open.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (frame) { cancelAnimationFrame(frame); frame = null; }
      } else if (started) {
        kick();
      }
    });

    // The SPA swaps whole pages under the cursor without a pointer move, so
    // the hover state can be left stale on an element that no longer exists.
    // Clear the cached test as well as the class, or the next mousemove over a
    // detached-but-equal target would compare equal and skip the re-test.
    window.addEventListener('popstate', function () {
      pointing = false;
      testedTarget = null;
      hoverTarget = null;
      root.classList.remove('is-pointing');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
