/**
 * Product SSR - Player & Media
 * Product player shell rendering for SSR
 */

import { escapeHtmlText } from '../utils/html-entities.js';
import { sanitizeProductDescriptionHtml, ALLOWED_PRODUCT_DESCRIPTION_TAGS } from '../utils/html-sanitizer.js';
import { stripUrlQueryHash, normalizeGalleryForPlayerSsr } from '../utils/url-helpers.js';
import { parseAddonGroupsForSsr, computeInitialDeliveryLabelForSsr, computeDeliveryBadgeForSsr } from './product-ssr.js';
import { renderStarsForSsr } from '../utils/star-renderer.js';
import { formatPriceForSsr } from '../utils/price-formatter.js';
import { renderSsrAddonsForm } from './product-renderer.js';
import { renderSsrReviewSliderThumbs, renderSsrReviewCards } from './review-ssr.js';

const PRODUCT_INITIAL_CONTENT_MARKER_RE = /<!--PRODUCT_INITIAL_CONTENT_START-->[\s\S]*?<!--PRODUCT_INITIAL_CONTENT_END-->/i;
const PRODUCT_CONTAINER_LOADING_RE = /id="product-container"\s+class="loading-state"/i;

export function optimizeThumbUrlForSsr(src, width = 280) {
  const raw = String(src || '').trim();
  if (!raw) return raw;
  if (!raw.includes('res.cloudinary.com')) return raw;
  const cloudinaryRegex = /(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)/;
  const match = raw.match(cloudinaryRegex);
  if (!match) return raw;
  return `${match[1]}f_auto,q_auto,w_${width}/${match[2]}`;
}

export function injectProductInitialContent(html, contentHtml, removeLoadingState = false) {
  if (!html || !contentHtml) return html;
  let out = String(html);

  if (PRODUCT_INITIAL_CONTENT_MARKER_RE.test(out)) {
    out = out.replace(
      PRODUCT_INITIAL_CONTENT_MARKER_RE,
      `<!--PRODUCT_INITIAL_CONTENT_START-->\n${contentHtml}\n      <!--PRODUCT_INITIAL_CONTENT_END-->`
    );
  }

  if (removeLoadingState) {
    out = out.replace(PRODUCT_CONTAINER_LOADING_RE, 'id="product-container"');
  }

  return out;
}

export function renderProductStep1PlayerShell(product, addonsInput = [], reviewsInput = []) {
  if (!product || typeof product !== 'object') return '';

  const addonGroups = parseAddonGroupsForSsr(addonsInput);
  const title = String(product.title || 'Product');
  const safeTitle = escapeHtmlText(title);
  const thumbSrcRaw = String(product.thumbnail_url || '').trim() || 'https://via.placeholder.com/1280x720?text=Preview';
  const thumbSrc = escapeHtmlText(thumbSrcRaw);
  const hasVideo = !!String(product.video_url || '').trim();
  const safeVideoUrl = escapeHtmlText(String(product.video_url || '').trim());
  const reviewCount = Math.max(0, parseInt(product.review_count, 10) || 0);
  const ratingAverage = Number(product.rating_average);
  const normalizedRating = Number.isFinite(ratingAverage) && ratingAverage > 0 ? ratingAverage : 5.0;
  const stars = renderStarsForSsr(normalizedRating);
  const reviewText = reviewCount === 0
    ? 'No reviews yet'
    : `${normalizedRating.toFixed(1)} (${reviewCount} ${reviewCount === 1 ? 'Review' : 'Reviews'})`;

  const normalPrice = Number(product.normal_price) || 0;
  const salePrice = Number(product.sale_price) || 0;
  const basePrice = salePrice > 0 ? salePrice : normalPrice;
  const basePriceText = formatPriceForSsr(basePrice);
  const normalPriceText = formatPriceForSsr(normalPrice);
  const discountOff = normalPrice > 0 && basePrice < normalPrice
    ? Math.round(((normalPrice - basePrice) / normalPrice) * 100)
    : 0;

  const initialDeliveryLabel = computeInitialDeliveryLabelForSsr(product, addonGroups);
  const deliveryBadge = computeDeliveryBadgeForSsr(initialDeliveryLabel);

  const mainImageTag = `
        <img
          src="${thumbSrc}"
          class="main-img"
          alt="${safeTitle || 'Product Image'}"
          fetchpriority="high"
          loading="eager"
          decoding="async"
          width="800"
          height="450"
          style="width:100%;height:100%;object-fit:cover;display:block;border-radius:12px;"
        >`;

  const playerHtml = hasVideo
    ? `
        <div class="video-facade"
             data-ssr-player-facade="1"
             data-video-url="${safeVideoUrl}"
             style="position:relative;width:100%;cursor:pointer;background:#000;aspect-ratio:16/9;border-radius:12px;overflow:hidden;">
          ${mainImageTag}
          <button class="play-btn-overlay"
                  type="button"
                  aria-label="Play video"
                  style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:80px;height:80px;background:rgba(0,0,0,0.7);border-radius:50%;border:none;display:flex;align-items:center;justify-content:center;color:white;z-index:10;cursor:pointer;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="white" aria-hidden="true" focusable="false">
              <path d="M8 5v14l11-7z"></path>
            </svg>
          </button>
        </div>`
    : mainImageTag;

  const galleryImages = normalizeGalleryForPlayerSsr(product.gallery_images, thumbSrcRaw, product.video_url);
  const galleryThumbHtml = galleryImages.map((src, idx) => {
    const optimizedSrc = optimizeThumbUrlForSsr(src, 280);
    const safeSrc = escapeHtmlText(optimizedSrc);
    const safeFullSrc = escapeHtmlText(src);
    return `
          <img
            src="${safeSrc}"
            class="thumb"
            alt="${safeTitle} - Gallery Image ${idx + 1}"
            data-media-kind="image"
            data-media-src="${safeFullSrc}"
            loading="lazy"
            decoding="async"
            width="140"
            height="100"
            style="min-width:140px;width:140px;height:100px;object-fit:cover;border-radius:10px;border:3px solid transparent;flex-shrink:0;"
          >`;
  }).join('');
  const reviewSliderThumbHtml = renderSsrReviewSliderThumbs(reviewsInput);

  const mainThumbHtml = hasVideo
    ? `
                <div class="thumb-wrapper" style="position:relative;display:inline-block;">
                  <img
                    src="${escapeHtmlText(optimizeThumbUrlForSsr(thumbSrcRaw, 280))}"
                    class="thumb active"
                    alt="${safeTitle} - Thumbnail"
                    data-media-kind="video-main"
                    data-media-src="${thumbSrc}"
                    loading="lazy"
                    decoding="async"
                    width="140"
                    height="100"
                    style="min-width:140px;width:140px;height:100px;object-fit:cover;border-radius:10px;border:3px solid #667eea;flex-shrink:0;"
                  >
                  <div class="thumb-play-btn"
                       aria-hidden="true"
                       style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.7);color:white;width:35px;height:35px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;padding-left:2px;pointer-events:none;opacity:1;visibility:visible;z-index:100;">▶</div>
                </div>`
    : `
                <img
                  src="${escapeHtmlText(optimizeThumbUrlForSsr(thumbSrcRaw, 280))}"
                  class="thumb active"
                  alt="${safeTitle} - Thumbnail"
                  data-media-kind="image"
                  data-media-src="${thumbSrc}"
                  loading="lazy"
                  decoding="async"
                  width="140"
                  height="100"
                  style="min-width:140px;width:140px;height:100px;object-fit:cover;border-radius:10px;border:3px solid #667eea;flex-shrink:0;"
                >`;

  const safeDescriptionHtml = sanitizeProductDescriptionHtml(product.description);

  const reviewSummaryHtml = reviewCount > 0
    ? `
      <div style="background:#f9fafb;padding:1.5rem;border-radius:8px;text-align:center;color:#6b7280;margin-bottom:2rem;">
        <span style="font-size:2rem;">&#11088; ${normalizedRating.toFixed(1)}</span>
        <p style="margin-top:0.5rem;">Based on ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}</p>
      </div>`
    : `
      <div style="background:#f9fafb;padding:1.5rem;border-radius:8px;text-align:center;color:#6b7280;margin-bottom:2rem;">
        <div style="font-size:3rem;margin-bottom:15px;">&#11088;</div>
        <p>No reviews yet. Be the first to leave a review!</p>
      </div>`;

  const reviewCardsHtml = renderSsrReviewCards(reviewsInput);
  const reviewsContentHtml = reviewCardsHtml
    ? `<div style="display:grid;grid-template-columns:1fr;gap:14px;">${reviewCardsHtml}</div>`
    : '';
  const addonsFormShellHtml = renderSsrAddonsForm(addonGroups, basePriceText);

  return `
      <div class="product-page" data-ssr-step="player">
        <div class="product-main-row">
          <div class="product-media-col" data-ssr-player-col="1">
          <div id="review-highlight" style="display:none;background:#f0fdf4;padding:10px;margin-bottom:10px;border-radius:8px;"></div>
            <div class="video-wrapper" data-video-src="${safeVideoUrl}" style="aspect-ratio:16/9;width:100%;">
${playerHtml}
            </div>
            <div style="position:relative;margin-top:15px;" data-ssr-slider-state="pending">
              <div class="thumbnails" id="thumbnails-slider" style="display:flex;gap:12px;overflow-x:auto;scroll-behavior:smooth;padding:8px 0;scrollbar-width:thin;">
${mainThumbHtml}
${galleryThumbHtml}
${reviewSliderThumbHtml}
              </div>
              <button type="button"
                      data-ssr-slider-arrow="left"
                      aria-label="Previous thumbnails"
                      style="position:absolute;left:0;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.7);color:white;border:none;width:35px;height:35px;border-radius:50%;cursor:pointer;font-size:24px;z-index:10;display:none;">‹</button>
              <button type="button"
                      data-ssr-slider-arrow="right"
                      aria-label="Next thumbnails"
                      style="position:absolute;right:0;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.7);color:white;border:none;width:35px;height:35px;border-radius:50%;cursor:pointer;font-size:24px;z-index:10;display:none;">›</button>
            </div>
          </div>
          <div class="product-info-col" data-ssr-info-col="1">
            <div class="product-info-panel">
              <h1 class="product-title">${safeTitle}</h1>
              <div class="rating-row" role="img" aria-label="Rating: ${normalizedRating.toFixed(1)} out of 5 stars, ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}">
                <span class="stars" aria-hidden="true">${stars}</span>
                <span class="review-count">${escapeHtmlText(reviewText)}</span>
              </div>
              <div class="badges-row">
                <div class="badge-box badge-delivery" id="delivery-badge">
                  <div class="icon" id="delivery-badge-icon">${deliveryBadge.icon}</div>
                  <span id="delivery-badge-text">${escapeHtmlText(deliveryBadge.text)}</span>
                </div>
                <div class="badge-box badge-price">
                  <div class="price-final">$${basePriceText}</div>
                  ${discountOff > 0
                    ? `<div style="font-size:0.9rem"><span class="price-original">$${normalPriceText}</span></div><div class="discount-tag">${discountOff}% OFF</div>`
                    : ''}
                </div>
              </div>
              <div class="digital-note" role="note">
                <span aria-hidden="true">&#128233;</span>
                <span><strong>Digital Delivery:</strong> Receive via WhatsApp/Email.</span>
              </div>
              <button id="book-now-trigger" type="button" class="btn-book-now" aria-expanded="false" aria-controls="addons-container">
                <span aria-hidden="true">&#127916;</span> Book Now - $${basePriceText}
              </button>
              <div id="addons-container" style="max-height:0;overflow:hidden;transition:max-height 0.4s ease-out, opacity 0.25s ease;opacity:0;" data-ssr-addons="1">
${addonsFormShellHtml}
              </div>
            </div>
          </div>
        </div>
        <div class="product-desc-row" data-ssr-desc="1">
          <div class="product-desc">
            <h2>Description</h2>
            <div>${safeDescriptionHtml}</div>
            <hr style="margin:2rem 0;border:0;border-top:1px solid #eee;">
            <h2>Customer Reviews</h2>
            ${reviewSummaryHtml}
            <div id="reviews-container" data-ssr-reviews="1">
              ${reviewsContentHtml}
            </div>
          </div>
        </div>
        <div id="product-navigation" class="product-navigation-section" data-ssr-nav="1">
          <div style="display:flex;justify-content:center;align-items:center;padding:30px 0;gap:20px;flex-wrap:wrap;">
            <div id="prev-product-btn" style="flex:1;max-width:300px;min-width:200px;display:none;"></div>
            <div id="next-product-btn" style="flex:1;max-width:300px;min-width:200px;display:none;"></div>
          </div>
        </div>
      </div>`;
}
