const test = require('node:test');
const assert = require('node:assert/strict');

const { addOrUpdateCharacter } = require('../controllers/characterController');
const { createGroup } = require('../controllers/groupController');
const { submitTemplate } = require('../controllers/templateController');
const { submitUpdate } = require('../controllers/updateController');

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function responseCapture() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return value; },
  };
}

test('controllers generate UUIDs with the built-in crypto API', async () => {
  const user = { id: 'security-test-user', email: 'security@example.test' };

  const character = responseCapture();
  await addOrUpdateCharacter({ user, body: { name: 'Sam', summary: 'Test character' } }, character);
  assert.equal(character.statusCode, 200);
  assert.match(character.body.id, UUID_V4);

  const group = responseCapture();
  await createGroup({ user, body: { groupName: 'Security test' } }, group);
  assert.equal(group.statusCode, 200);
  assert.match(group.body.id, UUID_V4);

  const template = responseCapture();
  await submitTemplate({ user, body: {
    volatility: 'low', rtp: '96%', symbols: 'standard', features: 'none',
    waterCost: 'low', incentives: 'clarity', trajectory: 'stable',
  } }, template);
  assert.equal(template.statusCode, 200);
  assert.match(template.body.templateId, UUID_V4);

  const update = responseCapture();
  await submitUpdate({ user, body: { updateCommand: 'SET_PARAMETER security_test=true' } }, update);
  assert.equal(update.statusCode, 200);
  assert.match(update.body.update.id, UUID_V4);
});
