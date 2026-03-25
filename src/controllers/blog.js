/**
 * Blog Controller - Blog posts CRUD operations
 * OPTIMIZED: Added edge caching for public endpoints
 */

import { json, cachedJson } from '../utils/response.js';

/**
 * Get all blog posts (admin - no cache)
 */
export async function getBlogs(env) {
  try {
    const result = await env.DB.prepare(`
      SELECT * FROM blogs ORDER BY created_at DESC
    `).all();
    return json({ success: true, blogs: result.results || [] });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Get blog posts list (minimal data for admin table - no cache)
 */
export async function getBlogsList(env) {
  try {
    const result = await env.DB.prepare(`
      SELECT id, title, slug, thumbnail_url, status, created_at, updated_at
      FROM blogs ORDER BY created_at DESC
    `).all();
    return json({ success: true, blogs: result.results || [] });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Get published blogs for archive page with pagination (PUBLIC - cached)
 * OPTIMIZED: Use parallel queries for count and data
 */
export async function getPublishedBlogs(env, url) {
  try {
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '30');
    const offset = (page - 1) * limit;

    // OPTIMIZED: Run count and data queries in parallel
    const [countResult, result] = await Promise.all([
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

    // Cache for 3 minutes
    return cachedJson({
      success: true,
      blogs: result.results || [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: offset + limit < total,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Get single blog by ID or slug
 */
export async function getBlog(env, idOrSlug) {
  try {
    let blog;
    
    // Check if it's an ID (numeric) or slug
    if (/^\d+$/.test(idOrSlug)) {
      blog = await env.DB.prepare(`
        SELECT * FROM blogs WHERE id = ?
      `).bind(parseInt(idOrSlug)).first();
    } else {
      blog = await env.DB.prepare(`
        SELECT * FROM blogs WHERE slug = ?
      `).bind(idOrSlug).first();
    }

    if (!blog) {
      return json({ error: 'Blog post not found' }, 404);
    }

    return json({ success: true, blog });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Get published blog by slug (public)
 */
export async function getPublishedBlog(env, slug) {
  try {
    const blog = await env.DB.prepare(`
      SELECT * FROM blogs WHERE slug = ? AND status = 'published'
    `).bind(slug).first();

    if (!blog) {
      return json({ error: 'Blog post not found' }, 404);
    }

    return json({ success: true, blog });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Get previous blogs before the current one (for related posts)
 */
export async function getPreviousBlogs(env, currentId, limit = 2) {
  try {
    const result = await env.DB.prepare(`
      SELECT id, title, slug, description, thumbnail_url, created_at
      FROM blogs 
      WHERE status = 'published' AND id < ?
      ORDER BY id DESC
      LIMIT ?
    `).bind(currentId, limit).all();

    return json({ success: true, blogs: result.results || [] });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Save blog post (create or update)
 */
export async function saveBlog(env, body) {
  try {
    const {
      id,
      title,
      slug,
      description,
      content,
      thumbnail_url,
      custom_css,
      custom_js,
      seo_title,
      seo_description,
      seo_keywords,
      status = 'draft'
    } = body;

    if (!title) {
      return json({ error: 'Title is required' }, 400);
    }

    // Generate or sanitize the slug.
    // If a slug is provided by the user, sanitize it to ensure it follows
    // SEO best practices (lowercase, hyphens only, trimmed). Otherwise, generate
    // one from the title. Avoid underscores or other special characters.
    let finalSlug;
    if (slug && typeof slug === 'string' && slug.trim().length > 0) {
      finalSlug = slug.toLowerCase()
        .replace(/['"`]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
    } else {
      finalSlug = title.toLowerCase()
        .replace(/['"`]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
    }

    const now = Date.now();

    if (id) {
      // Partial update: fetch existing blog and only overwrite fields that were explicitly sent
      const existing = await env.DB.prepare('SELECT * FROM blogs WHERE id = ?').bind(id).first();
      if (!existing) {
        return json({ error: 'Blog post not found' }, 404);
      }

      // Helper: use the new value only if the key was present in the request body
      const pick = (key, fallback) => (key in body) ? (body[key] ?? '') : (fallback ?? '');

      await env.DB.prepare(`
        UPDATE blogs SET
          title = ?,
          slug = ?,
          description = ?,
          content = ?,
          thumbnail_url = ?,
          custom_css = ?,
          custom_js = ?,
          seo_title = ?,
          seo_description = ?,
          seo_keywords = ?,
          status = ?,
          updated_at = ?
        WHERE id = ?
      `).bind(
        title,
        finalSlug,
        pick('description', existing.description),
        pick('content', existing.content),
        pick('thumbnail_url', existing.thumbnail_url),
        pick('custom_css', existing.custom_css),
        pick('custom_js', existing.custom_js),
        pick('seo_title', existing.seo_title),
        pick('seo_description', existing.seo_description),
        pick('seo_keywords', existing.seo_keywords),
        pick('status', existing.status),
        now,
        id
      ).run();

      return json({ success: true, id, slug: finalSlug });
    } else {
      // Create new blog
      const result = await env.DB.prepare(`
        INSERT INTO blogs (title, slug, description, content, thumbnail_url, custom_css, custom_js, seo_title, seo_description, seo_keywords, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        title,
        finalSlug,
        description || '',
        content || '',
        thumbnail_url || '',
        custom_css || '',
        custom_js || '',
        seo_title || '',
        seo_description || '',
        seo_keywords || '',
        status,
        now,
        now
      ).run();

      return json({ success: true, id: result.meta?.last_row_id, slug: finalSlug });
    }
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Delete blog post
 */
export async function deleteBlog(env, id) {
  try {
    if (!id) {
      return json({ error: 'Blog ID required' }, 400);
    }

    await env.DB.prepare('DELETE FROM blogs WHERE id = ?').bind(id).run();
    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Delete all blogs (admin cleanup)
 */
export async function deleteAllBlogs(env) {
  try {
    const commentsResult = await env.DB.prepare(
      'DELETE FROM blog_comments WHERE blog_id IN (SELECT id FROM blogs)'
    ).run();
    const blogsResult = await env.DB.prepare('DELETE FROM blogs').run();

    return json({
      success: true,
      count: blogsResult?.changes || 0,
      deleted_blog_comments: commentsResult?.changes || 0
    });
  } catch (err) {
    return json({ error: err.message || 'Failed to delete all blogs' }, 500);
  }
}

/**
 * Update blog status
 */
export async function updateBlogStatus(env, body) {
  try {
    const { id, status } = body;
    
    if (!id || !status) {
      return json({ error: 'ID and status required' }, 400);
    }

    await env.DB.prepare(`
      UPDATE blogs SET status = ?, updated_at = ? WHERE id = ?
    `).bind(status, Date.now(), id).run();

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Duplicate blog post
 */
export async function duplicateBlog(env, body) {
  try {
    const { id } = body;
    
    if (!id) {
      return json({ error: 'Blog ID required' }, 400);
    }

    // Get original blog
    const original = await env.DB.prepare('SELECT * FROM blogs WHERE id = ?').bind(id).first();
    
    if (!original) {
      return json({ error: 'Blog not found' }, 404);
    }

    // Generate a readable slug for the duplicated blog post. Instead of
    // appending a timestamp, which produces long and unreadable URLs,
    // append a simple "-copy" suffix and increment it until the slug is
    // unique. This maintains SEO best practices for short, descriptive slugs.
    let baseSlug = (original.slug || '')
      .toString()
      .toLowerCase()
      .replace(/['"`]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-');
    if (!baseSlug) {
      baseSlug = 'post';
    }
    let newSlugCandidate = `${baseSlug}-copy`;
    let counter = 1;
    while (true) {
      const exists = await env.DB.prepare('SELECT id FROM blogs WHERE slug = ? LIMIT 1').bind(newSlugCandidate).first();
      if (!exists) break;
      newSlugCandidate = `${baseSlug}-copy${counter++}`;
    }
    const now = Date.now();
    const result = await env.DB.prepare(`
      INSERT INTO blogs (title, slug, description, content, thumbnail_url, custom_css, custom_js, seo_title, seo_description, seo_keywords, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
    `).bind(
      `${original.title} (Copy)`,
      newSlugCandidate,
      original.description || '',
      original.content || '',
      original.thumbnail_url || '',
      original.custom_css || '',
      original.custom_js || '',
      original.seo_title || '',
      original.seo_description || '',
      original.seo_keywords || '',
      now,
      now
    ).run();

    return json({ success: true, id: result.meta?.last_row_id, slug: newSlugCandidate });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
