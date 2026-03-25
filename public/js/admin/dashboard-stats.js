/**
 * Dashboard Stats - Main dashboard statistics view
 */

(function(AD) {
  AD.loadDashboard = async function(panel) {
    panel.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value" id="total-orders">0</div>
          <div class="stat-label">Total Orders</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="pending-orders">0</div>
          <div class="stat-label">Pending</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="total-revenue">$0</div>
          <div class="stat-label">Revenue</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="total-products">0</div>
          <div class="stat-label">Products</div>
        </div>
      </div>
      <div class="table-container">
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 20px; border-bottom:1px solid #e5e7eb;">
          <h3 style="margin: 0;">Recent Orders</h3>
          <input type="text" id="stats-order-search" placeholder="Search ID or Email..." style="padding:8px 12px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; width:220px;">
        </div>
        <table>
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Email</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody id="recent-orders">
            <tr><td colspan="5" style="text-align: center;">Loading...</td></tr>
          </tbody>
        </table>
      </div>`;

    try {
      const data = await AD.apiFetch('/api/orders');
      if (data.orders) {
        AD.orders = data.orders;
        document.getElementById('total-orders').textContent = AD.orders.length;
        document.getElementById('pending-orders').textContent = AD.orders.filter(o => o.status !== 'delivered').length;
        const revenue = AD.orders.reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0);
        document.getElementById('total-revenue').textContent = '$' + revenue.toFixed(2);

        // Render helper
        const renderTable = (list) => {
          const tbody = document.getElementById('recent-orders');
          if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #6b7280; padding: 20px;">No matching orders found</td></tr>';
            return;
          }
          tbody.innerHTML = list.map(o => `
            <tr onclick="window.location.href='/order-detail.html?id=${o.order_id}&admin=1'" style="cursor:pointer; transition: background 0.1s;">
              <td><strong>#${o.order_id}</strong></td>
              <td>${o.email || 'N/A'}</td>
              <td>$${o.amount || 0}</td>
              <td><span class="status-${o.status}">${o.status}</span></td>
              <td>${AD.formatDate(o.created_at)}</td>
            </tr>
          `).join('');
        };

        // Initial render (top 10)
        renderTable(AD.orders.slice(0, 10));

        // Search handler
        document.getElementById('stats-order-search').addEventListener('input', (e) => {
          const term = e.target.value.toLowerCase().trim();
          if (!term) {
            renderTable(AD.orders.slice(0, 10));
            return;
          }
          const filtered = AD.orders.filter(o =>
            (o.order_id && o.order_id.toLowerCase().includes(term)) ||
            (o.email && o.email.toLowerCase().includes(term)) ||
            (o.status && o.status.toLowerCase().includes(term))
          );
          renderTable(filtered.slice(0, 20));
        });
      }

      const pdata = await AD.apiFetch('/api/products');
      if (pdata.products) {
        document.getElementById('total-products').textContent = pdata.products.length;
      }
    } catch (err) {
      console.error('Dashboard error:', err);
    }
  };

  console.log('✅ Dashboard Stats loaded');
})(window.AdminDashboard);
