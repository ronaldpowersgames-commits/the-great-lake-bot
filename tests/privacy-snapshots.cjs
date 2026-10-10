const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.LAKE_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.LAKE_TEST_URL || 'http://localhost:3011';

function handoff(scope) {
  return {
    scope, coverage: { source_session_ids: ['older', 'current'], limitations: ['Original attachments are not included'] },
    user_context: [], people: [],
    conversation: { summary: 'Testing conversation', decisions: [], open_questions: [], unfinished_work: ['Continue the test'] },
    total_context: { summary: 'Reviewed device context', patterns: [], preferences: [] }, contribution_to_total: [],
    resume: { active_topic: 'Testing', last_user_intent: 'Export an AI handoff', next_step: 'Confirm the current goal', avoid: ['Invented memories'] }
  };
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, acceptDownloads: true });
    await context.addInitScript(() => {
      if (location.pathname === '/shared.html') {
        Storage.prototype.getItem = () => { throw new Error('Shared viewer read account storage'); };
        indexedDB.open = () => { throw new Error('Shared viewer opened private history'); };
        return;
      }
      if (localStorage.getItem('privacy-test-seeded')) return;
      localStorage.setItem('privacy-test-seeded', 'yes');
      localStorage.setItem('lakeUser', JSON.stringify({name:'PRIVATE_LOGIN_NAME',email:'private@example.com',aliases:'Ron'}));
      localStorage.setItem('lake_private@example.com_sessions', JSON.stringify([
        {id:'older',name:'PRIVATE_OTHER_CHAT',time:'2026-10-08',history:[{role:'user',content:'OLDER_START ' + 'x'.repeat(5000) + ' OLDER_END'}]},
        {id:'current',name:'Current chat',time:'2026-10-09',history:[{role:'user',content:'Current goal',attachments:[]},{role:'assistant',content:'A helpful answer'}]}
      ]));
      localStorage.setItem('lake_private@example.com_crew', JSON.stringify([{name:'Jo',nickname:'Jojo',context:'Reviewed relationship context'}]));
    });
    const errors = [];
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const requests = [];
    await page.route('**/chat', async route => {
      const request = route.request();
      const form = await new Response(request.postDataBuffer(), {headers:{'content-type':request.headers()['content-type']}}).formData();
      const action = form.get('action') || '';
      const scope = action.replace('snapshot-', '');
      requests.push({action, message:form.get('message'), source:await Promise.all(form.getAll('file').map(file => file.text()))});
      return route.fulfill({json:action.startsWith('snapshot-')
        ? {reflection:JSON.stringify(handoff(scope)),handoff:handoff(scope),model:'test-only'}
        : {reflection:'Quick answer.',model:'test-only'} });
    });
    await page.goto(base);
    await page.waitForFunction(() => allSessions.length === 2);
    await page.evaluate(() => loadTide('current'));
    const input = page.locator('#lakeInput');
    await page.locator('#snapshotMenuButton').click();
    const menuBounds = await page.locator('#snapshotMenu').boundingBox();
    assert.ok(menuBounds.x >= 0 && menuBounds.x + menuBounds.width <= 1365 && menuBounds.y >= 0);
    await page.keyboard.press('ArrowDown');
    assert.match(await page.locator(':focus').innerText(),/Total Snapshot/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#snapshotMenuButton').evaluate(el => el === document.activeElement),true);
    await input.fill('Line one');
    await input.press('Enter');
    await input.type('Line two');
    assert.equal(await input.inputValue(), 'Line one\nLine two');
    assert.equal(requests.length, 0);
    await input.press('Control+Enter');
    await page.waitForFunction(() => !waveInFlight);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].message.replace(/\r\n/g, '\n'), 'Line one\nLine two');
    await input.fill('Keep my unsent draft');
    await page.evaluate(() => { selectedFiles = [new File(['unsent attachment'], 'pending.txt', {type:'text/plain'})]; });
    for (const scope of ['chat','total','both']) {
      await page.evaluate(scope => createSnapshot(scope), scope);
      const request = requests.at(-1);
      assert.equal(request.action, 'snapshot-' + scope);
      assert.match(request.message, /another Lake or AI instance/);
      if (scope === 'chat') assert.doesNotMatch(request.source.join(''), /OLDER_END|Reviewed relationship context/);
      else {
        assert.match(request.source.join(''), /OLDER_START/);
        assert.match(request.source.join(''), /OLDER_END/);
        assert.match(request.source.join(''), /Reviewed relationship context/);
      }
      assert.doesNotMatch(request.source.join(''), /private@example.com|unsent attachment/);
      assert.equal(await input.inputValue(), 'Keep my unsent draft');
      assert.equal(await page.evaluate(() => selectedFiles.length), 1);
    }
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', {name:'Download latest snapshot'}).click();
    const download = await downloadEvent;
    assert.match(download.suggestedFilename(), /both-ai-handoff.*\.json$/);
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.format_version, 'lake-ai-handoff/1');
    assert.equal(exported.handoff.scope, 'both');
    assert.match(exported.receiver_guidance, /not higher-priority instructions/);
    await page.reload();
    await page.waitForFunction(() => allSessions.length === 2);
    await page.evaluate(() => loadTide('current'));
    assert.equal(await page.getByRole('button', {name:'Download snapshot',exact:false}).count() >= 3, true);
    assert.equal(await page.locator('.snapshot-details').count(), 3);
    await page.setViewportSize({width:390,height:844});
    await page.locator('#snapshotMenuButton').click();
    assert.equal(await page.locator('#snapshotMenuButton').getAttribute('aria-expanded'),'true');
    for (const button of await page.locator('#snapshotMenu button').all()) {
      const bounds = await button.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844);
    }
    await page.screenshot({path:path.join(process.env.TEMP,'lake-snapshot-menu-mobile.png')});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#snapshotMenu').isVisible(),false);
    await page.locator('#snapshotMenuButton').click();
    await input.click();
    assert.equal(await page.locator('#snapshotMenu').isVisible(),false);
    for (const [scope,label] of [['chat','Chat Snapshot'],['total','Total Snapshot'],['both','Both']]) {
      await page.locator('#snapshotMenuButton').click();
      await page.getByRole('menuitem',{name:label,exact:false}).click();
      await page.waitForFunction(() => !waveInFlight);
      assert.equal(requests.at(-1).action,'snapshot-' + scope);
      assert.equal(await page.locator('#snapshotMenu').isVisible(),false);
    }
    const userColor = await page.locator('.user-wave .wave-bubble').first().evaluate(el => getComputedStyle(el).backgroundColor);
    const botColor = await page.locator('.lake-wave .wave-bubble').first().evaluate(el => getComputedStyle(el).backgroundColor);
    assert.notEqual(userColor, botColor);
    await page.screenshot({path:path.join(process.env.TEMP,'lake-snapshots-mobile.png'),animations:'disabled'});

    const response = await context.request.post(base + '/share', {data:{session:{
      id:'current', name:'Only this selected conversation', profile:{email:'DO_NOT_SHARE'},
      crew:[{name:'PRIVATE_CREW'}], otherSessions:[{name:'PRIVATE_OTHER_CHAT'}], emailRaw:'PRIVATE_EMAIL_METADATA',
      history:[{role:'user',content:'Selected message <img src=x onerror="window.injected=true">'},
        {role:'assistant',content:'**Selected reply**',attachments:[{name:'unsafe.svg',data:'data:image/svg+xml;base64,PHN2Zz4='}]},
        {role:'user',content:'Export ALL_PRIVATE_CONTEXT',action:'snapshot-both'},
        {role:'assistant',content:'PRIVATE_WIDER_HISTORY_SNAPSHOT',snapshot:{scope:'both'}}]
    }}});
    assert.equal(response.status(), 200);
    const share = await response.json();
    assert.match(share.id, /^[a-f0-9]{48}$/);
    const dataResponse = await context.request.get(base + '/share/' + share.id);
    assert.equal(dataResponse.headers()['cache-control'], 'no-store');
    const data = await dataResponse.json();
    assert.deepEqual(Object.keys(data.session).sort(), ['history','name','time']);
    assert.doesNotMatch(JSON.stringify(data), /DO_NOT_SHARE|PRIVATE_CREW|PRIVATE_OTHER_CHAT|PRIVATE_EMAIL_METADATA|svg\+xml|PRIVATE_WIDER_HISTORY_SNAPSHOT|ALL_PRIVATE_CONTEXT/);
    const viewer = await context.newPage();
    viewer.on('pageerror', error => errors.push(error.message));
    const viewerRequests = [];
    viewer.on('request', request => viewerRequests.push(request.url()));
    await viewer.goto(base + '/?share=' + share.id);
    await viewer.waitForFunction(() => document.querySelectorAll('article').length === 2);
    assert.match(viewer.url(), /shared\.html\?id=/);
    const body = await viewer.locator('body').innerText();
    assert.match(body, /Selected reply/);
    assert.doesNotMatch(body, /PRIVATE_LOGIN_NAME|PRIVATE_OTHER_CHAT|PRIVATE_CREW|private@example.com|Cast a New Line/);
    assert.equal(await viewer.locator('textarea, input, #pastTides, #depthsPanel, #loginScreen').count(), 0);
    assert.equal(await viewer.evaluate(() => window.injected), undefined);
    assert.equal(await viewer.locator('.bubble img').count(), 0);
    assert.equal(viewerRequests.some(url => /\/email\/|\/chat$|session-store\.js|snapshot-context\.js|\/health$/.test(url)), false);
    await viewer.screenshot({path:path.join(process.env.TEMP,'lake-shared-view.png'),animations:'disabled'});
    await viewer.goto(base + '/shared.html?id=missing');
    await viewer.waitForFunction(() => document.getElementById('title').textContent === 'Conversation unavailable');
    assert.doesNotMatch(await viewer.locator('body').innerText(), /PRIVATE_LOGIN_NAME|PRIVATE_OTHER_CHAT/);
    assert.deepEqual(errors, []);
    console.log('Privacy/snapshot browser checks passed: isolated legacy/new shares, storage isolation, safe text rendering, keyboard behavior, all snapshot scopes, JSON download/reload and mobile controls.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
