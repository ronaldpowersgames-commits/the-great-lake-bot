const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.LAKE_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.LAKE_TEST_URL || 'http://localhost:3011';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
    await context.addInitScript(() => {
      if (localStorage.getItem('continuity-seeded')) return;
      localStorage.setItem('continuity-seeded','yes');
      localStorage.setItem('lakeUser',JSON.stringify({name:'Ron',email:'continuity@example.test'}));
      localStorage.setItem('lake_continuity@example.test_sessions',JSON.stringify([{id:'original',name:'Named chat',mood:'calm',history:[
        {role:'user',content:'Original source',attachments:[{name:'source.txt',type:'text/plain',data:'data:text/plain;base64,c291cmNl'}]},
        {role:'assistant',content:'Earlier reply'}
      ]}]));
      localStorage.setItem('lake_continuity@example.test_crew',JSON.stringify([{name:'Jo',nickname:'Jojo'}]));
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror',error => errors.push(error.message));
    let release;
    const sent = [];
    await page.route('**/chat', async route => {
      const request = route.request();
      const form = await new Response(request.postDataBuffer(),{headers:{'content-type':request.headers()['content-type']}}).formData();
      sent.push({mood:form.get('mood'),history:form.get('history'),files:form.getAll('file').length,crew:form.get('crew')});
      await new Promise(resolve => {release=resolve;});
      await route.fulfill({json:{reflection:'A delayed reply for this conversation.',model:'mock-only'}});
    });
    await page.goto(base);
    await page.waitForFunction(() => allSessions.length === 1);
    await page.evaluate(() => loadTide('original'));
    await page.evaluate(async () => {setMood('stormy'); await saveSession();setMood('analytical');await saveSession();});
    assert.deepEqual(await page.evaluate(() => ({id:currentSessionId,count:chatHistory.length,mood:currentMood})),{id:'original',count:2,mood:'analytical'});
    await page.locator('#lakeInput').fill('Unpack the reply');
    await page.locator('#lakeInput').press('Control+Enter');
    await page.waitForFunction(() => waveInFlight && chatHistory.length === 3);
    while (!release) await new Promise(resolve => setTimeout(resolve,20));
    assert.equal(sent[0].mood,'analytical');
    assert.equal(sent[0].files,1);
    assert.match(sent[0].history,/Original source/);
    assert.match(sent[0].crew,/Jojo/);
    await page.evaluate(async () => {setMood('stormy');await saveSession();newSession();});
    release();
    await page.waitForFunction(() => !waveInFlight);
    assert.equal(await page.evaluate(() => chatHistory.length),0);
    assert.equal(await page.locator('.reply-notice').count(),1);
    await page.screenshot({path:path.join(process.env.TEMP,'lake-reply-ready-mobile.png')});
    await page.locator('.reply-notice').click();
    assert.deepEqual(await page.evaluate(() => ({id:currentSessionId,mood:currentMood,count:chatHistory.length})),{id:'original',mood:'stormy',count:4});
    assert.equal(await page.locator('#dock').evaluate(el => el.classList.contains('open')),false);
    await page.evaluate(() => toggleDepths());
    const button = page.getByRole('button',{name:'Export Full Data + Transfer Prompt'});
    const bounds = await button.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    assert.equal(await button.evaluate(el => el.scrollWidth <= el.clientWidth),true);
    await button.scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(process.env.TEMP,'lake-full-backup-mobile.png')});
    const downloadEvent = page.waitForEvent('download');
    await button.click();
    const download = await downloadEvent;
    const backup = JSON.parse(fs.readFileSync(await download.path(),'utf8'));
    assert.equal(backup.format_version,'lake-full-backup/1');
    assert.equal(backup.data.conversations[0].name,'Named chat');
    assert.equal(backup.data.conversations[0].history[0].attachments[0].data,'data:text/plain;base64,c291cmNl');
    assert.equal(backup.data.crew[0].nickname,'Jojo');
    assert.equal(backup.coverage.message_count,4);
    assert.match(backup.transfer_prompt,/reconstruct continuity/);
    await page.evaluate(() => toggleDepths());
    release = null;
    await page.locator('#lakeInput').fill('Deleted pending question');
    await page.locator('#lakeInput').press('Control+Enter');
    while (!release) await new Promise(resolve => setTimeout(resolve,20));
    await page.evaluate(() => deleteSession({stopPropagation(){}},'original'));
    release();
    await page.waitForFunction(() => !waveInFlight);
    assert.equal(await page.evaluate(() => allSessions.length),0);
    assert.equal(await page.locator('.reply-notice').count(),0);
    await page.reload();
    await page.evaluate(() => sessionLoadPromise);
    assert.equal(await page.evaluate(() => allSessions.length),0);
    release = null;
    await page.locator('#lakeInput').fill('Private question from the original profile');
    await page.locator('#lakeInput').press('Control+Enter');
    while (!release) await new Promise(resolve => setTimeout(resolve,20));
    const originId = await page.evaluate(() => currentSessionId);
    await page.evaluate(async () => {
      currentUser = {name:'Other',email:'other@example.test'};
      await loadSessionHistory();
      newSession();
    });
    release();
    await page.waitForFunction(() => !waveInFlight);
    assert.equal(await page.evaluate(() => allSessions.length),0);
    assert.equal(await page.evaluate(() => chatHistory.length),0);
    assert.equal(await page.locator('.reply-notice').count(),0);
    const originHistory = await page.evaluate(async id => {
      const sessions = await LakeSessionStore.read('lake_continuity@example.test_sessions');
      return sessions.find(session => session.id === id).history;
    },originId);
    assert.equal(originHistory.at(-1).content,'A delayed reply for this conversation.');
    assert.deepEqual(errors,[]);
    console.log('Conversation continuity passed: mode switches, delayed reply navigation, mobile layout, full backup, deleted-chat persistence and cross-profile isolation.');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
