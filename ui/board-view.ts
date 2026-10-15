import { enumValue, TileType, SpecialTileType } from '../src/core/data';
import type { RunState, Tile } from '../src/core/state';
import type { PresentationTimeline } from './timeline';
import { boardTop } from './timeline';
import type { Assets } from './assets';
export function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size = 12, color = '#f2e9d7', align: CanvasTextAlign = 'center', maxWidth?: number) {
  ctx.font = `${size}px 'Fusion Pixel', system-ui, sans-serif`; ctx.textAlign = align; ctx.fillStyle = color;
  if (maxWidth) ctx.fillText(value, x, y, maxWidth); else ctx.fillText(value, x, y);
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
    ctx.globalAlpha = t.broken ? .45 : 1;
    assets.tile(ctx, uv.x, uv.y, x, y); ctx.globalAlpha = 1;
    if (t.frozen) { ctx.fillStyle = '#7fd4ff55'; ctx.fillRect(x, y, 53, 53); }
    if (t.selected) { ctx.strokeStyle = '#fff4b8'; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, 49, 49); }
    const marks = [t.arrow && '↗', t.magicSword && '✦', t.mana && '◆', t.burning && 'F'].filter(Boolean).join('');
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
        text(ctx, pv.lethal ? '×' : `-${pv.healthLoss}`, x + 26, y + 32, 18);
      }
      ctx.shadowBlur = 0;
    }
  });
  // Deliberate debug line placeholder: Arrow vertex/RGB unresolved, see U01 §10.
  if (state.chain.nodes.length > 1) {
    ctx.strokeStyle = state.preview.valid ? '#fff4b8' : '#ffffff70'; ctx.lineWidth = 4; ctx.beginPath();
    state.chain.nodes.forEach((slot, i) => {
      const x = 1 + (slot % 6 + .5) * 53, y = top + (Math.floor(slot / 6) + .5) * 53;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }); ctx.stroke();
  }
  ctx.restore();
}
export function drawTokens(ctx: CanvasRenderingContext2D, timeline: PresentationTimeline, assets: Assets) {
  for (const { flight, tileType } of timeline.current?.tokens ?? []) {
    if (flight.done) continue;
    const size = 30 * flight.scale;
    assets.tile(ctx, 0, tileType * 53, flight.position.x - size / 2, flight.position.y - size / 2, size);
  }
}
