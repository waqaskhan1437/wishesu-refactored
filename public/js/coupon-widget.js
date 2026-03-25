/**
 * Coupon Widget for Product Page
 * Shows coupon input field above checkout button when coupons are enabled
 * Supports live discount recalculation when addons change
 */

(function() {
  let couponsEnabled = false;
  let appliedCoupon = null;
  let originalPrice = 0;
  let discountedPrice = 0;
  let couponDiscountType = null;
  let couponDiscountValue = 0;
  
  // Initialize coupon widget
  async function initCouponWidget() {
    // IMPORTANT: Clear any stale coupon data from session storage on fresh page load
    // This prevents old discounts from being applied accidentally
    sessionStorage.removeItem('appliedCoupon');
    
    try {
      // Check if coupons are enabled
      const res = await fetch('/api/coupons/enabled');
      if (!res.ok) {
        console.log('Coupons not available');
        return;
      }
      const data = await res.json();
      couponsEnabled = data.enabled || false;
      
      if (!couponsEnabled) return;
      
      // Wait for checkout section to be ready
      waitForCheckout();
      
      // Setup live price update hook
      setupPriceUpdateHook();
    } catch (e) {
      console.log('Coupon widget disabled:', e.message);
    }
  }
  
  // Setup hook for when price changes (addons selected)
  function setupPriceUpdateHook() {
    // Expose recalculate function globally
    window.recalculateCouponDiscount = function(newTotal) {
      if (appliedCoupon && couponDiscountType) {
        recalculateDiscount(newTotal);
      }
    };
    
    // Override or chain to the updateCheckoutPrice function
    const originalUpdateCheckoutPrice = window.updateCheckoutPrice;
    
    window.updateCheckoutPrice = function(newTotal) {
      // Call original if exists
      if (typeof originalUpdateCheckoutPrice === 'function') {
        originalUpdateCheckoutPrice(newTotal);
      }
      
      // Recalculate coupon discount if applied
      if (appliedCoupon && couponDiscountType) {
        recalculateDiscount(newTotal);
      }
    };
    
    // Listen to addon form changes with multiple selectors
    const setupFormListeners = () => {
      // Try multiple form selectors
      const forms = document.querySelectorAll('#addons-form, .addons-form, form[data-addons]');
      forms.forEach(form => {
        if (!form.dataset.couponListener) {
          form.dataset.couponListener = 'true';
          form.addEventListener('change', handleAddonChange);
        }
      });
      
      // Also listen to individual inputs/selects
      const inputs = document.querySelectorAll('input.addon-checkbox, input.addon-radio, select.form-select');
      inputs.forEach(input => {
        if (!input.dataset.couponListener) {
          input.dataset.couponListener = 'true';
          input.addEventListener('change', handleAddonChange);
        }
      });
    };
    
    // Run immediately and again after a delay
    setupFormListeners();
    setTimeout(setupFormListeners, 1000);
    setTimeout(setupFormListeners, 2000);
  }
  
  // Handle addon change event
  function handleAddonChange() {
    // Small delay to let updateTotal() run first and update window.currentTotal
    setTimeout(() => {
      if (appliedCoupon && couponDiscountType && window.currentTotal) {
        recalculateDiscount(window.currentTotal);
      }
    }, 100);
  }
  
  // Recalculate discount when total changes
  function recalculateDiscount(newTotal) {
    if (!appliedCoupon || !couponDiscountType) return;
    if (!newTotal || newTotal <= 0) return;
    
    originalPrice = newTotal;
    let discount = 0;
    
    if (couponDiscountType === 'percentage') {
      discount = (newTotal * couponDiscountValue) / 100;
      discountedPrice = newTotal - discount;
    } else if (couponDiscountType === 'fixed') {
      discount = Math.min(couponDiscountValue, newTotal);
      discountedPrice = newTotal - discount;
    }
    
    // Ensure price doesn't go below 0
    discountedPrice = Math.max(0, discountedPrice);
    discount = Math.round(discount * 100) / 100;
    discountedPrice = Math.round(discountedPrice * 100) / 100;
    
    // Update UI
    const messageEl = document.getElementById('coupon-message');
    const discountEl = document.getElementById('coupon-discount-info');
    
    if (messageEl) {
      messageEl.innerHTML = `
        <div class="coupon-applied">
          <span>✅ Coupon "${appliedCoupon.code}" applied! You save $${discount.toFixed(2)}</span>
          <button type="button" class="remove-coupon" onclick="window.removeCoupon()">Remove</button>
        </div>
      `;
      messageEl.className = 'coupon-message coupon-success';
      messageEl.style.display = 'block';
    }
    
    if (discountEl) {
      discountEl.innerHTML = `
        <div class="discount-info">
          <span>Original: <span class="original-price">$${originalPrice.toFixed(2)}</span></span>
          <span>New Price: <span class="discounted-price">$${discountedPrice.toFixed(2)}</span></span>
        </div>
      `;
      discountEl.style.display = 'block';
    }
    
    // Update buttons
    updateCheckoutButton(discountedPrice, discount);
    
    // Update session storage
    sessionStorage.setItem('appliedCoupon', JSON.stringify({
      id: appliedCoupon.id,
      code: appliedCoupon.code,
      discount: discount,
      discounted_price: discountedPrice,
      discount_type: couponDiscountType,
      discount_value: couponDiscountValue
    }));
  }
  
  // Wait for checkout section to exist
  function waitForCheckout() {
    // Look for button container first (both Pay + Checkout buttons)
    const btnContainer = document.querySelector('#apple-pay-btn')?.parentElement;
    const checkoutBtn = document.querySelector('.checkout-btn, #checkout-btn, [data-checkout-btn], .buy-now-btn');
    
    if (btnContainer || checkoutBtn) {
      injectCouponWidget(btnContainer || checkoutBtn);
    } else {
      // Retry after DOM updates
      setTimeout(waitForCheckout, 500);
    }
  }
  
  // Inject coupon widget HTML
  function injectCouponWidget(targetElement) {
    // Don't inject twice
    if (document.getElementById('coupon-widget')) return;
    
    const widget = document.createElement('div');
    widget.id = 'coupon-widget';
    widget.innerHTML = `
      <style>
        #coupon-widget {
          margin-bottom: 15px;
          padding: 15px;
          background: linear-gradient(135deg, #f5f3ff, #ede9fe);
          border-radius: 12px;
          border: 1px solid #c4b5fd;
        }
        #coupon-widget .coupon-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
          font-weight: 600;
          color: #6d28d9;
        }
        #coupon-widget .coupon-input-row {
          display: flex;
          gap: 8px;
        }
        #coupon-widget input {
          flex: 1;
          padding: 12px 15px;
          border: 2px solid #c4b5fd;
          border-radius: 8px;
          font-size: 1em;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        #coupon-widget input:focus {
          outline: none;
          border-color: #8b5cf6;
        }
        #coupon-widget .apply-btn {
          padding: 12px 20px;
          background: #8b5cf6;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }
        #coupon-widget .apply-btn:hover {
          background: #7c3aed;
        }
        #coupon-widget .apply-btn:disabled {
          background: #a78bfa;
          cursor: not-allowed;
        }
        #coupon-widget .coupon-message {
          margin-top: 10px;
          padding: 10px;
          border-radius: 8px;
          font-size: 0.9em;
        }
        #coupon-widget .coupon-success {
          background: #d1fae5;
          color: #065f46;
          border: 1px solid #6ee7b7;
        }
        #coupon-widget .coupon-error {
          background: #fee2e2;
          color: #991b1b;
          border: 1px solid #fca5a5;
        }
        #coupon-widget .coupon-applied {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        #coupon-widget .remove-coupon {
          background: none;
          border: none;
          color: #991b1b;
          cursor: pointer;
          font-size: 0.9em;
          text-decoration: underline;
        }
        #coupon-widget .discount-info {
          margin-top: 10px;
          padding: 10px;
          background: white;
          border-radius: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        #coupon-widget .original-price {
          text-decoration: line-through;
          color: #9ca3af;
        }
        #coupon-widget .discounted-price {
          font-weight: bold;
          color: #16a34a;
          font-size: 1.2em;
        }
      </style>
      
      <div class="coupon-header">
        <span>🎟️</span>
        <span>Have a coupon code?</span>
      </div>
      
      <div id="coupon-input-section">
        <div class="coupon-input-row">
          <input type="text" id="coupon-code-input" placeholder="Enter code" maxlength="20">
          <button type="button" class="apply-btn" id="apply-coupon-btn">Apply</button>
        </div>
      </div>
      
      <div id="coupon-message" style="display: none;"></div>
      <div id="coupon-discount-info" style="display: none;"></div>
    `;
    
    // Find the buttons container (holds both Pay and Checkout buttons)
    // Insert coupon widget BEFORE the button container
    const applePayBtn = document.getElementById('apple-pay-btn');
    const checkoutBtn = document.getElementById('checkout-btn');
    
    if (applePayBtn && applePayBtn.parentElement) {
      // Both buttons exist - insert before their container
      const btnContainer = applePayBtn.parentElement;
      btnContainer.parentElement.insertBefore(widget, btnContainer);
    } else if (checkoutBtn) {
      // Single checkout button - insert before it
      checkoutBtn.parentElement.insertBefore(widget, checkoutBtn);
    } else if (targetElement) {
      // Fallback - insert before target
      targetElement.parentElement.insertBefore(widget, targetElement);
    }
    
    // Setup event listeners
    setupCouponEvents();
  }
  
  // Setup coupon event listeners
  function setupCouponEvents() {
    const input = document.getElementById('coupon-code-input');
    const applyBtn = document.getElementById('apply-coupon-btn');
    
    applyBtn.addEventListener('click', applyCoupon);
    
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyCoupon();
      }
    });
  }
  
  // Apply coupon
  async function applyCoupon() {
    const input = document.getElementById('coupon-code-input');
    const applyBtn = document.getElementById('apply-coupon-btn');
    const messageEl = document.getElementById('coupon-message');
    const discountEl = document.getElementById('coupon-discount-info');
    
    const code = input.value.trim();
    if (!code) {
      showMessage('Please enter a coupon code', 'error');
      return;
    }
    
    // Get current price from window.currentTotal (set by checkout.js) or window.basePrice
    if (window.currentTotal && window.currentTotal > 0) {
      originalPrice = window.currentTotal;
    } else if (window.basePrice && window.basePrice > 0) {
      originalPrice = window.basePrice;
    } else {
      // Fallback: try to get from DOM
      const priceEl = document.querySelector('[data-product-price], .product-price, .price-value, #product-price, .sale-price, .normal-price');
      if (priceEl) {
        const priceText = priceEl.textContent || priceEl.dataset.price || '';
        originalPrice = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
      }
    }
    
    // If still no price, try checkout button text
    if (!originalPrice || originalPrice <= 0) {
      const checkoutBtn = document.getElementById('checkout-btn');
      if (checkoutBtn) {
        const btnText = checkoutBtn.textContent || '';
        const priceMatch = btnText.match(/[\$€]?([\d,.]+)/);
        if (priceMatch) {
          originalPrice = parseFloat(priceMatch[1].replace(',', '')) || 0;
        }
      }
    }
    
    if (!originalPrice || originalPrice <= 0) {
      showMessage('Could not determine product price', 'error');
      return;
    }
    
    // Get product ID
    const productId = getProductId();
    
    applyBtn.disabled = true;
    applyBtn.textContent = '...';
    
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          product_id: productId,
          order_amount: originalPrice
        })
      });
      
      const data = await res.json();
      
      if (data.valid) {
        appliedCoupon = data.coupon;
        discountedPrice = data.discounted_price;
        
        // Store discount type and value for live recalculation
        couponDiscountType = data.coupon.discount_type;
        couponDiscountValue = data.coupon.discount_value;
        
        // Show success (USD)
        showMessage(`✅ Coupon "${data.coupon.code}" applied! You save $${data.discount.toFixed(2)}`, 'success', true);
        
        // Show discount info (USD)
        discountEl.innerHTML = `
          <div class="discount-info">
            <span>Original: <span class="original-price">$${originalPrice.toFixed(2)}</span></span>
            <span>New Price: <span class="discounted-price">$${discountedPrice.toFixed(2)}</span></span>
          </div>
        `;
        discountEl.style.display = 'block';
        
        // Update checkout button
        updateCheckoutButton(discountedPrice, data.discount);
        
        // Hide input, show applied state
        document.getElementById('coupon-input-section').style.display = 'none';
        
        // Store in session for checkout
        sessionStorage.setItem('appliedCoupon', JSON.stringify({
          id: data.coupon.id,
          code: data.coupon.code,
          discount: data.discount,
          discounted_price: discountedPrice,
          discount_type: couponDiscountType,
          discount_value: couponDiscountValue
        }));
        
      } else {
        showMessage('❌ ' + data.error, 'error');
        appliedCoupon = null;
      }
    } catch (err) {
      showMessage('❌ Failed to validate coupon', 'error');
    }
    
    applyBtn.disabled = false;
    applyBtn.textContent = 'Apply';
  }
  
  // Show message
  function showMessage(text, type, showRemove = false) {
    const messageEl = document.getElementById('coupon-message');
    messageEl.className = 'coupon-message coupon-' + type;
    
    if (showRemove) {
      messageEl.innerHTML = `
        <div class="coupon-applied">
          <span>${text}</span>
          <button type="button" class="remove-coupon" onclick="window.removeCoupon()">Remove</button>
        </div>
      `;
    } else {
      messageEl.textContent = text;
    }
    
    messageEl.style.display = 'block';
  }
  
  // Remove coupon
  window.removeCoupon = function() {
    appliedCoupon = null;
    discountedPrice = 0;
    couponDiscountType = null;
    couponDiscountValue = 0;
    
    document.getElementById('coupon-message').style.display = 'none';
    document.getElementById('coupon-discount-info').style.display = 'none';
    document.getElementById('coupon-input-section').style.display = 'block';
    document.getElementById('coupon-code-input').value = '';
    
    // Restore original checkout button
    restoreCheckoutButton();
    
    // Clear session storage
    sessionStorage.removeItem('appliedCoupon');
    
    // Trigger updateTotal to restore original button text
    if (typeof window.updateTotal === 'function') {
      window.updateTotal();
    }
  };
  
  // Update checkout button with discounted price
  function updateCheckoutButton(newPrice, discount) {
    // Update both Pay and Checkout buttons
    const applePayBtn = document.getElementById('apple-pay-btn');
    const checkoutBtn = document.getElementById('checkout-btn');
    
    // Update Apple Pay button
    if (applePayBtn) {
      if (!applePayBtn.dataset.originalHtml) {
        applePayBtn.dataset.originalHtml = applePayBtn.innerHTML;
        applePayBtn.dataset.originalBg = applePayBtn.style.background;
      }
      applePayBtn.innerHTML = ` Pay <span style="background: #16a34a; padding: 2px 6px; border-radius: 4px; font-size: 0.8em;">-$${discount.toFixed(2)}</span>`;
      applePayBtn.style.background = 'linear-gradient(135deg, #16a34a, #059669)';
    }
    
    // Update Checkout button - always show original and new price
    if (checkoutBtn) {
      if (!checkoutBtn.dataset.originalBg) {
        checkoutBtn.dataset.originalBg = checkoutBtn.style.background || '';
      }
      
      // Build new button HTML with strikethrough original and discounted price
      checkoutBtn.innerHTML = `✅ Proceed to Checkout - <span style="text-decoration: line-through; opacity: 0.6; font-size: 0.85em;">$${originalPrice.toFixed(2)}</span> <span style="color: #fff; font-weight: bold;">$${newPrice.toFixed(2)}</span>`;
      checkoutBtn.style.background = 'linear-gradient(135deg, #16a34a, #059669)';
    }
  }
  
  // Restore checkout button
  function restoreCheckoutButton() {
    const applePayBtn = document.getElementById('apple-pay-btn');
    const checkoutBtn = document.getElementById('checkout-btn');
    
    // Restore Apple Pay button
    if (applePayBtn && applePayBtn.dataset.originalHtml) {
      applePayBtn.innerHTML = applePayBtn.dataset.originalHtml;
      applePayBtn.style.background = applePayBtn.dataset.originalBg || '#000';
    }
    
    // Restore Checkout button - let updateTotal handle the text
    if (checkoutBtn && checkoutBtn.dataset.originalBg !== undefined) {
      checkoutBtn.style.background = checkoutBtn.dataset.originalBg || '';
      // Text will be restored by updateTotal()
    }
  }
  
  // Get product ID from URL or page
  function getProductId() {
    // Try URL patterns
    const urlMatch = window.location.pathname.match(/product-(\d+)/);
    if (urlMatch) return urlMatch[1];
    
    // Try query string
    const params = new URLSearchParams(window.location.search);
    if (params.get('id')) return params.get('id');
    
    // Try data attribute
    const productEl = document.querySelector('[data-product-id]');
    if (productEl) return productEl.dataset.productId;
    
    return null;
  }
  
  // Get applied coupon (for checkout process)
  // IMPORTANT: Only return coupon if it's actually applied in the UI
  window.getAppliedCoupon = function() {
    // In-memory variable is the source of truth
    // Session storage is just for persistence, not the primary check
    if (!appliedCoupon || !couponDiscountType) {
      // No coupon applied - clear any stale session data
      sessionStorage.removeItem('appliedCoupon');
      return null;
    }
    
    // Coupon is applied, return current values
    return {
      id: appliedCoupon.id,
      code: appliedCoupon.code,
      discount: originalPrice - discountedPrice,
      discounted_price: discountedPrice,
      discount_type: couponDiscountType,
      discount_value: couponDiscountValue
    };
  };
  
  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCouponWidget);
  } else {
    initCouponWidget();
  }
})();
