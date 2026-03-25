const PUBLIC_PRODUCT_COLUMN_CACHE_TTL_MS = 60 * 1000;
const PUBLIC_PRODUCT_STATUSES = Object.freeze(['active', 'published', 'live', 'public']);

let productColumnsCache = null;
let productColumnsCacheTime = 0;

export function buildPublicProductStatusWhere(columnRef = 'status') {
  const column = String(columnRef || 'status').trim() || 'status';
  const visibleStatuses = PUBLIC_PRODUCT_STATUSES.map((status) => `'${status}'`).join(', ');
  return `(${column} IS NULL OR TRIM(${column}) = '' OR LOWER(TRIM(${column})) IN (${visibleStatuses}))`;
}

export async function getProductTableColumns(env) {
  if (!env?.DB) return new Set();

  const now = Date.now();
  if (productColumnsCache && (now - productColumnsCacheTime) < PUBLIC_PRODUCT_COLUMN_CACHE_TTL_MS) {
    return new Set(productColumnsCache);
  }

  try {
    const result = await env.DB.prepare('PRAGMA table_info(products)').all();
    const cols = new Set(
      (result.results || [])
        .map((row) => String(row.name || '').trim().toLowerCase())
        .filter(Boolean)
    );

    productColumnsCache = Array.from(cols);
    productColumnsCacheTime = now;
    return cols;
  } catch (_) {
    return new Set(productColumnsCache || []);
  }
}

export function clearProductTableColumnsCache() {
  productColumnsCache = null;
  productColumnsCacheTime = 0;
}
