/**
 * Beautiful Product Cards System
 * Can be embedded anywhere - landing pages, home, featured lists
 */

(function() {
  window.ProductCards = {
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

    createLoadMoreButton: function(options = {}) {
      const loadBtn = document.createElement('button');
      loadBtn.className = 'btn-load-more';
      loadBtn.textContent = 'Load More Products';
      loadBtn.style.display = 'none';
      loadBtn.style.margin = '40px auto';
      loadBtn.style.padding = '12px 30px';
      loadBtn.style.background = 'white';
      loadBtn.style.border = '1px solid #d1d5db';
      loadBtn.style.borderRadius = '8px';
      loadBtn.style.cursor = 'pointer';
      loadBtn.style.fontSize = '1rem';
      loadBtn.style.color = '#374151';
      loadBtn.style.transition = 'all 0.2s';
      loadBtn.onmouseover = () => { loadBtn.style.background = '#f9fafb'; loadBtn.style.borderColor = '#9ca3af'; };
      loadBtn.onmouseout = () => { loadBtn.style.background = 'white'; loadBtn.style.borderColor = '#d1d5db'; };
      return loadBtn;
    },

    hydrateSsr: function(container, containerId, bootstrap, options = {}) {
      const resolvedOptions = Object.assign({}, bootstrap?.options || {}, options || {});
      const pagination = bootstrap?.pagination || {};
      const products = Array.isArray(bootstrap?.products) ? bootstrap.products : [];

      if (resolvedOptions.layout === 'slider') {
        this.addStyles();
        this.updateSliderButtons(containerId);
        return true;
      }

      let grid = container.querySelector('.product-cards-grid');
      if (!grid) {
        container.innerHTML = '';
        grid = document.createElement('div');
        grid.className = 'product-cards-grid';
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = `repeat(${resolvedOptions.columns || 3}, 1fr)`;
        grid.style.gap = '30px';
        grid.style.maxWidth = '1200px';
        grid.style.margin = '0 auto';
        container.appendChild(grid);
        products.forEach((product) => {
          const temp = document.createElement('div');
          temp.innerHTML = this.renderCard(product, resolvedOptions);
          while (temp.firstChild) {
            grid.appendChild(temp.firstChild);
          }
        });
      }

      container._state = {
        page: (pagination.page || 1) + 1,
        limit: pagination.limit || resolvedOptions.limit || products.length || 12,
        total: pagination.total || products.length,
        pages: pagination.pages || 1,
        loading: false,
        filter: resolvedOptions.filter || 'all',
        ids: resolvedOptions.ids || []
      };

      let loadBtn = container.querySelector('.btn-load-more');
      if (!loadBtn) {
        loadBtn = this.createLoadMoreButton(resolvedOptions);
        container.appendChild(loadBtn);
      }
      loadBtn.onclick = () => this.loadMore(container, grid, loadBtn, resolvedOptions);

      if (container._state.page > container._state.pages) {
        loadBtn.style.display = 'none';
      } else {
        loadBtn.style.display = 'block';
        loadBtn.textContent = 'Load More Products';
        loadBtn.disabled = false;
        loadBtn.style.opacity = '1';
      }

      this.addStyles();
      return true;
    },

    // Render product cards in a container
    render: async function(containerId, options = {}) {
      const container = document.getElementById(containerId);
      if (!container) {
        console.error('Container not found:', containerId);
        return;
      }

      const bootstrap = this.getBootstrap(container);
      if (bootstrap && container.dataset.ssrProductCards === '1') {
        if (this.hydrateSsr(container, containerId, bootstrap, options)) {
          return;
        }
      }

      // Clear container and setup structure
      container.innerHTML = '';

      // Store state on the container DOM element
      container._state = {
        page: 1,
        limit: options.limit || 12,
        total: 0,
        pages: 1,
        loading: false,
        filter: options.filter || 'all',
        ids: options.ids || []
      };

      // Grid wrapper
      const grid = document.createElement('div');
      grid.className = 'product-cards-grid';
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = `repeat(${options.columns || 3}, 1fr)`;
      grid.style.gap = '30px';
      grid.style.maxWidth = '1200px';
      grid.style.margin = '0 auto';
      container.appendChild(grid);

      // Load More Button
      const loadBtn = this.createLoadMoreButton(options);
      loadBtn.onclick = () => this.loadMore(container, grid, loadBtn, options);

      container.appendChild(loadBtn);

      // Initial Load
      await this.loadMore(container, grid, loadBtn, options);
      this.addStyles();
    },

    // Load next page
    loadMore: async function(container, grid, btn, options) {
      const state = container._state;
      if (state.loading) return;

      state.loading = true;
      btn.textContent = 'Loading...';
      btn.disabled = true;
      btn.style.opacity = '0.7';

      try {
        // Build URL
        let url = `/api/products?page=${state.page}&limit=${state.limit}`;
        if (state.filter && state.filter !== 'all') {
          url += `&filter=${encodeURIComponent(state.filter)}`;
        }

        // Fetch
        const res = await fetch(url);
        const data = await res.json();

        let products = data.products || [];

        // Update pagination from server
        if (data.pagination) {
          state.total = data.pagination.total;
          state.pages = data.pagination.pages;
        }

        // Client-side sorting for 'top-sales' if not handled by server
        if (state.filter === 'top-sales') {
          products = products.sort((a, b) => (b.sales || 0) - (a.sales || 0));
        }

        // Apply ID filtering (client-side remains for specific IDs)
        if (state.ids && Array.isArray(state.ids) && state.ids.length > 0) {
          const idSet = new Set(state.ids.map(x => String(x)));
          products = products.filter(p => idSet.has(String(p.id)) || idSet.has(String(p.slug)));
        }

        // If no products found on first page
        if (products.length === 0 && state.page === 1) {
          grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#6b7280;">No products found.</div>';
          btn.style.display = 'none';
          return;
        }

        // Render cards and append
        products.forEach(p => {
          // Check if card helper exists
          // Create temp container to parse HTML string
          const temp = document.createElement('div');
          temp.innerHTML = this.renderCard(p, options);
          while (temp.firstChild) {
            grid.appendChild(temp.firstChild);
          }
        });

        // Setup next page
        state.page++;
        state.loading = false;

        // Update button state
        if (state.page > state.pages) {
          btn.style.display = 'none'; // Reached end
        } else {
          btn.style.display = 'block';
          btn.textContent = 'Load More Products';
          btn.disabled = false;
          btn.style.opacity = '1';
        }

      } catch (err) {
        console.error('Failed to load products:', err);
        btn.textContent = 'Error loading. Try again.';
        btn.disabled = false;
        state.loading = false;
      }
    },

    // Render single card
    renderCard: function(product, opts = {}) {
      const { showReviews = true, showDelivery = true } = opts;
      const {
        id,
        title,
        slug,
        thumbnail_url,
        normal_price,
        sale_price,
        normal_delivery_text,
        instant_delivery,
        delivery_time_days,
        average_rating,
        review_count
      } = product;

      const safeSlug = slug ? String(slug) : (title ? String(title).toLowerCase().trim().replace(/['"`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-') : 'product');
      const productUrl = id ? `/product-${encodeURIComponent(id)}/${encodeURIComponent(safeSlug)}` : (slug ? `/product/${encodeURIComponent(slug)}` : '/');

      // Price calculation
      const originalPrice = parseFloat(normal_price || 0);
      const salePrice = parseFloat(sale_price || originalPrice);
      const hasDiscount = salePrice < originalPrice;
      const discount = hasDiscount ? Math.round((1 - salePrice / originalPrice) * 100) : 0;

      // Delivery text - pass instant_delivery flag and days
      const deliveryText = this.getDeliveryText(instant_delivery, delivery_time_days || normal_delivery_text);
      const deliveryIcon = this.getDeliveryIcon(instant_delivery);

      // Rating stars
      const rating = parseFloat(average_rating || 5);
      const stars = this.renderStars(rating);

      const priceHtml = `
        <div class="product-prices">
          ${hasDiscount ? `<span class="original-price">$${originalPrice}</span>` : ''}
          <span class="sale-price">$${salePrice}</span>
        </div>
      `;
      const reviewHtml = `
        <div class="product-reviews">
          ${stars}
          <span class="review-count">(${review_count || 0})</span>
        </div>
      `;
      const deliveryHtml = `
        <div class="product-delivery">
          <span class="delivery-icon">${deliveryIcon}</span>
          <span class="delivery-text">${deliveryText}</span>
        </div>
      `;
      // OPTIMIZED: Use anchor tag for navigation instead of onclick (faster & better SEO)
      return `
        <a href="${productUrl}" class="product-card" data-product-id="${id}" style="text-decoration:none; color:inherit; display:block;">
          <!-- Thumbnail -->
          <div class="product-thumbnail">
            <img src="${thumbnail_url || '/placeholder.jpg'}" alt="${title}" loading="lazy">
            ${hasDiscount ? `<div class="discount-badge">${discount}% OFF</div>` : ''}
          </div>

          <!-- Content -->
          <div class="product-content">
            <!-- Title -->
            <h3 class="product-title">${title}</h3>

            <!-- Price & Reviews Row -->
            <div class="product-meta-row">
              ${priceHtml}
              ${showReviews ? reviewHtml : ''}
            </div>

            <!-- Delivery Info -->
            ${showDelivery ? deliveryHtml : ''}

            <!-- Book Now Button (Styled div inside anchor) -->
            <div class="book-now-btn">
              Book Now
            </div>
          </div>
        </a>
      `;
    },

    // Get delivery text based on instant flag and days
    getDeliveryText: function(instantDelivery, deliveryDays) {
      // If instant delivery is ON, show 60 minutes
      if (instantDelivery == 1 || instantDelivery === true) {
        return 'Instant Delivery in 60 Minutes';
      }

      // Otherwise use days
      const days = parseInt(deliveryDays) || 1;
      
      if (days === 1) {
        return '24 Hour Express Delivery';
      } else if (days === 2) {
        return '2 Days Delivery';
      } else if (days === 3) {
        return '3 Days Delivery';
      } else {
        return `${days} Days Delivery`;
      }
    },

    // Get delivery icon
    getDeliveryIcon: function(instantDelivery) {
      if (instantDelivery == 1 || instantDelivery === true) return '⚡';
      return '🚀';
    },

    // Render rating stars
    renderStars: function(rating) {
      const fullStars = Math.floor(rating);
      const hasHalfStar = rating % 1 >= 0.5;
      let stars = '';

      for (let i = 0; i < 5; i++) {
        if (i < fullStars) {
          stars += '<span class="star star-full">★</span>';
        } else if (i === fullStars && hasHalfStar) {
          stars += '<span class="star star-half">★</span>';
        } else {
          stars += '<span class="star star-empty">☆</span>';
        }
      }

      return `<div class="rating-stars">${stars}</div>`;
    },

    // Add CSS styles
    addStyles: function() {
      if (document.getElementById('product-cards-styles')) return;

      const style = document.createElement('style');
      style.id = 'product-cards-styles';
      style.textContent = `
        .product-card {
          background: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          contain: layout style paint;
        }

        .product-card:hover {
          box-shadow: 0 12px 24px rgba(0,0,0,0.15);
        }

        .product-thumbnail {
          position: relative;
          width: 100%;
          aspect-ratio: 16/9;
          overflow: hidden;
          background: #f3f4f6;
        }

        .product-thumbnail img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .product-card:hover .product-thumbnail img {
          transform: scale(1.05);
        }

        .discount-badge {
          position: absolute;
          top: 12px;
          right: 12px;
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          color: white;
          padding: 6px 12px;
          border-radius: 20px;
          font-weight: 700;
          font-size: 0.85em;
          box-shadow: 0 4px 12px rgba(245, 87, 108, 0.4);
        }

        .product-content {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          flex: 1;
        }

        .product-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: #1f2937;
          margin: 0;
          line-height: 1.4;
          min-height: 2.8em;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .product-meta-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .product-prices {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .original-price {
          font-size: 0.9rem;
          color: #9ca3af;
          text-decoration: line-through;
        }

        .sale-price {
          font-size: 1.5rem;
          font-weight: 700;
          color: #3b82f6;
        }

        .product-reviews {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .rating-stars {
          display: flex;
          gap: 2px;
        }

        .star {
          font-size: 1rem;
          line-height: 1;
        }

        .star-full {
          color: #fbbf24;
        }

        .star-half {
          color: #fbbf24;
          opacity: 0.5;
        }

        .star-empty {
          color: #d1d5db;
        }

        .review-count {
          font-size: 0.85rem;
          color: #6b7280;
        }

        .product-delivery {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: #f0f9ff;
          border-radius: 6px;
          font-size: 0.9rem;
          color: #1e40af;
          font-weight: 500;
        }

        .delivery-icon {
          font-size: 1.1em;
        }

        .book-now-btn {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          transition: box-shadow 0.15s ease;
          margin-top: auto;
        }

        .book-now-btn:hover {
          box-shadow: 0 8px 16px rgba(102, 126, 234, 0.4);
        }

        .book-now-btn:active {
        }

        /* Responsive */
        @media (max-width: 768px) {
          .product-cards-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 20px !important;
          }
        }

        @media (max-width: 480px) {
          .product-cards-grid {
            grid-template-columns: 1fr !important;
          }
        }

        /* Slider Styles */
        .product-slider-container {
          position: relative;
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 50px;
        }
        .product-slider-wrapper {
          overflow: hidden;
        }
        .product-slider-track {
          display: flex;
          gap: 20px;
          transition: transform 0.4s ease;
          padding: 10px 0;
        }
        .product-slider-track .product-card {
          flex: 0 0 calc(33.333% - 14px);
          min-width: calc(33.333% - 14px);
        }
        .product-slider-btn {
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
        .product-slider-btn:hover:not(:disabled) {
          background: #667eea;
          color: white;
          border-color: #667eea;
        }
        .product-slider-btn.prev { left: 0; }
        .product-slider-btn.next { right: 0; }
        .product-slider-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .product-slider-dots {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-top: 20px;
        }
        .product-slider-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #d1d5db;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
        }
        .product-slider-dot.active {
          background: #667eea;
          transform: scale(1.2);
        }
        @media (max-width: 900px) {
          .product-slider-track .product-card {
            flex: 0 0 calc(50% - 10px);
            min-width: calc(50% - 10px);
          }
        }
        @media (max-width: 600px) {
          .product-slider-container { padding: 0 10px; }
          .product-slider-track .product-card {
            flex: 0 0 100%;
            min-width: 100%;
          }
          .product-slider-btn { display: none; }
        }
      `;
      document.head.appendChild(style);
    },

    // Render slider layout
    renderSlider: async function(containerId, options = {}) {
      const container = document.getElementById(containerId);
      if (!container) return;

      const bootstrap = this.getBootstrap(container);
      if (bootstrap && container.dataset.ssrProductCards === '1' && container.querySelector('.product-slider-container')) {
        this.addStyles();
        this.updateSliderButtons(containerId);
        return;
      }

      container.innerHTML = '<p style="text-align:center;padding:20px;color:#6b7280;">Loading...</p>';
      this.addStyles();

      try {
        let url = `/api/products?limit=${options.limit || 6}`;
        if (options.filter && options.filter !== 'all') {
          url += `&filter=${encodeURIComponent(options.filter)}`;
        }

        const res = await fetch(url);
        const data = await res.json();
        let products = data.products || [];

        // Filter by custom IDs if provided
        if (options.ids && Array.isArray(options.ids) && options.ids.length > 0) {
          const idSet = new Set(options.ids.map(x => String(x).trim()));
          products = products.filter(p => idSet.has(String(p.id)) || idSet.has(String(p.slug)));
        }

        if (products.length === 0) {
          container.innerHTML = '<p style="text-align:center;padding:40px;color:#6b7280;">No products found.</p>';
          return;
        }

        const visibleCount = this.getVisibleCount();
        const totalSlides = Math.ceil(products.length / visibleCount);

        container.innerHTML = `
          <div class="product-slider-container">
            <button class="product-slider-btn prev" onclick="ProductCards.slideMove('${containerId}', -1)">❮</button>
            <div class="product-slider-wrapper">
              <div class="product-slider-track" data-slide="0" data-total="${totalSlides}" data-visible="${visibleCount}">
                ${products.map(p => this.renderCard(p, options)).join('')}
              </div>
            </div>
            <button class="product-slider-btn next" onclick="ProductCards.slideMove('${containerId}', 1)">❯</button>
          </div>
          <div class="product-slider-dots">
            ${Array.from({length: totalSlides}, (_, i) => `<button class="product-slider-dot${i === 0 ? ' active' : ''}" onclick="ProductCards.slideTo('${containerId}', ${i})"></button>`).join('')}
          </div>
        `;

        this.updateSliderButtons(containerId);
      } catch (err) {
        container.innerHTML = '<p style="text-align:center;color:#ef4444;">Error loading products</p>';
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
      const track = container.querySelector('.product-slider-track');
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
      const track = container.querySelector('.product-slider-track');
      if (!track) return;

      const cards = track.querySelectorAll('.product-card');
      if (cards.length === 0) return;

      const visible = this.getVisibleCount();
      const cardWidth = cards[0].offsetWidth + 20; // including gap
      const offset = index * visible * cardWidth;

      track.style.transform = `translateX(-${offset}px)`;
      track.dataset.slide = index;

      // Update dots
      container.querySelectorAll('.product-slider-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
      });

      this.updateSliderButtons(containerId);
    },

    updateSliderButtons: function(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const track = container.querySelector('.product-slider-track');
      if (!track) return;

      const current = parseInt(track.dataset.slide) || 0;
      const total = parseInt(track.dataset.total) || 1;

      const prevBtn = container.querySelector('.product-slider-btn.prev');
      const nextBtn = container.querySelector('.product-slider-btn.next');

      if (prevBtn) prevBtn.disabled = current === 0;
      if (nextBtn) nextBtn.disabled = current >= total - 1;
    }
  };


})();
