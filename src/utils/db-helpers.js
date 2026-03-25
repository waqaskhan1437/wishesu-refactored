/**
 * Database Helper Module
 * Consolidated database query functions
 * Eliminates 31+ COUNT queries and standardizes DB access
 */

import { initDB } from '../config/db.js';

export async function queryOne(env, sql, bindings = []) {
  if (!env?.DB) return null;
  try {
    await initDB(env);
    return await env.DB.prepare(sql).bind(...bindings).first();
  } catch (e) {
    console.error('DB queryOne error:', e.message);
    return null;
  }
}

export async function queryAll(env, sql, bindings = []) {
  if (!env?.DB) return [];
  try {
    await initDB(env);
    const result = await env.DB.prepare(sql).bind(...bindings).all();
    return result.results || [];
  } catch (e) {
    console.error('DB queryAll error:', e.message);
    return [];
  }
}

export async function runQuery(env, sql, bindings = []) {
  if (!env?.DB) return { success: false };
  try {
    await initDB(env);
    const result = await env.DB.prepare(sql).bind(...bindings).run();
    return { success: true, result };
  } catch (e) {
    console.error('DB runQuery error:', e.message);
    return { success: false, error: e.message };
  }
}

export async function countRows(env, table, whereClause = '', bindings = []) {
  const sql = whereClause 
    ? `SELECT COUNT(*) as count FROM ${table} ${whereClause}`
    : `SELECT COUNT(*) as count FROM ${table}`;
  const result = await queryOne(env, sql, bindings);
  return result?.count || 0;
}

export async function exists(env, table, whereClause, bindings = []) {
  const sql = `SELECT 1 as exists FROM ${table} ${whereClause} LIMIT 1`;
  const result = await queryOne(env, sql, bindings);
  return !!result;
}

export async function insertRow(env, table, data) {
  if (!env?.DB || !data || typeof data !== 'object') return { success: false };
  
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map(() => '?').join(', ');
  const columns = keys.join(', ');
  
  const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
  
  try {
    await initDB(env);
    const result = await env.DB.prepare(sql).bind(...values).run();
    return { success: true, id: result.lastInsertRowid };
  } catch (e) {
    console.error('DB insertRow error:', e.message);
    return { success: false, error: e.message };
  }
}

export async function updateRow(env, table, id, data, idColumn = 'id') {
  if (!env?.DB || !data || typeof data !== 'object') return { success: false };
  
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  
  const sql = `UPDATE ${table} SET ${setClause} WHERE ${idColumn} = ?`;
  
  try {
    await initDB(env);
    const result = await env.DB.prepare(sql).bind(...values, id).run();
    return { success: true, changes: result.changes };
  } catch (e) {
    console.error('DB updateRow error:', e.message);
    return { success: false, error: e.message };
  }
}

export async function deleteRow(env, table, id, idColumn = 'id') {
  if (!env?.DB) return { success: false };
  
  const sql = `DELETE FROM ${table} WHERE ${idColumn} = ?`;
  
  try {
    await initDB(env);
    const result = await env.DB.prepare(sql).bind(id).run();
    return { success: true, changes: result.changes };
  } catch (e) {
    console.error('DB deleteRow error:', e.message);
    return { success: false, error: e.message };
  }
}

export async function upsertRow(env, table, data, uniqueKeys = []) {
  if (!env?.DB || !data || typeof data !== 'object') return { success: false };
  
  const keys = Object.keys(data);
  const values = Object.values(data);
  
  if (uniqueKeys.length === 0) {
    return insertRow(env, table, data);
  }
  
  const whereClause = uniqueKeys.map(k => `${k} = ?`).join(' AND ');
  const whereValues = uniqueKeys.map(k => data[k]);
  const existing = await queryOne(env, `SELECT id FROM ${table} WHERE ${whereClause}`, whereValues);
  
  if (existing) {
    return updateRow(env, table, existing.id, data);
  }
  
  return insertRow(env, table, data);
}

export async function batchInsert(env, table, rows) {
  if (!env?.DB || !Array.isArray(rows) || rows.length === 0) {
    return { success: false, inserted: 0 };
  }
  
  const keys = Object.keys(rows[0]);
  const placeholders = keys.map(() => '?').join(', ');
  const columns = keys.join(', ');
  const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
  
  try {
    await initDB(env);
    let inserted = 0;
    
    for (const row of rows) {
      const values = keys.map(k => row[k]);
      await env.DB.prepare(sql).bind(...values).run();
      inserted++;
    }
    
    return { success: true, inserted };
  } catch (e) {
    console.error('DB batchInsert error:', e.message);
    return { success: false, error: e.message };
  }
}

export async function getTableColumns(env, table) {
  const sql = `PRAGMA table_info(${table})`;
  const columns = await queryAll(env, sql);
  return columns.map(c => c.name);
}

export async function tableExists(env, table) {
  const sql = `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`;
  const result = await queryOne(env, sql, [table]);
  return !!result;
}

export async function createTable(env, tableName, columns) {
  const colDefs = Object.entries(columns)
    .map(([name, type]) => `${name} ${type}`)
    .join(', ');
  
  const sql = `CREATE TABLE IF NOT EXISTS ${tableName} (${colDefs})`;
  return runQuery(env, sql);
}
