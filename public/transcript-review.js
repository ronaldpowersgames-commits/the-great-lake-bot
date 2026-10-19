(function(root) {
  function inventory(history,pending,makeId) {
    const sources=[];const seen=new Map();
    for(const file of [...history.filter(message=>message.role==='user').flatMap(message=>message.attachments||[]),...pending]) {
      if(!/\.(txt|log)$/i.test(file.name))continue;
      const key=file.data ? file.name+'\0'+file.data : file;
      if(seen.has(key)){file.sourceId=seen.get(key).sourceId;continue;}
      if(!file.sourceId)file.sourceId=makeId();
      seen.set(key,file);sources.push(file);
    }
    return sources;
  }
  function status(sources,history) {
    const receipts=new Set(history.filter(message=>message.role==='assistant').flatMap(message=>message.sourceReceipts||[]));
    const groups=new Map();
    for(const file of sources) {
      const match=file.name.match(/^(.*)-part-(\d+)-of-(\d+)\.(txt|log)$/i);
      if(!match)continue;
      const number=Number(match[2]);const total=Number(match[3]);if(total<1 || total>1000 || number<1 || number>total)continue;
      const key=match[1]+'\0'+total;
      if(!groups.has(key))groups.set(key,{name:match[1],total,parts:new Set()});
      groups.get(key).parts.add(number);
    }
    const missing=[...groups.values()].map(group=>({name:group.name,total:group.total,parts:Array.from({length:group.total},(_,i)=>i+1).filter(number=>!group.parts.has(number))})).filter(group=>group.parts.length);
    const ordered=[...sources].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
    return {attached:sources.length,selected:sources.filter(file=>!file.excluded).length,sent:sources.filter(file=>receipts.has(file.sourceId)).length,
      missing,numberedComplete:groups.size>0 && missing.length===0,next:ordered.find(file=>!receipts.has(file.sourceId)),receipts};
  }
  function memory(sources,history) {
    const records=new Map();
    for(const message of history)if(message.role==='assistant' && message.transcriptMemory && typeof message.transcriptMemory.notes==='string' && message.transcriptMemory.notes.length<=1800)records.set(message.transcriptMemory.sourceId,message.transcriptMemory);
    const ordered=[...sources].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
    const parts=ordered.filter(file=>records.has(file.sourceId)).map(file=>({sourceId:file.sourceId,filename:file.name,notes:records.get(file.sourceId).notes}));
    const complete=sources.length>0 && sources.length<=20 && parts.length===sources.length && status(sources,history).missing.length===0;
    return {parts,complete,total:sources.length,next:ordered.find(file=>!records.has(file.sourceId))};
  }
  if(typeof module!=='undefined' && module.exports)module.exports={inventory,status,memory};
  else root.LakeTranscriptReview={inventory,status,memory};
})(typeof window==='undefined'?globalThis:window);
