// Isolated UI preview: synthetic reports, no installed extension storage or network lookups.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = new Set(['core.js', 'ocr.js', 'st-options.js', 'content.js']);
const fixture = process.argv.includes('--infineon') ? require('../tests/fixtures/infineon-irlml6344.json') : null;
const stFixture = process.argv.includes('--st-options') ? require('../tests/fixtures/stm32g491re-options.json') : null;
const mock = `
const C={...OriginLens}, listeners=[], values={};window.OriginLens=C;
const part={provider:'digikey',host:'www.digikey.com',manufacturer:'Nexperia USA Inc.',
mpn:'PSMN040-100MSEX',sku:'1727-1086-2-ND',
sourceUrl:'https://www.digikey.com/en/products/detail/nexperia-usa-inc/PSMN040-100MSEX/4004849'};
const fixture=${JSON.stringify(fixture)};
const stFixture=${JSON.stringify(stFixture)};
if(fixture){Object.assign(part,{manufacturer:'Infineon Technologies',mpn:'IRLML6344TRPBF',sku:'IRLML6344TRPBFTR-ND',sourceUrl:'https://www.digikey.com/en/products/detail/infineon-technologies/IRLML6344TRPBF/2538152'});document.querySelector('h1').textContent=part.mpn;}
if(stFixture){Object.assign(part,{manufacturer:'STMicroelectronics',mpn:'STM32G491RET6',sku:'497-STM32G491RET6-ND',sourceUrl:'https://www.digikey.com/en/products/detail/stmicroelectronics/STM32G491RET6/13592591'});document.querySelector('h1').textContent=part.mpn;}
C.readIdentity=()=>part;C.readComponentType=()=>'discretes';
C.lookupDigiKey=async()=>C.fromDigiKey({manufacturer:part.manufacturer,
manufacturerPartNumber:part.mpn,digiKeyPartNumber:part.sku,countryOfOrigin:stFixture?'Taiwan':'China'},part);
if(fixture)C.lookupDigiKey=async()=>{throw new C.LookupError('network','Synthetic preview: no network request.');};
const stReply=message=>{
  if(!stFixture)return null;
  const O=OriginLensOptions, checkedAt=new Date().toISOString();
  if(message.operation==='st-family')return {ok:true,data:{html:'<table id="DataTables_Table_sample_and_buy" data-product-id="PF269474"><thead><tr>'+Object.entries({'5080':'Country of Origin','4363':'Package','1069':'Packing Type','960':'Operating temperature (°C)','962':'Operating Temperature (°C) (max)'}).map(([id,label])=>'<th data-attribute-id="'+id+'">'+label+'</th>').join('')+'</tr></thead></table>'}};
  if(message.operation==='st-origin')return {ok:true,data:C.fromST(stFixture.attributes.CP531377,stFixture.products[0],part)};
  if(message.operation==='st-options')return {ok:true,data:O.make(part,stFixture.parentId,stFixture.products,stFixture.products.map(p=>({productId:p.prmis_id,attributes:stFixture.attributes[p.prmis_id],checkedAt})),checkedAt)};
  return null;
};
window.chrome={storage:{onChanged:{addListener:f=>listeners.push(f)},local:{
get:async keys=>keys===null?{...values}:Object.fromEntries(keys.map(k=>[k,values[k]])),
set:async next=>{Object.assign(values,next);listeners.forEach(f=>f(Object.fromEntries(Object.entries(next).map(([k,v])=>[k,{newValue:v}])),'local'));},
remove:async keys=>keys.forEach(k=>delete values[k])}},
runtime:{sendMessage:async message=>stReply(message)||(fixture&&message.operation==='infineon'?{ok:true,data:C.fromInfineon(fixture,part)}:{ok:false,code:'network',message:'Synthetic preview: no network request.'})}};
document.querySelector('#width').addEventListener('change',e=>document.querySelector('main').style.maxWidth=e.target.value+'px');
`;
http.createServer((req,res)=>{
  const name=new URL(req.url,'http://127.0.0.1').pathname.slice(1);
  res.setHeader('Cache-Control','no-store');
  if(!name){
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Origin Lens panel — synthetic preview</title>
<style>body{margin:24px;font:14px monospace;background:#111;color:#ddd}main{max-width:760px}select{font:inherit}</style>
<p>Origin Lens UI test · synthetic data · no source requests</p>
<label>Panel width <select id="width"><option>760</option><option>360</option></select></label>
<main><h1>PSMN040-100MSEX</h1></main>
<script src="/ocr.js"></script><script src="/core.js"></script><script src="/st-options.js"></script><script src="/preview-mock.js"></script><script src="/content.js"></script></html>`);
  }else if(name==='preview-mock.js'){res.setHeader('Content-Type','text/javascript');res.end(mock);}
  else if(files.has(name)){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(__dirname,'..',name)));}
  else {res.writeHead(404);res.end();}
}).listen(8766,'127.0.0.1',()=>console.log('Synthetic panel preview: http://127.0.0.1:8766'));
