(() => {
  "use strict";
  const credentials = globalThis.OriginLensCredentials;
  const get = id => document.getElementById(id);
  const input = get("mouser-key"), feedback = get("api-feedback"), state = get("api-state");
  let busy = false;
  const controls = [input, get("api-save"), get("api-remove"), get("api-import")];
  const settings = get("source-settings"), shortcut = get("api-settings");
  function revealSettings() {
    settings.open = true;
    shortcut.setAttribute("aria-expanded", "true");
    get("api-form").scrollIntoView({ block: "start" });
    input.focus({ preventScroll: true });
  }
  shortcut.addEventListener("click", revealSettings);
  settings.addEventListener("toggle", () => shortcut.setAttribute("aria-expanded", String(settings.open)));
  async function showState() {
    const configured = !!await credentials.get();
    state.textContent = configured ? "Key saved · API lookup enabled" : "No key · website lookup only";
    get("api-overview-state").textContent = configured ? "Mouser: API key saved" : "Mouser: API key not configured";
  }
  async function change(action) {
    if (busy) return;
    busy = true; controls.forEach(node => { node.disabled = true; });
    input.removeAttribute("aria-invalid"); feedback.textContent = "";
    try {
      await action();
      input.value = "";
      await showState();
      await chrome.storage.local.set({ mouserApiRevision: crypto.randomUUID() });
      feedback.textContent = "Saved. Open product pages are checking sources again.";
    } catch (error) {
      feedback.textContent = error?.message === "Enter a valid Mouser Search API key." ? error.message : "API settings could not be updated. Reopen the popup and retry.";
      if (error?.message === "Enter a valid Mouser Search API key.") input.setAttribute("aria-invalid", "true");
    } finally { busy = false; controls.forEach(node => { node.disabled = false; }); }
  }
  get("api-form").addEventListener("submit", event => {
    event.preventDefault();
    change(() => credentials.set(input.value));
  });
  get("api-remove").addEventListener("click", () => change(() => credentials.remove()));
  get("api-import").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    await change(async () => {
      if (file.size > 4096) throw new Error("Invalid settings file.");
      const settings = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
      if (settings?.format !== "origin-lens-api-settings-v1") throw new Error("Invalid settings file.");
      await credentials.set(settings.mouserSearchApiKey);
    });
    event.target.value = "";
  });
  if (globalThis.location?.hash === "#api-form") revealSettings();
  showState().catch(() => {
    state.textContent = "API configuration could not be read. Reopen the popup to retry.";
    get("api-overview-state").textContent = "Mouser: API configuration could not be read";
  });
})();
