"use strict";
const C = globalThis.OriginLens;
const status = document.getElementById("status");
const toggle = document.getElementById("enabled");
const types = document.getElementById("component-types");
const preferences = {}, changedPreferences = new Set(), typeInputs = new Map();
let ready = false;
function showPreferences() {
  const enabled = preferences.enabled !== false;
  toggle.checked = enabled;
  document.getElementById("enabled-state").textContent = enabled ? "On" : "Off";
  document.getElementById("enabled-hint").textContent = enabled
    ? "Applies to selected component types."
    : "Panels and lookups paused. Type selections retained.";
  for (const [id, input] of typeInputs) input.checked = C.componentTypeEnabled(id, preferences);
}
async function savePreference(key, value, input, message) {
  input.disabled = true;
  try {
    await chrome.storage.local.set({ [key]: value });
    preferences[key] = value;
    status.textContent = message;
  } catch { status.textContent = "The setting could not be saved. Try again."; }
  finally { showPreferences(); input.disabled = false; }
}
for (const type of C.COMPONENT_TYPES) {
  const label = document.createElement("label"); label.className = "type-option";
  const input = document.createElement("input"); input.type = "checkbox"; input.id = "type-" + type.id; label.htmlFor = input.id;
  const text = document.createElement("span");
  const name = document.createElement("span"); name.id = input.id + "-name"; name.textContent = type.label;
  input.setAttribute("aria-labelledby", name.id); text.append(name);
  if (type.hint) {
    const hint = document.createElement("small"); hint.id = input.id + "-hint"; hint.textContent = type.hint;
    input.setAttribute("aria-describedby", hint.id);
    text.append(hint);
  }
  label.append(input, text);
  typeInputs.set(type.id, input);
  input.addEventListener("change", async () => {
    if (!ready) return;
    const value = input.checked;
    await savePreference(C.typeKey(type.id), value, input,
      `${type.label}: ${value ? "shown when Origin Lens is on" : "hidden; lookups stopped"}.`);
  });
  document.getElementById("type-options").append(label);
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const key of C.PREFERENCE_KEYS) {
    if (!changes[key]) continue;
    preferences[key] = changes[key].newValue; changedPreferences.add(key);
  }
  if (ready) showPreferences();
});
(async () => {
  try {
    const saved = await chrome.storage.local.get(C.PREFERENCE_KEYS);
    for (const key of C.PREFERENCE_KEYS) if (!changedPreferences.has(key)) preferences[key] = saved[key];
    ready = true; showPreferences(); toggle.disabled = false; types.disabled = false;
  } catch { status.textContent = "Settings could not be read. Close and reopen this popup to retry."; }
})();
toggle.addEventListener("change", async () => {
  if (!ready) return;
  await savePreference("enabled", toggle.checked, toggle,
    toggle.checked ? "On. Selected component types are shown on open product pages." : "Off. All origin panels are hidden and lookups are stopped.");
});
document.getElementById("clear").addEventListener("click", async () => {
  try {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter(k => k.startsWith("origin-lens:v"));
    await chrome.storage.local.remove(keys);
    status.textContent = `Cleared ${keys.length} cached result${keys.length === 1 ? "" : "s"}. Use Refresh on an open page.`;
  } catch { status.textContent = "Cache could not be cleared."; }
});
