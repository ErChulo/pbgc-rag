'use strict';
// Real UI/IndexedDB reference-library checks; HTTP diagnostics do not establish file:// acceptance.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

async function main() {
  const root = path.resolve(__dirname, '..');
  let server, browser;
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
    page.on('dialog', dialog => dialog.accept());
    await page.goto(base);
    await page.getByRole('heading', { name: 'Your case workspace', exact: true }).waitFor();
    await page.getByLabel('Case name', { exact: true }).fill('Synthetic reference case A');
    await page.getByRole('button', { name: 'Create case', exact: true }).click();
    await page.getByRole('link', { name: 'Reference library', exact: true }).click();
    await page.getByLabel('Reference library name', { exact: true }).fill('Synthetic shared library');
    await page.getByRole('button', { name: 'Create reference library', exact: true }).click();
    await page.getByRole('heading', { name: 'Synthetic shared library', exact: true }).waitFor();
    const consent = 'I may share these references. They contain no confidential case records.';
    const sourceName = 'synthetic-shared-reference.txt';
    const firstSource = { name: sourceName, mimeType: 'text/plain', buffer: Buffer.from('Synthetic shared reference evidence.\nNo actual plan interpretation is made.') };
    await page.getByLabel('Reference version label', { exact: true }).fill('Synthetic reference edition A');
    await page.getByLabel('Select authorized reference originals', { exact: true }).setInputFiles([firstSource]);
    // Authorization is an explicit user action rather than inferred from a file's location.
    await page.getByRole('button', { name: 'Add originals to reference library', exact: true }).click();
    await page.getByText('Confirm that these are authorized reference documents first.', { exact: true }).waitFor();
    await page.getByLabel(consent, { exact: true }).check();
    await page.getByRole('button', { name: 'Add originals to reference library', exact: true }).click();
    await page.getByLabel(`Select reference ${sourceName}`, { exact: true }).waitFor();
    await page.getByLabel(`Select reference ${sourceName}`, { exact: true }).check();
    await page.getByRole('button', { name: 'Copy selected references into active case', exact: true }).click();
    await page.getByText(/Selected references copied into Synthetic reference case A\./).waitFor();
    await page.getByRole('link', { name: '3 · Search', exact: true }).click();
    await page.getByLabel('Search text or query', { exact: true }).fill('Synthetic shared reference evidence');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('button', { name: 'Add to evidence graph', exact: true }).click();
    await page.getByRole('link', { name: '5 · Rules', exact: true }).click();
    await page.getByLabel('Proposed rule title', { exact: true }).fill('Synthetic case A proposal only');
    await page.getByLabel('Effective date (proposed applicability)', { exact: true }).fill('2026-01-01');
    await page.getByLabel('Proposed interpretation (requires human review)', { exact: true }).fill('Synthetic case A review proposal. Not an approved official rule.');
    await page.getByRole('button', { name: 'Save proposal', exact: true }).click();
    await page.getByText('Proposal saved. It is not active.', { exact: true }).waitFor();
    await page.getByRole('link', { name: '1 · Case', exact: true }).click();
    await page.getByLabel('Case name', { exact: true }).fill('Synthetic reference case B');
    await page.getByRole('button', { name: 'Create case', exact: true }).click();
    await page.getByText('Synthetic reference case B · 0 sources', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Reference library', exact: true }).click();
    await page.getByLabel(`Select reference ${sourceName}`, { exact: true }).check();
    await page.getByRole('button', { name: 'Copy selected references into active case', exact: true }).click();
    await page.getByText(/Selected references copied into Synthetic reference case B\./).waitFor();
    const state = await page.evaluate(async () => {
      const cases = await PBGC.createCaseStore(), libraries = await PBGC.createReferenceStore();
      try {
        if (cases.mode !== 'indexeddb' || libraries.mode !== 'indexeddb') throw Error('Browser check requires real separate IndexedDB stores.');
        const metas = await cases.list(), refs = await libraries.list();
        return { cases: await Promise.all(metas.map(m => cases.get(m.id))), library: await libraries.get(refs[0].id) };
      } finally { cases.close(); libraries.close(); }
    });
    const a = state.cases.find(c => c.name === 'Synthetic reference case A'), b = state.cases.find(c => c.name === 'Synthetic reference case B');
    assert.ok(a && b); assert.equal(state.cases.length, 2); assert.equal(state.library.sources.length, 1); assert.equal(state.library.revision, 2);
    assert.equal(a.sources.length, 1); assert.equal(b.sources.length, 1);
    assert.deepEqual(a.sources[0].referenceOrigin, { libraryId: state.library.id, revision: 2, versionLabel: 'Synthetic reference edition A' });
    assert.deepEqual(b.sources[0].referenceOrigin, a.sources[0].referenceOrigin);
    assert.equal(a.graph.nodes.length, 1); assert.equal(a.rules.length, 1);
    assert.deepEqual(b.graph, { nodes: [], edges: [] }); assert.deepEqual(b.rules, []); assert.deepEqual(b.calculations, []);
    assert.equal(state.library.sources[0].referenceOrigin, undefined); assert.equal(state.library.sources[0].caseId, undefined);
    assert.equal(state.library.rules, undefined); assert.equal(state.library.graph, undefined);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export verified reference library', exact: true }).click()]);
    const packageFile = await download.path(); assert.ok(packageFile);
    const envelope = JSON.parse(fs.readFileSync(packageFile, 'utf8')); assert.equal(envelope.format, 'pbgc-rag-reference-library');
    await page.reload();
    await page.getByRole('link', { name: 'Reference library', exact: true }).click();
    await page.getByRole('button', { name: 'Open reference library Synthetic shared library', exact: true }).click();
    await page.getByLabel(`Select reference ${sourceName}`, { exact: true }).waitFor();
    // A newer library edition must not silently rewrite already copied case references.
    await page.getByLabel(consent, { exact: true }).check();
    await page.getByLabel('Reference version label', { exact: true }).fill('Synthetic reference edition B');
    await page.getByLabel('Select authorized reference originals', { exact: true }).setInputFiles([{ name: 'synthetic-second-reference.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic later reference edition evidence.') }]);
    await page.getByRole('button', { name: 'Add originals to reference library', exact: true }).click();
    await page.getByLabel('Select reference synthetic-second-reference.txt', { exact: true }).waitFor();
    const later = await page.evaluate(async ({ libraryId, ids }) => {
      const cases = await PBGC.createCaseStore(), refs = await PBGC.createReferenceStore();
      try { return { library: await refs.get(libraryId), cases: await Promise.all(ids.map(id => cases.get(id))) }; }
      finally { cases.close(); refs.close(); }
    }, { libraryId: state.library.id, ids: [a.id, b.id] });
    assert.equal(later.library.revision, 3); assert.equal(later.library.sources.length, 2);
    assert.ok(later.cases.every(c => c.sources.length === 1 && c.sources[0].referenceOrigin.revision === 2));
    // Restore is a deliberate portable snapshot replacement; the existing library confirmation is accepted.
    await page.getByLabel(consent, { exact: true }).check();
    await page.getByLabel('Restore a reference library package', { exact: true }).setInputFiles(packageFile);
    await page.getByText('Reference library schema and original-byte integrity verified.', { exact: true }).waitFor();
    const restored = await page.evaluate(async libraryId => {
      const store = await PBGC.createReferenceStore();
      try { return await store.get(libraryId); } finally { store.close(); }
    }, state.library.id);
    assert.deepEqual(restored, state.library);
    // A case envelope is never accepted as a reference library, even with sharing consent.
    const foreignCasePackage = await page.evaluate(async c => PBGC.exportCase(c), a);
    await page.getByLabel(consent, { exact: true }).check();
    await page.getByLabel('Restore a reference library package', { exact: true }).setInputFiles([{ name: 'synthetic-case-not-library.json', mimeType: 'application/json', buffer: Buffer.from(foreignCasePackage) }]);
    await page.getByText(/Reference restore refused: Unsupported reference library package/).waitFor();
    const unchanged = await page.evaluate(async libraryId => {
      const store = await PBGC.createReferenceStore();
      try { return await store.get(libraryId); } finally { store.close(); }
    }, state.library.id);
    assert.deepEqual(unchanged, state.library);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log(`PASS: ${server ? 'HTTP secondary library check (file acceptance remains BLOCKED)' : 'file:// library'}; explicit sharing consent; reference original ingestion; independent two-case copies with pinned provenance; no rule/graph transfer; separate IndexedDB reload; later editions leave cases unchanged; portable export/restore; case package refused as library; zero external requests.`);
    await context.close();
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
