/*
 * Admin Reviews List
 *
 * Displays all customer reviews across products in a simple table.
 * Each row shows the product title, author, rating, comment, status
 * and submission date.  Uses getAllReviews() from api.js.
 */

;(async function initReviewsPage() {
  const table = document.getElementById('reviews-table');
  if (!table) return;

  // Add modal HTML to page
  const modalHtml = `
    <div id="edit-review-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center;">
      <div style="background:white; padding:30px; border-radius:12px; max-width:500px; width:90%; max-height:90vh; overflow-y:auto;">
        <h3 style="margin:0 0 20px; color:#1f2937;">Edit Review</h3>
        <form id="edit-review-form">
          <input type="hidden" id="edit-review-id">
          <div style="margin-bottom:15px;">
            <label style="display:block; font-weight:600; margin-bottom:5px;">Author Name</label>
            <input type="text" id="edit-author" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; box-sizing:border-box;">
          </div>
          <div style="margin-bottom:15px;">
            <label style="display:block; font-weight:600; margin-bottom:5px;">Rating</label>
            <select id="edit-rating" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
              <option value="5">5 Stars</option>
              <option value="4">4 Stars</option>
              <option value="3">3 Stars</option>
              <option value="2">2 Stars</option>
              <option value="1">1 Star</option>
            </select>
          </div>
          <div style="margin-bottom:15px;">
            <label style="display:block; font-weight:600; margin-bottom:5px;">Comment</label>
            <textarea id="edit-comment" rows="4" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; box-sizing:border-box; resize:vertical;"></textarea>
          </div>
          <div style="margin-bottom:15px;">
            <label style="display:block; font-weight:600; margin-bottom:5px;">Status</label>
            <select id="edit-status" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px;">
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div style="margin-bottom:20px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="checkbox" id="edit-show-portfolio">
              <span>Show in Portfolio</span>
            </label>
          </div>
          <div style="display:flex; gap:10px; justify-content:flex-end;">
            <button type="button" id="cancel-edit-btn" style="padding:10px 20px; background:#6b7280; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Cancel</button>
            <button type="submit" style="padding:10px 20px; background:#667eea; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  const modal = document.getElementById('edit-review-modal');
  const editForm = document.getElementById('edit-review-form');
  const cancelBtn = document.getElementById('cancel-edit-btn');

  // Close modal on cancel
  cancelBtn.onclick = () => { modal.style.display = 'none'; };
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

  // Handle edit form submit
  editForm.onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-review-id').value;
    const data = {
      id: id,
      author_name: document.getElementById('edit-author').value.trim(),
      rating: document.getElementById('edit-rating').value,
      comment: document.getElementById('edit-comment').value.trim(),
      status: document.getElementById('edit-status').value,
      show_on_product: document.getElementById('edit-show-portfolio').checked ? 1 : 0
    };

    try {
      const res = await fetch('/api/reviews/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (result.success) {
        alert('✅ Review updated!');
        modal.style.display = 'none';
        location.reload();
      } else {
        alert('Error: ' + (result.error || 'Update failed'));
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Delete review function
  window.deleteReview = async (id) => {
    if (!confirm('Are you sure you want to delete this review?')) return;
    try {
      const res = await fetch(`/api/reviews/delete?id=${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        alert('✅ Review deleted!');
        location.reload();
      } else {
        alert('Error: ' + (result.error || 'Delete failed'));
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Edit review function
  window.editReview = (review) => {
    document.getElementById('edit-review-id').value = review.id;
    document.getElementById('edit-author').value = review.author_name || '';
    document.getElementById('edit-rating').value = review.rating || 5;
    document.getElementById('edit-comment').value = review.comment || '';
    document.getElementById('edit-status').value = review.status || 'approved';
    document.getElementById('edit-show-portfolio').checked = review.show_on_product == 1;
    modal.style.display = 'flex';
  };

  try {
    const resp = await getAllReviews();
    const reviews = (resp && resp.reviews) || [];
    if (!reviews.length) {
      table.innerHTML = '<tbody><tr><td colspan="8" style="text-align:center; padding: 2rem;">No reviews found.</td></tr></tbody>';
      return;
    }
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th style="width:50px;">ID</th>
        <th>Product</th>
        <th>Author</th>
        <th>Rating</th>
        <th>Comment</th>
        <th>Status</th>
        <th>Date</th>
        <th style="width:120px;">Actions</th>
      </tr>
    `;
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    reviews.forEach(rv => {
      const row = document.createElement('tr');
      
      // ID
      const tdId = document.createElement('td');
      tdId.textContent = rv.id;
      row.appendChild(tdId);
      
      // Product
      const tdProduct = document.createElement('td');
      tdProduct.textContent = rv.product_title || `Product #${rv.product_id}`;
      row.appendChild(tdProduct);
      
      // Author
      const tdAuthor = document.createElement('td');
      tdAuthor.textContent = rv.author_name || 'Anonymous';
      row.appendChild(tdAuthor);
      
      // Rating
      const tdRating = document.createElement('td');
      tdRating.textContent = rv.rating != null ? '⭐'.repeat(Math.round(rv.rating)) : '–';
      row.appendChild(tdRating);
      
      // Comment (truncated)
      const tdComment = document.createElement('td');
      const comment = rv.comment || '';
      tdComment.textContent = comment.length > 50 ? comment.substring(0, 50) + '...' : comment;
      tdComment.title = comment;
      tdComment.style.maxWidth = '200px';
      tdComment.style.overflow = 'hidden';
      tdComment.style.textOverflow = 'ellipsis';
      tdComment.style.whiteSpace = 'nowrap';
      row.appendChild(tdComment);
      
      // Status
      const tdStatus = document.createElement('td');
      const status = rv.status || 'approved';
      tdStatus.innerHTML = `<span style="padding:4px 8px;border-radius:4px;font-size:12px;font-weight:600;background:${status === 'approved' ? '#d1fae5' : status === 'pending' ? '#fef3c7' : '#fee2e2'};color:${status === 'approved' ? '#065f46' : status === 'pending' ? '#92400e' : '#991b1b'}">${status}</span>`;
      row.appendChild(tdStatus);
      
      // Date
      const tdDate = document.createElement('td');
      tdDate.textContent = rv.created_at ? new Date(rv.created_at).toLocaleDateString() : '–';
      tdDate.style.fontSize = '13px';
      tdDate.style.color = '#6b7280';
      row.appendChild(tdDate);
      
      // Actions
      const tdActions = document.createElement('td');
      tdActions.innerHTML = `
        <button onclick='editReview(${JSON.stringify(rv).replace(/'/g, "&#39;")})' style="padding:6px 10px;background:#667eea;color:white;border:none;border-radius:4px;cursor:pointer;margin-right:5px;font-size:12px;">✏️ Edit</button>
        <button onclick="deleteReview(${rv.id})" style="padding:6px 10px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;">🗑️</button>
      `;
      row.appendChild(tdActions);
      
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
  } catch (err) {
    console.error(err);
    table.innerHTML = `<tbody><tr><td colspan="8" style="color:red; text-align:center;">Error loading reviews: ${err.message}</td></tr></tbody>`;
  }
})();
