const express = require('express');
const { randomUUID, timingSafeEqual } = require('node:crypto');
const { createProviders, oauthProof, ConnectionError } = require('../confluence/providers');
const { createVault } = require('../confluence/vault');
const { createSource, types, validId } = require('../confluence/source');

const safeOwner = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const text = (value, limit) => typeof value === 'string' && value.length <= limit ? value.trim() : '';
const failure = (code, status) => { throw new ConnectionError(code, status); };
const same = (first, second) => typeof first === 'string' && typeof second === 'string' &&
  first.length === second.length && /^[\w-]+$/.test(first) && timingSafeEqual(Buffer.from(first), Buffer.from(second));
const restricted = [
  { id: 'whatsapp', label: 'Personal WhatsApp', status: 'import_only' },
  { id: 'microsoft', label: 'Microsoft 365', status: 'unavailable' },
  { id: 'sms', label: 'SMS, MMS and RCS', status: 'device_access_required' },
  { id: 'imessage', label: 'iMessage', status: 'unavailable' }
];

function createConfluenceRouter({ authenticate, env = process.env, fetchImpl = fetch, vault = createVault(env, fetchImpl), synthesize } = {}) {
  const router = express.Router();
  const providers = createProviders(env, fetchImpl);
  const source = createSource(vault, env, fetchImpl);
  const secure = env.NODE_ENV === 'production';
  const origin = env.APP_ORIGIN || (!secure ? 'http://localhost:3000' : '');
  const ready = Boolean(origin && vault.enabled);
  const synthesisProviders = synthesize ? ['slack', ...(env.CONFLUENCE_GMAIL_SYNTHESIS === 'true' ? ['gmail'] : [])] : [];
  const refreshes = new Map();
  const cookieOptions = { httpOnly: true, secure, sameSite: 'lax', path: '/' };
  const callback = id => origin + '/connections/oauth/' + id + '/callback';
  const proofCookie = id => (secure ? '__Host-' : '') + 'confluence-' + id;
  const providerFor = (id) => Object.hasOwn(providers, id) ? providers[id] : failure('unknown_provider', 404);
  const audit = (owner, operation, details = {}) => vault.save(owner, 'audit', randomUUID(), {
    operation, time: new Date().toISOString(), authorization: 'lake_account', retained: false, shared: false,
    externalAction: false, outcome: 'success', ...details
  });

  function handle(handler) {
    return (req, res, next) => Promise.resolve().then(() => handler(req, res, next)).catch(error => {
      if (!(error instanceof ConnectionError)) return next(error);
      if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
      res.status(error.status).json({ error: error.code });
    });
  }

  function mark(provider, row) {
    const connection = row?.value;
    const status = connection?.status || (provider.configured && ready ? 'authorization_required' : 'setup_required');
    return { id: provider.id, label: provider.label, status, account: connection?.display || connection?.account, scopes: provider.scopes,
      workspace: connection?.workspace, checkedAt: connection?.checkedAt,
      capabilities: Object.fromEntries(provider.capabilities.map(name => {
        const capabilityStatus = status === 'connected'
          ? (name === 'threads' && provider.id === 'slack' ? 'supported_with_limitations' : 'authenticated')
          : status;
        return [name, capabilityStatus];
      })) };
  }

  async function recordFailure(owner, row, provider, error) {
    if (error.code === 'reauthorization_required' && row) {
      await vault.save(owner, 'connections', provider.id, { ...row.value, status: error.code }, row.version)
        .catch(storageError => { if (storageError.code !== 'concurrent_update') throw storageError; });
    }
  }

  async function active(owner, provider) {
    let row = await vault.get(owner, 'connections', provider.id);
    if (!row || row.value.status !== 'connected') failure(row?.value.status || 'authorization_required', 409);
    if (!row.value.expiresAt || row.value.expiresAt > Date.now() + 30000) return row;
    const key = owner + ':' + provider.id;
    if (!refreshes.has(key)) {
      const refresh = (async () => {
        try {
          if (!row.value.refreshToken) failure('reauthorization_required', 401);
          const updated = await provider.refresh(row.value.refreshToken);
          if (!updated.access_token) failure('reauthorization_required', 401);
          return await vault.save(owner, 'connections', provider.id, {
            ...row.value, token: updated.access_token, refreshToken: updated.refresh_token || row.value.refreshToken,
            expiresAt: updated.expires_in > 0 ? Date.now() + updated.expires_in * 1000 : null
          }, row.version);
        } catch (error) {
          await recordFailure(owner, row, provider, error);
          if (error.code !== 'concurrent_update') throw error;
          const latest = await vault.get(owner, 'connections', provider.id);
          if (latest?.value.status === 'connected' && (!latest.value.expiresAt || latest.value.expiresAt > Date.now())) return latest;
          throw error;
        }
      })().finally(() => refreshes.delete(key));
      refreshes.set(key, refresh);
    }
    row = await refreshes.get(key);
    return row;
  }

  async function withConnection(owner, provider, operation, run) {
    let row;
    const started = await audit(owner, operation, { connection: provider.id, outcome: 'started' });
    try {
      row = await active(owner, provider);
      const result = await run(row.value);
      if ((await vault.get(owner, 'connections', provider.id))?.version !== row.version) failure('connection_changed', 409);
      await vault.save(owner, 'audit', started.id, {
        ...started.value, account: row.value.account, workspace: row.value.workspace, outcome: 'success'
      }, started.version);
      return result;
    } catch (error) {
      await recordFailure(owner, row, provider, error);
      await vault.save(owner, 'audit', started.id, { ...started.value, outcome: 'failed', error: error.code || 'request_failed' }, started.version);
      throw error;
    }
  }

  const wrapEvidence = (provider, connection, result) => {
    const retrievedAt = new Date().toISOString();
    return { ...result, records: result.records.map(record => ({
      ...record, provider: provider.id, account: connection.account, workspace: connection.workspace,
      evidenceId: [provider.id, connection.workspace || connection.account, record.conversation || '', record.id].join(':'),
      retrievedAt, permission: 'read_only', retention: 'ephemeral'
    })) };
  };

  router.use(['/connections', '/api/intelligence/v1'], (_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    next();
  });
  router.get('/connections/catalog', (_req, res) => res.json({
    ready, provider: Object.values(providers).map(item => mark(item)), restricted,
    source: source.enabled ? 'authorization_required' : 'setup_required'
  }));

  router.get('/connections/oauth/:provider/callback', async (req, res) => {
    let destination = 'connection-failed';
    const id = req.params.provider;
    if (!ready || !Object.hasOwn(providers, id)) return res.redirect(303, '/connections.html?status=' + destination);
    const provider = providers[id];
    const name = proofCookie(id);
    const cookie = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(name + '='));
    res.clearCookie(name, cookieOptions);
    try {
      const state = vault.open(cookie?.slice(name.length + 1), 'oauth:' + id);
      if (!safeOwner.test(state.owner) || !same(state.nonce, req.query.state) || !(state.expiresAt > Date.now())) failure('invalid_oauth_state', 400);
      const code = text(req.query.code, 2048);
      if (!code || req.query.error) failure('oauth_denied', 400);
      const started = await audit(state.owner, 'connect', { connection: id, outcome: 'started' });
      try {
        const token = await provider.exchange(code, callback(id), state.verifier);
        if (!token.access_token) failure('oauth_exchange_failed', 502);
        const identity = await provider.identify(token.access_token);
        const previous = await vault.get(state.owner, 'connections', id);
        if (previous && (previous.value.account !== identity.account || previous.value.workspace !== identity.workspace)) {
          destination = 'disconnect-first';
          failure('different_account_already_connected', 409);
        }
        await vault.save(state.owner, 'connections', id, {
          ...identity, token: token.access_token, refreshToken: token.refresh_token || previous?.value.refreshToken || null,
          expiresAt: token.expires_in > 0 ? Date.now() + token.expires_in * 1000 : null, checkedAt: new Date().toISOString(),
          status: 'connected'
        }, previous?.version);
        destination = 'connected';
        await vault.save(state.owner, 'audit', started.id, { ...started.value, retained: true, outcome: 'success' }, started.version);
      } catch (error) {
        await vault.save(state.owner, 'audit', started.id, {
          ...started.value, outcome: 'failed', error: error.code || 'request_failed'
        }, started.version);
      }
    } catch {}
    res.redirect(303, '/connections.html?status=' + destination);
  });

  router.use('/api/intelligence/v1', handle(async (req, _res, next) => {
    if (!source.authenticate(req.get('authorization'))) failure('source_unauthorized', 401);
    if (!await source.permission(source.owner)) failure('source_paused', 403);
    req.sourceOwner = source.owner;
    next();
  }));
  router.get('/api/intelligence/v1/health', (req, res) => res.json({ schema_version: 1, system: 'great-lake', status: 'authorized' }));
  router.get('/api/intelligence/v1/context', handle(async (req, res) => {
    const type = text(req.query.type, 24);
    const query = text(req.query.q, 200);
    if ((req.query.type && !types.includes(type)) || (req.query.q && !query)) failure('invalid_context_query', 400);
    const records = await source.context(req.sourceOwner, type, query);
    await audit(req.sourceOwner, 'provide_context', { connection: 'source', authorization: 'source_service', shared: true });
    res.json({ schema_version: 1, records });
  }));
  router.post('/api/intelligence/v1/observations', handle(async (req, res) => {
    const result = await source.receive(req.sourceOwner, req.body);
    await audit(req.sourceOwner, 'receive_observation', { connection: 'source', authorization: 'source_service', retained: true });
    res.status(result.result === 'created' ? 201 : 200).json({ schema_version: 1, ...result });
  }));

  router.use('/connections', authenticate);
  router.use('/connections', (req, res, next) => {
    if (!safeOwner.test(req.lakeAccount?.id || '')) return res.status(401).json({ error: 'sign_in_required' });
    if (!ready) return res.status(503).json({ error: 'storage_not_configured' });
    if (req.method !== 'GET' && (req.get('origin') !== origin || !req.is('application/json'))) {
      return res.status(403).json({ error: 'same_origin_required' });
    }
    req.owner = req.lakeAccount.id;
    next();
  });

  router.get('/connections', handle(async (req, res) => {
    const rows = await vault.list(req.owner, 'connections');
    const paired = source.enabled && req.owner === source.owner;
    res.json({
      provider: Object.values(providers).map(item => mark(item, rows.find(row => row.id === item.id))),
      restricted, synthesisProviders,
      source: { status: !paired ? 'setup_required' : await source.permission(req.owner) ? 'authorized' : 'paused',
        outbound: paired && source.outboundEnabled }
    });
  }));
  router.post('/connections/oauth/:provider', handle(async (req, res) => {
    const provider = providerFor(req.params.provider);
    if (!provider.configured) failure('provider_not_configured', 503);
    const nonce = oauthProof();
    const verifier = oauthProof();
    const state = vault.seal({ nonce, verifier, owner: req.owner, expiresAt: Date.now() + 600000 }, 'oauth:' + provider.id);
    res.cookie(proofCookie(provider.id), state, { ...cookieOptions, maxAge: 600000 });
    res.json({ url: provider.authorization(nonce, callback(provider.id), verifier).toString() });
  }));
  router.post('/connections/provider/:provider/test', handle(async (req, res) => {
    const provider = providerFor(req.params.provider);
    const identity = await withConnection(req.owner, provider, 'test', connection => provider.identify(connection.token));
    res.json({ ok: true, ...identity });
  }));
  router.post('/connections/provider/:provider/pause', handle(async (req, res) => {
    const provider = providerFor(req.params.provider);
    const row = await vault.get(req.owner, 'connections', provider.id);
    if (!row) failure('authorization_required', 409);
    if (typeof req.body.paused !== 'boolean') failure('invalid_pause', 400);
    if (!['connected', 'paused'].includes(row.value.status)) failure(row.value.status, 409);
    await vault.save(req.owner, 'connections', provider.id, { ...row.value, status: req.body.paused ? 'paused' : 'connected' }, row.version);
    await audit(req.owner, req.body.paused ? 'pause' : 'resume', { connection: provider.id, retained: true });
    res.json({ ok: true });
  }));
  router.post('/connections/provider/:provider/disconnect', handle(async (req, res) => {
    const provider = providerFor(req.params.provider);
    const row = await vault.get(req.owner, 'connections', provider.id);
    if (!row) return res.json({ ok: true, revocation: 'already_disconnected' });
    await vault.remove(req.owner, 'connections', provider.id, row.version);
    let revocation = 'confirmed';
    try { await provider.revoke(row.value); } catch { revocation = 'unconfirmed'; }
    await audit(req.owner, 'disconnect', { connection: provider.id, externalAction: true, outcome: revocation });
    res.json({ ok: true, revocation });
  }));
  router.post('/connections/provider/:provider/search', handle(async (req, res) => {
    const provider = providerFor(req.params.provider);
    const query = text(req.body.query, 500);
    const cursor = text(req.body.cursor, 2048);
    if (!query || (req.body.cursor && !cursor)) failure('invalid_search', 400);
    const result = await withConnection(req.owner, provider, 'search', async connection =>
      wrapEvidence(provider, connection, await provider.search(connection, query, cursor)));
    res.json(result);
  }));
  router.post('/connections/provider/:provider/thread', handle(async (req, res) => {
    const provider = providerFor(req.params.provider);
    const id = text(req.body.threadId, 200);
    const cursor = text(req.body.cursor, 2048);
    if (!id || (req.body.cursor && !cursor)) failure('invalid_thread', 400);
    const result = await withConnection(req.owner, provider, 'thread', async connection =>
      wrapEvidence(provider, connection, await provider.thread(connection, id, cursor)));
    res.json(result);
  }));
  router.get('/connections/gmail/labels', handle(async (req, res) => {
    const labels = await withConnection(req.owner, providers.gmail, 'labels', connection => providers.gmail.labels(connection));
    res.json({ labels });
  }));
  router.post('/connections/gmail/attachment', handle(async (req, res) => {
    const message = text(req.body.message, 200);
    const attachment = text(req.body.attachment, 2048);
    if (!/^[\w-]+$/.test(message) || !/^[\w-]+$/.test(attachment)) failure('invalid_attachment', 400);
    const file = await withConnection(req.owner, providers.gmail, 'attachment', connection =>
      providers.gmail.attachment(connection, message, attachment));
    res.attachment(file.name);
    res.set('Content-Type', 'application/octet-stream');
    res.send(file.bytes);
  }));

  router.post('/connections/investigate', handle(async (req, res) => {
    const question = text(req.body.question, 2500);
    const queries = req.body.queries;
    if (!question || !Array.isArray(queries) || !queries.length || queries.length > 2) failure('invalid_investigation', 400);
    const plans = queries.map(item => {
      const query = text(item?.query, 500);
      if (!query) failure('invalid_search', 400);
      return { query, provider: providerFor(item.provider) };
    });
    if (new Set(plans.map(plan => plan.provider.id)).size !== plans.length) failure('duplicate_provider', 400);
    const searched = await Promise.all(plans.map(async ({ query, provider }) => {
      try {
        const operation = req.body.includeThreads === true ? 'investigate_search_and_thread' : 'investigate_search';
        const result = await withConnection(req.owner, provider, operation, async connection => {
          const pages = [];
          let cursor;
          for (let page = 0; page < 2; page++) {
            const result = wrapEvidence(provider, connection, await provider.search(connection, query, cursor));
            pages.push(result);
            cursor = result.cursor;
            if (!cursor) break;
          }
          const threadId = req.body.includeThreads === true && pages.flatMap(page => page.records).find(record => record.threadId)?.threadId;
          let thread = null;
          if (threadId) {
            try {
              const detail = wrapEvidence(provider, connection, await provider.thread(connection, threadId));
              thread = { id: threadId, records: detail.records, more: Boolean(detail.cursor), limits: detail.limits };
            } catch (error) {
              thread = { id: threadId, records: [], error: error.code || 'request_failed' };
            }
          }
          return { pages, cursor, thread, account: connection.account, workspace: connection.workspace };
        });
        const { records: threadRecords, ...threadCoverage } = result.thread || {};
        return {
          coverage: { provider: provider.id, query, account: result.account, workspace: result.workspace,
            pages: result.pages.length, more: Boolean(result.cursor), cursor: result.cursor || null,
            thread: result.thread ? { ...threadCoverage, messages: threadRecords.length } : null,
            limits: [...new Set(result.pages.flatMap(page => page.limits))] },
          records: [...(threadRecords || []), ...result.pages.flatMap(page => page.records)]
        };
      } catch (error) {
        return { coverage: { provider: provider.id, query, pages: 0, error: error.code || 'request_failed' }, records: [] };
      }
    }));
    const coverage = searched.map(result => result.coverage);
    const evidence = new Map();
    for (let index = 0; index < Math.max(...searched.map(result => result.records.length)); index++) {
      for (const result of searched) {
        const item = result.records[index];
        if (item && !evidence.has(item.evidenceId)) evidence.set(item.evidenceId, item);
      }
    }
    const records = Array.from(evidence.values()).slice(0, 40);
    let answer = null;
    let synthesisError = null;
    if (req.body.analyze === true && plans.some(({ provider }) => !synthesisProviders.includes(provider.id))) {
      synthesisError = 'synthesis_source_disabled';
    } else if (req.body.analyze === true && synthesize && records.length) {
      const entry = await audit(req.owner, 'investigation_synthesis', { connection: 'openai', shared: true, outcome: 'started' });
      try {
        answer = await synthesize({ question, coverage: coverage.map(({ cursor, ...item }) => item),
          records, truncated: records.length < evidence.size });
      } catch { synthesisError = 'analysis_unavailable'; }
      await vault.save(req.owner, 'audit', entry.id, { ...entry.value, outcome: synthesisError || 'success' }, entry.version);
    }
    res.json({ records, coverage, answer, synthesisError, truncated: records.length < evidence.size });
  }));

  router.get('/connections/audit', handle(async (req, res) => {
    const offset = Number(req.query.offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) failure('invalid_offset', 400);
    const rows = await vault.list(req.owner, 'audit', 31, offset);
    res.json({ entries: rows.slice(0, 30).map(row => row.value), next: rows.length > 30 ? offset + 30 : null });
  }));

  router.use('/connections/source', (req, res, next) => {
    if (!source.enabled || req.owner !== source.owner) return res.status(503).json({ error: 'source_pairing_not_configured' });
    next();
  });
  router.get('/connections/source', handle(async (req, res) => {
    const [enabled, shared, received] = await Promise.all([
      source.permission(req.owner), source.context(req.owner), source.retained(req.owner)
    ]);
    res.json({ enabled, shared, received });
  }));
  router.post('/connections/source/permission', handle(async (req, res) => {
    if (typeof req.body.enabled !== 'boolean') failure('invalid_permission', 400);
    await source.setPermission(req.owner, req.body.enabled);
    await audit(req.owner, req.body.enabled ? 'enable_source' : 'revoke_source', { connection: 'source', retained: true });
    res.json({ ok: true });
  }));
  router.post('/connections/source/publish', handle(async (req, res) => {
    const record = await source.localRecord(req.owner, req.body);
    await audit(req.owner, 'stage_context', { connection: 'source', retained: true });
    res.status(201).json({ record });
  }));
  router.post('/connections/source/test', handle(async (req, res) => {
    if (!await source.permission(req.owner)) failure('source_paused', 403);
    const response = await source.peer('health');
    if (response.schema_version !== 1 || response.system !== 'source' || response.status !== 'authorized') {
      failure('source_invalid_response', 502);
    }
    await audit(req.owner, 'test_source', { connection: 'source' });
    res.json({ ok: true });
  }));
  router.post('/connections/source/records/:bucket/:id/remove', handle(async (req, res) => {
    const { bucket, id } = req.params;
    if (!['shared', 'received'].includes(bucket) || !validId.test(id)) failure('invalid_record', 400);
    const name = 'source-' + bucket;
    const row = await vault.get(req.owner, name, id);
    if (row && bucket === 'shared') {
      await vault.save(req.owner, name, id, { record_id: id, supersedes: row.value.supersedes, withdrawn: true }, row.version);
    }
    if (row && bucket === 'received') {
      await vault.save(req.owner, name, id, { withdrawn: true }, row.version);
    }
    await audit(req.owner, 'remove_intelligence', { connection: 'source' });
    res.json({ ok: true });
  }));
  router.post('/connections/source/review/:id', handle(async (req, res) => {
    const result = await source.review(req.owner, req.params.id, req.body);
    await audit(req.owner, 'review_intelligence', { connection: 'source', retained: true });
    res.json(result);
  }));
  router.post('/connections/source/pull', handle(async (req, res) => {
    if (!await source.permission(req.owner)) failure('source_paused', 403);
    const query = text(req.body.query, 200);
    if (req.body.query && !query) failure('invalid_context_query', 400);
    const params = new URLSearchParams(query ? { q: query } : {});
    const data = await source.peer('context?' + params);
    if (data.schema_version !== 1 || !Array.isArray(data.records) || data.records.length > 100) failure('source_invalid_response', 502);
    const results = [];
    for (const record of data.records) {
      if (!await source.permission(req.owner)) failure('source_paused', 403);
      try { results.push(await source.receive(req.owner, record)); }
      catch (error) { results.push({ result: 'failed', error: error.code || 'request_failed' }); }
    }
    await audit(req.owner, 'pull_source', { connection: 'source', retained: results.some(item => ['created', 'updated'].includes(item.result)), shared: Boolean(query) });
    res.json({ results });
  }));
  router.post('/connections/source/push/:id', handle(async (req, res) => {
    if (!await source.permission(req.owner)) failure('source_paused', 403);
    const record = (await source.context(req.owner)).find(item => item.record_id === req.params.id);
    if (!record) failure('record_unavailable', 404);
    const entry = await audit(req.owner, 'send_context', { connection: 'source', shared: true, externalAction: true, outcome: 'started' });
    try {
      const data = await source.peer('observations', record);
      if (data.schema_version !== 1 || data.record_id !== record.record_id || !['created', 'updated', 'duplicate'].includes(data.result)) {
        failure('source_invalid_response', 502);
      }
      await vault.save(req.owner, 'audit', entry.id, { ...entry.value, outcome: data.result }, entry.version);
      res.json({ result: data.result });
    } catch (error) {
      await vault.save(req.owner, 'audit', entry.id, { ...entry.value, outcome: 'failed', error: error.code || 'request_failed' }, entry.version);
      throw error;
    }
  }));

  return router;
}

module.exports = { createConfluenceRouter };
