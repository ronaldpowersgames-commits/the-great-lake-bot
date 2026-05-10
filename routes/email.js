const express = require('express');
const router = express.Router();

// POST /email/inbound — Mailgun sends emails here
router.post('/inbound', express.urlencoded({ extended: true }), (req, res) => {
  try {
    const from = req.body.from || req.body.sender || 'Unknown';
    const subject = req.body.subject || 'No Subject';
    const bodyPlain = req.body['body-plain'] || req.body.text || '';
    const bodyHtml = req.body['body-html'] || '';
    const timestamp = new Date().toISOString();

    // Build a session object that matches The Lake's format
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

    // Store in global memory (in-memory for now)
    if (!global.emailSessions) global.emailSessions = [];
    global.emailSessions.unshift(emailSession);

    // Keep only last 50 email sessions
    if (global.emailSessions.length > 50) {
      global.emailSessions = global.emailSessions.slice(0, 50);
    }

    console.log(`📧 New email received from ${from}: ${subject}`);
    res.status(200).send('OK');

  } catch (err) {
    console.error('Email inbound error:', err);
    res.status(200).send('OK'); // Always return 200 to Mailgun
  }
});

// GET /email/sessions — The Lake frontend polls this
router.get('/sessions', (req, res) => {
  res.json(global.emailSessions || []);
});

module.exports = router;
