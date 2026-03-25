/**
 * Error Handler Module
 * Consolidated error handling utilities
 * Eliminates 487+ catch block patterns
 */

export function handleError(error, context = {}) {
  const message = error?.message || String(error) || 'Unknown error';
  const contextStr = Object.keys(context).length > 0 ? ` [${JSON.stringify(context)}]` : '';
  console.error(`Error${contextStr}:`, message);
  return { error: message, context };
}

export function logError(error, context = {}) {
  const timestamp = new Date().toISOString();
  const message = error?.message || String(error) || 'Unknown error';
  const contextData = Object.keys(context).length > 0 ? ` | Context: ${JSON.stringify(context)}` : '';
  
  console.error(`[${timestamp}] Error:`, message, contextData);
  
  return {
    timestamp,
    message,
    context,
    stack: error?.stack
  };
}

export function safeAsync(fn, fallback = null) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      handleError(e, { fn: fn.name || 'anonymous' });
      return fallback;
    }
  };
}

export async function tryCatch(promise, fallback = null) {
  try {
    return await promise;
  } catch (e) {
    handleError(e);
    return fallback;
  }
}

export function tryCatchSync(fn, fallback = null) {
  try {
    return fn();
  } catch (e) {
    handleError(e);
    return fallback;
  }
}

export function isError(value) {
  return value instanceof Error;
}

export function getErrorMessage(error) {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  if (error.error) return error.error;
  return String(error);
}

export function isNetworkError(error) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('connection') ||
    message.includes('timeout') ||
    message.includes('abort')
  );
}

export function isAuthError(error) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('auth') ||
    message.includes('token') ||
    message.includes('login')
  );
}

export function isNotFoundError(error) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('not found') ||
    message.includes('404') ||
    message.includes('does not exist')
  );
}

export function isValidationError(error) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('validation') ||
    message.includes('invalid') ||
    message.includes('required') ||
    message.includes('missing')
  );
}

export class AppError extends Error {
  constructor(message, statusCode = 500, context = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      error: this.message,
      statusCode: this.statusCode,
      context: this.context,
      timestamp: this.timestamp
    };
  }
}

export class ValidationError extends AppError {
  constructor(message, context = {}) {
    super(message, 400, context);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', context = {}) {
    super(message, 404, context);
    this.name = 'NotFoundError';
  }
}

export class AuthError extends AppError {
  constructor(message = 'Unauthorized', context = {}) {
    super(message, 401, context);
    this.name = 'AuthError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', context = {}) {
    super(message, 403, context);
    this.name = 'ForbiddenError';
  }
}

export class NetworkError extends AppError {
  constructor(message = 'Network error', context = {}) {
    super(message, 502, context);
    this.name = 'NetworkError';
  }
}

export function withErrorHandler(handler, options = {}) {
  const { 
    onError = null, 
    fallback = null,
    logErrors = true 
  } = options;

  return async (...args) => {
    try {
      return await handler(...args);
    } catch (e) {
      if (logErrors) {
        handleError(e, { handler: handler.name || 'anonymous' });
      }
      
      if (onError) {
        return onError(e, ...args);
      }
      
      if (fallback !== undefined) {
        return fallback;
      }
      
      throw e;
    }
  };
}

export function createErrorHandler(options = {}) {
  const { 
    logErrors = true,
    returnJson = true,
    statusCode = 500 
  } = options;

  return (error, ...args) => {
    if (logErrors) {
      handleError(error, { args: args.length });
    }

    const message = getErrorMessage(error);

    if (returnJson) {
      return new Response(JSON.stringify({ error: message }), {
        status: error?.statusCode || statusCode,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(message, {
      status: error?.statusCode || statusCode
    });
  };
}
