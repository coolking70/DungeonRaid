import { explodeNeighbours, fleeingStab, specialRewards } from './specials';
import { flareDraw, flightDraw, labelDraw, particleDraws, tokenDraws } from './cosmetics';
import { enumValue, RandType, SpecialTileType, TileType, turnData } from './data';
import { isSprint, moveMatchedTiles, type BoardEvent, type BoardHooks } from './board';
import { fadd, fmul, fsub, floatToInt, iadd, imul, isub } from './num';
import type { RandomSource } from './rng';
import { emptyPreview, hasPerk, mortalEnemy, type ChainPreview, type DeathCause, type MenuState, type PendingEffect, type RunState, type Tile, type TurnPhase } from './state';

export type RuleEvent = BoardEvent
  | { type: 'EnemyAbility'; slot: number; enemyType: number }
  | { type: 'TrophyGenerated'; slot: number }
  | { type: 'NewGameStarted'; seed: number }
  | { type: 'PhaseChanged'; phase: TurnPhase }
  | { type: 'ChainPreview'; preview: ChainPreview }
  | { type: 'EffectQueued'; effect: PendingEffect }
  | { type: 'EffectConsumed'; id: number }
  | { type: 'MenuRequested'; menu: MenuState }
  | { type: 'MenuClosed'; id: number }
  | { type: 'TileMatched'; slot: number; rewarded: boolean }
  | { type: 'EnemyDamaged'; slot: number; healthLoss: number; armourLoss: number; killed: boolean }
  | { type: 'PlayerHealth'; before: number; after: number; source: string }
  | { type: 'EnemyAttack'; attack: number; blocked: number; damage: number; armourLoss: number }
  | { type: 'TurnEnded'; turn: number }
  | { type: 'GameOver'; outcome: NonNullable<RunState['outcome']>; health: number; resources: RunState['resources']; kills: number }
  | { type: 'CompatibilityNotice'; message: string };
export interface RuleHooks extends BoardHooks {
  /** T05: called at the native fixed-slot ability stage, including marked/new tiles. */
  activateAbility?: (state: RunState, slot: number, context: RuleContext) => void;
  /** T05: GetRewards, trophies, special kill passives; ordinary placeholders never call this. */
  specialRewards?: (state: RunState, slot: number, context: RuleContext) => void;
  /** T06: Halfling equipment growth on >=15 kills, ProcessInput @0x330c0. */
  progression?: (state: RunState, trigger: 'halfling-kills', context: RuleContext) => void;
}
export interface RuleContext { rng: RandomSource; events: RuleEvent[]; hooks?: RuleHooks }
export const enemyId = (name: string): number => enumValue('EnemyType', `ENEMY_${name}`);
export const raceIs = (s: RunState, name: string): boolean => s.character.race === enumValue('RaceType', `RACE_${name}`);
/** T04 placeholder is deliberately one replaceable policy, never a partial special multiplier. */
export function effectiveEnemy(s: RunState, t: Tile): number {
  if (t.statsStatus !== 'special-pending') return t.enemyType;
  if (s.options.specialPendingCombat === 'reject') throw new Error('T05: unresolved special enemy stats');
  return enemyId('NORMAL');
}
export const hasEnemy = (s: RunState, name: string): boolean => s.board.some(t => t.type === TileType.TILE_SKULL && effectiveEnemy(s, t) === enemyId(name));
export const isPhylactery = (s: RunState, t: Tile): boolean => t.type === TileType.TILE_SKULL && effectiveEnemy(s, t) === enemyId('LICH') && t.countdown !== 0;
export const maxHealth = (s: RunState): number => iadd(s.base.maxHealth, s.equipmentStats.maxHealth);
export function phase(s: RunState, value: TurnPhase, c: RuleContext): void {
  s.phase = value; s.inputReady = value === 'input'; c.events.push({ type: 'PhaseChanged', phase: value });
}
export function heal(s: RunState, amount: number, source: string, c: RuleContext): void {
  const before = s.health; s.health = Math.min(maxHealth(s), iadd(s.health, amount));
  c.events.push({ type: 'PlayerHealth', before, after: s.health, source });
}
export function hurt(s: RunState, amount: number, source: DeathCause, c: RuleContext): void {
  const before = s.health; s.health = Math.max(0, isub(s.health, amount));
  if (amount > 0) s.lastDamage = source;
  c.events.push({ type: 'PlayerHealth', before, after: s.health, source });
}
/** CheckEndGame @0x2f960. Terminal queues are explicitly discarded, never left consumable. */
export function checkEndGame(s: RunState, c: RuleContext): boolean {
  if (s.outcome) return true;
  if (!s.sprintWon && s.health > 0) return false;
  if (!s.sprintWon && s.current.lastStand) {
    heal(s, maxHealth(s), 'last-stand', c); labelDraw(c.rng, 28); s.current.lastStand = s.next.lastStand = false; return false;
  }
  s.outcome = { won: s.sprintWon, cause: s.sprintWon ? 'sprint' : s.lastDamage, turn: s.turn };
  s.pending = []; s.moving = []; s.menus = []; s.resumePhase = null; s.menuResumePhase = null;
  s.actionCommitted = false;
  for (const t of s.board) t.selected = false;
  s.chain.nodes = []; s.chain.ignored = []; s.preview = emptyPreview();
  phase(s, 'ended', c);
  c.events.push({ type: 'GameOver', outcome: { ...s.outcome }, health: s.health, resources: structuredClone(s.resources), kills: s.kills.total });
  return true;
}
type NewEffect = PendingEffect extends infer E ? E extends PendingEffect ? Omit<E, 'id'> : never : never;
export function enqueue(s: RunState, effect: NewEffect, c: RuleContext): void {
  const pending = { ...effect, id: s.nextEffectId++ } as PendingEffect;
  s.pending.push(pending); c.events.push({ type: 'EffectQueued', effect: structuredClone(pending) });
}
/** Token::InitialiseFromTile @0x653d0; GetSpecialTarget @0x4b254. No target means no token. */
export function initialiseToken(s: RunState, type: number, variant: number, c: RuleContext): { skillSlot: number | null } | null {
  let skillSlot: number | null = null;
  if (variant === 1) {
    const targets = s.skills.flatMap((skill, i) => skill && skill.id !== enumValue('SkillType', 'SKILL_MANA') && skill.charge !== skill.cooldown ? [i] : []);
    if (!targets.length) return null;
    skillSlot = targets[c.rng.randI(0, targets.length - 1, RandType.RAND_OTHER)]!;
  }
  tokenDraws(c.rng, type === TileType.TILE_SKULL && variant !== 3);
  return { skillSlot };
}
export function resourceToken(s: RunState, type: number, slot: number | null, c: RuleContext, variant = 0, amount = 0): void {
  const target = initialiseToken(s, type, variant, c);
  if (target) enqueue(s, { kind: 'resource', tileType: type, variant, skillSlot: target.skillSlot, targetSlot: slot, amount }, c);
}
/** MatchTile @0x2ac40. mode='none' corresponds to native TILE_NONE (7). */
export function matchTile(s: RunState, slot: number, c: RuleContext, mode: 'normal' | 'none' = 'normal'): void {
  const t = s.board[slot]!;
  if (t.matched) return;
  t.matched = true;
  if (mode === 'normal' && t.type < TileType.TILE_SPECIAL) s.collectedByType[t.type] = iadd(s.collectedByType[t.type]!, 1);
  const rewarded = mode === 'normal' && !t.broken && t.type !== TileType.TILE_SWORD && t.specialType === SpecialTileType.SPECIAL_TILE_NONE;
  c.events.push({ type: 'TileMatched', slot, rewarded });
  const kamikaze = t.type === TileType.TILE_SKULL && effectiveEnemy(s, t) === enemyId('KAMIKAZE');
  if (kamikaze) { particleDraws(c.rng, 'shatter'); explodeNeighbours(s, slot, c); }
  if (!rewarded) return;
  if (t.type === TileType.TILE_SKULL && !kamikaze) particleDraws(c.rng, 'shatter');
  if (t.type === TileType.TILE_SKULL && effectiveEnemy(s, t) !== enemyId('NORMAL')) {
    (c.hooks?.specialRewards ?? specialRewards)(s, slot, c); return;
  }
  if (t.type === TileType.TILE_POTION && t.explosive) {
    // MatchTile: x outer, y inner; recursive collection of non-skulls only.
    for (let x = Math.max(0, t.x - 1); x <= Math.min(5, t.x + 1); x++)
      for (let y = Math.max(0, t.y - 1); y <= Math.min(5, t.y + 1); y++) {
        const neighbour = s.board[y * 6 + x]!;
        if (neighbour.type === TileType.TILE_SKULL) {
          if (effectiveEnemy(s, neighbour) === enemyId('NORMAL')) flareDraw(c.rng);
        } else {
          if (neighbour.type !== TileType.TILE_POTION || !neighbour.explosive) flareDraw(c.rng);
          matchTile(s, y * 6 + x, c);
        }
      }
    flareDraw(c.rng);
    return;
  }
  if (t.type > TileType.TILE_SHIELD) return;
  resourceToken(s, t.type, slot, c, t.mana ? 1 : t.acid ? 2 : 0);
  if (t.type === TileType.TILE_POTION && (t.mana || t.acid)) return;
  const count = s.collectedByType[t.type]!;
  if (count < turnData.extraTokenStart) return;
  const key = (['potion', 'xp', 'coin', 'shield'] as const)[t.type]!;
  const chance = hasPerk(s, 'PERK_DARING') && count >= turnData.daringStart ? 100 : iadd(s.base.bonusToken[key], s.equipmentStats.bonusToken[key]);
  if (c.rng.randI(1, 100, RandType.RAND_OTHER) <= chance) { resourceToken(s, t.type, slot, c); labelDraw(c.rng, 0); }
}
/** GetAttack @0x62934, including Elf poison attack reduction. */
export function getAttack(s: RunState, t: Tile): number {
  return raceIs(s, 'ELF') && t.attack > 1 && t.poison[0] > 0 ? t.attack >> 1 : t.attack;
}
export function countAttackers(s: RunState): number {
  return s.board.filter(t => t.type === TileType.TILE_SKULL && !t.newThisTurn && !t.frozen && getAttack(s, t) > 0).length;
}
/** AttackSkull @0x2f630; draws are AFTER HP damage and absent on a kill. */
export function attackSkull(s: RunState, slot: number, damage: number, direct: boolean, c: RuleContext): boolean {
  const t = s.board[slot]!;
  if (isPhylactery(s, t)) return false;
  if (direct && s.current.steal) resourceToken(s, TileType.TILE_COIN, slot, c);
  const loss = Math.max(isub(damage, t.defence), 0);
  const hp = isub(t.health, loss);
  if (hp <= 0) {
    if (effectiveEnemy(s, t) === enemyId('LICH')) {
      t.countdown = 1; t.phylacteryDelayed = true; t.attack = t.defence = 0; t.health = 1; t.poison = [0, 0, 0]; flareDraw(c.rng);
      c.events.push({ type: 'EnemyDamaged', slot, healthLoss: loss, armourLoss: 0, killed: false }); return false;
    }
    s.kills.total = iadd(s.kills.total, 1); s.kills.thisAttack = iadd(s.kills.thisAttack, 1);
    s.chain.berserkHealing = iadd(s.chain.berserkHealing, getAttack(s, t));
    // Native leaves the old HP payload in a matched slot, until refill.
    matchTile(s, slot, c);
    c.events.push({ type: 'EnemyDamaged', slot, healthLoss: loss, armourLoss: 0, killed: true }); return true;
  }
  if (loss > 0) particleDraws(c.rng, 'sparks');
  t.health = hp;
  let armourLoss = 0;
  for (let n = Math.min(damage, t.defence); n > 0; n--)
    if (c.rng.randI(0, 100, RandType.RAND_OTHER) < s.equipmentStats.pierceThreshold) armourLoss++;
  if (armourLoss > 0) particleDraws(c.rng, 'sparks');
  t.defence = isub(t.defence, armourLoss);
  if (direct) {
    if (s.equipmentStats.poison > 0 && effectiveEnemy(s, t) !== enemyId('POISONOUS')) {
      t.poison = t.poison.map(p => iadd(p, s.equipmentStats.poison)) as Tile['poison']; labelDraw(c.rng, 6);
    }
    if (raceIs(s, 'ORC') && c.rng.randI(1, 100, RandType.RAND_OTHER) <= turnData.orcFreezeChance) {
      t.frozen = true; t.burning = false; t.fireDamage = 0; t.fireSafe = false;
    }
  }
  c.events.push({ type: 'EnemyDamaged', slot, healthLoss: loss, armourLoss, killed: false }); return false;
}
/** AddResource @0x32210. This mutating primitive is testable independently of arrival orchestration. */
export function addResource(s: RunState, effect: Extract<PendingEffect, { kind: 'resource' }>, c: RuleContext): void {
  const type = effect.tileType;
  const multiplier = isSprint(s) ? turnData.sprintMultiplier : 1;
  if (type === TileType.TILE_POTION) {
    if (effect.variant === 1 && effect.skillSlot !== null && s.skills[effect.skillSlot]) {
      const skill = s.skills[effect.skillSlot]!; skill.charge = Math.min(skill.cooldown, iadd(skill.charge, 1)); return;
    }
    if (effect.variant === 2) { hurt(s, iadd(s.base.healing, s.equipmentStats.healing), 'acid', c); checkEndGame(s, c); return; }
    heal(s, imul(iadd(s.base.healing, s.equipmentStats.healing), s.current.potionBoost ? turnData.boostMultiplier : 1), 'potion', c);
    if (mortalEnemy(s) !== enemyId('POISONOUS') || !hasEnemy(s, 'POISONOUS')) s.playerPoison = 0;
    return;
  }
  if (type === TileType.TILE_SKULL && effect.variant === 3) {
    hurt(s, effect.amount, 'thrown-skull', c); labelDraw(c.rng, 2);
    const borrowed = s.delayedLastStand && !s.current.lastStand;
    if (borrowed) s.current.lastStand = true;
    checkEndGame(s, c);
    if (borrowed) s.current.lastStand = false;
    return;
  }
  if (type === TileType.TILE_SHIELD && s.armour !== s.equipmentStats.maxArmour && !hasEnemy(s, 'CORROSIVE')) {
    s.armour = Math.min(s.equipmentStats.maxArmour, iadd(s.armour, imul(iadd(s.base.repair, s.equipmentStats.repair), s.current.shieldBoost ? turnData.boostMultiplier : 1))); return;
  }
  const key = type === TileType.TILE_SKULL ? 'xp' : type === TileType.TILE_COIN ? 'gold' : type === TileType.TILE_SHIELD ? 'upgrade' : null;
  if (!key) return;
  const bar = s.resources[key];
  const boost = (key === 'gold' && s.current.coinBoost) || (key === 'upgrade' && s.current.shieldBoost) ? turnData.boostMultiplier : 1;
  bar.remainder = iadd(bar.remainder, imul(imul(turnData.tokenValue, multiplier), boost));
  bar.carry = fadd(bar.carry, fmul(fmul(multiplier, bar.bonus), boost));
  if (bar.carry >= 1) { const whole = floatToInt(bar.carry); bar.remainder = iadd(bar.remainder, whole); bar.carry = fsub(bar.carry, whole); }
  if (bar.remainder >= turnData.barThreshold) {
    bar.banked = iadd(bar.banked, turnData.barThreshold);
    if (key === 'xp') s.level = iadd(s.level, 1);
    const menu: MenuState = { id: s.nextEffectId++, kind: key === 'xp' ? 'level' : key === 'gold' ? 'shop' : 'upgrade', selected: [], candidates: [] };
    s.menus.push(menu); c.events.push({ type: 'MenuRequested', menu: structuredClone(menu) });
    bar.remainder %= turnData.barThreshold;
    if (s.phase !== 'menu') { s.menuResumePhase = s.phase; phase(s, 'menu', c); }
    if (key === 'xp' && raceIs(s, 'FAUN')) {
      // Healing @0x28c0c raises HP to trunc(maxHP*.25), not +25% or a potion.
      const floor = fmul(maxHealth(s), turnData.faunHealthFloor);
      if (s.health < floor) heal(s, isub(floatToInt(floor), s.health), 'faun-level', c);
    }
  }
}
export function* columnSlots(): Generator<number> {
  for (let x = 0; x < 6; x++) for (let y = 0; y < 6; y++) yield y * 6 + x;
}
export function refill(s: RunState, c: RuleContext): void {
  moveMatchedTiles(s, c.rng, c.events, { ...c.hooks, fleeingFell: (state, slot) => {
    if (state.board[slot]!.statsStatus === 'special-pending' && state.options.specialPendingCombat === 'ordinary-placeholder') return;
    if (c.hooks?.fleeingFell) c.hooks.fleeingFell(state, slot);
    else fleeingStab(state, slot, c);
  } });
}
/** ProcessAttack @0x311b8: armour snapshot absorbs the entire volley before durability. */
export function processAttack(s: RunState, c: RuleContext): void {
  const attackers = s.board.filter(t => t.type === TileType.TILE_SKULL && !t.newThisTurn && !t.frozen && getAttack(s, t) > 0);
  const attack = attackers.reduce((sum, t) => iadd(sum, getAttack(s, t)), 0);
  s.chain.enemyAttack = attack;
  s.incomingPoison = attackers.reduce((sum, t) => effectiveEnemy(s, t) === enemyId('POISONOUS') ? iadd(sum, getAttack(s, t)) : sum, 0);
  // InitialiseFlares also draws eyes for eligible zero-attack skulls (CountAttackers only gates entry).
  for (const t of s.board) if (t.type === TileType.TILE_SKULL && !t.newThisTurn && !t.frozen && !isPhylactery(s, t)) { flareDraw(c.rng); flareDraw(c.rng); }
  if (s.counterattack) {
    s.collectedByType.fill(0);
    for (const slot of columnSlots()) { const t = s.board[slot]!; if (t.type === TileType.TILE_SKULL && !t.newThisTurn) { labelDraw(c.rng, 2); attackSkull(s, slot, getAttack(s, t), false, c); } }
    refill(s, c); if (s.outcome) return; s.board.forEach(t => { t.newThisTurn = false; }); return;
  }
  const blocked = Math.min(attack, s.armour), damage = Math.max(0, isub(attack, s.armour));
  let armourLoss = 0;
  const hadArmour = s.armour > 0;
  flightDraw(c.rng, hadArmour);
  if (hadArmour) {
    flightDraw(c.rng); labelDraw(c.rng, 2);
    if (damage === 0 && s.incomingPoison > 0) labelDraw(c.rng, 7);
    const defiler = hasEnemy(s, 'DEFILER');
    for (let i = 0; i < blocked; i++) if (defiler || c.rng.randI(0, 100, RandType.RAND_OTHER) < s.equipmentStats.breakThreshold) armourLoss++;
    s.armour = isub(s.armour, armourLoss);
    // Native weaken/spikes live inside the armour stage, even if all damage is blocked.
    if (s.equipmentStats.weaken > 0) for (const slot of columnSlots()) {
      const t = s.board[slot]!;
      if (t.type === TileType.TILE_SKULL && !t.newThisTurn && t.attack > 1) { t.attack = Math.max(1, isub(t.attack, s.equipmentStats.weaken)); labelDraw(c.rng, 4); particleDraws(c.rng, 'sparks'); }
    }
    if (s.equipmentStats.spikes > 0) {
      s.collectedByType.fill(0);
      for (const slot of columnSlots()) { const t = s.board[slot]!; if (t.type === TileType.TILE_SKULL && !t.newThisTurn) { labelDraw(c.rng, 5); attackSkull(s, slot, s.equipmentStats.spikes, false, c); } }
      refill(s, c); if (s.outcome) return; s.board.forEach(t => { t.newThisTurn = false; });
    }
  }
  if (damage > 0) {
    labelDraw(c.rng, 2);
    if (s.incomingPoison > 0) labelDraw(c.rng, 7);
    s.playerPoison = Math.max(s.playerPoison, s.incomingPoison);
    // ProcessVampires @0x2d18c occurs after spikes/refill, before player HP loss.
    for (const slot of columnSlots()) {
      const t = s.board[slot]!;
      if (t.type !== TileType.TILE_SKULL || t.matched || effectiveEnemy(s, t) !== enemyId('VAMPIRE')) continue;
      if (mortalEnemy(s) !== enemyId('VAMPIRE') && t.health >= t.maxHealth) continue;
      const hp = iadd(t.health, getAttack(s, t));
      if (mortalEnemy(s) === enemyId('VAMPIRE')) { t.health = hp; t.maxHealth = Math.max(hp, t.maxHealth); }
      else t.health = Math.min(t.maxHealth, hp);
      labelDraw(c.rng, 26);
    }
    hurt(s, damage, 'enemy-attack', c);
  }
  s.incomingPoison = 0;
  c.events.push({ type: 'EnemyAttack', attack, blocked, damage, armourLoss });
  // Death check is at EndOfTurn entry, AFTER turn++, not here.
}
