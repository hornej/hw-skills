const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../core.js');
const N = require('../network.js');
const radio = require('./fixtures/infineon-cyw43439.json');
const mosfet = require('./fixtures/infineon-irlml6344.json');
const part = {provider:'digikey',host:'www.digikey.com',manufacturer:'Infineon Technologies',mpn:'CYW43439KUBGT',
  sku:'448-CYW43439KUBGTTR-ND',sourceUrl:'https://www.digikey.com/en/products/detail/infineon-technologies/CYW43439KUBGT/16637075'};
const tokenUrl = 'https://www.infineon.com/content/ifx/en/search/eccn-hts-finder.coveoSearch.txt';
const searchUrl = 'https://infineontechnologiesproduction6kx2o63f.org.coveo.com/rest/search/v2';
const token = 'synthetic.public.token';
const json = data => new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
const text = (body='Search Token = '+token) => new Response(body,{headers:{'content-type':'text/plain'}});
const run = (fetcher,selected=part,extra={})=>N.run({operation:'infineon',part:selected,...extra},'',fetcher);
const entry = result => {const key=C.sourceCacheKey('infineon',result.identity);return {[key]:{key,result}};};

test('Infineon fetches only its fixed public search endpoints, omits cookies and keeps tokens out of reports',async()=>{
  const calls=[];
  const result=await run(async(url,options)=>{
    calls.push({url,options});return url===tokenUrl?text():json(radio);
  },part,{url:'https://evil.test/',token:'untrusted'});
  assert.deepEqual(calls.map(c=>c.url),[tokenUrl,searchUrl]);
  assert.deepEqual(calls.map(c=>c.options.method),['GET','POST']);
  for(const {options} of calls){assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.ok(options.signal);}
  assert.equal(calls[0].options.headers.Authorization,undefined);
  assert.equal(calls[1].options.headers.Authorization,'Bearer '+token);
  const body=JSON.parse(calls[1].options.body);
  assert.equal(body.q,'@opn_name=="CYW43439KUBGT"');assert.equal(body.numberOfResults,100);
  assert.deepEqual(body.context,{env:'prod'});
  assert.doesNotMatch(JSON.stringify(result),/synthetic|Bearer|accessToken/);
  assert.deepEqual(result.fields.declaredCoo.raw,['YY']);
  assert.deepEqual(result.fields.declaredCoo.values,[]);
  assert.deepEqual(result.fields.assembly.values,['Taiwan']);
  assert.deepEqual(result.fields.diffusion.values,['China']);
  assert.deepEqual(result.fields.testing.values,[]);
  assert.equal(result.regionalReports.length,12);
});

test('Infineon preserves country disagreements by region and material, including unresolved YY records',()=>{
  const r=C.fromInfineon(mosfet,{...part,mpn:'IRLML6344TRPBF'});
  assert.deepEqual(new Set(r.fields.declaredCoo.values),new Set(['China','Philippines','United Kingdom']));
  assert.ok(r.fields.declaredCoo.raw.includes('YY'));assert.ok(!r.fields.declaredCoo.values.includes('YY'));
  assert.equal(r.regionalReports.length,48);
  const us=r.regionalReports.find(r=>r.material==='99521055'&&r.regions.includes('US'));
  const eu=r.regionalReports.find(r=>r.material==='99521055'&&r.regions.includes('EU'));
  assert.deepEqual(us.declaredCoo.values,['United Kingdom']);
  assert.deepEqual(eu.declaredCoo.values,['Philippines']);
  assert.deepEqual(us.assembly.values,['Philippines']);assert.deepEqual(us.diffusion.values,['United Kingdom']);
});

test('Infineon rejects wrong manufacturer, suffix variants, ambiguous OPNs and incomplete responses',async()=>{
  for(const requested of [{...part,manufacturer:'Cypress'}, {...part,mpn:'CYW43439'}, {...part,mpn:part.mpn+'R'}]){
    assert.throws(()=>C.fromInfineon(radio,requested),/manufacturer|ordering-code/);
  }
  for(const bad of [{...radio,totalCount:13},{...radio,totalCount:101},{...radio,results:{}},
    {totalCount:1,results:[{raw:{...radio.results[0].raw,opn_name:[part.mpn,part.mpn+'R']}}]},
    {totalCount:1,results:[{raw:{...radio.results[0].raw,region_of_operations:['<script>']}}]}]){
    assert.throws(()=>C.fromInfineon(bad,part),/unexpected|expected/);
  }
  let calls=0;
  for(const mpn of ['ANY" OR @uri', 'ABC\nDEF', 'A'.repeat(81)]){
    await assert.rejects(run(async()=>{calls++;return text();},{...part,mpn}));
  }
  await assert.rejects(run(async()=>{calls++;return text();},{...part,manufacturer:'onsemi'}));
  assert.equal(calls,0);
});

test('Infineon stage-only records are shared across distributor tabs without losing regional evidence',()=>{
  const result=C.fromInfineon(radio,part),saved=entry(result);
  const mouser={...part,provider:'mouser',host:'eu.mouser.com',manufacturer:'Infineon',sku:'727-'+part.mpn,
    sourceUrl:'https://eu.mouser.com/en/ProductDetail/Infineon-Technologies/CYW43439KUBGT'};
  assert.equal(C.savedSource(saved,'infineon',mouser).result,result);
  assert.equal(C.sourceFresh(Object.values(saved)[0],'infineon',result.identity),true);
  assert.equal(C.savedSource(saved,'infineon',{...mouser,mpn:part.mpn+'R'}),null);
  assert.equal(C.savedSource(saved,'microchip',mouser),null);
  for(const edit of [r=>{r.fields.declaredCoo.values=['China'];},r=>{r.sourceUrl='https://evil.test';},
    r=>{r.regionalReports[0].assembly.values=['Germany'];},r=>{r.regionalReports=[];}]){
    const changed=structuredClone(result);edit(changed);assert.equal(C.savedSource(entry(changed),'infineon',mouser),null);
  }
});

test('Infineon treats missing and unrecognized codes as unresolved while retaining raw values',()=>{
  const raw={...radio.results[0].raw,eccn_coo:'YY',eccn_coa:'ZZ',eccn_cod:null};
  const r=C.fromInfineon({totalCount:1,results:[{raw}]},part);
  assert.deepEqual(r.fields.assembly,{raw:['ZZ'],values:[],status:'unknown'});
  assert.deepEqual(r.fields.diffusion.values,[]);assert.equal(C.hasSourceEvidence(r),false);
});

test('Infineon failures are bounded, redacted and do not retry or fall back to another source',async()=>{
  for(const bad of [text('<html>Sign in</html>'),text('Search Token = '+token+'x'.repeat(17000))]){
    let calls=0;await assert.rejects(run(async()=>{calls++;return bad;}),/unavailable|too large/);assert.equal(calls,1);
  }
  for(const status of [401,403,429,500]){
    let calls=0;await assert.rejects(run(async url=>{
      calls++;return url===tokenUrl?text():new Response(token,{status,headers:{'content-type':'text/plain'}});
    }),error=>!error.message.includes(token));assert.equal(calls,2);
  }
  await assert.rejects(run(async url=>{
    if(url===tokenUrl)return text();
    const response=json(radio);Object.defineProperty(response,'url',{value:'https://evil.test'});return response;
  }),/redirected/);
});

test('the worker uses Infineon without a personal credential and global Off cancels before search',async()=>{
  const listeners=[],values={},calls=[];let listener,signal,credentialReads=0;
  const storage={local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,values[k]]))},
    onChanged:{addListener:fn=>listeners.push(fn)}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../background.js'),'utf8'),{
    OriginLens:C,OriginLensNetwork:N,OriginLensCredentials:{get:()=>{credentialReads++;throw new Error();}},
    importScripts:()=>{},URL,AbortController,AbortSignal,
    fetch:async(url,options)=>{calls.push(url);signal=options.signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));},
    chrome:{storage,runtime:{id:'extension',onMessage:{addListener:fn=>{listener=fn;}}}}
  });
  const request=()=>new Promise(resolve=>listener({type:'origin-lens:lookup',operation:'infineon',part},
    {id:'extension',frameId:0,tab:{id:1},url:part.sourceUrl},resolve));
  const pending=request();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(signal.aborted,false);values.enabled=false;
  listeners.forEach(fn=>fn({enabled:{newValue:false}},'local'));
  assert.equal(signal.aborted,true);assert.equal((await pending).ok,false);
  assert.equal((await request()).code,'disabled');assert.equal(credentialReads,0);
  assert.deepEqual(calls,[tokenUrl]);
});
