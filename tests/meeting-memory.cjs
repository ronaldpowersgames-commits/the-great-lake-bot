const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.LAKE_PLAYWRIGHT_PATH || 'playwright');
const base=process.env.LAKE_TEST_URL || 'http://localhost:3012';
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1365,height:900}});
    const errors=[];const requests=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      if(localStorage.getItem('meeting-seeded'))return;
      localStorage.setItem('meeting-seeded','yes');
      localStorage.setItem('lakeUser',JSON.stringify({name:'Ron',email:'meetings@example.test'}));
      const attachment=(name,text)=>({name,type:'text/plain',data:'data:text/plain;base64,'+btoa(text),excluded:true});
      localStorage.setItem('lake_meetings@example.test_sessions',JSON.stringify([
        {id:'aug',name:'August call',time:'2026-08-31',history:[{role:'user',time:'09:00',content:'August meeting',attachments:[attachment('2026-08-31-call.txt','[00:01] Robby: I will send the plan.\r\n')]}]},
        {id:'sep',name:'September call',time:'2026-09-07',history:[{role:'user',time:'09:00',content:'September meeting',attachments:[attachment('2026-09-07-call.txt','[00:02] Robert: The plan is ready.\r\n')]}]}
      ]));
      localStorage.setItem('lake_meetings@example.test_crew',JSON.stringify([{name:'Robert Smith',nickname:'Robby, Robert'}]));
      localStorage.setItem('lake_other@example.test_sessions',JSON.stringify([{id:'private',history:[{role:'user',attachments:[attachment('2026-10-01-private.txt','PRIVATE_OTHER_ACCOUNT')]}]}]));
    });
    await page.route('**/chat',async route=>{
      const req=route.request();const form=await new Response(req.postDataBuffer(),{headers:{'content-type':req.headers()['content-type']}}).formData();
      requests.push({action:form.get('action'),metadata:JSON.parse(form.get('sourceMetadata')),files:await Promise.all(form.getAll('file').map(async file=>({name:file.name,text:await file.text()})))});
      await route.fulfill({json:{reflection:'A source-grounded meeting read.',model:'mock'}});
    });
    await page.goto(base);await page.waitForFunction(()=>allSessions.length===2);
    await page.evaluate(()=>newSession());
    await page.locator('#fileInput').setInputFiles({name:'2026-10-12-call.txt',mimeType:'text/plain',buffer:Buffer.from('[00:03] Roby: I will revise the plan tomorrow.\r\n')});
    await page.locator('#sourceMenuButton').click();
    const dateInput=page.locator('input[aria-label="Meeting date for 2026-10-12-call.txt"]');
    assert.equal(await dateInput.inputValue(),'2026-10-12');
    await dateInput.fill('2026-10-13');await dateInput.dispatchEvent('change');
    await page.locator('#lakeInput').fill('Read this call');await page.locator('#lakeInput').press('Control+Enter');await page.waitForFunction(()=>!waveInFlight);
    assert.equal(requests[0].metadata[0].meetingDate,'2026-10-13');
    const suggestion=page.locator('.suggested-item').filter({hasText:'Roby'});
    await suggestion.getByRole('button',{name:'Review player'}).click();
    await page.locator('#crewMatchSelect').selectOption('0');await page.evaluate(()=>saveCrewFromModal());
    assert.match(await page.evaluate(()=>crewMembers[0].nickname),/Roby/);
    assert.equal(await page.evaluate(()=>crewMembers[0].observations[0].meetingDates[0].date),'2026-10-13');
    await page.locator('#lakeInput').fill('Robert Smith commitments');
    await page.getByRole('button',{name:'Meeting Currents',exact:true}).click();await page.waitForFunction(()=>!waveInFlight);
    const archive=requests.at(-1);assert.equal(archive.action,'meeting-currents');
    assert.deepEqual(archive.files.map(file=>file.name),['meeting-evidence.json']);
    const evidence=JSON.parse(archive.files[0].text);
    assert.equal(evidence.coverage.indexed_meetings,3);assert.equal(evidence.coverage.represented_meetings,3);
    assert.match(archive.files[0].text,/Robby: I will send/);assert.match(archive.files[0].text,/Robert: The plan is ready/);assert.match(archive.files[0].text,/Roby: I will revise/);
    assert.doesNotMatch(archive.files[0].text,/PRIVATE_OTHER_ACCOUNT/);
    assert.equal(evidence.passages.find(part=>part.filename==='2026-10-12-call.txt').meeting_date.status,'user-reviewed');
    assert.match(await page.locator('#wavesContainer').innerText(),/Archive evidence: 3 passages from 3\/3/);
    await page.screenshot({path:path.join(process.env.TEMP,'lake-meeting-memory-desktop.png')});
    await page.setViewportSize({width:390,height:844});
    await page.getByText('Archive sources',{exact:true}).click();
    await page.screenshot({path:path.join(process.env.TEMP,'lake-meeting-memory-mobile.png')});
    await page.locator('.archive-source-btn').filter({hasText:'2026-08-31-call.txt'}).click();
    assert.equal(await page.evaluate(()=>currentSessionId),'aug');
    await page.locator('#sourceMenuButton').click();
    assert.equal(await page.locator('input[aria-label="Meeting date for 2026-08-31-call.txt"]').inputValue(),'2026-08-31');
    assert.deepEqual(errors,[]);
    console.log('Meeting memory passed: filename dates, corrections, fuzzy identity review, saved aliases, cross-meeting exact retrieval, profile isolation and source navigation.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
