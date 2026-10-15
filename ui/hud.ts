import { TileType, GameMode, enumValue } from '../src/core/data';
import type { RunState } from '../src/core/state';
import type { Assets } from './assets';
import type { I18n } from './i18n';
import { text } from './board-view';
/** ProcessResourceShadows @0x253c4: only guaranteed counts, no bonus RNG. */
export function resourcePreview(s: RunState) {
  const r=s.preview.resources, sprint=s.challenge && s.mode===GameMode.MODE_SPRINT ? 2 : 1;
  const repair=(s.base.repair+s.equipmentStats.repair)*(s.current.shieldBoost?2:1);
  const shields=r[TileType.TILE_SHIELD] ?? 0;
  const up=Math.max(0,shields-Math.ceil((s.equipmentStats.maxArmour-s.armour)/Math.max(1,repair)));
  return { health: Math.min(s.base.maxHealth+s.equipmentStats.maxHealth,s.health+(r[TileType.TILE_POTION]??0)*(s.base.healing+s.equipmentStats.healing)*(s.current.potionBoost?2:1)),
    xp: s.resources.xp.remainder+Math.trunc((r[TileType.TILE_SKULL]??0)*sprint*(2+s.resources.xp.bonus)),
    gold: s.resources.gold.remainder+Math.trunc((r[TileType.TILE_COIN]??0)*sprint*(2+s.resources.gold.bonus)*(s.current.coinBoost?2:1)),
    upgrade: s.resources.upgrade.remainder+Math.trunc(up*sprint*(2+s.resources.upgrade.bonus)*(s.current.shieldBoost?2:1)) };
}
function gold(ctx: CanvasRenderingContext2D, a: Assets, count: number) {
  const n=Math.min(100,Math.max(0,count)), full=Math.floor(n/20), rem=n%20;
  for(let col=0;col<full;col++) a.ui.paint(ctx,'hud.gold.column',5+16*col,415,16,61);
  if(rem) { ctx.save();ctx.beginPath();ctx.rect(5+16*full,476-rem*3,16,rem*3);ctx.clip();a.ui.paint(ctx,'hud.gold.column',5+16*full,415,16,61);ctx.restore(); }
}
export function drawHud(ctx: CanvasRenderingContext2D,s: RunState,a: Assets,i: I18n,pulse: number) {
  a.ui.paint(ctx,'hud.bottom',0,404,320,76);
  const max=Math.max(1,s.base.maxHealth+s.equipmentStats.maxHealth), preview=s.chain.nodes.length ? resourcePreview(s):null;
  for(const [key,y] of [['upgrade',445],['xp',463]] as const) {
    a.ui.paint(ctx,'hud.resource.slot',110,y,100,10);
    if(preview) {ctx.save();ctx.globalAlpha=key==='xp'?80/255:120/255;a.ui.fill(ctx,`hud.${key}`,110,y,100,10,preview[key]/100);ctx.restore();}
    a.ui.fill(ctx,`hud.${key}`,110,y,100,10,s.resources[key].remainder/100);
    text(ctx,String(s.resources[key].remainder),160,y+9,12,'#fff');
  }
  if(preview) {ctx.save();ctx.globalAlpha=80/255;gold(ctx,a,preview.gold);ctx.restore();}
  gold(ctx,a,s.resources.gold.remainder);text(ctx,String(s.resources.gold.remainder),48,465,12,'#ffe7a1');
  if(preview) {ctx.save();ctx.globalAlpha=120/255;a.ui.fill(ctx,'hud.health',239,406,71,64,preview.health/max,true);ctx.restore();}
  a.ui.fill(ctx,'hud.health',239,406,71,64,s.health/max,true);a.ui.paint(ctx,'hud.health.frame',239,406,71,64);
  if(pulse) {ctx.save();ctx.globalAlpha=pulse*.45;ctx.fillStyle='#ff3420';ctx.fillRect(240,410,70,60);ctx.restore();}
  text(ctx,`${s.health}/${max}`,273,463,12);
  a.ui.paint(ctx,'hud.armour.icon',147,402,24,24);text(ctx,`${s.armour}/${s.equipmentStats.maxArmour}`,159,437,12,'#adb1ff');
  // UpdateSwordValue @0x4893c centre=.640625*320, baseline1.365625*320.
  a.items.draw(ctx,String(s.equipment[0].icon),191,400,27,27,'');text(ctx,`+${s.equipmentStats.weaponDamage}`,205,437,12);
  text(ctx,`${s.base.damage+s.equipmentStats.damage}`,225,411,12,'#ffccaa');
  if(s.playerPoison>0) {a.ui.paint(ctx,'hud.status.poison',287,421,20,20);text(ctx,String(s.playerPoison),297,438,12);}
  if(s.board.some(t=>t.burning)) a.ui.paint(ctx,'hud.status.burning',217,444,18,18);
  if(s.board.some(t=>t.frozen && t.type===TileType.TILE_SKULL)) a.ui.paint(ctx,'hud.status.frozen',217,461,18,18);
}
