let folderDialog = null;
let dockSplit = 0.65;

function renderCrewProfileSections(member) {
  const container=document.getElementById('crewCardSections');container.replaceChildren();
  function section(title) {
    const node=document.createElement('section');node.className='crew-profile-section';
    const heading=document.createElement('h4');heading.textContent=title;node.append(heading);container.append(node);return node;
  }
  if(member.role) {const role=section('Role');const text=document.createElement('div');text.className='crew-card-context';text.textContent=member.role;role.append(text);}
  const notes=section('Saved Notes');
  const text=document.createElement('div');text.className='crew-card-context';text.id='crewCardContext';text.textContent=member.context || 'No saved notes.';
  if((member.context||'').length>900) {
    const preview=document.createElement('div');preview.className='crew-note-preview';preview.textContent=member.context.slice(0,220)+'…';notes.append(preview);
    const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Show complete notes';details.append(summary,text);notes.append(details);
  }else notes.append(text);
  const unique=new Map();
  for(const observation of member.observations||[])unique.set(JSON.stringify([observation.sessionId,observation.evidence,observation.note,observation.sources,observation.meetingDates]),observation);
  if(unique.size) {
    const evidence=section(`Meeting Evidence · ${unique.size}`);
    for(const observation of [...unique.values()].reverse()) {
      const row=document.createElement('details');row.className='crew-evidence-item';
      const summary=document.createElement('summary');summary.textContent=observation.note || 'Source observation';row.append(summary);
      const meta=document.createElement('div');meta.className='crew-evidence-meta';
      const dates=(observation.meetingDates||[]).map(item=>[item.date||'Unknown meeting date',item.status].filter(Boolean).join(' · '));
      meta.textContent=[observation.reviewed?'User-reviewed observation':'Unconfirmed observation',...dates,...(observation.sources||[]),observation.date?'Recorded: '+observation.date:''].filter(Boolean).join('\n');meta.style.whiteSpace='pre-wrap';row.append(meta);
      if(observation.evidence){const quote=document.createElement('blockquote');quote.textContent=observation.evidence;row.append(quote);}
      evidence.append(row);
    }
  }
}

function askCrewProfile() {
  const member=crewMembers[crewCardIndex];if(!member)return;
  const prompt=`About ${String(member.name).slice(0,200)}${member.nickname?' (aliases: '+String(member.nickname).slice(0,700)+')':''}: Summarize the most useful supported communication patterns, influence and things to watch. Use relevant reviewed Crew notes and distinguish them from source evidence.`;
  closeCrewCard();
  const sameConversationComplete=LakeTranscriptReview.memory(transcriptSources(),chatHistory).complete;
  const hasArchive=allSessions.some(session=>(session.history||[]).some(message=>(message.attachments||[]).some(file=>/\.(txt|log)$/i.test(file.name))));
  if(hasArchive && !sameConversationComplete)readMeetingCurrents(prompt);
  else sendPrompt(prompt);
  if(window.innerWidth<=768 && document.getElementById('dock').classList.contains('open'))toggleDock();
}

function libraryButton(symbol,title,action) {
  const button=document.createElement('button');button.className='library-icon';button.textContent=symbol;
  button.title=title;button.setAttribute('aria-label',title);
  button.onclick=event=>{event.stopPropagation();event.preventDefault();action(event);};
  return button;
}

function renderTideTree() {
  const container=document.getElementById('pastTides');if(!container)return;
  const scrollTop=container.scrollTop;
  container.replaceChildren();
  const query=tideQuery.toLowerCase().trim();const folderIds=new Set(tideFolders.map(folder=>folder.id));
  const matches=session=>[session.name,session.preview,...(session.history||[]).flatMap(message=>(message.attachments||[]).map(file=>file.name))].join(' ').toLowerCase().includes(query);
  function addChat(parent,session) {
    const row=document.createElement('div');row.className='tide-item'+(session.id===currentSessionId?' active':'');
    row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-label','Open chat: '+session.name);
    row.onclick=()=>loadTide(session.id);row.onkeydown=event=>{if(event.target===row && ['Enter',' '].includes(event.key)){event.preventDefault();loadTide(session.id);}};
    const info=document.createElement('div');info.className='tide-info';
    const name=document.createElement('div');name.className='tide-name';name.textContent=session.name;name.title=session.name;
    const preview=document.createElement('div');preview.className='tide-preview';preview.textContent=session.preview||'';
    info.append(name,preview);
    const time=document.createElement('span');time.className='tide-time';time.textContent=getTimeAgo(session.time);
    const remove=libraryButton('🗑','Delete chat',event=>deleteSession(event,session.id));remove.classList.add('tide-delete');
    row.append(info,time,remove,libraryButton('↪','Move chat',()=>openFolderDialog('move',session.id)),libraryButton('✎','Rename chat',event=>renameSession(event,session.id)));
    parent.append(row);
  }
  function addLevel(parent,parentId,ancestorMatches=false) {
    const folders=tideFolders.filter(folder=>(folder.parentId||null)===parentId).sort((a,b)=>a.name.localeCompare(b.name));
    let found=false;
    for(const folder of folders) {
      const details=document.createElement('details');details.className='tide-folder';details.dataset.folderId=folder.id;
      const summary=document.createElement('summary');const title=document.createElement('span');title.className='folder-title';title.textContent='📁 '+folder.name;title.title=LakeOrganization.folderPath(folder.id,tideFolders);
      summary.append(title,libraryButton('＋','New subfolder',()=>openFolderDialog('create',null,folder.id)),libraryButton('✎','Edit folder',()=>openFolderDialog('edit',folder.id)),libraryButton('×','Remove folder',()=>removeTideFolder(folder.id)));
      const children=document.createElement('div');children.className='folder-items';
      const folderMatches=Boolean(query && (ancestorMatches || folder.name.toLowerCase().includes(query)));
      const hasChildren=addLevel(children,folder.id,folderMatches);
      if(query && !folderMatches && !hasChildren)continue;
      details.append(summary,children);details.open=Boolean(query)||!folder.collapsed;
      const profile=storageKey('folders');
      details.addEventListener('toggle',()=>{
        if(tideQuery || profile!==storageKey('folders') || !tideFolders.includes(folder) || folder.collapsed===!details.open)return;
        folder.collapsed=!details.open;persistTideFolders();
      });
      parent.append(details);found=true;
    }
    const sessions=allSessions.filter(session=>parentId ? session.folderId===parentId : !session.folderId || !folderIds.has(session.folderId));
    if(!parentId && tideFolders.length && sessions.some(session=>!query || matches(session))) {
      const heading=document.createElement('div');heading.className='unfiled-title';heading.textContent='Unfiled';parent.append(heading);
    }
    for(const session of sessions)if(!query || ancestorMatches || matches(session)){addChat(parent,session);found=true;}
    return found;
  }
  if(!addLevel(container,null)) {
    const empty=document.createElement('div');empty.className='unfiled-title';empty.textContent=query?'No matching tides':'No past tides yet';container.append(empty);
  }
  container.scrollTop=scrollTop;
}

async function persistTideFolders() {
  try {await LakeSessionStore.write(storageKey('folders'),tideFolders);return true;}
  catch(error){showToast('Folders could not be saved on this device.');console.warn(error);return false;}
}

function openFolderDialog(mode,id=null,parentId=null) {
  folderDialog={mode,id,profile:storageKey('sessions')};
  const folder=tideFolders.find(folder=>folder.id===id);
  const chat=allSessions.find(session=>session.id===id);
  const parent=document.getElementById('folderModalParent');parent.replaceChildren(new Option(mode==='move'?'Unfiled':'Top level',''));
  for(const candidate of tideFolders) {
    if(mode==='edit' && !LakeOrganization.canParent(id,candidate.id,tideFolders))continue;
    parent.append(new Option(LakeOrganization.folderPath(candidate.id,tideFolders),candidate.id));
  }
  parent.value=mode==='move'?(chat?.folderId||''):mode==='edit'?(folder?.parentId||''):(parentId||'');
  document.getElementById('folderNameField').hidden=mode==='move';
  document.getElementById('folderModalName').value=folder?.name||'';
  document.getElementById('folderModalTitle').textContent=mode==='move'?'Move Chat':mode==='edit'?'Edit Folder':'New Folder';
  document.getElementById('folderModalOverlay').classList.add('show');
  (mode==='move'?parent:document.getElementById('folderModalName')).focus();
}
function closeFolderDialog(){folderDialog=null;document.getElementById('folderModalOverlay').classList.remove('show');}
async function saveFolderDialog() {
  if(!folderDialog || folderDialog.profile!==storageKey('sessions')){closeFolderDialog();return;}
  const {mode,id,profile}=folderDialog;const parentId=document.getElementById('folderModalParent').value||null;
  if(parentId && !tideFolders.some(folder=>folder.id===parentId)){showToast('That folder is no longer available.');return;}
  if(mode==='move') {
    const chat=allSessions.find(session=>session.id===id);if(!chat)return;
    const previous=chat.folderId;chat.folderId=parentId;const saved=await persistSessions();
    if(profile!==storageKey('sessions'))return;
    if(!saved){chat.folderId=previous;return;}
  } else {
    const name=document.getElementById('folderModalName').value.trim();if(!name){document.getElementById('folderModalName').focus();return;}
    if(tideFolders.some(folder=>folder.id!==id && (folder.parentId||null)===parentId && folder.name.toLowerCase()===name.toLowerCase())){showToast('That location already has a folder with this name.');return;}
    if(!LakeOrganization.canParent(id,parentId,tideFolders)){showToast('A folder cannot be placed inside itself.');return;}
    const previous=tideFolders.map(folder=>({...folder}));
    if(mode==='edit' && !tideFolders.some(folder=>folder.id===id)){showToast('That folder is no longer available.');return;}
    if(mode==='edit')Object.assign(tideFolders.find(folder=>folder.id===id),{name,parentId});
    else tideFolders.push({id:crypto.randomUUID(),name,parentId,collapsed:false});
    const saved=await persistTideFolders();
    if(profile!==storageKey('sessions'))return;
    if(!saved){tideFolders=previous;return;}
  }
  closeFolderDialog();renderTides();
}
async function removeTideFolder(id) {
  const folder=tideFolders.find(folder=>folder.id===id);if(!folder)return;
  if(!confirm(`Remove "${folder.name}"? Its chats and subfolders will move to its parent; nothing inside will be deleted.`))return;
  const profile=storageKey('sessions');const previousFolders=tideFolders.map(item=>({...item}));const previousSessions=allSessions.map(session=>({...session}));
  allSessions.filter(session=>session.folderId===id).forEach(session=>{session.folderId=folder.parentId||null;});
  tideFolders.filter(item=>item.parentId===id).forEach(item=>{item.parentId=folder.parentId||null;});
  tideFolders=tideFolders.filter(item=>item.id!==id);
  const savedSessions=await persistSessions();if(profile!==storageKey('sessions'))return;
  if(!savedSessions){tideFolders=previousFolders;allSessions=previousSessions;renderTides();return;}
  const savedFolders=await persistTideFolders();if(profile!==storageKey('sessions'))return;
  if(!savedFolders)tideFolders=previousFolders;
  renderTides();
}

function showDepthsTab(tab) {
  const crew=tab==='crew';document.getElementById('depthsSettingsView').hidden=crew;document.getElementById('crewManagerView').hidden=!crew;
  document.getElementById('settingsTab').setAttribute('aria-selected',String(!crew));document.getElementById('crewTab').setAttribute('aria-selected',String(crew));
  document.querySelector('#depthsPanel .depths-header h3').textContent=crew?'Crew':'Depths';
  if(crew)renderCrewManager();
}
function openCrewManager(){showDepthsTab('crew');document.getElementById('depthsPanel').classList.add('show');}
function renderCrewManager() {
  const list=document.getElementById('crewManagerList');if(!list)return;list.replaceChildren();
  const query=document.getElementById('crewManagerSearch').value.toLowerCase();
  for(const [index,member] of crewMembers.entries()) {
    if(![member.name,member.nickname,member.role,member.context,member.codename].join(' ').toLowerCase().includes(query))continue;
    const row=document.createElement('div');row.className='manager-row';
    const name=document.createElement('div');name.className='manager-name';name.textContent=(member.isSelf?'⭐ ':'')+member.name;if(member.isSelf)name.title='This is you';
    const detail=document.createElement('div');detail.className='manager-detail';detail.textContent=[member.role,member.nickname].filter(Boolean).join(' · ');
    const tools=document.createElement('div');tools.className='manager-tools';
    const label=document.createElement('label');const visible=document.createElement('input');visible.type='checkbox';visible.checked=!member.hidden;visible.setAttribute('aria-label','Show '+member.name+' in sidebar');
    visible.onchange=()=>{const previous=member.hidden;member.hidden=!visible.checked;try{saveCrew();renderCrew();}catch(error){member.hidden=previous;visible.checked=!previous;showToast('Visibility could not be saved.');console.warn(error);}};
    label.append(visible,document.createTextNode('Show'));
    const select=document.createElement('select');select.setAttribute('aria-label','Connect '+member.name+' to Crew member');select.append(new Option('Connect duplicate to…',''));
    const matches=findCrewAliasMatch(member);
    const candidates=crewMembers.map((candidate,targetIndex)=>({candidate,targetIndex})).filter(item=>item.targetIndex!==index).sort((a,b)=>Number(matches.includes(b.candidate))-Number(matches.includes(a.candidate)));
    candidates.forEach(({candidate,targetIndex})=>select.append(new Option(candidate.name+(matches.includes(candidate)?' · possible match':''),String(targetIndex))));
    const link=libraryButton('🔗','Connect duplicate',()=>connectCrewMembers(index,Number(select.value)));link.disabled=true;select.onchange=()=>{link.disabled=select.value==='';};
    tools.append(label,libraryButton('✎','Edit '+member.name,()=>openCrewModal('edit',index)),select,link);
    row.append(name,detail,tools);list.append(row);
  }
  for(const [index,suggestion] of suggestedCrew.entries()) {
    if(![suggestion.name,suggestion.context].join(' ').toLowerCase().includes(query))continue;
    const row=document.createElement('div');row.className='manager-row';
    const name=document.createElement('div');name.className='manager-detail';name.textContent='Needs review: '+suggestion.name;
    row.append(name,libraryButton('✓','Review '+suggestion.name,()=>approveSuggested(index)),libraryButton('×','Dismiss '+suggestion.name,()=>dismissSuggested(index)));list.append(row);
  }
}
function connectCrewMembers(sourceIndex,targetIndex) {
  const source=crewMembers[sourceIndex];const target=crewMembers[targetIndex];if(!source || !target || source===target)return;
  if(!confirm(`Connect ${source.name} to ${target.name} as the same person? Aliases, notes and observations will be preserved. Original transcripts stay unchanged.`))return;
  const previous=crewMembers;
  crewMembers=crewMembers.map((member,index)=>index===targetIndex?LakeOrganization.mergeCrew(target,source):member).filter((_,index)=>index!==sourceIndex);
  try {saveCrew();renderCrew();}catch(error){crewMembers=previous;showToast('Crew connection could not be saved.');console.warn(error);}
}

function applyDockSplit(value,save=false) {
  const available=Math.max(1,document.getElementById('dockLibrary').clientHeight-document.getElementById('dockDivider').offsetHeight);
  const minimum=Math.min(0.4,Math.max(0.15,72/available));
  dockSplit=Math.max(minimum,Math.min(1-minimum,Number.isFinite(value)?value:0.65));
  document.getElementById('dockLibrary').style.setProperty('--tides-share',dockSplit);
  document.getElementById('dockDivider').setAttribute('aria-valuenow',String(Math.round(dockSplit*100)));
  if(save)try{localStorage.setItem(storageKey('dockSplit'),String(dockSplit));}catch{showToast('Sidebar split could not be saved.');}
}
function loadDockSplit() {let value=0.65;try{const saved=localStorage.getItem(storageKey('dockSplit'));if(saved!==null)value=Number(saved);}catch{}applyDockSplit(value);}
document.addEventListener('DOMContentLoaded',()=>{
  if(legacyShareId)return;
  const divider=document.getElementById('dockDivider');const library=document.getElementById('dockLibrary');let profile;
  divider.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();profile=storageKey('dockSplit');divider.setPointerCapture(event.pointerId);document.body.classList.add('dock-resizing');});
  divider.addEventListener('pointermove',event=>{if(!divider.hasPointerCapture(event.pointerId) || profile!==storageKey('dockSplit'))return;const bounds=library.getBoundingClientRect();applyDockSplit((event.clientY-bounds.top)/Math.max(1,bounds.height-divider.offsetHeight));});
  const finish=()=>{document.body.classList.remove('dock-resizing');if(profile===storageKey('dockSplit'))applyDockSplit(dockSplit,true);};
  divider.addEventListener('pointerup',finish);divider.addEventListener('pointercancel',finish);divider.addEventListener('lostpointercapture',finish);
  divider.addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();applyDockSplit(event.key==='Home'?0.15:event.key==='End'?0.85:dockSplit+(event.key==='ArrowDown'?0.05:-0.05),true);});
  divider.addEventListener('dblclick',()=>applyDockSplit(0.65,true));
  window.addEventListener('resize',()=>{if(currentUser)loadDockSplit();});
});
