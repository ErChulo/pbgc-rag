#!/usr/bin/env node
'use strict';
// CI-only summaries expose test names, never captured source/case/credential values.
const fs=require('node:fs');
const path=require('node:path');
function extractFailureNames(text){
  const result=[],seen=new Set();
  for(const line of text.replace(/\x1b\[[0-9;]*m/g,'').split(/\r?\n/)){
    const match=/^(?:✖\s+(.+)|not ok\s+\d+\s*-\s*(.+))$/.exec(line);
    if(!match)continue;const name=(match[1]||match[2]).replace(/\s+\([\d.]+ms\)$/,'').trim().slice(0,300);
    if(!name||name==='failing tests:'||seen.has(name))continue;
    seen.add(name);result.push(name);if(result.length===12)break;
  }
  return result;
}
const workflowEscape=text=>text.replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A');
function main(){
  const directory=path.resolve(__dirname,'../test-results'),names=new Set();
  if(fs.existsSync(directory))for(const file of fs.readdirSync(directory)){
    if(!/^verification-(?:supplementary-http|file)\.log$/.test(file))continue;
    const target=path.join(directory,file),stat=fs.lstatSync(target);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>20*1024*1024)continue;
    for(const name of extractFailureNames(fs.readFileSync(target,'utf8')))names.add(name);
  }
  if(!names.size)names.add('Verification failed before a named test result was available.');
  for(const name of [...names].slice(0,12))process.stdout.write('::error title=Failed synthetic check::'+workflowEscape(name)+'\n');
  if(process.env.GITHUB_STEP_SUMMARY){const escape=text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\n### Failed synthetic checks\n\n'+[...names].slice(0,12).map(name=>'- <code>'+escape(name)+'</code>').join('\n')+'\n');}
}
if(require.main===module)main();
module.exports={extractFailureNames,workflowEscape};
