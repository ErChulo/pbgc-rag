'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

// Development verification only. The delivered application needs no Node or server.
const targetURL = process.env.PBGC_TEST_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href;
test(`${targetURL.startsWith('file:') ? 'actual file://' : 'supplementary HTTP only'} workflow, inert source text, integrity and no external network`, async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const network = [];
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  context.on('request', request => {
    if (/^https?:|^wss?:/.test(request.url()) && !request.url().startsWith(process.env.PBGC_TEST_URL || 'file:')) network.push(request.url());
  });
  await context.route(/^https?:\/\//, route => route.request().url().startsWith(process.env.PBGC_TEST_URL || 'file:') ? route.continue() : route.abort());
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pbgc-browser-'));
  try {
    await page.goto(targetURL);
    assert.equal(new URL(page.url()).protocol, new URL(targetURL).protocol);
    await page.locator('#case-name').fill('Synthetic browser verification');
    await page.locator('#create-case').click();
    const source = 'Synthetic evidence only\nUniqueEvidence914 annual amount 1250\n<img src="https://example.invalid/track" onerror="window.injected=true">\n';
    await page.locator('#files').setInputFiles({ name: 'synthetic.txt', mimeType: 'text/plain', buffer: Buffer.from(source) });
    await page.waitForFunction(() => document.body.textContent.includes('synthetic.txt'));
    await page.locator('#query').fill('UniqueEvidence914');
    await page.locator('#search-mode').selectOption('keyword');
    await page.locator('#search').click();
    await page.waitForFunction(() => document.querySelector('#results').textContent.includes('UniqueEvidence914'));
    assert.match(await page.locator('#results').innerText(), /synthetic\.txt/);
    await page.locator('#query').fill('UniqueEvidence914 annual amount');
    await page.locator('#search-mode').selectOption('exact');
    await page.locator('#search').click();
    assert.match(await page.locator('#results').innerText(), /UniqueEvidence914 annual amount 1250/);
    await page.locator('#query').fill('amount annual');
    await page.locator('#search').click();
    assert.match(await page.locator('#results').innerText(), /0 results/);
    await page.locator('#search-mode').selectOption('keyword');
    const originalDownloadPromise = page.waitForEvent('download');
    await page.locator('#sources button').click();
    const originalDownload = await originalDownloadPromise;
    const originalPath = path.join(directory, 'original.txt');
    await originalDownload.saveAs(originalPath);
    assert.equal(await fs.readFile(originalPath, 'utf8'), source);
    for (const bad of [
      { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{broken'), error: 'Invalid JSON' },
      { name: 'unsupported.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf'), error: 'Unsupported format' }
    ]) {
      await page.locator('#files').setInputFiles([
        { name: 'pending.txt', mimeType: 'text/plain', buffer: Buffer.from('must not commit') },
        { name: bad.name, mimeType: bad.mimeType, buffer: bad.buffer }
      ]);
      await page.waitForFunction(error => document.querySelector('#status').textContent.includes(error), bad.error);
      assert.equal(await page.locator('#sources li').count(), 1, 'failed source batch is atomic');
      assert.doesNotMatch(await page.locator('#sources').innerText(), /pending/);
    }
    await page.locator('#query').fill('<img');
    await page.locator('#search').click();
    await page.waitForFunction(() => document.querySelector('#results').textContent.includes('<img'));
    assert.equal(await page.locator('#results img').count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    const beforeTheme = await page.locator('body').getAttribute('class');
    await page.locator('#theme-toggle').click();
    const afterTheme = await page.locator('body').getAttribute('class');
    assert.notEqual(afterTheme, beforeTheme, 'theme control changes theme');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-case').click();
    const download = await downloadPromise;
    const packagePath = path.join(directory, 'case.json');
    await download.saveAs(packagePath);
    const data = JSON.parse(await fs.readFile(packagePath, 'utf8'));
    assert.equal(data.schemaVersion, 1);
    assert.equal(data.sources.length, 1);
    assert.equal(Buffer.from(data.sources[0].bytesBase64, 'base64').toString(), source);
    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('#close-case').click();
    assert.equal(await page.locator('#sources li').count(), 1, 'cancel preserves case');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#close-case').click();
    assert.equal(await page.locator('#sources li').count(), 0);
    await page.locator('#case-name').fill('Isolated empty case');
    await page.locator('#create-case').click();
    await page.locator('#query').fill('UniqueEvidence914');
    await page.locator('#search').click();
    assert.match(await page.locator('#results').innerText(), /0 results/, 'new case cannot search closed case');
    await page.locator('#import-case').setInputFiles(packagePath);
    await page.waitForFunction(() => document.body.textContent.includes('synthetic.txt'));
    await page.locator('#query').fill('UniqueEvidence914');
    await page.locator('#search').click();
    await page.waitForFunction(() => document.querySelector('#results').textContent.includes('UniqueEvidence914'));
    // A tampered package must fail without destroying the current workspace.
    data.sources[0].bytesBase64 = Buffer.from('altered evidence').toString('base64');
    const corruptPath = path.join(directory, 'corrupt.json');
    await fs.writeFile(corruptPath, JSON.stringify(data));
    await page.locator('#import-case').setInputFiles(corruptPath);
    await page.waitForFunction(() => /hash|integrity|checksum/i.test(document.querySelector('#status').textContent));
    await page.locator('#search').click();
    assert.match(await page.locator('#results').innerText(), /UniqueEvidence914/);
    await page.screenshot({ path: '/tmp/pbgc-rag-workspace.png', fullPage: true });
    await page.locator('a[href="#help"]').click();
    assert.match(page.url(), /#help$/);
    assert.equal(network.length, 0, `Unexpected network: ${network.join(', ')}`);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    await browser.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('unavailable local storage keeps import, search and portable export usable', async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked for verification', 'SecurityError'); } });
  });
  const page = await context.newPage();
  try {
    await page.goto(targetURL);
    await page.waitForFunction(() => /Memory only/i.test(document.querySelector('#storage').textContent));
    await page.locator('#demo').click();
    await page.waitForFunction(() => document.body.textContent.includes('synthetic-plan.txt'));
    await page.locator('#query').fill('retirement');
    await page.locator('#search').click();
    await page.waitForFunction(() => document.querySelector('#results').textContent.includes('Normal retirement age is 65.'));
    const downloaded = page.waitForEvent('download');
    await page.locator('#export-case').click();
    const download = await downloaded;
    assert.equal(await download.failure(), null);
    assert.match(await page.locator('#storage').innerText(), /Memory only/);
  } finally { await context.close(); await browser.close(); }
});
