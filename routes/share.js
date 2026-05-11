const express = require('express');
const router = express.Router();

// In-memory store — shared sessions live for 7 days
const sharedSessions = new Map();

// ============================================
// SAVE a shared session
// POST /share
// ============================================
router.post('/', express.json(), (req, res) => {
  try {
    const { session } = req.body;
    if (!session) return res.status(400).json({ error: 'No session provided' });

    // Generate unique ID
    const id = Math.random().toString(36).substring(2, 10) + 
                Math.random().toString(36).substring(2, 10);

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
    res.json({ id, url: `/share/${id}` });

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
