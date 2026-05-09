const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Load the Core Model Prompt
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
  for (const file of files) {
    const filePath = path.join(modelDir, file);
    if (fs.existsSync(filePath)) {
      systemPrompt += fs.readFileSync(filePath, 'utf-8') + '\n\n';
    }
  }

  // Fallback if no files exist yet
  if (!systemPrompt.trim()) {
    systemPrompt = 'You are The Great Lake — a calm, deep, reflective clarity engine. You help users see the deeper currents beneath their situation using structured clarity, emotional intelligence, and grounded reasoning. You speak with the stillness and depth of a lake. You always produce a Clarity Snapshot with: Real Variable, Incentives, Patterns, Water Cost, Trajectory, and Leverage Points.';
  }

  return systemPrompt;
}

router.post('/', async function(req, res) {
  try {
    var message = req.body && req.body.message;
    if (!message) {
      return res.status(400).json({
        error: 'No wave received',
        details: 'Send a message to The Lake.',
      });
    }

    var systemPrompt = loadSystemPrompt();

    var response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        { role: 'user', content: message }
      ],
    });

    var reply = response.content[0].text;

    res.json({
      reflection: reply,
      model: 'claude-3-5-sonnet-20241022',
      governance: 'Rules 1-27 active',
    });

  } catch (err) {
    console.error('Lake Engine Error:', err.message);
    res.status(500).json({
      error: 'The Lake encountered turbulence',
      details: err.message,
    });
  }
});

module.exports = router;
