const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const C=require('../core.js');
const N=require('../network.js');
const key='00000000-0000-0000-0000-000000000001'; // Deliberately synthetic.
const part={provider:'digikey',host:'www.digikey.com',manufacturer:'Nexperia USA Inc.',mpn:'PSMN040-100MSEX',sku:'1727-1086-2-ND',sourceUrl:'https://www.digikey.com/en/products/detail/nexperia-usa-inc/PSMN040-100MSEX/4004849',componentType:'discretes'};
const apiPart={Manufacturer:'Nexperia',ManufacturerPartNumber:part.mpn,MouserPartNumber:'771-PSMN040-100MSEX',ProductDetailUrl:'https://www.mouser.com/en/ProductDetail/Nexperia/PSMN040-100MSEX?qs=example',TradeCompliance:[
  {ComplianceName:'Country of Origin',ComplianceValue:'Philippines'},
  {ComplianceName:'Assembly Country of Origin',ComplianceValue:'Not available'},
  {ComplianceName:'Country of Diffusion',ComplianceValue:'United Kingdom'}]};
const data=(parts=[apiPart])=>({Errors:[],SearchResults:{NumberOfResult:parts.length,Parts:parts}});
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const run=(fetcher,extra={})=>N.run({operation:'mouser-api',part,...extra},'',fetcher,{mouserApiKey:key});

test('Mouser API sends a fixed authenticated exact search without browser cookies and separates manufacturing stages',async()=>{
  let calls=0;
  const result=await run(async(url,options)=>{
    calls++;const u=new URL(url);assert.equal(u.origin,'https://api.mouser.com');assert.equal(u.pathname,'/api/v1/search/partnumber');assert.equal(u.searchParams.get('apiKey'),key);
    assert.equal(options.method,'POST');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
    assert.deepEqual(JSON.parse(options.body),{SearchByPartRequest:{mouserPartNumber:part.mpn,partSearchOptions:'Exact'}});
    return response(data());
  });
  assert.equal(calls,1);assert.equal(result.sourceKind,'Mouser Search API');assert.deepEqual(result.fields.declaredCoo.values,['Philippines']);
  assert.deepEqual(result.fields.assembly.values,[]);assert.deepEqual(result.fields.diffusion.values,['United Kingdom']);
  assert.ok(!JSON.stringify(result).includes(key));assert.equal(result.identity.sku,apiPart.MouserPartNumber);
});

test('API results require exact manufacturer, complete MPN, unique SKU, complete response and safe product link',()=>{
  for(const change of [{Manufacturer:'NXP'},{ManufacturerPartNumber:part.mpn+'TR'},{ProductDetailUrl:'https://evil.test/ProductDetail/Nexperia/part'},{TradeCompliance:[{ComplianceName:'Country of Origin',ComplianceValue:{country:'China'}}]}]){
    assert.throws(()=>C.fromMouserApi(data([{...apiPart,...change}]),part),C.LookupError);
  }
  assert.throws(()=>C.fromMouserApi(data([apiPart,apiPart]),part),e=>e.code==='identity');
  assert.throws(()=>C.fromMouserApi({...data(),SearchResults:{...data().SearchResults,NumberOfResult:2}},part),e=>e.code==='schema');
  const mouser={...part,provider:'mouser',host:'www.mouser.com',sku:apiPart.MouserPartNumber,sourceUrl:apiPart.ProductDetailUrl};
  assert.equal(C.fromMouserApi(data([apiPart,{...apiPart,MouserPartNumber:'other'}]),mouser).identity.sku,mouser.sku);
  assert.throws(()=>C.fromMouserApi(data(),{...mouser,sku:'other'}),e=>e.code==='identity');
});

test('Mouser API auth, quota, transport, schema errors and missing key never leak credentials',async()=>{
  for(const [fetcher,code] of [
    [async()=>{throw new Error('transport '+key);},'network'],
    [async()=>response({},401),'api-auth'],[async()=>response({},429),'rate'],
    [async()=>response({Errors:[{Message:'Invalid API key '+key}],SearchResults:null}),'api-auth'],
    [async()=>response({Errors:[{Message:'Rate limit '+key}],SearchResults:null}),'rate'],
    [async()=>new Response(key,{headers:{'content-type':'application/json'}}),'schema']]){
    await assert.rejects(()=>run(fetcher),e=>e.code===code&&!e.message.includes(key));
  }
  await assert.rejects(()=>N.run({operation:'mouser-api',part},'',()=>{throw new Error('must not fetch');}),e=>e.code==='api-unconfigured');
});

test('website fallback runs only when no API key is configured',async()=>{
  let fallback=0;
  const website=()=>{fallback++;return 'website';};
  assert.equal(await C.lookupMouserAuto(part,async()=>C.fromMouserApi(data(),part),website).then(r=>r.sourceKind),'Mouser Search API');
  assert.equal(fallback,0);
  assert.equal(await C.lookupMouserAuto(part,async()=>{throw new C.LookupError('api-unconfigured','');},website),'website');
  for(const code of ['api-auth','rate','network','identity']) await assert.rejects(()=>C.lookupMouserAuto(part,async()=>{throw new C.LookupError(code,'');},website),e=>e.code===code);
  assert.equal(fallback,1);
});

test('failed website fallback explains missing API setup without masking cancellation or extension failures',async()=>{
  const unconfigured=async()=>{throw new C.LookupError('api-unconfigured','');};
  for(const code of ['auth','network','identity','schema']){
    await assert.rejects(()=>C.lookupMouserAuto(part,unconfigured,async()=>{throw new C.LookupError(code,'Open it normally, then retry.');}),
      e=>e.code==='api-unconfigured'&&e.message.includes('No Search API key is saved')&&!e.message.includes('Open it normally'));
  }
  for(const code of ['cancelled','disabled','extension']){
    await assert.rejects(()=>C.lookupMouserAuto(part,unconfigured,async()=>{throw new C.LookupError(code,'Stopped');}),e=>e.code===code);
  }
});

test('API reports are live only; previously cached API results cannot be reused on any site',()=>{
  const result=C.fromMouserApi(data(),part),k=C.sourceCacheKey('mouser',result.identity),entries={[k]:{key:k,result}};
  const eu={...result.identity,host:'eu.mouser.com',sourceUrl:result.sourceUrl.replace('www.mouser','eu.mouser')};
  assert.equal(C.cacheableSource(result),false);
  assert.equal(C.sourceFresh(entries[k],'mouser',result.identity),false);
  assert.equal(C.isFresh(result,result.identity),false);
  assert.equal(C.savedSource(entries,'mouser',part),null);assert.equal(C.savedSource(entries,'mouser',eu),null);
  assert.equal(C.savedSource(entries,'mouser',{...eu,sku:'other'}),null);
  const website={...result,sourceKind:'Mouser Product & Trade Compliance'};
  const websiteEntries={[k]:{key:k,result:website}};
  assert.ok(C.cacheableSource(website));assert.ok(C.savedSource(websiteEntries,'mouser',part));
  assert.equal(C.savedSource(websiteEntries,'mouser',eu),null);
});

const microPart={...part,manufacturer:'Microchip Technology',mpn:'PIC10F200-E/MC',sku:'PIC10F200-E/MC-ND',sourceUrl:'https://www.digikey.com/en/products/detail/microchip-technology/PIC10F200-E-MC/12345'};
const microData={totalRecords:1,totalPages:1,pagenumber:1,pagesize:100,data:[{manufacturer:'Microchip Technology Inc.',part_number:microPart.mpn,sku:microPart.mpn,country_of_origin:'Thailand',assembly_country:'Thailand',wafer_fab_country:'United States of America'}]};
test('Microchip public API preserves declared COO, assembly and wafer countries and shares its own report',async()=>{
  const result=await N.run({operation:'microchip',part:microPart},'',async(url,options)=>{
    assert.equal(new URL(url).searchParams.get('part'),microPart.mpn);assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');return response(microData);
  });
  assert.equal(result.identity.provider,'microchip');assert.deepEqual(result.fields.declaredCoo.values,['Thailand']);assert.deepEqual(result.fields.assembly.values,['Thailand']);assert.deepEqual(result.fields.diffusion.values,['United States of America']);
  const k=C.sourceCacheKey('microchip',result.identity),entries={[k]:{key:k,result}};
  assert.ok(C.savedSource(entries,'microchip',microPart));assert.equal(C.savedSource(entries,'microchip',{...microPart,mpn:microPart.mpn+'TR'}),null);
  for(const mutated of [{...microData,totalRecords:2},{...microData,data:[{...microData.data[0],part_number:microPart.mpn+'TR'}]},{...microData,data:[{...microData.data[0],manufacturer:'Other'}]}]) assert.throws(()=>C.fromMicrochip(mutated,microPart),C.LookupError);
  assert.throws(()=>C.fromMicrochip(microData,part),C.LookupError);
});

function workerHarness(initial={},transport=async()=>response(data())){
  const values={...initial},listeners=[];let listener,calls=0;
  const storage={onChanged:{addListener:fn=>listeners.push(fn)},local:{
    get:async keys=>keys===null?{...values}:Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,values[k]])),
    remove:async keys=>{for(const k of keys)delete values[k];},
    set:async update=>{Object.assign(values,update);for(const fn of listeners)fn(Object.fromEntries(Object.entries(update).map(([k,v])=>[k,{newValue:v}])),'local');}
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../background.js'),'utf8'),{
    OriginLens:C,OriginLensNetwork:N,OriginLensCredentials:{get:async()=>key},URL,AbortController,AbortSignal,importScripts:()=>{},
    fetch:async(url,options)=>{calls++;return transport(url,options);},chrome:{storage,runtime:{id:'test',onMessage:{addListener:fn=>{listener=fn;}}}}
  });
  return {values,calls:()=>calls,storage,ask:(p=part)=>new Promise(resolve=>listener({type:'origin-lens:lookup',operation:'mouser-api',part:p},{id:'test',frameId:0,tab:{id:1},url:p.sourceUrl},resolve))};
}
test('worker keeps credentials out of replies/storage and enforces persistent request limits',async()=>{
  const h=workerHarness();assert.equal((await h.ask()).ok,true);assert.equal(h.calls(),1);
  assert.ok(!JSON.stringify(h.values).includes(key));assert.equal(h.values['mouser-api-requests'].length,1);
  const limited=workerHarness({'mouser-api-requests':Array(30).fill(Date.now())});const reply=await limited.ask();
  assert.equal(reply.code,'rate');assert.equal(limited.calls(),0);assert.ok(!JSON.stringify(reply).includes(key));
  const off=workerHarness({enabled:false});assert.equal((await off.ask()).code,'disabled');assert.equal(off.calls(),0);
});

test('worker migration deletes old API reports but retains preferences, request counts and other sources',async()=>{
  const result=C.fromMouserApi(data(),part),k=C.sourceCacheKey('mouser',result.identity);
  const websiteKey=k+'-website',times=[Date.now()];
  const saved={enabled:true,'mouser-api-requests':times,mouserApiRevision:'revision',
    [k]:{key:k,result},'origin-lens:v1:legacy':{...result,version:1},
    [websiteKey]:{key:websiteKey,result:{...result,sourceKind:'Mouser Product & Trade Compliance'}}};
  assert.deepEqual(C.disallowedCacheKeys(saved).sort(),[k,'origin-lens:v1:legacy'].sort());
  const h=workerHarness(saved);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.values[k],undefined);assert.equal(h.values['origin-lens:v1:legacy'],undefined);
  assert.ok(h.values[websiteKey]);assert.equal(h.values.enabled,true);
  assert.deepEqual(h.values['mouser-api-requests'],times);assert.equal(h.values.mouserApiRevision,'revision');
  assert.equal(h.calls(),0);
});
test('key changes and global off abort pending API requests',async()=>{
  for(const change of [{enabled:false},{mouserApiRevision:'changed'}]){
    let signal;
    const h=workerHarness({},async(url,options)=>{signal=options.signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));});
    const pending=h.ask();await new Promise(resolve=>setImmediate(resolve));assert.ok(signal);
    await h.storage.local.set(change);assert.equal(signal.aborted,true);assert.equal((await pending).ok,false);
  }
});

test('Mouser setup opens only the fixed extension form for trusted product-page senders',async()=>{
  let listener;const opened=[];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../background.js'),'utf8'),{
    OriginLens:C,OriginLensNetwork:N,importScripts:()=>{},
    chrome:{storage:{onChanged:{addListener:()=>{}}},tabs:{create:async options=>opened.push(options.url)},
      runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener:fn=>{listener=fn;}}}}
  });
  const sender={id:'test',frameId:0,tab:{id:1},url:part.sourceUrl};
  const message={type:'origin-lens:open-mouser-settings',url:'https://untrusted.example/'};
  for(const bad of [{...sender,id:'other'},{...sender,frameId:1},{...sender,url:'https://untrusted.example/'},{...sender,tab:null}]){
    assert.equal(listener(message,bad,()=>assert.fail('untrusted request accepted')),false);
  }
  assert.deepEqual(opened,[]);
  const reply=await new Promise(resolve=>assert.equal(listener(message,sender,resolve),true));
  assert.equal(reply.ok,true);assert.deepEqual(opened,['chrome-extension://test/popup.html#api-form']);
});
