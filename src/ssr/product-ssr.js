/**
 * Product SSR - Delivery & Pricing
 * Product-specific SSR rendering functions
 */

import { formatPriceForSsr } from '../utils/price-formatter.js';
import { escapeHtmlText } from '../utils/html-entities.js';

export function getDeliveryTextFromInstantDaysForSsr(isInstant, days) {
  if (isInstant) return 'Instant Delivery In 60 Minutes';
  const dayNum = parseInt(days, 10) || 1;
  if (dayNum === 1) return '24 Hour Express Delivery';
  return `${dayNum} Days Delivery`;
}

export function computeInitialDeliveryLabelForSsr(product, addonGroups) {
  const deliveryField = (addonGroups || []).find((g) => (
    g &&
    g.id === 'delivery-time' &&
    (g.type === 'radio' || g.type === 'select') &&
    Array.isArray(g.options)
  ));

  if (deliveryField) {
    const defaultOption = deliveryField.options.find((o) => o && o.default) || deliveryField.options[0];
    if (defaultOption) {
      if (defaultOption.delivery && typeof defaultOption.delivery === 'object') {
        return getDeliveryTextFromInstantDaysForSsr(
          !!defaultOption.delivery.instant,
          parseInt(defaultOption.delivery.days, 10) || 1
        );
      }
      if (defaultOption.label) return String(defaultOption.label);
    }
  }

  return getDeliveryTextFromInstantDaysForSsr(
    !!product?.instant_delivery,
    parseInt(product?.delivery_time_days, 10) || parseInt(product?.normal_delivery_text, 10) || 1
  );
}

export function computeDeliveryBadgeForSsr(label) {
  const raw = String(label || '');
  const v = raw.toLowerCase();

  if (v.includes('instant') || v.includes('60') || v.includes('1 hour')) {
    return { icon: '&#9889;', text: raw || 'Instant Delivery In 60 Minutes' };
  }
  if (v.includes('24') || v.includes('express') || v.includes('1 day') || v.includes('24 hour')) {
    return { icon: '&#128640;', text: raw || '24 Hour Express Delivery' };
  }
  if (v.includes('48') || v.includes('2 day')) {
    return { icon: '&#128230;', text: raw || '2 Days Delivery' };
  }
  if (v.includes('3 day') || v.includes('72')) {
    return { icon: '&#128197;', text: raw || '3 Days Delivery' };
  }
  const daysMatch = v.match(/(\d+)\s*day/i);
  if (daysMatch) {
    const numDays = parseInt(daysMatch[1], 10) || 2;
    return { icon: '&#128230;', text: raw || `${numDays} Days Delivery` };
  }
  return { icon: '&#128666;', text: raw || '2 Days Delivery' };
}

export function sanitizeAddonIdForSsr(raw, fallback = 'addon') {
  const source = String(raw || '').trim() || String(fallback || 'addon');
  const normalized = source
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || String(fallback || 'addon');
}

export function parseAddonGroupsForSsr(addonsInput) {
  if (Array.isArray(addonsInput)) return addonsInput;
  const s = String(addonsInput || '').trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}
