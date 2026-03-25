/**
 * Pricing utilities - Shared functions for price calculations
 * Consolidated from orders.js and whop.js to avoid code duplication
 */

/**
 * Calculate addon prices from product's addon configuration
 * Returns total addon price based on selected values
 * 
 * @param {string|Object} productAddonsJson - Product addon configuration (JSON string or object)
 * @param {Array} selectedAddons - Array of selected addons with {field, value}
 * @returns {number} Total addon price
 */
export function calculateAddonPrice(productAddonsJson, selectedAddons) {
  if (!productAddonsJson || !selectedAddons || !Array.isArray(selectedAddons)) {
    return 0;
  }

  let totalAddonPrice = 0;

  try {
    // Parse product addon configuration
    const addonConfig = typeof productAddonsJson === 'string'
      ? JSON.parse(productAddonsJson)
      : productAddonsJson;

    if (!Array.isArray(addonConfig)) return 0;

    // Create a lookup map for addon fields and their options
    // Map by field name, label, and ID for maximum compatibility
    const addonMap = {};
    addonConfig.forEach(addon => {
      if (addon.field) addonMap[addon.field.toLowerCase().trim()] = addon;
      if (addon.label) addonMap[addon.label.toLowerCase().trim()] = addon;
      if (addon.id) addonMap[addon.id.toLowerCase().trim()] = addon;
    });

    // Calculate price for each selected addon
    selectedAddons.forEach(selected => {
      const fieldName = (selected.field || '').toLowerCase().trim();
      const fieldId = fieldName.replace(/[^a-z0-9]+/g, '-');
      
      // Try to find addon definition by field name, ID, or normalized ID
      const addonDef = addonMap[fieldName] || addonMap[fieldId] || 
                       Object.values(addonMap).find(a => 
                         (a.id && a.id.toLowerCase() === fieldId) || 
                         (a.field && a.field.toLowerCase() === fieldName)
                       );

      if (addonDef && addonDef.options && Array.isArray(addonDef.options)) {
        // Support multiple values (for checkboxes)
        const rawValue = (selected.value || '').trim();
        const selectedValues = rawValue.includes(',') 
          ? rawValue.split(',').map(v => v.trim().toLowerCase())
          : [rawValue.toLowerCase()];

        selectedValues.forEach(val => {
          const option = addonDef.options.find(opt => {
            const optLabel = (opt.label || '').toLowerCase().trim();
            const optValue = (opt.value || '').toLowerCase().trim();
            return optLabel === val || optValue === val || 
                   optLabel.replace(/[^a-z0-9]+/g, '-') === val.replace(/[^a-z0-9]+/g, '-');
          });

          if (option && option.price) {
            totalAddonPrice += Number(option.price) || 0;
          }
        });
      }
    });
  } catch (e) {
    console.error('Failed to calculate addon price:', e);
  }

  return totalAddonPrice;
}

/**
 * Calculate final price server-side from product and addons
 * SECURITY: This prevents price manipulation from client side
 * 
 * @param {Object} env - Environment with DB binding
 * @param {number|string} productId - Product ID
 * @param {Array} selectedAddons - Array of selected addons
 * @param {string} couponCode - Optional coupon code
 * @returns {Promise<number>} Final calculated price
 */
export async function calculateServerSidePrice(env, productId, selectedAddons, couponCode) {
  // Get product from database
  const product = await env.DB.prepare(
    'SELECT normal_price, sale_price, addons_json FROM products WHERE id = ?'
  ).bind(Number(productId)).first();

  if (!product) {
    throw new Error('Product not found');
  }

  // Calculate base price
  const basePrice = (product.sale_price !== null && product.sale_price !== undefined && product.sale_price !== '')
    ? Number(product.sale_price)
    : Number(product.normal_price);

  if (isNaN(basePrice) || basePrice < 0) {
    throw new Error('Invalid product price');
  }

  // Calculate addon prices from product configuration
  const addonPrice = calculateAddonPrice(product.addons_json, selectedAddons);

  let finalPrice = basePrice + addonPrice;

  // Apply coupon if provided
  if (couponCode) {
    try {
      const coupon = await env.DB.prepare(
        'SELECT discount_type, discount_value, min_order_amount FROM coupons WHERE code = ? AND status = ?'
      ).bind(couponCode.toUpperCase(), 'active').first();

      if (coupon) {
        const minAmount = Number(coupon.min_order_amount) || 0;
        if (finalPrice >= minAmount) {
          if (coupon.discount_type === 'percentage') {
            const discount = (finalPrice * Number(coupon.discount_value)) / 100;
            finalPrice = Math.max(0, finalPrice - discount);
          } else if (coupon.discount_type === 'fixed') {
            finalPrice = Math.max(0, finalPrice - Number(coupon.discount_value));
          }
        }
      }
    } catch (e) {
      console.error('Coupon validation failed:', e);
    }
  }

  // Round to 2 decimal places
  return Math.round(finalPrice * 100) / 100;
}
