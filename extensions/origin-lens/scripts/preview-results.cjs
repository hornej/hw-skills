// Synthetic origin reports on captured public DigiKey row markup; no source requests.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const fixture = require('../tests/fixtures/digikey-results-rows.json');
const rows = fixture.rows.slice(0,4);
const esc = text => String(text).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Origin Lens results — synthetic preview</title>
<style>body{font:14px system-ui;margin:24px;background:#111;color:#eee}main{max-width:1100px}table{border-collapse:collapse;width:100%}th,td{padding:14px;text-align:left;border-bottom:1px solid #666;vertical-align:top}td:first-child{width:65%}a{color:#8acbff}nav{margin:12px 0}nav a{margin-right:12px}aside{margin-block:12px}button{font:inherit}#width{margin-bottom:12px}h1{font-size:22px}</style>
<p>Origin Lens results UI test · synthetic countries · no network requests</p>
<label>Preview width <select id="width"><option>1100</option><option>480</option></select></label>
<main><h1>USB connector results</h1><nav class="MuiBreadcrumbs-root">${fixture.categories.map(c=>`<a href="${c.href}">${esc(c.label)}</a>`).join('')}</nav>
<table><thead><tr><th>Manufacturer part number</th><th>Availability</th><th>Package</th></tr></thead><tbody>${rows.map(r=>`<tr><td><span ${Object.entries(r.data).map(([k,v])=>`${k}="${esc(v)}"`).join(' ')}></span><div data-atag="tr-product"><a data-testid="data-table-product-number" data-product-id="${r.productId}" href="${esc(r.href)}">${esc(r.mpn)}</a><p><a data-testid="data-table-mfr-link">${esc(r.manufacturer)}</a></p></div></td><td>In stock</td><td>Cut Tape / Reel</td></tr>`).join('')}</tbody></table></main>
<script src="/ocr.js"></script><script src="/core.js"></script><script src="/results.js"></script><script src="/mock.js"></script><script src="/results-content.js"></script></html>`;
const mock = `
const C={...OriginLens},R={...OriginLensResults},values={listViewEnabled:true},listeners=[];
window.OriginLens=C;window.OriginLensResults=R;
const actualReadRows=R.readRows;R.readRows=doc=>actualReadRows(doc,${JSON.stringify(fixture.url)});C.isDigiKeyResultsUrl=()=>true;
const parts=R.readRows(document).map(row=>row.part);
const make=(part,index,provider)=>provider==='digikey'?C.fromDigiKey({manufacturer:part.manufacturer,manufacturerPartNumber:part.mpn,digiKeyPartNumber:part.sku,countryOfOrigin:['Italy','Taiwan','Thailand',''][index]},part):C.fromMouserApi({Errors:[],SearchResults:{NumberOfResult:1,Parts:[{Manufacturer:part.manufacturer,ManufacturerPartNumber:part.mpn,MouserPartNumber:'TEST-'+part.mpn,ProductDetailUrl:'https://www.mouser.com/en/ProductDetail/Test/'+encodeURIComponent(part.mpn),TradeCompliance:[{ComplianceName:'Country of Origin',ComplianceValue:['Italy','Taiwan','Thailand',''][index]},{ComplianceName:'Assembly Country of Origin',ComplianceValue:['China','Malaysia','Thailand',''][index]}]}]}},part);
for(let i=0;i<2;i++)for(const provider of ['digikey','mouser']){const result=make(parts[i],i,provider),key=C.sourceCacheKey(provider,result.identity);values[key]={key,result};}
window.chrome={storage:{onChanged:{addListener:f=>listeners.push(f)},local:{get:async()=>({...values}),set:async next=>{Object.assign(values,next);listeners.forEach(f=>f(Object.fromEntries(Object.entries(next).map(([k,v])=>[k,{newValue:v}])),'local'));},remove:async keys=>keys.forEach(k=>delete values[k])}},runtime:{sendMessage:async message=>({ok:true,data:make(message.part,parts.findIndex(p=>p.sku===message.part.sku),message.operation==='mouser-api'?'mouser':'digikey')})}};
document.querySelector('#width').addEventListener('change',e=>document.querySelector('main').style.maxWidth=e.target.value+'px');
`;
const files = new Set(['core.js','ocr.js','results.js','results-content.js']);
http.createServer((req,res)=>{
  const name=new URL(req.url,'http://127.0.0.1').pathname.slice(1);res.setHeader('Cache-Control','no-store');
  if(!name){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}
  else if(name==='mock.js'){res.setHeader('Content-Type','text/javascript');res.end(mock);}
  else if(files.has(name)){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(__dirname,'..',name)));}
  else{res.writeHead(404);res.end();}
}).listen(8767,'127.0.0.1',()=>console.log('Synthetic results preview: http://127.0.0.1:8767'));
