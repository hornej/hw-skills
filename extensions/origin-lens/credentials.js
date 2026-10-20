/* Loaded only by extension pages and the service worker, never content scripts. */
((root) => {
  "use strict";
  const validate = value => {
    if (typeof value !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value.trim())) throw new Error("Enter a valid Mouser Search API key.");
    return value.trim();
  };
  async function access(mode, action) {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("origin-lens-credentials", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("credentials");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("API settings could not be opened."));
      request.onblocked = () => reject(new Error("Close other Origin Lens popups and retry."));
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("credentials", mode);
        const request = action(tx.objectStore("credentials"));
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = tx.onerror = () => reject(new Error("API settings could not be saved or read."));
      });
    } finally { db.close(); }
  }
  root.OriginLensCredentials = Object.freeze({ validate,
    get: () => access("readonly", store => store.get("mouser")),
    set: value => { const key = validate(value); return access("readwrite", store => store.put(key, "mouser")); },
    remove: () => access("readwrite", store => store.delete("mouser"))
  });
})(globalThis);
