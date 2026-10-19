const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.LAKE_PLAYWRIGHT_PATH || 'playwright');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1365,height:900}});
    await context.addInitScript(()=>{
      localStorage.setItem('lakeUser',JSON.stringify({name:'Reviewer',email:'review@example.test'}));
      if(localStorage.getItem('review-seeded'))return;localStorage.setItem('review-seeded','true');
      const attachments=[1,3].map(number=>({name:`call-part-00${number}-of-003.txt`,type:'text/plain',data:'data:text/plain;base64,'+btoa(`[00:0${number}] Ron: Exact original part ${number}.\r\n`),excluded:number!==1}));
      localStorage.setItem('lake_review@example.test_sessions',JSON.stringify([{id:'review',name:'Call',time:new Date().toISOString(),history:[{role:'user',content:'Read the call',attachments},{role:'assistant',content:'Earlier reply without tracked receipts.'}]}]));
    });
    const page=await context.newPage();const errors=[];const requests=[];let fail=true;
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/chat',async route=>{
      const req=route.request();const form=await new Response(req.postDataBuffer(),{headers:{'content-type':req.headers()['content-type']}}).formData();
      requests.push({inventory:JSON.parse(form.get('transcriptInventory')),files:await Promise.all(form.getAll('file').map(async file=>({name:file.name,text:await file.text()})))});
      if(fail){fail=false;await route.fulfill({status:429,json:{details:'Try again'}});}else await route.fulfill({json:{reflection:'Selected exact part received.',model:'mock',...(form.get('action')==='transcript-memory'?{transcriptMemory:{filename:form.getAll('file')[0].name,notes:'Exact part working record.'}}:{})}});
    });
    await page.goto(process.env.LAKE_TEST_URL || 'http://localhost:3012');await page.waitForFunction(()=>allSessions.length===1);await page.evaluate(()=>loadTide('review'));
    const status=page.locator('#transcriptStatus');assert.match(await status.innerText(),/missing part 2 of 3/);
    const actions=await page.locator('.tide-item button').evaluateAll(buttons=>buttons.map(button=>({label:button.getAttribute('aria-label'),text:button.textContent})));
    assert.equal(actions[0].label,'Delete chat');assert.equal(actions[0].text,'🗑');
    await page.locator('#fileInput').setInputFiles({name:'call-part-002-of-003.txt',mimeType:'text/plain',buffer:Buffer.from('[00:02] Sally: Exact original part 2.\r\n')});
    assert.match(await status.innerText(),/3 attached/);assert.doesNotMatch(await status.innerText(),/missing part/);
    await page.locator('#lakeInput').fill('Keep my question');
    async function next(){await page.getByRole('button',{name:'Read next part',exact:true}).click();await page.waitForFunction(()=>!waveInFlight);}
    await next();assert.match(await status.innerText(),/0 sent successfully/);
    await next();assert.match(await status.innerText(),/1 sent successfully/);
    assert.equal(requests[1].files[0].name,'call-part-001-of-003.txt');assert.equal(requests[1].files.length,1);
    await next();assert.equal(requests.at(-1).files[0].name,'call-part-002-of-003.txt');
    await next();assert.match(await status.innerText(),/Whole-transcript context ready: 3\/3/);assert.equal(requests.at(-1).files[0].name,'call-part-003-of-003.txt');
    assert.equal(await page.locator('#lakeInput').inputValue(),'Keep my question');
    await page.reload();await page.waitForFunction(()=>allSessions.length===1);await page.evaluate(()=>loadTide('review'));assert.match(await status.innerText(),/Whole-transcript context ready: 3\/3/);
    await page.getByRole('button',{name:'Read together',exact:true}).click();await page.waitForFunction(()=>!waveInFlight);assert.equal(requests.at(-1).files.length,3);
    assert.match(requests.at(-1).files.find(file=>file.name.includes('002')).text,/Exact original part 2/);
    await page.locator('#fileInput').setInputFiles({name:'too-long.txt',mimeType:'text/plain',buffer:Buffer.from('x'.repeat(30000))});
    const count=requests.length;await page.getByRole('button',{name:'Read together',exact:true}).click();await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('Nothing was sent or summarized'));assert.equal(requests.length,count);
    await page.locator('#toast').evaluate(element=>element.classList.remove('show'));
    await page.locator('.tide-item').hover();await page.screenshot({path:path.join(process.env.TEMP,'lake-transcript-review-desktop.png'),animations:'disabled'});
    await page.setViewportSize({width:390,height:844});await page.locator('#sourceMenuButton').click();
    assert.match(await page.locator('#sourceMenu').innerText(),/Files for the next message/);await page.getByText('What counts as full context?',{exact:true}).click();
    const bounds=await page.locator('#sourceMenu').boundingBox();assert.ok(bounds.x>=0 && bounds.x+bounds.width<=390);assert.ok(bounds.y>=0 && bounds.y+bounds.height<=844);
    await page.screenshot({path:path.join(process.env.TEMP,'lake-transcript-review-mobile.png'),animations:'disabled'});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.evaluate(async()=>{currentUser={name:'Other',email:'other@example.test'};await loadSessionHistory();loadCrew();newSession();});assert.equal(await status.isVisible(),false);
    assert.deepEqual(errors,[]);console.log('Transcript review passed: missing parts, exact receipts, retries, next-part workflow, combined reading and size guard, persistence, delete action, mobile layout and profile isolation.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
