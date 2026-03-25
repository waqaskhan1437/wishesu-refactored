/**
 * API Endpoint Protector
 * Automatic authentication wrapper for all API endpoints
 * Usage: Wrap any API handler with protectEndpoint(handler, permission)
 */

import { json } from './response.js';
import { getRequiredPermission } from '../config/api-permissions.js';
import { requireAdminOrApiKey } from '../middleware/api-auth.js';

/**
 * Protect an API endpoint with authentication and authorization
 * @param {Function} handler - Original API handler function
 * @param {string|null} permission - Required permission (null for public endpoints)
 * @returns {Function} Wrapped handler with authentication
 */
export function protectEndpoint(handler, permission = null) {
  return async function protectedHandler(req, env, ...args) {
    try {
      // Determine path and method
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;

      // Auto-detect permission if not provided
      if (!permission) {
        const detectedPermission = getRequiredPermission(path, method);

        // If no permission required (public endpoint) or not found in mapping
        if (!detectedPermission) {
          // For safety, require at least some form of auth for unknown endpoints
          const authCheck = await requireAdminOrApiKey(req, env, null);
          if (authCheck) return authCheck;
          return handler(req, env, ...args);
        }
      }

      const requiredPermission = permission || getRequiredPermission(path, method);

      // First check if this is a public endpoint (read-only data that's meant to be public)
      const publicReadEndpoints = [
        '/api/products',
        '/api/reviews',
        '/api/blogs',
        '/api/blog/published', // Fixed typo "bounpublished" to standard naming
        '/api/forum/questions',
        '/api/forum/question/',
        '/api/forum/question-replies',
        '/api/forum/question-by-id',
        '/api/forum/sidebar',
        '/api/blog/comments/',
        '/api/coupons/active'
      ];

      // Allow public access to READ endpoints without authentication
      const isPublicRead = publicReadEndpoints.some(route =>
        (route.endsWith('/') && path.startsWith(route)) || path === route
      );

      if (isPublicRead && method === 'GET') {
        // Public read endpoints - no auth required
        req.apiKeyData = { id: 'public', name: 'Public Access', permissions: [], usageCount: 0 };
        return handler(req, env, ...args);
      }

      // Apply authentication
      const authResult = await requireAdminOrApiKey(req, env, requiredPermission);

      if (authResult) {
        // Authentication failed, return the error response
        return authResult;
      }

      // Authentication successful - call original handler
      const startTime = Date.now();
      const response = await handler(req, env, ...args);

      // Track usage for authenticated requests
      if (req.apiKeyData && req.apiKeyData.id !== 'public') {
        // Store tracking info for later
        req._apiTrackingInfo = {
          endpoint: path,
          method: method,
          statusCode: response.status,
          responseTime: Date.now() - startTime,
          apiKeyId: req.apiKeyData.id
        };
      }

      return response;

    } catch (error) {
      console.error(`API Error in ${req.method} ${req.url}:`, error);

      const errorResponse = {
        error: 'Internal server error',
        message: error.message
      };

      // Add permission info if available
      if (permission) {
        errorResponse.requiredPermission = permission;
      }

      return json(errorResponse, 500);
    }
  };
}

/**
 * Batch protect multiple endpoints
 * Usage: protectEndpoints({
 *   products: { handler: getProducts, permission: 'products:list' },
 *   createProduct: { handler: saveProduct, permission: 'products:create' }
 * })
 */
export function protectEndpoints(endpointMap) {
  const protectedEndpoints = {};

  for (const [name, config] of Object.entries(endpointMap)) {
    protectedEndpoints[name] = protectEndpoint(config.handler, config.permission);
  }

  return protectedEndpoints;
}

/**
 * Get default permissions for common operations
 */
export const DEFAULT_PERMISSIONS = {
  // Products
  getProducts: 'products:list',
  getProductsList: 'products:list',
  getProduct: 'products:read',
  saveProduct: 'products:create',
  deleteProduct: 'products:delete',
  updateProductStatus: 'products:update',
  duplicateProduct: 'products:create',

  // Orders
  getOrders: 'orders:list',
  createOrder: 'orders:create',
  createManualOrder: 'orders:create',
  getBuyerOrder: 'orders:read',
  deleteOrder: 'orders:delete',
  updateOrder: 'orders:update',
  deliverOrder: 'orders:deliver',
  requestRevision: 'orders:revise',
  updatePortfolio: 'orders:update',
  updateArchiveLink: 'orders:update',
  markTipPaid: 'orders:update',

  // Reviews
  getReviews: 'reviews:list',
  getProductReviews: 'reviews:list',
  addReview: 'reviews:create',
  updateReview: 'reviews:update',
  deleteReview: 'reviews:delete',

  // Chat
  startChat: 'chat:send',
  syncChat: 'chat:read',
  sendMessage: 'chat:send',
  blockSession: 'chat:block',
  deleteSession: 'chat:delete',
  getSessions: 'chat:list',

  // Pages
  getPages: 'pages:list',
  getPagesList: 'pages:list',
  getPage: 'pages:read',
  getDefaultPage: 'pages:read',
  setDefaultPage: 'pages:update',
  clearDefaultPage: 'pages:update',
  savePage: 'pages:create',
  savePageBuilder: 'pages:create',
  deletePage: 'pages:delete',
  deletePageBySlug: 'pages:delete',
  updatePageStatus: 'pages:update',
  updatePageType: 'pages:update',
  duplicatePage: 'pages:create',
  loadPageBuilder: 'pages:builder',

  // Blogs
  getBlogs: 'blogs:list',
  getBlogsList: 'blogs:list',
  getPublishedBlogs: 'blogs:read',
  getBlog: 'blogs:read',
  getPublishedBlog: 'blogs:read',
  getPreviousBlogs: 'blogs:read',
  saveBlog: 'blogs:create',
  deleteBlog: 'blogs:delete',
  updateBlogStatus: 'blogs:update',
  duplicateBlog: 'blogs:create',

  // Blog Comments
  getBlogComments: 'blogs:comments:list',
  checkPendingComment: 'blogs:comments:read',
  addBlogComment: 'blogs:comments:create',
  getAdminComments: 'blogs:comments:list',
  updateCommentStatus: 'blogs:comments:update',
  deleteComment: 'blogs:comments:delete',
  bulkUpdateComments: 'blogs:comments:update',

  // Forum
  getPublishedQuestions: 'forum:list',
  getQuestion: 'forum:read',
  getQuestionById: 'forum:read',
  getQuestionReplies: 'forum:read',
  checkPendingForum: 'forum:read',
  submitQuestion: 'forum:create',
  submitReply: 'forum:create',
  getForumSidebar: 'forum:read',
  getAdminQuestions: 'forum:questions:list',
  getAdminReplies: 'forum:replies:list',
  updateQuestionStatus: 'forum:questions:update',
  updateReplyStatus: 'forum:replies:update',
  deleteQuestion: 'forum:questions:delete',
  deleteReply: 'forum:replies:delete',

  // Coupons
  getCoupons: 'coupons:list',
  getActiveCoupons: 'coupons:list',
  getCouponsEnabled: 'coupons:read',
  setCouponsEnabled: 'coupons:update',
  validateCoupon: 'coupons:validate',
  createCoupon: 'coupons:create',
  updateCoupon: 'coupons:update',
  deleteCoupon: 'coupons:delete',
  toggleCouponStatus: 'coupons:update',

  // Users
  getAdminUsers: 'users:list',
  // Note: Popular questions aur product-specific functions ko manually add karna padega
};
