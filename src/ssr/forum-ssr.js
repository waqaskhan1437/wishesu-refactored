/**
 * Forum SSR - Archive & Cards Rendering
 * Forum-specific SSR rendering functions
 */

import { escapeHtmlText } from '../utils/html-entities.js';
import { formatShortDate } from '../utils/date-formatter.js';
import { renderQuestionCard } from '../utils/card-renderer.js';
import { renderSimplePagination } from '../utils/paginations.js';

export function renderForumArchiveCardsSsr(questions = []) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return '<div class="no-questions"><p>No questions yet. Be the first to ask!</p></div>';
  }

  const cards = questions.map((question) => renderQuestionCard(question)).join('');
  return `<div class="questions-list">${cards}</div>`;
}

export function renderEmbeddedForumQuestionsSsr(questions = []) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return '<p style="text-align:center;color:#6b7280;padding:40px;background:white;border-radius:12px;">No questions yet. Be the first to ask!</p>';
  }

  return `<h3 style="margin-bottom:20px;color:#1f2937;">Recent Questions</h3>${questions.map((question) => {
    const preview = escapeHtmlText(String(question.content || '').slice(0, 150) + (String(question.content || '').length > 150 ? '...' : ''));
    const href = `/forum/${encodeURIComponent(String(question.slug || question.id || ''))}`;
    return `<a href="${href}" style="display:block;background:white;border-radius:12px;padding:20px;margin-bottom:15px;box-shadow:0 2px 8px rgba(0,0,0,0.06);text-decoration:none;transition:transform 0.2s,box-shadow 0.2s;"><h4 style="color:#1f2937;margin-bottom:8px;font-size:1.1rem;">${escapeHtmlText(question.title || '')}</h4><p style="color:#6b7280;font-size:0.9rem;line-height:1.5;margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${preview}</p><div style="display:flex;gap:15px;font-size:0.85rem;color:#9ca3af;"><span>&#128100; ${escapeHtmlText(question.name || '')}</span><span>&#128172; ${escapeHtmlText(question.reply_count || 0)} replies</span></div></a>`;
  }).join('')}`;
}

export function renderForumArchivePaginationSsr(pagination = {}) {
  return renderSimplePagination(pagination);
}

export function renderEmbeddedForumPaginationSsr(pagination = {}) {
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
