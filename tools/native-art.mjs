import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

/** Original pixels, never the A01–A03 repacked coordinates. Build works without reverse/. */
export function nativeArt() {
  const layout = json('data/ui-layout.json'), old = json('art/ui/manifest.json');
  const assets = new Map();
  const add = (id, texture, rect, extra = {}) => assets.set(id, {id, texture, rect, ...extra});
  const copy = (id, source, extra = {}) => assets.set(id, {...assets.get(source), id, ...extra});
  // CharacterClass::GetIconCoords @35c00; Skill::Initialise @606a4. U01 stores menus UVs ×2.
  for (const a of layout.artSlots) {
    const k = a.atlas === 'menus' ? 2 : 1;
    add(a.id, a.atlas, [a.uv.x, a.uv.y, a.uv.w, a.uv.h].map(v => v/k));
  }
  // U01's measured native rectangles; original HUD and main background quads.
  for (const id of ['main.background','hud.top','hud.bottom','hud.health','hud.xp','hud.upgrade','hud.gold-full']) {
    const e = layout.elements.find(e => e.id === id);
    add(id, e.atlas, [e.uv.x,e.uv.y,e.uv.w,e.uv.h]);
  }
  // NameScreen::MakeButton @56c04 / MakePanel @56dc4: 5px nine-slice, original colour modulation.
  add('ui.panel','menus',[50,1,53,53],{nineSlice:true,sliceMargins:[5,5,5,5],tint:[95,95,150]});
  add('ui.button','menus',[194,1,53,53],{nineSlice:true,sliceMargins:[5,5,5,5],tint:[150,150,255]});
  copy('ui.tab','ui.button');
  // Interface::Interface @4a414; FoldoutMenu::FoldoutMenu @410e0.
  add('ui.slot','tiles',[201,382,53,53],{nineSlice:true,sliceMargins:[3,3,3,3]});
  add('foldout.option.base','tiles',[1,382,53,53],{nineSlice:true,sliceMargins:[3,3,3,3]});
  for (const id of ['ui.button','ui.tab','ui.slot','foldout.option.base']) {
    copy(`${id}.pressed`,id,{tint:[200,200,255]});
    copy(`${id}.disabled`,id,{tint:[100,100,130]});
  }
  copy('ui.slot.ready','ui.slot');copy('ui.slot.charging','ui.slot',{tint:[150,150,150]});
  copy('ui.slot.selected','ui.slot',{tint:[150,150,255]});
  add('ui.selection','tiles',[450,185,61,61]); // Interface active highlight UV 3ee10000/3e390000 → 3eff8000/3e760000
  add('ui.lock','menus',[248,1,53,53]);
  add('ui.check','tiles',[144,288,52,36]);
  add('ui.arrow.next','menus',[302,1,27,29]);copy('ui.arrow.back','ui.arrow.next',{flipX:true});
  // Port controls reuse native blank components instead of baked English labels (Chinese remains localizable).
  for (const id of ['ui.menu','ui.stats','ui.sound.on','ui.sound.off']) copy(id,'ui.button');
  copy('ui.resource','ui.slot');
  add('hud.resource.slot','tiles',[110,495,100,10]);
  copy('hud.health.bottle','hud.health');
  // Empty flask already in bottom HUD; use the matching crop before the clipped full flask, never over it.
  add('hud.health.frame','tiles',[239,438,71,64]);
  add('hud.gold.column','tiles',[397,428,16,61]);copy('hud.gold.fill','hud.gold.column');
  copy('hud.armour.icon','StatIcon.5');
  // Flame/freeze overlays: Tile::SetFlameVisibility @62de8 / SetFreezeVisibility @62e94.
  add('hud.status.burning','tiles',[425,572,36,46]);
  add('hud.status.frozen','tiles',[329,399,50,47]);
  // Port's poison badge reuses the native acid potion skull (no native standalone player-poison badge).
  add('hud.status.poison','tiles',[18,590,18,22]);
  add('ui.death-cross','tiles',[161,331,47,50]); // Tile::Tile @63f44
  add('ui.flare','tiles',[209,321,59,60]); // Game::AddFlare @29894, type 1
  add('ui.particle','tiles',[478,437,23,23]); // Game::AddFlare type 0; reused by port particle quads
  add('ui.shield.left','tiles',[488,461,11,20]); // Game::Start @260ac
  add('ui.shield.right','tiles',[500,461,11,20]);
  // Additional port navigation pieces, sampled from original menu primitives.
  add('ui.scroll.track','menus',[5,1,13,67],{nineSlice:true,sliceMargins:[3,3,3,3]});
  add('ui.scroll.thumb','menus',[23,1,26,26],{nineSlice:true,sliceMargins:[3,3,3,3]});
  copy('tooltip.pointer','ui.arrow.next');
  for (const a of old.assets) {
    if (!assets.has(a.id)) throw new Error(`Native art mapping missing: ${a.id}`);
    assets.get(a.id).states = a.states;
  }
  const ui = {scale:1,assets:[...assets.values()],elements:old.elements.map(e=>({id:e.id,asset:e.asset}))};
  // Upgrade::GetIconUVs @67440: 20×20 cells, (1 + col*50.03, 1 + row*50.03), span49.
  const items = {scale:1,slots:Array.from({length:400},(_,id)=>({id:String(id),rect:[1+id%20*50.03,1+Math.floor(id/20)*50.03,49,49]}))};
  const fonts = Object.fromEntries(['font','font_menu','font_score'].map(name=>{
    const lines=readFileSync(new URL(`art/native/${name}.fnt`,root),'utf8').split(/\r?\n/);
    const numbers=line=>Object.fromEntries([...line.matchAll(/(\w+)=(-?\d+)/g)].map(m=>[m[1],Number(m[2])]));
    return [name,{...numbers(lines.find(l=>l.startsWith('common '))),chars:Object.fromEntries(lines.filter(l=>l.startsWith('char ')).map(l=>{const c=numbers(l);return [c.id,c];}))}];
  }));
  return {nativeUi:ui,nativeItems:items,nativeFonts:fonts};
}
