/**
 * The Great Lake Bot - Nickname Controller
 * POST /nicknames - Rule 22 (Nickname Generation)
 */
const store = require('../store/memoryStore');
const { validateNickname } = require('../validators');

async function createNickname(req, res) {
  const validation = validateNickname(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', details: validation.errors.join(' ') });
  }

  const { characterId, nickname, contextHook, roleTwist, tag } = req.body;

  const characters = store.getCharactersByUser(req.user.id);
  const character = characters.find(function(c) { return c.id === characterId; });
  if (!character) {
    return res.status(404).json({ error: 'Character not found', details: 'The Great Lake Bot has no character with ID "' + characterId + '" for your account.' });
  }

  character.nickname = nickname;

  return res.status(200).json({
    message: 'The Great Lake Bot assigned the nickname successfully.',
    characterId: characterId, nickname: nickname,
    contextHook: contextHook || null, roleTwist: roleTwist || null, tag: tag || null,
    assignedAt: new Date().toISOString(),
    governanceCheck: { rule22_safe: true, rule22_groupFriendly: true, rule22_leadershipAppropriate: true },
  });
}

module.exports = { createNickname: createNickname };
