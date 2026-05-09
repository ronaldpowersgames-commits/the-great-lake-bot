/**
 * The Great Lake Bot - Request Validators
 * Pure validation functions from OpenAPI schemas + governance rules.
 * Each returns { valid: boolean, errors: string[] }
 */
const config = require('../config');

function validateOnboarding(body) {
  const errors = [];
  if (!body.industry || typeof body.industry !== 'string') errors.push('Field "industry" is required and must be a string.');
  if (!body.role || typeof body.role !== 'string') errors.push('Field "role" is required and must be a string.');
  if (body.teamSize !== undefined) {
    if (typeof body.teamSize !== 'number' || !Number.isInteger(body.teamSize) || body.teamSize < 0)
      errors.push('Field "teamSize" must be a non-negative integer.');
  }
  if (body.challenges !== undefined) {
    if (!Array.isArray(body.challenges)) errors.push('Field "challenges" must be an array of strings.');
    else if (body.challenges.some(function(c) { return typeof c !== 'string'; })) errors.push('Each item in "challenges" must be a string.');
  }
  return { valid: errors.length === 0, errors: errors };
}

function validateTemplate(body) {
  var requiredFields = ['volatility', 'rtp', 'symbols', 'features', 'waterCost', 'incentives', 'trajectory'];
  var errors = [];
  var maxLen = config.governance.maxFieldLength;
  for (var i = 0; i < requiredFields.length; i++) {
    var field = requiredFields[i];
    if (!body[field] || typeof body[field] !== 'string') errors.push('Field "' + field + '" is required and must be a string.');
    else if (body[field].length > maxLen) errors.push('Field "' + field + '" exceeds maximum length of ' + maxLen + ' characters.');
  }
  return { valid: errors.length === 0, errors: errors };
}

function validateEngineProcess(body) {
  var errors = [];
  if (!body.templateId || typeof body.templateId !== 'string') errors.push('Field "templateId" is required and must be a string.');
  return { valid: errors.length === 0, errors: errors };
}

function validateCharacter(body) {
  var errors = [];
  var maxSummary = config.governance.maxSummaryLength;
  var maxNickname = config.governance.maxNicknameLength;
  if (!body.name || typeof body.name !== 'string') errors.push('Field "name" is required and must be a string.');
  if (!body.summary || typeof body.summary !== 'string') errors.push('Field "summary" is required and must be a string.');
  else if (body.summary.length > maxSummary) errors.push('Field "summary" exceeds maximum length of ' + maxSummary + ' characters.');
  if (body.nickname !== undefined) {
    if (typeof body.nickname !== 'string') errors.push('Field "nickname" must be a string.');
    else if (body.nickname.length > maxNickname) errors.push('Field "nickname" exceeds maximum length of ' + maxNickname + ' characters.');
  }
  return { valid: errors.length === 0, errors: errors };
}

function validateNickname(body) {
  var errors = [];
  var maxLen = config.governance.maxNicknameLength;
  if (!body.characterId || typeof body.characterId !== 'string') errors.push('Field "characterId" is required and must be a string.');
  if (!body.nickname || typeof body.nickname !== 'string') errors.push('Field "nickname" is required and must be a string.');
  else if (body.nickname.length > maxLen) errors.push('Field "nickname" exceeds maximum length of ' + maxLen + ' characters.');
  if (body.contextHook !== undefined && typeof body.contextHook !== 'string') errors.push('Field "contextHook" must be a string.');
  if (body.roleTwist !== undefined && typeof body.roleTwist !== 'string') errors.push('Field "roleTwist" must be a string.');
  if (body.tag !== undefined && typeof body.tag !== 'string') errors.push('Field "tag" must be a string.');
  return { valid: errors.length === 0, errors: errors };
}

function validateGroup(body) {
  var errors = [];
  if (!body.groupName || typeof body.groupName !== 'string') errors.push('Field "groupName" is required and must be a string.');
  if (body.members !== undefined) {
    if (!Array.isArray(body.members)) errors.push('Field "members" must be an array of user ID strings.');
    else if (body.members.some(function(m) { return typeof m !== 'string'; })) errors.push('Each item in "members" must be a string.');
  }
  return { valid: errors.length === 0, errors: errors };
}

function validateGroupMessage(body) {
  var errors = [];
  var maxLen = config.governance.maxMessageLength;
  if (!body.message || typeof body.message !== 'string') errors.push('Field "message" is required and must be a string.');
  else if (body.message.length > maxLen) errors.push('Field "message" exceeds maximum length of ' + maxLen + ' characters.');
  if (body.nicknameReferences !== undefined) {
    if (!Array.isArray(body.nicknameReferences)) errors.push('Field "nicknameReferences" must be an array of strings.');
    else if (body.nicknameReferences.some(function(n) { return typeof n !== 'string'; })) errors.push('Each item in "nicknameReferences" must be a string.');
  }
  return { valid: errors.length === 0, errors: errors };
}

function validateUpdate(body) {
  var errors = [];
  var maxLen = config.governance.maxUpdateCommandLength;
  if (!body.updateCommand || typeof body.updateCommand !== 'string') errors.push('Field "updateCommand" is required and must be a string.');
  else if (body.updateCommand.length > maxLen) errors.push('Field "updateCommand" exceeds maximum length of ' + maxLen + ' characters.');
  return { valid: errors.length === 0, errors: errors };
}

module.exports = {
  validateOnboarding: validateOnboarding,
  validateTemplate: validateTemplate,
  validateEngineProcess: validateEngineProcess,
  validateCharacter: validateCharacter,
  validateNickname: validateNickname,
  validateGroup: validateGroup,
  validateGroupMessage: validateGroupMessage,
  validateUpdate: validateUpdate,
};
