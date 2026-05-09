// 🌊 The Great Lake Bot — Onboarding Routes
const express = require('express');
const router = express.Router();

const { onboard } = require('../controllers/onboardingController');
const { clarityFirstFilter } = require('../middleware/governanceEnforcement');

// Existing onboarding route
router.post('/', clarityFirstFilter, onboard);

// New login route for frontend bridge
router.post('/login', (req, res) => {
  const { name, passphrase } = req.body;

  // Basic validation
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  // Temporary mock response (replace with real auth later)
  res.json({
    success: true,
    message: `Welcome aboard, ${name}!`,
    token: 'mock-token-123'
  });
});

module.exports = router;
