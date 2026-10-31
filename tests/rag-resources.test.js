'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {descendants,parseProcStat,parseSmaps,aggregateRows,createAccumulator,windowsCollectorScript,monitorResources,syntheticCorpus,cgroupLimits,runBenchmark}=require('../tools/measure-resources.js');

test('process tree includes renderer/worker descendants and excludes unrelated processes and sampler subtree',()=>{
 const rows=[{pid:10,ppid:1},{pid:11,ppid:10},{pid:12,ppid:11},{pid:13,ppid:12},{pid:14,ppid:1},{pid:15,ppid:10},{pid:16,ppid:15}];
 assert.deepEqual(descendants(rows,10,new Set([15])).map(row=>row.pid),[10,11,12,13]);
});
test('Linux counters parse names containing parentheses and physical proportional memory separately from RSS',()=>{
 // stat fields: state, ppid, pgrp, session, tty, tpgid, flags, minflt,
 // cminflt, majflt, cmajflt, utime, stime, cutime, cstime, priority, nice,
 // num_threads, itrealvalue, starttime.
 const fields=['S','1','10','10','0','0','0','0','0','0','0','120','30','0','0','20','0','1','0','987'];
 assert.deepEqual(parseProcStat('10 (renderer (test)) '+fields.join(' ')),{pid:10,ppid:1,cpuTicks:150,startId:'987'});
 assert.deepEqual(parseSmaps('Rss: 2048 kB\nPss: 1024 kB\nPrivate_Clean: 256 kB\nPrivate_Dirty: 512 kB\n'),{rssBytes:2097152,pssBytes:1048576,privateBytes:786432});
 assert.throws(()=>parseProcStat('broken'),/Invalid/);assert.throws(()=>parseSmaps('Pss: 2 kB'),/RSS/);
});
test('aggregate CPU retains exited processes without double counting shared physical pages',()=>{
 const cpu=new Map();
 const first=aggregateRows([{pid:1,startId:'a',rssBytes:200,pssBytes:100,privateBytes:50,cpuMs:50},{pid:2,startId:'b',rssBytes:200,pssBytes:100,privateBytes:50,cpuMs:20}],cpu);
 assert.equal(first.rssBytes,400);assert.equal(first.pssBytes,200);assert.equal(first.cpuMs,70);
 const afterExit=aggregateRows([{pid:1,startId:'a',rssBytes:300,pssBytes:150,privateBytes:100,cpuMs:60}],cpu);
 assert.equal(afterExit.cpuMs,80);
 const reusedPid=aggregateRows([{pid:2,startId:'c',rssBytes:300,pssBytes:null,privateBytes:100,cpuMs:10}],cpu);
 assert.equal(reusedPid.cpuMs,90);assert.equal(reusedPid.pssBytes,null);
});
test('budget uses whole-tree proportional memory when available and conservatively falls back to RSS; abort fires once',()=>{
 let aborted=0;const recorder=createAccumulator({budgetBytes:1000,onLimit:()=>aborted++});recorder.setBrowserPid(2);
 recorder.accept({timestamp:1000,rows:[{pid:1,ppid:0,startId:'a',rssBytes:600,pssBytes:300,cpuMs:10},{pid:2,ppid:1,startId:'b',rssBytes:600,pssBytes:300,cpuMs:20}]});
 assert.equal(aborted,0);
 recorder.accept({timestamp:1200,rows:[{pid:1,ppid:0,startId:'a',rssBytes:600,pssBytes:null,cpuMs:20},{pid:2,ppid:1,startId:'b',rssBytes:600,pssBytes:null,cpuMs:30}]});
 recorder.accept({timestamp:1400,rows:[{pid:1,ppid:0,startId:'a',rssBytes:600,pssBytes:null,cpuMs:30},{pid:2,ppid:1,startId:'b',rssBytes:600,pssBytes:null,cpuMs:40}]});
 assert.equal(aborted,1);const report=recorder.summary();assert.equal(report.exceeded,true);assert.equal(report.pssComplete,false);assert.equal(report.peak.browserRssBytes,600);assert.equal(report.cpuMs,40);assert.equal(report.effectiveSampleIntervalMs,200);
});
test('executor cgroup limits distinguish host capacity from effective quota',()=>{
 assert.deepEqual(cgroupLimits('8000000000','200000 100000'),{cgroupMemoryMaxBytes:8000000000,cgroupCpuQuotaCores:2});assert.deepEqual(cgroupLimits('max','max 100000'),{cgroupMemoryMaxBytes:null,cgroupCpuQuotaCores:null});
});
test('resource corpus is bounded actual 1 MiB text across 128 sources with exact source hashes',()=>{
 const corpus=syntheticCorpus();assert.equal(corpus.sources.length,128);assert.ok(corpus.bytes>=1024*1024);assert.ok(corpus.bytes<1100000);assert.ok(corpus.records>3000);assert.equal(corpus.sources[0].records[0].text,'Normal retirement age is 65.');
});
test('Windows sampler uses persistent process counters without command-line or environment capture',()=>{
 const script=windowsCollectorScript(123,200);assert.match(script,/WorkingSet64/);assert.match(script,/TotalProcessorTime/);assert.match(script,/ParentProcessId/);assert.match(script,/ProgressPreference = 'SilentlyContinue'/);assert.match(script,/UTF8Encoding/);assert.doesNotMatch(script,/CommandLine|Get-ChildItem Env:|Get-Content/);assert.throws(()=>windowsCollectorScript('unsafe',200),/Invalid/);
});
test('live whole-process sampler captures this process rather than only V8 heap',{skip:!['linux','win32'].includes(process.platform)},async()=>{
 let monitor;try{monitor=await monitorResources();}catch(error){if(process.env.GITHUB_ACTIONS)console.log('::error title=Process sampler startup::'+(/process-enumeration/.test(error.message)?'CIM enumeration failed':/process-counters/.test(error.message)?'Process counters failed':/wrote an error/.test(error.message)?'PowerShell stderr was reported':/initialize/.test(error.message)?'Sampler initialization timed out':/ENOENT/.test(error.message)?'PowerShell unavailable':'Sampler failed to initialize'));throw error;}const start=Date.now();while(monitor.summary().samples<2&&Date.now()-start<(process.platform==='win32'?15000:5000))await new Promise(resolve=>setTimeout(resolve,50));const report=await monitor.stop();if(process.env.GITHUB_ACTIONS)console.log('::notice title=Live process sampler::'+JSON.stringify({platform:process.platform,samples:report.samples,peakRssBytes:report.peak.rssBytes,errorCount:report.errors.length}));assert.ok(report.samples>=2);assert.ok(report.peak.rssBytes>10*1024*1024);assert.deepEqual(report.errors,[]);
});
test('actual learned index and local Qwen fit sampled whole-process resource/time budgets',{
 timeout:360000,skip:process.env.PBGC_RUN_RESOURCES!=='1'?'Opt-in real model/resource acceptance: use PBGC_RUN_RESOURCES=1; helper tests alone do not establish the 16 GB target.':false
},async()=>{
 const profile=process.env.PBGC_RESOURCE_FILE==='1'?'file':process.env.PBGC_TEST_URL?'http':'file';
 const report=await runBenchmark({profile,out:path.resolve(__dirname,`../test-results/resources-${profile}.json`)});
 assert.equal(report.status,'PASS',report.errors.join('; '));assert.ok(report.resources.samples>=2);assert.ok(report.resources.peak.browserRssBytes>0);assert.equal(report.quality.answer.status,'answered');assert.equal(report.quality.externalRequests,0);
});
