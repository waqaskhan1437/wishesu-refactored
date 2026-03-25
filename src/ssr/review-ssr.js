/**
 * Review SSR - Review Card & Media Rendering
 * Review-specific SSR rendering functions
 */

import { escapeHtmlText } from '../utils/html-entities.js';
import { formatReviewDateForSsr } from '../utils/date-formatter.js';
import { parseReviewVideoMetadataForSsr, resolveReviewVideoMediaForSsr, renderReviewMediaDataAttrsForSsr } from './review-media.js';
import { optimizeThumbUrlForSsr } from './product-player.js';

export function renderSsrReviewCards(reviewsInput = []) {
  const reviews = Array.isArray(reviewsInput) ? reviewsInput.slice(0, 5) : [];
  if (reviews.length === 0) return '';

  return reviews.map((review) => {
    const reviewerName = escapeHtmlText(
      String(review?.customer_name || review?.author_name || 'Anonymous')
    );
    const reviewText = escapeHtmlText(
      String(review?.review_text || review?.comment || '')
    ).replace(/\n/g, '<br>');
    const rating = Math.max(1, Math.min(5, parseInt(review?.rating, 10) || 5));
    const stars = '&#9733;'.repeat(rating) + '&#9734;'.repeat(5 - rating);
    const dateText = escapeHtmlText(formatReviewDateForSsr(review?.created_at));
    const reviewMedia = resolveReviewVideoMediaForSsr(review);
    const watchDataAttrs = renderReviewMediaDataAttrsForSsr(review, reviewMedia);
    const canWatch = !!reviewMedia.canWatch && !!reviewMedia.videoUrl;
    const posterThumb = reviewMedia.posterUrl
      ? `<img src="${escapeHtmlText(optimizeThumbUrlForSsr(reviewMedia.posterUrl, 520))}" alt="Review video thumbnail" loading="lazy" decoding="async" width="260" height="146" style="width:100%;height:100%;object-fit:cover;display:block;">`
      : '<div style="width:100%;height:100%;background:#0f172a;"></div>';
    const watchRowHtml = canWatch
      ? `
        <div class="review-portfolio-row" style="display:flex;align-items:center;gap:16px;margin-top:16px;padding-top:16px;border-top:1px solid #f3f4f6;flex-wrap:wrap;">
          <div data-review-watch="1" data-review-portfolio-thumb="1" ${watchDataAttrs} style="position:relative;min-width:260px;width:260px;height:146px;flex-shrink:0;cursor:pointer;border-radius:10px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);background:#000;">
            ${posterThumb}
            <div style="position:absolute;top:8px;right:8px;background:rgba(16,185,129,0.95);color:white;padding:5px 12px;border-radius:6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;box-shadow:0 2px 6px rgba(0,0,0,0.3);">Review</div>
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.75);color:white;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;padding-left:3px;pointer-events:none;">&#9654;</div>
          </div>
          <button type="button" data-review-watch="1" ${watchDataAttrs} style="background:#111827;color:white;border:0;padding:12px 16px;border-radius:8px;cursor:pointer;font-weight:600;font-size:15px;">&#9654; Watch Video</button>
        </div>`
      : '';

    return `
      <article data-ssr-review-card="1" style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:6px;">
          <strong style="font-size:0.95rem;color:#1f2937;">${reviewerName}</strong>
          ${dateText ? `<span style="font-size:0.78rem;color:#6b7280;">${dateText}</span>` : ''}
        </div>
        <div style="color:#fbbf24;margin-bottom:8px;font-size:0.95rem;" aria-label="${rating} out of 5 stars">${stars}</div>
        <div style="font-size:0.92rem;color:#4b5563;line-height:1.5;">${reviewText || 'No review text provided.'}</div>
        ${watchRowHtml}
      </article>`;
  }).join('');
}

export function renderSsrReviewSliderThumbs(reviewsInput = []) {
  const reviews = Array.isArray(reviewsInput) ? reviewsInput : [];
  const reviewMediaList = reviews
    .map((review) => ({ review, media: resolveReviewVideoMediaForSsr(review) }))
    .filter((item) => !!item.media.canWatch && !!item.media.videoUrl)
    .slice(0, 20);

  if (reviewMediaList.length === 0) return '';

  return reviewMediaList.map(({ review, media }) => {
    const dataAttrs = renderReviewMediaDataAttrsForSsr(review, media);
    const posterHtml = media.posterUrl
      ? `<img src="${escapeHtmlText(optimizeThumbUrlForSsr(media.posterUrl, 280))}" alt="Review video thumbnail" loading="lazy" decoding="async" width="140" height="100" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;background:#1a1a2e;">`
      : '<div style="width:100%;height:100%;background:#1a1a2e;"></div>';

    return `
              <div data-review-slider-thumb="1" data-review-watch="1" ${dataAttrs} style="position:relative;min-width:140px;width:140px;height:100px;flex-shrink:0;cursor:pointer;border-radius:10px;overflow:hidden;border:3px solid transparent;transition:border-color 0.15s ease, transform 0.15s ease;background:#1a1a2e;">
                ${posterHtml}
                <div style="position:absolute;bottom:4px;right:4px;background:rgba(16,185,129,0.95);color:white;padding:3px 8px;border-radius:4px;font-size:10px;font-weight:700;z-index:10;">Review</div>
                <div class="thumb-play-btn" aria-hidden="true" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.6);color:white;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;padding-left:2px;z-index:100;pointer-events:none;">&#9654;</div>
              </div>`;
  }).join('');
}
