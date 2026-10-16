import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??`${homedir()}/.codex/skills/develop-web-game/node_modules/playwright/index.mjs`);
const browser=await chromium.launch({headless:true}),results=[];
try{
 for(const fallback of [false,true]){
  const context=await browser.newContext(),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(String(e)));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  if(fallback)await p.route('**/*.webp',route=>route.fulfill({status:200,contentType:'image/webp',body:''}));
  await p.goto(process.env.U06_PRODUCTION_URL??'http://127.0.0.1:5317');await p.waitForFunction(()=>!!window.advanceTime);
  const st=await p.evaluate(()=>JSON.parse(window.render_game_to_text()));assert.deepEqual(st.atlases,{ui:'loaded',items:'loaded'});
  const resources=await p.evaluate(()=>[...performance.getEntriesByType('navigation'),...performance.getEntriesByType('resource')].map(e=>({name:new URL(e.name).pathname,bodyBytes:e.encodedBodySize,decodedBytes:e.decodedBodySize,transferBytes:e.transferSize})));
  assert.equal(resources.filter(r=>/\/(items|ui)-.*\.png$/.test(r.name)).length,fallback?2:0);
  assert.equal(resources.filter(r=>/\.webp$/.test(r.name)).length,2);assert.deepEqual(errors,[]);
  await p.evaluate(()=>window.advanceTime(1000));
  await p.screenshot({path:`docs/tasks/U06.shots/production-${fallback?'png-fallback':'webp'}.jpg`,type:'jpeg',quality:66});
  results.push({fallback,atlases:st.atlases,bodyBytes:resources.reduce((n,r)=>n+r.bodyBytes,0),transferBytes:resources.reduce((n,r)=>n+r.transferBytes,0),resources,errors});await context.close();
 }
 assert.equal(results[1].bodyBytes-results[0].bodyBytes,1039045+542776-415014-248362);
 writeFileSync('docs/tasks/U06.downloads.json',JSON.stringify(results,null,2));console.log(results.map(({fallback,bodyBytes,transferBytes})=>({fallback,bodyBytes,transferBytes})));
}finally{await browser.close();}
