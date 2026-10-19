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
  if(typeof module!=='undefined' && module.exports)module.exports={inventory,status};
  else root.LakeTranscriptReview={inventory,status};
})(typeof window==='undefined'?globalThis:window);
