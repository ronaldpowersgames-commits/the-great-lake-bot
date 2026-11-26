const assert = require('node:assert/strict');
const { chromium } = require(process.env.LAKE_PLAYWRIGHT_PATH || 'playwright');
const JSZip = require('jszip');

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
    await page.route('**/account/session', route => route.fulfill({ json: {
      user: { id: 'lake-account-id', name: 'Verified name', email: 'verified@example.com' }
    } }));
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
    await page.addInitScript(() => {
      if (!localStorage.getItem('lakeUser')) localStorage.setItem('lakeUser', JSON.stringify({
        name: 'Test owner', email: 'verified@example.com', responseLanguage: 'auto'
      }));
    });
    const fixtureText = 'Private staged Tide history';
    const zip = new JSZip();
    zip.file('lake-backup.json', JSON.stringify({ format_version: 'lake-full-backup/1', data: {
      conversations: [{ id: 'hub_import', name: 'Hub import', history: [{ role: 'user', content: fixtureText }] }]
    } }));
    const uploadBodies = [];
    page.on('request', request => uploadBodies.push(request.postData() || ''));
    page.on('dialog', dialog => {
      assert.match(dialog.message(), /fixture\.zip.*Test owner/);
      return dialog.accept();
    });
    await page.locator('#lake-package-file').setInputFiles({
      name: 'fixture.zip', mimeType: 'application/zip', buffer: await zip.generateAsync({ type: 'nodebuffer' })
    });
    await page.getByRole('button', { name: 'Continue in The Lake' }).click();
    await page.locator('#backupRestoreStatus').getByText('Backup merged. 1 Tides added.', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => allSessions.find(tide => tide.id === 'hub_import')?.history[0].content), fixtureText);
    assert.ok(uploadBodies.every(body => !body.includes(fixtureText)));
    console.log('Connection Hub passed desktop, mobile, and browser-local package import checks.');

    const context = await browser.newContext();
    const user = { id: 'launch-account', name: 'Verified name', email: 'captain@example.com' };
    let signedIn = false;
    let linkRequested = false;
    await context.route('**/account/config', route => route.fulfill({ json: { enabled: true } }));
    await context.route('**/account/session', route => route.fulfill({ json: { user: signedIn ? user : null } }));
    await context.route('**/account/link', route => {
      assert.deepEqual(route.request().postDataJSON(), { email: user.email, remember: true, surface: 'launch' });
      linkRequested = true;
      return route.fulfill({ json: { ok: true } });
    });
    await context.route('**/account/logout', route => {
      signedIn = false;
      return route.fulfill({ json: { ok: true } });
    });
    const launch = await context.newPage();
    launch.on('pageerror', error => errors.push(error.message));
    await launch.goto(root);
    await launch.evaluate(() => {
      localStorage.setItem('lakeUser', JSON.stringify({
        email: 'captain@example.com', name: 'Saved Captain', aliases: 'Cap', responseLanguage: 'auto'
      }));
      localStorage.setItem('lake_captain@example.com_sessions', JSON.stringify([
        { id: 'prior_tide', name: 'Prior Tide', history: [{ role: 'user', content: 'Existing Tide' }] }
      ]));
    });
    const launchReload = await launch.reload();
    assert.ok(launchReload.ok(), 'Launch returned HTTP ' + launchReload.status());
    await launch.getByLabel('Email address').fill(user.email);
    await launch.getByLabel('Stay signed in on this device').check();
    await launch.getByRole('button', { name: 'Send sign-in link' }).click();
    await launch.getByRole('status').filter({ hasText: 'Open the newest Lake sign-in link' }).waitFor();
    assert.equal(linkRequested, true);
    assert.equal(await launch.locator('#loginScreen').isVisible(), true);
    signedIn = true;
    await launch.goto(root + '/?account=signed-in');
    await launch.locator('#loginScreen').waitFor({ state: 'hidden' });
    await launch.waitForFunction(() => allSessions.some(tide => tide.id === 'prior_tide'));
    assert.equal(await launch.locator('#dockUserName').textContent(), 'Saved Captain');
    assert.equal(await launch.locator('#myChatAliases').inputValue(), 'Cap');
    assert.equal(await launch.locator('#responseLanguage').inputValue(), 'auto');
    assert.equal(await launch.evaluate(() => localStorage.getItem('lakeUser')), null);
    const hub = await context.newPage();
    await hub.goto(root + '/connections.html');
    await hub.getByRole('button', { name: 'Sign out', exact: true }).click();
    await launch.getByRole('button', { name: 'Send sign-in link' }).waitFor();
    signedIn = true;
    await launch.reload();
    await launch.locator('#loginScreen').waitFor({ state: 'hidden' });
    await hub.reload();
    await hub.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
    await launch.evaluate(() => toggleDepths());
    await launch.getByRole('button', { name: 'Sign out of The Lake', exact: true }).click();
    await hub.getByRole('button', { name: 'Send sign-in link' }).waitFor();
    await launch.getByRole('button', { name: 'Send sign-in link' }).waitFor();
    assert.deepEqual(errors, []);
    await context.close();
    console.log('Launch sign-in, saved profile, and sign-out from both entry points passed.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
