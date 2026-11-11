const express = require('express');
const router = express.Router();
const { randomBytes } = require('node:crypto');

const publicSession = require('../public/shared-session');

function protectedShare(payload) {
  const base64 = /^[A-Za-z0-9+/]+={0,2}$/;
  if (!payload || payload.format_version !== 'lake-encrypted-backup/1' ||
      typeof payload.salt !== 'string' || payload.salt.length !== 24 || !base64.test(payload.salt) ||
      typeof payload.iv !== 'string' || payload.iv.length !== 16 || !base64.test(payload.iv) ||
      typeof payload.ciphertext !== 'string' || payload.ciphertext.length < 24 ||
      payload.ciphertext.length % 4 !== 0 || !base64.test(payload.ciphertext) ||
      Buffer.from(payload.salt,'base64').length !== 16 || Buffer.from(payload.iv,'base64').length !== 12) {
    throw new Error('Invalid protected share');
  }
  const {format_version,salt,iv,ciphertext}=payload;
  return {format_version,salt,iv,ciphertext};
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
    let data;
    try {
      data = req.body.encryptedSession === undefined
        ? {session:publicSession(req.body.session)}
        : {encryptedSession:protectedShare(req.body.encryptedSession)};
    }
    catch (error) { return res.status(400).json({ error: error.message }); }

    // Generate unique ID
    const id = randomBytes(24).toString('hex');

    const expires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    sharedSessions.set(id, {
      data,
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

  res.json(entry.data);
});

module.exports = router;
