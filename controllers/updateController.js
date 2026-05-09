/**
 * The Great Lake Bot - Update Controller
 * POST /updates - Rules 11 (Update Syntax), 12 (Safety Filter)
 */
const { v4: uuidv4 } = require('uuid');
const store = require('../store/memoryStore');
const { validateUpdate } = require('../validators');

var VALID_COMMAND_PREFIXES = [
  'UPDATE_RULE', 'ADD_RULE', 'MODIFY_RULE', 'APPEND_CONTEXT',
  'SET_PARAMETER', 'ENABLE_MODULE', 'DISABLE_MODULE',
];

var UNSAFE_UPDATE_PATTERNS = [
  /disable.*safety/i, /remove.*governance/i, /bypass.*rule/i,
  /override.*filter/i, /ignore.*compliance/i, /allow.*unsafe/i,
  /delete.*all/i, /drop.*rule/i,
];

function validateCommandSyntax(command) {
  var trimmed = command.trim();
  var hasValidPrefix = VALID_COMMAND_PREFIXES.some(function(prefix) {
    return trimmed.toUpperCase().startsWith(prefix);
  });

  if (!hasValidPrefix) {
    return { valid: false, error: 'Invalid command syntax (Rule 11). Command must start with one of: ' + VALID_COMMAND_PREFIXES.join(', ') };
  }

  for (var i = 0; i < UNSAFE_UPDATE_PATTERNS.length; i++) {
    if (UNSAFE_UPDATE_PATTERNS[i].test(trimmed)) {
      return { valid: false, error: 'Update rejected by The Great Lake Bot: command introduces unsafe governance drift (Rule 12).' };
    }
  }

  return { valid: true };
}

async function submitUpdate(req, res) {
  const validation = validateUpdate(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', details: validation.errors.join(' ') });
  }

  var syntaxCheck = validateCommandSyntax(req.body.updateCommand);
  if (!syntaxCheck.valid) {
    return res.status(422).json({ error: 'Governance violation', details: syntaxCheck.error });
  }

  var updateRecord = {
    id: uuidv4(), userId: req.user.id, command: req.body.updateCommand,
    status: 'accepted', processedAt: new Date().toISOString(),
  };
  store.addUpdate(updateRecord);

  return res.status(200).json({
    message: 'The Great Lake Bot accepted and queued the update command for processing.',
    update: updateRecord,
    governanceCheck: { rule11_syntaxValid: true, rule12_safetyPassed: true },
  });
}

module.exports = { submitUpdate: submitUpdate };
