/**
* 🌊 The Great Lake Bot - Email Inbound Route
* Receives forwarded emails via Mailgun webhook
* Creates a session and runs it through The Lake automatically
*/

const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function loadSystemPrompt() {
const modelDir = path.join(__dirname, '..', 'core', 'model');
const files = [
'master_doc.txt','identity.txt','tone.txt','metaphors.txt',
'governance.txt','clarity_engine.txt','influence_engine.txt',
'output_format.txt','file_handling.txt','safety.txt',
'behavior_rules.txt','lake_score.txt'
];
let prompt = '';
for (const file of files) {
const p = path.join(modelDir, file);
if (fs.existsSync(p)) prompt += fs.readFileSync(p, 'utf-8') + '\n\n';
}
return prompt || 'You are The Great Lake — a calm, deep clarity engine.';
}

// Store email sessions in memory (or swap for DB later)
const emailSessions = new Map();

// GET /email/session/:id — frontend polls this to load the session
router.get('/session/:id', (req, res) => {
const session = emailSessions.get(req.params.id);
if (!session) {
return res.status(404).json({ error: 'Session not found' });
}
res.json(session);
});

// GET /email/sessions — list all email sessions
router.get('/sessions', (req, res) => {
const sessions = Array.from(emailSessions.values())
.sort((a, b) => new Date(b.time) - new Date(a.time))
.slice(0, 50);
res.json(sessions);
});

// POST /email/inbound — Mailgun webhook hits this
router.post('/inbound', async (req, res) => {
try {
const body = req.body;

// Extract email fields from Mailgun
const from = body.from || body.sender || 'Unknown Sender';
const subject = body.subject || 'No Subject';
const emailBody = body['body-plain'] || body['stripped-text'] || body.text || '';
const emailHtml = body['body-html'] || '';

if (!emailBody && !emailHtml) {
return res.status(400).json({ error: 'No email body found' });
}

const content = emailBody || emailHtml.replace(/<[^>]*>/g, ' ').trim();

console.log('📧 Email received from:', from, '| Subject:', subject);

// Build the prompt for The Lake
const emailPrompt = `📧 FORWARDED EMAIL — Please analyse this fully.

FROM: ${from}
SUBJECT: ${subject}

BODY:
${content}

Read this email and give me your full Lake reflection. Who sent this, what do they actually want, what are the dynamics at play, what should I be watching for, and what is the recommended response or action?`;

const systemPrompt = loadSystemPrompt();

const response = await client.messages.create({
model: 'claude-sonnet-4-5',
max_tokens: 4096,
system: systemPrompt + '\nCURRENT LAKE MOOD: ANALYTICAL\nRespond with precision and structure. This is an email analysis.',
messages: [{ role: 'user', content: emailPrompt }]
});

const reflection = response.content?.[0]?.text || 'The Lake could not analyse this email.';

// Create session
const sessionId = 'email_' + Date.now();
const session = {
id: sessionId,
type: 'email',
from,
subject,
time: new Date().toISOString(),
emailContent: content,
history: [
{ role: 'user', content: emailPrompt, time: new Date().toLocaleTimeString() },
{ role: 'assistant', content: reflection, time: new Date().toLocaleTimeString() }
]
};

emailSessions.set(sessionId, session);
console.log('✅ Email session created:', sessionId);

// Respond to Mailgun
res.status(200).json({ success: true, sessionId });

} catch (err) {
console.error('❌ Email inbound error:', err.message);
res.status(500).json({ error: err.message });
}
});

module.exports = router;
module.exports.emailSessions = emailSessions;
```

---
