#!/usr/bin/env node
'use strict';
// Development-only fast static UI gate. Never required by the delivered app.
const path=require('node:path'),{spawn}=require('node:child_process');const{startLoopbackServer}=require('./verify-browser.js');const root=path.resolve(__dirname,'..');
async function check(mode){let server;const env={...process.env};try{if(mode==='http'){server=await startLoopbackServer(root);env.PBGC_TEST_URL=server.url;}else delete env.PBGC_TEST_URL;const child=spawn(process.execPath,[path.join(root,'tests/accessibility.test.js')],{cwd:root,env,stdio:'inherit'});return await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code??1));});}finally{if(server)await server.close();}}
(async()=>{const modes=process.argv.includes('--both')?['http','file']:process.argv.includes('--file')?['file']:['http'];let failed=false;for(const mode of modes)if(await check(mode))failed=true;process.exitCode=failed?1:0;})().catch(error=>{console.error(error.message);process.exitCode=1;});
