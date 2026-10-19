import {homedir} from 'node:os';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??`${homedir()}/.codex/skills/develop-web-game/node_modules/playwright/index.mjs`);
const url=process.env.U15_URL??'http://127.0.0.1:5319',out=process.env.U15_OUT??'/tmp/U15-browser';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],results=[];
const snap=p=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
const advance=(p,ms=2000)=>p.evaluate(ms=>window.advanceTime(ms),ms);
async function click(p,id,touch){const s=await snap(p),b=s.buttons.find(b=>b.id===id);assert(b?.enabled,`${s.screen}: ${id}`);const x=s.viewport.x+(b.x+b.w/2)*s.viewport.width/320,y=s.viewport.y+(b.y+b.h/2)*s.viewport.height/480;if(touch)await p.touchscreen.tap(x,y);else await p.mouse.click(x,y);await advance(p);}
async function shot(p,name){const s=await snap(p);await p.screenshot({path:`${out}/${name}.png`,clip:s.viewport});writeFileSync(`${out}/${name}.json`,JSON.stringify(s,null,2));}
try{
 const source=await browser.newPage();await source.goto('http://127.0.0.1:5318');await source.waitForFunction(()=>!!window.advanceTime);
 const fixture=await source.evaluate(async root=>(await import(`/@fs${root}/docs/tasks/U14.fixtures.ts`)).tileArtFixture('skills'),process.cwd());
 // Draw every semantic asset through the real multi-texture renderer; placeholders and empty crops fail.
 const gallery=await source.evaluate(async()=>{
  const {Assets}=await import('/assets.ts'),{I18n}=await import('/i18n.ts'),a=new Assets();await a.load(new I18n(localStorage));
  const c=document.createElement('canvas');c.width=1000;c.height=1450;const ctx=c.getContext('2d'),empty=[];
  const ids=[...a.ui.regions.keys()],slots=[...a.items.regions.keys()];
  let n=0;for(const [atlas,keys] of [[a.ui,ids],[a.items,slots]])for(const id of keys){
   const x=n%20*50,y=Math.floor(n/20)*50;ctx.clearRect(x,y,50,50);
   const ok=atlas===a.ui?atlas.paint(ctx,id,x,y,49,49):atlas.draw(ctx,id,x,y,49,49);
   const pixels=ctx.getImageData(x,y,49,49).data;let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)visible++;
   if(!ok||visible<3)empty.push(id);n++;
  }
  return {png:c.toDataURL(),empty,ui:ids.length,items:slots.length,textures:[...a.ui.images.keys()]};
 });
 assert.deepEqual(gallery.empty,[]);assert.equal(gallery.ui,140);assert.equal(gallery.items,400);assert.deepEqual(gallery.textures.sort(),['menus','tiles']);
 writeFileSync(`${out}/native-gallery.png`,Buffer.from(gallery.png.split(',')[1],'base64'));await source.close();
 for(const [device,viewport] of [['desktop',{width:1024,height:768}],['mobile',{width:375,height:812}]])for(const language of ['zh','en']){
  const touch=device==='mobile',c=await browser.newContext({viewport,hasTouch:touch}),p=await c.newPage(),requests=[];
  p.on('pageerror',e=>errors.push(String(e)));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});p.on('request',r=>{if(r.resourceType()==='image')requests.push(r.url());});
  await p.addInitScript(language=>{localStorage.setItem('dungeonraid.language',language);localStorage.setItem('dungeonraid.help.v1',JSON.stringify({bits:0,enabled:false}));},language);
  await p.goto(url);await p.waitForFunction(()=>!!window.advanceTime);await advance(p);
  assert.equal((await snap(p)).artTheme,'original');assert.deepEqual((await snap(p)).atlases,{ui:'loaded',items:'loaded'});
  assert(!requests.some(u=>/\/(ui|items)([-.]|\/).*\.(png|webp)(\?|$)/.test(u)),`redrawn texture requested: ${requests}`);
  await shot(p,`${device}-${language}-home`);await click(p,'settings',touch);await shot(p,`${device}-${language}-settings`);await click(p,'back',touch);
  await click(p,'new',touch);await shot(p,`${device}-${language}-new`);await click(p,'class',touch);
  for(let tab=0;tab<4;tab++){await click(p,`tab-${tab}`,touch);await shot(p,`${device}-${language}-tab-${tab}`);}
  await p.addInitScript(f=>localStorage.setItem('dungeonraid.session.v2',f),fixture);await p.reload();await p.waitForFunction(()=>!!window.advanceTime);await advance(p);await click(p,'continue',touch);
  const colors=await p.evaluate(()=>{
   const {viewport:v}=JSON.parse(window.render_game_to_text()),c=document.querySelector('canvas'),k=c.width/window.innerWidth,ctx=c.getContext('2d');
   return [0,1,2,3].map(slot=>{const d=ctx.getImageData((v.x+(18+59*slot)*v.width/320)*k,(v.y+16*v.height/480)*k,25*v.width/320*k,20*v.height/480*k).data,s=new Set();for(let i=0;i<d.length;i+=4)s.add(`${d[i]>>3},${d[i+1]>>3},${d[i+2]>>3}`);return s.size;});
  });
  assert(colors.every(n=>n>12),`skill icons hidden by opaque slot: ${colors}`);await shot(p,`${device}-${language}-game`);
  await click(p,'menu',touch);await shot(p,`${device}-${language}-pause`);await click(p,'resume',touch);await click(p,'stats',touch);await shot(p,`${device}-${language}-stats`);
  results.push({device,language,defaultTheme:'original',skillIconColors:colors,redrawnRequests:0});await c.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/results.json`,JSON.stringify({gallery:{ui:gallery.ui,items:gallery.items,empty:gallery.empty},results,errors},null,2));console.log(JSON.stringify({results,errors}));
}finally{await browser.close();}
