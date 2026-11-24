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

  const tideKey=(key,id)=>[key,'tide',id];

  function readCollection(store,key,onRead){
    const request=store.get(key);
    request.onsuccess=()=>{
      const ids=request.result?.tideIds;
      if(!Array.isArray(ids)){onRead(request.result,null);return;}
      if(!ids.length){onRead([],ids);return;}
      const items=new Array(ids.length);
      let pending=ids.length;
      ids.forEach((id,index)=>{
        const tide=store.get(tideKey(key,id));
        tide.onsuccess=()=>{
          if(!tide.result){store.transaction.abort();return;}
          items[index]=tide.result;
          if(--pending===0)onRead(items,ids);
        };
      });
    };
  }

  function putTides(store,key,tides,previousIds,changedIds){
    // Store each Tide independently so the browser's per-record limit does not cap the library.
    const ids=tides.map(tide=>tide.id);
    const next=new Set(ids);
    for(const id of previousIds||[])if(!next.has(id))store.delete(tideKey(key,id));
    for(const tide of tides){
      if(!previousIds || !changedIds || changedIds.has(tide.id))store.put(tide,tideKey(key,tide.id));
    }
    store.put({tideIds:ids},key);
  }

  async function transact(key, value, mode) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('accounts', mode);
      const store = transaction.objectStore('accounts');
      let result;
      if(mode==='readonly')readCollection(store,key,items=>{result=items;});
      else if(key==='sessions' || key.endsWith('_sessions')){
        const previous=store.get(key);
        previous.onsuccess=()=>putTides(store,key,value,previous.result?.tideIds);
      }else store.put(value,key);
      transaction.oncomplete = () => resolve(result);
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
      let sessions;
      readCollection(store,key,(stored,previousIds)=>{
        sessions=Array.isArray(stored)?stored:readRecovery(key)||[];
        const index=sessions.findIndex(item=>item.id===snapshot.id);
        if(index<0)sessions.unshift(snapshot);
        else sessions[index]=snapshot;
        putTides(store,key,sessions,previousIds,new Set([snapshot.id]));
      });
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
      const journal=store.get(journalKey);
      let result;
      readCollection(store,key,(stored,previousIds)=>{
        let sessions=Array.isArray(stored)?stored:readRecovery(key)||[];
        let packages=Array.isArray(journal.result)?journal.result:readRecovery(journalKey)||[];
        const changedIds=new Set();
        if(undo){
          const entry=packages.at(-1);
          if(!entry || Date.now()-entry.importedAt>30*86400000)return;
          sessions=sessions.filter(session=>session.portableImportId!==entry.id);
          packages=packages.slice(0,-1);
        }else{
          if(packages.some(entry=>entry.id===incoming.id))return;
          const ids=new Set(sessions.map(session=>session.id));
          const additions=incoming.sessions.filter(session=>!ids.has(session.id)).map(session=>({...session,portableImportId:incoming.id}));
          for(const session of additions)changedIds.add(session.id);
          sessions=[...sessions,...additions];
          const {sessions:ignored,...metadata}=incoming;
          packages=[...packages,{...metadata,importedAt:Date.now()}];
        }
        putTides(store,key,sessions,previousIds,changedIds);
        store.put(packages,journalKey);
        result={sessions,packages};
      });
      tx.oncomplete=()=>{
        if(result){mirror(key,result.sessions);mirror(journalKey,result.packages);}
        resolve(result);
      };
      tx.onabort=()=>reject(tx.error || new Error('Import transaction interrupted'));
    });
  }

  async function mergeBackup(key, foldersKey, backup, cleanFolders, localProfile){
    const journalKey=key+':portable';
    // Read through legacy storage before merging the latest IndexedDB values in one transaction.
    await Promise.all([read(key),read(foldersKey),read(journalKey)]);
    const database=await openDatabase();
    return new Promise((resolve,reject)=>{
      const tx=database.transaction('accounts','readwrite');
      const store=tx.objectStore('accounts');
      const folderRead=store.get(foldersKey);
      const journal=store.get(journalKey);
      let result, failure;
      const current=(request,name)=>request.result ?? readRecovery(name) ?? [];
      readCollection(store,key,(stored,previousIds)=>{
        try{
          const existing=stored ?? readRecovery(key) ?? [];
          const ids=new Set(existing.map(tide=>tide.id));
          const added=backup.conversations.filter(tide=>!ids.has(tide.id));
          const sessions=[...existing,...added.map(tide=>{
            const {portableImportId,...restored}=tide;
            return restored;
          })];
          const folders=cleanFolders([...current(folderRead,foldersKey),...(Array.isArray(backup.folders)?backup.folders:[])]);
          const packages=current(journal,journalKey);
          const bundle=backup.portable_profile;
          const seenProfiles=new Set(packages.flatMap(item=>item.profiles).map(record=>JSON.stringify([record.id,record.data])));
          if(localProfile)seenProfiles.add(JSON.stringify([localProfile.id,localProfile.data]));
          const profiles=bundle && !packages.some(item=>item.id===bundle.id)
            ? bundle.profiles.filter(record=>!seenProfiles.has(JSON.stringify([record.id,record.data]))) : [];
          if(profiles.length){
            packages.push({id:bundle.id,kind:'profile',profiles,importedAt:Date.now()});
            store.put(packages,journalKey);
          }
          if(added.length)putTides(store,key,sessions,previousIds,new Set(added.map(tide=>tide.id)));
          store.put(folders,foldersKey);
          result={sessions,folders,packages,added:added.length,kept:backup.conversations.length-added.length,profiles:profiles.length};
        }catch(error){failure=error;tx.abort();}
      });
      tx.oncomplete=()=>{
        mirror(key,result.sessions);
        mirror(foldersKey,result.folders);
        mirror(journalKey,result.packages);
        resolve(result);
      };
      tx.onabort=()=>reject(failure || tx.error || new Error('Backup restore interrupted.'));
    });
  }

  window.LakeSessionStore = { read, write, upsert, portableImport, mergeBackup };
})();
