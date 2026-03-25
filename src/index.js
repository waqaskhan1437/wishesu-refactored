/**
 * Cloudflare Worker - Main Entry Point with HTML Caching
 * Modular ES Module Structure
 * OPTIMIZED: Moved helper functions to module level to avoid recreation per request
 * COLD START FIX: Uses warmupDB to initialize database early without blocking
 */

import { CORS, handleOptions } from './config/cors.js';
import { initDB, warmupDB } from './config/db.js';
import { VERSION, setVersion } from './config/constants.js';
import { routeApiRequest } from './router.js';
import { handleProductRouting } from './controllers/products.js';
import { handleSecureDownload, maybePurgeCache } from './controllers/admin.js';
import { cleanupExpired } from './controllers/whop.js';
import { generateBackupData, sendBackupEmail, createBackup as createBackupApi } from './controllers/backup.js';
import { generateProductSchema, generateCollectionSchema, generateVideoSchema, injectSchemaIntoHTML, generateBlogPostingSchema, generateQAPageSchema, generateBreadcrumbSchema, generateOrganizationSchema, generateWebSiteSchema } from './utils/schema.js';
import { getMimeTypeFromFilename } from './utils/upload-helper.js';
import { buildMinimalRobotsTxt, buildMinimalSitemapXml, getMinimalSEOSettings } from './controllers/seo-minimal.js';
import { getNoindexMetaTags, getSeoVisibilityRuleMatch } from './controllers/noindex.js';
import { canonicalProductPath } from './utils/formatting.js';
import { buildPublicProductStatusWhere } from './utils/product-visibility.js';
import { handleNoJsRoutes, renderNoJsAdminLoginPage } from './controllers/nojs.js';
import {
  BLOG_CARDS_STYLE_TAG,
  PRODUCT_CARDS_STYLE_TAG,
  ensureStyleTag,
  extractInlineRenderConfigs,
  renderBlogCardsSsrMarkup,
  renderProductCardsSsrMarkup,
  replaceSimpleContainerById
} from './utils/component-ssr.js';
import {
  HOME_PRODUCTS_BOOTSTRAP_ID,
  REVIEWS_WIDGET_STYLE_TAG,
  buildHomeProductsBootstrap,
  renderHomepageHeroPlayerSsr,
  renderHomepageProductGridSsr,
  renderReviewsWidgetSsrMarkup
} from './utils/homepage-ssr.js';
import { renderTermsFallbackPageHtml } from './utils/legal-pages.js';

// Inject analytics & verification meta tags (Google Analytics, Facebook Pixel, site verification)
import { injectAnalyticsAndMeta } from './controllers/analytics.js';

// Auth utilities
import { isAdminAuthed, createAdminSessionCookie, createLogoutCookie } from './utils/auth.js';


// =========================
// ADMIN AUTH HELPERS (Module Level - OPTIMIZED)
// =========================

function noStoreHeaders(extra = {}) {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
    ...extra
  };
}

function buildVersionedCacheKey(req, accept = 'text/html') {
  const cacheUrl = new URL(req.url);
  cacheUrl.searchParams.set('__cv', VERSION || '0');

  const headers = new Headers();
  if (accept) {
    headers.set('Accept', accept);
  }

  return new Request(cacheUrl.toString(), {
    method: 'GET',
    headers
  });
}

function isLocalHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost');
}

function getCanonicalHostname(url, env) {
  const configured = String(env?.CANONICAL_HOST || '').trim().toLowerCase();
  if (configured) return configured;
  const current = String(url?.hostname || '').toLowerCase();
  if (current.startsWith('www.')) return current.slice(4);
  return current;
}

function isInsecureRequest(url, req) {
  const forwardedProto = String(req.headers.get('x-forwarded-proto') || '').toLowerCase();
  if (forwardedProto) return forwardedProto !== 'https';
  return url.protocol !== 'https:';
}

function isEnabledFlag(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function isNoJsSsrEnabled(env) {
  return isEnabledFlag(env?.ENABLE_NOJS_SSR) || isEnabledFlag(env?.NOJS_SSR) || isEnabledFlag(env?.NOJS_MODE);
}

// Common automated scanner paths (WordPress/PHP/admin probes) that do not
// exist on this app. Fast-rejecting them avoids unnecessary subrequests and
// DB warmup work on every probe.
const SCANNER_PREFIXES = [
  '/wp-admin',
  '/wp-content',
  '/wp-includes',
  '/phpmyadmin',
  '/pma',
  '/adminer',
  '/mysql',
  '/xmlrpc.php',
  '/cgi-bin',
  '/vendor/',
  '/boaform',
  '/hnap1',
  '/.git',
  '/.env'
];

const SCANNER_PATH_RE = /\.(php[0-9]?|phtml|asp|aspx|jsp|cgi|env|ini|sql|bak|old|log|swp)$/i;
const DYNAMIC_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
// Top-level `/api/{segment}` allowlist. Keep aligned with `src/router.js`.
const KNOWN_API_SEGMENTS = new Set([
  'admin',
  'backup',
  'blog',
  'blogs',
  'chat',
  'coupons',
  'debug',
  'forum',
  'health',
  'lead',
  'order',
  'orders',
  'page',
  'pages',
  'payment',
  'paypal',
  'product',
  'products',
  'purge-cache',
  'r2',
  'reviews',
  'settings',
  'time',
  'upload',
  'whop'
]);

function isLikelyScannerPath(pathname) {
  const p = String(pathname || '').toLowerCase();
  if (!p || p === '/') return false;

  if (SCANNER_PREFIXES.some((prefix) => p.startsWith(prefix))) return true;
  if (p.includes('/.git/') || p.includes('/.env')) return true;
  if (SCANNER_PATH_RE.test(p) && !p.endsWith('.html')) return true;

  return false;
}

function canLookupDynamicSlug(slug) {
  const s = String(slug || '').toLowerCase();
  return DYNAMIC_SLUG_RE.test(s);
}

function isKnownApiPath(pathname) {
  const p = String(pathname || '');
  if (!p.startsWith('/api/')) return true;
  const apiTail = p.slice('/api/'.length);
  const firstSegment = apiTail.split('/')[0].toLowerCase();
  return !!firstSegment && KNOWN_API_SEGMENTS.has(firstSegment);
}

function isMalformedNestedSlug(pathname, prefix) {
  const p = String(pathname || '');
  if (!p.startsWith(prefix) || p === prefix || p.includes('.')) return false;
  let slug = p.slice(prefix.length);
  if (slug.endsWith('/')) slug = slug.slice(0, -1);
  if (!slug) return false;
  if (slug.includes('/')) return true;
  return !canLookupDynamicSlug(slug);
}

function escapeHtmlText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ALLOWED_PRODUCT_DESCRIPTION_TAGS = new Set([
  'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'b', 'i', 'u',
  'ul', 'ol', 'li',
  'a', 'blockquote', 'code', 'pre', 'hr', 'span'
]);

function decodeBasicHtmlEntities(value) {
  let decoded = String(value || '');
  for (let i = 0; i < 2; i += 1) {
    const next = decoded
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'");
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function sanitizeProductDescriptionHtml(rawInput) {
  const raw = String(rawInput || '').trim();
  if (!raw) return 'No description available.';

  const hasMarkupHint = /<[a-z!/][^>]*>/i.test(raw) || /&lt;[a-z!/]/i.test(raw);
  if (!hasMarkupHint) {
    return escapeHtmlText(raw).replace(/\n/g, '<br>');
  }

  let html = decodeBasicHtmlEntities(raw)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(/<link[\s\S]*?>/gi, '')
    .replace(/<meta[\s\S]*?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  html = html.replace(/<[^>]*>/g, (tag) => {
    if (/^<!--/.test(tag)) return '';

    const closeMatch = tag.match(/^<\s*\/\s*([a-z0-9]+)\s*>$/i);
    if (closeMatch) {
      const tagName = String(closeMatch[1] || '').toLowerCase();
      return ALLOWED_PRODUCT_DESCRIPTION_TAGS.has(tagName) ? `</${tagName}>` : '';
    }

    const openMatch = tag.match(/^<\s*([a-z0-9]+)([^>]*)>$/i);
    if (!openMatch) return '';

    const tagName = String(openMatch[1] || '').toLowerCase();
    if (!ALLOWED_PRODUCT_DESCRIPTION_TAGS.has(tagName)) return '';

    if (tagName === 'br' || tagName === 'hr') return `<${tagName}>`;

    if (tagName === 'a') {
      const attrs = String(openMatch[2] || '');
      const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const targetMatch = attrs.match(/\btarget\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);

      const hrefRaw = String(
        (hrefMatch && (hrefMatch[1] || hrefMatch[2] || hrefMatch[3])) || '#'
      ).trim();
      const safeHref = /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(hrefRaw) ? hrefRaw : '#';

      const targetRaw = String(
        (targetMatch && (targetMatch[1] || targetMatch[2] || targetMatch[3])) || ''
      ).trim().toLowerCase();

      if (targetRaw === '_blank') {
        return `<a href="${escapeHtmlText(safeHref)}" target="_blank" rel="noopener noreferrer">`;
      }
      return `<a href="${escapeHtmlText(safeHref)}">`;
    }

    return `<${tagName}>`;
  });

  const cleaned = html.trim();
  return cleaned || 'No description available.';
}

const PRODUCT_INITIAL_CONTENT_MARKER_RE = /<!--PRODUCT_INITIAL_CONTENT_START-->[\s\S]*?<!--PRODUCT_INITIAL_CONTENT_END-->/i;
const PRODUCT_CONTAINER_LOADING_RE = /id="product-container"\s+class="loading-state"/i;

function stripUrlQueryHash(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  return s.split('#')[0].split('?')[0];
}

function isLikelyVideoMediaUrl(value) {
  const s = stripUrlQueryHash(value).toLowerCase();
  if (!s) return false;
  if (s.includes('youtube.com') || s.includes('youtu.be')) return true;
  return /\.(mp4|webm|mov|mkv|avi|m4v|flv|wmv|m3u8|mpd)(?:$)/i.test(s);
}

function isLikelyImageMediaUrl(value) {
  const s = String(value || '').trim().toLowerCase();
  if (!s) return false;
  if (s.startsWith('data:image/')) return true;
  if (s.startsWith('/')) return true;
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('//')) return true;
  return false;
}

function toGalleryArray(value) {
  if (Array.isArray(value)) return value;
  const s = String(value || '').trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  if (s.includes(',')) {
    return s.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [s];
}

function normalizeGalleryForPlayerSsr(galleryValue, thumbnailUrl, videoUrl) {
  const input = toGalleryArray(galleryValue);
  const normalizedMain = stripUrlQueryHash(thumbnailUrl);
  const normalizedVideo = stripUrlQueryHash(videoUrl);
  const seen = new Set();
  const out = [];

  for (const item of input) {
    const raw = String(item || '').trim();
    if (!raw) continue;
    if (!isLikelyImageMediaUrl(raw)) continue;
    if (isLikelyVideoMediaUrl(raw)) continue;
    const normalized = stripUrlQueryHash(raw);
    if (!normalized) continue;
    if (normalizedMain && normalized === normalizedMain) continue;
    if (normalizedVideo && normalized === normalizedVideo) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(raw);
    if (out.length >= 8) break;
  }

  return out;
}

function optimizeThumbUrlForSsr(src, width = 280) {
  const raw = String(src || '').trim();
  if (!raw) return raw;
  if (!raw.includes('res.cloudinary.com')) return raw;
  const cloudinaryRegex = /(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)/;
  const match = raw.match(cloudinaryRegex);
  if (!match) return raw;
  return `${match[1]}f_auto,q_auto,w_${width}/${match[2]}`;
}

function parseAddonGroupsForSsr(addonsInput) {
  if (Array.isArray(addonsInput)) return addonsInput;
  const s = String(addonsInput || '').trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function formatPriceForSsr(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0';
  const hasFraction = Math.abs(amount - Math.round(amount)) > 0.0001;
  if (hasFraction) {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  return amount.toLocaleString('en-US');
}

function getDeliveryTextFromInstantDaysForSsr(isInstant, days) {
  if (isInstant) return 'Instant Delivery In 60 Minutes';
  const dayNum = parseInt(days, 10) || 1;
  if (dayNum === 1) return '24 Hour Express Delivery';
  return `${dayNum} Days Delivery`;
}

function computeInitialDeliveryLabelForSsr(product, addonGroups) {
  const deliveryField = (addonGroups || []).find((g) => (
    g &&
    g.id === 'delivery-time' &&
    (g.type === 'radio' || g.type === 'select') &&
    Array.isArray(g.options)
  ));

  if (deliveryField) {
    const defaultOption = deliveryField.options.find((o) => o && o.default) || deliveryField.options[0];
    if (defaultOption) {
      if (defaultOption.delivery && typeof defaultOption.delivery === 'object') {
        return getDeliveryTextFromInstantDaysForSsr(
          !!defaultOption.delivery.instant,
          parseInt(defaultOption.delivery.days, 10) || 1
        );
      }
      if (defaultOption.label) return String(defaultOption.label);
    }
  }

  return getDeliveryTextFromInstantDaysForSsr(
    !!product?.instant_delivery,
    parseInt(product?.delivery_time_days, 10) || parseInt(product?.normal_delivery_text, 10) || 1
  );
}

function computeDeliveryBadgeForSsr(label) {
  const raw = String(label || '');
  const v = raw.toLowerCase();

  if (v.includes('instant') || v.includes('60') || v.includes('1 hour')) {
    return { icon: '&#9889;', text: raw || 'Instant Delivery In 60 Minutes' };
  }
  if (v.includes('24') || v.includes('express') || v.includes('1 day') || v.includes('24 hour')) {
    return { icon: '&#128640;', text: raw || '24 Hour Express Delivery' };
  }
  if (v.includes('48') || v.includes('2 day')) {
    return { icon: '&#128230;', text: raw || '2 Days Delivery' };
  }
  if (v.includes('3 day') || v.includes('72')) {
    return { icon: '&#128197;', text: raw || '3 Days Delivery' };
  }
  const daysMatch = v.match(/(\d+)\s*day/i);
  if (daysMatch) {
    const numDays = parseInt(daysMatch[1], 10) || 2;
    return { icon: '&#128230;', text: raw || `${numDays} Days Delivery` };
  }
  return { icon: '&#128666;', text: raw || '2 Days Delivery' };
}

function renderStarsForSsr(ratingAverage) {
  const rating = Number.isFinite(Number(ratingAverage)) ? Number(ratingAverage) : 5;
  const fullStars = Math.max(0, Math.min(5, Math.floor(rating)));
  const halfStar = rating % 1 >= 0.5 ? 1 : 0;
  const emptyStars = Math.max(0, 5 - fullStars - halfStar);
  return '★'.repeat(fullStars) + (halfStar ? '☆' : '') + '☆'.repeat(emptyStars);
}

function formatReviewDateForSsr(value) {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US');
  } catch (_) {
    return '';
  }
}

function parseReviewVideoMetadataForSsr(review) {
  if (!review || !review.delivered_video_metadata) return {};
  try {
    const parsed = JSON.parse(review.delivered_video_metadata);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function extractYouTubeIdForSsr(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const match = s.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{6,})/i);
  return match ? String(match[1] || '').trim() : '';
}

function resolveReviewVideoMediaForSsr(review) {
  const metadata = parseReviewVideoMetadataForSsr(review);
  const youtubeUrl = String(metadata.youtubeUrl || metadata.reviewYoutubeUrl || '').trim();
  const fallbackUrl = String(review?.delivered_video_url || metadata.downloadUrl || '').trim();
  const videoUrl = youtubeUrl || fallbackUrl;
  const isPublic = Number(review?.show_on_product) === 1;

  if (!videoUrl || !isPublic) {
    return { canWatch: false, videoUrl: '', posterUrl: '', isNativeVideo: false };
  }

  let posterUrl = String(
    review?.delivered_thumbnail_url ||
    metadata.thumbnailUrl ||
    metadata.posterUrl ||
    metadata.previewImage ||
    ''
  ).trim();

  const youtubeId = extractYouTubeIdForSsr(videoUrl);
  if (!posterUrl && youtubeId) {
    posterUrl = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
  }

  const normalizedVideo = stripUrlQueryHash(videoUrl).toLowerCase();
  const isNativeVideo = (
    /\.(mp4|webm|mov|m4v|m3u8|mpd)$/i.test(normalizedVideo) ||
    normalizedVideo.includes('/video/upload/')
  );

  return { canWatch: true, videoUrl, posterUrl, isNativeVideo };
}

function renderReviewMediaDataAttrsForSsr(review, media) {
  const reviewerName = String(
    review?.customer_name || review?.author_name || 'Customer'
  ).trim() || 'Customer';
  const reviewTextRaw = String(review?.review_text || review?.comment || '')
    .replace(/\s+/g, ' ')
    .trim();
  const reviewText = reviewTextRaw.length > 600
    ? `${reviewTextRaw.slice(0, 597)}...`
    : reviewTextRaw;

  const attrs = [
    `data-review-video-url="${escapeHtmlText(String(media?.videoUrl || ''))}"`,
    `data-review-poster-url="${escapeHtmlText(String(media?.posterUrl || ''))}"`,
    `data-reviewer-name="${escapeHtmlText(reviewerName)}"`,
    `data-review-text="${escapeHtmlText(reviewText)}"`
  ];
  return attrs.join(' ');
}

function renderSsrReviewCards(reviewsInput = []) {
  const reviews = Array.isArray(reviewsInput) ? reviewsInput.slice(0, 5) : [];
  if (reviews.length === 0) return '';

  return reviews.map((review) => {
    const reviewerName = escapeHtmlText(
      String(review?.customer_name || review?.author_name || 'Anonymous')
    );
    const reviewText = escapeHtmlText(
      String(review?.review_text || review?.comment || '')
    ).replace(/\n/g, '<br>');
    const rating = Math.max(1, Math.min(5, parseInt(review?.rating, 10) || 5));
    const stars = '&#9733;'.repeat(rating) + '&#9734;'.repeat(5 - rating);
    const dateText = escapeHtmlText(formatReviewDateForSsr(review?.created_at));
    const reviewMedia = resolveReviewVideoMediaForSsr(review);
    const watchDataAttrs = renderReviewMediaDataAttrsForSsr(review, reviewMedia);
    const canWatch = !!reviewMedia.canWatch && !!reviewMedia.videoUrl;
    const posterThumb = reviewMedia.posterUrl
      ? `<img src="${escapeHtmlText(optimizeThumbUrlForSsr(reviewMedia.posterUrl, 520))}" alt="Review video thumbnail" loading="lazy" decoding="async" width="260" height="146" style="width:100%;height:100%;object-fit:cover;display:block;">`
      : '<div style="width:100%;height:100%;background:#0f172a;"></div>';
    const watchRowHtml = canWatch
      ? `
        <div class="review-portfolio-row" style="display:flex;align-items:center;gap:16px;margin-top:16px;padding-top:16px;border-top:1px solid #f3f4f6;flex-wrap:wrap;">
          <div data-review-watch="1" data-review-portfolio-thumb="1" ${watchDataAttrs} style="position:relative;min-width:260px;width:260px;height:146px;flex-shrink:0;cursor:pointer;border-radius:10px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);background:#000;">
            ${posterThumb}
            <div style="position:absolute;top:8px;right:8px;background:rgba(16,185,129,0.95);color:white;padding:5px 12px;border-radius:6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;box-shadow:0 2px 6px rgba(0,0,0,0.3);">Review</div>
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.75);color:white;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;padding-left:3px;pointer-events:none;">&#9654;</div>
          </div>
          <button type="button" data-review-watch="1" ${watchDataAttrs} style="background:#111827;color:white;border:0;padding:12px 16px;border-radius:8px;cursor:pointer;font-weight:600;font-size:15px;">&#9654; Watch Video</button>
        </div>`
      : '';

    return `
      <article data-ssr-review-card="1" style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:6px;">
          <strong style="font-size:0.95rem;color:#1f2937;">${reviewerName}</strong>
          ${dateText ? `<span style="font-size:0.78rem;color:#6b7280;">${dateText}</span>` : ''}
        </div>
        <div style="color:#fbbf24;margin-bottom:8px;font-size:0.95rem;" aria-label="${rating} out of 5 stars">${stars}</div>
        <div style="font-size:0.92rem;color:#4b5563;line-height:1.5;">${reviewText || 'No review text provided.'}</div>
        ${watchRowHtml}
      </article>`;
  }).join('');
}

function renderSsrReviewSliderThumbs(reviewsInput = []) {
  const reviews = Array.isArray(reviewsInput) ? reviewsInput : [];
  const reviewMediaList = reviews
    .map((review) => ({ review, media: resolveReviewVideoMediaForSsr(review) }))
    .filter((item) => !!item.media.canWatch && !!item.media.videoUrl)
    .slice(0, 20);

  if (reviewMediaList.length === 0) return '';

  return reviewMediaList.map(({ review, media }) => {
    const dataAttrs = renderReviewMediaDataAttrsForSsr(review, media);
    const posterHtml = media.posterUrl
      ? `<img src="${escapeHtmlText(optimizeThumbUrlForSsr(media.posterUrl, 280))}" alt="Review video thumbnail" loading="lazy" decoding="async" width="140" height="100" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;background:#1a1a2e;">`
      : '<div style="width:100%;height:100%;background:#1a1a2e;"></div>';

    return `
              <div data-review-slider-thumb="1" data-review-watch="1" ${dataAttrs} style="position:relative;min-width:140px;width:140px;height:100px;flex-shrink:0;cursor:pointer;border-radius:10px;overflow:hidden;border:3px solid transparent;transition:border-color 0.15s ease, transform 0.15s ease;background:#1a1a2e;">
                ${posterHtml}
                <div style="position:absolute;bottom:4px;right:4px;background:rgba(16,185,129,0.95);color:white;padding:3px 8px;border-radius:4px;font-size:10px;font-weight:700;z-index:10;">Review</div>
                <div class="thumb-play-btn" aria-hidden="true" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.6);color:white;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;padding-left:2px;z-index:100;pointer-events:none;">&#9654;</div>
              </div>`;
  }).join('');
}
function sanitizeAddonIdForSsr(raw, fallback = 'addon') {
  const source = String(raw || '').trim() || String(fallback || 'addon');
  const normalized = source
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || String(fallback || 'addon');
}

function renderAddonDataAttrsForSsr(optionInput = {}) {
  const option = optionInput && typeof optionInput === 'object' ? optionInput : {};
  const attrs = [];
  const price = Number(option.price);
  attrs.push(`data-price="${escapeHtmlText(Number.isFinite(price) ? String(price) : '0')}"`);

  if (option.file) {
    attrs.push('data-needs-file="true"');
    attrs.push(`data-file-qty="${escapeHtmlText(String(parseInt(option.fileQuantity, 10) || 1))}"`);
  }
  if (option.textField) {
    attrs.push('data-needs-text="true"');
  }
  if (option.delivery && typeof option.delivery === 'object') {
    attrs.push(`data-delivery-instant="${option.delivery.instant ? 'true' : 'false'}"`);
    attrs.push(`data-delivery-days="${escapeHtmlText(String(parseInt(option.delivery.days, 10) || 1))}"`);
  }

  return attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
}

function renderSsrAddonField(fieldInput, index) {
  const field = fieldInput && typeof fieldInput === 'object' ? fieldInput : {};
  const type = String(field.type || 'text').trim().toLowerCase();
  const fallbackId = `addon-${index + 1}`;
  const baseId = sanitizeAddonIdForSsr(field.id || fallbackId, fallbackId);
  const labelText = escapeHtmlText(String(field.label || field.text || '').trim());
  const required = !!field.required;
  const requiredHtml = required
    ? ' <span style="color:red" aria-hidden="true">*</span><span class="sr-only"> (required)</span>'
    : '';

  if (type === 'heading') {
    const headingText = escapeHtmlText(String(field.text || field.label || '').trim());
    if (!headingText) return '';
    return `
      <h3 style="margin-top:1.5rem;font-size:1.1rem;">${headingText}</h3>`;
  }

  const options = Array.isArray(field.options) ? field.options : [];

  if (type === 'select') {
    const optionsHtml = options.map((optInput, idx) => {
      const opt = optInput && typeof optInput === 'object' ? optInput : {};
      const optLabel = escapeHtmlText(String(opt.label || `Option ${idx + 1}`));
      const optPrice = Number(opt.price);
      const priceSuffix = Number.isFinite(optPrice) && optPrice > 0 ? ` (+$${formatPriceForSsr(optPrice)})` : '';
      const selectedAttr = opt.default ? ' selected' : '';
      return `
          <option value="${optLabel}"${renderAddonDataAttrsForSsr(opt)}${selectedAttr}>${optLabel}${priceSuffix}</option>`;
    }).join('');

    return `
      <div class="addon-group" role="group" aria-label="${labelText || escapeHtmlText(baseId)}">
        ${labelText ? `<label class="addon-group-label" id="${escapeHtmlText(baseId)}-label" for="${escapeHtmlText(baseId)}">${labelText}${requiredHtml}</label>` : ''}
        <select class="form-select" name="${escapeHtmlText(baseId)}" id="${escapeHtmlText(baseId)}"${required ? ' required' : ''}>
${optionsHtml}
        </select>
        <div class="addon-extras"></div>
      </div>`;
  }

  if (type === 'radio' || type === 'checkbox_group') {
    const isRadio = type === 'radio';
    const optionCards = options.map((optInput, idx) => {
      const opt = optInput && typeof optInput === 'object' ? optInput : {};
      const optLabel = escapeHtmlText(String(opt.label || `Option ${idx + 1}`));
      const optPrice = Number(opt.price);
      const priceHtml = Number.isFinite(optPrice) && optPrice > 0
        ? `<span class="opt-price">+$${formatPriceForSsr(optPrice)}</span>`
        : '';
      const checkedAttr = opt.default ? ' checked' : '';
      const selectedClass = opt.default ? ' selected' : '';
      const requiredAttr = isRadio && required && idx === 0 ? ' required' : '';

      if (isRadio) {
        return `
          <label class="addon-option-card${selectedClass}">
            <input type="radio"
                   name="${escapeHtmlText(baseId)}"
                   value="${optLabel}"
                   class="addon-radio"${renderAddonDataAttrsForSsr(opt)}${checkedAttr}${requiredAttr}>
            ${optLabel}
            ${priceHtml}
          </label>`;
      }

      return `
          <div>
            <label class="addon-option-card${selectedClass}">
              <input type="checkbox"
                     name="${escapeHtmlText(baseId)}"
                     value="${optLabel}"
                     class="addon-checkbox"${renderAddonDataAttrsForSsr(opt)}${checkedAttr}>
              ${optLabel}
              ${priceHtml}
            </label>
            <div style="margin-left:1.5rem;"></div>
          </div>`;
    }).join('');

    return `
      <div class="addon-group" role="group" aria-label="${labelText || escapeHtmlText(baseId)}">
        ${labelText ? `<label class="addon-group-label" id="${escapeHtmlText(baseId)}-label">${labelText}${requiredHtml}</label>` : ''}
        <div>${optionCards}</div>
        ${isRadio ? '<div class="addon-extras"></div>' : ''}
      </div>`;
  }

  const isTextarea = type === 'textarea';
  const safeType = isTextarea ? '' : escapeHtmlText(type || 'text');
  const placeholder = String(field.placeholder || '').trim();
  const placeholderAttr = placeholder ? ` placeholder="${escapeHtmlText(placeholder)}"` : '';
  const requiredAttr = required ? ' required' : '';
  const maxLength = isTextarea ? 2000 : (safeType === 'email' ? 100 : (safeType === 'text' ? 200 : 0));
  const maxLengthAttr = maxLength > 0 ? ` maxlength="${maxLength}"` : '';
  const acceptAttr = safeType === 'file' ? ' accept="image/*"' : '';

  if (isTextarea) {
    return `
      <div class="addon-group" role="group" aria-label="${labelText || escapeHtmlText(baseId)}">
        ${labelText ? `<label class="addon-group-label" id="${escapeHtmlText(baseId)}-label" for="${escapeHtmlText(baseId)}">${labelText}${requiredHtml}</label>` : ''}
        <textarea class="form-textarea" name="${escapeHtmlText(baseId)}" id="${escapeHtmlText(baseId)}"${placeholderAttr}${requiredAttr}${maxLengthAttr}></textarea>
        <div class="addon-extras"></div>
      </div>`;
  }

  return `
      <div class="addon-group" role="group" aria-label="${labelText || escapeHtmlText(baseId)}">
        ${labelText ? `<label class="addon-group-label" id="${escapeHtmlText(baseId)}-label" for="${escapeHtmlText(baseId)}">${labelText}${requiredHtml}</label>` : ''}
        <input class="form-input" type="${safeType || 'text'}" name="${escapeHtmlText(baseId)}" id="${escapeHtmlText(baseId)}"${placeholderAttr}${requiredAttr}${maxLengthAttr}${acceptAttr}>
        <div class="addon-extras"></div>
      </div>`;
}

function renderSsrAddonsForm(addonGroupsInput, basePriceText) {
  const addonGroups = Array.isArray(addonGroupsInput) ? addonGroupsInput : [];
  const fieldsHtml = addonGroups.map((field, idx) => renderSsrAddonField(field, idx)).join('');
  const fallbackHtml = fieldsHtml
    ? fieldsHtml
    : '<div class="addon-group" style="color:#6b7280;">No add-ons configured for this product.</div>';

  return `
                <form id="addons-form" style="padding-top:1.5rem;border-top:1px solid #e5e7eb;margin-top:1.5rem;">
${fallbackHtml}
                </form>
                <div data-checkout-footer="1" style="margin-top:2rem;padding-top:1rem;border-top:1px solid #e5e5e5;">
                  <button id="checkout-btn" type="button" class="btn-buy">Proceed to Checkout - $${basePriceText}</button>
                </div>`;
}

function renderProductStep1PlayerShell(product, addonsInput = [], reviewsInput = []) {
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

function injectProductInitialContent(html, contentHtml, removeLoadingState = false) {
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

function replaceLegacyBrandTokens(text, siteTitle) {
  if (!text) return text;
  return String(text)
    .replace(/\bWishVideo\b/gi, siteTitle)
    .replace(/\bWishesU\b/gi, siteTitle);
}

function resolveFallbackSiteTitle(urlObj) {
  const host = String(urlObj?.hostname || '').replace(/^www\./i, '').trim();
  return host || 'prankwish.com';
}

async function getSeoSettingsObject(env) {
  try {
    const response = await getMinimalSEOSettings(env);
    if (response && typeof response.json === 'function') {
      const parsed = await response.json();
      if (parsed && parsed.settings && typeof parsed.settings === 'object') {
        return parsed.settings;
      }
    } else if (response && response.settings && typeof response.settings === 'object') {
      return response.settings;
    }
  } catch (_) {}
  return {};
}

function resolveSiteTitle(seoSettings, urlObj) {
  const configured = String(seoSettings?.site_title || '').trim();
  if (configured) return configured;
  return resolveFallbackSiteTitle(urlObj);
}

function applySiteTitleToHtml(html, siteTitle) {
  if (!html || !siteTitle) return html;
  const safeSiteTitle = escapeHtmlText(siteTitle);
  return html.replace(/<title>([\s\S]*?)<\/title>/i, (match, currentTitle) => {
    const rewritten = replaceLegacyBrandTokens(currentTitle, safeSiteTitle);
    if (rewritten === currentTitle) return match;
    return `<title>${rewritten}</title>`;
  });
}

const CANONICAL_ALIAS_MAP = new Map([
  ['/index.html', '/'],
  ['/home', '/'],
  ['/home/', '/'],
  ['/page-builder', '/admin/page-builder.html'],
  ['/page-builder/', '/admin/page-builder.html'],
  ['/page-builder.html', '/admin/page-builder.html'],
  ['/landing-builder', '/admin/landing-builder.html'],
  ['/landing-builder/', '/admin/landing-builder.html'],
  ['/landing-builder.html', '/admin/landing-builder.html'],
  ['/blog/index.html', '/blog'],
  ['/blog.html', '/blog'],
  ['/forum/index.html', '/forum'],
  ['/forum.html', '/forum'],
  ['/terms/', '/terms'],
  ['/terms/index.html', '/terms'],
  ['/terms.html', '/terms'],
  ['/products/index.html', '/products'],
  ['/products.html', '/products'],
  ['/products-grid', '/products'],
  ['/products-grid/', '/products'],
  ['/products-grid.html', '/products'],
  ['/checkout/', '/checkout'],
  ['/checkout/index.html', '/checkout'],
  ['/success.html', '/success'],
  ['/buyer-order/', '/buyer-order'],
  ['/buyer-order.html', '/buyer-order'],
  ['/order-detail/', '/order-detail'],
  ['/order-detail.html', '/order-detail'],
  ['/order-success', '/success'],
  ['/order-success.html', '/success']
]);

const DIRECT_INTERNAL_ALIAS_PATHS = new Set([
  '/index.html',
  '/home',
  '/home/',
  '/blog/index.html',
  '/blog.html',
  '/forum/index.html',
  '/forum.html',
  '/terms',
  '/terms/',
  '/terms/index.html',
  '/terms.html',
  '/products.html',
  '/products-grid',
  '/products-grid/',
  '/products-grid.html',
  '/products/index.html',
  '/checkout/',
  '/checkout/index.html',
  '/success/',
  '/success.html',
  '/buyer-order/',
  '/buyer-order.html',
  '/order-detail/',
  '/order-detail.html',
  '/order-success',
  '/order-success.html'
]);

export function shouldServeCanonicalAliasDirectly(pathname) {
  const raw = String(pathname || '/').trim() || '/';
  return DIRECT_INTERNAL_ALIAS_PATHS.has(raw);
}

function normalizeCanonicalPath(pathname) {
  let p = String(pathname || '/').trim() || '/';
  p = CANONICAL_ALIAS_MAP.get(p) || p;

  // Keep trailing slash only for root and admin/api namespaces.
  if (
    p.length > 1 &&
    p.endsWith('/') &&
    !p.startsWith('/admin/') &&
    !p.startsWith('/api/')
  ) {
    p = p.slice(0, -1);
  }
  return p || '/';
}

export function getCanonicalRedirectPath(pathname) {
  const raw = String(pathname || '/').trim() || '/';
  if (raw === '/admin/' || raw === '/api/') return null;
  if (raw.startsWith('/admin/') || raw.startsWith('/api/')) return null;
  if (raw === '/blog/' || raw === '/forum/' || raw === '/products/') return null;
  if (shouldServeCanonicalAliasDirectly(raw)) return null;
  const normalized = normalizeCanonicalPath(raw);
  return normalized !== raw ? normalized : null;
}

function isLocalDevHost(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

function isSensitiveNoindexPath(pathname) {
  const p = normalizeCanonicalPath(pathname);
  if (
    p === '/checkout' ||
    p === '/success' ||
    p === '/buyer-order' ||
    p === '/order-detail'
  ) {
    return true;
  }
  if (p === '/admin' || p.startsWith('/admin/')) return true;
  if (p === '/api' || p.startsWith('/api/')) return true;
  if (p === '/order' || p.startsWith('/order/')) return true;
  if (p === '/download' || p.startsWith('/download/')) return true;
  return false;
}

const SITE_COMPONENTS_SSR_TTL_MS = 10 * 1000;
const siteComponentsSsrCache = {
  value: null,
  fetchedAt: 0,
  hasValue: false
};

function ensureGlobalComponentsRuntimeScript(html) {
  if (!html) return html;
  const source = String(html);
  if (!/<body[^>]*>/i.test(source)) return source;
  if (/global-components\.js/i.test(source)) return source;
  return source.replace(
    /<body([^>]*)>/i,
    '<body$1>\n<script defer src="/js/global-components.js"></script>'
  );
}

function upsertBodyDataAttribute(html, attrName, attrValue = '1') {
  if (!html || !attrName) return html;
  return String(html).replace(/<body([^>]*)>/i, (match, attrs = '') => {
    const attrRe = new RegExp(`\\s${attrName}=(["']).*?\\1`, 'i');
    if (attrRe.test(attrs)) {
      return `<body${attrs.replace(attrRe, ` ${attrName}="${attrValue}"`)}>`;
    }
    return `<body${attrs} ${attrName}="${attrValue}">`;
  });
}

function hasGlobalHeaderMarkup(html) {
  const source = String(html || '');
  if (/id=["']global-header["']/i.test(source)) return true;
  return /class=["'][^"']*\bsite-header\b[^"']*["']/i.test(source);
}

function hasGlobalFooterMarkup(html) {
  const source = String(html || '');
  if (/id=["']global-footer["']/i.test(source)) return true;
  return /class=["'][^"']*\bsite-footer\b[^"']*["']/i.test(source);
}

function injectMarkupIntoSlot(html, slotId, markup) {
  if (!html || !slotId || !markup) return html;
  const slotRe = new RegExp(
    `<([a-zA-Z0-9:-]+)([^>]*)\\bid=["']${slotId}["']([^>]*)>[\\s\\S]*?<\\/\\1>`,
    'i'
  );
  if (!slotRe.test(html)) return html;
  return String(html).replace(slotRe, (_full, tagName, before = '', after = '') => {
    const attrsBase = `${before} id="${slotId}"${after}`;
    const attrs = /\bdata-injected\s*=/.test(attrsBase)
      ? attrsBase
      : `${attrsBase} data-injected="1"`;
    return `<${tagName}${attrs}>${markup}</${tagName}>`;
  });
}

function injectGlobalHeaderSsr(html, headerCode) {
  if (!html || !headerCode || hasGlobalHeaderMarkup(html)) return html;
  const withSlot = injectMarkupIntoSlot(html, 'global-header-slot', headerCode);
  if (withSlot !== html) return withSlot;
  if (!/<body[^>]*>/i.test(html)) return html;
  return String(html).replace(
    /<body([^>]*)>/i,
    `<body$1>\n<div id="global-header">${headerCode}</div>`
  );
}

function injectGlobalFooterSsr(html, footerCode) {
  if (!html || !footerCode || hasGlobalFooterMarkup(html)) return html;
  const withSlot = injectMarkupIntoSlot(html, 'global-footer-slot', footerCode);
  if (withSlot !== html) return withSlot;
  const source = String(html);
  if (/<\/body>/i.test(source)) {
    return source.replace(/<\/body>/i, `<div id="global-footer">${footerCode}</div>\n</body>`);
  }
  return `${source}\n<div id="global-footer">${footerCode}</div>`;
}

function isExcludedFromGlobalComponents(excludedPages, pathname) {
  if (!Array.isArray(excludedPages) || excludedPages.length === 0) return false;
  const path = String(pathname || '/');
  for (const item of excludedPages) {
    const excluded = String(item || '').trim();
    if (!excluded) continue;
    if (excluded === path) return true;
    if (excluded.endsWith('/') && path.startsWith(excluded)) return true;
    if (path.startsWith(excluded + '/')) return true;
  }
  return false;
}

function isTransactionalGlobalComponentsPath(pathname) {
  const normalized = normalizeCanonicalPath(pathname || '/');
  return (
    normalized === '/checkout' ||
    normalized === '/success' ||
    normalized === '/buyer-order' ||
    normalized === '/order-detail'
  );
}

function resolveDefaultComponentCode(components, type) {
  if (!components || typeof components !== 'object') return '';
  const isHeader = type === 'header';
  const list = Array.isArray(isHeader ? components.headers : components.footers)
    ? (isHeader ? components.headers : components.footers)
    : [];
  const defaultId = isHeader ? components.defaultHeaderId : components.defaultFooterId;
  if (!defaultId) return '';
  const match = list.find((entry) => String(entry?.id || '') === String(defaultId));
  return String(match?.code || '').trim();
}

async function getSiteComponentsForSsr(env) {
  if (!env?.DB) return null;
  const now = Date.now();
  if (siteComponentsSsrCache.hasValue && (now - siteComponentsSsrCache.fetchedAt) < SITE_COMPONENTS_SSR_TTL_MS) {
    return siteComponentsSsrCache.value;
  }
  try {
    await initDB(env);
    const row = await env.DB.prepare(
      'SELECT value FROM settings WHERE key = ?'
    ).bind('site_components').first();

    let parsed = null;
    if (row && row.value) {
      try {
        const candidate = JSON.parse(row.value);
        if (candidate && typeof candidate === 'object') {
          parsed = candidate;
        }
      } catch (_) {}
    }

    siteComponentsSsrCache.value = parsed;
    siteComponentsSsrCache.fetchedAt = now;
    siteComponentsSsrCache.hasValue = true;
    return parsed;
  } catch (error) {
    console.warn('Failed to load site components for SSR:', error);
    if (siteComponentsSsrCache.hasValue) return siteComponentsSsrCache.value;
    siteComponentsSsrCache.value = null;
    siteComponentsSsrCache.fetchedAt = now;
    siteComponentsSsrCache.hasValue = true;
    return null;
  }
}

async function applyGlobalComponentsSsr(env, html, pathname) {
  const currentPath = String(pathname || '/');
  const normalizedPath = normalizeCanonicalPath(currentPath);
  if (
    !html ||
    !/<body[^>]*>/i.test(html) ||
    normalizedPath === '/admin' ||
    normalizedPath.startsWith('/admin/') ||
    isTransactionalGlobalComponentsPath(normalizedPath)
  ) {
    return html;
  }

  let out = ensureGlobalComponentsRuntimeScript(html);
  if (!env?.DB) return out;

  const components = await getSiteComponentsForSsr(env);
  if (!components || typeof components !== 'object') return out;
  if (
    isExcludedFromGlobalComponents(components.excludedPages, currentPath) ||
    isExcludedFromGlobalComponents(components.excludedPages, normalizedPath)
  ) {
    return out;
  }

  const enableHeader = components?.settings?.enableGlobalHeader !== false;
  const enableFooter = components?.settings?.enableGlobalFooter !== false;
  const headerCode = enableHeader ? resolveDefaultComponentCode(components, 'header') : '';
  const footerCode = enableFooter ? resolveDefaultComponentCode(components, 'footer') : '';

  let injectedHeader = false;
  let injectedFooter = false;

  if (headerCode && !hasGlobalHeaderMarkup(out)) {
    const withHeader = injectGlobalHeaderSsr(out, headerCode);
    injectedHeader = withHeader !== out;
    out = withHeader;
  }

  if (footerCode && !hasGlobalFooterMarkup(out)) {
    const withFooter = injectGlobalFooterSsr(out, footerCode);
    injectedFooter = withFooter !== out;
    out = withFooter;
  }

  if (injectedHeader || injectedFooter) {
    out = upsertBodyDataAttribute(out, 'data-components-ssr', '1');
    if (injectedHeader) out = upsertBodyDataAttribute(out, 'data-global-header-ssr', '1');
    if (injectedFooter) out = upsertBodyDataAttribute(out, 'data-global-footer-ssr', '1');
  }

  return out;
}

// -------------------------------
// SEO helper functions
// -------------------------------
const SITEMAP_MEMBERSHIP_TTL_MS = 2 * 60 * 1000;
const sitemapMembershipCache = {
  fetchedAt: 0,
  urls: null
};

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function normalizeUrlForSitemapCompare(rawUrl) {
  try {
    const u = new URL(String(rawUrl || '').trim());
    const protocol = String(u.protocol || '').toLowerCase() || 'https:';
    const host = String(u.hostname || '').toLowerCase();
    if (!host) return '';

    const includePort = Boolean(
      u.port &&
      !((protocol === 'https:' && u.port === '443') || (protocol === 'http:' && u.port === '80'))
    );
    const port = includePort ? `:${u.port}` : '';
    const path = normalizeCanonicalPath(u.pathname || '/');
    return `${protocol}//${host}${port}${path}`;
  } catch (_) {
    return '';
  }
}

async function getSitemapMembershipSet(env, req) {
  const now = Date.now();
  if (sitemapMembershipCache.urls && (now - sitemapMembershipCache.fetchedAt) < SITEMAP_MEMBERSHIP_TTL_MS) {
    return sitemapMembershipCache.urls;
  }

  const out = new Set();
  try {
    const sitemap = await buildMinimalSitemapXml(env, req);
    const xml = String(sitemap?.body || '');
    const re = /<loc>([\s\S]*?)<\/loc>/gi;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const decoded = decodeXmlEntities(m[1]);
      const normalized = normalizeUrlForSitemapCompare(decoded);
      if (normalized) out.add(normalized);
    }
  } catch (_) {
    // On failure, keep set empty and fallback-safe behavior in caller.
  }

  sitemapMembershipCache.urls = out;
  sitemapMembershipCache.fetchedAt = now;
  return out;
}

async function isCanonicalInSitemap(env, req, canonicalUrl) {
  const normalizedCanonical = normalizeUrlForSitemapCompare(canonicalUrl);
  if (!normalizedCanonical) return true;

  const sitemapUrls = await getSitemapMembershipSet(env, req);
  // Safety guard: if sitemap is empty/unavailable, do not mass-noindex pages.
  if (!sitemapUrls || sitemapUrls.size === 0) return true;

  return sitemapUrls.has(normalizedCanonical);
}

function normalizeSeoBaseUrl(rawBaseUrl, reqUrl, env) {
  let base = null;
  try {
    const raw = String(rawBaseUrl || '').trim();
    base = raw ? new URL(raw) : new URL(reqUrl.toString());
  } catch (_) {
    base = new URL(reqUrl.toString());
  }

  const canonicalHost = getCanonicalHostname(base, env) || getCanonicalHostname(reqUrl, env) || base.hostname;
  if (canonicalHost) base.hostname = canonicalHost;

  if (!isLocalHostname(base.hostname)) {
    base.protocol = 'https:';
    if (base.port === '80' || base.port === '443') base.port = '';
  }

  base.pathname = '';
  base.search = '';
  base.hash = '';
  return base.origin;
}

/**
 * Determine robots and canonical values for a given request.
 * - If a URL is marked as noindex via noindex patterns, robots is set to 'noindex, nofollow'.
 * - Otherwise defaults to 'index, follow'.
 * - Canonical URL is built from the base site URL (from seo_minimal settings or request origin)
 *   and the requested path, unless a product object is provided, in which case the canonical
 *   product path is used. Products may override canonical via `seo_canonical`.
 * @param {Object} env Cloudflare environment bindings
 * @param {Request} req Incoming request
 * @param {Object} opts Additional context: { path?: string, product?: Object }
 * @returns {Promise<{robots: string, canonical: string}>}
 */
async function getSeoForRequest(env, req, opts = {}) {
  const url = new URL(req.url);
  // Determine pathname from opts.path or request
  const rawPathname = opts.path || url.pathname || '/';
  const pathname = normalizeCanonicalPath(rawPathname);
  const seoSettings = await getSeoSettingsObject(env);
  const siteTitle = resolveSiteTitle(seoSettings, url);

  // Get canonical base URL from seo_minimal settings and normalize it to the
  // canonical host/protocol so rel=canonical stays stable.
  const configuredBaseUrl = (seoSettings && seoSettings.site_url && String(seoSettings.site_url).trim())
    ? String(seoSettings.site_url).trim()
    : url.origin;
  const baseUrl = normalizeSeoBaseUrl(configuredBaseUrl, url, env);

  // Build canonical
  let canonical = '';
  if (opts.product) {
    // Use product's canonical if provided, else construct via canonicalProductPath
    const product = opts.product;
    if (product.seo_canonical && String(product.seo_canonical).trim()) {
      canonical = String(product.seo_canonical).trim();
    } else {
      try {
        canonical = baseUrl + canonicalProductPath(product);
      } catch (e) {
        canonical = baseUrl + normalizeCanonicalPath(pathname);
      }
    }
  } else {
    canonical = baseUrl + normalizeCanonicalPath(pathname);
  }

  // Default robots directive
  let robots = 'index, follow';
  if (isSensitiveNoindexPath(pathname)) {
    robots = 'noindex, nofollow';
  } else {
    try {
      const explicitRule = await getSeoVisibilityRuleMatch(env, {
        pathname,
        rawPathname,
        url,
        requestUrl: req.url
      });

      if (explicitRule === 'index') {
        robots = 'index, follow';
      } else if (explicitRule === 'noindex') {
        robots = 'noindex, nofollow';
      } else {
        const inSitemap = await isCanonicalInSitemap(env, req, canonical);
        robots = inSitemap ? 'index, follow' : 'noindex, nofollow';
      }
    } catch (e) {
      // ignore errors and fall back to default
    }
  }

  return { robots, canonical, siteTitle };
}

/**
 * Inject or update robots and canonical tags in an HTML string.
 * If a meta robots tag or canonical link already exists, it will be replaced.
 * Otherwise they will be appended before the closing </head> tag.
 * @param {string} html Original HTML
 * @param {string} robots Robots directive (e.g. 'index, follow' or 'noindex, nofollow')
 * @param {string} canonical Canonical URL to set, optional
 * @returns {string} Modified HTML with SEO tags injected
 */
function applySeoToHtml(html, robots, canonical) {
  if (!html) return html;
  let out = String(html);
  if (!/<head[\s>]/i.test(out)) {
    if (/<html[^>]*>/i.test(out)) {
      out = out.replace(/<html([^>]*)>/i, '<html$1>\n<head>\n</head>');
    } else if (/<body[^>]*>/i.test(out)) {
      out = out.replace(/<body([^>]*)>/i, '<head>\n</head>\n<body$1>');
    } else {
      out = `<head>\n</head>\n${out}`;
    }
  }
  if (!/<\/head>/i.test(out)) {
    if (/<body[^>]*>/i.test(out)) {
      out = out.replace(/<body([^>]*)>/i, '</head>\n<body$1>');
    } else {
      out = `${out}\n</head>`;
    }
  }

  // Inject robots meta tag
  if (robots) {
    const robotsRegex = /<meta\s+name=["']robots["'][^>]*>/i;
    const robotsTag = `<meta name="robots" content="${robots}">`;
    if (robotsRegex.test(out)) {
      out = out.replace(robotsRegex, robotsTag);
    } else {
      out = out.replace(/<\/head>/i, `${robotsTag}\n</head>`);
    }
  }
  // Inject canonical link
  if (canonical) {
    const canonicalRegex = /<link\s+rel=["']canonical["'][^>]*>/i;
    const canonicalTag = `<link rel="canonical" href="${canonical}">`;
    if (canonicalRegex.test(out)) {
      out = out.replace(canonicalRegex, canonicalTag);
    } else {
      out = out.replace(/<\/head>/i, `${canonicalTag}\n</head>`);
    }
  }
  // Ensure a default favicon is present for pages that don't define one.
  const faviconRegex = /<link\s+rel=["'](?:icon|shortcut icon)["'][^>]*>/i;
  if (!faviconRegex.test(out)) {
    const faviconTags = `<link rel="icon" type="image/svg+xml" href="/favicon.svg">\n<link rel="icon" href="/favicon.ico" sizes="any">`;
    out = out.replace(/<\/head>/i, `${faviconTags}\n</head>`);
  }
  return out;
}

function formatBlogArchiveDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function truncateBlogArchiveText(value, maxLength = 120) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '...';
}

function buildBlogArchivePageHref(pageNumber, limit) {
  const n = Math.max(1, parseInt(pageNumber, 10) || 1);
  const l = Math.max(1, parseInt(limit, 10) || 30);
  const params = new URLSearchParams();
  if (n > 1) params.set('page', String(n));
  if (l !== 30) params.set('limit', String(l));
  const q = params.toString();
  return q ? `?${q}` : '?';
}

function renderBlogArchivePaginationSsr(pagination) {
  const page = Math.max(1, parseInt(pagination?.page, 10) || 1);
  const totalPages = Math.max(0, parseInt(pagination?.totalPages, 10) || 0);
  const hasNext = !!pagination?.hasNext;
  const hasPrev = !!pagination?.hasPrev;
  const limit = Math.max(1, parseInt(pagination?.limit, 10) || 30);

  if (totalPages <= 1) return '';

  let pageLinks = '';
  const startPage = Math.max(1, page - 2);
  const endPage = Math.min(totalPages, page + 2);

  if (startPage > 1) {
    pageLinks += `<a href="${buildBlogArchivePageHref(1, limit)}" class="page-link">1</a>`;
    if (startPage > 2) {
      pageLinks += '<span class="page-dots">...</span>';
    }
  }

  for (let i = startPage; i <= endPage; i += 1) {
    if (i === page) {
      pageLinks += `<span class="page-link active">${i}</span>`;
    } else {
      pageLinks += `<a href="${buildBlogArchivePageHref(i, limit)}" class="page-link">${i}</a>`;
    }
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      pageLinks += '<span class="page-dots">...</span>';
    }
    pageLinks += `<a href="${buildBlogArchivePageHref(totalPages, limit)}" class="page-link">${totalPages}</a>`;
  }

  return `
    <div class="blog-pagination">
      ${hasPrev ? `<a href="${buildBlogArchivePageHref(page - 1, limit)}" class="page-link page-prev">Previous</a>` : ''}
      <div class="page-numbers">${pageLinks}</div>
      ${hasNext ? `<a href="${buildBlogArchivePageHref(page + 1, limit)}" class="page-link page-next">Next</a>` : ''}
    </div>
  `;
}

function renderBlogArchiveCardsSsr(blogs = [], pagination = {}) {
  const safeBlogs = Array.isArray(blogs) ? blogs : [];
  const cardsHtml = safeBlogs.map((blog) => {
    const slugOrId = String(blog.slug || blog.id || '').trim();
    if (!slugOrId) return '';

    const blogUrl = `/blog/${encodeURIComponent(slugOrId)}`;
    const title = escapeHtmlText(blog.title || 'Untitled');
    const description = escapeHtmlText(truncateBlogArchiveText(blog.description || '', 120));
    const dateText = escapeHtmlText(formatBlogArchiveDate(blog.created_at));
    const thumb = escapeHtmlText(
      String(blog.thumbnail_url || '').trim() || 'https://via.placeholder.com/400x225?text=No+Image'
    );

    return `
      <article class="blog-card">
        <a class="blog-card-link" href="${blogUrl}">
          <div class="blog-thumbnail">
            <img src="${thumb}" alt="${title}" loading="lazy">
          </div>
          <div class="blog-content">
            <h3 class="blog-title">${title}</h3>
            ${dateText ? `<div class="blog-date">${dateText}</div>` : ''}
            <p class="blog-description">${description}</p>
            <span class="blog-read-more">Read More -></span>
          </div>
        </a>
      </article>
    `;
  }).join('');

  const styles = `
    <style id="blog-archive-ssr-style">
      #blog-archive .blog-cards-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 30px;
        max-width: 1200px;
        margin: 0 auto;
      }
      #blog-archive .blog-card {
        background: #fff;
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
      }
      #blog-archive .blog-card-link {
        display: block;
        color: inherit;
        text-decoration: none;
      }
      #blog-archive .blog-thumbnail {
        width: 100%;
        aspect-ratio: 16 / 9;
        background: #eef2ff;
      }
      #blog-archive .blog-thumbnail img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      #blog-archive .blog-content {
        padding: 18px;
      }
      #blog-archive .blog-title {
        margin: 0 0 8px;
        font-size: 1.1rem;
        color: #111827;
        line-height: 1.35;
      }
      #blog-archive .blog-date {
        margin-bottom: 10px;
        color: #6b7280;
        font-size: 0.88rem;
      }
      #blog-archive .blog-description {
        margin: 0 0 14px;
        color: #374151;
        line-height: 1.6;
        font-size: 0.95rem;
      }
      #blog-archive .blog-read-more {
        color: #1d4ed8;
        font-size: 0.92rem;
        font-weight: 600;
      }
      #blog-archive .blog-pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        margin-top: 32px;
        flex-wrap: wrap;
      }
      #blog-archive .page-numbers {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #blog-archive .page-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 40px;
        height: 40px;
        border-radius: 10px;
        border: 1px solid #d1d5db;
        background: #fff;
        color: #111827;
        text-decoration: none;
        font-weight: 600;
        padding: 0 12px;
      }
      #blog-archive .page-link.active {
        background: #111827;
        border-color: #111827;
        color: #fff;
      }
      #blog-archive .page-dots {
        color: #9ca3af;
      }
      @media (max-width: 1024px) {
        #blog-archive .blog-cards-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 20px;
        }
      }
      @media (max-width: 680px) {
        #blog-archive .blog-cards-grid {
          grid-template-columns: 1fr;
          gap: 16px;
        }
      }
    </style>
  `;

  if (!cardsHtml) {
    return `${styles}<p style="text-align:center;padding:60px 20px;color:#6b7280;font-size:1.05rem;">No blog posts found.</p>`;
  }

  return `${styles}<div class="blog-cards-grid">${cardsHtml}</div>${renderBlogArchivePaginationSsr(pagination)}`;
}

function normalizeSsrInteger(value, fallback, min = 1, max = 100) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeSsrIdList(idsInput = []) {
  if (!Array.isArray(idsInput)) return [];
  return idsInput
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 50);
}

async function queryProductsForComponentSsr(env, options = {}) {
  const limit = normalizeSsrInteger(options.limit, 12, 1, 100);
  const page = normalizeSsrInteger(options.page, 1, 1, 100);
  const offset = (page - 1) * limit;
  const filter = String(options.filter || 'all').trim().toLowerCase();
  const requestedIds = normalizeSsrIdList(options.ids);

  if (requestedIds.length > 0) {
    const numericIds = requestedIds.filter((item) => /^\d+$/.test(item));
    const slugIds = requestedIds.filter((item) => !/^\d+$/.test(item));
    const conditions = [];
    const bindings = [];

    if (numericIds.length > 0) {
      conditions.push(`CAST(p.id AS TEXT) IN (${numericIds.map(() => '?').join(',')})`);
      bindings.push(...numericIds);
    }
    if (slugIds.length > 0) {
      conditions.push(`p.slug IN (${slugIds.map(() => '?').join(',')})`);
      bindings.push(...slugIds);
    }

    if (conditions.length === 0) {
      return { products: [], pagination: { page: 1, limit, total: 0, pages: 1 } };
    }

    const rows = await env.DB.prepare(`
      SELECT
        p.id, p.title, p.slug, p.normal_price, p.sale_price,
        p.thumbnail_url, p.video_url, p.normal_delivery_text, p.instant_delivery,
        p.featured,
        (SELECT COUNT(*) FROM reviews WHERE product_id = p.id AND status = 'approved') as review_count,
        (SELECT AVG(rating) FROM reviews WHERE product_id = p.id AND status = 'approved') as rating_average
      FROM products p
      WHERE ${buildPublicProductStatusWhere('p.status')}
      AND (${conditions.join(' OR ')})
      ORDER BY p.sort_order ASC, p.id DESC
    `).bind(...bindings).all();

    const ordered = requestedIds
      .map((requestedId) => (rows.results || []).find((item) => (
        String(item.id) === requestedId || String(item.slug || '') === requestedId
      )))
      .filter(Boolean)
      .slice(0, limit)
      .map((item) => ({
        ...item,
        delivery_time_days: parseInt(item.normal_delivery_text, 10) || 1,
        review_count: item.review_count || 0,
        average_rating: item.rating_average ? Math.round(item.rating_average * 10) / 10 : 0
      }));

    return {
      products: ordered,
      pagination: { page: 1, limit, total: ordered.length, pages: 1 }
    };
  }

  let whereClause = `WHERE ${buildPublicProductStatusWhere('p.status')}`;
  if (filter === 'featured') {
    whereClause += ' AND p.featured = 1';
  }

  const totalRow = await env.DB.prepare(`SELECT COUNT(*) as count FROM products p ${whereClause}`).first();
  const rows = await env.DB.prepare(`
    SELECT
      p.id, p.title, p.slug, p.normal_price, p.sale_price,
      p.thumbnail_url, p.video_url, p.normal_delivery_text, p.instant_delivery,
      p.featured,
      (SELECT COUNT(*) FROM reviews WHERE product_id = p.id AND status = 'approved') as review_count,
      (SELECT AVG(rating) FROM reviews WHERE product_id = p.id AND status = 'approved') as rating_average
    FROM products p
    ${whereClause}
    ORDER BY p.sort_order ASC, p.id DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all();

  const products = (rows.results || []).map((item) => ({
    ...item,
    delivery_time_days: parseInt(item.normal_delivery_text, 10) || 1,
    review_count: item.review_count || 0,
    average_rating: item.rating_average ? Math.round(item.rating_average * 10) / 10 : 0
  }));

  return {
    products,
    pagination: {
      page,
      limit,
      total: totalRow?.count || 0,
      pages: Math.max(1, Math.ceil((totalRow?.count || 0) / limit))
    }
  };
}

async function queryBlogsForComponentSsr(env, options = {}) {
  const limit = normalizeSsrInteger(options.limit, 30, 1, 100);
  const page = normalizeSsrInteger(options.page, 1, 1, 100);
  const offset = (page - 1) * limit;
  const requestedIds = normalizeSsrIdList(options.ids);

  if (requestedIds.length > 0) {
    const numericIds = requestedIds.filter((item) => /^\d+$/.test(item));
    const slugIds = requestedIds.filter((item) => !/^\d+$/.test(item));
    const conditions = [];
    const bindings = [];

    if (numericIds.length > 0) {
      conditions.push(`CAST(id AS TEXT) IN (${numericIds.map(() => '?').join(',')})`);
      bindings.push(...numericIds);
    }
    if (slugIds.length > 0) {
      conditions.push(`slug IN (${slugIds.map(() => '?').join(',')})`);
      bindings.push(...slugIds);
    }

    if (conditions.length === 0) {
      return { blogs: [], pagination: { page: 1, limit, total: 0, totalPages: 1, hasNext: false, hasPrev: false } };
    }

    const rows = await env.DB.prepare(`
      SELECT id, title, slug, description, thumbnail_url, created_at
      FROM blogs
      WHERE status = 'published' AND (${conditions.join(' OR ')})
      ORDER BY created_at DESC
    `).bind(...bindings).all();

    const blogs = requestedIds
      .map((requestedId) => (rows.results || []).find((item) => (
        String(item.id) === requestedId || String(item.slug || '') === requestedId
      )))
      .filter(Boolean)
      .slice(0, limit);

    return {
      blogs,
      pagination: { page: 1, limit, total: blogs.length, totalPages: 1, hasNext: false, hasPrev: false }
    };
  }

  const [countResult, rows] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as total FROM blogs WHERE status = 'published'`).first(),
    env.DB.prepare(`
      SELECT id, title, slug, description, thumbnail_url, created_at
      FROM blogs
      WHERE status = 'published'
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all()
  ]);

  const total = countResult?.total || 0;
  return {
    blogs: rows.results || [],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNext: offset + limit < total,
      hasPrev: page > 1
    }
  };
}

async function queryForumQuestionsForSsr(env, options = {}) {
  const limit = normalizeSsrInteger(options.limit, 20, 1, 100);
  const page = normalizeSsrInteger(options.page, 1, 1, 100);
  const offset = (page - 1) * limit;

  const [countResult, rows] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as total FROM forum_questions WHERE status = 'approved'`).first(),
    env.DB.prepare(`
      SELECT id, title, slug, content, name, reply_count, created_at
      FROM forum_questions
      WHERE status = 'approved'
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all()
  ]);

  const total = countResult?.total || 0;
  return {
    questions: rows.results || [],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNext: offset + limit < total,
      hasPrev: page > 1
    }
  };
}

async function queryReviewsForSsr(env, options = {}) {
  const limit = normalizeSsrInteger(options.limit, 6, 1, 50);
  const requestedProductIds = normalizeSsrIdList(options.productIds);
  const requestedReviewIds = normalizeSsrIdList(options.ids);
  const rating = options.rating == null ? null : normalizeSsrInteger(options.rating, null, 1, 5);
  const minRating = options.minRating == null ? null : normalizeSsrInteger(options.minRating, null, 1, 5);
  const productId = options.productId == null ? null : normalizeSsrInteger(options.productId, null, 1, Number.MAX_SAFE_INTEGER);

  let sql = `
    SELECT r.*, p.title as product_title
    FROM reviews r
    LEFT JOIN products p ON r.product_id = p.id
    WHERE r.status = 'approved'
  `;
  const bindings = [];

  if (rating != null) {
    sql += ' AND r.rating = ?';
    bindings.push(rating);
  }
  if (minRating != null) {
    sql += ' AND r.rating >= ?';
    bindings.push(minRating);
  }
  if (productId != null) {
    sql += ' AND r.product_id = ?';
    bindings.push(productId);
  }
  if (requestedProductIds.length > 0) {
    const numericProductIds = requestedProductIds
      .map((value) => parseInt(value, 10))
      .filter((value) => Number.isFinite(value));
    if (numericProductIds.length > 0) {
      sql += ` AND r.product_id IN (${numericProductIds.map(() => '?').join(',')})`;
      bindings.push(...numericProductIds);
    }
  }
  if (requestedReviewIds.length > 0) {
    const numericReviewIds = requestedReviewIds
      .map((value) => parseInt(value, 10))
      .filter((value) => Number.isFinite(value));
    if (numericReviewIds.length > 0) {
      sql += ` AND r.id IN (${numericReviewIds.map(() => '?').join(',')})`;
      bindings.push(...numericReviewIds);
    }
  }

  sql += ' ORDER BY r.created_at DESC LIMIT ?';
  bindings.push(limit);

  const rows = await env.DB.prepare(sql).bind(...bindings).all();
  return rows.results || [];
}

function replaceSimpleTextByIdSsr(html, elementId, value) {
  const escapedId = String(elementId || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<(span|div|p)([^>]*\\bid=["']${escapedId}["'][^>]*)>([\\s\\S]*?)</\\1>`, 'i');
  return String(html || '').replace(pattern, `<$1$2>${escapeHtmlText(String(value ?? ''))}</$1>`);
}

function replaceAnchorHrefById(html, elementId, href) {
  const escapedId = String(elementId || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(<a[^>]*\\bid=["']${escapedId}["'][^>]*\\bhref=["'])[^"']*(["'])`, 'i');
  return String(html || '').replace(pattern, `$1${escapeHtmlText(String(href || '#'))}$2`);
}

function renderForumArchiveCardsSsr(questions = []) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return '<div class="no-questions"><p>No questions yet. Be the first to ask!</p></div>';
  }

  const cards = questions.map((question) => {
    const date = question.created_at
      ? new Date(question.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '';
    const initial = escapeHtmlText(String(question.name || 'A').charAt(0).toUpperCase());
    const href = `/forum/${encodeURIComponent(String(question.slug || question.id || ''))}`;
    return `
      <a class="question-card question-link-card" id="qcard-${escapeHtmlText(question.id)}" href="${href}" style="display:block;text-decoration:none;color:inherit;">
        <div class="question-header">
          <div class="q-avatar">${initial}</div>
          <div class="q-content">
            <div class="q-title">${escapeHtmlText(question.title || '')}</div>
            <div class="q-preview">${escapeHtmlText(question.content || '')}</div>
            <div class="q-meta">
              <span>&#128100; ${escapeHtmlText(question.name || '')}</span>
              <span>&#128197; ${escapeHtmlText(date)}</span>
              <span class="reply-count">&#128172; ${escapeHtmlText(question.reply_count || 0)} replies</span>
            </div>
          </div>
          <div class="expand-icon">&rarr;</div>
        </div>
      </a>
    `;
  }).join('');

  return `<div class="questions-list">${cards}</div>`;
}

function renderForumArchivePaginationSsr(pagination = {}) {
  const totalPages = Math.max(0, parseInt(pagination.totalPages, 10) || 0);
  if (totalPages <= 1) return '';

  const page = Math.max(1, parseInt(pagination.page, 10) || 1);
  let html = `<button class="page-btn" onclick="loadQuestions(${page - 1})" ${!pagination.hasPrev ? 'disabled' : ''}>&larr;</button>`;

  for (let index = 1; index <= totalPages; index += 1) {
    html += `<button class="page-btn ${index === page ? 'active' : ''}" onclick="loadQuestions(${index})">${index}</button>`;
  }

  html += `<button class="page-btn" onclick="loadQuestions(${page + 1})" ${!pagination.hasNext ? 'disabled' : ''}>&rarr;</button>`;
  return html;
}

function renderEmbeddedForumQuestionsSsr(questions = []) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return '<p style="text-align:center;color:#6b7280;padding:40px;background:white;border-radius:12px;">No questions yet. Be the first to ask!</p>';
  }

  return `<h3 style="margin-bottom:20px;color:#1f2937;">Recent Questions</h3>${questions.map((question) => {
    const preview = escapeHtmlText(String(question.content || '').slice(0, 150) + (String(question.content || '').length > 150 ? '...' : ''));
    const href = `/forum/${encodeURIComponent(String(question.slug || question.id || ''))}`;
    return `<a href="${href}" style="display:block;background:white;border-radius:12px;padding:20px;margin-bottom:15px;box-shadow:0 2px 8px rgba(0,0,0,0.06);text-decoration:none;transition:transform 0.2s,box-shadow 0.2s;"><h4 style="color:#1f2937;margin-bottom:8px;font-size:1.1rem;">${escapeHtmlText(question.title || '')}</h4><p style="color:#6b7280;font-size:0.9rem;line-height:1.5;margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${preview}</p><div style="display:flex;gap:15px;font-size:0.85rem;color:#9ca3af;"><span>&#128100; ${escapeHtmlText(question.name || '')}</span><span>&#128172; ${escapeHtmlText(question.reply_count || 0)} replies</span></div></a>`;
  }).join('')}`;
}

function renderEmbeddedForumPaginationSsr(pagination = {}) {
  const totalPages = Math.max(0, parseInt(pagination.totalPages, 10) || 0);
  if (totalPages <= 1) return '';

  const page = Math.max(1, parseInt(pagination.page, 10) || 1);
  let html = '';

  if (pagination.hasPrev) {
    html += `<button onclick="loadForumQuestions(${page - 1})" style="padding:8px 16px;border:1px solid #e5e7eb;background:white;border-radius:8px;cursor:pointer;">&larr; Prev</button>`;
  }

  for (let index = 1; index <= totalPages; index += 1) {
    if (index === page) {
      html += `<button style="padding:8px 16px;border:none;background:#10b981;color:white;border-radius:8px;">${index}</button>`;
    } else if (index === 1 || index === totalPages || Math.abs(index - page) <= 2) {
      html += `<button onclick="loadForumQuestions(${index})" style="padding:8px 16px;border:1px solid #e5e7eb;background:white;border-radius:8px;cursor:pointer;">${index}</button>`;
    } else if (Math.abs(index - page) === 3) {
      html += '<span style="padding:8px;">...</span>';
    }
  }

  if (pagination.hasNext) {
    html += `<button onclick="loadForumQuestions(${page + 1})" style="padding:8px 16px;border:1px solid #e5e7eb;background:white;border-radius:8px;cursor:pointer;">Next &rarr;</button>`;
  }

  return html;
}

async function applyComponentSsrToHtml(env, html, url, path) {
  if (!env?.DB || !html) return html;

  let output = String(html);
  let needsProductStyles = false;
  let needsBlogStyles = false;
  let needsReviewsStyles = false;

  const productConfigs = extractInlineRenderConfigs(output, 'ProductCards');
  const blogConfigs = extractInlineRenderConfigs(output, 'BlogCards');
  const reviewConfigs = extractInlineRenderConfigs(output, 'ReviewsWidget');
  const needsHomepageProducts = output.includes('id="product-grid"') || output.includes('id="hero-featured-player"');

  if (output.includes('id="reviews-widget"') && !reviewConfigs.has('reviews-widget')) {
    reviewConfigs.set('reviews-widget', { limit: 8, columns: 3, minRating: 5 });
  }

  if ((path === '/' || path === '/index.html') && !productConfigs.has('product-list') && output.includes('id="product-list"')) {
    productConfigs.set('product-list', { filter: 'all', columns: 3, limit: 9, showReviews: true, showDelivery: true });
  }

  let homeProductsBootstrap = null;
  const getHomeProductsBootstrap = async () => {
    if (homeProductsBootstrap) return homeProductsBootstrap;
    const result = await queryProductsForComponentSsr(env, { limit: 24, page: 1 });
    homeProductsBootstrap = buildHomeProductsBootstrap(result.products || []);
    return homeProductsBootstrap;
  };

  for (const [containerId, config] of productConfigs.entries()) {
    if (!output.includes(`id="${containerId}"`) && !output.includes(`id='${containerId}'`)) continue;
    const productResult = await queryProductsForComponentSsr(env, {
      ...config,
      page: url.searchParams.get('page') || config.page || 1
    });
    const rendered = renderProductCardsSsrMarkup({
      containerId,
      products: productResult.products,
      options: config,
      pagination: productResult.pagination
    });
    output = replaceSimpleContainerById(output, containerId, rendered.innerHtml, rendered.attrs, rendered.afterHtml);
    needsProductStyles = true;
  }

  for (const [containerId, config] of blogConfigs.entries()) {
    if (!output.includes(`id="${containerId}"`) && !output.includes(`id='${containerId}'`)) continue;
    const blogResult = await queryBlogsForComponentSsr(env, {
      ...config,
      page: url.searchParams.get('page') || config.page || 1
    });
    const rendered = renderBlogCardsSsrMarkup({
      containerId,
      blogs: blogResult.blogs,
      options: config,
      pagination: blogResult.pagination
    });
    output = replaceSimpleContainerById(output, containerId, rendered.innerHtml, rendered.attrs, rendered.afterHtml);
    needsBlogStyles = true;
  }

  for (const [containerId, config] of reviewConfigs.entries()) {
    if (!output.includes(`id="${containerId}"`) && !output.includes(`id='${containerId}'`)) continue;
    const reviews = await queryReviewsForSsr(env, config);
    const rendered = renderReviewsWidgetSsrMarkup({
      containerId,
      reviews,
      options: config
    });
    output = replaceSimpleContainerById(output, containerId, rendered.innerHtml, rendered.attrs, rendered.afterHtml);
    needsReviewsStyles = true;
  }

  if (needsHomepageProducts) {
    const bootstrap = await getHomeProductsBootstrap();
    const products = Array.isArray(bootstrap?.products) ? bootstrap.products : [];
    const bootstrapTag = `<script type="application/json" id="${HOME_PRODUCTS_BOOTSTRAP_ID}">${JSON.stringify(bootstrap || {}).replace(/</g, '\\u003c')}</script>`;
    let injectedHomeBootstrap = false;

    if (output.includes('id="product-grid"')) {
      output = replaceSimpleContainerById(
        output,
        'product-grid',
        renderHomepageProductGridSsr(products.slice(0, 12)),
        { 'data-ssr-home-products': '1' },
        bootstrapTag
      );
      injectedHomeBootstrap = true;
    }

    if (output.includes('id="hero-featured-player"')) {
      const hero = renderHomepageHeroPlayerSsr(products);
      output = replaceSimpleContainerById(
        output,
        'hero-featured-player',
        hero.innerHtml,
        { 'data-ssr-home-hero': '1' },
        injectedHomeBootstrap ? '' : bootstrapTag
      );
      output = replaceAnchorHrefById(output, 'hero-order-link', hero.targetHref);
      output = replaceAnchorHrefById(output, 'cta-order-link', hero.targetHref);
    }
  }

  const embedMatches = [...output.matchAll(/<(div|section)([^>]*\bdata-embed='([^']+)'[^>]*)>([\s\S]*?)<\/\1>/gi)];
  for (let embedIndex = 0; embedIndex < embedMatches.length; embedIndex += 1) {
    const match = embedMatches[embedIndex];
    const [fullMatch, tagName, rawAttrs, rawConfig] = match;
    let config;
    try {
      config = JSON.parse(rawConfig);
    } catch (_) {
      continue;
    }

    let replacement = null;
    if (config.type === 'product') {
      const productResult = await queryProductsForComponentSsr(env, config);
      const rendered = renderProductCardsSsrMarkup({
        containerId: `embed-product-${embedIndex + 1}`,
        products: productResult.products,
        options: config,
        pagination: productResult.pagination
      });
      replacement = `<${tagName}${rawAttrs} data-ssr-product-cards="1">${rendered.innerHtml}</${tagName}>${rendered.afterHtml}`;
      needsProductStyles = true;
    } else if (config.type === 'blog') {
      const blogResult = await queryBlogsForComponentSsr(env, config);
      const rendered = renderBlogCardsSsrMarkup({
        containerId: `embed-blog-${embedIndex + 1}`,
        blogs: blogResult.blogs,
        options: {
          ...config,
          showPagination: false,
          pagination: false
        },
        pagination: blogResult.pagination
      });
      replacement = `<${tagName}${rawAttrs} data-ssr-blog-cards="1">${rendered.innerHtml}</${tagName}>${rendered.afterHtml}`;
      needsBlogStyles = true;
    } else if (config.type === 'forum') {
      const forumResult = await queryForumQuestionsForSsr(env, { limit: 6, page: 1 });
      replacement = `<${tagName}${rawAttrs}>${renderEmbeddedForumQuestionsSsr(forumResult.questions)}</${tagName}>`;
    }

    if (replacement) {
      output = output.replace(fullMatch, replacement);
    }
  }

  if (output.includes('id="questions-container"')) {
    const forumResult = await queryForumQuestionsForSsr(env, {
      limit: 20,
      page: url.searchParams.get('page') || 1
    });
    output = replaceSimpleContainerById(output, 'questions-container', renderForumArchiveCardsSsr(forumResult.questions));
    output = replaceSimpleContainerById(output, 'pagination', renderForumArchivePaginationSsr(forumResult.pagination));
    output = replaceSimpleTextByIdSsr(output, 'total-count', forumResult.pagination.total || 0);
  }

  if (output.includes('id="forum-questions-container"')) {
    const forumResult = await queryForumQuestionsForSsr(env, {
      limit: 20,
      page: url.searchParams.get('page') || 1
    });
    output = replaceSimpleContainerById(output, 'forum-questions-container', renderEmbeddedForumQuestionsSsr(forumResult.questions));
    output = replaceSimpleContainerById(output, 'forum-pagination', renderEmbeddedForumPaginationSsr(forumResult.pagination));
  }

  if (needsProductStyles) {
    output = ensureStyleTag(output, PRODUCT_CARDS_STYLE_TAG, 'product-cards-styles');
  }
  if (needsBlogStyles) {
    output = ensureStyleTag(output, BLOG_CARDS_STYLE_TAG, 'blog-cards-styles');
  }
  if (needsReviewsStyles) {
    output = ensureStyleTag(output, REVIEWS_WIDGET_STYLE_TAG, 'reviews-widget-styles');
  }

  return output;
}

// Blog post HTML template generator
function generateBlogPostHTML(blog, previousBlogs = [], comments = []) {
  const date = blog.created_at ? new Date(blog.created_at).toLocaleDateString('en-US', { 
    year: 'numeric', month: 'long', day: 'numeric' 
  }) : '';
  
  const prevBlogsHTML = previousBlogs.length > 0 ? `
    <div class="related-posts">
      <h3>Previous Posts</h3>
      <div class="related-grid">
        ${previousBlogs.map(p => `
          <a href="/blog/${p.slug}" class="related-card">
            <div class="related-thumb">
              <img src="${p.thumbnail_url || 'https://via.placeholder.com/300x169?text=No+Image'}" alt="${p.title}" loading="lazy">
            </div>
            <div class="related-content">
              <h4>${p.title}</h4>
              <p>${p.description ? (p.description.length > 80 ? p.description.substring(0, 80) + '...' : p.description) : ''}</p>
            </div>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';

  // Generate comments HTML
  const commentsHTML = comments.map(c => {
    const commentDate = c.created_at ? new Date(c.created_at).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    }) : '';
    const safeName = (c.name || 'Anonymous').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeComment = (c.comment || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    return `
      <div class="comment-item">
        <div class="comment-header">
          <div class="comment-avatar">${safeName.charAt(0).toUpperCase()}</div>
          <div class="comment-info">
            <div class="comment-name">${safeName}</div>
            <div class="comment-date">${commentDate}</div>
          </div>
        </div>
        <div class="comment-text">${safeComment}</div>
      </div>
    `;
  }).join('');

  const safeTitle = (blog.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeDesc = (blog.seo_description || blog.description || '').substring(0, 160).replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${blog.seo_title || blog.title} - WishesU</title>
  <meta name="description" content="${safeDesc}">
  <meta name="keywords" content="${blog.seo_keywords || ''}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:image" content="${blog.thumbnail_url || ''}">
  <meta property="og:type" content="article">
  <link rel="stylesheet" href="/css/style.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; line-height: 1.6; }
    
    .blog-hero {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 20px;
    }
    .blog-hero-inner {
      max-width: 900px;
      margin: 0 auto;
      text-align: center;
    }
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: rgba(255,255,255,0.9);
      text-decoration: none;
      font-weight: 500;
      margin-bottom: 30px;
      transition: color 0.2s;
    }
    .back-link:hover { color: white; }
    .blog-hero h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 20px;
      line-height: 1.3;
    }
    .blog-meta {
      display: flex;
      justify-content: center;
      gap: 20px;
      opacity: 0.9;
      font-size: 1rem;
    }
    
    .blog-container {
      max-width: 900px;
      margin: -60px auto 0;
      padding: 0 20px 60px;
      position: relative;
      z-index: 10;
    }
    
    .blog-card {
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.15);
      overflow: hidden;
    }
    
    .blog-featured-image {
      width: 100%;
      aspect-ratio: 16/9;
      object-fit: cover;
    }
    
    .blog-body {
      padding: 40px;
    }
    
    .blog-content {
      font-size: 1.1rem;
      color: #374151;
      line-height: 1.8;
    }
    .blog-content h1, .blog-content h2, .blog-content h3, .blog-content h4 {
      color: #1f2937;
      margin: 30px 0 15px;
      line-height: 1.3;
    }
    .blog-content h1 { font-size: 2rem; }
    .blog-content h2 { font-size: 1.6rem; }
    .blog-content h3 { font-size: 1.3rem; }
    .blog-content p { margin: 15px 0; }
    .blog-content img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 20px 0;
    }
    .blog-content a { color: #667eea; }
    .blog-content ul, .blog-content ol {
      margin: 15px 0;
      padding-left: 25px;
    }
    .blog-content li { margin: 8px 0; }
    .blog-content blockquote {
      border-left: 4px solid #667eea;
      margin: 20px 0;
      padding: 15px 25px;
      background: #f9fafb;
      font-style: italic;
      color: #4b5563;
    }
    .blog-content pre {
      background: #1f2937;
      color: #e5e7eb;
      padding: 20px;
      border-radius: 8px;
      overflow-x: auto;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.9rem;
      margin: 20px 0;
    }
    .blog-content code {
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.9em;
    }
    .blog-content pre code {
      background: none;
      padding: 0;
    }
    
    /* Related Posts */
    .related-posts {
      margin-top: 50px;
      padding-top: 40px;
      border-top: 2px solid #e5e7eb;
    }
    .related-posts h3 {
      font-size: 1.5rem;
      color: #1f2937;
      margin-bottom: 25px;
      text-align: center;
    }
    .related-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 25px;
    }
    .related-card {
      background: #f9fafb;
      border-radius: 12px;
      overflow: hidden;
      text-decoration: none;
      transition: all 0.3s ease;
      display: flex;
      flex-direction: column;
    }
    .related-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    }
    .related-thumb {
      aspect-ratio: 16/9;
      overflow: hidden;
    }
    .related-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s;
    }
    .related-card:hover .related-thumb img {
      transform: scale(1.05);
    }
    .related-content {
      padding: 20px;
    }
    .related-content h4 {
      font-size: 1.1rem;
      color: #1f2937;
      margin: 0 0 10px;
      line-height: 1.4;
    }
    .related-content p {
      font-size: 0.9rem;
      color: #6b7280;
      margin: 0;
      line-height: 1.5;
    }
    
    /* Comments Section */
    .comments-section {
      margin-top: 50px;
      padding-top: 40px;
      border-top: 2px solid #e5e7eb;
    }
    .comments-section h3 {
      font-size: 1.5rem;
      color: #1f2937;
      margin-bottom: 25px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .comment-count {
      background: #667eea;
      color: white;
      font-size: 0.9rem;
      padding: 4px 12px;
      border-radius: 20px;
    }
    
    .comments-list {
      display: flex;
      flex-direction: column;
      gap: 20px;
      margin-bottom: 40px;
    }
    .comment-item {
      background: #f9fafb;
      border-radius: 12px;
      padding: 20px;
    }
    .comment-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .comment-avatar {
      width: 45px;
      height: 45px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 1.2rem;
    }
    .comment-info { flex: 1; }
    .comment-name {
      font-weight: 600;
      color: #1f2937;
    }
    .comment-date {
      font-size: 0.85rem;
      color: #6b7280;
    }
    .comment-text {
      color: #374151;
      line-height: 1.6;
    }
    
    .no-comments {
      text-align: center;
      padding: 30px;
      color: #6b7280;
      background: #f9fafb;
      border-radius: 12px;
    }
    
    /* Comment Form */
    .comment-form-card {
      background: #f9fafb;
      border-radius: 12px;
      padding: 25px;
    }
    .comment-form-card h4 {
      font-size: 1.2rem;
      color: #1f2937;
      margin-bottom: 20px;
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-bottom: 15px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .form-group.full { grid-column: span 2; }
    .form-group label {
      font-weight: 600;
      color: #374151;
      font-size: 0.9rem;
    }
    .form-group input,
    .form-group textarea {
      padding: 12px 15px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-size: 1rem;
      transition: border-color 0.2s;
      font-family: inherit;
    }
    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #667eea;
    }
    .form-group textarea {
      min-height: 120px;
      resize: vertical;
    }
    .submit-btn {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .submit-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 8px 16px rgba(102, 126, 234, 0.4);
    }
    .submit-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    
    .form-message {
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: none;
    }
    .form-message.success {
      background: #d1fae5;
      color: #065f46;
      display: block;
    }
    .form-message.error {
      background: #fee2e2;
      color: #991b1b;
      display: block;
    }
    .form-message.warning {
      background: #fef3c7;
      color: #92400e;
      display: block;
    }
    
    .pending-notice {
      background: #fef3c7;
      color: #92400e;
      padding: 15px 20px;
      border-radius: 8px;
      text-align: center;
      margin-bottom: 20px;
    }
    
    @media (max-width: 768px) {
      .blog-hero h1 { font-size: 1.8rem; }
      .blog-body { padding: 25px; }
      .blog-content { font-size: 1rem; }
      .related-grid { grid-template-columns: 1fr; }
      .form-row { grid-template-columns: 1fr; }
      .form-group.full { grid-column: span 1; }
    }
    
    ${blog.custom_css || ''}
  </style>
</head>
<body>
  <script src="/js/global-components.js"></script>
  <div class="blog-hero">
    <div class="blog-hero-inner">
      <a href="/blog/" class="back-link">← Back to Blog</a>
      <h1>${safeTitle}</h1>
      ${date ? `<div class="blog-meta"><span>📅 ${date}</span></div>` : ''}
    </div>
  </div>
  
  <div class="blog-container">
    <article class="blog-card">
      ${blog.thumbnail_url ? `<img src="${blog.thumbnail_url}" alt="${safeTitle}" class="blog-featured-image">` : ''}
      <div class="blog-body">
        <div class="blog-content">
          ${blog.content || ''}
        </div>
        
        <!-- Comments Section -->
        <div class="comments-section">
          <h3>💬 Comments <span class="comment-count">${comments.length}</span></h3>
          
          ${comments.length > 0 ? `
            <div class="comments-list">
              ${commentsHTML}
            </div>
          ` : `
            <div class="no-comments">
              <p>No comments yet. Be the first to share your thoughts!</p>
            </div>
          `}
          
          <!-- Comment Form -->
          <div class="comment-form-card">
            <h4>Leave a Comment</h4>
            <div id="form-message" class="form-message"></div>
            <div id="pending-notice" class="pending-notice" style="display:none;">
              ⏳ You have a comment awaiting approval. Please wait for it to be approved before posting another.
            </div>
            <form id="comment-form">
              <input type="hidden" id="blog-id" value="${blog.id}">
              <div class="form-row">
                <div class="form-group">
                  <label for="comment-name">Name * <small style="color:#6b7280;font-weight:normal">(max 50)</small></label>
                  <input type="text" id="comment-name" placeholder="Your name" required maxlength="50">
                </div>
                <div class="form-group">
                  <label for="comment-email">Email * <small style="color:#6b7280;font-weight:normal">(max 100)</small></label>
                  <input type="email" id="comment-email" placeholder="your@email.com" required maxlength="100">
                </div>
              </div>
              <div class="form-group full">
                <label for="comment-text">Comment * <small style="color:#6b7280;font-weight:normal">(3-2000 chars)</small></label>
                <textarea id="comment-text" placeholder="Write your comment here..." required minlength="3" maxlength="2000"></textarea>
                <div style="text-align:right;font-size:0.75rem;color:#6b7280;margin-top:2px"><span id="comment-count">0</span>/2000</div>
              </div>
              <button type="submit" class="submit-btn" id="submit-btn">Submit Comment</button>
            </form>
          </div>
        </div>
        
        ${prevBlogsHTML}
      </div>
    </article>
  </div>
  
  <script>
    const blogId = ${blog.id};
    const form = document.getElementById('comment-form');
    const formMessage = document.getElementById('form-message');
    const pendingNotice = document.getElementById('pending-notice');
    const submitBtn = document.getElementById('submit-btn');
    const emailInput = document.getElementById('comment-email');
    
    // Character counter for comment
    document.getElementById('comment-text').addEventListener('input', function() {
      document.getElementById('comment-count').textContent = this.value.length;
    });
    
    // Check for pending comment when email is entered
    let checkTimeout;
    emailInput.addEventListener('blur', async function() {
      const email = this.value.trim();
      if (!email) return;
      
      clearTimeout(checkTimeout);
      checkTimeout = setTimeout(async () => {
        try {
          const res = await fetch('/api/blog/comments/check-pending', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blog_id: blogId, email: email })
          });
          const data = await res.json();
          
          if (data.hasPending) {
            pendingNotice.style.display = 'block';
            submitBtn.disabled = true;
          } else {
            pendingNotice.style.display = 'none';
            submitBtn.disabled = false;
          }
        } catch (err) {
          console.error('Check pending error:', err);
        }
      }, 500);
    });
    
    // Submit comment
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const name = document.getElementById('comment-name').value.trim();
      const email = document.getElementById('comment-email').value.trim();
      const comment = document.getElementById('comment-text').value.trim();
      
      if (!name || !email || !comment) {
        showMessage('Please fill in all fields.', 'error');
        return;
      }
      
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      
      try {
        const res = await fetch('/api/blog/comments/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blog_id: blogId,
            name: name,
            email: email,
            comment: comment
          })
        });
        const data = await res.json();
        
        if (data.success) {
          showMessage(data.message || 'Comment submitted successfully! It will appear after admin approval.', 'success');
          form.reset();
          pendingNotice.style.display = 'block';
          submitBtn.disabled = true;
        } else {
          if (data.hasPending) {
            pendingNotice.style.display = 'block';
            submitBtn.disabled = true;
          }
          showMessage(data.error || 'Failed to submit comment.', 'error');
        }
      } catch (err) {
        console.error('Submit error:', err);
        showMessage('An error occurred. Please try again.', 'error');
      }
      
      submitBtn.textContent = 'Submit Comment';
    });
    
    function showMessage(msg, type) {
      formMessage.textContent = msg;
      formMessage.className = 'form-message ' + type;
      formMessage.style.display = 'block';
      
      if (type === 'success') {
        setTimeout(() => {
          formMessage.style.display = 'none';
        }, 5000);
      }
    }
  </script>
  ${blog.custom_js ? `<script>${blog.custom_js}</script>` : ''}
</body>
</html>`;
}

// Forum question page HTML template generator
function generateForumQuestionHTML(question, replies = [], sidebar = {}) {
  const date = question.created_at ? new Date(question.created_at).toLocaleDateString('en-US', { 
    year: 'numeric', month: 'long', day: 'numeric' 
  }) : '';
  
  const safeTitle = (question.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeContent = (question.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  
  // Generate replies HTML
  const repliesHTML = replies.map(r => {
    const replyDate = r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    }) : '';
    const safeName = (r.name || 'Anonymous').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeReply = (r.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    return `
      <div class="reply-item">
        <div class="reply-header">
          <div class="reply-avatar">${safeName.charAt(0).toUpperCase()}</div>
          <div class="reply-info">
            <div class="reply-name">${safeName}</div>
            <div class="reply-date">${replyDate}</div>
          </div>
        </div>
        <div class="reply-content">${safeReply}</div>
      </div>
    `;
  }).join('');

  // Sidebar products
  const productsHTML = (sidebar.products || []).map(p => `
    <a href="/product-${p.id}/${p.slug || p.id}" class="sidebar-card">
      <img src="${p.thumbnail_url || 'https://via.placeholder.com/150x84?text=Product'}" alt="${p.title}">
      <div class="sidebar-card-info">
        <div class="sidebar-card-title">${(p.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        <div class="sidebar-card-price">$${p.sale_price || p.normal_price || 0}</div>
      </div>
    </a>
  `).join('');

  // Sidebar blogs
  const blogsHTML = (sidebar.blogs || []).map(b => `
    <a href="/blog/${b.slug}" class="sidebar-card">
      <img src="${b.thumbnail_url || 'https://via.placeholder.com/150x84?text=Blog'}" alt="${b.title}">
      <div class="sidebar-card-info">
        <div class="sidebar-card-title">${(b.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      </div>
    </a>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} - Forum - WishesU</title>
  <meta name="description" content="${safeTitle}">
  <link rel="stylesheet" href="/css/style.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; line-height: 1.6; }
    
    .forum-hero {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      padding: 40px 20px;
    }
    .forum-hero-inner {
      max-width: 1200px;
      margin: 0 auto;
      text-align: center;
    }
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: rgba(255,255,255,0.9);
      text-decoration: none;
      font-weight: 500;
      margin-bottom: 20px;
      transition: color 0.2s;
    }
    .back-link:hover { color: white; }
    .forum-hero h1 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 15px;
      line-height: 1.3;
    }
    .forum-meta {
      display: flex;
      justify-content: center;
      gap: 20px;
      opacity: 0.9;
      font-size: 0.95rem;
    }
    
    .forum-layout {
      max-width: 1200px;
      margin: -40px auto 0;
      padding: 0 20px 60px;
      display: grid;
      grid-template-columns: 200px 1fr 200px;
      gap: 30px;
      position: relative;
      z-index: 10;
    }
    
    .sidebar {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .sidebar-section h4 {
      font-size: 0.9rem;
      color: #6b7280;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .sidebar-card {
      display: block;
      background: white;
      border-radius: 10px;
      overflow: hidden;
      text-decoration: none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      transition: all 0.3s;
      margin-bottom: 12px;
    }
    .sidebar-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 16px rgba(0,0,0,0.15);
    }
    .sidebar-card img {
      width: 100%;
      aspect-ratio: 16/9;
      object-fit: cover;
    }
    .sidebar-card-info {
      padding: 12px;
    }
    .sidebar-card-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: #1f2937;
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .sidebar-card-price {
      color: #10b981;
      font-weight: 700;
      margin-top: 5px;
    }
    
    .main-content {
      min-width: 0;
    }
    
    .question-card {
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.15);
      overflow: hidden;
    }
    
    .question-body {
      padding: 35px;
    }
    
    .question-author {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 25px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
    }
    .author-avatar {
      width: 50px;
      height: 50px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 1.3rem;
    }
    .author-info { flex: 1; }
    .author-name {
      font-weight: 600;
      color: #1f2937;
      font-size: 1.1rem;
    }
    .author-date {
      font-size: 0.9rem;
      color: #6b7280;
    }
    
    .question-content {
      font-size: 1.1rem;
      color: #374151;
      line-height: 1.8;
    }
    
    /* Replies Section */
    .replies-section {
      margin-top: 40px;
      padding-top: 30px;
      border-top: 2px solid #e5e7eb;
    }
    .replies-section h3 {
      font-size: 1.3rem;
      color: #1f2937;
      margin-bottom: 25px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .reply-count-badge {
      background: #10b981;
      color: white;
      font-size: 0.85rem;
      padding: 4px 12px;
      border-radius: 20px;
    }
    
    .replies-list {
      display: flex;
      flex-direction: column;
      gap: 20px;
      margin-bottom: 35px;
    }
    .reply-item {
      background: #f9fafb;
      border-radius: 12px;
      padding: 20px;
      border-left: 4px solid #10b981;
    }
    .reply-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .reply-avatar {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 1rem;
    }
    .reply-info { flex: 1; }
    .reply-name {
      font-weight: 600;
      color: #1f2937;
    }
    .reply-date {
      font-size: 0.85rem;
      color: #6b7280;
    }
    .reply-content {
      color: #374151;
      line-height: 1.6;
    }
    
    .no-replies {
      text-align: center;
      padding: 30px;
      color: #6b7280;
      background: #f9fafb;
      border-radius: 12px;
    }
    
    /* Reply Form */
    .reply-form-card {
      background: #f9fafb;
      border-radius: 12px;
      padding: 25px;
    }
    .reply-form-card h4 {
      font-size: 1.1rem;
      color: #1f2937;
      margin-bottom: 20px;
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-bottom: 15px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .form-group.full { grid-column: span 2; }
    .form-group label {
      font-weight: 600;
      color: #374151;
      font-size: 0.9rem;
    }
    .form-group input,
    .form-group textarea {
      padding: 12px 15px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-size: 1rem;
      transition: border-color 0.2s;
      font-family: inherit;
    }
    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #10b981;
    }
    .form-group textarea {
      min-height: 120px;
      resize: vertical;
    }
    .submit-btn {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .submit-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 8px 16px rgba(16, 185, 129, 0.4);
    }
    .submit-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    
    .form-message {
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: none;
    }
    .form-message.success { background: #d1fae5; color: #065f46; display: block; }
    .form-message.error { background: #fee2e2; color: #991b1b; display: block; }
    
    .pending-notice {
      background: #fef3c7;
      color: #92400e;
      padding: 15px 20px;
      border-radius: 8px;
      text-align: center;
      margin-bottom: 20px;
    }
    
    @media (max-width: 1024px) {
      .forum-layout {
        grid-template-columns: 1fr;
      }
      .sidebar { display: none; }
    }
    
    @media (max-width: 768px) {
      .forum-hero h1 { font-size: 1.5rem; }
      .question-body { padding: 25px; }
      .form-row { grid-template-columns: 1fr; }
      .form-group.full { grid-column: span 1; }
    }
  </style>
</head>
<body>
  <script src="/js/global-components.js"></script>
  <div class="forum-hero">
    <div class="forum-hero-inner">
      <a href="/forum/" class="back-link">← Back to Forum</a>
      <h1>${safeTitle}</h1>
      <div class="forum-meta">
        <span>👤 ${(question.name || 'Anonymous').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
        ${date ? `<span>📅 ${date}</span>` : ''}
        <span>💬 ${replies.length} ${replies.length === 1 ? 'Reply' : 'Replies'}</span>
      </div>
    </div>
  </div>
  
  <div class="forum-layout">
    <!-- Left Sidebar - Products -->
    <div class="sidebar">
      <div class="sidebar-section">
        <h4>📦 Products</h4>
        ${productsHTML || '<p style="color:#9ca3af;font-size:0.9rem;">No products</p>'}
      </div>
    </div>
    
    <!-- Main Content -->
    <div class="main-content">
      <div class="question-card">
        <div class="question-body">
          <div class="question-author">
            <div class="author-avatar">${(question.name || 'A').charAt(0).toUpperCase()}</div>
            <div class="author-info">
              <div class="author-name">${(question.name || 'Anonymous').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
              <div class="author-date">${date}</div>
            </div>
          </div>
          
          <div class="question-content">${safeContent}</div>
          
          <!-- Replies Section -->
          <div class="replies-section">
            <h3>💬 Replies <span class="reply-count-badge">${replies.length}</span></h3>
            
            ${replies.length > 0 ? `
              <div class="replies-list">${repliesHTML}</div>
            ` : `
              <div class="no-replies">
                <p>No replies yet. Be the first to help!</p>
              </div>
            `}
            
            <!-- Reply Form -->
            <div class="reply-form-card">
              <h4>Post a Reply</h4>
              <div id="form-message" class="form-message"></div>
              <div id="pending-notice" class="pending-notice" style="display:none;">
                ⏳ You have a pending question or reply awaiting approval. Please wait for it to be approved.
              </div>
              <form id="reply-form">
                <input type="hidden" id="question-id" value="${question.id}">
                <div class="form-row">
                  <div class="form-group">
                    <label for="reply-name">Name *</label>
                    <input type="text" id="reply-name" placeholder="Your name" required>
                  </div>
                  <div class="form-group">
                    <label for="reply-email">Email *</label>
                    <input type="email" id="reply-email" placeholder="your@email.com" required>
                  </div>
                </div>
                <div class="form-group full">
                  <label for="reply-content">Your Reply *</label>
                  <textarea id="reply-content" placeholder="Write your helpful reply..." required></textarea>
                </div>
                <button type="submit" class="submit-btn" id="submit-btn">Submit Reply</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Right Sidebar - Blogs -->
    <div class="sidebar">
      <div class="sidebar-section">
        <h4>📝 Blog Posts</h4>
        ${blogsHTML || '<p style="color:#9ca3af;font-size:0.9rem;">No posts</p>'}
      </div>
    </div>
  </div>
  
  <script>
    const questionId = ${question.id};
    const form = document.getElementById('reply-form');
    const formMessage = document.getElementById('form-message');
    const pendingNotice = document.getElementById('pending-notice');
    const submitBtn = document.getElementById('submit-btn');
    const emailInput = document.getElementById('reply-email');
    
    // Check for pending when email entered
    let checkTimeout;
    emailInput.addEventListener('blur', async function() {
      const email = this.value.trim();
      if (!email) return;
      
      clearTimeout(checkTimeout);
      checkTimeout = setTimeout(async () => {
        try {
          const res = await fetch('/api/forum/check-pending', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
          });
          const data = await res.json();
          
          if (data.hasPending) {
            pendingNotice.style.display = 'block';
            submitBtn.disabled = true;
          } else {
            pendingNotice.style.display = 'none';
            submitBtn.disabled = false;
          }
        } catch (err) {
          console.error('Check pending error:', err);
        }
      }, 500);
    });
    
    // Submit reply
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const name = document.getElementById('reply-name').value.trim();
      const email = document.getElementById('reply-email').value.trim();
      const content = document.getElementById('reply-content').value.trim();
      
      if (!name || !email || !content) {
        showMessage('Please fill in all fields.', 'error');
        return;
      }
      
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      
      try {
        const res = await fetch('/api/forum/submit-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question_id: questionId,
            name: name,
            email: email,
            content: content
          })
        });
        const data = await res.json();
        
        if (data.success) {
          showMessage(data.message || 'Reply submitted! It will appear after admin approval.', 'success');
          form.reset();
          pendingNotice.style.display = 'block';
          submitBtn.disabled = true;
        } else {
          if (data.hasPending) {
            pendingNotice.style.display = 'block';
            submitBtn.disabled = true;
          }
          showMessage(data.error || 'Failed to submit reply.', 'error');
        }
      } catch (err) {
        console.error('Submit error:', err);
        showMessage('An error occurred. Please try again.', 'error');
      }
      
      submitBtn.textContent = 'Submit Reply';
    });
    
    function showMessage(msg, type) {
      formMessage.textContent = msg;
      formMessage.className = 'form-message ' + type;
      formMessage.style.display = 'block';
      
      if (type === 'success') {
        setTimeout(() => { formMessage.style.display = 'none'; }, 5000);
      }
    }
  </script>
</body>
</html>`;
}

export default {
  async fetch(req, env, ctx) {
    setVersion(env.VERSION);
    const url = new URL(req.url);
    const method = req.method;

    // Enforce HTTPS + canonical host to prevent duplicate HTTP/www indexing.
    // If we are already redirecting for host/protocol, fold in canonical path
    // normalization to avoid multi-hop redirect chains (better for crawlers).
    if ((method === 'GET' || method === 'HEAD') && !isLocalHostname(url.hostname)) {
      const canonicalHostname = getCanonicalHostname(url, env);
      const needsHttpsRedirect = isInsecureRequest(url, req);
      const needsHostRedirect = canonicalHostname && url.hostname.toLowerCase() !== canonicalHostname;
      const collapsedPathname = (url.pathname || '/').replace(/\/+/g, '/');
      const canonicalPathForPrimaryRedirect = getCanonicalRedirectPath(collapsedPathname);
      if (needsHttpsRedirect || needsHostRedirect) {
        const target = new URL(req.url);
        target.protocol = 'https:';
        if (needsHostRedirect) target.hostname = canonicalHostname;
        if (canonicalPathForPrimaryRedirect) target.pathname = canonicalPathForPrimaryRedirect;
        if (target.port === '80' || target.port === '443') target.port = '';
        return new Response(null, {
          status: 301,
          headers: {
            'Location': target.toString(),
            'Cache-Control': 'public, max-age=3600',
            // Ensure duplicate host/protocol URLs are explicitly deindexed.
            'X-Robots-Tag': 'noindex, nofollow',
            'Link': `<${target.toString()}>; rel="canonical"`
          }
        });
      }
    }

    // Normalize the request path
    let path = url.pathname.replace(/\/+/g, '/');
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    if (shouldServeCanonicalAliasDirectly(path)) {
      const directPath = normalizeCanonicalPath(path);
      if (directPath && directPath !== path) {
        path = directPath;
        url.pathname = directPath;
      }
    }

    // Fast reject obvious scanner/bot probes before any expensive work.
    if ((method === 'GET' || method === 'HEAD' || method === 'POST') && isLikelyScannerPath(path)) {
      return new Response('Not found', {
        status: 404,
        headers: {
          'Cache-Control': 'public, max-age=300',
          'X-Worker-Version': VERSION
        }
      });
    }

    // Fast reject unknown API probes to avoid unnecessary DB initialization.
    if (method !== 'OPTIONS' && path.startsWith('/api/') && !isKnownApiPath(path)) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: {
          ...CORS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'X-Worker-Version': VERSION
        }
      });
    }

    // Fast reject malformed blog/forum detail URLs before any DB warmup work.
    if ((method === 'GET' || method === 'HEAD') && (
      isMalformedNestedSlug(path, '/blog/') ||
      isMalformedNestedSlug(path, '/forum/')
    )) {
      return new Response('Not found', {
        status: 404,
        headers: {
          'Cache-Control': 'public, max-age=300',
          'X-Worker-Version': VERSION
        }
      });
    }

    // COLD START FIX: Start DB initialization early and WAIT for critical paths
    // For API routes and dynamic pages, we need the DB ready before processing
    const noJsSsrEarly = isNoJsSsrEnabled(env);
    const isHtmlLikeRequest = (method === 'GET' || method === 'HEAD') &&
      !/\.(css|js|ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot|mp4|webm|mp3|pdf)$/i.test(path);
    const requiresDB = path.startsWith('/api/') || 
                       path.startsWith('/blog/') || 
                       path.startsWith('/forum/') ||
                       path.startsWith('/product-') ||
                       path.startsWith('/admin/') ||
                       path === '/' ||
                       path === '/index.html' ||
                       (noJsSsrEarly && isHtmlLikeRequest);
    
    if (env.DB) {
      if (requiresDB) {
        // Wait for DB to be ready for critical paths (with timeout protection)
        try {
          await Promise.race([
            initDB(env),
            new Promise((_, reject) => setTimeout(() => reject(new Error('DB init timeout')), 4000))
          ]);
        } catch (e) {
          console.warn('DB init delayed:', e.message);
          // Continue anyway - the request handler will retry if needed
        }
      } else {
        // For static assets, warm up in background without blocking
        warmupDB(env, ctx);
      }
    }

// Route flags (computed once per request)
const isAdminUI = (path === '/admin' || path === '/admin/' || path.startsWith('/admin/'));
const isAdminAPI = path.startsWith('/api/admin/');
const isLoginRoute = (path === '/admin/login' || path === '/admin/login/');
const isLogoutRoute = (path === '/admin/logout' || path === '/admin/logout/');
const noJsSsrEnabled = isNoJsSsrEnabled(env);

// Some admin-only pages live outside /admin (legacy routes used by dashboard links)
const isAdminProtectedPage = (
  path === '/order-detail' ||
  path === '/order-detail/' ||
  path === '/order-detail.html' ||
  path === '/page-builder' ||
  path === '/page-builder/' ||
  path === '/page-builder.html' ||
  path === '/landing-builder' ||
  path === '/landing-builder/' ||
  path === '/landing-builder.html'
);

async function requireAdmin() {
  const ok = await isAdminAuthed(req, env);
  if (ok) return null;

  if (isAdminAPI) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }

  return Response.redirect(new URL('/admin/login', req.url).toString(), 302);
}

// Serve login page (GET)
if (isLoginRoute && method === 'GET') {
  // Already logged in? Send to admin.
  if (await isAdminAuthed(req, env)) {
    return Response.redirect(new URL('/admin', req.url).toString(), 302);
  }
  if (noJsSsrEnabled) {
    return renderNoJsAdminLoginPage(url);
  }

  if (env.ASSETS) {
    const loginAssetReq = new Request(new URL('/admin/login.html', req.url).toString(), { method: 'GET' });
    const loginAssetResp = await env.ASSETS.fetch(loginAssetReq);
    if (loginAssetResp.status === 200) {
      const html = await loginAssetResp.text();
      const headers = new Headers(loginAssetResp.headers);
      headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      headers.set('Pragma', 'no-cache');
      headers.set('X-Worker-Version', VERSION);
      return new Response(html, { status: 200, headers });
    }
  }

  return new Response('Admin login page not found.', {
    status: 404,
    headers: noStoreHeaders({ 'Content-Type': 'text/plain; charset=utf-8' })
  });
}

// Handle login (POST)
if (isLoginRoute && method === 'POST') {
  let email = '';
  let password = '';
  try {
    // Prefer formData for standard login form submissions.
    const form = await req.formData();
    email = (form.get('email') || '').toString().trim();
    password = (form.get('password') || '').toString();
  } catch (_) {
    // Some bots send malformed/unsupported payloads to /admin/login.
    // Fall back to parsing URL-encoded raw body and otherwise treat as invalid login.
    try {
      const raw = await req.text();
      const params = new URLSearchParams(raw || '');
      email = (params.get('email') || '').toString().trim();
      password = (params.get('password') || '').toString();
    } catch (_) {
      email = '';
      password = '';
    }
  }

  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
    return new Response('Admin login is not configured (missing secrets).', { status: 500, headers: noStoreHeaders() });
  }


  if (email === (env.ADMIN_EMAIL || '') && password === (env.ADMIN_PASSWORD || '')) {
    const cookieVal = await createAdminSessionCookie(env);

    return new Response(null, {
      status: 302,
      headers: noStoreHeaders({
        'Set-Cookie': cookieVal,
        'Location': new URL('/admin', req.url).toString()
      })
    });
  }

  return new Response('Invalid login', {
    status: 302,
    headers: noStoreHeaders({
      'Set-Cookie': createLogoutCookie(),
      'Location': new URL(noJsSsrEnabled ? '/admin/login?err=Invalid%20login' : '/admin/login?e=1', req.url).toString()
    })
  });
}

// Handle logout
if (isLogoutRoute) {
  return new Response(null, {
    status: 302,
    headers: noStoreHeaders({
      'Set-Cookie': createLogoutCookie(),
      'Location': new URL('/admin/login', req.url).toString()
    })
  });
}

// Protect admin UI + APIs + admin-only pages
if ((isAdminUI || isAdminAPI || isAdminProtectedPage) && !isLoginRoute) {
  const gate = await requireAdmin();
  if (gate) return gate;
}

// Canonical URL redirect layer to reduce duplicate-content URLs.
if (method === 'GET' || method === 'HEAD') {
  const canonicalRedirectPath = getCanonicalRedirectPath(path);
  if (canonicalRedirectPath) {
    const to = new URL(req.url);
    to.pathname = canonicalRedirectPath;
    return new Response(null, {
      status: 301,
      headers: {
        'Location': to.toString(),
        'Cache-Control': 'public, max-age=3600',
        // Old aliases (/home, *.html, etc.) should not be indexed.
        'X-Robots-Tag': 'noindex, nofollow',
        'Link': `<${to.toString()}>; rel="canonical"`
      }
    });
  }
}

    // ----- NO-JS SSR ROUTES (feature-flagged) -----
    // Keep disabled by default to preserve existing frontend layout.
    if (noJsSsrEnabled) {
      const noJsResponse = await handleNoJsRoutes(req, env, url, path, method);
      if (noJsResponse) return noJsResponse;
    }



    // Auto-purge cache on version change (only for admin/webhook routes)
    const shouldPurgeCache = (path.startsWith('/admin') || path.startsWith('/api/admin/') || path.startsWith('/api/whop/webhook')) && !path.startsWith('/admin/login') && !path.startsWith('/admin/logout');
    if (shouldPurgeCache) {
      await maybePurgeCache(env, initDB);
    }

    // Handle OPTIONS preflight
    if (method === 'OPTIONS') {
      return handleOptions(req);
    }

    // OPTIMIZATION: Fast path for static assets - skip all dynamic processing
    // These files don't need DB, SEO injection, or any processing
    const staticExtensions = /\.(css|js|ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot|mp4|webm|mp3|pdf)$/i;
    if ((method === 'GET' || method === 'HEAD') && staticExtensions.test(path) && env.ASSETS) {
      const assetResp = await env.ASSETS.fetch(req);
      if (assetResp.status === 200) {
        const headers = new Headers(assetResp.headers); headers.set('Alt-Svc', 'clear');
        // Cache static assets aggressively, but avoid long-lived caching for admin assets
        // so UI updates show up without requiring a manual hard refresh.
        const isAdminAsset = path.startsWith('/js/admin/') || path.startsWith('/css/admin/');
        if (isAdminAsset) {
          headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        } else if (!headers.has('Cache-Control')) {
          headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        }
        if (path === '/favicon.ico') {
          // Favicon is a UI asset, not a search landing page.
          headers.set('X-Robots-Tag', 'noindex, nofollow');
        }
        headers.set('X-Worker-Version', VERSION); headers.set('Alt-Svc', 'clear');
        return new Response(assetResp.body, { status: 200, headers });
      }
      // If not found, fall through to normal processing
    }

    // HEALTH CHECK ENDPOINT - For external warming services (UptimeRobot, cron-job.org)
    // This endpoint warms up DB and returns status
    // IMPROVED: Always initialize DB on health checks to ensure it's ready
    if (path === '/api/health' || path === '/_health') {
      const startTime = Date.now();
      let dbStatus = 'not_configured';

      if (env.DB) {
        try {
          // Force DB initialization on every health check
          await initDB(env);
          await env.DB.prepare('SELECT 1 as health').first();
          dbStatus = 'healthy';
        } catch (e) {
          dbStatus = 'error: ' + e.message;
        }
      }

      return new Response(JSON.stringify({
        status: 'ok',
        version: VERSION,
        db: dbStatus,
        responseTime: Date.now() - startTime + 'ms',
        timestamp: new Date().toISOString()
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      });
    }

    // Dynamic robots.txt + sitemap.xml (Minimal SEO 2025 - Google Standards)
    if ((method === 'GET' || method === 'HEAD')) {
      if (path === '/.well-known/apple-developer-merchantid-domain-association') {
        if (env.ASSETS) {
          // Try canonical Apple Pay verification path first.
          let assetResp = await env.ASSETS.fetch(new Request(new URL('/.well-known/apple-developer-merchantid-domain-association', req.url)));
          // Fallback for environments that skip dot-directories during asset upload.
          if (assetResp.status !== 200) {
            assetResp = await env.ASSETS.fetch(new Request(new URL('/apple-developer-merchantid-domain-association', req.url)));
          }
          if (assetResp.status === 200) {
            const txt = await assetResp.text();
            return new Response(txt.trim(), {
              status: 200,
              headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'public, max-age=300'
              }
            });
          }
        }
        return new Response('Not found', { status: 404 });
      }

      if (path === '/robots.txt') {
        if (env.DB) await initDB(env);
        const txt = await buildMinimalRobotsTxt(env, req);
        return new Response(txt, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=300'
          }
        });
      }

      if (path === '/sitemap.xml') {
        if (env.DB) await initDB(env);
        const sm = await buildMinimalSitemapXml(env, req);
        return new Response(sm.body, {
          status: 200,
          headers: {
            'Content-Type': (sm.contentType || 'application/xml') + '; charset=utf-8',
            'Cache-Control': 'public, max-age=300'
          }
        });
      }
    }

    try {
      // Private asset: never serve the raw product template directly
      if ((method === 'GET' || method === 'HEAD') && (path === '/_product_template.tpl' || path === '/_product_template' || path === '/_product_template.html')) {
        return new Response('Not found', { status: 404 });
      }

      // ----- CANONICAL PRODUCT URLs -----
      if ((method === 'GET' || method === 'HEAD') && (path === '/product' || path.startsWith('/product/') || path.startsWith('/product-'))) {
        // BOT PROTECTION: Quick Regex Validation to prevent DB hits for invalid URLs
        // Valid patterns: /product, /product/slug, /product-123, /product-123/slug
        // Adjusted regex to allow any characters in slug (encoded, unicode, etc)
        const isValidFormat =
          path === '/product' ||
          path === '/product/' ||
          /^\/product\/[^/]+$/.test(path) ||
          /^\/product-\d+(\/.*)?$/.test(path);

        if (!isValidFormat) {
          return new Response('Not found', { status: 404 });
        }

        if (env.DB) {
          await initDB(env);
          const redirect = await handleProductRouting(env, url, path);
          if (redirect) return redirect;
        }
      }

      // ----- BLOG POST PAGES -----
      if ((method === 'GET' || method === 'HEAD') && path.startsWith('/blog/') && path !== '/blog/' && !path.includes('.')) {
        const slug = path.replace('/blog/', '').replace(/\/$/, '');
        // Only attempt to serve from cache for GET requests. HEAD requests should
        // still hit the cache API to return headers quickly without body.
        if (method === 'GET' && caches && caches.default) {
          try {
            const cacheKey = buildVersionedCacheKey(req);
            const cachedResp = await caches.default.match(cacheKey);
            if (cachedResp) {
              return cachedResp;
            }
          } catch (err) {
            // Cache lookup failure should not break page rendering
            console.warn('Blog cache match error:', err);
          }
        }
        if (slug && env.DB) {
          try {
            await initDB(env);
            const blog = await env.DB.prepare(`
              SELECT * FROM blogs WHERE slug = ? AND status = 'published'
            `).bind(slug).first();
            
            if (blog) {
              // Run all queries in parallel for better CPU efficiency
              const [prevResult, commentsResult, seo] = await Promise.all([
                // Get previous 2 blog posts (before current one)
                env.DB.prepare(`
                  SELECT id, title, slug, description, thumbnail_url, created_at
                  FROM blogs 
                  WHERE status = 'published' AND id < ?
                  ORDER BY id DESC
                  LIMIT 2
                `).bind(blog.id).all(),
                // Get approved comments
                env.DB.prepare(`
                  SELECT id, name, comment, created_at
                  FROM blog_comments 
                  WHERE blog_id = ? AND status = 'approved'
                  ORDER BY created_at DESC
                `).bind(blog.id).all(),
                // Get SEO settings
                getSeoForRequest(env, req, { path })
              ]);
              
              const previousBlogs = prevResult.results || [];
              const comments = commentsResult.results || [];
              const htmlRaw = generateBlogPostHTML(blog, previousBlogs, comments);
              let html = applySeoToHtml(htmlRaw, seo.robots, seo.canonical);
              html = applySiteTitleToHtml(html, seo.siteTitle);

              // Fix 7: Inject BlogPosting JSON-LD schema
              try {
                const blogSchemaJson = generateBlogPostingSchema(blog, url.origin);
                html = html.replace('</head>', `<script type="application/ld+json">${blogSchemaJson}</script>\n</head>`);
              } catch (_) {}

              // Fix 7: Add og:url to blog pages
              try {
                const ogUrlTag = `<meta property="og:url" content="${seo.canonical}">`;
                html = html.replace('</head>', `${ogUrlTag}\n</head>`);
              } catch (_) {}

              // Fix 9: Add BreadcrumbList to blog pages
              try {
                const breadcrumbJson = generateBreadcrumbSchema([
                  { name: 'Home', url: url.origin },
                  { name: 'Blog', url: `${url.origin}/blog` },
                  { name: blog.title || '', url: seo.canonical }
                ]);
                html = html.replace('</head>', `<script type="application/ld+json">${breadcrumbJson}</script>\n</head>`);
              } catch (_) {}

              // Inject analytics scripts and verification meta tags
              try {
                html = await injectAnalyticsAndMeta(env, html);
              } catch (e) {}
              html = await applyGlobalComponentsSsr(env, html, path);

              const resp = new Response(html, {
                status: 200,
                headers: {
                  'Content-Type': 'text/html; charset=utf-8',
                  'X-Worker-Version': VERSION,
                  'X-Robots-Tag': seo.robots,
                  // Set a short max-age to hint caches while ensuring updates propagate
                  'Cache-Control': 'public, max-age=120'
                }
              });
              // Store in caches.default only for GET requests
              if (method === 'GET' && caches && caches.default) {
                try {
                  const cacheKey = buildVersionedCacheKey(req);
                  // We clone to avoid the body being locked
                  await caches.default.put(cacheKey, resp.clone());
                } catch (err) {
                  console.warn('Blog cache put error:', err);
                }
              }
              return resp;
            }
          } catch (e) {
            console.error('Blog fetch error:', e);
          }
        }
      }

      // ----- LEGACY FORUM QUESTION PAGE COMPATIBILITY -----
      if ((method === 'GET' || method === 'HEAD') && (path === '/forum/question.html' || path === '/forum/question')) {
        const questionId = parseInt(url.searchParams.get('id') || '', 10);
        if (Number.isFinite(questionId) && env.DB) {
          try {
            await initDB(env);
            const question = await env.DB.prepare(`
              SELECT slug
              FROM forum_questions
              WHERE id = ? AND status = 'approved'
            `).bind(questionId).first();
            if (question?.slug) {
              const legacyPath = `/forum/${encodeURIComponent(String(question.slug))}`;
              path = legacyPath;
              url.pathname = legacyPath;
              url.search = '';
            } else {
              path = '/forum/';
              url.pathname = '/forum/';
              url.search = '';
            }
          } catch (err) {
            console.warn('Legacy forum question redirect failed:', err);
            path = '/forum/';
            url.pathname = '/forum/';
            url.search = '';
          }
        } else {
          path = '/forum/';
          url.pathname = '/forum/';
          url.search = '';
        }
      }

      // ----- FORUM QUESTION PAGES -----
      if ((method === 'GET' || method === 'HEAD') && path.startsWith('/forum/') && path !== '/forum/' && !path.includes('.')) {
        const slug = path.replace('/forum/', '').replace(/\/$/, '');
        // Try to serve from cache for GET requests
        if (method === 'GET' && caches && caches.default) {
          try {
            const cacheKey = buildVersionedCacheKey(req);
            const cachedResp = await caches.default.match(cacheKey);
            if (cachedResp) {
              return cachedResp;
            }
          } catch (err) {
            console.warn('Forum cache match error:', err);
          }
        }
        if (slug && env.DB) {
          try {
            await initDB(env);
            const question = await env.DB.prepare(`
              SELECT * FROM forum_questions WHERE slug = ? AND status = 'approved'
            `).bind(slug).first();
            
            if (question) {
              // Run all queries in parallel for better CPU efficiency
              const [repliesResult, productsResult, blogsResult, seo] = await Promise.all([
                // Get approved replies
                env.DB.prepare(`
                  SELECT id, name, content, created_at
                  FROM forum_replies 
                  WHERE question_id = ? AND status = 'approved'
                  ORDER BY created_at ASC
                `).bind(question.id).all(),
                // Get sidebar products
                env.DB.prepare(`
                  SELECT id, title, slug, thumbnail_url, sale_price, normal_price
                  FROM products 
                  WHERE ${buildPublicProductStatusWhere('status')}
                  ORDER BY id DESC
                  LIMIT 2 OFFSET ?
                `).bind(Math.max(0, question.id - 1)).all(),
                // Get sidebar blogs
                env.DB.prepare(`
                  SELECT id, title, slug, thumbnail_url, description
                  FROM blogs 
                  WHERE status = 'published'
                  ORDER BY id DESC
                  LIMIT 2 OFFSET ?
                `).bind(Math.max(0, question.id - 1)).all(),
                // Get SEO settings
                getSeoForRequest(env, req, { path })
              ]);
              
              const replies = repliesResult.results || [];
              const sidebar = {
                products: productsResult.results || [],
                blogs: blogsResult.results || []
              };
              
              const htmlRaw = generateForumQuestionHTML(question, replies, sidebar);
              let html = applySeoToHtml(htmlRaw, seo.robots, seo.canonical);
              html = applySiteTitleToHtml(html, seo.siteTitle);

              // Fix 8: Inject QAPage JSON-LD schema
              try {
                const qaSchemaJson = generateQAPageSchema(question, replies, url.origin);
                html = html.replace('</head>', `<script type="application/ld+json">${qaSchemaJson}</script>\n</head>`);
              } catch (_) {}

              // Fix 8: Add OG tags to forum pages
              try {
                const safeForumTitle = (question.title || '').replace(/"/g, '&quot;');
                const forumContentSnippet = (question.content || '').replace(/<[^>]*>/g, '').substring(0, 160).replace(/"/g, '&quot;').replace(/\n/g, ' ');
                const ogTags = `<meta property="og:title" content="${safeForumTitle}">
    <meta property="og:description" content="${forumContentSnippet}">
    <meta property="og:url" content="${seo.canonical}">
    <meta property="og:type" content="website">`;
                html = html.replace('</head>', `${ogTags}\n</head>`);
              } catch (_) {}

              // Fix 8: Fix description meta to use actual content snippet
              try {
                const contentSnippet = (question.content || '').replace(/<[^>]*>/g, '').substring(0, 160).replace(/"/g, '&quot;').replace(/\n/g, ' ');
                const safeQTitle = (question.title || '').replace(/"/g, '&quot;');
                html = html.replace(
                  `<meta name="description" content="${safeQTitle}">`,
                  `<meta name="description" content="${contentSnippet || safeQTitle}">`
                );
              } catch (_) {}

              // Fix 9: Add BreadcrumbList to forum pages
              try {
                const breadcrumbJson = generateBreadcrumbSchema([
                  { name: 'Home', url: url.origin },
                  { name: 'Forum', url: `${url.origin}/forum` },
                  { name: question.title || '', url: seo.canonical }
                ]);
                html = html.replace('</head>', `<script type="application/ld+json">${breadcrumbJson}</script>\n</head>`);
              } catch (_) {}

              // Inject analytics scripts and verification meta tags
              try {
                html = await injectAnalyticsAndMeta(env, html);
              } catch (e) {}
              html = await applyGlobalComponentsSsr(env, html, path);

              const resp = new Response(html, {
                status: 200,
                headers: {
                  'Content-Type': 'text/html; charset=utf-8',
                  'X-Worker-Version': VERSION,
                  'X-Robots-Tag': seo.robots,
                  'Cache-Control': 'public, max-age=120'
                }
              });
              // Put into cache for GET requests
              if (method === 'GET' && caches && caches.default) {
                try {
                  const cacheKey = buildVersionedCacheKey(req);
                  await caches.default.put(cacheKey, resp.clone());
                } catch (err) {
                  console.warn('Forum cache put error:', err);
                }
              }
              return resp;
            }
          } catch (e) {
            console.error('Forum question fetch error:', e);
          }
        }
      }

      // ----- API ROUTES -----
      if (path.startsWith('/api/') || path === '/submit-order') {
        const apiResponse = await routeApiRequest(req, env, url, path, method);
        if (apiResponse) return apiResponse;
      }

      // ----- SECURE DOWNLOAD -----
      if (path.startsWith('/download/')) {
        const orderId = path.split('/').pop();
        return handleSecureDownload(env, orderId, url.origin);
      }

      // ----- ADMIN SPA ROUTING -----
      // Handle both /admin and /admin/ and all admin sub-routes
      if ((path === '/admin' || path.startsWith('/admin/')) && !path.startsWith('/api/')) {
        // These standalone pages should be served directly from assets
        const standaloneAdminPages = new Map([
          ['/admin/product-form.html', '/admin/product-form.html'],
          ['/admin/blog-form.html', '/admin/blog-form.html'],
          // Source file currently lives at project root for legacy compatibility.
          ['/admin/page-builder.html', '/page-builder.html'],
          ['/admin/landing-builder.html', '/admin/landing-builder.html'],
          ['/admin/migrate-reviews.html', '/admin/migrate-reviews.html']
        ]);
        
        if (standaloneAdminPages.has(path)) {
          // Serve these pages directly from assets
          if (env.ASSETS) {
            const assetPath = standaloneAdminPages.get(path);
            const assetResp = await env.ASSETS.fetch(new Request(new URL(assetPath, req.url)));
            const headers = new Headers(assetResp.headers); headers.set('Alt-Svc', 'clear');
            headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
            headers.set('Pragma', 'no-cache');
            headers.set('X-Worker-Version', VERSION); headers.set('Alt-Svc', 'clear');
            return new Response(assetResp.body, { status: assetResp.status, headers });
          }
        } else {
          // Serve the main dashboard.html for all other admin routes
          // This includes: /admin, /admin/, /admin/dashboard.html, /admin/orders.html, etc.
          if (env.ASSETS) {
            const assetResp = await env.ASSETS.fetch(new Request(new URL('/admin/dashboard.html', req.url)));
            const headers = new Headers(assetResp.headers); headers.set('Alt-Svc', 'clear');
            headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
            headers.set('Pragma', 'no-cache');
            headers.set('X-Worker-Version', VERSION); headers.set('Alt-Svc', 'clear');
            return new Response(assetResp.body, { status: assetResp.status, headers });
          }
        }
      }

      // ----- DYNAMIC PAGES -----
      // Support both clean URLs (/forum) and .html URLs (/forum.html)
      // Instead of redirecting .html to clean URLs, we attempt to serve
      // dynamic pages directly when a matching slug exists in the database.
      const coreStaticPages = ['index', 'products', 'products-grid', 'product', 'buyer-order', 'order-detail', 'order-success', 'success', 'checkout', 'page-builder'];
      
      // Check for .html extension and attempt to serve a dynamic page when a slug exists.
      if (path.endsWith('.html') && !path.includes('/admin/') && !path.startsWith('/admin') && !path.startsWith('/blog/') && !path.startsWith('/forum/')) {
        const slug = path.slice(1).replace(/\.html$/, '');
        // Only attempt to serve non-core pages via the database
        if (!coreStaticPages.includes(slug) && canLookupDynamicSlug(slug)) {
          try {
            if (env.DB) {
              await initDB(env);
              const row = await env.DB.prepare('SELECT content FROM pages WHERE slug = ? AND status = ?').bind(slug, 'published').first();
              if (row && row.content) {
                // Serve the dynamic page content directly instead of redirecting.
                let html = await applyComponentSsrToHtml(env, row.content, url, path);
                html = await applyGlobalComponentsSsr(env, html, path);
                // Apply SEO tags if available.
                try {
                  const seo = await getSeoForRequest(env, req, { path: '/' + slug });
                  html = applySeoToHtml(html, seo.robots, seo.canonical);
                  html = applySiteTitleToHtml(html, seo.siteTitle);
                } catch (e) {}
                // Inject analytics and verification tags on dynamic pages
                try {
                  html = await injectAnalyticsAndMeta(env, html);
                } catch (_) {}
                return new Response(html, {
                  status: 200,
                  headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    'X-Worker-Version': VERSION,
                    'Cache-Control': 'public, max-age=120'
                  }
                });
              }
            }
          } catch (e) {
            // Continue to static assets if dynamic lookup fails
          }
        }
      }
      
      // Serve dynamic pages with clean URLs (no .html)
      if (!path.includes('.') && !path.includes('/admin') && !path.startsWith('/api/') && path !== '/' && !path.startsWith('/blog/') && !path.startsWith('/forum/') && !path.startsWith('/product-') && !path.startsWith('/download/')) {
        const slug = path.slice(1).replace(/\/$/, ''); // Remove leading slash and trailing slash
        if (slug && !coreStaticPages.includes(slug) && canLookupDynamicSlug(slug)) {
          try {
            if (env.DB) {
              await initDB(env);
              const row = await env.DB.prepare('SELECT content FROM pages WHERE slug = ? AND status = ?').bind(slug, 'published').first();
              if (row && row.content) {
                let html = await applyComponentSsrToHtml(env, row.content, url, path);
                html = await applyGlobalComponentsSsr(env, html, path);

                // Apply SEO
                try {
                  const seo = await getSeoForRequest(env, req, { path: '/' + slug });
                  html = applySeoToHtml(html, seo.robots, seo.canonical);
                  html = applySiteTitleToHtml(html, seo.siteTitle);
                } catch (e) {}
                // Inject analytics and verification tags on dynamic pages
                try {
                  html = await injectAnalyticsAndMeta(env, html);
                } catch (_) {}
                
                return new Response(html, {
                  status: 200,
                  headers: { 
                    'Content-Type': 'text/html; charset=utf-8',
                    'X-Worker-Version': VERSION,
                    'Cache-Control': 'public, max-age=120'
                  }
                });
              }
            }
          } catch (e) {
            // continue to static assets
          }
        }
      }

      // ----- HTML ASSET MAPPINGS -----
      // Certain `.html` routes should serve a different static file directly
      // rather than redirecting.  This avoids broken links when no database
      // is configured and eliminates unnecessary redirects for end users.
      if ((method === 'GET' || method === 'HEAD') && path === '/terms') {
        let html = renderTermsFallbackPageHtml();
        let robots = 'index, follow';
        let canonical = new URL('/terms', req.url).toString();
        let siteTitle = '';
        try {
          const seo = await getSeoForRequest(env, req, { path: '/terms' });
          robots = seo.robots || robots;
          canonical = seo.canonical || canonical;
          siteTitle = seo.siteTitle || '';
        } catch (_) {}
        html = applySeoToHtml(html, robots, canonical);
        html = applySiteTitleToHtml(html, siteTitle);
        html = await applyGlobalComponentsSsr(env, html, '/terms');
        try {
          html = await injectAnalyticsAndMeta(env, html);
        } catch (_) {}
        const headers = new Headers({
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'X-Worker-Version': VERSION
        });
        headers.set('X-Robots-Tag', robots);
        if (method === 'HEAD') {
          return new Response(null, { status: 200, headers });
        }
        return new Response(html, { status: 200, headers });
      }

      if (method === 'GET' || method === 'HEAD') {
        const htmlAssetTargets = {
          // Checkout and order flows are always served from static assets.
          '/checkout': '/checkout.html',
          '/checkout/': '/checkout.html',
          '/checkout/index.html': '/checkout.html',
          '/success': '/success.html',
          '/success/': '/success.html',
          '/success/index.html': '/success.html',
          '/buyer-order': '/buyer-order.html',
          '/buyer-order/': '/buyer-order.html',
          '/buyer-order/index.html': '/buyer-order.html',
          '/order-detail': '/order-detail.html',
          '/order-detail/': '/order-detail.html',
          '/order-detail/index.html': '/order-detail.html',
          '/products': '/products-grid.html',
          '/products/': '/products-grid.html',
          '/products/index.html': '/products-grid.html',
          '/products-grid': '/products-grid.html',
          '/products-grid/': '/products-grid.html',
          // Map blog and forum to their index files so these archives load
          // without needing to redirect to `/blog` or `/forum`.
          '/blog': '/blog/index.html',
          '/blog/': '/blog/index.html',
          '/blog.html': '/blog/index.html',
          '/forum': '/forum/index.html',
          '/forum/': '/forum/index.html',
          '/forum.html': '/forum/index.html'
        };

        const target = htmlAssetTargets[path];
        if (target) {
          // Serve the target asset directly from the ASSETS KV.  We mirror
          // the header behaviour used elsewhere in the router.
          if (env.ASSETS) {
            const assetResp = await env.ASSETS.fetch(new Request(new URL(target, req.url)));
            const headers = new Headers(assetResp.headers);
            headers.set('Alt-Svc', 'clear');
            headers.set('X-Worker-Version', VERSION);
            const normalizedPath = normalizeCanonicalPath(path);
            const sensitiveMappedPage = isSensitiveNoindexPath(normalizedPath);
            if (sensitiveMappedPage) {
              headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
              headers.set('Pragma', 'no-cache');
            } else {
              headers.set('Cache-Control', 'public, max-age=300');
            }

            const contentType = headers.get('content-type') || headers.get('Content-Type') || '';
            const isHtmlTarget = contentType.includes('text/html') || target.endsWith('.html');
            if (assetResp.status === 200 && method === 'GET' && isHtmlTarget) {
              let html = await assetResp.text();
              html = await applyComponentSsrToHtml(env, html, url, path);
              html = await applyGlobalComponentsSsr(env, html, path);
              try {
                const seo = await getSeoForRequest(env, req, { path: normalizedPath });
                html = applySeoToHtml(html, seo.robots, seo.canonical);
                html = applySiteTitleToHtml(html, seo.siteTitle);
                headers.set('X-Robots-Tag', seo.robots);
                const noindexTags = await getNoindexMetaTags(env, {
                  pathname: normalizedPath,
                  rawPathname: path,
                  url
                });
                if (noindexTags) {
                  html = html.replace(/<\/head>/i, `\n    ${noindexTags}\n  </head>`);
                }
              } catch (_) {}
              try {
                html = await injectAnalyticsAndMeta(env, html);
              } catch (_) {}

              headers.set('Content-Type', 'text/html; charset=utf-8');
              return new Response(html, { status: 200, headers });
            }

            return new Response(assetResp.body, { status: assetResp.status, headers });
          }
        }
      }

      // ----- DEFAULT PAGE ROUTING -----
      // Check for default pages and serve them instead of static files
      if ((method === 'GET' || method === 'HEAD') && env.DB) {
        let defaultPageType = null;
        
        // Home page — serve default home from DB only at the canonical root URL.
        if (path === '/' || path === '/index.html') {
          defaultPageType = 'home';
        }
        // Blog archive
        else if (path === '/blog/' || path === '/blog/index.html' || path === '/blog' || path === '/blog.html') {
          defaultPageType = 'blog_archive';
        }
        // Forum archive
        else if (path === '/forum/' || path === '/forum/index.html' || path === '/forum' || path === '/forum.html') {
          defaultPageType = 'forum_archive';
        }
        // Product grid
        else if (
          path === '/products' ||
          path === '/products/' ||
          path === '/products/index.html' ||
          path === '/products.html' ||
          path === '/products-grid' ||
          path === '/products-grid/' ||
          path === '/products-grid.html'
        ) {
          defaultPageType = 'product_grid';
        }
        
        if (defaultPageType) {
          try {
            await initDB(env);
            const defaultPage = await env.DB.prepare(
              'SELECT content FROM pages WHERE page_type = ? AND is_default = 1 AND status = ?'
            ).bind(defaultPageType, 'published').first();
            
            if (defaultPage && defaultPage.content) {
              let html = await applyComponentSsrToHtml(env, defaultPage.content, url, path);
              html = await applyGlobalComponentsSsr(env, html, path);

              // Apply SEO tags (robots, canonical)
              const responseHeaders = {
                'Content-Type': 'text/html; charset=utf-8',
                'X-Worker-Version': VERSION,
                'X-Default-Page': defaultPageType,
                'Cache-Control': 'public, max-age=120'
              };
              try {
                const seo = await getSeoForRequest(env, req, { path });
                html = applySeoToHtml(html, seo.robots, seo.canonical);
                html = applySiteTitleToHtml(html, seo.siteTitle);
                responseHeaders['X-Robots-Tag'] = seo.robots;
                // Add noindex tags if needed
                const noindexTags = await getNoindexMetaTags(env, {
                  pathname: normalizeCanonicalPath(path),
                  rawPathname: path,
                  url
                });
                if (noindexTags) {
                  html = html.replace(/<\/head>/i, `\n    ${noindexTags}\n  </head>`);
                }
                // Inject analytics and verification tags
                try {
                  html = await injectAnalyticsAndMeta(env, html);
                } catch (_) {}
                // Homepage: inject Organization + WebSite schema
                if (defaultPageType === 'home') {
                  try {
                    const seoResp = await getMinimalSEOSettings(env);
                    let seoSettings = {};
                    if (seoResp && typeof seoResp.json === 'function') {
                      const parsed = await seoResp.json();
                      seoSettings = (parsed && parsed.settings) || {};
                    }
                    if (!seoSettings.site_url) seoSettings.site_url = url.origin;
                    if (!seoSettings.site_title) seoSettings.site_title = 'WishVideo';
                    const orgSchema = generateOrganizationSchema(seoSettings);
                    const siteSchema = generateWebSiteSchema(seoSettings);
                    html = html.replace(/<\/head>/i, `<script type="application/ld+json">${orgSchema}</script>\n<script type="application/ld+json">${siteSchema}</script>\n</head>`);
                  } catch (_) {}
                }
              } catch (e) {
                // ignore SEO injection errors
              }

              return new Response(html, {
                status: 200,
                headers: responseHeaders
              });
            }
          } catch (e) {
            console.error('Default page error:', e);
            // Continue to static assets
          }
        }
      }

      // ----- STATIC ASSETS WITH SERVER-SIDE SCHEMA INJECTION & CACHING -----
      if (env.ASSETS) {
        let assetReq = req;
        let assetPath = path;
        let schemaProductId = null;
        let schemaProduct = null;

        // Canonical product URLs: /product-<id>/<slug>
        if ((method === 'GET' || method === 'HEAD')) {
          const canonicalMatch = assetPath.match(/^\/product-(\d+)\/(.+)$/);
          if (canonicalMatch) {
            const pid = Number(canonicalMatch[1]);
            if (!Number.isNaN(pid)) {
              schemaProductId = pid;
              const rewritten = new URL(req.url);
              rewritten.pathname = '/_product_template.tpl';
              rewritten.searchParams.set('id', String(schemaProductId));
              assetReq = new Request(rewritten.toString(), req);
              assetPath = '/_product_template.tpl';
            }
          }

          // Archive aliases: resolve folder URLs to concrete index assets to avoid
          // asset-layer redirect loops and allow SSR injection in one code path.
          const archiveAssetAliases = {
            '/blog': '/blog/index.html',
            '/blog/': '/blog/index.html',
            '/forum': '/forum/index.html',
            '/forum/': '/forum/index.html',
            '/products': '/products-grid.html',
            '/products/': '/products-grid.html',
            '/products/index.html': '/products-grid.html',
            '/products-grid': '/products-grid.html',
            '/products-grid/': '/products-grid.html'
          };
          const archiveTarget = archiveAssetAliases[assetPath];
          if (archiveTarget) {
            const rewritten = new URL(req.url);
            rewritten.pathname = archiveTarget;
            assetReq = new Request(rewritten.toString(), req);
            assetPath = archiveTarget;
          }
        }

        let assetResp = await env.ASSETS.fetch(assetReq);

        // Defensive fallback for product listing route: if the asset layer
        // responds with a redirect or not-found for `/products`, serve the
        // concrete grid file directly to avoid loops and 404 indexing issues.
        if (
          (method === 'GET' || method === 'HEAD') &&
          (assetPath === '/products' || assetPath === '/products/') &&
          [301, 302, 307, 308, 404].includes(assetResp.status)
        ) {
          try {
            const fallbackUrl = new URL('/products-grid.html', req.url);
            assetReq = new Request(fallbackUrl.toString(), req);
            assetPath = '/products-grid.html';
            const fallbackResp = await env.ASSETS.fetch(assetReq);
            if (fallbackResp.status === 200) {
              assetResp = fallbackResp;
            }
          } catch (_) {}
        }
        
        const contentType = assetResp.headers.get('content-type') || '';
        const isHTML = contentType.includes('text/html') || assetPath === '/_product_template.tpl';
        const isSuccess = assetResp.status === 200;
        
        // Caching: Only cache public, non-sensitive HTML pages.
        const normalizedAssetPathForCache = normalizeCanonicalPath(path);
        const localDevRequest = isLocalDevHost(url.hostname);
        const shouldCache = isHTML &&
          isSuccess &&
          !localDevRequest &&
          !path.startsWith('/admin') &&
          !path.includes('/admin/') &&
          !isSensitiveNoindexPath(normalizedAssetPathForCache);
        const cacheKey = buildVersionedCacheKey(req, 'text/html');

        if (shouldCache) {
          try {
            // Check cache first
            const cachedResponse = await caches.default.match(cacheKey);
            if (cachedResponse) {
              const headers = new Headers(cachedResponse.headers);
              headers.set('X-Cache', 'HIT');
              headers.set('X-Worker-Version', VERSION); headers.set('Alt-Svc', 'clear');
              return new Response(cachedResponse.body, { 
                status: cachedResponse.status, 
                headers 
              });
            }
          } catch (cacheError) {
            // Continue with normal processing if cache fails
          }
        }
        
        if (isHTML && isSuccess) {
          try {
            const baseUrl = url.origin;
            let html = await assetResp.text();

            // Blog archive page - render first-page content on server so layout
            // remains visible with JS disabled and avoids client fetch churn.
            if ((assetPath === '/blog/' || assetPath === '/blog/index.html') && env.DB) {
              try {
                await initDB(env);

                const pageRaw = parseInt(url.searchParams.get('page') || '1', 10);
                const limitRaw = parseInt(url.searchParams.get('limit') || '30', 10);
                const pageNumber = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
                const limitNumber = Number.isFinite(limitRaw) ? Math.max(1, Math.min(60, limitRaw)) : 30;
                const offset = (pageNumber - 1) * limitNumber;

                const [countResult, blogsResult] = await Promise.all([
                  env.DB.prepare(`SELECT COUNT(*) as total FROM blogs WHERE status = 'published'`).first(),
                  env.DB.prepare(`
                    SELECT id, title, slug, description, thumbnail_url, created_at
                    FROM blogs
                    WHERE status = 'published'
                    ORDER BY created_at DESC, id DESC
                    LIMIT ? OFFSET ?
                  `).bind(limitNumber, offset).all()
                ]);

                const total = Number(countResult?.total || 0);
                const totalPages = total > 0 ? Math.ceil(total / limitNumber) : 0;
                const pagination = {
                  page: pageNumber,
                  limit: limitNumber,
                  total,
                  totalPages,
                  hasNext: offset + limitNumber < total,
                  hasPrev: pageNumber > 1
                };
                const blogs = Array.isArray(blogsResult?.results) ? blogsResult.results : [];
                const archiveMarkup = renderBlogArchiveCardsSsr(blogs, pagination);

                const archiveContainerRe = /<div id="blog-archive"([^>]*)>[\s\S]*?<\/div>/i;
                if (archiveContainerRe.test(html)) {
                  html = html.replace(archiveContainerRe, (_full, attrs = '') => {
                    const cleanAttrs = String(attrs || '').replace(/\sdata-ssr="[^"]*"/gi, '');
                    return `<div id="blog-archive"${cleanAttrs} data-ssr="1">${archiveMarkup}</div>`;
                  });
                }

                if (!html.includes('id="blog-archive-bootstrap"')) {
                  const bootstrapData = {
                    blogs,
                    pagination
                  };
                  const bootstrapJson = JSON.stringify(bootstrapData).replace(/</g, '\\u003c');
                  const bootstrapTag = `<script type="application/json" id="blog-archive-bootstrap">${bootstrapJson}</script>`;
                  html = html.replace('</head>', `${bootstrapTag}\n</head>`);
                }

                if (blogs.length > 0) {
                  const itemListSchema = {
                    '@context': 'https://schema.org',
                    '@type': 'CollectionPage',
                    name: 'Blog',
                    url: `${baseUrl}/blog`,
                    mainEntity: {
                      '@type': 'ItemList',
                      itemListOrder: 'https://schema.org/ItemListOrderDescending',
                      numberOfItems: blogs.length,
                      itemListElement: blogs.map((blog, idx) => ({
                        '@type': 'ListItem',
                        position: idx + 1,
                        url: `${baseUrl}/blog/${encodeURIComponent(String(blog.slug || blog.id || '').trim())}`,
                        name: String(blog.title || '')
                      }))
                    }
                  };
                  html = html.replace(
                    '</head>',
                    `<script type="application/ld+json">${JSON.stringify(itemListSchema)}</script>\n</head>`
                  );
                }
              } catch (archiveErr) {
                console.warn('Blog archive SSR injection error:', archiveErr);
              }
            }
            
            // Product detail page - inject individual product schema
            if (assetPath === '/_product_template.tpl' || assetPath === '/product.html' || assetPath === '/product') {
              const productId = schemaProductId ? String(schemaProductId) : url.searchParams.get('id');
              if (productId && env.DB) {
                await initDB(env);
                
                // OPTIMIZED: Run both queries in parallel
                const [productResult, reviewsResult] = await Promise.all([
                  env.DB.prepare(`
                    SELECT p.*, 
                      COUNT(r.id) as review_count, 
                      AVG(r.rating) as rating_average
                    FROM products p
                    LEFT JOIN reviews r ON p.id = r.product_id AND r.status = 'approved'
                    WHERE p.id = ? AND ${buildPublicProductStatusWhere('p.status')}
                    GROUP BY p.id
                  `).bind(Number(productId)).first(),
                  env.DB.prepare(
                    'SELECT * FROM reviews WHERE product_id = ? AND status = ? ORDER BY created_at DESC LIMIT 5'
                  ).bind(Number(productId), 'approved').all()
                ]);
                
                const product = productResult;
                  if (product) {
                    schemaProduct = product;
                    const reviews = reviewsResult.results || [];
                    let adjacent = { previous: null, next: null };
                    let siteBranding = { logo_url: '', favicon_url: '' };
                    let siteComponents = {};
                    let whopSettingsBootstrap = {};

                    // Step 8: preload product-page runtime dependencies to reduce follow-up API calls.
                    try {
                      const [settingsRowsResult, whopGateway, prev, next] = await Promise.all([
                        env.DB.prepare(
                          'SELECT key, value FROM settings WHERE key IN (?, ?, ?)'
                        ).bind('site_branding', 'site_components', 'whop').all(),
                        env.DB.prepare(`
                          SELECT whop_product_id, whop_theme, webhook_secret, whop_api_key
                          FROM payment_gateways
                          WHERE gateway_type = 'whop'
                          ORDER BY is_enabled DESC, id DESC
                          LIMIT 1
                        `).first().catch(() => null),
                        env.DB.prepare(`
                          SELECT id, title, slug, thumbnail_url
                          FROM products
                          WHERE ${buildPublicProductStatusWhere('status')}
                          AND (
                            sort_order < ?
                            OR (sort_order = ? AND id > ?)
                          )
                          ORDER BY sort_order DESC, id ASC
                          LIMIT 1
                        `).bind(product.sort_order, product.sort_order, product.id).first(),
                        env.DB.prepare(`
                          SELECT id, title, slug, thumbnail_url
                          FROM products
                          WHERE ${buildPublicProductStatusWhere('status')}
                          AND (
                            sort_order > ?
                            OR (sort_order = ? AND id < ?)
                          )
                          ORDER BY sort_order ASC, id DESC
                          LIMIT 1
                        `).bind(product.sort_order, product.sort_order, product.id).first()
                      ]);

                      const settingsRows = settingsRowsResult && Array.isArray(settingsRowsResult.results)
                        ? settingsRowsResult.results
                        : [];
                      const settingsMap = new Map(settingsRows.map((row) => [String(row.key || ''), row.value]));

                      try {
                        const brandingRaw = settingsMap.get('site_branding');
                        if (brandingRaw) {
                          const parsed = JSON.parse(brandingRaw);
                          if (parsed && typeof parsed === 'object') {
                            siteBranding = {
                              logo_url: parsed.logo_url || '',
                              favicon_url: parsed.favicon_url || ''
                            };
                          }
                        }
                      } catch (_) {}

                      try {
                        const componentsRaw = settingsMap.get('site_components');
                        if (componentsRaw) {
                          const parsed = JSON.parse(componentsRaw);
                          if (parsed && typeof parsed === 'object') {
                            siteComponents = parsed;
                          }
                        }
                      } catch (_) {}

                      try {
                        const whopLegacyRaw = settingsMap.get('whop');
                        if (whopLegacyRaw) {
                          const parsed = JSON.parse(whopLegacyRaw);
                          if (parsed && typeof parsed === 'object') {
                            whopSettingsBootstrap = { ...parsed };
                          }
                        }
                      } catch (_) {}

                      if (whopGateway) {
                        whopSettingsBootstrap.default_product_id = whopGateway.whop_product_id || whopSettingsBootstrap.default_product_id || '';
                        whopSettingsBootstrap.product_id = whopGateway.whop_product_id || whopSettingsBootstrap.product_id || '';
                        whopSettingsBootstrap.theme = whopGateway.whop_theme || whopSettingsBootstrap.theme || 'light';
                        whopSettingsBootstrap.webhook_secret = whopGateway.webhook_secret || whopSettingsBootstrap.webhook_secret || '';
                        if (env.WHOP_API_KEY || whopGateway.whop_api_key) {
                          whopSettingsBootstrap.api_key = '********';
                        }
                      }

                      adjacent = {
                        previous: prev ? {
                          id: prev.id,
                          title: prev.title,
                          slug: prev.slug,
                          thumbnail_url: prev.thumbnail_url,
                          url: `/product-${prev.id}/${encodeURIComponent(prev.slug || '')}`
                        } : null,
                        next: next ? {
                          id: next.id,
                          title: next.title,
                          slug: next.slug,
                          thumbnail_url: next.thumbnail_url,
                          url: `/product-${next.id}/${encodeURIComponent(next.slug || '')}`
                        } : null
                      };
                    } catch (_) {}

                    const schemaJson = generateProductSchema(product, baseUrl, reviews);
                    html = injectSchemaIntoHTML(html, 'product-schema', schemaJson);

                    // Product bootstrap: embed enough data to render without an extra API call.
                    // This improves LCP on slow networks (product layout is client-rendered).
                    try {
                      if (!html.includes('id="product-bootstrap"')) {
                        let addons = [];
                        try {
                          addons = JSON.parse(product.addons_json || '[]');
                        } catch (_) {
                          addons = [];
                        }

                        const deliveryTimeDays = parseInt(product.normal_delivery_text) || 1;
                        const bootstrap = {
                          product: {
                            id: product.id,
                            title: product.title,
                            description: product.description || '',
                            normal_price: product.normal_price,
                            sale_price: product.sale_price,
                            instant_delivery: product.instant_delivery,
                            normal_delivery_text: product.normal_delivery_text,
                            delivery_time_days: deliveryTimeDays,
                            thumbnail_url: product.thumbnail_url,
                            video_url: product.video_url,
                            gallery_images: product.gallery_images,
                            review_count: parseInt(product.review_count) || 0,
                            rating_average: product.rating_average ? Math.round(Number(product.rating_average) * 10) / 10 : 0,
                            reviews,
                            adjacent
                          },
                          addons,
                          whopSettings: whopSettingsBootstrap,
                          siteBranding,
                          siteComponents
                        };

                        const bootstrapJson = JSON.stringify(bootstrap).replace(/</g, '\\u003c');
                        const bootstrapTag = `<script type="application/json" id="product-bootstrap">${bootstrapJson}</script>`;
                        html = html.replace('</head>', `${bootstrapTag}\n</head>`);
                      }
                    } catch (_) {}

                    // SSR step (media + slider + info shell): render above-the-fold
                    // product layout on server so first visible content is not JS-blocked.
                    try {
                      const playerShellHtml = renderProductStep1PlayerShell(
                        product,
                        product.addons_json || '[]',
                        reviews
                      );
                      if (playerShellHtml) {
                        html = injectProductInitialContent(html, playerShellHtml, true);
                      }
                    } catch (_) {}
                   
                    // Inject VideoObject schema for video rich results
                    const videoSchemaJson = generateVideoSchema(product, baseUrl);
                    if (videoSchemaJson && videoSchemaJson !== '{}') {
                      const videoSchemaTag = `<script type="application/ld+json" id="video-schema">${videoSchemaJson}</script>`;
                    html = html.replace('</head>', `${videoSchemaTag}\n</head>`);
                  }
                  
                  // Add video meta tags for social sharing and SEO
                  if (product.video_url || product.preview_video_url) {
                    const videoUrl = product.video_url || product.preview_video_url;
                    const videoMetaTags = `
    <meta property="og:type" content="video.other">
    <meta property="og:video" content="${videoUrl}">
    <meta property="og:video:url" content="${videoUrl}">
    <meta property="og:video:secure_url" content="${videoUrl}">
    <meta property="og:video:type" content="video/mp4">
    <meta property="og:video:width" content="1280">
    <meta property="og:video:height" content="720">
    <meta name="twitter:card" content="player">
    <meta name="twitter:player" content="${videoUrl}">
    <meta name="twitter:player:width" content="1280">
    <meta name="twitter:player:height" content="720">`;
                    html = html.replace('</head>', `${videoMetaTags}\n</head>`);
                  }
                  
                  // LCP Optimization: Preload hero image for faster rendering
                  if (product.thumbnail_url) {
                    let lcpImageUrl = product.thumbnail_url;
                    // Optimize Cloudinary URLs
                    if (lcpImageUrl.includes('res.cloudinary.com')) {
                      lcpImageUrl = lcpImageUrl.replace(
                        /(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)/,
                        '$1f_auto,q_auto,w_800/$2'
                      );
                    }
                    const preloadTag = `<link rel="preload" as="image" href="${lcpImageUrl}" fetchpriority="high">`;
                    html = html.replace('</head>', `${preloadTag}\n</head>`);
                  }
                  
                  // Inject SEO meta tags
                  // Prefer SEO-specific fields when provided; fall back to generic title/description
                  const safeTitle = (product.seo_title || product.title || '').replace(/"/g, '&quot;');
                  const safeDesc = (product.seo_description || product.description || '').substring(0, 160).replace(/"/g, '&quot;').replace(/\n/g, ' ');
                  const safeKeywords = (product.seo_keywords || '').replace(/"/g, '&quot;');
                  // Title tag
                  html = html.replace('<title>Loading Product... | WishVideo</title>', `<title>${safeTitle} | WishVideo</title>`);
                  // Open Graph title/description and image
                  html = html.replace('<meta property="og:title" content="Loading...">', `<meta property="og:title" content="${safeTitle}">`);
                  html = html.replace('<meta property="og:description" content="">', `<meta property="og:description" content="${safeDesc}">`);
                  html = html.replace('<meta property="og:image" content="">', `<meta property="og:image" content="${product.thumbnail_url || ''}">`);
                  // Description tag
                  html = html.replace('<meta name="description" content="Custom personalized video greetings from Africa.">', `<meta name="description" content="${safeDesc}">`);
                  // Keywords tag (if provided, override default keywords)
                  html = html.replace('<meta name="keywords" content="video, greeting, birthday, wish, africa">', `<meta name="keywords" content="${safeKeywords}">`);

                  // Fix 6: Add og:url to product pages
                  try {
                    const productSeo = await getSeoForRequest(env, req, { product });
                    const ogUrlTag = `<meta property="og:url" content="${productSeo.canonical}">`;
                    html = html.replace('</head>', `${ogUrlTag}\n</head>`);

                    // Fix 9: Add BreadcrumbList schema to product pages
                    const breadcrumbJson = generateBreadcrumbSchema([
                      { name: 'Home', url: baseUrl },
                      { name: 'Products', url: `${baseUrl}/products` },
                      { name: product.title || '', url: productSeo.canonical }
                    ]);
                    html = html.replace('</head>', `<script type="application/ld+json">${breadcrumbJson}</script>\n</head>`);
                  } catch (_) {}
                }
              }
            }
            
            // Collection page - inject product list schema
            if (
              assetPath === '/index.html' ||
              assetPath === '/' ||
              assetPath === '/products' ||
              assetPath === '/products/' ||
              assetPath === '/products.html' ||
              assetPath === '/products-grid.html'
            ) {
              if (env.DB) {
                await initDB(env);
                const productsResult = await env.DB.prepare(`
                  SELECT p.*,
                    (SELECT COUNT(*) FROM reviews WHERE product_id = p.id AND status = 'approved') as review_count,
                    (SELECT AVG(rating) FROM reviews WHERE product_id = p.id AND status = 'approved') as rating_average
                  FROM products p
                  WHERE ${buildPublicProductStatusWhere('p.status')}
                  ORDER BY p.sort_order ASC, p.id DESC
                `).all();
                
                const products = productsResult.results || [];
                if (products.length > 0) {
                  const schemaJson = generateCollectionSchema(products, baseUrl);
                  html = injectSchemaIntoHTML(html, 'collection-schema', schemaJson);
                }
              }

              // Fix 10: Inject Organization + WebSite schema on homepage
              if (assetPath === '/index.html' || assetPath === '/') {
                try {
                  const seoResp2 = await getMinimalSEOSettings(env);
                  let seoSettings2 = {};
                  if (seoResp2 && typeof seoResp2.json === 'function') {
                    const parsed2 = await seoResp2.json();
                    seoSettings2 = (parsed2 && parsed2.settings) || {};
                  }
                  if (!seoSettings2.site_url) seoSettings2.site_url = baseUrl;
                  if (!seoSettings2.site_title) seoSettings2.site_title = 'WishVideo';
                  const orgSchema = generateOrganizationSchema(seoSettings2);
                  const siteSchema = generateWebSiteSchema(seoSettings2);
                  html = html.replace(/<\/head>/i, `<script type="application/ld+json">${orgSchema}</script>\n<script type="application/ld+json">${siteSchema}</script>\n</head>`);
                } catch (_) {}
              }
            }
            
            html = await applyComponentSsrToHtml(env, html, url, path);
            html = await applyGlobalComponentsSsr(env, html, path);

            const normalizedRequestPath = normalizeCanonicalPath(path);
            const sensitiveHtmlPath = isSensitiveNoindexPath(normalizedRequestPath);
            const headers = new Headers(); headers.set('Alt-Svc', 'clear');
            headers.set('Content-Type', 'text/html; charset=utf-8');
            headers.set('X-Worker-Version', VERSION); headers.set('Alt-Svc', 'clear');
            headers.set('X-Cache', 'MISS');
            if (sensitiveHtmlPath) {
              headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
              headers.set('Pragma', 'no-cache');
            } else {
              headers.set('Cache-Control', 'public, max-age=300');
            }

            // Apply Robots + Canonical (admin controlled)
            if (!isAdminUI && !isAdminAPI) {
              try {
                const seo = await getSeoForRequest(env, req, schemaProduct ? { product: schemaProduct } : { path });
                html = applySeoToHtml(html, seo.robots, seo.canonical);
                html = applySiteTitleToHtml(html, seo.siteTitle);
                headers.set('X-Robots-Tag', seo.robots);
                
                // Add noindex tags for hidden pages (user-controlled hiding from search)
                const noindexTags = await getNoindexMetaTags(env, {
                  pathname: normalizedRequestPath,
                  rawPathname: path,
                  url
                });
                if (noindexTags) {
                  html = html.replace('</head>', `\n    ${noindexTags}\n  </head>`);
                }
                // Inject analytics and verification tags after SEO and noindex
                try {
                  html = await injectAnalyticsAndMeta(env, html);
                } catch (_) {}
              } catch (e) {
                // ignore SEO injection errors
              }
            }
            
            const response = new Response(html, { status: 200, headers });
            
            // Cache the response for non-admin pages (5 minutes TTL)
            if (shouldCache) {
              try {
                const cacheResponse = new Response(html, {
                  status: 200,
                  headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'public, max-age=300', // 5 minutes
                    'X-Worker-Version': VERSION,
                    'X-Cache-Created': new Date().toISOString()
                  }
                });
                
                // Store in cache asynchronously
                ctx.waitUntil(caches.default.put(cacheKey, cacheResponse));
                console.log('Cached response for:', req.url);
              } catch (cacheError) {
                console.warn('Cache storage failed:', cacheError);
                // Continue even if caching fails
              }
            }
            
            return response;
          } catch (e) {
            console.error('Schema injection error:', e);
          }
        }
        
        // For non-HTML or failed schema injection, just pass through with version header
        const headers = new Headers(assetResp.headers); headers.set('Alt-Svc', 'clear');
        headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        headers.set('Pragma', 'no-cache');
        headers.set('X-Worker-Version', VERSION); headers.set('Alt-Svc', 'clear');
        
        return new Response(assetResp.body, { status: assetResp.status, headers });
      }

      return new Response('Not found', {
        status: 404,
        headers: {
          'Cache-Control': 'public, max-age=60',
          'X-Worker-Version': VERSION
        }
      });
    } catch (e) {
      console.error('Worker error:', e);

      // Check if it's a timeout/connection error (cold start issue)
      const isTimeoutError = e.message?.includes('timeout') || e.message?.includes('abort');
      const isConnectionError = e.message?.includes('connection') || e.message?.includes('network');

      if (isTimeoutError || isConnectionError) {
        // Return 503 with Retry-After header for cold start issues
        return new Response(JSON.stringify({
          error: 'Service temporarily unavailable. Please retry.',
          code: 'COLD_START_RETRY'
        }), {
          status: 503,
          headers: {
            ...CORS,
            'Content-Type': 'application/json',
            'Retry-After': '2',
            'Cache-Control': 'no-store'
          }
        });
      }

      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }
  },

  // Scheduled handler for cron jobs
  // WARMING: This runs every 5 minutes (configure in wrangler.toml)
  // Keeps DB connection warm and prevents cold start issues
  async scheduled(event, env, ctx) {
    setVersion(env.VERSION);
    console.log('Cron job started:', event.cron, 'at', new Date().toISOString());

    try {
      if (env.DB) {
        // WARMUP: Initialize DB tables if needed
        await initDB(env);

        // DAILY BACKUP + EMAIL/WEBHOOK (2 AM)
        if (event.cron === '0 2 * * *') {
          try {
            // createBackup() handles: store in R2 + D1 metadata + webhook dispatch + optional email
            const baseUrl = env.PUBLIC_BASE_URL || env.SITE_URL || env.BASE_URL || null;
            const backupResp = await createBackupApi(env, { trigger: 'cron', base_url: baseUrl });
            if (!backupResp?.ok) {
              const errBody = await backupResp.text().catch(() => '');
              console.log('Daily backup API returned non-OK:', backupResp?.status, errBody);
            } else {
              const payload = await backupResp.clone().json().catch(() => ({}));
              console.log('Daily backup created:', payload?.id || 'unknown-id');
            }
          } catch (e) {
            console.log('Daily backup failed:', e?.message || e);
          }
        }


        // WARMUP: Multiple queries to ensure full connection warmth
        // Added more tables for comprehensive warming
        await Promise.all([
          env.DB.prepare('SELECT 1 as warm').first(),
          env.DB.prepare(`SELECT COUNT(*) as count FROM products WHERE ${buildPublicProductStatusWhere('status')}`).first(),
          env.DB.prepare('SELECT COUNT(*) as count FROM orders').first(),
          env.DB.prepare('SELECT COUNT(*) as count FROM reviews').first(),
          env.DB.prepare('SELECT COUNT(*) as count FROM blogs WHERE status = ?').bind('published').first().catch(() => null),
          env.DB.prepare('SELECT COUNT(*) as count FROM forum_questions').first().catch(() => null)
        ]);
        console.log('DB connection warmed successfully with multiple queries');

        // Cleanup expired Whop checkout sessions (daily cron only)
        // The 5-minute cron is intended for warming; cleanup is heavier and can increase subrequests/wall time.
        if (event.cron === '0 2 * * *') {
          const result = await cleanupExpired(env);
          try {
            const data = await result.json();
            console.log('Cleanup result:', data);
          } catch (_) {
            console.log('Cleanup finished (non-JSON response)');
          }
        }
      }
    } catch (e) {
      console.error('Cron job error:', e);
    }
  }
};
