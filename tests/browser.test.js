'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

// Development verification only. The delivered application needs no Node or server.
const targetURL = process.env.PBGC_TEST_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href;
test(`${targetURL.startsWith('file:') ? 'actual file://' : 'supplementary HTTP only'} workflow, inert source text, integrity and no external network`, async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const network = [];
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  context.on('request', request => {
    if (/^https?:|^wss?:/.test(request.url()) && !request.url().startsWith(process.env.PBGC_TEST_URL || 'file:')) network.push(request.url());
  });
  await context.route(/^https?:\/\//, route => route.request().url().startsWith(process.env.PBGC_TEST_URL || 'file:') ? route.continue() : route.abort());
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pbgc-browser-'));
  try {
    await page.goto(targetURL);
    assert.equal(new URL(page.url()).protocol, new URL(targetURL).protocol);
    await page.locator('#case-name').fill('Synthetic browser verification');
    await page.locator('#create-case').click();
    await page.waitForFunction(() => !document.querySelector('#create-case').disabled);
    const source = 'Synthetic evidence only\nUniqueEvidence914 annual amount 1250\n<img src="https://example.invalid/track" onerror="window.injected=true">\n';
    await page.locator('#files').setInputFiles({ name: 'synthetic.txt', mimeType: 'text/plain', buffer: Buffer.from(source) });
    await page.waitForFunction(() => document.body.textContent.includes('synthetic.txt'));
    await page.locator('#query').fill('UniqueEvidence914');
    await page.locator('#search-mode').selectOption('keyword');
    await page.locator('#search').click();
    await page.waitForFunction(() => !document.querySelector('#search').disabled);
    await page.waitForFunction(() => document.querySelector('#results').textContent.includes('UniqueEvidence914'));
    assert.match(await page.locator('#results').innerText(), /synthetic\.txt/);
    await page.locator('#query').fill('UniqueEvidence914 annual amount');
    await page.locator('#search-mode').selectOption('exact');
    await page.locator('#search').click();
    await page.waitForFunction(() => !document.querySelector('#search').disabled);
    assert.match(await page.locator('#results').innerText(), /UniqueEvidence914 annual amount 1250/);
    await page.locator('#query').fill('amount annual');
    await page.locator('#search').click();
    await page.waitForFunction(() => !document.querySelector('#search').disabled);
    assert.match(await page.locator('#results').innerText(), /0 results/);
    await page.locator('#search-mode').selectOption('keyword');
    const originalDownloadPromise = page.waitForEvent('download');
    await page.locator('#sources').getByRole('button', {name: 'Save original', exact:true}).click();
    const originalDownload = await originalDownloadPromise;
    const originalPath = path.join(directory, 'original.txt');
    await originalDownload.saveAs(originalPath);
    assert.equal(await fs.readFile(originalPath, 'utf8'), source);
    for (const bad of [
      { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{broken'), error: 'Invalid JSON' },
      { name: 'malformed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf'), error: 'Invalid PDF header' },
      { name: 'unsupported.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('not a legacy document'), error: 'Unsupported' }
    ]) {
      await page.locator('#files').setInputFiles([
        { name: 'pending.txt', mimeType: 'text/plain', buffer: Buffer.from('must not commit') },
        { name: bad.name, mimeType: bad.mimeType, buffer: bad.buffer }
      ]);
      await page.waitForFunction(error => document.querySelector('#status').textContent.includes(error), bad.error);
      assert.equal(await page.locator('#sources li').count(), 1, 'failed source batch is atomic');
      assert.doesNotMatch(await page.locator('#sources').innerText(), /pending/);
    }
    await page.locator('#query').fill('<img');
    await page.locator('#search').click();
    await page.waitForFunction(() => !document.querySelector('#search').disabled);
    await page.waitForFunction(() => document.querySelector('#results').textContent.includes('<img'));
    assert.equal(await page.locator('#results img').count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    const beforeTheme = await page.locator('body').getAttribute('class');
    await page.locator('#theme-toggle').click();
    const afterTheme = await page.locator('body').getAttribute('class');
    assert.notEqual(afterTheme, beforeTheme, 'theme control changes theme');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-case').click();
    const download = await downloadPromise;
    const packagePath = path.join(directory, 'case.json');
    await download.saveAs(packagePath);
    const data = JSON.parse(await fs.readFile(packagePath, 'utf8'));
    assert.equal(data.schemaVersion, 1);
    assert.equal(data.sources.length, 1);
    assert.equal(Buffer.from(data.sources[0].bytesBase64, 'base64').toString(), source);
    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('#close-case').click();
    await page.waitForFunction(() => !document.querySelector('#close-case').disabled);
    assert.equal(await page.locator('#sources li').count(), 1, 'cancel preserves case');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#close-case').click();
    await page.waitForFunction(() => !document.querySelector('#close-case').disabled);
    assert.equal(await page.locator('#sources li').count(), 0);
    await page.locator('#case-name').fill('Isolated empty case');
    await page.locator('#create-case').click();
    await page.waitForFunction(() => !document.querySelector('#create-case').disabled);
    await page.locator('#query').fill('UniqueEvidence914');
    await page.locator('#search').click();
    await page.waitForFunction(() => !document.querySelector('#search').disabled);
    assert.match(await page.locator('#results').innerText(), /0 results/, 'new case cannot search closed case');
    await page.locator('#import-case').setInputFiles(packagePath);
    await page.waitForFunction(() => document.body.textContent.includes('synthetic.txt'));
    await page.locator('#query').fill('UniqueEvidence914');
    await page.locator('#search').click();
    await page.waitForFunction(() => !document.querySelector('#search').disabled);
    await page.waitForFunction(() => document.querySelector('#results').textContent.includes('UniqueEvidence914'));
    // A tampered package must fail without destroying the current workspace.
    data.sources[0].bytesBase64 = Buffer.from('altered evidence').toString('base64');
    const corruptPath = path.join(directory, 'corrupt.json');
    await fs.writeFile(corruptPath, JSON.stringify(data));
    await page.locator('#import-case').setInputFiles(corruptPath);
    await page.waitForFunction(() => /hash|integrity|checksum/i.test(document.querySelector('#status').textContent));
    await page.locator('#search').click();
    await page.waitForFunction(() => !document.querySelector('#search').disabled);
    assert.match(await page.locator('#results').innerText(), /UniqueEvidence914/);
    await page.screenshot({ path: '/tmp/pbgc-rag-workspace.png', fullPage: true });
    await page.getByRole('link', {name:'Search guide',exact:true}).click();
    assert.match(page.url(), /#help$/);
    assert.equal(network.length, 0, `Unexpected network: ${network.join(', ')}`);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    await browser.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('unavailable local storage keeps import, search and portable export usable', async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('Blocked for verification', 'SecurityError'); } });
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked for verification', 'SecurityError'); } });
  });
  const page = await context.newPage();
  try {
    await page.goto(targetURL);
    await page.waitForFunction(() => /Memory only/i.test(document.querySelector('#storage').textContent));
    await page.locator('#demo').click();
    await page.waitForFunction(() => document.body.textContent.includes('synthetic-plan.txt'));
    await page.locator('#query').fill('retirement');
    await page.locator('#search').click();
    await page.waitForFunction(() => !document.querySelector('#search').disabled);
    await page.waitForFunction(() => document.querySelector('#results').textContent.includes('Normal retirement age is 65.'));
    const downloaded = page.waitForEvent('download');
    await page.locator('#export-case').click();
    const download = await downloaded;
    assert.equal(await download.failure(), null);
    assert.match(await page.locator('#storage').innerText(), /Memory only/);
  } finally { await context.close(); await browser.close(); }
});

test('advanced queries, evidence viewer, graph, provisional reports and IndexedDB recovery', async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context = await browser.newContext({acceptDownloads:true});
  const page = await context.newPage();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'pbgc-advanced-'));
  try {
    await page.goto(targetURL);
    await page.waitForFunction(() => !document.querySelector('#demo').disabled);
    await page.locator('#demo').click();
    await page.waitForFunction(() => document.querySelector('#sources').textContent.includes('synthetic-plan.txt'));
    await page.locator('#search-mode').selectOption('regex');
    await page.locator('#query').fill('retire[a-z]+');
    await page.locator('#search').click();
    await page.waitForFunction(() => !document.querySelector('#search').disabled);
    await page.waitForFunction(() => document.querySelector('#results').textContent.includes('Normal retirement age is 65.'));
    await page.locator('#results').getByRole('button',{name:'View evidence'}).first().click();
    await page.waitForFunction(() => document.querySelector('#source-view').open);
    assert.match(await page.locator('#source-records').innerText(), /Normal retirement age is 65/);
    assert.equal(await page.locator('#source-details').evaluate(node => node.open), false);
    assert.doesNotMatch(await page.locator('#source-view').innerText(), /[a-f0-9]{64}/);
    await page.locator('#source-details > summary').click();
    assert.match(await page.locator('#source-details').innerText(), /[a-f0-9]{64}/);
    await page.locator('#source-details > summary').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#source-view').evaluate(n => n.open), false);
    await page.locator('#search-mode').selectOption('sql');
    await page.locator('#query').fill("SELECT * FROM records WHERE text CONTAINS 'retirement' LIMIT 5");
    await page.locator('#search').click();
    await page.waitForFunction(() => !document.querySelector('#search').disabled);
    await page.waitForFunction(() => document.querySelector('#results').textContent.includes('Normal retirement age is 65.'));
    await page.locator('#query').fill('DELETE FROM records');
    await page.locator('#search').click();
    await page.waitForFunction(() => !document.querySelector('#search').disabled);
    await page.waitForFunction(() => /SQL|SELECT|Unsupported/i.test(document.querySelector('#status').textContent));
    await page.locator('#graph-tools > summary').click();
    await page.locator('#graph-search').click();
    await page.waitForFunction(() => document.querySelector('#graph-results').textContent.length > 0);
    assert.match(await page.locator('#graph-results').innerText(), /synthetic-plan|record|document/i);
    await page.locator('#graph-tools').getByText('Proposed evidence links',{exact:true}).click();
    await page.locator('#graph-label').fill('Synthetic evidence link');await page.locator('#graph-author').fill('Synthetic reviewer');
    await page.locator('#graph-recorded').fill('2025-01-01');await page.locator('#graph-from').fill('2025-01-01');await page.locator('#graph-to').fill('2025-12-31');
    await page.locator('#graph-link').click();await page.waitForFunction(() => !document.querySelector('#graph-link').disabled);
    assert.match(await page.locator('#graph-link-count').innerText(),/1 proposed links. None approved/,await page.locator('#status').innerText());
    const graphPending=page.waitForEvent('download');await page.locator('#export-graph').click();const graphDownload=await graphPending;
    const graphPath=path.join(directory,'graph.json');await graphDownload.saveAs(graphPath);const graphData=JSON.parse(await fs.readFile(graphPath,'utf8'));
    assert.equal(graphData.edges.filter(edge=>edge.type==='user-link').length,1);
    await page.locator('#import-graph').setInputFiles(graphPath);await page.waitForFunction(() => !document.querySelector('#import-graph').disabled);
    assert.match(await page.locator('#status').innerText(),/No link was approved/);
    graphData.nodes[0].sourceHash='0'.repeat(64);const forgedPath=path.join(directory,'forged-graph.json');await fs.writeFile(forgedPath,JSON.stringify(graphData));
    await page.locator('#import-graph').setInputFiles(forgedPath);await page.waitForFunction(() => !document.querySelector('#import-graph').disabled);
    assert.doesNotMatch(await page.locator('#status').innerText(),/Graph restored/);
    assert.match(await page.locator('#graph-link-count').innerText(),/1 proposed links/);

    await page.locator('#build-review').click();
    await page.waitForFunction(() => document.querySelector('#review-results').textContent.length > 0);
    assert.match(await page.locator('#review-results').innerText(), /provisional|blocked|not official/i);
    let pending = page.waitForEvent('download');
    await page.locator('#export-r1').click();
    let download = await pending;
    const r1 = path.join(directory,'review.txt'); await download.saveAs(r1);
    assert.match(await fs.readFile(r1,'utf8'), /NOT AN OFFICIAL ARTIFACT/);
    pending = page.waitForEvent('download');
    await page.locator('#export-bsrs').click();
    download = await pending;
    const bsrs = path.join(directory,'bsrs.json'); await download.saveAs(bsrs);
    const planning = JSON.parse(await fs.readFile(bsrs,'utf8'));
    assert.equal(planning.official,false); assert.equal(planning.executable,false); assert.equal(planning.status,'BLOCKED');
    await page.locator('#report-tools summary').click();
    await page.locator('#report-title').fill('Source report <img src=x>');
    await page.locator('#timeline-date').fill('2025-01-01');
    await page.locator('#timeline-label').fill('Synthetic date annotation');
    await page.locator('#add-timeline').click();
    await page.waitForFunction(() => !document.querySelector('#add-timeline').disabled);
    assert.match(await page.locator('#timeline-list').innerText(),/Synthetic date annotation/);
    pending = page.waitForEvent('download');await page.locator('#export-layout').click();
    download = await pending;const layoutPath=path.join(directory,'layout.json');await download.saveAs(layoutPath);
    const layout=JSON.parse(await fs.readFile(layoutPath,'utf8'));
    assert.equal(layout.timeline.length,1);assert.match(layout.timeline[0].sourceHash,/^[a-f0-9]{64}$/);
    pending = page.waitForEvent('download');await page.locator('#export-report').click();
    download = await pending;const reportPath=path.join(directory,'report.html');await download.saveAs(reportPath);
    const reportHTML=await fs.readFile(reportPath,'utf8');
    assert.match(reportHTML,/NONOFFICIAL REPORT/);assert.match(reportHTML,/Synthetic date annotation/);
    assert.match(reportHTML,/&lt;img src=x&gt;/);assert.doesNotMatch(reportHTML,/<img\b/);
    pending = page.waitForEvent('download');await page.locator('#export-csv').click();
    download=await pending;const csvPath=path.join(directory,'inventory.csv');await download.saveAs(csvPath);
    assert.match(await fs.readFile(csvPath,'utf8'),/synthetic-plan\.txt/);
    await page.locator('#import-layout').setInputFiles(layoutPath);
    await page.waitForFunction(() => !document.querySelector('#import-layout').disabled);
    assert.match(await page.locator('#timeline-list').innerText(),/2025-01-01/);
    pending=page.waitForEvent('download');await page.locator('#export-review-package').click();download=await pending;
    const reviewerPath=path.join(directory,'reviewer-package.json');await download.saveAs(reviewerPath);const reviewer=JSON.parse(await fs.readFile(reviewerPath,'utf8'));
    assert.equal(reviewer.kind,'provisional-reviewer-package');assert.equal(reviewer.official,false);assert.equal(reviewer.manifest.validation.officialRelease,'BLOCKED');assert.equal(reviewer.artifacts.length,5);
    const beforeRestore=await page.locator('#workspace-select option').count();
    await page.locator('#import-review-package').setInputFiles(reviewerPath);await page.waitForFunction(()=>!document.querySelector('#import-review-package').disabled);
    assert.match(await page.locator('#status').innerText(),/Reviewer package restored/);assert.equal(await page.locator('#workspace-select option').count(),beforeRestore+1);
    assert.match(await page.locator('#timeline-list').innerText(),/Synthetic date annotation/);
    const artifact=reviewer.artifacts.find(item=>item.name==='provisional-r1-draft.txt');artifact.text+='\nFORGED DETERMINATION';artifact.bytes=Buffer.byteLength(artifact.text);artifact.sha256=require('node:crypto').createHash('sha256').update(artifact.text).digest('hex');
    const manifestArtifact=reviewer.manifest.artifactHashes.find(item=>item.name===artifact.name);manifestArtifact.bytes=artifact.bytes;manifestArtifact.sha256=artifact.sha256;
    const forgedReviewerPath=path.join(directory,'forged-reviewer.json');await fs.writeFile(forgedReviewerPath,JSON.stringify(reviewer));const activeBefore=await page.locator('#workspace-select').inputValue();
    await page.locator('#import-review-package').setInputFiles(forgedReviewerPath);await page.waitForFunction(()=>!document.querySelector('#import-review-package').disabled);
    assert.match(await page.locator('#status').innerText(),/does not match rebuilt source evidence/);assert.equal(await page.locator('#workspace-select option').count(),beforeRestore+1);assert.equal(await page.locator('#workspace-select').inputValue(),activeBefore);

    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#demo').disabled);
    assert.match(await page.locator('#sources').innerText(), /synthetic-plan.txt/);
    assert.match(await page.locator('#storage').innerText(), /IndexedDB/i);
    await page.locator('#search-mode').selectOption('keyword');
    await page.locator('#query').fill('retirement'); await page.locator('#search').click();
    await page.waitForFunction(() => !document.querySelector('#search').disabled);
    await page.waitForFunction(() => document.querySelector('#results').textContent.includes('Normal retirement age is 65.'));
  } finally {await context.close();await browser.close();await fs.rm(directory,{recursive:true,force:true});}
});

function syntheticPdf(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let textPdf = '%PDF-1.4\n', offsets = [0];
  objects.forEach((object,index) => {offsets.push(Buffer.byteLength(textPdf));textPdf += `${index+1} 0 obj\n${object}\nendobj\n`;});
  const xref = Buffer.byteLength(textPdf);
  textPdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(textPdf);
}
test('local PDF extraction and inert HTML/XML imports preserve locators without external requests', async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context = await browser.newContext(); const page = await context.newPage(); const external = [];
  context.on('request', request => {if (/^https?:/.test(request.url()) && !request.url().startsWith(process.env.PBGC_TEST_URL || 'file:')) external.push(request.url());});
  await context.route(/^https?:\/\//, route => route.request().url().startsWith(process.env.PBGC_TEST_URL || 'file:') ? route.continue() : route.abort());
  try {
    await page.goto(targetURL);await page.waitForFunction(() => !document.querySelector('#create-case').disabled);
    await page.locator('#case-name').fill('Synthetic format verification');await page.locator('#create-case').click();
    await page.waitForFunction(() => !document.querySelector('#create-case').disabled);
    await page.locator('#files').setInputFiles([
      {name:'synthetic.pdf',mimeType:'application/pdf',buffer:syntheticPdf('PdfEvidence947 retirement age 65')},
      {name:'synthetic.html',mimeType:'text/html',buffer:Buffer.from('<html><body><p>HtmlEvidence947</p><img src="https://example.invalid/image"><script>window.injected=true</script></body></html>')},
      {name:'synthetic.xml',mimeType:'text/xml',buffer:Buffer.from('<case><evidence>XmlEvidence947</evidence></case>')}
    ]);
    await page.waitForFunction(() => !document.querySelector('#files').disabled);
    assert.equal(await page.locator('#sources li').count(),3, await page.locator('#status').innerText());
    for (const [query,locator] of [['PdfEvidence947','pdf-text-item'],['HtmlEvidence947','html'],['XmlEvidence947','xml']]) {
      await page.locator('#query').fill(query);await page.locator('#search').click();await page.waitForFunction(() => !document.querySelector('#search').disabled);
      assert.match(await page.locator('#results').innerText(),new RegExp(query));
      assert.match(await page.locator('#results').innerText(),new RegExp(locator));
    }
    assert.equal(await page.evaluate(() => window.injected),undefined);
    assert.deepEqual(external,[]);
  } finally {await context.close();await browser.close();}
});

test('cancelled batch checkpoint survives reload, resumes without duplicates and isolates case/library searches', async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context = await browser.newContext();
  await context.addInitScript(() => { const original=File.prototype.arrayBuffer;File.prototype.arrayBuffer=async function(){if(this.name==='slow.txt')await new Promise(resolve=>setTimeout(resolve,500));return original.call(this);}; });
  const page=await context.newPage();
  const first={name:'checked.txt',mimeType:'text/plain',buffer:Buffer.from('CaseOnlyEvidence982')};
  const second={name:'slow.txt',mimeType:'text/plain',buffer:Buffer.from('SecondEvidence982')};
  try {
    await page.goto(targetURL);await page.waitForFunction(() => !document.querySelector('#create-case').disabled);
    await page.locator('#case-name').fill('Checkpoint case');await page.locator('#create-case').click();await page.waitForFunction(() => !document.querySelector('#create-case').disabled);
    const caseId=await page.locator('#workspace-select').inputValue();
    await page.locator('#files').setInputFiles([first,second]);
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('2 of 2'));
    await page.locator('#cancel-operation').click();
    await page.waitForFunction(() => !document.querySelector('#files').disabled);
    assert.match(await page.locator('#status').innerText(),/cancel/i);
    assert.equal(await page.locator('#sources li').count(),0,'uncommitted batch must not become active');
    assert.match(await page.locator('#checkpoint-status').innerText(),/1 checked sources/);
    await page.reload();await page.waitForFunction(() => !document.querySelector('#files').disabled);
    assert.match(await page.locator('#checkpoint-status').innerText(),/1 checked sources/);
    await page.locator('#files').setInputFiles([first,second]);await page.waitForFunction(() => !document.querySelector('#files').disabled);
    assert.equal(await page.locator('#sources li').count(),2,'resuming skips already checked bytes');
    assert.equal(await page.locator('#checkpoint-status').innerText(),'');
    await page.locator('#workspace-select').selectOption('reference-library');await page.waitForFunction(() => !document.querySelector('#workspace-select').disabled);
    await page.locator('#query').fill('CaseOnlyEvidence982');await page.locator('#search').click();await page.waitForFunction(() => !document.querySelector('#search').disabled);
    assert.match(await page.locator('#results').innerText(),/0 results/);
    await page.locator('#files').setInputFiles({name:'reference.txt',mimeType:'text/plain',buffer:Buffer.from('ReferenceOnlyEvidence982')});await page.waitForFunction(() => !document.querySelector('#files').disabled);
    await page.locator('#workspace-select').selectOption(caseId);await page.waitForFunction(() => !document.querySelector('#workspace-select').disabled);
    await page.locator('#query').fill('ReferenceOnlyEvidence982');await page.locator('#search').click();await page.waitForFunction(() => !document.querySelector('#search').disabled);
    assert.match(await page.locator('#results').innerText(),/0 results/);
    await page.locator('#query').fill('CaseOnlyEvidence982');await page.locator('#search').click();await page.waitForFunction(() => !document.querySelector('#search').disabled);
    assert.match(await page.locator('#results').innerText(),/CaseOnlyEvidence982/);
  }finally{await context.close();await browser.close();}
});

function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return(c^0xffffffff)>>>0;}
const {deflateRawSync}=require('node:zlib');
function zip(parts,deflate=false){let offset=0;const locals=[],directory=[];for(const [name,value]of Object.entries(parts)){const n=Buffer.from(name),b=Buffer.from(value),data=deflate?deflateRawSync(b):b,crc=crc32(b);const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt16LE(deflate?8:0,8);l.writeUInt32LE(crc,14);l.writeUInt32LE(data.length,18);l.writeUInt32LE(b.length,22);l.writeUInt16LE(n.length,26);locals.push(l,n,data);const d=Buffer.alloc(46);d.writeUInt32LE(0x02014b50);d.writeUInt16LE(20,4);d.writeUInt16LE(20,6);d.writeUInt16LE(deflate?8:0,10);d.writeUInt32LE(crc,16);d.writeUInt32LE(data.length,20);d.writeUInt32LE(b.length,24);d.writeUInt16LE(n.length,28);d.writeUInt32LE(offset,42);directory.push(d,n);offset+=l.length+n.length+data.length;}const dir=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(parts).length,8);end.writeUInt16LE(Object.keys(parts).length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);return new Uint8Array(Buffer.concat([...locals,dir,end]));}

test('DOCX, compressed XLSX and SQLite worker imports retain document/table locators and formulas', async () => {
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pbgc-office-browser-'));
  try {
    const dbPath=path.join(directory,'synthetic.sqlite');
    require('node:child_process').execFileSync('python',['-c',"import sqlite3,sys\nc=sqlite3.connect(sys.argv[1])\nc.execute('CREATE TABLE evidence (id INTEGER PRIMARY KEY, excerpt TEXT)')\nc.execute('INSERT INTO evidence VALUES (?,?)',(7,'DatabaseEvidence736'))\nc.commit()\nc.close()",dbPath]);
    const docx={'[Content_Types].xml':'<Types/>','word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>OfficeEvidence736</w:t></w:r></w:p></w:body></w:document>'};
    const workbook={'[Content_Types].xml':'<Types/>','xl/workbook.xml':'<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Synthetic" sheetId="1" r:id="rId1"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>','xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>WorkbookEvidence736</t></is></c><c r="B1"><f>1+2</f><v>3</v></c></row></sheetData></worksheet>'};
    await page.goto(targetURL);await page.waitForFunction(()=>!document.querySelector('#create-case').disabled);
    await page.locator('#case-name').fill('Synthetic Office and database');await page.locator('#create-case').click();await page.waitForFunction(()=>!document.querySelector('#create-case').disabled);
    await page.locator('#files').setInputFiles([
      {name:'synthetic.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from(zip(docx))},
      {name:'synthetic.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(zip(workbook,true))},
      {name:'synthetic.sqlite',mimeType:'application/vnd.sqlite3',buffer:await fs.readFile(dbPath)}
    ]);
    await page.waitForFunction(()=>!document.querySelector('#files').disabled);
    assert.equal(await page.locator('#sources li').count(),3,await page.locator('#status').innerText());
    for(const [query,locator]of [['OfficeEvidence736','Paragraph 1'],['WorkbookEvidence736','Synthetic · Cell A1'],['DatabaseEvidence736','evidence · Row 7 · excerpt']]){
      await page.locator('#query').fill(query);await page.locator('#search').click();await page.waitForFunction(()=>!document.querySelector('#search').disabled);
      assert.match(await page.locator('#results').innerText(),new RegExp(query));assert.match(await page.locator('#results').innerText(),new RegExp(locator));
    }
    const pending=page.waitForEvent('download');await page.locator('#export-case').click();const download=await pending;const packagePath=path.join(directory,'case.json');await download.saveAs(packagePath);const data=JSON.parse(await fs.readFile(packagePath,'utf8'));
    assert.equal(data.sources.find(source=>source.name.endsWith('.xlsx')).records.find(record=>record.locator.cell==='B1').formula,'1+2');
    assert.equal(data.sources.find(source=>source.name.endsWith('.sqlite')).records.find(record=>record.locator.column==='excerpt').locator.rowid,'7');
  }finally{await context.close();await browser.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('all-workspace backup confirmation, restore and source-verified previous snapshots reject corrupt recovery',async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pbgc-catalog-browser-'));
  try{
    await page.goto(targetURL);await page.waitForFunction(()=>!document.querySelector('#demo').disabled);await page.locator('#demo').click();await page.waitForFunction(()=>!document.querySelector('#demo').disabled);
    await page.locator('#workspace-select').selectOption('reference-library');await page.waitForFunction(()=>!document.querySelector('#workspace-select').disabled);
    await page.locator('#files').setInputFiles({name:'reference.txt',mimeType:'text/plain',buffer:Buffer.from('CatalogReferenceEvidence438')});await page.waitForFunction(()=>!document.querySelector('#files').disabled);
    await page.getByText('Recovery backups and privacy',{exact:true}).click();
    const pending=page.waitForEvent('download');await page.locator('#export-catalog').click();const download=await pending;const backupPath=path.join(directory,'catalog.json');await download.saveAs(backupPath);const backup=JSON.parse(await fs.readFile(backupPath,'utf8'));
    assert.equal(backup.schemaVersion,2);assert.equal(backup.cases.length,1);assert.equal(backup.library.sources.length,1);
    await page.locator('#case-name').fill('Disposable case');await page.locator('#create-case').click();await page.waitForFunction(()=>!document.querySelector('#create-case').disabled);
    await page.locator('#files').setInputFiles({name:'disposable.txt',mimeType:'text/plain',buffer:Buffer.from('DisposableEvidence438')});await page.waitForFunction(()=>!document.querySelector('#files').disabled);const disposableId=await page.locator('#workspace-select').inputValue();const beforeCount=await page.locator('#workspace-select option').count();
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('#import-catalog').setInputFiles(backupPath);await page.waitForFunction(()=>!document.querySelector('#import-catalog').disabled);assert.equal(await page.locator('#workspace-select').inputValue(),disposableId);assert.equal(await page.locator('#workspace-select option').count(),beforeCount);
    assert.equal(await page.locator('#import-catalog').inputValue(),'','cancelled backup selection can be retried');page.once('dialog',dialog=>dialog.accept());await page.locator('#import-catalog').setInputFiles(backupPath);await page.waitForFunction(()=>!document.querySelector('#import-catalog').disabled);assert.match(await page.locator('#status').innerText(),/All-workspace backup restored/);assert.equal(await page.locator('#workspace-select option').count(),beforeCount-1);assert.equal(await page.locator('#workspace-select').inputValue(),'reference-library');assert.match(await page.locator('#sources').innerText(),/reference.txt/);
    await page.locator('#recover-previous').click();await page.waitForFunction(()=>!document.querySelector('#recover-previous').disabled);assert.match(await page.locator('#status').innerText(),/Previous recovery snapshot restored and source hashes verified/);assert.equal(await page.locator('#workspace-select').inputValue(),disposableId);assert.match(await page.locator('#sources').innerText(),/disposable.txt/);
    backup.cases[0].sources[0].hash='0'.repeat(64);const corruptPath=path.join(directory,'corrupt-catalog.json');await fs.writeFile(corruptPath,JSON.stringify(backup));let dialogs=0;const rejectDialog=dialog=>{dialogs++;dialog.dismiss();};page.on('dialog',rejectDialog);
    await page.locator('#import-catalog').setInputFiles(corruptPath);await page.waitForFunction(()=>!document.querySelector('#import-catalog').disabled);assert.match(await page.locator('#status').innerText(),/Integrity check failed/);assert.equal(dialogs,0,'unverified backup must fail before replacement confirmation');assert.equal(await page.locator('#workspace-select').inputValue(),disposableId);assert.equal(await page.locator('#workspace-select option').count(),beforeCount);page.off('dialog',rejectDialog);
    // Simulate corrupt local recovery, rather than trusting IndexedDB as evidence.
    await page.evaluate(async()=>{
      const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('pbgc-rag-recovery',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      try{const raw=await new Promise((resolve,reject)=>{const request=db.transaction('recovery','readonly').objectStore('recovery').get('pbgc-rag.recovery.v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});const envelope=JSON.parse(raw);envelope.previous.value.cases[0].sources[0].hash='f'.repeat(64);
        await new Promise((resolve,reject)=>{const tx=db.transaction('recovery','readwrite');tx.objectStore('recovery').put(JSON.stringify(envelope),'pbgc-rag.recovery.v1');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
      }finally{db.close();}
    });
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#recover-previous').disabled);assert.equal(await page.locator('#workspace-select').inputValue(),disposableId);
    await page.locator('#recover-previous').click();await page.waitForFunction(()=>!document.querySelector('#recover-previous').disabled);assert.match(await page.locator('#status').innerText(),/Integrity check failed/);assert.equal(await page.locator('#workspace-select').inputValue(),disposableId);assert.match(await page.locator('#sources').innerText(),/disposable.txt/);
  }finally{await context.close();await browser.close();await fs.rm(directory,{recursive:true,force:true});}
});


test('readable evidence presentation keeps technical provenance collapsed and original exports intact', async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context = await browser.newContext({acceptDownloads:true});
  const page = await context.newPage();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pbgc-readable-'));
  const source = 'Synthetic heading\nReadableEvidence529 annual amount 1250\nNearby context\n';
  try {
    await page.goto(targetURL);
    await page.waitForFunction(() => !document.querySelector('#create-case').disabled);
    await page.locator('#case-name').fill('Readable evidence verification');
    await page.locator('#create-case').click();
    await page.waitForFunction(() => !document.querySelector('#create-case').disabled);
    await page.locator('#files').setInputFiles({name:'readable-evidence.txt',mimeType:'text/plain',buffer:Buffer.from(source)});
    await page.waitForFunction(() => !document.querySelector('#files').disabled);
    assert.match(await page.locator('#sources').innerText(), /readable-evidence\.txt/);
    assert.doesNotMatch(await page.locator('#sources').innerText(), /[a-f0-9]{64}|\{"type"/);
    await page.locator('#query').fill('ReadableEvidence529');
    await page.locator('#search').click();
    await page.waitForFunction(() => !document.querySelector('#search').disabled);
    assert.match(await page.locator('#results').innerText(), /Line 2/);
    assert.doesNotMatch(await page.locator('#results').innerText(), /[a-f0-9]{64}|\{"type"/);
    await page.locator('#results').getByRole('button',{name:'View evidence',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('#source-view').open);
    assert.equal(await page.locator('#source-title').innerText(), 'readable-evidence.txt');
    assert.match(await page.locator('#source-view').innerText(), /Line 2/);
    assert.match(await page.locator('#source-records').innerText(), /ReadableEvidence529 annual amount 1250/);
    assert.equal(await page.locator('#source-details').evaluate(node => node.open), false);
    assert.doesNotMatch(await page.locator('#source-view').innerText(), /[a-f0-9]{64}|\{"type"/);
    await page.evaluate(() => document.body.classList.add('light'));
    await page.locator('#source-view').screenshot({path:'/tmp/pbgc-readable-evidence-dialog.png'});
    await page.locator('#source-details > summary').click();
    assert.match(await page.locator('#source-details').innerText(), /[a-f0-9]{64}/);
    assert.match(await page.locator('#source-details').innerText(), /text-line/);
    await page.keyboard.press('Escape');
    const originalPending = page.waitForEvent('download');
    await page.locator('#sources').getByRole('button',{name:'Save original',exact:true}).click();
    const original = await originalPending;
    const originalPath = path.join(directory,'original.txt');
    await original.saveAs(originalPath);
    assert.equal(await fs.readFile(originalPath,'utf8'),source);
    const packagePending = page.waitForEvent('download');
    await page.locator('#export-case').click();
    const packageDownload = await packagePending;
    const packagePath = path.join(directory,'case.json');
    await packageDownload.saveAs(packagePath);
    const data = JSON.parse(await fs.readFile(packagePath,'utf8'));
    assert.equal(Buffer.from(data.sources[0].bytesBase64,'base64').toString(),source);
    assert.match(data.sources[0].hash,/^[a-f0-9]{64}$/);
    assert.equal(data.sources[0].records[1].locator.line,2);
  } finally {await context.close();await browser.close();await fs.rm(directory,{recursive:true,force:true});}
});
