import { Difficulty, enumValue, GameMode, TileType, type RandType } from '../src/core/data';
import { step, type Action, type GameEvent } from '../src/core/engine';
import { createRunState, emptyTile, type PendingEffect, type RunState, type Tile } from '../src/core/state';
import type { RandomSource } from '../src/core/rng';
import type { RuleContext } from '../src/core/combat';

export function fixture(): RunState {
  const s = step(createRunState(), { type: 'NewGame', seed: 12345, classId: 0, difficulty: Difficulty.DIFF_NORMAL, mode: GameMode.MODE_CLASSIC }).state;
  s.board = s.board.map(t => ({ ...emptyTile(t.x, t.y), type: TileType.TILE_COIN }));
  s.character.perks.fill(enumValue('PerkType', 'PERK_NONE'));
  s.character.flaws.fill(enumValue('FlawType', 'FLAW_NONE'));
  return s;
}
export function tile(s: RunState, slot: number, type: number, extra: Partial<Tile> = {}): Tile {
  const old = s.board[slot]!;
  Object.assign(old, emptyTile(old.x, old.y), { type }, type === TileType.TILE_SKULL ? { attack: 1, health: 20, maxHealth: 20, statsStatus: 'ordinary' } : {}, extra);
  return old;
}
export function select(s: RunState, slots: number[]): RunState {
  for (const slot of slots) s = step(s, { type: 'SelectTile', at: { x: slot % 6, y: Math.floor(slot / 6) } }).state;
  return s;
}
export class QueueRng implements RandomSource {
  calls: { a: number; b: number; lane: RandType }[] = [];
  cosmeticCalls = 0;
  constructor(public values: number[] = []) {}
  randI(a: number, b: number, lane: RandType): number {
    this.calls.push({ a, b, lane });
    const value = this.values.shift();
    if (value === undefined) throw new Error(`Unexpected RNG ${a},${b},lane ${lane}`);
    return value;
  }
  rand(_a: number, _b: number, lane: RandType): number { if (lane !== 0) throw new Error('Unexpected Rand'); this.cosmeticCalls++; return 0; }
  randUnitF(lane: RandType): number { if (lane !== 0) throw new Error('Unexpected RandUnitF'); this.cosmeticCalls++; return 0; }
}
export function context(values: number[] = []): RuleContext & { rng: QueueRng } {
  return { rng: new QueueRng(values), events: [] };
}
export function token(type: number, overrides: Partial<Extract<PendingEffect, { kind: 'resource' }>> = {}): Extract<PendingEffect, { kind: 'resource' }> {
  return { id: 1, kind: 'resource', tileType: type, variant: 0, skillSlot: null, targetSlot: null, amount: 0, ...overrides };
}
export function nextAction(s: RunState): Action {
  if (s.phase === 'menu') {
    const menu = s.menus[0]!, count = menu.kind === 'level' ? 2 : 1;
    if (menu.selected.length < count) return { type: 'SelectMenuItem', menuId: menu.id, index: menu.candidates.findIndex((_, i) => !menu.selected.includes(i)) };
    return { type: 'ConfirmMenu', menuId: menu.id };
  }
  if (s.phase === 'falling') return { type: 'AdvancePhase' };
  if (s.pending.length) return { type: 'ConsumeEffect', id: s.pending[0]!.id };
  return { type: 'AdvancePhase' };
}
export function settle(s: RunState): { state: RunState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  for (let n = 0; n < 1000; n++) {
    if (s.phase === 'input' || s.phase === 'ended') return { state: s, events };
    const result = step(s, nextAction(s)); s = result.state; events.push(...result.events);
  }
  throw new Error('Suspended turn failed to finish');
}
