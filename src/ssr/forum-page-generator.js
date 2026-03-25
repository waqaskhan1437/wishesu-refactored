/**
 * Forum Page Generator
 * Server-side HTML generation for forum questions
 * Consolidated from index.js
 */

import { escapeHtmlText } from '../utils/html-entities.js';
import { formatBlogArchiveDate, formatCommentDate } from '../utils/date-formatter.js';

export function generateForumQuestionHTML(question, replies = [], sidebar = {}) {
  const title = escapeHtmlText(question.title || 'Untitled Question');
  const content = escapeHtmlText(question.content || '');
  const authorName = escapeHtmlText(question.name || 'Anonymous');
  const date = formatBlogArchiveDate(question.created_at);
  const authorInitial = authorName.charAt(0).toUpperCase();

  const repliesHtml = Array.isArray(replies) && replies.length > 0
    ? replies.map(r => {
        const rName = escapeHtmlText(r.name || 'Anonymous');
        const rContent = escapeHtmlText(r.content || '');
        const rDate = formatCommentDate(r.created_at);
        
        return `
          <div class="reply-item" style="background:#f9fafb;padding:16px;border-radius:8px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
              <div style="width:32px;height:32px;background:#10b981;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;">
                ${rName.charAt(0).toUpperCase()}
              </div>
              <div>
                <strong>${rName}</strong>
                <span style="color:#6b7280;font-size:0.85rem;margin-left:8px;">${rDate}</span>
              </div>
            </div>
            <p style="margin:0;color:#374151;line-height:1.6;">${rContent}</p>
          </div>`;
      }).join('')
    : '<p style="color:#6b7280;">No replies yet. Be the first to reply!</p>';

  const sidebarHtml = sidebar?.recentQuestions?.length > 0
    ? `<div class="sidebar-questions">
        <h4 style="font-size:1rem;margin-bottom:12px;">Recent Questions</h4>
        ${sidebar.recentQuestions.map(q => {
          const qTitle = escapeHtmlText(q.title || '');
          const qSlug = String(q.slug || q.id || '');
          return `<a href="/forum/${encodeURIComponent(qSlug)}" style="display:block;padding:8px 0;color:#1d4ed8;text-decoration:none;border-bottom:1px solid #e5e7eb;">${qTitle}</a>`;
        }).join('')}
      </div>`
    : '';

  return `
    <div class="forum-question-page" style="max-width:900px;margin:0 auto;padding:20px;">
      <nav style="margin-bottom:20px;">
        <a href="/forum" style="color:#1d4ed8;text-decoration:none;">&larr; Back to Forum</a>
      </nav>
      
      <article class="question-main" style="background:white;border-radius:12px;padding:24px;margin-bottom:30px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <header style="margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:15px;">
            <div style="width:48px;height:48px;background:#6366f1;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:1.2rem;font-weight:bold;">
              ${authorInitial}
            </div>
            <div>
              <strong style="font-size:1.1rem;">${authorName}</strong>
              <div style="color:#6b7280;font-size:0.9rem;">${date}</div>
            </div>
          </div>
          <h1 style="font-size:1.8rem;margin:0;color:#111827;">${title}</h1>
        </header>
        
        <div class="question-content" style="font-size:1.05rem;line-height:1.8;color:#374151;">
          ${content}
        </div>
        
        <div class="question-stats" style="margin-top:20px;padding-top:20px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:0.9rem;">
          <span>${replies.length} ${replies.length === 1 ? 'Reply' : 'Replies'}</span>
        </div>
      </article>
      
      <section class="replies-section">
        <h3 style="font-size:1.3rem;margin-bottom:20px;">Replies (${replies.length})</h3>
        ${repliesHtml}
      </section>
      
      <section class="reply-form" style="margin-top:40px;background:white;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <h3 style="font-size:1.2rem;margin-bottom:20px;">Add a Reply</h3>
        <form id="reply-form" style="display:grid;gap:15px;">
          <div>
            <label style="display:block;margin-bottom:5px;font-weight:500;">Name</label>
            <input type="text" name="name" required style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;">
          </div>
          <div>
            <label style="display:block;margin-bottom:5px;font-weight:500;">Email (not public)</label>
            <input type="email" name="email" required style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;">
          </div>
          <div>
            <label style="display:block;margin-bottom:5px;font-weight:500;">Your Reply</label>
            <textarea name="content" rows="5" required style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;resize:vertical;"></textarea>
          </div>
          <button type="submit" style="background:#10b981;color:white;border:none;padding:12px 24px;border-radius:8px;font-weight:600;cursor:pointer;">Submit Reply</button>
        </form>
      </section>
      
      ${sidebarHtml ? `
        <aside class="forum-sidebar" style="margin-top:40px;">
          ${sidebarHtml}
        </aside>
      ` : ''}
    </div>
  `;
}

export function generateForumCard(question) {
  const slugOrId = String(question.slug || question.id || '').trim();
  if (!slugOrId) return '';

  const url = `/forum/${encodeURIComponent(slugOrId)}`;
  const title = escapeHtmlText(question.title || 'Untitled');
  const preview = escapeHtmlText(question.content || '').substring(0, 150);
  const name = escapeHtmlText(question.name || 'Anonymous');
  const replyCount = parseInt(question.reply_count, 10) || 0;
  const date = formatBlogArchiveDate(question.created_at);

  return `
    <a href="${url}" class="forum-card" style="display:block;background:white;border-radius:12px;padding:20px;margin-bottom:15px;box-shadow:0 2px 8px rgba(0,0,0,0.1);text-decoration:none;color:inherit;transition:transform 0.2s,box-shadow 0.2s;">
      <div style="display:flex;gap:15px;align-items:flex-start;">
        <div style="width:40px;height:40px;background:#6366f1;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;flex-shrink:0;">
          ${name.charAt(0).toUpperCase()}
        </div>
        <div style="flex:1;min-width:0;">
          <h3 style="margin:0 0 8px;font-size:1.1rem;color:#111827;">${title}</h3>
          <p style="margin:0 0 10px;color:#6b7280;font-size:0.9rem;line-height:1.5;">${preview}</p>
          <div style="display:flex;gap:15px;font-size:0.85rem;color:#9ca3af;">
            <span>${name}</span>
            <span>${date}</span>
            <span>${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}</span>
          </div>
        </div>
      </div>
    </a>
  `;
}
