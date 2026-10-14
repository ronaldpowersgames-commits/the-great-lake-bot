(function(root) {
  function messageTitle(history) {
    const text=(history || []).find(message=>message.role==='user')?.content;
    return text ? text.slice(0,40)+(text.length>40?'...':'') : 'New Session';
  }
  function transcriptTitle(history) {
    const file=(history || []).flatMap(message=>message.attachments || []).find(file=>/\.(txt|log)$/i.test(file.name) || /transcript/i.test(file.name));
    return file ? file.name.replace(/-part-\d+-of-\d+(?=\.[^.]+$)/i,'').replace(/\.[^.]+$/,'') : null;
  }
  function titleFor(existing,history) {
    const automatic=!existing?.name || existing.nameSource==='message' || existing.nameSource==='transcript' || (!existing.nameSource && existing.name===messageTitle(history));
    if(existing?.nameSource==='manual' || !automatic)return {name:existing.name,nameSource:existing.nameSource || 'manual'};
    const title=transcriptTitle(history);
    return {name:title || messageTitle(history),nameSource:title?'transcript':'message'};
  }
  function canParent(id,parentId,folders) {
    const visited=new Set([id]);let current=parentId;
    while(current) {
      if(visited.has(current))return false;
      visited.add(current);
      const folder=folders.find(folder=>folder.id===current);
      if(!folder)return false;
      current=folder.parentId;
    }
    return true;
  }
  function cleanFolders(folders) {
    const seen=new Set();
    const clean=(Array.isArray(folders)?folders:[]).filter(folder=>folder && typeof folder.id==='string' && folder.id.trim() && typeof folder.name==='string' && folder.name.trim() && !seen.has(folder.id) && seen.add(folder.id)).map(folder=>({...folder,name:folder.name.trim(),parentId:folder.parentId || null,collapsed:Boolean(folder.collapsed)}));
    for(const folder of clean)if(!canParent(folder.id,folder.parentId,clean))folder.parentId=null;
    return clean;
  }
  function folderPath(id,folders) {
    const names=[];const visited=new Set();
    while(id && !visited.has(id)) {
      visited.add(id);const folder=folders.find(folder=>folder.id===id);
      if(!folder)break;
      names.unshift(folder.name);id=folder.parentId;
    }
    return names.join(' / ');
  }
  function mergeCrew(target,source) {
    const normalize=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().trim();
    const aliases=[];const seen=new Set([normalize(target.name)]);
    for(const alias of [target.nickname,source.name,source.nickname,source.codename].filter(Boolean).flatMap(value=>value.split(/[,;/|]+/)).map(value=>value.trim()).filter(Boolean)) {
      const key=normalize(alias);if(!seen.has(key)){seen.add(key);aliases.push(alias);}
    }
    const observations=[];const keys=new Set();
    for(const observation of [...(target.observations||[]),...(source.observations||[])]) {
      const key=JSON.stringify([observation.sessionId,observation.evidence,observation.note,observation.sources,observation.meetingDates,observation.sourceOffset]);
      if(!keys.has(key)){keys.add(key);observations.push(observation);}
    }
    const note=[source.role ? `Role recorded for ${source.name}: ${source.role}` : '',source.context].filter(Boolean).join('\n');
    return {...target,isSelf:target.isSelf===true || source.isSelf===true,role:target.role || source.role || '',nickname:aliases.join(', '),observations,
      context:[target.context,note?`Linked from ${source.name}:\n${note}`:''].filter(Boolean).join('\n\n'),
      mergedFrom:[...(target.mergedFrom||[]),{id:source.id,name:source.name,nickname:source.nickname,role:source.role,context:source.context,hidden:source.hidden},...(source.mergedFrom||[])]};
  }
  const api={messageTitle,transcriptTitle,titleFor,canParent,cleanFolders,folderPath,mergeCrew};
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  else root.LakeOrganization=api;
})(typeof window==='undefined'?globalThis:window);
