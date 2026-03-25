/**
 * Dashboard Core - Shared state, utilities, and initialization
 * All modules share state via window.AdminDashboard namespace
 */

window.AdminDashboard = window.AdminDashboard || {};
// Backward-compatible alias (some inline handlers expect `AD`)
window.AD = window.AdminDashboard;

(function(AD) {
  // Shared state
  AD.currentView = 'dashboard';
  AD.orders = [];
  AD.products = [];
  AD.reviews = [];
  AD.VERSION = Date.now();

  // Format date properly
  AD.formatDate = function(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    if (isNaN(d.getTime()) || d.getFullYear() < 2000) return 'N/A';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // API fetch with cache busting
  AD.apiFetch = async function(url, options = {}) {
    const sep = url.includes('?') ? '&' : '?';
    const fetchUrl = url + sep + '_t=' + AD.VERSION;
    const res = await fetch(fetchUrl, options);
    return res.json();
  };

  // Countdown helper for orders
  AD.getCountdown = function(o) {
    if (o.status === 'delivered') return '<span style="color:#10b981">✅ Delivered</span>';
    if (o.status === 'cancelled') return '<span style="color:#ef4444">❌ Cancelled</span>';
    
    const created = new Date(o.created_at);
    if (isNaN(created.getTime())) return 'N/A';
    
    // Check both field names
    const deliveryMins = parseInt(o.delivery_time_minutes) || parseInt(o.delivery_time) || 60;
    const deadline = new Date(created.getTime() + deliveryMins * 60000);
    const now = new Date();
    const diff = deadline - now;
    
    if (diff <= 0) return '<span style="color:#ef4444;font-weight:700">⏰ OVERDUE</span>';
    
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    
    let color = '#10b981'; // green
    if (days === 0 && hours < 12) color = '#f59e0b'; // orange
    if (days === 0 && hours < 6) color = '#ef4444'; // red
    
    if (days > 0) {
      return `<span style="color:${color};font-weight:600">${days}d ${hours}h ${mins}m</span>`;
    } else if (hours > 0) {
      return `<span style="color:${color};font-weight:600">${hours}h ${mins}m ${secs}s</span>`;
    }
    return `<span style="color:${color};font-weight:600">${mins}m ${secs}s</span>`;
  };
  
  // Live countdown updater for orders list
  AD.countdownInterval = null;
  AD.startCountdownUpdater = function() {
    if (AD.countdownInterval) clearInterval(AD.countdownInterval);
    
    AD.countdownInterval = setInterval(() => {
      if (!AD.orders || AD.currentView !== 'orders') return;
      
      AD.orders.forEach((o, i) => {
        const row = document.querySelector(`#orders-tbody tr:nth-child(${i + 1}) td:nth-child(5)`);
        if (row) {
          row.innerHTML = AD.getCountdown(o);
        }
      });
    }, 1000);
  };
  
  AD.stopCountdownUpdater = function() {
    if (AD.countdownInterval) {
      clearInterval(AD.countdownInterval);
      AD.countdownInterval = null;
    }
  };

  // Initialize dashboard
  AD.init = function() {
    try {
      const menuItems = document.querySelectorAll('.menu-item');
      if (menuItems.length === 0) {
        console.error('No menu items found in DOM');
        return;
      }
      menuItems.forEach(item => {
        item.addEventListener('click', function(e) {
          e.preventDefault();
          menuItems.forEach(m => m.classList.remove('active'));
          this.classList.add('active');
          AD.currentView = this.dataset.view;
          AD.loadView(AD.currentView);
        });
      });
      AD.loadView('dashboard');
    } catch (err) {
      console.error('Init error:', err);
    }
  };

  // Main view router
  AD.loadView = async function(view) {
    // Stop countdown updater when leaving orders view
    if (view !== 'orders' && AD.stopCountdownUpdater) {
      AD.stopCountdownUpdater();
    }
    
    document.getElementById('page-title').textContent = view.charAt(0).toUpperCase() + view.slice(1);
    const panel = document.getElementById('main-panel');
    
    switch(view) {
      case 'dashboard': 
        if (AD.loadDashboard) await AD.loadDashboard(panel); 
        break;
      case 'orders': 
        if (AD.loadOrders) await AD.loadOrders(panel); 
        break;
      case 'users': 
        if (AD.loadUsers) await AD.loadUsers(panel); 
        break;
      case 'products': 
        if (AD.loadProducts) await AD.loadProducts(panel); 
        break;
      case 'reviews': 
        if (AD.loadReviews) await AD.loadReviews(panel); 
        break;
      case 'blog': 
        if (AD.loadBlog) await AD.loadBlog(panel); 
        break;
      case 'blog-comments': 
        if (AD.loadBlogComments) await AD.loadBlogComments(panel); 
        break;
      case 'forum': 
        if (AD.loadForum) await AD.loadForum(panel); 
        break;
      case 'chats': 
        if (AD.loadChats) await AD.loadChats(panel); 
        break;
      case 'settings': 
        if (AD.loadSettings) AD.loadSettings(panel); 
        break;
      case 'api-keys':
        if (AD.loadApiKeys) await AD.loadApiKeys(panel);
        break;
      case 'coupons':
        if (AD.loadCoupons) await AD.loadCoupons(panel);
        break;
      case 'seo':
        if (AD.loadSEO) await AD.loadSEO(panel);
        break;
      case 'noindex':
        if (AD.loadNoindex) await AD.loadNoindex(panel);
        break;
      case 'analytics':
        if (AD.loadAnalytics) await AD.loadAnalytics(panel);
        break;
    case 'emails':
      if (AD.loadEmails) await AD.loadEmails(panel);
      break;
      case 'backup':
        if (AD.loadBackup) await AD.loadBackup(panel);
        break;
      case 'pages':
        if (AD.loadPages) await AD.loadPages(panel);
        break;
      case 'components':
        if (AD.loadComponents) await AD.loadComponents(panel);
        break;
      case 'payment':
        if (window.initPaymentTab) await window.initPaymentTab();
        break;
      case 'webhooks':
        if (window.loadWebhooks) await window.loadWebhooks(panel);
        break;
    }
  };

  // Auto-init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', AD.init);
  } else {
    AD.init();
  }

  console.log('✅ Dashboard Core loaded');
})(window.AdminDashboard);
