const express = require('express');
const router = express.Router();
const { addOrUpdateCharacter, getCharacters } = require('../controllers/characterController');
const { clarityFirstFilter, fieldLengthEnforcer } = require('../middleware/governanceEnforcement');
const config = require('../config');

router.post('/', clarityFirstFilter, fieldLengthEnforcer({
  summary: config.governance.maxSummaryLength,
  nickname: config.governance.maxNicknameLength,
}), addOrUpdateCharacter);

router.get('/', getCharacters);

module.exports = router;
