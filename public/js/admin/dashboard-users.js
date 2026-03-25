/**
 * Dashboard Users - All users from orders and blog comments
 */

(function(AD) {
  AD.loadUsers = async function(panel) {
    panel.innerHTML = `
      <div style="margin-bottom: 20px;">
        <div style="display: flex; gap: 15px; align-items: center; flex-wrap: wrap;">
          <div style="position: relative; flex: 1; min-width: 250px;">
            <input type="text" id="user-search" placeholder="🔍 Search by email or name..." 
              style="width: 100%; padding: 12px 15px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 1rem;">
          </div>
          <div style="display: flex; gap: 10px;">
            <select id="user-filter" style="padding: 12px 15px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 1rem;">
              <option value="all">All Users</option>
              <option value="orders">With Orders</option>
              <option value="comments">With Comments</option>
              <option value="forum">Forum Active</option>
              <option value="both">Orders & Comments</option>
            </select>
          </div>
        </div>
      </div>
      
      <div class="stats-grid" style="margin-bottom: 25px;">
        <div class="stat-card">
          <div class="stat-value" id="total-users">-</div>
          <div class="stat-label">Total Users</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="users-with-orders">-</div>
          <div class="stat-label">With Orders</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="users-with-comments">-</div>
          <div class="stat-label">With Comments</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="users-with-forum">-</div>
          <div class="stat-label">Forum Active</div>
        </div>
      </div>
      
      <div class="table-container">
        <table id="users-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Email</th>
              <th style="text-align:center;">📦 Orders</th>
              <th style="text-align:center;">💬 Comments</th>
              <th style="text-align:center;">🗣️ Forum</th>
              <th>Last Activity</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="users-tbody"></tbody>
        </table>
      </div>
      
      <!-- User Details Modal -->
      <div id="user-modal" class="user-modal-overlay">
        <div class="user-modal-content">
          <div class="user-modal-header">
            <h3 id="modal-user-email">User Details</h3>
            <button onclick="closeUserModal()" class="modal-close-btn">×</button>
          </div>
          <div class="user-modal-body" id="modal-body">
            <!-- Content loaded dynamically -->
          </div>
        </div>
      </div>
      
      <style>
        .user-modal-overlay {
          display: none;
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.6);
          z-index: 1000;
          justify-content: center;
          align-items: center;
        }
        .user-modal-overlay.active { display: flex; }
        .user-modal-content {
          background: white;
          border-radius: 12px;
          width: 90%;
          max-width: 900px;
          max-height: 85vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .user-modal-header {
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .user-modal-header h3 { margin: 0; }
        .modal-close-btn {
          background: none;
          border: none;
          color: white;
          font-size: 1.8rem;
          cursor: pointer;
          line-height: 1;
        }
        .user-modal-body {
          padding: 25px;
          overflow-y: auto;
          flex: 1;
        }
        .user-section {
          margin-bottom: 30px;
        }
        .user-section h4 {
          font-size: 1.1rem;
          color: #374151;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 2px solid #e5e7eb;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .user-section-count {
          background: #667eea;
          color: white;
          padding: 2px 10px;
          border-radius: 12px;
          font-size: 0.85rem;
        }
        .mini-card {
          background: #f9fafb;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 10px;
        }
        .mini-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .mini-card-title {
          font-weight: 600;
          color: #1f2937;
        }
        .mini-card-date {
          font-size: 0.85rem;
          color: #6b7280;
        }
        .mini-card-content {
          color: #4b5563;
          font-size: 0.95rem;
        }
        .order-status {
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .order-status.delivered { background: #d1fae5; color: #065f46; }
        .order-status.paid { background: #fef3c7; color: #92400e; }
        .order-status.pending { background: #e0e7ff; color: #3730a3; }
        .comment-status {
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .comment-status.approved { background: #d1fae5; color: #065f46; }
        .comment-status.pending { background: #fef3c7; color: #92400e; }
        .comment-status.rejected { background: #fee2e2; color: #991b1b; }
        .forum-status { padding: 3px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 600; }
        .forum-status.approved { background: #d1fae5; color: #065f46; }
        .forum-status.pending { background: #fef3c7; color: #92400e; }
        .forum-status.rejected { background: #fee2e2; color: #991b1b; }
        .no-data {
          text-align: center;
          padding: 20px;
          color: #9ca3af;
        }
        .email-link {
          color: #667eea;
          text-decoration: none;
        }
        .email-link:hover {
          text-decoration: underline;
        }
        .user-avatar {
          width: 36px;
          height: 36px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 700;
          font-size: 0.9rem;
        }
        .user-name-cell {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .count-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 28px;
          height: 28px;
          padding: 0 8px;
          border-radius: 14px;
          font-weight: 600;
          font-size: 0.9rem;
        }
        .count-badge.orders {
          background: #dbeafe;
          color: #1e40af;
        }
        .count-badge.comments {
          background: #fef3c7;
          color: #92400e;
        }
        .count-badge.forum {
          background: #d1fae5;
          color: #065f46;
        }
        .count-badge.zero {
          background: #f3f4f6;
          color: #9ca3af;
        }
      </style>`;
    
    // Setup search and filter
    document.getElementById('user-search').addEventListener('input', debounce(filterUsers, 300));
    document.getElementById('user-filter').addEventListener('change', filterUsers);
    
    await loadUsers();
  };

  let allUsers = [];

  async function loadUsers() {
    try {
      const data = await AD.apiFetch('/api/admin/users');
      
      if (data.users) {
        allUsers = data.users;
        
        // Update stats
        const withOrders = allUsers.filter(u => u.order_count > 0).length;
        const withComments = allUsers.filter(u => u.comment_count > 0).length;
        const withForum = allUsers.filter(u => (u.forum_count || 0) > 0).length;
        
        document.getElementById('total-users').textContent = allUsers.length;
        document.getElementById('users-with-orders').textContent = withOrders;
        document.getElementById('users-with-comments').textContent = withComments;
        document.getElementById('users-with-forum').textContent = withForum;
        
        renderUsersTable(allUsers);
      }
    } catch (err) {
      console.error('Users error:', err);
      document.getElementById('users-tbody').innerHTML = 
        '<tr><td colspan="8" style="text-align:center;padding:40px;color:#ef4444;">Error loading users</td></tr>';
    }
  }

  function renderUsersTable(users) {
    const tbody = document.getElementById('users-tbody');
    
    if (!users || users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#6b7280;">No users found</td></tr>';
      return;
    }
    
    tbody.innerHTML = users.map((u, i) => {
      const initial = (u.name || u.email || '?').charAt(0).toUpperCase();
      const displayName = u.name || '-';
      const lastActivity = u.last_activity ? formatDate(u.last_activity) : '-';
      
      const orderBadgeClass = u.order_count > 0 ? 'orders' : 'zero';
      const commentBadgeClass = u.comment_count > 0 ? 'comments' : 'zero';
      const forumBadgeClass = u.forum_count > 0 ? 'forum' : 'zero';
      
      return `
        <tr>
          <td>${i + 1}</td>
          <td>
            <div class="user-name-cell">
              <div class="user-avatar">${initial}</div>
              <span>${escapeHtml(displayName)}</span>
            </div>
          </td>
          <td><a href="mailto:${u.email}" class="email-link">${u.email}</a></td>
          <td style="text-align:center;">
            <span class="count-badge ${orderBadgeClass}">${u.order_count}</span>
          </td>
          <td style="text-align:center;">
            <span class="count-badge ${commentBadgeClass}">${u.comment_count}</span>
          </td>
          <td style="text-align:center;">
            <span class="count-badge ${forumBadgeClass}">${u.forum_count || 0}</span>
          </td>
          <td>${lastActivity}</td>
          <td>
            <button class="btn btn-primary" style="font-size:0.85em;padding:6px 12px;" onclick="viewUserDetails('${escapeHtml(u.email)}')">
              👁️ View Details
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function filterUsers() {
    const search = document.getElementById('user-search').value.toLowerCase().trim();
    const filter = document.getElementById('user-filter').value;
    
    let filtered = allUsers;
    
    // Apply search
    if (search) {
      filtered = filtered.filter(u => 
        (u.email && u.email.toLowerCase().includes(search)) ||
        (u.name && u.name.toLowerCase().includes(search))
      );
    }
    
    // Apply filter
    if (filter === 'orders') {
      filtered = filtered.filter(u => u.order_count > 0);
    } else if (filter === 'comments') {
      filtered = filtered.filter(u => u.comment_count > 0);
    } else if (filter === 'forum') {
      filtered = filtered.filter(u => (u.forum_count || 0) > 0);
    } else if (filter === 'both') {
      filtered = filtered.filter(u => u.order_count > 0 && u.comment_count > 0);
    }
    
    renderUsersTable(filtered);
  }

  window.viewUserDetails = async function(email) {
    const modal = document.getElementById('user-modal');
    const modalBody = document.getElementById('modal-body');
    
    document.getElementById('modal-user-email').textContent = email;
    modalBody.innerHTML = '<div style="text-align:center;padding:40px;"><div class="loading-spinner"></div><p>Loading...</p></div>';
    modal.classList.add('active');
    
    try {
      const data = await AD.apiFetch(`/api/admin/user-details?email=${encodeURIComponent(email)}`);
      
      let html = '';
      
      // Orders section
      html += `
        <div class="user-section">
          <h4>📦 Orders <span class="user-section-count">${data.orders?.length || 0}</span></h4>
      `;
      
      if (data.orders && data.orders.length > 0) {
        html += data.orders.map(o => {
          const date = o.created_at ? formatDate(new Date(o.created_at).getTime()) : '-';
          const statusClass = (o.status || 'pending').toLowerCase();
          return `
            <div class="mini-card">
              <div class="mini-card-header">
                <span class="mini-card-title">Order #${o.order_id || o.id}</span>
                <span class="order-status ${statusClass}">${o.status || 'pending'}</span>
              </div>
              <div class="mini-card-content">
                <div>📅 ${date}</div>
                ${o.buyer_name ? `<div>👤 ${escapeHtml(o.buyer_name)}</div>` : ''}
              </div>
            </div>
          `;
        }).join('');
      } else {
        html += '<div class="no-data">No orders found</div>';
      }
      html += '</div>';
      
      // Blog Comments section
      html += `
        <div class="user-section">
          <h4>💬 Blog Comments <span class="user-section-count">${data.comments?.length || 0}</span></h4>
      `;
      
      if (data.comments && data.comments.length > 0) {
        html += data.comments.map(c => {
          const date = c.created_at ? formatDate(c.created_at) : '-';
          const statusClass = (c.status || 'pending').toLowerCase();
          const shortComment = c.comment.length > 150 ? c.comment.substring(0, 150) + '...' : c.comment;
          return `
            <div class="mini-card">
              <div class="mini-card-header">
                <span class="mini-card-title">${c.blog_title ? escapeHtml(c.blog_title) : 'Blog #' + c.blog_id}</span>
                <span class="comment-status ${statusClass}">${c.status || 'pending'}</span>
              </div>
              <div class="mini-card-content">
                <div style="margin-bottom:8px;">"${escapeHtml(shortComment)}"</div>
                <div style="font-size:0.85rem;color:#6b7280;">📅 ${date}</div>
              </div>
            </div>
          `;
        }).join('');
      } else {
        html += '<div class="no-data">No comments found</div>';
      }
      html += '</div>';
      
      // Forum Questions section
      html += `
        <div class="user-section">
          <h4>❓ Forum Questions <span class="user-section-count">${data.forumQuestions?.length || 0}</span></h4>
      `;
      
      if (data.forumQuestions && data.forumQuestions.length > 0) {
        html += data.forumQuestions.map(q => {
          const date = q.created_at ? formatDate(q.created_at) : '-';
          const statusClass = (q.status || 'pending').toLowerCase();
          return `
            <div class="mini-card">
              <div class="mini-card-header">
                <span class="mini-card-title">${escapeHtml(q.title)}</span>
                <span class="forum-status ${statusClass}">${q.status || 'pending'}</span>
              </div>
              <div class="mini-card-content">
                <div style="font-size:0.85rem;color:#6b7280;">📅 ${date} • 💬 ${q.reply_count || 0} replies</div>
              </div>
            </div>
          `;
        }).join('');
      } else {
        html += '<div class="no-data">No questions found</div>';
      }
      html += '</div>';
      
      // Forum Replies section
      html += `
        <div class="user-section">
          <h4>💬 Forum Replies <span class="user-section-count">${data.forumReplies?.length || 0}</span></h4>
      `;
      
      if (data.forumReplies && data.forumReplies.length > 0) {
        html += data.forumReplies.map(r => {
          const date = r.created_at ? formatDate(r.created_at) : '-';
          const statusClass = (r.status || 'pending').toLowerCase();
          const shortContent = r.content.length > 100 ? r.content.substring(0, 100) + '...' : r.content;
          return `
            <div class="mini-card">
              <div class="mini-card-header">
                <span class="mini-card-title">${r.question_title ? escapeHtml(r.question_title) : 'Question #' + r.question_id}</span>
                <span class="forum-status ${statusClass}">${r.status || 'pending'}</span>
              </div>
              <div class="mini-card-content">
                <div style="margin-bottom:8px;">"${escapeHtml(shortContent)}"</div>
                <div style="font-size:0.85rem;color:#6b7280;">📅 ${date}</div>
              </div>
            </div>
          `;
        }).join('');
      } else {
        html += '<div class="no-data">No replies found</div>';
      }
      html += '</div>';
      
      modalBody.innerHTML = html;
      
    } catch (err) {
      console.error('User details error:', err);
      modalBody.innerHTML = '<div class="no-data" style="color:#ef4444;">Error loading user details</div>';
    }
  };

  window.closeUserModal = function() {
    document.getElementById('user-modal').classList.remove('active');
  };

  // Close modal on overlay click
  document.addEventListener('click', function(e) {
    if (e.target.id === 'user-modal') {
      closeUserModal();
    }
  });

  function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  console.log('✅ Dashboard Users loaded');
})(window.AdminDashboard);
