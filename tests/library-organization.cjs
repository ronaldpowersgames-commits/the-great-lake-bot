const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.LAKE_PLAYWRIGHT_PATH || 'playwright');
const base=process.env.LAKE_TEST_URL || 'http://localhost:3012';
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1365,height:900},acceptDownloads:true,hasTouch:true});
    await context.addInitScript(()=>{
      if(localStorage.getItem('organization-seeded'))return;
      localStorage.setItem('organization-seeded','yes');
      localStorage.setItem('lakeUser',JSON.stringify({name:'Ron',email:'organization@example.test'}));
      localStorage.setItem('lake_organization@example.test_sessions',JSON.stringify([{id:'call',name:'Read this transcript',time:'2026-08-31',history:[{role:'user',content:'Read this transcript',time:'09:00',attachments:[{name:'2026-08-31_Weekly_UA_Sync-part-001-of-003.txt',type:'text/plain',data:'data:text/plain;base64,'+btoa('[00:01] Robby: I will send the plan.\r\n')}]}]}]));
      localStorage.setItem('lake_organization@example.test_crew',JSON.stringify([
        {id:'robert',name:'Robert Smith',nickname:'Robby',role:'CRM Lead',context:'Original target notes',observations:[{sessionId:'one',evidence:'First evidence',reviewed:true}]},
        {id:'roby',name:'Roby',role:'CRM Analyst',context:'Source notes',observations:[{sessionId:'two',evidence:'Second evidence',meetingDates:[{date:'2026-09-07'}],reviewed:true}]},
        {id:'sally',name:'Sally',role:'Marketing'}
      ]));
    });
    const page=await context.newPage();const errors=[];const sent=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?'My custom call':undefined));
    await page.route('**/chat',async route=>{
      const req=route.request();const form=await new Response(req.postDataBuffer(),{headers:{'content-type':req.headers()['content-type']}}).formData();
      sent.push({crew:JSON.parse(form.get('crew')),files:form.getAll('file').map(file=>file.name)});
      await route.fulfill({json:{reflection:'Reply with retained context.',model:'mock'}});
    });
    await page.goto(base);await page.evaluate(()=>sessionLoadPromise);
    assert.equal(await page.evaluate(()=>allSessions[0].name),'2026-08-31_Weekly_UA_Sync');
    const original=await page.evaluate(()=>allSessions[0].history[0].attachments[0].data);
    await page.getByRole('button',{name:'New folder',exact:true}).click();
    await page.locator('#folderModalName').fill('Weekly UA Sync');await page.evaluate(()=>saveFolderDialog());
    const root=await page.evaluate(()=>tideFolders[0].id);
    await page.getByRole('button',{name:'New subfolder',exact:true}).click();
    await page.locator('#folderModalName').fill('August calls');await page.evaluate(()=>saveFolderDialog());
    const child=await page.evaluate(()=>tideFolders.find(folder=>folder.name==='August calls').id);
    await page.getByRole('button',{name:'Move chat',exact:true}).click();await page.locator('#folderModalParent').selectOption(child);await page.evaluate(()=>saveFolderDialog());
    assert.equal(await page.evaluate(()=>allSessions[0].folderId),child);
    await page.evaluate(id=>openFolderDialog('edit',id),root);
    assert.equal(await page.locator(`#folderModalParent option[value="${child}"]`).count(),0);
    await page.evaluate(()=>closeFolderDialog());
    await page.evaluate(id=>{tideFolders.find(folder=>folder.id===id).collapsed=true;return persistTideFolders();},root);
    await page.reload();await page.evaluate(()=>sessionLoadPromise);
    assert.equal(await page.locator(`details[data-folder-id="${root}"]`).evaluate(node=>node.open),false);
    await page.locator('.sonar-input').fill('2026-08-31');
    assert.equal(await page.locator('.tide-item').count(),1);
    assert.equal(await page.locator(`details[data-folder-id="${root}"]`).evaluate(node=>node.open),true);
    await page.locator('.sonar-input').fill('');
    assert.equal(await page.locator(`details[data-folder-id="${root}"]`).evaluate(node=>node.open),false);
    await page.locator(`details[data-folder-id="${root}"] > summary .folder-title`).click();
    await page.getByRole('button',{name:'Rename chat',exact:true}).click();
    await page.waitForFunction(()=>allSessions[0].name==='My custom call');
    await page.evaluate(()=>loadTide('call'));await page.locator('#lakeInput').fill('Follow up');await page.locator('#lakeInput').press('Control+Enter');await page.waitForFunction(()=>!waveInFlight);
    assert.equal(await page.evaluate(()=>allSessions[0].name),'My custom call');
    assert.equal(await page.evaluate(()=>allSessions[0].history[0].attachments[0].data),original);
    const divider=page.getByRole('separator',{name:'Resize Past Tides and Crew'});const before=await page.locator('.tides-pane').boundingBox();const bounds=await divider.boundingBox();
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2,bounds.y-90,{steps:6});await page.mouse.up();
    assert.ok((await page.locator('.tides-pane').boundingBox()).height<before.height-50);
    await divider.focus();await page.keyboard.press('ArrowDown');
    const share=await page.evaluate(()=>dockSplit);await page.reload();await page.evaluate(()=>sessionLoadPromise);
    assert.ok(Math.abs(await page.evaluate(()=>dockSplit)-share)<0.01);
    await page.getByRole('button',{name:'Manage Crew and settings',exact:true}).click();
    assert.equal(await page.locator('#crewTab').getAttribute('aria-selected'),'true');
    await page.getByRole('checkbox',{name:'Show Robert Smith in sidebar'}).uncheck();
    assert.equal(await page.locator('#crewList .crew-item').filter({hasText:'Robert Smith'}).count(),0);
    await page.getByRole('button',{name:'Edit Robert Smith',exact:true}).click();
    await page.locator('#crewModalRole').fill('CRM Director');await page.locator('#crewModalContext').fill('Updated target notes');await page.evaluate(()=>saveCrewFromModal());
    const select=page.getByRole('combobox',{name:'Connect Roby to Crew member'});await select.selectOption('0');
    await select.locator('..').getByRole('button',{name:'Connect duplicate'}).click();
    assert.equal(await page.evaluate(()=>crewMembers.length),2);
    const person=await page.evaluate(()=>crewMembers.find(member=>member.name==='Robert Smith'));
    assert.equal(person.role,'CRM Director');assert.equal(person.hidden,true);assert.match(person.nickname,/Roby/);assert.match(person.context,/Source notes/);assert.match(person.context,/CRM Analyst/);assert.equal(person.observations.length,2);
    await page.screenshot({path:path.join(process.env.TEMP,'lake-crew-manager-desktop.png')});
    await page.getByRole('tab',{name:'Settings',exact:true}).click();
    const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export Full Data + Transfer Prompt',exact:false}).click();const download=await downloadEvent;
    const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(backup.data.folders.length,2);assert.equal(backup.data.conversations[0].folderId,child);assert.equal(backup.data.settings.dockSplit,share);assert.equal(backup.data.crew[0].hidden,true);
    await page.evaluate(()=>toggleDepths());await page.evaluate(()=>loadTide('call'));await page.locator('#lakeInput').fill('Continue');await page.locator('#lakeInput').press('Control+Enter');await page.waitForFunction(()=>!waveInFlight);
    assert.equal(sent.at(-1).crew.find(member=>member.name==='Robert Smith').role,'CRM Director');assert.match(JSON.stringify(sent.at(-1).crew),/Roby/);
    await page.evaluate(id=>removeTideFolder(id),root);
    assert.equal(await page.evaluate(()=>allSessions.length),1);assert.equal(await page.evaluate(()=>tideFolders[0].parentId),null);assert.equal(await page.evaluate(()=>allSessions[0].folderId),child);
    await page.setViewportSize({width:390,height:844});await page.locator('#dockToggle').click();
    await page.locator('#dock').evaluate(async dock=>{await Promise.all(dock.getAnimations().map(animation=>animation.finished));});
    const touchBounds=await divider.boundingBox();const client=await context.newCDPSession(page);const touch={x:Math.round(touchBounds.x+touchBounds.width/2),y:Math.round(touchBounds.y+touchBounds.height/2),id:1};const oldShare=await page.evaluate(()=>dockSplit);
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...touch,y:touch.y+50}]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok(await page.evaluate(()=>dockSplit)>oldShare);
    await page.screenshot({path:path.join(process.env.TEMP,'lake-folders-mobile.png')});
    await page.getByRole('button',{name:'Manage Crew and settings',exact:true}).click();await page.screenshot({path:path.join(process.env.TEMP,'lake-crew-manager-mobile.png')});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.evaluate(async()=>{currentUser={name:'Other',email:'other@example.test'};await loadSessionHistory();loadCrew();});
    assert.equal(await page.evaluate(()=>tideFolders.length),0);assert.equal(await page.evaluate(()=>allSessions.length),0);assert.equal(await page.evaluate(()=>crewMembers.length),0);
    assert.deepEqual(errors,[]);
    console.log('Organization passed: file titles, manual names, nested folders, search/collapse, safe folder removal, Crew visibility/roles/merging, backups, pointer/touch/keyboard divider and profile isolation.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
