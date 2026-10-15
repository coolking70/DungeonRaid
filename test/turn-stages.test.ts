import { expect, test } from 'vitest';
import { canMatchType, updatePreview } from '../src/core/chain';
import { addResource, attackSkull, checkEndGame, enemyId, getAttack, matchTile, processAttack, resourceToken } from '../src/core/combat';
import { enumValue, GameMode, SpecialTileType, TileType } from '../src/core/data';
import { step } from '../src/core/engine';
import { endOfTurn } from '../src/core/turn';
import { context, fixture, select, settle, tile, token } from './turn-helpers';
const { TILE_SKULL: skull, TILE_SWORD: sword, TILE_POTION: potion, TILE_SHIELD: shield, TILE_COIN: coin } = TileType;

test('menu pauses remaining arrivals and resumes exact continuation; IDs cannot be consumed twice', () => {
  let s = fixture(); s.phase = 'arrivals'; s.resumePhase = 'end-turn'; s.actionCommitted = true;
  s.resources.xp.remainder = s.resources.gold.remainder = 98;
  s.pending = [token(skull, { id: 101 }), token(coin, { id: 102 }), token(potion, { id: 103 })]; s.nextEffectId = 104;
  s = step(s, { type: 'ConsumeEffect', id: 101 }).state;
  expect(s.phase).toBe('menu'); expect(s.turn).toBe(0); expect(s.pending.map(e => e.id)).toEqual([102, 103]);
  const before = structuredClone(s);
  expect(() => step(s, { type: 'ConsumeEffect', id: 102 })).toThrow('menu'); expect(() => step(s, { type: 'AdvancePhase' })).toThrow('menu'); expect(s).toEqual(before);
  expect(() => step(s, { type: 'ChooseMenuOption', menuId: 999, option: 'confirm' })).toThrow('queue order');
  s = step(s, { type: 'ConfirmMenu', menuId: 104 }).state;
  expect(s.phase).toBe('arrivals'); expect(s.resumePhase).toBe('end-turn');
  expect(() => step(s, { type: 'ConsumeEffect', id: 101 })).toThrow('consumed');
  s = step(s, { type: 'ConsumeEffect', id: 102 }).state; expect(s.menus[0]!.kind).toBe('shop');
  s = step(s, { type: 'ChooseMenuOption', menuId: 105, option: 'skip' }).state;
  expect(s.pending.map(e => e.id)).toEqual([103]);
  const result = settle(s); expect(result.state.turn).toBe(1); expect(result.state.phase).toBe('input');
  expect(result.state.pending).toEqual([]); expect(result.state.resumePhase).toBeNull();
});

test('C2 explicit arrival order distinguishes leech-before-damage from death-before-leech', () => {
  const s = fixture(); s.health = 2; s.phase = 'arrivals'; s.resumePhase = 'enemy-attack';
  s.pending = [{ id: 1, kind: 'healing', source: 'leech', amount: 3 }, { id: 2, kind: 'damage', source: 'spikes', amount: 4, targetSlot: null }];
  let healed = step(s, { type: 'ConsumeEffect', id: 1 }).state;
  healed = step(healed, { type: 'ConsumeEffect', id: 2 }).state; expect(healed.health).toBe(1); expect(healed.outcome).toBeNull();
  const died = step(s, { type: 'ConsumeEffect', id: 2 });
  expect(died.state.outcome).toMatchObject({ cause: 'spikes', won: false }); expect(died.state.pending).toEqual([]); expect(died.state.resumePhase).toBeNull();
  expect(died.events.filter(e => e.type === 'GameOver')).toHaveLength(1);
  expect(() => step(died.state, { type: 'ConsumeEffect', id: 1 })).toThrow('ended');
  s.options.arrivalOrder = 'reject-ambiguous'; expect(() => step(s, { type: 'ConsumeEffect', id: 1 })).toThrow('C2');
});

test('movement can complete before or after named arrivals but blocks enemy-attack advancement', () => {
  const s = step(select(fixture(), [0, 1, 2]), { type: 'CommitChain' }).state;
  expect(s.moving.length).toBeGreaterThan(0); expect(s.resumePhase).toBe('enemy-attack');
  const effect = s.pending[0]!; const r = step(s, { type: 'ConsumeEffect', id: effect.id }).state;
  expect(r.phase).toBe('falling'); expect(r.moving).toEqual(s.moving);
  const arrived = step(r, { type: 'AdvancePhase' }).state; expect(arrived.phase).toBe('arrivals'); expect(arrived.moving).toEqual([]);
  expect(() => step(arrived, { type: 'AdvancePhase' })).toThrow('Await');
});

test('input guards, cancelled preview, non-neighbour rejection and crossing diagonals', () => {
  let s = select(fixture(), [0, 35]); expect(s.chain.nodes).toEqual([0]);
  s = select(s, [7, 1, 6]); expect(s.chain.nodes).toEqual([0, 7, 1, 6]);
  const calls = s.rng.calls; s = step(s, { type: 'CancelChain' }).state;
  expect(s.rng.calls).toBe(calls); expect(s.board.some(t => t.selected)).toBe(false); expect(s.preview.resources).toEqual([0, 0, 0, 0, 0]);
  s.phase = 'enemy-attack'; expect(() => step(s, { type: 'SelectTile', at: { x: 0, y: 0 } })).toThrow('enemy-attack');
  expect(() => step(fixture(), { type: 'ExtendChain', at: { x: 6, y: 0 } })).toThrow('Invalid tile');
});

test('CanMatchType special Chain/Trophy and arrow strict priorities', () => {
  const s = fixture(); tile(s, 0, sword, { arrow: true }); tile(s, 1, potion);
  tile(s, 2, TileType.TILE_SPECIAL, { specialType: SpecialTileType.SPECIAL_TILE_CHAIN });
  tile(s, 3, TileType.TILE_SPECIAL, { specialType: SpecialTileType.SPECIAL_TILE_TROPHY });
  expect(canMatchType(s, 1, [0])).toBe(true); expect(canMatchType(s, 1, [0], true)).toBe(false);
  expect(canMatchType(s, 3, [])).toBe(true); expect(canMatchType(s, 3, [0])).toBe(false);
  expect(canMatchType(s, 1, [3])).toBe(false); expect(canMatchType(s, 2, [3])).toBe(true); expect(canMatchType(s, 1, [2])).toBe(true);
});

test('preview reports one Spiky D and selected fire sum, recalculated on backtrack without RNG', () => {
  const s = fixture(); tile(s, 0, sword, { burning: true, fireDamage: 2 });
  tile(s, 1, skull, { enemyType: enemyId('SPIKY'), statsStatus: 'special', burning: true, fireDamage: 3 });
  tile(s, 2, skull, { enemyType: enemyId('SPIKY'), statsStatus: 'special', burning: true, fireSafe: true, fireDamage: 99 });
  let r = select(s, [0, 1, 2]); expect(r.preview).toMatchObject({ damage: 5, spikes: 5, fire: 5 }); expect(r.rng).toEqual(s.rng);
  r = step(r, { type: 'Backtrack', at: { x: 0, y: 0 } }).state; expect(r.preview).toMatchObject({ damage: 2, spikes: 0, fire: 2 });
});

test('damage preview reports lethal enemies, Lich transformation and Armoured direction', () => {
  const s = fixture(); tile(s, 7, skull, { enemyType: enemyId('ARMOURED'), statsStatus: 'special', health: 1 });
  tile(s, 13, sword); tile(s, 1, sword);
  const up = select(s, [13, 7, 1]); expect(up.preview.enemies[0]).toMatchObject({ damage: 7, lethal: true });
  const down = select(s, [1, 7, 13]); expect(down.preview.enemies[0]).toMatchObject({ damage: 0, lethal: false });
  s.board[7]!.enemyType = enemyId('LICH'); const lich = select(s, [13, 7, 1]); expect(lich.preview.enemies[0]).toMatchObject({ lethal: false, transforms: true });
});

test('EndOfTurn order: turn, deactivate/flags, thaw/fire, regen/poison, enemy poison, abilities, LastStand, refill, late flags, timer', () => {
  const s = fixture(); s.turn = 8; s.health = 10; s.playerPoison = 4; s.equipmentStats.regeneration = 3;
  s.skills[0] = { id: 2, level: 1, cooldown: 10, charge: 4, active: true }; s.selectedSkillCount = 1;
  s.current.coinBoost = true; s.next.swordBoost = true; s.current.forceCoin = true; s.current.lastStand = true;
  s.current.oneHealthSkulls = true; s.promotion.remaining = 3;
  tile(s, 0, skull, { frozen: true, poison: [2, 3, 4] }); tile(s, 1, skull, { burning: true, fireDamage: 3 });
  tile(s, 2, skull, { enemyType: enemyId('MAGE'), statsStatus: 'special', newThisTurn: true });
  const c = context(); let observed = false;
  c.hooks = { activateAbility(state) {
    observed = true; expect(state.turn).toBe(9); expect(state.health).toBe(9); expect(state.skills[0]).toMatchObject({ charge: 4, active: false });
    expect(state.current.coinBoost).toBe(false); expect(state.current.swordBoost).toBe(true); expect(state.current.lastStand).toBe(true);
    expect(state.current.forceCoin).toBe(true); expect(state.current.oneHealthSkulls).toBe(true);
    expect(state.board[0]).toMatchObject({ frozen: false, health: 18, poison: [3, 4, 0] }); expect(state.board[1]).toMatchObject({ health: 17, burning: false });
    expect(state.board[2]!.newThisTurn).toBe(true); expect(state.promotion.remaining).toBe(3);
  } };
  endOfTurn(s, c); expect(observed).toBe(true); expect(s.current.lastStand).toBe(false); expect(s.delayedLastStand).toBe(true);
  expect(s.current.forceCoin).toBe(false); expect(s.current.oneHealthSkulls).toBe(false); expect(s.next.swordBoost).toBe(false);
  expect(s.promotion.remaining).toBe(2); expect(s.board.every(t => !t.newThisTurn)).toBe(true);
});

test('normal skill charges once, deactivates and clamps cooldown without Mage', () => {
  const s = fixture(); s.skills[0] = { id: 2, level: 1, cooldown: 5, charge: 4, active: true }; s.selectedSkillCount = 1;
  endOfTurn(s, context()); expect(s.skills[0]).toMatchObject({ charge: 5, active: false });
  endOfTurn(s, context()); expect(s.skills[0]!.charge).toBe(5);
});

test('S06 Sprint turn99 wins only at EndOfTurn tail, with final state event', () => {
  const s = fixture(); s.mode = GameMode.MODE_SPRINT; s.challenge = true; s.turn = 99; s.phase = 'end-turn'; s.promotion.remaining = 10;
  const r = step(s, { type: 'AdvancePhase' });
  expect(r.state.outcome).toEqual({ won: true, cause: 'sprint', turn: 100 }); expect(r.state.promotion.remaining).toBe(9);
  expect(r.state.phase).toBe('ended'); expect(r.events.at(-1)).toMatchObject({ type: 'GameOver', health: 50, kills: 0 });
});

test.each(['poison', 'enemy-attack'] as const)('S07 Sprint turn100 death from %s precedes victory flag', cause => {
  const s = fixture(); s.mode = GameMode.MODE_SPRINT; s.challenge = true; s.turn = 99; s.health = cause === 'poison' ? 2 : 0;
  s.playerPoison = cause === 'poison' ? 3 : 0; s.lastDamage = cause; s.phase = 'end-turn'; s.promotion.remaining = 10;
  const r = step(s, { type: 'AdvancePhase' }); expect(r.state.outcome).toEqual({ won: false, cause, turn: 100 });
  expect(r.state.sprintWon).toBe(false); expect(r.state.promotion.remaining).toBe(10);
});

test('LastStand rescues at zero before poison, clears both protection flags but retains poison', () => {
  const s = fixture(); s.health = 0; s.playerPoison = 4; s.current.lastStand = s.next.lastStand = true;
  const c = context(); expect(checkEndGame(s, c)).toBe(false); expect(s.health).toBe(50); expect(s.playerPoison).toBe(4);
  expect(s.current.lastStand || s.next.lastStand).toBe(false);
});

test('ordinary attacks may deal zero HP damage; Elf poison halves attack; Defiler skips RNG', () => {
  const s = fixture(); s.armour = 4; s.character.race = enumValue('RaceType', 'RACE_ELF');
  const t = tile(s, 0, skull, { attack: 7, poison: [1, 0, 0] }); expect(getAttack(s, t)).toBe(3);
  tile(s, 1, skull, { attack: 0, enemyType: enemyId('DEFILER'), statsStatus: 'special' });
  const c = context(); processAttack(s, c); expect(s.health).toBe(50); expect(s.armour).toBe(1); expect(c.rng.calls).toEqual([]);
});

test('weaken/spikes run in armour stage including frozen old skulls; zero armour skips them', () => {
  const s = fixture(); s.equipmentStats.weaken = 2; s.equipmentStats.spikes = 3;
  tile(s, 0, skull, { attack: 6, frozen: true }); tile(s, 1, skull, { attack: 2 });
  processAttack(s, context([100, 100])); expect(s.board[0]).toMatchObject({ attack: 4, health: 17 }); expect(s.board[1]).toMatchObject({ attack: 1, health: 17 });
  const naked = fixture(); naked.armour = 0; naked.equipmentStats.weaken = naked.equipmentStats.spikes = 2;
  tile(naked, 0, skull, { attack: 3 }); processAttack(naked, context()); expect(naked.board[0]).toMatchObject({ attack: 3, health: 20 });
});

test('Counterattack uses own GetAttack with defence and replaces ordinary volley', () => {
  const s = fixture(); s.counterattack = true; tile(s, 0, skull, { attack: 4, defence: 1 });
  processAttack(s, context([100])); expect(s.health).toBe(50); expect(s.armour).toBe(4); expect(s.board[0]!.health).toBe(17);
});

test('UnexpectED early grace skips ordinary volley but still advances turn and poison', () => {
  const s = fixture(); s.character.perks[0] = enumValue('PerkType', 'PERK_UNEXPECTED'); tile(s, 35, skull, { attack: 100 }); s.playerPoison = 2;
  const committed = step(select(s, [0, 1, 2]), { type: 'CommitChain' }).state;
  const r = settle(committed); expect(r.state.turn).toBe(1); expect(r.state.health).toBe(48); expect(r.events.some(e => e.type === 'EnemyAttack')).toBe(false);
});

test('mana token targets once at creation, excludes Mana/full skills; empty candidates never heal', () => {
  const s = fixture(); s.health = 10;
  s.skills[0] = { id: enumValue('SkillType', 'SKILL_MANA'), level: 1, cooldown: 10, charge: 1, active: false };
  const c = context(); resourceToken(s, potion, 0, c, 1); expect(s.pending).toEqual([]); expect(c.rng.calls).toEqual([]);
  s.skills[1] = { id: 2, level: 1, cooldown: 10, charge: 1, active: false };
  s.skills[2] = { id: 3, level: 1, cooldown: 10, charge: 10, active: false };
  const targeted = context([0]); resourceToken(s, potion, 0, targeted, 1); expect(s.pending[0]).toMatchObject({ skillSlot: 1 });
  s.phase = 'arrivals'; s.resumePhase = 'input'; const r = step(s, { type: 'ConsumeEffect', id: s.pending[0]!.id });
  expect(r.state.skills[1]!.charge).toBe(2); expect(r.state.health).toBe(10);
});

test('Sprint doubles resource base/carry and boosts multiply gold/UP, not repair/healing', () => {
  const s = fixture(); s.mode = GameMode.MODE_SPRINT; s.challenge = true; s.current.coinBoost = s.current.shieldBoost = s.current.potionBoost = true;
  s.resources.gold.bonus = .25; s.resources.upgrade.bonus = .25; s.resources.xp.bonus = .25;
  addResource(s, token(coin), context()); addResource(s, token(shield), context()); addResource(s, token(skull), context());
  expect(s.resources.gold.remainder).toBe(9); expect(s.resources.upgrade.remainder).toBe(9); expect(s.resources.xp).toMatchObject({ remainder: 4, carry: .5 });
  s.health = 10; s.armour = 0; addResource(s, token(potion), context()); addResource(s, token(shield), context());
  expect(s.health).toBe(12); expect(s.armour).toBe(2);
});

test('legacy special-pending rejects by default; ordinary compatibility requires explicit opt-in', () => {
  const s = fixture(); tile(s, 0, skull, { enemyType: enemyId('LICH'), statsStatus: 'special-pending', health: 1 });
  expect(() => attackSkull(s, 0, 1, true, context())).toThrow('T05');
  s.options.specialPendingCombat = 'ordinary-placeholder';
  attackSkull(s, 0, 1, true, context()); expect(s.board[0]!.matched).toBe(true); expect(s.pending).toHaveLength(1);
  const strict = fixture(); tile(strict, 0, skull, { enemyType: enemyId('LICH'), statsStatus: 'special-pending', health: 1 });
  strict.options.specialPendingCombat = 'reject'; expect(() => attackSkull(strict, 0, 1, true, context())).toThrow('T05');
});

test('poison death calls special reward hook directly; direct Lich death transforms without reward', () => {
  const s = fixture(); tile(s, 0, skull, { enemyType: enemyId('LICH'), statsStatus: 'special', health: 1, poison: [1, 0, 0] });
  s.current.forceCoin = true;
  const c = context(Array(6).fill(0)); let reward = false;
  c.hooks = { specialRewards(state, slot) { reward = true; expect(state.board[slot]!.countdown).toBe(0); }, activateAbility() {} };
  endOfTurn(s, c); expect(reward).toBe(true); expect(s.kills.total).toBe(0);
  const direct = fixture(); tile(direct, 0, skull, { enemyType: enemyId('LICH'), statsStatus: 'special', health: 1 });
  attackSkull(direct, 0, 5, true, context()); expect(direct.board[0]).toMatchObject({ health: 1, countdown: 1, phylacteryDelayed: true, attack: 0 }); expect(direct.pending).toEqual([]);
});

test('Faun level-up Healing raises low HP to truncated quarter max, without curing poison', () => {
  const s = fixture(); s.character.race = enumValue('RaceType', 'RACE_FAUN'); s.health = 2; s.playerPoison = 4;
  s.resources.xp.remainder = 98; addResource(s, token(skull), context());
  expect(s.health).toBe(12); expect(s.playerPoison).toBe(4); expect(s.phase).toBe('menu');
  const healthy = fixture(); healthy.character.race = s.character.race; healthy.health = 20; healthy.resources.xp.remainder = 98;
  addResource(healthy, token(skull), context()); expect(healthy.health).toBe(20);
});

test('Steal preview/commit awards gold even on zero-damage blocked direct attacks', () => {
  const s = fixture(); s.current.steal = true; tile(s, 0, sword); tile(s, 1, skull, { defence: 100 }); tile(s, 2, skull, { defence: 100 });
  const r = select(s, [0, 1, 2]); expect(r.preview.resources[coin]).toBe(2);
  const committed = step(r, { type: 'CommitChain' }); expect(committed.state.pending.filter(e => e.kind === 'resource' && e.tileType === coin)).toHaveLength(2);
});
