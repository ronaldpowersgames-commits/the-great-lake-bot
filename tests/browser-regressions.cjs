const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.LAKE_PLAYWRIGHT_PATH || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
    const errors = [];
    const uploads = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      if (localStorage.getItem('lake-regression-seeded')) return;
      localStorage.setItem('lake-regression-seeded', 'yes');
      localStorage.setItem('lakeUser', JSON.stringify({ name: 'Ron', email: 'test@example.com', aliases: 'Punzle, Ronnie' }));
      localStorage.setItem('lake_test@example.com_sessions', JSON.stringify([
        { id: 'legacy', name: 'Older tide', time: '2026-07-08', history: [{ role: 'user', content: 'Original history' }] }
      ]));
      localStorage.setItem('lake_test@example.com_crew', JSON.stringify([{ name: 'Ronald Powers', nickname: 'Punzle, Ron' }]));
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.endsWith('_sessions')) throw new DOMException('Storage full', 'QuotaExceededError');
        return originalSet.call(this, key, value);
      };
    });
    await page.route('**/chat', route => {
      const body = route.request().postDataBuffer().toString('utf8');
      uploads.push((body.match(/filename="/g) || []).length);
      return route.fulfill({ json: {
        reflection: 'Coverage: six files supplied. First: Sam said "Hello". Last: Ron said "Thanks". User identity needs confirmation.\nPLAYER_TAGS_JSON\n{"players":[{"name":"Punzle","confidence":"needs confirmation","needs_confirmation":true,"evidence":"source-1.txt: sender label Punzle","relationship_note":"Tentative pattern to review"}]}\nEND_PLAYER_TAGS_JSON',
        model: 'latest-model-test'
      } });
    });
    await page.goto(process.env.LAKE_TEST_URL || 'http://localhost:3010');
    await page.waitForFunction(() => allSessions.some(session => session.id === 'legacy'));
    assert.equal(await page.evaluate(() => localStorage.getItem(storageKey('sessions'))), null);
    await page.evaluate(() => {
      localStorage.setItem('quota-pressure', 'x'.repeat(4 * 1024 * 1024));
      newSession();
      selectedFiles = Array.from({ length: 6 }, (_, index) => new File(['Sam: Hello\n' + 'x'.repeat(1024 * 1024) + '\nRon: Thanks'], `source-${index + 1}.txt`, { type: 'text/plain' }));
    });
    await page.evaluate(() => sendWave({ requestText: 'Read the whole interaction' }));
    assert.equal(uploads[0], 6);
    await page.evaluate(() => sendWave({ requestText: 'Which speaker is me? Confirm the first and last message.' }));
    assert.equal(uploads[1], 6);
    assert.equal(await page.evaluate(() => chatHistory.flatMap(message => message.attachments || []).length), 6);
    const sessionId = await page.evaluate(() => currentSessionId);
    await page.reload();
    await page.waitForFunction(id => allSessions.some(session => session.id === id), sessionId);
    await page.evaluate(id => loadTide(id), sessionId);
    assert.equal(await page.evaluate(() => chatHistory.flatMap(message => message.attachments || []).length), 6);
    assert.equal(await page.evaluate(() => allSessions.some(session => session.id === 'legacy')), true);
    await page.evaluate(() => {
      LakeSessionStore.write = async () => { throw new DOMException('Device storage exhausted', 'QuotaExceededError'); };
    });
    await page.evaluate(() => sendWave({ requestText: 'One more follow-up' }));
    assert.equal(uploads[2], 6);
    assert.doesNotMatch(await page.locator('#wavesContainer').innerText(), /hit a snag|setItem|exceeded the quota/);
    assert.match(await page.locator('#toast').innerText(), /could not save the chat/);
    await page.getByRole('button', { name: 'Review player', exact: true }).click();
    await page.locator('#crewMatchSelect').selectOption('0');
    await page.evaluate(() => saveCrewFromModal());
    assert.equal(await page.evaluate(() => crewMembers.length), 1);
    assert.equal(await page.evaluate(() => crewMembers[0].observations.length), 1);
    assert.equal(await page.evaluate(() => crewMembers[0].observations[0].reviewed), true);
    const screenshotDirectory = process.env.TEMP || process.cwd();
    await page.screenshot({ path: path.join(screenshotDirectory, 'lake-bot-desktop.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => openCrewModal('edit', 0));
    await page.screenshot({ path: path.join(screenshotDirectory, 'lake-bot-mobile.png'), animations: 'disabled' });
    const modal = await page.locator('.crew-modal').boundingBox();
    assert.ok(modal.y >= 0 && modal.y + modal.height <= 844);
    assert.deepEqual(errors, []);
    console.log('Browser regression checks passed: legacy migration, large attachments, reload, follow-ups, storage failure, reviewed relationship memory, desktop/mobile layouts.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
