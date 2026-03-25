/**
 * Reviews Widget System
 * Embed customer reviews anywhere
 */

(function() {
  window.ReviewsWidget = {
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

    // Render reviews in a container
    render: async function(containerId, options = {}) {
      const container = document.getElementById(containerId);
      if (!container) {
        console.error('Container not found:', containerId);
        return;
      }

      const {
        productId = null,     // Specific product (deprecated: use productIds)
        productIds = [],      // Array of product IDs to include reviews from
        ids = [],             // Specific review IDs to include
        rating = null,        // Filter by rating (1-5)
        limit = 10,           // How many reviews
        columns = 1,          // Layout columns
        showAvatar = true     // Show user avatar
      } = options;

      const bootstrap = this.getBootstrap(container);
      if (bootstrap && container.dataset.ssrReviewsWidget === '1') {
        const resolvedOptions = Object.assign({}, bootstrap.options || {}, options || {});
        const bootstrapReviews = Array.isArray(bootstrap.reviews) ? bootstrap.reviews : [];

        if (bootstrapReviews.length === 0) {
          container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #6b7280;">
              <div style="font-size: 3rem; margin-bottom: 15px;">â­</div>
              <p>No reviews yet. Be the first to review!</p>
            </div>
          `;
          this.addStyles();
          return;
        }

        container.innerHTML = `
          <div class="reviews-grid" style="
            display: grid;
            grid-template-columns: repeat(${resolvedOptions.columns || 1}, 1fr);
            gap: 25px;
            max-width: 1200px;
            margin: 0 auto;
          ">
            ${bootstrapReviews.map(r => this.renderReview(r, resolvedOptions.showAvatar !== false)).join('')}
          </div>
        `;
        this.addStyles();
        return;
      }

      // Fetch reviews
      let reviews = [];
      try {
        // Build query parameters for filtering
        const params = new URLSearchParams();
        if (productId) params.set('productId', productId);
        if (productIds && productIds.length) params.set('productIds', productIds.join(','));
        if (ids && ids.length) params.set('ids', ids.join(','));
        if (rating) params.set('rating', rating);
        const url = '/api/reviews' + (params.toString() ? `?${params.toString()}` : '');
        const res = await fetch(url);
        const data = await res.json();
        reviews = data.reviews || [];

        // Filter by rating
        if (rating) {
          reviews = reviews.filter(r => r.rating === rating);
        }

        // Limit
        reviews = reviews.slice(0, limit);

      } catch (err) {
        console.error('Failed to load reviews:', err);
        container.innerHTML = '<p style="color: red;">Failed to load reviews</p>';
        return;
      }

      if (reviews.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 40px; color: #6b7280;">
            <div style="font-size: 3rem; margin-bottom: 15px;">⭐</div>
            <p>No reviews yet. Be the first to review!</p>
          </div>
        `;
        return;
      }

      // Render grid
      container.innerHTML = `
        <div class="reviews-grid" style="
          display: grid;
          grid-template-columns: repeat(${columns}, 1fr);
          gap: 25px;
          max-width: 1200px;
          margin: 0 auto;
        ">
          ${reviews.map(r => this.renderReview(r, showAvatar)).join('')}
        </div>
      `;

      // Add CSS
      this.addStyles();
    },

    // Render single review
    renderReview: function(review, showAvatar) {
      const {
        rating,
        review_text,
        customer_name,
        created_at,
        product_name,
        author_name,
        comment,
        product_title
      } = review;

      // Support both old and new field names
      const reviewText = review_text || comment || 'No review text';
      const reviewerName = customer_name || author_name || 'Anonymous';
      const productDisplayName = product_name || product_title;

      const stars = this.renderStars(rating);
      const date = new Date(created_at).toLocaleDateString();
      const initials = reviewerName.charAt(0).toUpperCase();

      return `
        <article class="review-card" aria-label="Review by ${reviewerName}">
          <div class="review-header">
            ${showAvatar ? `
              <div class="review-avatar" aria-hidden="true">${initials}</div>
            ` : ''}
            <div class="review-header-info">
              <div class="review-author">${reviewerName}</div>
              <div class="review-meta">
                ${stars}
                <span class="review-date"><time datetime="${created_at}">${date}</time></span>
              </div>
            </div>
          </div>
          
          ${productDisplayName ? `
            <div class="review-product"><span aria-hidden="true">📦</span> ${productDisplayName}</div>
          ` : ''}
          
          <div class="review-text">${reviewText}</div>
        </article>
      `;
    },

    // Render rating stars (with accessibility)
    renderStars: function(rating) {
      const fullStars = Math.floor(rating);
      let stars = '';

      for (let i = 0; i < 5; i++) {
        if (i < fullStars) {
          stars += '<span class="star star-full" aria-hidden="true">★</span>';
        } else {
          stars += '<span class="star star-empty" aria-hidden="true">☆</span>';
        }
      }

      return `<div class="rating-stars" role="img" aria-label="${rating} out of 5 stars">${stars}</div>`;
    },

    // Add CSS styles
    addStyles: function() {
      if (document.getElementById('reviews-widget-styles')) return;

      const style = document.createElement('style');
      style.id = 'reviews-widget-styles';
      style.textContent = `
        .review-card {
          background: white;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          min-height: 120px; /* Prevent CLS */
          contain: layout style paint;
        }

        .review-header {
          display: flex;
          gap: 15px;
          margin-bottom: 15px;
        }

        .review-avatar {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 1.2rem;
          flex-shrink: 0;
        }

        .review-header-info {
          flex: 1;
        }

        .review-author {
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 5px;
        }

        .review-meta {
          display: flex;
          align-items: center;
          gap: 10px;
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

        .star-empty {
          color: #d1d5db;
        }

        .review-date {
          font-size: 0.85rem;
          color: #6b7280;
        }

        .review-product {
          font-size: 0.9rem;
          color: #6b7280;
          margin-bottom: 12px;
          padding: 6px 12px;
          background: #f3f4f6;
          border-radius: 6px;
          display: inline-block;
        }

        .review-text {
          color: #4b5563;
          line-height: 1.6;
          font-size: 0.95rem;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .reviews-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `;
      document.head.appendChild(style);
    }
  };
})();
