#!/usr/bin/env node
'use strict';
// Development-only resource acceptance. None of this tooling runs at the office.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {spawn, spawnSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const ROOT = path.resolve(__dirname, '..');
const MODEL_MANIFEST = require('../vendor/local-llm/bundled.manifest.json');
const MODEL_SPEC = MODEL_MANIFEST.files[0];
const DEFAULT_BUDGET = 12_000_000_000; // Leaves 4 GB of a 16 GB machine for the OS/other work.
const DEFAULT_TIMEOUT = 300000;
// A cold Windows CIM provider can take more than 20 s on a hosted runner.
// Wait for real counters before starting acceptance; never substitute heap data.
const WINDOWS_SAMPLER_STARTUP_MS = 60000;

function descendants(rows, rootPid, excluded = new Set()) {
  const selected = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (!selected.has(row.pid) && !excluded.has(row.pid) && selected.has(row.ppid)) {
      selected.add(row.pid); changed = true;
    }
  }
  return rows.filter(row => selected.has(row.pid) && !excluded.has(row.pid));
}
function parseProcStat(text) {
  const end = text.lastIndexOf(')');
  if (end < 0) throw Error('Invalid process stat');
  const pid = Number(text.slice(0, text.indexOf(' ')));
  const fields = text.slice(end + 2).trim().split(/\s+/);
  if (!Number.isInteger(pid) || fields.length < 20) throw Error('Invalid process stat');
  return {pid, ppid:Number(fields[1]), cpuTicks:Number(fields[11]) + Number(fields[12]), startId:fields[19]};
}
function parseSmaps(text) {
  const values = {};
  for (const line of text.split('\n')) {
    const match = /^(Rss|Pss|Private_Clean|Private_Dirty|Private_Hugetlb):\s+(\d+)\s+kB$/.exec(line);
    if (match) values[match[1]] = Number(match[2]) * 1024;
  }
  if (!Number.isFinite(values.Rss)) throw Error('RSS unavailable');
  return {rssBytes:values.Rss, pssBytes:values.Pss ?? null,
    privateBytes:(values.Private_Clean || 0) + (values.Private_Dirty || 0) + (values.Private_Hugetlb || 0)};
}
async function linuxSnapshot(rootPid, excluded = new Set(), procRoot = '/proc', ticksPerSecond = 100) {
  const entries = await fsp.readdir(procRoot), rows = [];
  await Promise.all(entries.filter(name => /^\d+$/.test(name)).map(async name => {
    try { rows.push(parseProcStat(await fsp.readFile(path.join(procRoot, name, 'stat'), 'utf8'))); } catch (_) { /* Processes can exit during collection. */ }
  }));
  const selected = descendants(rows, rootPid, excluded), measured = [], unreadable = [];
  await Promise.all(selected.map(async row => {
    try {
      const memory = parseSmaps(await fsp.readFile(path.join(procRoot, String(row.pid), 'smaps_rollup'), 'utf8'));
      measured.push({...row, ...memory, cpuMs:row.cpuTicks * 1000 / ticksPerSecond});
    } catch (error) { if (!['ENOENT','ESRCH'].includes(error.code)) unreadable.push(row.pid); /* Exited processes are recorded as missing samples. */ }
  }));
  if(unreadable.length)throw Error('Cannot read all live workload process memory counters');
  return {timestamp:Date.now(), rows:measured, missingProcesses:selected.length - measured.length};
}
function windowsCollectorScript(rootPid, sampleMs) {
  if (!Number.isInteger(rootPid) || !Number.isInteger(sampleMs)) throw Error('Invalid collector options');
  return `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$InformationPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch { } # JSON protocol uses ASCII-only scalar names/values
$taskRoot = ${rootPid}
$taskSample = ${sampleMs}
$collectorPid = $PID
while (Get-Process -Id $taskRoot -ErrorAction SilentlyContinue) {
  try {
    $stage = 'process-enumeration'
    $map = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId)
    $selected = [System.Collections.Generic.HashSet[int]]::new()
    [void]$selected.Add($taskRoot)
    $changed = $true
    while ($changed) {
      $changed = $false
      foreach ($item in $map) {
        if ([int]$item.ProcessId -ne $collectorPid -and $selected.Contains([int]$item.ParentProcessId) -and $selected.Add([int]$item.ProcessId)) { $changed = $true }
      }
    }
    $stage = 'process-counters'
    $rows = @()
    $missing = 0
    foreach ($item in $map) {
      if (-not $selected.Contains([int]$item.ProcessId)) { continue }
      try {
        $p = Get-Process -Id ([int]$item.ProcessId) -ErrorAction Stop
        $rows += @{pid=[int]$p.Id;ppid=[int]$item.ParentProcessId;startId=[string]$p.StartTime.ToUniversalTime().Ticks;rssBytes=[double]$p.WorkingSet64;privateBytes=[double]$p.PrivateMemorySize64;pssBytes=$null;cpuMs=[double]$p.TotalProcessorTime.TotalMilliseconds}
      } catch { if ($_.CategoryInfo.Category -eq 'PermissionDenied' -or ($_.Exception -is [System.ComponentModel.Win32Exception] -and $_.Exception.NativeErrorCode -eq 5)) { throw }; $missing++ }
    }
    @{timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();rows=@($rows);missingProcesses=$missing} | ConvertTo-Json -Compress -Depth 4 | Write-Output
  } catch {
    @{collectorError='Windows process metrics unavailable';collectorStage=$stage} | ConvertTo-Json -Compress | Write-Output
  }
  Start-Sleep -Milliseconds $taskSample
}`;
}
function aggregateRows(rows, cpuHighWater) {
  let rssBytes = 0, pssBytes = 0, privateBytes = 0, pssComplete = true;
  for (const row of rows) {
    if (!Number.isFinite(row.rssBytes) || row.rssBytes < 0 || !Number.isFinite(row.cpuMs) || row.cpuMs < 0) throw Error('Invalid process measurement');
    rssBytes += row.rssBytes; privateBytes += row.privateBytes || 0;
    if (Number.isFinite(row.pssBytes)) pssBytes += row.pssBytes; else pssComplete = false;
    const key = row.pid + ':' + row.startId;
    cpuHighWater.set(key, Math.max(cpuHighWater.get(key) || 0, row.cpuMs));
  }
  return {rssBytes, pssBytes:pssComplete ? pssBytes : null, privateBytes,
    cpuMs:[...cpuHighWater.values()].reduce((sum, value) => sum + value, 0), processCount:rows.length};
}
function createAccumulator({budgetBytes = DEFAULT_BUDGET, onLimit = () => {}} = {}) {
  const cpu = new Map(), browserCpu = new Map(), samples = [];
  let exceeded = false, browserPid = null, baselineCpuMs = null;
  const peak = {rssBytes:0, pssBytes:0, privateBytes:0, browserRssBytes:0, browserPssBytes:0, processCount:0, budgetMetricBytes:0};
  function accept(snapshot) {
    if (snapshot.collectorError) throw Error(snapshot.collectorError + (snapshot.collectorStage ? ' ('+snapshot.collectorStage+')' : ''));
    if (!Array.isArray(snapshot.rows) || !snapshot.rows.length) throw Error('No workload process metrics were collected');
    const total = aggregateRows(snapshot.rows, cpu);
    if (baselineCpuMs === null) baselineCpuMs = total.cpuMs;
    const browser = aggregateRows(browserPid ? descendants(snapshot.rows, browserPid) : [], browserCpu);
    const metric = total.pssBytes ?? total.rssBytes;
    peak.rssBytes = Math.max(peak.rssBytes, total.rssBytes);
    if (total.pssBytes !== null) peak.pssBytes = Math.max(peak.pssBytes, total.pssBytes);
    peak.privateBytes = Math.max(peak.privateBytes, total.privateBytes);
    peak.browserRssBytes = Math.max(peak.browserRssBytes, browser.rssBytes);
    if (browser.pssBytes !== null) peak.browserPssBytes = Math.max(peak.browserPssBytes, browser.pssBytes);
    peak.processCount = Math.max(peak.processCount, total.processCount);
    peak.budgetMetricBytes = Math.max(peak.budgetMetricBytes, metric);
    samples.push({timestamp:snapshot.timestamp, total, browser, missingProcesses:snapshot.missingProcesses || 0});
    if (metric > budgetBytes && !exceeded) { exceeded = true; onLimit(Error('Combined workload process memory exceeded its resource budget')); }
  }
  return {accept, setBrowserPid(pid) { browserPid = pid; }, summary() {
    const intervals = samples.slice(1).map((sample, i) => sample.timestamp - samples[i].timestamp);
    return {samples:samples.length, measurementMs:samples.length > 1 ? samples.at(-1).timestamp - samples[0].timestamp : 0,
      effectiveSampleIntervalMs:intervals.length ? Math.round(intervals.reduce((a,b) => a+b, 0)/intervals.length) : null,
      maximumSampleGapMs:intervals.length ? Math.max(...intervals) : null, peak,
      cpuMs:Math.max(0, [...cpu.values()].reduce((sum, value) => sum + value, 0) - (baselineCpuMs || 0)),
      browserCpuMs:[...browserCpu.values()].reduce((sum, value) => sum + value, 0),
      pssComplete:samples.length > 0 && samples.every(sample => sample.total.pssBytes !== null),
      missingProcessSamples:samples.reduce((sum, sample) => sum + sample.missingProcesses, 0), exceeded};
  }};
}
async function monitorResources({rootPid = process.pid, intervalMs = 200, budgetBytes = DEFAULT_BUDGET, onLimit} = {}) {
  if (!['linux','win32'].includes(process.platform)) throw Error('Whole-process resource sampling is supported only on Linux and Windows');
  const accumulator = createAccumulator({budgetBytes, onLimit}), errors = [];
  let stopped = false, active = false, timer, collector, pending = '', callback;
  if (process.platform === 'linux') {
    const hz = spawnSync('getconf',['CLK_TCK'],{encoding:'utf8'});
    const ticks = Number(hz.stdout?.trim());
    if (hz.status !== 0 || !Number.isInteger(ticks) || ticks < 1) throw Error('Linux CPU clock tick rate unavailable');
    callback = async () => {
      if (stopped || active) return; active = true;
      try { accumulator.accept(await linuxSnapshot(rootPid, new Set(), '/proc', ticks)); }
      catch (error) { errors.push(error.message); if (onLimit) onLimit(error); }
      finally { active = false; }
    };
    await callback(); timer = setInterval(callback, intervalMs);
  } else {
    const script = Buffer.from(windowsCollectorScript(rootPid, intervalMs),'utf16le').toString('base64');
    collector = spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',script],{stdio:['ignore','pipe','pipe'],windowsHide:true});
    collector.on('error', error => {errors.push(error.message);if(onLimit)onLimit(error);});
    collector.on('close',()=>{if(!stopped){const error=Error('Windows process collector stopped unexpectedly');errors.push(error.message);if(onLimit)onLimit(error);}});
    collector.stderr.on('data', () => {const error=Error('Windows process collector wrote an error');errors.push(error.message);if(onLimit)onLimit(error);});
    collector.stdout.on('data', block => {
      pending += block.toString(); const lines = pending.split(/\r?\n/); pending = lines.pop();
      for (const line of lines) if (line.trim()) try { accumulator.accept(JSON.parse(line.replace(/^\uFEFF/,''))); } catch (error) { errors.push(error.message);if(onLimit)onLimit(error); }
    });
    await new Promise((resolve, reject) => {
      const start = Date.now();
      const first = setInterval(() => {
        if (accumulator.summary().samples) { clearInterval(first); resolve(); }
        else if (errors.length || Date.now()-start > WINDOWS_SAMPLER_STARTUP_MS) { clearInterval(first); reject(Error(errors[0] || 'Windows process sampler did not initialize')); }
      },100);
    }).catch(error=>{collector.kill();throw error;});
  }
  return {setBrowserPid:accumulator.setBrowserPid, summary:() => ({...accumulator.summary(), errors}), async stop() {
    stopped = true; if (timer) clearInterval(timer);
    if (collector) await new Promise(resolve => {const ending=setTimeout(resolve,2000);collector.once('close',()=>{clearTimeout(ending);resolve();});collector.kill();});
    while (active) await new Promise(resolve => setTimeout(resolve,10));
    return {...accumulator.summary(), errors};
  }};
}
function cgroupLimits(memoryText, cpuText) {
  const memory = memoryText?.trim(), cpu = cpuText?.trim().split(/\s+/);
  const memoryBytes = memory && memory !== 'max' ? Number(memory) : null;
  const quota = cpu?.length === 2 && cpu[0] !== 'max' ? Number(cpu[0]) / Number(cpu[1]) : null;
  return {cgroupMemoryMaxBytes:Number.isFinite(memoryBytes) && memoryBytes > 0 ? memoryBytes : null,
    cgroupCpuQuotaCores:Number.isFinite(quota) && quota > 0 ? quota : null};
}
function hardwareLimits() {
  if(process.platform !== 'linux')return {};
  const read = name => {try{return fs.readFileSync('/sys/fs/cgroup/'+name,'utf8');}catch(_){return null;}};
  return cgroupLimits(read('memory.max'),read('cpu.max'));
}
function syntheticCorpus(targetBytes = 1024 * 1024) {
  const topics = [
    ['retirement','Normal retirement age is 65.'],
    ['widow','A surviving spouse receives monthly income after the participant dies.'],
    ['medical','A physician must certify the medical condition before disability payments begin.'],
    ['address','The mailing address must change when a person moves to another residence.']
  ];
  const source = (id, text) => {
    let offset = 0;
    return {id, name:id+'.txt', hash:crypto.createHash('sha256').update(text).digest('hex'), parserVersion:'synthetic-resource-1',
      records:text.split('\n').map((value, i) => {const record={text:value,locator:{type:'text-line',line:i+1,offset,length:value.length,offsetUnit:'UTF-16 code units'}};offset += value.length+1;return record;})};
  };
  const result = topics.map(([id,text]) => source(id,text)); let total = topics.reduce((sum,item) => sum + Buffer.byteLength(item[1]),0);
  const prose = 'The archive team stores scanned office correspondence in cabinets. Staff organize paper forms by department and maintain the catalog. A librarian checks catalog descriptions and verifies shelf labels. The building manager schedules room cleaning and equipment maintenance.';
  for (let index=0;index<124;index++) {
    const lines=[];const wanted=Math.ceil((targetBytes-total)/(128-result.length));let bytes=0;
    while(bytes<wanted){const line=`Archive note ${index}-${lines.length}: ${prose}`;lines.push(line);bytes += line.length+1;}
    const text=lines.join('\n');result.push(source('archive-'+index,text));total += Buffer.byteLength(text);
  }
  return {sources:result, bytes:total, records:result.reduce((sum,item)=>sum+item.records.length,0)};
}
async function runBenchmark(options = {}) {
  const profile = options.profile || (process.env.PBGC_TEST_URL ? 'http' : 'file');
  const budgetBytes = options.budgetBytes ?? DEFAULT_BUDGET, timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
  if (!['http','file'].includes(profile) || !Number.isSafeInteger(budgetBytes) || budgetBytes < 16*1024*1024 || budgetBytes > DEFAULT_BUDGET || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000) throw Error('Invalid resource benchmark profile or budgets');
  const modelPath = options.modelPath || process.env.PBGC_MODEL_PATH || process.env.PBGC_LLM_MODEL || path.join(ROOT,'dist/models',MODEL_SPEC.name);
  const stage=name=>{if(typeof options.onStage==='function')options.onStage(name);};
  const report = {schemaVersion:1, kind:'pbgc-rag-whole-process-resource-benchmark', status:'FAIL', profile:profile==='file'?'actual offline file://':'supplementary HTTP only',
    hardware:{platform:process.platform, osRelease:os.release(), logicalCpus:os.cpus().length, cpuModel:os.cpus()[0]?.model || 'unknown', hostTotalMemoryBytes:os.totalmem(),...hardwareLimits()},
    budgets:{targetMachineMemoryBytes:16_000_000_000, workloadMemoryBytes:budgetBytes,totalTimeMs:timeoutMs,sampleIntervalMs:200},
    scope:'Harness Node process and its full Chromium descendant tree, including browser/renderers/worker hosts/utility processes. Model load, learned index, retrieval and one generated answer. Parser/import/recovery and other desktop applications are not exercised.',
    measurement:{method:process.platform==='linux'?'Linux smaps_rollup PSS (preferred) plus RSS/private bytes and /proc CPU ticks':'Windows process WorkingSet/private bytes and TotalProcessorTime; shared pages can be counted more than once',
      limits:'Sampled peaks are lower bounds between samples. RSS/WorkingSet sums can double count shared pages. Sampling overhead is included in Node on Linux; the independent Windows PowerShell collector is excluded. CPU can miss short-lived processes between samples.'},stagesMs:{},quality:{},errors:[]};
  let loopback, server, browser, context, page, monitor, deadline, limitError, started=Date.now();
  const cleanupBrowser = () => { if (server) server.kill().catch(()=>{}); };
  try {
    if (!fs.existsSync(modelPath)) throw Error('Required local Qwen model is absent');
    monitor = await monitorResources({budgetBytes,onLimit:error=>{limitError=error;cleanupBrowser();}});
    if(limitError)throw limitError;
    deadline = setTimeout(()=>{limitError=Error('Resource benchmark exceeded its total time budget');cleanupBrowser();},timeoutMs);
    let target;
    if (profile==='http') {
      if (process.env.PBGC_TEST_URL) target=process.env.PBGC_TEST_URL;
      else {loopback=await require('./verify-browser.js').startLoopbackServer(ROOT);target=loopback.url;}
    } else target=pathToFileURL(path.join(ROOT,'index.html')).href;
    const {chromium}=require('playwright');
    stage('browser-launch');let at=Date.now();server=await chromium.launchServer({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    if(limitError){await server.kill();throw limitError;}monitor.setBrowserPid(server.process().pid);browser=await chromium.connect(server.wsEndpoint());context=await browser.newContext();if(profile==='file')await context.setOffline(true);
    page=await context.newPage();const external=[];
    context.on('request',request=>{const url=request.url();if(/^https?:|^wss?:/.test(url)&&(profile!=='http'||!url.startsWith(new URL(target).origin+'/')))external.push('external request');});
    await context.route(/^https?:\/\//,route=>profile==='http'&&route.request().url().startsWith(new URL(target).origin+'/')?route.continue():route.abort());
    await page.goto(target);await page.locator('#guide-skip').click();await page.locator('#all-tools').click();await page.waitForFunction(()=>!!globalThis.PBGCRag?.answerQuestion);report.stagesMs.browserLaunchAndEntry=Date.now()-at;
    await page.addScriptTag({url:new URL('vendor/local-llm/wllama-classic.js',target).href});
    await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='resource-model-file';document.body.append(input);globalThis.__resourceAbort=new AbortController();});
    await page.locator('#resource-model-file').setInputFiles(modelPath);
    const manifest=MODEL_MANIFEST;
    stage('model-hash-and-load');at=Date.now();report.model=await page.evaluate(async manifest=>{globalThis.__resourceModel=await PBGCRag.createLocalLlmProvider({files:document.getElementById('resource-model-file').files,manifest,signal:__resourceAbort.signal,contextSize:2048,timeoutMs:120000});return __resourceModel.info();},manifest);report.stagesMs.modelHashAndLoad=Date.now()-at;if(report.model.cpuOnly!==true||report.model.threads!==1)throw Error('Benchmark requires single-thread CPU generation');if(report.model.sha256!==MODEL_SPEC.sha256||report.model.modelBytes!==MODEL_SPEC.bytes||report.model.model!==MODEL_MANIFEST.name)throw Error('Benchmark did not load the pinned branch model');
    const corpus=syntheticCorpus(options.corpusBytes || 1024*1024);report.workload={sourceBytes:corpus.bytes,sourceCount:corpus.sources.length,records:corpus.records,parserMeasured:false};
    stage('learned-index');at=Date.now();const indexed=await page.evaluate(async sources=>{const before=performance.now();const result=PBGCRag.chunkSources(sources);const chunkMs=performance.now()-before;const embedding=await PBGCRag.createEmbeddingProvider({signal:__resourceAbort.signal});globalThis.__resourceChunks=result.chunks;globalThis.__resourceEmbedding=embedding;globalThis.__resourceIndex=await PBGCRag.buildSemanticIndex(result.chunks,embedding,{signal:__resourceAbort.signal});return{chunkMs,chunks:result.chunks.length,provider:embedding.id};},corpus.sources);report.stagesMs.chunkAndIndex=Date.now()-at;report.stagesMs.chunking=indexed.chunkMs;report.workload.chunks=indexed.chunks;report.embeddingProvider=indexed.provider;
    stage('retrieval');at=Date.now();const retrieved=await page.evaluate(async()=>{const queries=[['What is the normal retirement age?','retirement'],['What money is available to a widow?','widow'],["Does illness need a doctor's verification?",'medical'],['How should I report a residential relocation?','address']];const results=[];for(const[question,target]of queries){const result=await PBGCRag.retrieveHybrid(__resourceIndex,question,__resourceEmbedding,{signal:__resourceAbort.signal,topK:4});results.push({question,target,rank:result.results.findIndex(chunk=>chunk.sourceId===target)+1,weak:result.diagnostics.weak,score:result.diagnostics.topScore});if(target==='retirement')globalThis.__resourceRetrieval=result;}return results;});report.stagesMs.fourRetrievals=Date.now()-at;report.quality.retrieval=retrieved;
    stage('real-qwen-answer');at=Date.now();report.quality.answer=await page.evaluate(async()=>{let rawOutput='';const observer={id:__resourceModel.id,answerFormat:__resourceModel.answerFormat,generate:async request=>{rawOutput=await __resourceModel.generate(request);return rawOutput;}};const result=await PBGCRag.answerQuestion({question:'What is the normal retirement age?',chunks:__resourceChunks,retrieval:__resourceRetrieval,provider:observer,signal:__resourceAbort.signal,options:{contextCharacters:1000,maxChunks:2,maxTokens:128,timeoutMs:120000}});return{status:result.status,answer:result.answer,citations:result.citations.map(c=>({sourceId:c.sourceId,excerpt:c.excerpt})),diagnosticReason:result.diagnostics.reason,validationError:result.diagnostics.validationError,rawOutput:rawOutput.slice(0,2000)};});report.stagesMs.generatedAnswerAndGrounding=Date.now()-at;
    if(report.quality.answer.status!=='answered'||! /\b65\b/.test(report.quality.answer.answer)||!report.quality.answer.citations.some(c=>c.sourceId==='retirement'&&c.excerpt==='Normal retirement age is 65.'))throw Error('Actual generated answer did not resolve to the correct synthetic source');
    if(external.length)throw Error('Resource benchmark attempted an external connection');report.quality.externalRequests=external.length;
    if(limitError)throw limitError;report.status='PASS';
  } catch(error) {report.errors.push(String(limitError?.message||error.message||error).slice(0,500));}
  finally {
    const cleanupStarted=Date.now();
    if(page)await page.evaluate(async()=>{if(globalThis.__resourceModel)await __resourceModel.dispose();globalThis.__resourceEmbedding?.dispose();}).catch(()=>{});
    if(context)await context.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});if(server)await server.close().catch(()=>{});report.stagesMs.disposeAndBrowserCleanup=Date.now()-cleanupStarted;
    if(monitor)report.resources=await monitor.stop();if(loopback)await loopback.close();if(deadline)clearTimeout(deadline);
    report.totalMs=Date.now()-started;
    if(!report.resources||report.resources.samples<2||report.resources.errors.length||report.resources.peak.browserRssBytes===0){report.status='FAIL';report.errors.push('Whole-process measurements unavailable or incomplete');}
    if(report.resources?.exceeded||report.totalMs>timeoutMs){report.status='FAIL';if(!report.errors.length)report.errors.push('Resource budget exceeded');}
    if(options.out){await fsp.mkdir(path.dirname(options.out),{recursive:true});await fsp.writeFile(options.out,JSON.stringify(report,null,2)+'\n');}
  }
  return report;
}
async function main() {
  let profile=process.env.PBGC_TEST_URL?'http':'file',out,timeoutMs=DEFAULT_TIMEOUT,budgetBytes=DEFAULT_BUDGET;
  for(let i=2;i<process.argv.length;i++){
    if(process.argv[i]==='--http')profile='http';else if(process.argv[i]==='--file')profile='file';else if(process.argv[i]==='--out')out=path.resolve(process.argv[++i]);else if(process.argv[i]==='--timeout-ms')timeoutMs=Number(process.argv[++i]);else if(process.argv[i]==='--budget-bytes')budgetBytes=Number(process.argv[++i]);else throw Error('Unknown resource benchmark argument');
  }
  out ||= path.join(ROOT,'test-results',`resources-${profile}.json`);
  const report=await runBenchmark({profile,out,timeoutMs,budgetBytes,onStage:stage=>console.error('[resource] '+stage)});
  console.log(JSON.stringify(report,null,2));process.exitCode=report.status==='PASS'?0:1;
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={descendants,parseProcStat,parseSmaps,linuxSnapshot,aggregateRows,createAccumulator,windowsCollectorScript,monitorResources,syntheticCorpus,cgroupLimits,runBenchmark,DEFAULT_BUDGET};
