/**
 * Dashboard Orders - Order management
 */

(function(AD) {
  AD.loadOrders = async function(panel) {
    AD._ordersPanel = panel;
    panel.innerHTML = `
      <!-- Create Order Modal -->
      <div id="create-order-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center;">
        <div style="background:white; padding:30px; border-radius:12px; max-width:500px; width:90%; max-height:90vh; overflow-y:auto;">
          <h3 style="margin:0 0 20px; color:#1f2937;">➕ Create New Order</h3>
          <form id="create-order-form">
            <div style="margin-bottom:15px;">
              <label style="display:block; font-weight:600; margin-bottom:5px;">Product</label>
              <select id="new-order-product" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;" required>
                <option value="">Select Product...</option>
              </select>
            </div>
            <div style="margin-bottom:15px;">
              <label style="display:block; font-weight:600; margin-bottom:5px;">Customer Email</label>
              <input type="email" id="new-order-email" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; box-sizing:border-box;" required>
            </div>
            <div style="margin-bottom:15px;">
              <label style="display:block; font-weight:600; margin-bottom:5px;">Amount ($)</label>
              <input type="number" id="new-order-amount" step="0.01" min="0" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; box-sizing:border-box;" required>
            </div>
            <div style="margin-bottom:15px;">
              <label style="display:block; font-weight:600; margin-bottom:5px;">Delivery Time (minutes)</label>
              <input type="number" id="new-order-delivery" value="60" min="1" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; box-sizing:border-box;" required>
            </div>
            <div style="margin-bottom:15px;">
              <label style="display:block; font-weight:600; margin-bottom:5px;">Status</label>
              <select id="new-order-status" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>
            <div style="margin-bottom:15px;">
              <label style="display:block; font-weight:600; margin-bottom:5px;">Notes (Optional)</label>
              <textarea id="new-order-notes" rows="2" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; box-sizing:border-box; resize:vertical;" placeholder="Any special requirements..."></textarea>
            </div>
            <div style="display:flex; gap:10px; justify-content:flex-end;">
              <button type="button" id="cancel-create-order" style="padding:10px 20px; background:#6b7280; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Cancel</button>
              <button type="submit" style="padding:10px 20px; background:#10b981; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Create Order</button>
            </div>
          </form>
        </div>
      </div>
      
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;">
        <button class="btn btn-danger" onclick="deleteAllOrders()">Delete All Orders</button>
        <button class="btn btn-primary" onclick="openCreateOrderModal()">➕ Create New Order</button>
      </div>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Email</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Time Left</th>
              <th>Date</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="orders-tbody">
            <tr><td colspan="7" style="text-align: center;">Loading...</td></tr>
          </tbody>
        </table>
      </div>`;
    
    // Setup modal handlers
    const modal = document.getElementById('create-order-modal');
    const createForm = document.getElementById('create-order-form');
    const cancelBtn = document.getElementById('cancel-create-order');
    
    cancelBtn.onclick = () => { modal.style.display = 'none'; };
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    
    // Open modal function
    window.openCreateOrderModal = async () => {
      const productSelect = document.getElementById('new-order-product');
      try {
        const pdata = await AD.apiFetch('/api/products/list');
        if (pdata.products && pdata.products.length > 0) {
          productSelect.innerHTML = '<option value="">Select Product...</option>' + 
            pdata.products.map(p => `<option value="${p.id}" data-price="${p.sale_price || p.normal_price}">${p.title} - $${p.sale_price || p.normal_price}</option>`).join('');
        }
      } catch (err) {
        console.error('Failed to load products', err);
      }
      
      productSelect.onchange = function() {
        const selected = this.options[this.selectedIndex];
        if (selected && selected.dataset.price) {
          document.getElementById('new-order-amount').value = selected.dataset.price;
        }
      };
      
      modal.style.display = 'flex';
    };
    
    // Create order form submit
    createForm.onsubmit = async (e) => {
      e.preventDefault();
      
      const data = {
        manualOrder: true,
        productId: document.getElementById('new-order-product').value,
        email: document.getElementById('new-order-email').value.trim(),
        amount: document.getElementById('new-order-amount').value,
        deliveryTime: document.getElementById('new-order-delivery').value,
        status: document.getElementById('new-order-status').value,
        notes: document.getElementById('new-order-notes').value.trim()
      };
      
      if (!data.productId) {
        alert('Please select a product');
        return;
      }
      
      try {
        const res = await fetch('/api/order/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
          alert('✅ Order created! Order ID: ' + result.orderId);
          modal.style.display = 'none';
          createForm.reset();
          AD.loadOrders(panel);
        } else {
          alert('Error: ' + (result.error || 'Create failed'));
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    };
    
    try {
      const data = await AD.apiFetch('/api/orders');
      if (data.orders) {
        AD.orders = data.orders;
        document.getElementById('orders-tbody').innerHTML = AD.orders.map(o => {
          const countdown = AD.getCountdown(o);
          return `<tr onclick="showOrderDetail('${o.order_id}')" style="cursor:pointer;">
            <td><strong>#${o.order_id}</strong></td>
            <td>${o.email || 'N/A'}</td>
            <td><strong>${o.amount || 0}</strong></td>
            <td><span class="status-${o.status}">${o.status}</span></td>
            <td>${countdown}</td>
            <td>${AD.formatDate(o.created_at)}</td>
            <td>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <a href="/order-detail.html?id=${o.order_id}&admin=1" class="btn btn-primary" onclick="event.stopPropagation()" style="font-size: 12px; padding: 6px 12px;">👁️ Admin View</a>
                <a href="/buyer-order.html?id=${o.order_id}" class="btn" onclick="event.stopPropagation()" target="_blank" style="background: #10b981; color: white; font-size: 12px; padding: 6px 12px;">👤 Buyer Link</a>
                <button class="btn" onclick="event.stopPropagation(); deleteOrder(\'${o.order_id}\')" style="background:#ef4444;color:white;font-size:12px;padding:6px 12px;">🗑️ Delete</button>
              </div>
            </td>
          </tr>`;
        }).join('');
        
        // Start live countdown updater
        AD.startCountdownUpdater();
      }
    } catch (err) {
      document.getElementById('orders-tbody').innerHTML = '<tr><td colspan="7" style="color: red;">Error loading orders</td></tr>';
    }
  };

  // Show order detail
  window.showOrderDetail = function(orderId) {
    window.location.href = `/order-detail.html?id=${orderId}&admin=1`;
  };

  // Delete order
  window.deleteOrder = async function(orderId) {
    if (!orderId) return;
    if (!confirm(`Delete order #${orderId}? This cannot be undone.`)) return;
    try {
      const result = await AD.apiFetch('/api/order/delete?id=' + encodeURIComponent(orderId), { method: 'DELETE' });
      if (result && result.success) {
        if (AD._ordersPanel) AD.loadOrders(AD._ordersPanel);
      } else {
        alert('Delete failed: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  // Delete all orders
  window.deleteAllOrders = async function() {
    if (!confirm('Delete ALL orders?\n\nThis action is permanent and cannot be undone.')) return;

    const token = prompt('Type DELETE to confirm:', '');
    if (token !== 'DELETE') {
      alert('Cancelled. Confirmation text did not match.');
      return;
    }

    try {
      const result = await AD.apiFetch('/api/admin/orders/delete-all', { method: 'POST' });
      if (result && result.success) {
        const deletedOrders = result.count || 0;
        const deletedReviews = result.deleted_order_reviews || 0;
        alert(`✅ Deleted ${deletedOrders} orders and ${deletedReviews} linked reviews.`);
        if (AD._ordersPanel) AD.loadOrders(AD._ordersPanel);
      } else {
        alert('Delete failed: ' + (result?.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  console.log('✅ Dashboard Orders loaded');
})(window.AdminDashboard);
