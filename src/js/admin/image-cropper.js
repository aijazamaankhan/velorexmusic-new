// =============================================================================
// Admin — image cropper
// =============================================================================
// Sits between "admin picked a file" and "the bytes go to
// /api/upload-product-image.php". Both product modals (Add and Edit) route
// their selected files through ImageCropper.run() in inventory.js, so a
// crop happens BEFORE the upload — nothing is written to disk until the admin
// has framed the shot.
//
// Why crop client-side rather than server-side:
//   - Uploaded files are content-addressed (hash of the bytes → filename). A
//     server-side crop would mean the original is written first and the crop
//     second, leaving an orphaned full-size file on disk with no reference to
//     it and nothing that ever cleans it up.
//   - The admin sees exactly what will be stored, and the upload is smaller.
//
// STATE MODEL — the one thing to understand before editing this file:
// the crop rectangle is stored in NATURAL IMAGE PIXELS (`crop`), never in
// screen pixels. Display coordinates are derived from it on every render via
// the letterbox transform in `layout()`. That is what makes a window resize,
// a device-rotation, or the modal opening at a different size harmless — the
// truth never lived in screen space to begin with. Pointer deltas are divided
// by the scale on the way in.
//
// GIF note: the upload endpoint accepts jpeg/png/webp only, so a GIF (which
// the file picker still offers) is re-encoded to JPEG here. That is a fix, not
// a regression — before the cropper, a GIF was uploaded as-is and rejected by
// the server with a generic failure toast.

var ImageCropper = (function () {
  'use strict';

  var MIN_NATURAL = 24;                      // smallest crop, in source pixels
  var MAX_BYTES = 5 * 1024 * 1024;           // must match the server + processImageFile
  var ENCODABLE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

  // --- live state, valid only while the modal is open -----------------------
  var els = null;          // cached DOM refs
  var wired = false;       // listeners attached once, not per open()
  var settle = null;       // resolve fn of the in-flight open() promise
  var natural = { w: 0, h: 0 };
  var crop = { x: 0, y: 0, w: 0, h: 0 };     // NATURAL pixels — see header
  var ratio = 1;                              // w/h; 0 = free
  var sourceFile = null;
  var drag = null;                            // { handle|'move', startX, startY, crop }

  function el(id) { return document.getElementById(id); }

  function cache() {
    if (els) return els;
    var modal = el('image-cropper-modal');
    if (!modal) return null;
    els = {
      modal: modal,
      stage: el('cropper-stage'),
      img: el('cropper-image'),
      shade: el('cropper-shade'),
      box: el('cropper-box'),
      ratios: el('cropper-ratios'),
      readout: el('cropper-readout'),
      filename: el('cropper-filename'),
      apply: el('cropper-apply'),
      original: el('cropper-original'),
      skip: el('cropper-skip'),
      close: el('cropper-close'),
    };
    return els;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // The letterbox transform. #cropper-image is object-fit:contain inside the
  // stage, so the drawn image is centred with bars on one axis. Everything
  // that converts between screen and source pixels goes through this.
  function layout() {
    var r = els.stage.getBoundingClientRect();
    var scale = Math.min(r.width / natural.w, r.height / natural.h);
    return {
      scale: scale,
      offX: (r.width - natural.w * scale) / 2,
      offY: (r.height - natural.h * scale) / 2,
      stage: r,
    };
  }

  function render() {
    var L = layout();
    var left = L.offX + crop.x * L.scale;
    var top = L.offY + crop.y * L.scale;
    var w = crop.w * L.scale;
    var h = crop.h * L.scale;

    els.box.style.left = left + 'px';
    els.box.style.top = top + 'px';
    els.box.style.width = w + 'px';
    els.box.style.height = h + 'px';

    // The shade is a single element whose enormous outer shadow darkens
    // everything around it, so it must track the box exactly.
    els.shade.style.left = left + 'px';
    els.shade.style.top = top + 'px';
    els.shade.style.width = w + 'px';
    els.shade.style.height = h + 'px';

    els.readout.textContent =
      Math.round(crop.w) + ' × ' + Math.round(crop.h) + ' px'
      + '  (source ' + natural.w + ' × ' + natural.h + ')';
  }

  // Largest rect of the current ratio that fits the image, centred, at 90%.
  function resetCrop() {
    var w, h;
    if (ratio > 0) {
      w = Math.min(natural.w, natural.h * ratio);
      h = w / ratio;
    } else {
      w = natural.w;
      h = natural.h;
    }
    w *= 0.9; h *= 0.9;
    crop = { x: (natural.w - w) / 2, y: (natural.h - h) / 2, w: w, h: h };
  }

  // Re-fit the existing crop to a newly chosen ratio, keeping its centre so the
  // admin doesn't lose their framing when switching 1:1 → 4:3.
  function applyRatio(next) {
    ratio = next;
    els.stage.classList.toggle('ratio-locked', ratio > 0);
    if (ratio > 0) {
      var cx = crop.x + crop.w / 2;
      var cy = crop.y + crop.h / 2;
      var w = Math.min(crop.w, crop.h * ratio);
      var h = w / ratio;
      // Shrink further if the centred rect would hang off an edge.
      var fit = Math.min(1, natural.w / w, natural.h / h);
      w *= fit; h *= fit;
      crop.w = w; crop.h = h;
      crop.x = clamp(cx - w / 2, 0, natural.w - w);
      crop.y = clamp(cy - h / 2, 0, natural.h - h);
    }
    render();
  }

  // --- pointer handling -----------------------------------------------------

  function onPointerDown(e) {
    var handle = e.target && e.target.getAttribute
      ? e.target.getAttribute('data-handle')
      : null;
    if (!handle && e.target !== els.box) return;   // clicks on bare stage do nothing
    e.preventDefault();
    drag = {
      handle: handle || 'move',
      startX: e.clientX,
      startY: e.clientY,
      crop: { x: crop.x, y: crop.y, w: crop.w, h: crop.h },
    };
    // Capture keeps the drag alive when the cursor leaves the stage, but it is
    // not required for correctness — `drag` is already set, and the stage's own
    // pointermove carries the rest. Some pointer sources reject the call, so a
    // throw here must not abort the drag.
    try { els.stage.setPointerCapture(e.pointerId); } catch (_) { /* drag still works */ }
  }

  function onPointerMove(e) {
    if (!drag) return;
    e.preventDefault();
    var L = layout();
    var dx = (e.clientX - drag.startX) / L.scale;   // screen px → source px
    var dy = (e.clientY - drag.startY) / L.scale;
    if (drag.handle === 'move') moveBy(dx, dy);
    else resizeBy(drag.handle, dx, dy);
    render();
  }

  function onPointerUp(e) {
    if (!drag) return;
    drag = null;
    try { els.stage.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
  }

  function moveBy(dx, dy) {
    var s = drag.crop;
    crop.x = clamp(s.x + dx, 0, natural.w - s.w);
    crop.y = clamp(s.y + dy, 0, natural.h - s.h);
  }

  // Edge-based resize. The handle name tells us which edges move ('nw' moves
  // north and west), so the opposite corner is the anchor and stays put.
  function resizeBy(handle, dx, dy) {
    var s = drag.crop;
    var movesW = handle.indexOf('w') !== -1;
    var movesE = handle.indexOf('e') !== -1;
    var movesN = handle.indexOf('n') !== -1;
    var movesS = handle.indexOf('s') !== -1;

    var anchorX = movesW ? s.x + s.w : s.x;        // the edge that does NOT move
    var anchorY = movesN ? s.y + s.h : s.y;
    var maxW = movesW ? anchorX : natural.w - anchorX;
    var maxH = movesN ? anchorY : natural.h - anchorY;

    var w = s.w + (movesE ? dx : 0) - (movesW ? dx : 0);
    var h = s.h + (movesS ? dy : 0) - (movesN ? dy : 0);

    if (ratio > 0) {
      // One driver dimension, so the box can never leave the locked ratio even
      // for a frame. The bigger requested change wins, which is what makes a
      // corner drag feel like it follows the cursor.
      var driver = Math.max(w, h * ratio);
      driver = clamp(driver, MIN_NATURAL, Math.min(maxW, maxH * ratio));
      w = driver;
      h = driver / ratio;
    } else {
      w = clamp(w, MIN_NATURAL, maxW);
      h = clamp(h, MIN_NATURAL, maxH);
    }

    crop.w = w;
    crop.h = h;
    crop.x = movesW ? anchorX - w : anchorX;
    crop.y = movesN ? anchorY - h : anchorY;
  }

  // --- encoding -------------------------------------------------------------

  function canvasToBlob(canvas, mime, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (b) { resolve(b); }, mime, quality);
    });
  }

  // Draw the crop at source resolution and encode. A crop is almost always
  // smaller than the original, but a PNG re-encode can grow — so if the result
  // busts the 5 MB ceiling that processImageFile and the server both enforce,
  // fall back to progressively cheaper JPEG rather than letting the upload
  // fail with an opaque "too large".
  async function encodeCrop() {
    var sx = Math.round(clamp(crop.x, 0, natural.w));
    var sy = Math.round(clamp(crop.y, 0, natural.h));
    var sw = Math.max(1, Math.round(Math.min(crop.w, natural.w - sx)));
    var sh = Math.max(1, Math.round(Math.min(crop.h, natural.h - sy)));

    var canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    // PNG and WebP can carry transparency; JPEG cannot, and an unpainted
    // canvas encodes those pixels black. White matches the product grid.
    var mime = ENCODABLE[sourceFile.type] ? sourceFile.type : 'image/jpeg';
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sw, sh);
    }
    ctx.drawImage(els.img, sx, sy, sw, sh, 0, 0, sw, sh);

    var attempts = [
      { mime: mime, q: 0.92 },
      { mime: 'image/jpeg', q: 0.85 },
      { mime: 'image/jpeg', q: 0.7 },
    ];
    var blob = null;
    for (var i = 0; i < attempts.length; i++) {
      blob = await canvasToBlob(canvas, attempts[i].mime, attempts[i].q);
      if (blob && blob.size <= MAX_BYTES) { mime = attempts[i].mime; break; }
    }
    if (!blob) return null;

    var base = (sourceFile.name || 'image').replace(/\.[^.]+$/, '');
    return new File([blob], base + '-crop.' + (ENCODABLE[mime] || 'jpg'), { type: mime });
  }

  // --- lifecycle ------------------------------------------------------------

  function wire() {
    if (wired) return;
    wired = true;

    els.stage.addEventListener('pointerdown', onPointerDown);
    els.stage.addEventListener('pointermove', onPointerMove);
    els.stage.addEventListener('pointerup', onPointerUp);
    els.stage.addEventListener('pointercancel', onPointerUp);

    els.ratios.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.cropper-ratio-btn') : null;
      if (!btn) return;
      Array.prototype.forEach.call(
        els.ratios.querySelectorAll('.cropper-ratio-btn'),
        function (b) { b.classList.toggle('is-active', b === btn); }
      );
      applyRatio(parseFloat(btn.getAttribute('data-ratio')) || 0);
    });

    els.apply.addEventListener('click', async function () {
      els.apply.disabled = true;
      els.apply.textContent = 'Cropping…';
      var out = null;
      try { out = await encodeCrop(); } catch (_) { out = null; }
      els.apply.disabled = false;
      els.apply.textContent = 'Crop & save';
      if (!out) { showToast('❌ Could not crop that image — uploading the original', 'danger'); out = sourceFile; }
      finish(out);
    });
    els.original.addEventListener('click', function () { finish(sourceFile); });
    els.skip.addEventListener('click', function () { finish(null); });
    els.close.addEventListener('click', function () { finish(null); });
    els.modal.addEventListener('click', function (e) { if (e.target === els.modal) finish(null); });

    document.addEventListener('keydown', function (e) {
      if (!settle) return;
      if (e.key === 'Escape') finish(null);
    });
    // The crop lives in source pixels, so a resize only needs a re-render —
    // no coordinate migration, nothing to drift.
    window.addEventListener('resize', function () { if (settle) render(); });
  }

  function finish(result) {
    if (!settle) return;
    var done = settle;
    settle = null;
    els.modal.style.display = 'none';
    // Detach the handlers before clearing src — removing the attribute makes
    // some browsers fire onerror, which would re-enter finish() with a stale
    // resolve. (Harmless thanks to the guard above, but noisy.)
    els.img.onload = null;
    els.img.onerror = null;
    els.img.removeAttribute('src');
    sourceFile = null;
    done(result);
  }

  // Open the cropper for one file.
  // Resolves: a File to upload (cropped, or the original if the admin chose
  // "Use original"), or null to skip this file entirely.
  // Never rejects — if anything about the image can't be decoded, it resolves
  // with the original file so the upload path is unchanged from before.
  function open(file, label, opts) {
    var e = cache();
    if (!e || typeof window.File !== 'function' || !e.stage.setPointerCapture) {
      return Promise.resolve(file);   // no modal / ancient browser → old behaviour
    }
    wire();
    // Callers pass the ratio their surface actually wants: product covers are
    // square in the grid, a blog cover is a 16:9 banner.
    var startRatio = opts && typeof opts.ratio === 'number' ? opts.ratio : 1;

    return new Promise(function (resolve) {
      settle = resolve;
      sourceFile = file;
      e.filename.textContent = (label ? label + ' — ' : '') + (file.name || 'image');

      // A FileReader data: URL, NOT URL.createObjectURL. The admin page's CSP
      // is `img-src 'self' https: data:` — a blob: URL is blocked outright and
      // the image silently never loads. Widening the CSP for a preview would be
      // the wrong trade; data: is already allowed and costs one base64 pass.
      e.img.onload = function () {
        natural = { w: e.img.naturalWidth, h: e.img.naturalHeight };
        if (!natural.w || !natural.h) { finish(file); return; }
        // Reset to the caller's default ratio on each open — a previous file's
        // framing says nothing about this one.
        ratio = startRatio;
        var matched = false;
        Array.prototype.forEach.call(
          e.ratios.querySelectorAll('.cropper-ratio-btn'),
          function (b) {
            var on = Math.abs(parseFloat(b.getAttribute('data-ratio')) - startRatio) < 0.01;
            if (on) matched = true;
            b.classList.toggle('is-active', on);
          }
        );
        // A ratio with no button (a caller passed something bespoke) still
        // applies — it just has no chip lit, rather than lighting the wrong one.
        if (!matched) {
          Array.prototype.forEach.call(
            e.ratios.querySelectorAll('.cropper-ratio-btn'),
            function (b) { b.classList.remove('is-active'); }
          );
        }
        e.stage.classList.toggle('ratio-locked', ratio > 0);
        resetCrop();
        render();
      };
      e.img.onerror = function () { finish(file); };

      var reader = new FileReader();
      reader.onload = function () { e.img.src = reader.result; };
      reader.onerror = function () { finish(file); };
      reader.readAsDataURL(file);

      e.modal.style.display = 'flex';
    });
  }

  // Run a whole picked FileList through the cropper, one at a time, and return
  // the files that should actually be uploaded. Non-images are passed straight
  // through so processImageFile still produces its own error for them.
  async function run(fileList, opts) {
    var files = Array.prototype.slice.call(fileList || []);
    var out = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!f || !f.type || f.type.indexOf('image/') !== 0) { out.push(f); continue; }
      var label = files.length > 1 ? ('Image ' + (i + 1) + ' of ' + files.length) : '';
      var result = await open(f, label, opts);
      if (result) out.push(result);
    }
    return out;
  }

  return { open: open, run: run };
})();
