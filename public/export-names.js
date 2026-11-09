(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.LakeExportNames=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const PREFIX='the-great-lake';

  function slug(value,fallback='export'){
    const cleaned=String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
      .replace(/\.[a-z0-9]{1,8}$/i,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);
    return cleaned || fallback;
  }

  function dateStamp(value){
    const date=value instanceof Date?value:new Date(value || Date.now());
    const safe=Number.isNaN(date.getTime())?new Date():date;
    return [safe.getFullYear(),String(safe.getMonth()+1).padStart(2,'0'),String(safe.getDate()).padStart(2,'0')].join('-');
  }

  function artifact(kind,extension,value){return `${PREFIX}-${slug(kind)}-${dateStamp(value)}.${slug(extension,'dat')}`;}
  function sessionTranscript(extension='txt',value,title){return artifact(title?'session-transcript-'+title:'session-transcript',extension,value);}
  function aiHandoff(scope,value,title){return artifact('ai-handoff-'+slug(scope,'chat')+(title?'-'+title:''),'json',value);}
  function fullBackup(value){return artifact('full-backup','json',value);}
  function sourceStem(source){return slug(String(source||'').replace(/^the-great-lake-transcript-/i,''),'transcript');}
  function transcriptPart(source,index,total){
    const digits=Math.max(3,String(total).length);
    return `${PREFIX}-transcript-${sourceStem(source)}-part-${String(index).padStart(digits,'0')}-of-${String(total).padStart(digits,'0')}.txt`;
  }
  function transcriptIndex(source){return `${PREFIX}-transcript-${sourceStem(source)}-part-index.json`;}
  function transcriptZip(source){return `${PREFIX}-transcript-${sourceStem(source)}-parts.zip`;}

  return {PREFIX,slug,dateStamp,artifact,sessionTranscript,aiHandoff,fullBackup,transcriptPart,transcriptIndex,transcriptZip};
});
