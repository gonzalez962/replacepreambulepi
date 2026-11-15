const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {TextEncoder,TextDecoder} = require('node:util');
class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.textContent='';this.value='';this.disabled=false;this.hidden=false;this.listeners={};}
  append(...nodes){this.children.push(...nodes)}
  replaceChildren(...nodes){this.children=nodes}
  addEventListener(event,fn){this.listeners[event]=fn}
  setAttribute(){}
}
const host='example.test:8317', agent='test-agent';
const plain = key => JSON.stringify({state:{managementKey:key}});
function cipher(key,version){const input=Buffer.from(plain(key));const salt=Buffer.from('cli-proxy-api-webui::secure-storage|'+host+(version===1?'|'+agent:''));return `enc::v${version}::`+Buffer.from(input.map((v,i)=>v^salt[i%salt.length])).toString('base64')}
function storage(value){return {getItem(name){assert.equal(name,'cli-proxy-auth');return value},setItem(){throw Error('storage write')},removeItem(){throw Error('storage write')}}}
async function boot(parent,local,handler=async()=>({ok:true,json:async()=>[]})){
 const html=fs.readFileSync(__dirname+'/form.html','utf8');const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];const elements={};for(const id of ['form','match','replacement','add','refresh','status','session','count','empty','rules']) elements[id]=new Element();
 const document={getElementById(id){return elements[id] ||= new Element()},createElement(tag){return new Element(tag)}};
 const window={location:{host},parent:{}};Object.defineProperty(window.parent,'localStorage',{get(){if(parent==='blocked')throw Error('blocked');return parent}});Object.defineProperty(window,'localStorage',{get(){if(local==='blocked')throw Error('blocked');return local}});
 const calls=[];vm.runInNewContext(script,{document,window,navigator:{userAgent:agent},TextEncoder,TextDecoder,Uint8Array,atob,fetch:async(url,options)=>{calls.push({url,options});return handler(url,options)}});
 await new Promise(setImmediate);return {elements,calls,html};
}
const flush=()=>new Promise(setImmediate);
for(const [name,parent,local,key] of [['parent',storage(plain('parent')),storage(plain('local')),'parent'],['local',null,storage(plain('local')),'local'],['malformed fallback',storage('{'),storage(plain('local')),'local'],['v1 unicode',storage(cipher('clave-ñ',1)),null,'clave-ñ'],['v2 unicode',null,storage(cipher('clave-雪',2)),'clave-雪'],['blocked parent','blocked',storage(plain('local')),'local']]) test('S7.1 '+name,async()=>{const r=await boot(parent,local);assert.equal(r.calls.length,1);const {url,options}=r.calls[0];assert.equal(url,'/v0/management/plugins/replacesystemprompt/rules');assert.equal(options.headers.Authorization,'Bearer '+key);assert.equal(options.cache,'no-store');assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');assert.ok(!r.html.includes('id="key"'))});
test('S7.1 missing or blocked never fetches including actions',async()=>{for(const [p,l] of [[null,null],['blocked','blocked'],[storage('broken'),null]]){const r=await boot(p,l);assert.equal(r.calls.length,0);await r.elements.form.listeners.submit({preventDefault(){}});await r.elements.refresh.listeners.click();assert.equal(r.calls.length,0);assert.match(r.elements.status.textContent,/sign in.*remember password/i)}});
test('S8.1 CRUD, busy guard, failure preserves input and XSS rendered as text',async()=>{let release;let fail=false;let rules=[{match:'<img src=x onerror=alert(1)>',replacement:'x'}];const r=await boot(storage(plain('synthetic')),null,async(_url,opt)=>{if(opt.method==='POST'){if(fail)return {ok:false,status:500};await new Promise(resolve=>{release=resolve});rules=[...rules,JSON.parse(opt.body)];return {ok:true,json:async()=>rules}}if(opt.method==='DELETE'){rules=rules.filter(x=>x.match!==JSON.parse(opt.body).match);return {ok:true,json:async()=>rules}}return {ok:true,json:async()=>rules}});
 const {elements:e,calls}=r;assert.equal(e.rules.children[0].children[0].textContent,'<img src=x onerror=alert(1)>');assert.equal(e.rules.children[0].children[0].tag,'pre');
 e.match.value='alpha';e.replacement.value='beta';let action=e.form.listeners.submit({preventDefault(){}});await flush();assert.equal(e.add.disabled,true);await e.form.listeners.submit({preventDefault(){}});assert.equal(calls.filter(c=>c.options.method==='POST').length,1);release();await action;assert.equal(e.add.disabled,false);assert.equal(e.rules.children.length,2);
 await e.rules.children[1].children[2].listeners.click();assert.equal(calls.filter(c=>c.options.method==='DELETE').length,1);assert.equal(e.rules.children.length,1);
 fail=true;e.match.value='keep';e.replacement.value='input';await e.form.listeners.submit({preventDefault(){}});assert.equal(e.match.value,'keep');assert.equal(e.replacement.value,'input');assert.match(e.status.textContent,/fail|unable/i);
});
