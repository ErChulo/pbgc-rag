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
  for (const file of ['assets/app.js', 'assets/core.js']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(text, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval)\s*\(/, file);
    assert.doesNotMatch(text, /\bnew\s+Function\s*\(/, file);
    assert.doesNotMatch(text, /\.(?:innerHTML|outerHTML)\s*=/, file);
    assert.doesNotMatch(text, /insertAdjacentHTML\s*\(/, file);
  }
});
