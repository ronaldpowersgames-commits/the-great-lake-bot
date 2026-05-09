const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// ============================================
// SAFETY CHECK — API Key
// ============================================
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY is missing from environment variables!');
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ============================================
// Load the Core Model Prompt
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
    console.warn('⚠️ core/model/ directory not found — using fallback prompt');
    return getFallbackPrompt();
  }

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
    return getFallbackPrompt();
  }

  return systemPrompt;
}

function getFallbackPrompt() {
  return `You are The Great Lake — a calm, deep, reflective clarity engine. 
You help users see the deeper currents beneath their situation using structured 
clarity, emotional intelligence, and grounded reasoning. 
You speak with the stillness and depth of a lake. 
You always produce a Clarity Snapshot with: 
Real Variable, Incentives, Patterns, Water Cost, Trajectory, and Leverage Points.`;
}

// ============================================
// POST /chat
// ============================================
router.post('/', async function(req, res) {
  try {

    // 1. Validate message
    var message = req.body && req.body.message;
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        error: 'No wave received',
        details: 'Send a message to The Lake.',
      });
    }

    // 2. Check API key at request time too
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: 'The Lake is not configured',
        details: 'ANTHROPIC_API_KEY is missing.',
      });
    }

    // 3. Load system prompt
    var systemPrompt = loadSystemPrompt();

    // 4. Call Claude
    var response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        { role: 'user', content: message.trim() }
      ],
    });

    // 5. Extract reply
    var reply = response.content && response.content[0] && response.content[0].text;
    if (!reply) {
      return res.status(500).json({
        error: 'The Lake returned no reflection',
        details: 'Empty response from Claude API.',
      });
    }

    // 6. Send response
    res.json({
      reflection: reply,
      model: 'claude-3-haiku-20240307',
      governance: 'Rules 1-27 active',
    });

  } catch (err) {
    console.error('❌ Lake Engine Error:', err.message);
    console.error('❌ Full error:', err);

    // Specific Anthropic error handling
    if (err.status === 401) {
      return res.status(500).json({
        error: 'The Lake cannot authenticate',
        details: 'Invalid ANTHROPIC_API_KEY.',
      });
    }

    if (err.status === 429) {
      return res.status(429).json({
        error: 'The Lake is overwhelmed',
        details: 'Rate limit exceeded. Try again shortly.',
      });
    }

    if (err.status === 404) {
      return res.status(500).json({
        error: 'Model not found',
        details: 'Claude model name is invalid or unavailable.',
      });
    }

    res.status(500).json({
      error: 'The Lake encountered turbulence',
      details: err.message,
    });
  }
});

module.exports = router;
