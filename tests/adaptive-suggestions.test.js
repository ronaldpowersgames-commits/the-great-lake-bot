const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const suggestions=require('../public/adaptive-suggestions');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');

test('machine prompt blocks become bounded visible suggestions',()=>{
  const result=suggestions.extract(`Useful answer.\nLAKE_PROMPTS_JSON\n{"suggestions":[{"label":"Design the next observation","prompt":"Help me identify the cheapest observation that distinguishes novelty from repeat engagement.","kind":"test","why":"The current signal has several explanations."},{"label":"Audit my contribution modes","prompt":"Quiz me on which contribution mode moved the room and where I left value on the table.","kind":"quiz","why":"This reinforces transferable judgment."}]}\nEND_LAKE_PROMPTS_JSON`);
  assert.equal(result.text,'Useful answer.');
  assert.equal(result.suggestions.length,2);
  assert.equal(result.suggestions[0].kind,'test');
  assert.doesNotMatch(result.text,/LAKE_PROMPTS_JSON/);
});

test('malformed interface data is hidden instead of leaking into chat',()=>{
  const result=suggestions.extract('Answer\nLAKE_PROMPTS_JSON\n{broken\nEND_LAKE_PROMPTS_JSON');
  assert.equal(result.text,'Answer');
  assert.deepEqual(result.suggestions,[]);
});

test('tap and dismissal signals stay bounded and non-identifying',()=>{
  let profile=suggestions.record({},'chosen',{kind:'test'});
  profile=suggestions.record(profile,'chosen',{kind:'test'});
  profile=suggestions.record(profile,'dismissed',{kind:'quiz'});
  assert.deepEqual(suggestions.summary(profile),{chosen:{test:2},dismissed:{quiz:1},recent_chosen_kinds:['test','test']});
  assert.equal(Object.prototype.hasOwnProperty.call(suggestions.summary(profile),'labels'),false);
});

test('adaptive UI is compact, mood-aware and dismissible',()=>{
  assert.match(html,/id="adaptiveSuggestions"/);
  assert.match(html,/dismissAdaptiveSuggestions\(\)/);
  assert.match(html,/dismissAdaptiveSuggestion\(index,event\)/);
  assert.match(html,/data-mood="analytical"/);
  assert.match(html,/data-mood="stormy"/);
  assert.match(html,/linear-gradient\(135deg, color-mix/);
});
