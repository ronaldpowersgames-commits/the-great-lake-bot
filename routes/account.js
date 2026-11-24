// Supabase email OTP accounts. Tokens stay in HttpOnly cookies, never browser storage.
const express = require('express');
const rateLimit = require('express-rate-limit');
const { randomBytes, createHash } = require('node:crypto');

function createAccountRouter({ url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY,
  appOrigin = process.env.APP_ORIGIN, secure = process.env.NODE_ENV === 'production', fetchImpl = fetch } = {}) {
  const router = express.Router();
  const enabled = Boolean(url && key);
  const prefix = secure ? '__Host-lake-' : 'lake-';
  const names = { access: prefix + 'access', refresh: prefix + 'refresh', remember: prefix + 'remember' };
  const pendingName = prefix + 'pending';
  // Lax is required when following a link from the external mail/provider site.
  const pendingOptions = { httpOnly: true, secure, sameSite: 'lax', path: '/' };
  const origin = appOrigin || (!secure ? 'http://localhost:3000' : null);
  const lifetime = 30 * 86400 * 1000;
  const cookieOptions = { httpOnly: true, secure, sameSite: 'strict', path: '/' };
  function cookies(req) {
    const result = {};
    for (const item of (req.headers.cookie || '').split(';')) {
      const index = item.indexOf('=');
      if (index < 0) continue;
      try { result[item.slice(0, index).trim()] = decodeURIComponent(item.slice(index + 1)); } catch {}
    }
    return result;
  }
  function clear(res) { Object.values(names).forEach(name => res.clearCookie(name, cookieOptions)); res.clearCookie(pendingName, pendingOptions); }
  function clearConnectorProof(res) {
    for (const provider of ['gmail', 'slack', 'instagram', 'facebook']) {
      res.clearCookie((secure ? '__Host-' : '') + 'confluence-' + provider, pendingOptions);
    }
  }
  function save(res, session, remember) {
    if (!session.access_token || !session.refresh_token) throw new Error('Invalid session');
    const options = remember ? { ...cookieOptions, maxAge: lifetime } : cookieOptions;
    res.cookie(names.access, session.access_token, options);
    res.cookie(names.refresh, session.refresh_token, options);
    res.cookie(names.remember, remember ? '1' : '0', options);
  }
  function publicUser(user) {
    if (!user?.id || !user.email || !user.email_confirmed_at) throw new Error('Unverified account');
    return { id: user.id, email: user.email, name: String(user.user_metadata?.name || user.email.split('@')[0]).slice(0, 100), authMode: 'cloud', guest: false };
  }
  async function request(endpoint, body, token) {
    const response = await fetchImpl(url.replace(/\/$/, '') + '/auth/v1/' + endpoint, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
    const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error('Account request failed');
      error.status = response.status;
      const providerCode = data.error_code || data.code;
      error.providerCode = typeof providerCode === 'string' && /^[a-z0-9_]{1,100}$/i.test(providerCode) ? providerCode : 'unspecified';
      throw error;
    }
    return data;
  }
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/config', (_req, res) => res.json({ enabled }));
  router.use((req, res, next) => {
    if (!enabled) return res.status(503).json({ error: 'Email sign-in is not configured yet. You can still use this device locally.' });
    if (req.method !== 'GET') {
      // Reject cross-origin cookie operations, including login CSRF. Never trust Host headers.
      const expected = origin;
      if (!expected || req.headers.origin !== expected || !req.is('application/json')) {
        return res.status(403).json({ error: 'Open The Lake directly and try again.' });
      }
    }
    next();
  });
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Please wait before trying again.' } });
  router.post('/link', limiter, async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 100) : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    try {
      await request('otp?redirect_to=' + encodeURIComponent(origin + '/account/callback'), {
        email, create_user: true, data: { name }, code_challenge: challenge, code_challenge_method: 's256'
      });
      res.cookie(pendingName, JSON.stringify({ verifier, remember: req.body.remember === true, created: Date.now() }),
        { ...pendingOptions, maxAge: 60 * 60 * 1000 });
      res.json({ ok: true });
    } catch (error) {
      console.info('Account email delivery failed:', error.status || 'network', error.providerCode || 'unavailable');
      const limited = error.status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit'].includes(error.providerCode);
      const unauthorized = ['email_address_not_authorized', 'email_address_not_allowed'].includes(error.providerCode);
      const message = limited
        ? 'Supabase has temporarily limited email sending. Its built-in sender allows only two emails per hour per project. Stop retrying until the allowance resets, or configure custom SMTP.'
        : unauthorized
          ? 'Supabase did not authorize this recipient. The default sender only emails project team members; other users need custom SMTP.'
          : 'Could not send the sign-in link. Email delivery failed; check Supabase Auth logs before retrying. This does not mean your email address is unauthorized.';
      res.status(limited ? 429 : 502).json({ error: message, code: error.providerCode || 'delivery_unavailable' });
    }
  });
  router.get('/callback', limiter, async (req, res) => {
    res.set('Referrer-Policy', 'no-referrer');
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    let pending;
    try { pending = JSON.parse(cookies(req)[pendingName] || 'null'); } catch {}
    const age = Date.now() - pending?.created;
    const validProof = /^[A-Za-z0-9_-]{43}$/.test(pending?.verifier || '') && Number.isFinite(age) && age >= 0 && age <= 60 * 60 * 1000;
    if (!validProof) {
      console.info('Account callback: missing or expired browser proof.');
      res.clearCookie(pendingName, pendingOptions);
      return res.redirect(303, '/connections.html?status=sign-in-browser-required');
    }
    if (req.query.error || !code || code.length > 1024) {
      console.info('Account callback: missing code or provider rejected the link.');
      return res.redirect(303, '/connections.html?status=sign-in-failed');
    }
    try {
      const session = await request('token?grant_type=pkce', { auth_code: code, code_verifier: pending.verifier });
      publicUser(session.user);
      clearConnectorProof(res);
      save(res, session, pending.remember === true);
      res.clearCookie(pendingName, pendingOptions);
      console.info('Account callback: verified session created.');
      return res.redirect(303, '/connections.html?status=signed-in');
    } catch (error) {
      // Categories only: never log callback codes, tokens, emails or response bodies.
      console.info('Account callback failed:', error.status || 'local-validation', error.providerCode || error.message);
      return res.redirect(303, '/connections.html?status=sign-in-failed');
    }
  });
  router.post('/code', limiter, async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 100) : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    try {
      await request('otp', { email, create_user: true, data: { name } });
      res.json({ ok: true });
    } catch (error) {
      res.status(error.status === 429 ? 429 : 502).json({ error: 'Could not send a code. Please wait and try again. Email delivery must be configured for this address.' });
    }
  });
  router.post('/verify', limiter, async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6,10}$/.test(code)) return res.status(400).json({ error: 'Enter your email and the code from your inbox.' });
    try {
      const session = await request('verify', { email, token: code, type: 'email' });
      const user = publicUser(session.user);
      clearConnectorProof(res);
      save(res, session, req.body.remember === true);
      res.json({ user });
    } catch (error) {
      res.status(error.status === 429 ? 429 : error.status >= 500 || !error.status ? 502 : 401)
        .json({ error: 'Could not verify that code. Check it or request a new one.' });
    }
  });
  async function loadSession(req, res) {
    const stored = cookies(req);
    if (!stored[names.access] && !stored[names.refresh]) return null;
    try {
      if (stored[names.access]) {
        try { return publicUser(await request('user', undefined, stored[names.access])); }
        catch (error) { if (![401, 403].includes(error.status)) throw error; }
      }
      if (!stored[names.refresh]) { clear(res); clearConnectorProof(res); return null; }
      const session = await request('token?grant_type=refresh_token', { refresh_token: stored[names.refresh] });
      const user = publicUser(session.user);
      save(res, session, stored[names.remember] === '1');
      return user;
    } catch (error) {
      if ([400, 401, 403].includes(error.status)) { clear(res); clearConnectorProof(res); return null; }
      throw error;
    }
  }
  router.useSession = async (req, res, next) => {
    try {
      req.lakeAccount = enabled ? await loadSession(req, res) : null;
      next();
    } catch {
      res.status(503).json({ error: 'account_session_unavailable' });
    }
  };
  router.get('/session', async (req, res) => {
    try { res.json({ user: await loadSession(req, res) }); }
    catch {
      res.status(503).json({ error: 'Cannot check your account right now. Try again or use local-only mode.' });
    }
  });
  router.post('/logout', async (req, res) => {
    const stored = cookies(req);
    try { if (stored[names.access]) await request('logout?scope=local', {}, stored[names.access]); }
    catch { /* Local credentials must be removed even during a provider outage. */ }
    clear(res);
    clearConnectorProof(res);
    res.json({ ok: true });
  });
  return router;
}
module.exports = { createAccountRouter };
