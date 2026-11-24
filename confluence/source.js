const { createHash, timingSafeEqual, randomUUID } = require('node:crypto');
const { ConnectionError } = require('./providers');

const types = ['preference', 'goal', 'boundary', 'priority', 'decision', 'observation', 'outcome', 'correction'];
const reviewStates = ['unreviewed', 'confirmed', 'rejected', 'superseded'];
const MAX_CONTEXT = 100;
const validId = /^[\w-]{1,128}$/;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const digest = value => createHash('sha256').update(value).digest();
const timestamp = value => typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null;
const short = (value, max = 2000) => typeof value === 'string' && value.length <= max ? value.trim() : '';
const list = (value, maxLength) => Array.isArray(value) && value.length <= 10 ? value.map(item => short(item, maxLength)).filter(Boolean) : [];

function normalizeRecord(input, system, workspace) {
  const type = input?.record_type;
  const references = input?.evidence_references;
  const created = timestamp(input?.created_at);
  const updated = timestamp(input?.updated_at);
  if (input?.schema_version !== 1 || input.origin_system !== system || input.origin_workspace !== workspace ||
      !validId.test(input.record_id || '') || !types.includes(type) || !short(input.subject, 200) ||
      !created || !updated || updated < created || !short(input.observation) || !Array.isArray(references) || references.length > 15 ||
      !Array.isArray(input.allowed_destinations) || !input.allowed_destinations.includes(system === 'source' ? 'great-lake' : 'source') ||
      !['shareable', 'restricted'].includes(input.sensitivity) || input.retention_policy !== 'until_revoked' ||
      (input.supersedes != null && (!validId.test(input.supersedes) || input.supersedes === input.record_id))) {
    throw new ConnectionError('invalid_intelligence_record', 400);
  }
  const evidence = references.map(ref => {
    if (!short(ref?.origin_system, 128) || !short(ref?.record_id, 256)) throw new ConnectionError('invalid_evidence_reference', 400);
    let url = null;
    if (ref.url) {
      try { const candidate = new URL(ref.url); if (candidate.protocol === 'https:' && !candidate.username && !candidate.password) url = candidate.toString(); } catch {}
      if (!url || url.length > 2048) throw new ConnectionError('invalid_evidence_reference', 400);
    }
    return { origin_system: ref.origin_system, origin_workspace: short(ref.origin_workspace, 128) || null,
      record_id: ref.record_id, timestamp: timestamp(ref.timestamp), url };
  });
  if (system === 'source' && !evidence.length) throw new ConnectionError('source_evidence_required', 400);
  if (input.confidence != null && (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)) {
    throw new ConnectionError('invalid_intelligence_confidence', 400);
  }
  return {
    schema_version: 1, record_id: input.record_id, record_type: type, origin_system: system, origin_workspace: workspace,
    subject: short(input.subject, 200), observation: short(input.observation), evidence_references: evidence,
    user_stated_facts: list(input.user_stated_facts, 600), interpretation: short(input.interpretation) || null,
    alternative_explanations: list(input.alternative_explanations, 600),
    confidence: input.confidence ?? null, relevance: short(input.relevance, 600) || null, created_at: created,
    observed_at: timestamp(input.observed_at), updated_at: updated, supersedes: input.supersedes ?? null,
    user_review_status: reviewStates.includes(input.user_review_status) ? input.user_review_status : 'unreviewed',
    sensitivity: input.sensitivity, allowed_destinations: [system === 'source' ? 'great-lake' : 'source'],
    retention_policy: 'until_revoked'
  };
}

function createSource(vault, env = process.env, fetchImpl = fetch) {
  const owner = env.CONFLUENCE_SOURCE_OWNER;
  const workspace = env.CONFLUENCE_SOURCE_WORKSPACE;
  const incoming = env.CONFLUENCE_SOURCE_INBOUND_TOKEN;
  const outgoing = env.CONFLUENCE_SOURCE_OUTBOUND_TOKEN;
  const enabled = Boolean(vault.enabled && uuid.test(owner || '') && validId.test(workspace || '') && incoming?.length >= 43);
  let remote;
  try {
    const url = new URL(env.CONFLUENCE_SOURCE_URL);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash) remote = url.toString().replace(/\/$/, '');
  } catch {}
  const outboundEnabled = Boolean(remote && outgoing?.length >= 43 && outgoing !== incoming);
  function authenticate(header) {
    return enabled && typeof header === 'string' && timingSafeEqual(digest(header), digest('Bearer ' + incoming));
  }
  async function permission(user) {
    return (await vault.get(user, 'source-control', 'pairing'))?.value.enabled === true;
  }
  async function setPermission(user, allowed) {
    const current = await vault.get(user, 'source-control', 'pairing');
    return vault.save(user, 'source-control', 'pairing', { enabled: allowed }, current?.version);
  }
  async function ensureCapacity(user, bucket) {
    if ((await vault.list(user, bucket, 1, MAX_CONTEXT - 1)).length) throw new ConnectionError('intelligence_capacity_reached', 409);
  }
  async function localRecord(user, input) {
    const now = new Date().toISOString();
    if (!['preference', 'goal', 'boundary', 'priority', 'decision', 'correction'].includes(input?.record_type)) {
      throw new ConnectionError('invalid_context_type', 400);
    }
    const record = normalizeRecord({ ...input, schema_version: 1, record_id: randomUUID(),
      origin_system: 'great-lake', origin_workspace: user, created_at: now, updated_at: now, observed_at: now,
      user_review_status: 'confirmed', evidence_references: [], sensitivity: 'shareable', allowed_destinations: ['source'],
      retention_policy: 'until_revoked' }, 'great-lake', user);
    if (record.supersedes && !(await context(user)).some(current => current.record_id === record.supersedes)) {
      throw new ConnectionError('invalid_superseded_record', 400);
    }
    await ensureCapacity(user, 'source-shared');
    await vault.save(user, 'source-shared', record.record_id, record);
    return record;
  }
  async function context(user, type, query) {
    const rows = (await vault.list(user, 'source-shared', MAX_CONTEXT)).map(row => row.value);
    const replaced = new Set(rows.map(record => record.supersedes).filter(Boolean));
    return rows.filter(record => !record.withdrawn && !replaced.has(record.record_id) &&
      (!type || record.record_type === type) &&
      (!query || (record.subject + ' ' + record.observation).toLowerCase().includes(query.toLowerCase())));
  }
  async function receive(user, input) {
    const record = normalizeRecord(input, 'source', workspace);
    if (record.sensitivity !== 'shareable') throw new ConnectionError('restricted_intelligence', 403);
    const previous = await vault.get(user, 'source-received', record.record_id);
    if (previous?.value.withdrawn) throw new ConnectionError('intelligence_withdrawn', 409);
    if (!previous) await ensureCapacity(user, 'source-received');
    if (previous) {
      const existing = previous.value.record;
      if (existing.updated_at > record.updated_at) throw new ConnectionError('stale_intelligence_record', 409);
      if (existing.updated_at === record.updated_at) {
        if (JSON.stringify(existing) !== JSON.stringify(record)) throw new ConnectionError('conflicting_intelligence_record', 409);
        return { record_id: record.record_id, result: 'duplicate' };
      }
      if (existing.created_at !== record.created_at) throw new ConnectionError('origin_created_at_changed', 409);
    }
    const priorReview = previous?.value.review;
    const review = priorReview && ['rejected', 'superseded'].includes(priorReview.status) ? priorReview : null;
    await vault.save(user, 'source-received', record.record_id, { record, review }, previous?.version);
    return { record_id: record.record_id, result: previous ? 'updated' : 'created' };
  }
  async function review(user, id, input) {
    if (!validId.test(id)) throw new ConnectionError('invalid_record', 400);
    const current = await vault.get(user, 'source-received', id);
    if (!current || current.value.withdrawn) throw new ConnectionError('record_unavailable', 404);
    const note = short(input.note);
    if (!['confirmed', 'rejected', 'superseded'].includes(input.status) || (input.status === 'superseded' && !note)) {
      throw new ConnectionError('invalid_review', 400);
    }
    const value = { ...current.value, review: { status: input.status, note, reviewed_at: new Date().toISOString() } };
    await vault.save(user, 'source-received', id, value, current.version);
    return value;
  }
  async function retained(user) {
    const rows = await vault.list(user, 'source-received', MAX_CONTEXT);
    return rows.map(row => row.value).filter(value => !value.withdrawn);
  }
  async function peer(path, data) {
    if (!outboundEnabled) throw new ConnectionError('source_endpoint_not_configured', 503);
    const response = await fetchImpl(remote + '/api/intelligence/v1/' + path, {
      method: data ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + outgoing, 'Content-Type': 'application/json' },
      ...(data && { body: JSON.stringify(data) }), redirect: 'error', signal: AbortSignal.timeout(12000)
    }).catch(() => { throw new ConnectionError('source_unreachable'); });
    if (!response.ok) throw new ConnectionError('source_request_failed', response.status === 429 ? 429 : 502);
    return response.json().catch(() => { throw new ConnectionError('source_invalid_response'); });
  }
  return { owner, workspace, enabled, outboundEnabled, authenticate, permission, setPermission, localRecord, context, receive, review, retained, peer };
}

module.exports = { createSource, types, validId };
