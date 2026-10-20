/* Fixed read-only source operations, shared by the worker and offline tests. */
((root) => {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.OriginLens;
  const MAX_BYTES = 4 * 1024 * 1024;
  const allowedHosts = ["www.digikey.com", "www.mouser.com", "eu.mouser.com", "api.mouser.com", "www.microchip.com", "www.st.com", "ksmk.st.com", "www.lcsc.com", "assets.lcsc.com"];

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

  async function read(url, kind, fetcher = fetch, postBody) {
    const u = new URL(url);
    if (u.protocol !== "https:" || !allowedHosts.includes(u.hostname) || u.username || u.password || u.port) throw new C.LookupError("request", "Unsupported source.");
    const isApi = u.hostname === "api.mouser.com";
    const mouserWebsite = ["www.mouser.com", "eu.mouser.com"].includes(u.hostname);
    const name = isApi ? "Mouser API" : mouserWebsite ? "Mouser" : u.hostname.endsWith(".lcsc.com") ? "LCSC" : u.hostname === "www.microchip.com" ? "Microchip" : "ST";
    let r;
    try {
      r = await fetcher(u.href, { method: postBody ? "POST" : "GET", credentials: mouserWebsite ? "include" : "omit", cache: "no-store",
        redirect: mouserWebsite ? "follow" : "error", signal: AbortSignal.timeout(12000), headers: { Accept: kind === "image" ? "image/jpeg,image/png,image/webp" : kind === "json" ? "application/json" : "text/html", ...(postBody ? { "Content-Type": "application/json" } : {}) }, ...(postBody ? { body: JSON.stringify(postBody) } : {}) });
    } catch (error) {
      if (error instanceof C.LookupError) throw error;
      throw new C.LookupError("network", `${name} could not be reached. Retry later.`);
    }
    if (isApi && (r.status === 401 || r.status === 403)) throw new C.LookupError("api-auth", "Check the Mouser Search API key in Origin Lens settings.");
    if (r.status === 401 || r.status === 403) throw new C.LookupError("auth", `${name} requires sign-in or site verification. Open it normally, then retry.`);
    if (r.status === 429) throw new C.LookupError("rate", `${name} is limiting requests. Wait before retrying.`);
    if (!r.ok) throw new C.LookupError("http", `${name} lookup failed (HTTP ${r.status}).`);
    const final = new URL(r.url || url);
    if (final.protocol !== "https:" || final.username || final.password || final.port ||
      (mouserWebsite ? !["www.mouser.com", "eu.mouser.com"].includes(final.hostname) : final.origin !== u.origin)) {
      throw new C.LookupError("redirect", `${name} redirected outside the supported source.`);
    }
    const contentType = r.headers.get("content-type") || "";
    if (kind === "image" ? !/^image\/(?:jpeg|png|webp)(?:;|$)/i.test(contentType) : !contentType.includes(kind === "json" ? "json" : "html")) throw new C.LookupError("schema", `${name} returned an unexpected response format.`);
    if (Number(r.headers.get("content-length")) > MAX_BYTES) throw new C.LookupError("size", `${name}'s response was too large.`);
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
        if (size > MAX_BYTES) { await reader.cancel(); throw new C.LookupError("size", `${name}'s response was too large.`); }
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
    try { return JSON.parse(text); } catch { throw new C.LookupError("schema", `${name} returned unreadable data.`); }
  }

  async function readLCSCImage(url, identity, fetcher = fetch) {
    if (identity?.provider !== "lcsc" || !C.lcscSupported(identity)) throw new C.LookupError("request", "Unsupported photo identity.");
    return read(C.lcscImageUrl(url, identity.sku), "image", fetcher);
  }
  async function run(message, listSetting = "", fetcher = fetch, credentials = {}) {
    const { part, operation } = message;
    validatePart(part);
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
    if (operation === "st-origin") {
      if (!/^PF\d{1,12}$/.test(message.parentId || "")) throw new C.LookupError("request", "Invalid ST family identifier.");
      const products = await read(`https://ksmk.st.com/products/productsByParentId?parentId=${message.parentId}`, "json", fetcher);
      const product = C.stProduct(products, message.parentId, part);
      const attributes = await read(`https://ksmk.st.com/viewAttributes/getListOfViewAttributes?prmisId=${product.prmis_id}`, "json", fetcher);
      return C.fromST(attributes, product, part);
    }
    throw new C.LookupError("request", "Unsupported source operation.");
  }
  const api = { validatePart, allowedSender, readLCSCImage, run };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OriginLensNetwork = Object.freeze(api);
})(globalThis);
