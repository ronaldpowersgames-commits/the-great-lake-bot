/**
 * The Great Lake Bot - Global Error Handler
 * Returns errors in the standard Error schema: { error, details }
 */
const config = require('../config');

function errorHandler(err, req, res, _next) {
  console.error('[' + config.appName + ' ERROR] ' + err.message, err.stack);

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Internal server error',
    details: config.nodeEnv === 'production'
      ? 'An unexpected error occurred in The Great Lake Bot. Please try again later.'
      : err.stack,
  });
}

module.exports = { errorHandler };
