/**
 * 🌊 The Great Lake Bot - Chat Route
 * The core Lake experience — waves in, reflections out.
 * Powered by Claude with full governance enforcement (Rules 1-27).
 */
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// ============================================
// API KEY SAFETY CHECK
// ============================================
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY is missing from environment variables!');
} else {
  console.log('✅ Anthropic API key loaded successfully');
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

  // Check if model directory exists
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
// POST /chat — The Lake Core Experience
// ============================================
router.post('/', async function(req, res) {
  try {

    // 1. Validate incoming message (the "wave")
    var message = req.body && req.body.message;
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        error: 'No wave received',
        details: 'Send a message to The Lake.',
      });
    }

    // 2. Validate API key at request time
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: 'The Lake is not configured',
        details: 'ANTHROPIC_API_KEY is missing from environment.',
      });
    }

    // 3. Load system prompt
    var systemPrompt = loadSystemPrompt();

    // 4. Build conversation history if provided
    var conversationHistory = [];
    if (req.body.history && Array.isArray(req.body.history)) {
      conversationHistory = req.body.history.slice(-10); // Keep last 10 exchanges
    }

    // 5. Add current message
    conversationHistory.push({
      role: 'user',
      content: message.trim()
    });

    // 6. Call Claude — The Lake Engine
    var response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      system: systemPrompt,
      messages: conversationHistory,
    });

    // 7. Extract reflection
    var reply = response.content &&
                response.content[0] &&
                response.content[0].text;

    if (!reply) {
      return res.status(500).json({
        error: 'The Lake returned no reflection',
        details: 'Empty response from Claude API.',
      });
    }

    // 8. Send the reflection back
    res.json({
      reflection: reply,
      model: 'claude-haiku-4-5',
      governance: 'Rules 1-27 active',
      usage: {
        input_tokens: response.usage && response.usage.input_tokens,
        output_tokens: response.usage && response.usage.output_tokens,
      },
    });

  } catch (err) {
    console.error('❌ Lake Engine Error:', err.message);
    console.error('❌ Full error:', err);

    // Handle specific Anthropic API errors
    if (err.status === 401) {
      return res.status(500).json({
        error: 'The Lake cannot authenticate',
        details: 'Invalid ANTHROPIC_API_KEY — check Render environment variables.',
      });
    }

    if (err.status === 429) {
      return res.status(429).json({
        error: 'The Lake is overwhelmed',
        details: 'Rate limit exceeded. The waters need a moment. Try again shortly.',
      });
    }

    if (err.status === 404) {
      return res.status(500).json({
        error: 'Model not found',
        details: 'Claude model name is invalid or unavailable on your plan.',
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
