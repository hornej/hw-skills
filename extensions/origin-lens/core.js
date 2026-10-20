/* Shared by the isolated content script, settings page, and dependency-free tests. */
((root) => {
  "use strict";
  const OCR = typeof module !== "undefined" && module.exports ? require("./ocr.js") : root.OriginLensOCR;
  const VERSION = 2;
  const CACHE_TTL = 60 * 60 * 1000;
  const CACHE_RETENTION = 7 * 24 * 60 * 60 * 1000;
  const CACHE_PREFIX = "origin-lens:v2:";
  const normalize = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const same = (a, b) => normalize(a).toLowerCase() === normalize(b).toLowerCase();
  function manufacturerKey(value) {
    const name = normalize(value).toLowerCase();
    // Verified distributor naming for Nexperia; do not strip arbitrary company
    // suffixes or equate acquired brands. Keep each source's original name.
    if (name === "nexperia usa inc.") return "nexperia";
    if (name === "microchip technology inc.") return "microchip technology";
    if (name === "st") return "stmicroelectronics"; // LCSC brand 74.
    return name;
  }
  const sameManufacturer = (a, b) => !!manufacturerKey(a) && manufacturerKey(a) === manufacturerKey(b);
  const missing = /^(?:[-–—]|n\/?a|not available|not provided|unknown|unavailable|none|null)$/i;
  const COMPONENT_TYPES = Object.freeze([
    { id: "passives", label: "Passives", hint: "Resistors, capacitors, inductors & ferrites", defaultEnabled: false },
    { id: "ics", label: "Integrated circuits", hint: "", defaultEnabled: true },
    { id: "discretes", label: "Discrete semiconductors", hint: "Diodes, transistors & thyristors", defaultEnabled: true },
    { id: "connectors", label: "Connectors", hint: "", defaultEnabled: true },
    { id: "electromechanical", label: "Electromechanical", hint: "Switches, relays, motors & fans", defaultEnabled: true },
    { id: "other", label: "Other / unrecognized", hint: "Sensors, optoelectronics & uncategorized parts", defaultEnabled: true }
  ].map(Object.freeze));
  const typeKey = type => "component-type:" + type;
  const PREFERENCE_KEYS = Object.freeze(["enabled", ...COMPONENT_TYPES.map(t => typeKey(t.id))]);
  function componentTypeEnabled(type, settings = {}) {
    const definition = COMPONENT_TYPES.find(t => t.id === type) || COMPONENT_TYPES.find(t => t.id === "other");
    const value = settings[typeKey(definition.id)];
    return typeof value === "boolean" ? value : definition.defaultEnabled;
  }
  function classifyCategories(labels) {
    // Only category breadcrumbs, never descriptions, MPNs, or the site's broad navigation.
    // Connector ancestry wins over "IC sockets"; IC ancestry wins over "capacitor" controllers.
    const has = pattern => labels.some(label => pattern.test(normalize(label)));
    if (has(/\b(?:connectors?|interconnects)\b/i)) return "connectors";
    if (has(/\b(?:integrated circuits|ICs?|microcontrollers|microprocessors|memory)\b/i)) return "ics";
    if (has(/\b(?:resistors?|capacitors?|inductors?|ferrites?)\b|^coils|^chokes/i)) return "passives";
    if (has(/\b(?:discrete semiconductors|diodes?|transistors?|MOSFETs?|FETs?|IGBTs?|thyristors?|rectifiers?|TRIACs?|SCRs?)\b/i)) return "discretes";
    if (has(/\b(?:electromechanical|switches|relays|contactors|motors|fans|blowers|solenoids)\b/i)) return "electromechanical";
    return "other";
  }
  function readComponentType(doc, href) {
    const url = new URL(href);
    const digikey = url.hostname === "www.digikey.com";
    if (!digikey && !["www.mouser.com", "eu.mouser.com"].includes(url.hostname)) return "other";
    const selector = digikey ? "nav.MuiBreadcrumbs-root a" : "#pdpBreadcrumb .breadcrumb a";
    const categoryPath = digikey ? /^\/en\/products\/(?:category|filter)\// : /^\/(?:en\/)?c\//;
    const labels = [];
    for (const link of doc.querySelectorAll(selector)) {
      try {
        const target = new URL(link.getAttribute("href"), href);
        if (target.origin === url.origin && categoryPath.test(target.pathname)) labels.push(link.textContent);
      } catch { /* An unrelated link cannot classify a component. */ }
    }
    return classifyCategories(labels);
  }

  class LookupError extends Error {
    constructor(code, message) { super(message); this.name = "LookupError"; this.code = code; }
  }

  function field(rawValues = []) {
    const raw = [...new Set(rawValues.flat().map(normalize).filter(Boolean))];
    const values = raw.filter(value => !missing.test(value));
    return { raw, values, status: values.length > 1 ? "multiple" : values.length ? "reported" : "unknown" };
  }
  function hasOriginEvidence(result) {
    return ["declaredCoo", "assembly", "diffusion", "testing"].some(key => {
      const values = result?.fields?.[key]?.values;
      return Array.isArray(values) && values.length > 0 && values.every(v => typeof v === "string" && normalize(v) && !missing.test(v));
    });
  }
  function hasSourceEvidence(result) {
    return result?.identity?.provider === "lcsc" ? validLCSCPhotos(result) : hasOriginEvidence(result);
  }

  function parseListId(input) {
    const text = normalize(input);
    if (!text) return "";
    if (/^[A-Za-z0-9_-]{1,80}$/.test(text)) return text;
    try {
      const url = new URL(text);
      if (url.protocol !== "https:" || url.hostname !== "www.digikey.com" || url.port || url.username || url.password) throw new Error();
      const match = url.pathname.match(/^\/en\/mylists\/list\/([A-Za-z0-9_-]{1,80})\/?$/);
      if (match) return match[1];
    } catch { /* Use a single actionable error below. */ }
    throw new LookupError("settings", "Enter a DigiKey MyLists URL or list ID.");
  }

  function cacheKey(identity) {
    return CACHE_PREFIX + JSON.stringify([identity.provider, identity.host, manufacturerKey(identity.manufacturer), identity.mpn, identity.sku]);
  }

  function isFresh(record, identity, now = Date.now()) {
    const age = now - Date.parse(record?.checkedAt);
    return record?.version === VERSION && record?.identity &&
      cacheKey(record.identity) === cacheKey(identity) && Number.isFinite(age) && age >= 0 && age < CACHE_TTL &&
      hasSourceEvidence(record);
  }

  function productJson(doc) {
    const products = [];
    const walk = value => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) { value.forEach(walk); return; }
      const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
      if (types.includes("Product")) products.push(value);
      if (value["@graph"]) walk(value["@graph"]);
    };
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try { walk(JSON.parse(script.textContent)); } catch { /* Ignore unrelated malformed metadata. */ }
    }
    return products;
  }

  function readIdentity(doc, href) {
    const url = new URL(href);
    const provider = url.hostname === "www.digikey.com" ? "digikey" :
      ["www.mouser.com", "eu.mouser.com"].includes(url.hostname) ? "mouser" : null;
    if (!provider) return null;
    if (provider === "digikey" && !/^\/en\/products\/detail\//.test(url.pathname)) return null;
    if (provider === "mouser" && !/^\/(?:en\/)?ProductDetail\//.test(url.pathname)) return null;
    const heading = normalize(doc.querySelector("h1")?.textContent);
    const products = productJson(doc).filter(p => same(p.mpn, heading));
    const p = products.length === 1 ? products[0] : null;
    if (p?.offers?.url) {
      try { if (new URL(p.offers.url, href).pathname !== url.pathname) return null; } catch { return null; }
    }
    const text = selector => normalize(doc.querySelector(selector)?.textContent);
    const mpn = provider === "mouser" ? text("#spnManufacturerPartNumber") || normalize(p?.mpn) : normalize(p?.mpn);
    const manufacturer = provider === "mouser" ? text("#lnkManufacturerName") || normalize(p?.brand?.name || p?.brand) : normalize(p?.brand?.name || p?.brand);
    const sku = provider === "mouser" ? text("#spnMouserPartNumFormattedForProdInfo") || normalize(p?.sku) : normalize(p?.sku);
    // A title or URL alone cannot establish the exact manufacturer/ordering code.
    if (!mpn || !manufacturer || !sku || !same(mpn, heading)) return null;
    const query = provider === "mouser" && url.searchParams.has("qs") ? "?" + new URLSearchParams({ qs: url.searchParams.get("qs") }) : "";
    return { provider, host: url.hostname, manufacturer, mpn, sku, sourceUrl: url.origin + url.pathname + query };
  }

  function record(identity, fields, sourceKind, extra = {}) {
    return { version: VERSION, identity: { ...identity }, checkedAt: new Date().toISOString(), sourceKind,
      sourceUrl: identity.sourceUrl, fields: { declaredCoo: field(), assembly: field(), diffusion: field(), testing: field(), ...fields }, ...extra };
  }

  function fromDigiKey(data, identity) {
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new LookupError("schema", "DigiKey returned an unexpected response.");
    if (!same(data.manufacturerPartNumber, identity.mpn) || !sameManufacturer(data.manufacturer, identity.manufacturer)) {
      throw new LookupError("identity", "DigiKey returned a different manufacturer or ordering code. Origin was not assigned to this part.");
    }
    if (!normalize(data.digiKeyPartNumber) || typeof data.countryOfOrigin !== "string") {
      throw new LookupError("schema", "DigiKey's response is missing expected product or origin fields.");
    }
    return record(identity, { declaredCoo: field([data.countryOfOrigin]) }, "DigiKey MyLists alternate-part lookup", {
      returnedSku: normalize(data.digiKeyPartNumber), returnedPackaging: normalize(data.packageType)
    });
  }

  function fromMouser(doc, identity) {
    const labels = { "country of origin": "declaredCoo", "assembly country of origin": "assembly", "country of diffusion": "diffusion" };
    const values = {};
    for (const dt of doc.querySelectorAll("dl.compliance-dlist dt")) {
      // Tooltip text is nested inside dt; only its direct text names the field.
      const label = normalize([...dt.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(" ")).replace(/:$/, "").toLowerCase();
      const key = labels[label];
      const dd = dt.nextElementSibling;
      if (key && dd?.tagName === "DD") (values[key] ||= []).push(dd.textContent);
    }
    return record(identity, Object.fromEntries(Object.entries(values).map(([key, raw]) => [key, field(raw)])), "Mouser Product & Trade Compliance");
  }

  function fromMouserApi(data, part) {
    if (!Array.isArray(data?.Errors)) throw new LookupError("schema", "Mouser API returned an unexpected response.");
    if (data.Errors.length) {
      // Provider errors may contain the credential-bearing request URL. Never forward them.
      const errors = JSON.stringify(data.Errors);
      const code = /key|unauthor|authenticat/i.test(errors) ? "api-auth" : /limit|quota|rate/i.test(errors) ? "rate" : "api-error";
      throw new LookupError(code, code === "api-auth" ? "Check the Mouser Search API key in Origin Lens settings." : code === "rate" ? "Mouser API is limiting requests. Wait before retrying." : "Mouser API rejected the search. Check your API access and retry.");
    }
    if (!Array.isArray(data?.SearchResults?.Parts)) throw new LookupError("schema", "Mouser API returned an unexpected response.");
    const parts = data.SearchResults.Parts;
    if (!Number.isInteger(data.SearchResults.NumberOfResult) || data.SearchResults.NumberOfResult !== parts.length) throw new LookupError("schema", "Mouser API returned an incomplete result set.");
    let matches = parts.filter(p => same(p.ManufacturerPartNumber, part.mpn) && sameManufacturer(p.Manufacturer, part.manufacturer));
    if (part.provider === "mouser") matches = matches.filter(p => same(p.MouserPartNumber, part.sku));
    if (matches.length !== 1) throw new LookupError("identity", "Mouser API did not return one exact manufacturer, ordering code and SKU match.");
    const p = matches[0];
    if (!normalize(p.MouserPartNumber) || !Array.isArray(p.TradeCompliance) || p.TradeCompliance.some(f => typeof f.ComplianceName !== "string" || typeof f.ComplianceValue !== "string")) throw new LookupError("schema", "Mouser API is missing expected trade-compliance fields.");
    const sourceUrl = productUrl(p.ProductDetailUrl, "mouser");
    const labels = { "country of origin": "declaredCoo", "assembly country of origin": "assembly", "country of diffusion": "diffusion" }, values = {};
    for (const item of p.TradeCompliance) {
      const key = labels[normalize(item.ComplianceName).toLowerCase()];
      if (key) (values[key] ||= []).push(item.ComplianceValue);
    }
    return record({ provider: "mouser", host: new URL(sourceUrl).hostname, manufacturer: normalize(p.Manufacturer), mpn: normalize(p.ManufacturerPartNumber), sku: normalize(p.MouserPartNumber), sourceUrl },
      Object.fromEntries(Object.entries(values).map(([key, raw]) => [key, field(raw)])), "Mouser Search API");
  }

  function manufacturerProvider(part) {
    if (manufacturerKey(part.manufacturer) === "microchip technology") return "microchip";
    return "st";
  }
  const microchipUrl = part => `https://www.microchip.com/designresources/product-catalog/api/productInfo?part=${encodeURIComponent(part.mpn)}&pagesize=100&pagenumber=1`;
  function fromMicrochip(data, part) {
    if (manufacturerProvider(part) !== "microchip") throw new LookupError("identity", "This part is not a verified Microchip manufacturer match.");
    if (!Array.isArray(data?.data) || !Number.isInteger(data.totalRecords) || data.totalRecords !== data.data.length || data.totalPages > 1) throw new LookupError("schema", "Microchip returned an incomplete or unexpected result set.");
    const matches = data.data.filter(p => same(p.part_number, part.mpn) && sameManufacturer(p.manufacturer, part.manufacturer));
    if (matches.length !== 1) throw new LookupError("identity", "Microchip did not return one exact manufacturer and ordering-code match.");
    const p = matches[0];
    if (!same(p.sku, part.mpn) || ![p.country_of_origin, p.assembly_country, p.wafer_fab_country].every(v => typeof v === "string")) throw new LookupError("schema", "Microchip is missing expected identity or origin fields.");
    return record({ provider: "microchip", host: "www.microchip.com", manufacturer: p.manufacturer, mpn: p.part_number, sku: p.sku, sourceUrl: microchipUrl(part) },
      { declaredCoo: field([p.country_of_origin]), assembly: field([p.assembly_country]), diffusion: field([p.wafer_fab_country]) }, "Microchip Product API");
  }

  async function getJson(path, fetcher = fetch) {
    // All network access is same-origin and read-only. No arbitrary page-supplied URLs.
    if (!path.startsWith("/en/mylists/api/lists/")) throw new LookupError("request", "Unsupported lookup path.");
    let response;
    try {
      response = await fetcher(path, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000), headers: { Accept: "application/json" } });
    } catch {
      throw new LookupError("network", "DigiKey could not be reached. Check your connection and sign-in, then retry.");
    }
    if (response.status === 401 || response.status === 403) throw new LookupError("auth", "Sign in to DigiKey or complete its site verification, then click Refresh.");
    if (response.status === 429) throw new LookupError("rate", "DigiKey is limiting requests. Wait before retrying.");
    if (response.status === 404) throw new LookupError("missing", "DigiKey could not find the list or part. Check your list setting.");
    if (!response.ok) throw new LookupError("http", `DigiKey lookup failed (HTTP ${response.status}).`);
    if (!response.headers.get("content-type")?.includes("json")) throw new LookupError("auth", "DigiKey returned a sign-in or verification page. Complete it on DigiKey, then click Refresh.");
    try { return await response.json(); } catch { throw new LookupError("schema", "DigiKey returned unreadable data."); }
  }

  async function discoverList(fetcher) {
    const data = await getJson("/en/mylists/api/lists/contact?startIndex=0&limit=1&sort=DateModifiedDesc", fetcher);
    if (!Array.isArray(data?.lists)) throw new LookupError("schema", "DigiKey's list response has changed.");
    if (!data.lists.length) throw new LookupError("no-list", "DigiKey reported no saved lists. Create one empty list to enable its origin lookup, or choose an existing shared list below.");
    const id = parseListId(data.lists[0].id);
    if (!id) throw new LookupError("schema", "DigiKey returned a list without an ID.");
    return id;
  }

  async function lookupDigiKey(identity, listSetting, fetcher) {
    const listId = parseListId(listSetting) || await discoverList(fetcher);
    const data = await getJson(`/en/mylists/api/lists/${encodeURIComponent(listId)}/parts/alternateParts/${encodeURIComponent(identity.sku)}`, fetcher);
    return fromDigiKey(data, identity);
  }

  const PROVIDERS = { digikey: "DigiKey", mouser: "Mouser", st: "STMicroelectronics", microchip: "Microchip", lcsc: "LCSC · package photos" };
  function assertMatch(found, requested) {
    if (!found || !sameManufacturer(found.manufacturer, requested.manufacturer) || !same(found.mpn, requested.mpn)) {
      throw new LookupError("identity", "No verified match for this exact manufacturer and ordering code. No origin assigned.");
    }
  }

  function productUrl(value, provider) {
    try {
      const u = new URL(value);
      const hosts = provider === "lcsc" ? ["www.lcsc.com"] : provider === "digikey" ? ["www.digikey.com"] : ["www.mouser.com", "eu.mouser.com"];
      const pattern = provider === "lcsc" ? /^\/product-detail\/C\d{1,12}\.html$/ : provider === "digikey" ? /^\/en\/products\/detail\/[^/]+\/[^/]+\/\d+\/?$/ : /^\/(?:en\/)?ProductDetail\/[^/]+\/[^/]+\/?$/;
      if (u.protocol !== "https:" || !hosts.includes(u.hostname) || u.username || u.password || u.port || !pattern.test(u.pathname)) throw new Error();
      // Drop tracking and any unrelated query parameters before requesting or linking.
      const qs = provider === "mouser" ? u.searchParams.get("qs") : null;
      return u.origin + u.pathname + (qs ? "?" + new URLSearchParams({ qs }) : "");
    } catch { throw new LookupError("url", "The source did not provide a supported product URL."); }
  }

  function sourceHost(provider, part) {
    if (provider === "lcsc") return "www.lcsc.com";
    if (provider === "microchip") return "www.microchip.com";
    return provider === "digikey" ? "www.digikey.com" : provider === "st" ? "www.st.com" : part.provider === "mouser" ? part.host : "www.mouser.com";
  }
  function sourceCacheKey(provider, part) {
    return CACHE_PREFIX + JSON.stringify([provider, sourceHost(provider, part), manufacturerKey(part.manufacturer), normalize(part.mpn).toLowerCase(), provider === part.provider ? part.sku : ""]);
  }
  function sourceFresh(entry, provider, part, now = Date.now()) {
    if (entry?.key !== sourceCacheKey(provider, part)) return false;
    const r = entry.result;
    const age = now - Date.parse(r?.checkedAt);
    return r?.version === VERSION && r.identity?.provider === provider && r.identity.host === sourceHost(provider, part) &&
      sameManufacturer(r.identity.manufacturer, part.manufacturer) && same(r.identity.mpn, part.mpn) &&
      Number.isFinite(age) && age >= 0 && age < CACHE_TTL && hasSourceEvidence(r) &&
      (provider !== "lcsc" || r.photoEvidence?.ocr?.version === OCR.VERSION);
  }

  function savedSource(entries, provider, part, now = Date.now()) {
    // Reports belong to the reporting source and exact part, not the tab that
    // collected them. Keep source SKU/region and original observation time.
    const matches = [];
    for (const [key, entry] of Object.entries(entries)) {
      const r = entry?.result, found = r?.identity;
      if (!key.startsWith(CACHE_PREFIX) || entry?.key !== key || r?.version !== VERSION ||
          found?.provider !== provider || (found.host !== sourceHost(provider, part) &&
            !(provider === "mouser" && r.sourceKind === "Mouser Search API" && ["www.mouser.com", "eu.mouser.com"].includes(found.host))) ||
          !sameManufacturer(found.manufacturer, part.manufacturer) || !same(found.mpn, part.mpn) ||
          !normalize(found.sku) || !Array.isArray(r.fields?.declaredCoo?.values) ||
          !hasSourceEvidence(r) || !r.fields.declaredCoo.values.every(v => typeof v === "string" && normalize(v))) continue;
      const age = now - Date.parse(r.checkedAt);
      if (!Number.isFinite(age) || age < 0 || age >= CACHE_RETENTION) continue;
      if (provider === part.provider && !same(found.sku, part.sku) &&
          !(provider === "digikey" && same(r.returnedSku, part.sku))) continue;
      // Accept earlier v2 records as well as source-SKU records written now.
      const names = [manufacturerKey(found.manufacturer), normalize(found.manufacturer).toLowerCase()];
      const validKeys = names.flatMap(name => [found.sku, ""].map(sku =>
        CACHE_PREFIX + JSON.stringify([provider, found.host, name, normalize(found.mpn).toLowerCase(), sku])));
      if (!validKeys.includes(key)) continue;
      try {
        if (provider === "microchip" && (r.sourceUrl !== microchipUrl(found) || found.sourceUrl !== r.sourceUrl)) continue;
        if (!["st", "microchip"].includes(provider) && (productUrl(r.sourceUrl, provider) !== productUrl(found.sourceUrl, provider) ||
          new URL(r.sourceUrl).hostname !== found.host)) continue;
      } catch { continue; }
      matches.push({ result: r, cached: true, stale: age >= CACHE_TTL });
    }
    return matches.sort((a,b) => Date.parse(b.result.checkedAt) - Date.parse(a.result.checkedAt))[0] || null;
  }

  function crossDigiKey(data, part) {
    const sourceUrl = productUrl(data?.partDetailUrl, "digikey");
    const identity = { provider: "digikey", host: "www.digikey.com", manufacturer: normalize(data.manufacturer),
      mpn: normalize(data.manufacturerPartNumber), sku: normalize(data.digiKeyPartNumber), sourceUrl };
    assertMatch(identity, part);
    return fromDigiKey(data, identity);
  }

  function mouserCandidate(doc, href, part) {
    const candidates = new Set();
    for (const a of doc.querySelectorAll('a[href*="ProductDetail"]')) {
      if (!same(a.textContent, part.mpn)) continue;
      try { candidates.add(productUrl(new URL(a.getAttribute("href"), href).href, "mouser")); } catch { /* Untrusted or irrelevant link. */ }
    }
    if (candidates.size !== 1) throw new LookupError("match", candidates.size ? "Mouser returned multiple exact candidates. Open its search results to choose a product." : "Mouser did not return a unique exact part. Open its search results to check availability or site verification.");
    return [...candidates][0];
  }

  function parseHtml(html) {
    // A disconnected template is inert: no scripts run or embedded resources load.
    // Its content is queried only, never inserted into the product page.
    const template = document.createElement("template");
    template.innerHTML = html;
    return template.content;
  }
  async function lookupMouser(part, request, parse = parseHtml, knownUrl = "") {
    let page = knownUrl ? await request("mouser-product", { url: productUrl(knownUrl, "mouser") }) : await request("mouser-search");
    let doc = parse(page.html);
    let found = readIdentity(doc, page.url);
    if (!found) {
      const url = mouserCandidate(doc, page.url, part);
      page = await request("mouser-product", { url });
      doc = parse(page.html);
      found = readIdentity(doc, page.url);
    }
    assertMatch(found, part);
    if (found.provider !== "mouser") throw new LookupError("identity", "Unexpected Mouser product response.");
    return fromMouser(doc, found);
  }

  async function lookupMouserAuto(part, request, websiteLookup = () => lookupMouser(part, request)) {
    try { return await request("mouser-api"); }
    catch (error) {
      // Only absence of a key uses the existing website adapter. Auth/quota errors
      // stay visible rather than triggering more requests to a different surface.
      if (error.code !== "api-unconfigured") throw error;
      try { return await websiteLookup(); }
      catch (websiteError) {
        if (["cancelled", "disabled", "extension"].includes(websiteError.code)) throw websiteError;
        const reason = websiteError.code === "auth" ? "Mouser blocked the website lookup." : "The Mouser website lookup did not return a usable result.";
        throw new LookupError("api-unconfigured", `${reason} No Search API key is saved in Origin Lens. Add one to look up Mouser without opening its website.`);
      }
    }
  }

  // Photo observations are reviewed evidence about the pictured sample, never
  // catalog COO or current inventory. A hash prevents applying a review to a
  // replacement image at the same URL. Automated readings are stored separately.
  const LCSC_REVIEWS = Object.freeze([Object.freeze({
    manufacturer: "STMicroelectronics", mpn: "STM32G491RET6", sku: "C3231005",
    imageUrl: "https://assets.lcsc.com/images/lcsc/900x900/20230511_STMicroelectronics-STM32G491RET6_C3231005_blank.jpg",
    sha256: "18a9f8dd08330efdc3aebbec6f89c6a12c98b86653b92c7e308d361763cb5568",
    marking: "CHN", country: "China", stage: "assembly", method: "visual review",
    reviewedAt: "2026-10-20T16:10:15.785Z",
    interpretationUrl: "https://community.st.com/stm32-mcus-products-25/does-anyone-have-a-cheat-sheet-to-tell-me-what-the-date-code-is-and-what-it-stands-for-34162"
  })]);
  function lcscSupported(part) {
    return sameManufacturer(part?.manufacturer, "STMicroelectronics") && /^STM32[A-Z0-9]+$/i.test(part?.mpn || "");
  }
  function lcscSearchUrl(part) {
    if (!lcscSupported(part)) throw new LookupError("unsupported", "Automatic LCSC photo lookup currently supports ST STM32 parts.");
    return "https://www.lcsc.com/category/941.html?" + new URLSearchParams({ scene: "FULL_MATCH", globalKeyword: part.mpn });
  }
  function lcscImageUrl(value, sku) {
    try {
      const u = new URL(value);
      if (!/^C\d{1,12}$/.test(sku) || u.protocol !== "https:" || u.hostname !== "assets.lcsc.com" || u.port || u.username || u.password || u.search || u.hash ||
        !/^\/images\/lcsc\/\d{2,4}x\d{2,4}\/[^/]+$/.test(u.pathname) ||
        !new RegExp("_" + sku + "_(?:front|back|blank)\\.(?:jpe?g|png|webp)$", "i").test(u.pathname)) throw new Error();
      return u.href;
    } catch { throw new LookupError("image", "LCSC did not provide a supported photo for this exact catalog item."); }
  }
  function lcscReview(part, images) {
    return LCSC_REVIEWS.find(r => sameManufacturer(r.manufacturer, part.manufacturer) && same(r.mpn, part.mpn) &&
      images.includes(r.imageUrl) && (part.provider !== "lcsc" || part.sku === r.sku)) || null;
  }
  function validLCSCPhotos(result) {
    try {
      const id = result?.identity, photos = result?.photoEvidence;
      if (id?.provider !== "lcsc" || !lcscSupported(id) || !photos || !Array.isArray(photos.images) ||
        !photos.images.length || photos.images.length > 6 || result.sourceUrl !== productUrl(id.sourceUrl, "lcsc") ||
        !result.sourceUrl.endsWith("/" + id.sku + ".html") ||
        ["declaredCoo", "assembly", "diffusion", "testing"].some(k => result.fields?.[k]?.values?.length)) return false;
      if (!photos.images.every(url => lcscImageUrl(url, id.sku) === url)) return false;
      if (photos.observation) {
        const known = lcscReview(id, photos.images), observation = photos.observation;
        if (!known || !Object.keys(known).every(k => observation[k] === known[k])) return false;
      }
      if (photos.ocr && !OCR.valid(photos.ocr, photos.images, id)) return false;
      return true;
    } catch { return false; }
  }
  function lcscCandidate(doc, href, part) {
    const urls = new Set();
    for (const link of doc.querySelectorAll('a[href*="/product-detail/"]')) {
      if (!same(link.textContent, part.mpn)) continue;
      try { urls.add(productUrl(new URL(link.getAttribute("href"), href).href, "lcsc")); } catch { /* Ignore unrelated links. */ }
    }
    if (urls.size !== 1) throw new LookupError("match", "LCSC did not return one exact ordering code. No photograph assigned.");
    return [...urls][0];
  }
  function fromLCSC(doc, href, part) {
    const sourceUrl = productUrl(href, "lcsc");
    const products = productJson(doc).filter(p => same(p.mpn, part.mpn));
    if (products.length !== 1) throw new LookupError("identity", "LCSC product metadata did not identify one exact ordering code.");
    const p = products[0];
    const identity = { provider: "lcsc", host: "www.lcsc.com", manufacturer: normalize(p.brand?.name || p.brand),
      mpn: normalize(p.mpn), sku: normalize(p.sku), sourceUrl };
    assertMatch(identity, part);
    if (!lcscSupported(identity) || !/^C\d{1,12}$/.test(identity.sku) || !sourceUrl.endsWith("/" + identity.sku + ".html") ||
      productUrl(p.offers?.url, "lcsc") !== sourceUrl) throw new LookupError("identity", "LCSC catalog identity or product URL did not match.");
    const images = [...new Set((Array.isArray(p.image) ? p.image : [p.image]).filter(v => typeof v === "string").flatMap(url => {
      try { return [lcscImageUrl(url, identity.sku)]; } catch { return []; }
    }))].slice(0, 6);
    if (!images.length) throw new LookupError("image", "LCSC has no supported part-specific photos for this listing.");
    return record(identity, {}, "LCSC reference photographs", { photoEvidence: { images, observation: null } });
  }
  async function lookupLCSC(part, request, parse = parseHtml, knownUrl = "") {
    if (!lcscSupported(part)) throw new LookupError("unsupported", "Automatic LCSC photo lookup currently supports ST STM32 parts.");
    let url = knownUrl && productUrl(knownUrl, "lcsc");
    if (!url) {
      const search = await request("lcsc-search");
      url = lcscCandidate(parse(search.html), search.url, part);
    }
    const page = await request("lcsc-product", { url });
    const result = fromLCSC(parse(page.html), page.url, part);
    const review = lcscReview(result.identity, result.photoEvidence.images);
    if (review) {
      try {
        result.photoEvidence.observation = await request("lcsc-review", { url: review.imageUrl });
        if (!result.photoEvidence.observation) result.photoEvidence.reviewNote = "The photo has changed since its marking was reviewed. Inspect the current photo.";
      } catch (error) {
        if (["cancelled", "disabled", "extension"].includes(error.code)) throw error;
        result.photoEvidence.reviewNote = "The reviewed photo could not be rechecked. No country assigned.";
      }
    }
    try {
      const report = await request("lcsc-ocr", { url: result.sourceUrl });
      if (!OCR.valid(report, result.photoEvidence.images, result.identity)) throw new LookupError("ocr", "Automatic photo reading could not be verified.");
      result.photoEvidence.ocr = report;
    } catch (error) {
      if (["cancelled", "disabled", "extension"].includes(error.code)) throw error;
      result.photoEvidence.ocr = { version: OCR.VERSION, engine: OCR.ENGINE, status: "unavailable",
        processedAt: new Date().toISOString(), readings: [], observations: [] };
    }
    if (!validLCSCPhotos(result)) throw new LookupError("image", "Photo evidence could not be verified.");
    return result;
  }

  function stFamily(part) {
    // This is only a candidate page path. The page's PF ID and exact order-code
    // mapping must both be verified; a family prefix is never origin evidence.
    const match = normalize(part.mpn).match(/^(STM32[A-Z]\d{3}[A-Z0-9]{2})[A-Z0-9]+$/i);
    return same(part.manufacturer, "STMicroelectronics") && match ? match[1].toLowerCase() : null;
  }
  function stParent(doc) {
    const id = doc.querySelector('#DataTables_Table_sample_and_buy[data-product-id]')?.getAttribute("data-product-id");
    const label = normalize(doc.querySelector('[data-attribute-id="5080"]')?.textContent);
    if (!/^PF\d+$/.test(id || "") || !same(label, "Country of Origin")) throw new LookupError("schema", "ST's product table or origin field could not be verified.");
    return id;
  }
  function stProduct(products, parentId, part) {
    if (!Array.isArray(products)) throw new LookupError("schema", "ST returned an unexpected ordering-code response.");
    const matches = products.filter(p => same(p.item_name, part.mpn));
    if (matches.length !== 1 || matches[0].parent_id !== parentId || !/^CP\d+$/.test(matches[0].prmis_id)) {
      throw new LookupError("identity", "ST did not provide one verified mapping for this full ordering code.");
    }
    return matches[0];
  }
  function fromST(attributes, product, part) {
    if (!Array.isArray(attributes) || attributes.some(a => a.prmis_id !== product.prmis_id || typeof a.attribute_name !== "string" || typeof a.attribute_value !== "string")) {
      throw new LookupError("schema", "ST returned attributes for an unexpected product or format.");
    }
    if (!stFamily(part) || !same(product.item_name, part.mpn)) throw new LookupError("identity", "ST ordering code did not match.");
    return record({ provider: "st", host: "www.st.com", manufacturer: "STMicroelectronics", mpn: product.item_name, sku: product.prmis_id,
      sourceUrl: `https://www.st.com/en/microcontrollers-microprocessors/${stFamily(part)}.html#sample-buy` },
      { declaredCoo: field(attributes.filter(a => a.attribute_name === "5080").map(a => a.attribute_value)) }, "ST Sample & Buy", { parentId: product.parent_id });
  }
  async function lookupST(part, request, parse = parseHtml) {
    if (!stFamily(part)) throw new LookupError("unsupported", "Manufacturer lookup currently supports STM32 ordering codes from STMicroelectronics.");
    const page = await request("st-family");
    const parentId = stParent(parse(page.html));
    return request("st-origin", { parentId });
  }

  function disagreement(results) {
    const signatures = results.filter(r => r.fields.declaredCoo.values.length).map(r =>
      [...new Set(r.fields.declaredCoo.values.map(v => normalize(v).toLowerCase()))].sort().join("\u0000"));
    return new Set(signatures).size > 1;
  }

  const api = { VERSION, CACHE_TTL, CACHE_RETENTION, CACHE_PREFIX, PROVIDERS, COMPONENT_TYPES, PREFERENCE_KEYS, typeKey, componentTypeEnabled, classifyCategories, readComponentType, LookupError, normalize, same, field, parseListId, cacheKey, isFresh, readIdentity, fromDigiKey, fromMouser, getJson, discoverList, lookupDigiKey,
    hasOriginEvidence, hasSourceEvidence, manufacturerKey, sameManufacturer, assertMatch, productUrl, sourceHost, sourceCacheKey, sourceFresh, savedSource, crossDigiKey, mouserCandidate, parseHtml, lookupMouser, lookupMouserAuto, fromMouserApi, manufacturerProvider, microchipUrl, fromMicrochip, stFamily, stParent, stProduct, fromST, lookupST, disagreement,
    lcscSupported, lcscSearchUrl, lcscImageUrl, lcscReview, validLCSCPhotos, lcscCandidate, fromLCSC, lookupLCSC };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OriginLens = Object.freeze(api);
})(globalThis);
