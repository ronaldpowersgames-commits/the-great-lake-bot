(function(root) {
  function validDate(value) {
    if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year,month,day] = value.split('-').map(Number);
    if(year < 1900 || year > 2100 || month < 1 || month > 12) return false;
    const days = [31,year%4===0 && (year%100!==0 || year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
    return day >= 1 && day <= days[month-1];
  }
  function dateOf(title, reviewedDate) {
    if(validDate(reviewedDate)) return {date:reviewedDate,status:'user-reviewed',evidence:'User-entered meeting date'};
    const dates = new Set();
    const iso = (y,m,d) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const add = (y,m,d) => {const value=iso(y,m,d);if(validDate(value))dates.add(value);};
    for(const match of String(title).matchAll(/(?:^|[^\d])(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})(?!\d)/g)) add(match[1],match[2],match[3]);
    for(const match of String(title).matchAll(/(?:^|[^\d])(\d{1,2})[-_.](\d{1,2})[-_.](\d{4})(?!\d)/g)) {
      add(match[3],match[1],match[2]);add(match[3],match[2],match[1]);
    }
    const months = 'jan january|feb february|mar march|apr april|may|jun june|jul july|aug august|sep sept september|oct october|nov november|dec december'.split('|').map(group=>group.split(' '));
    const monthNumber = word => months.findIndex(names=>names.includes(word.toLowerCase()))+1;
    for(const match of String(title).matchAll(/(?:^|[^A-Za-z\d])([A-Za-z]+)[\s_.-]+(\d{1,2})(?:st|nd|rd|th)?[\s,_.-]+(\d{4})(?!\d)/g)) {
      const month=monthNumber(match[1]);if(month)add(match[3],month,match[2]);
    }
    for(const match of String(title).matchAll(/(?:^|[^A-Za-z\d])(\d{1,2})(?:st|nd|rd|th)?[\s_.-]+([A-Za-z]+)[\s,_.-]+(\d{4})(?!\d)/g)) {
      const month=monthNumber(match[2]);if(month)add(match[3],month,match[1]);
    }
    const candidates=[...dates].sort();
    return {date:candidates.length===1?candidates[0]:null,status:candidates.length===1?'filename-candidate':candidates.length?'ambiguous':'unknown',candidates,evidence:String(title)};
  }
  function speakers(text) {
    const found = new Map();let offset=0;
    for(const line of text.split(/(?<=\n)/)) {
      const match = /^(?:\s*\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*)?([\p{L}][\p{L}\p{M} .'-]{0,70}):\s*\S/u.exec(line);
      if(match) {
        const name=match[1].trim();
        if(!/^(summary|date|meeting|participants|action items|note|notes|subject|from|to)$/i.test(name) && !found.has(name))found.set(name,{name,evidence:line.trimEnd(),offset});
      }
      offset += line.length;
    }
    return [...found.values()];
  }
  const normalize = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  function retrieve(documents, query, crew, maxChars=24000) {
    const stop = new Set('the a an and or to of in for from with me my our what how across all full meeting meetings transcript transcripts archive currents read please'.split(' '));
    const terms = new Set(normalize(query).split(' ').filter(word => word.length>1 && !stop.has(word)));
    const labels = new Set();const relevantCrew=[];
    for(const person of crew || []) {
      const aliases=[person.name,person.codename,...String(person.nickname||'').split(/[,;/|]/)].map(normalize).filter(Boolean);
      if(aliases.some(alias => (' '+normalize(query)+' ').includes(' '+alias+' '))) {
        relevantCrew.push({name:person.name,aliases,status:'user-reviewed directory aliases; resolve conflicting speaker labels before merging identities'});
        aliases.forEach(alias => {labels.add(alias);alias.split(' ').forEach(word => terms.add(word));});
      }
    }
    const rows=[];const meetings=new Set();const seen=new Set();let unreadable=0;let duplicates=0;
    for(const doc of documents) {
      if(typeof doc.text !== 'string') {unreadable++;continue;}
      const identity=doc.filename+'\0'+doc.text;
      if(seen.has(identity)) {duplicates++;continue;}
      seen.add(identity);
      const date=dateOf(doc.filename,doc.meetingDate);
      const meeting=doc.sessionId+'|'+doc.filename.replace(/-part-\d+-of-\d+\.txt$/i,'.txt');meetings.add(meeting);
      let start=0;let number=0;
      while(start<doc.text.length) {
        let end=Math.min(start+1400,doc.text.length);
        if(end<doc.text.length) {const newline=doc.text.lastIndexOf('\n',end-1);if(newline>start+700)end=newline+1;}
        const previous=doc.text.charCodeAt(end-1);const next=doc.text.charCodeAt(end);
        if(previous>=0xd800 && previous<=0xdbff && next>=0xdc00 && next<=0xdfff)end--;
        const text=doc.text.slice(start,end);const normalized=normalize(text);
        let score=0;
        for(const term of terms)if((' '+normalized+' ').includes(' '+term+' '))score++;
        for(const label of labels)if((' '+normalized+' ').includes(' '+label+' '))score+=3;
        rows.push({source_id:doc.id,session_id:doc.sessionId,filename:doc.filename,meeting_date:date,start,end,text,meeting,number: number++,score});
        start=end;
      }
    }
    const matched=rows.some(row => row.score>0);
    if(!matched) {
      const groups=new Map();
      for(const row of rows) {if(!groups.has(row.meeting))groups.set(row.meeting,[]);groups.get(row.meeting).push(row);}
      for(const group of groups.values()) {
        group.sort((a,b)=>a.filename.localeCompare(b.filename,undefined,{numeric:true})||a.start-b.start);
        group.forEach((row,index)=>{row.sampleRank=index===Math.floor(group.length/2)?0:index===group.length-1?1:index===0?2:3;});
      }
    }
    const ordered=rows.filter(row => !matched || row.score>0).sort((a,b) => b.score-a.score || (a.sampleRank||0)-(b.sampleRank||0) || String(b.meeting_date.date||'').localeCompare(String(a.meeting_date.date||'')) || a.number-b.number);
    const perMeeting=new Map();const chosen=[];const deferred=[];
    for(const row of ordered) {
      const count=perMeeting.get(row.meeting)||0;
      if(count<1) {chosen.push(row);perMeeting.set(row.meeting,count+1);} else deferred.push(row);
    }
    const result={format:'lake-meeting-evidence/1',query,alias_directory:relevantCrew,coverage:{stored_text_sources:documents.length,indexed_meetings:meetings.size,duplicate_sources:duplicates,unreadable_sources:unreadable,retrieved_passages:0,represented_meetings:0,complete_archive_in_context:false,selection:matched?'keyword and confirmed-alias matches':'dated representative passages',limitations:['Only the passages below are in this request; no summary replaces their exact text.','Filename dates are candidates unless user-reviewed.','An archive-wide conclusion must acknowledge retrieval limits.']},passages:[]};
    const represented=new Set();
    for(const row of [...chosen,...deferred]) {
      const {meeting,number,score,sampleRank,...passage}=row;
      result.passages.push(passage);
      if(JSON.stringify(result).length>maxChars) {result.passages.pop();break;}
      represented.add(meeting);
    }
    result.coverage.retrieved_passages=result.passages.length;result.coverage.represented_meetings=represented.size;
    return result;
  }
  const api={validDate,dateOf,speakers,retrieve};
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  else root.LakeMeetingMemory=api;
})(typeof window==='undefined'?globalThis:window);
