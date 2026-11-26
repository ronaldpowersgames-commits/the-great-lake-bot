(function (root) {
  const partSize = 256 * 1024;
  const batchSize = 8;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

  const hashValue = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    byte => byte.toString(16).padStart(2, '0')).join('');

  function encode(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }

  function plan(local, remote, base, choices = new Map()) {
    const conflicts = [];
    const decisions = [];
    const ids = new Set([...local.keys(), ...Object.keys(remote), ...Object.keys(base)]);
    for (const id of ids) {
      const here = local.get(id)?.hash ?? null;
      const there = remote[id]?.hash ?? null;
      const before = base[id] ?? null;
      if (here === there) continue;
      if (Object.hasOwn(base, id)) {
        if (here === before) { decisions.push([id, 'remote']); continue; }
        if (there === before) { decisions.push([id, 'local']); continue; }
      } else {
        if (here === null) { decisions.push([id, 'remote']); continue; }
        if (!Object.hasOwn(remote, id)) { decisions.push([id, 'local']); continue; }
      }
      const chosen = choices.get(id);
      if (chosen?.here === here && chosen.there === there) decisions.push([id, chosen.side]);
      else conflicts.push({ id, here, there });
    }
    return { conflicts, decisions };
  }

  function create({ owner, capture, apply, getBase, saveBase, canSync, report, prepare }) {
    let busy = false;
    let ready = false;
    let enabled = false;
    let paused = false;
    let lastSync;
    const choices = new Map();
    let conflicts = [];
    const transfers = new Map();

    const request = async (path = '', body) => {
      const headers = { 'X-Lake-Account': owner };
      const response = await fetch('/account/sync' + path, {
        cache: 'no-store', headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(30000)
      });
      const result = await response.json();
      if (!response.ok) {
        const error = new Error(result.error || 'Lake sync is temporarily unavailable.');
        error.status = response.status;
        throw error;
      }
      return result;
    };

    async function upload(id, entry) {
      let part = transfers.get(id);
      if (part?.hash !== entry.hash) part = { hash: entry.hash, parts: [] };
      transfers.set(id, part);
      const bytes = encoder.encode(entry.value);
      const count = Math.max(1, Math.ceil(bytes.length / partSize));
      if (count > 1024) throw new Error('A Lake item is too large to sync. Keep its local copy or export a package.');
      while (part.parts.length < count) part.parts.push(crypto.randomUUID());
      for (let i = part.sent || 0; i < count; i += batchSize) {
        const parts = part.parts.slice(i, i + batchSize).map((partId, j) => {
          const offset = (i + j) * partSize;
          return { id: partId, data: encode(bytes.subarray(offset, offset + partSize)) };
        });
        await request('/parts', { parts });
        part.sent = i + parts.length;
      }
      return { hash: entry.hash, parts: part.parts };
    }

    async function download(ref) {
      const chunks = [];
      for (let i = 0; i < ref.parts.length; i += batchSize) {
        const { parts } = await request('/read', { ids: ref.parts.slice(i, i + batchSize) });
        for (const value of parts) chunks.push(Uint8Array.from(atob(value), character => character.charCodeAt(0)));
      }
      const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
      if (await hashValue(bytes) !== ref.hash) throw new Error('A synced item could not be verified. Your local data was kept.');
      return decoder.decode(bytes);
    }

    function status(message) {
      report({ ready, enabled, paused, busy, message, conflicts, choices, lastSync });
    }

    async function reconcile(activate) {
      const remote = await request();
      ready = true;
      enabled = remote.version !== null;
      if (paused) return;
      if (!activate && !enabled) { prepare(); return; }
      const items = await capture();
      const local = new Map();
      for (const [id, value] of items) local.set(id, { value, hash: await hashValue(encoder.encode(value)) });
      const base = await getBase() || {};
      const result = plan(local, remote.entries, base, choices);
      conflicts = result.conflicts;
      if (conflicts.length && !result.decisions.length) return;
      const next = { ...remote.entries };
      const edits = new Map();
      let publish = !enabled;
      for (const [id, side] of result.decisions) {
        if (side === 'local') {
          next[id] = local.has(id) ? await upload(id, local.get(id)) : null;
          publish = true;
        } else {
          edits.set(id, { previous: local.get(id)?.value ?? null, next: remote.entries[id] ? await download(remote.entries[id]) : null });
        }
      }
      if (paused || !canSync()) return;
      if (publish) {
        try { await request('', { version: remote.version, entries: next }); }
        finally { transfers.clear(); }
        enabled = true;
      }
      if (edits.size) await apply(edits);
      const synced = Object.fromEntries(Object.entries(next).map(([id, ref]) => [id, ref?.hash ?? null]));
      for (const { id } of conflicts) {
        if (Object.hasOwn(base, id)) synced[id] = base[id];
        else delete synced[id];
      }
      await saveBase(synced);
      transfers.clear();
      choices.clear();
      lastSync = new Date();
      if (!conflicts.length) prepare();
    }

    async function sync(activate = false) {
      if (busy || paused || !canSync()) return;
      busy = true;
      status();
      let message;
      try {
        if (navigator.locks) await navigator.locks.request('lake-sync:' + owner, { ifAvailable: true },
          lock => lock && reconcile(activate));
        else await reconcile(activate);
      } catch (error) {
        ready = true;
        message = error.status === 409 ? 'Your Lake changed during sync. Changes will retry automatically.' : error.message;
      } finally {
        busy = false;
        status(message);
      }
    }

    return {
      sync,
      pause(value) { paused = value; status(); if (!paused) void sync(); },
      resolve(id, side) {
        const conflict = conflicts.find(item => item.id === id);
        if (!conflict || !['local', 'remote'].includes(side)) return;
        choices.set(id, { ...conflict, side });
        status();
        void sync(true);
      }
    };
  }

  const api = { create, plan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LakeAccountSync = api;
})(typeof window === 'undefined' ? globalThis : window);
