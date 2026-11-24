const assert = require('node:assert/strict');
const { chromium } = require(process.env.LAKE_PLAYWRIGHT_PATH || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const root = process.env.LAKE_TEST_URL || 'http://localhost:3010';
    for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(root);
      assert.equal(await page.locator('#depthsSettingsView a[href="/connections.html"]').textContent(), 'Open Connection Hub');
      await page.goto(root + '/connections.html');
      await page.getByRole('heading', { name: 'Gmail' }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width);
      const sent = [];
      page.on('request', request => sent.push(request.postData() || ''));
      await page.locator('#export-file').setInputFiles({
        name: 'private.txt', mimeType: 'text/plain', buffer: Buffer.from('05/06/25, 12:55 PM - Sam: <img src=x onerror=alert(1)> Private check-in.')
      });
      await page.getByRole('button', { name: 'Search export' }).click();
      await page.getByText('Private check-in.', { exact: false }).waitFor();
      assert.equal(await page.locator('#import-results img').count(), 0);
      assert.ok(sent.every(body => !body.includes('Private check-in.')));
      await page.getByRole('button', { name: 'Clear export' }).click();
      assert.equal(await page.locator('#import-results article').count(), 0);
      assert.deepEqual(errors, []);
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const provider = { id: 'gmail', label: 'Gmail', status: 'connected', account: 'test@gmail.com',
      capabilities: { search: 'authenticated', threads: 'authenticated' } };
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/account/config', route => route.fulfill({ json: { enabled: true } }));
    await page.route('**/account/session', route => route.fulfill({ json: { user: { email: 'verified@example.com' } } }));
    await page.route('**/connections/catalog', route => route.fulfill({ json: { ready: true, provider: [provider], restricted: [] } }));
    await page.route('**/connections', route => route.fulfill({
      json: { provider: [provider], synthesisProviders: ['gmail'], restricted: [], source: { status: 'setup_required' } }
    }));
    const record = { subject: 'Supplier', provider: 'gmail', participants: ['Sam'], timestamp: '2025-06-01T00:00:00.000Z',
      text: '<script>throw new Error("executed")</script> Sent last week.', threadId: 'test', url: 'https://mail.google.com/mail/' };
    await page.route('**/connections/investigate', route => {
      const input = route.request().postDataJSON();
      assert.equal(input.analyze, false);
      assert.equal(input.queries[0].query, 'supplier');
      return route.fulfill({ json: { records: [record], coverage: [{ provider: 'gmail', pages: 2, more: true, cursor: 'third' }] } });
    });
    await page.route('**/connections/provider/gmail/search', route => {
      assert.equal(route.request().postDataJSON().cursor, 'third');
      return route.fulfill({ json: { records: [{ ...record, subject: 'Older result' }], cursor: null } });
    });
    await page.route('**/connections/provider/gmail/thread', route => route.fulfill({
      json: { records: [{ ...record, subject: 'Thread message', text: 'Original reply.' }], limits: [], cursor: null }
    }));
    await page.goto(root + '/connections.html');
    await page.getByLabel('Question').fill('What did the supplier confirm?');
    await page.getByLabel('Gmail search').fill('supplier');
    await page.getByRole('button', { name: 'Run investigation' }).click();
    await page.getByText('Sent last week.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Read thread' }).click();
    await page.getByText('Original reply.').waitFor();
    await page.getByRole('button', { name: 'More gmail results' }).click();
    await page.getByText('Older result', { exact: false }).waitFor();
    assert.equal(await page.locator('#investigation-result script').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Connection Hub passed desktop and mobile browser checks.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
