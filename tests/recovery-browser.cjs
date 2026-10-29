'use strict';
// Real IndexedDB recovery integration. HTTP mode is secondary to mandatory file:// acceptance.
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
    const context = await browser.newContext();
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
    await page.evaluate(async () => {
      const c = (id, name) => ({ schemaVersion: 1, id, name, createdAt: '2026-10-28T00:00:00.000Z', sources: [], graph: { nodes: [], edges: [] }, rules: [], calculations: [] });
      const store = await PBGC.createCaseStore();
      if (store.mode !== 'indexeddb') throw Error('Recovery browser check requires working IndexedDB.');
      try {
        await store.put(c('synthetic-healthy', 'Synthetic healthy case'));
        await store.put(c('synthetic-broken', 'Synthetic recoverable case'));
        await store.put(c('synthetic-broken', 'Synthetic broken current'));
      } finally { store.close(); }
      // Simulate a damaged current envelope without weakening or bypassing validation.
      await new Promise((resolve, reject) => {
        const open = indexedDB.open('pbgc-rag-local-v1', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result, tx = db.transaction('cases', 'readwrite'), cases = tx.objectStore('cases');
          const get = cases.get('synthetic-broken');
          get.onsuccess = () => {
            const saved = get.result;
            if (!saved || saved.revision !== 2 || !saved.envelope.includes('Synthetic broken current')) { tx.abort(); reject(Error('Synthetic recovery seed did not persist.')); return; }
            saved.envelope = saved.envelope.replace('Synthetic broken current', 'Corrupted current case');
            cases.put(saved);
          };
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onabort = () => { db.close(); reject(tx.error || Error('Corruption fixture transaction failed.')); };
        };
      });
    });
    await page.reload();
    await page.getByRole('button', { name: 'Open Synthetic healthy case', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Recover checkpoints for synthetic-broken', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Open Synthetic healthy case', exact: true }).click();
    await page.getByText('Synthetic healthy case · 0 sources', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Recover checkpoints for synthetic-broken', exact: true }).click();
    await page.getByRole('heading', { name: 'Verified checkpoints', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Restore checkpoint 1', exact: true }).click();
    await page.waitForFunction(async () => {
      const store = await PBGC.createCaseStore();
      try { const c = await store.get('synthetic-broken'); return c && c.name === 'Synthetic recoverable case'; }
      catch { return false; }
      finally { store.close(); }
    });
    const recovered = await page.evaluate(async () => {
      const store = await PBGC.createCaseStore();
      try { return { scan: await store.scan(), versions: await store.inspectVersions('synthetic-broken'), latest: await store.get('synthetic-broken') }; }
      finally { store.close(); }
    });
    assert.equal(recovered.latest.name, 'Synthetic recoverable case');
    assert.equal(recovered.scan.cases.length, 2);
    assert.equal(recovered.scan.damaged.length, 0);
    assert.deepEqual(recovered.versions.versions.map(v => v.revision).sort((a, b) => a - b), [1, 3]);
    assert.deepEqual(recovered.versions.damaged.map(v => v.revision), [2]);
    // Explicit pruning keeps the current payload and removes only older confirmed history.
    await page.evaluate(async () => {
      const store = await PBGC.createCaseStore();
      try {
        const c = await store.get('synthetic-broken');
        c.name = 'Synthetic recovered revision four'; await store.put(c);
        c.name = 'Synthetic recovered revision five'; await store.put(c);
      } finally { store.close(); }
    });
    await page.reload();
    await page.getByRole('button', { name: 'Checkpoints for Synthetic recovered revision five', exact: true }).click();
    await page.getByRole('button', { name: 'Keep latest 3 checkpoints', exact: true }).click();
    await page.waitForFunction(async () => {
      const store = await PBGC.createCaseStore();
      try { return (await store.listVersions('synthetic-broken')).length === 3; }
      finally { store.close(); }
    });
    const pruned = await page.evaluate(async () => {
      const store = await PBGC.createCaseStore();
      try { return { versions: await store.inspectVersions('synthetic-broken'), latest: await store.get('synthetic-broken'), removed: await store.get('synthetic-broken', 1) }; }
      finally { store.close(); }
    });
    assert.equal(pruned.latest.name, 'Synthetic recovered revision five');
    assert.equal(pruned.removed, null);
    assert.deepEqual(pruned.versions.versions.map(v => v.revision).sort((a, b) => a - b), [3, 4, 5]);
    assert.deepEqual(pruned.versions.damaged, []);
    // Even three large snapshots can exhaust the text budget; explicit current-only pruning remains reachable.
    await page.getByRole('button', { name: 'Keep current checkpoint only', exact: true }).click();
    await page.waitForFunction(async () => {
      const store=await PBGC.createCaseStore();
      try{return (await store.listVersions('synthetic-broken')).length===1;}finally{store.close();}
    });
    const retainedCurrent=await page.evaluate(async()=>{
      const store=await PBGC.createCaseStore();
      try{return {versions:await store.listVersions('synthetic-broken'),latest:await store.get('synthetic-broken')};}finally{store.close();}
    });
    assert.equal(retainedCurrent.latest.name,'Synthetic recovered revision five');
    assert.deepEqual(retainedCurrent.versions.map(v=>v.revision),[5]);
    // Ambiguous revision metadata must never select a different payload than a listed checkpoint.
    const ambiguous = await page.evaluate(async () => {
      const store = await PBGC.createCaseStore();
      try {
        const c = { schemaVersion: 1, id: 'synthetic-ambiguous', name: 'Synthetic ambiguous one', createdAt: '2026-10-28T00:00:00.000Z', sources: [], graph: { nodes: [], edges: [] }, rules: [], calculations: [] };
        await store.put(c); c.name = 'Synthetic ambiguous two'; await store.put(c);
        await new Promise((resolve, reject) => {
          const open = indexedDB.open('pbgc-rag-local-v1', 1);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result, tx = db.transaction('cases', 'readwrite'), cases = tx.objectStore('cases');
            const get = cases.get(c.id);
            get.onsuccess = () => { const saved = get.result; saved.history[0].revision = saved.revision; cases.put(saved); };
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onabort = () => { db.close(); reject(tx.error || Error('Ambiguity fixture transaction failed.')); };
          };
        });
        const results = await Promise.allSettled([store.get(c.id, 2), store.inspectVersions(c.id)]);
        return results.map(r => ({ status: r.status, message: r.reason && r.reason.message }));
      } finally { store.close(); }
    });
    assert.ok(ambiguous.every(r => r.status === 'rejected'));
    for (const r of ambiguous) assert.match(r.message, /revision|checkpoint|duplicat/i);

    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log(`PASS: ${server ? 'HTTP secondary recovery check (file acceptance remains BLOCKED)' : 'file:// recovery'}; damaged latest isolated; healthy case usable; verified prior checkpoint restored as new revision; damaged revision preserved until explicit prune; current payload retained; ambiguous revision metadata rejected; zero external requests.`);
    await context.close();
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
