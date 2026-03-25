/**
 * SSR Query Helpers
 * Database queries for Server-Side Rendering
 * Consolidated from index.js
 */

import { initDB } from '../config/db.js';
import { queryOne, queryAll } from '../utils/db-helpers.js';

function buildPublicProductStatusWhere(tableAlias = 'p.status') {
  return `(${tableAlias} = 'published' OR ${tableAlias} = 'active')`;
}

export async function queryProductsForComponentSsr(env, options = {}) {
  const {
    limit = 20,
    offset = 0,
    sortBy = 'sort_order',
    sortOrder = 'ASC',
    status = 'published',
    searchQuery = '',
    category = ''
  } = options;

  if (!env?.DB) return { products: [], total: 0 };

  try {
    await initDB(env);

    const whereClause = [];
    const bindings = [];

    if (status) {
      whereClause.push('p.status = ?');
      bindings.push(status);
    }

    if (searchQuery) {
      whereClause.push('(p.title LIKE ? OR p.description LIKE ?)');
      const searchTerm = `%${searchQuery}%`;
      bindings.push(searchTerm, searchTerm);
    }

    if (category) {
      whereClause.push('p.category = ?');
      bindings.push(category);
    }

    const whereStr = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';

    const totalRow = await queryOne(
      env,
      `SELECT COUNT(*) as count FROM products p ${whereStr}`,
      bindings
    );
    const total = totalRow?.count || 0;

    const sortColumn = ['title', 'price', 'created_at', 'sort_order'].includes(sortBy) ? sortBy : 'sort_order';
    const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const sql = `
      SELECT p.*,
        (SELECT COUNT(*) FROM reviews WHERE product_id = p.id AND status = 'approved') as review_count,
        (SELECT AVG(rating) FROM reviews WHERE product_id = p.id AND status = 'approved') as rating_average
      FROM products p
      ${whereStr}
      ORDER BY p.${sortColumn} ${order}, p.id DESC
      LIMIT ? OFFSET ?
    `;

    const products = await queryAll(env, sql, [...bindings, limit, offset]);

    return { products, total };
  } catch (e) {
    console.error('queryProductsForComponentSsr error:', e.message);
    return { products: [], total: 0 };
  }
}

export async function queryBlogsForComponentSsr(env, options = {}) {
  const {
    limit = 10,
    offset = 0,
    status = 'published'
  } = options;

  if (!env?.DB) return { blogs: [], total: 0 };

  try {
    await initDB(env);

    const totalRow = await queryOne(
      env,
      `SELECT COUNT(*) as total FROM blogs WHERE status = ?`,
      [status]
    );
    const total = totalRow?.total || 0;

    const blogs = await queryAll(
      env,
      `SELECT id, title, slug, description, thumbnail_url, created_at, status
       FROM blogs
       WHERE status = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [status, limit, offset]
    );

    return { blogs, total };
  } catch (e) {
    console.error('queryBlogsForComponentSsr error:', e.message);
    return { blogs: [], total: 0 };
  }
}

export async function queryForumQuestionsForSsr(env, options = {}) {
  const {
    limit = 10,
    offset = 0,
    status = 'approved'
  } = options;

  if (!env?.DB) return { questions: [], total: 0 };

  try {
    await initDB(env);

    const totalRow = await queryOne(
      env,
      `SELECT COUNT(*) as total FROM forum_questions WHERE status = ?`,
      [status]
    );
    const total = totalRow?.total || 0;

    const questions = await queryAll(
      env,
      `SELECT id, title, slug, content, name, email, status, reply_count, created_at
       FROM forum_questions
       WHERE status = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [status, limit, offset]
    );

    return { questions, total };
  } catch (e) {
    console.error('queryForumQuestionsForSsr error:', e.message);
    return { questions: [], total: 0 };
  }
}

export async function queryReviewsForSsr(env, options = {}) {
  const {
    limit = 10,
    offset = 0,
    productId = null,
    status = 'approved'
  } = options;

  if (!env?.DB) return { reviews: [], total: 0 };

  try {
    await initDB(env);

    const whereClause = 'status = ?';
    const bindings = [status];

    if (productId) {
      bindings.push(productId);
    }

    const totalRow = await queryOne(
      env,
      `SELECT COUNT(*) as total FROM reviews WHERE ${whereClause}`,
      bindings
    );
    const total = totalRow?.total || 0;

    const sql = productId
      ? `SELECT * FROM reviews WHERE status = ? AND product_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
      : `SELECT * FROM reviews WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`;

    const reviews = await queryAll(env, sql, [...bindings, limit, offset]);

    return { reviews, total };
  } catch (e) {
    console.error('queryReviewsForSsr error:', e.message);
    return { reviews: [], total: 0 };
  }
}

export async function queryHomepageProducts(env, limit = 6) {
  if (!env?.DB) return [];

  try {
    await initDB(env);
    const sql = `
      SELECT p.*,
        (SELECT COUNT(*) FROM reviews WHERE product_id = p.id AND status = 'approved') as review_count,
        (SELECT AVG(rating) FROM reviews WHERE product_id = p.id AND status = 'approved') as rating_average
      FROM products p
      WHERE ${buildPublicProductStatusWhere('p.status')}
      ORDER BY p.sort_order ASC, p.id DESC
      LIMIT ?
    `;
    return await queryAll(env, sql, [limit]);
  } catch (e) {
    console.error('queryHomepageProducts error:', e.message);
    return [];
  }
}

export async function queryPublishedBlogs(env, limit = 6) {
  if (!env?.DB) return [];

  try {
    await initDB(env);
    const sql = `
      SELECT id, title, slug, description, thumbnail_url, created_at
      FROM blogs
      WHERE status = 'published'
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `;
    return await queryAll(env, sql, [limit]);
  } catch (e) {
    console.error('queryPublishedBlogs error:', e.message);
    return [];
  }
}
