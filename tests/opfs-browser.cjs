'use strict';
// Native OPFS and Web Locks integration. HTTP is secondary to file-origin acceptance.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
 const root = path.resolve(__dirname, '..'); let server, browser;
 const requests = [], errors = [];
 try {
  let base = 'file://' + path.join(root, 'index.html');
  if (process.env.PBGC_HTTP_CHECK === '1') {
   server = http.createServer(async (req, res) => {
    try { const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
     if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
     res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
   });
   await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}/index.html`;
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-crash-reporter', '--disable-crashpad', '--disable-breakpad'] });
  async function context(init) {
   const c = await browser.newContext({ acceptDownloads: true });
   await c.route(/https?:\/\//, route => { if (server && new URL(route.request().url()).origin === new URL(base).origin) return route.continue(); requests.push(route.request().url()); return route.abort(); });
   await c.routeWebSocket(/.*/, socket => { requests.push(socket.url()); socket.close(); });
   if (init) await c.addInitScript(init);
   c.on('page', p => { p.setDefaultTimeout(6000); p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept()); });
   return c;
  }
  async function open(c) { const p = await c.newPage(); await p.goto(base); await p.getByRole('heading', { name: 'Your case workspace', exact: true }).waitFor(); return p; }
  const c = await context(), page = await open(c);
  assert.deepEqual(await page.evaluate(() => ({ opfs: typeof navigator.storage?.getDirectory, locks: typeof navigator.locks?.request })), { opfs: 'function', locks: 'function' }, 'Native APIs are required for this integration check');
  await page.getByLabel('Case name', { exact: true }).fill('Synthetic OPFS case'); await page.getByRole('button', { name: 'Create case', exact: true }).click();
  await page.getByRole('link', { name: '2 · Import', exact: true }).click();
  await page.getByLabel('Select source files', { exact: true }).setInputFiles([{ name: 'opfs-synthetic.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic OPFS recovery evidence. Retirement age 65.') }]);
  await page.getByRole('button', { name: 'Import and index', exact: true }).click(); await page.getByText('1 files imported. 0 skipped or rejected.', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Local backups', exact: true }).click();
  await page.getByRole('button', { name: 'Save active case recovery backup (keeps two)', exact: true }).click();
  await page.getByText('Verified local backup generation 1 saved for Synthetic OPFS case. Keep a portable export too.', { exact: true }).waitFor();
  await page.getByRole('link', { name: '5 · Rules', exact: true }).click();
  await page.getByLabel('Proposed rule title').fill('Synthetic later revision'); await page.getByLabel('Effective date').fill('2026-01-01'); await page.getByLabel('Proposed interpretation').fill('Synthetic proposal only.');
  await page.getByRole('button', { name: 'Save proposal', exact: true }).click();
  await page.getByRole('link', { name: 'Local backups', exact: true }).click();
  await page.getByRole('button', { name: 'Save active case recovery backup (keeps two)', exact: true }).click();
  await page.getByText('Verified local backup generation 2 saved for Synthetic OPFS case. Keep a portable export too.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Restore local backup Synthetic OPFS case generation 1', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Restore local backup Synthetic OPFS case generation 2', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Restore local backup Synthetic OPFS case generation/ }).count(), 2);
  const id = await page.evaluate(async () => { const store = await PBGC.createCaseStore(); try { return (await store.list())[0].id; } finally { store.close(); } });
  await page.getByRole('link', { name: '1 · Case', exact: true }).click(); await page.getByRole('button', { name: 'Delete active case from this browser', exact: true }).click();
  await page.getByText('No active case', { exact: true }).waitFor(); await page.reload();
  await page.getByRole('heading', { name: 'Your case workspace', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Open Synthetic OPFS case', exact: true }).count(), 0);
  await page.getByRole('link', { name: 'Local backups', exact: true }).click();
  await page.getByRole('button', { name: 'Restore local backup Synthetic OPFS case generation 1', exact: true }).click();
  await page.getByText('Verified backup generation 1 restored as a case checkpoint.', { exact: true }).waitFor();
  const restored = await page.evaluate(async id => { const store = await PBGC.createCaseStore(); try { return await store.get(id); } finally { store.close(); } }, id);
  assert.equal(restored.rules.length, 0); assert.equal(restored.sources[0].records[0].text, 'Synthetic OPFS recovery evidence. Retirement age 65.');
  // Corrupt only this test context's newest native OPFS slot, keeping the older verified slot intact.
  const damagedName = await page.evaluate(async () => {
   const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('pbgc-rag-backups-v1');
   for await (const [name, handle] of dir.entries()) {
    const outer = JSON.parse(await (await handle.getFile()).text()), payload = JSON.parse(outer.payload);
    if (payload.generation === 2) { const stream = await handle.createWritable(); await stream.write('{damaged synthetic slot'); await stream.close(); return name; }
   }
   throw Error('Native generation 2 slot not found');
  });
  assert.match(damagedName, /\.slot0\.json$/);
  await page.getByRole('link', { name: 'Local backups', exact: true }).click();
  await page.getByText(/^Damaged backup .*slot 0:/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Restore local backup Synthetic OPFS case generation 2', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Restore local backup Synthetic OPFS case generation 1', exact: true }).click();
  await page.getByText('Verified backup generation 1 restored as a case checkpoint. Another backup slot is damaged and has been kept.', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Local backups', exact: true }).click();
  await page.getByRole('button', { name: 'Remove local backups for Synthetic OPFS case', exact: true }).click();
  await page.getByText('2 local backup slots removed. Case checkpoints were kept.', { exact: true }).waitFor();
  await page.getByText('No verified local case backups are present.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(async id => { const store = await PBGC.createCaseStore(); try { return (await store.get(id)).sources.length; } finally { store.close(); } }, id), 1);
  // With every slot damaged, an active verified case can explicitly clear only its own unusable copies.
  await page.getByRole('button', { name: 'Save active case recovery backup (keeps two)', exact: true }).click();
  await page.getByText('Verified local backup generation 1 saved for Synthetic OPFS case. Keep a portable export too.', { exact: true }).waitFor();
  await page.getByRole('link', { name: '1 · Case', exact: true }).click();
  await page.evaluate(async()=>{
   const dir=await(await navigator.storage.getDirectory()).getDirectoryHandle('pbgc-rag-backups-v1');
   for await(const [,handle]of dir.entries()){const stream=await handle.createWritable();await stream.write('{unreadable synthetic backup');await stream.close();}
  });
  await page.getByRole('link', { name: 'Local backups', exact: true }).click();
  await page.getByRole('button', { name: 'Remove damaged backups for active case', exact: true }).click();
  await page.getByText('1 damaged local backup slots removed. The active case and checkpoints were kept.', { exact: true }).waitFor();
  await page.getByText('No verified local case backups are present.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(async()=>{const dir=await(await navigator.storage.getDirectory()).getDirectoryHandle('pbgc-rag-backups-v1');let count=0;for await(const entry of dir.entries())count++;return count;}),0);
  await page.getByRole('link', { name: '3 · Search', exact: true }).click(); await page.getByLabel('Search text or query').fill('OPFS recovery'); await page.getByRole('button', { name: 'Search', exact: true }).click(); await page.getByText('1 results', { exact: true }).waitFor();
  await c.close();

  for (const kind of ['missing', 'denied', 'no-locks']) {
   const fallback = await context();
   await fallback.addInitScript(kind => {
    // Playwright also initializes about:blank; only the secure application origin exposes StorageManager.
    if (!navigator.storage) return;
    if (kind === 'no-locks') Object.defineProperty(navigator, 'locks', { get() { return undefined; } });
    else Object.defineProperty(navigator.storage, 'getDirectory', { value: kind === 'missing' ? undefined : async () => { throw new DOMException('Synthetic policy denial', 'NotAllowedError'); } });
   }, kind);
   const p = await open(fallback); await p.getByRole('button', { name: 'Load synthetic demonstration', exact: true }).click(); await p.getByRole('heading', { name: 'Search source evidence', exact: true }).waitFor();
   await p.getByRole('link', { name: 'Local backups', exact: true }).click();
   if (kind === 'no-locks') {
    await p.getByText(/^Backup storage is read-only:/).waitFor();
    assert.equal(await p.getByRole('button', { name: 'Save active case recovery backup (keeps two)', exact: true }).isDisabled(), true);
    const names = await p.evaluate(async () => { const dir = await navigator.storage.getDirectory(), names = []; for await (const [name] of dir.entries()) names.push(name); return names; });
    assert.equal(names.includes('pbgc-rag-backups-v1'), false, 'No-lock fallback must not create its namespace');
   } else await p.getByText(/^Local backups unavailable:/).waitFor();
   await p.getByRole('link', { name: '6 · Report and export', exact: true }).click();
   const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Export verified case package', exact: true }).click()]);
   const envelope = await fs.readFile(await download.path(), 'utf8'); assert.equal(JSON.parse(envelope).format, 'pbgc-rag-case');
   await fallback.close();
  }
  assert.deepEqual(requests, []); assert.deepEqual(errors, []);
  console.log(`PASS: native OPFS two generations, IndexedDB deletion/reload/older restore, damaged-slot fallback, explicit removal retaining case, unavailable/denied/no-lock fallbacks and portable exports; zero external requests/page errors. ${server ? 'HTTP secondary; file acceptance remains BLOCKED.' : 'file-origin check.'}`);
 } finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
