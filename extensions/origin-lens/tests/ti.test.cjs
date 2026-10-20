const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../core.js');
const N = require('../network.js');
// Reconstructed from TI's signed-in table and public client field mapping;
// values observed 2026-10-20, United States ship-to. Not a raw API capture.
const rows = require('./fixtures/ti-import-us.json');
const part = { provider: 'digikey', host: 'www.digikey.com', manufacturer: 'Texas Instruments',
  mpn: 'TPS259474ARPWR', sku: '296-TPS259474ARPWRTR-ND', componentType: 'ics',
  sourceUrl: 'https://www.digikey.com/en/products/detail/texas-instruments/TPS259474ARPWR/1' };
const endpoint = 'https://www.ti.com/importdetailsmodel/api/v1/ext/secured/material-import-details?locale=en-US';
const json = (data=rows) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const entry = result => { const key = C.sourceCacheKey('ti', result.identity); return { [key]: { key, result } }; };
const run = (fetcher, selected=part, extra={}) => N.run({ operation: 'ti', part: selected, ...extra }, '', fetcher);

test('TI uses only its fixed authenticated lookup, full code and explicit U.S. destination', async () => {
  const calls = [];
  const result = await run(async (url, options) => { calls.push({ url, options }); return json(); }, part,
    { url: 'https://evil.test', shipToCountryCode: 'CN', body: { searchedPartNumbers: ['OTHER'] } });
  assert.equal(calls.length, 1); assert.equal(calls[0].url, endpoint);
  const options = calls[0].options;
  assert.equal(options.method, 'POST'); assert.equal(options.credentials, 'include');
  assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store'); assert.ok(options.signal);
  assert.deepEqual(JSON.parse(options.body), { searchedPartNumbers: [part.mpn], shipToCountryCode: 'US', eccnCountryCode: 'US' });
  assert.equal(options.headers.Authorization, undefined); assert.equal(options.headers.Cookie, undefined);
  assert.deepEqual(result.fields.declaredCoo.values, ['Taiwan', 'United States']);
  assert.equal(result.importDetails.shipToCountry, 'United States');
  for (const key of ['assembly', 'diffusion', 'testing']) assert.deepEqual(result.fields[key].values, []);
  assert.equal(result.importDetails.alternatives[0].mpn, part.mpn + '.A');
  assert.deepEqual(result.importDetails.alternatives[0].declaredCoo.values, ['United States']);
  assert.equal(C.hasSourceEvidence(result), true);
  assert.doesNotMatch(JSON.stringify(result), /session|cookie|Bearer|accessToken/);
});

test('TI exact matching rejects base parts, suffix variants, another manufacturer and ambiguous matches', () => {
  for (const requested of [{ ...part, mpn: 'TPS25947' }, { ...part, mpn: part.mpn + '.A' },
    { ...part, mpn: part.mpn + 'T' }, { ...part, manufacturer: 'STMicroelectronics' }]) {
    assert.throws(() => C.fromTI(rows, requested), C.LookupError);
  }
  for (const data of [[rows[1], rows[1]], [{ ...rows[1], tiPartNumber: part.mpn + '.A' }],
    [{ ...rows[1], searchedPartNumber: part.mpn + '.A' }], [], [null], { data: rows }]) {
    assert.throws(() => C.fromTI(data, part), C.LookupError);
  }
  const requestedAPN = { ...part, mpn: part.mpn + '.A' };
  const response = [{ ...rows[1], searchedPartNumber: requestedAPN.mpn, tiPartNumber: requestedAPN.mpn, countryName: ['United States'], apns: [] }];
  const apn = C.fromTI(response, requestedAPN);
  assert.equal(apn.identity.mpn, requestedAPN.mpn);
  assert.deepEqual(apn.fields.diffusion.values, []); // Never infer fabrication from a suffix.
});

test('TI alternatives remain separate and unknown fields cannot become manufacturing evidence', () => {
  const result = C.fromTI([{ ...rows[1], countryName: ['UNKNOWN', 'ZZ', 'TAIWAN'], assemblyCountry: 'China',
    waferCountry: 'United States', apns: [{ alternatePartNumber: part.mpn + '.A', countryName: ['Germany'] }] }], part);
  assert.deepEqual(result.fields.declaredCoo.raw, ['UNKNOWN', 'ZZ', 'TAIWAN']);
  assert.deepEqual(result.fields.declaredCoo.values, ['Taiwan']);
  assert.deepEqual(result.fields.assembly.values, []); assert.deepEqual(result.fields.diffusion.values, []);
  assert.deepEqual(result.importDetails.alternatives[0].declaredCoo.values, ['Germany']);
  const onlyAlternative = C.fromTI([{ ...rows[1], countryName: null }], part);
  assert.equal(C.hasOriginEvidence(onlyAlternative), false); assert.equal(C.hasSourceEvidence(onlyAlternative), true);
  const empty = C.fromTI([{ ...rows[1], countryName: null, apns: null }], part);
  assert.equal(C.hasSourceEvidence(empty), false);
});

test('TI rejects changed, oversized or ambiguous import-details fields', () => {
  const withoutCountry = { ...rows[1] }; delete withoutCountry.countryName;
  for (const row of [withoutCountry, { ...rows[1], countryName: {} }, { ...rows[1], countryName: Array(33).fill('China') },
    { ...rows[1], eccn: 'X'.repeat(101) }, { ...rows[1], apns: {} },
    { ...rows[1], apns: [rows[1].apns[0], rows[1].apns[0]] },
    { ...rows[1], apns: [{ alternatePartNumber: '../foo', countryName: ['China'] }] },
    { ...rows[1], apns: [{ alternatePartNumber: part.mpn, countryName: ['China'] }] }]) {
    assert.throws(() => C.fromTI([row], part), C.LookupError);
  }
  assert.throws(() => C.fromTI(Array(101).fill(rows[1]), part), C.LookupError);
});

test('TI cache retains destination, alternatives and original dates across distributor sites', () => {
  const result = C.fromTI(rows, part), saved = entry(result);
  const target = { ...part, provider: 'mouser', host: 'eu.mouser.com', sku: '595-' + part.mpn,
    sourceUrl: 'https://eu.mouser.com/en/ProductDetail/Texas-Instruments/' + part.mpn };
  assert.equal(C.savedSource(saved, 'ti', target).result, result);
  assert.equal(C.sourceFresh(Object.values(saved)[0], 'ti', result.identity), true);
  const reordered = JSON.parse(JSON.stringify(result, (_, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value));
  assert.deepEqual(C.savedSource(entry(reordered), 'ti', target).result, result);
  assert.equal(C.savedSource(saved, 'ti', { ...target, mpn: part.mpn + '.A' }), null);
  const old = C.savedSource(saved, 'ti', target, Date.parse(result.checkedAt) + C.CACHE_TTL + 1);
  assert.equal(old.stale, true); assert.equal(old.result.checkedAt, result.checkedAt);
  assert.equal(C.savedSource(saved, 'ti', target, Date.parse(result.checkedAt) + C.CACHE_RETENTION), null);
  for (const mutate of [r => { r.importDetails.shipToCountryCode = 'CN'; }, r => { r.importDetails.shipToCountry = 'China'; },
    r => { r.importDetails.eccnCountryCode = 'DE'; }, r => { r.fields.assembly = C.field(['China']); },
    r => { r.fields.declaredCoo.values = ['Germany']; }, r => { r.identity.sku += '.A'; },
    r => { r.sourceUrl = 'https://www.ti.com.attacker.test/'; }, r => { r.sourceKind = 'Guaranteed origin'; },
    r => { r.importDetails.alternatives[0].declaredCoo.values = ['China']; }]) {
    const changed = structuredClone(result); mutate(changed);
    assert.equal(C.savedSource(entry(changed), 'ti', target), null);
  }
});

test('TI failures are bounded, require normal sign-in and never expose response content', async () => {
  for (const status of [401, 403, 429, 500]) {
    let calls = 0;
    await assert.rejects(run(async () => { calls++; return new Response('PRIVATE-DETAIL', { status }); }), e =>
      !e.message.includes('PRIVATE-DETAIL') && (status !== 401 && status !== 403 || e.code === 'auth' && /myTI/.test(e.message)));
    assert.equal(calls, 1);
  }
  await assert.rejects(run(async () => new Response('<html>PRIVATE-DETAIL</html>', { headers: { 'content-type': 'text/html' } })), e => e.code === 'auth');
  for (const url of ['https://login.ti.com/', 'https://www.ti.com/unexpected', 'http://www.ti.com/', 'https://www.ti.com.attacker.test/']) {
    await assert.rejects(run(async () => { const r = json(); Object.defineProperty(r, 'url', { value: url }); return r; }), e => e.code === 'redirect');
  }
  await assert.rejects(run(async () => new Response('[]', { headers: { 'content-type': 'application/json', 'content-length': '5000000' } })), /too large/);
  await assert.rejects(run(async () => new Response('private unreadable body', { headers: { 'content-type': 'application/json' } })), e => e.code === 'schema' && !e.message.includes('private'));
});

test('TI invalid inputs cause no requests, and changing global or component preferences cancels a lookup', async () => {
  let calls = 0;
  for (const mpn of ['../anything', 'ABC,DEF', 'ABC\nDEF', 'A'.repeat(81)]) {
    await assert.rejects(run(async () => { calls++; }, { ...part, mpn }));
  }
  await assert.rejects(run(async () => { calls++; }, { ...part, manufacturer: 'Other' }));
  assert.equal(calls, 0);
  for (const preference of ['enabled', C.typeKey('ics')]) {
    let listener, changed, signal, reads = 0;
    const values = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8'), {
      OriginLens: C, OriginLensNetwork: N, OriginLensCredentials: { get: async () => { reads++; } },
      importScripts() {}, URL, AbortController, AbortSignal,
      fetch: async (url, options) => { signal = options.signal; return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); },
      chrome: { storage: { local: { get: async () => values }, onChanged: { addListener: fn => { changed = fn; } } },
        runtime: { id: 'extension', onMessage: { addListener: fn => { listener = fn; } } } }
    });
    const pending = new Promise(resolve => listener({ type: 'origin-lens:lookup', operation: 'ti', part },
      { id: 'extension', frameId: 0, tab: { id: 1 }, url: part.sourceUrl }, resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(signal.aborted, false); changed({ [preference]: { newValue: false } }, 'local');
    assert.equal(signal.aborted, true); assert.equal((await pending).ok, false); assert.equal(reads, 0);
  }
});
