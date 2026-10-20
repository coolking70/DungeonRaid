import { afterEach, expect, test, vi } from 'vitest';
afterEach(() => vi.unstubAllGlobals());
import { GameSession, SESSION_KEY, legalChain, isStuck } from '../ui/session';
import { PresentationTimeline } from '../ui/timeline';
import { SilentAudio } from '../ui/audio';
import { Difficulty, GameMode, SpecialTileType, TileType } from '../src/core/data';
import { canCastSkill } from '../src/core/skills';
import { serializeRun, deserializeProfile } from '../src/core/save';
import { fixture, select, nextAction } from './turn-helpers';
import { step } from '../src/core/engine';
import { adjacent, canMatchType } from '../src/core/chain';
import type { RunState } from '../src/core/state';
function longChain(s: RunState) {
  let best: number[] = [];
  for (let first = 0; first < 36; first++) {
    if (!canMatchType(s, first, [])) continue;
    const nodes = [first];
    while (true) {
      const next = s.board.findIndex((t, slot) => !nodes.includes(slot) && adjacent(t, s.board[nodes.at(-1)!]!) && canMatchType(s, slot, nodes));
      if (next < 0) break; nodes.push(next);
    }
    if (nodes.length > best.length) best = nodes;
  }
  return best.length >= 3 ? best : legalChain(s);
}

function storage() {
  const map = new Map<string, string>();
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
}
function playAnimations(s: GameSession) {
  for (let i = 0; i < 12000 && s.busy; i++) s.update(1 / 60);
  expect(s.busy).toBe(false);
}
const config = { seed: 12345, classId: 0, difficulty: Difficulty.DIFF_NORMAL, mode: GameMode.MODE_CLASSIC };
test('rules commit ahead of display; animation pause/resume cannot change effect order or RNG', () => {
  const a = new GameSession(storage()); a.start(config);
  for (const slot of legalChain(a.state)!) expect(a.dispatch({ type: 'SelectTile', at: { x: slot % 6, y: Math.floor(slot / 6) } })).toBe(true);
  a.dispatch({ type: 'CommitChain' }); expect(a.busy).toBe(true);
  const rule = structuredClone(a.state), display = structuredClone(a.timeline.display);
  const consumed = a.events.filter(e => e.type === 'EffectConsumed');
  expect(new Set(consumed.map(e => e.id)).size).toBe(consumed.length);
  a.timeline.paused = true; a.update(100); expect(a.timeline.display).toEqual(display);
  expect(a.state).toEqual(rule); expect(a.dispatch({ type: 'AdvancePhase' })).toBe(false);
  a.timeline.paused = false; playAnimations(a);
  expect(a.state).toEqual(rule); expect(a.timeline.display.board).toEqual(a.state.board);
  expect(a.events.filter(e => e.type === 'EffectConsumed')).toEqual(consumed);
});
test('cancel selection is a zero-turn action and never commits', () => {
  const a = new GameSession(storage()); a.start(config); const rng = structuredClone(a.state.rng);
  for (const slot of legalChain(a.state)!) a.dispatch({ type: 'SelectTile', at: { x: slot % 6, y: Math.floor(slot / 6) } });
  expect(a.state.preview.valid).toBe(true); a.dispatch({ type: 'CancelChain' });
  expect(a.state.chain.nodes).toEqual([]); expect(a.state.turn).toBe(0); expect(a.state.rng).toEqual(rng);
});
test('menu save/resume keeps pending IDs and selection order; atomic envelope replaces legacy', () => {
  const s = fixture(); s.resources.gold.remainder = 99;
  const input = select(s, [0, 1, 2]); let run = step(input, { type: 'CommitChain' }).state;
  while (run.phase !== 'menu') run = step(run, nextAction(run)).state;
  const store = storage(); store.setItem('dungeonraid.run.v1', serializeRun(run).json);
  const a = new GameSession(store); expect(a.state).toEqual(run); a.resume();
  const menu = a.state.menus[0]!;
  a.dispatch({ type: 'SelectMenuItem', menuId: menu.id, index: 1 });
  const resumed = new GameSession(store); expect(resumed.state).toEqual(a.state);
  expect(resumed.state.menus[0]!.selected).toEqual([1]);
  expect(JSON.parse(store.getItem(SESSION_KEY)!).version).toBe(2);
});
test('display batch captures post-move payload and consumes cached token exactly once', () => {
  const before = fixture(), after = structuredClone(before);
  after.moving = [{ slot: 6, from: { x: 0, y: 0 }, to: { x: 0, y: 1 }, spawned: false }];
  const audio = new SilentAudio(), play = vi.spyOn(audio, 'play'); const timeline = new PresentationTimeline(before, audio);
  timeline.enqueue(before, after, [{ type: 'TileMoved', from: { x: 0, y: 0 }, to: { x: 0, y: 1 }, spawned: false }]);
  expect(timeline.current?.falls.get(6)?.y).toBe(79);
  timeline.enqueue(after, after, [{ type: 'SkillCast', id: 1, source: 'manual' }]);
  expect(play).not.toHaveBeenCalled();
  timeline.update(1); expect(play).toHaveBeenCalledExactlyOnceWith(20, -1);
  timeline.update(10); expect(play).toHaveBeenCalledOnce();
});
test('storage failure is reported while gameplay remains usable', () => {
  const a = new GameSession({ getItem: () => null, setItem: () => { throw new Error('quota'); } }); a.start(config);
  expect(a.storageError).toContain('quota'); expect(a.state.phase).toBe('input');
});
test('no-move diagnostics do not synthesize game-over or shuffle', () => {
  const s = fixture(); s.skills.fill(null);
  s.board.forEach((tile, i) => { tile.type = (i % 6 + Math.floor(i / 6) * 2) % 5; tile.specialType = SpecialTileType.SPECIAL_TILE_NONE; });
  const before = structuredClone(s); isStuck(s); expect(s).toEqual(before);
});
test.each([true, false])('full new game → reward → manual skill → natural death → persisted profile, exactly once (native clone: %s)', native => {
  if (!native) vi.stubGlobal('structuredClone', undefined);
  const store = storage(), a = new GameSession(store); a.start(config);
  let menus = 0, skills = 0;
  for (let n = 0; n < 1200 && a.state.phase !== 'ended'; n++) {
    playAnimations(a);
    if (a.state.phase === 'menu') {
      const m = a.state.menus[0]!, count = m.kind === 'level' ? 2 : 1;
      const order = m.candidates.map((c, i) => ({ c, i })).sort((a, b) => Number(b.c.kind === 'skill') - Number(a.c.kind === 'skill'));
      for (const { i } of order.slice(0, count)) expect(a.dispatch({ type: 'SelectMenuItem', menuId: m.id, index: i })).toBe(true);
      expect(a.dispatch({ type: 'ConfirmMenu', menuId: m.id })).toBe(true); menus++; continue;
    }
    const trophy = a.state.board.findIndex(t => t.specialType === SpecialTileType.SPECIAL_TILE_TROPHY && !t.frozen && !t.matched);
    if (trophy >= 0) { a.dispatch({ type: 'ClaimTrophy', slot: trophy }); continue; }
    const skill = a.state.skills.findIndex((_, slot) => canCastSkill(a.state, slot));
    if (skill >= 0) { expect(a.dispatch({ type: 'CastSkill', slot: skill, source: 'manual' })).toBe(true); skills++; continue; }
    const chain = longChain(a.state); expect(chain).not.toBeNull();
    for (const slot of chain!) a.dispatch({ type: 'SelectTile', at: { x: slot % 6, y: Math.floor(slot / 6) } });
    expect(a.dispatch({ type: 'CommitChain' })).toBe(true);
  }
  playAnimations(a);
  expect(a.state.outcome?.won).toBe(false); expect(a.state.phase).toBe('ended'); expect(menus).toBeGreaterThan(0); expect(skills).toBeGreaterThan(0);
  const record = JSON.parse(store.getItem(SESSION_KEY)!);
  expect(record.run).toBeNull(); expect(deserializeProfile(record.profile).classes[0]!.games).toBe(1);
  a.resume(); a.save(); expect(a.profile.classes[0]!.games).toBe(1);
  const loaded = new GameSession(store); expect(loaded.profile.classes[0]!.games).toBe(1); expect(loaded.state.phase).toBe('idle');
  expect(a.error).toBeNull();
}, 30_000);
