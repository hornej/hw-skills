// Local settings preview with fake Chrome preferences; never uses installed extension storage.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const files=new Set(['popup.html','popup.css','popup.js','popup-api.js','credentials.js','core.js','ocr.js']);
const mock=`const listeners=[];const values={};window.chrome={storage:{onChanged:{addListener:f=>listeners.push(f)},local:{
get:async keys=>keys===null?{...values}:Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,values[k]])),
set:async next=>{Object.assign(values,next);listeners.forEach(f=>f(Object.fromEntries(Object.entries(next).map(([k,v])=>[k,{newValue:v}])),'local'));},remove:async keys=>keys.forEach(k=>delete values[k])}}};`;
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://127.0.0.1').pathname.slice(1)||'popup.html';
  if(name==='preview-mock.js'){res.setHeader('Content-Type','text/javascript');res.end(mock);return;}
  if(!files.has(name)){res.writeHead(404);res.end();return;}
  let text=fs.readFileSync(path.join(__dirname,'..',name),'utf8');
  if(name==='popup.html')text=text.replace('<head>','<head><script src="preview-mock.js"></script>').replace('Origin Lens settings</title>','Origin Lens settings — local test preview</title>');
  res.setHeader('Content-Type',name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript');
  res.setHeader('Cache-Control','no-store');res.end(text);
});
server.listen(8765,'127.0.0.1',()=>console.log('Settings preview: http://127.0.0.1:8765 (use a synthetic key only)'));
