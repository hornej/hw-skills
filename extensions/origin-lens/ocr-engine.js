/* Runs only in the extension's offscreen document (or the isolated local smoke preview). */
((root) => {
  "use strict";
  const O = root.OriginLensOCR;
  function abortable(promise, signal) {
    return new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason);
      if (signal.aborted) { reject(signal.reason); return; }
      signal.addEventListener("abort", abort, { once: true });
      (async () => {
        try { resolve(await promise); } catch (error) { reject(error); }
        finally { signal.removeEventListener("abort", abort); }
      })();
    });
  }
  async function scan({ part, images, getImage, assetUrl, signal }) {
    const readings = [];
    let worker;
    const creating = root.Tesseract.createWorker("eng", 1, {
      workerPath: assetUrl("vendor/ocr/worker.min.js"), workerBlobURL: false,
      corePath: assetUrl("vendor/ocr"), langPath: assetUrl("vendor/ocr"),
      cacheMethod: "none", gzip: true,
      // The rejected initialization/recognition promises are handled below.
      errorHandler: () => {}
    }, { load_system_dawg: "0", load_freq_dawg: "0" });
    // Terminate even if initialization finishes after the caller has cancelled.
    const ready = (async () => {
      const created = await creating;
      if (signal.aborted) { await created.terminate(); signal.throwIfAborted(); }
      return created;
    })();
    try {
      worker = await abortable(ready, signal);
      await abortable(worker.setParameters({ tessedit_pageseg_mode: "6", user_defined_dpi: "300" }), signal);
      const ordered = [...images].sort((a,b) => Number(/_blank\./i.test(b))-Number(/_blank\./i.test(a))).slice(0,3);
      for (const imageUrl of ordered) {
        signal.throwIfAborted();
        let bytes, bitmap;
        try {
          bytes = await getImage(imageUrl);
          bitmap = await abortable(createImageBitmap(new Blob([bytes])), signal);
          if (bitmap.width > 2400 || bitmap.height > 2400 || bitmap.width*bitmap.height > 4000000) {
            bitmap.close(); continue;
          }
        } catch (error) { signal.throwIfAborted(); continue; }
        try {
          const hash = await crypto.subtle.digest("SHA-256", bytes);
          const reading = { imageUrl, sha256: Array.from(new Uint8Array(hash), v => v.toString(16).padStart(2,"0")).join(""), passes: [] };
          readings.push(reading);
          const original = document.createElement("canvas");
          original.width=bitmap.width; original.height=bitmap.height;
          const ctx=original.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(bitmap,0,0);
          const box=O.cropBox(ctx.getImageData(0,0,bitmap.width,bitmap.height).data,bitmap.width,bitmap.height);
          const scale=Math.min(3,1400/Math.max(box.width,box.height));
          const crop=document.createElement("canvas");
          crop.width=Math.round(box.width*scale); crop.height=Math.round(box.height*scale);
          crop.getContext("2d").drawImage(bitmap,box.x,box.y,box.width,box.height,0,0,crop.width,crop.height);
          for (const rotation of [0,90,180,270]) {
            for (const variant of ["gray","contrast"]) {
              signal.throwIfAborted();
              const canvas=document.createElement("canvas"), sideways=rotation%180!==0;
              canvas.width=sideways?crop.height:crop.width; canvas.height=sideways?crop.width:crop.height;
              const context=canvas.getContext("2d", {willReadFrequently:true});
              context.translate(canvas.width/2,canvas.height/2); context.rotate(rotation*Math.PI/180);
              context.drawImage(crop,-crop.width/2,-crop.height/2);
              const pixels=context.getImageData(0,0,canvas.width,canvas.height);
              O.grayscale(pixels.data,variant==="contrast"); context.putImageData(pixels,0,0);
              const {data}=await abortable(worker.recognize(canvas,{}, {text:true,blocks:true}),signal);
              reading.passes.push(O.packPass(data,rotation,variant));
            }
            const summary=O.summarize(readings,part);
            if(summary.status!=="unreadable") break;
          }
          // One readable sample is sufficient. Do not claim coverage of unseen photos or stock.
          if(O.summarize(readings,part).status!=="unreadable") break;
        } finally { bitmap.close(); }
      }
      return { version:O.VERSION,engine:O.ENGINE,processedAt:new Date().toISOString(),readings,
        ...(readings.length ? O.summarize(readings,part) : {status:"unavailable",observations:[]}) };
    } finally { if(worker) await worker.terminate(); }
  }
  root.OriginLensOCREngine=Object.freeze({scan,abortable});
})(globalThis);
