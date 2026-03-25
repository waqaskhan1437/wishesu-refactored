/**
 * Forum Controller - Questions and Replies with moderation
 * OPTIMIZED: Added edge caching for public endpoints
 */

import { json, cachedJson } from '../utils/response.js';
import { slugifyStr } from '../utils/formatting.js';
import { buildPublicProductStatusWhere } from '../utils/product-visibility.js';
import { 
  notifyForumQuestion, 
  notifyForumReply,
  notifyCustomerForumReply
} from './webhooks.js';

// Cache for schema validation - avoids repeated checks per request
let forumSchemaValidated = false;

function buildForumQuestionBaseSlug(title, fallbackSeed = Date.now()) {
  const baseSlug = slugifyStr(String(title || '')).slice(0, 80).replace(/^-+|-+$/g, '');
  return baseSlug || `question-${String(fallbackSeed)}`;
}

function isForumSlugUniqueConstraintError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('unique') && message.includes('forum_questions.slug');
}

async function normalizeExistingForumQuestionSlugs(env) {
  const rows = await env.DB.prepare(`
    SELECT id, title, slug
    FROM forum_questions
    ORDER BY created_at ASC, id ASC
  `).all();

  const questions = rows.results || [];
  const used = new Set();

  for (const question of questions) {
    const stableSeed = question?.id || Date.now();
    const preferredBase = buildForumQuestionBaseSlug(question?.slug || question?.title || '', stableSeed);
    let candidate = preferredBase;
    let suffix = 1;

    while (used.has(candidate)) {
      candidate = `${preferredBase}-${suffix++}`;
    }

    if (String(question?.slug || '') !== candidate) {
      await env.DB.prepare(`
        UPDATE forum_questions
        SET slug = ?, updated_at = ?
        WHERE id = ?
      `).bind(candidate, Date.now(), question.id).run();
    }

    used.add(candidate);
  }

  await env.DB.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_forum_questions_slug_unique
    ON forum_questions(slug)
  `).run();
}

/**
 * Ensure forum tables exist with proper schema
 * Uses caching to avoid repeated checks on every request
 */
async function ensureForumTables(env) {
  // Skip if already validated in this worker instance
  if (forumSchemaValidated) return;
  
  try {
    // Quick check - if both columns exist, we're good
    let repliesOk = false;
    let questionsOk = false;
    
    try {
      await env.DB.prepare(`SELECT question_id FROM forum_replies LIMIT 1`).first();
      repliesOk = true;
    } catch (e) { /* needs fix */ }
    
    try {
      await env.DB.prepare(`SELECT email FROM forum_questions LIMIT 1`).first();
      questionsOk = true;
    } catch (e) { /* needs fix */ }
    
    // If both tables are OK, cache and return
    if (repliesOk && questionsOk) {
      await normalizeExistingForumQuestionSlugs(env);
      forumSchemaValidated = true;
      return;
    }

    // Only recreate if needed (rare - only on first deploy or schema change)
    if (!repliesOk) {
      // Backup and recreate forum_replies
      let existingReplies = [];
      try {
        const result = await env.DB.prepare(`SELECT * FROM forum_replies`).all();
        existingReplies = result.results || [];
      } catch (e) { /* table might not exist */ }

      await env.DB.prepare(`DROP TABLE IF EXISTS forum_replies`).run();
      await env.DB.prepare(`
        CREATE TABLE forum_replies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          question_id INTEGER NOT NULL DEFAULT 0,
          name TEXT NOT NULL DEFAULT '',
          email TEXT DEFAULT '',
          content TEXT NOT NULL DEFAULT '',
          status TEXT DEFAULT 'pending',
          created_at INTEGER
        )
      `).run();

      // Batch insert for better performance
      if (existingReplies.length > 0) {
        const batch = existingReplies.map(r => 
          env.DB.prepare(`INSERT INTO forum_replies (id, question_id, name, email, content, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .bind(r.id || null, r.question_id || 0, r.name || '', r.email || '', r.content || '', r.status || 'pending', r.created_at || Date.now())
        );
        // Execute in parallel batches of 10
        for (let i = 0; i < batch.length; i += 10) {
          await Promise.all(batch.slice(i, i + 10).map(stmt => stmt.run().catch(() => {})));
        }
      }
    }

    if (!questionsOk) {
      // Backup and recreate forum_questions
      let existingQuestions = [];
      try {
        const result = await env.DB.prepare(`SELECT * FROM forum_questions`).all();
        existingQuestions = result.results || [];
      } catch (e) { /* table might not exist */ }

      await env.DB.prepare(`DROP TABLE IF EXISTS forum_questions`).run();
      await env.DB.prepare(`
        CREATE TABLE forum_questions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL DEFAULT '',
          slug TEXT UNIQUE,
          content TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL DEFAULT '',
          email TEXT DEFAULT '',
          status TEXT DEFAULT 'pending',
          reply_count INTEGER DEFAULT 0,
          created_at INTEGER,
          updated_at INTEGER
        )
      `).run();

      // Batch insert for better performance
      if (existingQuestions.length > 0) {
        const usedForumSlugs = new Set();
        const buildRestoredForumSlug = (question, fallbackIndex) => {
          const baseSlug = buildForumQuestionBaseSlug(question?.slug || question?.title || '', fallbackIndex);
          let candidate = baseSlug;
          let suffix = 1;
          while (usedForumSlugs.has(candidate)) {
            candidate = `${baseSlug}-${suffix++}`;
          }
          usedForumSlugs.add(candidate);
          return candidate;
        };
        const batch = existingQuestions.map(q =>
          env.DB.prepare(`INSERT INTO forum_questions (id, title, slug, content, name, email, status, reply_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(q.id || null, q.title || '', buildRestoredForumSlug(q, q.id || Date.now()), q.content || '', q.name || '', q.email || '', q.status || 'pending', q.reply_count || 0, q.created_at || Date.now(), q.updated_at || Date.now())
        );
        for (let i = 0; i < batch.length; i += 10) {
          await Promise.all(batch.slice(i, i + 10).map(stmt => stmt.run().catch(() => {})));
        }
      }
    }

    await normalizeExistingForumQuestionSlugs(env);

    // Mark as validated
    forumSchemaValidated = true;
    
  } catch (e) {
    console.error('Forum table creation error:', e);
  }
}

/**
 * Get published questions for forum page with pagination
 */
export async function getPublishedQuestions(env, url) {
  try {
    await ensureForumTables(env);
    
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // OPTIMIZED: Run count and data queries in parallel
    const [countResult, result] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) as total FROM forum_questions WHERE status = 'approved'`).first(),
      env.DB.prepare(`
        SELECT id, title, slug, content, name, reply_count, created_at
        FROM forum_questions 
        WHERE status = 'approved'
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).bind(limit, offset).all()
    ]);
    
    const total = countResult?.total || 0;

    // Cache for 2 minutes
    return cachedJson({
      success: true,
      questions: result.results || [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: offset + limit < total,
        hasPrev: page > 1
      }
    }, 120);
  } catch (err) {
    console.error('getPublishedQuestions error:', err);
    return json({ error: err.message, questions: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false } }, 500);
  }
}

/**
 * Get single question with approved replies
 */
export async function getQuestion(env, slug) {
  try {
    const question = await env.DB.prepare(`
      SELECT * FROM forum_questions WHERE slug = ? AND status = 'approved'
    `).bind(slug).first();

    if (!question) {
      return json({ error: 'Question not found' }, 404);
    }

    // Get approved replies
    const replies = await env.DB.prepare(`
      SELECT id, name, content, created_at
      FROM forum_replies 
      WHERE question_id = ? AND status = 'approved'
      ORDER BY created_at ASC
    `).bind(question.id).all();

    return json({
      success: true,
      question,
      replies: replies.results || []
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Get single question by ID
 */
export async function getQuestionById(env, id) {
  try {
    await ensureForumTables(env);
    
    if (!id) {
      return json({ error: 'Question ID required' }, 400);
    }

    const question = await env.DB.prepare(`
      SELECT * FROM forum_questions WHERE id = ? AND status = 'approved'
    `).bind(parseInt(id)).first();

    if (!question) {
      return json({ error: 'Question not found' }, 404);
    }

    return json({
      success: true,
      question
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Get replies for a question by ID (for expandable questions)
 */
export async function getQuestionReplies(env, questionId) {
  try {
    await ensureForumTables(env);
    
    if (!questionId) {
      return json({ replies: [] });
    }

    const replies = await env.DB.prepare(`
      SELECT id, name, content, created_at
      FROM forum_replies 
      WHERE question_id = ? AND status = 'approved'
      ORDER BY created_at ASC
    `).bind(questionId).all();

    return json({
      success: true,
      replies: replies.results || []
    });
  } catch (err) {
    console.error('getQuestionReplies error:', err);
    return json({ replies: [] });
  }
}

/**
 * Check if user has pending question or reply
 */
export async function checkPendingForum(env, email) {
  try {
    await ensureForumTables(env);
    
    // Check pending questions
    let pendingQuestion = null;
    try {
      pendingQuestion = await env.DB.prepare(`
        SELECT id FROM forum_questions 
        WHERE email = ? AND status = 'pending'
        LIMIT 1
      `).bind(email).first();
    } catch (e) { /* email column might not exist */ }

    // Check pending replies
    let pendingReply = null;
    try {
      pendingReply = await env.DB.prepare(`
        SELECT id FROM forum_replies 
        WHERE email = ? AND status = 'pending'
        LIMIT 1
      `).bind(email).first();
    } catch (e) { /* email column might not exist */ }

    return json({
      success: true,
      hasPending: !!(pendingQuestion || pendingReply),
      pendingType: pendingQuestion ? 'question' : (pendingReply ? 'reply' : null)
    });
  } catch (err) {
    console.error('checkPendingForum error:', err);
    return json({ success: true, hasPending: false }, 200);
  }
}

/**
 * Submit a new question
 */
export async function submitQuestion(env, body) {
  try {
    await ensureForumTables(env);
    
    const { title, content, name, email } = body;

    if (!title || !content || !name || !email) {
      return json({ error: 'All fields are required' }, 400);
    }

    // Character limits validation
    const trimmedName = String(name).trim();
    const trimmedEmail = String(email).trim().toLowerCase();
    const trimmedTitle = String(title).trim();
    const trimmedContent = String(content).trim();

    if (trimmedName.length > 50) {
      return json({ error: 'Name must be 50 characters or less' }, 400);
    }
    if (trimmedEmail.length > 100) {
      return json({ error: 'Email must be 100 characters or less' }, 400);
    }
    if (trimmedTitle.length > 200) {
      return json({ error: 'Question title must be 200 characters or less' }, 400);
    }
    if (trimmedContent.length > 2000) {
      return json({ error: 'Question content must be 2000 characters or less' }, 400);
    }
    if (trimmedTitle.length < 5) {
      return json({ error: 'Question title must be at least 5 characters' }, 400);
    }
    if (trimmedContent.length < 10) {
      return json({ error: 'Question content must be at least 10 characters' }, 400);
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return json({ error: 'Invalid email format' }, 400);
    }

    // Check for pending (wrap in try-catch in case email column doesn't exist)
    let pendingQ = null;
    let pendingR = null;
    try {
      pendingQ = await env.DB.prepare(`
        SELECT id FROM forum_questions WHERE email = ? AND status = 'pending' LIMIT 1
      `).bind(trimmedEmail).first();
    } catch (e) { /* email column might not exist */ }

    try {
      pendingR = await env.DB.prepare(`
        SELECT id FROM forum_replies WHERE email = ? AND status = 'pending' LIMIT 1
      `).bind(trimmedEmail).first();
    } catch (e) { /* email column might not exist */ }

    if (pendingQ || pendingR) {
      return json({
        error: 'You have a pending question or reply awaiting approval. Please wait for it to be approved.',
        hasPending: true
      }, 400);
    }

    // Generate a SEO‑friendly slug for the forum question.
    // We avoid appending a timestamp so that the slug remains human readable.
    // Instead, we create a base slug from the title (lowercase, hyphenated) and
    // ensure uniqueness by appending an incrementing counter if needed.
    const now = Date.now();
    const baseSlug = buildForumQuestionBaseSlug(trimmedTitle, now);
    let finalSlug = baseSlug;
    let suffix = 1;

    while (true) {
      try {
        await env.DB.prepare(`
          INSERT INTO forum_questions (title, slug, content, name, email, status, reply_count, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)
        `).bind(trimmedTitle, finalSlug, trimmedContent, trimmedName, trimmedEmail, now, now).run();
        break;
      } catch (err) {
        if (!isForumSlugUniqueConstraintError(err)) {
          throw err;
        }
        finalSlug = `${baseSlug}-${suffix++}`;
      }
    }

    // Notify admin about new question (async)
    notifyForumQuestion(env, { 
      title: trimmedTitle, 
      name: trimmedName, 
      email: trimmedEmail, 
      content: trimmedContent 
    }).catch(() => {});

    return json({
      success: true,
      message: 'Question submitted! It will appear after admin approval.'
    });
  } catch (err) {
    console.error('submitQuestion error:', err);
    return json({ error: 'Failed to submit question: ' + err.message }, 500);
  }
}

/**
 * Submit a reply to a question
 */
export async function submitReply(env, body) {
  try {
    await ensureForumTables(env);
    
    const { question_id, content, name, email } = body;

    if (!question_id || !content || !name || !email) {
      return json({ error: 'All fields are required' }, 400);
    }

    // Character limits validation
    const trimmedName = String(name).trim();
    const trimmedEmail = String(email).trim().toLowerCase();
    const trimmedContent = String(content).trim();

    if (trimmedName.length > 50) {
      return json({ error: 'Name must be 50 characters or less' }, 400);
    }
    if (trimmedEmail.length > 100) {
      return json({ error: 'Email must be 100 characters or less' }, 400);
    }
    if (trimmedContent.length > 2000) {
      return json({ error: 'Reply must be 2000 characters or less' }, 400);
    }
    if (trimmedContent.length < 5) {
      return json({ error: 'Reply must be at least 5 characters' }, 400);
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return json({ error: 'Invalid email format' }, 400);
    }

    // Check question exists and is approved
    const question = await env.DB.prepare(`
      SELECT id FROM forum_questions WHERE id = ? AND status = 'approved'
    `).bind(question_id).first();

    if (!question) {
      return json({ error: 'Question not found' }, 404);
    }

    // Check for pending (wrap in try-catch in case email column doesn't exist)
    let pendingQ = null;
    let pendingR = null;
    try {
      pendingQ = await env.DB.prepare(`
        SELECT id FROM forum_questions WHERE email = ? AND status = 'pending' LIMIT 1
      `).bind(trimmedEmail).first();
    } catch (e) { /* email column might not exist */ }

    try {
      pendingR = await env.DB.prepare(`
        SELECT id FROM forum_replies WHERE email = ? AND status = 'pending' LIMIT 1
      `).bind(trimmedEmail).first();
    } catch (e) { /* email column might not exist */ }

    if (pendingQ || pendingR) {
      return json({
        error: 'You have a pending question or reply awaiting approval. Please wait for it to be approved.',
        hasPending: true
      }, 400);
    }

    const now = Date.now();

    await env.DB.prepare(`
      INSERT INTO forum_replies (question_id, name, email, content, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `).bind(question_id, trimmedName, trimmedEmail, trimmedContent, now).run();

    // Get question details for notification
    let questionTitle = '', questionAuthorName = '', questionAuthorEmail = '', questionSlug = '';
    try {
      const q = await env.DB.prepare('SELECT title, name, email, slug FROM forum_questions WHERE id = ?').bind(question_id).first();
      questionTitle = q?.title || '';
      questionAuthorName = q?.name || '';
      questionAuthorEmail = q?.email || '';
      questionSlug = q?.slug || '';
    } catch (e) {}
    
    // Notify admin about new reply (async)
    notifyForumReply(env, { 
      questionTitle, 
      name: trimmedName, 
      email: trimmedEmail, 
      content: trimmedContent 
    }).catch(() => {});
    
    // Notify question author about reply (async)
    if (questionAuthorEmail && questionAuthorEmail !== trimmedEmail) {
      notifyCustomerForumReply(env, {
        questionTitle,
        questionSlug,
        questionAuthorName,
        questionAuthorEmail,
        replyAuthorName: trimmedName,
        replyContent: trimmedContent
      }).catch(() => {});
    }

    return json({
      success: true,
      message: 'Reply submitted! It will appear after admin approval.'
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Get all questions for admin
 */
export async function getAdminQuestions(env, url) {
  try {
    await ensureForumTables(env);
    
    const status = url.searchParams.get('status') || 'all';

    let query = 'SELECT * FROM forum_questions';
    if (status !== 'all') {
      query += ` WHERE status = '${status}'`;
    }
    query += ' ORDER BY created_at DESC';

    const result = await env.DB.prepare(query).all();

    // Get counts
    const pendingCount = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM forum_questions WHERE status = ?'
    ).bind('pending').first();

    const approvedCount = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM forum_questions WHERE status = ?'
    ).bind('approved').first();

    return json({
      success: true,
      questions: result.results || [],
      counts: {
        pending: pendingCount?.count || 0,
        approved: approvedCount?.count || 0
      }
    });
  } catch (err) {
    console.error('getAdminQuestions error:', err);
    return json({ success: true, questions: [], counts: { pending: 0, approved: 0 } }, 200);
  }
}

/**
 * Get all replies for admin
 */
export async function getAdminReplies(env, url) {
  try {
    await ensureForumTables(env);
    
    const status = url.searchParams.get('status') || 'all';
    const questionId = url.searchParams.get('question_id');

    let query = `
      SELECT r.*, q.title as question_title, q.slug as question_slug
      FROM forum_replies r
      LEFT JOIN forum_questions q ON r.question_id = q.id
    `;
    
    const conditions = [];
    if (status !== 'all') {
      conditions.push(`r.status = '${status}'`);
    }
    if (questionId) {
      conditions.push(`r.question_id = ${questionId}`);
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY r.created_at DESC';

    const result = await env.DB.prepare(query).all();

    // Get counts
    const pendingCount = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM forum_replies WHERE status = ?'
    ).bind('pending').first();

    const approvedCount = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM forum_replies WHERE status = ?'
    ).bind('approved').first();

    return json({
      success: true,
      replies: result.results || [],
      counts: {
        pending: pendingCount?.count || 0,
        approved: approvedCount?.count || 0
      }
    });
  } catch (err) {
    console.error('getAdminReplies error:', err);
    return json({ success: true, replies: [], counts: { pending: 0, approved: 0 } }, 200);
  }
}

/**
 * Update question status
 */
export async function updateQuestionStatus(env, body) {
  try {
    const { id, status } = body;

    if (!id || !status) {
      return json({ error: 'ID and status required' }, 400);
    }

    await env.DB.prepare(`
      UPDATE forum_questions SET status = ?, updated_at = ? WHERE id = ?
    `).bind(status, Date.now(), id).run();

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Update reply status
 */
export async function updateReplyStatus(env, body) {
  try {
    const { id, status } = body;

    if (!id || !status) {
      return json({ error: 'ID and status required' }, 400);
    }

    // Get question_id to update reply count
    const reply = await env.DB.prepare('SELECT question_id FROM forum_replies WHERE id = ?').bind(id).first();

    await env.DB.prepare(`
      UPDATE forum_replies SET status = ? WHERE id = ?
    `).bind(status, id).run();

    // Update reply count
    if (reply) {
      const countResult = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM forum_replies WHERE question_id = ? AND status = 'approved'
      `).bind(reply.question_id).first();

      await env.DB.prepare(`
        UPDATE forum_questions SET reply_count = ? WHERE id = ?
      `).bind(countResult?.count || 0, reply.question_id).run();
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Delete question
 */
export async function deleteQuestion(env, id) {
  try {
    if (!id) {
      return json({ error: 'Question ID required' }, 400);
    }

    // Delete replies first
    await env.DB.prepare('DELETE FROM forum_replies WHERE question_id = ?').bind(id).run();
    // Delete question
    await env.DB.prepare('DELETE FROM forum_questions WHERE id = ?').bind(id).run();

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Delete reply
 */
export async function deleteReply(env, id) {
  try {
    if (!id) {
      return json({ error: 'Reply ID required' }, 400);
    }

    // Get question_id before delete
    const reply = await env.DB.prepare('SELECT question_id FROM forum_replies WHERE id = ?').bind(id).first();

    await env.DB.prepare('DELETE FROM forum_replies WHERE id = ?').bind(id).run();

    // Update reply count
    if (reply) {
      const countResult = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM forum_replies WHERE question_id = ? AND status = 'approved'
      `).bind(reply.question_id).first();

      await env.DB.prepare(`
        UPDATE forum_questions SET reply_count = ? WHERE id = ?
      `).bind(countResult?.count || 0, reply.question_id).run();
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/**
 * Delete all forum questions and replies (admin cleanup)
 */
export async function deleteAllForumContent(env) {
  try {
    const repliesResult = await env.DB.prepare('DELETE FROM forum_replies').run();
    const questionsResult = await env.DB.prepare('DELETE FROM forum_questions').run();

    return json({
      success: true,
      questions_deleted: questionsResult?.changes || 0,
      replies_deleted: repliesResult?.changes || 0
    });
  } catch (err) {
    return json({ error: err.message || 'Failed to delete forum data' }, 500);
  }
}

/**
 * Get sidebar content (products and blogs based on question id for internal linking)
 */
export async function getForumSidebar(env, questionId) {
  try {
    // Get 2 products created before/around this question (for internal linking sequence)
    // Products with id <= questionId (older products for older questions)
    const products = await env.DB.prepare(`
      SELECT id, title, slug, thumbnail_url, sale_price, normal_price
      FROM products 
      WHERE ${buildPublicProductStatusWhere('status')}
      ORDER BY id DESC
      LIMIT 2 OFFSET ?
    `).bind(Math.max(0, questionId - 1)).all();

    // Get 2 blog posts created before/around this question
    const blogs = await env.DB.prepare(`
      SELECT id, title, slug, thumbnail_url, description
      FROM blogs 
      WHERE status = 'published'
      ORDER BY id DESC
      LIMIT 2 OFFSET ?
    `).bind(Math.max(0, questionId - 1)).all();

    return json({
      success: true,
      products: products.results || [],
      blogs: blogs.results || []
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
