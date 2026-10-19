const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.LAKE_PLAYWRIGHT_PATH || 'playwright');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1365,height:900}});
    await context.addInitScript(()=>{
      localStorage.setItem('lakeUser',JSON.stringify({name:'Ron',email:'profile@example.test'}));
      const observation=index=>({sessionId:'call-'+index,date:'2026-10-19T12:00:00Z',note:'Tentative observation '+index+': asks for a clear owner and next step.',sources:['2026-10-19_'+('long-filename-'.repeat(20))+index+'.txt'],meetingDates:[{date:'2026-10-19',status:'filename-candidate'}],evidence:'[00:01] Sally: Who owns this?\n[00:02] Ron: I will follow up.',reviewed:true});
      const observations=Array.from({length:30},(_,index)=>observation(index));observations.push(observation(0));
      localStorage.setItem('lake_profile@example.test_crew',JSON.stringify([{name:'Sally',nickname:'Sally, Sal',role:'CRM Lead',context:'<img src=x onerror=alert(1)>\n'+('Long saved note. Confirm before linking.\n\n'.repeat(400)),observations}]));
    });
    const page=await context.newPage();const errors=[];const prompts=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(process.env.LAKE_TEST_URL || 'http://localhost:3013');await page.waitForFunction(()=>crewMembers.length===1);
    await page.evaluate(()=>{window.originalMember=JSON.stringify(crewMembers[0]);sendPrompt=prompt=>window.profilePrompt=prompt;});
    for(const viewport of [{width:1365,height:900},{width:390,height:844},{width:320,height:568}]) {
      await page.setViewportSize(viewport);await page.evaluate(()=>openCrewProfile(0));
      const card=page.getByRole('dialog',{name:'Sally',exact:true});const body=page.locator('#crewCardBody');
      await card.evaluate(async element=>{await Promise.all(element.getAnimations().map(animation=>animation.finished));});
      assert.equal(await page.locator('#crewCardContext').textContent(),await page.evaluate(()=>crewMembers[0].context));assert.equal(await body.locator('img').count(),0);
      assert.match(await body.innerText(),/Meeting Evidence · 30/);
      const before=await page.locator('.crew-card-actions').boundingBox();
      const bounds=await card.boundingBox();assert.ok(bounds.y>=0 && bounds.y+bounds.height<=viewport.height);assert.ok(bounds.x>=0 && bounds.x+bounds.width<=viewport.width);
      await page.getByText('Show complete notes',{exact:true}).click();await body.evaluate(element=>element.scrollTop=element.scrollHeight);
      assert.ok(await body.evaluate(element=>element.scrollTop>0));const after=await page.locator('.crew-card-actions').boundingBox();assert.ok(Math.abs(before.y-after.y)<2,'Actions remain fixed while notes scroll');
      await body.evaluate(element=>element.scrollTop=0);await page.getByText('Show complete notes',{exact:true}).click();
      await page.locator('.crew-evidence-item summary').first().click();
      await page.screenshot({path:path.join(process.env.TEMP,`lake-crew-profile-${viewport.width}.png`),animations:'disabled'});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.getByRole('button',{name:'Close Crew profile',exact:true}).focus();await page.keyboard.press('Tab');assert.equal(await body.evaluate(element=>element===document.activeElement),true);
      await page.keyboard.press('Escape');assert.equal(await page.locator('#crewCardOverlay').evaluate(element=>element.classList.contains('show')),false);
    }
    await page.evaluate(()=>openCrewProfile(0));await page.getByRole('button',{name:'Ask The Lake',exact:false}).click();prompts.push(await page.evaluate(()=>window.profilePrompt));assert.match(prompts[0],/supported communication patterns/);assert.ok(prompts[0].length<1500);
    assert.equal(await page.evaluate(()=>JSON.stringify(crewMembers[0])===window.originalMember),true,'Profile rendering never rewrites saved notes');
    await page.evaluate(()=>openCrewProfile(0));await page.getByRole('button',{name:'Edit Crew member',exact:true}).click();await page.waitForSelector('#crewModalOverlay.show');assert.equal(await page.locator('#crewModalContext').inputValue(),await page.evaluate(()=>crewMembers[0].context));
    assert.deepEqual(errors,[]);console.log('Crew profile passed: bounded desktop/mobile dialog, fixed actions, scrollable full notes, grouped evidence, safe text, keyboard close/focus and concise suggestion prompts.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
