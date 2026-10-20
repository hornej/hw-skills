/* Fixed read-only source operations, shared by the worker and offline tests. */
((root) => {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.OriginLens;
  const MAX_BYTES = 4 * 1024 * 1024;
  const infineonOrg = "infineontechnologiesproduction6kx2o63f";
  const infineonSearch = `https://${infineonOrg}.org.coveo.com/rest/search/v2`;
  const tiSearch = "https://www.ti.com/importdetailsmodel/api/v1/ext/secured/material-import-details?locale=en-US";
  const allowedHosts = ["www.digikey.com", "www.mouser.com", "eu.mouser.com", "api.mouser.com", "www.microchip.com", "www.st.com", "ksmk.st.com", "www.lcsc.com", "assets.lcsc.com", "www.infineon.com", `${infineonOrg}.org.coveo.com`, "www.harwin.com", "www.samtec.com", "www.ti.com"];

  function validatePart(part) {
    if (!part || !["digikey", "mouser"].includes(part.provider) || ![part.manufacturer, part.mpn, part.sku].every(v => typeof v === "string" && v.trim() && v.length <= 180 && !/[\x00-\x1f]/.test(v))) {
      throw new C.LookupError("request", "Invalid component identity.");
    }
    if (part.componentType !== undefined && !C.COMPONENT_TYPES.some(t => t.id === part.componentType)) {
      throw new C.LookupError("request", "Invalid component type.");
    }
    const url = C.productUrl(part.sourceUrl, part.provider);
    if (new URL(url).hostname !== part.host) throw new C.LookupError("request", "Invalid component host.");
  }
  function allowedSender(sender, extensionId) {
    if (sender?.id !== extensionId || sender.frameId !== 0 || !sender.tab) return false;
    try { return !!C.productUrl(sender.url, new URL(sender.url).hostname === "www.digikey.com" ? "digikey" : "mouser"); } catch { return false; }
  }

  async function read(url, kind, fetcher = fetch, postBody, token) {
    const u = new URL(url);
    if (u.protocol !== "https:" || !allowedHosts.includes(u.hostname) || u.username || u.password || u.port) throw new C.LookupError("request", "Unsupported source.");
    if (token && u.href !== infineonSearch) throw new C.LookupError("request", "Unsupported search-token destination.");
    const maxBytes = kind === "text" ? 16384 : MAX_BYTES;
    const isApi = u.hostname === "api.mouser.com";
    const tiImport = u.href === tiSearch;
    const mouserWebsite = ["www.mouser.com", "eu.mouser.com"].includes(u.hostname);
    const name = tiImport ? "TI" : isApi ? "Mouser API" : mouserWebsite ? "Mouser" : u.hostname.endsWith(".lcsc.com") ? "LCSC" : u.hostname === "www.microchip.com" ? "Microchip" : u.hostname === "www.infineon.com" || u.href === infineonSearch ? "Infineon" : u.hostname === "www.harwin.com" ? "Harwin" : u.hostname === "www.samtec.com" ? "Samtec" : "ST";
    let r;
    try {
      r = await fetcher(u.href, { method: postBody ? "POST" : "GET", credentials: mouserWebsite || tiImport ? "include" : "omit", cache: "no-store",
        redirect: mouserWebsite ? "follow" : "error", signal: AbortSignal.timeout(tiImport ? 25000 : 12000), headers: { Accept: kind === "image" ? "image/jpeg,image/png,image/webp" : kind === "json" ? "application/json" : kind === "text" ? "text/plain" : "text/html", ...(postBody ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(postBody ? { body: JSON.stringify(postBody) } : {}) });
    } catch (error) {
      if (error instanceof C.LookupError) throw error;
      throw new C.LookupError("network", `${name} could not be reached. Retry later.`);
    }
    if (isApi && (r.status === 401 || r.status === 403)) throw new C.LookupError("api-auth", "Check the Mouser Search API key in Origin Lens settings.");
    if (tiImport && (r.status === 401 || r.status === 403)) throw new C.LookupError("auth", "Sign in to myTI in this browser, then click Refresh.");
    if (r.status === 401 || r.status === 403) throw new C.LookupError("auth", `${name} requires sign-in or site verification. Open it normally, then retry.`);
    if (r.status === 429) throw new C.LookupError("rate", `${name} is limiting requests. Wait before retrying.`);
    if (!r.ok) throw new C.LookupError("http", `${name} lookup failed (HTTP ${r.status}).`);
    const final = new URL(r.url || url);
    if (final.protocol !== "https:" || final.username || final.password || final.port ||
      (tiImport ? final.href !== tiSearch : mouserWebsite ? !["www.mouser.com", "eu.mouser.com"].includes(final.hostname) : final.origin !== u.origin)) {
      throw new C.LookupError("redirect", `${name} redirected outside the supported source.`);
    }
    const contentType = r.headers.get("content-type") || "";
    if (tiImport && contentType.includes("html")) throw new C.LookupError("auth", "TI returned a sign-in page. Sign in to myTI in this browser, then click Refresh.");
    if (kind === "image" ? !/^image\/(?:jpeg|png|webp)(?:;|$)/i.test(contentType) : !contentType.includes(kind === "json" ? "json" : kind === "text" ? "text/plain" : "html")) throw new C.LookupError("schema", `${name} returned an unexpected response format.`);
    if (Number(r.headers.get("content-length")) > maxBytes) throw new C.LookupError("size", `${name}'s response was too large.`);
    // Stream with a bound so a changed/error page cannot consume unbounded memory.
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let size = 0, text = "";
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new C.LookupError("size", `${name}'s response was too large.`); }
        if (kind === "image") chunks.push(value);
        else text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } catch (e) {
      if (e instanceof C.LookupError) throw e;
      throw new C.LookupError("network", `${name}'s response could not be read. Retry later.`);
    }
    if (kind === "image") {
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return bytes;
    }
    if (kind === "html") return { url: final.href, html: text };
    if (kind === "text") return text;
    try { return JSON.parse(text); } catch { throw new C.LookupError("schema", `${name} returned unreadable data.`); }
  }

  async function readLCSCImage(url, identity, fetcher = fetch) {
    if (identity?.provider !== "lcsc" || !C.lcscSupported(identity)) throw new C.LookupError("request", "Unsupported photo identity.");
    return read(C.lcscImageUrl(url, identity.sku), "image", fetcher);
  }
  async function run(message, listSetting = "", fetcher = fetch, credentials = {}) {
    const { part, operation } = message;
    validatePart(part);
    if (operation === "ti") {
      const body = C.tiRequest(part);
      return C.fromTI(await read(tiSearch, "json", fetcher, body), part);
    }
    if (typeof operation === "string" && operation.startsWith("lcsc-")) {
      if (!C.lcscSupported(part)) throw new C.LookupError("unsupported", "Automatic LCSC photo lookup currently supports ST STM32 parts.");
      if (operation === "lcsc-search") return read(C.lcscSearchUrl(part), "html", fetcher);
      if (operation === "lcsc-product") return read(C.productUrl(message.url, "lcsc"), "html", fetcher);
      if (operation === "lcsc-review") {
        const review = C.lcscReview(part, [message.url]);
        if (!review) throw new C.LookupError("request", "No reviewed photograph matches this part.");
        const bytes = await read(review.imageUrl, "image", fetcher);
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const sha256 = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
        return sha256 === review.sha256 ? { ...review } : null;
      }
      throw new C.LookupError("request", "Unsupported photo operation.");
    }
    if (operation === "mouser-api") {
      const key = credentials.mouserApiKey;
      if (!key) throw new C.LookupError("api-unconfigured", "Add a Mouser Search API key in Origin Lens settings to enable automatic API lookup.");
      if (typeof key !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(key)) throw new C.LookupError("api-auth", "Check the Mouser Search API key in Origin Lens settings.");
      if (part.mpn.length < 3 || part.mpn.length > 40 || part.mpn.includes("|")) throw new C.LookupError("request", "This ordering code is outside Mouser Search API's single-part format.");
      const data = await read(`https://api.mouser.com/api/v1/search/partnumber?apiKey=${encodeURIComponent(key)}`, "json", fetcher,
        { SearchByPartRequest: { mouserPartNumber: part.mpn, partSearchOptions: "Exact" } });
      return C.fromMouserApi(data, part);
    }
    if (operation === "microchip") {
      if (C.manufacturerProvider(part) !== "microchip") throw new C.LookupError("request", "Unsupported Microchip manufacturer identity.");
      return C.fromMicrochip(await read(C.microchipUrl(part), "json", fetcher), part);
    }
    if (["samtec", "harwin"].includes(operation)) {
      return read(C.manufacturerPageUrl(operation, part), "html", fetcher);
    }
    if (operation === "infineon") {
      if (C.manufacturerProvider(part) !== "infineon" || !/^[a-z0-9][a-z0-9 /+._-]{1,79}$/i.test(part.mpn)) throw new C.LookupError("request", "Unsupported Infineon ordering code.");
      const response = await read("https://www.infineon.com/content/ifx/en/search/eccn-hts-finder.coveoSearch.txt", "text", fetcher);
      const token = response.match(/^Search Token =\s*([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\s*$/)?.[1];
      if (!token || token.length > 8192) throw new C.LookupError("schema", "Infineon's public search service is unavailable.");
      const data = await read(infineonSearch, "json", fetcher, {
        organizationId: infineonOrg, searchHub: "IFXEccnAndHtsFinderSearchHub", pipeline: "IFXECCNAndHTSFinder",
        q: `@opn_name=="${part.mpn}"`, enableQuerySyntax: true, numberOfResults: 100,
        fieldsToInclude: ["sp_number", "opn_name", "material_number", "eccn_coo", "eccn_coa", "eccn_cod", "region_of_operations"],
        context: { env: "prod" }
      }, token);
      return C.fromInfineon(data, part);
    }
    if (operation === "digikey") {
      const dkFetch = (path, options) => fetcher("https://www.digikey.com" + path, { ...options, credentials: "include" });
      if (part.provider === "digikey") return C.lookupDigiKey(part, listSetting, dkFetch);
      const id = C.parseListId(listSetting) || await C.discoverList(dkFetch);
      const data = await C.getJson(`/en/mylists/api/lists/${encodeURIComponent(id)}/parts/alternateParts/${encodeURIComponent(part.mpn)}`, dkFetch);
      return C.crossDigiKey(data, part);
    }
    if (operation === "mouser-search") return read(`https://www.mouser.com/c/?q=${encodeURIComponent(part.mpn)}`, "html", fetcher);
    if (operation === "mouser-product") return read(C.productUrl(message.url, "mouser"), "html", fetcher);
    const family = C.stFamily(part);
    if (!family) throw new C.LookupError("unsupported", "Manufacturer lookup currently supports STM32 ordering codes from STMicroelectronics.");
    if (operation === "st-family") return read(`https://www.st.com/en/microcontrollers-microprocessors/${family}.html`, "html", fetcher);
    if (operation === "st-origin" || operation === "st-options") {
      if (!/^PF\d{1,12}$/.test(message.parentId || "")) throw new C.LookupError("request", "Invalid ST family identifier.");
      const products = await read(`https://ksmk.st.com/products/productsByParentId?parentId=${message.parentId}`, "json", fetcher);
      const product = C.stProduct(products, message.parentId, part);
      if (operation === "st-options") {
        const O = root.OriginLensOptions || require("./st-options.js");
        const members = O.productsFor(products, message.parentId, part), observations = new Array(members.length);
        // Bound concurrency and total work; preserve every enumerated code even when an attribute request fails.
        const deadline = Date.now() + 45_000;
        let next = 0, stopped;
        await Promise.all(Array.from({ length: Math.min(3, members.length) }, async () => {
          while (next < members.length) {
            credentials.signal?.throwIfAborted();
            const index = next++, member = members[index];
            let attributes = [], error;
            try {
              if (stopped) throw stopped;
              if (Date.now() >= deadline) throw new C.LookupError("timeout", "Comparison time limit reached; refresh to retry.");
              const raw = await read(`https://ksmk.st.com/viewAttributes/getListOfViewAttributes?prmisId=${member.prmis_id}`, "json", fetcher);
              attributes = O.attributesFor(raw, member.prmis_id);
            } catch (e) {
              credentials.signal?.throwIfAborted();
              if (["auth", "rate"].includes(e.code)) stopped = e;
              error = e instanceof C.LookupError ? e.message : "This ordering code could not be checked.";
            }
            observations[index] = { productId: member.prmis_id, attributes, checkedAt: new Date().toISOString(), ...(error ? { error } : {}) };
          }
        }));
        return O.make(part, message.parentId, members, observations);
      }
      const attributes = await read(`https://ksmk.st.com/viewAttributes/getListOfViewAttributes?prmisId=${product.prmis_id}`, "json", fetcher);
      return C.fromST(attributes, product, part);
    }
    throw new C.LookupError("request", "Unsupported source operation.");
  }
  const api = { validatePart, allowedSender, readLCSCImage, run };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OriginLensNetwork = Object.freeze(api);
})(globalThis);
