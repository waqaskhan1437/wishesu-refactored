import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOME_PRODUCTS_BOOTSTRAP_ID,
  buildHomeProductsBootstrap,
  renderHomepageHeroPlayerSsr,
  renderHomepageProductGridSsr,
  renderReviewsWidgetSsrMarkup
} from '../src/utils/homepage-ssr.js';

const sampleProducts = [
  {
    id: 10,
    title: 'Birthday Surprise',
    slug: 'birthday-surprise',
    thumbnail_url: 'https://cdn.example.com/birthday.jpg',
    normal_price: 120,
    sale_price: 90,
    review_count: 12,
    average_rating: 4.8,
    video_url: 'https://youtu.be/abc123XYZ'
  },
  {
    id: 11,
    title: 'Wedding Wish',
    slug: 'wedding-wish',
    thumbnail_url: 'https://cdn.example.com/wedding.jpg',
    normal_price: 80,
    sale_price: 80,
    review_count: 4,
    average_rating: 4.5,
    video_url: 'https://cdn.example.com/wedding.mp4'
  }
];

test('buildHomeProductsBootstrap keeps products and detail lookups', () => {
  const bootstrap = buildHomeProductsBootstrap(sampleProducts);
  assert.equal(HOME_PRODUCTS_BOOTSTRAP_ID, 'home-products-bootstrap');
  assert.equal(bootstrap.products.length, 2);
  assert.equal(bootstrap.detailsById['10'].product.slug, 'birthday-surprise');
});

test('renderHomepageProductGridSsr matches client card structure', () => {
  const html = renderHomepageProductGridSsr(sampleProducts.slice(0, 1));
  assert.match(html, /class="product-card"/);
  assert.match(html, /25% OFF/);
  assert.match(html, /\(12 reviews\)/);
  assert.match(html, /Book Now/);
  assert.doesNotMatch(html, /<h3>/);
});

test('renderHomepageHeroPlayerSsr renders first featured video and dots', () => {
  const hero = renderHomepageHeroPlayerSsr(sampleProducts);
  assert.match(hero.innerHtml, /hero-player-stage/);
  assert.match(hero.innerHtml, /youtube\.com\/embed\/abc123XYZ/);
  assert.match(hero.innerHtml, /hero-player-dot active/);
  assert.equal(hero.targetHref, '/product-10/birthday-surprise');
});

test('renderReviewsWidgetSsrMarkup includes bootstrap hydration payload', () => {
  const rendered = renderReviewsWidgetSsrMarkup({
    containerId: 'reviews-widget',
    reviews: [
      {
        id: 1,
        author_name: 'Ayesha',
        comment: 'Amazing video gift',
        rating: 5,
        created_at: '2026-03-01T10:00:00Z',
        product_title: 'Birthday Surprise'
      }
    ],
    options: { limit: 8, columns: 3, minRating: 5 }
  });

  assert.match(rendered.innerHtml, /class="reviews-grid"/);
  assert.match(rendered.innerHtml, /repeat\(3, 1fr\)/);
  assert.match(rendered.innerHtml, /Ayesha/);
  assert.equal(rendered.attrs['data-ssr-reviews-widget'], '1');
  assert.match(rendered.afterHtml, /reviews-widget-bootstrap-reviews-widget/);
  assert.match(rendered.afterHtml, /"minRating":5/);
});
