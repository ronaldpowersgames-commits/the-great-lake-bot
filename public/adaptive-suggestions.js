(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.LakeAdaptiveSuggestions=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const KINDS=new Set(['drill_down','branch','reinforce','quiz','test','counterpoint','action']);

  function text(value,limit){return String(value||'').replace(/\s+/g,' ').trim().slice(0,limit);}

  function extract(value){
    const source=String(value||'');
    const match=source.match(/LAKE_PROMPTS_JSON\s*([\s\S]*?)\s*END_LAKE_PROMPTS_JSON/i);
    const visible=source.replace(/LAKE_PROMPTS_JSON[\s\S]*?(?:END_LAKE_PROMPTS_JSON|$)/gi,'').trim();
    if(!match)return {text:visible,suggestions:[]};
    try {
      const parsed=JSON.parse(match[1]);
      const suggestions=(Array.isArray(parsed.suggestions)?parsed.suggestions:[]).slice(0,3).map(item=>({
        label:text(item?.label,64),
        prompt:text(item?.prompt,600),
        kind:KINDS.has(item?.kind)?item.kind:'branch',
        why:text(item?.why,180)
      })).filter(item=>item.label && item.prompt);
      return {text:visible,suggestions};
    } catch {
      return {text:visible,suggestions:[]};
    }
  }

  function normalizeProfile(value){
    const profile=value && typeof value==='object'?value:{};
    const counts=source=>Object.fromEntries([...KINDS].map(kind=>[kind,Math.max(0,Math.min(100,Number(source?.[kind])||0))]));
    return {chosen:counts(profile.chosen),dismissed:counts(profile.dismissed),recent:Array.isArray(profile.recent)?profile.recent.filter(KINDS.has.bind(KINDS)).slice(-8):[]};
  }

  function record(value,action,suggestion){
    const profile=normalizeProfile(value);const kind=KINDS.has(suggestion?.kind)?suggestion.kind:'branch';
    const bucket=action==='chosen'?'chosen':'dismissed';
    profile[bucket][kind]=Math.min(100,profile[bucket][kind]+1);
    if(action==='chosen')profile.recent=[...profile.recent,kind].slice(-8);
    return profile;
  }

  function summary(value){
    const profile=normalizeProfile(value);
    const nonzero=source=>Object.fromEntries(Object.entries(source).filter(([,count])=>count>0));
    return {chosen:nonzero(profile.chosen),dismissed:nonzero(profile.dismissed),recent_chosen_kinds:profile.recent};
  }

  return {KINDS:[...KINDS],extract,normalizeProfile,record,summary};
});
