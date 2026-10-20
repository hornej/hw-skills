const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DOMParser } = require('linkedom');
const C = require('../core.js');
const N = require('../network.js');
const parse = html => new DOMParser().parseFromString(html, 'text/html');
const fixtures = [
  ['samtec', 'SQT-103-01-F-Q', 'MALAYSIA', 'Malaysia'],
  ['samtec', 'TSM-106-03-L-SV', 'VIETNAM', 'Vietnam'],
  ['harwin', 'S8411-45R', 'CN', 'China'],
  ['harwin', 'H3192-05', 'GB', 'United Kingdom']
];
const partFor = (provider, mpn, site = 'digikey') => ({
  provider: site, host: site === 'digikey' ? 'www.digikey.com' : 'eu.mouser.com',
  manufacturer: C.PROVIDERS[provider] + (site === 'digikey' ? ' Inc.' : ''), mpn, sku: 'example-' + mpn,
  sourceUrl: site === 'digikey' ? `https://www.digikey.com/en/products/detail/${provider}/${mpn}/1`
    : `https://eu.mouser.com/en/ProductDetail/${provider}/${mpn}`
});
const htmlFor = (provider, mpn) => fs.readFileSync(path.join(__dirname, 'fixtures', `${provider}-${mpn.toLowerCase()}.html`), 'utf8');
const read = (provider, mpn, mutate = () => {}) => {
  const part = partFor(provider, mpn), doc = parse(htmlFor(provider, mpn));
  mutate(doc);
  return C.fromManufacturerPage(doc, C.manufacturerPageUrl(provider, part), provider, part);
};
const entry = result => {
  const key = C.sourceCacheKey(result.identity.provider, result.identity);
  return { [key]: { key, result } };
};
const htmlResponse = (html, url) => {
  const r = new Response(html, { headers: { 'content-type': 'text/html' } });
  Object.defineProperty(r, 'url', { value: url });
  return r;
};

test('manufacturer page fixtures preserve full identity and distinguish probable origin from declarations', () => {
  for (const [provider, mpn, raw, country] of fixtures) {
    const result = read(provider, mpn), key = provider === 'samtec' ? 'probableCoo' : 'declaredCoo';
    assert.deepEqual(result.fields[key], { raw: [raw], values: [country], status: 'reported' });
    assert.equal(result.identity.mpn, mpn);
    assert.equal(result.identity.manufacturer, C.PROVIDERS[provider]);
    assert.ok(C.hasSourceEvidence(result));
    assert.equal(C.hasOriginEvidence(result), provider === 'harwin');
    for (const stage of ['assembly', 'diffusion', 'testing']) assert.deepEqual(result.fields[stage].values, []);
    if (provider === 'samtec') assert.deepEqual(result.fields.declaredCoo.values, []);
  }
});

test('both distributor sites fetch one fixed manufacturer URL without credentials, redirects or page-supplied URLs', async () => {
  for (const [provider, mpn] of fixtures) {
    for (const site of ['digikey', 'mouser']) {
      const part = partFor(provider, mpn, site), calls = [];
      const result = await C.lookupManufacturerPage(provider, part, operation =>
        N.run({ operation, part, url: 'https://evil.test/?part=another' }, '', async (url, options) => {
          calls.push({ url, options });
          return htmlResponse(htmlFor(provider, mpn), url);
        }), parse);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, C.manufacturerPageUrl(provider, part));
      assert.equal(calls[0].options.method, 'GET');
      assert.equal(calls[0].options.credentials, 'omit');
      assert.equal(calls[0].options.redirect, 'error');
      assert.ok(calls[0].options.signal);
      assert.equal(calls[0].options.headers.Authorization, undefined);
      assert.equal(result.identity.provider, provider);
    }
  }
});

test('manufacturer pages reject suffix variants, wrong brands, response URLs and canonical identities', () => {
  for (const [provider, mpn] of fixtures) {
    const part = partFor(provider, mpn), url = C.manufacturerPageUrl(provider, part), html = htmlFor(provider, mpn);
    for (const requested of [{ ...part, mpn: mpn + '-R' }, { ...part, manufacturer: 'Other' }]) {
      assert.throws(() => C.fromManufacturerPage(parse(html), url, provider, requested), e => e.code === 'identity');
    }
    for (const badUrl of [url + '-R', 'https://evil.test/', url.replace('https:', 'http:')]) {
      assert.throws(() => C.fromManufacturerPage(parse(html), badUrl, provider, part), e => e.code === 'identity');
    }
    for (const mutate of [
      doc => doc.querySelector('link[rel="canonical"]').remove(),
      doc => doc.querySelector('link[rel="canonical"]').setAttribute('href', url + '-R'),
      doc => doc.head.append(doc.querySelector('link[rel="canonical"]').cloneNode(true))
    ]) assert.throws(() => read(provider, mpn, mutate), e => e.code === 'identity');
  }
  assert.throws(() => read('samtec', fixtures[0][1], doc => {
    const script = doc.querySelector('script'), data = JSON.parse(script.textContent);
    data.manufacturer.name = 'Another Samtec';
    script.textContent = JSON.stringify(data);
  }), e => e.code === 'identity');
  assert.throws(() => read('samtec', fixtures[0][1], doc => {
    doc.querySelector('h1').firstChild.textContent += '-R';
  }), e => e.code === 'identity');
  assert.throws(() => read('harwin', fixtures[2][1], doc => {
    const script = doc.querySelector('script'), data = JSON.parse(script.textContent);
    data.props.pageProps.product.name += '-R';
    script.textContent = JSON.stringify(data);
  }), e => e.code === 'identity');
});

test('unresolved countries are retained as raw data and never become evidence', () => {
  for (const raw of ['UNKNOWN', 'ZZ', 'EU', 'MALAYSIA / VIETNAM', '<script>']) {
    const r = read('samtec', fixtures[0][1], doc => {
      doc.querySelector('table span').textContent = raw;
    });
    assert.deepEqual(r.fields.probableCoo.raw, [raw]);
    assert.deepEqual(r.fields.probableCoo.values, []);
    assert.equal(C.hasSourceEvidence(r), false);
  }
  for (const origin of [null, { name: 'Country of Origin', value: 'ZZ' }]) {
    const r = read('harwin', fixtures[2][1], doc => {
      const s = doc.querySelector('script'), d = JSON.parse(s.textContent);
      d.props.pageProps.product.attributes.countryOfOrigin = origin;
      s.textContent = JSON.stringify(d);
    });
    assert.deepEqual(r.fields.declaredCoo.values, []);
    assert.equal(C.hasSourceEvidence(r), false);
  }
});

test('changed or ambiguous manufacturer schemas fail without assigning unrelated compliance data', () => {
  for (const mutate of [
    doc => doc.querySelector('table').remove(),
    doc => doc.body.append(doc.querySelector('table').cloneNode(true)),
    doc => doc.querySelector('table span').remove(),
    doc => { doc.querySelector('table p').firstChild.textContent = 'China RoHS: '; },
    doc => doc.body.append(doc.querySelector('script').cloneNode(true))
  ]) assert.throws(() => read('samtec', fixtures[0][1], mutate), C.LookupError);
  for (const mutate of [
    doc => { doc.querySelector('script').textContent = '{unreadable'; },
    doc => doc.body.append(doc.querySelector('script').cloneNode(true)),
    doc => {
      const s = doc.querySelector('script'), d = JSON.parse(s.textContent);
      d.props.pageProps.product.attributes.countryOfOrigin = { name: 'China RoHS', value: 'CN' };
      s.textContent = JSON.stringify(d);
    }
  ]) assert.throws(() => read('harwin', fixtures[2][1], mutate), C.LookupError);
});

test('manufacturer cache shares dated reports across sites and rejects relabeled probable origin or invented stages', () => {
  for (const [provider, mpn] of fixtures) {
    const result = read(provider, mpn), saved = entry(result), target = partFor(provider, mpn, 'mouser');
    assert.equal(C.savedSource(saved, provider, target).result, result);
    assert.equal(C.sourceFresh(Object.values(saved)[0], provider, result.identity), true);
    assert.equal(C.savedSource(saved, provider, { ...target, mpn: mpn + '-R' }), null);
    const originalTime = result.checkedAt;
    const old = C.savedSource(saved, provider, target, Date.parse(originalTime) + C.CACHE_TTL + 1);
    assert.equal(old.stale, true); assert.equal(old.result.checkedAt, originalTime);
    assert.equal(C.savedSource(saved, provider, target, Date.parse(originalTime) + C.CACHE_RETENTION), null);
    for (const mutate of [
      r => { r.fields.assembly = C.field(['Germany']); },
      r => { r.sourceUrl = 'https://evil.test'; },
      r => { r.identity.sku += '-R'; },
      r => { r.fields.declaredCoo = C.field(['Malaysia']); },
      r => { r.sourceKind = 'Guaranteed origin'; }
    ]) {
      const changed = structuredClone(result); mutate(changed);
      assert.equal(C.savedSource(entry(changed), provider, target), null);
    }
  }
  const samtec = read('samtec', fixtures[0][1]);
  const declaration = C.fromDigiKey({ manufacturer: 'Samtec', manufacturerPartNumber: samtec.identity.mpn,
    digiKeyPartNumber: 'example', countryOfOrigin: 'Vietnam' }, partFor('samtec', samtec.identity.mpn));
  assert.equal(C.disagreement([declaration, samtec]), false);
});

test('manufacturer requests reject malformed codes before fetching and fail safely on access, redirect and size errors', async () => {
  for (const provider of ['samtec', 'harwin']) {
    const mpn = fixtures.find(f => f[0] === provider)[1], part = partFor(provider, mpn);
    let calls = 0;
    for (const invalid of ['../x', 'ABC?redirect=evil', 'ABC/DEF', 'ABC#DEF', 'ABC\nDEF', 'A'.repeat(81)]) {
      await assert.rejects(N.run({ operation: provider, part: { ...part, mpn: invalid } }, '', async () => { calls++; }));
    }
    await assert.rejects(N.run({ operation: provider, part: { ...part, manufacturer: 'Other' } }, '', async () => { calls++; }));
    assert.equal(calls, 0);
    for (const status of [401, 403, 429, 500]) {
      await assert.rejects(N.run({ operation: provider, part }, '', async () =>
        new Response('not a product', { status, headers: { 'content-type': 'text/html' } })), C.LookupError);
    }
    for (const url of ['https://evil.test/', C.manufacturerPageUrl(provider, part) + '-R']) {
      await assert.rejects(C.lookupManufacturerPage(provider, part, operation =>
        N.run({ operation, part }, '', async () => htmlResponse(htmlFor(provider, mpn), url)), parse), C.LookupError);
    }
    await assert.rejects(N.run({ operation: provider, part }, '', async () =>
      new Response('x', { headers: { 'content-type': 'text/html', 'content-length': String(5 * 1024 * 1024) } })), /too large/);
  }
});

test('disabling connector lookups cancels manufacturer requests and no credential is read', async () => {
  for (const provider of ['samtec', 'harwin']) {
    const selected = { ...partFor(provider, fixtures.find(f => f[0] === provider)[1]), componentType: 'connectors' };
    let listener, changed, signal, calls = 0, reads = 0;
    const values = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8'), {
      OriginLens: C, OriginLensNetwork: N, OriginLensCredentials: { get: () => { reads++; } },
      importScripts: () => {}, URL, AbortController, AbortSignal,
      fetch: async (url, options) => {
        calls++; signal = options.signal;
        return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
      },
      chrome: {
        storage: { local: { get: async () => values }, onChanged: { addListener: fn => { changed = fn; } } },
        runtime: { id: 'extension', onMessage: { addListener: fn => { listener = fn; } } }
      }
    });
    const request = () => new Promise(resolve => listener({ type: 'origin-lens:lookup', operation: provider, part: selected },
      { id: 'extension', frameId: 0, tab: { id: 1 }, url: selected.sourceUrl }, resolve));
    const pending = request(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(signal.aborted, false);
    values['component-type:connectors'] = false;
    changed({ 'component-type:connectors': { newValue: false } }, 'local');
    assert.equal(signal.aborted, true);
    assert.equal((await pending).ok, false);
    assert.equal((await request()).code, 'disabled');
    assert.equal(calls, 1); assert.equal(reads, 0);
  }
});
