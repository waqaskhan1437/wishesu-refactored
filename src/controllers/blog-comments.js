/**
 * Blog Comments Controller
 * Handle blog post comments with moderation
 */

import { json } from '../utils/response.js';
import { notifyBlogComment } from './webhooks.js';

/**
 * Get approved comments for a blog post (public)
 */
export async function getBlogComments(env, blogId) {
  try {
    const result = await env.DB.prepare(`
      SELECT id, name, comment, created_at
      FROM blog_comments 
      WHERE blog_id = ? AND status = 'approved'
      ORDER BY created_at DESC
    `).bind(blogId).all();

    return json({ success: true, comments: result.results || [] });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Check if user has pending comment (by email)
 */
export async function checkPendingComment(env, blogId, email) {
  try {
    const pending = await env.DB.prepare(`
      SELECT id FROM blog_comments 
      WHERE blog_id = ? AND email = ? AND status = 'pending'
      LIMIT 1
    `).bind(blogId, email).first();

    return json({ 
      success: true, 
      hasPending: !!pending 
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Add a new comment (public - pending status)
 */
export async function addBlogComment(env, body) {
  try {
    const { blog_id, name, email, comment } = body;

    if (!blog_id || !name || !email || !comment) {
      return json({ error: 'All fields are required' }, 400);
    }

    // Character limits validation
    const trimmedName = String(name).trim();
    const trimmedEmail = String(email).trim().toLowerCase();
    const trimmedComment = String(comment).trim();

    if (trimmedName.length > 50) {
      return json({ error: 'Name must be 50 characters or less' }, 400);
    }
    if (trimmedEmail.length > 100) {
      return json({ error: 'Email must be 100 characters or less' }, 400);
    }
    if (trimmedComment.length > 2000) {
      return json({ error: 'Comment must be 2000 characters or less' }, 400);
    }
    if (trimmedComment.length < 3) {
      return json({ error: 'Comment must be at least 3 characters' }, 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return json({ error: 'Invalid email format' }, 400);
    }

    // Check if user has pending comment on this blog
    const pending = await env.DB.prepare(`
      SELECT id FROM blog_comments 
      WHERE blog_id = ? AND email = ? AND status = 'pending'
      LIMIT 1
    `).bind(blog_id, trimmedEmail).first();

    if (pending) {
      return json({ 
        error: 'You already have a pending comment awaiting approval. Please wait for it to be approved before posting another.',
        hasPending: true 
      }, 400);
    }

    // Check if blog exists and is published
    const blog = await env.DB.prepare(`
      SELECT id FROM blogs WHERE id = ? AND status = 'published'
    `).bind(blog_id).first();

    if (!blog) {
      return json({ error: 'Blog post not found' }, 404);
    }

    const now = Date.now();

    await env.DB.prepare(`
      INSERT INTO blog_comments (blog_id, name, email, comment, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `).bind(blog_id, trimmedName, trimmedEmail, trimmedComment, now).run();

    // Get blog title for notification
    let blogTitle = '';
    try {
      const blogInfo = await env.DB.prepare('SELECT title FROM blogs WHERE id = ?').bind(blog_id).first();
      blogTitle = blogInfo?.title || '';
    } catch (e) {}
    
    // Notify admin about new comment (async)
    notifyBlogComment(env, { 
      blogTitle, 
      name: trimmedName, 
      email: trimmedEmail, 
      comment: trimmedComment 
    }).catch(() => {});

    return json({ 
      success: true, 
      message: 'Comment submitted successfully! It will appear after admin approval.' 
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Get all comments for admin (with filtering)
 */
export async function getAdminComments(env, url) {
  try {
    const status = url.searchParams.get('status') || 'all';
    const blogId = url.searchParams.get('blog_id');

    let query = `
      SELECT c.*, b.title as blog_title, b.slug as blog_slug
      FROM blog_comments c
      LEFT JOIN blogs b ON c.blog_id = b.id
    `;
    
    const conditions = [];
    const params = [];

    if (status !== 'all') {
      conditions.push('c.status = ?');
      params.push(status);
    }

    if (blogId) {
      conditions.push('c.blog_id = ?');
      params.push(blogId);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY c.created_at DESC';

    const stmt = env.DB.prepare(query);
    const result = params.length > 0 
      ? await stmt.bind(...params).all()
      : await stmt.all();

    // Get counts
    const pendingCount = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM blog_comments WHERE status = ?'
    ).bind('pending').first();

    const approvedCount = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM blog_comments WHERE status = ?'
    ).bind('approved').first();

    return json({ 
      success: true, 
      comments: result.results || [],
      counts: {
        pending: pendingCount?.count || 0,
        approved: approvedCount?.count || 0
      }
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Update comment status (approve/reject)
 */
export async function updateCommentStatus(env, body) {
  try {
    const { id, status } = body;

    if (!id || !status) {
      return json({ error: 'ID and status required' }, 400);
    }

    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return json({ error: 'Invalid status' }, 400);
    }

    await env.DB.prepare(`
      UPDATE blog_comments SET status = ? WHERE id = ?
    `).bind(status, id).run();

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Delete comment
 */
export async function deleteComment(env, id) {
  try {
    if (!id) {
      return json({ error: 'Comment ID required' }, 400);
    }

    await env.DB.prepare('DELETE FROM blog_comments WHERE id = ?').bind(id).run();
    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Bulk approve/reject comments
 */
export async function bulkUpdateComments(env, body) {
  try {
    const { ids, status } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return json({ error: 'Comment IDs required' }, 400);
    }

    if (!['approved', 'rejected'].includes(status)) {
      return json({ error: 'Invalid status' }, 400);
    }

    const placeholders = ids.map(() => '?').join(',');
    await env.DB.prepare(`
      UPDATE blog_comments SET status = ? WHERE id IN (${placeholders})
    `).bind(status, ...ids).run();

    return json({ success: true, updated: ids.length });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
