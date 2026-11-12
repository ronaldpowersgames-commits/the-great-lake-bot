(function (root) {
  const legacyKeys = { captain: 'learnedProfile', crew: 'crew' };
  const fields = { captain: 'key', crew: 'id' };
  const normalize = value => String(value || '').normalize('NFKC').trim().toLowerCase();
  const crewNameKey = value => 'name:' + normalize(value);
  const own = (value, key) => Object.hasOwn(value, key);

  function legacyCrewId(member, index) {
    return 'legacy:' + normalize(member.name) + ':' + index;
  }

  function validRecord(kind, record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
    if (kind === 'captain') return typeof record.key === 'string' && /^[a-z0-9_-]{2,96}$/.test(record.key) &&
      typeof record.value === 'string' && typeof record.evidence === 'string';
    return typeof record.name === 'string' && Boolean(record.name.trim()) &&
      (record.observations === undefined || Array.isArray(record.observations) &&
        record.observations.every(item => item && typeof item === 'object' && !Array.isArray(item)));
  }

  function validate(kind, envelope) {
    if (!own(fields, kind) || envelope?.version !== 1 || !Array.isArray(envelope.records) ||
        !Array.isArray(envelope.deleted) || typeof envelope.savedAt !== 'string' ||
        !envelope.deleted.every(id => typeof id === 'string')) throw new Error('Invalid memory store.');
    const ids = new Set();
    for (const record of envelope.records) {
      if (!validRecord(kind, record) || typeof record[fields[kind]] !== 'string' ||
          !record[fields[kind]] || ids.has(record[fields[kind]]) ||
          envelope.deleted.includes(record[fields[kind]]) ||
          (record.revisions !== undefined && (!Array.isArray(record.revisions) ||
            !record.revisions.every(item => validRecord(kind, item)))) ||
          (kind === 'captain' && record.pending !== undefined && !validRecord(kind, record.pending))) {
        throw new Error('Invalid memory record.');
      }
      ids.add(record[fields[kind]]);
    }
    return envelope;
  }

  function create(storage, keyFor) {
    const key = kind => keyFor(kind + 'MemoryV1');
    function read(kind) {
      try {
        const raw = storage.getItem(key(kind));
        if (raw !== null) return { status: 'stored', ...validate(kind, JSON.parse(raw)) };
        const legacy = storage.getItem(keyFor(legacyKeys[kind]));
        const records = legacy === null ? [] : JSON.parse(legacy);
        if (!Array.isArray(records) || !records.every(record => validRecord(kind, record))) {
          throw new Error('Invalid legacy records.');
        }
        const migrated = kind === 'crew'
          ? records.map((record, index) => ({ ...record, id: record.id || legacyCrewId(record, index) }))
          : records.map(record => ({ ...record, classification: record.classification || 'legacy observation' }));
        const envelope = validate(kind, { version: 1, records: migrated, deleted: [], savedAt: '' });
        return { ...envelope, status: legacy === null ? 'empty' : 'legacy' };
      } catch {
        return { status: 'unavailable', records: [], deleted: [], savedAt: '' };
      }
    }
    function write(kind, records, deleted) {
      const envelope = validate(kind, { version: 1, records, deleted: [...new Set(deleted)], savedAt: new Date().toISOString() });
      const data = JSON.stringify(envelope);
      storage.setItem(key(kind), data);
      if (storage.getItem(key(kind)) !== data) throw new Error('Memory write could not be verified.');
      return envelope;
    }
    function update(kind, change) {
      const current = read(kind);
      if (current.status === 'unavailable') throw new Error('Stored memory is unavailable. Existing data was kept.');
      const next = change(current);
      return next ? write(kind, next.records, next.deleted) : current;
    }
    function restore(kind, backup) {
      validate(kind, backup);
      const current = read(kind);
      if (current.status !== 'unavailable') return update(kind, memory => merge(kind, memory, backup));
      const damaged = storage.getItem(key(kind));
      if (damaged !== null) {
        const recoveryKey = key(kind) + ':damaged:' + new Date().toISOString();
        storage.setItem(recoveryKey, damaged);
        if (storage.getItem(recoveryKey) !== damaged) throw new Error('Could not preserve damaged memory.');
      }
      return write(kind, backup.records, backup.deleted);
    }
    return { read, update, restore };
  }

  function versionOf(record) {
    const { revisions, pending, ...version } = record;
    return version;
  }

  function captainUpdate(current, entries, source, manual = false) {
    const records = new Map(current.records.map(record => [record.key, record]));
    const deleted = new Set(current.deleted);
    let changed = false;
    for (const entry of entries) {
      const previous = records.get(entry.key);
      if (!manual && (deleted.has(entry.key) || !entry.value)) continue;
      const candidate = { ...entry, source, updatedAt: new Date().toISOString() };
      if (previous?.value === candidate.value && !manual) continue;
      if (previous && !manual && previous.value !== candidate.value) {
        if (previous.pending?.value === candidate.value ||
            previous.revisions?.some(version => version.review === 'rejected' && version.value === candidate.value)) continue;
        records.set(entry.key, { ...previous, pending: candidate,
          revisions: [...(previous.revisions || []), ...(previous.pending ? [previous.pending] : [])] });
      } else {
        deleted.delete(entry.key);
        records.set(entry.key, { ...candidate, revisions: previous ?
          [...(previous.revisions || []), versionOf(previous)] : [] });
      }
      changed = true;
    }
    return changed ? { records: [...records.values()], deleted: [...deleted] } : null;
  }

  function crewUpdate(current, members) {
    const previous = new Map(current.records.map(member => [member.id, member]));
    const records = members.map(member => {
      const old = previous.get(member.id);
      const next = { ...member, id: member.id || root.crypto.randomUUID() };
      if (!old) return next;
      const { updatedAt: priorDate, ...before } = versionOf(old);
      const { updatedAt: nextDate, ...after } = versionOf(next);
      if (JSON.stringify(before) === JSON.stringify(after)) return old;
      return { ...next, updatedAt: new Date().toISOString(), revisions: [...(old.revisions || []), versionOf(old)] };
    });
    const active = new Set(records.map(member => member.id));
    const removed = current.records.filter(member => !active.has(member.id));
    return { records, deleted: [...current.deleted, ...removed.flatMap(member =>
      [member.id, ...[member.name, member.codename, ...String(member.nickname || '').split(/[,;/|]/)]
        .filter(Boolean).map(crewNameKey)])] };
  }

  function relevantCrew(records, question) {
    const words = value => normalize(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const query = ' ' + words(question) + ' ';
    const mentioned = member => [member.name, member.codename, ...String(member.nickname || '').split(/[,;/|]/)]
      .some(alias => words(alias).length >= 2 && query.includes(' ' + words(alias) + ' '));
    return records.filter(member => !member.isSelf && mentioned(member)).slice(0, 12);
  }

  function merge(kind, current, backup) {
    validate(kind, backup);
    const id = fields[kind];
    const known = new Set([...current.deleted, ...current.records.map(record => record[id])]);
    const records = [...current.records];
    for (const record of backup.records) {
      if (known.has(record[id]) || kind === 'crew' && known.has(crewNameKey(record.name))) continue;
      known.add(record[id]);
      records.push(record);
    }
    return { records, deleted: [...new Set([...current.deleted, ...backup.deleted])]
      .filter(idValue => !records.some(record => record[id] === idValue)) };
  }

  const api = { create, validate, captainUpdate, crewUpdate, relevantCrew, crewNameKey, merge };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LakeMemoryAnchors = api;
})(globalThis);
