/**
 * Star Rating Renderer
 * Consolidated star rendering functions
 */

export function renderStarsForSsr(ratingAverage) {
  const rating = Number.isFinite(Number(ratingAverage)) ? Number(ratingAverage) : 5;
  const fullStars = Math.max(0, Math.min(5, Math.floor(rating)));
  const halfStar = rating % 1 >= 0.5 ? 1 : 0;
  const emptyStars = Math.max(0, 5 - fullStars - halfStar);
  return '★'.repeat(fullStars) + (halfStar ? '☆' : '') + '☆'.repeat(emptyStars);
}

export function renderStarsUnicode(rating, maxStars = 5) {
  const r = Math.max(0, Math.min(maxStars, Number(rating) || 0));
  const full = Math.floor(r);
  const half = r % 1 >= 0.5 ? 1 : 0;
  const empty = maxStars - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

export function renderStarsHtml(rating, maxStars = 5) {
  const r = Math.max(0, Math.min(maxStars, Number(rating) || 0));
  const full = Math.floor(r);
  const hasHalf = r % 1 >= 0.5;
  const empty = maxStars - full - (hasHalf ? 1 : 0);
  
  let stars = '';
  for (let i = 0; i < full; i++) {
    stars += '<span class="star star-full">&#9733;</span>';
  }
  if (hasHalf) {
    stars += '<span class="star star-half">&#9733;</span>';
  }
  for (let i = 0; i < empty; i++) {
    stars += '<span class="star star-empty">&#9734;</span>';
  }
  return stars;
}

export function renderStarsForProductCard(ratingValue) {
  const rating = Math.max(0, Math.min(5, Number(ratingValue) || 5));
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;

  let stars = '';
  for (let index = 0; index < 5; index += 1) {
    if (index < fullStars) {
      stars += '<span class="star star-full">&#9733;</span>';
    } else if (index === fullStars && hasHalfStar) {
      stars += '<span class="star star-half">&#9733;</span>';
    } else {
      stars += '<span class="star star-empty">&#9734;</span>';
    }
  }
  return `<div class="rating-stars">${stars}</div>`;
}
