const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.LAKE_PLAYWRIGHT_PATH || 'playwright');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1365,height:900}});
    await context.addInitScript(()=>{
      localStorage.setItem('lakeUser',JSON.stringify({name:'Reviewer',email:'whole@example.test'}));
      if(localStorage.getItem('whole-seeded'))return;localStorage.setItem('whole-seeded','yes');
      const attachments=[1,2,3].map(number=>({sourceId:String(number),name:`call-part-00${number}-of-003.txt`,type:'text/plain',data:'data:text/plain;base64,'+btoa(`[00:0${number}] Erin: Important contribution from part ${number}.\n`+'Meeting detail.\n'.repeat(1500)),excluded:number!==2}));
      localStorage.setItem('lake_whole@example.test_sessions',JSON.stringify([{id:'whole',name:'Whole call',time:new Date().toISOString(),history:[{role:'user',content:'Call',attachments},{role:'assistant',content:'Old response',sourceReceipts:['1','2','3']}]}]));
    });
    const page=await context.newPage();const errors=[];const requests=[];let failSecond=true;
    page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
    await page.route('**/chat',async route=>{
      const req=route.request();const form=await new Response(req.postDataBuffer(),{headers:{'content-type':req.headers()['content-type']}}).formData();
      const files=await Promise.all(form.getAll('file').map(async file=>({name:file.name,text:await file.text()})));
      const action=form.get('action');const memory=JSON.parse(form.get('transcriptWorkingMemory')||'null');requests.push({action,files,memory});
      if(action==='transcript-memory') {
        if(files[0].name.includes('002') && failSecond){failSecond=false;await route.fulfill({status:429,json:{details:'Rate limited'}});return;}
        await route.fulfill({json:{reflection:'Part recorded.',model:'mock',transcriptMemory:{filename:files[0].name,notes:'Erin contribution in '+files[0].name}}});
      }else await route.fulfill({json:{reflection:'Meeting-wide reading of Erin across the three parts.',model:'mock'}});
    });
    await page.goto(process.env.LAKE_TEST_URL||'http://localhost:3013');await page.waitForFunction(()=>allSessions.length===1);await page.evaluate(()=>loadTide('whole'));
    await page.locator('#lakeInput').fill('Help me understand Erin across this meeting');
    await page.getByRole('button',{name:'Read whole transcript',exact:true}).click();await page.waitForFunction(()=>!wholeTranscriptJob && !waveInFlight);
    assert.equal(await page.evaluate(()=>LakeTranscriptReview.memory(transcriptSources(),chatHistory).parts.length),1);assert.equal(requests.filter(req=>req.action==='whole-transcript-analysis').length,0);
    await page.getByRole('button',{name:'Read whole transcript',exact:true}).click();await page.waitForFunction(()=>!wholeTranscriptJob && !waveInFlight);
    assert.equal(requests.filter(req=>req.action==='transcript-memory' && req.files[0].name.includes('001')).length,1,'Completed part is not reread after failure');
    const synthesis=requests.find(req=>req.action==='whole-transcript-analysis');assert.equal(synthesis.memory.parts.length,3);assert.equal(synthesis.memory.complete,true);
    assert.match(await page.locator('#transcriptStatus').innerText(),/Whole-transcript context ready: 3\/3/);
    assert.equal(await page.locator('#lakeInput').inputValue(),'Help me understand Erin across this meeting');
    await page.reload();await page.waitForFunction(()=>allSessions.length===1);await page.evaluate(()=>loadTide('whole'));
    assert.equal(await page.evaluate(()=>chatHistory[0].attachments.filter(file=>!file.excluded).length),1);
    await page.locator('#lakeInput').fill('Was Erin more influential in part 1 or part 2?');await page.locator('#lakeInput').press('Enter');await page.waitForFunction(()=>!waveInFlight);
    assert.equal(requests.at(-1).memory.parts.length,3,'Follow-up includes all part records despite only one selected source');
    assert.deepEqual(requests.at(-1).files.map(file=>file.name),['meeting-evidence.json']);
    const passages=JSON.parse(requests.at(-1).files[0].text).passages;assert.ok(passages.length);assert.match(passages[0].text,/Erin/);
    assert.match(await page.locator('.archive-coverage').last().innerText(),/compressed working record/);
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(process.env.TEMP,'lake-whole-transcript-mobile.png'),animations:'disabled'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.evaluate(async()=>{currentUser={name:'Other',email:'other@example.test'};await loadSessionHistory();loadCrew();newSession();});assert.equal(await page.evaluate(()=>LakeTranscriptReview.memory(transcriptSources(),chatHistory).complete),false);
    assert.deepEqual(errors,[]);console.log('Whole transcript passed: complete sequential ingestion, failure/resume, all-part synthesis, persistent follow-up memory, exact excerpt retrieval, mobile layout and profile isolation.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
