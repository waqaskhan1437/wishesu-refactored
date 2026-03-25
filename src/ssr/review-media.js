/**
 * Review SSR - Media Handling
 * Video metadata parsing and resolution for reviews
 */

import { stripUrlQueryHash } from '../utils/url-helpers.js';
import { extractYouTubeId } from '../utils/url-helpers.js';
import { safeJsonParse } from '../utils/json-helpers.js';

export function parseReviewVideoMetadataForSsr(review) {
  if (!review || !review.delivered_video_metadata) return {};
  return safeJsonParse(review.delivered_video_metadata, {});
}

export function extractYouTubeIdForSsr(value) {
  return extractYouTubeId(value);
}

export function resolveReviewVideoMediaForSsr(review) {
  const metadata = parseReviewVideoMetadataForSsr(review);
  const youtubeUrl = String(metadata.youtubeUrl || metadata.reviewYoutubeUrl || '').trim();
  const fallbackUrl = String(review?.delivered_video_url || metadata.downloadUrl || '').trim();
  const videoUrl = youtubeUrl || fallbackUrl;
  const isPublic = Number(review?.show_on_product) === 1;

  if (!videoUrl || !isPublic) {
    return { canWatch: false, videoUrl: '', posterUrl: '', isNativeVideo: false };
  }

  let posterUrl = String(
    review?.delivered_thumbnail_url ||
    metadata.thumbnailUrl ||
    metadata.posterUrl ||
    metadata.previewImage ||
    ''
  ).trim();

  const youtubeId = extractYouTubeIdForSsr(videoUrl);
  if (!posterUrl && youtubeId) {
    posterUrl = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
  }

  const normalizedVideo = stripUrlQueryHash(videoUrl).toLowerCase();
  const isNativeVideo = (
    /\.(mp4|webm|mov|m4v|m3u8|mpd)$/i.test(normalizedVideo) ||
    normalizedVideo.includes('/video/upload/')
  );

  return { canWatch: true, videoUrl, posterUrl, isNativeVideo };
}

export function renderReviewMediaDataAttrsForSsr(review, media) {
  const reviewerName = String(
    review?.customer_name || review?.author_name || 'Customer'
  ).trim() || 'Customer';
  const reviewTextRaw = String(review?.review_text || review?.comment || '')
    .replace(/\s+/g, ' ')
    .trim();
  const reviewText = reviewTextRaw.length > 600
    ? `${reviewTextRaw.slice(0, 597)}...`
    : reviewTextRaw;

  const escapeForAttr = (val) => String(val || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const attrs = [
    `data-review-video-url="${escapeForAttr(media?.videoUrl || '')}"`,
    `data-review-poster-url="${escapeForAttr(media?.posterUrl || '')}"`,
    `data-reviewer-name="${escapeForAttr(reviewerName)}"`,
    `data-review-text="${escapeForAttr(reviewText)}"`
  ];
  return attrs.join(' ');
}
