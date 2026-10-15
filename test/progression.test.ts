import { describe, expect, test } from 'vitest';
import { classData, enumValue, GameMode, getNativeSkill, SpecialTileType, TileType } from '../src/core/data';
import { step } from '../src/core/engine';
import { defaultCharacter } from '../src/core/state';
import { addResource, checkEndGame, resourceToken } from '../src/core/combat';
import { downgradeStep, isUpgradeAllowed, randomUpgrade, updateEquipmentStats, upgradeStep } from '../src/core/equipment';
import { applyStatReward, canChangeRace, claimTrophy, getSkillPool, initialiseSkill, isPerkSlotUnlocked, readNativeSkill, replacementSkillsAllowed, setSkill, validateConfiguration } from '../src/core/progression';
import { generateMenu, requestMenu, selectMenuItem, confirmMenu } from '../src/core/menus';
import { activateSkill, collectBoard, processRune, runeInterior } from '../src/core/skills';
import { randomiseTile } from '../src/core/board';
import { endOfTurn } from '../src/core/turn';
import { fixture, tile, token, select, settle } from './turn-helpers';
import { growthContext, levelDraws, nativeContext } from './growth-helpers';
const { TILE_SKULL: skull, TILE_COIN: coin } = TileType;

describe('P01–P31 progression cases from spec 07', () => {
  test('P01 Shatter only reduces ordinary attack and defence', () => {
    const s = fixture(); tile(s, 0, skull, { attack: 5, defence: 4 }); tile(s, 1, skull, { enemyType: 1, attack: 5, defence: 4 });
    activateSkill(s, initialiseSkill(s, 5), nativeContext(s));
    expect(s.board[0]).toMatchObject({ attack: 1, defence: 0 }); expect(s.board[1]).toMatchObject({ attack: 5, defence: 4 });
  });
  test('P02 Shatter does not raise zero attack', () => {
    const s = fixture(); tile(s, 0, skull, { attack: 0, defence: 0 }); activateSkill(s, initialiseSkill(s, 5), nativeContext(s)); expect(s.board[0]!.attack).toBe(0);
  });
  test('P03 new Heal is level1 CD15 and fully charged', () => { const s = fixture(); setSkill(s, initialiseSkill(s, 2)); expect(s.skills[0]).toEqual({ id: 2, level: 1, cooldown: 15, charge: 15, active: false }); });
  test('P04 upgrading Heal changes cooldown, preserves charge and collects only normal potions', () => {
    const s = fixture(); setSkill(s, initialiseSkill(s, 2)); s.skills[0]!.charge = 10; setSkill(s, initialiseSkill(s, 2, s.skills[0]));
    expect(s.skills[0]).toMatchObject({ level: 2, cooldown: 14, charge: 10 });
    tile(s, 0, 0); tile(s, 1, 0, { mana: true }); tile(s, 2, 0, { acid: true }); tile(s, 3, 0, { explosive: true });
    const c = nativeContext(s); activateSkill(s, s.skills[0]!, c); expect(c.events.filter(e => e.type === 'TileMatched').map(e => e.slot)).toEqual([0]);
  });
  test('P05 two Quicken items reduce cooldown once and recomputation is idempotent', () => {
    const s = fixture(); setSkill(s, initialiseSkill(s, 2)); s.equipment[0].stats[5] = s.equipment[4].stats[5] = 1;
    updateEquipmentStats(s); updateEquipmentStats(s); expect(s.skills[0]).toMatchObject({ cooldown: 14, charge: 14 });
  });
  test('P06 only removing the last Quicken restores cooldown, not charge', () => {
    const s = fixture(); setSkill(s, initialiseSkill(s, 2)); s.equipment[0].stats[5] = s.equipment[4].stats[5] = 1; updateEquipmentStats(s);
    s.equipment[0].stats[5] = 0; updateEquipmentStats(s); expect(s.skills[0]!.cooldown).toBe(14);
    s.equipment[4].stats[5] = 0; updateEquipmentStats(s); expect(s.skills[0]).toMatchObject({ cooldown: 15, charge: 14 });
  });
  test('P07 Cunning discounts only the fourth new skill, never repeats on upgrade', () => {
    const s = fixture(); s.character.perks[0] = enumValue('PerkType', 'PERK_CUNNING');
    for (const id of [0, 1, 3, 2]) setSkill(s, initialiseSkill(s, id));
    expect(s.skills[3]!.cooldown).toBe(14); setSkill(s, initialiseSkill(s, 2, s.skills[3])); expect(s.skills[3]!.cooldown).toBe(13);
  });
  test('P08 Last Stand waits for zero, heals fully and retains poison', () => {
    const s = fixture(); s.health = 1; s.playerPoison = 7; s.current.lastStand = s.next.lastStand = true;
    expect(checkEndGame(s, nativeContext(s))).toBe(false); expect(s.current.lastStand).toBe(true);
    s.health = 0; checkEndGame(s, nativeContext(s)); expect(s.health).toBe(50); expect(s.current.lastStand || s.next.lastStand).toBe(false); expect(s.playerPoison).toBe(7);
  });
  test('P09 Trap caps current special HP at1, retains maximum and Premonition event', () => {
    const s = fixture(); s.turn = 50; s.promotion.remaining = 0; s.current.oneHealthSkulls = true;
    // Boss x5 health: common health6 -> max30; cosmetic draw is separate.
    // Native curve ranges are exercised by existing board/special tests; inject its generated stats here.
    const n = nativeContext(s); const original = n.rng.randI.bind(n.rng);
    n.rng.randI = (a, b, lane) => lane === 1 && a === 0 && b === 4 ? 1 : lane === 1 && a === 1 && b === 32 ? 1 : original(a, b, lane);
    randomiseTile(s, s.board[0]!, n.rng, n.events, { completeSpecialStats(_s, t) { t.health = t.maxHealth = 30; } });
    expect(s.board[0]).toMatchObject({ health: 1, maxHealth: 30 }); expect(s.achievementQueue.some(e => e.id === 62)).toBe(true);
  });
  test('P10 CollectBoard temporarily suppresses Treasure Chamber and restores its scope', () => {
    const s = fixture(); s.current.forceCoin = true; const c = nativeContext(s); const types: number[] = [];
    const old = c.rng.randI.bind(c.rng); c.rng.randI = (a, b, lane) => { if (lane === 1 && a === 0 && b === 4) types.push(a); return old(a, b, lane); };
    randomiseTile(s, s.board[0]!, c.rng); expect(types).toHaveLength(0);
    collectBoard(s, c); expect(types.length).toBeGreaterThan(0); expect(s.collectingBoard).toBe(false); expect(s.current.forceCoin).toBe(true);
  });
  const square = [7, 8, 9, 15, 21, 20, 19, 13];
  test('P11 Rune 3x3 square directly collects ordinary centre, excludes special centre', () => {
    for (const enemy of [0, 1]) { let s = fixture(); s.current.rune = true; tile(s, 14, skull, { enemyType: enemy }); s = select(s, square);
      const c = nativeContext(s); processRune(s, c); expect(s.board[14]!.matched).toBe(enemy === 0); expect(c.events.some(e => e.type === 'EnemyDamaged')).toBe(false);
    }
  });
  test('P12 Rune outer20 includes16 interior slots excluding special and boundary', () => {
    let s = fixture(); s.current.rune = true;
    const outer = [0,1,2,3,4,5,11,17,23,29,35,34,33,32,31,30,24,18,12,6]; s = select(s, outer); tile(s, 14, skull, { enemyType: 1 });
    expect(runeInterior(s)).toHaveLength(16); processRune(s, nativeContext(s)); expect(s.board.filter(t => t.matched)).toHaveLength(15); expect(outer.every(i => !s.board[i]!.matched)).toBe(true);
  });
  test('P13 Rune self-crossing knot creates no additional intersection node', () => {
    let s = fixture(); s.current.rune = true; s = select(s, [7,14,13,8]); expect(runeInterior(s)).toEqual([]); processRune(s, nativeContext(s)); expect(s.board.some(t => t.matched)).toBe(false);
  });
  test('P14 boost current/next reflect actionCommitted and rotate at turn end', () => {
    for (const committed of [false, true]) { const s = fixture(); s.actionCommitted = committed; activateSkill(s, initialiseSkill(s, 16), nativeContext(s)); endOfTurn(s, nativeContext(s)); expect(s.current.swordBoost).toBe(committed); expect(s.next.swordBoost).toBe(false); }
  });
  test('P15 Earthquake swaps column-major, x then y, exactly72 OTHER draws', () => {
    const s = fixture(); s.board.forEach((t, i) => t.appearance = i);
    const c = growthContext(Array.from({ length: 72 }, () => ['i', 0, 5, 5, 0]));
    const expected = Array.from({ length: 36 }, (_, i) => i);
    for (let x = 0; x < 6; x++) for (let y = 0; y < 6; y++) { const i = y * 6 + x; [expected[i], expected[0]] = [expected[0]!, expected[i]!]; }
    activateSkill(s, initialiseSkill(s, 26), c); expect(s.board.map(t => t.appearance)).toEqual(expected); expect(c.rng.queue).toEqual([]);
  });
  test('P16 ExplosiveArmour sends8, armour absorbs3, current armour stays4', () => {
    const s = fixture(); tile(s, 0, skull, { defence: 3 }); const c = growthContext(Array.from({ length: 3 }, () => ['i', 0, 100, 5, 100]));
    activateSkill(s, initialiseSkill(s, 27), c); expect(s.board[0]!.health).toBe(15); expect(s.armour).toBe(4);
  });
  test('P17 Hack then Slash collects board, retains special, clears both flags', () => {
    const s = fixture(); tile(s, 35, skull, { enemyType: 1 }); const c = nativeContext(s);
    activateSkill(s, initialiseSkill(s, 30), c); activateSkill(s, initialiseSkill(s, 11), c);
    expect(s.combo.hack || s.combo.slash).toBe(false); expect(s.combo.collectBoard).toBe(true); expect(s.board.some(t => t.enemyType === 1)).toBe(true);
  });
  test('P18 mastered classes unlock0..39, never40/41', () => { const s = fixture(); s.classLevels.fill(10); expect(getSkillPool(s)).toEqual(Array.from({ length: 40 }, (_, i) => i)); });
  test('P19 imported IDs40/41 keep their native identity and dispatch Shock/Awe', () => {
    const s = fixture(); for (const id of [40,41]) { const skill = readNativeSkill([id,14,14,1]); activateSkill(s, skill, nativeContext(s)); expect(skill.id).toBe(id); }
    expect(s.combo.shock && s.combo.awe).toBe(true); expect(s.board.some(t => t.specialType === SpecialTileType.SPECIAL_TILE_CHAIN)).toBe(true);
  });
  test('P20 Ranger first level reward consumes random draw before overriding to Volley', () => {
    const s = fixture(); s.character = defaultCharacter(1); s.level = 2;
    const c = growthContext([['i',0,19,3,0],['i',0,18,3,0],['i',0,7,3,0],['i',0,6,3,0]]);
    const menu = generateMenu(s, 'level', c); expect(menu.candidates[0]).toMatchObject({ kind: 'skill', skill: { id: 31 } }); expect(menu.candidates[1]).toMatchObject({ skill: { id: 2 } }); expect(s.skills).toEqual([null,null,null,null]); expect(c.rng.queue).toEqual([]);
  });
  test('P21 third-slot ownership and new first candidate restrict second to existing skills', () => {
    const s = fixture(); for (const id of [2,3,4]) setSkill(s, initialiseSkill(s,id));
    const c = growthContext([['i',0,30,3,0],['i',0,2,3,0],['i',0,7,3,0],['i',0,6,3,0]]);
    const m = generateMenu(s,'level',c); expect(m.candidates.slice(0,2)).toMatchObject([{ skill: { id:0 } }, { skill: { id:2, level:2 } }]);
  });
  test('P22 Sprint removes owned skills and Trap; candidates are level5/CDbase-4', () => {
    const s = fixture(); s.challenge = true; s.mode = GameMode.MODE_SPRINT; setSkill(s, initialiseSkill(s, 0));
    const c = growthContext([['i',0,28,3,0],['i',0,27,3,0],['i',0,7,3,0],['i',0,6,3,0]]);
    const m = generateMenu(s,'level',c); expect(m.candidates[0]).toMatchObject({ skill: { id:1, level:5, cooldown:12 } }); expect(m.candidates.filter(k => k.kind === 'skill').every(k => k.skill.id !== 0 && k.skill.id !== 22)).toBe(true);
  });
  test.each([[14,5],[15,3],[20,3],[21,2],[24,2]])('P23 leech total%d upgrades by%d and24 remains eligible', (value, expected) => { const s = fixture(); s.equipmentStats.leechPercent = value; expect(upgradeStep(s,2)).toBe(expected); expect(isUpgradeAllowed(s,2)).toBe(true); });
  test.each([[17,5],[18,3],[22,3],[23,2]])('P24 leech total%d downgrades by%d', (value, expected) => { const s = fixture(); s.equipmentStats.leechPercent = value; expect(downgradeStep(s,2)).toBe(expected); });
  test.each([[69,10],[70,5],[79,5],[80,3],[85,3],[86,2]])('P25 durability%d upgrades by%d', (value, expected) => { const s = fixture(); s.equipmentStats.breakThreshold = 100-value; expect(upgradeStep(s,14)).toBe(expected); });
  test('P26 armour recomputation preserves3-point deficit', () => { const s = fixture(); s.equipment[2].stats[11]=3; updateEquipmentStats(s); s.armour=2; s.equipment[2].stats[11]=6; updateEquipmentStats(s); expect(s.armour).toBe(5); expect(s.equipmentStats.maxArmour).toBe(8); });
  test.each([[20,20],[45,40]])('P27 HP upper limit loss only clamps current%d to%d', (hp, expected) => { const s=fixture(); s.health=hp; s.equipment[4].stats[10]=0; updateEquipmentStats(s); expect(s.health).toBe(expected); });
  test('P28 weapon upgrade consumes R(0,0,UPGRADE); Sprint skips it', () => {
    for (const sprint of [false,true]) { const s=fixture(); s.challenge=sprint; s.mode=GameMode.MODE_SPRINT;
      const c=growthContext(sprint ? [['i',0,7,4,0]] : [['i',0,0,4,0],['i',0,7,4,0]]); expect(randomUpgrade(s,0,true,c.rng)).toBe(0); expect(c.rng.queue).toEqual([]);
    }
  });
  test.each([0,1])('P29 trophy branch draw%d unlocks or upgrades and synchronizes snapshot', draw => {
    const s=fixture(); s.character=defaultCharacter(1); s.classLevels[1]=2; s.current.forceCoin=true; tile(s,0,TileType.TILE_SPECIAL,{specialType:SpecialTileType.SPECIAL_TILE_TROPHY});
    const c=growthContext(draw ? [['i',0,1,5,1]] : [['i',0,1,5,0],['i',0,7,5,0]]);
    claimTrophy(s,0,c); expect(s.classLevels[draw ? 1 : 2]).toBe(draw ? 3 : 1); expect(c.events.some(e=>e.type==='ClassLevelChanged')).toBe(true); expect(s.turn).toBe(0);
  });
  test.each([2,3,5,7,9,10])('P30 class level%d editor eligibility', level => {
    expect([0,1,2,3].map(i=>isPerkSlotUnlocked(level,i))).toEqual([true,level>=3,level>=7,level>=9]); expect(canChangeRace(level)).toBe(level>=5); expect(replacementSkillsAllowed(level)).toBe(Math.floor(level/2)*2);
  });
  test('P31 mana binds eligible Heal slot at creation, empty target is hidden and never heals', () => {
    const s=fixture(); for(const id of [29,2,3]) setSkill(s,initialiseSkill(s,id)); s.skills[0]!.charge=0; s.skills[1]!.charge=0; s.health=10;
    const c=growthContext([['i',0,0,5,0]]); resourceToken(s,0,0,c,1); expect(s.pending[0]).toMatchObject({skillSlot:1});
    addResource(s,s.pending[0] as ReturnType<typeof token>,c); expect(s.health).toBe(10); expect(s.skills[1]!.charge).toBe(1); s.skills[1]=null;
    const count=s.pending.length; resourceToken(s,0,0,c,1); expect(s.pending).toHaveLength(count); expect(c.rng.queue).toEqual([]);
  });
});
