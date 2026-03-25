/**
 * Index Loader - Central Module Exports
 * This file re-exports all utility functions from their consolidated modules
 * allowing gradual migration from the monolithic index.js
 */

// ============= HTML & Text Utilities =============
export {
  escapeHtmlText,
  decodeBasicHtmlEntities,
  decodeXmlEntities,
  escapeHtmlAttr,
  stripHtml
} from './utils/html-entities.js';

export {
  sanitizeProductDescriptionHtml,
  ALLOWED_PRODUCT_DESCRIPTION_TAGS
} from './utils/html-sanitizer.js';

export {
  formatDate,
  formatBlogArchiveDate,
  formatBlogPostDate,
  formatShortDate,
  formatCommentDate,
  formatDateTime,
  getRelativeTime,
  formatReviewDateForSsr
} from './utils/date-formatter.js';

export {
  stringifyJson,
  safeJsonParse,
  safeJsonParseArray
} from './utils/json-helpers.js';

export {
  CACHE_NO_STORE,
  CACHE_PRIVATE,
  CACHE_SHORT,
  CACHE_MEDIUM,
  CACHE_STANDARD,
  CACHE_LONG,
  CACHE_IMMUTABLE,
  CACHE_API_SHORT,
  CACHE_API_MEDIUM,
  CACHE_API_LONG,
  noStoreHeaders,
  cacheHeaders,
  apiCacheHeaders
} from './utils/cache-headers.js';

export {
  stripUrlQueryHash,
  isLikelyVideoMediaUrl,
  isLikelyImageMediaUrl,
  toGalleryArray,
  normalizeGalleryForPlayerSsr,
  extractYouTubeId
} from './utils/url-helpers.js';

export {
  SCANNER_PREFIXES,
  SCANNER_PATH_RE,
  DYNAMIC_SLUG_RE,
  KNOWN_API_SEGMENTS,
  isLikelyScannerPath,
  canLookupDynamicSlug,
  isKnownApiPath,
  isMalformedNestedSlug
} from './utils/path-detection.js';

export {
  isLocalHostname,
  isLocalDevHost,
  getCanonicalHostname,
  isInsecureRequest,
  normalizeSeoBaseUrl
} from './utils/hostname-helpers.js';

export {
  isEnabledFlag,
  isNoJsSsrEnabled
} from './utils/feature-flags.js';

export {
  injectIntoHead,
  injectIntoBody,
  injectBeforeCloseBody,
  hasTag,
  injectAfterHead
} from './utils/html-injector.js';

export {
  buildPageHref,
  renderPaginationSsr,
  renderSimplePagination
} from './utils/paginations.js';

export {
  truncateText,
  slugify,
  capitalizeFirst,
  parseInteger,
  parseNumber,
  normalizeSsrInteger,
  normalizeSsrIdList
} from './utils/string-helpers.js';

export {
  formatPriceForSsr,
  formatPrice,
  calculateDiscount
} from './utils/price-formatter.js';

export {
  renderStarsForSsr,
  renderStarsUnicode,
  renderStarsHtml,
  renderStarsForProductCard
} from './utils/star-renderer.js';

// ============= Routing =============
export {
  CANONICAL_ALIAS_MAP,
  DIRECT_INTERNAL_ALIAS_PATHS,
  shouldServeCanonicalAliasDirectly,
  normalizeCanonicalPath,
  getCanonicalRedirectPath
} from './routing/path-aliases.js';

// ============= SSR Modules =============
export {
  getDeliveryTextFromInstantDaysForSsr,
  computeInitialDeliveryLabelForSsr,
  computeDeliveryBadgeForSsr,
  sanitizeAddonIdForSsr,
  parseAddonGroupsForSsr
} from './ssr/product-ssr.js';

export {
  renderAddonDataAttrsForSsr,
  renderSsrAddonField,
  renderSsrAddonsForm
} from './ssr/product-renderer.js';

export {
  optimizeThumbUrlForSsr,
  injectProductInitialContent,
  renderProductStep1PlayerShell
} from './ssr/product-player.js';

export {
  renderSsrReviewCards,
  renderSsrReviewSliderThumbs
} from './ssr/review-ssr.js';

export {
  parseReviewVideoMetadataForSsr,
  extractYouTubeIdForSsr,
  resolveReviewVideoMediaForSsr,
  renderReviewMediaDataAttrsForSsr
} from './ssr/review-media.js';

export {
  renderBlogArchiveCardsSsr,
  renderEmbeddedBlogCards
} from './ssr/blog-ssr.js';

export {
  renderForumArchiveCardsSsr,
  renderEmbeddedForumQuestionsSsr,
  renderForumArchivePaginationSsr,
  renderEmbeddedForumPaginationSsr
} from './ssr/forum-ssr.js';

// ============= SEO Modules =============
export {
  resolveFallbackSiteTitle,
  getSeoSettingsObject,
  resolveSiteTitle,
  applySiteTitleToHtml,
  replaceLegacyBrandTokensInText
} from './seo/seo-helpers.js';

export {
  isSensitiveNoindexPath,
  applySeoToHtml,
  getSeoForRequest
} from './seo/seo-tags.js';

export {
  normalizeUrlForSitemapCompare,
  getSitemapMembershipSet,
  isCanonicalInSitemap
} from './seo/sitemap-helpers.js';

// ============= Global Components =============
export {
  ensureGlobalComponentsRuntimeScript,
  upsertBodyDataAttribute,
  hasGlobalHeaderMarkup,
  hasGlobalFooterMarkup,
  injectMarkupIntoSlot,
  injectGlobalHeaderSsr,
  injectGlobalFooterSsr,
  isExcludedFromGlobalComponents,
  isTransactionalGlobalComponentsPath,
  resolveDefaultComponentCode,
  getSiteComponentsForSsr,
  applyGlobalComponentsSsr
} from './components/global-components.js';
