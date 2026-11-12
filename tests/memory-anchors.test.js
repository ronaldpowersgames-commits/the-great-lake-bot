const test = require('node:test');
const assert = require('node:assert/strict');
const memory = require('../public/memory-anchors');
const { encrypt, decrypt } = require('../public/full-backup');

function fixture(data = {}) {
  const values = new Map(Object.entries(data));
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); }
  };
  return { storage, open: () => memory.create(storage, name => 'test:' + name) };
}

const note = { key: 'meetings', value: 'I prepare an agenda.', evidence: 'I prepare an agenda.', classification: 'user reported' };
const person = { name: 'Sam Park', nickname: 'Skipper', relationship: 'Teammate', observations: [{ evidence: 'Sam joined our project.' }] };
const source = { sessionId: 'tide_123', recordedAt: '2026-11-12T16:00:00.000Z' };

test('both legacy memories migrate without overwriting their original data and survive independent reopens', () => {
  const legacyCrew = JSON.stringify([person]);
  const legacyCaptain = JSON.stringify([note]);
  const { storage, open } = fixture({ 'test:crew': legacyCrew, 'test:learnedProfile': legacyCaptain });
  const original = open();
  const crew = original.read('crew');
  assert.equal(crew.status, 'legacy');
  assert.equal(original.read('captain').status, 'legacy');
  original.update('crew', current => memory.crewUpdate(current, crew.records));
  original.update('captain', current => memory.captainUpdate(current, [note], source, true));
  const reopened = open();
  assert.equal(reopened.read('captain').records[0].source.sessionId, source.sessionId);
  assert.equal(reopened.read('captain').records[0].classification, 'user reported');
  for (const query of ['How is Sam Park?', 'Ask Skipper']) {
    assert.equal(memory.relevantCrew(reopened.read('crew').records, query)[0].relationship, 'Teammate');
  }
  assert.equal(storage.getItem('test:crew'), legacyCrew);
  assert.equal(storage.getItem('test:learnedProfile'), legacyCaptain);
});

test('independent stores preserve the other anchor on retrieval failure and refuse destructive writes', () => {
  for (const broken of ['crew', 'captain']) {
    const healthy = broken === 'crew' ? 'captain' : 'crew';
    const { storage, open } = fixture({ 'test:crew': JSON.stringify([person]), 'test:learnedProfile': JSON.stringify([note]) });
    storage.setItem('test:' + broken + 'MemoryV1', '{broken');
    assert.equal(open().read(broken).status, 'unavailable');
    assert.equal(open().read(healthy).records.length, 1);
    assert.throws(() => open().update(broken, () => ({ records: [], deleted: [] })), /unavailable/);
    assert.equal(storage.getItem('test:' + broken + 'MemoryV1'), '{broken');
  }
});

test('conflicting evidence is retained separately until reviewed and deletion survives stale imports', () => {
  const { open } = fixture();
  const original = open();
  original.update('captain', current => memory.captainUpdate(current, [note], source));
  const backup = original.read('captain');
  const later = { ...note, value: 'I plan only when the group needs it.', evidence: 'I plan only when the group needs it.' };
  original.update('captain', current => memory.captainUpdate(current, [later], { sessionId: 'later' }));
  let record = open().read('captain').records[0];
  assert.equal(record.value, note.value);
  assert.equal(record.pending.value, later.value);
  assert.equal(record.pending.source.sessionId, 'later');
  original.update('captain', current => memory.captainUpdate(current, [later], { sessionId: 'later' }, true));
  record = open().read('captain').records[0];
  assert.equal(record.value, later.value);
  assert.equal(record.revisions[0].value, note.value);
  original.update('captain', () => ({ records: [], deleted: [note.key] }));
  original.update('captain', current => memory.merge('captain', current, backup));
  original.update('captain', current => memory.captainUpdate(current, [note], source));
  assert.deepEqual(open().read('captain').records, []);
});

test('encrypted memory export and restore retain provenance, identities and separate same-name people', async () => {
  const original = fixture().open();
  original.update('captain', current => memory.captainUpdate(current, [note], source));
  original.update('crew', current => memory.crewUpdate(current, [person, { ...person, relationship: 'Neighbor' }]));
  const anchors = Object.fromEntries(['captain', 'crew'].map(kind => [kind, original.read(kind)]));
  const backup = await encrypt({ format_version: 'lake-memory/1', anchors }, 'local-test-password');
  const restored = await decrypt(backup, 'local-test-password');
  const fresh = fixture().open();
  for (const kind of ['captain', 'crew']) {
    fresh.update(kind, current => memory.merge(kind, current, restored.anchors[kind]));
    fresh.update(kind, current => memory.merge(kind, current, restored.anchors[kind]));
    assert.deepEqual(fresh.read(kind).records, anchors[kind].records);
  }
  const [first, second] = fresh.read('crew').records;
  fresh.update('crew', current => memory.crewUpdate(current, [{ ...first, relationship: 'Former teammate' }]));
  fresh.update('crew', current => memory.merge('crew', current, restored.anchors.crew));
  assert.equal(fresh.read('crew').records.length, 1);
  assert.equal(fresh.read('crew').records[0].revisions[0].relationship, 'Teammate');
  assert.ok(fresh.read('crew').deleted.includes(second.id));
});
