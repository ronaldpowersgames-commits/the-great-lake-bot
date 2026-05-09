const express = require('express');
const router = express.Router();
const { submitTemplate } = require('../controllers/templateController');
const { clarityFirstFilter, fieldLengthEnforcer } = require('../middleware/governanceEnforcement');
const config = require('../config');

var limits = {};
['volatility','rtp','symbols','features','waterCost','incentives','trajectory'].forEach(function(f) {
  limits[f] = config.governance.maxFieldLength;
});

router.post('/', clarityFirstFilter, fieldLengthEnforcer(limits), submitTemplate);

module.exports = router;
