(function (root) {
  "use strict";
  const C = root.OriginLens || require("./core.js");
  const PREFIX = "origin-lens:options:v1:";
  const LIMIT = 64;
  const ATTRIBUTES = { package: "4363", packing: "1069", temperatureMin: "960", temperatureMax: "962", origin: "5080" };
  const url = part => `https://www.st.com/en/microcontrollers-microprocessors/${C.stFamily(part)}.html#sample-buy`;
  const key = part => PREFIX + C.stFamily(part);
  const fail = message => { throw new C.LookupError("schema", message); };

  function parent(doc) {
    const id = C.stParent(doc);
    // Verify the page's labels before interpreting numeric attribute identifiers.
    const labels = { "4363": "Package", "1069": "Packing Type", "960": "Operating temperature (°C)", "962": "Operating Temperature (°C) (max)" };
    for (const [attribute, label] of Object.entries(labels)) {
      if (!C.same(doc.querySelector(`#DataTables_Table_sample_and_buy th[data-attribute-id="${attribute}"]`)?.textContent, label)) {
        fail("ST's ordering-option columns have changed. Open the ST family table to inspect them.");
      }
    }
    return id;
  }

  function productsFor(products, parentId, part) {
    if (!C.stFamily(part) || !/^PF\d{1,12}$/.test(parentId || "")) fail("Invalid ST family.");
    C.stProduct(products, parentId, part);
    if (products.length > LIMIT) fail(`ST returned more than ${LIMIT} ordering codes. Open its family table for the full comparison.`);
    const names = new Set(), ids = new Set();
    for (const p of products) {
      if (!p || p.parent_id !== parentId || !/^CP\d{1,12}$/.test(p.prmis_id || "") ||
          typeof p.item_name !== "string" || !/^STM32[A-Z0-9]{5,35}$/i.test(p.item_name) ||
          C.stFamily({ ...part, mpn: p.item_name }) !== C.stFamily(part) ||
          names.has(p.item_name.toUpperCase()) || ids.has(p.prmis_id)) {
        fail("ST returned inconsistent family membership. No ordering-option comparison was assigned.");
      }
      names.add(p.item_name.toUpperCase()); ids.add(p.prmis_id);
    }
    return products.map(p => ({ item_name: p.item_name, prmis_id: p.prmis_id, parent_id: p.parent_id,
      p_163: typeof p.p_163 === "string" ? C.normalize(p.p_163).slice(0,100) : "" }));
  }

  function attributesFor(attributes, productId) {
    if (!Array.isArray(attributes) || attributes.length > 500 || attributes.some(a => !a || a.prmis_id !== productId ||
        typeof a.attribute_name !== "string" || typeof a.attribute_value !== "string" || a.attribute_value.length > 1000)) {
      fail("ST returned inconsistent attributes for this ordering code.");
    }
    return attributes.filter(a => Object.values(ATTRIBUTES).includes(a.attribute_name))
      .map(a => ({ prmis_id: a.prmis_id, attribute_name: a.attribute_name, attribute_value: a.attribute_value }));
  }

  function make(part, parentId, products, observations, checkedAt = new Date().toISOString()) {
    const report = { version: 1, kind: "st-ordering-options", family: C.stFamily(part), parentId,
      products: productsFor(products, parentId, part), observations, checkedAt, sourceUrl: url(part) };
    rows(report, part);
    return report;
  }

  function rows(report, part) {
    if (report?.version !== 1 || report.kind !== "st-ordering-options" || report.family !== C.stFamily(part) ||
        report.sourceUrl !== url(part) || !Number.isFinite(Date.parse(report.checkedAt))) fail("Invalid saved ST comparison.");
    const products = productsFor(report.products, report.parentId, part), observations = report.observations;
    if (!Array.isArray(observations) || observations.length !== products.length ||
        new Set(observations.map(o => o?.productId)).size !== products.length) fail("Incomplete ST observation mapping.");
    return products.map(p => {
      const o = observations.find(o => o?.productId === p.prmis_id);
      if (!o || !Number.isFinite(Date.parse(o.checkedAt)) || Date.parse(o.checkedAt) > Date.parse(report.checkedAt) ||
          (o.error !== undefined && (typeof o.error !== "string" || o.error.length > 300))) fail("Invalid ST observation.");
      const attributes = attributesFor(o.attributes, p.prmis_id);
      if (o.error && attributes.length) fail("Failed ST observations cannot carry reported attributes.");
      return { mpn: p.item_name, productId: p.prmis_id, status: p.p_163, checkedAt: o.checkedAt, error: o.error,
        ...Object.fromEntries(Object.entries(ATTRIBUTES).map(([name, id]) =>
          [name, C.field(attributes.filter(a => a.attribute_name === id).map(a => a.attribute_value))])) };
    });
  }

  function comparison(report, part) {
    const options = rows(report, part), current = options.find(r => C.same(r.mpn, part.mpn));
    const compare = (a, b) => !a.values.length || !b.values.length ? "unknown" :
      JSON.stringify(a.values.map(v => v.toLowerCase()).sort()) === JSON.stringify(b.values.map(v => v.toLowerCase()).sort()) ? "same" : "different";
    const compared = options.map(row => {
      const changes = Object.fromEntries(Object.keys(ATTRIBUTES).map(name => [name, compare(row[name], current[name])]));
      changes.temperature = [changes.temperatureMin, changes.temperatureMax].includes("unknown") ? "unknown" :
        [changes.temperatureMin, changes.temperatureMax].includes("different") ? "different" : "same";
      const isCurrent = C.same(row.mpn, part.mpn);
      const group = isCurrent ? "current" : changes.package === "different" ? "package" :
        changes.package === "same" && changes.temperature === "different" ? "temperature" :
        changes.package === "same" && changes.temperature === "same" && changes.packing === "different" ? "packing" : "other";
      return { ...row, current: isCurrent, changes, group };
    });
    const rank = ["current", "packing", "temperature", "package", "other"];
    return compared.sort((a,b) => rank.indexOf(a.group) - rank.indexOf(b.group) || a.mpn.localeCompare(b.mpn));
  }

  function saved(entries, part, now = Date.now()) {
    const report = entries[key(part)];
    try {
      const options = rows(report, part), age = now - Date.parse(report.checkedAt);
      if (!Number.isFinite(age) || age < 0 || age >= C.CACHE_RETENTION) return null;
      const incomplete = options.some(r => r.error);
      return { report, cached: true, stale: age >= (incomplete ? 5 * 60_000 : C.CACHE_TTL) };
    } catch { return null; }
  }

  async function lookup(part, request, parse = C.parseHtml) {
    const page = await request("st-family");
    return request("st-options", { parentId: parent(parse(page.html)) });
  }

  const api = { PREFIX, LIMIT, ATTRIBUTES, url, key, parent, productsFor, attributesFor, make, rows, comparison, saved, lookup };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OriginLensOptions = Object.freeze(api);
})(globalThis);
