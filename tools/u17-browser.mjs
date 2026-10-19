import {homedir} from 'node:os';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??`${homedir()}/.codex/skills/develop-web-game/node_modules/playwright/index.mjs`);
const out=process.env.U17_OUT??'/tmp/U17-browser',url=process.env.U17_URL??'http://127.0.0.1:5319';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],results=[];
const snap=p=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
const advance=p=>p.evaluate(()=>window.advanceTime(2000));
async function ready(p){await p.waitForFunction(()=>!!window.advanceTime);await advance(p);}
async function click(p,id){const s=await snap(p),b=s.buttons.find(b=>b.id===id);assert(b,`missing ${id}`);const v=s.viewport;await p.mouse.click(v.x+(b.x+b.w/2)*v.width/320,v.y+(b.y+b.h/2)*v.height/480);await advance(p);}
async function shot(p,name){const s=await snap(p);await p.screenshot({path:`${out}/${name}.png`,clip:s.viewport});writeFileSync(`${out}/${name}.json`,JSON.stringify(s,null,2));}
try{
 const source=await browser.newPage();await source.goto('http://127.0.0.1:5318');await ready(source);
 const fixtures=await source.evaluate(async root=>{const m=await import(`/@fs${root}/docs/tasks/U17.fixtures.ts`);return {normal:m.hudLayoutFixture(),large:m.hudLayoutFixture(true),sprint:m.hudLayoutFixture(false,0),pretzel:m.hudLayoutFixture(false,1)};},process.cwd());await source.close();writeFileSync(`${out}/fixtures.json`,JSON.stringify(fixtures));
 for(const art of ['original','redrawn'])for(const language of ['zh','en'])for(const mobile of [true,false])for(const clock of [false,true]){
  const c=await browser.newContext({viewport:mobile?{width:393,height:851}:{width:1024,height:768},hasTouch:mobile}),p=await c.newPage(),name=`${art}-${language}-${mobile?'mobile':'desktop'}-${clock?'clock':'plain'}`;
  p.on('pageerror',e=>errors.push(String(e)));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  await p.addInitScript(({fixture,language,clock})=>{if(!localStorage.getItem('u17')){localStorage.setItem('dungeonraid.session.v2',fixture);localStorage.setItem('dungeonraid.language',language);localStorage.setItem('dungeonraid.clock',String(clock));localStorage.setItem('dungeonraid.help.v1',JSON.stringify({bits:0,enabled:false}));localStorage.setItem('u17','1');}},{fixture:fixtures[mobile&&clock?'large':'normal'],language,clock});
  await p.goto(`${url}?art=${art}`);await ready(p);assert.equal((await snap(p)).error,null);await click(p,'continue');await shot(p,name);
  // Capture real draw rectangles to detect a return to oversized score-font enemy labels.
  await p.evaluate(()=>{window.u17Glyphs=[];const c=document.querySelector('canvas').getContext('2d'),draw=c.drawImage.bind(c);c.drawImage=function(...args){if(args.length===9&&args[1]===70&&args[2]===88&&args[3]===8&&args[4]===15)window.u17Glyphs.push(args.slice(5));return draw(...args);};});await advance(p);
  if(art==='original'){const draws=await p.evaluate(()=>window.u17Glyphs);assert(draws.some(d=>Math.abs(d[0]-44.7636)<.01&&Math.abs(d[1]-83.0727)<.01&&d[3]<9),'native attack glyph at expected position and size');}
  const before=await snap(p);await click(p,'stats');assert.notEqual((await snap(p)).screen,'game');await click(p,'close');assert.equal((await snap(p)).screen,'game');assert.equal((await snap(p)).turn,before.turn);
  // Reload/continue must retain enemy values and large HUD numbers.
  await p.reload();await ready(p);await click(p,'continue');const restored=await snap(p);assert.equal(restored.turn,before.turn);assert.equal(restored.score,before.score);assert.deepEqual(restored.board,before.board);
  results.push({name,turn:before.turn,score:before.score,passed:true});await c.close();
 }
 for(const mode of ['sprint','pretzel']){
  const p=await browser.newPage({viewport:{width:393,height:851}});await p.addInitScript(f=>{localStorage.setItem('dungeonraid.session.v2',f);localStorage.setItem('dungeonraid.language','zh');localStorage.setItem('dungeonraid.help.v1',JSON.stringify({bits:0,enabled:false}));},fixtures[mode]);await p.goto(url);await ready(p);await click(p,'continue');await shot(p,mode);await p.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/results.json`,JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));
}finally{await browser.close();}
