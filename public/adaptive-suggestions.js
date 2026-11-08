(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.LakeAdaptiveSuggestions=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const KINDS=new Set(['drill_down','branch','reinforce','quiz','test','counterpoint','action']);

  function text(value,limit){return String(value||'').replace(/\s+/g,' ').trim().slice(0,limit);}
  function label(value){
    let found=false;
    return text(value,80).replace(/\p{Extended_Pictographic}\uFE0F?/gu,emoji=>{if(found)return '';found=true;return emoji;}).replace(/\s+/g,' ').trim().slice(0,64);
  }

  function extract(value){
    const source=String(value||'');
    const match=source.match(/LAKE_PROMPTS_JSON\s*([\s\S]*?)\s*END_LAKE_PROMPTS_JSON/i);
    const visible=source.replace(/LAKE_PROMPTS_JSON[\s\S]*?(?:END_LAKE_PROMPTS_JSON|$)/gi,'').trim();
    if(!match)return {text:visible,suggestions:[]};
    try {
      const parsed=JSON.parse(match[1]);
      const suggestions=(Array.isArray(parsed.suggestions)?parsed.suggestions:[]).slice(0,10).map(item=>({
        label:label(item?.label),
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
    {label:'Follow the strongest current',prompt:'Help me drill into the strongest signal in your answer and explain why it matters.',kind:'drill_down',why:'Shows how the Lake can move from a broad read into the governing detail.'},
    {label:'Test the water from another angle',prompt:'Give me the strongest credible alternative explanation and what evidence would distinguish it.',kind:'counterpoint',why:'Demonstrates that a Lake read can be tested rather than simply accepted.'},
    {label:'Bring one practical move to shore',prompt:'Turn this analysis into the single most useful practical next move for me.',kind:'action',why:'Shows how to convert reflection into a proportionate action.'}
  ];
  const ALWAYS_MOVES=[
    {label:'Clarify the core signal',prompt:'Clarify the core signal in your answer and why it matters most.',kind:'drill_down',why:'Separates the governing point from surrounding detail.'},
    {label:'Show me the other reading',prompt:'Show me the strongest alternative reading of this situation.',kind:'counterpoint',why:'Keeps a useful interpretation testable.'},
    {label:'What would change the read?',prompt:'What evidence would change or weaken this reading?',kind:'test',why:'Turns confidence into a practical test.'},
    {label:'Bring it down to one move',prompt:'Turn your answer into one practical next move I can take.',kind:'action',why:'Converts reflection into an actionable next step.'},
    {label:'Make the pattern memorable',prompt:'Give me the shortest memorable explanation of the pattern here.',kind:'reinforce',why:'Leaves the useful pattern easy to carry forward.'},
    {label:'Quiz me on the judgment',prompt:'Quiz me with one useful question about the judgment call in this answer.',kind:'quiz',why:'Checks whether the insight has landed.'},
    {label:'Trace the evidence',prompt:'Trace the strongest evidence behind this answer and separate it from inference.',kind:'drill_down',why:'Makes the reasoning easier to inspect.'},
    {label:'Pressure-test the next move',prompt:'Pressure-test the proposed next move and show me its main risk or trade-off.',kind:'test',why:'Tests whether the action survives contact with the constraints.'}
  ];

  function ensureScoreBreakdown(result){
    const value=result && typeof result==='object'?result:{text:String(result||''),suggestions:[]};
    const visible=String(value.text||'');
    const isLakeScore=/(?:\b(?:overall\s+)?lake score\b|\blake verdict\b|\bscore card\b)/i.test(visible) && /\b\d+(?:\.\d+)?\s*\/\s*10\b/.test(visible);
    const suggestions=Array.isArray(value.suggestions)?value.suggestions.slice(0,10):[];
    if(!isLakeScore || suggestions.some(item=>/scored well|scored poorly|flow pattern/i.test(`${item.label} ${item.prompt}`)))return {...value,suggestions};
    return {...value,suggestions:[SCORE_BREAKDOWN,...suggestions].slice(0,10)};
  }

  function ensureFirstResponse(result,required){
    const value=result && typeof result==='object'?result:{text:String(result||''),suggestions:[]};
    const suggestions=Array.isArray(value.suggestions)?value.suggestions.slice(0,10):[];
    return required && !suggestions.length?{...value,suggestions:FIRST_RESPONSE_MOVES.map(item=>({...item}))}:{...value,suggestions};
  }
  function ensureAlwaysSuggestions(result,enabled){
    const value=result && typeof result==='object'?result:{text:String(result||''),suggestions:[]};
    const raw=Array.isArray(value.suggestions)?value.suggestions:[];
    const seen=new Set();
    const suggestions=[];
    for(const item of raw){
      const normalized={label:label(item?.label),prompt:text(item?.prompt,600),kind:KINDS.has(item?.kind)?item.kind:'branch',why:text(item?.why,180)};
      const labelKey='label:'+normalized.label.toLowerCase(),promptKey='prompt:'+normalized.prompt.toLowerCase();
      if(!normalized.label || !normalized.prompt || seen.has(labelKey)||seen.has(promptKey))continue;
      seen.add(labelKey);seen.add(promptKey);suggestions.push(normalized);if(suggestions.length>=10)break;
    }
    if(!enabled)return {...value,suggestions};
    if([6,8,10].includes(suggestions.length))return {...value,suggestions};
    const labels=new Set(suggestions.map(item=>String(item?.label||'').toLowerCase()));
    for(const item of ALWAYS_MOVES){ if(suggestions.length>=8)break; if(!labels.has(item.label.toLowerCase())){suggestions.push({...item});labels.add(item.label.toLowerCase());} }
    if(suggestions.length%2 && suggestions.length<10){
      const extra=ALWAYS_MOVES.find(item=>!labels.has(item.label.toLowerCase()));
      if(extra)suggestions.push({...extra});else suggestions.pop();
    }
    return {...value,suggestions:suggestions.slice(0,10)};
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

  return {KINDS:[...KINDS],SCORE_BREAKDOWN,FIRST_RESPONSE_MOVES,ALWAYS_MOVES,extract,ensureScoreBreakdown,ensureFirstResponse,ensureAlwaysSuggestions,normalizeProfile,record,summary};
});
