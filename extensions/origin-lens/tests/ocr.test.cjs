const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const O=require("../ocr.js"),C=require("../core.js"),N=require("../network.js");
const part={provider:"digikey",host:"www.digikey.com",manufacturer:"STMicroelectronics",mpn:"STM32G491RET6",sku:"497-STM32G491RET6-ND",sourceUrl:"https://www.digikey.com/en/products/detail/stmicroelectronics/STM32G491RET6/13592591"};
const image="https://assets.lcsc.com/images/lcsc/900x900/20230511_STMicroelectronics-STM32G491RET6_C3231005_blank.jpg";
const url="https://www.lcsc.com/product-detail/C3231005.html";
const pass=(text="CHN",confidence=90,variant="gray",rotation=0)=>({text,words:[{text,confidence}],variant,rotation});
const reading=(passes=[pass(),pass("CHN",86,"contrast")])=>({imageUrl:image,sha256:"a".repeat(64),passes});
const report=(readings=[reading()])=>({version:O.VERSION,engine:O.ENGINE,processedAt:new Date().toISOString(),readings,...O.summarize(readings,part)});
const record=()=>{
 const product={"@type":"Product",mpn:part.mpn,sku:"C3231005",brand:{name:"ST"},offers:{url},image:[image]};
 return C.fromLCSC({querySelectorAll:()=>[{textContent:JSON.stringify(product)}]},url,part);
};
const script=name=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test("OCR requires a literal supported country in two high-scoring variants at the same rotation",()=>{
 assert.equal(report().status,"detected");assert.equal(report().observations[0].confidence,86);
 assert.equal(report().observations[0].country,"China");
 for(const passes of [[pass()],[pass(),pass("CHN",79,"contrast")],[pass(),pass()],[pass(),pass("CHN",95,"gray",90)],
   [pass("C H N"),pass("C H N",90,"contrast")],[pass("CHN123"),pass("CHN123",90,"contrast")],
   [pass("GQ"),pass("GQ",95,"contrast")],[pass("TWN"),pass("TWN",95,"contrast")]]){
  assert.equal(report([reading(passes)]).status,"unreadable");
 }
 const malaysia=report([reading([pass("MYS"),pass("MYS",90,"contrast")])]);
 assert.equal(malaysia.observations[0].country,"Malaysia");
 const rotated=report([reading([pass("CHN",85,"gray",90),pass("CHN",87,"contrast",90)])]);
 assert.equal(rotated.status,"detected");
});

test("conflicting countries or a clearly different STM32 family cannot become a country claim",()=>{
 const conflict=report([reading([pass(),pass("CHN",90,"contrast"),pass("MYS",90,"gray",90)])]);
 assert.equal(conflict.status,"conflict");assert.deepEqual(conflict.observations,[]);
 const mismatch=reading();mismatch.passes[0].text="STM32F103 C8T6 CHN";
 assert.equal(report([mismatch]).status,"part-mismatch");
 const multiple=reading([pass("MYS"),pass("MYS",90,"contrast")]);
 assert.equal(report([reading(),multiple]).status,"conflict");
});

test("OCR cached evidence is derived from bounded readings and tied to the exact image and listing",()=>{
 const r=record(),key=C.sourceCacheKey("lcsc",part),entries={[key]:{key,result:r}};
 assert.equal(C.sourceFresh(entries[key],"lcsc",part),false); // Upgrade forces OCR on old photo-only cache.
 r.photoEvidence.ocr=report();assert.equal(C.validLCSCPhotos(r),true);assert.equal(C.sourceFresh(entries[key],"lcsc",part),true);
 assert.equal(C.hasOriginEvidence(r),false);assert.deepEqual(r.fields.assembly.values,[]);
 assert.equal(C.savedSource(entries,"lcsc",{...part,mpn:part.mpn+"TR"}),null);
 for(const mutation of [
  v=>v.observations[0].country="Taiwan",
  v=>v.readings[0].imageUrl="https://evil.test/photo.jpg",
  v=>v.readings[0].sha256="wrong",
  v=>v.readings[0].passes[0].words[0].confidence=10,
  v=>v.readings[0].passes[0].text="x".repeat(1501),
  v=>v.readings[0].passes[1].variant="gray",
  v=>v.version=0
 ]){const v=report();mutation(v);assert.equal(O.valid(v,[image],part),false);}
});

test("LCSC OCR failures preserve photographs and cancellation is never converted to evidence",async()=>{
 const doc={querySelectorAll:()=>[{textContent:JSON.stringify({"@type":"Product",mpn:part.mpn,sku:"C3231005",brand:{name:"ST"},offers:{url},image:[image]})}]};
 const request=async op=>op==="lcsc-product"?{html:"",url}:op==="lcsc-review"?null:report();
 const r=await C.lookupLCSC(part,request,()=>doc,url);
 assert.equal(r.photoEvidence.ocr.status,"detected");assert.equal(r.photoEvidence.observation,null);
 const failed=await C.lookupLCSC(part,async op=>{if(op==="lcsc-ocr")throw Error("offline");return request(op);},()=>doc,url);
 assert.equal(failed.photoEvidence.ocr.status,"unavailable");assert.equal(C.hasSourceEvidence(failed),true);
 const bottomReport=report([{...reading(),imageUrl:image.replace('_blank.jpg','_back.jpg')}]);
 const bottom=await C.lookupLCSC(part,async op=>op==="lcsc-ocr"?bottomReport:request(op),()=>doc,url);
 assert.equal(bottom.photoEvidence.ocr.status,"unavailable");
 assert.deepEqual(bottom.photoEvidence.images,[image]);
 assert.deepEqual(bottom.photoEvidence.ocr.observations,[]);
 await assert.rejects(()=>C.lookupLCSC(part,async op=>{if(op==="lcsc-ocr")throw new C.LookupError("disabled","off");return request(op);},()=>doc,url),e=>e.code==="disabled");
});

test("photo decoding fetches only bounded raster images for the validated LCSC SKU",async()=>{
 const id=record().identity;
 const bytes=await N.readLCSCImage(image,id,async(u,o)=>{assert.equal(o.credentials,"omit");return new Response("raster",{headers:{"content-type":"image/jpeg"}});});
 assert.equal(bytes.byteLength,6);
 for(const bad of [image.replace("C3231005","C1"),image.replace("assets.lcsc.com","evil.test"),image.replace(".jpg",".svg"),image.replace("_blank.jpg","_back.jpg")]){
  await assert.rejects(()=>N.readLCSCImage(bad,id,()=>assert.fail("must not fetch")),C.LookupError);
 }
});

test("OCR lifecycle serializes concurrent documents, closes them, and skips cancelled queued work",async()=>{
 let created=0,closed=0,active=0,maxActive=0,release;
 const context={OriginLens:C,crypto:require("node:crypto").webcrypto,chrome:{
  runtime:{getURL:p=>"chrome-extension://test/"+p,getContexts:async()=>[],sendMessage:async m=>{
   if(m.type==="origin-lens:ocr-cancel"){release?.({ok:false});return {ok:true};}
   if(m.type==="origin-lens:ocr-run"){active++;maxActive=Math.max(maxActive,active);const r=await new Promise(resolve=>{release=resolve;});active--;return r;}
  }},
  offscreen:{createDocument:async()=>{created++;},closeDocument:async()=>{closed++;}}
 }};
 vm.runInNewContext(script("ocr-bridge.js"),context);
 const a=new AbortController(),b=new AbortController();
 const first=context.OriginLensOCRBridge.run({part,url},a.signal);
 const second=context.OriginLensOCRBridge.run({part,url},b.signal);
 const secondCheck=assert.rejects(second);
 b.abort();await settle();release({ok:true,report:report()});
 assert.equal((await first).status,"detected");await secondCheck;
 assert.equal(created,1);assert.equal(closed,1);assert.equal(maxActive,1);
 const third=context.OriginLensOCRBridge.run({part,url},a.signal);
 const thirdCheck=assert.rejects(third);await settle();a.abort();await thirdCheck;
 assert.equal(closed,2);
});

test("offscreen OCR ignores content scripts and untrusted extension frames",()=>{
 let listener;
 vm.runInNewContext(script("offscreen.js"),{chrome:{runtime:{id:"test",getURL:p=>"chrome-extension://test/"+p,onMessage:{addListener:fn=>{listener=fn;}}}}});
 for(const sender of [{id:"other"},{id:"test",tab:{id:1},url:part.sourceUrl},{id:"test",url:"chrome-extension://test/popup.html"}]){
  assert.equal(listener({type:"origin-lens:ocr-run"},sender,()=>assert.fail("must not reply")),false);
 }
});

test("bundle has pinned local models, licenses, CPU variants, and no remote worker permission",()=>{
 const manifest=JSON.parse(script("manifest.json"));
 assert.match(manifest.content_security_policy.extension_pages,/worker-src 'self'/);
 assert.match(manifest.content_security_policy.extension_pages,/'wasm-unsafe-eval'/);
 assert.doesNotMatch(manifest.content_security_policy.extension_pages,/(?<!wasm-)unsafe-eval/);
 const hashes=JSON.parse(script("vendor/ocr/SHA256.json"));
 for(const [file,hash] of Object.entries(hashes)){
  const bytes=fs.readFileSync(path.join(__dirname,"../vendor/ocr",file));
  assert.equal(require("node:crypto").createHash("sha256").update(bytes).digest("hex"),hash);
 }
 assert.equal(manifest.content_scripts[0].js[0],"ocr.js");
});

test("the production worker routes OCR to the bridge and aborts it when its component type is hidden",async()=>{
 let listener,settingsListener,calls=0,signal;
 const settings={enabled:true};
 vm.runInNewContext(script("background.js"),{
  OriginLens:C,OriginLensNetwork:N,importScripts:()=>{},URL,AbortController,AbortSignal,
  OriginLensOCRBridge:{run:async(message,s)=>{calls++;signal=s;return new Promise((resolve,reject)=>s.addEventListener("abort",()=>reject(s.reason),{once:true}));}},
  chrome:{runtime:{id:"test",onMessage:{addListener:fn=>{listener=fn;}}},storage:{
   onChanged:{addListener:fn=>{settingsListener=fn;}},local:{get:async()=>({...settings})}
  }}
 });
 const message={type:"origin-lens:lookup",operation:"lcsc-ocr",url,part:{...part,componentType:"ics"}};
 const sender={id:"test",frameId:0,tab:{id:1},url:part.sourceUrl};
 const pending=new Promise(resolve=>listener(message,sender,resolve));
 await settle();assert.equal(calls,1);assert.equal(signal.aborted,false);
 settings[C.typeKey("ics")]=false;settingsListener({[C.typeKey("ics")]:{newValue:false}},"local");
 assert.equal(signal.aborted,true);assert.equal((await pending).ok,false);
 const rejected=await new Promise(resolve=>listener(message,sender,resolve));
 assert.equal(rejected.code,"disabled");assert.equal(calls,1);
});
