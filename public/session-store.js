(function () {
  let databasePromise;
  const writes = new Map();

  function openDatabase() {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open('great-lake-history', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('accounts');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Close other Lake tabs to finish the storage upgrade.'));
      }).catch(error => { databasePromise = null; throw error; });
    }
    return databasePromise;
  }

  async function transact(key, value, mode) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('accounts', mode);
      const store = transaction.objectStore('accounts');
      const request = mode === 'readonly' ? store.get(key) : store.put(value, key);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Storage was interrupted.'));
    });
  }

  function write(key, sessions) {
    const snapshot = structuredClone(sessions);
    const pending = (writes.get(key) || Promise.resolve()).catch(() => {}).then(() => transact(key, snapshot, 'readwrite'));
    writes.set(key, pending);
    return pending.finally(() => { if (writes.get(key) === pending) writes.delete(key); });
  }

  async function read(key) {
    await (writes.get(key) || Promise.resolve()).catch(() => {});
    const stored = await transact(key, undefined, 'readonly');
    const legacy = localStorage.getItem(key);
    if (!legacy) return Array.isArray(stored) ? stored : [];
    let oldSessions;
    try { oldSessions = JSON.parse(legacy); }
    catch(error) {
      if (Array.isArray(stored)) return stored;
      throw error;
    }
    if (!Array.isArray(oldSessions)) throw new Error('Saved session history is not a list.');
    const merged = new Map(oldSessions.map(session => [session.id, session]));
    for (const session of stored || []) merged.set(session.id, session);
    const sessions = [...merged.values()].sort((a, b) => String(b.time).localeCompare(String(a.time)));
    // Remove the old copy only after the larger database has committed it.
    try { await write(key, sessions); }
    catch(error) { error.recoveredSessions = sessions; throw error; }
    localStorage.removeItem(key);
    return sessions;
  }

  window.LakeSessionStore = { read, write };
})();
