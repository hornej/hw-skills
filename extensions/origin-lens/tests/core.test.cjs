const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../core.js');

const identity = { provider: 'digikey', host: 'www.digikey.com', manufacturer: 'onsemi', mpn: 'FUSB302BMPX', sku: 'FUSB302BMPXCT-ND', sourceUrl: 'https://www.digikey.com/en/products/detail/onsemi/FUSB302BMPX/6138869' };
const response = { manufacturer: 'onsemi', manufacturerPartNumber: 'FUSB302BMPX', digiKeyPartNumber: 'FUSB302BMPXTR-ND', countryOfOrigin: 'Thailand', packageType: 'Tape & Reel (TR)' };
const json = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, headers: new Headers({ 'content-type': 'application/json' }), json: async () => data });

test('origin placeholders stay unknown, multiple assertions stay separate', () => {
  for (const raw of ['', '-', 'Not available', 'N/A', 'Unknown']) assert.equal(C.field([raw]).status, 'unknown');
  assert.deepEqual(C.field([' France ', 'France', 'Malaysia', '-']).values, ['France', 'Malaysia']);
  assert.equal(C.field(['France', 'Malaysia']).status, 'multiple');
  assert.deepEqual(C.field(['Taiwan, China']).values, ['Taiwan, China']);
});

test('exact MPN, suffix, and manufacturer are checked before assigning origin', () => {
  const record = C.fromDigiKey(response, identity);
  assert.deepEqual(record.fields.declaredCoo.values, ['Thailand']);
  assert.deepEqual(record.fields.assembly.values, []);
  assert.equal(record.returnedSku, 'FUSB302BMPXTR-ND');
  assert.equal(record.identity.sku, 'FUSB302BMPXCT-ND');
  for (const data of [{...response, manufacturerPartNumber:'FUSB302TMPX'}, {...response, manufacturer:'Different vendor'}, {...response, manufacturerPartNumber:'FUSB302BMPXTR'}]) {
    assert.throws(() => C.fromDigiKey(data, identity), error => error.code === 'identity');
  }
  assert.throws(() => C.fromDigiKey({...response, countryOfOrigin:null}, identity), error => error.code === 'schema');
});

test('settings accept only a list ID or an HTTPS DigiKey list URL', () => {
  assert.equal(C.parseListId(''), '');
  assert.equal(C.parseListId('https://www.digikey.com/en/mylists/list/EXAMPLE123'), 'EXAMPLE123');
  for (const value of ['https://evil.test/en/mylists/list/ABC', 'https://www.digikey.com.evil.test/en/mylists/list/ABC', 'https://user@www.digikey.com/en/mylists/list/ABC', 'http://www.digikey.com/en/mylists/list/ABC', '../parts', 'ABC?x=1']) {
    assert.throws(() => C.parseListId(value));
  }
});

test('automatic lookup uses GET only, discovers one list and never adds a part', async () => {
  const calls = [];
  const fetcher = async (url, options) => { calls.push({url,options}); return json(calls.length === 1 ? {lists:[{id:'EXAMPLE123'}]} : response); };
  const result = await C.lookupDigiKey(identity, '', fetcher);
  assert.equal(result.fields.declaredCoo.values[0], 'Thailand');
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /contact\?startIndex=0&limit=1&sort=DateModifiedDesc$/);
  assert.equal(calls[1].url, '/en/mylists/api/lists/EXAMPLE123/parts/alternateParts/FUSB302BMPXCT-ND');
  for (const call of calls) {
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.body, undefined);
    assert.equal(call.options.credentials, 'same-origin');
    assert.equal(call.options.redirect, 'error');
  }
});

test('explicit list skips discovery and part-number special characters stay encoded', async () => {
  const part = {...identity, mpn:'PART/A#1', sku:'PART/A#1-ND'};
  const calls = [];
  await C.lookupDigiKey(part, 'EXAMPLE123', async url => { calls.push(url); return json({...response, manufacturerPartNumber:part.mpn}); });
  assert.deepEqual(calls, ['/en/mylists/api/lists/EXAMPLE123/parts/alternateParts/PART%2FA%231-ND']);
});

test('missing, malformed, and inaccessible lists do not trigger mutations or fallback writes', async () => {
  await assert.rejects(() => C.discoverList(async () => json({lists:[]})), e => e.code === 'no-list');
  for (const data of [{}, {lists:[{}]}, {lists:[{id:'../invalid'}]}]) await assert.rejects(() => C.discoverList(async () => json(data)));
  for (const [status, code] of [[401,'auth'],[403,'auth'],[429,'rate'],[404,'missing'],[500,'http']]) {
    let calls = 0;
    await assert.rejects(() => C.lookupDigiKey(identity, 'EXAMPLE123', async () => { calls++; return json({},status); }), e => e.code === code);
    assert.equal(calls,1);
  }
});

test('HTML, network failure, malformed JSON, and arbitrary URLs fail closed', async () => {
  const route = '/en/mylists/api/lists/contact';
  await assert.rejects(() => C.getJson(route, async () => ({ok:true,status:200,headers:new Headers({'content-type':'text/html'})})), e => e.code === 'auth');
  await assert.rejects(() => C.getJson(route, async () => { throw new Error('private diagnostics'); }), e => e.code === 'network' && !e.message.includes('private'));
  await assert.rejects(() => C.getJson(route, async () => ({...json({}),json:async()=>{throw new Error();}})), e => e.code === 'schema');
  await assert.rejects(() => C.getJson('https://evil.test/'), e => e.code === 'request');
});

test('cache cannot cross provider, region, manufacturer, MPN suffix, or SKU', () => {
  const record = C.fromDigiKey(response,identity);
  const now = Date.parse(record.checkedAt);
  assert.equal(C.isFresh(record, identity, now),true);
  assert.equal(C.isFresh(record, identity, now+C.CACHE_TTL),false);
  assert.equal(C.isFresh(record, identity, now-1),false);
  for (const changed of [{provider:'mouser'},{host:'eu.mouser.com'},{manufacturer:'Other'},{mpn:identity.mpn+'TR'},{sku:'FUSB302BMPXTR-ND'}]) assert.equal(C.isFresh(record,{...identity,...changed},now),false);
  assert.equal(C.isFresh({...record, checkedAt:'bad'},identity,now),false);
  assert.equal(C.isFresh(C.fromDigiKey({...response,countryOfOrigin:'-'},identity),identity),false);
});

test('Mouser parses exact field labels and excludes nested tooltip text', () => {
  const row = (label,value) => ({childNodes:[{nodeType:3,textContent:label+':'},{nodeType:1,textContent:'tooltip France'}],nextElementSibling:{tagName:'DD',textContent:value}});
  const doc = {querySelectorAll:() => [row('Country of Origin','Taiwan'),row('Assembly Country of Origin','Malaysia'),row('Country of Diffusion','Not available'),row('ECCN','EAR99')]};
  const record = C.fromMouser(doc,{...identity,provider:'mouser'});
  assert.deepEqual(record.fields.declaredCoo.values,['Taiwan']);
  assert.deepEqual(record.fields.assembly.values,['Malaysia']);
  assert.deepEqual(record.fields.diffusion.values,[]);
  assert.deepEqual(record.fields.testing.values,[]);
});

test('product identity handles graph metadata and rejects stale or conflicting identity', () => {
  const product = {'@type':'Product',mpn:identity.mpn,brand:{name:identity.manufacturer},sku:identity.sku,offers:{url:identity.sourceUrl}};
  const doc = data => ({querySelector:s => s === 'h1' ? {textContent:identity.mpn} : null,querySelectorAll:() => [{textContent:JSON.stringify(data)}]});
  assert.deepEqual(C.readIdentity(doc({'@graph':[product]}),identity.sourceUrl),identity);
  assert.equal(C.readIdentity(doc({...product,mpn:'OTHER'}),identity.sourceUrl),null);
  assert.equal(C.readIdentity(doc([product,product]),identity.sourceUrl),null);
  assert.equal(C.readIdentity(doc(product),identity.sourceUrl.replace('6138869','123')),null);
  assert.equal(C.readIdentity(doc(product),'https://evil.test/en/products/detail/onsemi/FUSB302BMPX/6138869'),null);
});

test('manifest limits access to supported product pages and bundles all scripts', () => {
  const dir = path.join(__dirname,'..');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  assert.deepEqual(manifest.permissions,['storage','offscreen']);
  assert.equal(manifest.manifest_version,3);
  assert.deepEqual(manifest.host_permissions, ['https://www.digikey.com/*', 'https://www.mouser.com/*', 'https://eu.mouser.com/*', 'https://api.mouser.com/*', 'https://www.ti.com/*', 'https://www.microchip.com/*', 'https://www.harwin.com/*', 'https://www.samtec.com/*', 'https://www.st.com/*', 'https://ksmk.st.com/*', 'https://www.lcsc.com/*', 'https://assets.lcsc.com/*', 'https://www.infineon.com/*', 'https://infineontechnologiesproduction6kx2o63f.org.coveo.com/*']);
  assert.equal(manifest.background.service_worker,'background.js');
  for (const group of manifest.content_scripts) for (const file of group.js) assert.ok(fs.existsSync(path.join(dir,file)));
  assert.ok(manifest.content_scripts[0].matches.every(pattern => pattern.startsWith('https://') && !pattern.includes('<all_urls>')));
});
