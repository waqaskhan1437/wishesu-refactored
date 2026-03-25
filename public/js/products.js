/*
 * Logic for the product listing page (index.html).
 * Fetches products from the API and renders simple cards linking to
 * individual product pages.
 * Updated for USD ($) currency.
 */

;(function initProductGrid() {
  const container = document.getElementById('product-list');
  if (!container || !window.ProductCards) return;
  // Render a grid of all products with 3 columns.  The ProductCards system
  // handles fetching products, applying filters and responsive styling.
  ProductCards.render('product-list', { filter: 'all', columns: 3, limit: 9 });
})();
