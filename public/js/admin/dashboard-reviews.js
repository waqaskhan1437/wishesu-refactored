/**
 * Dashboard Reviews - Review management
 */

(function(AD) {
  AD.loadReviews = async function(panel) {
    panel.innerHTML = `
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

            <!-- Delivery / Portfolio media overrides -->
            <div style="margin-bottom:15px;">
              <label style="display:block; font-weight:600; margin-bottom:5px;">Delivery Video URL (optional override)</label>
              <input type="url" id="edit-delivered-video-url" placeholder="https://..." style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; box-sizing:border-box;">
              <div style="font-size:12px;color:#6b7280;margin-top:6px;line-height:1.4;">
                If the original delivery link expired/broke, paste the new working video URL here.
                Leave empty to use the order's delivery link (if available).
              </div>
            </div>
            <div style="margin-bottom:15px;">
              <label style="display:block; font-weight:600; margin-bottom:5px;">Delivery Thumbnail URL (optional override)</label>
              <input type="url" id="edit-delivered-thumbnail-url" placeholder="https://..." style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; box-sizing:border-box;">
              <div style="font-size:12px;color:#6b7280;margin-top:6px;line-height:1.4;">
                Use this to fix broken thumbnails. Leave empty to fall back.
              </div>
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
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Author</th>
              <th>Rating</th>
              <th>Comment</th>
              <th>Product</th>
              <th>Status</th>
              <th>Date</th>
              <th style="width:140px;">Actions</th>
            </tr>
          </thead>
          <tbody id="reviews-tbody">
            <tr><td colspan="8" style="text-align: center;">Loading...</td></tr>
          </tbody>
        </table>
      </div>`;
    
    // Setup modal handlers
    const modal = document.getElementById('edit-review-modal');
    const editForm = document.getElementById('edit-review-form');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    
    cancelBtn.onclick = () => { modal.style.display = 'none'; };
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    
    editForm.onsubmit = async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-review-id').value;
      const data = {
        id: id,
        author_name: document.getElementById('edit-author').value.trim(),
        rating: document.getElementById('edit-rating').value,
        comment: document.getElementById('edit-comment').value.trim(),
        status: document.getElementById('edit-status').value,
        show_on_product: document.getElementById('edit-show-portfolio').checked ? 1 : 0,
        delivered_video_url: document.getElementById('edit-delivered-video-url').value.trim(),
        delivered_thumbnail_url: document.getElementById('edit-delivered-thumbnail-url').value.trim()
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
          AD.loadReviews(panel);
        } else {
          alert('Error: ' + (result.error || 'Update failed'));
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    };
    
    // Delete function
    window.deleteReview = async (id) => {
      if (!confirm('Are you sure you want to delete this review?')) return;
      try {
        const res = await fetch(`/api/reviews/delete?id=${id}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) {
          alert('✅ Review deleted!');
          AD.loadReviews(panel);
        } else {
          alert('Error: ' + (result.error || 'Delete failed'));
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    };
    
    // Edit function
    window.editReview = (review) => {
      document.getElementById('edit-review-id').value = review.id;
      document.getElementById('edit-author').value = review.author_name || '';
      document.getElementById('edit-rating').value = review.rating || 5;
      document.getElementById('edit-comment').value = review.comment || '';
      document.getElementById('edit-status').value = review.status || 'approved';
      document.getElementById('edit-show-portfolio').checked = review.show_on_product == 1;
      document.getElementById('edit-delivered-video-url').value = review.delivered_video_url || '';
      document.getElementById('edit-delivered-thumbnail-url').value = review.delivered_thumbnail_url || '';
      modal.style.display = 'flex';
    };
    
    try {
      // Bypass cache for admin so edits reflect immediately
      const data = await AD.apiFetch('/api/reviews?admin=1');
      if (data.reviews) {
        AD.reviews = data.reviews;
        document.getElementById('reviews-tbody').innerHTML = AD.reviews.map(r => {
          const status = r.status || 'approved';
          const statusColor = status === 'approved' ? '#d1fae5;color:#065f46' : status === 'pending' ? '#fef3c7;color:#92400e' : '#fee2e2;color:#991b1b';
          const comment = r.comment || '';
          const shortComment = comment.length > 40 ? comment.substring(0, 40) + '...' : comment;
          const reviewJson = JSON.stringify(r).replace(/'/g, "&#39;").replace(/"/g, "&quot;");
          
          return `<tr>
            <td>${r.id}</td>
            <td>${r.author_name || 'Anonymous'}</td>
            <td style="color:#fbbf24;">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</td>
            <td title="${comment}" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${shortComment}</td>
            <td>${r.product_title || 'Product #' + r.product_id}</td>
            <td><span style="padding:4px 8px;border-radius:4px;font-size:12px;font-weight:600;background:${statusColor}">${status}</span></td>
            <td>${AD.formatDate(r.created_at)}</td>
            <td>
              <button onclick='editReview(${reviewJson})' style="padding:5px 8px;background:#667eea;color:white;border:none;border-radius:4px;cursor:pointer;margin-right:4px;font-size:11px;">✏️ Edit</button>
              <button onclick="deleteReview(${r.id})" style="padding:5px 8px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;">🗑️</button>
            </td>
          </tr>`;
        }).join('');
      }
    } catch (err) { 
      document.getElementById('reviews-tbody').innerHTML = '<tr><td colspan="8" style="color: red;">Error loading reviews</td></tr>'; 
    }
  };

  console.log('✅ Dashboard Reviews loaded');
})(window.AdminDashboard);
