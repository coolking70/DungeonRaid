import { generateStats, setTileType, slotIndex, swapTiles } from './board';
import { attackSkull, columnSlots, enemyId, matchTile, phase, raceIs, refill, type RuleContext } from './combat';
import { flareDraw, labelDraw, particleDraws } from './cosmetics';
import { getNativeSkill, RandType, SpecialTileType, TileType } from './data';
import { iadd, imul } from './num';
import { hasPerk, mortalEnemy, type RunState, type SkillFlags, type SkillState, type Tile } from './state';
import { neighbours } from './specials';
import { requestMenu } from './menus';

const skull = (t: Tile) => t.type === TileType.TILE_SKULL;
const special = (t: Tile) => skull(t) && t.enemyType !== 0;
const ordinary = (t: Tile) => skull(t) && t.enemyType === 0;
const potion = (t: Tile) => t.type === TileType.TILE_POTION && !t.mana && !t.acid && !t.explosive;
const sword = (t: Tile) => t.type === TileType.TILE_SWORD && !t.magicSword && !t.arrow;
/** Skill::CanActivate @0x60100 checks targets, not charge or active. */
export function canActivate(s: RunState, id: number): boolean {
  getNativeSkill(id);
  const any = (predicate: (t: Tile) => boolean) => s.board.some(predicate);
  switch (id) {
    case 0: case 1: case 4: case 34: return any(skull);
    case 2: case 8: case 9: case 29: return any(potion);
    case 3: return any(t => t.type === TileType.TILE_SHIELD);
    case 5: case 14: case 23: return any(ordinary);
    case 6: case 13: return any(t => t.type === TileType.TILE_SWORD);
    case 12: case 15: case 32: return any(t => t.type === TileType.TILE_COIN);
    case 20: case 21: return any(special);
    case 25: case 31: return any(sword);
    case 27: return s.armour > 0 && any(skull);
    case 36: return any(ordinary) && any(t => t.type === TileType.TILE_COIN);
    default: return true;
  }
}
export function canCastSkill(s: RunState, slot: number): boolean {
  const skill = s.skills[slot];
  return s.phase === 'input' && !s.chain.nodes.length && !!skill && skill.charge === skill.cooldown && canActivate(s, skill.id);
}
function randomTarget(s: RunState, predicate: (t: Tile) => boolean, c: RuleContext): number | undefined {
  const pool = [...columnSlots()].filter(slot => predicate(s.board[slot]!));
  // Native helpers draw even for an empty target set (FireBreath in particular).
  return pool[c.rng.randI(0, pool.length - 1, RandType.RAND_OTHER)];
}
function finishCollection(s: RunState, c: RuleContext): void {
  refill(s, c);
  if (!s.actionCommitted) s.board.forEach(t => { t.newThisTurn = false; });
}
function checkShockAwe(s: RunState): void {
  if (s.combo.slashAchievement && s.combo.fireball && s.combo.charge && s.combo.collectBoard) s.achievementQueue.push({ id: 63, progress: 100 });
}
/** CollectBoard @0x30a2c. Keep 14dab set through the refill itself. */
export function collectBoard(s: RunState, c: RuleContext): void {
  s.combo.collectBoard = true; checkShockAwe(s);
  s.collectingBoard = true; s.collectedByType.fill(0);
  try {
    for (const slot of columnSlots()) if (!special(s.board[slot]!)) { matchTile(s, slot, c); flareDraw(c.rng); }
    finishCollection(s, c);
  } finally { s.collectingBoard = false; }
}
/** CreateChain @0x2a038 → SetSpecialType @0x65004 also consumes SetType's cosmetic draw. */
export function createChain(s: RunState, c: RuleContext): void {
  for (let n = 0; n < 10; n++) {
    const x = c.rng.randI(0, 5, RandType.RAND_OTHER), y = c.rng.randI(0, 5, RandType.RAND_OTHER);
    const tile = s.board[slotIndex(x, y)]!;
    if (special(tile)) continue;
    setTileType(s, tile, TileType.TILE_SPECIAL, c.rng, c.events, c.hooks);
    tile.specialType = SpecialTileType.SPECIAL_TILE_CHAIN; flareDraw(c.rng); return;
  }
}
/** FireBreath @0x29cfc. Negative empty-pool draw retained; damage excludes equipment. */
export function fireBreath(s: RunState, c: RuleContext): void {
  const slot = randomTarget(s, ordinary, c);
  if (slot === undefined) return;
  const t = s.board[slot]!; flareDraw(c.rng);
  t.fireDamage = t.burning ? iadd(t.fireDamage, s.base.damage) : s.base.damage;
  t.burning = true; t.frozen = false; t.fireSafe = true;
}
/** ProcessRune @0x2b560, literal row parity algorithm; preview includes special enemies. */
export function runeInterior(s: RunState): number[] {
  const nodes = s.chain.nodes;
  if (!s.current.rune || nodes.length <= 3) return [];
  const first = s.board[nodes[0]!]!, last = s.board[nodes[nodes.length - 1]!]!;
  if (Math.abs(first.x - last.x) > 1 || Math.abs(first.y - last.y) > 1) return [];
  const insideSlots: number[] = [];
  for (let y = 1; y < 5; y++) {
    let inside = false;
    for (let x = 0; x < 5; x++) {
      const slot = y * 6 + x, index = nodes.indexOf(slot);
      if (index >= 0) {
        const p = s.board[nodes[(index + nodes.length - 1) % nodes.length]!]!, n = s.board[nodes[(index + 1) % nodes.length]!]!;
        if (((n.y !== y || p.y !== y) || (x === n.x || x === p.x)) && (n.y < y || p.y < y) && (y <= n.y || y <= p.y)) inside = !inside;
      } else if (inside) {
        if (!nodes.some(n => s.board[n]!.y === y && s.board[n]!.x > x)) break;
        insideSlots.push(slot);
      }
    }
  }
  return insideSlots;
}
export function processRune(s: RunState, c: RuleContext): void {
  let count = 0;
  for (const slot of runeInterior(s)) if (!special(s.board[slot]!)) { matchTile(s, slot, c); count++; }
  if (count > s.chain.nodes.length - s.chain.ignored.length) s.achievementQueue.push({ id: 58, progress: 100 });
}
/** Skill::Activate @0x60210. Source-specific input handling is separate below. */
export function activateSkill(s: RunState, skill: SkillState, c: RuleContext): void {
  getNativeSkill(skill.id);
  const flags: Partial<Record<number, keyof SkillFlags>> = { 0: 'steal', 16: 'swordBoost', 17: 'coinBoost', 18: 'potionBoost', 19: 'shieldBoost', 22: 'oneHealthSkulls', 24: 'forceCoin', 34: 'berserk', 35: 'rune', 37: 'lastStand' };
  const flag = flags[skill.id];
  if (flag) { s.current[flag] = true; s.next[flag] = s.actionCommitted; skill.active = true; return; }
  const collect = (slots: Iterable<number>, ignoreAcid = false, flares = true) => {
    s.collectedByType.fill(0);
    for (const slot of slots) if (!special(s.board[slot]!)) {
      const t = s.board[slot]!;
      matchTile(s, slot, c, ignoreAcid && t.type === TileType.TILE_POTION && t.acid ? 'none' : 'normal');
      if (flares) flareDraw(c.rng);
    }
    finishCollection(s, c);
  };
  switch (skill.id) {
    case 1:
      for (const slot of columnSlots()) if (skull(s.board[slot]!)) { flareDraw(c.rng); Object.assign(s.board[slot]!, { frozen: true, burning: false, fireSafe: false, fireDamage: 0 }); }
      break;
    case 2: case 3: case 9: case 12: {
      s.collectedByType.fill(0);
      for (const slot of columnSlots()) {
        const t = s.board[slot]!;
        if (skill.id === 3 ? t.type === TileType.TILE_SHIELD : skill.id === 12 ? t.type === TileType.TILE_COIN : potion(t)) matchTile(s, slot, c, skill.id === 9 ? TileType.TILE_SKULL : 'normal');
      }
      finishCollection(s, c); break;
    }
    case 4: s.counterattack = true; skill.active = true; break;
    case 5:
      for (const slot of columnSlots()) { const t = s.board[slot]!; if (ordinary(t)) {
        if (t.defence > 0) { particleDraws(c.rng, 'shatter'); t.defence = 0; }
        if (t.attack > 1) { particleDraws(c.rng, 'shatter'); t.attack = 1; }
      } }
      break;
    case 6: case 13: case 14: case 15: case 32: {
      const from = skill.id === 14 ? TileType.TILE_SKULL : skill.id === 15 || skill.id === 32 ? TileType.TILE_COIN : TileType.TILE_SWORD;
      const to = skill.id === 6 ? TileType.TILE_COIN : skill.id === 13 ? TileType.TILE_SHIELD : skill.id === 32 ? TileType.TILE_SKULL : TileType.TILE_SWORD;
      // ConvertTiles is row-major, unlike the other collection helpers.
      for (const t of s.board) if (t.type === from && !special(t) && !(from === TileType.TILE_SWORD && t.arrow)) { setTileType(s, t, to, c.rng, c.events, c.hooks); flareDraw(c.rng); }
      if (skill.id === 32) s.combo.masochism = true;
      break;
    }
    case 7:
      s.collectedByType.fill(0);
      for (const slot of columnSlots()) { s.board[slot]!.matched = true; flareDraw(c.rng); }
      if (s.board.some(special)) s.achievementQueue.push({ id: 65, progress: 1 });
      s.filter.enabled = true;
      try { refill(s, c); } finally { s.filter.enabled = false; }
      s.board.forEach(t => { t.newThisTurn = false; }); break;
    case 8: case 29: case 31:
      for (const slot of columnSlots()) { const t = s.board[slot]!; if (skill.id === 31 ? sword(t) : potion(t)) {
        if (skill.id === 8) t.explosive = true; else if (skill.id === 29) t.mana = true; else t.arrow = true;
        flareDraw(c.rng);
      } } break;
    case 10: requestMenu(s, 'upgrade', c); break;
    case 11:
      s.combo.slashAchievement = true; checkShockAwe(s);
      if (s.combo.hack) { s.combo.hack = s.combo.slash = false; collectBoard(s, c); }
      else {
        s.combo.slash = true;
        const y = c.rng.randI(0, 5, RandType.RAND_OTHER), slots = Array.from({ length: 6 }, (_, x) => y * 6 + x);
        const count = slots.filter(slot => ordinary(s.board[slot]!)).length;
        collect(slots, true); if (count === 6) s.achievementQueue.push({ id: 60, progress: 100 });
      } break;
    case 20: case 21: {
      const slot = randomTarget(s, special, c);
      if (slot !== undefined) {
        const t = s.board[slot]!;
        if (skill.id === 20) { t.enemyType = 0; t.countdown = 0; t.statsStatus = 'ordinary'; }
        else matchTile(s, slot, c, 'none');
        flareDraw(c.rng);
      }
      if (skill.id === 21) finishCollection(s, c); break;
    }
    case 23: {
      const slot = randomTarget(s, ordinary, c);
      if (slot !== undefined) {
        const t = s.board[slot]!;
        s.promotion.allowReset = false;
        try {
          t.enemyType = c.rng.randI(1, 32, RandType.RAND_TILE);
          if (s.character.classId !== 0 && c.rng.randI(1, 200, RandType.RAND_TILE) <= (hasPerk(s, 'PERK_INTIMIDATING') ? 5 : 10)) t.enemyType = mortalEnemy(s);
          generateStats(s, t, c.rng); t.promotedBySkill = true;
        } finally { s.promotion.allowReset = true; }
        if (s.board.filter(special).length > 2) s.achievementQueue.push({ id: 41, progress: 100 });
        c.events.push({ type: 'SpecialEnemyGenerated', slot, enemyType: t.enemyType }); flareDraw(c.rng);
        // JumpDown @0x2d3cc always swaps with the bottom slot, including skulls.
        if (t.enemyType === enemyId('FLEEING')) {
          if (t.y !== 5) { swapTiles(s, slot, 30 + t.x, c.events); labelDraw(c.rng, 37); flareDraw(c.rng); }
        }
      } break;
    }
    case 25: { const slot = randomTarget(s, sword, c); if (slot !== undefined) { s.board[slot]!.magicSword = true; flareDraw(c.rng); } break; }
    case 26:
      for (const slot of columnSlots()) { const x = c.rng.randI(0, 5, RandType.RAND_OTHER), y = c.rng.randI(0, 5, RandType.RAND_OTHER); swapTiles(s, slot, slotIndex(x, y), c.events); flareDraw(c.rng); } break;
    case 27:
      s.collectedByType.fill(0);
      for (const slot of columnSlots()) if (skull(s.board[slot]!)) { flareDraw(c.rng); labelDraw(c.rng, 2); attackSkull(s, slot, imul(s.armour, 2), false, c); }
      finishCollection(s, c); break;
    case 28: {
      s.combo.fireball = true; checkShockAwe(s);
      const y = c.rng.randI(1, 4, RandType.RAND_OTHER), x = c.rng.randI(1, 4, RandType.RAND_OTHER);
      collect([...columnSlots()].filter(slot => Math.abs(s.board[slot]!.x - x) <= 1 && Math.abs(s.board[slot]!.y - y) <= 1), true); break;
    }
    case 30:
      if (s.combo.slash) { s.combo.hack = s.combo.slash = false; collectBoard(s, c); }
      else {
        s.combo.hack = true;
        const x = c.rng.randI(0, 5, RandType.RAND_OTHER);
        for (let y = 0; y < 6; y++) { const t = s.board[y * 6 + x]!; if (!special(t)) { setTileType(s, t, TileType.TILE_SWORD, c.rng, c.events, c.hooks); flareDraw(c.rng); } }
      } break;
    case 33: {
      if (s.board.filter(ordinary).length > 19) s.achievementQueue.push({ id: 64, progress: 100 });
      collectBoard(s, c);
      // RemoveSkill @0x24eec compacts slots; Token+98 remains the original slot index.
      const index = s.skills.indexOf(skill);
      if (index >= 0) {
        s.skills.splice(index, 1); s.skills.push(null); s.selectedSkillCount--;

      } break;
    }
    case 36: collect([...columnSlots()].filter(slot => ordinary(s.board[slot]!) && [...neighbours(s, slot)].some(n => s.board[n]!.type === TileType.TILE_COIN))); break;
    case 38:
      s.combo.charge = true; checkShockAwe(s);
      collect([...columnSlots()].filter(slot => { const t = s.board[slot]!; return t.x === 0 || t.x === 5 || t.y === 0 || t.y === 5; })); break;
    case 39: createChain(s, c); break;
    case 40: case 41: {
      const shock = skill.id === 40;
      s.combo[shock ? 'shock' : 'awe'] = true; s.collectedByType.fill(0);
      for (const slot of columnSlots()) {
        const t = s.board[slot]!;
        if (shock ? t.y >= 3 : t.y < 3) continue;
        if (t.type === TileType.TILE_SHIELD || t.type === (shock ? TileType.TILE_COIN : TileType.TILE_POTION)) matchTile(s, slot, c);
        flareDraw(c.rng);
      }
      refill(s, c);
      if (s.combo[shock ? 'awe' : 'shock']) createChain(s, c);
      if (!s.actionCommitted) s.board.forEach(t => { t.newThisTurn = false; }); break;
    }
    default: throw new Error(`Missing native skill branch ${skill.id}`);
  }
}
/** Manual input uses equipped slot; scroll input is the selected shop item's attached skill.
 * Purchases call activateScroll after SetItem/UpdateStats, never FireBreath. */
export function activateScroll(s: RunState, skill: SkillState, c: RuleContext): void {
  if (skill.charge !== skill.cooldown || !canActivate(s, skill.id)) throw new Error('Scroll cannot activate');
  activateSkill(s, skill, c); skill.charge = Math.min(0, skill.cooldown);
  c.events.push({ type: 'SkillCast', id: skill.id, source: 'scroll' });
}
export function castSkill(s: RunState, slot: number, c: RuleContext): void {
  if (!canCastSkill(s, slot)) throw new Error('Skill is not ready, has no target, or input is suspended');
  const skill = s.skills[slot]!;
  activateSkill(s, skill, c); skill.charge = Math.min(0, skill.cooldown);
  if (raceIs(s, 'DRAGONKIN') && !s.outcome) fireBreath(s, c);
  c.events.push({ type: 'SkillCast', id: skill.id, source: 'manual' });
  if (s.outcome) return;
  if (s.phase === 'input' && (s.pending.length || s.moving.length)) { s.resumePhase = 'input'; phase(s, s.moving.length ? 'falling' : 'arrivals', c); }
}
