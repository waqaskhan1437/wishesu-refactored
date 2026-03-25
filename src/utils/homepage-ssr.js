import { canonicalProductPath, escapeHtml } from './formatting.js';

export const HOME_PRODUCTS_BOOTSTRAP_ID = 'home-products-bootstrap';

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function safeDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
}

function buildBootstrapId(prefix, containerId) {
  const safeContainerId = String(containerId || 'component')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${prefix}-${safeContainerId || 'component'}`;
}

function stringifyBootstrap(payload) {
  return JSON.stringify(payload || {}).replace(/</g, '\\u003c');
}

function renderReviewStars(ratingValue) {
  const rating = clamp(ratingValue, 0, 5, 5);
  const fullStars = Math.floor(rating);
  let stars = '';

  for (let index = 0; index < 5; index += 1) {
    if (index < fullStars) {
      stars += '<span class="star star-full" aria-hidden="true">&#9733;</span>';
    } else {
      stars += '<span class="star star-empty" aria-hidden="true">&#9734;</span>';
    }
  }

  return `<div class="rating-stars" role="img" aria-label="${escapeHtml(String(rating))} out of 5 stars">${stars}</div>`;
}

function extractYoutubeId(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  const match = value.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
  return match ? String(match[1]) : '';
}

export function buildHomeProductsBootstrap(products = []) {
  const normalized = Array.isArray(products)
    ? products.slice(0, 24).map((product) => ({ ...product }))
    : [];

  const detailsById = Object.fromEntries(
    normalized
      .filter((product) => product && product.id != null)
      .map((product) => [String(product.id), { product, addons: [] }])
  );

  return {
    products: normalized,
    detailsById
  };
}

export function renderHomepageProductGridSsr(products = []) {
  if (!Array.isArray(products) || products.length === 0) {
    return '<p style="margin:0;text-align:center;color:#fff;opacity:0.85;">No products available right now.</p>';
  }

  return products.map((product) => {
    const productTitle = escapeHtml(String(product?.title || 'Product'));
    const imageUrl = escapeHtml(String(product?.thumbnail_url || ''));
    const normalPrice = Number(product?.normal_price || 0);
    const salePrice = Number(product?.sale_price || normalPrice || 0);
    const hasDiscount = normalPrice > 0 && salePrice < normalPrice;
    const discount = hasDiscount
      ? Math.max(0, Math.round((1 - (salePrice / normalPrice)) * 100))
      : 0;
    const rating = clamp((product?.average_rating ?? product?.rating_average ?? 0), 0, 5, 0);
    const fullStars = Math.round(rating);
    const reviewCount = Math.max(0, parseInt(product?.review_count, 10) || 0);
    const productUrl = canonicalProductPath(product);

    return `
      <div class="product-card">
        <div class="media">
          <img src="${imageUrl}" alt="${productTitle}" loading="lazy" width="400" height="180">
          ${hasDiscount ? `<span class="badge">${discount}% OFF</span>` : ''}
        </div>
        <div class="info">
          <span class="stars">${'&#9733;'.repeat(fullStars)}${'&#9734;'.repeat(Math.max(0, 5 - fullStars))}</span>
          <span class="reviews">(${reviewCount} reviews)</span>
          <div class="price">$${salePrice.toFixed(0)}${hasDiscount ? `<span class="old-price">$${normalPrice.toFixed(0)}</span>` : ''}</div>
          <a class="book-btn" href="${productUrl}">Book Now</a>
        </div>
      </div>
    `;
  }).join('');
}

export function selectFeaturedHomeProducts(products = []) {
  return (Array.isArray(products) ? products : [])
    .filter((product) => String(product?.video_url || '').trim() !== '')
    .sort((left, right) => {
      const reviewDelta = (Number(right?.review_count || 0) - Number(left?.review_count || 0));
      if (reviewDelta !== 0) return reviewDelta;
      const ratingDelta = (
        Number(right?.average_rating ?? right?.rating_average ?? 0) -
        Number(left?.average_rating ?? left?.rating_average ?? 0)
      );
      if (ratingDelta !== 0) return ratingDelta;
      return Number(right?.id || 0) - Number(left?.id || 0);
    })
    .slice(0, 4);
}

export function renderHomepageHeroPlayerSsr(products = []) {
  const featured = selectFeaturedHomeProducts(products);
  if (featured.length === 0) {
    return {
      innerHtml: `
        <div class="hero-player-stage" data-role="stage"></div>
        <div class="hero-player-dots" data-role="dots"></div>
        <a class="hero-player-cta" data-role="cta" href="/products">Book Now</a>
      `,
      targetHref: '/products',
      featured
    };
  }

  const current = featured[0];
  const title = escapeHtml(String(current?.title || 'Featured product'));
  const targetHref = canonicalProductPath(current);
  const youtubeId = extractYoutubeId(current?.video_url);

  const stageMedia = youtubeId
    ? `<iframe src="https://www.youtube.com/embed/${escapeHtml(youtubeId)}?rel=0&amp;playsinline=1&amp;mute=1" title="${title}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
    : `<video src="${escapeHtml(String(current?.video_url || ''))}" controls muted playsinline preload="metadata"></video>`;

  return {
    innerHtml: `
      <div class="hero-player-stage" data-role="stage">${stageMedia}</div>
      <div class="hero-player-dots" data-role="dots">
        ${featured.map((item, index) => `<button type="button" class="hero-player-dot${index === 0 ? ' active' : ''}" aria-label="Play product ${index + 1}"></button>`).join('')}
      </div>
      <a class="hero-player-cta" data-role="cta" href="${targetHref}">Book Now</a>
    `,
    targetHref,
    featured
  };
}

export function renderReviewsWidgetSsrMarkup({ containerId, reviews = [], options = {} }) {
  const resolvedOptions = {
    columns: clamp(options.columns, 1, 6, 1),
    showAvatar: options.showAvatar !== false,
    limit: clamp(options.limit, 1, 50, 10),
    minRating: options.minRating == null ? null : clamp(options.minRating, 1, 5, null),
    rating: options.rating == null ? null : clamp(options.rating, 1, 5, null),
    productId: options.productId ?? null,
    productIds: Array.isArray(options.productIds) ? options.productIds : [],
    ids: Array.isArray(options.ids) ? options.ids : []
  };

  const content = !Array.isArray(reviews) || reviews.length === 0
    ? `
      <div style="text-align: center; padding: 40px; color: #6b7280;">
        <div style="font-size: 3rem; margin-bottom: 15px;">&#11088;</div>
        <p>No reviews yet. Be the first to review!</p>
      </div>
    `
    : `
      <div class="reviews-grid" style="display: grid; grid-template-columns: repeat(${resolvedOptions.columns}, 1fr); gap: 25px; max-width: 1200px; margin: 0 auto;">
        ${reviews.map((review) => {
          const reviewerName = escapeHtml(String(review?.customer_name || review?.author_name || 'Anonymous'));
          const reviewText = escapeHtml(String(review?.review_text || review?.comment || 'No review text'));
          const productTitle = escapeHtml(String(review?.product_name || review?.product_title || ''));
          const dateText = escapeHtml(safeDate(review?.created_at));
          const createdAt = escapeHtml(String(review?.created_at || ''));
          const initials = reviewerName.charAt(0).toUpperCase();

          return `
            <article class="review-card" aria-label="Review by ${reviewerName}">
              <div class="review-header">
                ${resolvedOptions.showAvatar ? `<div class="review-avatar" aria-hidden="true">${initials}</div>` : ''}
                <div class="review-header-info">
                  <div class="review-author">${reviewerName}</div>
                  <div class="review-meta">
                    ${renderReviewStars(review?.rating)}
                    <span class="review-date"><time datetime="${createdAt}">${dateText}</time></span>
                  </div>
                </div>
              </div>
              ${productTitle ? `<div class="review-product"><span aria-hidden="true">&#128230;</span> ${productTitle}</div>` : ''}
              <div class="review-text">${reviewText}</div>
            </article>
          `;
        }).join('')}
      </div>
    `;

  const bootstrapId = buildBootstrapId('reviews-widget-bootstrap', containerId);
  return {
    innerHtml: content,
    attrs: {
      'data-ssr-reviews-widget': '1',
      'data-ssr-bootstrap-id': bootstrapId
    },
    afterHtml: `<script type="application/json" id="${escapeHtml(bootstrapId)}">${stringifyBootstrap({
      reviews,
      options: resolvedOptions
    })}</script>`
  };
}

export const REVIEWS_WIDGET_STYLE_TAG = `<style id="reviews-widget-styles">
  .review-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    min-height: 120px;
    contain: layout style paint;
  }
  .review-header {
    display: flex;
    gap: 15px;
    margin-bottom: 15px;
  }
  .review-avatar {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 1.2rem;
    flex-shrink: 0;
  }
  .review-header-info {
    flex: 1;
  }
  .review-author {
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 5px;
  }
  .review-meta {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .rating-stars {
    display: flex;
    gap: 2px;
  }
  .star {
    font-size: 1rem;
    line-height: 1;
  }
  .star-full {
    color: #fbbf24;
  }
  .star-empty {
    color: #d1d5db;
  }
  .review-date {
    font-size: 0.85rem;
    color: #6b7280;
  }
  .review-product {
    font-size: 0.9rem;
    color: #6b7280;
    margin-bottom: 12px;
    padding: 6px 12px;
    background: #f3f4f6;
    border-radius: 6px;
    display: inline-block;
  }
  .review-text {
    color: #4b5563;
    line-height: 1.6;
    font-size: 0.95rem;
  }
  @media (max-width: 768px) {
    .reviews-grid {
      grid-template-columns: 1fr !important;
    }
  }
</style>`;
