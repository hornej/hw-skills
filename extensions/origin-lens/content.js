(() => {
  "use strict";
  if (globalThis.__originLensLoaded) return;
  globalThis.__originLensLoaded = true;
  const C = globalThis.OriginLens;
  const O = globalThis.OriginLensOptions;
  let identity, fingerprint = "", host, ui, generation = 0, timer, closed = false, collapsed = false;
  let enabled = false, settingsReady = false, lookupController, sourceChanges;
  const preferences = {}, changedPreferences = new Set();
  const el = (tag, text, parent) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (parent) parent.append(node);
    return node;
  };

  function mount() {
    host = document.createElement("aside");
    host.id = "origin-lens-panel";
    host.style.cssText = "display:block;width:100%;margin:16px 0;position:relative;z-index:1";
    const shadow = host.attachShadow({ mode: "open" });
    el("style", `
      :host{all:initial;display:block;color-scheme:light dark;--paper:#fff;--ink:#181818;--muted:#595959;--rule:#b5b5b5;--hover:#ededed;--link:#0057b8;--warning:#8b3600;container-type:inline-size}
      *{box-sizing:border-box}
      .card{position:relative;font:13px/1.45 "Cascadia Mono",Consolas,"Liberation Mono",monospace;color:var(--ink);background:var(--paper);border:1px solid var(--rule);padding:16px;max-width:760px}
      .panel-disclosure{margin:0;font:inherit}
      .panel-summary{display:flex;align-items:center;gap:12px;min-height:28px;margin-right:42px;padding:0;list-style:none}
      .panel-summary::-webkit-details-marker{display:none}
      .panel-summary::before{content:"▸";flex:0 0 10px}
      .panel-disclosure[open]>.panel-summary::before{content:"▾"}
      .panel-title{font-size:18px;line-height:1.3;font-weight:700;flex:1}
      .disclosure-action{font-size:11px}
      .tag{font-size:11px;white-space:nowrap}p{margin:8px 0 0}.part{font-size:13px;overflow-wrap:anywhere}
      .status{font-size:11px;margin:10px 0 14px;color:var(--muted);overflow-wrap:anywhere}.status.error{color:var(--warning)}
      .results{border-top:1px solid var(--ink)}
      .report{padding:14px 0;border-bottom:1px solid var(--rule)}
      .ordering-options{padding:14px 0;border-bottom:1px solid var(--rule)}
      .ordering-options:empty{display:none}
      .ordering-options h3{font-size:13px;margin:0}
      .options-scroll{overflow:auto;margin-top:10px}
      .options-table{border-collapse:collapse;width:100%;min-width:660px;font-size:11px;line-height:1.5}
      .options-table caption{text-align:left;color:var(--muted);padding-bottom:8px}
      .options-table th,.options-table td{padding:10px 8px;text-align:left;vertical-align:top;border-top:1px solid var(--rule)}
      .options-table thead th{font-weight:400;color:var(--muted)}
      .options-table tbody th{min-width:175px;font-weight:400}
      .options-table tr[data-current]{background:var(--hover)}
      .options-table .changed{font-weight:700}
      .option-links{display:flex;gap:10px;margin-top:5px}
      .option-change{display:block;color:var(--muted);font-weight:400;margin-top:4px}
      .report-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px}
      .report h3{font-size:13px;margin:0;overflow-wrap:anywhere}
      .country{font-size:16px;line-height:1.3;font-weight:700;text-align:right;overflow-wrap:anywhere}
      .report .status{margin:5px 0;font-size:11px}
      .source{margin:5px 0 0;font-size:11px;overflow-wrap:anywhere}
      .source span{display:block;margin-top:3px;color:var(--muted)}
      a{color:var(--link);text-decoration:underline;text-underline-offset:2px}
      details{margin-top:8px;font-size:11px}summary{cursor:pointer;min-height:24px;padding-block:3px}
      dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px;margin:10px 0}
      dt{font-size:11px;color:var(--muted)}dd{margin:2px 0 0;font-size:13px;font-weight:700;overflow-wrap:anywhere}
      dd.unknown{font-weight:400;color:var(--muted)}
      .note{font-size:11px;color:var(--muted);overflow-wrap:anywhere}
      .photo-evidence{margin:12px 0 0;max-width:280px}.photo-evidence img{display:block;width:100%;height:auto;aspect-ratio:1;object-fit:contain;border:1px solid var(--rule);background:#fff}
      .photo-evidence img[hidden]{display:none}
      .photo-evidence figcaption{margin-top:6px;font-size:11px;color:var(--muted)}.photo-links{display:flex;gap:12px;flex-wrap:wrap;padding:0;list-style:none}
      .actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}
      button{font:inherit;font-size:12px;font-weight:700;cursor:pointer;border:1px solid var(--ink);background:var(--paper);color:var(--ink);border-radius:0;padding:6px 10px;min-height:32px}
      button:hover{background:var(--hover)}button:disabled{opacity:.55;cursor:wait}
      :is(button,a,summary,input,[tabindex]):focus-visible{outline:2px solid var(--link);outline-offset:3px}
      .close{position:absolute;right:16px;top:16px;font-size:18px;font-weight:400;line-height:1;padding:0;width:28px;min-height:28px}
      footer{margin-top:12px;font-size:11px;color:var(--muted)}
      form{margin-top:8px}label{display:block;margin-bottom:5px}
      input{font:inherit;width:100%;padding:7px;border:1px solid var(--rule);border-radius:0;background:var(--paper);color:var(--ink);margin-bottom:7px}
      @container(max-width:440px){.card{padding:12px}.panel-summary{gap:8px}.panel-title{font-size:16px}.tag{display:none}.close{right:12px;top:12px}.report-head{flex-wrap:wrap;gap:4px 12px}.country{text-align:left}dl{grid-template-columns:1fr}}
      @media(prefers-color-scheme:dark){:host{--paper:#181818;--ink:#eee;--muted:#acacac;--rule:#494949;--hover:#282828;--link:#8acbff;--warning:#ffc38a}}
      @media(pointer:coarse){button,summary{min-height:48px}.panel-summary{min-height:48px;margin-right:60px}.close{width:48px;min-height:48px}}
      @media(forced-colors:active){:host{--paper:Canvas;--ink:CanvasText;--muted:CanvasText;--rule:ButtonBorder;--hover:Canvas;--link:LinkText;--warning:CanvasText}}
    `, shadow);
    const card = el("section", undefined, shadow); card.className = "card"; card.setAttribute("aria-label", "Origin Lens");
    const disclosure = el("details", undefined, card); disclosure.className = "panel-disclosure"; disclosure.open = !collapsed;
    const summary = el("summary", undefined, disclosure); summary.className = "panel-summary";
    el("span", "Country of origin", summary).className = "panel-title";
    el("span", "Origin Lens", summary).className = "tag";
    const action = el("span", collapsed ? "Expand" : "Collapse", summary); action.className = "disclosure-action";
    const mountedHost = host;
    disclosure.addEventListener("toggle", () => {
      if (host !== mountedHost) return;
      collapsed = !disclosure.open;
      action.textContent = collapsed ? "Expand" : "Collapse";
    });
    // Keep the hide button outside the summary's native disclosure control.
    const close = el("button", "×", card); close.type = "button"; close.className = "close"; close.setAttribute("aria-label", "Hide Origin Lens for this page");
    close.addEventListener("click", () => { closed = true; lookupController?.abort(); host.remove(); generation++; });
    const part = el("p", `${identity.manufacturer} · ${identity.mpn}`, disclosure); part.className = "part";
    const status = el("p", "Checking origin…", disclosure); status.className = "status"; status.setAttribute("role", "status");
    const results = el("div", undefined, disclosure); results.className = "results";
    const options = el("section", undefined, disclosure); options.className = "ordering-options";
    options.setAttribute("aria-label", "Ordering options");
    const actions = el("div", undefined, disclosure); actions.className = "actions";
    const refresh = el("button", "Refresh", actions); refresh.type = "button"; refresh.addEventListener("click", () => load(true));
    el("footer", "Catalog declarations; shipment origin may vary by lot. Declared origin does not establish every manufacturing location.", disclosure);
    ui = { status, results, options, refresh };
    const anchor = identity.provider === "mouser" ? document.getElementById("pdpProdInfo") : document.querySelector("h1")?.closest("table");
    (anchor || document.querySelector("h1"))?.insertAdjacentElement("afterend", host);
    if (!host.isConnected) document.body.prepend(host);
  }

  function showListRecovery(row, code) {
      const help = el("div", undefined, row);
      const lists = el("a", code === "no-list" ? "Open DigiKey to create an empty list" : "Open DigiKey MyLists", help);
      lists.href = "https://www.digikey.com/en/mylists/"; lists.target = "_blank"; lists.rel = "noopener";
      el("p", "You do not need to add this part. After updating DigiKey, return here and click Refresh.", help).className = "note";
      const settings = el("details", undefined, help);
      el("summary", "Use an existing list or reset list selection", settings);
      const form = el("form", undefined, settings);
      const label = el("label", "MyLists URL or list ID (optional)", form); label.htmlFor = "origin-list";
      const input = el("input", undefined, form); input.id = "origin-list"; input.placeholder = "Automatic: most recently modified list";
      const hint = el("p", "Leave blank to use your latest list. No products will be added.", form); hint.className = "note";
      const save = el("button", "Save list setting", form); save.type = "submit";
      const feedback = el("p", "", form); feedback.setAttribute("role", "status");
      (async () => {
        try { const saved = await chrome.storage.local.get("digikeyListId"); input.value = saved.digikeyListId || ""; }
        catch { /* An empty value still lets the user reset to automatic discovery. */ }
      })();
      form.addEventListener("submit", async event => {
        event.preventDefault();
        save.disabled = true;
        try {
          const id = C.parseListId(input.value);
          const saved = await chrome.storage.local.get("digikeyListId");
          if ((saved.digikeyListId || "") === id) await load(true);
          else await chrome.storage.local.set({ digikeyListId: id });
          input.value = id; feedback.textContent = "Saved.";
        } catch (error) { feedback.textContent = error instanceof C.LookupError ? error.message : "Setting could not be saved."; }
        finally { save.disabled = false; }
      });
  }

  function sourceLink(provider, part) {
    if (provider === "lcsc") return C.lcscSearchUrl(part);
    if (provider === part.provider) return part.sourceUrl;
    if (provider === "digikey") return "https://www.digikey.com/";
    if (provider === "mouser") return `https://www.mouser.com/c/?q=${encodeURIComponent(part.mpn)}`;
    if (provider === "microchip") return C.microchipUrl(part);
    if (provider === "infineon") return C.infineonUrl();
    const family = C.stFamily(part);
    return family ? `https://www.st.com/en/microcontrollers-microprocessors/${family}.html#sample-buy` : null;
  }

  function countryName(value) {
    // Normalize display casing only; retain original source values in the report.
    if (value !== value.toLocaleUpperCase("en") || /^[A-Z]{2,3}$/.test(value)) return value;
    return value.replace(/\p{L}+/gu, (word, offset) => {
      if (/^(?:US|USA|UK|UAE|PRC|ROC)$/.test(word)) return word;
      const lower = word.toLocaleLowerCase("en");
      return offset > 0 && /^(?:of|and|the|d)$/.test(lower)
        ? lower : lower.charAt(0).toLocaleUpperCase("en") + lower.slice(1);
    });
  }

  function showOptions(state, part) {
    const section = ui.options;
    section.replaceChildren();
    if (!C.stFamily(part)) return;
    el("h3", `Ordering options · ${C.stFamily(part).toUpperCase()}`, section);
    if (!state.report) {
      el("p", state.pending ? "Checking ST's complete family listing…" : state.error || "Comparison unavailable.", section).className = "note";
      const a = el("a", "ST family table", section); a.href = O.url(part); a.target = "_blank"; a.rel = "noopener noreferrer";
      return;
    }
    const options = O.comparison(state.report, part), successful = options.filter(r => !r.error);
    const counts = group => options.filter(r => r.group === group).length;
    const summaries = [
      counts("packing") && `${counts("packing")} with different packing`,
      counts("temperature") && `${counts("temperature")} with a different temperature range in the same package`,
      counts("package") && `${counts("package")} in another package`
    ].filter(Boolean);
    el("p", summaries.length ? `Alternatives: ${summaries.join(" · ")}.` : "No confirmed package, packing or temperature alternatives in this listing.", section).className = "note";
    const origins = options.map(r => r.origin.values.map(v => v.toLowerCase()).sort().join(" / "));
    if (origins[0] && origins.every(v => v === origins[0])) {
      el("p", `Reported origin: ${options[0].origin.values.map(countryName).join(" / ")} across all ${options.length} codes.`, section).className = "note";
    } else {
      const different = options.filter(r => !r.current && r.changes.origin === "different").length;
      el("p", `${options.filter(r => r.origin.values.length).length} of ${options.length} codes report origin${different ? ` · ${different} with a different reported origin` : ""}.`, section).className = "note";
    }
    if (state.pending || state.stale || state.error || successful.length < options.length) {
      el("p", state.pending ? "Updating saved comparison…" :
        state.error ? `Latest comparison unavailable: ${state.error} Showing the dated saved listing.` :
        state.stale ? "Showing a dated saved listing; the latest comparison could not be confirmed." :
        `${successful.length} of ${options.length} codes checked. Unavailable attributes remain unknown; refresh to retry.`, section).className = "status error";
    }
    const details = el("details", undefined, section);
    el("summary", `Compare all ${options.length} ordering codes`, details);
    el("p", "Changes are relative to the current ordering code. Package or temperature changes require design review; matching these fields does not establish interchangeability.", details).className = "note";
    const scroll = el("div", undefined, details); scroll.className = "options-scroll"; scroll.tabIndex = 0;
    scroll.setAttribute("role", "region"); scroll.setAttribute("aria-label", "Ordering-code comparison; scroll horizontally for all columns");
    const table = el("table", undefined, scroll); table.className = "options-table";
    el("caption", "ST catalog · changed fields are bold · operating temperature in °C", table);
    const header = el("tr", undefined, el("thead", undefined, table));
    for (const label of ["Ordering code", "Package", "Packing", "Temperature", "Origin"]) el("th", label, header).scope = "col";
    const body = el("tbody", undefined, table);
    const value = field => field.values.join(" / ") || "Not reported";
    for (const option of options) {
      const tr = el("tr", undefined, body);
      if (option.current) tr.setAttribute("data-current", "");
      const heading = el("th", undefined, tr); heading.scope = "row";
      const link = el("a", option.mpn, heading);
      link.href = `https://estore.st.com/en/${option.mpn.toLowerCase()}-cpn.html`; link.target = "_blank"; link.rel = "noopener noreferrer";
      const changes = ["package", "packing", "temperature", "origin"].filter(name => option.changes[name] === "different");
      el("span", option.current ? "Current part" : changes.length ? `Changed: ${changes.join(", ")}` : "No confirmed differences", heading).className = "option-change";
      el("span", option.status || "Status not reported", heading).className = "option-change";
      const links = el("span", undefined, heading); links.className = "option-links";
      for (const [label, href] of [["DigiKey", `https://www.digikey.com/en/products?keywords=${encodeURIComponent(option.mpn)}`],
        ["Mouser", `https://www.mouser.com/c/?q=${encodeURIComponent(option.mpn)}`]]) {
        const a = el("a", label, links); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
        a.setAttribute("aria-label", `Search ${label} for ${option.mpn}`);
      }
      const temperature = option.temperatureMin.values.length && option.temperatureMax.values.length ?
        `${value(option.temperatureMin)} to ${value(option.temperatureMax)}` : "Not reported";
      for (const [name, text] of [["package", value(option.package)], ["packing", value(option.packing)],
        ["temperature", temperature], ["origin", option.origin.values.map(countryName).join(" / ") || "Not reported"]]) {
        const cell = el("td", text, tr);
        if (!option.current && option.changes[name] === "different") cell.className = "changed";
      }
      if (option.error) el("span", option.error, heading).className = "option-change";
    }
    const a = el("a", "ST family table", details); a.href = state.report.sourceUrl; a.target = "_blank"; a.rel = "noopener noreferrer";
    el("p", `${state.cached ? "Saved · " : ""}Listing checked ${new Date(state.report.checkedAt).toLocaleString()} · all ${options.length} codes returned by ST for this base part. Distributor stock is not checked here.`, details).className = "note";
  }

  function showRow(row, state, provider, part) {
    row.replaceChildren();
    const header = el("div", undefined, row); header.className = "report-head";
    el("h3", (provider === "st" && !C.stFamily(part) ? "Manufacturer" : C.PROVIDERS[provider]) + (provider === part.provider ? " · this site" : ""), header);
    if (provider === "lcsc") { showPhotoRow(row, header, state, part); return; }
    const result = state.result;
    const apiSetup = provider === "mouser" && ["api-unconfigured", "api-auth"].includes(state.code);
    const country = el("span", result?.fields.declaredCoo.values.map(countryName).join(" / ") || (state.pending ? "…" : state.code === "unsupported" ? "Not supported" : apiSetup ? (state.code === "api-auth" ? "Check API key" : "Setup required") : state.error ? "Unavailable" : "Not reported"), header); country.className = "country";
    const message = result ? (state.error ? "Latest check unavailable. Showing the saved report." : state.pending ? "Saved report · checking for an update…" : state.stale ? "Saved report · may be outdated" : result.fields.declaredCoo.values.length ? "Declared origin · exact part matched" : "Exact part matched; declared origin is not available.")
      : state.pending ? "Checking this source…" : state.error || "Exact part matched; declared origin is not available.";
    const status = el("p", message, row);
    status.className = "status" + (state.error && state.code !== "unsupported" ? " error" : "");
    if (provider === "digikey" && !result && ["no-list", "missing", "settings"].includes(state.code)) {
      showListRecovery(row, state.code); return;
    }
    if (apiSetup) {
      const actions = el("div", undefined, row); actions.className = "actions";
      const setup = el("button", "Configure Mouser", actions); setup.type = "button";
      setup.addEventListener("click", async () => {
        setup.disabled = true;
        try {
          const response = await chrome.runtime.sendMessage({ type: "origin-lens:open-mouser-settings" });
          if (!response?.ok) throw new Error("Settings unavailable");
        } catch { el("p", "Open Origin Lens from the toolbar, then choose Mouser API settings.", row).className = "note"; }
        finally { setup.disabled = false; }
      });
      if (!result) return;
    }
    const source = el("p", undefined, row); source.className = "source";
    const url = result?.sourceUrl || sourceLink(provider, part);
    if (url) {
      const link = el("a", provider === "digikey" ? (state.code === "auth" ? "Sign in to DigiKey" : result ? "DigiKey product page" : "Open DigiKey") : result ? result.sourceKind : "Open source", source);
      link.href = url; link.target = "_blank"; link.rel = "noopener";
    }
    if (!result) return;
    if (provider === "infineon") {
      el("p", "All returned catalog regions and material variants; regional records are shown below.", row).className = "note";
      if (result.fields.declaredCoo.raw.includes("YY")) el("p", "Some records report COO as YY: origin is only confirmed at shipment.", row).className = "note";
    }
    el("span", `${state.cached ? (state.stale ? "Last known · checked" : "Saved · checked") : "Checked"} ${new Date(result.checkedAt).toLocaleString()}`, source);
    if (state.error) el("p", state.error, row).className = "note";
    const details = el("details", undefined, row);
    el("summary", "Manufacturing & match details", details);
    const fields = el("dl", undefined, details);
    const labels = { assembly: "Assembly", diffusion: "Wafer fabrication / diffusion", testing: "Testing" };
    for (const [key, label] of Object.entries(labels)) {
      const box = el("div", undefined, fields);
      el("dt", label, box);
      const values = result.fields[key]?.values || [];
      const value = el("dd", values.length ? values.map(countryName).join(" / ") : "Not reported", box);
      if (!values.length) value.className = "unknown";
    }
    const note = el("p", `${result.identity.manufacturer} · ${result.identity.mpn} · ${result.returnedSku || result.identity.sku}`, details); note.className = "note";
    if (provider === "infineon") {
      // Group identical declarations without losing their material or region scope.
      const groups = new Map();
      for (const report of result.regionalReports || []) {
        const regions = report.regions.filter(v => v !== "All").join(", ") || "All";
        const key = JSON.stringify([report.sp, regions, ...["declaredCoo", "assembly", "diffusion"].map(k => report[k].raw)]);
        if (!groups.has(key)) groups.set(key, { report, regions, materials: [] });
        groups.get(key).materials.push(report.material);
      }
      const regional = el("details", undefined, details);
      el("summary", "Regional origin records", regional);
      for (const { report, regions, materials } of groups.values()) {
        el("p", `Regions: ${regions} · SP: ${report.sp} · materials: ${[...new Set(materials)].join(", ")}`, regional).className = "note";
        const value = key => report[key].values.map(countryName).join(" / ") || (report[key].raw.length ? `Unresolved (${report[key].raw.join(", ")})` : "Not reported");
        el("p", `COO: ${value("declaredCoo")} · Assembly: ${value("assembly")} · Wafer fabrication: ${value("diffusion")}`, regional).className = "note";
      }
    }
    if (provider === "digikey") el("p", part.provider === "digikey" && result.returnedSku && !C.same(result.returnedSku, part.sku)
      ? `Requested ${part.sku}; DigiKey resolved ${result.returnedSku}. Catalog origin for the exact ordering code.`
      : "Read-only DigiKey catalog lookup.", details).className = "note";
  }

  function showPhotoRow(row, header, state, part) {
    const result = state.result, evidence = result?.photoEvidence, ocr = evidence?.ocr;
    const automatic = ocr?.status === "detected" ? ocr.observations[0] : null;
    const observation = evidence?.observation || automatic;
    const status = { unreadable: "No reliable country marking read. Inspect the photos.",
      unavailable: "Automatic reading unavailable. Inspect the photos or refresh to retry.",
      conflict: "Conflicting automatic readings. No assembly country assigned by OCR.",
      "part-mismatch": "A different STM32 family was read in the photo. No assembly country assigned by OCR." };
    el("span", observation ? `${countryName(observation.country)} · ${evidence.observation ? "sample" : "auto-read"}` : state.pending ? "…" : evidence ? "Photos available" : "Unavailable", header).className = "country";
    const message = evidence ? observation
      ? `${evidence.observation ? "Reviewed" : "Automatically read"} marking ${observation.marking} · assembly country of the photographed sample`
      : status[ocr?.status] || "Exact listing matched · markings not reviewed"
      : state.pending ? "Finding LCSC photos and reading markings locally…" : state.error || "No part-specific photographs found.";
    el("p", message, row).className = "status" + (!evidence && state.error ? " error" : "");
    const source = el("p", undefined, row); source.className = "source";
    const link = el("a", evidence ? "LCSC product & photos" : "Search LCSC", source);
    link.href = result?.sourceUrl || C.lcscSearchUrl(part); link.target = "_blank"; link.rel = "noopener noreferrer";
    if (!evidence) return;
    el("span", `${state.cached ? "Saved · listing checked" : "Listing checked"} ${new Date(result.checkedAt).toLocaleString()}`, source);
    if (state.error || state.stale) el("p", "Showing saved photo evidence; the latest listing could not be confirmed.", row).className = "note";
    if (evidence.reviewNote) el("p", evidence.reviewNote, row).className = "note";
    el("p", "Reference photograph. Current stock, declared COO, wafer fabrication and testing locations are not established by this image.", row).className = "note";
    const details = el("details", undefined, row);
    el("summary", observation ? `View photo · ${observation.marking} marking` : "View reference photos", details);
    const imageUrl = observation?.imageUrl || evidence.images.find(url => /_blank\./i.test(url)) || evidence.images[0];
    const figure = el("figure", undefined, details); figure.className = "photo-evidence";
    const photoLink = el("a", undefined, figure); photoLink.href = imageUrl; photoLink.target = "_blank"; photoLink.rel = "noopener noreferrer";
    const image = el("img", undefined, photoLink); image.width = 900; image.height = 900; image.loading = "lazy"; image.decoding = "async";
    image.referrerPolicy = "no-referrer"; image.alt = `LCSC reference photo of ${result.identity.mpn}${observation ? `; ${evidence.observation ? "reviewed" : "automatically read"} marking ${observation.marking}` : "; no reliable country marking read"}`;
    image.src = imageUrl;
    image.addEventListener("error", () => {
      image.hidden = true;
      el("p", "Preview unavailable here. Open the full-size photo below.", figure).className = "note";
    }, { once: true });
    el("figcaption", `${result.identity.manufacturer} · ${result.identity.mpn} · LCSC ${result.identity.sku}. Select the image to enlarge.`, figure);
    const images = el("ul", undefined, details); images.className = "photo-links";
    evidence.images.forEach((url, index) => {
      const item = el("li", undefined, images), a = el("a", url === imageUrl ? "Full-size photo" : `Photo ${index + 1}`, item);
      a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
    });
    if (evidence.observation) {
      el("p", `Visual review ${new Date(observation.reviewedAt).toLocaleDateString()} · image fingerprint verified at the listing check above.`, details).className = "note";
    }
    if (ocr) {
      el("p", `Automatic reading · ${new Date(ocr.processedAt).toLocaleString()} · processed on this device.`, details).className = "note";
      if (automatic) el("p", `${automatic.marking} read in at least two passes · OCR score ${Math.round(automatic.confidence)}/100. Verify against the photo; this score is not a probability.`, details).className = "note";
      if (ocr.status !== "detected") el("p", status[ocr.status], details).className = "note";
      for (const [index, reading] of ocr.readings.entries()) {
        const readout=el("details",undefined,details);
        el("summary",`Detected text · photo ${index+1}`,readout);
        const a=el("a","View this photo",readout); a.href=reading.imageUrl; a.target="_blank"; a.rel="noopener noreferrer";
        const texts=[...new Set(reading.passes.map(p=>p.text.trim()).filter(Boolean))];
        const pre=el("pre",texts.join("\n\n") || "No text detected.",readout);
        pre.style.whiteSpace="pre-wrap"; pre.style.overflowWrap="anywhere"; pre.style.font="inherit";
      }
    }
    if (observation) {
      const a = el("a", "ST explanation of CHN / MYS assembly markings", details);
      a.href = evidence.observation?.interpretationUrl || OriginLensOCR.INTERPRETATION_URL; a.target = "_blank"; a.rel = "noopener noreferrer";
    }
  }

  async function saveCache(result) {
    const key = C.sourceCacheKey(result.identity.provider, result.identity);
    await chrome.storage.local.set({ [key]: { key, result } });
    const all = await chrome.storage.local.get(null);
    const entries = Object.entries(all).filter(([k]) => k.startsWith("origin-lens:v")).sort((a,b) => Date.parse(b[1]?.result?.checkedAt || 0) - Date.parse(a[1]?.result?.checkedAt || 0));
    const remove = entries.filter(([k,r],i) => !k.startsWith(C.CACHE_PREFIX) || i >= 100 || !Number.isFinite(Date.parse(r?.result?.checkedAt)) || Date.now() - Date.parse(r.result.checkedAt) >= C.CACHE_RETENTION).map(([k]) => k);
    if (remove.length) await chrome.storage.local.remove(remove);
  }

  async function load(force = false) {
    if (!enabled || !identity || closed || !C.componentTypeEnabled(identity.componentType, preferences)) return;
    lookupController?.abort();
    const controller = lookupController = new AbortController();
    const run = ++generation;
    const part = { ...identity };
    const providers = ["digikey", "mouser", C.manufacturerProvider(part), ...(C.lcscSupported(part) ? ["lcsc"] : [])];
    const current = () => enabled && run === generation && !closed && C.componentTypeEnabled(part.componentType, preferences) &&
      C.readComponentType(document, location.href) === part.componentType && C.cacheKey(C.readIdentity(document, location.href) || {}) === C.cacheKey(part);
    const pageFetch = (url, options = {}) => {
      if (!current()) throw new C.LookupError("cancelled", "Origin lookup stopped.");
      return fetch(url, { ...options, signal: AbortSignal.any([controller.signal, options.signal].filter(Boolean)) });
    };
    ui.refresh.disabled = true; ui.status.className = "status"; ui.status.textContent = "Checking sources…";
    ui.results.replaceChildren();
    let optionsState = C.stFamily(part) ? { pending: true } : {};
    showOptions(optionsState, part);
    const states = {}, rows = {};
    for (const provider of providers) {
      rows[provider] = el("section", undefined, ui.results); rows[provider].className = "report";
      rows[provider].setAttribute("aria-label", C.PROVIDERS[provider] + (provider === "lcsc" ? " evidence" : " origin report"));
      states[provider] = { pending: true };
      showRow(rows[provider], states[provider], provider, part);
    }
    const update = () => {
      const results = Object.values(states).map(s => s.result).filter(Boolean);
      const count = results.filter(r => r.fields.declaredCoo.values.length).length;
      const pending = Object.values(states).some(s => s.pending);
      ui.status.className = "status";
      const photos = results.filter(r => r.photoEvidence?.images.length).length;
      ui.status.textContent = `${count} source${count === 1 ? "" : "s"} reporting origin${photos ? " · reference photos available" : ""}${pending ? " · checking remaining sources…" : "."}`;
      ui.refresh.disabled = pending || optionsState.pending;
    };
    let catalogReady = false;
    const catalog = {}, changedReports = new Set();
    const savedReport = provider => C.savedSource(catalog, provider, part);
    sourceChanges = changes => {
      if (!current()) return;
      for (const [key, change] of Object.entries(changes)) {
        if (!key.startsWith(C.CACHE_PREFIX)) continue;
        catalog[key] = change.newValue; changedReports.add(key);
      }
      if (!catalogReady) return;
      for (const provider of providers) {
        const saved = savedReport(provider), state = states[provider];
        if (!saved || (state.result && Date.parse(saved.result.checkedAt) <= Date.parse(state.result.checkedAt))) continue;
        states[provider] = { ...saved, pending: state.pending };
        showRow(rows[provider], states[provider], provider, part);
      }
      update();
    };
    const stored = await chrome.storage.local.get(null).catch(() => ({}));
    if (!current()) return;
    for (const [key, entry] of Object.entries(stored)) if (!changedReports.has(key)) catalog[key] = entry;
    catalogReady = true;
    const requests = new Map();
    const requestOnce = async (operation, extra = {}) => {
      if (!current()) throw new C.LookupError("cancelled", "Product page changed.");
      let response;
      try { response = await chrome.runtime.sendMessage({ type: "origin-lens:lookup", operation, part, ...extra }); }
      catch { throw new C.LookupError("extension", "Cross-source service is unavailable. Reload Origin Lens in chrome://extensions and reload this page."); }
      if (!response?.ok) throw new C.LookupError(response?.code || "network", response?.message || "Source lookup failed.");
      return response.data;
    };
    // Exact ST origin and family comparison share the same verified product-page fetch.
    const request = (operation, extra = {}) => {
      if (operation !== "st-family") return requestOnce(operation, extra);
      if (!requests.has(operation)) requests.set(operation, requestOnce(operation, extra));
      return requests.get(operation);
    };
    const loadOptions = async () => {
      if (!C.stFamily(part)) return;
      const saved = O.saved(stored, part);
      try {
        optionsState = saved ? { ...saved, pending: force || saved.stale } : { pending: true };
        showOptions(optionsState, part); update();
        if (force || !saved || saved.stale) {
          const report = await O.lookup(part, request);
          if (!current()) return;
          O.rows(report, part);
          optionsState = { report };
          try {
            await chrome.storage.local.set({ [O.key(part)]: report });
            const all = await chrome.storage.local.get(null);
            const entries = Object.entries(all).filter(([key]) => key.startsWith("origin-lens:options:"))
              .sort((a,b) => Date.parse(b[1]?.checkedAt || 0) - Date.parse(a[1]?.checkedAt || 0));
            const remove = entries.filter(([key, r], i) => !key.startsWith(O.PREFIX) || i >= 30 ||
              !Number.isFinite(Date.parse(r?.checkedAt)) || Date.now() - Date.parse(r.checkedAt) >= C.CACHE_RETENTION).map(([key]) => key);
            if (remove.length) await chrome.storage.local.remove(remove);
          } catch { /* Live comparisons remain usable without persistent storage. */ }
        }
      } catch (error) {
        optionsState = { ...saved, error: error instanceof C.LookupError ? error.message : "The family listing could not be checked." };
      }
      if (!current()) return;
      optionsState.pending = false; showOptions(optionsState, part); update();
    };
    await Promise.allSettled([loadOptions(), ...providers.map(async provider => {
      try {
        if (provider === "st" && !C.stFamily(part)) throw new C.LookupError("unsupported", "No direct manufacturer adapter for this part. Distributor reports are checked separately.");
        // A storage failure should not prevent a live lookup.
        const saved = savedReport(provider);
        if (!current()) return;
        const usePage = provider === "mouser" && part.provider === "mouser" && saved?.result.sourceKind !== "Mouser Search API";
        if (saved) {
          states[provider] = { ...saved, pending: force || usePage || saved.stale };
          showRow(rows[provider], states[provider], provider, part); update();
        }
        if (!force && !usePage && saved && !saved.stale) {
          states[provider] = saved;
        } else {
          const result = provider === "digikey" ? (part.provider === "digikey" ? await C.lookupDigiKey(part, stored.digikeyListId || "", pageFetch) : await request("digikey"))
            : provider === "mouser" ? await C.lookupMouserAuto(part, request, () => part.provider === "mouser" ? C.fromMouser(document, part) : C.lookupMouser(part, request, C.parseHtml, saved?.result.sourceUrl))
            : provider === "lcsc" ? await C.lookupLCSC(part, request, C.parseHtml, saved?.result.sourceUrl)
            : ["microchip", "infineon"].includes(provider) ? await request(provider)
            : await C.lookupST(part, request);
          if (!current()) return;
          C.assertMatch(result.identity, part);
          if (result.identity.provider !== provider) throw new C.LookupError("identity", "Source identity did not match.");
          const latest = savedReport(provider);
          states[provider] = latest && (!C.hasSourceEvidence(result) || (latest.result.fields.declaredCoo.values.length && !result.fields.declaredCoo.values.length))
            ? { ...latest, error: "The latest response did not report an origin for this part." }
            : latest && Date.parse(latest.result.checkedAt) > Date.parse(result.checkedAt) ? latest : { result, cached: false };
          try {
            if (states[provider].result === result && C.hasSourceEvidence(result)) await saveCache(result);
          } catch { /* Still display live evidence when local storage is unavailable. */ }
        }
      } catch (error) {
        if (!current()) return;
        states[provider] = { ...savedReport(provider), code: error.code, error: error instanceof C.LookupError ? error.message : "This source could not be checked. Reload the page and retry." };
      }
      if (!current()) return;
      showRow(rows[provider], states[provider], provider, part); update();
    })]);
  }

  function check() {
    if (!enabled) return;
    const next = C.readIdentity(document, location.href);
    const componentType = next ? C.readComponentType(document, location.href) : "other";
    const allowed = C.componentTypeEnabled(componentType, preferences);
    const nextKey = next ? JSON.stringify([C.cacheKey(next), componentType, allowed]) : "";
    if (nextKey !== fingerprint) {
      generation++; lookupController?.abort(); host?.remove(); closed = false; fingerprint = nextKey;
      identity = next && allowed ? { ...next, componentType } : null;
      if (identity) { mount(); load(); }
    } else if (identity && !closed && !host?.isConnected) { mount(); load(); }
  }
  const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(check, 250); });
  function applyPreferences() {
    if (!settingsReady) return;
    const next = preferences.enabled !== false;
    if (enabled === next) { if (enabled) check(); return; }
    enabled = next;
    generation++; lookupController?.abort(); clearTimeout(timer);
    observer.disconnect(); host?.remove(); identity = null; fingerprint = ""; closed = false;
    if (enabled) {
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      check();
    }
  }
  window.addEventListener("popstate", check);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    let changed = false;
    for (const key of C.PREFERENCE_KEYS) {
      if (!changes[key]) continue;
      preferences[key] = changes[key].newValue; changedPreferences.add(key); changed = true;
    }
    if (changed) applyPreferences();
    sourceChanges?.(changes);
    if ((changes.digikeyListId || changes.mouserApiRevision) && enabled && identity && !closed) load(true);
  });
  (async () => {
    try {
      const saved = await chrome.storage.local.get(C.PREFERENCE_KEYS);
      for (const key of C.PREFERENCE_KEYS) if (!changedPreferences.has(key)) preferences[key] = saved[key];
      settingsReady = true; applyPreferences();
    } catch { /* Stay off if the saved preferences cannot be read. */ }
  })();
})();
