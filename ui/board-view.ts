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
export function drawBoard(ctx: CanvasRenderingContext2D, state: RunState, timeline: PresentationTimeline, assets: Assets) {
  const frame = timeline.current;
  const s = frame?.falls.size ? frame.after : state;
  const top = boardTop(s);
  ctx.save(); ctx.beginPath(); ctx.rect(1, top, 318, 318); ctx.clip();
  s.board.forEach((t, slot) => {
    const fall = frame?.falls.get(slot);
    if (t.type === TileType.TILE_NONE || (t.matched && !fall)) return;
    const x = 1 + t.x * 53, y = fall?.y ?? top + t.y * 53, uv = tileUV(t);
    const dim = state.chain.nodes.length && !canMatchType(state,slot,state.chain.nodes) && !t.selected ? 150/255 : 1;
    ctx.globalAlpha = (t.broken ? .45 : 1)*dim;
    assets.tile(ctx, uv.x, uv.y, x, y);
    if (t.frozen) { ctx.fillStyle = '#7fd4ff55'; ctx.fillRect(x, y, 53, 53); }
    if (t.selected) assets.ui.paint(ctx,'ui.selection',x,y,53,53);
    const marks = [t.arrow && '>', t.magicSword && '+', t.mana && '*'].filter(Boolean).join('');
    if(t.frozen) assets.ui.paint(ctx,'hud.status.frozen',x+34,y+17,18,18);
    if(t.burning) assets.ui.paint(ctx,'hud.status.burning',x+34,y+17,18,18);
    if (marks) text(ctx, marks, x + 48, y + 13, 10, '#fff', 'right');
    if (t.burning && t.fireDamage) text(ctx, `F${t.fireDamage}`, x + 3, y + 48, 10, '#ffb347', 'left');
    if (t.type === TileType.TILE_SKULL) {
      ctx.shadowColor = '#000'; ctx.shadowBlur = 3;
      if (t.enemyType === LICH && t.countdown) text(ctx, `↻ ${t.countdown}`, x + 26, y + 47, 11, '#ffd34d');
      else {
        text(ctx, `${t.attack}`, x + 3, y + 13, 12, '#ffb5af', 'left');
        if (t.defence) text(ctx, `${t.defence}`, x + 49, y + 13, 12, '#c2d8ff', 'right');
        text(ctx, `${t.health}`, x + 26, y + 47, 14);
        if (t.countdown) text(ctx, `◷${t.countdown}`, x + 4, y + 37, 10, '#ffd34d', 'left');
        if (t.statsStatus === 'special-pending') text(ctx, '?', x + 47, y + 47, 12, '#ffd34d');
      }
      const pv = state.preview.enemies.find(e => e.slot === slot);
      if (pv && state.chain.nodes.length) {
        ctx.fillStyle = pv.lethal ? '#ff2a2a66' : '#ffaa0033'; ctx.fillRect(x, y, 53, 53);
        if(pv.lethal) assets.ui.paint(ctx,'ui.death-cross',x+14,y+14,24,24);
        else text(ctx,`-${pv.healthLoss}`,x+26,y+32,12);
      }
      ctx.shadowBlur = 0;
    }
  });
  ctx.globalAlpha = 1;
  drawArrow(ctx,state.chain.nodes.map(slot=>({x:1+(slot%6+.5)*53,y:top+(Math.floor(slot/6)+.5)*53})),state.current.rune);
  ctx.restore();
}
export function drawTokens(ctx: CanvasRenderingContext2D, timeline: PresentationTimeline, assets: Assets) {
  for (const { flight, tileType, xp, appearance } of timeline.current?.tokens ?? []) {
    if (flight.done) continue;
    const w = (xp ? 39 : 53)*flight.scale, h = (xp ? 23 : 53)*flight.scale;
    ctx.save();ctx.translate(flight.position.x-w/2,flight.position.y-h/2);ctx.scale(w/53,h/53);
    assets.tile(ctx,appearance*53,tileType*53,0,0,53);ctx.restore();
  }
}
