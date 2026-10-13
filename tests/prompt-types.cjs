const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.LAKE_PLAYWRIGHT_PATH || 'playwright');
const types=require('../public/prompt-types');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1365,height:900},hasTouch:true});
    await context.addInitScript(()=>localStorage.setItem('lakeUser',JSON.stringify({name:'Type Tester',email:'types@example.test'})));
    const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(process.env.LAKE_TEST_URL || 'http://localhost:3012');
    await page.waitForSelector('#promptCarouselTrack[data-types-ready]');
    await page.evaluate(()=>{window.chosen=[];sendPrompt=text=>chosen.push(text);});
    for(const fresh of [false,true]) {
      if(fresh)await page.evaluate(()=>newSession());
      assert.equal(await page.locator('.prompt-batch').count(),7);
      assert.equal(await page.locator('.carousel-dot').count(),7);
      for(const [index,type] of types.entries()) {
        await page.getByRole('button',{name:'Type: '+type.name,exact:true}).click();
        const batch=page.locator('.prompt-batch').nth(index);
        assert.equal(await batch.locator('.batch-label').innerText(),type.icon+' Type: '+type.name);
        assert.equal(await batch.locator('.welcome-prompt-half').count(),12);
        assert.equal(await batch.locator('.welcome-prompts-grid').count(),2);
        const scroll=batch.locator('.prompt-group-scroll');
        await scroll.evaluate(element=>element.scrollTo({top:element.clientHeight,behavior:'instant'}));
        await page.waitForFunction(index=>{const e=document.querySelectorAll('.prompt-group-scroll')[index];return e.scrollTop===e.clientHeight;},index);
        await batch.getByRole('button',{name:'Use This Type'}).click();
        assert.match(await page.evaluate(()=>chosen.at(-1)),new RegExp('Type: '+type.name));
      }
    }
    await page.getByRole('button',{name:'Type: Learn',exact:true}).click();
    await page.locator('#promptCarouselTrack').evaluate(async track=>{await Promise.all(track.getAnimations().map(animation=>animation.finished));});
    const learn=page.locator('.prompt-group-scroll').nth(5);
    await learn.evaluate(element=>element.scrollTo({top:0,behavior:'instant'}));
    await learn.hover();await page.mouse.wheel(0,150);
    await page.waitForFunction(()=>document.querySelectorAll('.prompt-group-scroll')[5].scrollTop===128);
    await page.screenshot({path:path.join(process.env.TEMP,'lake-types-desktop.png'),animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    for(const index of [4,5,6]) {
      await page.getByRole('button',{name:'Type: '+types[index].name,exact:true}).click();
      const scroll=page.locator('.prompt-group-scroll').nth(index);
      await scroll.evaluate(element=>element.scrollTo({top:0,behavior:'instant'}));
      await page.screenshot({path:path.join(process.env.TEMP,'lake-type-'+types[index].name.toLowerCase()+'.png'),animations:'disabled'});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const buttons=await page.locator('.prompt-batch').nth(index).locator('button.welcome-prompt-half').evaluateAll(elements=>elements.map(e=>({width:e.clientWidth,scroll:e.scrollWidth})));
      assert.ok(buttons.every(button=>button.scroll<=button.width),'Prompt labels fit');
    }
    const group=page.locator('.prompt-group-scroll').nth(6);const box=await group.boundingBox();
    const client=await context.newCDPSession(page);const touch={x:Math.round(box.x+box.width/2),y:Math.round(box.y+box.height-12),id:1};
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});
    for(const offset of [25,50,80,110])await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...touch,y:touch.y-offset}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>document.querySelectorAll('.prompt-group-scroll')[6].scrollTop===128);
    assert.equal(await page.evaluate(()=>currentBatch),6,'Vertical gesture does not switch Type');
    assert.deepEqual(errors,[]);
    console.log('Prompt Types passed: seven Types, twelve prompts each, grouped vertical snap scrolling, usage guides, reset and mobile layouts.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
