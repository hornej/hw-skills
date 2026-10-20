const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const O = require('../st-options.js');
const N = require('../network.js');
const fixture = require('./fixtures/stm32g491re-options.json');
const part = { provider:'digikey', host:'www.digikey.com', manufacturer:'STMicroelectronics', mpn:'STM32G491RET6',
  sku:'497-STM32G491RET6-ND', sourceUrl:'https://www.digikey.com/en/products/detail/stmicroelectronics/STM32G491RET6/13592591' };
const message = { operation:'st-options', part, parentId:fixture.parentId };
const response = data => new Response(JSON.stringify(data), {headers:{'content-type':'application/json'}});
const fetchFixture = async url => response(url.includes('productsByParentId') ? fixture.products : fixture.attributes[new URL(url).searchParams.get('prmisId')]);
const report = (observations, checkedAt = new Date().toISOString()) => O.make(part, fixture.parentId, fixture.products,
  observations || fixture.products.map(p => ({productId:p.prmis_id, attributes:fixture.attributes[p.prmis_id], checkedAt})), checkedAt);
const page = () => ({querySelector:selector => selector.includes('data-product-id') ? {getAttribute:()=>fixture.parentId} :
  {textContent:({'5080':'Country of Origin','4363':'Package','1069':'Packing Type','960':'Operating temperature (°C)','962':'Operating Temperature (°C) (max)'})[selector.match(/"(\d+)"/)?.[1]]}});

test('live-captured family enumerates every ordering code and compares explicit package, packing and temperature fields', async () => {
  const result = await N.run(message,'',fetchFixture), rows = O.comparison(result,part);
  assert.equal(rows.length,7); assert.equal(rows[0].mpn,part.mpn); assert.equal(rows[0].current,true);
  assert.deepEqual(rows[0].package.values,['LQFP 64 10x10x1.4 mm']);
  assert.deepEqual(rows[0].temperatureMin.values,['-40']); assert.deepEqual(rows[0].temperatureMax.values,['85']);
  assert.deepEqual(rows.filter(r=>r.group==='packing').map(r=>r.mpn),['STM32G491RET6TR']);
  assert.deepEqual(rows.filter(r=>r.group==='temperature').map(r=>r.mpn),['STM32G491RET3','STM32G491RET3TR']);
  assert.equal(rows.filter(r=>r.group==='package').length,3);
  const highTemp=rows.find(r=>r.mpn==='STM32G491RET3TR');
  assert.equal(highTemp.changes.temperature,'different'); assert.equal(highTemp.changes.packing,'different');
  assert.deepEqual(highTemp.temperatureMax.values,['125']);
  assert.ok(rows.every(r=>r.origin.values[0]==='TAIWAN'));
  const reelPart={...part,mpn:'STM32G491RET6TR'};
  assert.equal(O.comparison(result,reelPart)[0].mpn,reelPart.mpn);
  assert.equal(O.comparison(result,reelPart).find(r=>r.mpn===part.mpn).group,'packing');
});

test('family membership, exact current code, unique CP mappings and page column labels are mandatory', async () => {
  assert.equal(O.parent(page()),fixture.parentId);
  for(const id of ['4363','1069','960','962']) {
    const original=page().querySelector;
    assert.throws(()=>O.parent({querySelector:s=>s.includes(`"${id}"`)?{textContent:'Changed field'}:original(s)}),e=>e.code==='schema');
  }
  for(const products of [
    fixture.products.slice(1), [...fixture.products,fixture.products[0]],
    fixture.products.map((p,i)=>i?{...p,prmis_id:fixture.products[0].prmis_id}:p),
    fixture.products.map((p,i)=>i?{...p,parent_id:'PF999'}:p),
    fixture.products.map((p,i)=>i?{...p,item_name:'STM32G491VET6'}:p)
  ]) {
    let calls=0;
    await assert.rejects(()=>N.run(message,'',async()=>{calls++;return response(products);}));
    assert.equal(calls,1);
  }
  const calls=[];
  await O.lookup(part,async (op,extra)=>{calls.push({op,...extra});return op==='st-family'?{html:'page'}:report();},()=>page());
  assert.deepEqual(calls,[{op:'st-family'},{op:'st-options',parentId:fixture.parentId}]);
});

test('requests use only observed CP identifiers, GET without credentials, and at most three attribute requests concurrently', async () => {
  let active=0,max=0;const urls=[];
  const result=await N.run(message,'',async(url,options)=>{
    assert.equal(options.method,'GET'); assert.equal(options.credentials,'omit'); assert.equal(options.redirect,'error');
    assert.equal(new URL(url).origin,'https://ksmk.st.com');urls.push(url);
    if(url.includes('productsByParentId'))return response(fixture.products);
    active++;max=Math.max(max,active);
    await new Promise(resolve=>setImmediate(resolve));active--;
    return fetchFixture(url);
  });
  assert.equal(urls.length,8);assert.equal(max,3);
  assert.deepEqual(new Set(urls.slice(1).map(u=>new URL(u).searchParams.get('prmisId'))),new Set(fixture.products.map(p=>p.prmis_id)));
  assert.equal(result.products.length,7);
});

test('partial failures preserve all codes without inventing missing fields or borrowing another variant origin', async () => {
  const result=await N.run(message,'',async url=>{
    const cp=new URL(url).searchParams.get('prmisId');
    if(cp==='CP536364')return new Response('Unavailable',{status:503});
    if(cp==='CP542254')return response(fixture.attributes[cp].filter(a=>a.attribute_name!=='962'));
    if(cp==='CP531383')return response(fixture.attributes[cp].map(a=>({...a,attribute_value:a.attribute_name==='5080'?'MALAYSIA':a.attribute_value})));
    return fetchFixture(url);
  });
  const rows=O.comparison(result,part);
  assert.equal(rows.length,7);assert.equal(rows.find(r=>r.mpn==='STM32G491RET6TR').group,'other');
  assert.deepEqual(rows.find(r=>r.mpn==='STM32G491RET6TR').origin.values,[]);
  assert.equal(rows.find(r=>r.mpn==='STM32G491RET3').changes.temperature,'unknown');
  assert.equal(rows.find(r=>r.mpn==='STM32G491REI6').changes.origin,'different');
  assert.deepEqual(rows[0].origin.values,['TAIWAN']);
  const corrupted=structuredClone(result);
  corrupted.observations[0].attributes[0].prmis_id='CP999';
  assert.throws(()=>O.rows(corrupted,part));
  assert.throws(()=>O.rows({...result,observations:result.observations.slice(1)},part));
});

test('rate limits stop queued requests, cancellation rejects, and oversized families are explicit rather than silently truncated',async()=>{
  let calls=0;
  const limited=await N.run(message,'',async url=>{
    if(url.includes('productsByParentId'))return response(fixture.products);
    calls++;return new Response('Rate limited',{status:429});
  });
  assert.ok(calls<=3);assert.equal(O.rows(limited,part).filter(r=>r.error).length,7);
  const controller=new AbortController();calls=0;
  await assert.rejects(()=>N.run(message,'',async url=>{
    if(url.includes('productsByParentId'))return response(fixture.products);
    calls++;controller.abort();throw controller.signal.reason;
  },{signal:controller.signal}),e=>e.name==='AbortError');
  assert.equal(calls,1);
  await assert.rejects(()=>N.run(message,'',async()=>response([fixture.products[0],...Array.from({length:64},(_,i)=>({
    item_name:`STM32G491RET${i}TR`,prmis_id:`CP${100+i}`,parent_id:fixture.parentId
  }))])),/more than 64/);
});

test('family cache is shared across distributors and sibling codes, but cannot become an exact-part source or cross a family',()=>{
  const result=report(),entries={[O.key(part)]:result},time=Date.parse(result.checkedAt);
  const sibling={...part,provider:'mouser',host:'www.mouser.com',mpn:'STM32G491REI3'};
  assert.equal(O.saved(entries,sibling,time).report,result);
  assert.equal(O.saved(entries,part,time+C.CACHE_TTL).stale,true);
  assert.equal(O.saved(entries,part,time+C.CACHE_RETENTION),null);
  assert.equal(O.saved(entries,part,time-1),null);
  assert.equal(O.saved(entries,{...part,mpn:'STM32G491RET9'},time),null);
  assert.equal(O.saved(entries,{...part,mpn:'STM32G491VET6'},time),null);
  assert.equal(O.saved(entries,{...part,manufacturer:'Other'},time),null);
  assert.equal(O.saved({[O.key(part)]:{...result,sourceUrl:'https://example.com/'}},part,time),null);
  assert.equal(C.savedSource(entries,'st',part,time),null);
  const partial=structuredClone(result);
  partial.observations[1]={productId:partial.observations[1].productId,checkedAt:result.checkedAt,attributes:[],error:'Unavailable'};
  assert.equal(O.saved({[O.key(part)]:partial},part,time+5*60_000).stale,true);
  assert.equal(O.saved({[O.key(part)]:{...result,observations:[...result.observations.slice(1),result.observations[1]]}},part,time),null);
});
