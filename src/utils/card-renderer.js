/**
 * Card Renderer Utilities
 * Generic card rendering patterns
 */

import { escapeHtmlText } from './html-entities.js';
import { formatShortDate, formatBlogArchiveDate } from './date-formatter.js';
import { truncateText } from './string-helpers.js';

export function renderBlogCard(blog, options = {}) {
  const {
    maxDescLength = 120,
    showDate = true
  } = options;
  
  const slugOrId = String(blog.slug || blog.id || '').trim();
  if (!slugOrId) return '';

  const blogUrl = `/blog/${encodeURIComponent(slugOrId)}`;
  const title = escapeHtmlText(blog.title || 'Untitled');
  const description = escapeHtmlText(truncateText(blog.description || '', maxDescLength));
  const dateText = showDate ? escapeHtmlText(formatBlogArchiveDate(blog.created_at)) : '';
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
}

export function renderForumCard(question, options = {}) {
  const date = question.created_at ? formatShortDate(question.created_at) : '';
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
}

export function renderQuestionCard(question) {
  return renderForumCard(question);
}
