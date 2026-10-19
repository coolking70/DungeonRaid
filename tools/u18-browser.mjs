import {homedir} from 'node:os';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??`${homedir()}/.codex/skills/develop-web-game/node_modules/playwright/index.mjs`);
const out=process.env.U18_OUT??'/tmp/U18-browser',url=process.env.U18_URL??'http://127.0.0.1:5319';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],results=[];
const snap=p=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
const advance=(p,ms=2000)=>p.evaluate(ms=>window.advanceTime(ms),ms);
async function ready(p){await p.waitForFunction(()=>!!window.advanceTime);await advance(p);}
async function point(p,x,y){const {viewport:v}=await snap(p);return{x:v.x+x*v.width/320,y:v.y+y*v.height/480};}
async function click(p,id,mobile){const s=await snap(p),b=s.buttons.find(b=>b.id===id);assert(b,`missing ${id} on ${s.screen}`);const pt=await point(p,b.x+b.w/2,b.y+b.h/2);if(mobile)await p.touchscreen.tap(pt.x,pt.y);else await p.mouse.click(pt.x,pt.y);await advance(p);}
async function shot(p,name){await advance(p,16);const s=await snap(p);await p.screenshot({path:`${out}/${name}.png`,clip:s.viewport});writeFileSync(`${out}/${name}.json`,JSON.stringify(s,null,2));}
const keys=['statusStrip','chainSummary','trophyProgress'];let outcome;
try{
 const source=await browser.newPage();await source.goto('http://127.0.0.1:5318');await ready(source);
 const fixture=await source.evaluate(async root=>{const m=await import(`/@fs${root}/docs/tasks/U13.fixtures.ts`);return m.trophyFixture('fresh');},process.cwd());await source.close();writeFileSync(`${out}/fixture.json`,fixture);
 for(const language of ['zh','en'])for(const mobile of [true,false])for(let mask=0;mask<8;mask++){
  if(process.env.U18_SMOKE&&!(language==='en'&&mobile&&mask===0))continue;
  const c=await browser.newContext({viewport:mobile?{width:393,height:851}:{width:1024,height:768},hasTouch:mobile}),p=await c.newPage(),name=`${language}-${mobile?'mobile':'desktop'}-${mask}`;
  const expected=Object.fromEntries(keys.map((k,n)=>[k,!!(mask&(1<<n))]));
  p.on('pageerror',e=>errors.push(String(e)));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  await p.addInitScript(({fixture,language})=>{if(!localStorage.getItem('u18')){localStorage.setItem('dungeonraid.session.v2',fixture);localStorage.setItem('dungeonraid.language',language);localStorage.setItem('dungeonraid.help.v1',JSON.stringify({bits:0,enabled:false}));localStorage.setItem('u18','1');}},{fixture,language});
  await p.goto(url);await ready(p);await click(p,'settings',mobile);await click(p,'extra-displays',mobile);
  for(const k of keys){assert.equal((await snap(p)).settings[k],true);if(!expected[k])await click(p,k,mobile);}
  for(const k of keys)assert.equal((await snap(p)).settings[k],expected[k]);
  assert.equal(await p.evaluate(()=>localStorage.getItem('dungeonraid.session.v2')),fixture,'display switches must not modify saves');
  if(mobile&&(mask===0||mask===7))await shot(p,`${name}-options`);
  await p.reload();await ready(p);for(const k of keys)assert.equal((await snap(p)).settings[k],expected[k]);
  await click(p,'profile',mobile);let s=await snap(p);assert.equal(s.buttons.some(b=>b.id==='trophy-progress'),expected.trophyProgress);assert.equal(!!s.trophyProgress,expected.trophyProgress);
  if(mobile&&mask===0)await shot(p,`${name}-statistics`);await click(p,'back',mobile);await click(p,'continue',mobile);
  await p.evaluate(()=>{const c=document.querySelector('canvas').getContext('2d'),fill=c.fillRect.bind(c);window.u18Fills=[];c.fillRect=function(...v){window.u18Fills.push(v);return fill(...v);};});await advance(p,16);
  assert.equal(await p.evaluate(()=>window.u18Fills.some(v=>v.join(',')==='0,61,320,18')),expected.statusStrip);
  await click(p,'stats',mobile);s=await snap(p);assert.equal(s.stats.length,expected.trophyProgress?18:17);assert.equal(s.buttons.some(b=>b.id==='trophy-progress'),expected.trophyProgress);
  if(mobile&&mask===0)await shot(p,`${name}-stats`);await click(p,'close',mobile);
  const pts=await Promise.all([12,13,14].map(n=>point(p,1+(n%6+.5)*53,79+(Math.floor(n/6)+.5)*53)));
  let cdp;if(mobile){cdp=await c.newCDPSession(p);for(const [n,pt] of pts.entries())await cdp.send('Input.dispatchTouchEvent',{type:n?'touchMove':'touchStart',touchPoints:[{...pt,id:1}]});}
  else{await p.mouse.move(pts[0].x,pts[0].y);await p.mouse.down();for(const pt of pts.slice(1))await p.mouse.move(pt.x,pt.y);}
  await p.evaluate(()=>{window.u18Fills=[];});await advance(p,16);s=await snap(p);assert.equal(!!s.bottomHint,expected.chainSummary);assert.equal(await p.evaluate(()=>window.u18Fills.some(v=>v.join(',')==='4,370,312,27')),expected.chainSummary);
  if(mobile&&(mask===0||mask===7))await shot(p,`${name}-chain`);
  if(mobile)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await p.mouse.up();await advance(p,18000);
  s=await snap(p);assert.equal(s.turn,1);const state=await p.evaluate(()=>JSON.stringify(window.__dr.state));if(outcome)assert.equal(state,outcome,'all display combinations must give identical rule outcomes');else outcome=state;
  assert(JSON.parse(state).board.some(t=>t.type===6&&t.specialType===1),'fresh first special kill must still generate the trophy');
  if(mobile&&mask===0){await shot(p,`${name}-trophy`);await click(p,'menu',mobile);await click(p,'clock',mobile);await click(p,'resume',mobile);await p.evaluate(()=>{window.u18Fills=[];});await advance(p,16);assert(await p.evaluate(()=>window.u18Fills.some(v=>v.join(',')==='242,61,72,18')));await shot(p,`${name}-clock`);await click(p,'menu',mobile);await click(p,'main',mobile);await click(p,'settings',mobile);await click(p,'extra-displays',mobile);for(const k of keys)await click(p,k,mobile);await click(p,'back',mobile);await click(p,'back',mobile);await click(p,'profile',mobile);assert((await snap(p)).buttons.some(b=>b.id==='trophy-progress'));await click(p,'back',mobile);await click(p,'continue',mobile);await click(p,'stats',mobile);assert.equal((await snap(p)).stats.length,18);await click(p,'close',mobile);assert.equal(await p.evaluate(()=>JSON.stringify(window.__dr.state)),state);}
  results.push({name,expected,turn:s.turn,identicalRuleOutcome:true});await c.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/results.json`,JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));
}finally{await browser.close();}
