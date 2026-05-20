/* =============================================================================
   Velorex Music — skeleton loader helpers (shared)
   Used by: index.html + vlx-admin-2026.html

   API design: each helper returns an HTML STRING (not a DOM node). Callers
   set .innerHTML = Skeleton.X(...) and replace it later when real data lands.
   The string-output design keeps the helpers framework-free, easy to embed
   inside template literals, and lets server-rendered HTML be returned the
   same way without DOM-vs-string juggling.

   Visual styling lives in src/styles/components/skeleton.css. The classes
   below must stay in sync with that file.

   USAGE EXAMPLES

     // Storefront products grid
     gridEl.innerHTML = Skeleton.productGrid(12);
     const products = await fetch(...);
     gridEl.innerHTML = products.map(createProductCard).join('');

     // Admin orders table tbody
     tbodyEl.innerHTML = Skeleton.tableRows(5, 7);   // 5 rows × 7 cols
     await renderOrdersTable();

     // Admin customer drawer profile tab
     tabEl.innerHTML = Skeleton.drawerSection(4);
     const detail = await fetch(...);
     tabEl.innerHTML = renderProfileTab(detail.user);
   ============================================================================= */

const Skeleton = {
  /**
   * Storefront/admin product card grid. `count` cards laid out by the parent
   * grid's existing grid-template-columns (so we don't have to know how many
   * columns are showing on the current viewport).
   */
  productGrid(count = 6) {
    return Array.from({ length: count }, () =>
      `<div class="skeleton-card" aria-hidden="true">
         <div class="skeleton skeleton-card-image"></div>
         <div class="skeleton-card-body">
           <div class="skeleton skeleton-line skeleton-line-sm"></div>
           <div class="skeleton skeleton-line skeleton-line-lg"></div>
           <div class="skeleton skeleton-line" style="width: 50%;"></div>
           <div class="skeleton skeleton-line" style="width: 30%; margin-top: 0.6rem;"></div>
           <div class="skeleton skeleton-btn"></div>
         </div>
       </div>`
    ).join('');
  },

  /**
   * Storefront profile → orders tab. Same shape as the real .order-card.
   */
  orderCards(count = 3) {
    return Array.from({ length: count }, () =>
      `<div class="skeleton-order-card" aria-hidden="true">
         <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
           <div class="skeleton skeleton-line" style="width:35%; height:1rem;"></div>
           <div class="skeleton skeleton-badge"></div>
         </div>
         <div class="skeleton skeleton-line" style="width: 80%;"></div>
         <div class="skeleton skeleton-line" style="width: 60%;"></div>
         <div class="skeleton skeleton-line" style="width: 40%; margin-top: 0.8rem;"></div>
       </div>`
    ).join('');
  },

  /**
   * Admin dashboard top row. `count` defaults to 4 (matches the dashboard).
   */
  statCards(count = 4) {
    return Array.from({ length: count }, () =>
      `<div class="skeleton-stat-card" aria-hidden="true">
         <div class="skeleton skeleton-stat-label"></div>
         <div class="skeleton skeleton-stat-value"></div>
         <div class="skeleton skeleton-stat-meta"></div>
       </div>`
    ).join('');
  },

  /**
   * Admin / generic table tbody. Returns `rows` × `cols` of <tr><td> with
   * skeleton lines. First cell wider; remaining cells get a single line each.
   */
  tableRows(rows = 5, cols = 6) {
    const row = `<tr class="skeleton-tr" aria-hidden="true">${
      Array.from({ length: cols }, (_, i) =>
        i === 0
          ? '<td><span class="skeleton skeleton-thumb"></span><span class="skeleton skeleton-line" style="width:55%; display:inline-block; vertical-align:middle;"></span></td>'
          : '<td><span class="skeleton skeleton-line"></span></td>'
      ).join('')
    }</tr>`;
    return row.repeat(rows);
  },

  /**
   * Admin customer drawer tab body. `blocks` skeleton sections stacked
   * vertically with dividers.
   */
  drawerSection(blocks = 3) {
    return Array.from({ length: blocks }, () =>
      `<div class="skeleton-drawer-block" aria-hidden="true">
         <div class="skeleton skeleton-line skeleton-line-sm"></div>
         <div class="skeleton skeleton-line skeleton-line-lg"></div>
         <div class="skeleton skeleton-line" style="width: 65%;"></div>
       </div>`
    ).join('');
  },

  /**
   * Generic inline single-line skeleton — for replacing tiny "Loading..."
   * inline strings (e.g. category counts on the home page).
   */
  inlineLine(width = '4rem') {
    return `<span class="skeleton skeleton-line" style="display:inline-block; vertical-align: middle; width: ${width}; height: 0.7rem;" aria-hidden="true"></span>`;
  },
};
