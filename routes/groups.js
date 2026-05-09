const express = require('express');
const router = express.Router();
const { createGroup, postMessage, getMessages } = require('../controllers/groupController');
const { clarityFirstFilter, fieldLengthEnforcer } = require('../middleware/governanceEnforcement');
const config = require('../config');

router.post('/', clarityFirstFilter, createGroup);
router.post('/:groupId/messages', clarityFirstFilter, fieldLengthEnforcer({ message: config.governance.maxMessageLength }), postMessage);
router.get('/:groupId/messages', getMessages);

module.exports = router;
