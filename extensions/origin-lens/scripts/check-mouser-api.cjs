// Live, read-only acceptance test. Supply MOUSER_SEARCH_API_KEY via the secret launcher.
// No credential-bearing request URLs or raw provider errors are logged.
const fs=require('node:fs');
const N=require('../network.js');
const C=require('../core.js');
const examples=[
  {manufacturer:'STMicroelectronics',mpn:'STM32G491RET6',sku:'497-STM32G491RET6-ND',sourceUrl:'https://www.digikey.com/en/products/detail/stmicroelectronics/STM32G491RET6/13592591'},
  {manufacturer:'Nexperia USA Inc.',mpn:'PSMN040-100MSEX',sku:'1727-1086-2-ND',sourceUrl:'https://www.digikey.com/en/products/detail/nexperia-usa-inc/PSMN040-100MSEX/4004849'}
];
(async()=>{
  if(!process.env.MOUSER_SEARCH_API_KEY)throw new Error('Mouser Search API credential is not configured.');
  const results=[];
  for(const example of examples){
    const part={provider:'digikey',host:'www.digikey.com',...example};
    results.push(await N.run({operation:'mouser-api',part},'',fetch,{mouserApiKey:process.env.MOUSER_SEARCH_API_KEY.trim()}));
  }
  if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({checkedAt:new Date().toISOString(),results},null,2)+'\n');
  console.log(JSON.stringify(results.map(r=>({mpn:r.identity.mpn,source:r.sourceKind,origin:r.fields.declaredCoo.values,assembly:r.fields.assembly.values,diffusion:r.fields.diffusion.values})),null,2));
})().catch(error=>{console.error(error instanceof C.LookupError?error.message:'Live API check failed; private details suppressed.');process.exitCode=1;});
