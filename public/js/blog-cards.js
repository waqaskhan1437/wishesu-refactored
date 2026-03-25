/**
 * Blog Cards System
 * Beautiful blog cards for archive page with pagination
 */

(function() {
  window.BlogCards = {
    getBootstrap: function(container) {
      const bootstrapId = container?.dataset?.ssrBootstrapId;
      if (!bootstrapId) return null;
      const script = document.getElementById(bootstrapId);
      if (!script) return null;
      try {
        return JSON.parse(script.textContent || '{}');
      } catch (err) {
        return null;
      }
    },

    // Render blog cards with pagination
    render: async function(containerId, options = {}) {
      const container = document.getElementById(containerId);
      if (!container) {
        console.error('Container not found:', containerId);
        return;
      }

      const bootstrap = this.getBootstrap(container);
      if (bootstrap && container.dataset.ssrBlogCards === '1' && container.querySelector('.blog-cards-grid')) {
        this.addStyles();
        return;
      }

      const {
        limit = 30,
        columns = 3,
        showPagination = true
      } = options;

      // Get current page from URL
      const urlParams = new URLSearchParams(window.location.search);
      const page = parseInt(urlParams.get('page') || '1');

      container.innerHTML = '<div style="text-align:center;padding:40px;"><div class="blog-loader"></div></div>';

      try {
        const res = await fetch(`/api/blogs/published?page=${page}&limit=${limit}`);
        const data = await res.json();
        let blogs = data.blogs || [];
        const pagination = data.pagination || {};

        // Filter by custom IDs if provided
        if (options.ids && Array.isArray(options.ids) && options.ids.length > 0) {
          const idSet = new Set(options.ids.map(x => String(x).trim()));
          blogs = blogs.filter(b => idSet.has(String(b.id)) || idSet.has(String(b.slug)));
        }

        if (!blogs || blogs.length === 0) {
          container.innerHTML = '<p style="text-align:center;padding:60px 20px;color:#6b7280;font-size:1.1rem;">No blog posts found.</p>';
          return;
        }

        // Render grid
        let html = `
          <div class="blog-cards-grid" style="
            display: grid;
            grid-template-columns: repeat(${columns}, 1fr);
            gap: 30px;
            max-width: 1200px;
            margin: 0 auto;
          ">
            ${blogs.map(b => this.renderCard(b)).join('')}
          </div>
        `;

        // Add pagination
        if (showPagination && pagination.totalPages > 1) {
          html += this.renderPagination(pagination);
        }

        container.innerHTML = html;
        this.addStyles();

      } catch (err) {
        console.error('Failed to load blogs:', err);
        container.innerHTML = '<p style="color:red;text-align:center;padding:40px;">Failed to load blog posts</p>';
      }
    },

    // Render single card
    renderCard: function(blog) {
      const {
        id,
        title,
        slug,
        description,
        thumbnail_url,
        created_at
      } = blog;

      const blogUrl = `/blog/${slug || id}`;
      const date = created_at ? this.formatDate(created_at) : '';
      const shortDesc = description ? (description.length > 120 ? description.substring(0, 120) + '...' : description) : '';

      return `
        <div class="blog-card" onclick="window.location.href='${blogUrl}'">
          <div class="blog-thumbnail">
            <img src="${thumbnail_url || 'https://via.placeholder.com/400x225?text=No+Image'}" alt="${title}" loading="lazy">
          </div>
          <div class="blog-content">
            <h3 class="blog-title">${title}</h3>
            ${date ? `<div class="blog-date">📅 ${date}</div>` : ''}
            <p class="blog-description">${shortDesc}</p>
            <a href="${blogUrl}" class="blog-read-more" onclick="event.stopPropagation();">
              Read More →
            </a>
          </div>
        </div>
      `;
    },

    // Render pagination
    renderPagination: function(pagination) {
      const { page, totalPages, hasNext, hasPrev } = pagination;
      
      let pagesHtml = '';
      
      // Calculate page range
      let startPage = Math.max(1, page - 2);
      let endPage = Math.min(totalPages, page + 2);
      
      // Always show first page
      if (startPage > 1) {
        pagesHtml += `<a href="?page=1" class="page-link">1</a>`;
        if (startPage > 2) {
          pagesHtml += `<span class="page-dots">...</span>`;
        }
      }
      
      // Page numbers
      for (let i = startPage; i <= endPage; i++) {
        if (i === page) {
          pagesHtml += `<span class="page-link active">${i}</span>`;
        } else {
          pagesHtml += `<a href="?page=${i}" class="page-link">${i}</a>`;
        }
      }
      
      // Always show last page
      if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
          pagesHtml += `<span class="page-dots">...</span>`;
        }
        pagesHtml += `<a href="?page=${totalPages}" class="page-link">${totalPages}</a>`;
      }

      return `
        <div class="blog-pagination">
          ${hasPrev ? `<a href="?page=${page - 1}" class="page-link page-prev">← Previous</a>` : ''}
          <div class="page-numbers">${pagesHtml}</div>
          ${hasNext ? `<a href="?page=${page + 1}" class="page-link page-next">Next →</a>` : ''}
        </div>
      `;
    },

    // Format date
    formatDate: function(timestamp) {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    },

    // Add CSS styles
    addStyles: function() {
      if (document.getElementById('blog-cards-styles')) return;

      const style = document.createElement('style');
      style.id = 'blog-cards-styles';
      style.textContent = `
        .blog-loader {
          width: 40px;
          height: 40px;
          border: 4px solid #e5e7eb;
          border-top-color: #667eea;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .blog-card {
          background: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          contain: layout style paint;
        }

        .blog-card:hover {
          box-shadow: 0 12px 24px rgba(0,0,0,0.15);
        }

        .blog-thumbnail {
          position: relative;
          width: 100%;
          aspect-ratio: 16/9;
          overflow: hidden;
          background: #f3f4f6;
        }

        .blog-thumbnail img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .blog-card:hover .blog-thumbnail img {
        }

        .blog-content {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          flex: 1;
        }

        .blog-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: #1f2937;
          margin: 0;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .blog-date {
          font-size: 0.85rem;
          color: #6b7280;
        }

        .blog-description {
          font-size: 0.95rem;
          color: #4b5563;
          line-height: 1.5;
          margin: 0;
          flex: 1;
        }

        .blog-read-more {
          display: block;
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          text-align: center;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 1rem;
          transition: box-shadow 0.15s ease;
          margin-top: auto;
        }

        .blog-read-more:hover {
          box-shadow: 0 8px 16px rgba(102, 126, 234, 0.4);
        }

        /* Pagination */
        .blog-pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 15px;
          margin-top: 50px;
          padding: 20px 0;
        }

        .page-numbers {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .page-link {
          padding: 10px 16px;
          background: white;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          color: #374151;
          text-decoration: none;
          font-weight: 600;
          transition: border-color 0.15s ease, color 0.15s ease;
        }

        .page-link:hover {
          border-color: #667eea;
          color: #667eea;
        }

        .page-link.active {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-color: transparent;
          color: white;
        }

        .page-dots {
          color: #9ca3af;
          padding: 0 5px;
        }

        .page-prev, .page-next {
          background: #f9fafb;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .blog-cards-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 20px !important;
          }
          
          .blog-pagination {
            flex-wrap: wrap;
          }
        }

        @media (max-width: 480px) {
          .blog-cards-grid {
            grid-template-columns: 1fr !important;
          }

          .page-numbers {
            order: 3;
            width: 100%;
            justify-content: center;
            margin-top: 10px;
          }
        }

        /* Blog Slider Styles */
        .blog-slider-container {
          position: relative;
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 50px;
        }
        .blog-slider-wrapper {
          overflow: hidden;
        }
        .blog-slider-track {
          display: flex;
          gap: 20px;
          transition: transform 0.4s ease;
          padding: 10px 0;
        }
        .blog-slider-track .blog-card {
          flex: 0 0 calc(33.333% - 14px);
          min-width: calc(33.333% - 14px);
        }
        .blog-slider-btn {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 44px;
          height: 44px;
          background: white;
          border: 2px solid #e5e7eb;
          border-radius: 50%;
          cursor: pointer;
          font-size: 1.2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
          transition: all 0.2s;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .blog-slider-btn:hover:not(:disabled) {
          background: #10b981;
          color: white;
          border-color: #10b981;
        }
        .blog-slider-btn.prev { left: 0; }
        .blog-slider-btn.next { right: 0; }
        .blog-slider-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .blog-slider-dots {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-top: 20px;
        }
        .blog-slider-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #d1d5db;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
        }
        .blog-slider-dot.active {
          background: #10b981;
          transform: scale(1.2);
        }
        @media (max-width: 900px) {
          .blog-slider-track .blog-card {
            flex: 0 0 calc(50% - 10px);
            min-width: calc(50% - 10px);
          }
        }
        @media (max-width: 600px) {
          .blog-slider-container { padding: 0 10px; }
          .blog-slider-track .blog-card {
            flex: 0 0 100%;
            min-width: 100%;
          }
          .blog-slider-btn { display: none; }
        }
      `;
      document.head.appendChild(style);
    },

    // Render slider layout
    renderSlider: async function(containerId, options = {}) {
      const container = document.getElementById(containerId);
      if (!container) return;

       const bootstrap = this.getBootstrap(container);
       if (bootstrap && container.dataset.ssrBlogCards === '1' && container.querySelector('.blog-slider-container')) {
         this.addStyles();
         this.updateSliderButtons(containerId);
         return;
       }

      container.innerHTML = '<p style="text-align:center;padding:20px;color:#6b7280;">Loading...</p>';
      this.addStyles();

      try {
        const res = await fetch(`/api/blogs/published?limit=${options.limit || 6}`);
        const data = await res.json();
        let blogs = data.blogs || [];

        // Filter by custom IDs if provided
        if (options.ids && Array.isArray(options.ids) && options.ids.length > 0) {
          const idSet = new Set(options.ids.map(x => String(x).trim()));
          blogs = blogs.filter(b => idSet.has(String(b.id)) || idSet.has(String(b.slug)));
        }

        if (blogs.length === 0) {
          container.innerHTML = '<p style="text-align:center;padding:40px;color:#6b7280;">No blog posts found.</p>';
          return;
        }

        const visibleCount = this.getVisibleCount();
        const totalSlides = Math.ceil(blogs.length / visibleCount);

        container.innerHTML = `
          <div class="blog-slider-container">
            <button class="blog-slider-btn prev" onclick="BlogCards.slideMove('${containerId}', -1)">❮</button>
            <div class="blog-slider-wrapper">
              <div class="blog-slider-track" data-slide="0" data-total="${totalSlides}" data-visible="${visibleCount}">
                ${blogs.map(b => this.renderCard(b)).join('')}
              </div>
            </div>
            <button class="blog-slider-btn next" onclick="BlogCards.slideMove('${containerId}', 1)">❯</button>
          </div>
          <div class="blog-slider-dots">
            ${Array.from({length: totalSlides}, (_, i) => `<button class="blog-slider-dot${i === 0 ? ' active' : ''}" onclick="BlogCards.slideTo('${containerId}', ${i})"></button>`).join('')}
          </div>
        `;

        this.updateSliderButtons(containerId);
      } catch (err) {
        container.innerHTML = '<p style="text-align:center;color:#ef4444;">Error loading blogs</p>';
      }
    },

    getVisibleCount: function() {
      if (window.innerWidth <= 600) return 1;
      if (window.innerWidth <= 900) return 2;
      return 3;
    },

    slideMove: function(containerId, direction) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const track = container.querySelector('.blog-slider-track');
      if (!track) return;

      let current = parseInt(track.dataset.slide) || 0;
      const total = parseInt(track.dataset.total) || 1;
      current += direction;
      if (current < 0) current = 0;
      if (current >= total) current = total - 1;

      this.slideTo(containerId, current);
    },

    slideTo: function(containerId, index) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const track = container.querySelector('.blog-slider-track');
      if (!track) return;

      const cards = track.querySelectorAll('.blog-card');
      if (cards.length === 0) return;

      const visible = this.getVisibleCount();
      const cardWidth = cards[0].offsetWidth + 20; // including gap
      const offset = index * visible * cardWidth;

      track.style.transform = `translateX(-${offset}px)`;
      track.dataset.slide = index;

      // Update dots
      container.querySelectorAll('.blog-slider-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
      });

      this.updateSliderButtons(containerId);
    },

    updateSliderButtons: function(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const track = container.querySelector('.blog-slider-track');
      if (!track) return;

      const current = parseInt(track.dataset.slide) || 0;
      const total = parseInt(track.dataset.total) || 1;

      const prevBtn = container.querySelector('.blog-slider-btn.prev');
      const nextBtn = container.querySelector('.blog-slider-btn.next');

      if (prevBtn) prevBtn.disabled = current === 0;
      if (nextBtn) nextBtn.disabled = current >= total - 1;
    }
  };


})();
