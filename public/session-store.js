(function () {
  let databasePromise;
  const writes = new Map();

  function readRecovery(key){
    try{
      const items=JSON.parse(localStorage.getItem(key+':recovery-copy')||'null');
      return Array.isArray(items)?items:undefined;
    }catch{return undefined;}
  }

  function mirror(key,items){
    if(!Array.isArray(items))return;
    try{
      const compact=JSON.stringify(items,(field,value)=>field==='data' && typeof value==='string' && value.startsWith('data:') ? undefined : value);
      if(compact.length<=1500000)localStorage.setItem(key+':recovery-copy',compact);
      else localStorage.removeItem(key+':recovery-copy');
    }catch{
      // Never resurrect a stale copy after a successful deletion or edit.
      try{localStorage.removeItem(key+':recovery-copy');}catch{}
    }
  }

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
    const pending = (writes.get(key) || Promise.resolve()).catch(() => {}).then(() => transact(key, snapshot, 'readwrite')).then(()=>mirror(key,snapshot));
    writes.set(key, pending);
    return pending.finally(() => { if (writes.get(key) === pending) writes.delete(key); });
  }

  async function read(key) {
    await (writes.get(key) || Promise.resolve()).catch(() => {});
    let stored;
    try{stored=await transact(key,undefined,'readonly');}
    catch(error){
      const recovered=readRecovery(key);
      if(recovered)error.recoveredSessions=recovered;
      throw error;
    }
    if(stored===undefined){
      const recovered=readRecovery(key);
      if(recovered){
        try{await write(key,recovered);}
        catch(error){error.recoveredSessions=recovered;throw error;}
        stored=recovered;
      }
    }
    if(Array.isArray(stored))mirror(key,stored);
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

  async function upsert(key, session) {
    const database=await openDatabase();
    const snapshot=structuredClone(session);
    delete snapshot.portableImportId;
    return new Promise((resolve,reject)=>{
      const transaction=database.transaction('accounts','readwrite');
      const store=transaction.objectStore('accounts');
      const read=store.get(key);
      let sessions;
      read.onsuccess=()=>{
        sessions=Array.isArray(read.result)?read.result:readRecovery(key)||[];
        const index=sessions.findIndex(item=>item.id===snapshot.id);
        if(index<0)sessions.unshift(snapshot);
        else sessions[index]=snapshot;
        store.put(sessions,key);
      };
      transaction.oncomplete=()=>{mirror(key,sessions);resolve();};
      transaction.onabort=()=>reject(transaction.error || new Error('Chat save interrupted'));
    });
  }

  async function portableImport(key, incoming, undo=false){
    const database=await openDatabase();
    const journalKey=key+':portable';
    return new Promise((resolve,reject)=>{
      const tx=database.transaction('accounts','readwrite');
      const store=tx.objectStore('accounts');
      const history=store.get(key);
      const journal=store.get(journalKey);
      let result;
      journal.onsuccess=()=>{
        let sessions=Array.isArray(history.result)?history.result:readRecovery(key)||[];
        let packages=Array.isArray(journal.result)?journal.result:readRecovery(journalKey)||[];
        if(undo){
          const entry=packages.at(-1);
          if(!entry || Date.now()-entry.importedAt>30*86400000)return;
          sessions=sessions.filter(session=>session.portableImportId!==entry.id);
          packages=packages.slice(0,-1);
        }else{
          if(packages.some(entry=>entry.id===incoming.id))return;
          const ids=new Set(sessions.map(session=>session.id));
          sessions=[...sessions,...incoming.sessions.filter(session=>!ids.has(session.id)).map(session=>({...session,portableImportId:incoming.id}))];
          const {sessions:ignored,...metadata}=incoming;
          packages=[...packages,{...metadata,importedAt:Date.now()}];
        }
        store.put(sessions,key);
        store.put(packages,journalKey);
        result={sessions,packages};
      };
      tx.oncomplete=()=>{
        if(result){mirror(key,result.sessions);mirror(journalKey,result.packages);}
        resolve(result);
      };
      tx.onabort=()=>reject(tx.error || new Error('Import transaction interrupted'));
    });
  }

  window.LakeSessionStore = { read, write, upsert, portableImport };
})();
