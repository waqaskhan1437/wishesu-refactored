/**
 * URL & Media Utilities
 * Consolidated URL and media handling functions
 */

export function stripUrlQueryHash(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  return s.split('#')[0].split('?')[0];
}

export function isLikelyVideoMediaUrl(value) {
  const s = stripUrlQueryHash(value).toLowerCase();
  if (!s) return false;
  if (s.includes('youtube.com') || s.includes('youtu.be')) return true;
  return /\.(mp4|webm|mov|mkv|avi|m4v|flv|wmv|m3u8|mpd)(?:$)/i.test(s);
}

export function isLikelyImageMediaUrl(value) {
  const s = String(value || '').trim().toLowerCase();
  if (!s) return false;
  if (s.startsWith('data:image/')) return true;
  if (s.startsWith('/')) return true;
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('//')) return true;
  return false;
}

export function toGalleryArray(value) {
  if (Array.isArray(value)) return value;
  const s = String(value || '').trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  if (s.includes(',')) {
    return s.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [s];
}

export function normalizeGalleryForPlayerSsr(galleryValue, thumbnailUrl, videoUrl) {
  const input = toGalleryArray(galleryValue);
  const normalizedMain = stripUrlQueryHash(thumbnailUrl);
  const normalizedVideo = stripUrlQueryHash(videoUrl);
  const seen = new Set();
  const out = [];

  for (const item of input) {
    const raw = String(item || '').trim();
    if (!raw) continue;
    if (!isLikelyImageMediaUrl(raw)) continue;
    if (isLikelyVideoMediaUrl(raw)) continue;
    const normalized = stripUrlQueryHash(raw);
    if (!normalized) continue;
    if (normalizedMain && normalized === normalizedMain) continue;
    if (normalizedVideo && normalized === normalizedVideo) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(raw);
    if (out.length >= 8) break;
  }

  return out;
}

export function extractYouTubeId(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  const match = s.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{6,})/i);
  return match ? String(match[1] || '').trim() : '';
}
