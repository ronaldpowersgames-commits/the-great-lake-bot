/**
 * The Great Lake Bot - Onboarding Controller
 * POST /onboarding
 * Governance Rules: 21 (Character Context), 4 (Domain-Agnostic), 5 (Clarity First)
 */
const { v4: uuidv4 } = require('uuid');
const store = require('../store/memoryStore');
const { validateOnboarding } = require('../validators');

async function onboard(req, res) {
  const validation = validateOnboarding(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', details: validation.errors.join(' ') });
  }

  const { industry, role, teamSize, challenges } = req.body;
  const userId = req.user.id;

  const user = store.createUser(userId, {
    email: req.user.email,
    industry: industry,
    role: role,
    teamSize: teamSize || null,
    challenges: challenges || [],
    onboardedAt: new Date().toISOString(),
  });

  return res.status(200).json({
    id: user.id,
    email: user.email,
    profile: {
      industry: industry,
      role: role,
      teamSize: teamSize || null,
      challenges: challenges || [],
      onboardedAt: user.profile.onboardedAt,
    },
  });
}

module.exports = { onboard: onboard };
