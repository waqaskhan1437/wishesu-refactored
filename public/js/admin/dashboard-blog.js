/**
 * Dashboard Blog - Blog posts management
 */

(function(AD) {
  AD.loadBlog = async function(panel) {
    panel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-danger" onclick="deleteAllBlogs()">Delete All Blogs</button>
          <button class="btn btn-primary" onclick="window.location.href='/admin/blog-form.html'">+ Add Blog Post</button>
        </div>
      </div>
      <div class="table-container">
        <table id="blogs-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Thumbnail</th>
              <th>Title</th>
              <th>Status</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="blogs-tbody"></tbody>
        </table>
      </div>`;
    
    try {
      const data = await AD.apiFetch('/api/blogs/list');
      if (data.blogs) {
        AD.blogs = data.blogs;
        document.getElementById('blogs-tbody').innerHTML = AD.blogs.map(b => {
          const date = b.created_at ? new Date(b.created_at).toLocaleDateString() : '-';
          const statusClass = b.status === 'published' ? 'status-delivered' : 'status-pending';
          return `
            <tr>
              <td><strong>#${b.id}</strong></td>
              <td><img src="${b.thumbnail_url || 'https://via.placeholder.com/60x40?text=No+Image'}" style="width:60px;height:40px;object-fit:cover;border-radius:4px;"></td>
              <td>${b.title}</td>
              <td><span class="${statusClass}">${b.status}</span></td>
              <td>${date}</td>
              <td>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  <a href="/blog/${b.slug}" target="_blank" class="btn" style="background:#e0e7ff;color:#3730a3;font-size:0.85em;padding:4px 10px;">🔗 View</a>
                  <button class="btn" style="background:#3b82f6;color:white;font-size:0.85em;padding:4px 10px;" onclick="editBlog(${b.id})">✏️ Edit</button>
                  <button class="btn" style="background:#10b981;color:white;font-size:0.85em;padding:4px 10px;" onclick="duplicateBlog(${b.id})">📋 Duplicate</button>
                  <button class="btn" style="background:${b.status === 'published' ? '#f59e0b' : '#22c55e'};color:white;font-size:0.85em;padding:4px 10px;" onclick="toggleBlogStatus(${b.id}, '${b.status}')">${b.status === 'published' ? '📝 Draft' : '🚀 Publish'}</button>
                  <button class="btn" style="background:#ef4444;color:white;font-size:0.85em;padding:4px 10px;" onclick="deleteBlog(${b.id})">🗑️ Delete</button>
                </div>
              </td>
            </tr>
          `;
        }).join('') || '<tr><td colspan="6" style="text-align:center;padding:40px;color:#6b7280;">No blog posts yet</td></tr>';
      }
    } catch (err) {
      console.error('Blogs error:', err);
      panel.innerHTML += '<p style="color:red;padding:20px;">Error loading blogs</p>';
    }
  };

  // Edit blog
  window.editBlog = function(id) {
    window.location.href = `/admin/blog-form.html?id=${id}`;
  };

  // Toggle blog status
  window.toggleBlogStatus = async function(id, currentStatus) {
    const newStatus = currentStatus === 'published' ? 'draft' : 'published';
    
    try {
      const res = await fetch('/api/blogs/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus })
      });
      const data = await res.json();
      
      if (data.success) {
        AD.loadView('blog');
      } else {
        alert('Error: ' + (data.error || 'Failed to update status'));
      }
    } catch (err) {
      alert('Error updating status');
      console.error(err);
    }
  };

  // Duplicate blog
  window.duplicateBlog = async function(id) {
    if (!confirm('Duplicate this blog post?')) return;
    
    try {
      const res = await fetch('/api/blogs/duplicate', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      
      if (data.success) {
        alert('Blog duplicated! Redirecting to edit...');
        window.location.href = `/admin/blog-form.html?id=${data.id}`;
      } else {
        alert('Error: ' + (data.error || 'Failed to duplicate'));
      }
    } catch (err) {
      alert('Error duplicating blog');
      console.error(err);
    }
  };

  // Delete blog
  window.deleteBlog = async function(id) {
    if (!confirm('Are you sure you want to delete this blog post? This cannot be undone.')) return;
    
    try {
      const res = await fetch(`/api/blog/delete?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      
      if (data.success) {
        alert('Blog deleted!');
        AD.loadView('blog');
      } else {
        alert('Error: ' + (data.error || 'Failed to delete'));
      }
    } catch (err) {
      alert('Error deleting blog');
      console.error(err);
    }
  };

  // Delete all blogs
  window.deleteAllBlogs = async function() {
    if (!confirm('Delete ALL blogs?\n\nThis action is permanent and cannot be undone.')) return;

    const token = prompt('Type DELETE to confirm:', '');
    if (token !== 'DELETE') {
      alert('Cancelled. Confirmation text did not match.');
      return;
    }

    try {
      const res = await fetch('/api/admin/blogs/delete-all', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const deletedBlogs = data.count || 0;
        const deletedComments = data.deleted_blog_comments || 0;
        alert(`✅ Deleted ${deletedBlogs} blogs and ${deletedComments} related comments.`);
        AD.loadView('blog');
      } else {
        alert('Error: ' + (data.error || 'Failed to delete blogs'));
      }
    } catch (err) {
      alert('Error deleting all blogs');
      console.error(err);
    }
  };

  console.log('✅ Dashboard Blog loaded');
})(window.AdminDashboard);
