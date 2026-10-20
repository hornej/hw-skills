const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../core.js');
const N = require('../network.js');
const O = require('../st-options.js');
const script = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const part = {provider:'mouser',host:'www.mouser.com',manufacturer:'onsemi',mpn:'FUSB302BMPX',sku:'512-FUSB302BMPX',sourceUrl:'https://www.mouser.com/en/ProductDetail/onsemi/FUSB302BMPX?qs=example'};

function storage(initial = {}) {
  const values = {...initial}, listeners = [];
  return {values,onChanged:{addListener:fn=>listeners.push(fn)},local:{
    get:async keys=>keys===null?{...values}:Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,values[k]])),
    set:async next=>{const changes={};for(const [k,v] of Object.entries(next)){changes[k]={oldValue:values[k],newValue:v};values[k]=v;}listeners.forEach(fn=>fn(changes,'local'));},
    remove:async keys=>{for(const k of Array.isArray(keys)?keys:[keys])delete values[k];}
  }};
}

function popupHarness(saved) {
  const nodes=[];
  class Element {
    constructor(id=''){this.id=id;this.children=[];this.events={};this.attributes={};this.checked=false;nodes.push(this);}
    append(...children){this.children.push(...children);}
    setAttribute(key,value){this.attributes[key]=value;}
    addEventListener(name,fn){this.events[name]=fn;}
  }
  for(const id of ['status','enabled','component-types','enabled-state','enabled-hint','type-options','clear'])new Element(id);
  const document={getElementById:id=>nodes.find(n=>n.id===id),createElement:()=>new Element()};
  vm.runInNewContext(script('popup.js'),{OriginLens:C,document,chrome:{storage:saved}});
  return {get:document.getElementById,change:async(id,checked)=>{const input=document.getElementById(id);input.checked=checked;await input.events.change();}};
}

test('popup saves independent type choices while the master is off and restores them on reopening',async()=>{
  const saved=storage(),popup=popupHarness(saved);await settle();
  assert.equal(popup.get('type-passives').checked,false);assert.equal(popup.get('type-ics').checked,true);
  await popup.change('enabled',false);await popup.change('type-passives',true);await popup.change('type-ics',false);
  assert.equal(saved.values.enabled,false);assert.equal(saved.values[C.typeKey('passives')],true);assert.equal(saved.values[C.typeKey('ics')],false);
  const reopened=popupHarness(saved);await settle();
  assert.equal(reopened.get('enabled').checked,false);assert.equal(reopened.get('type-passives').checked,true);assert.equal(reopened.get('type-ics').checked,false);
  await reopened.change('enabled',true);
  assert.equal(popup.get('enabled').checked,true);assert.equal(reopened.get('type-ics').checked,false);
});

test('popup rolls back a failed save and reflects category changes from another popup',async()=>{
  const saved=storage(),popup=popupHarness(saved);await settle();
  const originalSet=saved.local.set;saved.local.set=async()=>{throw new Error('Storage failed');};
  await popup.change('type-passives',true);
  assert.equal(popup.get('type-passives').checked,false);assert.equal(popup.get('type-passives').disabled,false);
  assert.match(popup.get('status').textContent,/could not be saved/);
  saved.local.set=originalSet;await saved.local.set({[C.typeKey('passives')]:true});
  assert.equal(popup.get('type-passives').checked,true);
});

test('worker rejects requests while off and resumes after enabling, including a fresh worker',async()=>{
  const saved = storage({enabled:false,digikeyListId:'EXAMPLE'});
  let calls=0,listener;
  const run = () => vm.runInNewContext(script('background.js'),{
    OriginLens:C,OriginLensNetwork:N,importScripts:()=>{},URL,AbortController,AbortSignal,
    fetch:async()=>{calls++;return new Response(JSON.stringify({manufacturer:'onsemi',manufacturerPartNumber:part.mpn,digiKeyPartNumber:'FUSB302BMPXTR-ND',countryOfOrigin:'Thailand',partDetailUrl:'https://www.digikey.com/en/products/detail/onsemi/FUSB302BMPX/6138869'}),{headers:{'content-type':'application/json'}});},
    chrome:{storage:saved,runtime:{id:'extension',onMessage:{addListener:fn=>{listener=fn;}}}}
  });
  const request=()=>new Promise(resolve=>listener({type:'origin-lens:lookup',operation:'digikey',part},{id:'extension',frameId:0,tab:{id:1},url:part.sourceUrl},resolve));
  run(); assert.equal((await request()).code,'disabled'); assert.equal(calls,0);
  await saved.local.set({enabled:true}); assert.equal((await request()).ok,true); assert.equal(calls,1);
  await saved.local.set({enabled:false}); run(); assert.equal((await request()).code,'disabled'); assert.equal(calls,1);
});

test('switching off aborts an active worker request and prevents follow-up requests',async()=>{
  const saved=storage();let listener,calls=0,signal;
  vm.runInNewContext(script('background.js'),{
    OriginLens:C,OriginLensNetwork:N,importScripts:()=>{},URL,AbortController,AbortSignal,
    fetch:async(url,options)=>{calls++;signal=options.signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));},
    chrome:{storage:saved,runtime:{id:'extension',onMessage:{addListener:fn=>{listener=fn;}}}}
  });
  const pending=new Promise(resolve=>listener({type:'origin-lens:lookup',operation:'digikey',part},{id:'extension',frameId:0,tab:{id:1},url:part.sourceUrl},resolve));
  await settle();assert.equal(calls,1);assert.equal(signal.aborted,false);
  await saved.local.set({enabled:false});assert.equal(signal.aborted,true);
  assert.equal((await pending).ok,false);assert.equal(calls,1);
});

function pageHarness(saved, selectedPart=part, selectedType='other', reply=()=>({ok:false,code:'auth',message:'Test source unavailable'}), coreOverrides={}, apiReply=null, optionsOverrides={}) {
  const panels=[], events={};let messages=0,apiMessages=0,fetches=0,observing=false,fetchSignal;
  class Node {
    constructor(){this.children=[];this.isConnected=false;this.events={};}
    append(n){this.children.push(n);}
    setAttribute(){}
    addEventListener(name,fn){this.events[name]=fn;}
    attachShadow(){this.shadowRoot=new Node();return this.shadowRoot;}
    replaceChildren(){this.children=[];}
    remove(){this.isConnected=false;}
    insertAdjacentElement(where,node){node.isConnected=true;panels.push(node);}
  }
  const anchor=new Node();
  const document={documentElement:{},body:{prepend:n=>anchor.insertAdjacentElement('',n)},createElement:tag=>{const n=new Node();n.tagName=tag;n.style={};return n;},getElementById:()=>anchor,querySelector:()=>({closest:()=>anchor}),querySelectorAll:()=>[]};
  vm.runInNewContext(script('content.js'),{
    OriginLensOptions:{...O,...optionsOverrides},OriginLensOCR:require('../ocr.js'),OriginLens:{...C,...coreOverrides,readIdentity:()=>selectedPart,readComponentType:()=>selectedType},document,location:{href:selectedPart.sourceUrl},
    window:{addEventListener:(event,fn)=>{events[event]=fn;}},
    MutationObserver:class{observe(){observing=true;}disconnect(){observing=false;}},
    setTimeout,clearTimeout,AbortController,AbortSignal,
    fetch:async(url,options)=>{fetches++;fetchSignal=options.signal;return new Promise((resolve,reject)=>fetchSignal.addEventListener('abort',()=>reject(fetchSignal.reason),{once:true}));},
    chrome:{storage:saved,runtime:{sendMessage:async message=>{
      // Existing website/cache scenarios model a browser with no API key.
      if(message.operation==='mouser-api'){apiMessages++;return apiReply?apiReply(message):{ok:false,code:'api-unconfigured'};}
      messages++;return reply(message);
    }}}
  });
  const walk=n=>[n,...(n.shadowRoot?walk(n.shadowRoot):[]),...n.children.flatMap(walk)];
  return {nodes:()=>panels.filter(n=>n.isConnected).flatMap(walk),panelCount:()=>panels.filter(n=>n.isConnected).length,messages:()=>messages,apiMessages:()=>apiMessages,fetches:()=>fetches,signal:()=>fetchSignal,observing:()=>observing,navigate:(type=selectedType)=>{selectedType=type;events.popstate();}};
}

const nexDk={provider:'digikey',host:'www.digikey.com',manufacturer:'Nexperia USA Inc.',mpn:'PSMN040-100MSEX',sku:'1727-1086-2-ND',sourceUrl:'https://www.digikey.com/en/products/detail/nexperia-usa-inc/PSMN040-100MSEX/4004849'};
const nexMouser={provider:'mouser',host:'www.mouser.com',manufacturer:'Nexperia',mpn:nexDk.mpn,sku:'771-PSMN040-100MSEX',sourceUrl:'https://www.mouser.com/en/ProductDetail/Nexperia/PSMN040-100MSEX?qs=example'};
function originRecord(identity,country,age=0){
  const result=identity.provider==='digikey'
    ? C.fromDigiKey({manufacturer:identity.manufacturer,manufacturerPartNumber:identity.mpn,digiKeyPartNumber:identity.sku,countryOfOrigin:country},identity)
    : C.fromMouser({querySelectorAll:()=>[{childNodes:[{nodeType:3,textContent:'Country of Origin:'}],nextElementSibling:{tagName:'DD',textContent:country}}]},identity);
  return {...result,checkedAt:new Date(Date.now()-age).toISOString()};
}
const savedEntry=result=>{const key=C.sourceCacheKey(result.identity.provider,result.identity);return {[key]:{key,result}};};
const pageText=page=>page.nodes().map(n=>n.textContent||'').join(' ');

test('collapse retains reports without new lookups; expand and hide remain independent',async()=>{
  const saved=storage({...savedEntry(originRecord(nexDk,'China')),...savedEntry(originRecord(nexMouser,'Philippines'))});
  const page=pageHarness(saved,nexDk,'discretes');
  await settle();
  const disclosure=page.nodes().find(n=>n.className==='panel-disclosure');
  const results=page.nodes().find(n=>n.className==='results');
  const hide=page.nodes().find(n=>n.className==='close');
  const requests=[page.messages(),page.apiMessages(),page.fetches()];
  assert.equal(disclosure.open,true);
  assert.equal(disclosure.children[0].tagName,'summary');
  assert.equal(disclosure.children[0].children.includes(hide),false);
  disclosure.open=false;disclosure.events.toggle();
  assert.equal(page.panelCount(),1);
  assert.equal(page.nodes().find(n=>n.className==='disclosure-action').textContent,'Expand');
  assert.equal(page.nodes().find(n=>n.className==='results'),results);
  assert.match(pageText(page),/China/);assert.match(pageText(page),/Philippines/);
  disclosure.open=true;disclosure.events.toggle();
  assert.equal(page.nodes().find(n=>n.className==='disclosure-action').textContent,'Collapse');
  assert.deepEqual([page.messages(),page.apiMessages(),page.fetches()],requests);
  hide.events.click();page.navigate();
  assert.equal(page.panelCount(),0);
  await saved.local.set({enabled:false});await saved.local.set({enabled:true});await settle();
  assert.equal(page.panelCount(),1);
  assert.equal(page.nodes().find(n=>n.className==='panel-disclosure').open,true);
});

test('collapsed state survives a panel remount without changing saved source reports',async()=>{
  const saved=storage({...savedEntry(originRecord(nexDk,'China'))});
  const page=pageHarness(saved,nexDk,'discretes');await settle();
  const disclosure=page.nodes().find(n=>n.className==='panel-disclosure');
  disclosure.open=false;disclosure.events.toggle();
  await saved.local.set({enabled:false});await saved.local.set({enabled:true});await settle();
  assert.equal(page.panelCount(),1);
  assert.equal(page.nodes().find(n=>n.className==='panel-disclosure').open,false);
  assert.equal(page.nodes().find(n=>n.className==='disclosure-action').textContent,'Expand');
  assert.match(pageText(page),/China/);
});

test('blocked Mouser fallback offers extension setup instead of a website sign-in loop',async()=>{
  const requests=[];
  const page=pageHarness(storage(),nexDk,'discretes',message=>{
    requests.push(message);
    return message.type==='origin-lens:open-mouser-settings'?{ok:true}:{ok:false,code:'auth',message:'Mouser requires sign-in or site verification. Open it normally, then retry.'};
  },{lookupDigiKey:async()=>originRecord(nexDk,'China')});
  await settle();
  assert.match(pageText(page),/Setup required/);assert.match(pageText(page),/No Search API key is saved/);
  assert.doesNotMatch(pageText(page),/Open it normally|Open source/);
  const button=page.nodes().find(n=>n.tagName==='button'&&n.textContent==='Configure Mouser');
  await button.events.click();
  assert.equal(requests.at(-1).type,'origin-lens:open-mouser-settings');
  assert.equal(button.disabled,false);
});

test('configured API populates and shares Mouser reports on either site, refreshes after key changes and honors Off',async()=>{
  const saved=storage(),report={...originRecord(nexMouser,'Philippines'),sourceKind:'Mouser Search API'};
  const apiReply=()=>({ok:true,data:report});
  const dkPage=pageHarness(saved,nexDk,'discretes',undefined,{lookupDigiKey:async()=>originRecord(nexDk,'China')},apiReply);
  await settle();assert.match(pageText(dkPage),/Mouser Search API/);assert.match(pageText(dkPage),/Philippines/);assert.equal(dkPage.messages(),0);assert.equal(dkPage.apiMessages(),1);
  const mouserPage=pageHarness(saved,nexMouser,'discretes',undefined,{},apiReply);await settle();
  assert.match(pageText(mouserPage),/Philippines/);assert.equal(mouserPage.apiMessages(),0);
  await saved.local.set({mouserApiRevision:'new-key'});await settle();assert.equal(mouserPage.apiMessages(),1);assert.equal(dkPage.apiMessages(),2);
  await saved.local.set({enabled:false});await saved.local.set({mouserApiRevision:'removed-key'});await settle();
  assert.equal(dkPage.panelCount()+mouserPage.panelCount(),0);assert.equal(dkPage.apiMessages(),2);
});

test('Microchip report appears beside both distributors and manufacturing-only reports stay cached',async()=>{
  const identity={...part,manufacturer:'Microchip Technology',mpn:'PIC10F200-E/MC',sku:'579-PIC10F200-E/MC',sourceUrl:'https://www.mouser.com/en/ProductDetail/Microchip-Technology/PIC10F200-E-MC?qs=example'};
  const report=C.fromMicrochip({totalRecords:1,totalPages:1,data:[{manufacturer:'Microchip Technology Inc.',part_number:identity.mpn,sku:identity.mpn,country_of_origin:'',assembly_country:'Thailand',wafer_fab_country:'United States of America'}]},identity);
  const saved=storage(),page=pageHarness(saved,identity,'ics',message=>message.operation==='microchip'?{ok:true,data:report}:{ok:false,code:'network',message:'Offline'});
  await settle();assert.match(pageText(page),/Microchip Product API/);assert.match(pageText(page),/Thailand/);assert.match(pageText(page),/United States of America/);
  assert.doesNotMatch(pageText(page),/No direct manufacturer adapter/);assert.ok(C.savedSource(saved.values,'microchip',identity));
});

test('Infineon regional declarations render and share on either distributor without presenting YY as a country',async()=>{
  const identity={...nexDk,manufacturer:'Infineon Technologies',mpn:'IRLML6344TRPBF'};
  const report=C.fromInfineon(require('./fixtures/infineon-irlml6344.json'),identity);
  const saved=storage();
  const page=pageHarness(saved,identity,'discretes',message=>message.operation==='infineon'?{ok:true,data:report}:{ok:false,code:'network',message:'Offline'});
  await settle();
  assert.match(pageText(page),/Infineon ECCN & HTS Finder/);assert.match(pageText(page),/Regional origin records/);
  assert.match(pageText(page),/All returned catalog regions/);assert.match(pageText(page),/Regions: US/);
  assert.match(pageText(page),/Unresolved \(YY\)/);assert.match(pageText(page),/United Kingdom/);
  assert.match(pageText(page),/origin is only confirmed at shipment/);
  assert.ok(C.savedSource(saved.values,'infineon',identity));
  const mouser=pageHarness(saved,{...nexMouser,manufacturer:identity.manufacturer,mpn:identity.mpn},'discretes');
  await settle();assert.match(pageText(mouser),/Regional origin records/);assert.match(pageText(mouser),/United Kingdom/);
  await saved.local.set({enabled:false});assert.equal(page.panelCount()+mouser.panelCount(),0);
});

test('reports learned on either distributor appear in both open pages despite failed cross-site requests',async()=>{
  const saved=storage(),dkResult=originRecord(nexDk,'China'),mouserResult=originRecord(nexMouser,'Philippines');
  const unavailable=()=>({ok:false,code:'auth',message:'Source verification required'});
  const dkPage=pageHarness(saved,nexDk,'discretes',unavailable,{lookupDigiKey:async()=>dkResult});
  await settle();assert.match(pageText(dkPage),/China/);assert.doesNotMatch(pageText(dkPage),/Philippines/);
  const calls=dkPage.messages();
  const mouserPage=pageHarness(saved,nexMouser,'discretes',unavailable,{fromMouser:()=>mouserResult});
  await settle();
  for(const page of [dkPage,mouserPage]){
    assert.match(pageText(page),/China/);assert.match(pageText(page),/Philippines/);assert.equal(page.panelCount(),1);
    assert.ok(page.nodes().some(n=>n.href===nexDk.sourceUrl));assert.ok(page.nodes().some(n=>n.href===nexMouser.sourceUrl));
  }
  assert.equal(dkPage.messages(),calls);assert.equal(mouserPage.messages(),0);
});

test('all three supported source reports are reusable from either distributor',async()=>{
  const dkPart={...nexDk,manufacturer:'STMicroelectronics',mpn:'STM32G491RET6',sku:'497-STM32G491RET6-ND',sourceUrl:'https://www.digikey.com/en/products/detail/stmicroelectronics/STM32G491RET6/13592591'};
  const mouserPart={...nexMouser,manufacturer:dkPart.manufacturer,mpn:dkPart.mpn,sku:'511-STM32G491RET6',sourceUrl:'https://www.mouser.com/en/ProductDetail/STMicroelectronics/STM32G491RET6?qs=example'};
  const dkResult=originRecord(dkPart,'Taiwan'),mouserResult=originRecord(mouserPart,'Malaysia');
  const stResult=C.fromST([{prmis_id:'CP531377',attribute_name:'5080',attribute_value:'Singapore'}],{item_name:dkPart.mpn,prmis_id:'CP531377',parent_id:'PF269474'},dkPart);
  const saved=storage({...savedEntry(dkResult),...savedEntry(mouserResult),...savedEntry(stResult)});
  const dkPage=pageHarness(saved,dkPart,'ics'),mouserPage=pageHarness(saved,mouserPart,'ics',undefined,{fromMouser:()=>mouserResult});
  await settle();
  for(const page of [dkPage,mouserPage]){
    for(const country of ['Taiwan','Malaysia','Singapore'])assert.ok(pageText(page).includes(country));
    // LCSC and the new, separately cached family comparison still need a lookup.
    assert.equal(page.nodes().filter(n=>n.className==='report').length,4);assert.equal(page.messages(),2);assert.equal(page.fetches(),0);
  }
});

test('LCSC photo evidence appears on both sites, stays outside the COO count and respects Off',async()=>{
  const dkPart={...nexDk,manufacturer:'STMicroelectronics',mpn:'STM32G491RET6',sku:'497-STM32G491RET6-ND',sourceUrl:'https://www.digikey.com/en/products/detail/stmicroelectronics/STM32G491RET6/13592591'};
  const mouserPart={...nexMouser,manufacturer:dkPart.manufacturer,mpn:dkPart.mpn,sku:'511-STM32G491RET6',sourceUrl:'https://www.mouser.com/en/ProductDetail/STMicroelectronics/STM32G491RET6'};
  const url='https://www.lcsc.com/product-detail/C3231005.html',image='https://assets.lcsc.com/images/lcsc/900x900/20230511_STMicroelectronics-STM32G491RET6_C3231005_blank.jpg';
  const product={'@type':'Product',mpn:dkPart.mpn,sku:'C3231005',brand:{name:'ST'},offers:{url},image:[image]};
  const report=C.fromLCSC({querySelectorAll:()=>[{textContent:JSON.stringify(product)}]},url,dkPart);
  report.photoEvidence.observation={...C.lcscReview(dkPart,[image])};
  const saved=storage({...savedEntry(originRecord(dkPart,'Taiwan')),...savedEntry(originRecord(mouserPart,'Taiwan')),...savedEntry(report)});
  const dkPage=pageHarness(saved,dkPart,'ics'),mouserPage=pageHarness(saved,mouserPart,'ics',undefined,{fromMouser:()=>originRecord(mouserPart,'Taiwan')});
  await settle();
  for(const page of [dkPage,mouserPage]){
    assert.match(pageText(page),/China · sample/);assert.match(pageText(page),/Reviewed marking CHN · assembly country of the photographed sample/);
    assert.match(pageText(page),/2 sources reporting origin · reference photos available/);
    assert.ok(page.nodes().some(n=>n.tagName==='img'&&n.src===image&&n.referrerPolicy==='no-referrer'));
  }
  const before=[dkPage.messages(),mouserPage.messages()];
  await saved.local.set({enabled:false});await settle();
  assert.equal(dkPage.panelCount()+mouserPage.panelCount(),0);
  assert.deepEqual([dkPage.messages(),mouserPage.messages()],before);
  const off=pageHarness(storage({enabled:false}),dkPart,'ics');await settle();assert.equal(off.messages(),0);assert.equal(off.panelCount(),0);
});

test('automatic markings render on both sites with raw text and stay separate from catalog COO',async()=>{
  const O=require('../ocr.js'),dk={...nexDk,manufacturer:'STMicroelectronics',mpn:'STM32F103C8T6'};
  const mouser={...nexMouser,manufacturer:dk.manufacturer,mpn:dk.mpn};
  const url='https://www.lcsc.com/product-detail/C8734.html',image='https://assets.lcsc.com/images/lcsc/900x900/20230221_STMicroelectronics-STM32F103C8T6_C8734_blank.jpg';
  const product={'@type':'Product',mpn:dk.mpn,sku:'C8734',brand:{name:'ST'},offers:{url},image:[image]};
  const result=C.fromLCSC({querySelectorAll:()=>[{textContent:JSON.stringify(product)}]},url,dk);
  const readings=[{imageUrl:image,sha256:'a'.repeat(64),passes:['gray','contrast'].map(variant=>({rotation:0,variant,text:'STM32F 103C8T6 MYS',words:[{text:'MYS',confidence:90}]}))}];
  result.photoEvidence.ocr={version:O.VERSION,engine:O.ENGINE,processedAt:new Date().toISOString(),readings,...O.summarize(readings,dk)};
  const saved=storage({...savedEntry(result)});
  for(const selected of [dk,mouser]){
    const page=pageHarness(saved,selected,'ics');await settle();
    assert.match(pageText(page),/Malaysia · auto-read/);
    assert.match(pageText(page),/Automatically read marking MYS/);
    assert.match(pageText(page),/processed on this device/);
    assert.match(pageText(page),/STM32F 103C8T6 MYS/);
    assert.match(pageText(page),/0 sources reporting origin · reference photos available/);
    assert.doesNotMatch(pageText(page),/Visual review/);
  }
  await saved.local.set({enabled:false});
});

test('failed refresh retains dated shared reports, uses known Mouser URL, and type/global off still suppress updates',async()=>{
  const dkResult=originRecord(nexDk,'China',2000),mouserResult=originRecord(nexMouser,'Philippines',2000);
  const saved=storage({...savedEntry(dkResult),...savedEntry(mouserResult)}),operations=[];
  const page=pageHarness(saved,nexDk,'discretes',message=>{operations.push(message);return {ok:false,code:'auth',message:'Site verification required'};},
    {lookupDigiKey:async()=>{throw new C.LookupError('network','Source offline');}});
  await settle();assert.equal(page.messages(),0);
  await page.nodes().find(n=>n.tagName==='button'&&n.textContent==='Refresh').events.click();await settle();
  assert.match(pageText(page),/China/);assert.match(pageText(page),/Philippines/);assert.match(pageText(page),/Latest check unavailable/);
  assert.equal(operations[0].operation,'mouser-product');assert.equal(operations[0].url,nexMouser.sourceUrl);
  assert.equal(Object.values(saved.values).find(e=>e?.result?.identity.provider==='mouser').result.checkedAt,mouserResult.checkedAt);
  await saved.local.set({enabled:false});await saved.local.set(savedEntry(originRecord(nexMouser,'Japan')));await settle();
  assert.equal(page.panelCount(),0);assert.equal(operations.length,1);
  await saved.local.set({enabled:true});await settle();assert.match(pageText(page),/Japan/);assert.match(pageText(page),/China/);
  await saved.local.set({[C.typeKey('discretes')]:false});await saved.local.set(savedEntry(originRecord(nexMouser,'Malaysia')));await settle();
  assert.equal(page.panelCount(),0);assert.equal(operations.length,1);
});

test('a source arriving during another lookup survives that lookup failing later',async()=>{
  const saved=storage();let release;
  const page=pageHarness(saved,nexMouser,'discretes',()=>new Promise(resolve=>{release=resolve;}));await settle();
  const result=originRecord(nexDk,'China');await saved.local.set(savedEntry(result));await settle();assert.match(pageText(page),/China/);
  release({ok:false,code:'auth',message:'Site verification required'});await settle();
  assert.match(pageText(page),/China/);assert.match(pageText(page),/Showing the saved report/);
});

test('old saved reports are labeled and updated; late initial reads do not lose reports from another tab',async()=>{
  const saved=storage();let release;
  const get=saved.local.get;saved.local.get=keys=>keys===null?new Promise(resolve=>{release=resolve;}):get(keys);
  const page=pageHarness(saved,nexMouser,'discretes');await settle();
  await saved.local.set(savedEntry(originRecord(nexDk,'China',C.CACHE_TTL+1000)));
  release({});await settle();
  assert.match(pageText(page),/China/);assert.match(pageText(page),/Last known/);assert.match(pageText(page),/Latest check unavailable/);
  assert.equal(page.messages(),1);
});

test('list recovery appears only for list-related DigiKey failures and disappears after a successful retry',async()=>{
  const saved=storage();let failure='no-list';
  const result=C.fromDigiKey({manufacturer:part.manufacturer,manufacturerPartNumber:part.mpn,digiKeyPartNumber:'FUSB302BMPXTR-ND',countryOfOrigin:'Thailand'},
    {...part,provider:'digikey',host:'www.digikey.com',sourceUrl:'https://www.digikey.com/en/products/detail/onsemi/FUSB302BMPX/6138869'});
  const page=pageHarness(saved,part,'ics',()=>failure?{ok:false,code:failure,message:'Source unavailable'}:{ok:true,data:result});
  const text=()=>page.nodes().map(n=>n.textContent||'').join(' ');
  await settle();assert.match(text(),/create an empty list/);assert.equal(page.nodes().filter(n=>n.tagName==='form').length,1);
  failure=null;
  await page.nodes().find(n=>n.tagName==='form').events.submit({preventDefault(){}});await settle();
  assert.match(text(),/Thailand/);assert.doesNotMatch(text(),/MyLists|list selection|empty list/);
  assert.equal(page.nodes().filter(n=>n.tagName==='form').length,0);
  assert.ok(!page.nodes().some(n=>n.href?.includes('/mylists/')));
});

test('authentication and network failures do not tell users to create lists; missing selections offer recovery',async()=>{
  for(const code of ['auth','network','rate','missing','settings']){
    const page=pageHarness(storage(),part,'ics',()=>({ok:false,code,message:'Source unavailable'}));await settle();
    const text=page.nodes().map(n=>n.textContent||'').join(' ');
    assert.doesNotMatch(text,/create an empty list/);
    assert.equal(page.nodes().filter(n=>n.tagName==='form').length,['missing','settings'].includes(code)?1:0);
    if(code==='auth')assert.match(text,/Sign in to DigiKey/);
  }
});

test('saved off state suppresses panels and lookups; toggles update two open pages immediately',async()=>{
  const saved=storage({enabled:false}),a=pageHarness(saved),b=pageHarness(saved);
  await settle();assert.equal(a.panelCount()+b.panelCount(),0);assert.equal(a.messages()+b.messages(),0);
  await saved.local.set({enabled:true});await settle();
  assert.equal(a.panelCount(),1);assert.equal(b.panelCount(),1);assert.equal(a.messages()+b.messages(),2);
  await saved.local.set({enabled:false});await settle();
  assert.equal(a.panelCount()+b.panelCount(),0);assert.equal(a.observing(),false);
  a.navigate();await saved.local.set({digikeyListId:'EXAMPLE'});await settle();assert.equal(a.messages()+b.messages(),2);
  await saved.local.set({enabled:true});await settle();assert.equal(a.panelCount(),1);assert.equal(b.panelCount(),1);
});

test('turning off cancels the page-side DigiKey request without recreating the panel',async()=>{
  const selectedPart={...part,provider:'digikey',host:'www.digikey.com',sku:'FUSB302BMPXCT-ND',sourceUrl:'https://www.digikey.com/en/products/detail/onsemi/FUSB302BMPX/6138869'};
  const saved=storage(),page=pageHarness(saved,selectedPart);
  await settle();assert.equal(page.fetches(),1);assert.equal(page.panelCount(),1);
  await saved.local.set({enabled:false});await settle();assert.equal(page.signal().aborted,true);assert.equal(page.panelCount(),0);assert.equal(page.fetches(),1);
});

test('a late initial settings read cannot override a newer off event',async()=>{
  const saved=storage();let release;
  const read=saved.local.get;saved.local.get=keys=>Array.isArray(keys)&&keys.includes('enabled')?new Promise(resolve=>{release=resolve;}):read(keys);
  const page=pageHarness(saved);await saved.local.set({enabled:false});release({enabled:true});await settle();
  assert.equal(page.panelCount(),0);assert.equal(page.messages(),0);
});

test('passives default off; type settings update open pages and survive a new page',async()=>{
  const saved=storage(),passive=pageHarness(saved,part,'passives'),ic=pageHarness(saved,part,'ics');
  await settle();assert.equal(passive.panelCount(),0);assert.equal(passive.messages(),0);
  assert.equal(ic.panelCount(),1);const icCalls=ic.messages();
  await saved.local.set({[C.typeKey('passives')]:true});await settle();
  assert.equal(passive.panelCount(),1);assert.equal(ic.messages(),icCalls);
  await saved.local.set({[C.typeKey('passives')]:false});await settle();
  assert.equal(passive.panelCount(),0);assert.equal(ic.panelCount(),1);assert.equal(ic.messages(),icCalls);
  const fresh=pageHarness(saved,part,'passives');await settle();assert.equal(fresh.messages(),0);assert.equal(fresh.panelCount(),0);
  await saved.local.set({enabled:false,[C.typeKey('passives')]:true});await settle();
  assert.equal(passive.panelCount()+ic.panelCount()+fresh.panelCount(),0);
  await saved.local.set({enabled:true});await settle();assert.equal(passive.panelCount(),1);assert.equal(ic.panelCount(),1);
});

test('type filtering aborts direct fetches and handles navigation without duplicate panels',async()=>{
  const selectedPart={...part,provider:'digikey',host:'www.digikey.com',sku:'TEST-ND',sourceUrl:'https://www.digikey.com/en/products/detail/onsemi/FUSB302BMPX/6138869'};
  const saved=storage(),page=pageHarness(saved,selectedPart,'ics');await settle();
  assert.equal(page.fetches(),1);page.navigate('passives');await settle();
  assert.equal(page.signal().aborted,true);assert.equal(page.panelCount(),0);assert.equal(page.fetches(),1);
  page.navigate('ics');await settle();assert.equal(page.panelCount(),1);assert.equal(page.fetches(),2);
  await saved.local.set({[C.typeKey('ics')]:false});await settle();assert.equal(page.signal().aborted,true);assert.equal(page.panelCount(),0);
  await saved.local.set({[C.typeKey('ics')]:true});await settle();assert.equal(page.panelCount(),1);
  await saved.local.set({enabled:false});
});

test('type events during initial storage read preserve both the saved master and latest type choices',async()=>{
  const saved=storage();let release;
  const read=saved.local.get;saved.local.get=keys=>Array.isArray(keys)&&keys.includes('enabled')?new Promise(resolve=>{release=resolve;}):read(keys);
  const page=pageHarness(saved,part,'passives');
  await saved.local.set({[C.typeKey('passives')]:true});release({enabled:false,[C.typeKey('passives')]:false});await settle();
  assert.equal(page.panelCount(),0);assert.equal(page.messages(),0);
  await saved.local.set({enabled:true});await settle();assert.equal(page.panelCount(),1);
});

test('worker blocks disabled types and aborts only requests for the type switched off',async()=>{
  const saved=storage({[C.typeKey('passives')]:true,digikeyListId:'EXAMPLE'});let listener;
  const signals=[];
  vm.runInNewContext(script('background.js'),{
    OriginLens:C,OriginLensNetwork:N,importScripts:()=>{},URL,AbortController,AbortSignal,
    fetch:async(url,options)=>{signals.push(options.signal);return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));},
    chrome:{storage:saved,runtime:{id:'extension',onMessage:{addListener:fn=>{listener=fn;}}}}
  });
  const request=type=>new Promise(resolve=>listener({type:'origin-lens:lookup',operation:'digikey',part:{...part,componentType:type}},{id:'extension',frameId:0,tab:{id:1},url:part.sourceUrl},resolve));
  const passive=request('passives'),ic=request('ics');await settle();assert.equal(signals.length,2);
  await saved.local.set({[C.typeKey('passives')]:false});assert.equal(signals[0].aborted,true);assert.equal(signals[1].aborted,false);
  assert.equal((await passive).ok,false);assert.equal((await request('passives')).code,'disabled');assert.equal(signals.length,2);
  await saved.local.set({enabled:false});assert.equal((await ic).ok,false);assert.equal(signals[1].aborted,true);
});

const stOptionsFixture=require('./fixtures/stm32g491re-options.json');
const stOptionsPart={...nexDk,manufacturer:'STMicroelectronics',mpn:'STM32G491RET6',sku:'497-STM32G491RET6-ND',sourceUrl:'https://www.digikey.com/en/products/detail/stmicroelectronics/STM32G491RET6/13592591'};
function familyReport(age=0){
  const checkedAt=new Date(Date.now()-age).toISOString();
  return O.make(stOptionsPart,stOptionsFixture.parentId,stOptionsFixture.products,stOptionsFixture.products.map(p=>({productId:p.prmis_id,attributes:stOptionsFixture.attributes[p.prmis_id],checkedAt})),checkedAt);
}

test('all ordering options render from the same family cache on both distributors without increasing the exact-source count',async()=>{
  const report=familyReport(),saved=storage({[O.key(stOptionsPart)]:report,...savedEntry(originRecord(stOptionsPart,'Malaysia'))});
  const other={...stOptionsPart,provider:'mouser',host:'www.mouser.com',sku:'511-STM32G491RET6',sourceUrl:'https://www.mouser.com/en/ProductDetail/STMicroelectronics/STM32G491RET6'};
  for(const identity of [stOptionsPart,other]){
    const requests=[];const page=pageHarness(saved,identity,'ics',m=>{requests.push(m.operation);return {ok:false,code:'network',message:'Unavailable'};});
    await settle();
    assert.match(pageText(page),/1 source reporting origin/);
    assert.match(pageText(page),/1 with different packing · 2 with a different temperature range in the same package · 3 in another package/);
    assert.match(pageText(page),/Taiwan across all 7 codes/);
    assert.match(pageText(page),/Compare all 7 ordering codes/);
    assert.equal(page.nodes().filter(n=>n.tagName==='tr').length,8);
    assert.equal(page.nodes().filter(n=>n.textContent==='Current part').length,1);
    assert.match(pageText(page),/Malaysia/);
    assert.equal(requests.some(op=>op.startsWith('st-')),true); // exact ST source is still missing
    assert.equal(requests.includes('st-options'),false);
    const table=page.nodes().find(n=>n.className==='options-table');
    const panel=page.nodes().find(n=>n.className==='panel-disclosure');
    panel.open=false;panel.events.toggle();panel.open=true;panel.events.toggle();
    assert.equal(page.nodes().find(n=>n.className==='options-table'),table);
  }
});

test('late family results cannot reappear or be cached after switching the component type off',async()=>{
  const saved=storage();let finish;
  const page=pageHarness(saved,stOptionsPart,'ics',undefined,{lookupDigiKey:async()=>originRecord(stOptionsPart,'Taiwan')},null,{lookup:()=>new Promise(resolve=>{finish=resolve;})});
  await settle();assert.match(pageText(page),/Checking ST's complete family listing/);
  await saved.local.set({[C.typeKey('ics')]:false});assert.equal(page.panelCount(),0);
  finish(familyReport());await settle();
  assert.equal(page.panelCount(),0);assert.equal(saved.values[O.key(stOptionsPart)],undefined);
});

test('failed family refresh preserves dated comparison and leaves exact source results independent',async()=>{
  const report=familyReport(C.CACHE_TTL+100),saved=storage({[O.key(stOptionsPart)]:report,...savedEntry(originRecord(stOptionsPart,'Taiwan'))});
  const page=pageHarness(saved,stOptionsPart,'ics',undefined,{},null,{lookup:async()=>{throw new C.LookupError('network','ST unavailable');}});
  await settle();
  assert.match(pageText(page),/Latest comparison unavailable: ST unavailable/);
  assert.match(pageText(page),/Compare all 7 ordering codes/);
  assert.match(pageText(page),/1 source reporting origin/);
  assert.equal(saved.values[O.key(stOptionsPart)].checkedAt,report.checkedAt);
});

test('Clear cache removes family comparisons and source reports while retaining preferences and unrelated settings',async()=>{
  const saved=storage({[O.key(stOptionsPart)]:familyReport(),...savedEntry(originRecord(stOptionsPart,'Taiwan')),enabled:false,'mouser-api-requests':[1,2]});
  const popup=popupHarness(saved);await settle();await popup.get('clear').events.click();
  assert.equal(Object.keys(saved.values).some(k=>k.startsWith('origin-lens:')),false);
  assert.equal(saved.values.enabled,false);assert.deepEqual(saved.values['mouser-api-requests'],[1,2]);
});
