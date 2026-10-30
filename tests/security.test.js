'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
test('entry point denies network, plugins, base replacement and form submission', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1];
  assert.ok(csp, 'CSP must be present');
  for (const directive of ["default-src 'none'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.includes(directive), directive);
  assert.ok(!csp.includes("'unsafe-inline'"));
  assert.ok(!csp.includes("'unsafe-eval'"));
  for (const match of html.matchAll(/<(?:script|link|img)\b[^>]*(?:src|href)="([^"]+)"/gi)) assert.ok(!/^(?:https?:)?\/\//i.test(match[1]), match[1]);
});
test('runtime source has no network clients, dynamic execution or HTML insertion', () => {
  for (const file of fs.readdirSync(path.join(root, 'assets')).filter(file => file.endsWith('.js')).map(file => 'assets/' + file)) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    // An async fetch method declaration is the PDF.js blocked-data adapter, not a global network call.
    const calls = text.replace(/async fetch\s*\([^)]*\)\s*\{/g, 'async blockedDataMethod() {');
    assert.doesNotMatch(calls, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval)\s*\(/, file);
    assert.doesNotMatch(text, /\bnew\s+Function\s*\(/, file);
    assert.doesNotMatch(text, /\.(?:innerHTML|outerHTML)\s*=/, file);
    assert.doesNotMatch(text, /insertAdjacentHTML\s*\(/, file);
  }
});
test('runtime assets are local files and styles have no remote imports', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/gi)) {
    assert.doesNotMatch(match[1], /^(?:[a-z]+:|\/\/)/i);
    const target = path.resolve(root, match[1]);
    assert.ok(target.startsWith(root + path.sep), 'asset stays inside project');
    assert.ok(fs.existsSync(target), 'referenced local asset exists: ' + match[1]);
  }
  for (const file of fs.readdirSync(path.join(root,'assets')).filter(file => file.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(root,'assets',file),'utf8');
    assert.doesNotMatch(css, /@import\b/i, 'no hidden stylesheet dependencies');
    assert.doesNotMatch(css, /url\s*\(\s*['"]?\s*(?:https?:|\/\/)/i, 'no remote CSS assets');
  }
});
