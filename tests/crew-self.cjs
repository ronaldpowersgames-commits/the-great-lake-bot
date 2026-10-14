const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.LAKE_PLAYWRIGHT_PATH || 'playwright');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.addInitScript(()=>{
      localStorage.setItem('lakeUser',JSON.stringify({name:'Punzle',email:'self@example.test'}));
      if(!localStorage.getItem('lake_self@example.test_crew'))localStorage.setItem('lake_self@example.test_crew',JSON.stringify([{name:'Ronald Powers',nickname:'Ron, Ronnie'},{name:'Sally'}]));
    });
    const page=await context.newPage();const errors=[];const sent=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/chat',async route=>{
      const req=route.request();const form=await new Response(req.postDataBuffer(),{headers:{'content-type':req.headers()['content-type']}}).formData();sent.push(JSON.parse(form.get('userCrew')));
      await route.fulfill({json:{reflection:'Noted',model:'test'}});
    });
    await page.goto(process.env.LAKE_TEST_URL || 'http://localhost:3012');await page.waitForFunction(()=>crewMembers.length===2);
    async function mark(index,checked){await page.evaluate(index=>openCrewModal('edit',index),index);await page.locator('#crewModalSelf').setChecked(checked);await page.locator('.crew-modal-save').first().click();}
    await mark(0,true);assert.equal(await page.evaluate(()=>crewMembers.filter(m=>m.isSelf).length),1);
    await page.reload();await page.waitForFunction(()=>crewMembers[0]?.isSelf===true);
    await page.evaluate(()=>openCrewManager());assert.match(await page.locator('#crewManagerList').innerText(),/⭐ Ronald Powers/);
    await page.screenshot({path:path.join(process.env.TEMP,'lake-self-crew-mobile.png'),animations:'disabled'});
    await mark(1,true);assert.equal(await page.evaluate(()=>crewMembers[0].isSelf),false);
    await mark(1,false);assert.equal(await page.evaluate(()=>crewMembers.some(m=>m.isSelf)),false);
    await mark(0,true);await page.evaluate(()=>toggleDepths());await page.locator('#lakeInput').fill('What did I say?');await page.locator('#lakeInput').press('Control+Enter');await page.waitForFunction(()=>!waveInFlight);
    assert.equal(sent.at(-1)[0].name,'Ronald Powers');assert.equal(sent.at(-1)[0].aliases,'Ron, Ronnie');
    await page.evaluate(async()=>{currentUser={name:'Other',email:'other@example.test'};await loadSessionHistory();loadCrew();});assert.equal(await page.evaluate(()=>crewMembers.some(m=>m.isSelf)),false);
    assert.deepEqual(errors,[]);console.log('Self Crew passed: star, single selection, clear/change, reload, outgoing identity, mobile layout and profile isolation.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
