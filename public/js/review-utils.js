/**
 * Shared Review Submission Utility
 * This file prevents code duplication between buyer-order.js and order-detail.js
 * 
 * Usage:
 *   await submitReviewToAPI(orderData, { name, comment, rating, portfolioEnabled });
 */

// Character limits
const REVIEW_LIMITS = {
  name: 50,
  comment: 1000
};

async function submitReviewToAPI(orderData, reviewFormData) {
  let { name, comment, rating, portfolioEnabled } = reviewFormData;
  
  // Trim and validate inputs
  name = String(name || '').trim();
  comment = String(comment || '').trim();
  
  if (!name) {
    throw new Error('Please enter your name');
  }
  
  if (name.length > REVIEW_LIMITS.name) {
    throw new Error(`Name must be ${REVIEW_LIMITS.name} characters or less`);
  }
  
  if (!comment) {
    throw new Error('Please enter a comment');
  }
  
  if (comment.length < 5) {
    throw new Error('Comment must be at least 5 characters');
  }
  
  if (comment.length > REVIEW_LIMITS.comment) {
    throw new Error(`Comment must be ${REVIEW_LIMITS.comment} characters or less`);
  }
  
  if (!rating || rating < 1 || rating > 5) {
    throw new Error('Please select a rating (1-5)');
  }
  
  // Prepare review data with all required fields
  const reviewData = {
    productId: orderData.product_id,
    author: name,
    rating: rating,
    comment: comment,
    orderId: orderData.order_id,
    showOnProduct: portfolioEnabled ? 1 : 0,
    deliveredVideoUrl: orderData.delivered_video_url || null,
    deliveredThumbnailUrl: orderData.delivered_thumbnail_url || null
  };
  
  // Submit review to API
  const res = await fetch('/api/reviews/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reviewData)
  });
  
  const data = await res.json();
  
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to submit review');
  }
  
  // Update portfolio setting if enabled
  if (portfolioEnabled) {
    await fetch('/api/order/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        orderId: orderData.order_id, 
        portfolioEnabled: 1 
      })
    });
  }
  
  return { success: true, data };
}

/**
 * Helper function to hide review UI elements after submission
 */
function hideReviewUIElements() {
  const reviewSection = document.getElementById('review-section');
  const approveBtn = document.getElementById('approve-btn');
  const revisionBtn = document.getElementById('revision-btn');
  // NOTE: Do not hide tip section here. Tip stays visible until it's paid.

  if (reviewSection) reviewSection.style.display = 'none';
  if (approveBtn) approveBtn.style.display = 'none';
  if (revisionBtn) revisionBtn.style.display = 'none';
}
