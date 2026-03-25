import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BLOG_CARDS_STYLE_TAG,
  PRODUCT_CARDS_STYLE_TAG,
  ensureStyleTag,
  extractInlineRenderConfigs,
  renderBlogCardsSsrMarkup,
  renderProductCardsSsrMarkup,
  replaceSimpleContainerById
} from '../src/utils/component-ssr.js';

test('extractInlineRenderConfigs parses component calls', () => {
  const html = `
    <script>
      ProductCards.render('home-featured-products', { limit: 8, layout: 'grid', columns: 4, filter: 'featured' });
      BlogCards.render('blog-archive-container', { limit: 12, pagination: true, columns: 3 });
    </script>
  `;

  const productConfigs = extractInlineRenderConfigs(html, 'ProductCards');
  const blogConfigs = extractInlineRenderConfigs(html, 'BlogCards');

  assert.deepEqual(productConfigs.get('home-featured-products'), {
    limit: 8,
    layout: 'grid',
    columns: 4,
    filter: 'featured'
  });
  assert.deepEqual(blogConfigs.get('blog-archive-container'), {
    limit: 12,
    pagination: true,
    columns: 3
  });
});

test('renderProductCardsSsrMarkup emits bootstrap and card HTML', () => {
  const rendered = renderProductCardsSsrMarkup({
    containerId: 'home-featured-products',
    products: [{
      id: 7,
      title: 'Birthday Blast',
      slug: 'birthday-blast',
      thumbnail_url: 'https://cdn.example.com/product.jpg',
      normal_price: 50,
      sale_price: 40,
      normal_delivery_text: '2',
      instant_delivery: 0,
      average_rating: 4.5,
      review_count: 12
    }],
    options: { limit: 8, columns: 4, layout: 'grid' },
    pagination: { page: 1, limit: 8, total: 1, pages: 1 }
  });

  assert.match(rendered.innerHtml, /product-cards-grid/);
  assert.match(rendered.innerHtml, /Birthday Blast/);
  assert.match(rendered.afterHtml, /product-cards-bootstrap-home-featured-products/);
  assert.equal(rendered.attrs['data-ssr-product-cards'], '1');
});

test('renderBlogCardsSsrMarkup emits bootstrap and blog HTML', () => {
  const rendered = renderBlogCardsSsrMarkup({
    containerId: 'blog-archive',
    blogs: [{
      id: 3,
      title: 'Launch Story',
      slug: 'launch-story',
      description: 'How we built the product.',
      thumbnail_url: 'https://cdn.example.com/blog.jpg',
      created_at: '2026-03-01T00:00:00Z'
    }],
    options: { limit: 12, columns: 3, pagination: true },
    pagination: { page: 1, limit: 12, total: 1, totalPages: 1, hasNext: false, hasPrev: false }
  });

  assert.match(rendered.innerHtml, /blog-cards-grid/);
  assert.match(rendered.innerHtml, /Launch Story/);
  assert.match(rendered.afterHtml, /blog-cards-bootstrap-blog-archive/);
  assert.equal(rendered.attrs['data-ssr-blog-cards'], '1');
});

test('replaceSimpleContainerById injects markup and attrs', () => {
  const html = '<div id="product-list"></div>';
  const updated = replaceSimpleContainerById(
    html,
    'product-list',
    '<div class="product-cards-grid"></div>',
    { 'data-ssr-product-cards': '1' },
    '<script id="bootstrap"></script>'
  );

  assert.match(updated, /data-ssr-product-cards="1"/);
  assert.match(updated, /product-cards-grid/);
  assert.match(updated, /bootstrap/);
});

test('replaceSimpleContainerById replaces full nested container content', () => {
  const html = `
    <div id="questions-container">
      <div class="loading">
        <div class="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    </div>
    <div id="pagination"></div>
  `;
  const updated = replaceSimpleContainerById(
    html,
    'questions-container',
    '<div class="questions-list"><a class="question-link-card">Question</a></div>'
  );

  assert.match(updated, /questions-list/);
  assert.doesNotMatch(updated, /Loading\.\.\./);
  assert.match(updated, /<div id="pagination"><\/div>/);
});

test('ensureStyleTag injects styles once', () => {
  const html = '<html><head></head><body><div id="all-products"></div></body></html>';
  const once = ensureStyleTag(html, PRODUCT_CARDS_STYLE_TAG, 'product-cards-styles');
  const twice = ensureStyleTag(once, PRODUCT_CARDS_STYLE_TAG, 'product-cards-styles');
  const blogOnce = ensureStyleTag(twice, BLOG_CARDS_STYLE_TAG, 'blog-cards-styles');

  assert.equal((once.match(/product-cards-styles/g) || []).length, 1);
  assert.equal((twice.match(/product-cards-styles/g) || []).length, 1);
  assert.equal((blogOnce.match(/blog-cards-styles/g) || []).length, 1);
});
