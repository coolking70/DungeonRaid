import { describe, expect, test, vi } from 'vitest';
import { adjacent, canMatchType } from '../src/core/chain';
import { Difficulty, GameMode, TileType } from '../src/core/data';
import { step, type Action } from '../src/core/engine';
import { createRunState, type RunState } from '../src/core/state';
import type { RngCall } from '../src/core/rng';
import { nextAction } from './turn-helpers';

/** Deterministic bounded greedy: try every first slot, extend by ascending physical slot,
 * select longest valid path, ties go to first start. No hidden RNG or state edits. */
function strategy(s: RunState): number[] {
  let best: number[] = [];
  for (let first = 0; first < 36; first++) {
    if (!canMatchType(s, first, [])) continue;
    const nodes = [first];
    while (true) {
      const candidate = s.board.findIndex((t, slot) => !nodes.includes(slot) && adjacent(t, s.board[nodes.at(-1)!]!) && canMatchType(s, slot, nodes));
      if (candidate < 0) break;
      nodes.push(candidate);
    }
    // All generated T04 placeholders are normal tiles (no Volley, Trophy or Chain).
    if (nodes.length > best.length) best = nodes;
  }
  if (best.length < 3) throw new Error(`No legal chain at turn ${s.turn}`);
  return best;
}
function hash(s: RunState): string {
  let value = 2166136261;
  for (const char of JSON.stringify(s)) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  return value.toString(16).padStart(8, '0');
}
function invariant(s: RunState): void {
  expect(s.board.length).toBe(36);
  expect(s.board.every((t, i) => t.type !== TileType.TILE_NONE && t.x === i % 6 && t.y === Math.floor(i / 6))).toBe(true);
  expect(s.health).toBeLessThanOrEqual(s.base.maxHealth + s.equipmentStats.maxHealth);
  expect(s.health).toBeGreaterThanOrEqual(0);
  expect(s.armour >= 0 && s.armour <= s.equipmentStats.maxArmour).toBe(true);
  expect(Object.values(s.resources).every(b => b.remainder >= 0 && b.remainder < 100)).toBe(true);
  expect(['input', 'falling', 'arrivals', 'menu', 'enemy-attack', 'end-turn', 'ended']).toContain(s.phase);
  expect(new Set(s.pending.map(e => e.id)).size).toBe(s.pending.length);
  if (s.pending.length) expect(['falling', 'arrivals', 'menu']).toContain(s.phase);
  if (s.phase === 'input' || s.phase === 'ended') {
    expect(s.pending).toEqual([]); expect(s.moving).toEqual([]); expect(s.menus).toEqual([]);
    expect(s.resumePhase).toBeNull(); expect(s.menuResumePhase).toBeNull();
  }
  if (s.phase === 'menu') expect(s.menus.length).toBeGreaterThan(0);
}
function play(seed: number, difficulty: number, mode: number = GameMode.MODE_CLASSIC, healthFixture?: number) {
  const calls: RngCall[] = [];
  const rng = (call: Readonly<RngCall>) => { calls.push({ ...call }); };
  let s = step(createRunState(), { type: 'NewGame', seed, classId: 0, difficulty, mode }, { rng }).state;
  // Survival fixture is used only to exercise all 100 Sprint turns; it is not a balance claim.
  if (healthFixture !== undefined) { s.base.maxHealth = healthFixture; s.equipmentStats.maxHealth = 0; s.health = healthFixture; }
  let actions = 0, specials = 0;
  const act = (action: Action) => {
    const r = step(s, action, { rng }); s = r.state; actions++;
    specials += r.events.filter(e => e.type === 'SpecialEnemyPending').length;
    invariant(s);
  };
  invariant(s);
  while (s.phase !== 'ended' && s.turn < 300) {
    const nodes = strategy(s);
    for (const slot of nodes) act({ type: 'ExtendChain', at: { x: slot % 6, y: Math.floor(slot / 6) } });
    act({ type: 'CommitChain' });
    let guard = 0;
    while (!['input', 'ended'].includes(s.phase)) {
      if (++guard > 1000) throw new Error('Pending stage failed to drain');
      act(nextAction(s));
    }
  }
  expect(s.phase === 'ended' || s.turn === 300).toBe(true);
  expect(calls.length).toBe(s.rng.calls);
  expect(calls.every((c, i) => c.index === i + 1 && Number.isInteger(c.lane) && c.lane >= 0 && c.lane < 6)).toBe(true);
  return { s, hash: hash(s), calls, actions, specials };
}

describe('full NewGame→death deterministic simulations', () => {
  const seeds = [12345, 42, 987654321];
  const difficulties = Object.values(Difficulty);
  test.each(difficulties.flatMap(difficulty => seeds.map(seed => ({ seed, difficulty }))))('seed $seed difficulty $difficulty replay hash and every-step invariants', ({ seed, difficulty }) => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Implicit RNG forbidden'); });
    try {
      const first = play(seed, difficulty), second = play(seed, difficulty);
      expect(first.hash).toBe(second.hash); expect(first.s).toEqual(second.s); expect(first.calls).toEqual(second.calls);
      console.info(JSON.stringify({ simulation: 'T04', seed, difficulty, turns: first.s.turn, cause: first.s.outcome?.cause ?? 'turn-limit', hash: first.hash, actions: first.actions, specialPlaceholders: first.specials }));
    } finally { random.mockRestore(); }
  });
  test('Sprint survives full 100 turns with controlled HP fixture and emits victory', () => {
    const result = play(12345, Difficulty.DIFF_NORMAL, GameMode.MODE_SPRINT, 100000);
    expect(result.s.outcome).toEqual({ won: true, cause: 'sprint', turn: 100 });
    expect(result.s.pending).toEqual([]);
  });
  test('Sprint full deterministic playthrough uses the same action driver', () => {
    const first = play(12345, Difficulty.DIFF_NORMAL, GameMode.MODE_SPRINT), second = play(12345, Difficulty.DIFF_NORMAL, GameMode.MODE_SPRINT);
    expect(first.hash).toBe(second.hash); expect(first.s.turn).toBeLessThanOrEqual(100);
    console.info(JSON.stringify({ simulation: 'T04-Sprint', turns: first.s.turn, cause: first.s.outcome?.cause, hash: first.hash }));
  });
});
