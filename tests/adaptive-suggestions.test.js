const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const suggestions=require('../public/adaptive-suggestions');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const printPage=fs.readFileSync(path.join(root,'public','transcript-print.html'),'utf8');

test('machine prompt blocks become bounded visible suggestions',()=>{
  const result=suggestions.extract(`Useful answer.\nLAKE_PROMPTS_JSON\n{"suggestions":[{"label":"🧪💡 Design the next observation","prompt":"Help me identify the cheapest observation that distinguishes novelty from repeat engagement.","kind":"test","why":"The current signal has several explanations."},{"label":"Audit my contribution modes","prompt":"Quiz me on which contribution mode moved the room and where I left value on the table.","kind":"quiz","why":"This reinforces transferable judgment."}]}\nEND_LAKE_PROMPTS_JSON`);
  assert.equal(result.text,'Useful answer.');
  assert.equal(result.suggestions.length,2);
  assert.equal(result.suggestions[0].kind,'test');
  assert.equal(result.suggestions[0].label,'🧪 Design the next observation');
  assert.doesNotMatch(result.text,/LAKE_PROMPTS_JSON/);
});

test('malformed interface data is hidden instead of leaking into chat',()=>{
  const result=suggestions.extract('Answer\nLAKE_PROMPTS_JSON\n{broken\nEND_LAKE_PROMPTS_JSON');
  assert.equal(result.text,'Answer');
  assert.deepEqual(result.suggestions,[]);
});

test('an actual Lake score always gains the standard diagnostic follow-up',()=>{
  const scored=suggestions.ensureScoreBreakdown(suggestions.extract('## Overall Lake Score: 8.7/10\nStrong result.'));
  assert.equal(scored.suggestions[0].label,'What scored well/poorly and the flow pattern explanation');
  assert.match(scored.suggestions[0].prompt,/what scored well, what scored poorly/i);
  const ordinary=suggestions.ensureScoreBreakdown(suggestions.extract('Strong result without a score.'));
  assert.deepEqual(ordinary.suggestions,[]);
  const existing=suggestions.ensureScoreBreakdown({text:'Lake verdict: 9.1/10',suggestions:[{label:'Explain what scored well',prompt:'Explain what scored well and the flow pattern.',kind:'drill_down'}]});
  assert.equal(existing.suggestions.length,1);
});

test('a first reply always has useful onboarding moves when the model omits them',()=>{
  const first=suggestions.ensureFirstResponse({text:'Welcome to the Lake.',suggestions:[]},true);
  assert.deepEqual(first.suggestions.map(item=>item.kind),['drill_down','counterpoint','action']);
  assert.equal(first.suggestions[0].label,'Follow the strongest current');
  const later=suggestions.ensureFirstResponse({text:'Later reply.',suggestions:[]},false);
  assert.deepEqual(later.suggestions,[]);
  const modelSet=[{label:'Specific move',prompt:'Explore the actual decision.',kind:'branch'}];
  assert.deepEqual(suggestions.ensureFirstResponse({text:'First reply.',suggestions:modelSet},true).suggestions,modelSet);
});

test('the rail normalizes suggestions to a unique even set with eight by default',()=>{
  const result=suggestions.ensureAlwaysSuggestions({text:'Answer',suggestions:[
    {label:'Specific evidence',prompt:'Trace the evidence in this answer.',kind:'drill_down'},
    {label:'Specific evidence',prompt:'Trace the evidence in this answer.',kind:'drill_down'}
  ]},true);
  assert.equal(result.suggestions.length,8);
  assert.equal(new Set(result.suggestions.map(item=>`${item.label}|${item.prompt}`.toLowerCase())).size,8);
});

test('tap and dismissal signals stay bounded and non-identifying',()=>{
  let profile=suggestions.record({},'chosen',{kind:'test'});
  profile=suggestions.record(profile,'chosen',{kind:'test'});
  profile=suggestions.record(profile,'dismissed',{kind:'quiz'});
  assert.deepEqual(suggestions.summary(profile),{chosen:{test:2},dismissed:{quiz:1},recent_chosen_kinds:['test','test']});
  assert.equal(Object.prototype.hasOwnProperty.call(suggestions.summary(profile),'labels'),false);
});

test('adaptive UI uses compact mood-colored chips and remains dismissible',()=>{
  assert.match(html,/id="adaptiveSuggestions"/);
  assert.match(html,/dismissAdaptiveSuggestions\(\)/);
  assert.match(html,/toggleAdaptiveSuggestions\(\)/);
  assert.match(html,/align-items: flex-end/);
  assert.match(html,/border-radius: 999px/);
  assert.match(html,/color-mix\(in srgb, var\(--lake-glow\) 28%, #102137\)/);
  assert.match(html,/grid-template-rows: repeat\(2/);
  assert.match(html,/overflow-x: auto/);
  assert.match(html,/adaptive-suggestions\.is-collapsed \.adaptive-suggestions-list/);
  assert.doesNotMatch(html,/adaptive-suggestions\[data-mood="stormy"\]/);
  assert.doesNotMatch(html,/const icons=\{drill_down/);
  assert.match(html,/id="responseLanguage"/);
});

test('transcript export opens a normal screenshot-friendly page',()=>{
  const exportScript=fs.readFileSync(path.join(root,'public','pdf-export.js'),'utf8');
  assert.match(html,/LakePdfExport\.open\(/);
  assert.match(exportScript,/\/transcript-print\.html\?id=/);
  assert.doesNotMatch(html,/visualViewport\.addEventListener\('resize'/);
  assert.match(printPage,/@media print/);
  assert.match(printPage,/Share PDF/);
  assert.match(printPage,/Copy PDF/);
  assert.doesNotMatch(printPage,/id="copy-text"/);
  assert.match(printPage,/window\.print\(\)/);
});

test('mobile message controls stay compact, discoverable and replay from the start',()=>{
  assert.match(html,/\.speech-player\[data-view="compact"\] \{ justify-content:flex-end; \}/);
  assert.match(html,/\.speech-player:not\(\[data-view="compact"\]\) #speechCollapse \{ margin-left:auto; \}/);
  assert.match(html,/speechState\.index=0;stopSpeech\(false\)/);
  assert.match(html,/bubble-actions\.has-overflow:not\(\.at-end\)::after/);
  assert.match(html,/function updateBubbleActionsOverflow/);
  assert.match(html,/add\('🔊 Speak'/);
  assert.match(html,/add\('↗ Share'/);
  assert.doesNotMatch(html,/add\('🖼 Post'/);
  assert.doesNotMatch(html,/const more=add\('•••'/);
  assert.match(html,/adaptive-suggestions\.is-collapsed \.adaptive-suggestions-head \{ width:calc\(100% - 12px\); margin-inline:6px; \}/);
  assert.match(html,/const sectionAt=line=>\/\^#\{2,4\}\\s\+\.\+\//);
  assert.doesNotMatch(html,/sectionAt=line=>[^\n]+\\d\+/);
});

test('sharing and help expose one integrated Lake experience',()=>{
  assert.match(html,/Invite someone to jump in/);
  assert.match(html,/id="lakeShareDialog"/);
  assert.match(html,/Instagram/);
  assert.match(html,/WhatsApp/);
  assert.match(html,/LinkedIn/);
  assert.match(html,/optional passphrase/i);
  assert.match(html,/🏊 Types/);
  assert.match(html,/Sharing &amp; privacy/);
  assert.doesNotMatch(html,/tSumarize/);
  assert.match(html,/tSummarize/);
  assert.match(html,/class="portable-disclosure"/);
  assert.match(html,/Tap to expand import and export options/);
  assert.match(html,/\.lake-share-dialog \[hidden\] \{ display:none!important; \}/);
  assert.match(html,/function cleanLakeShareText/);
  assert.match(html,/function lakeShareContent/);
  assert.match(html,/maxItems=story\?5:3/);
  assert.match(html,/A THOUGHT FROM THE DEEP/);
  assert.match(html,/DIVE DEEPER AT/);
});
