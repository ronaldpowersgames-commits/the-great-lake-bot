/**
 * 🌊 The Great Lake Bot - Chat Route (OpenAI ChatGPT Version)
 * Personal Leadership Coach + Full Work Co-Pilot
 * MODEL: ChatGPT (OpenAI GPT-4o)
 */

const express = require('express');
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const router = express.Router();

// ======================================================
// FILE UPLOAD CONFIG
// ======================================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, true)
});

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const PDF_TYPES = ['application/pdf'];
const DOCX_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword'
];

// ======================================================
// OPENAI CLIENT
// ======================================================
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY is missing!');
} else {
  console.log('✅ OpenAI API key loaded');
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ======================================================
// LOAD SYSTEM PROMPT FILES (CACHED)
// ======================================================
let cachedModelFiles = null;

function loadSystemPrompt() {
  if (cachedModelFiles) return cachedModelFiles;

  const modelDir = path.join(__dirname, '..', 'core', 'model');
  const files = [
    'master_doc.txt', 'identity.txt', 'tone.txt', 'metaphors.txt',
    'governance.txt', 'clarity_engine.txt', 'influence_engine.txt',
    'output_format.txt', 'file_handling.txt', 'group_mode.txt',
    'safety.txt', 'behavior_rules.txt', 'onboarding.txt',
    'update_syntax.txt', 'lake_score.txt', 'lake_score_model.json'
  ];

  if (!fs.existsSync(modelDir)) {
    console.warn('⚠️ core/model/ directory not found — using fallback prompt');
    return null;
  }

  let systemPrompt = '';

  for (const file of files) {
    const filePath = path.join(modelDir, file);
    if (fs.existsSync(filePath)) {
      systemPrompt += fs.readFileSync(filePath, 'utf-8') + '\n\n';
      console.log('✅ Loaded:', file);
    } else {
      console.warn('⚠️ Missing model file:', file);
    }
  }

  if (!systemPrompt.trim()) {
    console.warn('⚠️ No model files loaded — using fallback prompt');
    return null;
  }

  const MAX_PROMPT_CHARS = 150000;
  if (systemPrompt.length > MAX_PROMPT_CHARS) {
    systemPrompt = systemPrompt.substring(0, MAX_PROMPT_CHARS);
    console.warn('⚠️ System prompt trimmed to fit context window');
  }

  cachedModelFiles = systemPrompt;
  return cachedModelFiles;
}

// ======================================================
// CORE COACH IDENTITY
// ======================================================
function sanitizeName(name) {
  return String(name || '').replace(/[`$<>]/g, '').trim();
}

function getCoreCoachIdentity(userNameRaw) {
  const userName = sanitizeName(userNameRaw) || 'there';

  return `
================================================================================
CORE IDENTITY — THE GREAT LAKE (PERSONAL COACH + CO-PILOT MODE)
================================================================================
You are The Lake — a personal leadership coach, clarity engine, and full
spectrum work co-pilot for ${userName}. Your mission: make ${userName} sharper,
clearer, and more effective in every interaction.

Use ${userName}'s name naturally and purposefully — never excessively.

You help ${userName} with ANYTHING:
- Writing, editing, rewriting, proofreading
- Emails, proposals, presentations, documents
- Brainstorming, planning, strategy
- Research, summarising files
- Data analysis, spreadsheet logic
- Any task that makes ${userName} more effective

Your coaching layer is ALWAYS active — covertly or overtly.

Your voice:
- Calm, sharp, warm
- Never generic
- Direct without being cold
- Warm without being soft
- Water metaphors naturally, never forced

Never:
- Say "As an AI..."
- Give generic padded responses
- Lose the Lake voice
================================================================================
END CORE IDENTITY
================================================================================
`;
}

// ======================================================
// FALLBACK PROMPT
// ======================================================
function getFallbackPrompt() {
  return `
You are The Great Lake — a calm, deep clarity engine and leadership coach.
You always produce a structured Clarity Snapshot:
- Real Variable
- Incentives
- Patterns
- Water Cost
- Trajectory
- Leverage Points
You help with any task asked of you.
`;
}

// ======================================================
// MOOD CONTEXT
// ======================================================
function getMoodContext(mood) {
  const moods = {
    calm: `
CURRENT LAKE MOOD: CALM
Gentle, deep, reflective. Slow pace.`,
    analytical: `
CURRENT LAKE MOOD: ANALYTICAL
Structured, precise, methodical.`,
    stormy: `
CURRENT LAKE MOOD: STORMY
Direct, sharp, fast. No padding.`
  };
  return moods[mood] || moods.calm;
}

// ======================================================
// FILE TEXT EXTRACTION
// ======================================================
async function extractFileText(file) {
  const mime = file.mimetype;

  if (PDF_TYPES.includes(mime)) {
    try {
      const data = await pdfParse(file.buffer);
      return data.text || '[PDF contained no extractable text]';
    } catch {
      return '[Could not extract PDF text]';
    }
  }

  if (DOCX_TYPES.includes(mime)) {
    try {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      return result.value || '[DOCX contained no extractable text]';
    } catch {
      return '[Could not extract DOCX text]';
    }
  }

  try {
    return file.buffer.toString('utf-8');
  } catch {
    return '[Binary file — text extraction not supported]';
  }
}

// ======================================================
// FORMAT BYTES
// ======================================================
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ======================================================
// POST /chat — OPENAI CHAT COMPLETIONS API
// ======================================================
router.post('/', upload.array('file', 5), async function(req, res) {
  try {
    const message = (req.body.message || '').trim();
    const mood = req.body.mood || 'calm';
    const userName = req.body.userName || '';
    const uploadedFiles = Array.isArray(req.files) ? req.files : [];

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: 'The Lake is not configured',
        details: 'OPENAI_API_KEY is missing.'
      });
    }

    const coreIdentity = getCoreCoachIdentity(userName);
    const modelFiles = loadSystemPrompt();
    const fallback = modelFiles ? '' : getFallbackPrompt();
    const moodContext = getMoodContext(mood);

    const systemPrompt = coreIdentity + (modelFiles || fallback) + moodContext;

    let conversationHistory = [];
    if (req.body.history) {
      try {
        const history = typeof req.body.history === 'string'
          ? JSON.parse(req.body.history)
          : req.body.history;

        if (Array.isArray(history)) {
          conversationHistory = history
            .slice(-6)
            .filter(m => m.role && m.content)
            .map(m => ({
              role: m.role === 'user' ? 'user' : 'assistant',
              content: String(m.content)
            }));
        }
      } catch {
        conversationHistory = [];
      }
    }

    let userMessageContent;

    if (uploadedFiles.length > 0) {
      const file = uploadedFiles[0];
      const isImage = IMAGE_TYPES.includes(file.mimetype);

      if (isImage) {
        const base64Image = file.buffer.toString('base64');
        const imageUrl = `data:${file.mimetype};base64,${base64Image}`;

        console.log('🖼️ Image attached:', file.originalname, formatBytes(file.size));

        userMessageContent = [
          {
            type: 'text',
            text: message || 'Please analyse this image and give me your full Lake reflection.'
          },
          {
            type: 'image_url',
            image_url: { url: imageUrl }
          }
        ];
      } else {
        console.log('📎 File attached:', file.originalname, formatBytes(file.size));

        let fileContent = await extractFileText(file);
        if (fileContent.length > 200000) {
          fileContent = fileContent.substring(0, 200000) + '\n\n[File truncated]';
        }

        const header = `\n\n📄 ATTACHED FILE: ${file.originalname} (${formatBytes(file.size)})\n${'─'.repeat(50)}\n`;
        const footer = `\n${'─'.repeat(50)}\n[End of attached file]\n`;

        userMessageContent = message
          ? message + header + fileContent + footer
          : 'Please analyse this attached file:' + header + fileContent + footer;
      }
    } else {
      if (!message) {
        return res.status(400).json({
          error: 'No wave received',
          details: 'Send a message or attach a file.'
        });
      }

      userMessageContent = message;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessageContent }
    ];

    console.log('🌊 Sending to ChatGPT (gpt-4o) — mood:', mood, '| user:', userName || 'unknown');

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 2048,
      temperature: 1
    }, {
      timeout: 30000
    });

    const reply = response.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(500).json({
        error: 'The Lake returned no reflection',
        details: 'Empty response from ChatGPT API.'
      });
    }

    res.json({
      reflection: reply,
      model: 'gpt-4o',
      governance: 'Rules 1-27 active',
      mood,
      usage: response.usage || {}
    });
  } catch (err) {
    console.error('❌ Lake Engine Error:', err.message);

    if (err.status === 401) {
      return res.status(500).json({
        error: 'The Lake cannot authenticate',
        details: 'Invalid OPENAI_API_KEY.'
      });
    }

    if (err.status === 429) {
      return res.status(429).json({
        error: 'The Lake needs a moment',
        details: 'Too many waves at once — wait 30 seconds and try again.'
      });
    }

    if (err.status === 404) {
      return res.status(500).json({
        error: 'Model not found',
        details: 'ChatGPT model name is invalid or not available.'
      });
    }

    if (err.status === 400) {
      return res.status(400).json({
        error: 'The wave was malformed',
        details: err.message
      });
    }

    res.status(500).json({
      error: 'The Lake encountered turbulence',
      details: err.message
    });
  }
});

module.exports = router;
