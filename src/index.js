/**
 * Cloudflare Worker - Main Entry Point
 * REFACTORED: Uses modular imports instead of duplicate functions
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

import { BLOG_CARDS_STYLE_TAG, PRODUCT_CARDS_STYLE_TAG, ensureStyleTag, extractInlineRenderConfigs, renderBlogCardsSsrMarkup, renderProductCardsSsrMarkup, replaceSimpleContainerById } from './utils/component-ssr.js';

import { HOME_PRODUCTS_BOOTSTRAP_ID, REVIEWS_WIDGET_STYLE_TAG, buildHomeProductsBootstrap, renderHomepageHeroPlayerSsr, renderHomepageProductGridSsr, renderReviewsWidgetSsrMarkup } from './utils/homepage-ssr.js';

import { renderTermsFallbackPageHtml } from './utils/legal-pages.js';
import { injectAnalyticsAndMeta } from './controllers/analytics.js';
import { isAdminAuthed, createAdminSessionCookie, createLogoutCookie } from './utils/auth.js';

import { noStoreHeaders, buildVersionedCacheKey } from './utils/cache-headers.js';
import { isLocalHostname, getCanonicalHostname, isInsecureRequest } from './utils/hostname-helpers.js';
import { isEnabledFlag, isNoJsSsrEnabled } from './utils/feature-flags.js';
import { isLikelyScannerPath, canLookupDynamicSlug, isKnownApiPath, isMalformedNestedSlug } from './utils/path-detection.js';

import { escapeHtmlText, decodeBasicHtmlEntities } from './utils/html-entities.js';
import { sanitizeProductDescriptionHtml } from './utils/html-sanitizer.js';
import { stripUrlQueryHash, isLikelyVideoMediaUrl, isLikelyImageMediaUrl, toGalleryArray, normalizeGalleryForPlayerSsr } from './utils/url-helpers.js';

import { optimizeThumbUrlForSsr, renderProductStep1PlayerShell, injectProductInitialContent } from './ssr/product-player.js';
import { parseAddonGroupsForSsr, getDeliveryTextFromInstantDaysForSsr, computeInitialDeliveryLabelForSsr, computeDeliveryBadgeForSsr } from './ssr/product-ssr.js';
import { formatPriceForSsr } from './utils/price-formatter.js';
import { renderStarsForSsr } from './utils/star-renderer.js';
import { formatReviewDateForSsr, formatBlogArchiveDate } from './utils/date-formatter.js';
import { parseReviewVideoMetadataForSsr, extractYouTubeIdForSsr, resolveReviewVideoMediaForSsr, renderReviewMediaDataAttrsForSsr } from './ssr/review-media.js';
import { renderSsrReviewCards, renderSsrReviewSliderThumbs } from './ssr/review-ssr.js';
import { sanitizeAddonIdForSsr } from './ssr/product-ssr.js';
import { renderAddonDataAttrsForSsr, renderSsrAddonField, renderSsrAddonsForm } from './ssr/product-renderer.js';

import { shouldServeCanonicalAliasDirectly, normalizeCanonicalPath, getCanonicalRedirectPath } from './routing/path-aliases.js';

import { resolveFallbackSiteTitle, getSeoSettingsObject, resolveSiteTitle, applySiteTitleToHtml } from './seo/seo-helpers.js';
import { replaceLegacyBrandTokens } from './utils/html-entities.js';

import { getSitemapMembershipSet, isCanonicalInSitemap } from './seo/sitemap-helpers.js';
import { normalizeSeoBaseUrl } from './utils/hostname-helpers.js';
import { isSensitiveNoindexPath, applySeoToHtml, getSeoForRequest } from './seo/seo-tags.js';

import { ensureGlobalComponentsRuntimeScript, upsertBodyDataAttribute, hasGlobalHeaderMarkup, hasGlobalFooterMarkup, injectMarkupIntoSlot, injectGlobalHeaderSsr, injectGlobalFooterSsr, isExcludedFromGlobalComponents, isTransactionalGlobalComponentsPath, resolveDefaultComponentCode, getSiteComponentsForSsr, applyGlobalComponentsSsr } from './components/global-components.js';

import { decodeXmlEntities } from './utils/html-entities.js';
import { getSetting, getSettings } from './utils/settings-helper.js';

import { queryProductsForComponentSsr, queryBlogsForComponentSsr, queryForumQuestionsForSsr, queryReviewsForSsr } from './ssr/query-helpers.js';

import { applyComponentSsrToHtml } from './ssr/component-applier.js';

import { formatBlogArchiveDate as fmtBlogDate } from './utils/date-formatter.js';
import { truncateText } from './utils/string-helpers.js';

function renderBlogArchivePaginationSsr(pagination = {}) {
  const page = Math.max(1, parseInt(pagination?.page, 10) || 1);
  const totalPages = Math.max(0, parseInt(pagination?.totalPages, 10) || 0);
  if (totalPages <= 1) return '';

  let html = '<div class="pagination">';
  if (pagination.hasPrev) {
    html += `<a href="/blog?page=${page - 1}" class="page-link">Previous</a>`;
  }
  html += `<span class="page-info">Page ${page} of ${totalPages}</span>`;
  if (pagination.hasNext) {
    html += `<a href="/blog?page=${page + 1}" class="page-link">Next</a>`;
  }
  html += '</div>';
  return html;
}

function truncateBlogArchiveText(value, maxLength = 120) {
  return truncateText(value, maxLength);
}

function buildBlogArchivePageHref(pageNumber, limit) {
  const n = Math.max(1, parseInt(pageNumber, 10) || 1);
  const l = Math.max(1, parseInt(limit, 10) || 30);
  if (n === 1 && l === 30) return '/blog';
  return n === 1 ? `/blog?limit=${l}` : `/blog?page=${n}&limit=${l}`;
}

function renderBlogArchiveCardsSsr(blogs = [], pagination = {}) {
  const cardsHtml = blogs.map(blog => {
    const slugOrId = String(blog.slug || blog.id || '').trim();
    if (!slugOrId) return '';
    const blogUrl = `/blog/${encodeURIComponent(slugOrId)}`;
    const title = escapeHtmlText(blog.title || 'Untitled');
    const description = escapeHtmlText(truncateBlogArchiveText(blog.description || '', 120));
    const dateText = escapeHtmlText(fmtBlogDate(blog.created_at));
    const thumb = escapeHtmlText(blog.thumbnail_url || 'https://via.placeholder.com/400x225?text=No+Image');
    return `
      <article class="blog-card">
        <a href="${blogUrl}">
          <img src="${thumb}" alt="${title}" loading="lazy">
          <h3>${title}</h3>
          <p>${description}</p>
          <span>${dateText}</span>
        </a>
      </article>`;
  }).join('');

  return cardsHtml ? `<div class="blog-cards-grid">${cardsHtml}</div>${renderBlogArchivePaginationSsr(pagination)}` : '<p>No blog posts found.</p>';
}

function normalizeSsrInteger(value, fallback, min = 1, max = 100) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeSsrIdList(idsInput = []) {
  if (!Array.isArray(idsInput)) return [];
  return idsInput.map(item => String(item || '').trim()).filter(Boolean).slice(0, 50);
}

function replaceSimpleTextByIdSsr(html, elementId, value) {
  const re = new RegExp(`<([a-zA-Z0-9:-]+)([^>]*)\\bid=["']${elementId}["']([^>]*)>([\\s\\S]*?)<\\/\\1>`, 'i');
  if (!re.test(html)) return html;
  return String(html).replace(re, (_full, tagName, before, after, currentContent) => {
    return `<${tagName}${before} id="${elementId}"${after}>${value}</${tagName}>`;
  });
}

function replaceAnchorHrefById(html, elementId, href) {
  const re = new RegExp(`<a([^>]*)\\bid=["']${elementId}["']([^>]*)>`, 'i');
  if (!re.test(html)) return html;
  return String(html).replace(re, `<a$1 id="${elementId}" href="${href}"$2>`);
}

function renderForumArchiveCardsSsr(questions = []) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return '<div class="no-questions"><p>No questions yet.</p></div>';
  }
  return questions.map(question => {
    const slugOrId = String(question.slug || question.id || '').trim();
    const href = `/forum/${encodeURIComponent(slugOrId)}`;
    const title = escapeHtmlText(question.title || '');
    const content = escapeHtmlText(question.content || '').substring(0, 150);
    const name = escapeHtmlText(question.name || 'Anonymous');
    const date = formatBlogArchiveDate(question.created_at);
    const replyCount = parseInt(question.reply_count, 10) || 0;
    return `
      <a href="${href}" class="question-card">
        <div class="q-header">
          <div class="q-avatar">${name.charAt(0).toUpperCase()}</div>
          <div class="q-content">
            <div class="q-title">${title}</div>
            <div class="q-preview">${content}</div>
            <div class="q-meta">
              <span>${name}</span>
              <span>${date}</span>
              <span>${replyCount} replies</span>
            </div>
          </div>
        </div>
      </a>`;
  }).join('');
}

function renderForumArchivePaginationSsr(pagination = {}) {
  const totalPages = Math.max(0, parseInt(pagination.totalPages, 10) || 0);
  if (totalPages <= 1) return '';
  const page = Math.max(1, parseInt(pagination.page, 10) || 1);
  let html = '<div class="forum-pagination">';
  if (pagination.hasPrev) {
    html += `<button onclick="loadForumQuestions(${page - 1})">&larr; Prev</button>`;
  }
  html += `<span>Page ${page} of ${totalPages}</span>`;
  if (pagination.hasNext) {
    html += `<button onclick="loadForumQuestions(${page + 1})">Next &rarr;</button>`;
  }
  html += '</div>';
  return html;
}

function renderEmbeddedForumQuestionsSsr(questions = []) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return '<p>No questions yet.</p>';
  }
  return questions.map(question => {
    const slugOrId = String(question.slug || question.id || '').trim();
    const href = `/forum/${encodeURIComponent(slugOrId)}`;
    return `<a href="${href}" class="forum-question-link">${escapeHtmlText(question.title || '')}</a>`;
  }).join('');
}

function renderEmbeddedForumPaginationSsr(pagination = {}) {
  return renderForumArchivePaginationSsr(pagination);
}

async function requireAdmin(req, env) {
  const cookie = req.headers.get('Cookie') || '';
  if (!cookie.includes('admin_session=')) {
    return { authorized: false, error: 'No session' };
  }
  const sessionId = cookie.match(/admin_session=([^;]+)/)?.[1];
  if (!sessionId) {
    return { authorized: false, error: 'No session ID' };
  }
  try {
    await initDB(env);
    const session = await env.DB.prepare(
      'SELECT * FROM admin_sessions WHERE session_id = ? AND expires_at > ?'
    ).bind(sessionId, Date.now()).first();

    if (!session) {
      return { authorized: false, error: 'Invalid session' };
    }
    return { authorized: true, admin: session };
  } catch (e) {
    return { authorized: false, error: e.message };
  }
}

export default {
  async fetch(request, env, ctx) {
    if (!env) {
      return new Response('Missing environment', { status: 500 });
    }

    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    if (method === 'OPTIONS') {
      return handleOptions(request);
    }

    try {
      await initDB(env);
    } catch (e) {
      console.error('DB init error:', e.message);
    }

    try {
      if (env.ENABLE_NOJS_SSR === 'true' || env.ENABLE_NOJS_SSR === '1') {
        const nojsResult = await handleNoJsRoutes(request, env);
        if (nojsResult) return nojsResult;
      }
    } catch (e) {
      console.error('NoJS route error:', e.message);
    }

    const isApi = path.startsWith('/api/') || path.startsWith('/admin/api/');
    if (isApi) {
      const apiResponse = await routeApiRequest(request, env, url, path, method);
      if (apiResponse) return apiResponse;
    }

    const redirectPath = getCanonicalRedirectPath(path);
    if (redirectPath && !path.startsWith('/api/')) {
      return Response.redirect(`${url.origin}${redirectPath}${url.search}`, 301);
    }

    if (path === '/robots.txt') {
      const robots = buildMinimalRobotsTxt(env);
      return new Response(robots, { headers: { 'Content-Type': 'text/plain' } });
    }

    if (path === '/sitemap.xml') {
      const sitemap = await buildMinimalSitemapXml(env, request);
      return new Response(sitemap.body, { headers: { 'Content-Type': 'application/xml' } });
    }

    try {
      const staticResponse = await env.ASSETS.fetch(request);
      if (staticResponse && staticResponse.status === 200) {
        const headers = new Headers(staticResponse.headers);
        headers.set('X-Worker-Version', VERSION || '0');
        return new Response(staticResponse.body, { status: staticResponse.status, headers });
      }
    } catch (e) {
      console.error('Asset fetch error:', e.message);
    }

    if (path === '/admin/login') {
      const loginPage = await renderNoJsAdminLoginPage(env);
      return new Response(loginPage, { headers: { 'Content-Type': 'text/html' } });
    }

    const adminMatch = path.match(/^\/admin(?:\/(.*))?$/);
    if (adminMatch) {
      const auth = await requireAdmin(request, env);
      if (!auth.authorized) {
        return Response.redirect(`${url.origin}/admin/login`, 302);
      }
    }

    const productsResponse = await handleProductRouting(request, env, url, path);
    if (productsResponse) return productsResponse;

    return new Response('Not Found', { status: 404 });
  }
};
