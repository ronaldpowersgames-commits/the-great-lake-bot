const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require(process.env.LAKE_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.LAKE_TEST_URL || 'http://localhost:3012';
const original = 'I heard the first answer, then realized I had interrupted.';
const draft = {
  title: 'Leave room to notice',
  message: 'A pause can change what you hear.',
  insight: 'Wait one breath after someone finishes. They may have more to say.',
  closing: 'Try it in one conversation today.',
  theme: 'deep'
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
    page.setDefaultTimeout(12000);
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(source => {
      localStorage.setItem('lakeUser', JSON.stringify({ name: 'Card Tester', email: 'cards@example.test' }));
      localStorage.setItem('lake_cards@example.test_sessions', JSON.stringify([{
        id: 'cards', name: 'Listening', history: [{ role: 'assistant', content: source, time: '09:00' }]
      }]));
      localStorage.setItem('lake_cards@example.test_postCards', JSON.stringify([
        { id: 'legacy', title: 'Older idea', teaser: 'Saved earlier', items: [], favorite: true }, { id: 'broken' }
      ]));
    }, original);
    await page.route('**/chat/post-cards', async route => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({ json: { cards: [draft] } });
    });
    await page.goto(base);
    await page.waitForFunction(() => allSessions.length === 1);
    await page.evaluate(() => loadTide('cards'));
    const input = page.locator('#lakeInput');
    await input.fill('/share');
    await input.press('Enter');
    assert.match(await page.locator('#shareWaveText').textContent(), new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(await page.locator('#shareWaveText').textContent(), /Create your own Tide/);
    assert.equal(requests.length, 0);
    await page.locator('#shareWaveDialog').getByRole('button', { name: 'Close' }).click();
    await input.fill('/post');
    await input.press('Enter');
    const editor = page.locator('#postCardEditor');
    const download = editor.getByRole('button', { name: 'Download slide' });
    await download.waitFor();
    assert.deepEqual(requests, [{ source: original, count: 1, optimizeFor: 'curiosity', instruction: '' }]);
    assert.equal(await editor.getByLabel('Headline', { exact: true }).inputValue(), draft.title);
    await editor.getByLabel('Headline', { exact: true }).fill('Make space to hear');
    for (const [format, height] of Object.entries({ square: 1080, portrait: 1350, story: 1920 })) {
      await editor.getByLabel('Layout').selectOption(format);
      const next = page.waitForEvent('download');
      await download.click();
      const file = await next;
      const png = await fs.readFile(await file.path());
      assert.equal(png.readUInt32BE(16), 1080);
      assert.equal(png.readUInt32BE(20), height);
    }
    await editor.getByLabel('Mood').selectOption('still');
    await editor.getByLabel('Layout').selectOption('portrait');
    await editor.getByRole('button', { name: 'Save to Post Imagery' }).click();
    assert.doesNotMatch(await editor.locator('[role=status]').textContent(), /could not load/);
    if (process.env.LAKE_CARD_PREVIEW) await editor.locator('canvas').screenshot({ path: process.env.LAKE_CARD_PREVIEW });
    await editor.getByRole('button', { name: 'Close' }).click();
    await page.evaluate(() => openPostCards());
    assert.equal(await page.locator('#postCardsList details').count(), 2);
    assert.match(await page.locator('#postCardsList').innerText(), /Make space to hear/);
    assert.match(await page.locator('#postCardsList').innerText(), /Older idea/);
    assert.match(await page.locator('#postCardsList').innerText(), /records are still saved/);
    const records = await page.evaluate(() => JSON.parse(localStorage.getItem('lake_cards@example.test_postCards')));
    assert.equal(records.find(record => record.id === 'legacy').favorite, true);
    assert.ok(records.some(record => record.id === 'broken'));
    assert.equal(records[0].publication.theme, 'still');
    assert.deepEqual(errors, []);
    console.log('Post Cards passed in Chrome: separate Wave sharing, editable draft, all three PNG sizes and historical records.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
