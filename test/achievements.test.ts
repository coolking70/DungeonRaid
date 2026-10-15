import { expect, test } from 'vitest';
import { applyAchievementRequests, consumeAchievements } from '../src/core/achievements';
import { addResource, attackSkull, checkEndGame, enemyId, hurt, matchTile, processAttack } from '../src/core/combat';
import { enumValue, GameMode, SpecialTileType, TileType } from '../src/core/data';
import { step } from '../src/core/engine';
import { claimTrophy, initialiseSkill, setSkill } from '../src/core/progression';
import { settlePretzels } from '../src/core/scoring';
import { activateSkill } from '../src/core/skills';
import { createProfileState, type RunState } from '../src/core/state';
import { endOfTurn, enemyPoison } from '../src/core/turn';
import { growthContext, nativeContext } from './growth-helpers';
import { fixture, select, tile, token } from './turn-helpers';
function earned(s: RunState, id: number, progress = 100) {
  expect(s.achievementQueue).toContainEqual({ id, progress });
  expect(consumeAchievements(createProfileState(), s).profile.achievements[id]).toBeGreaterThanOrEqual(progress);
}
test.each([[5, 29], [10, 30], [25, 31], [50, 32], [100, 33]])('achievement%d XP milestone triggers%d on actual AddResource', (level, id) => {
  const s = fixture(); s.level = level - 1; s.resources.xp.remainder = 98;
  addResource(s, token(1), nativeContext(s)); earned(s, id);
});
test.each([['spikes', 34], ['fire', 35], ['poison', 36], ['acid', 37]] as const)('death achievement %s/%i strict HP boundary and LastStand rescue', (cause, id) => {
  for (const amount of [1, 2]) {
    const s = fixture(); s.health = 1; s.current.lastStand = true;
    hurt(s, amount, cause, nativeContext(s)); checkEndGame(s, nativeContext(s));
    expect(s.outcome).toBeNull(); expect(s.health).toBe(s.base.maxHealth + s.equipmentStats.maxHealth);
    earned(s, 61); expect(s.achievementQueue.some(e => e.id === id)).toBe(amount > 1);
  }
});
test('achievement40 Nemesis triggers before LastStand; Mission67 only at final end', () => {
  const s = fixture(); s.character.race = enumValue('RaceType', 'RACE_ELF');
  tile(s, 0, 1, { enemyType: enemyId('POISONOUS'), statsStatus: 'special' }); s.health = 0; s.current.lastStand = true;
  checkEndGame(s, nativeContext(s)); earned(s, 40); earned(s, 61); expect(s.achievementQueue.some(e => e.id === 67)).toBe(false);
  s.health = 0; checkEndGame(s, nativeContext(s)); earned(s, 67);
});
test('achievement43 Touche only on Spiky killed by armour-stage spikes', () => {
  const s = fixture(); s.armour = 4; s.equipmentStats.spikes = 5; s.current.forceCoin = true;
  tile(s, 0, 1, { enemyType: enemyId('SPIKY'), health: 1, maxHealth: 1, attack: 1, statsStatus: 'special' });
  processAttack(s, nativeContext(s)); earned(s, 43);
});
test('achievement47 Elf poison kill, not merely poison damage', () => {
  const s = fixture(); s.character.race = enumValue('RaceType', 'RACE_ELF');
  tile(s, 0, 1, { health: 1, maxHealth: 1, poison: [2, 0, 0] }); enemyPoison(s, nativeContext(s)); earned(s, 47, 2);
});
test('achievement48 Dwarf uppercut successful kill, including MeatShield branch priority', () => {
  let s = fixture(); s.character.race = enumValue('RaceType', 'RACE_DWARF'); s.current.forceCoin = true;
  tile(s, 12, 4); tile(s, 6, 1, { health: 1, maxHealth: 1 }); tile(s, 0, 4);
  tile(s, 35, 1, { enemyType: enemyId('MEAT_SHIELD'), health: 999, maxHealth: 999, statsStatus: 'special' });
  s = step(select(s, [12, 6, 0]), { type: 'CommitChain' }).state; earned(s, 48, 2);
});
test('achievement50 Faun healing increments only below one-quarter HP', () => {
  const s = fixture(); s.character.race = enumValue('RaceType', 'RACE_FAUN'); s.health = 1; s.resources.xp.remainder = 98;
  addResource(s, token(1), nativeContext(s)); earned(s, 50, 5);
});
test('achievement51 Orc freeze follows successful random test on surviving target', () => {
  const s = fixture(); s.character.race = enumValue('RaceType', 'RACE_ORC'); tile(s, 0, 1, { health: 20, maxHealth: 20 });
  attackSkull(s, 0, 0, true, growthContext([['i', 1, 100, 5, 1]])); earned(s, 51, 2);
});
test('achievement53 Werewolf cripple collection and54 Dragonkin fire kills', () => {
  for (const [race, id] of [['RACE_WEREWOLF', 53], ['RACE_DRAGONKIN', 54]] as const) {
    const s = fixture(); s.character.race = enumValue('RaceType', race); s.current.forceCoin = true;
    tile(s, 0, 1, { health: 1, maxHealth: 1, defence: 2, ...(id === 54 ? { burning: true, fireDamage: 2 } : {}) });
    endOfTurn(s, nativeContext(s)); earned(s, id, 2);
  }
});
test('achievement56 Sniper needs ignored node then a distant special at chain tail', () => {
  const s = fixture(); s.current.forceCoin = true; s.trophies.remaining = 500;
  tile(s, 0, 4); tile(s, 1, 4, { arrow: true }); tile(s, 3, 1, { enemyType: enemyId('BOSS'), health: 1, maxHealth: 1, statsStatus: 'special' });
  earned(step(select(s, [0, 1, 2, 3]), { type: 'CommitChain' }).state, 56);
});
test('achievement59 Necklace on36-node Chain;69 GoldDigger requires all coins;68 boundary20', () => {
  const snake = Array.from({ length: 36 }, (_, i) => { const y = Math.floor(i / 6), x = i % 6; return y * 6 + (y % 2 ? 5 - x : x); });
  const rim = [0, 1, 2, 3, 4, 5, 11, 17, 23, 29, 35, 34, 33, 32, 31, 30, 24, 18, 12, 6];
  const gold = fixture(); gold.current.forceCoin = true; earned(step(select(gold, snake), { type: 'CommitChain' }).state, 69);
  const chain = fixture(); chain.current.forceCoin = true; tile(chain, 7, TileType.TILE_SPECIAL, { specialType: SpecialTileType.SPECIAL_TILE_CHAIN });
  const done = step(select(chain, snake), { type: 'CommitChain' }).state; earned(done, 59); expect(done.achievementQueue.some(e => e.id === 69)).toBe(false);
  const border = fixture(); border.current.forceCoin = true; earned(step(select(border, rim), { type: 'CommitChain' }).state, 68);
});
test('achievement65 Teleport native requires a special in the old board (spec prose omits this condition)', () => {
  const s = fixture(); activateSkill(s, initialiseSkill(s, 7), nativeContext(s)); expect(s.achievementQueue.some(e => e.id === 65)).toBe(false);
  tile(s, 0, 1, { enemyType: enemyId('BOSS'), statsStatus: 'special' }); activateSkill(s, initialiseSkill(s, 7), nativeContext(s)); earned(s, 65, 1);
});
test('achievement70 TragicHero and71 PieceOfCake require Harder plus actual XP milestones', () => {
  for (const level of [5, 10]) {
    const s = fixture(); s.difficulty = 3; s.level = level - 1; s.resources.xp.remainder = 98;
    s.character.perks = [0, 255, 255, 255]; s.character.flaws = [0, 1, 2, 3];
    addResource(s, token(1), nativeContext(s)); earned(s, level === 5 ? 71 : 70);
  }
});
test('achievement73 each broken collected tile advances1, repeats across drains accumulate', () => {
  const s = fixture(); tile(s, 0, 4, { broken: true }); tile(s, 1, 3, { broken: true });
  matchTile(s, 0, nativeContext(s)); matchTile(s, 1, nativeContext(s));
  const r = consumeAchievements(createProfileState(), s); expect(r.profile.achievements[73]).toBe(2);
});
test('class milestone events arise at trophy claim, not later just from an unchanged profile', () => {
  const s = fixture(); s.character.classId = 1; s.classLevels[1] = 9; s.current.forceCoin = true;
  tile(s, 0, 6, { specialType: 1 }); claimTrophy(s, 0, growthContext([['i', 0, 1, 5, 1]]));
  for (const id of [1, 10, 19]) earned(s, id);
});
test('achievement progress and Easy filtering apply to every known request except45', () => {
  const requests = Array.from({ length: 78 }, (_, id) => ({ id, progress: 100 }));
  const easy = applyAchievementRequests(createProfileState(), 0, requests); expect(easy.profile.achievements).toEqual({ 67: 100 });
  const normal = applyAchievementRequests(createProfileState(), 1, requests); expect(Object.keys(normal.profile.achievements)).toHaveLength(76); expect(normal.profile.achievements[45]).toBeUndefined();
});
test('achievement75 crosses>5 also applies outside Pretzel; legal14-cross path scores42 and rating2', () => {
  const path = [35, 28, 33, 26, 31, 24, 30, 25, 32, 27, 34, 29, 23, 16, 21, 14, 19, 12, 18, 13, 20, 15, 22, 17, 11, 5, 4, 9, 2, 7, 0, 6, 1, 8, 3, 10];
  for (const mode of [GameMode.MODE_CLASSIC, GameMode.MODE_PRETZEL]) {
    let s = fixture(); s.mode = mode; s.challenge = mode !== GameMode.MODE_CLASSIC; s.current.forceCoin = true;
    s = select(s, path); expect(s.chain.nodes).toEqual(path); expect(s.pretzel.crosses).toBe(14);
    expect(s.pretzel.preview).toBe(mode === GameMode.MODE_PRETZEL ? 42 : 0);
    const r = step(s, { type: 'CommitChain' }); earned(r.state, 75);
    expect(r.state.pretzel.score).toBe(mode === GameMode.MODE_PRETZEL ? 42 : 0);
    if (mode === GameMode.MODE_PRETZEL) expect(r.events).toContainEqual({ type: 'PretzelScored', crosses: 14, points: 42, rating: 2, total: 42, averageTimes10: 140 });
  }
});
test('achievement77 native scoring primitive k15 boundary; synthetic repeated keys, not a legal user chain', () => {
  const s = fixture(); s.mode = GameMode.MODE_PRETZEL; s.challenge = true;
  // Isolate the arithmetic boundary from selection legality. End-to-end selection is tested above.
  s.chain.nodes = Array.from({ length: 17 }, (_, i) => i % 2 ? 7 : 0);
  settlePretzels(s, nativeContext(s)); earned(s, 77); expect(s.pretzel.score).toBe(100);
});
test('Sniper checks special identity after AttackSkull: a Trophy transformation clears it via SetType', () => {
  const s = fixture(); s.current.forceCoin = true; s.trophies.remaining = 0;
  tile(s, 0, 4); tile(s, 1, 4, { arrow: true }); tile(s, 3, 1, { enemyType: enemyId('BOSS'), health: 1, maxHealth: 1, statsStatus: 'special' });
  const r = step(select(s, [0, 1, 2, 3]), { type: 'CommitChain' });
  expect(r.events.some(e => e.type === 'TrophyGenerated')).toBe(true);
  expect(r.state.achievementQueue.some(e => e.id === 56)).toBe(false);
});
