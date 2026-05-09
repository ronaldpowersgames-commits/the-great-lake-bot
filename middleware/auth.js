/**
 * The Great Lake Bot - JWT Authentication Middleware
 * All endpoints require bearerAuth (OpenAPI security scheme).
 */
const jwt = require('jsonwebtoken');
const config = require('../config');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required',
      details: config.appName + ' requires a valid Bearer token in the Authorization header.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });

    req.user = {
      id: decoded.sub,
      email: decoded.email || null,
      roles: decoded.roles || [],
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        details: 'Your session has expired. Please re-authenticate with The Great Lake Bot.',
      });
    }
    return res.status(403).json({
      error: 'Invalid token',
      details: 'The provided token is malformed or has been tampered with.',
    });
  }
}

module.exports = { authenticate };
