/**
 * Settings Helper Module
 * Consolidated settings fetch/save functions
 * Eliminates 33+ duplicate settings queries
 */

import { safeJsonParse } from './json-helpers.js';
import { initDB } from '../config/db.js';

const SETTINGS_CACHE_TTL = 30 * 1000;
const settingsCache = new Map();

function getCacheKey(key) {
  return `settings_${key}`;
}

function getFromCache(key) {
  const cached = settingsCache.get(getCacheKey(key));
  if (cached && Date.now() - cached.timestamp < SETTINGS_CACHE_TTL) {
    return cached.value;
  }
  settingsCache.delete(getCacheKey(key));
  return null;
}

function setCache(key, value) {
  settingsCache.set(getCacheKey(key), {
    value,
    timestamp: Date.now()
  });
}

export function clearSettingsCache(key = null) {
  if (key) {
    settingsCache.delete(getCacheKey(key));
  } else {
    settingsCache.clear();
  }
}

export async function getSetting(env, key, options = {}) {
  const { useCache = true, forceRefresh = false } = options;
  
  if (!env?.DB) return null;
  
  if (useCache && !forceRefresh) {
    const cached = getFromCache(key);
    if (cached !== null) return cached;
  }

  try {
    await initDB(env);
    const row = await env.DB.prepare(
      'SELECT value FROM settings WHERE key = ?'
    ).bind(key).first();

    if (!row || !row.value) {
      setCache(key, null);
      return null;
    }

    const value = safeJsonParse(row.value, row.value);
    setCache(key, value);
    return value;
  } catch (e) {
    console.error(`Failed to get setting "${key}":`, e.message);
    return null;
  }
}

export async function getSettings(env, keys = [], options = {}) {
  if (!env?.DB || keys.length === 0) return {};
  
  const { useCache = true } = options;
  const result = {};
  const keysToFetch = [];

  if (useCache) {
    for (const key of keys) {
      const cached = getFromCache(key);
      if (cached !== null) {
        result[key] = cached;
      } else {
        keysToFetch.push(key);
      }
    }
  } else {
    keysToFetch.push(...keys);
  }

  if (keysToFetch.length > 0) {
    try {
      await initDB(env);
      const placeholders = keysToFetch.map(() => '?').join(',');
      const rows = await env.DB.prepare(
        `SELECT key, value FROM settings WHERE key IN (${placeholders})`
      ).bind(...keysToFetch).all();

      for (const row of (rows.results || [])) {
        const value = safeJsonParse(row.value, row.value);
        result[row.key] = value;
        setCache(row.key, value);
      }

      for (const key of keysToFetch) {
        if (!(key in result)) {
          result[key] = null;
          setCache(key, null);
        }
      }
    } catch (e) {
      console.error('Failed to batch get settings:', e.message);
    }
  }

  return result;
}

export async function saveSetting(env, key, value, options = {}) {
  if (!env?.DB) return false;

  const { clearCache = true } = options;

  try {
    await initDB(env);
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    
    const existing = await env.DB.prepare(
      'SELECT id FROM settings WHERE key = ?'
    ).bind(key).first();

    if (existing) {
      await env.DB.prepare(
        'UPDATE settings SET value = ?, updated_at = ? WHERE key = ?'
      ).bind(stringValue, Date.now(), key).run();
    } else {
      await env.DB.prepare(
        'INSERT INTO settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)'
      ).bind(key, stringValue, Date.now(), Date.now()).run();
    }

    if (clearCache) {
      clearSettingsCache(key);
    }

    return true;
  } catch (e) {
    console.error(`Failed to save setting "${key}":`, e.message);
    return false;
  }
}

export async function deleteSetting(env, key) {
  if (!env?.DB) return false;

  try {
    await initDB(env);
    await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
    clearSettingsCache(key);
    return true;
  } catch (e) {
    console.error(`Failed to delete setting "${key}":`, e.message);
    return false;
  }
}

export async function getSettingOrDefault(env, key, defaultValue = null) {
  const value = await getSetting(env, key);
  return value !== null ? value : defaultValue;
}
