import { generateStats, isSprint, randomiseTile, setTileType, swapTiles } from './board';
import { checkEndGame, columnSlots, enemyId, getAttack, hurt, initialiseToken, matchTile, raceIs, refill, resourceToken, type RuleContext } from './combat';
import { flareDraw, labelDraw, tokenDraws } from './cosmetics';
import { Difficulty, RandType, specialData, SpecialTileType, TileType } from './data';
import { downgradeStep, updateEquipmentStats } from './equipment';
import { iadd, idiv, imul, isub } from './num';
import { mortalEnemy, type RunState, type Tile } from './state';

const skull = (t: Tile) => t.type === TileType.TILE_SKULL;
const normal = (t: Tile) => !skull(t) || t.enemyType === enemyId('NORMAL');
const queue = (s: RunState, id: number, progress = 100) => s.achievementQueue.push({ id, progress });
const candidates = (s: RunState, predicate: (t: Tile, slot: number) => boolean) => s.board.flatMap((t, i) => predicate(t, i) ? [i] : []);
/** std::set<Tile*> is ascending physical slot. Remove BEFORE visiting another target. */
function take(pool: number[], c: RuleContext): number | undefined {
  if (!pool.length) return undefined;
  const index = c.rng.randI(0, pool.length - 1, RandType.RAND_OTHER);
  // RandI's native extreme upper overflow is not clamped or resampled.
  return pool.splice(index, 1)[0];
}
function upToTwo(pool: number[], c: RuleContext, action: (slot: number) => void): void {
  for (let i = 0; i < 2 && pool.length; i++) { const slot = take(pool, c); if (slot !== undefined) action(slot); }
}
export function* neighbours(s: RunState, slot: number): Generator<number> {
  const t = s.board[slot]!;
  for (let x = Math.max(0, t.x - 1); x <= Math.min(5, t.x + 1); x++)
    for (let y = Math.max(0, t.y - 1); y <= Math.min(5, t.y + 1); y++) if (y * 6 + x !== slot) yield y * 6 + x;
}
/** MatchTile @0x2ac40: Kamikaze explosion runs even when mode=TILE_NONE. */
export function explodeNeighbours(s: RunState, slot: number, c: RuleContext): void {
  for (const n of neighbours(s, slot)) {
    const t = s.board[n]!;
    if (skull(t)) { if (t.enemyType === enemyId('NORMAL')) flareDraw(c.rng); }
    else {
      if (t.type !== TileType.TILE_POTION || !t.explosive) flareDraw(c.rng);
      matchTile(s, n, c);
    }
  }
  flareDraw(c.rng);
}
/** Stab @0x2fcd8, separate from Assassin's doubled, deferred death check. */
export function fleeingStab(s: RunState, slot: number, c: RuleContext): void {
  labelDraw(c.rng, 0x13); hurt(s, getAttack(s, s.board[slot]!), 'fleeing', c); labelDraw(c.rng, 2); checkEndGame(s, c);
}
/** Tile::ActivateAbility @0x64c78. No global matched/new/frozen eligibility filter. */
export function activateAbility(s: RunState, slot: number, c: RuleContext): void {
  const t = s.board[slot]!;
  if (t.abilityUsed) return;
  t.abilityUsed = true;
  c.events.push({ type: 'EnemyAbility', slot, enemyType: t.enemyType });
  const is = (name: string) => t.enemyType === enemyId(name);
  if (is('GOLDEN')) {
    if ((t.countdown = isub(t.countdown, 1)) === 0) {
      flareDraw(c.rng); matchTile(s, slot, c, 'none'); refill(s, c); s.board.forEach(t => { t.newThisTurn = false; });
    }
  } else if (is('HEALER')) { // HealOrBless @0x34740 / @0x34614
    let pool = candidates(s, (other, i) => i !== slot && !other.matched && skull(other) && other.health < other.maxHealth);
    const healing = pool.length > 0;
    if (!healing) pool = candidates(s, (other, i) => i !== slot && !other.matched && skull(other));
    upToTwo(pool, c, n => { const other = s.board[n]!; if (healing) other.health = other.maxHealth; else other.attack = iadd(other.attack, 1); labelDraw(c.rng, healing ? 0xc : 0xb); flareDraw(c.rng); });
  } else if (is('ACIDIC') || is('OVERSEER')) { // @0x2ea40 / @0x2eb4c: unconditional draw; column scan; no matched check!
    const acid = is('ACIDIC');
    const pool = [...columnSlots()].filter(n => { const other = s.board[n]!; return acid ? other.type === TileType.TILE_POTION && !other.mana && !other.acid && !other.explosive : other.type === TileType.TILE_SWORD; });
    const index = c.rng.randI(0, pool.length - 1, RandType.RAND_OTHER);
    if (pool.length) labelDraw(c.rng, acid ? 0xe : 0x12);
    const n = pool[index];
    if (n !== undefined) {
      if (acid) s.board[n]!.acid = true;
      else { setTileType(s, s.board[n]!, TileType.TILE_SKULL, c.rng, c.events, c.hooks); if (s.current.oneHealthSkulls) s.board[n]!.health = 1; }
      flareDraw(c.rng); if (!acid) labelDraw(c.rng, 0x12);
    }
  } else if (is('FLAMING')) { // IgniteTiles @0x29be0 / SetFlameVisibility @0x62de8
    for (const n of neighbours(s, slot)) {
      const other = s.board[n]!;
      if (other.matched || (skull(other) && other.enemyType === enemyId('FLAMING'))) continue;
      flareDraw(c.rng); other.fireDamage = other.burning ? iadd(other.fireDamage, getAttack(s, t)) : getAttack(s, t);
      other.burning = true; other.frozen = false; other.fireSafe = false;
    }
  } else if (is('FROZEN')) { // FreezeTiles @0x2e898
    upToTwo(candidates(s, other => !other.matched && normal(other) && !other.frozen), c, n => {
      Object.assign(s.board[n]!, { frozen: true, burning: false, fireDamage: 0, fireSafe: false }); flareDraw(c.rng);
    }); labelDraw(c.rng, 0x11);
  } else if (is('KAMIKAZE')) { // ExplodeEnemy @0x2b2e4
    if ((t.countdown = isub(t.countdown, 1)) === 0) { s.collectedByType.fill(0); matchTile(s, slot, c, 'none'); flareDraw(c.rng); hurt(s, s.health - Math.max(1, idiv(s.health, 2)), 'kamikaze', c); }
  } else if (is('THIEF')) { // StealGold @0x34a68 / @0x348e8
    const pool = candidates(s, other => !other.matched && other.type === TileType.TILE_COIN);
    if (pool.length) {
      labelDraw(c.rng, 0xd);
      upToTwo(pool, c, n => { s.board[n]!.matched = true; tokenDraws(c.rng, false); flareDraw(c.rng); });
    } else if (s.resources.gold.remainder > 0) {
      flareDraw(c.rng);
      for (let i = 0; i < 2 && s.resources.gold.remainder > 0; i++) {
        const source = s.board[0]!;
        const variant = source.type === TileType.TILE_POTION ? source.mana ? 1 : source.acid ? 2 : 0 : 0;
        initialiseToken(s, TileType.TILE_COIN, variant, c); s.resources.gold.remainder--;
        if (mortalEnemy(s) === enemyId('THIEF')) { initialiseToken(s, TileType.TILE_POTION, variant, c); hurt(s, getAttack(s, t), 'thief', c); }
      } labelDraw(c.rng, 0xd);
    }
  } else if (is('CHAOTIC')) { // JumpEnemy @0x2f370
    const n = take(candidates(s, (other, i) => i !== slot && !other.matched && normal(other)), c);
    if (n !== undefined) { swapTiles(s, n, slot, c.events); matchTile(s, slot, c, 'none'); flareDraw(c.rng); flareDraw(c.rng); labelDraw(c.rng, 0xf); }
  } else if (is('ASSASSIN')) { // StabAttack @0x2f250
    if (t.y === 5) { labelDraw(c.rng, 0x13); hurt(s, imul(getAttack(s, t), 2), 'assassin', c); labelDraw(c.rng, 2); }
    else if (mortalEnemy(s) === t.enemyType && normal(s.board[slot + 6]!)) matchTile(s, slot + 6, c, 'none');
  } else if (is('DOPPELGANGER')) { t.defence = s.armour; labelDraw(c.rng, 0x14); // MimicDefence @0x2e84c
  } else if (is('ALCHEMIST')) { // ConvertRandomTiles @0x2e6bc
    upToTwo(candidates(s, other => !other.matched && normal(other)), c, n => { randomiseTile(s, s.board[n]!, c.rng, c.events, c.hooks); flareDraw(c.rng); }); labelDraw(c.rng, 0x15);
  } else if (is('UNSTABLE')) { // TeleportEnemy @0x29ad8; refill deferred to EndOfTurn
    if ((t.countdown = isub(t.countdown, 1)) === 0) {
      for (const n of columnSlots()) if (!s.board[n]!.matched) { s.board[n]!.matched = true; flareDraw(c.rng); }
      s.filter.enabled = true; s.filter.excludeSwords = mortalEnemy(s) === enemyId('UNSTABLE');
      if (s.filter.excludeSwords) queue(s, 0x26);
    }
  } else if (is('TRAMPLING')) { // BreakRandomShieldSword @0x2e55c
    const n = take(candidates(s, other => !other.matched && !other.broken && (other.type === TileType.TILE_SHIELD || other.type === TileType.TILE_SWORD && !other.arrow)), c);
    if (n !== undefined) { s.board[n]!.broken = true; flareDraw(c.rng); labelDraw(c.rng, 0x16); }
  } else if (is('GREASY')) { // LowerSkulls @0x2f154, Thumb @0x1f17c includes y=0
    for (let x = 0; x < 6; x++) for (let y = 4; y >= 0; y--) {
      const n = y * 6 + x;
      if (n !== slot && skull(s.board[n]!) && !skull(s.board[n + 6]!)) { matchTile(s, n + 6, c, 'none'); flareDraw(c.rng); break; }
    } labelDraw(c.rng, 0x17);
  } else if (is('ALPHA') || is('MAGNETIC')) { // AttractSkulls @0x2e22c / AttractShieldsSwords @0x2defc
    const magnetic = is('MAGNETIC');
    const wanted = (other: Tile) => magnetic ? other.type === TileType.TILE_SWORD || other.type === TileType.TILE_SHIELD : skull(other);
    const near = new Set(neighbours(s, slot));
    const sources = candidates(s, (other, i) => i !== slot && !near.has(i) && !other.matched && wanted(other));
    const targets = candidates(s, (other, i) => near.has(i) && !other.matched && !wanted(other));
    const paired = sources.length && targets.length;
    while (sources.length && targets.length) {
      const from = take(sources, c), to = take(targets, c);
      if (from !== undefined && to !== undefined) { swapTiles(s, from, to, c.events); flareDraw(c.rng); flareDraw(c.rng); }
    }
    if (paired) labelDraw(c.rng, magnetic ? 0x19 : 0x18);
  } else if (is('BRUTE')) { // ThrowSkull @0x2eeb0: vector, COLUMN order unlike std::set
    const pool = [...columnSlots()].filter(n => { const other = s.board[n]!; return !other.matched && !other.newThisTurn && skull(other) && normal(other); });
    const n = take(pool, c);
    if (n !== undefined) { const hp = s.board[n]!.health; matchTile(s, n, c, 'none'); flareDraw(c.rng); resourceToken(s, TileType.TILE_SKULL, n, c, 3, hp); labelDraw(c.rng, 0x1f); }
  } else if (is('DEVOURER')) { // DestroyUpgrade @0x2ecb8; ReduceStat @0x4dbe0
    if ((t.countdown = isub(t.countdown, 1)) === 0) {
      const item = s.equipment[c.rng.randI(0, s.equipment.length - 1, RandType.RAND_OTHER)];
      if (!item) throw new RangeError('Native equipment index outside vector');
      const pool = item.stats.flatMap((v, i) => v > 0 ? [i] : []), stat = take(pool, c);
      if (stat !== undefined) { item.stats[stat] = Math.max(0, isub(item.stats[stat]!, downgradeStep(s, stat))); queue(s, 0x27); }
      labelDraw(c.rng, 0x20); updateEquipmentStats(s); t.countdown = specialData.countdown;
    }
  } else if (is('FLEEING')) { // FleeUp @0x2eda0
    labelDraw(c.rng, 0x25);
    if (t.y === 0) { matchTile(s, slot, c, 'none'); flareDraw(c.rng); }
    else { swapTiles(s, slot - 6, slot, c.events); flareDraw(c.rng); flareDraw(c.rng); }
  } else if (is('LICH') && t.countdown !== 0) {
    if (t.phylacteryDelayed) t.phylacteryDelayed = false;
    else { t.countdown = 0; generateStats(s, t, c.rng); flareDraw(c.rng); labelDraw(c.rng, 0x26); }
  }
}
/** GetRewards @0x646e4 returns an ordered list; native reverse bounds retained. */
export function getRewards(enemy: number, c: RuleContext): number[] {
  const r = (a: number, b: number) => c.rng.randI(a, b, RandType.RAND_TILE);
  let n = r(specialData.rewardCount[0]!, specialData.rewardCount[1]!);
  const rewards: number[] = [];
  const append = (type: number, count: number) => { for (let i = 0; i < count; i++) rewards.push(type); };
  if (enemy === enemyId('GOLDEN')) append(TileType.TILE_COIN, n);
  else {
    if (enemy === enemyId('HEALER') || enemy === enemyId('ARMOURED')) {
      const count = r(idiv(n, 4), idiv(n, 3)); n = isub(n, count);
      const coins = r(idiv(imul(n, 3), 4), idiv(n, 4));
      append(enemy === enemyId('HEALER') ? TileType.TILE_POTION : TileType.TILE_SHIELD, count);
      append(TileType.TILE_COIN, coins); append(TileType.TILE_SKULL, isub(n, coins));
    } else {
      const coins = r(idiv(imul(n, 3), 4), idiv(n, enemy === enemyId('THIEF') ? 2 : 3));
      append(TileType.TILE_COIN, coins); append(TileType.TILE_SKULL, isub(n, coins));
    }
  }
  return rewards;
}
/** MatchTile reward tail @0x2ac40. Trophy uses COSMETIC, then SetSpecialType→SetType draws appearance. */
export function specialRewards(s: RunState, slot: number, c: RuleContext): void {
  const t = s.board[slot]!;
  for (const type of getRewards(t.enemyType, c)) {
    // Native AddToken uses board[0] as source with a separate visual position override.
    const source = s.board[0]!;
    resourceToken(s, type, 0, c, source.type === TileType.TILE_POTION ? source.mana ? 1 : source.acid ? 2 : 0 : 0);
  }
  if (s.difficulty > Difficulty.DIFF_EASY) {
    if (!isSprint(s) || c.rng.randI(0, 100, RandType.RAND_COSMETIC) < 50) s.trophies.remaining = isub(s.trophies.remaining, 1);
    if (s.trophies.remaining < 1) {
      const eligible = s.character.classId !== 0 && s.classLevels[s.character.classId]! < 10 || s.classLevels.slice(1).some(level => level === 0);
      if (s.trophies.awarded < specialData.trophyLimit && eligible) {
        if (t.promotedBySkill) queue(s, 0x42);
        s.trophies.remaining = c.rng.randI(specialData.trophyInterval[0]!, specialData.trophyInterval[1]!, RandType.RAND_COSMETIC);
        s.trophies.awarded++;
        setTileType(s, t, TileType.TILE_SPECIAL, c.rng, c.events, c.hooks);
        t.specialType = SpecialTileType.SPECIAL_TILE_TROPHY; t.matched = false;
        c.events.push({ type: 'TrophyGenerated', slot });
      } else s.trophies.remaining = 0;
    }
  }
  queue(s, 0x2e, 1);
  // Native re-reads the tile AFTER SetSpecialType, which resets enemyType.
  if (t.enemyType === enemyId('CHAOTIC') && mortalEnemy(s) === t.enemyType) queue(s, 0x2a);
  else if (t.enemyType === enemyId('GOLDEN')) queue(s, 0x2c);
  if (raceIs(s, 'CHANGELING')) {
    queue(s, 0x37, 2); // Shapeshift @0x24f78: any equipped skill, including already charged.
    if (s.selectedSkillCount) {
      const skill = s.skills[c.rng.randI(0, s.selectedSkillCount - 1, RandType.RAND_OTHER)];
      if (!skill) throw new Error('Selected skill count does not match equipped skills');
      skill.charge = skill.cooldown;
    }
  }
}
