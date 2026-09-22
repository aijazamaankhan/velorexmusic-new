/* =============================================================================
   Admin — suggestions for the product form's "Label" field (#f-label, #e-label).

   The storefront's label band ("Discover music from the industry's leading
   labels") is built from the labels products carry, and a label typed on a
   new product appears there automatically. Offering the labels that already
   exist keeps one label from being entered as two spellings. Typing a brand
   new label still works — this only suggests, it never restricts.

   Read-only: filled from the admin's product cache when a Label field gets
   focus. Nothing is saved from here.
   ============================================================================= */
(function () {
  'use strict';

  function decode(s) {
    // Labels were historically stored entity-escaped (CLAUDE.md §22).
    var t = document.createElement('textarea'); t.innerHTML = String(s); return t.value;
  }

  function fill() {
    var dl = document.getElementById('vlx-label-options');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'vlx-label-options'; document.body.appendChild(dl); }
    var names = {};
    try {
      (Storage.getProducts() || []).forEach(function (p) {
        var raw = p && (p.label || (p.specs && p.specs.label));
        if (!raw) return;
        var n = decode(raw).trim(); if (!n) return;
        var k = n.toLowerCase();
        if (!names[k]) names[k] = n;
      });
    } catch (e) { return; }
    var list = Object.keys(names).map(function (k) { return names[k]; }).sort(function (a, b) { return a.localeCompare(b); });
    dl.innerHTML = list.map(function (n) { return '<option value="' + n.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"></option>'; }).join('');
  }

  document.addEventListener('focusin', function (e) {
    if (e.target && (e.target.id === 'f-label' || e.target.id === 'e-label')) fill();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fill); else fill();
})();
