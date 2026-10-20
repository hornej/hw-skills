const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../core.js');
const N=require('../network.js');
const part={provider:'digikey',host:'www.digikey.com',manufacturer:'STMicroelectronics',mpn:'STM32G491RET6',sku:'497-STM32G491RET6-ND',sourceUrl:'https://www.digikey.com/en/products/detail/stmicroelectronics/STM32G491RET6/13592591'};
const url='https://www.lcsc.com/product-detail/C3231005.html';
const image='https://assets.lcsc.com/images/lcsc/900x900/20230511_STMicroelectronics-STM32G491RET6_C3231005_blank.jpg';
const product={'@type':'Product',mpn:part.mpn,sku:'C3231005',brand:{name:'ST'},offers:{url},image:[image]};
const doc=(data=product)=>({querySelectorAll:()=>[{textContent:JSON.stringify(data)}]});
const record=()=>C.fromLCSC(doc(),url,part);
const search=(pairs=[[part.mpn,url]])=>({querySelectorAll:()=>pairs.map(([textContent,href])=>({textContent,getAttribute:()=>href}))});
const review=C.lcscReview(part,[image]);

test('LCSC identity and images require exact full MPN, manufacturer, catalog SKU and safe URLs',()=>{
 const result=record();assert.equal(result.identity.manufacturer,'ST');assert.equal(result.identity.sku,'C3231005');
 assert.ok(C.hasSourceEvidence(result));assert.equal(C.hasOriginEvidence(result),false);
 assert.deepEqual(result.fields.assembly.values,[]);assert.deepEqual(result.fields.declaredCoo.values,[]);
 assert.equal(result.photoEvidence.observation,null);
 for(const mutation of [{mpn:part.mpn+'TR'},{brand:{name:'Other'}},{sku:'C1'},{offers:{url:url.replace('C3231005','C1')}},{image:[image.replace('assets.lcsc.com','evil.example')]},{image:[image.replace('C3231005','C1')]}]){
  assert.throws(()=>C.fromLCSC(doc({...product,...mutation}),url,part),C.LookupError);
 }
 assert.throws(()=>C.fromLCSC(doc([product,product]),url,part),e=>e.code==='identity');
 for(const value of [image+'?tracking=1',image.replace('https:','http:'),image.replace('assets.lcsc.com','assets.lcsc.com.evil.test'),image.replace('.jpg','.svg')]){
  assert.throws(()=>C.lcscImageUrl(value,'C3231005'));
 }
});

test('search ignores suffix variants, rejects ambiguous candidates and strips tracking',()=>{
 assert.equal(C.lcscCandidate(search([[part.mpn+'TR',url.replace('C3231005','C5270292')],[part.mpn,url+'?track=yes']]),'https://www.lcsc.com',part),url);
 for(const pairs of [[[part.mpn+'TR',url]],[[part.mpn,url],[part.mpn,url.replace('C3231005','C2')]],[[part.mpn,'https://evil.test/product-detail/C3231005.html']]]){
  assert.throws(()=>C.lcscCandidate(search(pairs),'https://www.lcsc.com',part),e=>e.code==='match');
 }
});

test('a reviewed marking is bound to the part and image, with separate original review and lookup timestamps',async()=>{
 const requests=[];
 const request=async(operation,extra)=>{
  requests.push([operation,extra]);
  if(operation==='lcsc-search')return {html:'search',url:C.lcscSearchUrl(part)};
  if(operation==='lcsc-product')return {html:'product',url};
  if(operation==='lcsc-review')return {...review};
 };
 const parse=html=>html==='search'?search():doc();
 const result=await C.lookupLCSC(part,request,parse);
 assert.equal(result.photoEvidence.observation.country,'China');
 assert.equal(result.photoEvidence.observation.marking,'CHN');
 assert.equal(result.photoEvidence.observation.reviewedAt,'2026-10-20T16:10:15.785Z');
 assert.deepEqual(result.fields.assembly.values,[]);assert.deepEqual(result.fields.declaredCoo.values,[]);
 assert.equal(C.hasOriginEvidence(result),false);assert.equal(C.validLCSCPhotos(result),true);
 assert.deepEqual(requests.map(r=>r[0]),['lcsc-search','lcsc-product','lcsc-review','lcsc-ocr']);
 assert.equal(C.lcscReview({...part,mpn:part.mpn+'TR'},[image]),null);
 assert.equal(C.lcscReview(part,[image.replace('20230511','20261020')]),null);
 const changed=await C.lookupLCSC(part,async(op)=>op==='lcsc-review'?null:{html:'product',url},parse,url);
 assert.equal(changed.photoEvidence.observation,null);assert.match(changed.photoEvidence.reviewNote,/changed/);
});

test('photo cache shares across distributor pages without becoming COO or accepting altered observations',()=>{
 const result=record();result.photoEvidence.observation={...review};
 const key=C.sourceCacheKey('lcsc',result.identity),entries={[key]:{key,result}};
 const mouser={...part,provider:'mouser',host:'www.mouser.com',sku:'511-STM32G491RET6',sourceUrl:'https://www.mouser.com/en/ProductDetail/STMicroelectronics/STM32G491RET6'};
 assert.ok(C.savedSource(entries,'lcsc',part));assert.ok(C.savedSource(entries,'lcsc',mouser));
 assert.equal(C.savedSource(entries,'lcsc',{...part,mpn:part.mpn+'TR'}),null);
 result.photoEvidence.observation.country='Taiwan';
 assert.equal(C.savedSource(entries,'lcsc',part),null);
 result.photoEvidence.observation={...review};result.fields.declaredCoo=C.field(['China']);
 assert.equal(C.savedSource(entries,'lcsc',part),null);
});

test('photo network operations use fixed public sources, omit cookies and reject unsafe input and changed bytes',async()=>{
 const calls=[];
 const fetcher=async(u,options)=>{calls.push([u,options]);return new Response('<html>fixture</html>',{headers:{'content-type':'text/html'}});};
 await N.run({operation:'lcsc-search',part},'',fetcher);
 await N.run({operation:'lcsc-product',part,url},'',fetcher);
 assert.equal(new URL(calls[0][0]).searchParams.get('globalKeyword'),part.mpn);
 for(const [,options] of calls){assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');}
 for(const message of [{operation:'lcsc-product',part,url:'https://evil.test/'},{operation:'lcsc-review',part,url:image+'?tracking=1'},{operation:'lcsc-search',part:{...part,manufacturer:'Other'}}]){
  await assert.rejects(()=>N.run(message,'',()=>assert.fail('must not fetch')),C.LookupError);
 }
 const changed=await N.run({operation:'lcsc-review',part,url:image},'',async()=>new Response('changed image',{headers:{'content-type':'image/jpeg'}}));
 assert.equal(changed,null);
 await assert.rejects(()=>N.run({operation:'lcsc-review',part,url:image},'',async()=>new Response('<svg/>',{headers:{'content-type':'image/svg+xml'}})),e=>e.code==='schema');
 await assert.rejects(()=>N.run({operation:'lcsc-review',part,url:image},'',async()=>new Response('oversize',{headers:{'content-type':'image/jpeg','content-length':'5000000'}})),e=>e.code==='size');
});
