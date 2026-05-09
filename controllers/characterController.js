/**
 * The Great Lake Bot - Character Controller
 * POST /characters - Rules 21, 7  |  GET /characters - Rule 21
 */
const { v4: uuidv4 } = require('uuid');
const store = require('../store/memoryStore');
const { validateCharacter } = require('../validators');

async function addOrUpdateCharacter(req, res) {
  const validation = validateCharacter(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', details: validation.errors.join(' ') });
  }

  const { name, summary, nickname } = req.body;
  const characterId = uuidv4();

  const character = store.setCharacter(req.user.id, characterId, {
    name: name, summary: summary, nickname: nickname || null,
    createdBy: req.user.id, createdAt: new Date().toISOString(),
  });

  return res.status(200).json({
    id: character.id, name: character.name, summary: character.summary, nickname: character.nickname,
  });
}

async function getCharacters(req, res) {
  const characters = store.getCharactersByUser(req.user.id);
  return res.status(200).json({
    count: characters.length,
    characters: characters.map(function(c) { return { id: c.id, name: c.name, summary: c.summary, nickname: c.nickname }; }),
  });
}

module.exports = { addOrUpdateCharacter: addOrUpdateCharacter, getCharacters: getCharacters };
