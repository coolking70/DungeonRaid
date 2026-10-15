import { adjacent, canMatchType } from '../src/core/chain';
import { canCastSkill } from '../src/core/skills';
import { GameMode, SpecialTileType, TileType } from '../src/core/data';
import { step, type Action, type GameEvent } from '../src/core/engine';
import { createProfileState, createRunState, type ProfileState, type RunState } from '../src/core/state';
import { applyRunResult, prepareNewRun } from '../src/core/profile';
import { getScore, pretzelChain } from '../src/core/scoring';
import { deserializeRun, serializeRun, validateProfile, validateRun } from '../src/core/save';
import type { RngCall } from '../src/core/rng';

/** Independent xorshift32; never touches the six engine lanes. */
export function strategyRng(seed: number): () => number {
  let x = (seed ^ 0x9e3779b9) >>> 0 || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}
const neighbours = Array.from({ length: 36 }, (_, i) => Array.from({ length: 36 }, (_, j) => j).filter(j => adjacent({ x: i % 6, y: Math.floor(i / 6) }, { x: j % 6, y: Math.floor(j / 6) })));
function minimumPath(s: RunState): number[] {
  function visit(nodes: number[]): number[] | null {
    const effective = nodes.filter((slot, i) => i === 0 || !s.board[nodes[i - 1]!]!.arrow || [1, 4].includes(s.board[slot]!.type)).length;
    if (effective >= 3) return nodes;
    if (nodes.length >= 5) return null;
    for (let i = 0; i < 36; i++) if (!nodes.includes(i) && (!nodes.length || adjacent(s.board[i]!, s.board[nodes.at(-1)!]!)) && canMatchType(s, i, nodes)) {
      const result = visit([...nodes, i]); if (result) return result;
    }
    return null;
  }
  return visit([]) ?? [];
}
function path(s: RunState, random: () => number): number[] {
  let best: number[] = [], bestValue = -1;
  const rotation = Math.floor(random() * 8), start = Math.floor(random() * 36);
  for (let n = 0; n < 36; n++) {
    const first = (start + n) % 36;
    if (!canMatchType(s, first, [])) continue;
    const nodes = [first];
    while (nodes.length < 36) {
      const options = neighbours[nodes.at(-1)!]!;
      let next: number | undefined;
      for (let j = 0; j < options.length; j++) {
        const i = options[(j + rotation) % options.length]!;
        if (!nodes.includes(i) && canMatchType(s, i, nodes)) { next = i; break; }
      }
      if (next === undefined) break;
      nodes.push(next);
    }
    const effective = nodes.filter((slot, i) => i === 0 || !s.board[nodes[i - 1]!]!.arrow || [TileType.TILE_SKULL, TileType.TILE_SWORD].includes(s.board[slot]!.type)).length;
    const value = effective + (s.mode === GameMode.MODE_PRETZEL ? 4 * pretzelChain(s, nodes).points : 0);
    if (effective >= 3 && value > bestValue) { best = nodes; bestValue = value; }
  }
  if (!best.length) best = minimumPath(s);
  if (!best.length) throw new Error(`No legal chain (exhaustive minimum-chain search) at turn ${s.turn}`);
  // A mixed random player, not an indefinitely optimal farming bot. After turn300,
  // prefer minimum legal chains to keep the soak finite without editing the engine.
  if (random() < .15 || s.turn >= 300) {
    for (let n = 3; n <= best.length; n++) {
      const prefix = best.slice(0, n);
      if (prefix.filter((slot, i) => i === 0 || !s.board[prefix[i - 1]!]!.arrow || [1, 4].includes(s.board[slot]!.type)).length >= 3) return prefix;
    }
  }
  return best;
}
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
/** Cheap per-step invariants. Full structural save validation runs at checkpoints and game end. */
export function runInvariants(s: RunState): void {
  assert(s.board.length === 36, 'board size');
  for (const [i, t] of s.board.entries()) {
    assert(t.x === i % 6 && t.y === Math.floor(i / 6), 'fixed board coordinates');
    assert(t.type >= 0 && t.type < TileType.TILE_NONE && t.statsStatus !== 'special-pending', 'tile type/stats');
    assert([t.attack, t.defence, t.health, t.maxHealth, ...t.poison].every(Number.isFinite), 'finite tile stats');
  }
  assert(Number.isFinite(s.health) && s.health >= 0 && s.health <= s.base.maxHealth + s.equipmentStats.maxHealth, 'health bounds');
  assert(s.armour >= 0 && s.armour <= s.equipmentStats.maxArmour, 'armour bounds');
  assert(Object.values(s.resources).every(b => Number.isFinite(b.carry) && b.remainder >= 0 && b.remainder < 100 && b.banked % 100 === 0), 'resource bounds');
  assert(s.rng.seeds.every(n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff), 'RNG uint32');
  assert(new Set([...s.pending, ...s.menus].map(e => e.id)).size === s.pending.length + s.menus.length, 'unique effect/menu IDs');
  assert(s.skills.filter(Boolean).length === s.selectedSkillCount, 'skill count');
  assert(s.classLevels.length === 10 && s.classLevels.every(n => n >= 0 && n <= 10), 'class levels');
  if (s.phase === 'input' || s.phase === 'ended') assert(!s.pending.length && !s.moving.length && !s.menus.length && s.resumePhase === null && s.menuResumePhase === null, 'terminal/input queues');
  if (s.phase === 'menu') assert(s.menus.length && s.menuResumePhase, 'menu continuation');
  if (s.phase === 'falling' || s.phase === 'arrivals') assert(s.resumePhase, 'arrival continuation');
}
export interface SimulationConfig { seed: number; mode: number; difficulty: number; classId: number }
export interface SimulationStats { config: SimulationConfig; turns: number; score: number; cause: string; actions: number; specials: number[]; skillAppearances: number[]; casts: number[]; unlocks: number[]; checkpoints: Record<string, number> }
export class SimulationFailure extends Error {
  constructor(readonly config: SimulationConfig, readonly actions: Action[], readonly detail: string) { super(`${JSON.stringify(config)}: ${detail}`); }
}
export function simulate(config: SimulationConfig, options: { profile?: ProfileState; restore?: boolean; trace?: boolean } = {}) {
  const random = strategyRng(config.seed + config.mode * 997 + config.difficulty * 7919 + config.classId * 104729);
  const checkpointRandom = strategyRng(config.seed ^ 0xa5a5a5a5);
  const actions: Action[] = [], calls: RngCall[] = [], events: GameEvent[] = [];
  const checkpoints: Record<string, number> = {};
  const stats: SimulationStats = { config, turns: 0, score: 0, cause: '', actions: 0, specials: Array(32).fill(0), skillAppearances: Array(42).fill(0), casts: Array(42).fill(0), unlocks: Array(78).fill(0), checkpoints };
  // Explicit synthetic I1 fixture, inherited from T06. NOT a native capture or a balance claim.
  const hooks = { scrollNativeWord: () => 0, rng: options.trace ? (call: Readonly<RngCall>) => { calls.push({ ...call }); } : undefined };
  const profile = options.profile ?? createProfileState();
  let s = prepareNewRun(profile, createRunState({ scrollFilter: 'supplied-native-fixture' }));
  const act = (action: Action) => {
    actions.push(action);
    const result = step(s, action, hooks); s = result.state; runInvariants(s);
    if (options.trace) events.push(...result.events);
    for (const e of result.events) {
      if (e.type === 'SpecialEnemyGenerated') stats.specials[e.enemyType - 1]!++;
      if (e.type === 'SkillCast') stats.casts[e.id]!++;
      if (e.type === 'MenuRequested') for (const candidate of e.menu.candidates) {
        if (candidate.kind === 'skill') stats.skillAppearances[candidate.skill.id]!++;
        if (candidate.kind === 'item' && candidate.scroll) stats.skillAppearances[candidate.scroll.id]!++;
      }
    }
    // Independent checkpoint schedule; does not consume the strategy's random stream.
    const checkpointKey = s.phase === 'menu' && s.menus[0]!.selected.length ? 'menu-selected' : s.phase;
    const checkpoint = checkpointRandom() < .01 || ['falling', 'arrivals', 'menu', 'menu-selected'].includes(checkpointKey) && !checkpoints[checkpointKey];
    if (checkpoint) {
      checkpoints[checkpointKey] = (checkpoints[checkpointKey] ?? 0) + 1;
      if (options.restore) s = deserializeRun(serializeRun(s).json);
    }
    if (actions.length > 100000 || s.turn >= 1500) throw new Error('Simulation guard exceeded');
  };
  const drain = () => {
    while (s.phase !== 'input' && s.phase !== 'ended') {
      if (s.phase === 'menu') {
        const m = s.menus[0]!, count = m.kind === 'level' ? 2 : 1;
        const choices = m.candidates.flatMap((_, i) => m.selected.includes(i) ? [] : [i]);
        if (m.selected.length < count) act({ type: 'SelectMenuItem', menuId: m.id, index: choices[Math.floor(random() * choices.length)]! });
        else act({ type: 'ConfirmMenu', menuId: m.id });
      } else if (s.phase === 'falling') act({ type: 'AdvancePhase' });
      else if (s.pending.length) act({ type: 'ConsumeEffect', id: s.pending[0]!.id });
      else act({ type: 'AdvancePhase' });
    }
  };
  try {
    act({ type: 'NewGame', ...config });
    while (!s.outcome) {
      let freeActions = 0;
      while (s.phase === 'input') {
        if (++freeActions > 100) throw new Error('Free action guard exceeded');
        const trophy = s.board.findIndex(t => t.specialType === SpecialTileType.SPECIAL_TILE_TROPHY && !t.matched && !t.frozen);
        const ready = s.skills.flatMap((_, i) => canCastSkill(s, i) ? [i] : []);
        if (trophy >= 0) act({ type: 'ClaimTrophy', slot: trophy });
        else if (ready.length && random() < .85) act({ type: 'CastSkill', source: 'manual', slot: ready[Math.floor(random() * ready.length)]! });
        else break;
        drain();
      }
      if (s.outcome) break;
      let chain: number[];
      try { chain = path(s, random); }
      catch (error) {
        const ready = s.skills.findIndex((_, i) => canCastSkill(s, i));
        if (ready < 0 || !(error instanceof Error) || !error.message.startsWith('No legal chain')) throw error;
        act({ type: 'CastSkill', source: 'manual', slot: ready }); drain(); continue;
      }
      for (const slot of chain) act({ type: 'ExtendChain', at: { x: slot % 6, y: Math.floor(slot / 6) } });
      act({ type: 'CommitChain' }); drain();
    }
    validateRun(s);
    const resultProfile = applyRunResult(profile, s); validateProfile(resultProfile);
    stats.turns = s.turn; stats.score = getScore(s); stats.cause = s.outcome!.cause; stats.actions = actions.length;
    for (const [id, percent] of Object.entries(resultProfile.achievements)) if (percent === 100 && profile.achievements[Number(id)] !== 100) stats.unlocks[Number(id)]!++;
    return { state: s, profile: resultProfile, calls, events, stats, actions };
  } catch (e) { throw new SimulationFailure(config, actions, e instanceof Error ? `${e.message}\n${e.stack}` : String(e)); }
}
