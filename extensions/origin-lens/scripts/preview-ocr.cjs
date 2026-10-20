// An isolated web preview of the real bundled OCR engine. No extension settings or credentials.
// Usage: node scripts/preview-ocr.cjs /absolute/path/to/photo.jpg [MPN] [port]
const http=require("node:http"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,".."),sample=path.resolve(process.argv[2]);
const mpn=process.argv[3]||"STM32G491RET6";
const port=Number(process.argv[4]||8766);
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Origin Lens OCR test</title>
<link rel="stylesheet" href="/preview.css">
<script src="/ocr.js" defer></script><script src="/vendor/ocr/tesseract.min.js" defer></script>
<script src="/ocr-engine.js" defer></script><script src="/preview.js" defer></script></head>
<body><main><h1>Origin Lens</h1><p>Local marking recognition · browser test</p><h2 id="part"></h2>
<button id="run">Read markings</button><button id="cancel">Cancel</button>
<h2 id="status" role="status">Ready</h2><p id="finding"></p><img src="/sample.jpg" width="450" height="450" alt="Test package photograph">
<p>Reference photo; assembly evidence describes the photographed sample.</p>
<details><summary>OCR text and evidence</summary><pre id="result"></pre></details></main></body></html>`;
const js=`let controller;document.getElementById('run').addEventListener('click',async()=>{
document.getElementById('result').textContent='';document.getElementById('finding').textContent='';
controller=new AbortController();document.getElementById('status').textContent='Reading…';
try { const report=await OriginLensOCREngine.scan({part:{mpn:${JSON.stringify(mpn)}},images:['/sample.jpg'],
getImage:async()=>new Uint8Array(await (await fetch('/sample.jpg')).arrayBuffer()),assetUrl:p=>new URL(p,location.href).href,signal:controller.signal});
document.getElementById('status').textContent=report.status;document.getElementById('result').textContent=JSON.stringify(report,null,2);
if(report.status==='detected'){const o=report.observations[0];document.getElementById('status').textContent=o.country+' · auto-read';document.getElementById('finding').textContent=o.marking+' read in two passes · OCR score '+o.confidence+'/100';}
} catch(e){document.getElementById('status').textContent='Stopped: '+e.message;}});
document.getElementById('part').textContent=${JSON.stringify(mpn)};
document.getElementById('cancel').addEventListener('click',()=>controller?.abort());`;
http.createServer((req,res)=>{
  const route=new URL(req.url,"http://127.0.0.1").pathname;
  // Match extension restrictions: local JS/WASM only and no outbound cloud calls.
  res.setHeader("Content-Security-Policy","default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'");
  res.setHeader("Cache-Control","no-store");
  if(route==="/"){res.setHeader("Content-Type","text/html");res.end(html);return;}
  if(route==="/preview.js"){res.setHeader("Content-Type","text/javascript");res.end(js);return;}
  if(route==="/preview.css"){res.setHeader("Content-Type","text/css");res.end("body{font:14px/1.5 ui-monospace,Consolas,monospace;background:#fafafa;color:#181818;margin:40px}main{max-width:720px;margin:auto}h1{font-size:22px;border-bottom:1px solid #888;padding-bottom:16px}h2{font-size:18px}button{font:inherit;background:white;border:1px solid;padding:8px 12px;margin-right:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere}img{max-width:100%;object-fit:contain}");return;}
  if(route==="/sample.jpg"){res.setHeader("Content-Type","image/jpeg");res.end(fs.readFileSync(sample));return;}
  if(!["/ocr.js","/ocr-engine.js"].includes(route) && !/^\/vendor\/ocr\/[\w.-]+$/.test(route)){res.writeHead(404);res.end();return;}
  const file=path.join(root,route.slice(1));
  if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader("Content-Type",route.endsWith(".js")?"text/javascript":"application/octet-stream");res.end(fs.readFileSync(file));
}).listen(port,"127.0.0.1",()=>console.log(`OCR preview: http://127.0.0.1:${port}`));
