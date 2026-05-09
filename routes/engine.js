const express = require('express');
const router = express.Router();
const { processEngine } = require('../controllers/engineController');
const { strictLimiter } = require('../middleware/rateLimiter');

router.post('/process', strictLimiter, processEngine);

module.exports = router;
