import { describe, expect, test } from 'vitest';
import { applyAchievementRequests, classAchievementRequests, consumeAchievements } from '../src/core/achievements';
import { addResource, checkEndGame } from '../src/core/combat';
import { Difficulty, GameMode, TileType } from '../src/core/data';
import { step } from '../src/core/engine';
import { applyClassLevelChanged, applyRunResult, classLevelsFromProfile, prepareNewRun } from '../src/core/profile';
import { readNativeSkill, setSkill } from '../src/core/progression';
import { deserializeProfile, deserializeRun, SaveValidationError, serializeProfile, serializeRun } from '../src/core/save';
import { getScore, pretzelChain, pretzelPoints, scoreBreakdown, settlePretzels } from '../src/core/scoring';
import { activateSkill } from '../src/core/skills';
import { createProfileState, createRunState, type RunState } from '../src/core/state';
import { endOfTurn } from '../src/core/turn';
import { nativeContext } from './growth-helpers';
import { fixture, select, token } from './turn-helpers';
const roundtrip = (s: RunState) => deserializeRun(serializeRun(s).json);
const mode = (s: RunState, mode: number) => { s.mode = mode; s.challenge = mode !== GameMode.MODE_CLASSIC; return s; };
const finish = (s: RunState) => { s.health = 0; checkEndGame(s, nativeContext(s)); return s; };
function resources(s: RunState, x: number, g: number, u: number) {
  for (const [key, value] of [['xp', x], ['gold', g], ['upgrade', u]] as const) { s.resources[key].banked = Math.floor(value / 100) * 100; s.resources[key].remainder = value % 100; }
}

test('S01 Classic includes resources, turns and current equipped skill levels', () => {
  const s = fixture(); resources(s, 100, 20, 30); s.turn = 10;
  setSkill(s, { id: 2, level: 1, cooldown: 15, charge: 15, active: false });
  setSkill(s, { id: 3, level: 2, cooldown: 14, charge: 14, active: false });
  expect(getScore(s)).toBe(460); expect(scoreBreakdown(s).contributions).toEqual({ xp: 100, gold: 20, upgrade: 30, turns: 10, skills: 300, pretzels: 0 });
});
test.each([false, true])('S02 Sprint X3/G3/U3 truncates separately, won=%s', won => {
  const s = mode(fixture(), GameMode.MODE_SPRINT); resources(s, 3, 3, 3); s.sprintWon = won; expect(getScore(s)).toBe(0);
});
test.each([false, true])('S03 Sprint X8/G12/U16, won=%s', won => {
  const s = mode(fixture(), GameMode.MODE_SPRINT); resources(s, 8, 12, 16); s.sprintWon = won; expect(getScore(s)).toBe(won ? 18 : 9);
});
test.each([[4, 4, 0], [5, 10, 1], [9, 18, 1], [10, 30, 2], [14, 42, 2], [15, 100, 3]])('S04 Pretzel k=%i gives points=%i rating=%i', (k, points, rating) => {
  expect(pretzelPoints(k)).toEqual({ points, rating });
});
test('S05 Pretzel truncates average after every scoring chain; zero chains excluded', () => {
  const s = mode(fixture(), GameMode.MODE_PRETZEL);
  s.pretzel.averageTimes10 = 16; s.pretzel.scoringChains = 3;
  // Two diagonal cells traversed in both directions: keys 0 and 2.
  s.chain.nodes = [0, 7, 1, 6, 12, 13, 8, 15, 9, 14];
  expect(pretzelChain(s).crosses).toBe(2);
  settlePretzels(s, nativeContext(s)); expect(s.pretzel).toMatchObject({ averageTimes10: 17, scoringChains: 4, score: 2, maxCrosses: 2 });
  s.chain.nodes = [0, 1, 2]; settlePretzels(s, nativeContext(s)); expect(s.pretzel.scoringChains).toBe(4);
});
test('S06 Sprint completes turn100, doubles score, emits Survivor and settlement once', () => {
  const s = mode(fixture(), GameMode.MODE_SPRINT); s.turn = 99; resources(s, 8, 12, 16);
  const c = nativeContext(s); endOfTurn(s, c);
  expect(s.outcome).toEqual({ won: true, cause: 'sprint', turn: 100 }); expect(getScore(s)).toBe(18);
  expect(s.achievementQueue).toContainEqual({ id: 76, progress: 100 });
  expect(c.events.find(e => e.type === 'GameOver')).toMatchObject({ settlement: { score: 18, multiplier: 2 } });
  checkEndGame(s, c); expect(c.events.filter(e => e.type === 'GameOver')).toHaveLength(1);
});
test('S07 fatal poison in turn100 prevents Sprint victory, multiplier and Survivor', () => {
  const s = mode(fixture(), GameMode.MODE_SPRINT); s.turn = 99; s.health = 1; s.playerPoison = 2; resources(s, 8, 12, 16);
  endOfTurn(s, nativeContext(s)); expect(s.outcome).toEqual({ won: false, cause: 'poison', turn: 100 }); expect(getScore(s)).toBe(9); expect(s.achievementQueue.some(e => e.id === 76)).toBe(false);
});
test.each([1, 2])('S08 acid damage %i at HP1 ends game; Disintegrated requires strict negative raw HP', damage => {
  const s = fixture(); s.health = 1; s.base.healing = damage; s.equipmentStats.healing = 0;
  addResource(s, token(TileType.TILE_POTION, { variant: 2 }), nativeContext(s));
  expect(s.outcome).not.toBeNull(); expect(s.achievementQueue.some(e => e.id === 37)).toBe(damage === 2);
});
test('S09 Easy suppresses Bloodlust but keeps MissionAccomplished and drains queue', () => {
  const s = fixture(); s.difficulty = Difficulty.DIFF_EASY; s.achievementQueue = [{ id: 46, progress: 1 }, { id: 67, progress: 100 }];
  const p = createProfileState(), before = structuredClone(s), result = consumeAchievements(p, s);
  expect(result.profile.achievements).toEqual({ 67: 100 }); expect(result.state.achievementQueue).toEqual([]); expect(s).toEqual(before); expect(p.achievements).toEqual({});
});
test('S10 four combo flags trigger ShockAwe without owning native40/41', () => {
  const s = fixture(); s.combo.slashAchievement = s.combo.fireball = s.combo.charge = true;
  activateSkill(s, { id: 33, cooldown: -1, charge: -1, level: 1, active: false }, nativeContext(s));
  expect(s.achievementQueue).toContainEqual({ id: 63, progress: 100 }); expect(s.skills.every(k => k?.id !== 40 && k?.id !== 41)).toBe(true);
});
test('S11 new v1 preserves sparse Item attributes0=2,11=1 without a native bitmask', () => {
  const s = fixture(); s.equipment[0].stats.fill(0); s.equipment[0].stats[0] = 2; s.equipment[0].stats[11] = 1;
  expect(roundtrip(s)).toEqual(s); expect(JSON.parse(serializeRun(s).json)).toMatchObject({ version: 1, kind: 'run' });
});
test('S12 new v1 preserves native Wish cooldown/charge=-1 sentinel semantics', () => {
  const s = fixture(); setSkill(s, readNativeSkill([33, 255, 0, 1]));
  expect(roundtrip(s).skills[0]).toEqual({ id: 33, cooldown: -1, charge: -1, level: 1, active: false });
});
test('S13 new v1 preserves row-major tile0=0/tile1=4, without nibble packing', () => {
  const s = fixture(); s.board[0]!.type = 0; s.board[1]!.type = 4;
  expect(roundtrip(s).board.map(t => t.type)).toEqual(s.board.map(t => t.type));
});
test.each([[2, 0, 0], [2, 3, 4]])('S14 new v1 preserves all three poison entries %j without a terminator', (...poison) => {
  const s = fixture(); s.board[0]!.poison = poison as [number, number, number]; expect(roundtrip(s).board[0]!.poison).toEqual(poison);
});
test('S15 new v1 preserves full configuration, including all20 replacement slots, in run and profile', () => {
  const s = fixture(), p = createProfileState(); s.character.replacementSkills = Array.from({ length: 20 }, (_, i) => i);
  p.classes[0]!.replacementSkills = [...s.character.replacementSkills]; expect(roundtrip(s).character).toEqual(s.character);
  expect(deserializeProfile(serializeProfile(p))).toEqual(p);
});
test('S16 new v1 explicitly stores all SIX RNG lanes and ordinal, including COSMETIC', () => {
  const s = fixture(); s.rng = { seeds: [0xffffffff, 1, 2, 3, 4, 5], calls: 123 }; expect(roundtrip(s).rng).toEqual(s.rng);
});
test('S17 new v1 chooses wide averageTimes10=300, never truncates to44', () => {
  const s = mode(fixture(), GameMode.MODE_PRETZEL); s.pretzel.averageTimes10 = 300; expect(roundtrip(s).pretzel.averageTimes10).toBe(300);
});
test('S18 full leaderboard still overwrites the last entry with a new lowest score', () => {
  let p = createProfileState();
  for (let t = 10; t > 0; t--) { const s = fixture(); s.turn = t; p = applyRunResult(p, finish(s)); }
  p = applyRunResult(p, finish(fixture())); expect(p.highScores[1]!.map(s => s.score)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 0]); expect(p.lastScoreIndices[1]).toBe(9);
});
test('S19 same score inserted after old equal scores, records lastIndex', () => {
  let p = createProfileState();
  for (const name of ['old1', 'old2', 'new']) { p.playerName = name; p = applyRunResult(p, finish(fixture())); }
  expect(p.highScores[1]!.map(s => s.name)).toEqual(['old1', 'old2', 'new']); expect(p.lastScoreIndices[1]).toBe(2);
});
test.each([7, 8])('S20 serialize returns achievement72 request only at >=8 nonzero Item stats (%i)', count => {
  const s = fixture(); s.equipment.forEach(i => i.stats.fill(0)); s.equipment[0].stats.fill(1, 0, count); const before = structuredClone(s);
  const saved = serializeRun(s); expect(saved.achievementQueue).toEqual(count === 8 ? [{ id: 72, progress: 100 }] : []);
  expect(s).toEqual(before); expect(deserializeRun(saved.json)).toEqual(s);
  s.difficulty = Difficulty.DIFF_EASY; expect(serializeRun(s).achievementQueue).toEqual([]);
});

describe('strict versioned save validation and arbitrary-stage fields', () => {
  test('menu candidates/order, scrolls, native40/41, flags, bound slots, continuations and fractional carry roundtrip', () => {
    const s = fixture(); s.phase = 'menu'; s.inputReady = false; s.menuResumePhase = 'falling'; s.resumePhase = 'end-turn'; s.nextEffectId = 5;
    setSkill(s, { id: 40, level: 1, cooldown: 15, charge: 5, active: true }); setSkill(s, { id: 41, level: 2, cooldown: 14, charge: 4, active: false });
    s.current.lastStand = true; s.next.rune = true; s.delayedLastStand = true; s.actionCommitted = true; s.classLevels[9] = 10;
    s.pending = [token(0, { id: 1, variant: 1, skillSlot: 1 }), { id: 2, kind: 'healing', source: 'leech', amount: 3 }];
    s.moving = [{ slot: 0, from: { x: 0, y: -2 }, to: { x: 0, y: 0 }, spawned: true }];
    s.menus = [{ id: 3, kind: 'level', selected: [1, 0], candidates: [{ kind: 'skill', skill: { ...s.skills[0]! } }, { kind: 'stat', id: 42, stat: 0 }] },
      { id: 4, kind: 'shop', selected: [0], candidates: [{ kind: 'item', item: structuredClone(s.equipment[0]), scroll: { ...s.skills[1]! } }] }];
    s.resources.gold.carry = Math.fround(.37); s.resources.xp.bonus = -0;
    expect(roundtrip(s)).toEqual(s); expect(Object.is(roundtrip(s).resources.xp.bonus, -0)).toBe(true);
  });
  test('falling, arrivals and selected chain states preserve complete state', () => {
    const chain = select(fixture(), [0, 7, 1, 6]); expect(roundtrip(chain)).toEqual(chain);
    const falling = step(chain, { type: 'CommitChain' }).state; expect(falling.phase).toBe('falling'); expect(roundtrip(falling)).toEqual(falling);
    const arrivals = step(falling, { type: 'AdvancePhase' }).state; expect(roundtrip(arrivals)).toEqual(arrivals);
  });
  test.each([
    (x: any) => { x.version = 2; }, (x: any) => { x.kind = 'profile'; }, (x: any) => { delete x.state.classLevels; },
    (x: any) => { x.state.rng.seeds.pop(); }, (x: any) => { x.state.rng.seeds[0] = -1; },
    (x: any) => { x.state.options.trophyInterval = 'guess'; }, (x: any) => { x.state.board[0].x = 5; },
    (x: any) => { x.state.unknown = true; }, (x: any) => { x.state.skills[0] = { id: 42 }; },
    (x: any) => { x.state.turn = .5; }, (x: any) => { x.state.resources.gold.remainder = 100; },
    (x: any) => { x.state.outcome = { won: false, turn: 0, cause: 'unknown' }; },
    (x: any) => { x.state.character.replacementSkills[0] = 500; }, (x: any) => { x.state.pretzel.score = null; },
  ])('rejects malformed/incompatible state without repairing it %#', mutate => {
    const json = JSON.parse(serializeRun(fixture()).json); mutate(json); expect(() => deserializeRun(JSON.stringify(json))).toThrow(SaveValidationError);
  });
  test('rejects nonfinite writes, malformed JSON, FF03, unknown envelope fields and malformed profile', () => {
    const s = fixture(); s.health = NaN; expect(() => serializeRun(s)).toThrow(SaveValidationError);
    for (const raw of ['\xff\x03', '{', 'null', '[]']) expect(() => deserializeRun(raw)).toThrow(SaveValidationError);
    const saved = JSON.parse(serializeRun(fixture()).json); saved.extra = 1; expect(() => deserializeRun(JSON.stringify(saved))).toThrow(SaveValidationError);
    const p = createProfileState(); p.achievements[45] = 100; expect(() => serializeProfile(p)).toThrow(SaveValidationError);
  });
});
test('profile result separates all six categories and three Classic bests; games/kills include challenges', () => {
  let p = createProfileState();
  for (const modeId of [GameMode.MODE_CLASSIC, GameMode.MODE_SPRINT, GameMode.MODE_PRETZEL]) for (const diff of [0, 1, 2, 3]) {
    const s = mode(fixture(), modeId); s.difficulty = diff; s.turn = 7; s.kills.total = 3; resources(s, 8, 12, 16);
    s.pretzel = { score: 100, preview: 0, crosses: 0, rating: 0, maxCrosses: 15, averageTimes10: 150, scoringChains: 1 };
    p = applyRunResult(p, finish(s));
  }
  expect(p.classes[0]).toMatchObject({ games: 12, kills: 36, bestScores: [43, 43, 43] });
  expect(p.highScores.map(l => l.length)).toEqual([1, 1, 1, 1, 4, 4]); expect(p.highScores[4]![0]).toMatchObject({ xp: 2, gold: 3, upgrade: 4, score: 9 });
  expect(p.highScores[5]![0]).toMatchObject({ xp: 150, gold: 15, upgrade: 1, score: 100 });
  expect(() => applyRunResult(p, fixture())).toThrow('completed');
});
test('ClassLevelChanged and final snapshot synchronize levels, defaults drive race milestones; duplicate event harmless', () => {
  const p = createProfileState(); p.classes[1]!.level = 4; p.classes[1]!.race = 9;
  const event = { type: 'ClassLevelChanged' as const, classId: 1, before: 4, after: 5 };
  const q = applyClassLevelChanged(p, event, 1); expect(q.achievements).toMatchObject({ 1: 100, 10: 100 }); expect(q.achievements[18]).toBeUndefined();
  expect(applyClassLevelChanged(q, event, 1)).toEqual(q); expect(classLevelsFromProfile(q)[1]).toBe(5); expect(p.classes[1]!.level).toBe(4);
  const s = fixture(); s.classLevels[2] = 10; expect(applyRunResult(q, finish(s)).classes[2]!.level).toBe(10);
});
test('native trophy interval carries across NewGame and profile restart by default; reset is explicit', () => {
  const p = createProfileState(); p.trophyRemaining = 23; p.classes[1]!.level = 7;
  const action = { type: 'NewGame' as const, seed: 42, classId: 0, difficulty: 1, mode: GameMode.MODE_CLASSIC };
  for (const policy of ['carry-across-runs', 'reset-each-run'] as const) {
    const s = step(prepareNewRun(deserializeProfile(serializeProfile(p)), createRunState({ trophyInterval: policy })), action).state;
    expect(s.trophies.remaining).toBe(policy === 'carry-across-runs' ? 23 : 0); expect(s.classLevels[1]).toBe(7); expect(s.trophies.awarded).toBe(0);
    expect(step(s, action).state.trophies.remaining).toBe(s.trophies.remaining);
  }
});
test('incremental requests accumulate (not deduplicated away), cap100; unlock notifications deduplicate, A1 stays locked', () => {
  const p = createProfileState(); p.achievements[46] = 98;
  const r = applyAchievementRequests(p, 1, [{ id: 46, progress: 1 }, { id: 46, progress: 1 }, { id: 46, progress: 1 }, { id: 67, progress: 100 }, { id: 67, progress: 100 }, { id: 45, progress: 100 }]);
  expect(r.profile.achievements).toEqual({ 46: 100, 67: 100 }); expect(r.events).toHaveLength(2); expect(r.events.every(e => e.unlocked)).toBe(true);
  expect(applyAchievementRequests(r.profile, 1, [{ id: 46, progress: 1 }, { id: 67, progress: 100 }]).events).toEqual([]);
  const s = fixture(); s.achievementQueue = [{ id: 46, progress: 1 }]; const first = consumeAchievements(createProfileState(), s), second = consumeAchievements(first.profile, first.state);
  expect(second.profile.achievements[46]).toBe(1);
});
test('all27 class/race/master milestones and Classy use native thresholds', () => {
  const levels = Array(10).fill(10), requests = classAchievementRequests(levels);
  expect(requests.map(e => e.id).sort((a, b) => a - b)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
  expect(classAchievementRequests(Array(10).fill(0))).toEqual([]);
});
test('ScoreScreen global latest category/index clears previous category highlight', () => {
  let p = applyRunResult(createProfileState(), finish(fixture()));
  expect(p.lastScoreIndices).toEqual([null, 0, null, null, null, null]);
  const s = mode(fixture(), GameMode.MODE_SPRINT); p = applyRunResult(p, finish(s));
  expect(p.lastScoreIndices).toEqual([null, null, null, null, 0, null]);
  expect(deserializeProfile(serializeProfile(p))).toEqual(p);
  p.lastScoreIndices[1] = 0; expect(() => serializeProfile(p)).toThrow('latest score category');
});
