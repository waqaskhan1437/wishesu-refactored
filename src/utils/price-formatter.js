/**
 * Price Formatting Utilities
 * Consolidated price formatting functions
 */

export function formatPriceForSsr(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0';
  const hasFraction = Math.abs(amount - Math.round(amount)) > 0.0001;
  if (hasFraction) {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  return amount.toLocaleString('en-US');
}

export function formatPrice(value, currency = 'USD') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount);
}

export function calculateDiscount(originalPrice, salePrice) {
  const original = Number(originalPrice);
  const sale = Number(salePrice);
  if (!Number.isFinite(original) || !Number.isFinite(sale) || original <= 0) return 0;
  return Math.round(((original - sale) / original) * 100);
}
