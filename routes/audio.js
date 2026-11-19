const express = require('express');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');

const router = express.Router();
const voices = new Set(['alloy','ash','ballad','coral','echo','fable','onyx','nova','sage','shimmer','verse','marin','cedar']);
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 24,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error:'Audio generation is temporarily limited. Try again in a few minutes.' }
});
let client;

router.post('/', limiter, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { text, voice, speed, format } = req.body || {};
  if (typeof text !== 'string' || !text.trim() || text.length > 4000 ||
      !voices.has(voice) || !Number.isFinite(speed) || speed < .25 || speed > 3 ||
      !['mp3','pcm'].includes(format)) {
    return res.status(400).json({ error:'Choose a voice and speed, and include up to 4,000 characters per audio segment.' });
  }
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error:'Lake audio is unavailable on this server.' });
  const controller = new AbortController();
  const cancel = () => { if (!res.writableEnded) controller.abort(); };
  res.once('close', cancel);
  try {
    client ||= new OpenAI({ apiKey:process.env.OPENAI_API_KEY, timeout:60000, maxRetries:0 });
    const result = await client.audio.speech.create({
      model:process.env.LAKE_AUDIO_MODEL || 'gpt-4o-mini-tts',
      input:text,
      voice,
      speed,
      response_format:format
    }, { signal:controller.signal });
    const bytes = Buffer.from(await result.arrayBuffer());
    if (!controller.signal.aborted) res.type(format==='mp3'?'audio/mpeg':'application/octet-stream').send(bytes);
  } catch (error) {
    if (controller.signal.aborted) return;
    const busy=error.status===429;
    res.status(busy?429:502).json({
      error:busy?'The voice service is busy. Try again in a moment.':'The voice service could not generate this audio. Try again.'
    });
  } finally {
    res.off('close', cancel);
  }
});

module.exports = router;
