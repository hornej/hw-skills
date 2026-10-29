/* Results-page identity, evidence and filtering; no network or DOM mutations. */
((root) => {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.OriginLens;
  const STAGES = Object.freeze({ declaredCoo: "Origin", assembly: "Assembly", diffusion: "Wafer / diffusion", testing: "Testing" });
  function readRows(doc, href) {
    if (!C.isDigiKeyResultsUrl(href)) return [];
    const componentType = C.readComponentType(doc, href), rows = [];
    for (const row of doc.querySelectorAll("table tbody tr")) {
      const links = row.querySelectorAll('[data-testid="data-table-product-number"]');
      const identities = row.querySelectorAll("[data-product-number][data-mfg-number][data-mfg-name][data-id]");
      if (links.length !== 1 || identities.length !== 1) continue;
      const link = links[0], data = identities[0], anchor = link.closest('[data-atag="tr-product"]');
      const manufacturer = C.normalize(data.getAttribute("data-mfg-name"));
      const mpn = C.normalize(data.getAttribute("data-mfg-number"));
      const sku = C.normalize(data.getAttribute("data-product-number"));
      const mfr = row.querySelector('[data-testid="data-table-mfr-link"]');
      if (!anchor || !manufacturer || !mpn || !sku || !C.same(link.textContent, mpn) ||
          !C.sameManufacturer(mfr?.textContent, manufacturer)) continue;
      try {
        const sourceUrl = C.productUrl(new URL(link.getAttribute("href"), href).href, "digikey");
        const id = new URL(sourceUrl).pathname.split("/").filter(Boolean).pop();
        if (id !== data.getAttribute("data-id") || id !== link.getAttribute("data-product-id")) continue;
        rows.push({ row, anchor, part: { provider: "digikey", host: "www.digikey.com", manufacturer, mpn, sku, sourceUrl, componentType } });
      } catch { /* Incomplete or changed rows stay untouched. */ }
    }
    return rows;
  }
  function providers(part) {
    const manufacturer = C.manufacturerProvider(part);
    return ["digikey", "mouser", ...(manufacturer !== "st" || C.stFamily(part) ? [manufacturer] : [])];
  }
  function countryName(value) {
    const raw = C.normalize(value);
    const aliases = { CN: "China", CHN: "China", PRC: "China", TW: "Taiwan", TWN: "Taiwan", ROC: "Taiwan", US: "United States", USA: "United States", "UNITED STATES OF AMERICA": "United States", UK: "United Kingdom", GB: "United Kingdom", GBR: "United Kingdom", MY: "Malaysia", MYS: "Malaysia", PH: "Philippines", PHL: "Philippines", IT: "Italy", ITA: "Italy" };
    if (aliases[raw.toUpperCase()]) return aliases[raw.toUpperCase()];
    if (/^[A-Z]{2}$/i.test(raw)) {
      try { return new Intl.DisplayNames(["en"], { type: "region", fallback: "none" }).of(raw.toUpperCase()) || raw; } catch { return raw; }
    }
    return raw.replace(/\p{L}+/gu, (word, offset) => {
      const lower = word.toLocaleLowerCase("en");
      return offset > 0 && /^(?:of|and|the|d)$/.test(lower) ? lower : lower.charAt(0).toLocaleUpperCase("en") + lower.slice(1);
    });
  }
  function facts(part, states, scope = "all") {
    const facts = [];
    for (const provider of providers(part)) {
      const result = states[provider]?.result;
      for (const [key, label] of Object.entries(STAGES)) {
        if (scope !== "all" && scope !== key) continue;
        const countries = [...new Set((result?.fields[key]?.values || []).map(countryName))];
        if (countries.length) facts.push({ provider, label, countries, filterable: true });
      }
      if (result?.fields.probableCoo?.values.length) facts.push({ provider, label: "Probable origin", countries: result.fields.probableCoo.values.map(countryName), filterable: false });
    }
    if (scope === "all" || scope === "assembly") {
      const countries = [...new Set(C.stAssemblyDocuments(part).flatMap(doc => doc.sites.map(site => countryName(site.country))))];
      if (countries.length) facts.push({ provider: "st", label: "Assembly · ST PCN", countries, filterable: true });
    }
    return facts;
  }
  function matches(facts, { mode = "all", country = "", keepUnknown = true } = {}) {
    if (mode === "all" || !country) return true;
    const countries = facts.filter(f => f.filterable).flatMap(f => f.countries);
    if (!countries.length) return keepUnknown;
    const found = countries.some(value => countryName(value) === countryName(country));
    return mode === "exclude" ? !found : found;
  }
  const api = { STAGES, readRows, providers, countryName, facts, matches };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OriginLensResults = Object.freeze(api);
})(globalThis);
