#!/usr/bin/env node
'use strict';
// Development-only verification supervisor. Never needed by the workplace app.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {spawn,spawnSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const MAX_SOURCE = 2 * 1024 * 1024;
const SOURCE_EXTENSIONS = new Set(['.js','.py','.html','.css','.md','.yml','.yaml','.json','.txt','.csv','.tsv','.xml']);
const SOURCE_DIRS = new Set(['assets','tests','tools','docs','fixtures','.github']);
const IGNORED_DIRS = new Set(['.git','.aws','.agents','.codex','node_modules','dist','test-results','playwright-report','__pycache__']);
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.map':'application/json','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.pdf':'application/pdf'};
function findSourceRisks(text, relativePath) {
  if (typeof text !== 'string' || typeof relativePath !== 'string') throw TypeError('Source scanner requires text and a relative source path.');
  // Values are never returned or printed. This is a high-confidence leak check,
  // not a claim to identify PII or every credential format.
  const patterns = [
    ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
    ['github-token', /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g],
    ['github-fine-grained-token', /\bgithub_pat_[A-Za-z0-9_]{70,255}\b/g],
    ['private-key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g],
    ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{20,255}\b/g],
    ['api-secret-token', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,255}\b/g],
    ['personal-absolute-path', /(?:[A-Za-z]:\\+(?:Users|Documents and Settings)\\+[^\\\s"'<>]+\\+|\/(?:home|Users)\/[^/\s"'<>]+\/)/g]
  ];
  const findings=[];
  for (const [kind, pattern] of patterns) for (const match of text.matchAll(pattern)) findings.push({path:relativePath,line:text.slice(0,match.index).split('\n').length,kind});
  return findings.sort((a,b)=>a.line-b.line||a.kind.localeCompare(b.kind));
}
async function scanSourceTree(root) {
  root = await fsp.realpath(root); const findings=[], files=[];
  async function visit(directory, relative='') {
    for(const entry of (await fsp.readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      if(entry.isSymbolicLink()) continue; // Never follow a source path into local/private data.
      const rel=relative?relative+'/'+entry.name:entry.name;
      if(entry.isDirectory()) { if(IGNORED_DIRS.has(entry.name))continue;if(!relative&&!SOURCE_DIRS.has(entry.name))continue;await visit(path.join(directory,entry.name),rel); }
      else if(entry.isFile()&&SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const filename=path.join(directory,entry.name),stat=await fsp.stat(filename);
        if(stat.size>MAX_SOURCE){findings.push({path:rel,line:1,kind:'source-size-limit'});continue;}
        const bytes=await fsp.readFile(filename);if(bytes.includes(0)){findings.push({path:rel,line:1,kind:'unexpected-binary-source'});continue;}
        files.push(rel);findings.push(...findSourceRisks(bytes.toString('utf8'),rel));
      }
    }
  }
  await visit(root);return {files:files.length,findings};
}
function publicPath(relative) { return relative==='index.html'||relative.startsWith('assets/')||relative.startsWith('vendor/'); }
async function startLoopbackServer(root) {
  root=await fsp.realpath(root);
  const server=http.createServer(async(request,response)=>{
    response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');
    try {
      if(!['GET','HEAD'].includes(request.method)){response.writeHead(405,{'Allow':'GET, HEAD'});response.end();return;}
      if(!request.url.startsWith('/')){response.writeHead(400);response.end();return;}
      let pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);
      if(pathname.includes('\0')||pathname.includes('\\')){response.writeHead(400);response.end();return;}
      if(pathname==='/')pathname='/index.html';
      const relative=pathname.slice(1),candidate=path.resolve(root,relative);
      if(!publicPath(relative)||!candidate.startsWith(root+path.sep)){response.writeHead(403);response.end();return;}
      const actual=await fsp.realpath(candidate),actualRelative=path.relative(root,actual).split(path.sep).join('/');
      if(!publicPath(actualRelative)||actualRelative.startsWith('../')){response.writeHead(403);response.end();return;}
      const stat=await fsp.stat(actual);if(!stat.isFile()){response.writeHead(404);response.end();return;}
      response.writeHead(200,{'Content-Type':MIME[path.extname(actual).toLowerCase()]||'application/octet-stream','Content-Length':stat.size});
      if(request.method==='HEAD')response.end();else fs.createReadStream(actual).on('error',()=>response.destroy()).pipe(response);
    } catch(error) { if(!response.headersSent)response.writeHead(error.code==='ENOENT'?404:400);response.end(); }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const url=`http://127.0.0.1:${server.address().port}/`;
  let closed=false;
  return {url,close:async()=>{if(closed)return;closed=true;await new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.();});}};
}
function terminateGroup(child, signal) {
  if(!child?.pid)return;
  try { if(process.platform==='win32'){const result=spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:5000});if(result.status!==0)child.kill(signal);}else process.kill(-child.pid,signal); }
  catch(error){if(error.code!=='ESRCH')throw error;}
}
async function runVerification(options={}) {
  const root=await fsp.realpath(options.root||ROOT),mode=options.mode||'http',timeoutMs=options.timeoutMs??600000;
  if(!['http','file'].includes(mode)||!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>3600000)throw Error('Invalid verification mode or timeout (100–3600000 ms).');
  const output=options.output||process.stdout;
  if(options.scan!==false){const scan=await scanSourceTree(root);for(const finding of scan.findings)output.write(`${finding.path}:${finding.line}: ${finding.kind}\n`);if(scan.findings.length){output.write('Source-only leak scan failed. No test server started.\n');return {status:'FAIL',exitCode:1,mode,sourceFindings:scan.findings.length};}output.write(`Source-only leak scan: ${scan.files} source files checked.\n`);}
  const artifactDirectory=path.join(root,'test-results');
  try{if((await fsp.lstat(artifactDirectory)).isSymbolicLink())throw Error('Verification output directory must not be a symlink.');}catch(error){if(error.code!=='ENOENT')throw error;}
  await fsp.mkdir(artifactDirectory,{recursive:true});
  const label=mode==='http'?'supplementary-http':'file',logPath=path.join(artifactDirectory,`verification-${label}.log`),summaryPath=path.join(artifactDirectory,`verification-${label}.json`);
  let logHandle=await fsp.open(logPath,'w'),logQueue=Promise.resolve(),loggedBytes=0,logTruncated=false,blocked=false;
  function write(chunk){const text=chunk.toString();output.write(text);if(text.includes('ERR_BLOCKED_BY_ADMINISTRATOR'))blocked=true;if(loggedBytes<20*1024*1024){loggedBytes+=Buffer.byteLength(text);logQueue=logQueue.then(()=>logHandle.write(text));}else logTruncated=true;}
  let server=null,child=null,timeout=null,killTimer=null,requestedSignal=null,timedOut=false,startedAt=new Date().toISOString(),exitCode=1,childSignal=null;
  const stop=signal=>{if(requestedSignal)return;requestedSignal=signal;try{terminateGroup(child,'SIGTERM');}catch(_){}killTimer=setTimeout(()=>{try{terminateGroup(child,'SIGKILL');}catch(_){}},2000);};
  const onInterrupt=()=>stop('SIGINT'),onTerminate=()=>stop('SIGTERM');
  process.once('SIGINT',onInterrupt);process.once('SIGTERM',onTerminate);
  try {
    const env={...process.env,PBGC_AUTOMATION_NETWORK_TEST:'1'};
    if(mode==='http'){server=await startLoopbackServer(root);env.PBGC_TEST_URL=server.url;write(`SUPPLEMENTARY HTTP ONLY — ${server.url}\nThis does not establish actual file:// workplace acceptance.\n`);}
    else{delete env.PBGC_TEST_URL;write('ACTUAL FILE:// TEST MODE — no browser policy changes or HTTP substitution.\n');}
    if(requestedSignal)throw Error('Verification interrupted before child start.');
    child=spawn(process.execPath,[path.join(root,'tools','check.js'),'--browser'],{cwd:root,env,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
    child.stdout.on('data',write);child.stderr.on('data',write);
    timeout=setTimeout(()=>{timedOut=true;stop('TIMEOUT');},timeoutMs);
    const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
    childSignal=result.signal;exitCode=requestedSignal==='SIGINT'?130:requestedSignal==='SIGTERM'?143:timedOut?124:result.code===0?0:result.code||1;
  } catch(error){write(`Verification supervisor failed: ${error.message}\n`);exitCode=requestedSignal==='SIGINT'?130:requestedSignal==='SIGTERM'?143:1;}
  finally {
    if(timeout)clearTimeout(timeout);if(killTimer)clearTimeout(killTimer);
    process.removeListener('SIGINT',onInterrupt);process.removeListener('SIGTERM',onTerminate);
    if(server)await server.close();await logQueue;await logHandle.close();logHandle=null;
  }
  const summary={schemaVersion:1,kind:'pbgc-rag-development-verification',mode:label,status:exitCode===0?'PASS':mode==='file'&&blocked?'BLOCKED':'FAIL',exitCode,childSignal,timedOut,startedAt,finishedAt:new Date().toISOString(),fileProfileAcceptance:mode==='http'?'NOT_ESTABLISHED_BY_HTTP':exitCode===0?'PASS_FOR_TESTED_BROWSER_ONLY':blocked?'BLOCKED_BY_ADMINISTRATOR':'NOT_ESTABLISHED',logTruncated};
  await fsp.writeFile(summaryPath,JSON.stringify(summary,null,2)+'\n');output.write(`Verification ${summary.status}; server closed; exit ${exitCode}.\n`);
  return summary;
}
async function main(argv=process.argv.slice(2)) {
  let mode='http',timeoutMs=600000,scanOnly=false;
  for(let i=0;i<argv.length;i++){if(argv[i]==='--file')mode='file';else if(argv[i]==='--scan-only')scanOnly=true;else if(argv[i]==='--timeout-ms')timeoutMs=Number(argv[++i]);else if(argv[i]==='--help'){process.stdout.write('Usage: node tools/verify-browser.js [--file] [--timeout-ms N] [--scan-only]\nDefault owns a loopback HTTP server for supplementary browser checks. --file uses actual file URLs without a server or policy changes.\n');return 0;}else throw Error('Unknown verification argument: '+argv[i]);}
  if(scanOnly){const scan=await scanSourceTree(ROOT);for(const item of scan.findings)process.stdout.write(`${item.path}:${item.line}: ${item.kind}\n`);process.stdout.write(`Source-only leak scan: ${scan.files} files; ${scan.findings.length} findings.\n`);return scan.findings.length?1:0;}
  return (await runVerification({mode,timeoutMs})).exitCode;
}
if(require.main===module)main().then(code=>{process.exitCode=code;}).catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
module.exports={findSourceRisks,scanSourceTree,startLoopbackServer,runVerification};
