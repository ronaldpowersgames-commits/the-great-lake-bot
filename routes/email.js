const express = require('express');
const router = express.Router();

// Store emails temporarily in memory (just as a relay)
// Frontend will poll and store locally
const emailQueue = [];

router.post('/inbound', express.json(), (req, res) => {
  try {
    const from = req.body.sender || req.body.from || 'Unknown';
    const subject = req.body.subject || 'No Subject';
    const bodyPlain = req.body['body-plain'] || req.body.text || '';
    const timestamp = new Date().toISOString();

    const emailSession = {
      id: 'email_' + Date.now(),
      title: subject,
      source: 'email',
      from: from,
      date: timestamp,
      preview: bodyPlain.substring(0, 100),
      messages: [
        {
          role: 'user',
          content: `📧 Email from ${from}\n\nSubject: ${subject}\n\n${bodyPlain}`,
          timestamp: timestamp
        }
      ]
    };

    // Keep in queue for 5 minutes for frontend to pick up
    emailQueue.unshift(emailSession);
    if (emailQueue.length > 20) emailQueue.pop();

    // Auto-clear emails older than 5 minutes
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    while (emailQueue.length > 0) {
      const last = emailQueue[emailQueue.length - 1];
      if (new Date(last.date).getTime() < fiveMinAgo) emailQueue.pop();
      else break;
    }

    console.log(`📧 Email received from ${from}: ${subject}`);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Email inbound error:', err);
    res.status(200).json({ ok: true });
  }
});

// Frontend polls this — gets new emails then stores them locally
router.get('/sessions', (req, res) => {
  res.json(emailQueue);
});

module.exports = router;
