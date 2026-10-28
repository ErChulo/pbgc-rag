'use strict';
// SVG graph behavior in real Chromium. HTTP mode is secondary to required file-origin acceptance.
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
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-crash-reporter', '--disable-crashpad', '--disable-breakpad'] });
    const context = await browser.newContext(), external = [], errors = [];
    await context.route(/https?:\/\//, route => {
      if (server && new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    await context.routeWebSocket(/.*/, socket => { external.push(socket.url()); socket.close(); });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(base); await page.getByRole('heading', { name: 'Your case workspace', exact: true }).waitFor();
    // Load the local module if the coordinator has not yet registered it in the shell.
    if (!await page.evaluate(() => typeof PBGC.renderEvidenceGraph === 'function')) await page.addScriptTag({ url: new URL('js/graph-view.js', base).href });
    const hostile = '<img src="https://invalid.test/graph" onerror="globalThis.graphPwned=true"><script>globalThis.graphPwned=true</script>';
    await page.evaluate(hostile => {
      const container = document.createElement('section'); container.id = 'graph-test-container'; document.getElementById('view').append(container);
      globalThis.graphSelections = [];
      PBGC.renderEvidenceGraph(container, {
        caseId: 'synthetic-graph-case',
        nodes: [{ id: 'synthetic-a', label: 'Synthetic first evidence', sourceId: 'synthetic-source', recordId: 'synthetic-record-a' }, { id: 'synthetic-b', label: hostile, type: 'evidence', status: 'proposed', sourceId: 'synthetic-source', recordId: 'synthetic-record-b' }],
        edges: [{ id: 'synthetic-edge', from: 'synthetic-a', to: 'synthetic-b', type: 'supports', status: 'proposed', sourceId: 'synthetic-source', recordId: 'synthetic-record-a' }]
      }, { onSelect: id => graphSelections.push(id) });
    }, hostile);
    const box = page.locator('#graph-test-container'), a = box.locator('[data-node-id="synthetic-a"]'), b = box.locator('[data-node-id="synthetic-b"]');
    assert.equal(await box.locator('svg').count(), 1); assert.equal(await box.locator('[role="button"]').count(), 2);
    assert.equal(await box.locator('img, script, image, foreignObject').count(), 0);
    assert.equal(await page.evaluate(() => globalThis.graphPwned), undefined);
    await a.click(); await b.focus(); await page.keyboard.press('Enter'); await a.focus(); await page.keyboard.press('Space');
    assert.deepEqual(await page.evaluate(() => graphSelections), ['synthetic-a', 'synthetic-b', 'synthetic-a']);
    assert.equal(await a.getAttribute('aria-pressed'), 'true'); assert.equal(await b.getAttribute('aria-pressed'), 'false');
    assert.equal(await a.locator('rect').getAttribute('stroke-width'), '5');
    assert.match(await b.getAttribute('aria-label'), /<img src=/);
    assert.match(await box.getByRole('group', { name: /synthetic-a → supports → synthetic-b/ }).getAttribute('aria-label'), /synthetic-record-a/);
    // Focus indicators and palette are presentation attributes, not inline styles blocked by CSP.
    assert.equal(await box.locator('[style]').count(), 0);
    const darkColor = await a.locator('rect').evaluate(rect => getComputedStyle(rect).fill);
    await page.getByRole('button', { name: 'Use light theme', exact: true }).click();
    const lightColor = await a.locator('rect').evaluate(rect => getComputedStyle(rect).fill);
    assert.notEqual(darkColor, lightColor);
    const caps = await page.evaluate(() => {
      const nodes = Array.from({ length: 105 }, (_, i) => ({ id: `cap-${String(i).padStart(3, '0')}`, label: `Synthetic ${i}` }));
      const edges = Array.from({ length: 205 }, (_, i) => ({ id: `cap-edge-${String(i).padStart(3, '0')}`, from: nodes[i % 100].id, to: nodes[(i + 1) % 100].id, type: 'proposed-link', sourceId: 'synthetic-source', recordId: 'synthetic-record' }));
      const graph = { nodes, edges }, model = PBGC.renderEvidenceGraph(document.getElementById('graph-test-container'), graph);
      return { model, actualNodes: graph.nodes.length, actualEdges: graph.edges.length };
    });
    assert.equal(caps.model.nodes.length, 100); assert.equal(caps.model.edges.length, 200); assert.equal(caps.actualNodes, 105); assert.equal(caps.actualEdges, 205);
    assert.equal(await box.locator('[data-node-id]').count(), 100); assert.equal(await box.locator('[data-edge-id]').count(), 200);
    await box.getByRole('status').getByText(/5 nodes and 5 links are omitted/).waitFor();
    await page.evaluate(() => PBGC.renderEvidenceGraph(document.getElementById('graph-test-container'), { nodes: [], edges: [] }));
    await box.getByText('No evidence nodes yet. Add source evidence from search.', { exact: true }).waitFor();
    assert.equal(await box.locator('svg').count(), 0);
    const rejected = await page.evaluate(() => {
      const box = document.getElementById('graph-test-container'), before = box.textContent;
      try { PBGC.renderEvidenceGraph(box, { nodes: [{ id: 'a' }], edges: [{ id: 'bad', from: 'a', to: 'absent', type: 'supports', sourceId: 's', recordId: 'r' }] }); return false; }
      catch (error) { return box.textContent === before && /endpoints/.test(error.message); }
    });
    assert.equal(rejected, true); assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log(`PASS: ${server ? 'HTTP secondary graph check (file acceptance remains BLOCKED)' : 'file:// graph'}; real SVG nodes/types/provenance; click/Enter/Space ID callbacks; focus/selection and dark/light palette; hostile labels inert; explicit display caps preserve full input; empty/dangling graphs; zero external requests.`);
    await context.close();
  } finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
