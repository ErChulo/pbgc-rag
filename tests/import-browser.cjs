'use strict';
// Real browser checkpoint import/resume; HTTP remains a secondary diagnostic.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const { createHash } = require('node:crypto');

async function main() {
  const root = path.resolve(__dirname, '..');
  let server, browser, directory;
  let base = 'file://' + path.join(root, 'index.html');
  try {
    if (process.env.PBGC_HTTP_CHECK === '1') {
      server = http.createServer((req, res) => {
        let file;
        try { file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
        catch { res.writeHead(400).end(); return; }
        if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        fs.readFile(file, (error, data) => {
          if (error) { res.writeHead(404).end(); return; }
          res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
          res.end(data);
        });
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      base = `http://127.0.0.1:${server.address().port}/index.html`;
    }
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
      args: ['--no-sandbox', '--disable-crash-reporter', '--disable-crashpad', '--disable-breakpad']
    });
    const context = await browser.newContext({ acceptDownloads: true });
    const external = [], errors = [];
    await context.route(/https?:\/\//, route => {
      if (server && new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    await context.routeWebSocket(/.*/, socket => { external.push(socket.url()); socket.close(); });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const selection = [
      { name: 'synthetic-first.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic first source\nAccrual interpretation requires review.') },
      { name: 'synthetic-second.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic second source\nIndependent source evidence.') }
    ];
    await page.goto(base);
    await page.getByRole('heading', { name: 'Your case workspace', exact: true }).waitFor();
    await page.getByLabel('Case name', { exact: true }).fill('Synthetic resumable imports');
    await page.getByRole('button', { name: 'Create case', exact: true }).click();
    await page.getByRole('link', { name: '2 · Import', exact: true }).click();
    await page.getByRole('button', { name: 'Import and index', exact: true }).waitFor({ state: 'visible' });
    await page.evaluate(() => {
      const original = PBGC.parseFile;
      PBGC.parseFile = async file => {
        if (file.name === 'synthetic-second.txt') {
          window.importSecondParsing = true;
          await new Promise(resolve => { window.releaseImportSecond = resolve; });
        }
        return original(file);
      };
    });
    await page.getByLabel('Select source files', { exact: true }).setInputFiles(selection);
    await page.getByRole('button', { name: 'Import and index', exact: true }).click();
    await page.waitForFunction(() => window.importSecondParsing === true);
    await page.getByRole('button', { name: 'Cancel active import', exact: true }).click();
    await page.evaluate(() => window.releaseImportSecond());
    await page.getByText('Import cancelled. Completed sources were saved.', { exact: true }).waitFor();
    await page.getByText('Synthetic resumable imports · 1 sources', { exact: true }).waitFor();
    const first = await page.evaluate(async () => {
      const store = await PBGC.createCaseStore();
      try {
        const c = (await store.scan()).cases.find(c => c.name === 'Synthetic resumable imports');
        return { caseData: await store.get(c.id), manifest: await store.getImportCheckpoint(c.id) };
      } finally { store.close(); }
    });
    assert.equal(first.caseData.sources.length, 1);
    assert.equal(first.manifest.entries.length, 1);
    assert.equal(first.manifest.entries[0].status, 'imported');
    assert.equal(first.manifest.caseHash, createHash('sha256').update(JSON.stringify(first.caseData)).digest('hex'));
    const firstHash = first.caseData.sources[0].hash;

    // A fresh page must restore the case and independent checkpoint from IndexedDB.
    await page.reload();
    await page.getByRole('link', { name: '1 · Case', exact: true }).click();
    await page.getByRole('button', { name: 'Open Synthetic resumable imports', exact: true }).click();
    await page.getByRole('link', { name: '2 · Import', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('resume-import')?.checked === true);
    await page.evaluate(() => {
      window.resumedParserNames = [];
      const original = PBGC.parseFile;
      PBGC.parseFile = async file => { window.resumedParserNames.push(file.name); return original(file); };
    });
    await page.getByLabel('Select source files', { exact: true }).setInputFiles(selection);
    await page.getByRole('button', { name: 'Import and index', exact: true }).click();
    await page.getByText('1 files imported. 1 skipped or rejected.', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.resumedParserNames), ['synthetic-second.txt']);
    await page.getByText('Synthetic resumable imports · 2 sources', { exact: true }).waitFor();
    const resumed = await page.evaluate(async id => {
      const store = await PBGC.createCaseStore();
      try { return { caseData: await store.get(id), manifest: await store.getImportCheckpoint(id) }; }
      finally { store.close(); }
    }, first.caseData.id);
    assert.equal(resumed.caseData.sources.length, 2);
    assert.equal(resumed.caseData.sources[0].hash, firstHash);
    assert.equal(resumed.manifest.entries.length, 2);
    assert.equal(resumed.manifest.caseHash, createHash('sha256').update(JSON.stringify(resumed.caseData)).digest('hex'));
    const [manifestDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export import checkpoint manifest', exact: true }).click()
    ]);
    assert.deepEqual(JSON.parse(fs.readFileSync(await manifestDownload.path(), 'utf8')), resumed.manifest);

    // A legitimate case edit invalidates old resume state instead of quietly reusing it.
    await page.getByRole('link', { name: '5 · Rules', exact: true }).click();
    await page.getByLabel('Proposed rule title', { exact: true }).fill('Synthetic edit invalidates import checkpoint');
    await page.getByLabel('Effective date (proposed applicability)', { exact: true }).fill('2026-01-01');
    await page.getByLabel('Proposed interpretation (requires human review)', { exact: true }).fill('Synthetic proposal only; no activation.');
    await page.getByRole('button', { name: 'Save proposal', exact: true }).click();
    await page.getByText('Proposal saved. It is not active.', { exact: true }).waitFor();
    await page.getByText('IndexedDB available · export for backup', { exact: true }).waitFor();
    await page.getByRole('link', { name: '2 · Import', exact: true }).click();
    await page.getByText('New import session. Folder selection uses relative paths only; manual file selection remains available.', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Resume the verified import checkpoint', { exact: true }).isChecked(), false);
    const stale = await page.evaluate(async id => {
      const store = await PBGC.createCaseStore();
      try { return await store.getImportCheckpoint(id); }
      finally { store.close(); }
    }, first.caseData.id);
    assert.equal(stale, null);
    // An old downloaded manifest is refused against the edited case.
    await page.getByLabel('Restore a separate import checkpoint manifest', { exact: true }).setInputFiles(await manifestDownload.path());
    await page.getByText(/Checkpoint refused: Import checkpoint belongs to another case, is stale, or is malformed\./).waitFor();

    // Exercise actual Chromium webkitdirectory input; relative paths stay relative.
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pbgc-synthetic-import-browser-'));
    fs.mkdirSync(path.join(directory, 'nested'));
    fs.writeFileSync(path.join(directory, 'synthetic-folder.txt'), 'Synthetic folder root evidence.');
    fs.writeFileSync(path.join(directory, 'nested', 'synthetic-nested.md'), 'Synthetic nested evidence.');
    await page.getByLabel('Select a source folder (where supported)', { exact: true }).setInputFiles(directory);
    assert.equal(await page.getByLabel('Select source files', { exact: true }).evaluate(input => input.files.length), 0);
    await page.getByRole('button', { name: 'Import and index', exact: true }).click();
    await page.getByText('2 files imported. 0 skipped or rejected.', { exact: true }).waitFor();
    const folder = await page.evaluate(async id => {
      const store = await PBGC.createCaseStore();
      try { return { caseData: await store.get(id), manifest: await store.getImportCheckpoint(id) }; }
      finally { store.close(); }
    }, first.caseData.id);
    assert.equal(folder.caseData.sources.length, 4);
    assert.equal(folder.caseData.rules[0].status, 'proposed');
    assert.equal(folder.manifest.entries.length, 2);
    for (const entry of folder.manifest.entries) {
      assert.ok(entry.relativePath.startsWith(path.basename(directory) + '/'));
      assert.equal(path.isAbsolute(entry.relativePath), false);
      assert.ok(!entry.relativePath.includes('..'));
      assert.ok(!entry.relativePath.includes(os.tmpdir() + '/'));
    }
    assert.equal(folder.manifest.caseHash, createHash('sha256').update(JSON.stringify(folder.caseData)).digest('hex'));
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log(`PASS: ${server ? 'HTTP secondary import check (file acceptance remains BLOCKED)' : 'file:// import'}; cancel discards only in-flight source; checkpoint survives reload; unchanged bytes skip parsing on resume; new source completes; separate manifest matches exact stored case; edits invalidate old checkpoint; directory input preserves only relative paths; zero external requests.`);
    await context.close();
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
