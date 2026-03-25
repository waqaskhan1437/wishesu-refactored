/**
 * Blog Page Generator
 * Server-side HTML generation for blog posts
 * Consolidated from index.js
 */

import { escapeHtmlText } from '../utils/html-entities.js';
import { formatBlogArchiveDate, formatCommentDate } from '../utils/date-formatter.js';
import { renderSsrReviewCards } from '../ssr/review-ssr.js';

export function generateBlogPostHTML(blog, previousBlogs = [], comments = []) {
  const title = escapeHtmlText(blog.title || 'Untitled');
  const content = blog.content || '';
  const thumbnail = escapeHtmlText(blog.thumbnail_url || '');
  const date = formatBlogArchiveDate(blog.created_at);
  const author = escapeHtmlText(blog.author || 'Admin');

  const commentsHtml = Array.isArray(comments) && comments.length > 0
    ? comments.map(c => {
        const name = escapeHtmlText(c.name || 'Anonymous');
        const text = escapeHtmlText(c.comment || c.content || '');
        const cDate = formatCommentDate(c.created_at);
        return `
          <div class="comment-item" style="background:#f9fafb;padding:16px;border-radius:8px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <strong>${name}</strong>
              <span style="color:#6b7280;font-size:0.85rem;">${cDate}</span>
            </div>
            <p style="margin:0;color:#374151;line-height:1.6;">${text}</p>
          </div>`;
      }).join('')
    : '<p style="color:#6b7280;">No comments yet.</p>';

  const prevNextHtml = Array.isArray(previousBlogs) && previousBlogs.length > 0
    ? previousBlogs.map(pb => {
        const pbTitle = escapeHtmlText(pb.title || '');
        const pbSlug = String(pb.slug || pb.id || '');
        return `<a href="/blog/${encodeURIComponent(pbSlug)}" class="prev-next-link" style="display:block;padding:12px;background:#f9fafb;border-radius:8px;text-decoration:none;color:#1d4ed8;">&larr; ${pbTitle}</a>`;
      }).join('')
    : '';

  return `
    <article class="blog-post" style="max-width:800px;margin:0 auto;padding:20px;">
      <header class="blog-header" style="margin-bottom:30px;">
        ${thumbnail ? `<img src="${thumbnail}" alt="${title}" style="width:100%;max-height:400px;object-fit:cover;border-radius:12px;margin-bottom:20px;">` : ''}
        <h1 style="font-size:2.5rem;margin-bottom:10px;color:#111827;">${title}</h1>
        <div class="blog-meta" style="color:#6b7280;font-size:0.95rem;">
          <span>By ${author}</span> &bull; <span>${date}</span>
        </div>
      </header>
      
      <div class="blog-content" style="line-height:1.8;font-size:1.1rem;color:#374151;">
        ${content}
      </div>
      
      ${prevNextHtml ? `
        <div class="blog-prev-next" style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb;">
          <h3 style="font-size:1.2rem;margin-bottom:15px;">Related Posts</h3>
          ${prevNextHtml}
        </div>
      ` : ''}
      
      <section class="blog-comments" style="margin-top:50px;">
        <h3 style="font-size:1.5rem;margin-bottom:20px;">Comments (${comments.length})</h3>
        ${commentsHtml}
      </section>
    </article>
  `;
}

export function generateBlogCard(blog) {
  const slugOrId = String(blog.slug || blog.id || '').trim();
  if (!slugOrId) return '';

  const url = `/blog/${encodeURIComponent(slugOrId)}`;
  const title = escapeHtmlText(blog.title || 'Untitled');
  const desc = escapeHtmlText(blog.description || '').substring(0, 150);
  const thumb = escapeHtmlText(blog.thumbnail_url || 'https://via.placeholder.com/400x225');
  const date = formatBlogArchiveDate(blog.created_at);

  return `
    <a href="${url}" class="blog-card" style="display:block;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);text-decoration:none;color:inherit;transition:transform 0.2s;">
      <img src="${thumb}" alt="${title}" style="width:100%;aspect-ratio:16/9;object-fit:cover;">
      <div style="padding:16px;">
        <h3 style="margin:0 0 8px;font-size:1.1rem;color:#111827;">${title}</h3>
        <p style="margin:0 0 10px;color:#6b7280;font-size:0.9rem;line-height:1.5;">${desc}</p>
        <span style="color:#9ca3af;font-size:0.85rem;">${date}</span>
      </div>
    </a>
  `;
}
