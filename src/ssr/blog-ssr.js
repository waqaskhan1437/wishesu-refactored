/**
 * Blog SSR - Archive & Cards Rendering
 * Blog-specific SSR rendering functions
 */

import { escapeHtmlText, stripHtml } from '../utils/html-entities.js';
import { formatBlogArchiveDate, formatShortDate } from '../utils/date-formatter.js';
import { renderBlogCard } from '../utils/card-renderer.js';
import { renderPaginationSsr } from '../utils/paginations.js';

export function renderBlogArchiveCardsSsr(blogs = [], pagination = {}) {
  const safeBlogs = Array.isArray(blogs) ? blogs : [];
  const cardsHtml = safeBlogs.map((blog) => renderBlogCard(blog)).join('');

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

  const paginationHtml = renderPaginationSsr(pagination, { basePath: '/blog' });
  return `${styles}<div class="blog-cards-grid">${cardsHtml}</div>${paginationHtml}`;
}

export function renderEmbeddedBlogCards(blogs = []) {
  if (!Array.isArray(blogs) || blogs.length === 0) {
    return '<p style="text-align:center;color:#6b7280;padding:40px;background:white;border-radius:12px;">No blog posts found.</p>';
  }
  
  return blogs.map((blog) => {
    const slugOrId = String(blog.slug || blog.id || '').trim();
    if (!slugOrId) return '';
    
    const blogUrl = `/blog/${encodeURIComponent(slugOrId)}`;
    const title = escapeHtmlText(blog.title || 'Untitled');
    const description = escapeHtmlText(blog.description || '').substring(0, 150);
    const thumb = escapeHtmlText(
      String(blog.thumbnail_url || '').trim() || 'https://via.placeholder.com/400x225?text=No+Image'
    );
    
    return `
      <a href="${blogUrl}" style="display:block;background:white;border-radius:12px;padding:20px;margin-bottom:15px;box-shadow:0 2px 8px rgba(0,0,0,0.06);text-decoration:none;transition:transform 0.2s,box-shadow 0.2s;">
        <div style="display:flex;gap:20px;align-items:flex-start;">
          <img src="${thumb}" alt="${title}" style="width:120px;height:80px;object-fit:cover;border-radius:8px;flex-shrink:0;">
          <div style="flex:1;min-width:0;">
            <h4 style="color:#1f2937;margin-bottom:8px;font-size:1.1rem;">${title}</h4>
            <p style="color:#6b7280;font-size:0.9rem;line-height:1.5;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${description}</p>
          </div>
        </div>
      </a>`;
  }).join('');
}
