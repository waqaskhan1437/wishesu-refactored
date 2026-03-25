/**
 * Fetch with timeout and retry utility
 * Prevents connection reset errors on external API calls
 */

/**
 * Fetch with timeout - prevents hanging requests
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds (default 10000)
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch with timeout and retry logic
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {Object} config - Configuration
 * @param {number} config.timeoutMs - Timeout per request (default 10000)
 * @param {number} config.retries - Number of retries (default 2)
 * @param {number} config.retryDelayMs - Delay between retries (default 500)
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options = {}, config = {}) {
  const { timeoutMs = 10000, retries = 2, retryDelayMs = 500 } = config;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, options, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

/**
 * Safe JSON fetch with timeout - returns null on failure instead of throwing
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Object|null>}
 */
export async function safeFetchJson(url, options = {}, timeoutMs = 8000) {
  try {
    const response = await fetchWithTimeout(url, options, timeoutMs);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
