/*
 * Pricing and checkout helpers.
 * OPTIMIZED: Fast R2 temp upload + background Archive.org processing
 * - Parallel uploads for speed
 * - Progress indicator
 * - Temporary R2 storage before Archive.org
 * - Background server-side processing
 */

;(function(){
  let cachedAddonEmail = '';
  let isCheckoutInProgress = false; // Prevent double clicks

  function extractErrorMessage(value, fallback = 'Checkout failed') {
    if (!value) return fallback;

    if (typeof value === 'string') {
      const msg = value.trim();
      return msg || fallback;
    }

    if (value instanceof Error) {
      return extractErrorMessage(value.message, fallback);
    }

    if (typeof value === 'object') {
      const candidates = [value.error, value.message, value.detail, value.details, value.description];
      for (const candidate of candidates) {
        const msg = extractErrorMessage(candidate, '');
        if (msg) return msg;
      }
      try {
        const serialized = JSON.stringify(value);
        if (serialized && serialized !== '{}' && serialized !== '[]') {
          return serialized;
        }
      } catch (e) {}
    }

    try {
      const msg = String(value).trim();
      return msg || fallback;
    } catch (e) {
      return fallback;
    }
  }

  function normalizeAmount(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return 0;
    return Math.round(num * 100) / 100;
  }

  function dispatchWithRetry(dispatcher, maxAttempts = 18, delayMs = 500) {
    let attempt = 0;
    const run = () => {
      attempt += 1;
      let sent = false;
      try {
        sent = dispatcher() === true;
      } catch (e) {
        sent = false;
      }
      if (!sent && attempt < maxAttempts) {
        setTimeout(run, delayMs);
      }
    };
    run();
  }

  function trackBeginCheckoutEvent(details) {
    const amount = normalizeAmount(details && details.amount);
    if (!amount) return;

    const productId = String((details && details.productId) || '').trim();
    const productTitle = String((details && details.productTitle) || '').trim();
    const couponCode = String((details && details.couponCode) || '').trim();

    const gaPayload = {
      currency: 'USD',
      value: amount,
      items: [
        {
          item_id: productId || 'unknown',
          item_name: productTitle || 'Product',
          price: amount,
          quantity: 1
        }
      ]
    };
    if (couponCode) gaPayload.coupon = couponCode;

    const fbPayload = {
      value: amount,
      currency: 'USD',
      content_type: 'product',
      num_items: 1
    };
    if (productId) fbPayload.content_ids = [productId];
    if (productTitle) fbPayload.content_name = productTitle;

    dispatchWithRetry(() => {
      if (typeof window.gtag !== 'function') return false;
      window.gtag('event', 'begin_checkout', gaPayload);
      return true;
    });

    dispatchWithRetry(() => {
      if (typeof window.fbq !== 'function') return false;
      window.fbq('track', 'InitiateCheckout', fbPayload);
      return true;
    });
  }

  function syncEmailToWhop(email) {
    cachedAddonEmail = email || '';
    window.cachedAddonEmail = cachedAddonEmail;

    const embed = document.getElementById('whop-embedded-checkout');
    if (!embed) return;

    if (cachedAddonEmail) {
      embed.setAttribute('data-whop-checkout-email', cachedAddonEmail);
    } else {
      embed.removeAttribute('data-whop-checkout-email');
    }
  }

  function initAddonEmailListener() {
    const form = document.getElementById('addons-form');
    if (!form) return;
    const emailInput = form.querySelector('input[type="email"]');
    if (!emailInput) return;

    const handleEmailUpdate = () => {
      const val = (emailInput.value || '').trim();
      if (val && val.includes('@')) {
        syncEmailToWhop(val);
        // Capture lead: send email to server once when valid email is provided
        sendLeadIfNeeded(val);
      } else {
        syncEmailToWhop('');
      }
    };

    emailInput.addEventListener('input', handleEmailUpdate);
    emailInput.addEventListener('change', handleEmailUpdate);
    handleEmailUpdate();
  }

  // Lead capture state: ensure we only send once per page load
  let leadSent = false;
  async function sendLeadIfNeeded(email) {
    if (leadSent || !email || !email.includes('@')) return;
    leadSent = true;
    try {
      await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, source: 'checkout' })
      });
    } catch (_) {
      // Ignore errors silently; lead capture failure should not block checkout
    }
  }

  // Add spinner CSS once
  function ensureSpinnerCSS() {
    if (document.getElementById('checkout-spinner-css')) return;
    const style = document.createElement('style');
    style.id = 'checkout-spinner-css';
    style.textContent = `
      .checkout-spinner {
        display: inline-block;
        width: 20px;
        height: 20px;
        border: 3px solid rgba(255,255,255,0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: checkoutSpin 0.8s linear infinite;
        vertical-align: middle;
      }
      @keyframes checkoutSpin {
        to { transform: rotate(360deg); }
      }
      .btn-loading {
        pointer-events: none !important;
        opacity: 0.7 !important;
        cursor: wait !important;
      }
    `;
    document.head.appendChild(style);
  }

  function updateTotal() {
    let addonTotal = 0;
    const selects = document.querySelectorAll('select.form-select');
    selects.forEach(sel => {
      const opt = sel.selectedOptions[0];
      if (opt && opt.dataset.price) addonTotal += parseFloat(opt.dataset.price);
    });
    const inputs = document.querySelectorAll('input.addon-radio:checked, input.addon-checkbox:checked');
    inputs.forEach(el => {
      if (el.dataset.price) addonTotal += parseFloat(el.dataset.price);
    });
    window.currentTotal = window.basePrice + addonTotal;
    
    // Check if coupon is applied - let coupon widget handle button update
    const hasCoupon = typeof window.getAppliedCoupon === 'function' && window.getAppliedCoupon();
    
    const btn = document.getElementById('checkout-btn');
    // Only update text if NOT in loading state AND no coupon applied
    if (btn && !btn.classList.contains('btn-loading') && !hasCoupon) {
      btn.textContent = '✅ Proceed to Checkout - $' + window.currentTotal.toLocaleString();
    }
    
    // Trigger coupon recalculation if applied
    if (typeof window.updateCheckoutPrice === 'function') {
      window.updateCheckoutPrice(window.currentTotal);
    }
    
    // Also trigger coupon recalculation directly
    if (typeof window.recalculateCouponDiscount === 'function') {
      window.recalculateCouponDiscount(window.currentTotal);
    }
  }
  
  // Expose updateTotal globally
  window.updateTotal = updateTotal;

  async function handleCheckout() {
    // Prevent double clicks
    if (isCheckoutInProgress) {
      console.warn('⚠️ Checkout already in progress');
      return;
    }

    const btn = document.getElementById('checkout-btn');
    const payBtn = document.getElementById('apple-pay-btn');
    
    if (!btn) {
      console.error('🔴 CHECKOUT BUTTON NOT FOUND');
      return;
    }

    // Mark checkout in progress
    isCheckoutInProgress = true;
    
    // Ensure spinner CSS exists
    ensureSpinnerCSS();

    // Validation first
    let valid = true;
    document.querySelectorAll('.addon-group').forEach(grp => {
      const lbl = grp.querySelector('.addon-group-label');
      if (lbl && lbl.innerText.includes('*')) {
        const inp = grp.querySelector('input, select, textarea');
        if (inp && !inp.value) {
          inp.style.borderColor = 'red';
          valid = false;
        }
      }
    });
    if (!valid) {
      console.error('🔴 VALIDATION FAILED');
      alert('Please fill required fields');
      isCheckoutInProgress = false;
      return;
    }

    // Store original text
    const originalText = btn.textContent;
    const payBtnOriginal = payBtn ? payBtn.innerHTML : '';
    
    // Show spinner on checkout button
    btn.classList.add('btn-loading');
    btn.disabled = true;
    btn.innerHTML = '<span class="checkout-spinner"></span> Processing...';
    
    // Also disable Pay button
    if (payBtn) {
      payBtn.classList.add('btn-loading');
      payBtn.disabled = true;
      payBtn.innerHTML = '<span class="checkout-spinner"></span> Wait...';
    }

    // Helper to restore buttons
    const restoreButtons = () => {
      isCheckoutInProgress = false;
      btn.classList.remove('btn-loading');
      btn.disabled = false;
      btn.textContent = originalText;
      if (payBtn) {
        payBtn.classList.remove('btn-loading');
        payBtn.disabled = false;
        payBtn.innerHTML = payBtnOriginal;
      }
    };
    
    // Expose restore function globally for payment selector
    window.restoreCheckoutButtons = restoreButtons;
    
    // Check if files are still uploading
    if (window.isUploadInProgress && window.isUploadInProgress()) {
      alert('Please wait for file uploads to complete.');
      restoreButtons();
      return;
    }

    // Gather form data
    const formEl = document.getElementById('addons-form');
    const selectedAddons = [];

    if (formEl) {
      const formData = new FormData(formEl);
      const groupedAddons = {};
      
      for (const pair of formData.entries()) {
        const key = pair[0];
        const val = pair[1];
        if (val instanceof File) continue;
        if (!val) continue;
        
        if (groupedAddons[key]) {
          groupedAddons[key].push(val);
        } else {
          groupedAddons[key] = [val];
        }
      }
      
      // Convert grouped addons to the format expected by backend
      Object.keys(groupedAddons).forEach(key => {
        selectedAddons.push({
          field: key,
          value: groupedAddons[key].join(', ')
        });
      });
    }

    // Get uploaded files from instant-upload.js
    const uploadedFiles = window.getUploadedFiles ? window.getUploadedFiles() : {};
    Object.keys(uploadedFiles).forEach(inputId => {
      const fileUrl = uploadedFiles[inputId];
      if (fileUrl) {
        selectedAddons.push({
          field: inputId,
          value: `[PHOTO LINK]: ${fileUrl}`
        });
      }
    });

    // Determine delivery time
    let deliveryDays = window.productData?.delivery_time_days || 1;
    let isInstant = window.productData?.instant_delivery || false;
    
    const deliveryAddon = selectedAddons.find(a => {
      const fieldId = (a.field || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return fieldId.includes('delivery') || fieldId === 'delivery-time';
    });
    
    if (deliveryAddon && window.productData?.addons_config) {
      try {
        const config = JSON.parse(window.productData.addons_config);
        const deliveryField = config.find(f => {
          const fid = (f.id || '').toLowerCase();
          return fid.includes('delivery') || fid === 'delivery-time';
        });
        
        if (deliveryField && deliveryField.options) {
          const selectedOption = deliveryField.options.find(o => o.label === deliveryAddon.value);
          if (selectedOption && selectedOption.delivery) {
            isInstant = !!selectedOption.delivery.instant;
            if (!isInstant && selectedOption.delivery.days) {
              deliveryDays = parseInt(selectedOption.delivery.days) || 1;
            }
          }
        }
      } catch (e) {}
    }
    
    const deliveryTimeMinutes = isInstant ? 60 : (deliveryDays * 24 * 60);

    // Get email
    let email = cachedAddonEmail || '';
    const emailInput = document.querySelector('#addons-form input[type="email"]');
    if (emailInput && emailInput.value.includes('@')) email = emailInput.value.trim();
    if (email) syncEmailToWhop(email);

    // Check for applied coupon
    let finalAmount = window.currentTotal;
    let appliedCoupon = null;
    
    if (typeof window.getAppliedCoupon === 'function') {
      appliedCoupon = window.getAppliedCoupon();
      if (appliedCoupon && appliedCoupon.discount_type) {
        // Recalculate discount based on current total (including addons)
        let discount = 0;
        if (appliedCoupon.discount_type === 'percentage') {
          discount = (window.currentTotal * appliedCoupon.discount_value) / 100;
        } else if (appliedCoupon.discount_type === 'fixed') {
          discount = Math.min(appliedCoupon.discount_value, window.currentTotal);
        }
        finalAmount = Math.max(0, window.currentTotal - discount);
        finalAmount = Math.round(finalAmount * 100) / 100;
        
        // Update appliedCoupon with recalculated values
        appliedCoupon.discount = Math.round(discount * 100) / 100;
        appliedCoupon.discounted_price = finalAmount;
      }
    }

    trackBeginCheckoutEvent({
      productId: window.productData && window.productData.id,
      productTitle: (window.productData && window.productData.title) || '',
      amount: finalAmount,
      couponCode: (appliedCoupon && appliedCoupon.code) || ''
    });

    // Store order data in localStorage as backup
    const orderData = {
      addons: selectedAddons,
      email: email,
      amount: finalAmount,
      originalAmount: window.currentTotal,
      coupon: appliedCoupon,
      productId: window.productData.id,
      productTitle: window.productData?.title || '',
      productThumbnail: window.productData?.thumbnail_url || '',
      deliveryTimeMinutes: deliveryTimeMinutes,
      timestamp: Date.now()
    };
    localStorage.setItem('pendingOrderData', JSON.stringify(orderData));

    // Check if PaymentSelector is available
    if (typeof window.PaymentSelector !== 'undefined') {
      // Open payment selector modal - buttons will be restored when modal closes
      window.PaymentSelector.open({
        productId: window.productData.id,
        productTitle: window.productData?.title || '',
        productThumbnail: window.productData?.thumbnail_url || '',
        amount: finalAmount,
        originalAmount: window.currentTotal,
        coupon: appliedCoupon,
        email: email,
        addons: selectedAddons,
        deliveryTimeMinutes: deliveryTimeMinutes,
        onClose: restoreButtons // Restore when modal closes
      });
    } else {
      // Fallback to direct Whop checkout
      await processDirectWhopCheckout(selectedAddons, email, originalText, btn, deliveryTimeMinutes, restoreButtons);
    }
  }

  // Direct Whop checkout (fallback)
  async function processDirectWhopCheckout(selectedAddons, email, originalText, btn, deliveryTimeMinutes, restoreButtons) {
    try {
      const appliedCoupon = typeof window.getAppliedCoupon === 'function' ? window.getAppliedCoupon() : null;
      const discountPrice = Number(appliedCoupon?.discounted_price);
      const finalAmount = Number.isFinite(discountPrice) ? discountPrice : Number(window.currentTotal || 0);

      const payload = {
        productId: window.productData.id,
        productTitle: window.productData?.title || '',
        productThumbnail: window.productData?.thumbnail_url || '',
        amount: finalAmount,
        originalAmount: Number(window.currentTotal || 0),
        email: email || '',
        addons: selectedAddons || [],
        coupon: appliedCoupon || null,
        deliveryTimeMinutes: deliveryTimeMinutes || 60,
        sourceUrl: window.location.pathname + window.location.search
      };

      restoreButtons();
      if (typeof window.startCheckoutPage === 'function') {
        window.startCheckoutPage(payload);
        return;
      }
      if (typeof window.startWhopCheckoutPage === 'function') {
        window.startWhopCheckoutPage(payload);
        return;
      }

      const serialized = JSON.stringify({
        version: 1,
        created_at: Date.now(),
        ...payload
      });
      try { sessionStorage.setItem('whop_checkout_intent_v1', serialized); } catch (e) {}
      try { localStorage.setItem('whop_checkout_intent_v1', serialized); } catch (e) {}
      window.location.href = '/checkout';
    } catch (err) {
      console.error('Checkout error:', err);
      alert('Checkout Error: ' + extractErrorMessage(err));
      restoreButtons();
    }
  }

  window.updateTotal = updateTotal;
  window.handleCheckout = handleCheckout;
  document.addEventListener('DOMContentLoaded', initAddonEmailListener);
})();
