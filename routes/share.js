const express = require('express');
const router = express.Router();
const { randomBytes } = require('node:crypto');

function publicSession(session) {
  if (!session || !Array.isArray(session.history) || !session.history.length) {
    throw new Error('A conversation with messages is required');
  }
  const result = {
    name: String(session.name || 'Shared conversation').slice(0, 200),
    time: String(session.time || ''),
    history: session.history.filter(message => ['user', 'assistant'].includes(message.role) &&
      !['total', 'both'].includes(message.snapshot?.scope) &&
      !['snapshot-total', 'snapshot-both'].includes(message.action)).map(message => ({
      role: message.role,
      content: String(message.content || ''),
      time: String(message.time || ''),
      attachments: Array.isArray(message.attachments) ? message.attachments.map(file => ({
        name: String(file.name || 'Attachment').slice(0, 200),
        ...(typeof file.data === 'string' && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(file.data)
          ? { data: file.data } : {})
      })) : []
    }))
  };
  if (!result.history.length) throw new Error('No shareable conversation messages were found');
  return result;
}

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// In-memory store — shared sessions live for 7 days
const sharedSessions = new Map();

// ============================================
// SAVE a shared session
// POST /share
// ============================================
router.post('/', express.json(), (req, res) => {
  try {
    let session;
    try { session = publicSession(req.body.session); }
    catch (error) { return res.status(400).json({ error: error.message }); }

    // Generate unique ID
    const id = randomBytes(24).toString('hex');

    const expires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    sharedSessions.set(id, {
      session,
      expires,
      createdAt: new Date().toISOString()
    });

    // Clean up expired sessions
    for (const [key, val] of sharedSessions.entries()) {
      if (val.expires < Date.now()) sharedSessions.delete(key);
    }

    console.log(`🔗 Session shared: ${id}`);
    res.json({ id, url: `/shared.html?id=${id}` });

  } catch (err) {
    console.error('Share save error:', err);
    res.status(500).json({ error: 'Failed to save session' });
  }
});

// ============================================
// GET a shared session
// GET /share/:id
// ============================================
router.get('/:id', (req, res) => {
  const entry = sharedSessions.get(req.params.id);

  if (!entry) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }

  if (entry.expires < Date.now()) {
    sharedSessions.delete(req.params.id);
    return res.status(404).json({ error: 'Session has expired' });
  }

  res.json({ session: entry.session });
});

module.exports = router;
