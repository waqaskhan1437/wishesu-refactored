/**
 * Dashboard Products - Product management
 */

(function(AD) {
  AD.loadProducts = async function(panel) {
    panel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-danger" onclick="deleteAllProducts()">Delete All Products</button>
          <button class="btn btn-primary" onclick="window.location.href='/admin/product-form.html'">+ Add Product</button>
        </div>
      </div>
      <div class="table-container">
        <table id="products-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Thumbnail</th>
              <th>Title</th>
              <th>Price</th>
              <th>Link</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="products-tbody"></tbody>
        </table>
      </div>`;
    
    try {
      const data = await AD.apiFetch('/api/products/list');
      if (data.products) {
        AD.products = data.products;
        document.getElementById('products-tbody').innerHTML = AD.products.map(p => `
          <tr>
            <td><strong>#${p.id}</strong></td>
            <td><img src="${p.thumbnail_url || 'https://via.placeholder.com/60x40'}" style="width:60px;height:40px;object-fit:cover;border-radius:4px;"></td>
            <td>${p.title}</td>
            <td><strong>$${p.sale_price || p.normal_price}</strong></td>
            <td>
              <a href="/product-${p.id}/${p.slug || p.id}" target="_blank" class="btn" style="background:#e0e7ff;color:#3730a3;font-size:0.85em;padding:4px 10px;">
                🔗 View
              </a>
            </td>
            <td>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn" style="background:#3b82f6;color:white;font-size:0.85em;padding:4px 10px;" onclick="editProduct(${p.id})">✏️ Edit</button>
                <button class="btn" style="background:#10b981;color:white;font-size:0.85em;padding:4px 10px;" onclick="duplicateProduct(${p.id})">📋 Duplicate</button>
                <button class="btn" style="background:#ef4444;color:white;font-size:0.85em;padding:4px 10px;" onclick="deleteProduct(${p.id})">🗑️ Delete</button>
              </div>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('Products error:', err);
      panel.innerHTML += '<p style="color:red;padding:20px;">Error loading products</p>';
    }
  };

  // Edit product
  window.editProduct = function(id) {
    window.location.href = `/admin/product-form.html?id=${id}`;
  };

  // Duplicate product
  window.duplicateProduct = async function(id) {
    if (!confirm('Duplicate this product?')) return;
    
    try {
      const res = await fetch('/api/products/duplicate', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      
      if (data.success) {
        alert('Product duplicated! Redirecting to edit...');
        window.location.href = `/admin/product-form.html?id=${data.id}`;
      } else {
        alert('Error: ' + (data.error || 'Failed to duplicate'));
      }
    } catch (err) {
      alert('Error duplicating product');
      console.error(err);
    }
  };

  // Delete all products
  window.deleteAllProducts = async function() {
    if (!confirm('Delete ALL products?\n\nThis action is permanent and cannot be undone.')) return;

    const token = prompt('Type DELETE to confirm:', '');
    if (token !== 'DELETE') {
      alert('Cancelled. Confirmation text did not match.');
      return;
    }

    try {
      const res = await fetch('/api/admin/products/delete-all', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        alert(`✅ Deleted ${data.count || 0} products.`);
        AD.loadView('products');
      } else {
        alert('Error: ' + (data.error || 'Failed to delete products'));
      }
    } catch (err) {
      alert('Error deleting all products');
      console.error(err);
    }
  };

  // Delete product
  window.deleteProduct = async function(id) {
    if (!confirm('Are you sure you want to delete this product? This cannot be undone.')) return;
    
    try {
      const res = await fetch(`/api/product/delete?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      
      if (data.success) {
        alert('Product deleted!');
        AD.loadView('products');
      } else {
        alert('Error: ' + (data.error || 'Failed to delete'));
      }
    } catch (err) {
      alert('Error deleting product');
      console.error(err);
    }
  };

  // Keep legacy function for compatibility
  window.showProductDetail = function(id) {
    window.location.href = `/admin/product-form.html?id=${id}`;
  };

  console.log('✅ Dashboard Products loaded');
})(window.AdminDashboard);
