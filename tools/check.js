#!/usr/bin/env node
'use strict';
// Development verification only. No runtime dependency on this tool.
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const browser = new Set(['browser.test.js','accessibility.test.js','pdf.test.js','pdf-security.test.js','ingest.test.js','performance.test.js','package.test.js']);
const includeBrowser = process.argv.includes('--browser');
let failed = false;
for (const file of fs.readdirSync(path.join(root,'tests')).filter(name=>name.endsWith('.test.js')).sort()) {
  if (browser.has(file) && !includeBrowser) continue;
  process.stdout.write(`\n${file}\n`);
  const result=spawnSync(process.execPath,[path.join(root,'tests',file)],{cwd:root,stdio:'inherit',env:process.env});
  if(result.status!==0)failed=true;
}
if(!includeBrowser)process.stdout.write('\nBrowser checks omitted. Use --browser for actual file://, or set PBGC_TEST_URL for supplementary HTTP evidence.\n');
process.exitCode=failed?1:0;
