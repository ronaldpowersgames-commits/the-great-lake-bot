const assert = require('node:assert/strict');
const { chromium } = require(process.env.LAKE_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.LAKE_TEST_URL || 'http://localhost:3012';
const prefix = 'lake_anchors@example.test_';
const evidence = 'I always write a short agenda before a meeting.';
const introduction = 'My colleague Jamie Vale handles our project schedule.';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.setDefaultTimeout(12000);
    await page.addInitScript(prefix => {
      if (localStorage.getItem('anchor-test-seeded')) return;
      localStorage.setItem('anchor-test-seeded', 'yes');
      localStorage.setItem('lakeUser', JSON.stringify({ name: 'Captain', email: 'anchors@example.test' }));
      localStorage.setItem(prefix + 'crew', JSON.stringify([{ name: 'Sam Park', nickname: 'Skipper', relationship: 'Teammate' }]));
    }, prefix);
    await page.route('**/chat', async route => {
      await route.fulfill({ json: { reflection: 'An agenda gives everyone a common starting point.', profileUpdates: [
        { key: 'meeting_agenda', value: evidence, evidence, classification: 'user reported' },
        { key: 'person_jamie_vale', person: 'Jamie Vale', value: 'Colleague who handles the project schedule', evidence: introduction }
      ] } });
    });
    await page.goto(base);
    await page.waitForFunction(() => crewMembers.length === 2).catch(async error => {
      const state = await page.evaluate(prefix => ({ legacy: localStorage.getItem(prefix + 'crew'),
        count: typeof crewMembers === 'undefined' ? null : crewMembers.length,
        memory: typeof LakeMemoryAnchors }), prefix);
      throw new Error(JSON.stringify({ state, pageErrors }), { cause: error });
    });
    await page.locator('#lakeInput').fill(evidence + ' ' + introduction);
    await page.evaluate(() => sendWave());
    assert.deepEqual(pageErrors, []);
    assert.equal(await page.evaluate(prefix => localStorage.getItem(prefix + 'captainMemoryV1') !== null, prefix),
      true, await page.locator('#toast').textContent().catch(() => 'No status'));
    await page.waitForFunction(prefix => Boolean(localStorage.getItem(prefix + 'captainMemoryV1')) &&
      JSON.parse(localStorage.getItem(prefix + 'suggestedCrew') || '[]').some(person => person.name === 'Jamie Vale'), prefix);
    await page.evaluate(() => { saveCrew(); });
    const saved = await context.storageState();
    await context.close();

    const restarted = await browser.newContext({ storageState: saved });
    const again = await restarted.newPage();
    await again.goto(base);
    await again.waitForFunction(() => crewMembers.length === 2);
    await again.evaluate(() => openMemoryCabin());
    const dialog = again.locator('#memoryCabin');
    assert.match(await dialog.locator('#captainMemoryList').innerText(), /short agenda/);
    assert.match(await dialog.locator('#memoryHealth').innerText(), /Captain · 1 saved.*Crew · 1 saved.*1 Crew reviews pending/);
    await dialog.getByRole('searchbox').fill('Skipper');
    assert.match(await dialog.locator('#memoryCrewList').innerText(), /Sam Park/);
    await again.evaluate(prefix => {
      localStorage.setItem(prefix + 'captainMemoryV1', '{bad');
      renderMemoryCabin();
    }, prefix);
    assert.match(await dialog.locator('#memoryHealth').innerText(), /Captain unavailable.*Crew · 1 saved/);
    assert.match(await dialog.locator('#memoryCrewList').innerText(), /Sam Park/);
    console.log('Captain’s Cabin passed in Chrome: automatic recognition, persisted anchors, alias search and independent retrieval failure.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
