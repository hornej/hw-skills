/* Pure OCR interpretation and image preprocessing; also exercised with real OCR in the smoke check. */
((root) => {
  "use strict";
  const VERSION = 1;
  const ENGINE = "Tesseract.js 7.0.0";
  const MIN_CONFIDENCE = 80;
  // Only mappings supported by ST's explanation. Other marks remain literal text.
  const COUNTRIES = Object.freeze({ CHN: "China", MYS: "Malaysia" });
  const INTERPRETATION_URL = "https://community.st.com/stm32-mcus-products-25/does-anyone-have-a-cheat-sheet-to-tell-me-what-the-date-code-is-and-what-it-stands-for-34162";
  const token = text => typeof text === "string" ? text.toUpperCase().replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "") : "";
  function summarize(readings, part) {
    const observations = [];
    let conflicting = false, mismatched = false;
    for (const reading of readings) {
      const candidates = new Map();
      let wrongPart = false;
      for (const pass of reading.passes) {
        const families = pass.text.toUpperCase().match(/\bSTM32[A-Z]\d{3}/g) || [];
        if (families.some(f => !part.mpn.toUpperCase().startsWith(f))) wrongPart = true;
        for (const word of pass.words) {
          const marking = token(word.text);
          if (!COUNTRIES[marking] || word.confidence < MIN_CONFIDENCE) continue;
          if (!candidates.has(marking)) candidates.set(marking, new Map());
          const votes = candidates.get(marking), key = `${pass.rotation}:${pass.variant}`;
          votes.set(key, Math.max(votes.get(key) || 0, word.confidence));
        }
      }
      if (wrongPart) { mismatched = true; continue; }
      if (candidates.size > 1) { conflicting = true; continue; }
      for (const [marking, votes] of candidates) {
        const scores = [0,90,180,270].filter(r => votes.has(`${r}:gray`) && votes.has(`${r}:contrast`))
          .map(r => Math.min(votes.get(`${r}:gray`), votes.get(`${r}:contrast`)));
        if (!scores.length) continue;
        observations.push({ marking, country: COUNTRIES[marking], stage: "assembly",
          method: "local OCR", imageUrl: reading.imageUrl, sha256: reading.sha256,
          confidence: Math.max(...scores) });
      }
    }
    if (new Set(observations.map(o => o.marking)).size > 1) conflicting = true;
    return { status: conflicting ? "conflict" : mismatched ? "part-mismatch" : observations.length ? "detected" : "unreadable",
      observations: conflicting || mismatched ? [] : observations };
  }
  function valid(report, images, part) {
    if (!report || report.version !== VERSION || report.engine !== ENGINE ||
      !Number.isFinite(Date.parse(report.processedAt)) || !Array.isArray(report.readings) ||
      report.readings.length > 3 || !["detected","conflict","part-mismatch","unreadable","unavailable"].includes(report.status)) return false;
    for (const reading of report.readings) {
      if (!reading || !images.includes(reading.imageUrl) || !/^[a-f0-9]{64}$/.test(reading.sha256 || "") ||
        !Array.isArray(reading.passes) || reading.passes.length > 8) return false;
      const keys = new Set();
      for (const pass of reading.passes) {
        if (!pass) return false;
        const key = `${pass.rotation}:${pass.variant}`;
        if (keys.has(key) || ![0,90,180,270].includes(pass.rotation) || !["gray","contrast"].includes(pass.variant) ||
          typeof pass.text !== "string" || pass.text.length > 1500 || !Array.isArray(pass.words) || pass.words.length > 120 ||
          !pass.words.every(w => w && typeof w.text === "string" && w.text.length <= 80 &&
            Number.isFinite(w.confidence) && w.confidence >= 0 && w.confidence <= 100)) return false;
        keys.add(key);
      }
    }
    const derived = summarize(report.readings, part);
    if (report.status === "unavailable") return report.readings.length === 0 && report.observations?.length === 0;
    return report.status === derived.status && JSON.stringify(report.observations) === JSON.stringify(derived.observations);
  }
  function packPass(data, rotation, variant) {
    const words = (data.blocks || []).flatMap(b => (b.paragraphs || []).flatMap(p =>
      (p.lines || []).flatMap(l => (l.words || []).map(w => ({
        text: String(w.text || "").slice(0, 80), confidence: Math.max(0, Math.min(100, Number(w.confidence) || 0))
      }))))).slice(0, 120);
    return { rotation, variant, text: String(data.text || "").slice(0, 1500), words };
  }
  // Find the dark package body against a light product-photo background. Restrict
  // to dense rows/columns so fine leads and catalog watermarks don't set the crop.
  function cropBox(rgba, width, height) {
    const rows = new Uint32Array(height), cols = new Uint32Array(width);
    for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
      const i=(y*width+x)*4;
      if (.299*rgba[i]+.587*rgba[i+1]+.114*rgba[i+2] < 150 && rgba[i+3] > 128) { rows[y]++; cols[x]++; }
    }
    function run(histogram) {
      const max = histogram.reduce((a,b) => Math.max(a,b), 0);
      let first=-1,last=-1;
      for(let i=0;i<histogram.length;i++) if(histogram[i]>max*.55) {
        if(first<0) first=i; last=i;
      }
      return first<0 ? [0,histogram.length-1] : [first,last];
    }
    const [x0,x1]=run(cols),[y0,y1]=run(rows);
    if(x1-x0<width*.12 || y1-y0<height*.12) return {x:0,y:0,width,height};
    const dx=Math.round((x1-x0)*.025),dy=Math.round((y1-y0)*.025);
    return {x:x0+dx,y:y0+dy,width:x1-x0+1-2*dx,height:y1-y0+1-2*dy};
  }
  function grayscale(data, contrast) {
    const histogram = new Uint32Array(256);
    for(let i=0;i<data.length;i+=4) histogram[Math.round(.299*data[i]+.587*data[i+1]+.114*data[i+2])]++;
    const percentile = fraction => { let sum=0; for(let i=0;i<256;i++) { sum+=histogram[i]; if(sum>=data.length/4*fraction)return i; } return 255; };
    const low=percentile(.02),high=Math.max(low+1,percentile(.98));
    for(let i=0;i<data.length;i+=4) {
      let value=Math.round(.299*data[i]+.587*data[i+1]+.114*data[i+2]);
      if(contrast) value=255-Math.max(0,Math.min(255,(value-low)*255/(high-low)));
      data[i]=data[i+1]=data[i+2]=value; data[i+3]=255;
    }
    return data;
  }
  const api = { VERSION, ENGINE, MIN_CONFIDENCE, INTERPRETATION_URL, summarize, valid, packPass, cropBox, grayscale };
  if (typeof module !== "undefined" && module.exports) module.exports=api;
  else root.OriginLensOCR=Object.freeze(api);
})(globalThis);
