const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const script=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const key='00000000-0000-0000-0000-000000000001';
function harness(hash=''){
 const nodes=new Map(),context={};vm.runInNewContext(script('credentials.js'),context);
 const validate=context.OriginLensCredentials.validate;
 let saved,updates=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',events:{},attributes:{},addEventListener(event,fn){this.events[event]=fn;},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},scrollIntoView(){this.scrolled=true;},focus(){this.focused=true;}});return nodes.get(id);};
 vm.runInNewContext(script('popup-api.js'),{
  OriginLensCredentials:{get:async()=>saved,set:async value=>{saved=validate(value);},remove:async()=>{saved=undefined;}},
  document:{getElementById:node},location:{hash},crypto:require('node:crypto').webcrypto,
  chrome:{storage:{local:{set:async value=>{assert.deepEqual(Object.keys(value),['mouserApiRevision']);assert.ok(!JSON.stringify(value).includes(key));updates++;}}}}
 });
 return {node,saved:()=>saved,updates:()=>updates,import:async(text,size=100)=>{
  const target={files:[{size,text:async()=>text}],value:'test.json'};
  await node('api-import').events.change({target});assert.equal(target.value,'');
 }};
}
test('settings import accepts only the expected bounded format and never exposes the key',async()=>{
 const h=harness();await h.import('\uFEFF'+JSON.stringify({format:'origin-lens-api-settings-v1',mouserSearchApiKey:key}));
 assert.equal(h.saved(),key);assert.equal(h.node('mouser-key').value,'');assert.equal(h.updates(),1);
 for(const [text,size] of [['{',100],[JSON.stringify({mouserSearchApiKey:key}),100],[JSON.stringify({format:'origin-lens-api-settings-v1',mouserSearchApiKey:key}),4097],[JSON.stringify({format:'origin-lens-api-settings-v1',mouserSearchApiKey:'bad'}),100]]){
  await h.import(text,size);assert.equal(h.saved(),key);assert.equal(h.updates(),1);assert.ok(!h.node('api-feedback').textContent.includes(key));
 }
});
test('saving prevents navigation, validates before storage, clears the field, and removal restores fallback',async()=>{
 const h=harness();let prevented=false;
 h.node('mouser-key').value='invalid';h.node('api-form').events.submit({preventDefault(){prevented=true;}});
 await new Promise(resolve=>setImmediate(resolve));assert.ok(prevented);assert.equal(h.saved(),undefined);assert.equal(h.updates(),0);
 h.node('mouser-key').value=' '+key+' ';h.node('api-form').events.submit({preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(h.saved(),key);assert.equal(h.node('mouser-key').value,'');
 h.node('api-remove').events.click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.saved(),undefined);assert.match(h.node('api-state').textContent,/No key/);assert.equal(h.updates(),2);
});

test('API setup is discoverable and a direct setup link reveals and focuses the extension form',async()=>{
 const h=harness();await new Promise(resolve=>setImmediate(resolve));
 assert.match(h.node('api-overview-state').textContent,/not configured/);
 h.node('api-settings').events.click();
 assert.equal(h.node('source-settings').open,true);assert.equal(h.node('api-settings').attributes['aria-expanded'],'true');
 assert.equal(h.node('api-form').scrolled,true);assert.equal(h.node('mouser-key').focused,true);
 h.node('source-settings').open=false;h.node('source-settings').events.toggle();
 assert.equal(h.node('api-settings').attributes['aria-expanded'],'false');
 await h.import(JSON.stringify({format:'origin-lens-api-settings-v1',mouserSearchApiKey:key}));
 assert.equal(h.node('api-overview-state').textContent,'Mouser: API key saved');
 const linked=harness('#api-form');assert.equal(linked.node('source-settings').open,true);assert.equal(linked.node('mouser-key').focused,true);
});
