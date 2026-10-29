const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const C = require('../core.js'), R = require('../results.js'), N = require('../network.js');
const fixture = require('./fixtures/digikey-results-rows.json');
const escape = text => String(text).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
function markup(rows = fixture.rows) {
  return '<html><head></head><body><nav class="MuiBreadcrumbs-root">'+fixture.categories.map(c=>`<a href="${c.href}">${escape(c.label)}</a>`).join('')+'</nav><table><thead><tr><th>Part</th></tr></thead><tbody>'+rows.map(r=>`<tr><td><span ${Object.entries(r.data).map(([k,v])=>`${k}="${escape(v)}"`).join(' ')}></span><div data-atag="tr-product"><a data-testid="data-table-product-number" data-product-id="${r.productId}" href="${escape(r.href)}">${escape(r.mpn)}</a><a data-testid="data-table-mfr-link">${escape(r.manufacturer)}</a></div></td></tr>`).join('')+'</tbody></table></body></html>';
}
function report(part, country, assembly = '', provider = 'mouser') {
  if(provider==='digikey')return C.fromDigiKey({manufacturer:part.manufacturer,manufacturerPartNumber:part.mpn,digiKeyPartNumber:part.sku,countryOfOrigin:country},part);
  return C.fromMouserApi({Errors:[],SearchResults:{NumberOfResult:1,Parts:[{Manufacturer:part.manufacturer,ManufacturerPartNumber:part.mpn,MouserPartNumber:'TEST-'+part.mpn,ProductDetailUrl:'https://www.mouser.com/en/ProductDetail/Test/'+encodeURIComponent(part.mpn),TradeCompliance:[{ComplianceName:'Country of Origin',ComplianceValue:country},{ComplianceName:'Assembly Country of Origin',ComplianceValue:assembly}]}]}},part);
}
const savedEntry = result => {const key=C.sourceCacheKey(result.identity.provider,result.identity);return {[key]:{key,result}};};
const pause = () => new Promise(resolve=>setTimeout(resolve,15));

test('result identity parser matches all captured rows and rejects ambiguous or mismatched identity',()=>{
  const {document}=parseHTML(markup());
  const rows=R.readRows(document,fixture.url);
  assert.equal(rows.length,fixture.rows.length);
  assert.ok(rows.every(r=>r.part.componentType==='connectors'&&r.part.sku&&r.part.sourceUrl));
  const first=rows[0]; first.row.querySelector('[data-mfg-number]').setAttribute('data-mfg-number','WRONG');
  assert.equal(R.readRows(document,fixture.url).length,rows.length-1);
  first.row.querySelector('[data-mfg-number]').setAttribute('data-mfg-number',first.part.mpn);
  first.row.querySelector('[data-testid="data-table-product-number"]').setAttribute('href',first.part.sourceUrl.replace(/\d+$/,'999'));
  assert.equal(R.readRows(document,fixture.url).length,rows.length-1);
  assert.deepEqual(R.readRows(document,'https://www.digikey.com/account/'),[]);
});

test('any-stage filtering includes assembly, preserves conflicting sources, and keeps unknowns explicit',()=>{
  const part=R.readRows(parseHTML(markup()).document,fixture.url)[0].part;
  const states={digikey:{result:report(part,'Thailand','','digikey')},mouser:{result:report(part,'Italy','China')}};
  const facts=R.facts(part,states);
  assert.deepEqual(facts.map(f=>f.countries),[['Thailand'],['Italy'],['China']]);
  assert.equal(R.matches(facts,{mode:'include',country:'CN'}),true);
  assert.equal(R.matches(facts,{mode:'exclude',country:'China'}),false);
  assert.equal(R.matches(R.facts(part,states,'declaredCoo'),{mode:'exclude',country:'China'}),true);
  assert.equal(R.matches([],{mode:'exclude',country:'China'}),true);
  assert.equal(R.matches([],{mode:'exclude',country:'China',keepUnknown:false}),false);
  assert.equal(R.matches([{countries:['China'],filterable:false}],{mode:'include',country:'China',keepUnknown:false}),false);
});

test('reviewed ST assembly routes participate only in applicable stage filters',()=>{
  const part={manufacturer:'STMicroelectronics',mpn:'STM32G491RET6'};
  assert.equal(R.matches(R.facts(part,{}),{mode:'exclude',country:'China'}),false);
  assert.equal(R.facts(part,{},'declaredCoo').length,0);
  assert.equal(R.facts({...part,mpn:'STM32G491REI6'},{}).length,0);
});

function harness(initial={}, reply=async()=>({ok:false,code:'api-unconfigured',message:'API not configured'})) {
  const {document,window}=parseHTML(markup(fixture.rows.slice(0,3)));
  // linkedom does not implement the browser's writable select.value property.
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||this.querySelector('option')?.value||'';},set(value){for(const o of this.querySelectorAll('option'))o.toggleAttribute('selected',o.value===value);}});
  const values={listViewEnabled:true,...initial},listeners=[],calls=[]; let observer;
  const notify=changes=>listeners.forEach(f=>f(changes,'local'));
  const storage={onChanged:{addListener:f=>listeners.push(f)},local:{
    get:async()=>({...values}),set:async next=>{const changes={};for(const [key,v]of Object.entries(next)){changes[key]={newValue:v,oldValue:values[key]};values[key]=v;}notify(changes);},
    remove:async keys=>{const changes={};for(const key of keys){changes[key]={oldValue:values[key]};delete values[key];}notify(changes);}
  }};
  const events={};
  const context={OriginLens:C,OriginLensResults:R,document,location:{href:fixture.url},window:{addEventListener:(name,f)=>events[name]=f},
    chrome:{storage,runtime:{sendMessage:async message=>{calls.push(message);return reply(message);}}},
    getComputedStyle:()=>({backgroundColor:'rgb(255, 255, 255)'}),
    MutationObserver:class{constructor(f){observer=f;}observe(){}disconnect(){}},
    setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,2)),clearTimeout,URL,Intl};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../results-content.js'),'utf8'),context);
  return {document,window,storage,calls,context,mutate:()=>observer([{target:document.body,type:'characterData'}]),
    root:()=>document.getElementById('origin-lens-results')?.shadowRoot,
    change(node,value){if(node.type==='checkbox'||node.type==='radio')node.checked=value;else node.value=value;node.dispatchEvent(new window.Event('change'));}};
}

test('cached rows filter reversibly, source updates arrive across tabs, and Off restores every row',async()=>{
  const rows=R.readRows(parseHTML(markup()).document,fixture.url);
  const page=harness({...savedEntry(report(rows[0].part,'Italy','China')),...savedEntry(report(rows[1].part,'Taiwan'))});
  await pause(); const root=page.root();assert.ok(root);
  assert.equal(page.calls.length,0,'opening a results page must not launch a batch');
  const rowRoots=[...page.document.querySelectorAll('[data-origin-lens-row]')].map(n=>n.shadowRoot.querySelector('section').textContent);
  assert.match(rowRoots[0],/Italy/);assert.match(rowRoots[0],/China/);
  page.change(root.querySelector('#origin-mode-exclude'),true);
  assert.equal(page.document.querySelectorAll('[data-origin-lens-hidden]').length,1);
  page.change(root.querySelector('#origin-unknown'),false);
  assert.equal(page.document.querySelectorAll('[data-origin-lens-hidden]').length,2);
  await page.storage.local.set(savedEntry(report(rows[2].part,'Malaysia')));
  assert.equal(page.document.querySelectorAll('[data-origin-lens-hidden]').length,1);
  page.change(root.querySelector('#origin-mode-all'),true);
  assert.equal(page.document.querySelectorAll('[data-origin-lens-hidden]').length,0);
  page.change(root.querySelector('#origin-mode-exclude'),true);
  await page.storage.local.set({enabled:false});
  assert.equal(page.document.querySelectorAll('[data-origin-lens-hidden]').length,0);
  assert.equal(page.document.querySelectorAll('[data-origin-lens-row]').length,0);
  assert.equal(page.root(),undefined);
});

test('checking a page uses existing providers, caches results, and does not scan newly navigated pages',async()=>{
  const page=harness({},async message=>({ok:true,data:report(message.part,message.operation==='digikey'?'Taiwan':'Italy',message.operation==='mouser-api'?'China':'',message.operation==='digikey'?'digikey':'mouser')}));
  await pause();page.root().querySelector('button').click();
  await pause();await pause();
  assert.equal(page.calls.length,6);
  assert.equal(new Set(page.calls.map(c=>c.part.sku)).size,3);
  assert.match(page.root().querySelector('section').textContent,/Checked 3 of 3/);
  assert.match(page.document.querySelector('[data-origin-lens-row]').shadowRoot.querySelector('section').textContent,/China/);
  page.context.location.href=fixture.url+'?page=2';page.mutate();await pause();
  assert.equal(page.calls.length,6);
  assert.equal(page.root().querySelector('#origin-mode-all').checked,true);
});

test('a report arriving from another tab survives a failed, empty or older pending lookup',async()=>{
  for(const outcome of ['failed','empty','older']) {
    let release;const gate=new Promise(resolve=>release=resolve);
    const part=R.readRows(parseHTML(markup()).document,fixture.url)[0].part;
    const older=report(part,'China','','digikey');
    older.checkedAt=new Date(Date.now()-60000).toISOString();
    const page=harness({},async message=>{
      if(message.operation!=='digikey')return {ok:false,code:'api-unconfigured',message:'API not configured'};
      await gate;
      return outcome==='failed'?{ok:false,code:'network',message:'Source unavailable'}
        :{ok:true,data:outcome==='empty'?report(part,'','','digikey'):older};
    });
    [...page.document.querySelectorAll('tbody tr')].slice(1).forEach(row=>row.remove());
    await pause();page.root().querySelector('button').click();await pause();
    const latest=report(part,'Taiwan','','digikey');
    await page.storage.local.set(savedEntry(latest));
    release();await pause();
    const text=page.document.querySelector('[data-origin-lens-row]').shadowRoot.querySelector('section').textContent;
    assert.match(text,/Taiwan/,outcome);
    assert.doesNotMatch(text,/Origin unavailable|OriginChina/,outcome);
    assert.equal((await page.storage.local.get(null))[C.sourceCacheKey('digikey',part)].result.checkedAt,latest.checkedAt);
    page.change(page.root().querySelector('#origin-mode-include'),true);
    page.change(page.root().querySelector('#origin-country'),'Taiwan');
    assert.equal(page.document.querySelectorAll('[data-origin-lens-hidden]').length,0);
  }
});

test('a failed pending lookup cannot resurrect a report removed by Clear cache',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);
  const part=R.readRows(parseHTML(markup()).document,fixture.url)[0].part;
  const cached=report(part,'China','','digikey');
  cached.checkedAt=new Date(Date.now()-C.CACHE_TTL-1000).toISOString();
  const page=harness(savedEntry(cached),async()=>{await gate;return {ok:false,code:'network',message:'Source unavailable'};});
  [...page.document.querySelectorAll('tbody tr')].slice(1).forEach(row=>row.remove());
  await pause();page.root().querySelector('button').click();await pause();
  await page.storage.local.remove(Object.keys(savedEntry(cached)));
  release();await pause();
  const body=page.document.querySelector('[data-origin-lens-row]').shadowRoot.querySelector('section');
  assert.doesNotMatch(body.textContent,/China/);
  assert.equal(body.querySelector('dl'),null);
});

test('stop and disable discard late responses; blocked providers are not retried for every row',async()=>{
  for(const key of ['enabled','listViewEnabled']) {
  let release;const gate=new Promise(resolve=>release=resolve);
  const page=harness({},async message=>{await gate;return {ok:true,data:report(message.part,'China','',message.operation==='digikey'?'digikey':'mouser')};});
  await pause();page.root().querySelector('button').click();await pause();
  await page.storage.local.set({[key]:false});release();await pause();
  assert.equal(page.calls.length,2);assert.equal(page.root(),undefined);
  assert.equal(Object.keys(await page.storage.local.get(null)).some(k=>k.startsWith(C.CACHE_PREFIX)),false);
  }
  const blocked=harness();await pause();blocked.root().querySelector('button').click();await pause();await pause();
  assert.equal(blocked.calls.length,2);
  assert.match(blocked.document.querySelector('[data-origin-lens-row]').shadowRoot.querySelector('section').textContent,/API not configured/);
});

test('list view can start disabled and hide or restore cached rows without starting scans',async()=>{
  const part=R.readRows(parseHTML(markup()).document,fixture.url)[0].part;
  for(const preference of [undefined,false]) {
  const page=harness({listViewEnabled:preference,...savedEntry(report(part,'Italy','China'))});await pause();
  assert.equal(page.root(),undefined);assert.equal(page.calls.length,0);
  await page.storage.local.set({listViewEnabled:true});
  assert.match(page.document.querySelector('[data-origin-lens-row]').shadowRoot.querySelector('section').textContent,/China/);
  page.change(page.root().querySelector('#origin-mode-exclude'),true);
  assert.equal(page.document.querySelectorAll('[data-origin-lens-hidden]').length,1);
  await page.storage.local.set({listViewEnabled:false});
  assert.equal(page.root(),undefined);assert.equal(page.document.querySelectorAll('[data-origin-lens-hidden]').length,0);
  assert.equal(page.document.querySelectorAll('[data-origin-lens-row]').length,0);
  await page.storage.local.set({listViewEnabled:true});
  assert.ok(page.root());assert.equal(page.calls.length,0);
  }
});

test('worker list-view Off aborts only results requests and leaves the same product request running',async()=>{
  const part=R.readRows(parseHTML(markup()).document,fixture.url)[0].part;
  let listener,changed;const settings={},pending=[];
  const context={importScripts:()=>{},OriginLens:C,OriginLensNetwork:{...N,run:(_message,_list,_fetch,{signal})=>new Promise((resolve,reject)=>{
    pending.push({signal,resolve});signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
  })},URL,AbortController,AbortSignal,chrome:{runtime:{id:'extension',onMessage:{addListener:f=>listener=f}},
    storage:{onChanged:{addListener:f=>changed=f},local:{get:async()=>({...settings})}}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../background.js'),'utf8'),context);
  const sender={id:'extension',frameId:0,tab:{id:1},url:fixture.url};
  const ask=url=>new Promise(resolve=>listener({type:'origin-lens:lookup',operation:'digikey',part},{...sender,url},resolve));
  assert.equal((await ask(fixture.url)).code,'disabled');assert.equal(pending.length,0);
  settings.listViewEnabled=true;changed({listViewEnabled:{newValue:true}},'local');
  const table=ask(fixture.url),product=ask(part.sourceUrl);await pause();
  assert.equal(pending.length,2);
  settings.listViewEnabled=false;changed({listViewEnabled:{newValue:false}},'local');
  assert.equal(pending[0].signal.aborted,true);assert.equal(pending[1].signal.aborted,false);
  assert.equal((await table).ok,false);assert.equal((await ask(fixture.url)).code,'disabled');assert.equal(pending.length,2);
  pending[1].resolve(report(part,'China','','digikey'));assert.equal((await product).ok,true);
  settings.listViewEnabled=true;changed({listViewEnabled:{newValue:true}},'local');
  const resumed=ask(fixture.url);await pause();assert.equal(pending.length,3);
  pending[2].resolve(report(part,'China','','digikey'));assert.equal((await resumed).ok,true);
});

test('late lookup responses cannot attach to a reused result row, even before the observer runs',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);
  const page=harness({},async message=>{await gate;return {ok:true,data:report(message.part,'China','',message.operation==='digikey'?'digikey':'mouser')};});
  await pause();page.root().querySelector('button').click();await pause();
  page.document.querySelector('[data-mfg-number]').setAttribute('data-mfg-number','A-DIFFERENT-PART');
  release();await pause();
  const values=await page.storage.local.get(null);
  const first=fixture.rows[0].mpn;
  assert.equal(Object.values(values).some(entry=>entry?.result?.identity.mpn===first),false);
  await page.storage.local.set({enabled:false});
});

test('replacing result rows reapplies the filter once, and Clear cache makes unknown rows visible',async()=>{
  const part=R.readRows(parseHTML(markup()).document,fixture.url)[0].part;
  const cached=report(part,'Italy','China'),page=harness(savedEntry(cached));await pause();
  page.change(page.root().querySelector('#origin-mode-exclude'),true);
  const old=page.document.querySelector('tbody tr'),clone=old.cloneNode(true);
  clone.querySelector('[data-origin-lens-row]').remove();old.replaceWith(clone);page.mutate();await pause();
  assert.equal(page.document.querySelectorAll('[data-origin-lens-row]').length,3);
  assert.equal(page.document.querySelectorAll('#origin-lens-results').length,1);
  assert.equal(page.document.querySelectorAll('[data-origin-lens-hidden]').length,1);
  await page.storage.local.remove(Object.keys(savedEntry(cached)));
  assert.equal(page.document.querySelectorAll('[data-origin-lens-hidden]').length,0);
});

test('results-page worker accepts bounded source operations but rejects unrelated senders and lookup types',async()=>{
  const part=R.readRows(parseHTML(markup()).document,fixture.url)[0].part;
  let listener,requests=0;
  const context={importScripts:()=>{},OriginLens:C,OriginLensNetwork:{...N,run:async()=>{requests++;return report(part,'China','','digikey');}},URL,AbortController,AbortSignal,
    chrome:{runtime:{id:'extension',onMessage:{addListener:f=>listener=f}},storage:{onChanged:{addListener:()=>{}},local:{get:async()=>({listViewEnabled:true})}}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../background.js'),'utf8'),context);
  const sender={id:'extension',frameId:0,tab:{id:1},url:fixture.url};
  const message={type:'origin-lens:lookup',operation:'digikey',part};
  const ask=m=>new Promise(resolve=>assert.equal(listener(m,sender,resolve),true));
  assert.equal((await ask(message)).ok,true);assert.equal(requests,1);
  for(const operation of ['lcsc-ocr','st-options','mouser-product'])assert.equal((await ask({...message,operation})).code,'request');
  assert.equal((await ask({...message,part:{...part,provider:'mouser',host:'www.mouser.com',sourceUrl:'https://www.mouser.com/en/ProductDetail/Test/X'}})).code,'request');
  for(const url of ['https://www.digikey.com/account/','https://www.digikey.com/en/products/result-evil','https://evil.test/en/products/result'])assert.equal(listener(message,{...sender,url},()=>{}),false);
  assert.equal(requests,1);
});
