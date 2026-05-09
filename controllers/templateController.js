/**
 * The Great Lake Bot - Template Controller
 * POST /template
 * Governance Rules: 3 (Structural Metaphor), 4 (Domain-Agnostic), 5 (Clarity First)
 */
const { v4: uuidv4 } = require('uuid');
const store = require('../store/memoryStore');
const { validateTemplate } = require('../validators');

async function submitTemplate(req, res) {
  const validation = validateTemplate(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', details: validation.errors.join(' ') });
  }

  const { volatility, rtp, symbols, features, waterCost, incentives, trajectory } = req.body;
  const templateId = uuidv4();

  const template = store.setTemplate(templateId, {
    userId: req.user.id,
    volatility: volatility, rtp: rtp, symbols: symbols, features: features,
    waterCost: waterCost, incentives: incentives, trajectory: trajectory,
  });

  return res.status(200).json({
    message: 'Template accepted by The Great Lake Bot.',
    templateId: template.id,
    createdAt: template.createdAt,
    fields: { volatility: volatility, rtp: rtp, symbols: symbols, features: features, waterCost: waterCost, incentives: incentives, trajectory: trajectory },
  });
}

module.exports = { submitTemplate: submitTemplate };
