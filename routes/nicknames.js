const express = require('express');
const router = express.Router();
const { createNickname } = require('../controllers/nicknameController');
const { fieldLengthEnforcer } = require('../middleware/governanceEnforcement');
const config = require('../config');

router.post('/', fieldLengthEnforcer({ nickname: config.governance.maxNicknameLength }), createNickname);

module.exports = router;
