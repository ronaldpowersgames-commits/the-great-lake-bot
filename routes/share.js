const express = require('express');
const router = express.Router();
const { randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');

function protectPassphrase(value) {
  const passphrase = String(value || '').trim();
  if (!passphrase) return null;
  if (passphrase.length > 200) throw new Error('Passphrase must be 200 characters or fewer');
  const salt = randomBytes(16);
  return { salt: salt.toString('hex'), hash: scryptSync(passphrase, salt, 32).toString('hex') };
}

function passphraseMatches(value, protection) {
  if (!protection) return true;
  const supplied = scryptSync(String(value || ''), Buffer.from(protection.salt, 'hex'), 32);
  return timingSafeEqual(supplied, Buffer.from(protection.hash, 'hex'));
}

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
      ...(['drip','shallow','calm','analytical','stormy'].includes(message.mood)?{mood:message.mood}:{}),
      ...(message.mirror ? {mirror:{simulated:message.role==='assistant',mode:message.mirror.mode==='lab'?'lab':'pure'}} : {}),
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

const DAY_MS = 86400000;
const DURATION_MS = { seconds:1000, minutes:60000, hours:3600000, days:DAY_MS, weeks:7*DAY_MS };
function shareExpiration(expiration, now) {
  if (expiration == null) return null;
  let timestamp;
  if (expiration.mode === 'date') {
    timestamp = expiration.timestamp;
  } else if (expiration.mode === 'duration') {
    const { amount, unit } = expiration;
    if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('Enter a positive whole number for expiration.');
    if (Object.hasOwn(DURATION_MS, unit)) {
      timestamp = now + amount * DURATION_MS[unit];
    } else if (unit === 'months' || unit === 'years') {
      const date = new Date(now);
      const day = date.getUTCDate();
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + amount * (unit === 'years' ? 12 : 1));
      const last = new Date(date);
      last.setUTCMonth(last.getUTCMonth() + 1, 0);
      date.setUTCDate(Math.min(day, last.getUTCDate()));
      timestamp = date.getTime();
    }
  }
  if (!Number.isSafeInteger(timestamp) || timestamp <= now || timestamp > 8640000000000000) {
    throw new Error('Choose a valid expiration in the future.');
  }
  return timestamp;
}

// Shared sessions are stored in memory and also disappear on restart.
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

    let expires;
    try { expires = shareExpiration(req.body.expiration, Date.now()); }
    catch (error) { return res.status(400).json({ error: error.message }); }

    let protection;
    try { protection = protectPassphrase(req.body.passphrase); }
    catch (error) { return res.status(400).json({ error: error.message }); }

    sharedSessions.set(id, {
      session,
      protection,
      unlockPrompt: protection && typeof req.body.unlockPrompt==='string' ? req.body.unlockPrompt.trim().slice(0,180) : '',
      expires,
      createdAt: new Date().toISOString()
    });

    // Clean up expired sessions
    for (const [key, val] of sharedSessions.entries()) {
      if (val.expires !== null && val.expires <= Date.now()) sharedSessions.delete(key);
    }

    console.log(`🔗 Session shared: ${id}`);
    res.json({ id, url: `/shared.html?id=${id}`, protected: Boolean(protection), expiresAt:expires });

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

  if (entry.expires !== null && entry.expires <= Date.now()) {
    sharedSessions.delete(req.params.id);
    return res.status(404).json({ error: 'Session has expired' });
  }

  if (entry.protection && !passphraseMatches(req.get('x-lake-passphrase'), entry.protection)) {
    return res.status(401).json({
      error: 'Passphrase required', protected: true,
      ...(entry.unlockPrompt?{unlockPrompt:entry.unlockPrompt}:{})
    });
  }

  res.json({ session: entry.session });
});

module.exports = router;
