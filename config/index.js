/**
 * The Great Lake Bot - Centralized Configuration
 * All settings loaded from environment variables.
 */
require('dotenv').config();

const config = {
  appName: process.env.APP_NAME || 'The Great Lake Bot',
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    issuer: process.env.JWT_ISSUER || 'thegreatlakebot',
    audience: process.env.JWT_AUDIENCE || 'the-great-lake-bot',
    expiry: process.env.JWT_EXPIRY || '24h',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },

  governance: {
    strictMode: process.env.GOVERNANCE_STRICT_MODE === 'true',
    maxFieldLength: parseInt(process.env.MAX_FIELD_LENGTH, 10) || 2000,
    maxSummaryLength: parseInt(process.env.MAX_SUMMARY_LENGTH, 10) || 1500,
    maxNicknameLength: parseInt(process.env.MAX_NICKNAME_LENGTH, 10) || 50,
    maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH, 10) || 5000,
    maxUpdateCommandLength: parseInt(process.env.MAX_UPDATE_COMMAND_LENGTH, 10) || 3000,
  },
};

module.exports = config;
