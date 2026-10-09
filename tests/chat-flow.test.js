const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

function browserContext() {
  const elements = new Map();
  const context = vm.createContext({
    console, FormData, File, Blob, Date, atob,
    document: { getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: '', style: {}, textContent: '', remove() {} });
      return elements.get(id);
    } },
    saveSuggestedCrew() {}, renderCrew() {}, hideRipple() {}, showRipple() {},
    renderFilePreviews() {}, saveSession() {}, updateCurrents() {}, showToast() {},
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
  vm.runInContext('let crewMembers = []; let suggestedCrew = []; let selectedFiles = []; let chatHistory = []; let currentSessionId = null; let currentUser = {name:"Ron"}; let currentMood = "calm"; let sessionLoadPromise = Promise.resolve();', context);
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
          return { choices: [{message: {content:reply(args)}}], model: 'gpt-4o-test' };
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
