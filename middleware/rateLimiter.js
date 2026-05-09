/**
 * The Great Lake Bot - Rate Limiting Middleware
 * Two tiers: global (standard) and strict (engine/updates).
 */
const rateLimit = require('express-rate-limit');
const config = require('../config');

const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Rate limit exceeded',
    details: 'The Great Lake Bot allows a maximum of ' + config.rateLimit.maxRequests + ' requests per ' + (config.rateLimit.windowMs / 60000) + ' minutes.',
  },
});

const strictLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: Math.floor(config.rateLimit.maxRequests / 4),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Rate limit exceeded',
    details: 'This endpoint has stricter rate limits on The Great Lake Bot. Please wait before retrying.',
  },
});

module.exports = { globalLimiter, strictLimiter };
