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

  const SCORE_BREAKDOWN={
    label:'What scored well/poorly and the flow pattern explanation',
    prompt:'Break down what scored well, what scored poorly, and explain the interaction flow pattern that produced this Lake score.',
    kind:'drill_down',
    why:'A score becomes useful when its strongest, weakest and interaction-level causes are visible.'
  };

  const FIRST_RESPONSE_MOVES=[
    {label:'Drill into the strongest signal',prompt:'Help me drill into the strongest signal in your answer and explain why it matters.',kind:'drill_down',why:'Shows how the Lake can move from a broad read into the governing detail.'},
    {label:'Pressure-test the Lake’s read',prompt:'Give me the strongest credible alternative explanation and what evidence would distinguish it.',kind:'counterpoint',why:'Demonstrates that a Lake read can be tested rather than simply accepted.'},
    {label:'Turn this into one practical move',prompt:'Turn this analysis into the single most useful practical next move for me.',kind:'action',why:'Shows how to convert reflection into a proportionate action.'}
  ];

  function ensureScoreBreakdown(result){
    const value=result && typeof result==='object'?result:{text:String(result||''),suggestions:[]};
    const visible=String(value.text||'');
    const isLakeScore=/(?:\b(?:overall\s+)?lake score\b|\blake verdict\b|\bscore card\b)/i.test(visible) && /\b\d+(?:\.\d+)?\s*\/\s*10\b/.test(visible);
    const suggestions=Array.isArray(value.suggestions)?value.suggestions.slice(0,3):[];
    if(!isLakeScore || suggestions.some(item=>/scored well|scored poorly|flow pattern/i.test(`${item.label} ${item.prompt}`)))return {...value,suggestions};
    return {...value,suggestions:[SCORE_BREAKDOWN,...suggestions].slice(0,3)};
  }

  function ensureFirstResponse(result,required){
    const value=result && typeof result==='object'?result:{text:String(result||''),suggestions:[]};
    const suggestions=Array.isArray(value.suggestions)?value.suggestions.slice(0,3):[];
    return required && !suggestions.length?{...value,suggestions:FIRST_RESPONSE_MOVES.map(item=>({...item}))}:{...value,suggestions};
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

  return {KINDS:[...KINDS],SCORE_BREAKDOWN,FIRST_RESPONSE_MOVES,extract,ensureScoreBreakdown,ensureFirstResponse,normalizeProfile,record,summary};
});
