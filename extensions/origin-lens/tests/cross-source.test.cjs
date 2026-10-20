const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const N = require('../network.js');
const dk = { provider:'digikey',host:'www.digikey.com',manufacturer:'STMicroelectronics',mpn:'STM32G491RET6',sku:'497-STM32G491RET6-ND',sourceUrl:'https://www.digikey.com/en/products/detail/stmicroelectronics/STM32G491RET6/12345' };
const mouser = { ...dk,provider:'mouser',host:'www.mouser.com',sku:'511-STM32G491RET6',sourceUrl:'https://www.mouser.com/en/ProductDetail/STMicroelectronics/STM32G491RET6?qs=example' };
const dkData = { manufacturer:dk.manufacturer,manufacturerPartNumber:dk.mpn,digiKeyPartNumber:dk.sku,countryOfOrigin:'Taiwan',partDetailUrl:dk.sourceUrl };
const product = {item_name:dk.mpn,prmis_id:'CP531377',parent_id:'PF269474'};
const attributes = [{prmis_id:'CP531377',attribute_name:'5080',attribute_value:'TAIWAN'}];
function response(data, url, type='application/json', status=200) {
  const r = new Response(type.includes('json') ? JSON.stringify(data) : data,{status,headers:{'content-type':type}});
  Object.defineProperty(r,'url',{value:url}); return r;
}
const doc = (identity, origin='Taiwan') => ({
  querySelector: s => s==='h1' ? {textContent:identity.mpn} : null,
  querySelectorAll: s => s.includes('ld+json') ? [{textContent:JSON.stringify({'@type':'Product',mpn:identity.mpn,brand:identity.manufacturer,sku:identity.sku,offers:{url:identity.sourceUrl}})}] :
    s==='dl.compliance-dlist dt' ? [{childNodes:[{nodeType:3,textContent:'Country of Origin:'}],nextElementSibling:{tagName:'DD',textContent:origin}}] : []
});

test('Mouser to DigiKey queries the MPN, preserves target provenance and makes no writes', async () => {
  const calls=[];
  const result=await N.run({operation:'digikey',part:mouser},'EXAMPLE',async (url,options)=>{calls.push({url,options});return response(dkData,url);});
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/alternateParts\/STM32G491RET6$/);
  assert.equal(calls[0].options.credentials,'include');
  assert.equal(calls[0].options.method,'GET');
  assert.equal(calls[0].options.body,undefined);
  assert.equal(result.identity.provider,'digikey');
  assert.equal(result.sourceUrl,dk.sourceUrl);
  assert.equal(result.identity.sku,dk.sku);
  await assert.rejects(()=>N.run({operation:'digikey',part:mouser},'EXAMPLE',async u=>response({...dkData,manufacturerPartNumber:dk.mpn+'TR'},u)),e=>e.code==='identity');
});

test('Mouser direct redirect and search grid both require exact full product identity', async () => {
  const calls=[];
  const direct=await C.lookupMouser(dk,async op=>{calls.push(op);return {url:mouser.sourceUrl,html:'product'};},()=>doc(mouser));
  assert.equal(direct.identity.provider,'mouser'); assert.deepEqual(calls,['mouser-search']);
  const link=(text,url)=>({textContent:text,getAttribute:()=>url});
  const search={querySelector:()=>null,querySelectorAll:s=>s.includes('ld+json')?[]:[link(dk.mpn,mouser.sourceUrl),link(dk.mpn+'TR',mouser.sourceUrl.replace('RET6','RET6TR'))]};
  calls.length=0;
  const result=await C.lookupMouser(dk,async (op,extra)=>{calls.push([op,extra]);return op==='mouser-search'?{url:'https://www.mouser.com/en/c/?q='+dk.mpn,html:'search'}:{url:extra.url,html:'product'};},html=>html==='search'?search:doc(mouser));
  assert.equal(result.identity.mpn,dk.mpn); assert.equal(calls.length,2);
  await assert.rejects(()=>C.lookupMouser(dk,async()=>({url:mouser.sourceUrl,html:''}),()=>doc({...mouser,mpn:dk.mpn+'TR'})),e=>e.code==='identity');
  await assert.rejects(()=>C.lookupMouser(dk,async()=>({url:mouser.sourceUrl,html:''}),()=>doc({...mouser,manufacturer:'Other'})),e=>e.code==='identity');
  assert.throws(()=>C.mouserCandidate({querySelectorAll:()=>[link(dk.mpn,mouser.sourceUrl),link(dk.mpn,mouser.sourceUrl.replace('example','another'))]},'https://www.mouser.com/',dk),e=>e.code==='match');
});

test('ST verifies page field, parent, exact code and CP attributes before assigning COO', async () => {
  const page={querySelector:s=>s.includes('data-product-id')?{getAttribute:()=>product.parent_id}:{textContent:'Country of Origin'}};
  assert.equal(C.stParent(page),product.parent_id);
  assert.throws(()=>C.stParent({querySelector:()=>null}),e=>e.code==='schema');
  const urls=[];
  const result=await N.run({operation:'st-origin',part:mouser,parentId:product.parent_id},'',async (url,opts)=>{
    urls.push(url);assert.equal(opts.method,'GET');assert.equal(opts.credentials,'omit');
    return response(url.includes('productsByParentId')?[product,{...product,item_name:dk.mpn+'TR',prmis_id:'CP999'}]:attributes,url);
  });
  assert.equal(urls.length,2); assert.match(urls[1],/CP531377$/);
  assert.equal(result.identity.provider,'st');assert.deepEqual(result.fields.declaredCoo.values,['TAIWAN']);assert.deepEqual(result.fields.assembly.values,[]);
  for(const p of [[],[product,product],[{...product,parent_id:'PF999'}],[{...product,item_name:dk.mpn+'TR'}]]) assert.throws(()=>C.stProduct(p,product.parent_id,dk),e=>e.code==='identity');
  assert.throws(()=>C.fromST([{...attributes[0],prmis_id:'CP999'}],product,dk),e=>e.code==='schema');
  assert.deepEqual(C.fromST([],product,dk).fields.declaredCoo.values,[]);
  assert.equal(C.stFamily({...dk,manufacturer:'Other'}),null);
  assert.equal(C.stFamily({...dk,mpn:'STM32MP157AAA3'}),null);
});

test('source cache isolates site, exact code, source and SKU; disagreement ignores case only',()=>{
  const r=C.crossDigiKey(dkData,mouser);const key=C.sourceCacheKey('digikey',mouser);const entry={key,result:r};
  assert.equal(C.sourceFresh(entry,'digikey',mouser),true);
  assert.equal(C.sourceFresh(entry,'mouser',mouser),false);
  assert.equal(C.sourceFresh(entry,'digikey',{...mouser,mpn:dk.mpn+'TR'}),false);
  assert.equal(C.sourceFresh(entry,'digikey',mouser,Date.parse(r.checkedAt)+C.CACHE_TTL),false);
  assert.notEqual(C.sourceCacheKey('mouser',mouser),C.sourceCacheKey('mouser',{...mouser,host:'eu.mouser.com'}));
  assert.notEqual(C.sourceCacheKey('digikey',dk),C.sourceCacheKey('digikey',{...dk,sku:dk.sku+'-other'}));
  assert.equal(C.disagreement([r,C.fromST(attributes,product,dk)]),false);
  assert.equal(C.disagreement([r,C.fromST([{...attributes[0],attribute_value:'FRANCE'}],product,dk)]),true);
  assert.equal(C.disagreement([r,C.fromST([],product,dk)]),false);
});

test('verified Nexperia names match in both distributor directions while differing origins stay separate',async()=>{
  const dkPart={...dk,manufacturer:'Nexperia USA Inc.',mpn:'PSMN040-100MSEX',sku:'1727-1086-2-ND',sourceUrl:'https://www.digikey.com/en/products/detail/nexperia-usa-inc/PSMN040-100MSEX/4004849'};
  const mouserPart={...mouser,manufacturer:'Nexperia',mpn:dkPart.mpn,sku:'771-PSMN040-100MSEX',sourceUrl:'https://www.mouser.com/en/ProductDetail/Nexperia/PSMN040-100MSEX?qs=example'};
  const data={manufacturer:dkPart.manufacturer,manufacturerPartNumber:dkPart.mpn,digiKeyPartNumber:dkPart.sku,countryOfOrigin:'China',partDetailUrl:dkPart.sourceUrl};
  const dkResult=await N.run({operation:'digikey',part:mouserPart},'EXAMPLE',async u=>response(data,u));
  const mouserResult=await C.lookupMouser(dkPart,async()=>({url:mouserPart.sourceUrl,html:'product'}),()=>doc(mouserPart,'Philippines'));
  assert.equal(dkResult.identity.manufacturer,'Nexperia USA Inc.');assert.equal(mouserResult.identity.manufacturer,'Nexperia');
  assert.equal(dkResult.sourceUrl,dkPart.sourceUrl);assert.equal(mouserResult.sourceUrl,mouserPart.sourceUrl);
  assert.deepEqual(dkResult.fields.declaredCoo.values,['China']);assert.deepEqual(mouserResult.fields.declaredCoo.values,['Philippines']);
  assert.equal(C.disagreement([dkResult,mouserResult]),true);
  for(const changed of [{mpn:'PSMN040-100MSE'},{mpn:'PSMN040-100MSEXTR'},{manufacturer:'NXP'},{manufacturer:'Nexperia Other'},{manufacturer:'Nexperia USA Inc. Other'}]){
    assert.throws(()=>C.assertMatch({...mouserPart,...changed},dkPart),e=>e.code==='identity');
  }
  assert.equal(C.sameManufacturer('Unlisted Inc.','Unlisted'),false);
  assert.equal(C.sameManufacturer('',undefined),false);
});

test('source cache uses verified manufacturer aliases without merging source, region, SKU, suffix or timestamps',()=>{
  const part={...mouser,manufacturer:'Nexperia',mpn:'PSMN040-100MSEX'};
  const data={...dkData,manufacturer:'Nexperia USA Inc.',manufacturerPartNumber:part.mpn,countryOfOrigin:'China'};
  const result=C.crossDigiKey(data,part),key=C.sourceCacheKey('digikey',part),entry={key,result};
  const alias={...part,manufacturer:'Nexperia USA Inc.'};
  assert.equal(C.sourceCacheKey('digikey',alias),key);assert.equal(C.sourceFresh(entry,'digikey',alias),true);
  assert.equal(C.sourceFresh(entry,'mouser',alias),false);
  assert.equal(C.sourceFresh(entry,'digikey',{...alias,mpn:part.mpn+'TR'}),false);
  assert.equal(C.sourceFresh(entry,'digikey',{...alias,manufacturer:'Nexperia Other'}),false);
  assert.equal(C.sourceFresh(entry,'digikey',alias,Date.parse(result.checkedAt)+C.CACHE_TTL),false);
  assert.notEqual(C.sourceCacheKey('mouser',part),C.sourceCacheKey('mouser',{...part,sku:part.sku+'-other'}));
  assert.notEqual(C.sourceCacheKey('mouser',part),C.sourceCacheKey('mouser',{...part,host:'eu.mouser.com'}));
});

test('saved source reports follow the exact part across sites while retaining SKU, region and age boundaries',()=>{
  const r=C.fromMouser(doc(mouser,'Philippines'),mouser),key=C.sourceCacheKey('mouser',mouser),entries={[key]:{key,result:r}};
  assert.equal(C.savedSource(entries,'mouser',dk).result,r);
  assert.equal(C.savedSource(entries,'mouser',mouser).result,r);
  assert.equal(C.savedSource(entries,'mouser',{...dk,mpn:dk.mpn+'TR'}),null);
  assert.equal(C.savedSource(entries,'mouser',{...mouser,sku:'OTHER'}),null);
  assert.equal(C.savedSource(entries,'mouser',{...mouser,host:'eu.mouser.com'}),null);
  assert.equal(C.savedSource(entries,'digikey',mouser),null);
  const time=Date.parse(r.checkedAt);
  assert.equal(C.savedSource(entries,'mouser',dk,time+C.CACHE_TTL).stale,true);
  assert.equal(C.savedSource(entries,'mouser',dk,time+C.CACHE_RETENTION),null);
  assert.equal(C.savedSource(entries,'mouser',dk,time-1),null);
  assert.equal(C.savedSource({[key]:undefined},'mouser',dk),null);
  assert.equal(C.savedSource({[key]:{key,result:{...r,sourceUrl:'https://evil.test/'}}},'mouser',dk),null);
});

test('legacy reports remain shareable and the newest verified source observation wins',()=>{
  const older=C.fromMouser(doc(mouser,'Philippines'),mouser);older.checkedAt=new Date(Date.now()-10000).toISOString();
  const newer={...older,checkedAt:new Date().toISOString(),fields:{...older.fields,declaredCoo:C.field(['China'])}};
  const oldKey=C.sourceCacheKey('mouser',dk),newKey=C.sourceCacheKey('mouser',mouser);
  const entries={[oldKey]:{key:oldKey,result:older},[newKey]:{key:newKey,result:newer}};
  assert.equal(C.savedSource(entries,'mouser',dk).result,newer);
  delete entries[newKey];assert.equal(C.savedSource(entries,'mouser',dk).result,older);
});

test('a verified Mouser product URL skips search but still requires exact manufacturer and full MPN',async()=>{
  const calls=[];
  const result=await C.lookupMouser(dk,async(op,extra)=>{calls.push({op,...extra});return {url:extra.url,html:'product'};},()=>doc(mouser),mouser.sourceUrl);
  assert.equal(result.identity.mpn,dk.mpn);assert.deepEqual(calls,[{op:'mouser-product',url:mouser.sourceUrl}]);
  await assert.rejects(()=>C.lookupMouser(dk,async()=>({url:mouser.sourceUrl,html:''}),()=>doc({...mouser,mpn:dk.mpn+'TR'}),mouser.sourceUrl),e=>e.code==='identity');
  await assert.rejects(()=>C.lookupMouser(dk,async()=>{throw new Error('must not fetch');},()=>doc(mouser),'https://evil.test/'),e=>e.code==='url');
});

test('worker only accepts top-frame supported pages and constrained operations',async()=>{
  const sender={id:'extension',frameId:0,tab:{id:1},url:mouser.sourceUrl};
  assert.equal(N.allowedSender(sender,'extension'),true);
  for(const changed of [{id:'other'},{frameId:1},{url:'https://evil.test/'},{url:'https://www.mouser.com/account/'}]) assert.equal(N.allowedSender({...sender,...changed},'extension'),false);
  for(const url of ['https://evil.test/a','https://www.mouser.com/account/','https://www.mouser.com.evil.test/en/ProductDetail/a/b','https://user@www.mouser.com/en/ProductDetail/a/b']) {
    await assert.rejects(()=>N.run({operation:'mouser-product',part:dk,url},'',()=>{throw new Error('should not fetch');}),e=>e.code==='url');
  }
  await assert.rejects(()=>N.run({operation:'st-origin',part:dk,parentId:'PF1&x=1'}),e=>e.code==='request');
  await assert.rejects(()=>N.run({operation:'anything',part:dk}),e=>e.code==='request');
});

test('blocked, redirected and malformed sources fail independently without false origin',async()=>{
  for(const [status,code] of [[403,'auth'],[429,'rate'],[503,'http']]) await assert.rejects(()=>N.run({operation:'mouser-search',part:dk},'',async url=>response('blocked',url,'text/html',status)),e=>e.code===code);
  await assert.rejects(()=>N.run({operation:'mouser-search',part:dk},'',async()=>response('','https://evil.test/','text/html')),e=>e.code==='redirect');
  await assert.rejects(()=>N.run({operation:'mouser-search',part:dk},'',async()=>{throw new Error('private transport details');}),e=>e.code==='network'&&!e.message.includes('private'));
  await assert.rejects(()=>N.run({operation:'st-origin',part:dk,parentId:product.parent_id},'',async url=>response('login',url,'text/html')),e=>e.code==='schema');
});

test('background replies through the real operation and deduplicates concurrent lookups',async()=>{
  const fs=require('node:fs');const vm=require('node:vm');
  let listener,fetches=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  const fetcher=async url=>{fetches++;await gate;return response(dkData,url);};
  const context={
    importScripts:()=>{},OriginLens:C,OriginLensNetwork:N,URL,AbortController,AbortSignal,fetch:fetcher,
    chrome:{runtime:{id:'extension',onMessage:{addListener:f=>{listener=f;}}},storage:{onChanged:{addListener:()=>{}},local:{get:async()=>({digikeyListId:'EXAMPLE'})}}}
  };
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../background.js'),'utf8'),context);
  const message={type:'origin-lens:lookup',operation:'digikey',part:mouser};
  const sender={id:'extension',frameId:0,tab:{id:1},url:mouser.sourceUrl};
  const ask=(m,s=sender)=>new Promise(resolve=>{assert.equal(listener(m,s,resolve),true);});
  const a=ask(message),b=ask(message);release();
  const results=await Promise.all([a,b]);
  assert.equal(fetches,1);assert.ok(results.every(r=>r.ok&&r.data.identity.provider==='digikey'));
  assert.equal(listener(message,{...sender,url:'https://evil.test/'},()=>{}),false);
  const bad=await ask({...message,part:{...mouser,sourceUrl:mouser.sourceUrl.replace('STM32G491RET6?','STM32G491RET6TR?')}});
  assert.equal(bad.ok,false);assert.equal(bad.code,'request');assert.equal(fetches,1);
});
