#!/usr/bin/env node
'use strict';
// CI exposes bounded synthetic case IDs and scalar metrics, never model/source text.
const fs=require('node:fs'),path=require('node:path');const directory=path.resolve(__dirname,'../test-results');
if(fs.existsSync(directory))for(const file of fs.readdirSync(directory).filter(name=>/^(?:rag-challenge-qwen-(?:http|file)|resources-(?:http|file))\.json$/.test(name))){
 const target=path.join(directory,file),stat=fs.lstatSync(target);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)continue;
 try{const report=JSON.parse(fs.readFileSync(target,'utf8'));const safe={file};if(Number.isFinite(report.answerCoverage))safe.answerCoverage=report.answerCoverage;
 if(['PASS','FAIL'].includes(report.status))safe.status=report.status;
 for(const field of ['positives','negatives'])if(Array.isArray(report[field]))safe[field]=report[field].slice(0,20).filter(row=>/^[a-z0-9_-]{1,60}$/i.test(row.id)&&['answered','abstained','conflict'].includes(row.status)).map(row=>({id:row.id,status:row.status}));
 if(Number.isFinite(report.totalMs))safe.totalMs=report.totalMs;
 if(Number.isFinite(report.resources?.peak?.budgetMetricBytes))safe.peakWorkloadBytes=report.resources.peak.budgetMetricBytes;
 if(Number.isFinite(report.workload?.sourceBytes))safe.sourceBytes=report.workload.sourceBytes;
 process.stdout.write('::notice title=Synthetic model verification::'+JSON.stringify(safe)+'\n');
 }catch{process.stdout.write('::warning title=Synthetic model verification::A bounded generated report could not be read.\n');}
}
