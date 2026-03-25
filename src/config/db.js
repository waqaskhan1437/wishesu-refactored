/**
 * Database initialization and schema management
 * OPTIMIZED: Uses isolate-level caching to minimize DB operations
 * Tables are only created once per worker isolate lifecycle
 *
 * Performance optimizations:
 * - dbReady flag prevents repeated CREATE TABLE calls
 * - migrationsDone flag runs migrations only once
 * - pagesMigrationDone ensures page columns exist
 * - All flags persist within worker isolate (until cold start)
 * - Warmup initialization prevents cold start delays
 */

import { clearProductTableColumnsCache } from '../utils/product-visibility.js';

let dbReady = false;
let migrationsDone = false;
let pagesMigrationDone = false;
let initPromise = null;
let initStartTime = 0;

// Maximum time to wait for DB initialization (prevents hanging)
// Increased timeout for better cold start handling
const DB_INIT_TIMEOUT_MS = 5000;

/**
 * Initialize database schema - creates all required tables
 * OPTIMIZED: Skips if already done in this isolate
 * Includes timeout to prevent cold start hanging
 * @param {Object} env - Environment bindings
 */
export async function initDB(env) {
  if (dbReady || !env.DB) return;
  if (initPromise) {
    // If initialization is taking too long, don't wait
    if (initStartTime && Date.now() - initStartTime > DB_INIT_TIMEOUT_MS) {
      console.warn('DB init timeout - proceeding without waiting');
      return;
    }
    return await initPromise;
  }

  initStartTime = Date.now();
  initPromise = (async () => {
    try {
      // Create all tables with batch execution for better performance
      await env.DB.batch([
        // Products table
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT, slug TEXT, description TEXT,
            normal_price REAL, sale_price REAL,
            instant_delivery INTEGER DEFAULT 0,
            normal_delivery_text TEXT,
            thumbnail_url TEXT, video_url TEXT,
            gallery_images TEXT,
            addons_json TEXT,
            seo_title TEXT, seo_description TEXT, seo_keywords TEXT, seo_canonical TEXT,
            whop_plan TEXT, whop_price_map TEXT,
            whop_product_id TEXT,
            status TEXT DEFAULT 'active',
            featured INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `),
        // Orders table
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT UNIQUE, product_id INTEGER,
            encrypted_data TEXT, iv TEXT,
            archive_url TEXT, archive_data TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            delivered_video_url TEXT, delivered_thumbnail_url TEXT,
            delivered_video_metadata TEXT,
            portfolio_enabled INTEGER DEFAULT 1,
            delivered_at DATETIME,
            delivery_time_minutes INTEGER DEFAULT 60,
            revision_count INTEGER DEFAULT 0,
            revision_requested INTEGER DEFAULT 0
          )
        `),
        // Reviews table
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER, author_name TEXT, rating INTEGER, comment TEXT,
            status TEXT DEFAULT 'approved',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            order_id TEXT, show_on_product INTEGER DEFAULT 1,
            delivered_video_url TEXT, delivered_thumbnail_url TEXT
          )
        `),
        // Index for reviews by product
        env.DB.prepare(`
          CREATE INDEX IF NOT EXISTS idx_reviews_product_id
          ON reviews(product_id)
        `),
        // Settings table
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`),
        // Backups table (JSON exports)
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS backups (id TEXT PRIMARY KEY, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, size INTEGER DEFAULT 0, media_count INTEGER DEFAULT 0, data TEXT)`),
        // Pages table
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE, title TEXT, content TEXT,
            meta_description TEXT, 
            page_type TEXT DEFAULT 'custom',
            is_default INTEGER DEFAULT 0,
            status TEXT DEFAULT 'published',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `),
        // Checkout sessions table
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS checkout_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            checkout_id TEXT UNIQUE,
            product_id INTEGER,
            plan_id TEXT,
            metadata TEXT,
            expires_at DATETIME,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME
          )
        `),
        // Chat sessions table
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS chat_sessions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            blocked INTEGER DEFAULT 0,
            last_message_content TEXT,
            last_message_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `),
        // Chat messages table
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
          )
        `),
        // Index for chat messages
        env.DB.prepare(`
          CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id_id
          ON chat_messages(session_id, id)
        `),
        // Blogs table
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS blogs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            slug TEXT UNIQUE,
            description TEXT,
            content TEXT,
            thumbnail_url TEXT,
            custom_css TEXT,
            custom_js TEXT,
            seo_title TEXT,
            seo_description TEXT,
            seo_keywords TEXT,
            status TEXT DEFAULT 'draft',
            created_at INTEGER,
            updated_at INTEGER
          )
        `),
        // Blog comments table
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS blog_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            blog_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            comment TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at INTEGER,
            FOREIGN KEY (blog_id) REFERENCES blogs(id)
          )
        `),
        // Forum questions table
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS forum_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            slug TEXT UNIQUE,
            content TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            reply_count INTEGER DEFAULT 0,
            created_at INTEGER,
            updated_at INTEGER
          )
        `),
        // Forum replies table
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS forum_replies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            content TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at INTEGER,
            FOREIGN KEY (question_id) REFERENCES forum_questions(id)
          )
        `),
        // Coupons table
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS coupons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            discount_type TEXT DEFAULT 'percentage',
            discount_value REAL NOT NULL,
            min_order_amount REAL DEFAULT 0,
            max_uses INTEGER DEFAULT 0,
            used_count INTEGER DEFAULT 0,
            valid_from INTEGER,
            valid_until INTEGER,
            product_ids TEXT,
            status TEXT DEFAULT 'active',
            created_at INTEGER
          )
        `),
        // API Keys table
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key_name TEXT NOT NULL,
            key_value TEXT UNIQUE NOT NULL,
            permissions TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            usage_count INTEGER DEFAULT 0,
            last_used_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME
          )
        `),
        // API Key usage logs table
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS api_key_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            api_key_id INTEGER NOT NULL,
            endpoint TEXT NOT NULL,
            method TEXT NOT NULL,
            status_code INTEGER,
            response_time_ms INTEGER,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
          )
        `),
        // Index for API key usage logs
        env.DB.prepare(`
          CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_id
          ON api_key_usage(api_key_id)
        `)
      ]);

      // Mark DB as ready as soon as the core CREATE TABLEs complete
      dbReady = true;
      console.log(`DB init completed in ${Date.now() - initStartTime}ms`);

      // Run migrations and page migrations asynchronously (background)
      if (!migrationsDone) {
        Promise.resolve().then(() => runMigrations(env).then(() => { migrationsDone = true; }).catch(() => { }));
      }

      if (!pagesMigrationDone) {
        Promise.resolve().then(() => runPagesMigration(env).then(() => { pagesMigrationDone = true; }).catch(() => { }));
      }
    } catch (e) {
      console.error('DB init error:', e);
      // Reset on error so next request can retry
      initPromise = null;
      initStartTime = 0;
    }
  })();

  return await initPromise;
}

/**
 * Warmup database - call this early in request lifecycle
 * Uses ctx.waitUntil to initialize without blocking
 * @param {Object} env - Environment bindings
 * @param {ExecutionContext} ctx - Execution context
 */
export function warmupDB(env, ctx) {
  if (dbReady || !env.DB) return;
  if (ctx && ctx.waitUntil) {
    ctx.waitUntil(initDB(env).catch(() => { }));
  }
}

/**
 * Run pages-specific migrations (ensures page_type and is_default exist)
 */
async function runPagesMigration(env) {
  const pagesMigrations = [
    { column: 'page_type', type: "TEXT DEFAULT 'custom'" },
    { column: 'is_default', type: 'INTEGER DEFAULT 0' }, { column: 'feature_image_url', type: 'TEXT' }
  ];

  for (const m of pagesMigrations) {
    try {
      await env.DB.prepare(`ALTER TABLE pages ADD COLUMN ${m.column} ${m.type}`).run();
      console.log(`Added pages.${m.column}`);
    } catch (e) {
      // Column already exists - this is expected
    }
  }
}

/**
 * Run migrations asynchronously (non-blocking)
 * These are legacy column additions for older databases
 * Optimized: Uses Promise.allSettled for parallel execution
 */
async function runMigrations(env) {
  const migrations = [
    { table: 'products', column: 'gallery_images', type: 'TEXT' },
    { table: 'products', column: 'featured', type: 'INTEGER DEFAULT 0' },
    { table: 'products', column: 'created_at', type: 'DATETIME' },
    { table: 'products', column: 'updated_at', type: 'DATETIME' },
    { table: 'orders', column: 'delivered_video_metadata', type: 'TEXT' },
    { table: 'orders', column: 'tip_paid', type: 'INTEGER DEFAULT 0' },
    { table: 'orders', column: 'tip_amount', type: 'REAL' },
    { table: 'reviews', column: 'delivered_video_url', type: 'TEXT' },
    { table: 'reviews', column: 'delivered_thumbnail_url', type: 'TEXT' },
    { table: 'chat_sessions', column: 'blocked', type: 'INTEGER DEFAULT 0' },
    { table: 'chat_sessions', column: 'last_message_content', type: 'TEXT' },
    { table: 'chat_sessions', column: 'last_message_at', type: 'DATETIME' },
    { table: 'checkout_sessions', column: 'metadata', type: 'TEXT' },
    { table: 'orders', column: 'revision_reason', type: 'TEXT' }
  ];

  // Run all migrations in parallel - most will fail silently (column exists)
  await Promise.allSettled(
    migrations.map(m =>
      env.DB.prepare(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type}`).run().catch(() => { })
    )
  );

  try {
    await env.DB.prepare(`
      UPDATE products
      SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP)
      WHERE created_at IS NULL
    `).run();
  } catch (_) {}

  try {
    await env.DB.prepare(`
      UPDATE products
      SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
      WHERE updated_at IS NULL
    `).run();
  } catch (_) {}

  clearProductTableColumnsCache();
}

/**
 * Check if database is initialized
 * @returns {boolean}
 */
export function isDBReady() {
  return dbReady;
}

/**
 * Reset the database ready flag (for testing)
 */
export function resetDBReady() {
  dbReady = false;
  initPromise = null;
}
