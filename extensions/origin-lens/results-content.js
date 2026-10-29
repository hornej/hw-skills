(() => {
  "use strict";
  if (globalThis.__originLensResultsLoaded) return;
  globalThis.__originLensResultsLoaded = true;
  const C = globalThis.OriginLens, R = globalThis.OriginLensResults;
  const entries = new Map(), catalog = {}, settings = {}, changedKeys = new Set();
  const hiddenRows = new Set();
  let ready = false, toolbar, ui, pageUrl = "", timer, run = 0, scanning = false, currentRows = [];
  let filter = { mode: "all", country: "China", keepUnknown: true, scope: "all" };
  const el = (tag, text, parent) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    parent?.append(node);
    return node;
  };
  const enabled = () => ready && settings.enabled !== false && settings.listViewEnabled === true;
  const styles = `
    :host{all:initial;display:block;color-scheme:light dark;font:12px/1.45 "Cascadia Mono",Consolas,monospace;color:var(--ol-ink,#181818);--ol-paper:#fff;--ol-ink:#181818;--ol-rule:#aaa;--ol-muted:#595959;--ol-link:#0057b8}
    :host([data-dark]){--ol-paper:#181818;--ol-ink:#eee;--ol-rule:#666;--ol-muted:#b5b5b5;--ol-link:#8acbff}
    section{padding:12px;border:1px solid var(--ol-rule);background:var(--ol-paper);color:var(--ol-ink)}
    h2{font-size:15px;line-height:1.4;font-weight:700;margin:0 0 8px}p{margin:6px 0 0}.muted{color:var(--ol-muted);font-size:11px}
    .controls{display:flex;align-items:end;flex-wrap:wrap;gap:12px}label{display:block}fieldset{padding:0;border:0;margin:0}legend{margin-bottom:4px}
    .modes{display:flex;gap:10px;flex-wrap:wrap}.modes label,.check{display:flex;align-items:center;gap:4px}
    input,select,button{font:inherit;color:inherit;accent-color:var(--ol-link)}select,button{background:var(--ol-paper);border:1px solid var(--ol-rule);padding:6px;min-height:32px}button{cursor:pointer}button:disabled{cursor:wait}
    :is(input,select,button,a,summary):focus-visible{outline:2px solid var(--ol-link);outline-offset:3px}
    a{color:var(--ol-link)}details{margin-top:5px}summary{cursor:pointer}dl{margin:6px 0}dl>div{display:flex;justify-content:space-between;gap:14px;margin-top:4px}dt{color:var(--ol-muted)}dd{margin:0;text-align:end;font-weight:700;overflow-wrap:anywhere}
    .row{border:0;border-top:1px solid var(--ol-rule);padding:8px 0;margin-top:8px;max-inline-size:34rem;background:transparent}.row h2{font-size:11px;margin:0}.row a,.row p{font-size:11px}.row .source{margin-top:8px}
    @media(pointer:coarse){button,select,summary,.modes label,.check{min-height:48px}}
    @media(forced-colors:active){:host,:host([data-dark]){--ol-paper:Canvas;--ol-ink:CanvasText;--ol-rule:ButtonBorder;--ol-muted:CanvasText;--ol-link:LinkText}}
  `;
  function dark(host, anchor) {
    // Use the site's actual surface color: DigiKey's theme can differ from the OS.
    for (let node = anchor; node; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor.match(/^rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)(?:[, /]+([\d.]+))?\)$/);
      if (!color || color[4] === "0") continue;
      host.toggleAttribute("data-dark", Number(color[1]) * .2126 + Number(color[2]) * .7152 + Number(color[3]) * .0722 < 128);
      return;
    }
  }
  function rootFor(host, anchor) {
    dark(host, anchor);
    const root = host.attachShadow({ mode: "open" }); el("style", styles, root); return root;
  }
  function restore(row) { if (hiddenRows.delete(row)) row.removeAttribute("data-origin-lens-hidden"); }
  function stop() {
    run++; scanning = false;
    for (const entry of entries.values()) { entry.pending = false; render(entry); }
    if (ui) refresh();
  }
  function clear() {
    stop(); toolbar?.remove(); toolbar = null; ui = null;
    for (const row of hiddenRows) row.removeAttribute("data-origin-lens-hidden");
    hiddenRows.clear();
    for (const entry of entries.values()) for (const view of entry.views) view.host.remove();
    entries.clear(); currentRows = [];
    document.getElementById("origin-lens-results-style")?.remove();
  }
  function readSaved(entry) {
    for (const provider of R.providers(entry.part)) {
      const saved = C.savedSource(catalog, provider, entry.part);
      const state = entry.states[provider];
      if (saved && (!state?.result || Date.parse(saved.result.checkedAt) > Date.parse(state.result.checkedAt))) entry.states[provider] = saved;
    }
    if (R.providers(entry.part).every(provider => entry.states[provider]?.result && !entry.states[provider].stale)) entry.checked = true;
  }
  function mountToolbar(table) {
    toolbar = el("aside"); toolbar.id = "origin-lens-results";
    const root = rootFor(toolbar, table), section = el("section", undefined, root);
    section.setAttribute("aria-label", "Origin Lens results filter");
    el("h2", "Origin Lens · reported countries", section);
    const controls = el("div", undefined, section); controls.className = "controls";
    const check = el("button", "Check this page", controls); check.type = "button";
    check.addEventListener("click", () => scanning ? stop() : scan());
    const modes = el("fieldset", undefined, controls); el("legend", "Show parts", modes);
    const options = el("div", undefined, modes); options.className = "modes";
    const modeInputs = [];
    for (const [value, label] of [["all", "All"], ["include", "With country"], ["exclude", "Without country"]]) {
      const option = el("label", undefined, options), input = el("input", undefined, option);
      input.type = "radio"; input.name = "origin-mode"; input.value = value; input.checked = filter.mode === value;
      input.id = "origin-mode-" + value; option.htmlFor = input.id; el("span", label, option); modeInputs.push(input);
      input.addEventListener("change", () => { if (input.checked) { filter.mode = value; refresh(); } });
    }
    const selection = (name, label, items, value) => {
      const group = el("div", undefined, controls), heading = el("label", label, group);
      const input = el("select", undefined, group); input.id = "origin-" + name; input.name = name; heading.htmlFor = input.id;
      for (const [v, text] of items) { const option = el("option", text, input); option.value = v; }
      input.value = value; return input;
    };
    const country = selection("country", "Country", [[filter.country, filter.country]], filter.country);
    country.addEventListener("change", () => { filter.country = country.value; refresh(); });
    const scope = selection("scope", "Classification", [["all", "Any reported stage"], ...Object.entries(R.STAGES)], filter.scope);
    scope.addEventListener("change", () => { filter.scope = scope.value; refresh(); });
    const unknownLabel = el("label", undefined, controls); unknownLabel.className = "check";
    const unknown = el("input", undefined, unknownLabel); unknown.type = "checkbox"; unknown.checked = filter.keepUnknown;
    unknown.id = "origin-unknown"; unknown.name = "unknown"; unknownLabel.htmlFor = unknown.id;
    el("span", "Keep unknown / unchecked", unknownLabel);
    unknown.addEventListener("change", () => { filter.keepUnknown = unknown.checked; refresh(); });
    const status = el("p", "", section); status.setAttribute("role", "status");
    el("p", "Filters this page only. Any matching source or reported stage counts. Estimates and photo markings are excluded from filtering.", section).className = "muted";
    table.insertAdjacentElement("beforebegin", toolbar);
    ui = { check, modeInputs, country, scope, unknown, status };
    let style = document.getElementById("origin-lens-results-style");
    if (!style) { style = el("style", '[data-origin-lens-hidden]{display:none!important}', document.head); style.id = "origin-lens-results-style"; }
  }
  function render(entry) {
    const facts = R.facts(entry.part, entry.states), grouped = new Map();
    for (const fact of facts) {
      const key = fact.label + "\0" + fact.countries.join("\0");
      if (!grouped.has(key)) grouped.set(key, { ...fact, providers: [] });
      grouped.get(key).providers.push(C.PROVIDERS[fact.provider]);
    }
    for (const view of entry.views) {
      const body = view.body, expanded = body.querySelector("details")?.open;
      body.replaceChildren();
      el("h2", "Origin Lens", body);
      if (facts.length) {
        const list = el("dl", undefined, body);
        for (const fact of grouped.values()) {
          const item = el("div", undefined, list); item.title = fact.providers.join(" / ");
          el("dt", fact.label, item); el("dd", fact.countries.join(" / "), item);
        }
      }
      if (!facts.length) el("p", entry.pending ? "Checking…" : Object.values(entry.states).some(s => s.error) ? "Origin unavailable" : entry.checked ? "No country reported" : "Not checked", body).className = "muted";
      else if (entry.pending) el("p", "Checking…", body).className = "muted";
      const details = el("details", undefined, body); details.open = !!expanded; el("summary", "Sources", details);
      for (const provider of R.providers(entry.part)) {
        const state = entry.states[provider], result = state?.result;
        const block = el("div", undefined, details); block.className = "source";
        el("strong", C.PROVIDERS[provider], block);
        const sourceFacts = facts.filter(f => f.provider === provider && f.label !== "Assembly · ST PCN");
        for (const fact of sourceFacts) el("p", `${fact.label}: ${fact.countries.join(" / ")}`, block);
        if (result) {
          const link = el("a", "Source", block); link.href = result.sourceUrl; link.target = "_blank"; link.rel = "noopener noreferrer";
          el("p", `${state.stale ? "Saved · may be outdated · " : ""}Checked ${new Date(result.checkedAt).toLocaleString()}`, block).className = "muted";
          if (provider === "ti") el("p", `Ship to: ${result.importDetails.shipToCountry}`, block).className = "muted";
        }
        if (state?.error) el("p", state.error, block).className = "muted";
        else if (!result) el("p", entry.pending ? "Checking…" : "Not checked", block).className = "muted";
        else if (!sourceFacts.length) el("p", "No country reported", block).className = "muted";
      }
      for (const doc of C.stAssemblyDocuments(entry.part)) {
        const p = el("p", "Documented assembly routes; shipment lot not verified. ", details);
        const link = el("a", `ST PCN ${doc.id}`, p); link.href = doc.sourceUrl; link.target = "_blank"; link.rel = "noopener noreferrer";
      }
      if (Object.values(entry.states).some(s => s.stale)) el("p", "Saved report · may be outdated", body).className = "muted";
    }
  }
  function refresh() {
    if (!ui) return;
    const choices = new Set([filter.country]); let shown = 0, known = 0;
    for (const entry of entries.values()) {
      const facts = R.facts(entry.part, entry.states, filter.scope);
      const countries = facts.filter(f => f.filterable).flatMap(f => f.countries);
      countries.forEach(country => choices.add(country));
      const show = R.matches(facts, filter);
      for (const view of entry.views) {
        if (countries.length) known++;
        if (show) { restore(view.row); shown++; }
        else { hiddenRows.add(view.row); view.row.setAttribute("data-origin-lens-hidden", ""); }
      }
    }
    const values = [...choices].sort();
    if (values.join("\0") !== ui.country.dataset.values) {
      ui.country.replaceChildren();
      for (const value of values) { const option = el("option", value, ui.country); option.value = value; }
      ui.country.value = filter.country; ui.country.dataset.values = values.join("\0");
    }
    const checked = [...entries.values()].filter(e => e.checked).reduce((sum, e) => sum + e.views.length, 0);
    ui.status.textContent = `${shown} of ${currentRows.length} rows shown · ${known} with reported countries · ${scanning ? "Checking" : "Checked"} ${checked} of ${currentRows.length}`;
    ui.check.textContent = scanning ? "Stop checking" : "Check this page";
    ui.country.disabled = filter.mode === "all";
    ui.unknown.disabled = filter.mode === "all";
  }
  async function save(result) {
    if (!C.hasSourceEvidence(result)) return;
    const key = C.sourceCacheKey(result.identity.provider, result.identity);
    const entry = { key, result }; catalog[key] = entry;
    await chrome.storage.local.set({ [key]: entry });
    const saved = await chrome.storage.local.get(null);
    const records = Object.entries(saved).filter(([k]) => k.startsWith("origin-lens:v"))
      .sort((a, b) => Date.parse(b[1]?.result?.checkedAt || 0) - Date.parse(a[1]?.result?.checkedAt || 0));
    const remove = records.filter(([k, r], i) => !k.startsWith(C.CACHE_PREFIX) || i >= C.CACHE_LIMIT ||
      !Number.isFinite(Date.parse(r?.result?.checkedAt)) || Date.now() - Date.parse(r.result.checkedAt) >= C.CACHE_RETENTION).map(([k]) => k);
    if (remove.length) await chrome.storage.local.remove(remove);
  }
  async function scan() {
    if (scanning || !enabled()) return;
    scanning = true; const token = ++run, url = location.href, failures = new Map();
    const current = () => enabled() && token === run && url === location.href;
    const work = [...entries.values()];
    refresh();
    for (let index = 0; index < work.length && current(); index++) {
      const entry = work[index], part = entry.part;
      if (!C.componentTypeEnabled(part.componentType, settings)) continue;
      const partCurrent = () => current() && R.readRows(document, location.href).some(item =>
        C.cacheKey(item.part) === C.cacheKey(part) && entry.views.some(view => view.row === item.row));
      const fresh = state => state?.result && !state.error && Date.now() - Date.parse(state.result.checkedAt) < C.CACHE_TTL;
      if (R.providers(part).every(provider => fresh(entry.states[provider]))) { entry.checked = true; refresh(); continue; }
      entry.pending = true; render(entry); refresh();
      const request = async (operation, extra = {}) => {
        if (!partCurrent()) throw new C.LookupError("cancelled", "Checking stopped or the result row changed.");
        const response = await chrome.runtime.sendMessage({ type: "origin-lens:lookup", operation, part, ...extra });
        if (!partCurrent()) throw new C.LookupError("cancelled", "Checking stopped or the result row changed.");
        if (!response?.ok) throw new C.LookupError(response?.code || "network", response?.message || "Source unavailable.");
        return response.data;
      };
      await Promise.all(R.providers(part).map(async provider => {
        const previous = entry.states[provider];
        if (fresh(previous)) return;
        try {
          if (failures.has(provider)) throw failures.get(provider);
          const result = provider === "mouser" ? await request("mouser-api")
            : provider === "st" ? await C.lookupST(part, request)
            : ["samtec", "harwin"].includes(provider) ? await C.lookupManufacturerPage(provider, part, request)
            : await request(provider);
          if (!partCurrent()) return;
          C.assertMatch(result.identity, part);
          if (result.identity.provider !== provider) throw new C.LookupError("identity", "Source identity did not match.");
          // Storage events can replace or clear the report while this request
          // is pending. Preserve that current state instead of its old snapshot.
          const latest = entry.states[provider];
          if (!C.hasSourceEvidence(result) && latest?.result) entry.states[provider] = { ...latest, error: "Latest check returned no origin; showing the saved report." };
          else if (!latest?.result || Date.parse(result.checkedAt) >= Date.parse(latest.result.checkedAt)) {
            entry.states[provider] = { result };
            try { await save(result); } catch { /* Live reports still work if storage is full. */ }
          }
        } catch (error) {
          if (!partCurrent()) return;
          if (["auth", "rate", "no-list", "settings", "api-unconfigured", "api-auth"].includes(error.code)) failures.set(provider, error);
          entry.states[provider] = { ...entry.states[provider], error: error instanceof C.LookupError ? error.message : "Lookup failed. Try checking again." };
        }
      }));
      if (!current()) return;
      entry.pending = false; entry.checked = true; render(entry); refresh();
      // At most one new part every 2.2 seconds; the worker also enforces API quotas.
      if (index + 1 < work.length) await new Promise(resolve => setTimeout(resolve, 2200));
    }
    if (current()) { scanning = false; refresh(); }
  }
  function reconcile() {
    if (!enabled() || !C.isDigiKeyResultsUrl(location.href)) { clear(); return; }
    if (pageUrl !== location.href) { clear(); pageUrl = location.href; filter = { mode: "all", country: "China", keepUnknown: true, scope: "all" }; }
    const rows = R.readRows(document, location.href).filter(item => C.componentTypeEnabled(item.part.componentType, settings));
    const signature = rows.map(item => C.cacheKey(item.part)).join("\0");
    if (signature !== currentRows.map(item => C.cacheKey(item.part)).join("\0")) stop();
    const activeRows = new Set(rows.map(item => item.row));
    for (const entry of entries.values()) {
      entry.views = entry.views.filter(view => {
        const found = rows.find(item => item.row === view.row && C.cacheKey(item.part) === C.cacheKey(entry.part) && item.anchor.contains(view.host));
        if (found) return true;
        restore(view.row); view.host.remove(); return false;
      });
    }
    for (const row of hiddenRows) if (!activeRows.has(row)) restore(row);
    for (const [key, entry] of entries) if (!entry.views.length) entries.delete(key);
    currentRows = rows;
    if (!rows.length) { toolbar?.remove(); toolbar = null; ui = null; return; }
    const table = rows[0].row.closest("table");
    if (!toolbar?.isConnected || toolbar.nextElementSibling !== table) { toolbar?.remove(); mountToolbar(table); }
    for (const item of rows) {
      const key = C.cacheKey(item.part); let entry = entries.get(key);
      if (!entry) { entry = { part: item.part, states: {}, views: [], checked: false }; entries.set(key, entry); readSaved(entry); }
      if (!entry.views.some(view => view.row === item.row)) {
        const host = el("aside", undefined, item.anchor); host.setAttribute("data-origin-lens-row", "");
        const root = rootFor(host, item.anchor), body = el("section", undefined, root); body.className = "row";
        entry.views.push({ row: item.row, host, body }); render(entry);
      }
    }
    refresh();
  }
  const observer = new MutationObserver(records => {
    if (records.every(record => record.target.closest?.('#origin-lens-results,[data-origin-lens-row]') ||
      (record.type === "childList" && [...record.addedNodes, ...record.removedNodes].every(n => n.nodeType === 1 && (n.id === "origin-lens-results" || n.id === "origin-lens-results-style" || n.hasAttribute("data-origin-lens-row")))))) return;
    clearTimeout(timer); timer = setTimeout(reconcile, 200);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ["data-product-number", "data-mfg-number", "data-mfg-name", "href", "data-id", "data-product-id"] });
  window.addEventListener("popstate", reconcile);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    let preferences = false, reports = false;
    for (const [key, change] of Object.entries(changes)) {
      changedKeys.add(key);
      if (C.PREFERENCE_KEYS.includes(key)) { settings[key] = change.newValue; preferences = true; }
      if (key.startsWith(C.CACHE_PREFIX)) { if (change.newValue) catalog[key] = change.newValue; else delete catalog[key]; reports = true; }
    }
    if (preferences) { stop(); reconcile(); }
    if (reports) {
      for (const entry of entries.values()) {
        // Re-read removed cache records too, including an explicit Clear cache.
        for (const provider of R.providers(entry.part)) {
          const state = entry.states[provider], key = state?.result && C.sourceCacheKey(provider, state.result.identity);
          if (key && changes[key] && !changes[key].newValue) { delete entry.states[provider]; entry.checked = false; }
        }
        readSaved(entry); render(entry);
      }
      refresh();
    }
  });
  (async () => {
    try {
      const saved = await chrome.storage.local.get(null);
      for (const [key, value] of Object.entries(saved)) {
        if (changedKeys.has(key)) continue;
        if (C.PREFERENCE_KEYS.includes(key)) settings[key] = value;
        else if (key.startsWith(C.CACHE_PREFIX)) catalog[key] = value;
      }
      ready = true; reconcile();
    } catch { /* Fail closed when extension storage is unavailable. */ }
  })();
})();
