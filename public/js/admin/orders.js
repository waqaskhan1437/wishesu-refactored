/*
 * Admin Orders List
 * Updated: Parses [PHOTO LINK] tag correctly.
 */

let allOrders = [];
let currentEditOrderId = null;

;(async function initOrdersPage() {
  await loadOrders();
})();

async function loadOrders() {
  const table = document.getElementById('orders-table');
  if (!table) return;
  try {
    table.innerHTML = '<tbody><tr><td colspan="8" style="text-align:center;">Loading...</td></tr></tbody>';
    const resp = await getOrders();
    allOrders = (resp && resp.orders) || [];
    filterOrders('PAID');
  } catch (err) {
    console.error(err);
    table.innerHTML = `<tbody><tr><td colspan="8" style="color:red; text-align:center;">Error: ${err.message}</td></tr></tbody>`;
  }
}

window.filterOrders = function(targetStatus) {
  const table = document.getElementById('orders-table');
  const tabs = document.querySelectorAll('.tab-btn');
  
  tabs.forEach(btn => {
    const isActive = (targetStatus === 'PAID' && btn.innerText.includes('Paid')) || 
                     (targetStatus === 'PENDING' && btn.innerText.includes('Unpaid'));
    btn.classList.toggle('active', isActive);
  });

  const filtered = allOrders.filter(ord => {
    const s = (ord.status || '').toUpperCase();
    return targetStatus === 'PAID' ? 
      (s === 'PAID' || s === 'COMPLETED' || s === 'APPROVED') : 
      (s !== 'PAID' && s !== 'COMPLETED' && s !== 'APPROVED');
  });

  let html = `<thead><tr>
    <th>ID</th>
    <th>Order Info</th>
    <th style="width: 35%;">Order Details</th>
    <th>Amount</th>
    <th>Status</th>
    <th>Delivery</th>
    <th style="text-align:right;">Actions</th>
  </tr></thead><tbody>`;

  if (!filtered.length) {
    html += `<tr><td colspan="7" style="text-align:center; padding:2rem;">No ${targetStatus.toLowerCase()} orders found.</td></tr>`;
  } else {
    filtered.forEach(ord => {
      const statusClass = (ord.status || '').toUpperCase() === 'PAID' ? 'status-paid' : 'status-pending';
      const archiveLink = ord.archive_url 
        ? `<a href="${ord.archive_url}" target="_blank" style="color:#2563eb; font-weight:bold; text-decoration:underline;">View Delivery</a>` 
        : '<span style="color:#9ca3af;">Not Delivered</span>';

      // --- DETAILS FORMATTING ---
      let detailsHtml = '<div style="font-size:0.9rem; line-height:1.6;">';
      if(ord.email) detailsHtml += `<div><strong>Email:</strong> ${ord.email}</div>`;
      
      if (ord.addons && ord.addons.length > 0) {
        detailsHtml += '<hr style="margin:5px 0; border-top:1px solid #eee;">';
        ord.addons.forEach(item => {
          let val = item.value;
          let label = item.field;
          
          // Check for Photo Link
          if (typeof val === 'string' && val.includes('[PHOTO LINK]')) {
             // Clean URL extraction
             const url = val.replace('[PHOTO LINK]:', '').trim();
             val = `<a href="${url}" target="_blank" style="background:#4f46e5; color:white; padding:4px 8px; border-radius:4px; text-decoration:none; font-size:0.8rem; display:inline-block; margin-top:2px;">View Photo 📸</a>`;
          }
          
          detailsHtml += `<div style="margin-bottom:4px;"><strong>${label}:</strong> ${val}</div>`;
        });
      } else {
        detailsHtml += '<div style="color:#999; font-style:italic;">No requirements provided.</div>';
      }
      detailsHtml += '</div>';

      html += `<tr>
        <td style="vertical-align:top;">${ord.id}</td>
        <td style="vertical-align:top;">
            <span style="font-family:monospace; background:#f3f4f6; padding:2px 4px; border-radius:4px; display:block; margin-bottom:5px;">${ord.order_id}</span>
            <span style="font-size:0.85rem; color:#666;">${ord.created_at ? new Date(ord.created_at).toLocaleDateString() : ''}</span>
        </td>
        <td style="vertical-align:top;">${detailsHtml}</td>
        <td style="vertical-align:top;">${ord.amount ? '$'+parseFloat(ord.amount).toLocaleString() : '–'}</td>
        <td style="vertical-align:top;"><span class="status-badge ${statusClass}">${ord.status || 'Pending'}</span></td>
        <td style="vertical-align:top;">${archiveLink}</td>
        <td style="text-align:right; vertical-align:top;">
          <button class="btn" style="padding:4px 8px; font-size:0.85rem;" onclick="openDeliverModal('${ord.order_id}')">Deliver</button>
          <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.85rem; background:#fee2e2; color:#b91c1c; border-color:#fecaca; margin-left:5px;" onclick="deleteOrder('${ord.id}')">Delete</button>
        </td>
      </tr>`;
    });
  }
  html += '</tbody>';
  table.innerHTML = html;
};

// ... (Baqi Delete aur Modal functions same rahenge) ...
window.deleteOrder = async function(dbId) {
  if (!confirm('Are you sure you want to delete this order?')) return;
  try {
    const res = await fetch(`/api/order/delete?id=${dbId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      allOrders = allOrders.filter(o => o.id != dbId);
      const activeTab = document.querySelector('.tab-btn.active').innerText.includes('Paid') ? 'PAID' : 'PENDING';
      filterOrders(activeTab);
    } else { alert('Delete failed: ' + data.error); }
  } catch (err) { alert('Error: ' + err.message); }
};

window.openDeliverModal = function(orderId) {
  currentEditOrderId = orderId;
  document.getElementById('modal-order-id').textContent = 'Order ID: ' + orderId;
  document.getElementById('deliver-url-input').value = '';
  const youtubeInput = document.getElementById('deliver-youtube-input');
  if (youtubeInput) youtubeInput.value = '';
  document.getElementById('deliver-file-input').value = '';
  document.getElementById('deliver-modal').style.display = 'flex';
};
window.closeModal = function() { document.getElementById('deliver-modal').style.display = 'none'; currentEditOrderId = null; };
window.switchModalTab = function(type) {
  document.querySelectorAll('.m-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.delivery-opt').forEach(d => d.classList.remove('active'));
  if (type === 'url') { document.querySelector('.m-tab:first-child').classList.add('active'); document.getElementById('opt-url').classList.add('active'); } 
  else { document.querySelector('.m-tab:last-child').classList.add('active'); document.getElementById('opt-file').classList.add('active'); }
};
window.submitDelivery = async function() {
  if (!currentEditOrderId) return;
  const btn = document.getElementById('btn-save-delivery');
  const originalText = btn.textContent;
  btn.textContent = 'Saving...';
  btn.disabled = true;
  try {
    const isFile = document.getElementById('opt-file').classList.contains('active');
    if (isFile) {
      const fileInput = document.getElementById('deliver-file-input');
      if (!fileInput.files || !fileInput.files[0]) throw new Error('Please select a file');
      const file = fileInput.files[0];
      const itemId = 'wishvideo_order_' + currentEditOrderId + '_' + Date.now();
      const uploadUrl = `/api/order/upload-encrypted-file?orderId=${currentEditOrderId}&itemId=${itemId}&filename=${encodeURIComponent(file.name)}`;
      const res = await fetch(uploadUrl, { method: 'POST', body: file });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Upload failed');
    } else {
      const urlVal = document.getElementById('deliver-url-input').value.trim();
      const youtubeVal = document.getElementById('deliver-youtube-input')?.value.trim() || '';
      if (!urlVal) throw new Error('Please enter a URL');
      const res = await fetch('/api/order/archive-link', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ orderId: currentEditOrderId, archiveUrl: urlVal, youtubeUrl: youtubeVal })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Save failed');
    }
    alert('Order delivered successfully!');
    closeModal();
    loadOrders();
  } catch (err) { alert('Error: ' + err.message); } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
};
