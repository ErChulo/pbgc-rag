'use strict';
// Real UI/query regressions. HTTP is a secondary check, not file-origin acceptance.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const root = path.resolve(__dirname, '..');
  let browser, server, base = 'file://' + path.join(root, 'index.html');
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
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-crash-reporter', '--disable-crashpad', '--disable-breakpad'] });
    const context = await browser.newContext({ acceptDownloads: true });
    const external = [], errors = [];
    await context.route(/https?:\/\//, route => {
      if (server && new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    await context.routeWebSocket(/.*/, socket => { external.push(socket.url()); socket.close(); });
    await context.addInitScript(() => {
      globalThis.__queryPolicyViolations = [];
      addEventListener('securitypolicyviolation', event => __queryPolicyViolations.push(event.violatedDirective));
    });
    const page = await context.newPage(); page.setDefaultTimeout(45000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.getByRole('heading', { name: 'Your case workspace', exact: true }).waitFor();
    await page.getByText('IndexedDB available · export for backup', { exact: true }).waitFor();
    async function settled() { await page.getByText('IndexedDB available · export for backup', { exact: true }).waitFor(); }
    async function createCase(name) {
      await page.getByRole('link', { name: '1 · Case', exact: true }).click();
      await page.getByLabel('Case name', { exact: true }).fill(name);
      await page.getByRole('button', { name: 'Create case', exact: true }).click();
      await page.getByText('Case created. Import source files next.', { exact: true }).waitFor();
      await settled();
    }
    async function importText(name, text) {
      await page.getByRole('link', { name: '2 · Import', exact: true }).click();
      await page.getByLabel('Select source files', { exact: true }).setInputFiles([{ name, mimeType: 'text/plain', buffer: Buffer.from(text) }]);
      await page.getByRole('button', { name: 'Import and index', exact: true }).click();
      await page.getByText('1 files imported. 0 skipped or rejected.', { exact: true }).waitFor();
      await settled();
    }
    async function runQuery(mode, query) {
      await page.getByLabel('Search mode', { exact: true }).selectOption(mode);
      await page.getByLabel('Search text or query', { exact: true }).fill(query);
      await page.getByRole('button', { name: 'Search', exact: true }).click();
    }
    async function savedByName(name) {
      return page.evaluate(async name => {
        const store = await PBGC.createCaseStore();
        try { const meta = (await store.list()).find(c => c.name === name); if (!meta) throw Error('Expected saved case missing'); return await store.get(meta.id); }
        finally { store.close(); }
      }, name);
    }
    async function getGraphCase() {
      return page.evaluate(async () => { const store = await PBGC.createCaseStore(); try { return await store.get('synthetic-custom-graph-query'); } finally { store.close(); } });
    }

    // The marker lies beyond both the 6,000-character preview and old 65,536-character query cap.
    const longName = 'Synthetic long query case', longNeedle = 'unique-long-tail-needle';
    const longText = 'ordinary synthetic padding '.repeat(4200) + longNeedle;
    assert.ok(longText.indexOf(longNeedle) > 100 * 1024);
    await createCase(longName); await importText('synthetic-long-query.txt', longText);
    const savedLong = await savedByName(longName);
    assert.equal(savedLong.sources.length, 1); assert.equal(savedLong.sources[0].records.length, 1);
    assert.equal(savedLong.sources[0].records[0].text, longText);
    const longRecord = savedLong.sources[0].records[0];
    await page.getByRole('link', { name: '3 · Search', exact: true }).click();
    await runQuery('keyword', longNeedle);
    await page.getByText('1 results', { exact: true }).waitFor();
    let article = page.locator('#results article');
    assert.equal(await article.count(), 1);
    assert.ok((await article.innerText()).includes(longNeedle));
    const range = await article.getByText(/^Showing parsed record characters /).innerText();
    const bounds = /^Showing parsed record characters (\d+)–(\d+) of (\d+)\./.exec(range);
    assert.ok(bounds); assert.ok(Number(bounds[1]) > 6000); assert.equal(Number(bounds[3]), longText.length);
    assert.ok(Number(bounds[2]) - Number(bounds[1]) + 1 <= 6000);
    const fullRecord = article.locator('details');
    assert.equal(await fullRecord.locator('pre').count(), 0);
    await fullRecord.locator('summary').click();
    await fullRecord.locator('pre').waitFor();
    assert.equal(await fullRecord.locator('pre').textContent(), longText);
    assert.ok((await article.innerText()).includes(longRecord.id));

    await runQuery('question', longNeedle);
    await page.getByText(/Retrieval status: evidence-found/).waitFor();
    article = page.locator('#results article');
    assert.equal(await article.count(), 1);
    assert.ok((await article.innerText()).includes(longNeedle));
    await article.locator('details summary').click();
    assert.equal(await article.locator('details pre').textContent(), longText);
    assert.ok((await article.innerText()).includes(longRecord.id));
    // SQL scalar projection must retain the precise last record ID.
    await runQuery('sql', "SELECT id FROM records WHERE text LIKE '%unique-long-tail-needle'");
    assert.deepEqual(JSON.parse(await page.locator('#results pre').textContent()), [{ id: longRecord.id }]);
    await runQuery('sql', 'SELECT text FROM records LIMIT 1');
    assert.equal((await page.locator('#results pre').textContent()).length, 50000);
    await page.getByText('Showing the first 50,000 characters of 1 query rows. The complete result is available as JSON.', { exact: true }).waitFor();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download complete SQL result', exact: true }).click()]);
    assert.deepEqual(JSON.parse(fs.readFileSync(await download.path(), 'utf8')), [{ text: longText }]);

    // A single actual File with 50,001 rows must commit and expose its final row.
    const manyName = 'Synthetic many-row query case', manyNeedle = 'unique-many-row-tail';
    await createCase(manyName); await importText('synthetic-many-query.txt', 'filler\n'.repeat(50000) + manyNeedle);
    const many = await savedByName(manyName);
    assert.equal(many.sources[0].records.length, 50001);
    const last = many.sources[0].records[50000]; assert.equal(last.locator.line, 50001);
    await page.getByRole('link', { name: '3 · Search', exact: true }).click();
    await runQuery('keyword', manyNeedle); await page.getByText('1 results', { exact: true }).waitFor();
    assert.equal(await page.locator('#results article').count(), 1);
    await page.locator('#results article').getByText(manyNeedle, { exact: true }).waitFor();
    assert.ok((await page.locator('#results').innerText()).includes('Line 50001'));
    assert.ok((await page.locator('#results').innerText()).includes(last.id));
    await runQuery('sql', "SELECT id, locator.label FROM records WHERE text = 'unique-many-row-tail'");
    assert.deepEqual(JSON.parse(await page.locator('#results pre').textContent()), [{ id: last.id, 'locator.label': 'Line 50001' }]);

    // Restore through the real verified store, then reload so the app loads the new snapshot.
    const graphSeed = await page.evaluate(async () => {
      const source = await PBGC.parseFile(new File(['Synthetic first evidence\nSynthetic second evidence'], 'synthetic-custom-graph.txt'));
      const c = { schemaVersion: 1, id: 'synthetic-custom-graph-query', name: 'Synthetic restored custom graph', createdAt: '2026-10-29T00:00:00.000Z', sources: [source], graph: { nodes: [
        { id: 'custom-evidence-a', sourceId: source.id, recordId: source.records[0].id },
        { id: 'custom-evidence-b', label: 'Synthetic target evidence', sourceId: source.id, recordId: source.records[1].id },
        { id: 'unattached-research-node', label: 'Unattached research node' }
      ], edges: [] }, rules: [], calculations: [] };
      const store = await PBGC.createCaseStore();
      try { await store.put(c); } finally { store.close(); }
      return { sourceId: source.id, fromRecordId: source.records[0].id, toRecordId: source.records[1].id };
    });
    await page.goto(base.split('#')[0] + '#case'); await page.reload();
    await page.getByRole('button', { name: 'Open Synthetic restored custom graph', exact: true }).click();
    await page.getByRole('link', { name: '4 · Evidence graph', exact: true }).click();
    assert.equal(await page.locator('#from option[value="custom-evidence-a"]').textContent(), 'custom-evidence-a');
    assert.equal(await page.locator('#to option[value="custom-evidence-a"]').textContent(), 'custom-evidence-a');
    await page.getByLabel('From evidence', { exact: true }).selectOption('custom-evidence-a');
    await page.getByLabel('To evidence', { exact: true }).selectOption('custom-evidence-b');
    await page.getByRole('button', { name: 'Add proposed link', exact: true }).click();
    await settled();
    const linked = await getGraphCase();
    assert.equal(linked.graph.edges.length, 1);
    const edge = linked.graph.edges[0];
    assert.equal(edge.from, 'custom-evidence-a'); assert.equal(edge.to, 'custom-evidence-b');
    assert.equal(edge.sourceId, graphSeed.sourceId); assert.equal(edge.recordId, graphSeed.fromRecordId);
    assert.notEqual(edge.recordId, edge.from); assert.equal(edge.status, 'proposed');
    assert.equal(await page.evaluate(c => PBGC.validateCase(c).valid, linked), true);
    await page.getByLabel('Start evidence', { exact: true }).selectOption('custom-evidence-a');
    await page.getByRole('button', { name: 'Trace linked evidence', exact: true }).click();
    assert.equal(JSON.parse(await page.locator('#view > pre').textContent()).nodes.length, 2);
    await page.getByLabel('From evidence', { exact: true }).selectOption('unattached-research-node');
    await page.getByLabel('To evidence', { exact: true }).selectOption('custom-evidence-b');
    await page.getByRole('button', { name: 'Add proposed link', exact: true }).click();
    await page.getByText('Choose a starting node linked to source evidence.', { exact: true }).waitFor();
    assert.deepEqual(await getGraphCase(), linked);
    assert.equal(await page.locator('#evidence-diagram [data-edge-id]').count(), 1);
    assert.deepEqual(await page.evaluate(() => __queryPolicyViolations), []);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log(`PASS: ${server ? 'HTTP secondary query check (file acceptance remains BLOCKED)' : 'file:// query check'}; actual 100KB-line and 50001-row File imports persist; tail citations searchable; bounded visible excerpts and lazy exact full records; unchanged question citation; SQL scalar results and complete JSON download; restored custom graph IDs retain record provenance; source-less links refuse without mutation; zero external requests/page errors.`);
    await context.close();
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
