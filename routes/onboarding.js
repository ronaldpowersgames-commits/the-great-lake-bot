const express = require('express');
const router = express.Router();
const { onboard } = require('../controllers/onboardingController');
const { clarityFirstFilter } = require('../middleware/governanceEnforcement');

router.post('/', clarityFirstFilter, onboard);

module.exports = router;
