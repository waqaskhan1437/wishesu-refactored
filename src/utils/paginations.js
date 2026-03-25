/**
 * Generic Pagination Renderer
 * Consolidated pagination logic from multiple places
 */

export function buildPageHref(pageNumber, limit, basePath = '?') {
  const n = Math.max(1, parseInt(pageNumber, 10) || 1);
  const l = Math.max(1, parseInt(limit, 10) || 30);
  const params = new URLSearchParams();
  if (n > 1) params.set('page', String(n));
  if (l !== 30) params.set('limit', String(l));
  const q = params.toString();
  return q ? `${basePath}?${q}` : basePath;
}

export function renderPaginationSsr(pagination = {}, options = {}) {
  const {
    pageParam = 'page',
    limitParam = 'limit',
    basePath = '?',
    showPrevNext = true,
    maxPages = 5
  } = options;
  
  const page = Math.max(1, parseInt(pagination?.page, 10) || 1);
  const totalPages = Math.max(0, parseInt(pagination?.totalPages, 10) || parseInt(pagination?.pages, 10) || 0);
  const hasNext = !!pagination?.hasNext;
  const hasPrev = !!pagination?.hasPrev;
  const limit = Math.max(1, parseInt(pagination?.limit, 10) || 30);

  if (totalPages <= 1) return '';

  let pageLinks = '';
  const startPage = Math.max(1, page - Math.floor(maxPages / 2));
  const endPage = Math.min(totalPages, startPage + maxPages - 1);

  if (startPage > 1) {
    pageLinks += `<a href="${buildPageHref(1, limit, basePath)}" class="page-link">1</a>`;
    if (startPage > 2) {
      pageLinks += '<span class="page-dots">...</span>';
    }
  }

  for (let i = startPage; i <= endPage; i += 1) {
    if (i === page) {
      pageLinks += `<span class="page-link active">${i}</span>`;
    } else {
      pageLinks += `<a href="${buildPageHref(i, limit, basePath)}" class="page-link">${i}</a>`;
    }
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      pageLinks += '<span class="page-dots">...</span>';
    }
    pageLinks += `<a href="${buildPageHref(totalPages, limit, basePath)}" class="page-link">${totalPages}</a>`;
  }

  let html = `<div class="pagination">`;
  
  if (showPrevNext && hasPrev) {
    html += `<a href="${buildPageHref(page - 1, limit, basePath)}" class="page-link page-prev">Previous</a>`;
  }
  
  html += `<div class="page-numbers">${pageLinks}</div>`;
  
  if (showPrevNext && hasNext) {
    html += `<a href="${buildPageHref(page + 1, limit, basePath)}" class="page-link page-next">Next</a>`;
  }
  
  html += `</div>`;
  
  return html;
}

export function renderSimplePagination(pagination = {}) {
  const totalPages = Math.max(0, parseInt(pagination.totalPages, 10) || 0);
  if (totalPages <= 1) return '';

  const page = Math.max(1, parseInt(pagination.page, 10) || 1);
  let html = `<button class="page-btn" onclick="loadPage(${page - 1})" ${!pagination.hasPrev ? 'disabled' : ''}>&larr;</button>`;

  for (let index = 1; index <= totalPages; index += 1) {
    html += `<button class="page-btn ${index === page ? 'active' : ''}" onclick="loadPage(${index})">${index}</button>`;
  }

  html += `<button class="page-btn" onclick="loadPage(${page + 1})" ${!pagination.hasNext ? 'disabled' : ''}>&rarr;</button>`;
  
  return html;
}
