const express = require('express');
const router = express.Router();
const { submitUpdate } = require('../controllers/updateController');
const { strictLimiter } = require('../middleware/rateLimiter');

router.post('/', strictLimiter, submitUpdate);

module.exports = router;
