const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function browserContext() {
  const elements = new Map();
  const context = vm.createContext({
    console, FormData, File, Blob, Date, atob, TextDecoder,
    LakeMeetingMemory: require('../public/meeting-memory'),
    LakeOrganization: require('../public/organization'),
    window: {addEventListener() {}},
    document: { addEventListener() {}, getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: '', style: {}, textContent: '', remove() {}, setAttribute() {} });
      return elements.get(id);
    } },
    saveSuggestedCrew() {}, renderCrew() {}, hideRipple() {}, showRipple() {},
    renderFilePreviews() {}, saveSession() {}, updateCurrents() {}, showToast() {},
    storageKey(key) { return 'lake_test_' + key; },
    showBackendModel(model) { context.document.getElementById('backendModelInfo').textContent = `\ud83e\udd16 Model: ${model}`; },
    appendUserWave(text) { context.visibleMessages.push(text); },
    appendLakeWave(text) { context.replies.push(text); },
    visibleMessages: [], replies: [],
    fetch: async (url, options) => {
      if (url.startsWith('data:')) return { blob: async () => new Blob(['transcript'], { type: 'text/plain' }) };
      context.sent = options.body;
      return { ok: true, json: async () => ({ reflection: 'Found Sam.', model: 'gpt-4o-test' }) };
    }
  });
  vm.runInContext('let crewMembers = []; let suggestedCrew = []; let selectedFiles = []; let chatHistory = []; let allSessions = []; let tideFolders = []; let currentSessionId = null; let currentUser = {name:"Ron"}; let currentMood = "calm"; let sessionLoadPromise = Promise.resolve(); let pendingFileLoads = 0;', context);
  vm.runInContext(script.slice(script.indexOf('const IGNORE_WORDS'), script.indexOf('// STORAGE HELPERS')), context);
  vm.runInContext(script.slice(script.indexOf('function triggerDailyPrinciple('), script.indexOf('// RENDER WAVES')), context);
  vm.runInContext('fileToBase64 = async file => "data:text/plain;base64,dGVzdA==";', context);
  return context;
}

test('alias matches remain reviewable, and similar full names are not merged', () => {
  const context = browserContext();
  vm.runInContext('crewMembers = [{name:"Ronald Powers",nickname:"Punzle, Ronnie, Ron"},{name:"Sam Jones"}];', context);
  assert.equal(vm.runInContext('findCrewAliasMatch({name:"Punzle"}).length', context), 1);
  assert.equal(vm.runInContext('findCrewAliasMatch({name:"Sam Smith"}).length', context), 0);
  vm.runInContext('processNamesFromResponse(`PLAYER_TAGS_JSON {"players":[{"name":"Punzle","confidence":"high"}]} END_PLAYER_TAGS_JSON`);', context);
  assert.equal(vm.runInContext('suggestedCrew[0].confidence', context), 'needs confirmation');
  assert.equal(vm.runInContext('crewMembers.length', context), 2);
  assert.equal(vm.runInContext('normalizePersonKey("Jos\u00e9")', context), 'jose');
});

test('Tag Players shows a short message and resends the latest interaction attachment', async () => {
  const context = browserContext();
  vm.runInContext('crewMembers = [{name:"Ronald Powers",nickname:"Punzle, Ron"}]; chatHistory = [{role:"user",content:"Read this",attachments:[{name:"chat.txt",type:"text/plain",data:"data:text/plain;base64,dGVzdA=="}]}];', context);
  await vm.runInContext('sendWave({visibleText:"Tag players",requestText:"Hidden identity instructions",reuseAttachments:true})', context);
  assert.equal(context.visibleMessages[0], 'Tag players');
  assert.equal(context.sent.get('message'), 'Hidden identity instructions');
  assert.equal(context.sent.getAll('file').length, 1);
  assert.match(context.sent.get('crew'), /Punzle, Ron/);
  assert.equal(context.document.getElementById('backendModelInfo').textContent, '\ud83e\udd16 Model: gpt-4o-test');
  assert.equal(vm.runInContext('waveInFlight', context), false);
});

test('machine player data is removed from visible replies', () => {
  const context = browserContext();
  assert.equal(vm.runInContext('stripPlayerTagsJson(`Sam needs confirmation.\nPLAYER_TAGS_JSON {"players":[]} END_PLAYER_TAGS_JSON`)', context), 'Sam needs confirmation.');
});

test('late Crew suggestions retain the originating conversation and file evidence', () => {
  const context = browserContext();
  vm.runInContext('currentSessionId = "elsewhere"; processNamesFromResponse(`PLAYER_TAGS_JSON {"players":[{"name":"Jo","confidence":"high","evidence":"Named in source"}]} END_PLAYER_TAGS_JSON`, {id:"original",history:[{attachments:[{name:"original.txt"}]}]});',context);
  assert.equal(vm.runInContext('suggestedCrew[0].observation.sessionId',context),'original');
  assert.equal(vm.runInContext('suggestedCrew[0].observation.sources[0]',context),'original.txt');
});

test('Enter makes a newline; Ctrl+Enter sends unless composing or repeating', () => {
  const context = browserContext();
  vm.runInContext(script.slice(script.indexOf('function handleKey('), script.indexOf('function autoResize(')), context);
  vm.runInContext('let sendCount = 0; sendWave = () => sendCount++;', context);
  let prevented = 0;
  context.handleKey({ key: 'Enter', preventDefault() { prevented++; } });
  assert.equal(prevented, 0);
  for (const flags of [{ isComposing: true }, { repeat: true }]) {
    context.handleKey({ key: 'Enter', ctrlKey: true, ...flags, preventDefault() { prevented++; } });
  }
  assert.equal(prevented, 0);
  context.handleKey({ key: 'Enter', ctrlKey: true, preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  assert.equal(vm.runInContext('sendCount', context), 1);
});

function handoffFixture(scope) {
  return {
    scope, coverage: { source_session_ids: ['current'], limitations: ['Original attachments not included'] },
    user_context: [], people: [],
    conversation: { summary: 'Current discussion', decisions: [], open_questions: ['What next?'], unfinished_work: [] },
    total_context: { summary: '', patterns: [], preferences: [] }, contribution_to_total: [],
    resume: { active_topic: 'Current discussion', last_user_intent: 'Make a backup', next_step: 'Confirm the current goal', avoid: [] }
  };
}

test('snapshot source scopes retain whole histories but omit account metadata and original attachment blobs', () => {
  const { build } = require('../public/snapshot-context');
  const current = { id: 'current', history: [{ role: 'user', content: 'CURRENT', attachments: [{name:'chat.png',data:'SECRET_BASE64'}] }] };
  const sessions = [{ id: 'old', history: [{role:'user',content:'EARLIER ' + 'x'.repeat(300000) + ' END_OF_OLD'}] }, current];
  const args = { current, sessions, crew: [{name:'Sam',observations:[{reviewed:true,note:'Reviewed fact'},{reviewed:false,note:'UNREVIEWED'}]}], user:{name:'Ron',email:'PRIVATE_EMAIL',password:'PRIVATE_PASSWORD'} };
  const chat = build({ ...args, scope:'chat' });
  assert.equal(chat.manifest.sessionCount, 1);
  assert.doesNotMatch(chat.parts.map(part => part.text).join(''), /EARLIER|Reviewed fact|SECRET_BASE64|PRIVATE_EMAIL/);
  const total = build({ ...args, scope:'both' });
  assert.equal(total.manifest.sessionCount, 2);
  assert.equal(total.manifest.messageCount, 2);
  const text = total.parts.map(part => part.text).join('');
  assert.match(text, /END_OF_OLD/);
  assert.match(text, /Reviewed fact/);
  assert.doesNotMatch(text, /UNREVIEWED|SECRET_BASE64|PRIVATE_EMAIL|PRIVATE_PASSWORD/);
  assert.ok(total.parts.every(part => part.text.length < 320000));
});

test('AI handoffs request strict structured output, ignore unrelated history and reject malformed artifacts', async () => {
  const { handler, requests } = routeContext(() => JSON.stringify(handoffFixture('chat')));
  let result;
  await handler({body:{message:'Export an AI handoff',action:'snapshot-chat',history:JSON.stringify([{role:'user',content:'UNRELATED_HISTORY'}])},files:[]}, {
    json(value) { result = value; }, status() { return this; }
  });
  assert.equal(result.handoff.scope, 'chat');
  const request = requests.at(-1);
  assert.equal(request.response_format.json_schema.strict, true);
  assert.doesNotMatch(JSON.stringify(request.messages), /UNRELATED_HISTORY/);
  assert.match(request.messages[0].content, /output JSON only, no follow-up/);
  const invalid = routeContext(() => '{"scope":"chat"}');
  let status;
  await invalid.handler({body:{message:'Export',action:'snapshot-chat'},files:[]}, {
    json(value) { result = value; }, status(value) { status = value; return this; }
  });
  assert.equal(status, 502);
  assert.match(result.error, /validated/);
});

test('all moods prioritize brevity and natural reactions without changing the model', async () => {
  for (const mood of ['calm','analytical','stormy']) {
    const { handler, requests } = routeContext();
    await handler({body:{message:'Quick answer, no follow-up, I have to go',mood},files:[]}, {json() {},status() {return this;} });
    const request = requests.at(-1);
    assert.match(request.messages[0].content, /no follow-up/);
    assert.match(request.messages[0].content, /emoji-only response/);
    assert.equal(request.model, requests[0].model);
  }
});

test('modes have distinct conversational behaviors and Stormy keeps the edge off personal attacks', () => {
  const { context } = routeContext();
  const calm = context.getMoodContext('calm');
  const analytical = context.getMoodContext('analytical');
  const stormy = context.getMoodContext('stormy');
  assert.match(calm, /room for the user to find their own words/);
  assert.match(analytical, /what evidence would distinguish them/);
  assert.match(stormy, /dry wit/);
  assert.match(stormy, /confident, mischievous openers/);
  assert.match(stormy, /never the person's worth/);
  assert.match(stormy, /Dial down the wit for grief, distress/);
  assert.equal(context.getMoodContext('unknown'), calm);
});

test('full backups preserve original files and complete history without exporting login secrets', () => {
  const { build } = require('../public/full-backup');
  const content = 'x'.repeat(350000) + 'END_OF_HISTORY';
  const backup = build({ user: {name:'Ron',email:'ron@example.test',password:'SECRET',token:'SECRET'},
    sessions:[{id:'old',history:[{role:'user',content,attachments:[{name:'chat.png',data:'ORIGINAL_BASE64'}]}]}],
    current:{id:'current',history:[{role:'assistant',content:'Current reply'}]},
    crew:[{name:'Jo',nickname:'Jojo'}], suggestedCrew:[],settings:{mood:'stormy'} });
  assert.equal(backup.coverage.message_count, 2);
  assert.equal(backup.coverage.truncated, false);
  assert.equal(backup.data.conversations[0].history[0].content, content);
  assert.equal(backup.data.conversations[0].history[0].attachments[0].data, 'ORIGINAL_BASE64');
  assert.match(backup.transfer_prompt, /another|reconstruct continuity/);
  assert.doesNotMatch(JSON.stringify(backup), /SECRET/);
});

test('a late reply remains attached to its original conversation after navigation', async () => {
  const context = browserContext();
  let release;
  context.fetch = async (_url, options) => {
    context.sent = options.body;
    await new Promise(resolve => { release = resolve; });
    return {ok:true,json:async () => ({reflection:'Original chat reply'})};
  };
  context.notices = [];
  context.showReplyNotice = (origin, reply) => context.notices.push({id:origin.id,reply});
  context.document.getElementById('lakeInput').value = 'Original question';
  const pending = vm.runInContext('sendWave()', context);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  const originalId = vm.runInContext('currentSessionId', context);
  vm.runInContext('currentSessionId = null; chatHistory = []; currentMood = "analytical";', context);
  release();
  await pending;
  assert.equal(vm.runInContext('chatHistory.length', context), 0);
  assert.equal(context.replies.length, 0);
  assert.equal(context.notices[0].id, originalId);
  assert.equal(context.notices[0].reply.content, 'Original chat reply');
  assert.equal(context.sent.get('mood'), 'calm');
});

function routeContext(reply = () => 'Test reflection') {
  const requests = [];
  let handler;
  let uploads;
  const router = { post(_path, upload, callback) { handler = callback; uploads = upload; } };
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, Buffer,
    __dirname: path.join(root, 'routes'), module: { exports: {} },
    process: { env: { OPENAI_API_KEY: 'test-only', OPENAI_MODEL: 'gpt-4o' } },
    require(name) {
      if (name === 'express') return { Router: () => router };
      if (name === 'openai') return { OpenAI: class {
        constructor() { this.chat = { completions: { create: async args => {
          requests.push(args);
          const result = reply(args);
          return { choices: [typeof result === 'string' ? {message: {content:result}} : result], model: 'gpt-4o-test' };
        } } }; }
      } };
      if (name === 'multer') return require('multer');
      if (name === 'pdf-parse') return async () => ({ text: 'PDF participant: Sam' });
      if (name === 'mammoth') return { extractRawText: async () => ({value:'Word participant: Jo'}) };
      return require(name);
    }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'routes/chat.js'), 'utf8'), context);
  return { requests, handler, uploads, context };
}

test('homepage pro-tip opens a short Socratic conversation without reattaching sources', async () => {
  const context = browserContext();
  vm.runInContext('chatHistory = [{role:"user",content:"Old source",attachments:[{name:"old.txt",type:"text/plain",data:"data:text/plain;base64,dGVzdA=="}]}];', context);
  await vm.runInContext('triggerDailyPrinciple()', context);
  assert.match(context.visibleMessages[0], /^Lake, give me pro-tip/);
  assert.equal(context.sent.get('action'), 'pro-tip');
  assert.equal(context.sent.getAll('file').length, 0);
  const { requests, handler } = routeContext();
  await handler({ body: {message:context.sent.get('message'),action:'pro-tip'}, files:[] }, {
    json() {}, status() { return this; }
  });
  assert.match(requests.at(-1).messages[0].content, /followed by exactly ONE inviting, incisive open question/);
});

test('Ice Breaker preserves typed context and reviewed Crew memory for guided questions', async () => {
  const context = browserContext();
  context.document.getElementById('lakeInput').value = 'Meeting Jo at the team lunch';
  vm.runInContext('crewMembers = [{name:"Jo Smith",nickname:"Jo",context:"New teammate",observations:[{reviewed:true,date:"2026-10-08",evidence:"Jo mentioned cycling",note:"Enjoys cycling",sources:["chat.txt"]}]}];', context);
  await vm.runInContext('startIceBreaker()', context);
  assert.equal(context.sent.get('action'), 'ice-breaker');
  assert.match(context.visibleMessages[0], /Meeting Jo at the team lunch/);
  assert.match(context.sent.get('crew'), /Enjoys cycling/);
  const { requests, handler } = routeContext();
  await handler({ body: {message:context.sent.get('message'),action:'ice-breaker',crew:context.sent.get('crew')}, files:[] }, {
    json() {}, status() { return this; }
  });
  const prompt = requests.at(-1).messages[0].content;
  assert.match(prompt, /ICE-BREAKER MODE START/);
  assert.match(prompt, /Offer a usable provisional opener early and continue discovery with ONE natural follow-up question/);
  assert.match(prompt, /Vary the conversational rhythm according to the user's answers/);
  assert.match(prompt, /Do not ask again for information already available/);
  assert.match(prompt, /Enjoys cycling/);
  await handler({ body: {message:'It is our first lunch together',crew:context.sent.get('crew')}, files:[] }, {
    json() {}, status() { return this; }
  });
  assert.match(requests.at(-1).messages[0].content, /ICE-BREAKER CONVERSATIONS/);
  assert.match(requests.at(-1).messages[0].content, /HELP NOW, DEEPEN NATURALLY/);
  assert.match(requests.at(-1).messages[0].content, /do not switch into a question-only interview/);
  assert.match(requests.at(-1).messages[0].content, /stop probing and deliver/);
});

test('chat reads every attachment and includes the user Crew aliases', async () => {
  const {requests, handler} = routeContext();
  let result;
  const res = { json(value) { result = value; }, status() { return this; } };
  await handler({ body: {message:'Tag players',crew:JSON.stringify([{name:'Ronald Powers',nickname:'Punzle, Ron'}])}, files:[
    {originalname:'chat.png',mimetype:'image/png',buffer:Buffer.from('image'),size:5},
    {originalname:'email.txt',mimetype:'text/plain',buffer:Buffer.from('Sam said hello'),size:14},
    {originalname:'notes.pdf',mimetype:'application/pdf',buffer:Buffer.from('pdf'),size:3}
  ] }, res);
  const content = requests.at(-1).messages.at(-1).content;
  assert.equal(content.filter(part => part.type === 'image_url').length, 1);
  assert.match(JSON.stringify(content), /Sam said hello/);
  assert.ok(content.some(part => part.type === 'file' && part.file.filename === 'notes.pdf'));
  assert.match(requests.at(-1).messages[0].content, /Punzle, Ron/);
  assert.equal(result.model, 'gpt-4o-test');
});

test('six screenshot uploads reach the model; excess uploads return a readable error', async () => {
  const express = require('express');
  const { requests, handler, uploads } = routeContext();
  const app = express();
  app.post('/chat', uploads, handler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/chat`;
    const form = new FormData();
    form.append('message', 'Confirm first and last messages');
    for (let index = 0; index < 6; index++) form.append('file', new Blob(['image'], { type: 'image/png' }), `${index}.png`);
    const response = await fetch(url, { method: 'POST', body: form });
    assert.equal(response.status, 200);
    assert.equal(requests.at(-1).messages.at(-1).content.filter(part => part.type === 'image_url').length, 6);
    assert.match(requests.at(-1).messages[0].content, /first visible message/);
    const excess = new FormData();
    for (let index = 0; index < 21; index++) excess.append('file', new Blob(['image'], { type: 'image/png' }), `${index}.png`);
    const rejected = await fetch(url, { method: 'POST', body: excess });
    assert.equal(rejected.status, 400);
    assert.match((await rejected.json()).details, /20 files/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('long transcripts process the end beyond the previous five-chunk limit', async () => {
  const { requests, context } = routeContext();
  context.original = 'Sam: hello\n'.repeat(5000) + 'Jo: final source message';
  const result = await vm.runInContext('summarizeLargeDocument(original, {originalname:"chat.txt",size:original.length,mimetype:"text/plain"}, "Read it all")', context);
  assert.ok(requests.length > 5);
  assert.ok(requests.some(request => JSON.stringify(request.messages).includes('Jo: final source message')));
  assert.match(result, /RAW END EXCERPT/);
  assert.match(result, /Jo: final source message/);
  assert.doesNotMatch(result, /left out/);
});

test('document summaries retry output limits and reuse completed chunks for follow-up questions', async () => {
  const {requests,context} = routeContext(args => ({message:{content:args.max_completion_tokens < 1800 ? 'INCOMPLETE' : 'Complete source summary'},finish_reason:args.max_completion_tokens < 1800 ? 'length' : 'stop'}));
  context.original = 'Sam: source text\n'.repeat(2500) + 'Jo: final message';
  const first = await vm.runInContext('summarizeLargeDocument(original,{originalname:"transcript.txt",size:original.length},"Read the transcript")',context);
  assert.doesNotMatch(first,/INCOMPLETE/);
  assert.match(first,/Complete source summary/);
  const count = requests.length;
  await vm.runInContext('summarizeLargeDocument(original,{originalname:"transcript.txt",size:original.length},"What size chunks can you read?")',context);
  assert.equal(requests.length,count);
});

test('repeated truncated summaries never reach the final analysis', async () => {
  const {requests,context} = routeContext(() => ({message:{content:'INCOMPLETE'},finish_reason:'length'}));
  await assert.rejects(vm.runInContext('createSummary([{role:"user",content:"Source"}],900)',context),/after retrying/);
  assert.equal(requests.length,3);
});

test('ordinary transcript analysis passes exact text or rejects oversized batches without summarizing', async () => {
  const {requests,handler} = routeContext();
  const original = 'Sam: exact middle wording\r\n'.repeat(700) + 'Jo: last message';
  let result; let status;
  const res = {json(value){result=value;},status(value){status=value;return this;}};
  await handler({body:{message:'Read the exact transcript'},files:[{originalname:'part.txt',mimetype:'text/plain',buffer:Buffer.from(original),size:Buffer.byteLength(original)}]},res);
  assert.equal(requests.length,1);
  assert.ok(requests[0].messages.at(-1).content.some(part => part.text?.includes(original)));
  requests.length = 0;
  await handler({body:{message:'Read all'},files:[{originalname:'large.txt',mimetype:'text/plain',buffer:Buffer.from('x'.repeat(60000)),size:60000}]},res);
  assert.equal(status,413);
  assert.match(result.details,/Nothing was summarized/);
  assert.equal(requests.length,0);
});

test('splitter preserves every character including CRLF, blank lines, BOM and emoji', () => {
  const {split} = require('../public/transcript-splitter');
  assert.deepEqual(split('x'.repeat(60000)).map(part => part.text.length),[29000,29000,2000]);
  for (const original of ['\ufeffSam: hello\r\n\r\nJo: emoji 😀\r\n'.repeat(2000),'x'.repeat(999) + '😀' + 'y'.repeat(4000),'']) {
    const parts = split(original,1000);
    assert.equal(parts.map(part => part.text).join(''),original);
    assert.ok(parts.every(part => part.text.length <= 1000));
    for (let index=1;index<parts.length;index++) assert.equal(parts[index].start,parts[index-1].end);
  }
  assert.throws(() => split('text',500),/1,000/);
});

test('unchecked source files remain in stored history but are not uploaded with follow-ups', async () => {
  const context = browserContext();
  vm.runInContext('chatHistory = [{role:"user",content:"Part one",attachments:[{name:"one.txt",type:"text/plain",data:"data:text/plain;base64,dGVzdA==",excluded:true}]},{role:"user",content:"Part two",attachments:[{name:"two.txt",type:"text/plain",data:"data:text/plain;base64,dGVzdA=="}]}];',context);
  await vm.runInContext('sendWave({requestText:"Read the active part"})',context);
  assert.equal(context.sent.getAll('file').length,1);
  assert.equal(context.sent.getAll('file')[0].name,'two.txt');
  assert.equal(vm.runInContext('chatHistory[0].attachments.length',context),1);
});

test('transcript ZIP import retains verbatim bytes and rejects unsafe or oversized archives', async () => {
  const JSZip = require('jszip');
  const {unpack} = require('../public/transcript-archive');
  const zip = new JSZip();
  const raw = '\ufeffSam: exact text 😀\r\n';
  zip.file('part-002.txt','Second');zip.file('part-001.txt',raw);
  zip.file('transcript-manifest.json','{}');
  const parts = await unpack(JSZip,await zip.generateAsync({type:'uint8array'}));
  assert.deepEqual(parts.map(part => part.name),['part-001.txt','part-002.txt']);
  assert.deepEqual(Buffer.from(parts[0].data),Buffer.from(raw));
  zip.file('script.js','Do not execute');
  await assert.rejects(unpack(JSZip,await zip.generateAsync({type:'uint8array'})),/only TXT/);
  const big = new JSZip();big.file('too-large.txt','x'.repeat(30001));
  await assert.rejects(unpack(JSZip,await big.generateAsync({type:'uint8array'})),/30,000/);
});

test('transcript discussions include guidance for exact splitting and ZIP import without repetitive tutorials', async () => {
  const {handler,requests} = routeContext();
  await handler({body:{message:'How should I upload this transcript?'},files:[]},{json(){},status(){return this;}});
  assert.match(requests.at(-1).messages[0].content,/Settings > Transcript Splitter/);
  assert.match(requests.at(-1).messages[0].content,/do not repeat a tutorial in every reply/);
});

test('interaction analysis invites contextual clarification while respecting evidence, pacing and folder limits', async () => {
  for (const mood of ['calm','analytical','stormy']) {
    const {handler,requests} = routeContext();
    await handler({body:{message:'Help me understand this meeting',mood},files:[]},{json(){},status(){return this;}});
    const prompt=requests.at(-1).messages[0].content;
    assert.match(prompt,/offer a useful initial reading/);
    assert.match(prompt,/ask ONE short, specific context question/);
    assert.match(prompt,/source evidence, user-provided background and the user's perceptions distinct/);
    assert.match(prompt,/Identity clarification takes priority/);
    assert.match(prompt,/do not append a context question mechanically/);
    assert.match(prompt,/folder grouping is not proof/);
    assert.match(prompt,/Never claim to have read all folder contents/);
  }
});

test('prompt Types include twelve choices and a usage guide, with grounded specialist and subtext guidance', async () => {
  const types=require('../public/prompt-types');
  assert.equal(types.length,7);
  for(const type of types) {
    assert.equal((type.prompts?.length || 6)+type.more.length,12);
    assert.equal(type.more.at(-1)[1],'Use This Type');
    assert.match(type.more.at(-1)[2],/neither resets this chat/);
  }
  assert.ok(types.find(type=>type.name==='Learn').prompts.some(prompt=>prompt[1]==='Quiz Maker'));
  assert.ok(types.find(type=>type.name==='Learn').prompts.some(prompt=>prompt[1]==='Flashcard Maker'));
  const {handler,requests}=routeContext();
  await handler({body:{message:'Help me interpret this exchange'},files:[]},{json(){},status(){return this;}});
  const prompt=requests.at(-1).messages[0].content;
  assert.match(prompt,/credible alternatives/);
  assert.match(prompt,/Do not invent numerical probabilities/);
  assert.match(prompt,/informed participation/);
  assert.match(prompt,/Separate questions from answers/);
  assert.match(prompt,/do not diagnose a child/);
});

test('meeting dates come from titles, preserve uncertainty and accept reviewed corrections', () => {
  const {dateOf} = require('../public/meeting-memory');
  assert.equal(dateOf('2026-08-31_Weekly-part-001-of-003.txt').date,'2026-08-31');
  assert.equal(dateOf('October 12, 2026 call.txt').date,'2026-10-12');
  assert.equal(dateOf('Team_Oct_12_2026_call.txt').date,'2026-10-12');
  assert.equal(dateOf('12 October 2026 call.txt').date,'2026-10-12');
  assert.equal(dateOf('Marching 12 2026.txt').date,null);
  assert.equal(dateOf('03-04-2026 meeting.txt').status,'ambiguous');
  assert.equal(dateOf('2026-02-30 meeting.txt').date,null);
  assert.equal(dateOf('meeting.txt').status,'unknown');
  assert.equal(dateOf('03-04-2026 meeting.txt','2026-04-03').status,'user-reviewed');
});

test('speaker labels create fuzzy Crew suggestions with dated source evidence but never merge identities', () => {
  const context=browserContext();
  const text='[00:01:02] Roby: I will send the revised plan.\r\n';
  context.sourceData='data:text/plain;base64,'+Buffer.from(text).toString('base64');
  vm.runInContext('crewMembers=[{name:"Robert Smith",nickname:"Robby"}];suggestTranscriptSpeakers([{name:"2026-08-31-call.txt",data:sourceData}],"call-one");suggestTranscriptSpeakers([{name:"2026-09-07-call.txt",data:sourceData}],"call-two");',context);
  assert.equal(vm.runInContext('crewMembers.length',context),1);
  assert.equal(vm.runInContext('suggestedCrew[0].possibleMatches[0]',context),'Robert Smith');
  assert.equal(vm.runInContext('suggestedCrew[0].observation.meetingDates[0].date',context),'2026-08-31');
  assert.equal(vm.runInContext('suggestedCrew[0].observations[0].meetingDates[0].date',context),'2026-09-07');
  assert.equal(vm.runInContext('suggestedCrew[0].confidence',context),'needs confirmation');
});

test('meeting retrieval expands reviewed aliases, cites exact ranges and does not inflate repeated uploads', () => {
  const {retrieve}=require('../public/meeting-memory');
  const docs=[{id:'one',sessionId:'old',filename:'2026-08-31-call.txt',text:'[00:01] Robby: I will send the revised plan.\r\n'},
    {id:'two',sessionId:'new',filename:'2026-09-07-call.txt',text:'[00:02] Robert: The revised plan is ready.\r\n'}];
  const result=retrieve([...docs,{...docs[0],id:'duplicate',sessionId:'copy'}],'Robert Smith commitments',[{name:'Robert Smith',nickname:'Robby, Robert'}]);
  assert.equal(result.coverage.indexed_meetings,2);
  assert.equal(result.coverage.duplicate_sources,1);
  assert.equal(result.coverage.complete_archive_in_context,false);
  assert.equal(result.coverage.represented_meetings,2);
  for(const passage of result.passages)assert.equal(passage.text,docs.find(doc=>doc.id===passage.source_id).text.slice(passage.start,passage.end));
});

test('reviewed meeting dates are carried into the model request without using upload timestamps', async () => {
  const {handler,requests}=routeContext();
  await handler({body:{message:'Read this call',sourceMetadata:JSON.stringify([{filename:'03-04-2026-call.txt',meetingDate:'2026-04-03'}])},files:[{originalname:'03-04-2026-call.txt',mimetype:'text/plain',buffer:Buffer.from('[01:02:15] Robby: Yes.'),size:23}]},{json(){},status(){return this;}});
  assert.match(JSON.stringify(requests.at(-1).messages.at(-1).content),/2026-04-03/);
  assert.match(requests.at(-1).messages[0].content,/not upload dates/);
  assert.match(requests.at(-1).messages[0].content,/do not automatically merge|Do not automatically merge/);
});

test('transcript titles replace automatic message names but preserve manual and legacy custom names', () => {
  const {titleFor}=require('../public/organization');
  const history=[{role:'user',content:'Read this transcript',attachments:[{name:'2026-08-31_Weekly_UA_Sync-part-001-of-003.txt'}]}];
  assert.equal(titleFor({name:'Read this transcript'},history).name,'2026-08-31_Weekly_UA_Sync');
  assert.equal(titleFor({name:'My custom name',nameSource:'manual'},history).name,'My custom name');
  assert.equal(titleFor({name:'Existing named chat'},history).name,'Existing named chat');
});

test('folder parenting rejects cycles and repairs orphaned legacy folders', () => {
  const {canParent,cleanFolders,folderPath}=require('../public/organization');
  const folders=[{id:'series',name:'Weekly UA',parentId:null},{id:'call',name:'August 31',parentId:'series'}];
  assert.equal(canParent('series','call',folders),false);
  assert.equal(canParent('call','call',folders),false);
  assert.equal(folderPath('call',folders),'Weekly UA / August 31');
  assert.equal(cleanFolders([{id:'bad',name:'Orphan',parentId:'missing'}])[0].parentId,null);
});

test('explicit Crew merging preserves aliases, roles, notes, dated observations and target visibility', () => {
  const {mergeCrew}=require('../public/organization');
  const target={name:'Robert Smith',nickname:'Robby',role:'CRM Lead',context:'Target notes',hidden:true,observations:[{sessionId:'one',evidence:'First call'}]};
  const source={name:'Roby',nickname:'Robert',role:'CRM Analyst',context:'Source notes',observations:[{sessionId:'two',evidence:'Second call',meetingDates:[{date:'2026-08-31'}]}]};
  const result=mergeCrew(target,source);
  assert.equal(result.name,'Robert Smith');assert.equal(result.hidden,true);assert.equal(result.role,'CRM Lead');
  assert.match(result.nickname,/Roby/);assert.match(result.context,/Source notes/);assert.match(result.context,/CRM Analyst/);
  assert.equal(result.observations.length,2);assert.equal(result.observations[1].meetingDates[0].date,'2026-08-31');
  assert.equal(source.name,'Roby');assert.equal(target.observations.length,1);
});

test('scanned PDFs reach vision instead of pretending text extraction succeeded', async () => {
  const { requests, handler, context } = routeContext();
  vm.runInContext('extractFileText = async () => "";', context);
  let result;
  await handler({body:{message:'Read this chat'},files:[{originalname:'scanned.pdf',mimetype:'application/pdf',buffer:Buffer.from('pdf'),size:3}]}, {json(value){result=value;},status(){return this;}});
  assert.ok(requests.at(-1).messages.at(-1).content.some(part => part.type === 'file' && part.file.filename === 'scanned.pdf'));
  assert.ok(result.reflection);
});

test('follow-ups reuse all earlier source batches without storing duplicate image copies', async () => {
  const context = browserContext();
  vm.runInContext('chatHistory = [{role:"user",content:"Part 1",attachments:[{name:"first.png",type:"image/png",data:"data:image/png;base64,dGVzdA=="}]},{role:"user",content:"Part 2",attachments:[{name:"last.png",type:"image/png",data:"data:image/png;base64,dGVzdA=="}]}];', context);
  await vm.runInContext('sendWave({requestText:"Who am I and what is the last message?"})', context);
  assert.equal(context.sent.getAll('file').length, 2);
  assert.equal(vm.runInContext('chatHistory.filter(m => m.attachments?.length).length', context), 2);
});

test('email encoding is decoded while sender and reply metadata are preserved', async () => {
  const { context } = routeContext();
  context.emailFile = {originalname:'thread.eml',mimetype:'message/rfc822',buffer:Buffer.from('From: Sam <sam@example.com>\r\nTo: Ron <ron@example.com>\r\nSubject: Follow-up\r\nIn-Reply-To: <previous@example.com>\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nI=E2=80=99ll reply tomorrow.')};
  const text = await vm.runInContext('extractFileText(emailFile)', context);
  assert.match(text, /sam@example.com/);
  assert.match(text, /In-Reply-To: <previous@example.com>/);
  assert.match(text, /I\u2019ll reply tomorrow/);
});
