'use strict';
// Targeted checks, not a full WCAG/Section 508 certification.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
  let server, browser;
  const failures = [], passed = [], attempts = [], errors = [];
  async function check(name, action) {
    try { await action(); passed.push(name); console.log('PASS: ' + name); }
    catch (error) { failures.push({ name, error: error.message }); console.error('FAIL: ' + name + ': ' + error.message); }
  }
  try {
    let base = 'file://' + path.join(root, 'index.html');
    if (process.env.PBGC_HTTP_CHECK === '1') {
      server = http.createServer(async (req, res) => {
        try {
          const target = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
          if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
          res.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : 'text/html');
          res.end(await fs.readFile(target));
        } catch { res.writeHead(404).end(); }
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      base = `http://127.0.0.1:${server.address().port}/index.html`;
    }
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-crash-reporter', '--disable-crashpad', '--disable-breakpad'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.route(/https?:\/\//, route => {
      if (server && new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
      attempts.push(route.request().url()); return route.abort();
    });
    await context.routeWebSocket(/.*/, socket => { attempts.push(socket.url()); socket.close(); });
    const page = await context.newPage(); page.setDefaultTimeout(4000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.getByRole('heading', { name: 'Your case workspace', exact: true }).waitFor();
    async function keyboardActivate(locator) { await locator.focus(); await page.keyboard.press('Enter'); }
    async function route(name, heading) {
      await keyboardActivate(page.getByRole('link', { name, exact: true }));
      await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    }
    async function semantics() {
      assert.equal(await page.locator('main').count(), 1);
      assert.equal(await page.locator('main h1').count(), 1);
      assert.equal(await page.locator('html').getAttribute('lang'), 'en');
      const unnamed = await page.locator('main input,main select,main textarea').evaluateAll(nodes => nodes.filter(n => !n.labels?.length && !n.getAttribute('aria-label') && !n.getAttribute('aria-labelledby')).map(n => n.outerHTML.slice(0, 150)));
      assert.deepEqual(unnamed, [], 'Every visible form control needs an associated accessible name');
    }
    await check('initial route has one main heading and named form controls', semantics);
    await check('first Tab reveals the skip link with visible focus', async () => {
      await page.keyboard.press('Tab');
      assert.equal(await page.locator(':focus').innerText(), 'Skip to workspace');
      const box = await page.locator(':focus').boundingBox(); assert.ok(box.x >= 0 && box.y >= 0);
    });
    await check('skip link moves focus to main', async () => {
      await page.keyboard.press('Enter');
      assert.equal(await page.locator(':focus').getAttribute('id'), 'main');
    });
    await page.getByLabel('Case name', { exact: true }).focus();
    await page.keyboard.type('Synthetic keyboard case');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').innerText(), 'Create case');
    await page.keyboard.press('Enter');
    await page.getByText('Case created. Import source files next.', { exact: true }).waitFor();
    await check('creating a case preserves a logical focus destination', async () => {
      assert.ok(await page.locator('main:focus, main :focus').count(), 'Focus must remain in the updated workspace');
    });
    await route('2 · Import', 'Import original documents');
    await check('keyboard route activation moves focus to workspace', async () => {
      assert.ok(await page.locator('main:focus, main :focus').count(), 'Route changes must move focus to new content');
    });
    await page.getByLabel('Select source files', { exact: true }).setInputFiles([{ name: 'keyboard.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic normal retirement age is 65.\nSynthetic amendment retirement age is 67.') }]);
    await keyboardActivate(page.getByRole('button', { name: 'Import and index', exact: true }));
    await page.getByText('1 files imported. 0 skipped or rejected.', { exact: true }).waitFor();
    await route('3 · Search', 'Search source evidence');
    await page.getByLabel('Search text or query').focus(); await page.keyboard.type('retirement'); await page.keyboard.press('Enter');
    await page.getByText('2 results', { exact: true }).waitFor();
    await check('search completion keeps focus and announces results', async () => {
      assert.equal(await page.locator(':focus').getAttribute('id'), 'query');
      assert.equal(await page.locator('#results').getAttribute('aria-live'), 'polite');
    });
    await check('skip link retains the active search route', async () => {
      await keyboardActivate(page.getByRole('link', { name: 'Skip to workspace', exact: true }));
      assert.equal(await page.locator('main h1').innerText(), 'Search source evidence');
      assert.equal(await page.locator(':focus').getAttribute('id'), 'main');
    });
    if (!(await page.getByRole('heading', { name: 'Search source evidence', exact: true }).count())) {
      await route('3 · Search', 'Search source evidence'); await page.getByLabel('Search text or query').fill('retirement'); await page.getByLabel('Search text or query').press('Enter');
    }
    await keyboardActivate(page.getByRole('button', { name: 'Add to evidence graph', exact: true }).first());
    await route('4 · Evidence graph', 'Evidence graph');
    await check('graph route controls are named', semantics);
    await check('evidence graph node supports keyboard selection', async () => {
      const node = page.locator('#evidence-diagram [role="button"]').first(); await node.focus(); await page.keyboard.press('Space');
      assert.match(await page.locator('#selected-graph-evidence').innerText(), /Synthetic normal retirement age/);
    });
    for (const [name, title] of [['1 · Case', 'Your case workspace'], ['2 · Import', 'Import original documents'], ['3 · Search', 'Search source evidence'], ['4 · Evidence graph', 'Evidence graph'], ['5 · Rules', 'Rule review and calculation gates'], ['6 · Report and export', 'Report, validate, and export']]) {
      await route(name, title);
      await check(`${title}: visible controls have accessible names`, semantics);
      for (const width of [320, 375]) {
        await page.setViewportSize({ width, height: 800 });
        await check(`${title}: reflow at ${width}px`, async () => {
          const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
          assert.ok(dimensions.content <= dimensions.width + 1, JSON.stringify(dimensions));
        });
      }
      await page.setViewportSize({ width: 1280, height: 800 });
    }
    await check('focused controls are visibly outlined and not covered by status messages', async () => {
      await page.getByRole('button', { name: 'Export verified case package', exact: true }).focus();
      const result = await page.locator(':focus').evaluate(node => {
        const style = getComputedStyle(node), r = node.getBoundingClientRect();
        return { outline: parseFloat(style.outlineWidth), style: style.outlineStyle, topmost: node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
      });
      assert.ok(result.outline >= 2 && result.style !== 'none', JSON.stringify(result)); assert.equal(result.topmost, true);
    });
    await check('light theme remains keyboard operable', async () => {
      await keyboardActivate(page.getByRole('button', { name: 'Use light theme', exact: true }));
      assert.equal(await page.getByRole('button', { name: 'Use dark theme', exact: true }).count(), 1);
    });
    await check('no browser errors or external network attempts', async () => { assert.deepEqual(errors, []); assert.deepEqual(attempts, []); });
    console.log(JSON.stringify({ mode: server ? 'HTTP secondary; file acceptance blocked separately' : 'file', passed: passed.length, failures }, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
