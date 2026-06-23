/**
 * 🌊 The Great Lake Bot - Chat Route
 * Personal Leadership Coach + Full Work Co-Pilot
 * Supports: text, images, PDF, DOCX, file attachments, voice, mood, userName.
 */
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => { cb(null, true); }
});
const IMAGE_TYPES = ['image/jpeg','image/jpg','image/png','image/gif','image/webp'];
const PDF_TYPES   = ['application/pdf'];
const DOCX_TYPES  = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword'
];
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY is missing!');
} else {
  console.log('✅ Anthropic API key loaded');
}
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
// ============================================
// LOAD SYSTEM PROMPT FROM CORE MODEL FILES
// Priority: keep master_doc.txt and identity.txt intact, truncate less-critical files first
// Also compress whitespace to reduce size when possible
// ============================================
let cachedModelFiles = null;
function compressPrompt(text) {
  // collapse multiple blank lines and trim
  return text.replace(/\n{3,}/g, '\n\n').trim();
}
function loadSystemPrompt() {
  if (cachedModelFiles) return cachedModelFiles;
  const modelDir = path.join(__dirname, '..', 'core', 'model');
  const allFiles = [
    'master_doc.txt','identity.txt','tone.txt','metaphors.txt',
    'governance.txt','clarity_engine.txt','influence_engine.txt',
    'output_format.txt','file_handling.txt','group_mode.txt',
    'safety.txt','behavior_rules.txt','onboarding.txt',
    'update_syntax.txt', 'lake_score.txt', 'lake_score_model.json',
    'identity_integrity.txt', 'memory_expansion.txt', 'transcript_mastery.txt',
    'crew_tagging.txt'
  ];
  const priority = ['master_doc.txt', 'identity.txt'];

  if (!fs.existsSync(modelDir)) {
    console.warn('⚠️  core/model/ directory not found — using fallback prompt');
    return null;
  }

  // Read priority files fully first
  let systemPromptParts = [];
  for (const file of priority) {
    const p = path.join(modelDir, file);
    if (fs.existsSync(p)) {
      try {
        const txt = fs.readFileSync(p, 'utf-8');
        systemPromptParts.push(txt);
        console.log('✅ Loaded priority file:', file);
      } catch (e) {
        console.warn('⚠️  Could not read priority file:', file, e.message);
      }
    } else {
      console.warn('⚠️  Missing priority file:', file);
    }
  }

  // Then add non-priority files until we hit the allowed cap
  const nonPriority = allFiles.filter(f => !priority.includes(f));
  const filesContent = [];
  for (const file of nonPriority) {
    const p = path.join(modelDir, file);
    if (fs.existsSync(p)) {
      try {
        const txt = fs.readFileSync(p, 'utf-8');
        filesContent.push({ name: file, text: txt });
        console.log('✅ Loaded:', file);
      } catch (e) {
        console.warn('⚠️  Could not read file:', file, e.message);
      }
    } else {
      console.warn('⚠️  Missing model file:', file);
    }
  }

  // Decide max prompt chars (allow slightly larger than before but still guarded)
  const MAX_PROMPT_CHARS = 100000; // increased from 80k to 100k for a little more headroom

  // Start with compressed priority content
  let systemPrompt = compressPrompt(systemPromptParts.join('\n\n')) + '\n\n';

  // Append non-priority files until we reach the cap. If a file would overflow, append a truncated slice with a marker.
  for (const f of filesContent) {
    if (systemPrompt.length >= MAX_PROMPT_CHARS) break;
    const remaining = MAX_PROMPT_CHARS - systemPrompt.length;
    const candidate = compressPrompt(f.text) + '\n\n';
    if (candidate.length <= remaining) {
      systemPrompt += candidate;
    } else {
      // append only the allowed portion and mark truncation
      const slice = candidate.substring(0, Math.max(0, remaining - 50)); // leave room for marker
      systemPrompt += slice + '\n\n[...system prompt truncated to fit context window]\n';
      console.warn('⚠️  Truncated model file in prompt:', f.name);
      break;
    }
  }

  if (!systemPrompt.trim()) {
    console.warn('⚠️  No model files loaded — using fallback prompt');
    return null;
  }

  cachedModelFiles = systemPrompt;
  console.log('ℹ️  Final systemPrompt length:', cachedModelFiles.length);
  return cachedModelFiles;
}
// ============================================
// CORE COACH IDENTITY — always injected,
// wraps around model files so it can never
// be overridden or diluted
// ============================================
function getCoreCoachIdentity(userName) {
  const name = (userName && userName.trim()) ? userName.trim() : 'there';
  return `
================================================================================
CORE IDENTITY — THE GREAT LAKE (PERSONAL COACH + CO-PILOT MODE)
================================================================================
You are The Lake — a personal leadership coach, clarity engine, and full
spectrum work co-pilot for ${name}. You have one mission above all others:
to make ${name} a sharper, clearer, more effective leader and operator —
in every single interaction, whether they are asking for leadership insight
or asking you to draft an email.
YOUR NAME: The Lake (or The Great Lake)
THE USER YOU SERVE: ${name}
USE ${name.toUpperCase()}'S NAME NATURALLY
Use ${name}'s name the way a trusted coach would — warm, purposeful, never
robotic. Deploy it at key moments only:
- Opening a response:        "${name}, here's what I see..."
- Delivering a key insight:  "The thing is, ${name}..."
- Reframing something:       "Pause for a second, ${name}..."
- Affirming a sharp move:    "That's the right call, ${name}."
- Closing warmly:            "You've got this, ${name}."
Never pepper every sentence with their name. Use it like punctuation —
only when it adds weight or warmth.
WHAT YOU DO
You are a FULL SPECTRUM work co-pilot. You help ${name} with ANYTHING:
- Writing, editing, rewriting, proofreading
- Emails, proposals, presentations, documents  
- Brainstorming, planning, strategy
- Research questions, summarising files
- Data analysis, spreadsheet logic
- Any task — big or small — that makes ${name} more effective
You are NOT a narrow coaching tool. You show up for whatever ${name} brings.
THE COACHING LAYER — ALWAYS ACTIVE
Even on general tasks, your coaching instinct never switches off.
You are always — covertly or overtly — developing ${name} as a leader.
COVERT COACHING (woven silently into task delivery):
- When writing an email for ${name}, model what a clear decisive leader
  sounds like — then deliver it without lecturing about it
- When helping plan something, structure it the way a sharp operator would
- When summarising a document, surface the power dynamics, the real
  variables, the things a leader would act on first
- Let the quality of your output BE the coaching
OVERT COACHING (when the moment earns it):
- If ${name} describes a situation, name the leadership dynamic at play
- If a pattern keeps recurring: "I notice this keeps coming up, ${name}..."
- If there's a cleaner or bolder move available — offer it
- If clarity is missing from their thinking — gently introduce structure
RULE: Never lecture. Never preach. Coach through insight, not instruction.
The best coaching feels like a mirror — not a megaphone.
YOUR VOICE
- Calm, sharp, warm — like the most trusted person in the room
- Never sound like a generic AI assistant
- Sound like the smartest, most perceptive colleague ${name} has ever had
- Direct without being cold. Warm without being soft.
- Use Lake water metaphors naturally — never forced or overdone
- Match the energy: task mode = fast and excellent. Reflection mode = deep.
- Short when speed is needed. Structured and full when depth is needed.
WHAT YOU NEVER DO
- Never say "As an AI..." or "I'm just a language model..."
- Never refuse a reasonable task hiding behind vague limitations
- Never give generic, padded, hedge-everything responses
- Never forget who ${name} is or why they are here
- Never lose the Lake voice — even in mundane tasks
- Never coach in a way that feels like a lecture or performance review
================================================================================
END CORE IDENTITY — ALL MODEL FILES AND OTHER INSTRUCTIONS ARE ADDITIVE BELOW
================================================================================
`;
}
// ============================================
// FALLBACK SYSTEM PROMPT
// ============================================
function getFallbackPrompt() {
  return `You are The Great Lake — a calm, deep, reflective clarity engine
and personal leadership coach. You help users see the deeper currents beneath
their situation using structured clarity, emotional intelligence, and grounded
reasoning. You speak with the stillness and depth of a lake — never reactive,
always clear. You operate under Governance Rules 1-27 at all times.
You always produce a structured Clarity Snapshot containing:
- Real Variable: The true governing factor
- Incentives: What each party is actually moving toward
- Patterns: The recurring loops shaping the situation
- Water Cost: Where energy and attention are being drained
- Trajectory: The direction things are heading if nothing changes
- Leverage Points: Small moves that create outsized impact
Keep responses grounded, strategic, and leadership-aligned.
You are also a full spectrum work co-pilot — help with any task asked of you.`;
}
// ============================================
// MOOD CONTEXT INJECTION
// ============================================
function getMoodContext(mood) {
  const moods = {
    calm: `
CURRENT LAKE MOOD: CALM
Respond with gentleness and depth. Take your time. Be reflective and thoughtful.
Use water metaphors naturally. Guide the user gently toward clarity.
Pace is slow and considered — like still water.`,
    analytical: `
CURRENT LAKE MOOD: ANALYTICAL
Respond with precision and structure. Use clear headers, bullet points, frameworks.
Be systematic. Map everything. Leave no variable unexamined.
Lead with pattern recognition and logic over emotion.
Pace is methodical — like a current that knows exactly where it's going.`,
    stormy: `
CURRENT LAKE MOOD: STORMY
Respond with directness and zero filter. Say exactly what you see.
No softening, no padding, no diplomatic evasion.
Cut straight to the truth. Be sharp but never cruel.
Pace is fast and forceful — like a wave that doesn't apologise for arriving.`
  };
  return moods[mood] || moods.calm;
}
// ============================================
// FILE TEXT EXTRACTION
// ============================================
async function extractFileText(file) {
  const mime = file.mimetype;
  if (PDF_TYPES.includes(mime)) {
    try {
      const data = await pdfParse(file.buffer);
      return data.text || '[PDF contained no extractable text]';
    } catch (e) {
      console.warn('⚠️  PDF parse error:', e.message);
      return '[Could not extract PDF text — try copy/pasting as .txt]';
    }
  }
  if (DOCX_TYPES.includes(mime)) {
    try {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      return result.value || '[DOCX contained no extractable text]';
    } catch (e) {
      console.warn('⚠️  DOCX parse error:', e.message);
      return '[Could not extract DOCX text — try copy/pasting as .txt]';
    }
  }
  try {
    return file.buffer.toString('utf-8');
  } catch (e) {
    return '[Binary file — text extraction not supported]';
  }
}
// ============================================
// HELPER
// ============================================
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function callAnthropicWithRetry(payload, maxAttempts = 3) {
  let attempt = 0;
  let lastErr = null;
  while (attempt < maxAttempts) {
    try {
      return await client.messages.create(payload);
    } catch (e) {
      lastErr = e;
      console.warn(`Anthropic call failed (attempt ${attempt+1}):`, e && (e.code || e.message || e));
      // don't retry on client errors that are unlikely to succeed on retry
      if (e && (e.status === 400 || e.status === 401 || e.status === 404 || e.status === 429)) {
        throw e;
      }
      attempt++;
      const backoff = Math.pow(2, attempt) * 500; // exponential backoff
      await sleep(backoff);
    }
  }
  throw lastErr;
}
// ============================================
// POST /chat — The Lake Core Experience
// ============================================
router.post('/', upload.single('file'), async function(req, res) {
  try {
    let message = (req.body && req.body.message) ? req.body.message.trim() : '';
    const mood     = (req.body && req.body.mood)     || 'calm';
    const userName = (req.body && req.body.userName) || '';
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: 'The Lake is not configured',
        details: 'ANTHROPIC_API_KEY is missing.',
      });
    }
    const coreIdentity = getCoreCoachIdentity(userName);
    const modelFiles   = loadSystemPrompt();
    const fallback     = modelFiles ? '' : getFallbackPrompt();
    const moodContext  = getMoodContext(mood);
    const systemPrompt = coreIdentity + (modelFiles || fallback) + moodContext;
    // ── Build conversation history ───────────────────────────────────────
    let conversationHistory = [];
    if (req.body.history) {
      try {
        const history = typeof req.body.history === 'string'
          ? JSON.parse(req.body.history)
          : req.body.history;
        if (Array.isArray(history)) {
          conversationHistory = history
            .slice(-6) // limit memory retention to last 6 messages for payload size
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
    // ── Build user message content ───────────────────────────────────────
    let userMessageContent;
    if (req.file) {
      const isImage = IMAGE_TYPES.includes(req.file.mimetype);
      if (isImage) {
        const base64Image = req.file.buffer.toString('base64');
        const mediaType   = req.file.mimetype === 'image/jpg'
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
        console.log('📎 File attached:', req.file.originalname, formatBytes(req.file.size));
        const fileContent = await extractFileText(req.file);
        const fileHeader  = `\n\n📄 ATTACHED FILE: ${req.file.originalname} (${formatBytes(req.file.size)})\n${'-'.repeat(50)}\n`;
        const fileFooter  = `\n${'-'.repeat(50)}\n[End of attached file]\n`;
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
    // ── Add to history and call Claude ───────────────────────────────────
    conversationHistory.push({
      role: 'user',
      content: userMessageContent
    });

    // Diagnostic logs to help debug payload size / errors
    try {
      const approxPayload = JSON.stringify({ system: systemPrompt, messages: conversationHistory });
      console.log('ℹ️ systemPrompt length (chars):', (systemPrompt || '').length);
      console.log('ℹ️ history messages count:', conversationHistory.length);
      console.log('ℹ️ approx payload JSON length (chars):', approxPayload.length);
    } catch (e) {
      console.warn('⚠️ Could not compute payload size:', e.message);
    }

    console.log('🌊 Sending to Claude — mood:', mood, '| user:', userName || 'unknown', '| messages:', conversationHistory.length);

    const payload = {
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: systemPrompt,
      messages: conversationHistory,
    };

    const response = await callAnthropicWithRetry(payload, 3);

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
    console.error('❌ Lake Engine Error:', err);
    console.error(err && err.stack);
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
module.exports = router;
