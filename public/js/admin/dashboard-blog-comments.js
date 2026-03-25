/**
 * Dashboard Blog Comments - Comment moderation
 */

(function(AD) {
  AD.loadBlogComments = async function(panel) {
    panel.innerHTML = `
      <div style="margin-bottom: 20px;">
        <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px;">
          <button class="btn filter-btn active" data-status="pending" onclick="filterComments('pending')">
            ⏳ Pending <span id="pending-count" class="badge">0</span>
          </button>
          <button class="btn filter-btn" data-status="approved" onclick="filterComments('approved')">
            ✅ Approved <span id="approved-count" class="badge">0</span>
          </button>
          <button class="btn filter-btn" data-status="all" onclick="filterComments('all')">
            📋 All
          </button>
        </div>
        <div id="bulk-actions" style="display: none; margin-bottom: 15px;">
          <button class="btn btn-primary" onclick="bulkApprove()">✅ Approve Selected</button>
          <button class="btn" style="background:#ef4444;color:white;" onclick="bulkReject()">❌ Reject Selected</button>
        </div>
      </div>
      <div class="table-container">
        <table id="comments-table">
          <thead>
            <tr>
              <th><input type="checkbox" id="select-all" onchange="toggleSelectAll(this)"></th>
              <th>Name</th>
              <th>Email</th>
              <th>Comment</th>
              <th>Blog Post</th>
              <th>Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="comments-tbody"></tbody>
        </table>
      </div>
      <style>
        .filter-btn { background: #e5e7eb; color: #374151; }
        .filter-btn.active { background: #3b82f6; color: white; }
        .badge { 
          background: rgba(255,255,255,0.3); 
          padding: 2px 8px; 
          border-radius: 10px; 
          font-size: 0.8em;
          margin-left: 5px;
        }
        .filter-btn.active .badge { background: rgba(255,255,255,0.3); }
        .comment-preview {
          max-width: 250px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .status-pending { background: #fef3c7; color: #92400e; }
        .status-approved { background: #d1fae5; color: #065f46; }
        .status-rejected { background: #fee2e2; color: #991b1b; }
      </style>`;
    
    window.currentCommentFilter = 'pending';
    await loadComments('pending');
  };

  window.loadComments = async function(status = 'all') {
    try {
      const url = status === 'all' ? '/api/admin/blog-comments' : `/api/admin/blog-comments?status=${status}`;
      const data = await AD.apiFetch(url);
      
      if (data.comments) {
        AD.blogComments = data.comments;
        
        // Update counts
        document.getElementById('pending-count').textContent = data.counts?.pending || 0;
        document.getElementById('approved-count').textContent = data.counts?.approved || 0;
        
        renderCommentsTable(data.comments);
      }
    } catch (err) {
      console.error('Comments error:', err);
    }
  };

  function renderCommentsTable(comments) {
    const tbody = document.getElementById('comments-tbody');
    
    if (!comments || comments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#6b7280;">No comments found</td></tr>';
      return;
    }
    
    tbody.innerHTML = comments.map(c => {
      const date = c.created_at ? new Date(c.created_at).toLocaleDateString() : '-';
      const statusClass = `status-${c.status}`;
      const shortComment = c.comment.length > 50 ? c.comment.substring(0, 50) + '...' : c.comment;
      
      return `
        <tr data-id="${c.id}">
          <td><input type="checkbox" class="comment-checkbox" value="${c.id}"></td>
          <td><strong>${escapeHtml(c.name)}</strong></td>
          <td><a href="mailto:${c.email}">${c.email}</a></td>
          <td class="comment-preview" title="${escapeHtml(c.comment)}">${escapeHtml(shortComment)}</td>
          <td>
            ${c.blog_title ? `<a href="/blog/${c.blog_slug}" target="_blank">${escapeHtml(c.blog_title)}</a>` : `Blog #${c.blog_id}`}
          </td>
          <td>${date}</td>
          <td><span class="${statusClass}" style="padding:4px 10px;border-radius:20px;font-size:0.85em;font-weight:600;">${c.status}</span></td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${c.status !== 'approved' ? `<button class="btn" style="background:#10b981;color:white;font-size:0.8em;padding:4px 8px;" onclick="updateCommentStatus(${c.id}, 'approved')">✅</button>` : ''}
              ${c.status !== 'rejected' ? `<button class="btn" style="background:#f59e0b;color:white;font-size:0.8em;padding:4px 8px;" onclick="updateCommentStatus(${c.id}, 'rejected')">❌</button>` : ''}
              <button class="btn" style="background:#3b82f6;color:white;font-size:0.8em;padding:4px 8px;" onclick="viewComment(${c.id})">👁️</button>
              <button class="btn" style="background:#ef4444;color:white;font-size:0.8em;padding:4px 8px;" onclick="deleteComment(${c.id})">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    
    // Add event listeners for checkboxes
    document.querySelectorAll('.comment-checkbox').forEach(cb => {
      cb.addEventListener('change', updateBulkActions);
    });
  }

  window.filterComments = function(status) {
    window.currentCommentFilter = status;
    
    // Update active button
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.status === status);
    });
    
    loadComments(status);
  };

  window.updateCommentStatus = async function(id, status) {
    try {
      const res = await fetch('/api/admin/blog-comments/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status })
      });
      const data = await res.json();
      
      if (data.success) {
        loadComments(window.currentCommentFilter);
      } else {
        alert('Error: ' + (data.error || 'Failed to update'));
      }
    } catch (err) {
      alert('Error updating comment');
      console.error(err);
    }
  };

  window.deleteComment = async function(id) {
    if (!confirm('Delete this comment permanently?')) return;
    
    try {
      const res = await fetch(`/api/admin/blog-comments/delete?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      
      if (data.success) {
        loadComments(window.currentCommentFilter);
      } else {
        alert('Error: ' + (data.error || 'Failed to delete'));
      }
    } catch (err) {
      alert('Error deleting comment');
      console.error(err);
    }
  };

  window.viewComment = function(id) {
    const comment = AD.blogComments.find(c => c.id === id);
    if (!comment) return;
    
    alert(`From: ${comment.name} (${comment.email})\n\nComment:\n${comment.comment}`);
  };

  window.toggleSelectAll = function(checkbox) {
    document.querySelectorAll('.comment-checkbox').forEach(cb => {
      cb.checked = checkbox.checked;
    });
    updateBulkActions();
  };

  function updateBulkActions() {
    const checked = document.querySelectorAll('.comment-checkbox:checked');
    document.getElementById('bulk-actions').style.display = checked.length > 0 ? 'block' : 'none';
  }

  window.bulkApprove = async function() {
    const ids = Array.from(document.querySelectorAll('.comment-checkbox:checked')).map(cb => parseInt(cb.value));
    if (ids.length === 0) return;
    
    if (!confirm(`Approve ${ids.length} comment(s)?`)) return;
    
    try {
      const res = await fetch('/api/admin/blog-comments/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status: 'approved' })
      });
      const data = await res.json();
      
      if (data.success) {
        loadComments(window.currentCommentFilter);
      }
    } catch (err) {
      alert('Error updating comments');
    }
  };

  window.bulkReject = async function() {
    const ids = Array.from(document.querySelectorAll('.comment-checkbox:checked')).map(cb => parseInt(cb.value));
    if (ids.length === 0) return;
    
    if (!confirm(`Reject ${ids.length} comment(s)?`)) return;
    
    try {
      const res = await fetch('/api/admin/blog-comments/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status: 'rejected' })
      });
      const data = await res.json();
      
      if (data.success) {
        loadComments(window.currentCommentFilter);
      }
    } catch (err) {
      alert('Error updating comments');
    }
  };

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  console.log('✅ Dashboard Blog Comments loaded');
})(window.AdminDashboard);
