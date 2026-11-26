const express = require('express');
const { createVault } = require('../confluence/vault');

const bucket = 'lake-sync';
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const digest = /^[a-f0-9]{64}$/;
const key = /^(?:tide:[a-z0-9_-]{1,180}|value:[a-z0-9]{1,80}|folders|portable)$/i;
const maxEntries = 10000;
const batchSize = 8;
// 256 KiB of binary data per part, encoded as base64 for the JSON transport.
const maxPartLength = 349528;

function validEntries(entries) {
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return false;
  const items = Object.entries(entries);
  return items.length <= maxEntries && items.every(([name, ref]) => key.test(name) &&
    (ref === null || ref && digest.test(ref.hash) && Array.isArray(ref.parts) &&
      ref.parts.length >= 1 && ref.parts.length <= 1024 && ref.parts.every(id => typeof id === 'string' && uuid.test(id))));
}

const partIds = entries => new Set(Object.values(entries).flatMap(ref => ref?.parts || []));

function createLakeSyncRouter(vault = createVault()) {
  const router = express.Router();
  const handle = operation => async (req, res) => {
    const owner = req.lakeAccount?.id;
    if (!owner || !uuid.test(owner) || req.get('X-Lake-Account') !== owner) {
      return res.status(401).json({ error: 'Sign in to sync your Lake.' });
    }
    if (!vault.enabled) return res.status(503).json({ error: 'Lake sync storage is unavailable.' });
    try { await operation(req, res, owner); }
    catch (error) {
      if (error.status === 409) return res.status(409).json({ error: 'The account Lake changed. Sync will retry.' });
      res.status(503).json({ error: 'Lake sync storage could not complete the request. Try again.' });
    }
  };

  router.get('/', handle(async (_req, res, owner) => {
    const row = await vault.get(owner, bucket, 'head');
    res.json({ version: row?.version || null, entries: row?.value.entries || {} });
  }));

  router.post('/parts', handle(async (req, res, owner) => {
    const parts = req.body.parts;
    if (!Array.isArray(parts) || parts.length < 1 || parts.length > batchSize ||
        parts.some(part => !part || typeof part.id !== 'string' || !uuid.test(part.id) ||
          typeof part.data !== 'string' || part.data.length > maxPartLength ||
          (part.data !== '' && (part.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(part.data))))) {
      return res.status(400).json({ error: 'Invalid Lake sync data part.' });
    }
    await Promise.all(parts.map(async ({ id, data }) => {
      try { await vault.save(owner, bucket, id, { data }); }
      catch (error) {
        if (error.status !== 409 || (await vault.get(owner, bucket, id))?.value.data !== data) throw error;
      }
    }));
    res.json({ ok: true });
  }));

  router.post('/read', handle(async (req, res, owner) => {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > batchSize ||
        ids.some(id => typeof id !== 'string' || !uuid.test(id))) {
      return res.status(400).json({ error: 'Invalid Lake sync part request.' });
    }
    const rows = await Promise.all(ids.map(id => vault.get(owner, bucket, id)));
    if (rows.some(row => !row)) return res.status(409).json({ error: 'The account Lake changed. Sync will retry.' });
    res.json({ parts: rows.map(row => row.value.data) });
  }));

  router.post('/', handle(async (req, res, owner) => {
    const { version, entries } = req.body;
    if ((version !== null && (typeof version !== 'string' || !uuid.test(version))) || !validEntries(entries)) {
      return res.status(400).json({ error: 'Invalid Lake sync index.' });
    }
    const previous = await vault.get(owner, bucket, 'head');
    if ((previous?.version || null) !== version) return res.status(409).json({ error: 'The account Lake changed. Sync will retry.' });
    const saved = await vault.save(owner, bucket, 'head', { entries }, previous?.version);
    res.json({ version: saved.version });
    const active = partIds(entries);
    const retired = [...partIds(previous?.value.entries || {})].filter(id => !active.has(id));
    // A replaced item's part IDs are retired. Clients allocate new IDs for later edits.
    for (let i = 0; i < retired.length; i += batchSize) {
      await Promise.allSettled(retired.slice(i, i + batchSize).map(id => vault.remove(owner, bucket, id)));
    }
  }));

  return router;
}

module.exports = { createLakeSyncRouter };
