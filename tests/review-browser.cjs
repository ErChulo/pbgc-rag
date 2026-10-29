'use strict';
// Actual Chromium reviewer ZIP integration. HTTP is a secondary diagnostic,
// never a substitute for the mandatory file:// acceptance gate.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { verifyReviewBundle } = require('../js/review-bundle.js');
const executeFile = promisify(execFile);
function storedEntries(input) {
  // Verification is performed first; this helper only inspects verified bytes.
  const bytes = Buffer.from(input), entries = new Map(); let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 22), nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString('utf8'), start = offset + 30 + nameLength + extraLength;
    entries.set(name, { bytes: bytes.subarray(start, start + size), offset: start }); offset = start + size;
  }
  return entries;
}
async function main() {
  const root = path.resolve(__dirname, '..'), temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pbgc-review-browser-'));
  let server, browser, reportHTML = '', base = 'file://' + path.join(root, 'index.html');
  const external = [], errors = []; let python = 'not run';
  try {
    if (process.env.PBGC_HTTP_CHECK === '1') {
      server = http.createServer((req, res) => {
        let pathname;
        try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { res.writeHead(400).end(); return; }
        if (pathname === '/__review_bundle_report.html') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(reportHTML); return; }
        let file;
        try { file = path.resolve(root, '.' + decodeURIComponent(pathname)); } catch { res.writeHead(400).end(); return; }
        if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        fs.readFile(file, (error, content) => {
          if (error) { res.writeHead(404).end(); return; }
          res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(content);
        });
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}/index.html`;
    }
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-crash-reporter', '--disable-crashpad', '--disable-breakpad'] });
    const context = await browser.newContext({ acceptDownloads: true });
    await context.route(/https?:\/\//, route => {
      if (server && new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    await context.routeWebSocket(/.*/, socket => { external.push(socket.url()); socket.close(); });
    await context.addInitScript(() => {
      window.__reviewCalls = { fetch: 0, worker: 0, fontFace: 0, policy: [] };
      globalThis.fetch = () => { window.__reviewCalls.fetch++; return Promise.reject(Error('Unexpected review runtime fetch')); };
      globalThis.Worker = class { constructor() { window.__reviewCalls.worker++; throw Error('Unexpected review worker'); } };
      globalThis.FontFace = class { constructor() { window.__reviewCalls.fontFace++; throw Error('Unexpected review font installation'); } };
      window.addEventListener('securitypolicyviolation', event => window.__reviewCalls.policy.push(event.violatedDirective));
    });
    context.on('page', page => { page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept()); });
    const page = await context.newPage(); await page.goto(base);
    await page.getByRole('heading', { name: 'Your case workspace', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Load synthetic demonstration', exact: true }).click();
    await page.getByRole('heading', { name: 'Search source evidence', exact: true }).waitFor();
    const hostile = Buffer.from('<p>&lt;img src=x onerror=alert(1)&gt; Synthetic hostile review evidence</p><script>globalThis.reviewCompromised=true;fetch("https://invalid.test/review")</script><img src="https://invalid.test/tracker" onerror="globalThis.reviewCompromised=true">');
    await page.getByRole('link', { name: '2 · Import', exact: true }).click();
    await page.getByLabel('Select source files', { exact: true }).setInputFiles([{ name: '=SUM(1,2).html', mimeType: 'text/html', buffer: hostile }]);
    await page.getByRole('button', { name: 'Import and index', exact: true }).click();
    await page.getByText('1 files imported. 0 skipped or rejected.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => globalThis.reviewCompromised), undefined);
    await page.getByRole('link', { name: '5 · Rules', exact: true }).click();
    await page.getByLabel('Proposed rule title', { exact: true }).fill('Synthetic reviewer proposal');
    await page.getByLabel('Effective date').fill('2026-01-01');
    await page.getByLabel('Proposed interpretation').fill('Synthetic review only. An authorized interpretation is not supplied.');
    await page.getByRole('button', { name: 'Save proposal', exact: true }).click();
    await page.getByText(/Synthetic reviewer proposal · proposed/).waitFor();
    for (const value of ['65', '67']) {
      await page.getByLabel('Claim subject', { exact: true }).fill('Synthetic review plan');
      await page.getByLabel('Applicable group', { exact: true }).fill('Synthetic review group');
      await page.getByLabel('Claim value', { exact: true }).fill(value);
      await page.getByRole('button', { name: 'Add claim and screen conflicts', exact: true }).click();
    }
    assert.match(await page.locator('#view pre').innerText(), /unresolved/);
    await page.getByText('IndexedDB available · export for backup', { exact: true }).waitFor();
    const originalCase = await page.evaluate(async () => {
      const store = await PBGC.createCaseStore();
      try { const list = await store.list(); if (list.length !== 1) throw Error('Expected one synthetic case.'); return await store.get(list[0].id); }
      finally { store.close(); }
    });
    assert.equal(originalCase.sources.length, 2); assert.equal(originalCase.rules.length, 1); assert.equal(originalCase.rules[0].status, 'proposed'); assert.equal(originalCase.claims.length, 2);
    assert.equal(originalCase.sources[1].name, '=SUM(1,2).html');
    await page.getByRole('link', { name: '6 · Report and export', exact: true }).click();
    await page.getByText('Internal case schema: PASS', { exact: true }).waitFor();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export verified internal reviewer ZIP', exact: true }).click()]);
    await page.getByText('Internal reviewer ZIP verified and downloaded: case, reports, original bytes and checksums. Official release remains blocked.', { exact: true }).waitFor();
    assert.match(download.suggestedFilename(), /\.zip$/);
    const downloadPath = await download.path(); assert.ok(downloadPath);
    const bytes = new Uint8Array(fs.readFileSync(downloadPath)), verified = await verifyReviewBundle(bytes);
    assert.deepEqual(verified.caseData, originalCase); assert.equal(verified.validation.valid, true);
    assert.equal(verified.manifest.official, false); assert.equal(verified.manifest.release, 'BLOCKED');
    const entries = storedEntries(bytes);
    const originals = [...entries.keys()].filter(name => name.startsWith('originals/'));
    assert.equal(originals.length, 2); assert.ok(originals.every(name => /^originals\/[a-f0-9]{64}\.original$/.test(name)));
    assert.ok([...entries.keys()].every(name => !name.includes('=SUM') && !name.includes('..')));
    for (const source of originalCase.sources) assert.deepEqual(entries.get('originals/' + source.hash + '.original').bytes, Buffer.from(source.originalBase64, 'base64'));
    assert.deepEqual(entries.get('originals/' + originalCase.sources[1].hash + '.original').bytes, hostile);
    assert.ok(entries.get('source-inventory.csv').bytes.toString().includes('"\'=SUM(1,2).html"'));
    const model = JSON.parse(entries.get('review.json').bytes.toString());
    assert.equal(model.status, 'PROVISIONAL'); assert.equal(model.release.allowed, false); assert.equal(model.conflictScreening.conflicts[0].status, 'unresolved');
    reportHTML = entries.get('review.html').bytes.toString('utf8');
    assert.match(reportHTML, /UNRESOLVED/); assert.match(reportHTML, /&lt;img/); assert.doesNotMatch(reportHTML, /<script\b|<img\b/);
    try {
      const script = 'import sys,zipfile,json\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n assert all(i.compress_type==zipfile.ZIP_STORED for i in z.infolist())\n m=json.loads(z.read("manifest.json"))\n assert m["release"]=="BLOCKED" and m["official"] is False\n assert all(s["path"].endswith(".original") for s in m["sourceMap"])\n print(json.dumps({"crc":"PASS","files":len(z.infolist())}))\n';
      const result = await executeFile('python3', ['-c', script, downloadPath], { timeout: 10000, maxBuffer: 65536 });
      assert.deepEqual(JSON.parse(result.stdout), { crc: 'PASS', files: 8 }); python = 'PASS';
    } catch (error) { if (error.code === 'ENOENT') python = 'NOT RUN: python3 unavailable (optional development check)'; else throw error; }
    const reportPath = path.join(temporary, 'review.html'); fs.writeFileSync(reportPath, reportHTML);
    const reportPage = await context.newPage(), reportRequests = [];
    reportPage.on('request', request => reportRequests.push({ url: request.url(), type: request.resourceType() }));
    const reportURL = server ? new URL('/__review_bundle_report.html', base).href : 'file://' + reportPath;
    await reportPage.goto(reportURL);
    await reportPage.getByText('PROVISIONAL — Official output BLOCKED', { exact: true }).waitFor();
    const rendering = await reportPage.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(element => element.id), anchors = [...document.querySelectorAll('a[href]')];
      return { scripts: document.scripts.length, images: document.images.length, uniqueIds: new Set(ids).size === ids.length, anchors: anchors.length, broken: anchors.filter(a => !a.getAttribute('href').startsWith('#') || !document.getElementById(a.getAttribute('href').slice(1))).length, eventHandlers: [...document.querySelectorAll('*')].filter(element => [...element.attributes].some(attribute => attribute.name.startsWith('on'))).length, compromised: !!globalThis.reviewCompromised, csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content, calls: window.__reviewCalls };
    });
    assert.equal(rendering.scripts, 0); assert.equal(rendering.images, 0); assert.equal(rendering.eventHandlers, 0); assert.equal(rendering.compromised, false);
    assert.equal(rendering.uniqueIds, true); assert.ok(rendering.anchors > 5); assert.equal(rendering.broken, 0);
    assert.match(rendering.csp, /script-src 'none'/); assert.match(rendering.csp, /connect-src 'none'/);
    assert.deepEqual(rendering.calls, { fetch: 0, worker: 0, fontFace: 0, policy: [] });
    assert.ok(reportRequests.every(request => request.type === 'document' && request.url === reportURL));
    await reportPage.locator('a[href^="#evidence-"]').first().click();
    assert.match(new URL(reportPage.url()).hash, /^#evidence-/); await reportPage.close();
    await page.getByRole('link', { name: '1 · Case', exact: true }).click();
    await page.getByRole('button', { name: 'Delete active case from this browser', exact: true }).click();
    await page.getByText('No active case', { exact: true }).waitFor(); await page.reload();
    await page.getByRole('heading', { name: 'Your case workspace', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Open Synthetic training plan', exact: true }).count(), 0);
    const empty = await page.evaluate(async () => { const store = await PBGC.createCaseStore(); try { return await store.list(); } finally { store.close(); } });
    assert.deepEqual(empty, []);
    await page.getByLabel('Restore an internal reviewer ZIP', { exact: true }).setInputFiles(downloadPath);
    await page.getByText('Internal reviewer ZIP verified and restored. Official release remains blocked.', { exact: true }).waitFor();
    await page.getByText('Synthetic training plan · 2 sources', { exact: true }).waitFor();
    await page.getByText('IndexedDB available · export for backup', { exact: true }).waitFor();
    const restored = await page.evaluate(async id => { const store = await PBGC.createCaseStore(); try { return await store.get(id); } finally { store.close(); } }, originalCase.id);
    assert.deepEqual(restored, originalCase);
    const corrupted = Buffer.from(bytes); corrupted[entries.get('review.html').offset] ^= 1;
    await page.getByLabel('Restore an internal reviewer ZIP', { exact: true }).setInputFiles([{ name: 'tampered-review.zip', mimeType: 'application/zip', buffer: corrupted }]);
    await page.locator('#notice').filter({ hasText: /^Reviewer ZIP refused:.*CRC-32/ }).waitFor();
    assert.equal(await page.locator('#case-status').innerText(), 'Synthetic training plan · 2 sources');
    const kept = await page.evaluate(async id => { const store = await PBGC.createCaseStore(); try { return await store.get(id); } finally { store.close(); } }, originalCase.id);
    assert.deepEqual(kept, originalCase);
    // A second UI export proves the active in-memory case also stayed unchanged.
    await page.getByRole('link', { name: '6 · Report and export', exact: true }).click();
    const [secondDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export verified internal reviewer ZIP', exact: true }).click()]);
    assert.deepEqual((await verifyReviewBundle(new Uint8Array(fs.readFileSync(await secondDownload.path())))).caseData, originalCase);
    assert.deepEqual(await page.evaluate(() => window.__reviewCalls), { fetch: 0, worker: 0, fontFace: 0, policy: [] });
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: 'PASS', mode: server ? 'HTTP secondary reviewer ZIP check; file acceptance remains BLOCKED' : 'file:// reviewer ZIP', sources: originalCase.sources.length, rules: originalCase.rules.length, claims: originalCase.claims.length, exportedAndRestoredCaseExact: true, sourceBytesExact: true, standaloneReport: 'script-free, inert, anchors valid', tamperedInput: 'refused; active and stored cases unchanged', externalRequests: external.length, runtimeFetchWorkerFontFace: 0, pythonZipfile: python, official: false, release: 'BLOCKED' }));
    await context.close();
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
main().catch(error => {
  if (error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR')) console.error('BLOCKED: managed browser policy denies mandatory file:// reviewer workflow. The HTTP harness is secondary; no policy bypass is attempted.');
  console.error(error); process.exitCode = 1;
});
