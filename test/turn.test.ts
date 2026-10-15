import { NativeRng } from '../src/core/rng';
import { describe, expect, test } from 'vitest';
import { canMatchType, hitTile, updatePreview } from '../src/core/chain';
import { addResource, attackSkull, countAttackers, enemyId, matchTile, processAttack } from '../src/core/combat';
import { enumValue, RandType, TileType } from '../src/core/data';
import { step } from '../src/core/engine';
import { enemyPoison, endOfTurn, playerEndTurn } from '../src/core/turn';
import { context, fixture, select, settle, tile, token } from './turn-helpers';
const { TILE_COIN: coin, TILE_SKULL: skull, TILE_SWORD: sword, TILE_POTION: potion, TILE_SHIELD: shield } = TileType;

describe('C01–C30 native chain/turn cases (02/03/07 specs)', () => {
  test('C01 three eight-neighbour coins collect then enter exactly one enemy turn', () => {
    let s = fixture(); tile(s, 35, skull, { attack: 8 }); s.armour = 0;
    s = select(s, [0, 7, 8]); const before = structuredClone(s);
    const committed = step(s, { type: 'CommitChain' });
    expect(s).toEqual(before); expect(committed.state.pending).toHaveLength(3);
    expect(committed.state.turn).toBe(0); expect(committed.state.resources.gold.remainder).toBe(0);
    const result = settle(committed.state);
    expect(result.events.filter(e => e.type === 'EnemyAttack')).toHaveLength(1);
    expect(result.state.turn).toBe(1); expect(result.state.health).toBe(42);
    expect(result.state.resources.gold.remainder).toBe(6); expect(result.state.phase).toBe('input');
  });
  test('C02 two coins cancel without resources or enemy turn', () => {
    const s = step(select(fixture(), [0, 1]), { type: 'SubmitChain' }).state;
    expect(s.phase).toBe('input'); expect(s.chain.nodes).toEqual([]); expect(s.pending).toEqual([]); expect(s.turn).toBe(0);
    expect(s.resources.gold.remainder).toBe(0); expect(s.board.some(t => t.selected)).toBe(false);
  });
  test('C03 touching B truncates all nodes after B and recomputes contribution', () => {
    let s = fixture(); [0, 1, 2, 3].forEach(i => tile(s, i, sword)); tile(s, 3, skull);
    s = select(s, [0, 1, 2, 3]); expect(s.preview.damage).toBe(9);
    s = step(s, { type: 'ExtendChain', at: { x: 1, y: 0 } }).state;
    expect(s.chain.nodes).toEqual([0, 1]); expect(s.board[2]!.selected).toBe(false); expect(s.board[3]!.selected).toBe(false);
    expect(s.preview.damage).toBe(4); expect(s.preview.enemies).toEqual([]);
    s = step(s, { type: 'Backtrack', at: { x: 0, y: 0 } }).state; expect(s.chain.nodes).toEqual([0]);
  });
  test('C04 frozen potion rejects first selection; frozen skull accepts', () => {
    let s = fixture(); tile(s, 0, potion, { frozen: true }); tile(s, 1, skull, { frozen: true });
    s = select(s, [0]); expect(s.chain.nodes).toEqual([]);
    s = select(s, [1]); expect(s.chain.nodes).toEqual([1]);
  });
  test('C05 arrow intermediate coin is ignored for minimum length and collection', () => {
    const s = fixture(); tile(s, 0, sword, { arrow: true }); tile(s, 2, skull, { health: 1 }); tile(s, 3, sword); tile(s, 4, sword);
    const short = select(s, [0, 1, 2]); expect(short.chain.ignored).toEqual([1]); expect(short.preview.effectiveLength).toBe(2);
    expect(step(short, { type: 'CommitChain' }).state.phase).toBe('input');
    const long = select(s, [0, 1, 2, 3, 4]); expect(long.preview.effectiveLength).toBe(4);
    const result = step(long, { type: 'CommitChain' });
    expect(result.events.some(e => e.type === 'TileMatched' && e.slot === 1)).toBe(false);
    expect(result.state.pending.filter(e => e.kind === 'resource' && e.tileType === coin)).toEqual([]);
  });
  test('C06 living Lich matches swords; phylactery matches gold, not ordinary swords', () => {
    const s = fixture(); tile(s, 0, sword); tile(s, 1, skull, { enemyType: enemyId('LICH'), statsStatus: 'special' });
    tile(s, 2, skull, { enemyType: enemyId('LICH'), statsStatus: 'special', countdown: 1 });
    expect(canMatchType(s, 1, [0])).toBe(true); expect(canMatchType(s, 2, [0])).toBe(false);
    expect(canMatchType(s, 2, [3])).toBe(true); expect(canMatchType(s, 3, [2])).toBe(true); expect(canMatchType(s, 0, [2])).toBe(false);
  });
  test('C07 Cocky exactly three gold clears without reward and still takes turn', () => {
    const s = fixture(); s.character.flaws[0] = enumValue('FlawType', 'FLAW_COCKY');
    const committed = step(select(s, [0, 1, 2]), { type: 'CommitChain' });
    expect(committed.events.filter(e => e.type === 'TileMatched')).toHaveLength(3); expect(committed.state.pending).toEqual([]);
    expect(settle(committed.state).state.turn).toBe(1);
  });
  test('C08 Cocky three-node combat still awards kill XP', () => {
    const s = fixture(); s.character.flaws[0] = enumValue('FlawType', 'FLAW_COCKY');
    tile(s, 0, sword); tile(s, 1, sword); tile(s, 2, skull, { health: 1 });
    const r = step(select(s, [0, 1, 2]), { type: 'CommitChain' });
    expect(r.state.kills).toEqual({ total: 1, thisAttack: 1 }); expect(r.state.pending).toMatchObject([{ kind: 'resource', tileType: skull }]);
  });
  function damageFixture() {
    const s = fixture(); tile(s, 0, sword); tile(s, 1, sword, { magicSword: true }); tile(s, 2, skull); tile(s, 3, skull);
    return select(s, [0, 1, 2, 3]);
  }
  test('C09 B3/W2 normal+magic sword D15 hits EACH enemy for 15', () => {
    const s = damageFixture(); expect(s.preview.damage).toBe(15); expect(s.preview.enemies.map(e => e.healthLoss)).toEqual([15, 15]);
    const r = step(s, { type: 'CommitChain' }); expect(r.state.board.filter(t => t.type === skull && !t.newThisTurn).map(t => t.health)).toEqual([5, 5]);
  });
  test('C10 BoostDamage doubles only swords: D27', () => {
    const s = damageFixture(); s.current.swordBoost = true; updatePreview(s); expect(s.preview.damage).toBe(27);
  });
  test('C11 broken sword adds zero; skull still adds B3, two tiles cannot commit', () => {
    const s = fixture(); tile(s, 0, sword, { broken: true }); tile(s, 1, skull);
    const selected = select(s, [0, 1]); expect(selected.preview.damage).toBe(3); expect(selected.preview.valid).toBe(false);
    expect(step(selected, { type: 'CommitChain' }).state.turn).toBe(0);
  });
  test('C12 defence5 absorbs d7 before five failed armour draws; H20→18', () => {
    const s = fixture(); const t = tile(s, 0, skull, { defence: 5 }); const c = context([100, 100, 100, 100, 100]);
    attackSkull(s, 0, 7, true, c); expect(t.health).toBe(18); expect(t.defence).toBe(5); expect(c.rng.calls).toHaveLength(5);
  });
  test('C13 pierce <50, draws49/50/100: three draws, only one break, no HP loss', () => {
    const s = fixture(); const t = tile(s, 0, skull, { defence: 5 }); const c = context([49, 50, 100]);
    attackSkull(s, 0, 3, true, c); expect(t.health).toBe(20); expect(t.defence).toBe(4);
    expect(c.rng.calls).toEqual(Array(3).fill({ a: 0, b: 100, lane: RandType.RAND_OTHER }));
  });
  test('C14 lethal hit returns before poison, pierce or Orc freeze draws', () => {
    const s = fixture(); s.character.race = enumValue('RaceType', 'RACE_ORC'); s.equipmentStats.poison = 2;
    const t = tile(s, 0, skull, { health: 1 }); const c = context();
    expect(attackSkull(s, 0, 1, true, c)).toBe(true); expect(t.poison).toEqual([0, 0, 0]); expect(c.rng.calls).toEqual([]);
    expect(s.kills.total).toBe(1); expect(s.pending).toHaveLength(1);
  });
  test('C15 zero direct damage still adds poison2 to all three slots', () => {
    const s = fixture(); s.equipmentStats.poison = 2; const t = tile(s, 0, skull, { defence: 5, health: 10 });
    attackSkull(s, 0, 0, true, context()); expect(t.health).toBe(10); expect(t.poison).toEqual([2, 2, 2]);
  });
  test('C16 D15 leech20% heals3 on arrival even when enemy armour100 absorbs all damage', () => {
    let s = damageFixture(); s.health = 10; s.equipmentStats.leechPercent = 20; s.board[2]!.defence = s.board[3]!.defence = 100;
    updatePreview(s); expect(s.preview.leech).toBe(3); expect(s.preview.enemies.every(e => e.healthLoss === 0)).toBe(true);
    s = step(s, { type: 'CommitChain' }).state; expect(s.health).toBe(10);
    s = step(s, { type: 'ConsumeEffect', id: s.pending.find(e => e.kind === 'healing')!.id }).state; expect(s.health).toBe(13);
  });
  test('C17 aggregate8 against armour5 loses3 HP, then three breaks leave armour2', () => {
    const s = fixture(); s.armour = s.equipmentStats.maxArmour = 5; tile(s, 0, skull, { attack: 3 }); tile(s, 1, skull, { attack: 5 });
    processAttack(s, context([0, 49, 10, 50, 100])); expect(s.health).toBe(47); expect(s.armour).toBe(2);
  });
  test('C18 completely blocked poisonous2 preserves old poison4', () => {
    const s = fixture(); s.playerPoison = 4; tile(s, 0, skull, { attack: 2, enemyType: enemyId('POISONOUS'), statsStatus: 'special' });
    processAttack(s, context([100, 100])); expect(s.playerPoison).toBe(4); expect(s.incomingPoison).toBe(0); expect(s.health).toBe(50);
  });
  test('C19 poisonous7 penetrating armour replaces poison4 with7, not11', () => {
    const s = fixture(); s.playerPoison = 4; s.armour = 0; tile(s, 0, skull, { attack: 7, enemyType: enemyId('POISONOUS'), statsStatus: 'special' });
    processAttack(s, context()); expect(s.playerPoison).toBe(7); expect(s.health).toBe(43);
  });
  test('C20 repair3 at armour3/5 discards overflow; second shield adds UP2', () => {
    const s = fixture(); s.armour = 3; s.equipmentStats.maxArmour = 5; s.base.repair = 3; const c = context();
    addResource(s, token(shield), c); expect(s.armour).toBe(5); expect(s.resources.upgrade.remainder).toBe(0);
    addResource(s, token(shield), c); expect(s.resources.upgrade.remainder).toBe(2);
  });
  test('C21 four XP tokens at bonus.25 total9 with carry0', () => {
    const s = fixture(); s.resources.xp.bonus = .25;
    const totals: number[] = []; for (let i = 0; i < 4; i++) { addResource(s, token(skull), context()); totals.push(s.resources.xp.remainder); }
    expect(totals).toEqual([2, 4, 6, 9]); expect(s.resources.xp.carry).toBe(0);
  });
  test('C22 XP98 crosses once: bank100, level2, menu level, base stats unchanged', () => {
    const s = fixture(); s.resources.xp.remainder = 98; const before = structuredClone(s.base);
    addResource(s, token(skull), { rng: new NativeRng(s.rng), events: [] }); expect(s.resources.xp).toMatchObject({ remainder: 0, banked: 100 }); expect(s.level).toBe(2);
    expect(s.menus.map(m => m.kind)).toEqual(['level']); expect(s.phase).toBe('menu'); expect(s.base).toEqual(before);
  });
  test('C23 gold98/UP98 each queues correct menu and banks100', () => {
    const s = fixture(); s.resources.gold.remainder = s.resources.upgrade.remainder = 98;
    addResource(s, token(coin), { rng: new NativeRng(s.rng), events: [] }); addResource(s, token(shield), { rng: new NativeRng(s.rng), events: [] });
    expect(s.menus.map(m => m.kind)).toEqual(['shop', 'upgrade']); expect(s.resources.gold.banked).toBe(100); expect(s.resources.upgrade.banked).toBe(100);
    expect(s.resources.gold.remainder).toBe(0); expect(s.resources.upgrade.remainder).toBe(0);
  });
  test('C24 exceptional carry250 crosses twice but single if banks only100 and one menu', () => {
    const s = fixture(); s.resources.xp.carry = 250; addResource(s, token(skull), { rng: new NativeRng(s.rng), events: [] });
    expect(s.resources.xp).toMatchObject({ remainder: 52, banked: 100, carry: 0 }); expect(s.menus).toHaveLength(1); expect(s.level).toBe(2);
  });
  test('C25 fourth same-type tile draws <=20 and creates one extra token; first three never draw', () => {
    const s = fixture(), c = context([20]); for (let i = 0; i < 3; i++) matchTile(s, i, c);
    expect(c.rng.calls).toEqual([]); expect(s.pending).toHaveLength(3);
    matchTile(s, 3, c); expect(s.pending).toHaveLength(5); expect(c.rng.calls).toEqual([{ a: 1, b: 100, lane: RandType.RAND_OTHER }]);
  });
  test('C26 Daring uses per-type count5, not mixed chain length10', () => {
    const s = fixture(); s.character.perks[0] = enumValue('PerkType', 'PERK_DARING'); s.chain.nodes = Array.from({ length: 10 }, (_, i) => i);
    s.collectedByType[coin] = 4; const c = context([21]); matchTile(s, 0, c); expect(s.pending).toHaveLength(1);
    s.collectedByType[coin] = 9; const d = context([100]); matchTile(s, 1, d); expect(s.pending).toHaveLength(3);
  });
  test('C27 CountAttackers excludes frozen/new/zero attack and accepts old ordinary skull', () => {
    const s = fixture(); tile(s, 0, skull, { frozen: true }); tile(s, 1, skull, { newThisTurn: true }); tile(s, 2, skull); tile(s, 3, skull, { attack: 0 });
    expect(countAttackers(s)).toBe(1);
  });
  test('C28 regeneration3 then poison4: HP10→13→9', () => {
    const s = fixture(); s.health = 10; s.base.maxHealth = 20; s.equipmentStats.maxHealth = 0; s.equipmentStats.regeneration = 3; s.playerPoison = 4;
    const c = context(); playerEndTurn(s, c); expect(s.health).toBe(9);
    expect(c.events.filter(e => e.type === 'PlayerHealth').map(e => e.after)).toEqual([13, 9]);
  });
  test('C29 enemy poison[2,3,4] damages2 and shifts to[3,4,0]', () => {
    const s = fixture(); const t = tile(s, 0, skull, { poison: [2, 3, 4] }); enemyPoison(s, context());
    expect(t.health).toBe(18); expect(t.poison).toEqual([3, 4, 0]);
  });
  test('C30 Mage blocks natural charge4/CD10 but still deactivates skill', () => {
    const s = fixture(); tile(s, 0, skull, { enemyType: enemyId('MAGE'), statsStatus: 'special' });
    s.skills[0] = { id: 2, level: 1, cooldown: 10, charge: 4, active: true }; s.selectedSkillCount = 1;
    endOfTurn(s, context()); expect(s.skills[0]).toMatchObject({ charge: 4, active: false }); expect(s.turn).toBe(1);
  });
});

test('input hit test uses centre circle radius .4 and does not select outside board', () => {
  expect(hitTile({ x: .5, y: .5 })).toEqual({ x: 0, y: 0 }); expect(hitTile({ x: .89, y: .5 })).toEqual({ x: 0, y: 0 });
  expect(hitTile({ x: .91, y: .5 })).toBeNull(); expect(hitTile({ x: .1, y: .1 })).toBeNull(); expect(hitTile({ x: -1, y: 0 })).toBeNull();
});
