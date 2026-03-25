/**
 * Dashboard Coupons - Admin UI for managing discount codes
 */

(function (AD) {
  const state = {
    coupons: [],
    editingId: null
  };

  AD.loadCoupons = async function (panel) {
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
        <div>
          <h2 style="margin:0;color:#111827;">🎟️ Coupon Codes</h2>
          <div style="margin-top:6px;color:#6b7280;max-width:760px;line-height:1.4;">
            Manage discount codes for your customers. You can create percentage or fixed amount discounts.
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn" id="cp-refresh" style="background:#6b7280;color:white;">Refresh</button>
        </div>
      </div>

      <div id="cp-alert" style="display:none;margin-bottom:12px;padding:12px 14px;border-radius:10px;border:1px solid #fee2e2;background:#fff1f2;color:#991b1b;font-weight:700;"></div>

      <div style="background:white;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);padding:18px;margin-bottom:18px;">
        <h3 style="margin:0 0 14px;color:#111827;" id="cp-form-title">Create New Coupon</h3>
        
        <div style="display:grid;grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));gap:14px;">
          <div>
            <label style="display:block;font-weight:800;margin-bottom:6px;color:#111827;">Coupon Code</label>
            <input id="cp-code" type="text" placeholder="e.g. SAVE20" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;text-transform:uppercase;">
          </div>
          <div>
            <label style="display:block;font-weight:800;margin-bottom:6px;color:#111827;">Discount Type</label>
            <select id="cp-type" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;">
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed Amount ($)</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-weight:800;margin-bottom:6px;color:#111827;">Discount Value</label>
            <input id="cp-value" type="number" step="0.01" placeholder="e.g. 20" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;">
          </div>
          <div>
            <label style="display:block;font-weight:800;margin-bottom:6px;color:#111827;">Min Order Amount</label>
            <input id="cp-min" type="number" step="0.01" placeholder="0 = no minimum" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;">
          </div>
          <div>
            <label style="display:block;font-weight:800;margin-bottom:6px;color:#111827;">Max Uses</label>
            <input id="cp-max" type="number" placeholder="0 = unlimited" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;">
          </div>
          <div>
            <label style="display:block;font-weight:800;margin-bottom:6px;color:#111827;">Status</label>
            <select id="cp-status" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">
          <button class="btn" id="cp-cancel" style="display:none;background:#6b7280;color:white;">Cancel</button>
          <button class="btn btn-primary" id="cp-save">Save Coupon</button>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Type</th>
              <th>Value</th>
              <th>Min Order</th>
              <th>Uses</th>
              <th>Status</th>
              <th style="width:180px;">Actions</th>
            </tr>
          </thead>
          <tbody id="cp-tbody"></tbody>
        </table>
      </div>
      <div id="cp-empty" style="display:none;text-align:center;padding:40px;color:#6b7280;background:white;border-radius:12px;margin-top:12px;">
        No coupons found. Create your first one above!
      </div>
    `;

    bind(panel);
    await refresh(panel);
  };

  function bind(panel) {
    panel.querySelector('#cp-refresh').addEventListener('click', () => refresh(panel));
    panel.querySelector('#cp-cancel').addEventListener('click', () => resetForm(panel));
    
    panel.querySelector('#cp-save').addEventListener('click', async () => {
      const code = panel.querySelector('#cp-code').value.trim();
      const type = panel.querySelector('#cp-type').value;
      const value = parseFloat(panel.querySelector('#cp-value').value);
      const min = parseFloat(panel.querySelector('#cp-min').value) || 0;
      const max = parseInt(panel.querySelector('#cp-max').value) || 0;
      const status = panel.querySelector('#cp-status').value;

      if (!code || isNaN(value)) {
        alert('Please enter a valid code and discount value.');
        return;
      }

      const body = { code, discount_type: type, discount_value: value, min_order_amount: min, max_uses: max, status };
      
      try {
        let url = '/api/coupons/create';
        if (state.editingId) {
          url = '/api/coupons/update';
          body.id = state.editingId;
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();

        if (data.error) throw new Error(data.error);
        
        resetForm(panel);
        await refresh(panel);
      } catch (err) {
        alert('Error: ' + err.message);
      }
    });

    panel.querySelector('#cp-tbody').addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;

      if (action === 'edit') {
        const coupon = state.coupons.find(c => String(c.id) === String(id));
        if (coupon) {
          state.editingId = id;
          panel.querySelector('#cp-form-title').textContent = 'Edit Coupon: ' + coupon.code;
          panel.querySelector('#cp-code').value = coupon.code;
          panel.querySelector('#cp-type').value = coupon.discount_type;
          panel.querySelector('#cp-value').value = coupon.discount_value;
          panel.querySelector('#cp-min').value = coupon.min_order_amount;
          panel.querySelector('#cp-max').value = coupon.max_uses;
          panel.querySelector('#cp-status').value = coupon.status;
          panel.querySelector('#cp-cancel').style.display = 'inline-block';
          panel.querySelector('#cp-save').textContent = 'Update Coupon';
        }
      } else if (action === 'delete') {
        if (!confirm('Are you sure you want to delete this coupon?')) return;
        try {
          const res = await fetch(`/api/coupons/delete?id=${id}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          await refresh(panel);
        } catch (err) {
          alert('Error: ' + err.message);
        }
      }
    });
  }

  function resetForm(panel) {
    state.editingId = null;
    panel.querySelector('#cp-form-title').textContent = 'Create New Coupon';
    panel.querySelector('#cp-code').value = '';
    panel.querySelector('#cp-value').value = '';
    panel.querySelector('#cp-min').value = '';
    panel.querySelector('#cp-max').value = '';
    panel.querySelector('#cp-cancel').style.display = 'none';
    panel.querySelector('#cp-save').textContent = 'Save Coupon';
  }

  async function refresh(panel) {
    try {
      const res = await fetch('/api/coupons');
      const data = await res.json();
      state.coupons = data.coupons || [];
      render(panel);
    } catch (err) {
      console.error('Failed to load coupons:', err);
    }
  }

  function render(panel) {
    const tbody = panel.querySelector('#cp-tbody');
    const empty = panel.querySelector('#cp-empty');
    
    if (state.coupons.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    
    empty.style.display = 'none';
    tbody.innerHTML = state.coupons.map(c => `
      <tr>
        <td style="font-weight:800;color:#111827;">${c.code}</td>
        <td>${c.discount_type === 'percentage' ? 'Percentage' : 'Fixed'}</td>
        <td style="font-weight:700;">${c.discount_type === 'percentage' ? c.discount_value + '%' : '$' + c.discount_value}</td>
        <td>$${c.min_order_amount || 0}</td>
        <td>${c.used_count} / ${c.max_uses || '∞'}</td>
        <td>
          <span style="background:${c.status === 'active' ? '#d1fae5' : '#fee2e2'};color:${c.status === 'active' ? '#065f46' : '#991b1b'};padding:4px 10px;border-radius:20px;font-size:0.85em;font-weight:700;">
            ${c.status.toUpperCase()}
          </span>
        </td>
        <td>
          <div style="display:flex;gap:8px;">
            <button class="btn" style="background:#6b7280;color:white;" data-action="edit" data-id="${c.id}">Edit</button>
            <button class="btn" style="background:#ef4444;color:white;" data-action="delete" data-id="${c.id}">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

})(window.AdminDashboard);
