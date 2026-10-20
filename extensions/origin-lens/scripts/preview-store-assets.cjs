// Local capture surface for the real settings UI with empty, synthetic storage.
// Never connects to installed extension storage or loads supplier data.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const allowed = new Set(['popup.html', 'popup.css', 'popup.js', 'popup-api.js', 'credentials.js', 'core.js', 'ocr.js', 'icons/origin-lens.svg', 'store-assets/promo-440x280.svg']);
const mock = `const listeners=[],values={};window.chrome={storage:{onChanged:{addListener:f=>listeners.push(f)},local:{get:async keys=>keys===null?{...values}:Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,values[k]])),set:async next=>{Object.assign(values,next);listeners.forEach(f=>f(Object.fromEntries(Object.entries(next).map(([k,v])=>[k,{newValue:v}])),'local'));},remove:async keys=>keys.forEach(k=>delete values[k])}}};`;
const stage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Origin Lens — component controls</title><style>
*{box-sizing:border-box}body{margin:0;background:#e9e8e0;color:#181818;font:16px/1.5 Consolas,"Liberation Mono",monospace}
main{padding:36px 64px;width:1280px;height:800px}header{display:flex;align-items:center;gap:14px;border-bottom:1px solid #88877f;padding-bottom:24px;font-size:14px}header img{width:32px;height:32px}header span:last-child{margin-left:auto;font-size:12px;letter-spacing:1px}
.columns{display:grid;grid-template-columns:1fr 402px;gap:80px;margin-top:36px}.copy{padding-top:72px}h1{font-size:48px;line-height:1.1;letter-spacing:-2px;font-weight:700;margin:0 0 32px}p{max-width:430px;margin:0 0 24px}.index{font-size:12px;letter-spacing:1px;margin-bottom:28px}iframe{width:402px;height:600px;border:1px solid #696961;background:#181818}footer{position:absolute;bottom:22px;left:64px;font-size:11px;color:#55554f}
</style></head><body><main><header><img src="icons/origin-lens.svg" alt=""><span>Origin Lens</span><span>BASEMENT LABS</span></header><div class="columns"><section class="copy"><p class="index">02 / SETTINGS</p><h1>Component<br>types</h1><p>Choose the components that show source reports.</p><p>Passives are off by default.<br>Changes apply to open pages.</p></section><iframe src="popup.html" title="Origin Lens settings"></iframe></div><footer>Default settings · No API key configured</footer></main></body></html>`;
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://127.0.0.1').pathname.slice(1) || 'stage.html';
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (name === 'stage.html') { res.setHeader('Content-Type', 'text/html'); res.end(stage); return; }
  if (name === 'preview-mock.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(mock); return; }
  if (!allowed.has(name)) { res.writeHead(404); res.end(); return; }
  let data = fs.readFileSync(path.join(root, name), 'utf8');
  if (name === 'popup.html') data = data.replace('<head>', '<head><script src="preview-mock.js"></script>');
  res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript');
  res.end(data);
});
server.listen(8766, '127.0.0.1', () => console.log('Store asset preview: http://127.0.0.1:8766'));
