const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const chatRoute = fs.readFileSync(path.join(root, 'routes', 'chat.js'), 'utf8');
const architecture = fs.readFileSync(
  path.join(root, 'core', 'model', 'cognitive_architecture_v3.txt'),
  'utf8'
);

test('v3 cognitive architecture is prioritized without injecting the legacy bible', () => {
  const runtimeList = chatRoute.match(/const files = \[([\s\S]*?)\n  \];/);
  assert.ok(runtimeList, 'runtime model file list exists');
  assert.match(runtimeList[1], /cognitive_architecture_v3\.txt/);
  assert.doesNotMatch(runtimeList[1], /master_doc\.txt/);
  assert.ok(
    runtimeList[1].indexOf('cognitive_architecture_v3.txt') < runtimeList[1].indexOf('behavior_rules.txt'),
    'the cognitive architecture has priority over supporting behavior rules'
  );
});

test('learning loop preserves calibration instead of rewriting history', () => {
  assert.match(architecture, /THE LAKE LEARNING LOOP/);
  assert.match(architecture, /compare what actually happened against the earlier reasoning/i);
  assert.match(architecture, /Do not rewrite the original prediction to make it appear correct/);
  assert.match(architecture, /Do not claim that one successful result proves a general rule/);
});

test('prompt loader keeps complete files within an explicit budget', () => {
  assert.match(chatRoute, /const MAX_PROMPT_CHARS = 50000/);
  assert.match(chatRoute, /Skipped model file outside prompt budget/);
  assert.doesNotMatch(chatRoute, /systemPrompt\.substring\(0, MAX_PROMPT_CHARS\)/);
});
