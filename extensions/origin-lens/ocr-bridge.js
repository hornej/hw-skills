/* Service-worker lifecycle bridge. Transient locks only; evidence is persisted by the normal cache. */
((root)=>{
  "use strict";
  let serial=Promise.resolve(), queued=0;
  async function perform(message,signal) {
    const url=chrome.runtime.getURL("offscreen.html");
    signal.throwIfAborted();
    const contexts=await chrome.runtime.getContexts({contextTypes:["OFFSCREEN_DOCUMENT"],documentUrls:[url]});
    if(!contexts.length) await chrome.offscreen.createDocument({
      url:"offscreen.html",reasons:["WORKERS","BLOBS","DOM_PARSER"],
      justification:"Read package markings locally using a bundled OCR worker and image canvas."
    });
    const id=crypto.randomUUID();
    const cancel=async()=>{try{await chrome.runtime.sendMessage({type:"origin-lens:ocr-cancel",id});}catch{/* Document may already be closing. */}};
    signal.addEventListener("abort",cancel,{once:true});
    try {
      signal.throwIfAborted();
      const reply=await chrome.runtime.sendMessage({type:"origin-lens:ocr-run",id,part:message.part,url:OriginLens.productUrl(message.url,"lcsc")});
      signal.throwIfAborted();
      if(!reply?.ok) throw new OriginLens.LookupError("ocr","Automatic reading was unavailable. You can inspect the photos or retry.");
      return reply.report;
    } finally {
      signal.removeEventListener("abort",cancel);
      await chrome.offscreen.closeDocument();
    }
  }
  async function run(message,signal) {
    if(queued>=4) throw new OriginLens.LookupError("busy","Photo reader is busy. Retry after the other parts finish.");
    queued++;
    const previous=serial;
    const next=(async()=>{
      try { await previous; } catch { /* A failed job cannot block later parts. */ }
      return perform(message,signal);
    })();
    serial=next;
    try { return await next; } finally { queued--; }
  }
  root.OriginLensOCRBridge=Object.freeze({run});
})(globalThis);
