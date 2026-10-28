'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync(__dirname+'/../assets/style.css','utf8');
const luminance=hex=>{const rgb=hex.replace('#','').match(/../g).map(n=>parseInt(n,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
const contrast=(a,b)=>{const [lo,hi]=[luminance(a),luminance(b)].sort((x,y)=>x-y);return(hi+.05)/(lo+.05);};
function tokens(rule){return Object.fromEntries([...rule.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6}|#[0-9a-f]{3})/gi)].map(m=>[m[1],m[2].length===4?'#'+m[2].slice(1).split('').map(c=>c+c).join(''):m[2]]));}
test('actual dark and light CSS text and focus/control boundaries meet contrast thresholds',()=>{
 const dark=tokens(css.match(/:root\{([^}]+)\}/)[1]),light={...dark,...tokens(css.match(/body\.light\{([^}]+)\}/)[1])};
 for(const theme of [dark,light]){
  for(const bg of [theme.bg,theme.panel])for(const name of ['text','muted','accent'])assert.ok(contrast(theme[name],bg)>=4.5,`${name} ${theme[name]} on ${bg}`);
  for(const bg of [theme.bg,theme.panel])assert.ok(contrast(theme.line,bg)>=3,`control border on ${bg}`);
 }
 assert.ok(contrast('#ffffff',dark['pbgc-blue'])>=4.5);
 assert.ok(contrast('#6e93c2',dark['pbgc-blue'])>=3);
});
test('approved screen palette and local assets only remain in source shell',()=>{
 const required={'pbgc-blue':'#002d72','pbgc-red':'#e4002b','pbgc-gray':'#81807f','pbgc-light-blue-gray':'#6e93c2','pbgc-medium-blue':'#004b8d','pbgc-medium-green':'#008065','pbgc-teal':'#00a9a1','pbgc-light-green':'#88b672'};
 const actual=tokens(css);for(const [k,v]of Object.entries(required))assert.equal(actual[k],v);
 const html=fs.readFileSync(__dirname+'/../index.html','utf8');assert.match(html,/\[PBGC-approved logo asset\]/);assert.match(html,/connect-src 'none'/);assert.doesNotMatch(html,/(?:src|href)=["']https?:/);assert.doesNotMatch(css,/@import|https?:\/\//);
});
