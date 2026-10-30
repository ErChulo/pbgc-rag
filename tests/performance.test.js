'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const targetURL=process.env.PBGC_TEST_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href;

// Synthetic development budget smoke test. This does not establish Windows,
// enterprise browser, 16 GB RAM, total-process memory or production capacity.
test('18,000-record worker import, retrieval, bounded graph, far-record viewer and package export',async t=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();const metrics={},external=[];
  context.on('request',request=>{if(/^https?:|^wss?:/.test(request.url())&&!request.url().startsWith(process.env.PBGC_TEST_URL||'file:'))external.push(request.url());});
  await context.route(/^https?:\/\//,route=>route.request().url().startsWith(process.env.PBGC_TEST_URL||'file:')?route.continue():route.abort());
  try{
    await page.goto(targetURL);await page.waitForFunction(()=>!document.querySelector('#create-case').disabled);
    await page.locator('#case-name').fill('Synthetic workload');await page.locator('#create-case').click();await page.waitForFunction(()=>!document.querySelector('#create-case').disabled);
    const recordCount=18000,farIndex=17912;
    const text=Array.from({length:recordCount},(_,i)=>(`Record ${String(i).padStart(5,'0')} synthetic retirement evidence; source review only. ${i===farIndex?'FarRecord17912':''}`).padEnd(104,' ')).join('\n');
    assert.ok(text.length>1500000&&text.length<2000000);
    const start=performance.now();let since=start;
    await page.locator('#files').setInputFiles({name:'synthetic-workload.txt',mimeType:'text/plain',buffer:Buffer.from(text)});
    await page.waitForFunction(()=>!document.querySelector('#files').disabled,{},{timeout:25000});
    metrics.importMs=Math.round(performance.now()-since);assert.ok(metrics.importMs<15000,'worker import completes within the development guard');
    assert.match(await page.locator('#sources').innerText(),/18000 records/);
    since=performance.now();await page.locator('#query').fill('FarRecord17912');await page.locator('#search').click();await page.waitForFunction(()=>!document.querySelector('#search').disabled);
    metrics.keywordMs=Math.round(performance.now()-since);assert.match(await page.locator('#results').innerText(),/FarRecord17912/);
    await page.locator('#results').getByRole('button',{name:'View evidence'}).click();await page.waitForFunction(()=>document.querySelector('#source-view').open);
    assert.match(await page.locator('#source-records').innerText(),/FarRecord17912/);assert.ok(await page.locator('#source-records article').count()<=40,'viewer is paginated');
    assert.match(await page.locator('#source-page').innerText(),/179/);await page.keyboard.press('Escape');
    since=performance.now();await page.locator('#search-mode').selectOption('ranked');await page.locator('#query').fill('FarRecord17912 retirement');await page.locator('#search').click();await page.waitForFunction(()=>!document.querySelector('#search').disabled);
    metrics.rankedMs=Math.round(performance.now()-since);assert.match(await page.locator('#results article').first().innerText(),/FarRecord17912/);
    since=performance.now();await page.locator('#search-mode').selectOption('sql');await page.locator('#query').fill("SELECT * FROM records WHERE text CONTAINS 'FarRecord17912' LIMIT 1");await page.locator('#search').click();await page.waitForFunction(()=>!document.querySelector('#search').disabled);
    metrics.sqlMs=Math.round(performance.now()-since);assert.match(await page.locator('#results').innerText(),/FarRecord17912/);
    since=performance.now();await page.locator('#graph-tools > summary').click();await page.locator('#graph-search').click();await page.waitForFunction(()=>!document.querySelector('#graph-search').disabled);
    metrics.graphMs=Math.round(performance.now()-since);assert.match(await page.locator('#graph-results').innerText(),/100 nodes/);assert.match(await page.locator('#graph-results').innerText(),/Result limit reached/);
    since=performance.now();const pending=page.waitForEvent('download');await page.locator('#export-case').click();const download=await pending;assert.equal(await download.failure(),null);metrics.exportMs=Math.round(performance.now()-since);
    metrics.workflowMs=Math.round(performance.now()-start);assert.ok(metrics.workflowMs<30000,'workflow completes within the development smoke-test guard');
    const cancellation=await page.evaluate(async()=>{
      const controller=new AbortController(),bytes=new TextEncoder().encode('c'.repeat(1900000));let ticks=0;
      const started=performance.now(),heartbeat=setInterval(()=>ticks++,1),timer=setTimeout(()=>controller.abort(),10);
      try{await PBGCRag.parseIsolatedBytes('cancel-workload.txt',bytes,{signal:controller.signal});return {name:'completed',ms:performance.now()-started,ticks};}
      catch(error){return {name:error.name,ms:performance.now()-started,ticks};}
      finally{clearInterval(heartbeat);clearTimeout(timer);}
    });
    assert.equal(cancellation.name,'AbortError');assert.ok(cancellation.ms<2000,'worker cancellation returns promptly');assert.ok(cancellation.ticks>=1,'main-thread timer remains responsive during isolated parsing');
    metrics.cancelMs=Math.round(cancellation.ms);metrics.cancelHeartbeatTicks=cancellation.ticks;
    const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');const performanceMetrics=await cdp.send('Performance.getMetrics');
    metrics.rendererJSHeapUsedBytes=performanceMetrics.metrics.find(item=>item.name==='JSHeapUsedSize')?.value??null;
    metrics.rendererJSHeapTotalBytes=performanceMetrics.metrics.find(item=>item.name==='JSHeapTotalSize')?.value??null;
    metrics.records=recordCount;metrics.sourceBytes=Buffer.byteLength(text);metrics.memoryScope='Chromium renderer JavaScript heap only; excludes worker heaps and total process memory';
    assert.deepEqual(external,[]);t.diagnostic(JSON.stringify(metrics));
  }finally{await context.close();await browser.close();}
});

// Synthetic CFB/BIFF fixture builders shared in shape with legacy unit fixtures.
const FREE=0xffffffff,END=0xfffffffe,FAT=0xfffffffd;
const u16=(array,offset,value)=>new DataView(array.buffer,array.byteOffset,array.byteLength).setUint16(offset,value,true);
const u32=(array,offset,value)=>new DataView(array.buffer,array.byteOffset,array.byteLength).setUint32(offset,value>>>0,true);
const f64=(array,offset,value)=>new DataView(array.buffer,array.byteOffset,array.byteLength).setFloat64(offset,value,true);
function utf16(text){const bytes=new Uint8Array(text.length*2);for(let i=0;i<text.length;i++)u16(bytes,i*2,text.charCodeAt(i));return bytes;}
function concat(...parts){const bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;}
function compound(streams,sectorSize=512){
  const names=Object.keys(streams);assert.ok(names.length<=3,'fixture builder uses one directory sector');
  const sectors=[new Uint8Array(sectorSize)],allocation=[END],entries=[];let miniCount=0;const miniParts=[];
  function normal(data){const start=sectors.length,count=Math.ceil(data.length/sectorSize);for(let i=0;i<count;i++){const sector=new Uint8Array(sectorSize);sector.set(data.subarray(i*sectorSize,(i+1)*sectorSize));sectors.push(sector);allocation.push(i===count-1?END:start+i+1);}return count?start:END;}
  for(const name of names){const data=streams[name];if(data.length>=4096){entries.push({name,start:normal(data),size:data.length});}else{const start=data.length?miniCount:END,count=Math.ceil(data.length/64);const part=new Uint8Array(count*64);part.set(data);miniParts.push(part);entries.push({name,start,size:data.length,mini:true});miniCount+=count;}}
  const rootBytes=concat(...miniParts),rootStart=normal(rootBytes);const miniFat=new Uint8Array(miniCount?sectorSize:0);miniFat.fill(255);let miniIndex=0;for(const entry of entries){if(!entry.mini)continue;const count=Math.ceil(entry.size/64);for(let i=0;i<count;i++)u32(miniFat,(miniIndex+i)*4,i===count-1?END:miniIndex+i+1);miniIndex+=count;}
  const miniStart=normal(miniFat),fatId=sectors.length;sectors.push(new Uint8Array(sectorSize));allocation.push(FAT);assert.ok(sectors.length<sectorSize/4);
  const fat=sectors[fatId];fat.fill(255);allocation.forEach((value,index)=>u32(fat,index*4,value));
  const dir=sectors[0];function directory(index,name,type,start,size,right,child){const offset=index*128;const raw=utf16(name+'\0');dir.set(raw,offset);u16(dir,offset+64,raw.length);dir[offset+66]=type;dir[offset+67]=1;u32(dir,offset+68,FREE);u32(dir,offset+72,right);u32(dir,offset+76,child);u32(dir,offset+116,start);u32(dir,offset+120,size);}
  directory(0,'Root Entry',5,rootStart,rootBytes.length,FREE,names.length?1:FREE);entries.forEach((entry,index)=>directory(index+1,entry.name,2,entry.start,entry.size,index===entries.length-1?FREE:index+2,FREE));
  const header=new Uint8Array(sectorSize);header.set([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);u16(header,24,0x003e);u16(header,26,sectorSize===512?3:4);u16(header,28,0xfffe);u16(header,30,sectorSize===512?9:12);u16(header,32,6);u32(header,40,sectorSize===512?0:1);u32(header,44,1);u32(header,48,0);u32(header,56,4096);u32(header,60,miniStart);u32(header,64,miniCount?1:0);u32(header,68,END);for(let i=0;i<109;i++)u32(header,76+i*4,FREE);u32(header,76,fatId);return concat(header,...sectors);
}
function wordFixture(text,{compressed=false,split=null,encrypted=false,large=false}={}){
  const word=new Uint8Array(large?4096:1024);u16(word,0,0xa5ec);u16(word,2,0x00c1);u16(word,10,0x0200|(encrypted?0x0100:0));u16(word,32,14);u16(word,62,22);u32(word,76,text.length);u16(word,152,34);
  const pieces=split===null?[text]:[text.slice(0,split),text.slice(split)];const plc=new Uint8Array(4+pieces.length*12);let cp=0,fc=700;u32(plc,0,0);for(let i=0;i<pieces.length;i++){const bytes=compressed?Uint8Array.from(pieces[i],c=>c.charCodeAt(0)):utf16(pieces[i]);word.set(bytes,fc);cp+=pieces[i].length;u32(plc,(i+1)*4,cp);u32(plc,(pieces.length+1)*4+i*8+2,compressed?(fc*2)|0x40000000:fc);fc+=bytes.length+4;}
  const clx=new Uint8Array(5+plc.length);clx[0]=2;u32(clx,1,plc.length);clx.set(plc,5);u32(word,154+33*8,0);u32(word,154+33*8+4,clx.length);return compound({WordDocument:word,'1Table':clx});
}
function record(id,data=new Uint8Array()){const out=new Uint8Array(data.length+4);u16(out,0,id);u16(out,2,data.length);out.set(data,4);return out;}
function unicode(text,{short=false,wide=true}={}){const bytes=new Uint8Array((short?2:3)+text.length*(wide?2:1));if(short)bytes[0]=text.length;else u16(bytes,0,text.length);bytes[short?1:2]=wide?1:0;bytes.set(wide?utf16(text):Uint8Array.from(text,c=>c.charCodeAt(0)),short?2:3);return bytes;}
function cellPrefix(row,col,size){const bytes=new Uint8Array(size);u16(bytes,0,row);u16(bytes,2,col);return bytes;}
function workbookFixture({encrypt=false,badSst=false,sstContinue=false,formulaString=false,raw=false}={}){
  const bof=type=>{const bytes=new Uint8Array(16);u16(bytes,0,0x0600);u16(bytes,2,type);return record(0x0809,bytes);};
  const sheetName=unicode('Synthetic',{short:true});const boundsheet=new Uint8Array(6+sheetName.length);boundsheet.set(sheetName,6);
  const count=new Uint8Array(8);u32(count,0,1);u32(count,4,1);const shared=unicode('Pension 😀',{wide:true});
  const sst=sstContinue?[record(0x00fc,concat(count,shared.subarray(0,7))),record(0x003c,concat(Uint8Array.of(1),shared.subarray(7)))]:[record(0x00fc,concat(count,shared))];
  const globalParts=[bof(5),record(0x0085,boundsheet),...sst,...(encrypt?[record(0x002f,Uint8Array.of(1,2))]:[]),record(0x000a)];
  const number=cellPrefix(0,0,14);f64(number,6,123.5);const label=cellPrefix(1,0,10);u32(label,6,badSst?100:0);const rk=cellPrefix(2,1,10);u32(rk,6,(250<<2)|2|1);
  const formula=cellPrefix(3,2,25);if(formulaString){formula[6]=0;u16(formula,12,0xffff);}else f64(formula,6,7);u16(formula,20,3);formula.set([0x1e,7,0],22);
  const bool=cellPrefix(4,3,8);bool[6]=1;
  const sheet=concat(bof(0x10),record(0x0203,number),record(0x00fd,label),record(0x027e,rk),record(0x0006,formula),...(formulaString?[record(0x0207,unicode('Cached text'))]:[]),record(0x0205,bool),record(0x000a));
  const globals=concat(...globalParts);u32(globals,24,globals.length); // BOF is 20 bytes; BOUNDSHEET payload begins at 24.
  const stream=concat(globals,sheet);return raw?stream:compound({Workbook:stream});
}
test('legacy DOC and XLS import through the generated isolated worker dispatch',async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();
  try{
    await page.goto(targetURL);await page.waitForFunction(()=>!document.querySelector('#create-case').disabled);await page.locator('#case-name').fill('Synthetic legacy smoke');await page.locator('#create-case').click();await page.waitForFunction(()=>!document.querySelector('#create-case').disabled);
    await page.locator('#files').setInputFiles([{name:'synthetic.doc',mimeType:'application/msword',buffer:Buffer.from(wordFixture('LegacyPerformanceEvidence\r',{split:9}))},{name:'synthetic.xls',mimeType:'application/vnd.ms-excel',buffer:Buffer.from(workbookFixture())}]);
    await page.waitForFunction(()=>!document.querySelector('#files').disabled);assert.equal(await page.locator('#sources li').count(),2,await page.locator('#status').innerText());
    for(const [query,locator]of [['LegacyPerformanceEvidence','word'],['Pension','excel']]){await page.locator('#query').fill(query);await page.locator('#search').click();await page.waitForFunction(()=>!document.querySelector('#search').disabled);const result=await page.locator('#results').innerText();assert.match(result,new RegExp(query));assert.match(result,new RegExp(locator));}
    const downloaded=page.waitForEvent('download');await page.locator('#export-case').click();const download=await downloaded;assert.equal(await download.failure(),null);
  }finally{await context.close();await browser.close();}
});
