/**
 * Order Decoder Module
 * Consolidated order data parsing utilities
 * Eliminates 15+ order data parsing patterns
 */

import { safeJsonParse } from './json-helpers.js';

export function decodeOrderData(encryptedData) {
  if (!encryptedData) {
    return getEmptyOrderData();
  }

  if (typeof encryptedData === 'object') {
    return { ...getEmptyOrderData(), ...encryptedData };
  }

  const trimmed = String(encryptedData).trim();
  
  if (!trimmed) {
    return getEmptyOrderData();
  }

  try {
    const parsed = JSON.parse(trimmed);
    return { ...getEmptyOrderData(), ...parsed };
  } catch (e) {
    console.warn('Failed to parse order data:', e.message);
    return getEmptyOrderData();
  }
}

export function getEmptyOrderData() {
  return {
    name: '',
    email: '',
    buyerEmail: '',
    buyerName: '',
    whatsapp: '',
    phone: '',
    message: '',
    addonSelections: {},
    addons: [],
    notes: '',
    customFields: {}
  };
}

export function parseOrderEncryptedData(raw) {
  if (!raw) return getEmptyOrderData();
  
  const trimmed = String(raw).trim();
  if (!trimmed) return getEmptyOrderData();

  if (trimmed.startsWith('{')) {
    return decodeOrderData(trimmed);
  }

  return getEmptyOrderData();
}

export function encodeOrderData(data) {
  if (!data || typeof data !== 'object') {
    return JSON.stringify(getEmptyOrderData());
  }

  const sanitized = {
    name: String(data.name || data.buyerName || '').trim(),
    email: String(data.email || data.buyerEmail || '').trim().toLowerCase(),
    buyerEmail: String(data.email || data.buyerEmail || '').trim().toLowerCase(),
    buyerName: String(data.name || data.buyerName || '').trim(),
    whatsapp: String(data.whatsapp || data.phone || '').trim(),
    phone: String(data.phone || data.whatsapp || '').trim(),
    message: String(data.message || data.notes || '').trim(),
    addonSelections: data.addonSelections || {},
    addons: Array.isArray(data.addons) ? data.addons : [],
    notes: String(data.notes || data.message || '').trim(),
    customFields: data.customFields || {}
  };

  return JSON.stringify(sanitized);
}

export function extractBuyerInfo(orderData) {
  const decoded = decodeOrderData(orderData);
  
  return {
    name: decoded.name || decoded.buyerName || 'Customer',
    email: decoded.email || decoded.buyerEmail || '',
    whatsapp: decoded.whatsapp || decoded.phone || '',
    message: decoded.message || decoded.notes || ''
  };
}

export function extractBuyerEmail(orderData) {
  const decoded = decodeOrderData(orderData);
  return (decoded.email || decoded.buyerEmail || '').toLowerCase().trim();
}

export function extractBuyerName(orderData) {
  const decoded = decodeOrderData(orderData);
  return decoded.name || decoded.buyerName || 'Customer';
}

export function hasBuyerEmail(orderData) {
  const email = extractBuyerEmail(orderData);
  return !!email && email.includes('@');
}

export function getOrderAddons(orderData) {
  const decoded = decodeOrderData(orderData);
  return decoded.addons || decoded.addonSelections || [];
}

export function getOrderMessage(orderData) {
  const decoded = decodeOrderData(orderData);
  return decoded.message || decoded.notes || '';
}

export function formatOrderDataForDisplay(orderData) {
  const decoded = decodeOrderData(orderData);
  
  const parts = [];
  
  if (decoded.name) parts.push(`Name: ${decoded.name}`);
  if (decoded.email) parts.push(`Email: ${decoded.email}`);
  if (decoded.whatsapp) parts.push(`WhatsApp: ${decoded.whatsapp}`);
  if (decoded.message) parts.push(`Message: ${decoded.message}`);
  
  const addons = getOrderAddons(orderData);
  if (addons.length > 0) {
    parts.push(`Add-ons: ${addons.length}`);
  }
  
  return parts.join('\n');
}
