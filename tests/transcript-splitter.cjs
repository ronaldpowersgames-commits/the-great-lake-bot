const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.LAKE_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.LAKE_TEST_URL || 'http://localhost:3011';
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const context = await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:900}});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror',error => errors.push(error.message));
    await page.goto(base + '/transcript-splitter.html');
    const original = '\ufeff[00:00:01] Sam: exact text 😀\r\n\r\n'.repeat(1800) + '[01:02:15] Craig: Yeah.\r\n';
    await page.locator('#file').setInputFiles({name:'original.txt',mimeType:'text/plain',buffer:Buffer.from(original)});
    await page.waitForFunction(() => document.getElementById('status').textContent === 'File loaded locally.');
    await page.locator('#split').click();
    const texts = [];
    for (const button of await page.locator('#parts button').all()) {
      const event = page.waitForEvent('download');
      await button.click();
      const download = await event;
      assert.match(download.suggestedFilename(),/part-\d+-of-\d+\.txt$/);
      texts.push(fs.readFileSync(await download.path(),'utf8'));
    }
    assert.equal(texts.join(''),original);
    assert.ok(texts.every(text => text.length <= 12000));
    await page.screenshot({path:path.join(process.env.TEMP,'lake-transcript-splitter-desktop.png')});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    await page.screenshot({path:path.join(process.env.TEMP,'lake-transcript-splitter-mobile.png')});
    await page.addInitScript(() => {
      localStorage.setItem('lakeUser',JSON.stringify({name:'Ron',email:'exact@example.test'}));
      localStorage.setItem('lake_exact@example.test_sessions',JSON.stringify([{id:'exact',name:'Exact transcript',history:[
        {role:'user',content:'Part one',attachments:[{name:'part-one.txt',type:'text/plain',data:'data:text/plain;base64,b25l'}]},
        {role:'user',content:'Part two',attachments:[{name:'part-two.txt',type:'text/plain',data:'data:text/plain;base64,dHdv'}]}
      ]}]));
    });
    const uploaded = [];
    await page.route('**/chat',async route => {
      const request = route.request();
      const form = await new Response(request.postDataBuffer(),{headers:{'content-type':request.headers()['content-type']}}).formData();
      uploaded.push(form.getAll('file').map(file => file.name));
      await route.fulfill({json:{reflection:'Exact selected source received.',model:'mock'}});
    });
    await page.goto(base);
    await page.waitForFunction(() => allSessions.length === 1);
    await page.evaluate(() => loadTide('exact'));
    await page.locator('#sourceMenuButton').click();
    await page.getByLabel('part-one.txt',{exact:true}).uncheck();
    assert.match(await page.locator('#sourceMenuButton').innerText(),/1\/2/);
    await page.locator('#lakeInput').fill('Analyze the second original part');
    await page.locator('#lakeInput').press('Control+Enter');
    await page.waitForFunction(() => !waveInFlight);
    assert.deepEqual(uploaded[0],['part-two.txt']);
    assert.equal(await page.evaluate(() => chatHistory[0].attachments[0].data),'data:text/plain;base64,b25l');
    await page.evaluate(() => loadTide('exact'));
    await page.locator('#sourceMenuButton').click();
    assert.equal(await page.getByLabel('part-one.txt',{exact:true}).isChecked(),false);
    const bounds = await page.locator('#sourceMenu').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    await page.screenshot({path:path.join(process.env.TEMP,'lake-exact-sources-mobile.png')});
    assert.deepEqual(errors,[]);
    console.log('Exact transcript checks passed: lossless UTF-8/CRLF/emoji downloads, mobile layout, source selection and verbatim attachment retention.');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
