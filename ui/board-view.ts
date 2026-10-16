import { getAttack } from '../src/core/combat';
import { drawArrow } from './arrow';
import { canMatchType } from '../src/core/chain';
import { enumValue, TileType, SpecialTileType } from '../src/core/data';
import type { RunState, Tile } from '../src/core/state';
import type { PresentationTimeline } from './timeline';
import { boardTop } from './timeline';
import type { Assets } from './assets';
export function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size = 12, color = '#f2e9d7', align: CanvasTextAlign = 'center', maxWidth?: number) {
  ctx.font = `${Math.max(12,Math.round(size/12)*12)}px 'Fusion Pixel', system-ui, sans-serif`; ctx.textAlign = align; ctx.fillStyle = color;
  if(maxWidth && ctx.measureText(value).width>maxWidth){while(value.length && ctx.measureText(value+'…').width>maxWidth)value=value.slice(0,-1);value+='…';}
  ctx.fillText(value,Math.round(x),Math.round(y));
}
const LICH = enumValue('EnemyType', 'ENEMY_LICH');
export function tileUV(t: Tile) {
  if (t.specialType === SpecialTileType.SPECIAL_TILE_TROPHY) return { x: 618, y: 459 };
  if (t.specialType === SpecialTileType.SPECIAL_TILE_CHAIN) return { x: 512, y: 459 };
  if (t.type === TileType.TILE_SKULL && t.enemyType === LICH && t.countdown) return { x: 671, y: 459 };
  if (t.type === TileType.TILE_SKULL && t.enemyType > 0) return { x: ((t.enemyType - 1) % 8) * 53, y: 672 + ((t.enemyType - 1) >> 3) * 53 };
  return { x: t.appearance * 53, y: t.type * 53 };
}
/** Snapshot for the currently presented event, including non-falling damage/status changes. */
export function boardState(timeline: PresentationTimeline): RunState { return timeline.current?.after ?? timeline.display; }
export function enemyView(s: RunState, slot: number) {
  const t = s.board[slot]!;
  return { attack: getAttack(s,t), defence: t.defence, health: t.health, maxHealth: t.maxHealth,
    countdown: t.countdown, poison: [...t.poison], phylactery: t.enemyType === LICH && t.countdown > 0 };
}
// Native numeric glyphs use scale .08 / .13; avoid the general text() pixel-font 12px quantizer.
function numberText(ctx: CanvasRenderingContext2D, value: number | string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'right') {
  ctx.font = `bold ${size}px system-ui, sans-serif`; ctx.textAlign = align;
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#171322'; ctx.strokeText(String(value), x, y);
  ctx.fillStyle = color; ctx.fillText(String(value), x, y);
}
export function drawBoard(ctx: CanvasRenderingContext2D, _state: RunState, timeline: PresentationTimeline, assets: Assets) {
  const frame = timeline.current;
  const s = boardState(timeline);
  const top = boardTop(s);
  ctx.save(); ctx.beginPath(); ctx.rect(1, top, 318, 318); ctx.clip();
  s.board.forEach((t, slot) => {
    const fall = frame?.falls.get(slot);
    if (t.type === TileType.TILE_NONE || (t.matched && !fall)) return;
    const x = 1 + t.x * 53, y = fall?.y ?? top + t.y * 53, uv = tileUV(t);
    const dim = s.chain.nodes.length && !canMatchType(s,slot,s.chain.nodes) && !t.selected ? 150/255 : 1;
    ctx.globalAlpha = (t.broken ? .45 : 1)*dim;
    const shift = t.type === TileType.TILE_SKULL && !(t.enemyType === LICH && t.countdown) ? (t.attack < 10 && t.defence < 10 && t.health < 200 ? -3.2 : -6.4) : 0;
    assets.tile(ctx, uv.x, uv.y, x + shift, y);
    if (t.frozen) { ctx.fillStyle = '#7fd4ff55'; ctx.fillRect(x, y, 53, 53); }
    if (t.selected) assets.ui.paint(ctx,'ui.selection',x,y,53,53);
    const marks = [t.arrow && '>', t.magicSword && '+', t.mana && '*'].filter(Boolean).join('');
    if(t.frozen) assets.ui.paint(ctx,'hud.status.frozen',x+34,y+17,18,18);
    if(t.burning) assets.ui.paint(ctx,'hud.status.burning',x+34,y+17,18,18);
    if (marks) text(ctx, marks, x + 48, y + 13, 10, '#fff', 'right');
    if (t.burning && t.fireDamage) text(ctx, `F${t.fireDamage}`, x + 3, y + 48, 10, '#ffb347', 'left');
    if (t.type === TileType.TILE_SKULL) {
      ctx.shadowColor = '#000'; ctx.shadowBlur = 3;
      const v = enemyView(s,slot);
      if (!v.phylactery) {
        numberText(ctx,v.attack,x+50.6,y+12.8,13,'#ffffff');
        numberText(ctx,v.defence,x+50.6,y+25.6,13,'#adb1ff');
        numberText(ctx,v.health,x+50.6,y+48.1,13,'#ff463c');
        if (v.countdown > 0) numberText(ctx,v.countdown,x+26.5+(t.attack<10&&t.defence<10&&t.health<200?-3.2:-6.4)-(t.enemyType===28?3:0),y+21.3,19,[3,19].includes(t.enemyType)?'#000000':[10,28].includes(t.enemyType)?'#ffff00':'#ffffff','center');
        if(v.poison.some(p=>p>0)) numberText(ctx,`P${v.poison[0]}`,x+3,y+48,11,'#9de277','left');
      }
      const pv = s.preview.enemies.find(e => e.slot === slot);
      if (pv && s.chain.nodes.length) {
        ctx.fillStyle = pv.lethal ? '#ff2a2a66' : '#ffaa0033'; ctx.fillRect(x, y, 53, 53);
        if(pv.lethal) assets.ui.paint(ctx,'ui.death-cross',x+14,y+14,24,24);
        else text(ctx,`-${pv.healthLoss}`,x+26,y+32,12);
      }
      ctx.shadowBlur = 0;
    }
  });
  ctx.globalAlpha = 1;
  drawArrow(ctx,s.chain.nodes.map(slot=>({x:1+(slot%6+.5)*53,y:top+(Math.floor(slot/6)+.5)*53})),s.current.rune);
  ctx.restore();
}
export function drawTokens(ctx: CanvasRenderingContext2D, timeline: PresentationTimeline, assets: Assets) {
  for (const { flight, tileType, xp, appearance } of timeline.tokens) {
    if (flight.done) continue;
    const w = (xp ? 39 : 53)*flight.scale, h = (xp ? 23 : 53)*flight.scale;
    ctx.save();ctx.translate(flight.position.x-w/2,flight.position.y-h/2);ctx.scale(w/53,h/53);
    assets.tile(ctx,appearance*53,tileType*53,0,0,53);ctx.restore();
  }
}
