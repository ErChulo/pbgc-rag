'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {runLargeCaseBenchmark}=require('../tools/measure-large-case.js');

// This is a measured workload, not a small fixture that can certify 1 GiB.
// CI calls the same runner directly and preserves its full evidence artifact.
test('opt-in actual large-case import/search/reopen/backup resource acceptance',{
  skip:process.env.PBGC_REQUIRE_LARGE_CASE!=='1',timeout:7_200_000
},async()=>{
  const mib=Number(process.env.PBGC_LARGE_CASE_MIB||1024);
  const profile=process.env.PBGC_TEST_URL?'http':'file';
  const report=await runLargeCaseBenchmark({bytes:mib*1024**2,profile,requireModel:process.env.PBGC_REQUIRE_LARGE_CASE_MODEL==='1',timeoutMs:7_000_000,
    out:path.resolve('test-results',`large-case-${mib}mib-${profile}.json`),
    onStage:(stage,event)=>{if(stage!=='import-progress'||event.phase==='source')process.stdout.write(JSON.stringify({stage,...event})+'\n');}});
  assert.equal(report.status,'PASS',report.errors.join('\n'));
  assert.equal(report.workload.sourceBytes,mib*1024**2);
  assert.equal(report.quality.externalRequests,0);
  assert.ok(report.resources.samples>1);
  assert.ok(report.resources.peak.budgetMetricBytes<=report.budgets.workloadMemoryBytes);
});
