"use strict";
importScripts("ocr.js", "core.js", "st-options.js", "network.js", "credentials.js", "ocr-bridge.js");
const inFlight = new Map();
const settingRevisions = new Map();
// Serial reservations avoid bursts across tabs; timestamps survive worker restarts.
// This accounts for this browser only. Other clients may share the API quota.
let reservations = Promise.resolve();
function reserveMouserRequest(signal) {
  const previous = reservations;
  const next = (async () => {
    try { await previous; } catch { /* A rejected reservation cannot block later requests. */ }
    signal.throwIfAborted();
    const key = "mouser-api-requests", saved = await chrome.storage.local.get(key), now = Date.now();
    const times = (Array.isArray(saved[key]) ? saved[key] : []).filter(t => Number.isFinite(t) && now - t < 86400000 && t <= now);
    if (times.length >= 1000 || times.filter(t => now - t < 60000).length >= 30) throw new OriginLens.LookupError("rate", "Mouser API request limit reached. Wait before retrying.");
    signal.throwIfAborted();
    await chrome.storage.local.set({ [key]: [...times, now] });
  })();
  reservations = next;
  return next;
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const key of [...OriginLens.PREFERENCE_KEYS, "mouserApiRevision"]) {
    if (changes[key]) settingRevisions.set(key, (settingRevisions.get(key) || 0) + 1);
  }
  for (const [key, entry] of inFlight) {
    const preferenceKey = OriginLens.typeKey(entry.componentType);
    if (changes.mouserApiRevision || changes.enabled?.newValue === false || (changes[preferenceKey] &&
      !OriginLens.componentTypeEnabled(entry.componentType, { [preferenceKey]: changes[preferenceKey].newValue }))) {
      entry.controller.abort(); inFlight.delete(key);
    }
  }
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === "origin-lens:ocr-progress" && sender.id === chrome.runtime.id && !sender.tab &&
    sender.url === chrome.runtime.getURL("offscreen.html")) { reply({ ok: true }); return false; }
  if (message?.type === "origin-lens:open-mouser-settings" && OriginLensNetwork.allowedSender(sender, chrome.runtime.id)) {
    (async () => {
      try {
        await chrome.tabs.create({ url: chrome.runtime.getURL("popup.html#api-form") });
        reply({ ok: true });
      } catch { reply({ ok: false }); }
    })();
    return true;
  }
  if (message?.type !== "origin-lens:lookup" || !OriginLensNetwork.allowedSender(sender, chrome.runtime.id)) return false;
  (async () => {
    try {
      OriginLensNetwork.validatePart(message.part);
      if (OriginLens.productUrl(sender.url, message.part.provider) !== OriginLens.productUrl(message.part.sourceUrl, message.part.provider)) {
        throw new OriginLens.LookupError("request", "The lookup no longer matches the open product page.");
      }
      const componentType = message.part.componentType || "other";
      const typeKey = OriginLens.typeKey(componentType);
      const revision = settingRevisions.get("enabled"), typeRevision = settingRevisions.get(typeKey), apiRevision = settingRevisions.get("mouserApiRevision");
      const saved = await chrome.storage.local.get(["digikeyListId", ...OriginLens.PREFERENCE_KEYS]);
      const mouserApiKey = message.operation === "mouser-api" ? await OriginLensCredentials.get() : undefined;
      const { digikeyListId = "", enabled } = saved;
      if (enabled === false || !OriginLens.componentTypeEnabled(componentType, saved) ||
        revision !== settingRevisions.get("enabled") || typeRevision !== settingRevisions.get(typeKey) || apiRevision !== settingRevisions.get("mouserApiRevision")) {
        throw new OriginLens.LookupError("disabled", "Origin Lens is off for this component type or its setting changed. Check the extension popup to resume.");
      }
      const key = JSON.stringify([message.operation, message.part, message.url, message.parentId, digikeyListId]);
      if (!inFlight.has(key)) {
        const controller = new AbortController();
        const guardedFetch = async (url, options = {}) => {
          if (new URL(url).hostname === "api.mouser.com") await reserveMouserRequest(controller.signal);
          controller.signal.throwIfAborted();
          return fetch(url, { ...options, signal: AbortSignal.any([controller.signal, options.signal].filter(Boolean)) });
        };
        const entry = { controller, componentType };
        entry.pending = (message.operation === "lcsc-ocr"
          ? OriginLensOCRBridge.run(message, controller.signal)
          : OriginLensNetwork.run(message, digikeyListId, guardedFetch, { mouserApiKey, signal: controller.signal })).finally(() => {
          if (inFlight.get(key) === entry) inFlight.delete(key);
        });
        inFlight.set(key, entry);
      }
      reply({ ok: true, data: await inFlight.get(key).pending });
    } catch (error) {
      reply({ ok: false, code: error instanceof OriginLens.LookupError ? error.code : "network",
        message: error instanceof OriginLens.LookupError ? error.message : "The source lookup failed. Reload the extension and page, then retry." });
    }
  })();
  return true;
});
