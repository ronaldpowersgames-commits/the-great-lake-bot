/**
 * 🌊 The Great Lake Bot - Main Server
 * Production-grade Express server with full governance enforcement (Rules 1-27).
 */

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config');

const { authenticate } = require('./middleware/auth');
const { globalLimiter } = require('./middleware/rateLimiter');
const { safetyFilter } = require('./middleware/governanceEnforcement');
const { errorHandler } = require('./middleware/errorHandler');

// Route imports
const onboardingRoutes = require('./routes/onboarding');
const templateRoutes = require('./routes/template');
const engineRoutes = require('./routes/engine');
const characterRoutes = require('./routes/characters');
const nicknameRoutes = require('./routes/nicknames');
const groupRoutes = require('./routes/groups');
const updateRoutes = require('./routes/updates');
const chatRoutes = require('./routes/chat');
const crewRoutes = require('./routes/crew');

const app = express();
app.set('trust proxy', 1);

// ============================================
// SECURITY MIDDLEWARE
// ============================================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  })
);

app.use(
  cors({
    origin:
      config.nodeEnv === 'production'
        ? ['https://the-great-lake-bot.onrender.com']
        : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

// ============================================
// BODY PARSERS
// ============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================
// RATE LIMITER
// ============================================
app.use(globalLimiter);

// ============================================
// PUBLIC ROUTES (no auth required)
// ============================================

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Prevent favicon 401
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Public chat endpoint
app.use('/chat', chatRoutes);

// Public crew endpoint
app.use('/crew', crewRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    name: config.appName,
    status: 'healthy',
    version: '1.3.0',
    timestamp: new Date().toISOString(),
    governance: 'Rules 1-27 active',
    lake: 'Still waters — ready to reflect',
  });
});

// Status check
app.get('/status', (req, res) => {
  res.status(200).json({ ok: true });
});

// Dev token generator
if (config.nodeEnv !== 'production') {
  const jwt = require('jsonwebtoken');
  app.post('/dev/token', (req, res) => {
    const sub = (req.body && req.body.sub) || 'dev-user-001';
    const email =
      (req.body && req.body.email) ||
      'ronnie@thegreatlakebot.example';

    const token = jwt.sign(
      { sub, email, roles: ['user'] },
      config.jwt.secret,
      {
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
        expiresIn: config.jwt.expiry,
      }
    );

    res.json({
      message: `Welcome to ${config.appName}. Here is your dev token.`,
      token,
      expiresIn: config.jwt.expiry,
    });
  });
}

// Serve frontend root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// AUTHENTICATED ROUTES (auth required)
// ============================================
app.use(authenticate);
app.use(safetyFilter);

app.use('/onboarding', onboardingRoutes);
app.use('/template', templateRoutes);
app.use('/engine', engineRoutes);
app.use('/characters', characterRoutes);
app.use('/nicknames', nicknameRoutes);
app.use('/groups', groupRoutes);
app.use('/updates', updateRoutes);

// ============================================
// 404 HANDLER
// ============================================
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    details: `${req.method} ${req.path} is not a valid The Great Lake Bot endpoint.`,
  });
});

// ============================================
// ERROR HANDLING
// ============================================
app.use(errorHandler);

// ============================================
// START SERVER
// ============================================
app.listen(config.port, () => {
  console.log('');
  console.log('========================================================');
  console.log('  🌊 The Great Lake Bot  v1.3.0');
  console.log('========================================================');
  console.log('  Environment : ' + config.nodeEnv);
  console.log('  Port        : ' + config.port);
  console.log('  Governance  : Rules 1-27 ACTIVE');
  console.log('  Model       : claude-haiku-4-5');
  console.log('  Status      : Still waters — ready to reflect');
  console.log('========================================================');
  console.log('');
});

module.exports = app;
