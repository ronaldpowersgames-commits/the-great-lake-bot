/**
 * The Great Lake Bot - Main Server
 * Production-grade Express server with full governance enforcement (Rules 1-27).
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const config = require('./config');
const { authenticate } = require('./middleware/auth');
const { globalLimiter } = require('./middleware/rateLimiter');
const { safetyFilter } = require('./middleware/governanceEnforcement');
const { errorHandler } = require('./middleware/errorHandler');

const onboardingRoutes = require('./routes/onboarding');
const templateRoutes = require('./routes/template');
const engineRoutes = require('./routes/engine');
const characterRoutes = require('./routes/characters');
const nicknameRoutes = require('./routes/nicknames');
const groupRoutes = require('./routes/groups');
const updateRoutes = require('./routes/updates');

const app = express();

app.use(helmet());
app.use(cors({
  origin: config.nodeEnv === 'production' ? ['https://thegreatlakebot.example'] : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(globalLimiter);

// Health check (unauthenticated)
app.get('/health', function(req, res) {
  res.status(200).json({
    name: config.appName,
    status: 'healthy',
    version: '1.3.0',
    timestamp: new Date().toISOString(),
    governance: 'Rules 1-27 active',
  });
});

// Status check (unauthenticated)
app.get('/status', function(req, res) {
  res.status(200).json({ ok: true });
});

// Dev token generator (non-production only)
if (config.nodeEnv !== 'production') {
  var jwt = require('jsonwebtoken');
  app.post('/dev/token', function(req, res) {
    var sub = (req.body && req.body.sub) || 'dev-user-001';
    var email = (req.body && req.body.email) || 'ronnie@thegreatlakebot.example';
    var token = jwt.sign(
      { sub: sub, email: email, roles: ['user'] },
      config.jwt.secret,
      { issuer: config.jwt.issuer, audience: config.jwt.audience, expiresIn: config.jwt.expiry }
    );
    res.json({ message: 'Welcome to ' + config.appName + '. Here is your dev token.', token: token, expiresIn: config.jwt.expiry });
  });
}

// Authenticated routes
app.use(authenticate);
app.use(safetyFilter);

app.use('/onboarding', onboardingRoutes);
app.use('/template', templateRoutes);
app.use('/engine', engineRoutes);
app.use('/characters', characterRoutes);
app.use('/nicknames', nicknameRoutes);
app.use('/groups', groupRoutes);
app.use('/updates', updateRoutes);

// 404 handler
app.use(function(req, res) {
  res.status(404).json({
    error: 'Endpoint not found',
    details: req.method + ' ' + req.path + ' is not a valid ' + config.appName + ' API endpoint.',
  });
});

app.use(errorHandler);

app.listen(config.port, function() {
  console.log('');
  console.log('========================================================');
  console.log('  The Great Lake Bot  v1.3.0');
  console.log('========================================================');
  console.log('  Environment : ' + config.nodeEnv);
  console.log('  Port        : ' + config.port);
  console.log('  Governance  : Rules 1-27 ACTIVE');
  console.log('  Status      : Ready to serve clarity');
  console.log('========================================================');
  console.log('');
});

module.exports = app;
