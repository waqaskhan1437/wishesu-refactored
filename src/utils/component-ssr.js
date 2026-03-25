import { canonicalProductPath, escapeHtml, slugifyStr } from './formatting.js';

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback) {
  const number = toNumber(value, fallback);
  return Math.min(max, Math.max(min, number));
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

function buildGridTemplate(columns, fallback = 3) {
  const count = clamp(columns, 1, 6, fallback);
  return `repeat(${count}, 1fr)`;
}

function renderProductStars(ratingValue) {
  const rating = Math.max(0, Math.min(5, toNumber(ratingValue, 5)));
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;

  let stars = '';
  for (let index = 0; index < 5; index += 1) {
    if (index < fullStars) {
      stars += '<span class="star star-full">&#9733;</span>';
    } else if (index === fullStars && hasHalfStar) {
      stars += '<span class="star star-half">&#9733;</span>';
    } else {
      stars += '<span class="star star-empty">&#9734;</span>';
    }
  }
  return `<div class="rating-stars">${stars}</div>`;
}

function getDeliveryText(instantDelivery, deliveryDays) {
  if (instantDelivery === 1 || instantDelivery === true || instantDelivery === '1') {
    return 'Instant Delivery in 60 Minutes';
  }

  const days = parseInt(deliveryDays, 10) || 1;
  if (days === 1) return '24 Hour Express Delivery';
  if (days === 2) return '2 Days Delivery';
  if (days === 3) return '3 Days Delivery';
  return `${days} Days Delivery`;
}

function getDeliveryIcon(instantDelivery) {
  return (instantDelivery === 1 || instantDelivery === true || instantDelivery === '1')
    ? '&#9889;'
    : '&#128640;';
}

function formatMoney(value) {
  return `$${toNumber(value, 0)}`;
}

function truncateText(value, maxLength) {
  const input = String(value || '').trim();
  if (!input || input.length <= maxLength) return input;
  return `${input.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatBlogDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function getVisibleCountForSlider() {
  return 3;
}

function renderProductCard(product, options = {}) {
  const {
    id,
    title,
    slug,
    thumbnail_url: thumbnailUrl,
    normal_price: normalPrice,
    sale_price: salePriceInput,
    normal_delivery_text: normalDeliveryText,
    instant_delivery: instantDelivery,
    delivery_time_days: deliveryTimeDays,
    average_rating: averageRating,
    rating_average: ratingAverage,
    review_count: reviewCount
  } = product || {};

  const productTitle = escapeHtml(String(title || 'Untitled Product'));
  const safeSlug = slug
    ? String(slug)
    : slugifyStr(title || 'product');
  const productUrl = id
    ? canonicalProductPath({ id, slug: safeSlug, title })
    : (slug ? `/product/${encodeURIComponent(String(slug))}` : '/');

  const originalPrice = toNumber(normalPrice, 0);
  const salePrice = toNumber(salePriceInput, originalPrice);
  const hasDiscount = salePrice < originalPrice;
  const discount = hasDiscount && originalPrice > 0
    ? Math.round((1 - (salePrice / originalPrice)) * 100)
    : 0;

  const rating = Number.isFinite(Number(averageRating))
    ? Number(averageRating)
    : toNumber(ratingAverage, 5);

  const showReviews = options.showReviews !== false;
  const showDelivery = options.showDelivery !== false;
  const deliveryText = getDeliveryText(instantDelivery, deliveryTimeDays || normalDeliveryText);
  const deliveryIcon = getDeliveryIcon(instantDelivery);

  return `
    <a href="${productUrl}" class="product-card" data-product-id="${escapeHtml(String(id || ''))}" style="text-decoration:none; color:inherit; display:block;">
      <div class="product-thumbnail">
        <img src="${escapeHtml(thumbnailUrl || '/placeholder.jpg')}" alt="${productTitle}" loading="lazy">
        ${hasDiscount ? `<div class="discount-badge">${discount}% OFF</div>` : ''}
      </div>
      <div class="product-content">
        <h3 class="product-title">${productTitle}</h3>
        <div class="product-meta-row">
          <div class="product-prices">
            ${hasDiscount ? `<span class="original-price">${formatMoney(originalPrice)}</span>` : ''}
            <span class="sale-price">${formatMoney(salePrice)}</span>
          </div>
          ${showReviews ? `
            <div class="product-reviews">
              ${renderProductStars(rating)}
              <span class="review-count">(${escapeHtml(String(reviewCount || 0))})</span>
            </div>
          ` : ''}
        </div>
        ${showDelivery ? `
          <div class="product-delivery">
            <span class="delivery-icon">${deliveryIcon}</span>
            <span class="delivery-text">${escapeHtml(deliveryText)}</span>
          </div>
        ` : ''}
        <div class="book-now-btn">Book Now</div>
      </div>
    </a>
  `;
}

function renderProductGrid(products, options = {}) {
  const columns = clamp(options.columns, 1, 6, 3);
  return `
    <div class="product-cards-grid" style="display:grid;grid-template-columns:${buildGridTemplate(columns, 3)};gap:30px;max-width:1200px;margin:0 auto;">
      ${products.map((product) => renderProductCard(product, options)).join('')}
    </div>
  `;
}

function renderProductSlider(products, options = {}, containerId = 'product-slider') {
  const visibleCount = getVisibleCountForSlider();
  const totalSlides = Math.max(1, Math.ceil(products.length / visibleCount));

  return `
    <div class="product-slider-container">
      <button class="product-slider-btn prev" onclick="ProductCards.slideMove('${escapeHtml(containerId)}', -1)">&#10094;</button>
      <div class="product-slider-wrapper">
        <div class="product-slider-track" data-slide="0" data-total="${totalSlides}" data-visible="${visibleCount}">
          ${products.map((product) => renderProductCard(product, options)).join('')}
        </div>
      </div>
      <button class="product-slider-btn next" onclick="ProductCards.slideMove('${escapeHtml(containerId)}', 1)">&#10095;</button>
    </div>
    <div class="product-slider-dots">
      ${Array.from({ length: totalSlides }, (_, index) => (
        `<button class="product-slider-dot${index === 0 ? ' active' : ''}" onclick="ProductCards.slideTo('${escapeHtml(containerId)}', ${index})"></button>`
      )).join('')}
    </div>
  `;
}

function renderBlogCard(blog) {
  const slugOrId = String(blog?.slug || blog?.id || '').trim();
  const blogUrl = `/blog/${encodeURIComponent(slugOrId)}`;
  const title = escapeHtml(String(blog?.title || 'Untitled'));
  const description = escapeHtml(truncateText(blog?.description || '', 120));
  const date = formatBlogDate(blog?.created_at);

  return `
    <div class="blog-card" onclick="window.location.href='${blogUrl}'">
      <div class="blog-thumbnail">
        <img src="${escapeHtml(blog?.thumbnail_url || 'https://via.placeholder.com/400x225?text=No+Image')}" alt="${title}" loading="lazy">
      </div>
      <div class="blog-content">
        <h3 class="blog-title">${title}</h3>
        ${date ? `<div class="blog-date">&#128197; ${escapeHtml(date)}</div>` : ''}
        <p class="blog-description">${description}</p>
        <a href="${blogUrl}" class="blog-read-more" onclick="event.stopPropagation();">Read More &rarr;</a>
      </div>
    </div>
  `;
}

function buildBlogPageHref(pageNumber, limit) {
  const page = Math.max(1, parseInt(pageNumber, 10) || 1);
  const pageLimit = Math.max(1, parseInt(limit, 10) || 30);
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (pageLimit !== 30) params.set('limit', String(pageLimit));
  const query = params.toString();
  return query ? `?${query}` : '?';
}

function renderBlogPagination(pagination = {}, showPagination = true) {
  if (!showPagination) return '';

  const page = Math.max(1, parseInt(pagination.page, 10) || 1);
  const totalPages = Math.max(0, parseInt(pagination.totalPages, 10) || 0);
  const limit = Math.max(1, parseInt(pagination.limit, 10) || 30);

  if (totalPages <= 1) return '';

  let links = '';
  const startPage = Math.max(1, page - 2);
  const endPage = Math.min(totalPages, page + 2);

  if (startPage > 1) {
    links += `<a href="${buildBlogPageHref(1, limit)}" class="page-link">1</a>`;
    if (startPage > 2) links += '<span class="page-dots">...</span>';
  }

  for (let current = startPage; current <= endPage; current += 1) {
    if (current === page) {
      links += `<span class="page-link active">${current}</span>`;
    } else {
      links += `<a href="${buildBlogPageHref(current, limit)}" class="page-link">${current}</a>`;
    }
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) links += '<span class="page-dots">...</span>';
    links += `<a href="${buildBlogPageHref(totalPages, limit)}" class="page-link">${totalPages}</a>`;
  }

  return `
    <div class="blog-pagination">
      ${pagination.hasPrev ? `<a href="${buildBlogPageHref(page - 1, limit)}" class="page-link page-prev">&larr; Previous</a>` : ''}
      <div class="page-numbers">${links}</div>
      ${pagination.hasNext ? `<a href="${buildBlogPageHref(page + 1, limit)}" class="page-link page-next">Next &rarr;</a>` : ''}
    </div>
  `;
}

function renderBlogGrid(blogs, options = {}, pagination = {}) {
  const columns = clamp(options.columns, 1, 6, 3);
  const showPagination = options.showPagination !== false && options.pagination !== false;

  return `
    <div class="blog-cards-grid" style="display:grid;grid-template-columns:${buildGridTemplate(columns, 3)};gap:30px;max-width:1200px;margin:0 auto;">
      ${blogs.map((blog) => renderBlogCard(blog)).join('')}
    </div>
    ${renderBlogPagination(pagination, showPagination)}
  `;
}

function renderBlogSlider(blogs, containerId = 'blog-slider') {
  const visibleCount = getVisibleCountForSlider();
  const totalSlides = Math.max(1, Math.ceil(blogs.length / visibleCount));

  return `
    <div class="blog-slider-container">
      <button class="blog-slider-btn prev" onclick="BlogCards.slideMove('${escapeHtml(containerId)}', -1)">&#10094;</button>
      <div class="blog-slider-wrapper">
        <div class="blog-slider-track" data-slide="0" data-total="${totalSlides}" data-visible="${visibleCount}">
          ${blogs.map((blog) => renderBlogCard(blog)).join('')}
        </div>
      </div>
      <button class="blog-slider-btn next" onclick="BlogCards.slideMove('${escapeHtml(containerId)}', 1)">&#10095;</button>
    </div>
    <div class="blog-slider-dots">
      ${Array.from({ length: totalSlides }, (_, index) => (
        `<button class="blog-slider-dot${index === 0 ? ' active' : ''}" onclick="BlogCards.slideTo('${escapeHtml(containerId)}', ${index})"></button>`
      )).join('')}
    </div>
  `;
}

export function parseInlineRenderOptions(raw = '') {
  const input = String(raw || '').trim();
  if (!input) return {};

  let normalized = input
    .replace(/([{,]\s*)([a-zA-Z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/'/g, '"')
    .replace(/\bundefined\b/g, 'null')
    .replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(normalized);
  } catch (_) {
    return {};
  }
}

export function extractInlineRenderConfigs(html, globalName) {
  const configs = new Map();
  const pattern = new RegExp(`${globalName}\\.(renderSlider|render)\\(\\s*['"]([^'"]+)['"]\\s*,\\s*({[\\s\\S]*?})\\s*\\)`, 'g');
  let match;

  while ((match = pattern.exec(String(html || ''))) !== null) {
    const [, method, containerId, rawOptions] = match;
    const options = parseInlineRenderOptions(rawOptions);
    if (method === 'renderSlider') {
      options.layout = 'slider';
    }
    configs.set(String(containerId), options);
  }

  return configs;
}

export function ensureStyleTag(html, styleTag, styleId) {
  const input = String(html || '');
  if (!styleTag || (styleId && input.includes(`id="${styleId}"`))) {
    return input;
  }

  if (/<\/head>/i.test(input)) {
    return input.replace(/<\/head>/i, `${styleTag}\n</head>`);
  }

  if (/<body[^>]*>/i.test(input)) {
    return input.replace(/<body([^>]*)>/i, `<body$1>\n${styleTag}`);
  }

  return `${styleTag}${input}`;
}

export function replaceSimpleContainerById(html, containerId, innerHtml, attrs = {}, afterHtml = '') {
  const input = String(html || '');
  const escapedId = String(containerId || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<(div|section)([^>]*\\bid=["']${escapedId}["'][^>]*)>`, 'i');
  const match = pattern.exec(input);
  if (!match) {
    return input;
  }

  const tagName = String(match[1] || 'div').toLowerCase();
  const rawAttrs = match[2] || '';
  const openingTagIndex = match.index;
  const openingTagEnd = openingTagIndex + match[0].length;
  const closingTagIndex = findMatchingContainerCloseIndex(input, tagName, openingTagEnd);

  if (closingTagIndex < 0) {
    return input;
  }

  let nextAttrs = rawAttrs;
  Object.entries(attrs || {}).forEach(([key, value]) => {
    const attrPattern = new RegExp(`\\s${key}=["'][^"']*["']`, 'i');
    const serialized = ` ${key}="${escapeHtml(String(value))}"`;
    nextAttrs = attrPattern.test(nextAttrs)
      ? nextAttrs.replace(attrPattern, serialized)
      : `${nextAttrs}${serialized}`;
  });

  const closeTag = `</${tagName}>`;
  const replacement = `<${tagName}${nextAttrs}>${innerHtml}</${tagName}>${afterHtml}`;

  return `${input.slice(0, openingTagIndex)}${replacement}${input.slice(closingTagIndex + closeTag.length)}`;
}

function findMatchingContainerCloseIndex(html, tagName, searchFrom) {
  const tokenPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tokenPattern.lastIndex = searchFrom;

  let depth = 1;
  let tokenMatch;

  while ((tokenMatch = tokenPattern.exec(html))) {
    const token = tokenMatch[0];
    const isClosing = /^<\//.test(token);
    const isSelfClosing = /\/>$/.test(token);

    if (isClosing) {
      depth -= 1;
      if (depth === 0) {
        return tokenMatch.index;
      }
      continue;
    }

    if (!isSelfClosing) {
      depth += 1;
    }
  }

  return -1;
}

export function replaceDataEmbedContainers(html, renderer) {
  return String(html || '').replace(
    /<(div|section)([^>]*\bdata-embed='([^']+)'[^>]*)>([\s\S]*?)<\/\1>/gi,
    (full, tagName, rawAttrs, rawConfig) => {
      let config;
      try {
        config = JSON.parse(rawConfig);
      } catch (_) {
        return full;
      }

      const rendered = renderer(config, rawAttrs);
      if (!rendered || !rendered.innerHtml) return full;

      let nextAttrs = rawAttrs;
      Object.entries(rendered.attrs || {}).forEach(([key, value]) => {
        const attrPattern = new RegExp(`\\s${key}=["'][^"']*["']`, 'i');
        const serialized = ` ${key}="${escapeHtml(String(value))}"`;
        nextAttrs = attrPattern.test(nextAttrs)
          ? nextAttrs.replace(attrPattern, serialized)
          : `${nextAttrs}${serialized}`;
      });

      return `<${tagName}${nextAttrs}>${rendered.innerHtml}</${tagName}>${rendered.afterHtml || ''}`;
    }
  );
}

export function renderProductCardsSsrMarkup({ containerId, products = [], options = {}, pagination = {} }) {
  const resolvedOptions = {
    limit: clamp(options.limit, 1, 100, 12),
    columns: clamp(options.columns, 1, 6, 3),
    filter: String(options.filter || 'all'),
    ids: Array.isArray(options.ids) ? options.ids : [],
    layout: String(options.layout || 'grid'),
    showReviews: options.showReviews !== false,
    showDelivery: options.showDelivery !== false
  };

  const innerHtml = resolvedOptions.layout === 'slider'
    ? renderProductSlider(products, resolvedOptions, containerId)
    : renderProductGrid(products, resolvedOptions);

  const bootstrapId = buildBootstrapId('product-cards-bootstrap', containerId);
  const bootstrapScript = `<script type="application/json" id="${bootstrapId}">${stringifyBootstrap({
    containerId,
    options: resolvedOptions,
    products,
    pagination
  })}</script>`;

  return {
    innerHtml,
    afterHtml: bootstrapScript,
    attrs: {
      'data-ssr-product-cards': '1',
      'data-ssr-bootstrap-id': bootstrapId
    }
  };
}

export function renderBlogCardsSsrMarkup({ containerId, blogs = [], options = {}, pagination = {} }) {
  const resolvedOptions = {
    limit: clamp(options.limit, 1, 100, 30),
    columns: clamp(options.columns, 1, 6, 3),
    ids: Array.isArray(options.ids) ? options.ids : [],
    layout: String(options.layout || 'grid'),
    showPagination: options.showPagination !== false && options.pagination !== false
  };

  const innerHtml = resolvedOptions.layout === 'slider'
    ? renderBlogSlider(blogs, containerId)
    : renderBlogGrid(blogs, resolvedOptions, pagination);

  const bootstrapId = buildBootstrapId('blog-cards-bootstrap', containerId);
  const bootstrapScript = `<script type="application/json" id="${bootstrapId}">${stringifyBootstrap({
    containerId,
    options: resolvedOptions,
    blogs,
    pagination
  })}</script>`;

  return {
    innerHtml,
    afterHtml: bootstrapScript,
    attrs: {
      'data-ssr-blog-cards': '1',
      'data-ssr-bootstrap-id': bootstrapId
    }
  };
}

export const PRODUCT_CARDS_STYLE_TAG = `<style id="product-cards-styles">
  .product-card {
    background: white;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    contain: layout style paint;
  }
  .product-card:hover {
    box-shadow: 0 12px 24px rgba(0,0,0,0.15);
  }
  .product-thumbnail {
    position: relative;
    width: 100%;
    aspect-ratio: 16/9;
    overflow: hidden;
    background: #f3f4f6;
  }
  .product-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .product-card:hover .product-thumbnail img {
    transform: scale(1.05);
  }
  .discount-badge {
    position: absolute;
    top: 12px;
    right: 12px;
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    color: white;
    padding: 6px 12px;
    border-radius: 20px;
    font-weight: 700;
    font-size: 0.85em;
    box-shadow: 0 4px 12px rgba(245, 87, 108, 0.4);
  }
  .product-content {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
  }
  .product-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
    line-height: 1.4;
    min-height: 2.8em;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .product-meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .product-prices {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .original-price {
    font-size: 0.9rem;
    color: #9ca3af;
    text-decoration: line-through;
  }
  .sale-price {
    font-size: 1.5rem;
    font-weight: 700;
    color: #3b82f6;
  }
  .product-reviews {
    display: flex;
    align-items: center;
    gap: 4px;
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
  .star-half {
    color: #fbbf24;
    opacity: 0.5;
  }
  .star-empty {
    color: #d1d5db;
  }
  .review-count {
    font-size: 0.85rem;
    color: #6b7280;
  }
  .product-delivery {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: #f0f9ff;
    border-radius: 6px;
    font-size: 0.9rem;
    color: #1e40af;
    font-weight: 500;
  }
  .delivery-icon {
    font-size: 1.1em;
  }
  .book-now-btn {
    width: 100%;
    padding: 12px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: box-shadow 0.15s ease;
    margin-top: auto;
  }
  .book-now-btn:hover {
    box-shadow: 0 8px 16px rgba(102, 126, 234, 0.4);
  }
  @media (max-width: 768px) {
    .product-cards-grid {
      grid-template-columns: repeat(2, 1fr) !important;
      gap: 20px !important;
    }
  }
  @media (max-width: 480px) {
    .product-cards-grid {
      grid-template-columns: 1fr !important;
    }
  }
  .product-slider-container {
    position: relative;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 50px;
  }
  .product-slider-wrapper {
    overflow: hidden;
  }
  .product-slider-track {
    display: flex;
    gap: 20px;
    transition: transform 0.4s ease;
    padding: 10px 0;
  }
  .product-slider-track .product-card {
    flex: 0 0 calc(33.333% - 14px);
    min-width: calc(33.333% - 14px);
  }
  .product-slider-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 44px;
    height: 44px;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 50%;
    cursor: pointer;
    font-size: 1.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }
  .product-slider-btn:hover:not(:disabled) {
    background: #667eea;
    color: white;
    border-color: #667eea;
  }
  .product-slider-btn.prev { left: 0; }
  .product-slider-btn.next { right: 0; }
  .product-slider-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .product-slider-dots {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-top: 20px;
  }
  .product-slider-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #d1d5db;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }
  .product-slider-dot.active {
    background: #667eea;
    transform: scale(1.2);
  }
  @media (max-width: 900px) {
    .product-slider-track .product-card {
      flex: 0 0 calc(50% - 10px);
      min-width: calc(50% - 10px);
    }
  }
  @media (max-width: 600px) {
    .product-slider-container { padding: 0 10px; }
    .product-slider-track .product-card {
      flex: 0 0 100%;
      min-width: 100%;
    }
    .product-slider-btn { display: none; }
  }
</style>`;

export const BLOG_CARDS_STYLE_TAG = `<style id="blog-cards-styles">
  .blog-loader {
    width: 40px;
    height: 40px;
    border: 4px solid #e5e7eb;
    border-top-color: #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .blog-card {
    background: white;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    contain: layout style paint;
  }
  .blog-card:hover {
    box-shadow: 0 12px 24px rgba(0,0,0,0.15);
  }
  .blog-thumbnail {
    position: relative;
    width: 100%;
    aspect-ratio: 16/9;
    overflow: hidden;
    background: #f3f4f6;
  }
  .blog-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .blog-content {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
  }
  .blog-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .blog-date {
    font-size: 0.85rem;
    color: #6b7280;
  }
  .blog-description {
    font-size: 0.95rem;
    color: #4b5563;
    line-height: 1.5;
    margin: 0;
    flex: 1;
  }
  .blog-read-more {
    display: block;
    width: 100%;
    padding: 12px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    text-align: center;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 1rem;
    transition: box-shadow 0.15s ease;
    margin-top: auto;
  }
  .blog-read-more:hover {
    box-shadow: 0 8px 16px rgba(102, 126, 234, 0.4);
  }
  .blog-pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 15px;
    margin-top: 50px;
    padding: 20px 0;
  }
  .page-numbers {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .page-link {
    padding: 10px 16px;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    color: #374151;
    text-decoration: none;
    font-weight: 600;
    transition: border-color 0.15s ease, color 0.15s ease;
  }
  .page-link:hover {
    border-color: #667eea;
    color: #667eea;
  }
  .page-link.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-color: transparent;
    color: white;
  }
  .page-dots {
    color: #9ca3af;
    padding: 0 5px;
  }
  .page-prev, .page-next {
    background: #f9fafb;
  }
  @media (max-width: 768px) {
    .blog-cards-grid {
      grid-template-columns: repeat(2, 1fr) !important;
      gap: 20px !important;
    }
    .blog-pagination {
      flex-wrap: wrap;
    }
  }
  @media (max-width: 480px) {
    .blog-cards-grid {
      grid-template-columns: 1fr !important;
    }
    .page-numbers {
      order: 3;
      width: 100%;
      justify-content: center;
      margin-top: 10px;
    }
  }
  .blog-slider-container {
    position: relative;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 50px;
  }
  .blog-slider-wrapper {
    overflow: hidden;
  }
  .blog-slider-track {
    display: flex;
    gap: 20px;
    transition: transform 0.4s ease;
    padding: 10px 0;
  }
  .blog-slider-track .blog-card {
    flex: 0 0 calc(33.333% - 14px);
    min-width: calc(33.333% - 14px);
  }
  .blog-slider-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 44px;
    height: 44px;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 50%;
    cursor: pointer;
    font-size: 1.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }
  .blog-slider-btn:hover:not(:disabled) {
    background: #667eea;
    color: white;
    border-color: #667eea;
  }
  .blog-slider-btn.prev { left: 0; }
  .blog-slider-btn.next { right: 0; }
  .blog-slider-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .blog-slider-dots {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-top: 20px;
  }
  .blog-slider-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #d1d5db;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }
  .blog-slider-dot.active {
    background: #667eea;
    transform: scale(1.2);
  }
  @media (max-width: 900px) {
    .blog-slider-track .blog-card {
      flex: 0 0 calc(50% - 10px);
      min-width: calc(50% - 10px);
    }
  }
  @media (max-width: 600px) {
    .blog-slider-container { padding: 0 10px; }
    .blog-slider-track .blog-card {
      flex: 0 0 100%;
      min-width: 100%;
    }
    .blog-slider-btn { display: none; }
  }
</style>`;
