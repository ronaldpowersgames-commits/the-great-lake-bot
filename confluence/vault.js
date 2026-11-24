const { createCipheriv, createDecipheriv, randomBytes, randomUUID } = require('node:crypto');
const { ConnectionError } = require('./providers');

function createVault(env = process.env, fetchImpl = fetch) {
  const key = Buffer.from(env.CONFLUENCE_ENCRYPTION_KEY || '', 'base64url');
  const enabled = Boolean(key.length === 32 && env.SUPABASE_URL && env.CONFLUENCE_SUPABASE_SECRET);
  function seal(value, context) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(context));
    const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64url');
  }
  function open(value, context) {
    const data = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]));
  }
  const context = (owner, bucket, id) => JSON.stringify([owner, bucket, id]);
  async function request(owner, bucket, { method = 'GET', id, version, body, limit = 100, offset = 0 } = {}) {
    if (!enabled) throw new ConnectionError('storage_not_configured', 503);
    const url = new URL('/rest/v1/lake_confluence', env.SUPABASE_URL);
    if (method !== 'POST') {
      url.searchParams.set('owner', 'eq.' + owner);
      url.searchParams.set('bucket', 'eq.' + bucket);
    }
    if (id) url.searchParams.set('id', 'eq.' + id);
    if (version) url.searchParams.set('version', 'eq.' + version);
    if (method === 'GET') {
      url.searchParams.set('order', 'created_at.desc,id.asc');
      url.searchParams.set('limit', limit);
      url.searchParams.set('offset', offset);
    }
    try {
      const secret = env.CONFLUENCE_SUPABASE_SECRET;
      const response = await fetchImpl(url, {
        method,
        headers: { apikey: secret, ...(!secret.startsWith('sb_secret_') && { Authorization: 'Bearer ' + secret }),
          'Content-Type': 'application/json', Prefer: 'return=representation' },
        ...(body && { body: JSON.stringify(body) }),
        redirect: 'error', signal: AbortSignal.timeout(10000)
      });
      if (response.status === 409) throw new ConnectionError('concurrent_update', 409);
      if (!response.ok) throw new ConnectionError('storage_unavailable', 503);
      return await response.json();
    } catch (error) {
      if (error instanceof ConnectionError) throw error;
      throw new ConnectionError('storage_unavailable', 503);
    }
  }
  function decode(owner, bucket, row) {
    if (!row) return null;
    return { id: row.id, version: row.version, value: open(row.sealed, context(owner, bucket, row.id)) };
  }
  return {
    enabled, seal, open,
    async get(owner, bucket, id) {
      return decode(owner, bucket, (await request(owner, bucket, { id }))[0]);
    },
    async list(owner, bucket, limit, offset) {
      return (await request(owner, bucket, { limit, offset })).map(row => decode(owner, bucket, row));
    },
    async save(owner, bucket, id, value, previous) {
      const version = randomUUID();
      const sealed = seal(value, context(owner, bucket, id));
      const rows = await request(owner, bucket, previous
        ? { method: 'PATCH', id, version: previous, body: { version, sealed } }
        : { method: 'POST', body: { owner, bucket, id, version, sealed } });
      if (!rows.length) throw new ConnectionError('concurrent_update', 409);
      return decode(owner, bucket, rows[0]);
    },
    async remove(owner, bucket, id, version) {
      const rows = await request(owner, bucket, { method: 'DELETE', id, version });
      if (version && !rows.length) throw new ConnectionError('concurrent_update', 409);
    }
  };
}

module.exports = { createVault };
