const express = require('express');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');
const pronunciation = require('../public/audio-pronunciation');

const router = express.Router();
const voices = new Set(['alloy','ash','ballad','coral','echo','fable','onyx','nova','sage','shimmer','verse','marin','cedar']);
const deliveries = {
  natural: '',
  lake: 'Speak warmly and conversationally with the quiet confidence of an understated spy-thriller narrator. Sound calm and perceptive, with an unhurried cadence, a slightly weathered storyteller quality, and a trace of dry humor.'
};
const characters = {
  default: '',
  feminine: 'Use a natural, feminine voice character.',
  masculine: 'Use a natural, masculine voice character.'
};
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
  const { text, voice, speed, format, locale = 'auto', delivery = 'natural', character = 'default' } = req.body || {};
  if (typeof text !== 'string' || !text.trim() || text.length > 4000 ||
      !voices.has(voice) || !Number.isFinite(speed) || speed < .25 || speed > 3 ||
      !['mp3','pcm'].includes(format)) {
    return res.status(400).json({ error:'Choose a voice and speed, and include up to 4,000 characters per audio segment.' });
  }
  if (typeof locale !== 'string' || !Object.hasOwn(pronunciation, locale) ||
      typeof delivery !== 'string' || !Object.hasOwn(deliveries, delivery) ||
      typeof character !== 'string' || !Object.hasOwn(characters, character)) {
    return res.status(400).json({ error:'Choose an available language or accent, delivery, and voice character.' });
  }
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error:'Lake audio is unavailable on this server.' });
  const controller = new AbortController();
  const cancel = () => { if (!res.writableEnded) controller.abort(); };
  res.once('close', cancel);
  try {
    client ||= new OpenAI({ apiKey:process.env.OPENAI_API_KEY, timeout:60000, maxRetries:0 });
    const accent = locale === 'auto'
      ? (delivery === 'lake' ? 'Give the pronunciation a light, authentic Ukrainian inflection where appropriate. Keep it subtle.' : '')
      : 'Use ' + pronunciation[locale][0].replace(' · ', ' from ') + ' pronunciation where appropriate.';
    const style = [deliveries[delivery], characters[character], accent].filter(Boolean).join(' ');
    const result = await client.audio.speech.create({
      model:process.env.LAKE_AUDIO_MODEL || 'gpt-4o-mini-tts',
      input:text,
      voice,
      speed,
      ...(style && { instructions:style + ' Read the input as written. Do not translate it or add words.' }),
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
