"use strict";
let active;
const trustedWorker = sender => sender.id === chrome.runtime.id && !sender.tab &&
  (!sender.url || sender.url === chrome.runtime.getURL("background.js"));
chrome.runtime.onMessage.addListener((message,sender,reply) => {
  if(!trustedWorker(sender)) return false;
  if(message?.type==="origin-lens:ocr-cancel") {
    if(active?.id===message.id) active.controller.abort();
    reply({ok:true}); return false;
  }
  if(message?.type!=="origin-lens:ocr-run") return false;
  if(active) { reply({ok:false,code:"busy"}); return false; }
  const controller=new AbortController();
  active={id:message.id,controller};
  const timeout=setTimeout(()=>controller.abort(new Error("OCR time limit reached.")),60000);
  // Active OCR can outlive the service worker's idle timeout. Only keep it awake
  // while this bounded job needs its reply channel; no idle/background polling.
  const heartbeat=setInterval(async()=>{
    try { await chrome.runtime.sendMessage({type:"origin-lens:ocr-progress"}); } catch { controller.abort(); }
  },10000);
  (async()=>{
    try {
      const fetcher=(url,options={})=>fetch(url,{...options,signal:AbortSignal.any([controller.signal,options.signal].filter(Boolean))});
      // Revalidate the live listing here; the page cannot choose arbitrary photos
      // or assign its own text/identity to an image.
      const page=await OriginLensNetwork.run({operation:"lcsc-product",part:message.part,url:message.url},"",fetcher);
      const result=OriginLens.fromLCSC(OriginLens.parseHtml(page.html),page.url,message.part);
      const report=await OriginLensOCREngine.scan({
        part:result.identity,images:result.photoEvidence.images,
        getImage:url=>OriginLensNetwork.readLCSCImage(url,result.identity,fetcher),
        assetUrl:path=>chrome.runtime.getURL(path),signal:controller.signal
      });
      reply({ok:true,report});
    } catch { reply({ok:false,code:controller.signal.aborted?"cancelled":"ocr"}); }
    finally { clearTimeout(timeout); clearInterval(heartbeat); active=null; }
  })();
  return true;
});
