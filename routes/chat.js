/**
 * 🌊 The Great Lake Bot - Chat Route
 * Supports: text, images, PDF, DOCX, file attachments, voice, mood context.
 */
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const router = express.Router();

// ============================================
// FILE UPLOAD — multer (memory storage)
// ============================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, true);
  }
});

// ============================================
// FILE TYPE GROUPS
// ============================================
const IMAGE_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png',
  'image/gif', 'image/webp'
];

const PDF_TYPES = [
  'application/pdf'
];

const DOCX_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword'
];

// ============================================
// ANTHROPIC CLIENT
// ============================================
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY is missing!');
} else {
  console.log('✅ Anthropic API key loaded');
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ============================================
// LOAD SYSTEM PROMPT FROM CORE MODEL FILES
// ============================================
function loadSystemPrompt() {
  const modelDir = path.join(__dirname, '..', 'core', 'model');
  const files = [
    'master_doc.txt',
    'identity.txt',
    'tone.txt',
    'metaphors.txt',
    'governance.txt',
    'clarity_engine.txt',
    'influence_engine.txt',
    'output_format.txt',
    'file_handling.txt',
    'group_mode.txt',
    'safety.txt',
    'behavior_rules.txt',
    'onboarding.txt',
    'update_syntax.txt',
    'lake_score.txt',
  ];

  let systemPrompt = '';

  if (!fs.existsSync(modelDir)) {
    console.warn('⚠️  core/model/ directory not found — using fallback prompt');
    return getFallbackPrompt();
  }

  for (const file of files) {
    const filePath = path.join(modelDir, file);
    if (fs.existsSync(filePath)) {
      systemPrompt += fs.readFileSync(filePath, 'utf-8') + '\n\n';
      console.log('✅ Loaded:', file);
    } else {
      console.warn('⚠️  Missing model file:', file);
    }
  }

  if (!systemPrompt.trim()) {
    console.warn('⚠️  No model files loaded — using fallback prompt');
    return getFallbackPrompt();
  }

  const MAX_PROMPT_CHARS = 150000;
  if (systemPrompt.length > MAX_PROMPT_CHARS) {
    systemPrompt = systemPrompt.substring(0, MAX_PROMPT_CHARS);
    console.warn('⚠️  System prompt trimmed to fit context window');
  }

  return systemPrompt;
}

// ============================================
// FALLBACK SYSTEM PROMPT
// ============================================
function getFallbackPrompt() {
  return `You are The Great Lake — a calm, deep, reflective clarity engine.
You help users see the deeper currents beneath their situation using structured
clarity, emotional intelligence, and grounded reasoning.
You speak with the stillness and depth of a lake — never reactive, always clear.
You operate under Governance Rules 1-27 at all times.
You always produce a structured Clarity Snapshot containing:
- Real Variable: The true governing factor
- Incentives: What each party is actually moving toward
- Patterns: The recurring loops shaping the situation
- Water Cost: Where energy and attention are being drained
- Trajectory: The direction things are heading if nothing changes
- Leverage Points: Small moves that create outsized impact
Keep responses grounded, strategic, and leadership-aligned.`;
}

// ============================================
// MOOD CONTEXT INJECTION
// ============================================
function getMoodContext(mood) {
  const moods = {
    calm: `
CURRENT LAKE MOOD: CALM
Respond with gentleness and depth. Take your time. Be reflective and thoughtful.
Use water metaphors naturally. Guide the user gently toward clarity.`,
    analytical: `
CURRENT LAKE MOOD: ANALYTICAL
Respond with precision and structure. Use clear headers, bullet points, and frameworks.
Be systematic. Map everything. Leave no variable unexamined.
Lead with data and pattern recognition over emotion.`,
    stormy: `
CURRENT LAKE MOOD: STORMY
Respond with directness and zero filter. Say exactly what you see.
No softening, no padding, no diplomatic evasion.
Cut straight to the truth. Be sharp but not cruel.`
  };
  return moods[mood] || moods.calm;
}

// ============================================
// FILE TEXT EXTRACTION
// ============================================
async function extractFileText(file) {
  const mime = file.mimetype;

  // PDF
  if (PDF_TYPES.includes(mime)) {
    try {
      const data = await pdfParse(file.buffer);
      return data.text || '[PDF contained no extractable text]';
    } catch (e) {
      console.warn('⚠️  PDF parse error:', e.message);
      return '[Could not extract PDF text — try copy/pasting as .txt]';
    }
  }

  // DOCX / DOC
  if (DOCX_TYPES.includes(mime)) {
    try {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      return result.value || '[DOCX contained no extractable text]';
    } catch (e) {
      console.warn('⚠️  DOCX parse error:', e.message);
      return '[Could not extract DOCX text — try copy/pasting as .txt]';
    }
  }

  // Plain text fallback
  try {
    return file.buffer.toString('utf-8');
  } catch (e) {
    return '[Binary file — text extraction not supported]';
  }
}

// ============================================
// POST /chat — The Lake Core Experience
// ============================================
router.post('/', upload.single('file'), async function(req, res) {
  try {
    let message = (req.body && req.body.message) ? req.body.message.trim() : '';
    const mood = (req.body && req.body.mood) || 'calm';

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: 'The Lake is not configured',
        details: 'ANTHROPIC_API_KEY is missing.',
      });
    }

    let systemPrompt = loadSystemPrompt();
    systemPrompt += getMoodContext(mood);

    // Build conversation history
    let conversationHistory = [];
    if (req.body.history) {
      try {
        const history = typeof req.body.history === 'string'
          ? JSON.parse(req.body.history)
          : req.body.history;
        if (Array.isArray(history)) {
          conversationHistory = history
            .slice(-10)
            .filter(m => m.role && m.content)
            .map(m => ({
              role: m.role === 'user' ? 'user' : 'assistant',
              content: String(m.content)
            }));
        }
      } catch (e) {
        console.warn('⚠️  Could not parse history:', e.message);
      }
    }

    // Build user message content
    let userMessageContent;

    if (req.file) {
      const isImage = IMAGE_TYPES.includes(req.file.mimetype);

      if (isImage) {
        // 🖼️ Image — Claude Vision
        const base64Image = req.file.buffer.toString('base64');
        const mediaType = req.file.mimetype === 'image/jpg'
          ? 'image/jpeg'
          : req.file.mimetype;

        console.log('🖼️ Image attached:', req.file.originalname, formatBytes(req.file.size));

        userMessageContent = [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: message
              ? message
              : 'Please analyse this image and give me your full Lake reflection on what you see.',
          }
        ];

      } else {
        // 📄 PDF / DOCX / TXT — extract text
        console.log('📎 File attached:', req.file.originalname, formatBytes(req.file.size));
        const fileContent = await extractFileText(req.file);

        const fileHeader = `\n\n📄 ATTACHED FILE: ${req.file.originalname} (${formatBytes(req.file.size)})\n${'─'.repeat(50)}\n`;
        const fileFooter = `\n${'─'.repeat(50)}\n[End of attached file]\n`;
        const fullMessage = message
          ? message + fileHeader + fileContent + fileFooter
          : `Please analyse this attached file:` + fileHeader + fileContent + fileFooter;

        userMessageContent = fullMessage;
      }

    } else {
      if (!message) {
        return res.status(400).json({
          error: 'No wave received',
          details: 'Send a message or attach a file to The Lake.',
        });
      }
      userMessageContent = message;
    }

    // Add to history
    conversationHistory.push({
      role: 'user',
      content: userMessageContent
    });

    // Call Claude
    console.log('🌊 Sending to Claude Sonnet — mood:', mood, '| messages:', conversationHistory.length);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: systemPrompt,
      messages: conversationHistory,
    });

    const reply = response.content &&
                  response.content[0] &&
                  response.content[0].text;

    if (!reply) {
      return res.status(500).json({
        error: 'The Lake returned no reflection',
        details: 'Empty response from Claude API.',
      });
    }

    console.log('✅ Reflection sent — tokens in:', response.usage?.input_tokens, '| out:', response.usage?.output_tokens);

    res.json({
      reflection: reply,
      model: 'claude-sonnet-4-5',
      governance: 'Rules 1-27 active',
      mood: mood,
      usage: {
        input_tokens: response.usage?.input_tokens,
        output_tokens: response.usage?.output_tokens,
      },
    });

  } catch (err) {
    console.error('❌ Lake Engine Error:', err.message);

    if (err.status === 401) {
      return res.status(500).json({
        error: 'The Lake cannot authenticate',
        details: 'Invalid ANTHROPIC_API_KEY.',
      });
    }
    if (err.status === 429) {
      return res.status(429).json({
        error: 'The Lake needs a moment',
        details: 'Too many waves at once — wait 30 seconds and try again.',
      });
    }
    if (err.status === 404) {
      return res.status(500).json({
        error: 'Model not found',
        details: 'Claude model name is invalid.',
      });
    }
    if (err.status === 400) {
      return res.status(400).json({
        error: 'The wave was malformed',
        details: err.message,
      });
    }

    res.status(500).json({
      error: 'The Lake encountered turbulence',
      details: err.message,
    });
  }
});

// ============================================
// HELPER
// ============================================
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

module.exports = router;
