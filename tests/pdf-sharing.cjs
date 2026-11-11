const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { jsPDF } = require('jspdf');
const { chromium } = require(process.env.LAKE_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.LAKE_TEST_URL || 'http://localhost:3012';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.context().setDefaultTimeout(12000);
    const fixture = new jsPDF();
    fixture.text('Robert will send the PDF action plan.', 40, 40);
    const pdfData = 'data:application/pdf;base64,' + Buffer.from(fixture.output('arraybuffer')).toString('base64');
    await page.context().addInitScript(pdfData => {
      Object.defineProperty(navigator, 'canShare', { value: ({ files }) => files?.[0]?.type === 'application/pdf' });
      Object.defineProperty(navigator, 'share', { value: async ({ files, url }) => {
        window.sharedPdf = { name: files[0].name, type: files[0].type,
          signature: await files[0].slice(0, 5).text(), url };
      } });
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => { window.copied = value; } } });
      if (!localStorage.getItem('lakeUser')) {
        localStorage.setItem('lakeUser', JSON.stringify({ name: 'PDF Tester', email: 'pdf@example.test' }));
        localStorage.setItem('lake_pdf@example.test_sessions', JSON.stringify([{
          id: 'pdf-test', name: 'Export test', history: [
            { role: 'user', content: 'Budget notes for the October meeting.', time: '09:00',
              attachments: [{ name: '2026-10-01-call.pdf', type: 'application/pdf', data: pdfData }] },
            { role: 'assistant', content: 'PRIVATE SNAPSHOT', time: '09:01', snapshot: { scope: 'total' } }
          ]
        }]));
      }
    }, pdfData);
    await page.goto(base);
    await page.waitForFunction(() => allSessions.length === 1);
    await page.evaluate(() => loadTide('pdf-test'));
    await page.evaluate(() => openSessionShare());
    assert.equal(await page.locator('#sharePassphrase').getAttribute('type'), 'text');
    await page.locator('#sharePassphrase').fill('throwaway test secret');
    await page.getByRole('button', { name: 'Hide passphrase' }).click();
    await page.reload();
    await page.waitForFunction(() => allSessions.length === 1);
    await page.evaluate(() => { loadTide('pdf-test'); openSessionShare(); });
    assert.equal(await page.locator('#sharePassphrase').getAttribute('type'), 'password');
    assert.equal(await page.locator('#sharePassphrase').inputValue(), '');
    assert.equal(await page.evaluate(() => Object.values(localStorage).some(value => value.includes('throwaway test secret'))), false);
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.locator('#lakeInput').fill('/pdf');
    const popupPromise = page.waitForEvent('popup');
    await page.locator('#lakeInput').press('Control+Enter');
    const popup = await popupPromise;
    await popup.getByRole('button', { name: 'Share PDF', exact: true }).click();
    await popup.waitForFunction(() => window.sharedPdf);
    const shared = await popup.evaluate(() => window.sharedPdf);
    assert.equal(shared.type, 'application/pdf');
    assert.equal(shared.signature, '%PDF-');
    assert.equal(shared.url, undefined);
    const downloadPromise = popup.waitForEvent('download');
    await popup.getByRole('button', { name: 'Download PDF' }).click();
    const download = await downloadPromise;
    const bytes = await fs.readFile(await download.path());
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    const extracted = await popup.evaluate(async encoded => {
      const { meetingPdfText } = await import('/meeting-pdf.mjs');
      return meetingPdfText('data:application/pdf;base64,' + encoded);
    }, bytes.toString('base64'));
    assert.match(extracted, /Budget notes for the October meeting/);
    await popup.getByRole('button', { name: 'Copy text' }).click();
    assert.match(await popup.evaluate(() => window.copied), /Budget notes for the October meeting/);
    await popup.route('**/share', async route => {
      const { session } = route.request().postDataJSON();
      assert.equal(session.history.length, 1);
      assert.match(session.history[0].content, /Budget notes/);
      await route.fulfill({ json: { id: 'test-transcript' } });
    });
    popup.once('dialog', dialog => dialog.accept());
    await popup.getByRole('button', { name: 'Copy transcript link' }).click();
    await popup.waitForFunction(() => window.copied.endsWith('/shared.html?id=test-transcript'));
    await popup.close();
    let evidence;
    await page.route('**/chat', async route => {
      const request = route.request();
      const form = await new Response(request.postDataBuffer(), {
        headers: { 'content-type': request.headers()['content-type'] }
      }).formData();
      assert.equal(form.get('action'), 'meeting-currents');
      assert.deepEqual(form.getAll('file').map(file => file.name), ['meeting-evidence.json']);
      evidence = JSON.parse(await form.get('file').text());
      await route.fulfill({ json: { reflection: 'A source-grounded meeting read.' } });
    });
    await page.evaluate(() => readMeetingCurrents('Who will send the action plan?'));
    assert.equal(evidence.coverage.indexed_meetings, 1);
    assert.match(evidence.passages[0].text, /Robert will send the PDF action plan/);
    console.log('PDF sharing and Meeting Currents passed in Chrome.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
