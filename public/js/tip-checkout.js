/**
 * TipCheckout - opens tip payment in the correct gateway based on admin settings.
 * Priority: PayPal (if enabled + configured) then Whop.
 */

;(function () {
  let modalEl = null;

  async function loadPaymentMethods() {
    try {
      const res = await fetch('/api/payment/methods');
      const data = await res.json();
      return Array.isArray(data.methods) ? data.methods : [];
    } catch (e) {
      console.error('TipCheckout: failed to load payment methods', e);
      return [];
    }
  }

  function loadPayPalSDK(clientId) {
    return new Promise((resolve, reject) => {
      if (window.paypal) {
        resolve(window.paypal);
        return;
      }
      const script = document.createElement('script');
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=capture`;
      script.onload = () => resolve(window.paypal);
      script.onerror = () => reject(new Error('Failed to load PayPal SDK'));
      document.head.appendChild(script);
    });
  }

  function closeModal() {
    if (modalEl) {
      modalEl.remove();
      modalEl = null;
    }
  }

  function formatUSD(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '';
    return `$${n.toFixed(2)}`;
  }

  function openModal(title, amount) {
    closeModal();

    const amountText = formatUSD(amount);

    const wrap = document.createElement('div');
    wrap.id = 'tip-payment-modal';

    wrap.innerHTML = `
      <style>
        #tip-payment-modal{
          position:fixed;
          inset:0;
          z-index:100000;
          background:rgba(0,0,0,0.55);
          display:flex;
          align-items:center;
          justify-content:center;
          padding:16px;
        }
        .tip-modal{
          width:100%;
          max-width:460px;
          background:#fff;
          border-radius:16px;
          overflow:hidden;
          box-shadow:0 25px 50px -12px rgba(0,0,0,.25);
        }
        .tip-modal-head{
          padding:16px 18px;
          background:#111827;
          color:#fff;
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:12px;
        }
        .tip-modal-head-left{
          display:flex;
          flex-direction:column;
          gap:4px;
          min-width:0;
        }
        .tip-modal-head h3{
          margin:0;
          font-size:16px;
          font-weight:700;
          line-height:1.2;
        }
        .tip-modal-amount{
          font-size:13px;
          color:rgba(255,255,255,0.85);
          line-height:1.2;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .tip-modal-close{
          border:none;
          background:rgba(255,255,255,0.12);
          color:#fff;
          width:36px;
          height:36px;
          border-radius:10px;
          cursor:pointer;
          font-size:20px;
          line-height:1;
          display:flex;
          align-items:center;
          justify-content:center;
          flex:0 0 auto;
        }
        .tip-modal-body{padding:18px}
        .tip-note{margin:0 0 12px;color:#374151;font-size:14px}
        .tip-paypal-box{border:1px solid #e5e7eb;border-radius:12px;padding:14px}
        .tip-paypal-loading{
          min-height:120px;
          display:flex;
          align-items:center;
          justify-content:center;
          color:#6b7280;
        }
      </style>

      <div class="tip-modal" role="dialog" aria-modal="true">
        <div class="tip-modal-head">
          <div class="tip-modal-head-left">
            <h3>${title || 'Leave a tip'}</h3>
            ${amountText ? `<div class="tip-modal-amount">Amount: <strong>${amountText}</strong></div>` : ``}
          </div>
          <button class="tip-modal-close" type="button" aria-label="Close">×</button>
        </div>

        <div class="tip-modal-body">
          <p class="tip-note">Complete the payment and this popup will close automatically.</p>

          <div class="tip-paypal-box">
            <div id="tip-paypal-buttons" class="tip-paypal-loading">Loading...</div>
          </div>
        </div>
      </div>
    `;

    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) closeModal();
    });
    wrap.querySelector('.tip-modal-close')?.addEventListener('click', closeModal);

    document.body.appendChild(wrap);
    modalEl = wrap;
    return wrap;
  }

  async function openPayPalTip(opts) {
    const {
      clientId,
      productId,
      amount,
      email,
      orderId,
      onSuccess,
      onClose
    } = opts || {};

    if (!clientId || !productId || !amount || !orderId) {
      throw new Error('Missing required PayPal tip fields');
    }

    const modal = openModal('Tip with PayPal', amount);
    const buttonsEl = modal.querySelector('#tip-paypal-buttons');

    const closeAndNotify = () => {
      closeModal();
      if (typeof onClose === 'function') onClose();
    };

    // Ensure close triggers callback
    modal.querySelector('.tip-modal-close')?.addEventListener('click', closeAndNotify);
    modal.addEventListener('click', (e) => {
      if (e.target === modalEl) closeAndNotify();
    });

    try {
      const paypal = await loadPayPalSDK(clientId);
      if (!paypal || !paypal.Buttons) throw new Error('PayPal SDK not available');

      buttonsEl.innerHTML = '';

      paypal.Buttons({
        style: { layout: 'vertical', label: 'paypal', height: 45 },

        createOrder: async () => {
          const res = await fetch('/api/paypal/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              product_id: productId,
              amount: Number(amount),
              email: email || '',
              deliveryTimeMinutes: 60,
              metadata: {
                type: 'tip',
                orderId: orderId,
                tipAmount: Number(amount)
              }
            })
          });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || 'Failed to create PayPal order');
          return data.order_id;
        },

        onApprove: async (data) => {
          const res = await fetch('/api/paypal/capture-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: data.orderID })
          });
          const cap = await res.json();
          if (!res.ok || !cap.success) throw new Error(cap.error || 'Payment capture failed');

          if (typeof onSuccess === 'function') {
            await onSuccess();
          }
          closeAndNotify();
        },

        onError: (err) => {
          console.error('TipCheckout PayPal error:', err);
          alert('Payment error. Please try again.');
          closeAndNotify();
        },

        onCancel: () => {
          closeAndNotify();
        }
      }).render('#tip-paypal-buttons');
    } catch (e) {
      console.error('TipCheckout: PayPal init failed', e);
      alert(e.message || 'PayPal failed to load');
      closeAndNotify();
    }
  }

  window.TipCheckout = {
    loadPaymentMethods,
    openPayPalTip,
    close: closeModal
  };
})();
