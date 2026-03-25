/**
 * File upload helper utilities
 */

/**
 * Get MIME type from filename extension
 * @param {string} filename
 * @returns {string}
 */
export function getMimeTypeFromFilename(filename) {
  const ext = (filename || '').split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    case 'm4v':
      return 'video/x-m4v';
    case 'mkv':
      return 'video/x-matroska';
    case 'avi':
      return 'video/x-msvideo';
    case 'wmv':
      return 'video/x-ms-wmv';
    case 'flv':
      return 'video/x-flv';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'pdf':
      return 'application/pdf';
    case 'zip':
      return 'application/zip';
    default:
      return '';
  }
}

/**
 * Resolve content type from request headers or filename
 * @param {Request} req
 * @param {string} filename
 * @returns {string}
 */
export function resolveContentType(req, filename) {
  const headerContentType = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (headerContentType && headerContentType !== 'application/octet-stream') {
    return headerContentType;
  }
  return getMimeTypeFromFilename(filename) || headerContentType || 'application/octet-stream';
}

/**
 * Check if file is a video based on MIME type or extension
 * @param {string} mimeType
 * @param {string} filename
 * @returns {boolean}
 */
export function isVideoFile(mimeType, filename) {
  if (mimeType && mimeType.startsWith('video/')) return true;
  const ext = (filename || '').split('.').pop()?.toLowerCase();
  return ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi', 'wmv', 'flv'].includes(ext);
}

/**
 * Validate file size
 * @param {number} size - Size in bytes
 * @param {number} maxSizeMB - Max size in MB
 * @returns {{valid: boolean, message?: string}}
 */
export function validateFileSize(size, maxSizeMB = 100) {
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (size > maxBytes) {
    return { valid: false, message: `File size exceeds ${maxSizeMB}MB limit` };
  }
  return { valid: true };
}

/**
 * Sanitize filename for storage
 * @param {string} filename
 * @returns {string}
 */
export function sanitizeFilename(filename) {
  return String(filename || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 200);
}
