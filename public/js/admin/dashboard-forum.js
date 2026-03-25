/**
 * Dashboard Forum - Question and Reply moderation
 */

(function(AD) {
  AD.loadForum = async function(panel) {
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
        <h2 style="margin:0;color:#1f2937;font-size:1.35rem;">Forum Moderation</h2>
        <button class="btn btn-danger" onclick="deleteAllForumContent()">Delete All Forum Data</button>
      </div>
      <div class="forum-admin-tabs" style="margin-bottom: 20px;">
        <button class="tab-btn active" onclick="switchForumTab('questions')">❓ Questions</button>
        <button class="tab-btn" onclick="switchForumTab('replies')">💬 Replies</button>
      </div>
      
      <div id="forum-questions-tab">
        <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px;">
          <button class="btn filter-btn active" data-status="pending" onclick="filterQuestions('pending')">
            ⏳ Pending <span id="q-pending-count" class="badge">0</span>
          </button>
          <button class="btn filter-btn" data-status="approved" onclick="filterQuestions('approved')">
            ✅ Approved <span id="q-approved-count" class="badge">0</span>
          </button>
          <button class="btn filter-btn" data-status="all" onclick="filterQuestions('all')">
            📋 All
          </button>
        </div>
        <div class="table-container">
          <table id="questions-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Author</th>
                <th>Email</th>
                <th>Date</th>
                <th>Replies</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="questions-tbody"></tbody>
          </table>
        </div>
      </div>
      
      <div id="forum-replies-tab" style="display:none;">
        <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px;">
          <button class="btn filter-btn active" data-status="pending" onclick="filterReplies('pending')">
            ⏳ Pending <span id="r-pending-count" class="badge">0</span>
          </button>
          <button class="btn filter-btn" data-status="approved" onclick="filterReplies('approved')">
            ✅ Approved <span id="r-approved-count" class="badge">0</span>
          </button>
          <button class="btn filter-btn" data-status="all" onclick="filterReplies('all')">
            📋 All
          </button>
        </div>
        <div class="table-container">
          <table id="replies-table">
            <thead>
              <tr>
                <th>Reply</th>
                <th>Question</th>
                <th>Author</th>
                <th>Email</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="replies-tbody"></tbody>
          </table>
        </div>
      </div>
      
      <!-- View Modal -->
      <div id="forum-view-modal" class="forum-modal-overlay">
        <div class="forum-modal-content">
          <div class="forum-modal-header">
            <h3 id="modal-title">View Content</h3>
            <button onclick="closeForumModal()" class="modal-close-btn">×</button>
          </div>
          <div class="forum-modal-body" id="modal-content"></div>
        </div>
      </div>
      
      <style>
        .forum-admin-tabs { display: flex; gap: 10px; }
        .tab-btn {
          padding: 12px 24px;
          border: 2px solid #e5e7eb;
          background: white;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          font-size: 1rem;
          transition: all 0.2s;
        }
        .tab-btn:hover { border-color: #10b981; }
        .tab-btn.active {
          background: #10b981;
          border-color: #10b981;
          color: white;
        }
        .filter-btn { background: #e5e7eb; color: #374151; }
        .filter-btn.active { background: #10b981; color: white; }
        .badge { 
          background: rgba(255,255,255,0.3); 
          padding: 2px 8px; 
          border-radius: 10px; 
          font-size: 0.8em;
          margin-left: 5px;
        }
        .status-pending { background: #fef3c7; color: #92400e; }
        .status-approved { background: #d1fae5; color: #065f46; }
        .status-rejected { background: #fee2e2; color: #991b1b; }
        .content-preview {
          max-width: 200px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .forum-modal-overlay {
          display: none;
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.6);
          z-index: 1000;
          justify-content: center;
          align-items: center;
        }
        .forum-modal-overlay.active { display: flex; }
        .forum-modal-content {
          background: white;
          border-radius: 12px;
          width: 90%;
          max-width: 600px;
          max-height: 80vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .forum-modal-header {
          padding: 20px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .forum-modal-header h3 { margin: 0; }
        .modal-close-btn {
          background: none;
          border: none;
          color: white;
          font-size: 1.8rem;
          cursor: pointer;
          line-height: 1;
        }
        .forum-modal-body {
          padding: 25px;
          overflow-y: auto;
          flex: 1;
        }
        .detail-row {
          margin-bottom: 15px;
        }
        .detail-label {
          font-weight: 600;
          color: #6b7280;
          font-size: 0.85rem;
          margin-bottom: 5px;
        }
        .detail-value {
          color: #1f2937;
          line-height: 1.5;
        }
      </style>`;
    
    window.currentQFilter = 'pending';
    window.currentRFilter = 'pending';
    await loadQuestions('pending');
    await loadReplies('pending');
  };

  window.switchForumTab = function(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    document.getElementById('forum-questions-tab').style.display = tab === 'questions' ? 'block' : 'none';
    document.getElementById('forum-replies-tab').style.display = tab === 'replies' ? 'block' : 'none';
  };

  window.deleteAllForumContent = async function() {
    if (!confirm('Delete ALL forum questions and replies?\n\nThis action is permanent and cannot be undone.')) return;

    const token = prompt('Type DELETE to confirm:', '');
    if (token !== 'DELETE') {
      alert('Cancelled. Confirmation text did not match.');
      return;
    }

    try {
      const res = await fetch('/api/admin/forum/delete-all', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Deleted ${data.questions_deleted || 0} questions and ${data.replies_deleted || 0} replies.`);
        AD.loadView('forum');
      } else {
        alert('Error: ' + (data.error || 'Failed to delete forum data'));
      }
    } catch (err) {
      alert('Error deleting forum data');
      console.error(err);
    }
  };

  // Questions
  async function loadQuestions(status = 'all') {
    try {
      const url = status === 'all' ? '/api/admin/forum/questions' : `/api/admin/forum/questions?status=${status}`;
      const data = await AD.apiFetch(url);
      
      if (data.questions) {
        AD.forumQuestions = data.questions;
        document.getElementById('q-pending-count').textContent = data.counts?.pending || 0;
        document.getElementById('q-approved-count').textContent = data.counts?.approved || 0;
        renderQuestionsTable(data.questions);
      }
    } catch (err) {
      console.error('Questions error:', err);
    }
  }

  function renderQuestionsTable(questions) {
    const tbody = document.getElementById('questions-tbody');
    
    if (!questions || questions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#6b7280;">No questions found</td></tr>';
      return;
    }
    
    tbody.innerHTML = questions.map(q => {
      const date = q.created_at ? new Date(q.created_at).toLocaleDateString() : '-';
      const statusClass = `status-${q.status}`;
      
      return `
        <tr>
          <td><strong>${escapeHtml(q.title.substring(0, 50))}${q.title.length > 50 ? '...' : ''}</strong></td>
          <td>${escapeHtml(q.name)}</td>
          <td><a href="mailto:${q.email}">${q.email}</a></td>
          <td>${date}</td>
          <td>${q.reply_count || 0}</td>
          <td><span class="${statusClass}" style="padding:4px 10px;border-radius:20px;font-size:0.85em;font-weight:600;">${q.status}</span></td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${q.status !== 'approved' ? `<button class="btn" style="background:#10b981;color:white;font-size:0.8em;padding:4px 8px;" onclick="updateQuestionStatus(${q.id}, 'approved')">✅</button>` : ''}
              ${q.status !== 'rejected' ? `<button class="btn" style="background:#f59e0b;color:white;font-size:0.8em;padding:4px 8px;" onclick="updateQuestionStatus(${q.id}, 'rejected')">❌</button>` : ''}
              <button class="btn" style="background:#3b82f6;color:white;font-size:0.8em;padding:4px 8px;" onclick="viewQuestion(${q.id})">👁️</button>
              ${q.status === 'approved' ? `<a href="/forum/${q.slug}" target="_blank" class="btn" style="background:#6366f1;color:white;font-size:0.8em;padding:4px 8px;text-decoration:none;">🔗</a>` : ''}
              <button class="btn" style="background:#ef4444;color:white;font-size:0.8em;padding:4px 8px;" onclick="deleteQuestion(${q.id})">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  window.filterQuestions = function(status) {
    window.currentQFilter = status;
    document.querySelectorAll('#forum-questions-tab .filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.status === status);
    });
    loadQuestions(status);
  };

  window.updateQuestionStatus = async function(id, status) {
    try {
      const res = await fetch('/api/admin/forum/question-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status })
      });
      const data = await res.json();
      if (data.success) {
        loadQuestions(window.currentQFilter);
      } else {
        alert('Error: ' + (data.error || 'Failed'));
      }
    } catch (err) {
      alert('Error updating');
    }
  };

  window.deleteQuestion = async function(id) {
    if (!confirm('Delete this question and all its replies?')) return;
    
    try {
      const res = await fetch(`/api/admin/forum/question?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        loadQuestions(window.currentQFilter);
        loadReplies(window.currentRFilter);
      } else {
        alert('Error: ' + (data.error || 'Failed'));
      }
    } catch (err) {
      alert('Error deleting');
    }
  };

  window.viewQuestion = function(id) {
    const q = AD.forumQuestions.find(x => x.id === id);
    if (!q) return;
    
    document.getElementById('modal-title').textContent = 'Question Details';
    document.getElementById('modal-content').innerHTML = `
      <div class="detail-row">
        <div class="detail-label">Title</div>
        <div class="detail-value"><strong>${escapeHtml(q.title)}</strong></div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Author</div>
        <div class="detail-value">${escapeHtml(q.name)} (${q.email})</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Status</div>
        <div class="detail-value"><span class="status-${q.status}" style="padding:4px 12px;border-radius:20px;font-weight:600;">${q.status}</span></div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Content</div>
        <div class="detail-value" style="white-space:pre-wrap;background:#f9fafb;padding:15px;border-radius:8px;">${escapeHtml(q.content)}</div>
      </div>
    `;
    document.getElementById('forum-view-modal').classList.add('active');
  };

  // Replies
  async function loadReplies(status = 'all') {
    try {
      const url = status === 'all' ? '/api/admin/forum/replies' : `/api/admin/forum/replies?status=${status}`;
      const data = await AD.apiFetch(url);
      
      if (data.replies) {
        AD.forumReplies = data.replies;
        document.getElementById('r-pending-count').textContent = data.counts?.pending || 0;
        document.getElementById('r-approved-count').textContent = data.counts?.approved || 0;
        renderRepliesTable(data.replies);
      }
    } catch (err) {
      console.error('Replies error:', err);
    }
  }

  function renderRepliesTable(replies) {
    const tbody = document.getElementById('replies-tbody');
    
    if (!replies || replies.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#6b7280;">No replies found</td></tr>';
      return;
    }
    
    tbody.innerHTML = replies.map(r => {
      const date = r.created_at ? new Date(r.created_at).toLocaleDateString() : '-';
      const statusClass = `status-${r.status}`;
      const shortContent = r.content.length > 50 ? r.content.substring(0, 50) + '...' : r.content;
      
      return `
        <tr>
          <td class="content-preview" title="${escapeHtml(r.content)}">${escapeHtml(shortContent)}</td>
          <td>${r.question_title ? escapeHtml(r.question_title.substring(0, 30)) + '...' : 'Q#' + r.question_id}</td>
          <td>${escapeHtml(r.name)}</td>
          <td><a href="mailto:${r.email}">${r.email}</a></td>
          <td>${date}</td>
          <td><span class="${statusClass}" style="padding:4px 10px;border-radius:20px;font-size:0.85em;font-weight:600;">${r.status}</span></td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${r.status !== 'approved' ? `<button class="btn" style="background:#10b981;color:white;font-size:0.8em;padding:4px 8px;" onclick="updateReplyStatus(${r.id}, 'approved')">✅</button>` : ''}
              ${r.status !== 'rejected' ? `<button class="btn" style="background:#f59e0b;color:white;font-size:0.8em;padding:4px 8px;" onclick="updateReplyStatus(${r.id}, 'rejected')">❌</button>` : ''}
              <button class="btn" style="background:#3b82f6;color:white;font-size:0.8em;padding:4px 8px;" onclick="viewReply(${r.id})">👁️</button>
              <button class="btn" style="background:#ef4444;color:white;font-size:0.8em;padding:4px 8px;" onclick="deleteReply(${r.id})">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  window.filterReplies = function(status) {
    window.currentRFilter = status;
    document.querySelectorAll('#forum-replies-tab .filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.status === status);
    });
    loadReplies(status);
  };

  window.updateReplyStatus = async function(id, status) {
    try {
      const res = await fetch('/api/admin/forum/reply-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status })
      });
      const data = await res.json();
      if (data.success) {
        loadReplies(window.currentRFilter);
      } else {
        alert('Error: ' + (data.error || 'Failed'));
      }
    } catch (err) {
      alert('Error updating');
    }
  };

  window.deleteReply = async function(id) {
    if (!confirm('Delete this reply?')) return;
    
    try {
      const res = await fetch(`/api/admin/forum/reply?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        loadReplies(window.currentRFilter);
      } else {
        alert('Error: ' + (data.error || 'Failed'));
      }
    } catch (err) {
      alert('Error deleting');
    }
  };

  window.viewReply = function(id) {
    const r = AD.forumReplies.find(x => x.id === id);
    if (!r) return;
    
    document.getElementById('modal-title').textContent = 'Reply Details';
    document.getElementById('modal-content').innerHTML = `
      <div class="detail-row">
        <div class="detail-label">Question</div>
        <div class="detail-value"><strong>${r.question_title ? escapeHtml(r.question_title) : 'Question #' + r.question_id}</strong></div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Author</div>
        <div class="detail-value">${escapeHtml(r.name)} (${r.email})</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Status</div>
        <div class="detail-value"><span class="status-${r.status}" style="padding:4px 12px;border-radius:20px;font-weight:600;">${r.status}</span></div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Reply Content</div>
        <div class="detail-value" style="white-space:pre-wrap;background:#f9fafb;padding:15px;border-radius:8px;">${escapeHtml(r.content)}</div>
      </div>
    `;
    document.getElementById('forum-view-modal').classList.add('active');
  };

  window.closeForumModal = function() {
    document.getElementById('forum-view-modal').classList.remove('active');
  };

  document.addEventListener('click', function(e) {
    if (e.target.id === 'forum-view-modal') {
      closeForumModal();
    }
  });

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  console.log('✅ Dashboard Forum loaded');
})(window.AdminDashboard);
