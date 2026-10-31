'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {findSourceRisks,scanSourceTree,startLoopbackServer,runVerification}=require('../tools/verify-browser.js');
const networkTest=process.env.PBGC_AUTOMATION_NETWORK_TEST==='1';
async function fixture(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'pbgc-automation-'));await fs.mkdir(path.join(root,'tools'));await fs.mkdir(path.join(root,'assets'));await fs.writeFile(path.join(root,'index.html'),'<title>Synthetic lifecycle test</title>');await fs.writeFile(path.join(root,'assets','demo.js'),'/* synthetic source */');return root;}
function request(url,method='GET'){return new Promise((resolve,reject)=>{const req=http.request(url,{method},response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode,body,headers:response.headers}));});req.on('error',reject);req.end();});}
test('source scanner identifies credential markers without returning their values',()=>{
  const token='gh'+'p_'+'A'.repeat(36),key=['-----BEGIN','PRIVATE KEY-----'].join(' '),aws='AK'+'IA'+'B'.repeat(16);
  const findings=findSourceRisks('// synthetic scanner input\n'+token+'\n'+key+'\n'+aws,'tests/synthetic.js');
  assert.deepEqual(findings.map(item=>[item.kind,item.line]),[['github-token',2],['private-key',3],['aws-access-key',4]]);
  assert.ok(!JSON.stringify(findings).includes(token));assert.ok(!JSON.stringify(findings).includes(aws));
  assert.deepEqual(findSourceRisks('process.env.API_TOKEN; const placeholder="synthetic";','assets/source.js'),[]);
});
test('source scanner detects personal absolute paths and does not read excluded directories or symlinks',async()=>{
  const root=await fixture(),privateDirectory=await fs.mkdtemp(path.join(os.tmpdir(),'pbgc-not-source-'));
  try{
    const privateKey=['-----BEGIN','OPENSSH PRIVATE KEY-----'].join(' ');
    await fs.mkdir(path.join(root,'.git'));await fs.writeFile(path.join(root,'.git','private.txt'),privateKey);
    await fs.mkdir(path.join(root,'.aws'));await fs.writeFile(path.join(root,'.aws','credentials.txt'),privateKey);
    await fs.mkdir(path.join(root,'node_modules'));await fs.writeFile(path.join(root,'node_modules','private.js'),privateKey);
    await fs.writeFile(path.join(privateDirectory,'private.js'),privateKey);await fs.symlink(privateDirectory,path.join(root,'assets','private-link'));
    const personal=['/home','/synthetic-person','/document.txt'].join('');await fs.writeFile(path.join(root,'assets','source.js'),JSON.stringify(personal));
    const scan=await scanSourceTree(root);assert.equal(scan.findings.length,1);assert.equal(scan.findings[0].kind,'personal-absolute-path');assert.equal(scan.findings[0].path,'assets/source.js');
    const win=['C:','Users','SyntheticPerson','document.txt'].join('\\');assert.equal(findSourceRisks(win,'tools/source.js')[0].kind,'personal-absolute-path');
  }finally{await fs.rm(root,{recursive:true,force:true});await fs.rm(privateDirectory,{recursive:true,force:true});}
});
test('loopback server exposes only public local assets, denies traversal/secrets and closes its port',{skip:!networkTest},async()=>{
  const root=await fixture();let server;
  try{
    await fs.mkdir(path.join(root,'.git'));await fs.writeFile(path.join(root,'.git','config'),'not public');await fs.symlink(path.join(root,'.git','config'),path.join(root,'assets','secret.js'));
    server=await startLoopbackServer(root);assert.match(server.url,/^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.equal((await request(server.url)).status,200);assert.equal((await request(server.url+'assets/demo.js')).status,200);
    assert.equal((await request(server.url+'assets/demo.js','HEAD')).body,'');assert.equal((await request(server.url,'POST')).status,405);
    assert.equal((await request(server.url+'.git/config')).status,403);assert.equal((await request(server.url+'assets/secret.js')).status,403);
    assert.notEqual((await request(server.url+'assets/%2e%2e%2f.git/config')).status,200);
    const url=server.url;await server.close();await assert.rejects(request(url));
  }finally{if(server)await server.close();await fs.rm(root,{recursive:true,force:true});}
});
test('supervisor keeps server alive through asynchronous child suite, then propagates exit and closes',{skip:!networkTest},async()=>{
  const root=await fixture(),writes=[];
  try{
    await fs.writeFile(path.join(root,'tools','check.js'),`const http=require('node:http');if(!process.argv.includes('--browser'))process.exit(9);const url=process.env.PBGC_TEST_URL;function get(){http.get(url,r=>{r.resume();r.on('end',()=>{if(r.statusCode!==200)process.exit(8);});}).on('error',()=>process.exit(7));}get();setTimeout(()=>{get();setTimeout(()=>{console.log('lifecycle server stayed alive');process.exit(0);},100);},150);`);
    const summary=await runVerification({root,timeoutMs:5000,scan:false,output:{write:text=>writes.push(String(text))}});
    assert.equal(summary.exitCode,0);assert.equal(summary.status,'PASS');assert.equal(summary.fileProfileAcceptance,'NOT_ESTABLISHED_BY_HTTP');
    const text=writes.join(''),url=text.match(/http:\/\/127\.0\.0\.1:\d+\//)[0];assert.match(text,/lifecycle server stayed alive/);await assert.rejects(request(url));
    const saved=JSON.parse(await fs.readFile(path.join(root,'test-results','verification-supplementary-http.json'),'utf8'));assert.equal(saved.exitCode,0);
    await fs.writeFile(path.join(root,'tools','check.js'),'process.exit(17);');const failed=await runVerification({root,timeoutMs:5000,scan:false,output:{write(){}}});assert.equal(failed.exitCode,17);assert.equal(failed.status,'FAIL');
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('supervisor timeout terminates child, closes server and records failure',{skip:!networkTest},async()=>{
  const root=await fixture(),writes=[];
  try{
    await fs.writeFile(path.join(root,'tools','check.js'),'setInterval(()=>{},1000);');const start=Date.now();
    const result=await runVerification({root,timeoutMs:150,scan:false,output:{write:text=>writes.push(String(text))}});
    assert.equal(result.exitCode,124);assert.equal(result.timedOut,true);assert.equal(result.status,'FAIL');assert.ok(Date.now()-start<5000);
    const url=writes.join('').match(/http:\/\/127\.0\.0\.1:\d+\//)[0];await assert.rejects(request(url));
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('file mode clears inherited HTTP target and never creates a substitute server',{skip:!networkTest},async()=>{
  const root=await fixture(),before=process.env.PBGC_TEST_URL,writes=[];
  try{
    process.env.PBGC_TEST_URL='http://127.0.0.1:1/';await fs.writeFile(path.join(root,'tools','check.js'),"if(process.env.PBGC_TEST_URL)process.exit(11);console.error('net::ERR_BLOCKED_BY_ADMINISTRATOR');process.exit(1);");
    const result=await runVerification({root,mode:'file',scan:false,timeoutMs:5000,output:{write:text=>writes.push(String(text))}});
    assert.equal(result.status,'BLOCKED');assert.equal(result.fileProfileAcceptance,'BLOCKED_BY_ADMINISTRATOR');assert.equal(result.exitCode,1);assert.match(writes.join(''),/ACTUAL FILE/);assert.doesNotMatch(writes.join(''),/SUPPLEMENTARY HTTP/);
  }finally{if(before===undefined)delete process.env.PBGC_TEST_URL;else process.env.PBGC_TEST_URL=before;await fs.rm(root,{recursive:true,force:true});}
});
test('interrupt signal propagates exit130 and closes the owned server',{skip:!networkTest},async()=>{
  const root=await fixture(),writes=[];let interrupted=false;
  try{
    await fs.writeFile(path.join(root,'tools','check.js'),"console.log('synthetic child ready');setInterval(()=>{},1000);");
    const result=await runVerification({root,timeoutMs:5000,scan:false,output:{write(text){writes.push(String(text));if(String(text).includes('synthetic child ready')&&!interrupted){interrupted=true;setTimeout(()=>process.emit('SIGINT'),10);}}}});
    assert.equal(result.exitCode,130);assert.equal(result.status,'FAIL');assert.equal(result.timedOut,false);const url=writes.join('').match(/http:\/\/127\.0\.0\.1:\d+\//)[0];await assert.rejects(request(url));
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
