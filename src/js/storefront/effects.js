/* =============================================================================
   Velorex Music — storefront effects. Styles + the rules they follow:
   src/styles/components/effects.css (read its header first).

   DECORATION ONLY. Nothing here changes what a click does: listeners are
   passive or observe-only, no handler is wrapped, and no default is prevented.
   The record drop fires when the cart count GOES UP (read from #cartBadge,
   which CartHelpers.updateBadge() maintains) — never on the click itself — so
   an add refused by the stock guard throws nothing into the cart.

   Bails out entirely under prefers-reduced-motion.
   ============================================================================= */
(function () {
  'use strict';

  var mq = function (q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
  if (mq('(prefers-reduced-motion: reduce)')) return;

  var root = document.documentElement;
  var FINE = mq('(hover: hover) and (pointer: fine)');

  root.classList.add('fx-on');

  /* ---- 1. Vinyl cursor: spin only while the mouse is moving ------------------ */
  if (FINE) {
    var idle = null;
    document.addEventListener('mousemove', function () {
      if (!idle) root.classList.add('fx-cursor-moving');
      clearTimeout(idle);
      idle = setTimeout(function () { root.classList.remove('fx-cursor-moving'); idle = null; }, 180);
    }, { passive: true });
  }

  /* ---- 2. Visualiser --------------------------------------------------------- */
  function eqOf(cover) {
    var eq = cover.querySelector(':scope > .fx-eq');
    if (!eq) {
      eq = document.createElement('span');
      eq.className = 'fx-eq';
      eq.setAttribute('aria-hidden', 'true');
      eq.innerHTML = new Array(13).join('<i></i>');
      if (getComputedStyle(cover).position === 'static') cover.style.position = 'relative';
      cover.appendChild(eq);
    }
    return eq;
  }

  /* ---- 3. Pointer effects -------------------------------------------------------
   * Product CARDS (the grid): the whole card leans toward the pointer, a
   * spotlight + glowing edge follow it in the cover's own colour, and the
   * record slides out from behind the sleeve and spins.
   * The product-page COVER: gentle tilt + gloss + the equaliser. */
  var HOST = '.product-card, .product-detail-main-image';

  function vinylOf(cover) {
    if (!cover.querySelector(':scope > .fx-vinyl')) {
      var v = document.createElement('span');
      v.className = 'fx-vinyl';
      v.setAttribute('aria-hidden', 'true');
      cover.insertBefore(v, cover.firstChild);
    }
  }

  if (FINE) {
    document.addEventListener('pointerover', function (e) {
      var host = e.target.closest && e.target.closest(HOST);
      if (!host || host.contains(e.relatedTarget)) return;
      if (host.classList.contains('product-card')) {
        var cover = host.querySelector('.product-card-image');
        if (cover && !host.closest('.is-list')) vinylOf(cover);
        host.classList.add('fx-card');
        if (cover) glowFor(host, cover);
      } else {
        host.classList.add('fx-tilt');
        eqOf(host).classList.add('is-playing');
      }
    }, { passive: true });

    document.addEventListener('pointerout', function (e) {
      var host = e.target.closest && e.target.closest(HOST);
      if (!host || host.contains(e.relatedTarget)) return;
      host.classList.remove('is-tilting', 'is-hot');
      host.style.setProperty('--fx-rx', '0deg');
      host.style.setProperty('--fx-ry', '0deg');
      var eq = host.querySelector(':scope > .fx-eq');
      if (eq) eq.classList.remove('is-playing');
    }, { passive: true });

    var pending = null, last = null;
    document.addEventListener('pointermove', function (e) {
      var host = e.target.closest && e.target.closest(HOST);
      if (!host) return;
      last = { host: host, x: e.clientX, y: e.clientY };
      if (pending) return;
      pending = requestAnimationFrame(function () {
        pending = null;
        var c = last.host, r = c.getBoundingClientRect();
        var px = (last.x - r.left) / r.width, py = (last.y - r.top) / r.height;
        var isCard = c.classList.contains('product-card');
        var max = isCard ? (c.closest('.is-list') ? 1.5 : 5) : 6;
        c.classList.add('is-tilting', 'is-hot');
        c.style.setProperty('--fx-ry', ((px - 0.5) * 2 * max).toFixed(2) + 'deg');
        c.style.setProperty('--fx-rx', ((0.5 - py) * 2 * max).toFixed(2) + 'deg');
        c.style.setProperty('--fx-gx', (px * 100).toFixed(1) + '%');
        c.style.setProperty('--fx-gy', (py * 100).toFixed(1) + '%');
      });
    }, { passive: true });
  }

  /* ---- 5. Cover glow: the most saturated colour on the cover ------------------ */
  var glowCache = {};
  function glowFor(card, cover) {
    if (card.classList.contains('fx-glow')) return;
    var img = cover.querySelector('img');
    if (!img || !img.complete || !img.naturalWidth) return;
    var key = img.currentSrc || img.src;
    var rgb = glowCache[key];
    if (rgb === undefined) {
      rgb = null;
      try {
        var cv = document.createElement('canvas'); cv.width = cv.height = 10;
        var cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, 10, 10);
        var d = cx.getImageData(0, 0, 10, 10).data, best = -1;
        for (var i = 0; i < d.length; i += 4) {
          var r = d[i], g = d[i + 1], b = d[i + 2];
          var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          var score = (mx - mn) * (mx > 60 ? 1 : 0.3); // saturation, favouring bright pixels
          if (score > best) { best = score; rgb = r + ', ' + g + ', ' + b; }
        }
        if (best < 40) rgb = '255, 107, 53'; // a grey cover glows in brand orange
      } catch (err) { rgb = '255, 107, 53'; } // cross-origin image: canvas is tainted
      glowCache[key] = rgb;
    }
    card.style.setProperty('--fx-glow-rgb', rgb);
    card.classList.add('fx-glow');
  }

  /* ---- 6. Scroll reveals -------------------------------------------------------- */
  var REVEAL = '#page-index .section-header, #page-index .category-card, #page-index .combo-card,' +
    ' #page-index .products-grid > .product-card, .newsletter-card, .about-velorex, .label-band';
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var el = en.target, delay = 0;
      // Stagger siblings that arrive together (a row of cards).
      var sib = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      delay = Math.min(sib % 4, 3) * 70;
      el.style.transitionDelay = delay + 'ms';
      el.classList.add('fx-in');
      io.unobserve(el);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }) : null;

  function scanReveals() {
    if (!io) return;
    var fold = window.innerHeight;
    document.querySelectorAll(REVEAL).forEach(function (el) {
      if (el.dataset.fxSeen) return;
      el.dataset.fxSeen = '1';
      // Only hide what is still below the fold — never blink visible content.
      if (el.getBoundingClientRect().top > fold) { el.classList.add('fx-reveal'); io.observe(el); }
    });
  }

  /* ---- 7. Record drop ------------------------------------------------------------- */
  var ADD_BTN = '.product-card-cart, [data-hero-add], [onclick*="handleAddToCartDetail"], [onclick*="addToCart"], .combo-add-all, [data-combo-add]';
  var lastAdd = null;
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest(ADD_BTN);
    if (btn) lastAdd = { rect: btn.getBoundingClientRect(), t: Date.now() };
  }, { capture: true, passive: true });

  function cartTarget() {
    var cands = ['.app-tab[data-tab="cart"] .app-tab-icon', '.navbar-actions a[href="/cart"]'];
    for (var i = 0; i < cands.length; i++) {
      var el = document.querySelector(cands[i]);
      if (el && el.offsetParent !== null && el.getBoundingClientRect().width) return el;
    }
    return null;
  }

  function drop() {
    if (!lastAdd || Date.now() - lastAdd.t > 2000) return;
    var target = cartTarget(); if (!target || !document.body.animate) return;
    var a = lastAdd.rect, b = target.getBoundingClientRect();
    lastAdd = null;
    var x0 = a.left + a.width / 2, y0 = a.top + a.height / 2;
    var x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    var peak = Math.max(40, Math.min(y0, y1) - 90); // arc up, but stay on screen
    var rec = document.createElement('div');
    rec.className = 'fx-drop';
    document.body.appendChild(rec);
    // Pops out of the button, hangs at the top of the arc, then drops into the
    // cart — ~1.8s so the eye can follow it. Linear timing with explicit
    // offsets gives the hang; the spin slows as it falls.
    var mx = x0 + (x1 - x0) * 0.5;
    rec.animate([
      { transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(0.4) rotate(0deg)', opacity: 0 },
      { transform: 'translate(' + x0 + 'px,' + (y0 - 30) + 'px) scale(1.2) rotate(120deg)', opacity: 1, offset: 0.14 },
      { transform: 'translate(' + (x0 + (mx - x0) * 0.6) + 'px,' + (peak + 20) + 'px) scale(1.1) rotate(360deg)', opacity: 1, offset: 0.38 },
      { transform: 'translate(' + mx + 'px,' + peak + 'px) scale(1.05) rotate(480deg)', opacity: 1, offset: 0.52 },
      { transform: 'translate(' + (mx + (x1 - mx) * 0.6) + 'px,' + (peak + (y1 - peak) * 0.45) + 'px) scale(0.8) rotate(640deg)', opacity: 1, offset: 0.78 },
      { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(0.3) rotate(760deg)', opacity: 0.9 }
    ], { duration: 1800, easing: 'ease-in-out' }).onfinish = function () {
      rec.remove();
      target.classList.remove('fx-cart-catch'); void target.offsetWidth; target.classList.add('fx-cart-catch');
      setTimeout(function () { target.classList.remove('fx-cart-catch'); }, 500);
    };
  }

  var lastCount = null;
  function readCount() {
    var src = document.getElementById('cartBadge');
    if (!src || !src.classList.contains('visible')) return 0;
    return parseInt(src.textContent, 10) || 99;
  }

  /* ---- 8. Removing from the cart -------------------------------------------------
   * removeCartSPA / updateCartQtySPA re-render the cart list synchronously, so
   * the row is gone before anything could animate it. Just BEFORE the click
   * reaches the button (capture phase) the row is copied and measured; once the
   * real removal has re-rendered:
   *   1. the copy flashes red, then flips back in 3D and blurs away;
   *   2. the record slides out of its sleeve (its label is the album cover),
   *      spins and drops off the screen;
   *   3. a small spark burst leaves the bin;
   *   4. the lines that were below glide up into the gap instead of jumping.
   * The removal itself is untouched. */
  function burst(x, y) {
    for (var i = 0; i < 10; i++) {
      var s = document.createElement('i');
      s.className = 'fx-spark';
      document.body.appendChild(s);
      var ang = (Math.PI * 2 * i) / 10 + Math.random() * 0.4, dist = 28 + Math.random() * 26;
      s.animate([
        { transform: 'translate(' + x + 'px,' + y + 'px) scale(1)', opacity: 1 },
        { transform: 'translate(' + (x + Math.cos(ang) * dist) + 'px,' + (y + Math.sin(ang) * dist) + 'px) scale(0.2)', opacity: 0 }
      ], { duration: 520 + Math.random() * 200, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }).onfinish = (function (el) { return function () { el.remove(); }; })(s);
    }
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.cart-item-remove, .cart-qty-btn');
    if (!t) return;
    var row = t.closest('.cart-item'); if (!row) return;
    if (t.classList.contains('cart-qty-btn')) {
      var q = row.querySelector('.cart-qty-num');
      if (!q || t.textContent.trim() !== '−' || q.textContent.trim() !== '1') return; // only a minus that empties the line
    }
    var list = row.parentElement;
    var rows = list ? Array.prototype.slice.call(list.children).filter(function (n) { return n.classList && n.classList.contains('cart-item'); }) : [row];
    var idx = rows.indexOf(row);
    var r = row.getBoundingClientRect();
    var gap = rows[idx + 1] ? rows[idx + 1].getBoundingClientRect().top - r.bottom : 0;
    var tb = t.getBoundingClientRect();
    var cover = row.querySelector('.cart-item-image');
    var cr = cover ? cover.getBoundingClientRect() : { left: r.left + 20, top: r.top + 20, width: 60, height: 60 };
    var coverImg = cover ? cover.querySelector('img') : null;

    var ghost = row.cloneNode(true);
    ghost.classList.add('fx-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;margin:0;z-index:99980;pointer-events:none;transform-origin:50% 100%;';
    ghost.querySelectorAll('[onclick],[id]').forEach(function (n) { n.removeAttribute('onclick'); n.removeAttribute('id'); });
    document.body.appendChild(ghost);

    setTimeout(function () {
      if (!document.body.animate) { ghost.remove(); return; }

      // 1. flash red, then flip back and blur away
      ghost.animate([
        { transform: 'perspective(900px) rotateX(0deg) scale(1)', opacity: 1, filter: 'blur(0px)', boxShadow: '0 0 0 0 rgba(239,68,68,0)' },
        { transform: 'perspective(900px) rotateX(0deg) scale(1.02)', opacity: 1, filter: 'blur(0px)', boxShadow: '0 0 0 2px rgba(239,68,68,0.85), 0 0 40px rgba(239,68,68,0.45)', offset: 0.2 },
        { transform: 'perspective(900px) rotateX(-18deg) scale(0.96)', opacity: 0.9, filter: 'blur(0px)', boxShadow: '0 0 0 1px rgba(239,68,68,0.4)', offset: 0.42 },
        { transform: 'perspective(900px) rotateX(-85deg) translateY(-30px) scale(0.85)', opacity: 0, filter: 'blur(6px)', boxShadow: '0 0 0 0 rgba(239,68,68,0)' }
      ], { duration: 900, easing: 'cubic-bezier(0.55, 0, 0.45, 1)' }).onfinish = function () { ghost.remove(); };

      // 2. the record slides out of the sleeve, spins, then falls
      var rec = document.createElement('div');
      rec.className = 'fx-drop fx-drop-lg';
      rec.innerHTML = '<span class="fx-drop-label"></span>';
      if (coverImg && coverImg.src) rec.style.setProperty('--fx-label', 'url("' + coverImg.src.replace(/"/g, '%22') + '")');
      document.body.appendChild(rec);
      var cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
      rec.animate([
        { transform: 'translate(' + cx + 'px,' + cy + 'px) scale(0.6) rotate(0deg)', opacity: 0 },
        { transform: 'translate(' + (cx + cr.width * 0.55) + 'px,' + cy + 'px) scale(1) rotate(200deg)', opacity: 1, offset: 0.28 },
        { transform: 'translate(' + (cx + cr.width * 0.9) + 'px,' + (cy - 40) + 'px) scale(1) rotate(420deg)', opacity: 1, offset: 0.5 },
        { transform: 'translate(' + (cx + cr.width * 1.4) + 'px,' + (window.innerHeight + 80) + 'px) scale(0.8) rotate(900deg)', opacity: 1 }
      ], { duration: 1500, easing: 'cubic-bezier(0.45, 0, 0.8, 0.6)' }).onfinish = function () { rec.remove(); };

      // 3. sparks from the bin (or the minus button)
      burst(tb.left + tb.width / 2, tb.top + tb.height / 2);

      // 4. the lines that were below glide up into the gap
      var now = document.querySelectorAll('#page-cart .cart-item');
      var lift = r.height + gap;
      for (var k = idx; k < now.length; k++) {
        now[k].animate([{ transform: 'translateY(' + lift + 'px)' }, { transform: 'none' }],
          { duration: 520, delay: 260 + (k - idx) * 50, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' });
      }

      var cart = cartTarget();
      if (cart) { cart.classList.remove('fx-cart-shake'); void cart.offsetWidth; cart.classList.add('fx-cart-shake'); setTimeout(function () { cart.classList.remove('fx-cart-shake'); }, 600); }
    }, 0);
  }, { capture: true, passive: true });

  /* ---- wiring: re-run on every SPA navigation ------------------------------------ */
  // ---- 4. Page transitions: mark the section a navigation just showed.
  var shownSection = null;
  function visibleSection() {
    var s = document.querySelectorAll('.page-section');
    for (var i = 0; i < s.length; i++) if (s[i].offsetParent !== null || getComputedStyle(s[i]).display !== 'none') return s[i];
    return null;
  }

  function onChange() {
    var sec = visibleSection();
    if (sec && sec !== shownSection) {
      if (shownSection) {
        document.querySelectorAll('.fx-enter').forEach(function (x) { x.classList.remove('fx-enter'); });
        void sec.offsetWidth;
        sec.classList.add('fx-enter');
      }
      shownSection = sec;
    }
    var n = readCount();
    if (lastCount !== null && n > lastCount) drop();
    lastCount = n;
    scanReveals();
    // Phones: the visualiser plays once on the product page instead of on hover.
    if (!FINE) {
      var main = document.querySelector('#page-product .product-detail-main-image');
      if (main && !main.dataset.fxEq) {
        main.dataset.fxEq = '1';
        var eq = eqOf(main); eq.classList.add('is-playing', 'is-once');
        setTimeout(function () { eq.classList.remove('is-playing'); }, 3600);
      }
    }
  }

  function init() {
    var mount = document.getElementById('navbar-placeholder');
    lastCount = readCount();
    shownSection = visibleSection();
    scanReveals();
    if (mount) {
      var q = false;
      new MutationObserver(function () {
        if (q) return; q = true;
        requestAnimationFrame(function () { q = false; onChange(); });
      }).observe(mount, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    }
    // Content that renders after the product sync (homepage grids).
    setTimeout(scanReveals, 1500);
    setTimeout(scanReveals, 4000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
