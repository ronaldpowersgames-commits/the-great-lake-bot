const express = require('express');
const router = express.Router();

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

    if (!global.emailSessions) global.emailSessions = [];
    global.emailSessions.unshift(emailSession);
    if (global.emailSessions.length > 50) {
      global.emailSessions = global.emailSessions.slice(0, 50);
    }

    console.log(`📧 New email received from ${from}: ${subject}`);
    res.status(200).send('OK');
  } catch (err) {
    console.error('Email inbound error:', err);
    res.status(200).send('OK');
  }
});

router.get('/sessions', (req, res) => {
  res.json(global.emailSessions || []);
});

module.exports = router;
