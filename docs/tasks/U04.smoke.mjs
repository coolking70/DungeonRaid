import { chromium } from '/Users/coolking70/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});const errors=[];
async function open(options={}){const c=await browser.newContext({viewport:{width:1280,height:720},...options});const p=await c.newPage();p.on('pageerror',e=>errors.push(String(e)));await p.addInitScript(()=>{Date.now=()=>12345;});await p.goto('http://127.0.0.1:5316');await p.waitForFunction(()=>window.render_game_to_text);await advance(p,1000);return p;}
const state=p=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
const advance=(p,ms)=>p.evaluate(ms=>window.advanceTime(ms),ms);
async function xy(p,x,y){const s=await state(p);return{x:s.viewport.x+x*s.viewport.width/320,y:s.viewport.y+y*s.viewport.height/480};}
async function click(p,id,touch=false){const s=await state(p),b=s.buttons.find(b=>b.id===id);assert(b?.enabled);const q=await xy(p,b.x+b.w/2,b.y+b.h/2);if(touch)await p.touchscreen.tap(q.x,q.y);else await p.mouse.click(q.x,q.y);await advance(p,1000);}
async function shot(p,name){await p.screenshot({path:`docs/tasks/U04.shots/${name}.png`});await writeFile(`docs/tasks/U04.shots/${name}.json`,JSON.stringify(await state(p),null,2));}
try{
 const p=await open();await click(p,'new');
 const nodes=await p.evaluate(async()=>{const {canMatchType,adjacent}=await import('/@fs/Users/coolking70/Documents/同步空间/DungeonRaid/src/core/chain.ts');const s=window.__dr.state;function visit(ns){if(ns.length>=3)return ns;for(let i=0;i<36;i++)if(!ns.includes(i)&&adjacent(s.board[ns.at(-1)],s.board[i])&&canMatchType(s,i,ns)){const r=visit([...ns,i]);if(r)return r;}return null;}for(let i=0;i<36;i++)if(s.board[i].type===2){const r=visit([i]);if(r)return r;}});assert(nodes);
 for(let n=0;n<nodes.length;n++){const slot=nodes[n],q=await xy(p,27.5+slot%6*53,105.5+Math.floor(slot/6)*53);await p.mouse.move(q.x,q.y);if(n===0)await p.mouse.down();}await shot(p,'preview-zh-desktop');
 await p.setViewportSize({width:375,height:812});await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await advance(p,0);await shot(p,'preview-zh-mobile');await p.mouse.up();
 for(let n=0;n<150;n++){await advance(p,16.67);if((await state(p)).tokens)break;}
 assert((await state(p)).tokens>0);await shot(p,'token-zh-mobile');await p.setViewportSize({width:1280,height:720});await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await advance(p,0);await shot(p,'token-zh-desktop');
 const m=await open({viewport:{width:375,height:812},deviceScaleFactor:3,isMobile:true,hasTouch:true});await click(m,'new',true);assert.equal((await state(m)).screen,'game');await click(m,'menu',true);assert.equal((await state(m)).screen,'game-menu');await click(m,'help',true);assert.equal((await state(m)).screen,'help');await click(m,'close',true);await click(m,'resume',true);await click(m,'stats',true);assert.equal((await state(m)).screen,'stats');await shot(m,'touch-stats-mobile');
 assert.deepEqual(errors,[]);await writeFile('docs/tasks/U04.shots/smoke.json',JSON.stringify({tokenDimensions:'53x53; xp39x23 before scale',mobile:'375x812 DPR3 real touchscreen taps',errors},null,2));
}finally{await browser.close();}
