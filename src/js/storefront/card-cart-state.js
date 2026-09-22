/* =============================================================================
   Product-card cart state: "Add to Cart" → "✓ Added!" → "In Cart".

   A product card's button says what is true: once that record is in the cart
   it reads "In Cart", and tapping it opens the cart instead of silently adding
   another copy (quantity is changed in the cart, where it is visible).

   Read-only against the cart: state comes from Storage.getCart(), and the
   "just added" flash fires only when #cartBadge's count goes UP — never on the
   click itself — so an add the stock guard refused never shows "Added!".
   The add itself is still CartHelpers.addToCart(), untouched.
   ============================================================================= */
(function () {
  'use strict';

  var BTN = '.product-card-cart';
  var ADDED_MS = 1400;
  var lastClick = null;   // { btn, t } — the Add button tapped most recently
  var flashing = new WeakSet();

  function idOf(btn) {
    var m = (btn.getAttribute('onclick') || '').match(/addToCart\((\d+)/);
    return m ? Number(m[1]) : null;
  }

  function cartIds() {
    try {
      var ids = new Set();
      (Storage.getCart() || []).forEach(function (i) { if (i && i.qty > 0) ids.add(Number(i.id)); });
      return ids;
    } catch (e) { return new Set(); }
  }

  function setLabel(btn, html) { if (btn.innerHTML !== html) btn.innerHTML = html; }

  var IN_CART = '<i class="fas fa-check"></i> In Cart';

  function sync() {
    var ids = cartIds();
    document.querySelectorAll(BTN).forEach(function (btn) {
      if (btn.disabled || flashing.has(btn)) return;
      var id = idOf(btn); if (id === null) return;
      if (!btn.dataset.addLabel) btn.dataset.addLabel = btn.innerHTML;
      var inCart = ids.has(id);
      if (inCart !== btn.classList.contains('is-in-cart')) {
        btn.classList.toggle('is-in-cart', inCart);
        btn.setAttribute('aria-label', inCart ? 'In cart — open the cart' : 'Add to cart');
      }
      setLabel(btn, inCart ? IN_CART : btn.dataset.addLabel);
    });
  }

  // "In Cart" opens the cart. Capture phase so it runs before the button's
  // inline onclick (which would add another copy).
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest(BTN);
    if (!btn) return;
    if (btn.classList.contains('is-in-cart') && !flashing.has(btn)) {
      e.preventDefault(); e.stopPropagation();
      if (typeof navigate === 'function') navigate('cart');
      return;
    }
    lastClick = { btn: btn, t: Date.now() };
  }, true);

  function readCount() {
    var b = document.getElementById('cartBadge');
    return b && b.classList.contains('visible') ? (parseInt(b.textContent, 10) || 99) : 0;
  }

  var lastCount = null;
  function onCartMaybeChanged() {
    var n = readCount();
    if (lastCount !== null && n > lastCount && lastClick && Date.now() - lastClick.t < 2000) {
      var btn = lastClick.btn; lastClick = null;
      if (!btn.dataset.addLabel) btn.dataset.addLabel = btn.innerHTML;
      flashing.add(btn);
      btn.classList.add('is-just-added');
      setLabel(btn, '<i class="fas fa-check"></i> Added!');
      setTimeout(function () { flashing.delete(btn); btn.classList.remove('is-just-added'); sync(); }, ADDED_MS);
    }
    lastCount = n;
    sync();
  }

  function init() {
    lastCount = readCount();
    sync();
    // Cart changes rewrite #cartBadge inside the navbar mount.
    var mount = document.getElementById('navbar-placeholder');
    if (mount) new MutationObserver(function () { requestAnimationFrame(onCartMaybeChanged); })
      .observe(mount, { childList: true, subtree: true, characterData: true });
    // Grids re-render on filter/sort/navigation: re-apply the state. sync()
    // only writes when a label differs, so it cannot feed itself a loop.
    var q = false;
    new MutationObserver(function () {
      if (q) return; q = true;
      requestAnimationFrame(function () { q = false; sync(); });
    }).observe(document.body, { childList: true, subtree: true });
    // Another tab changed the cart.
    window.addEventListener('storage', function () { sync(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
