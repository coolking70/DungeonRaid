import { processRune, runeInterior } from './skills';
import { increaseStat, updateEquipmentStats } from './equipment';
import { flightDraw, labelDraw } from './cosmetics';
import { slotIndex } from './board';
import { SpecialTileType, TileType, turnData } from './data';
import { fdiv, fmul, floatToInt, iadd, idiv, imul } from './num';
import { emptyPreview, hasFlaw, mortalEnemy, type Point, type RunState, type Tile } from './state';
import { attackSkull, columnSlots, effectiveEnemy, enemyId, enqueue, hasEnemy, heal, isPhylactery, matchTile, phase, raceIs, refill, type RuleContext } from './combat';

export const adjacent = (a: Point, b: Point): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;
/** Tile::IsBeingSelected @0x62fec: positions expressed in tile units, centres at x+.5/y+.5. */
export function hitTile(point: Point): Point | null {
  const x = Math.floor(point.x), y = Math.floor(point.y);
  if (x < 0 || x >= 6 || y < 0 || y >= 6) return null;
  return (point.x - x - .5) ** 2 + (point.y - y - .5) ** 2 <= turnData.hitRadius ** 2 ? { x, y } : null;
}
const arrow = (t: Tile): boolean => t.type === TileType.TILE_SWORD && t.arrow;
/** CanMatchType @0x645ac: priority matters, including Chain before previous Trophy. */
export function canMatchType(s: RunState, slot: number, nodes: readonly number[] = s.chain.nodes, strict = false): boolean {
  const t = s.board[slot];
  if (!t || t.matched || t.type === TileType.TILE_NONE || (t.frozen && t.type !== TileType.TILE_SKULL)) return false;
  if (!nodes.length) return true;
  if (t.specialType === SpecialTileType.SPECIAL_TILE_CHAIN) return true;
  if (t.specialType === SpecialTileType.SPECIAL_TILE_TROPHY) return false;
  const last = s.board[nodes[nodes.length - 1]!]!;
  if (!strict && arrow(last)) return true;
  if (last.specialType === SpecialTileType.SPECIAL_TILE_CHAIN) return true;
  if (last.specialType === SpecialTileType.SPECIAL_TILE_TROPHY) return false;
  const before = nodes.length > 1 ? s.board[nodes[nodes.length - 2]!]! : null;
  if (before && arrow(before)) return !isPhylactery(s, t) && (t.type === TileType.TILE_SWORD || t.type === TileType.TILE_SKULL);
  if (isPhylactery(s, t)) return last.type === TileType.TILE_COIN || isPhylactery(s, last);
  if (isPhylactery(s, last)) return t.type === TileType.TILE_COIN;
  return t.type === last.type || (t.type === TileType.TILE_SKULL && last.type === TileType.TILE_SWORD) || (t.type === TileType.TILE_SWORD && last.type === TileType.TILE_SKULL);
}
/** GetDamageType @0x644bc, expressed as damage passed to AttackSkull. */
export function chainDamageFor(s: RunState, slot: number, nodes: readonly number[], damage: number): number {
  const t = s.board[slot]!;
  if (t.type !== TileType.TILE_SKULL || isPhylactery(s, t)) return 0;
  if (s.turn < turnData.earlyTurns && hasFlaw(s, 'FLAW_CONFUSED')) return 0;
  const index = nodes.indexOf(slot);
  const previous = index > 0 ? s.board[nodes[index - 1]!] : undefined;
  const next = index >= 0 ? s.board[nodes[index + 1]!] : undefined;
  const enemy = effectiveEnemy(s, t);
  if (enemy === enemyId('ARMOURED')) return next && next.y < t.y ? damage : 0;
  if (raceIs(s, 'DWARF') && previous && next && previous.x === t.x && next.x === t.x && previous.y > t.y && t.y > next.y)
    return iadd(damage, s.equipmentStats.weaponDamage);
  if (enemy === enemyId('CHAOTIC') && mortalEnemy(s) === enemy) return 0;
  return enemy === enemyId('MEAT_SHIELD') || !hasEnemy(s, 'MEAT_SHIELD') ? damage : 0;
}
/** Recompute without RNG, including after truncating ANY suffix on backtrack. */
export function updatePreview(s: RunState, c?: RuleContext): void {
  const p = emptyPreview(), nodes = s.chain.nodes;
  s.chain.ignored = nodes.filter((slot, i) => i > 0 && arrow(s.board[nodes[i - 1]!]!) && ![TileType.TILE_SWORD, TileType.TILE_SKULL].includes(s.board[slot]!.type));
  const effective = nodes.filter(slot => !s.chain.ignored.includes(slot));
  p.effectiveLength = effective.length; p.valid = effective.length >= turnData.minimumChain;
  const hasSkull = effective.some(slot => s.board[slot]!.type === TileType.TILE_SKULL && !isPhylactery(s, s.board[slot]!));
  let base = hasSkull ? iadd(s.base.damage, s.equipmentStats.damage) : 0;
  if (mortalEnemy(s) === enemyId('FROZEN') && hasEnemy(s, 'FROZEN')) base = idiv(base, 2);
  p.damage = base;
  for (const slot of effective) {
    const t = s.board[slot]!;
    if (t.type === TileType.TILE_SWORD && !t.broken) p.damage = iadd(p.damage, imul(imul(s.equipmentStats.weaponDamage, t.magicSword ? turnData.magicSwordMultiplier : 1), s.current.swordBoost ? turnData.boostMultiplier : 1));
    if (t.burning && !t.fireSafe) p.fire = iadd(p.fire, t.fireDamage);
  }
  p.leech = hasSkull ? floatToInt(fmul(p.damage, fdiv(s.equipmentStats.leechPercent, 100))) : 0;
  p.spikes = effective.some(slot => s.board[slot]!.type === TileType.TILE_SKULL && effectiveEnemy(s, s.board[slot]!) === enemyId('SPIKY')) ? p.damage : 0;
  const cocky = nodes.length <= 3 && hasFlaw(s, 'FLAW_COCKY');
  for (const slot of effective) {
    const t = s.board[slot]!;
    if (t.type === TileType.TILE_SKULL && !isPhylactery(s, t)) {
      if (s.current.steal) p.resources[TileType.TILE_COIN] = iadd(p.resources[TileType.TILE_COIN]!, 1);
      const damage = chainDamageFor(s, slot, nodes, p.damage), healthLoss = Math.max(0, damage - t.defence);
      const lethal = healthLoss >= t.health, transforms = lethal && effectiveEnemy(s, t) === enemyId('LICH');
      p.enemies.push({ slot, damage, healthLoss, lethal: lethal && !transforms, transforms });
      if (lethal && effectiveEnemy(s, t) === enemyId('NORMAL') && !t.broken) p.resources[TileType.TILE_SKULL] = iadd(p.resources[TileType.TILE_SKULL]!, 1);
    } else if (!cocky && !t.broken && t.specialType === SpecialTileType.SPECIAL_TILE_NONE && t.type <= TileType.TILE_SHIELD && !(t.type === TileType.TILE_POTION && (t.mana || t.acid || t.explosive)) && !isPhylactery(s, t)) p.resources[t.type] = iadd(p.resources[t.type]!, 1);
  }
  for (const slot of columnSlots()) {
    const t = s.board[slot]!;
    if (!nodes.includes(slot) && t.type === TileType.TILE_SKULL && effectiveEnemy(s, t) === enemyId('MEAT_SHIELD')) {
      const healthLoss = Math.max(0, p.damage - t.defence);
      p.enemies.push({ slot, damage: p.damage, healthLoss, lethal: healthLoss >= t.health, transforms: false });
    }
  }
  for (const slot of runeInterior(s)) { const type = Math.min(s.board[slot]!.type, 5); p.resources[type] = iadd(p.resources[type] ?? 0, 1); }
  s.chain.damage = p.damage; s.chain.baseDamage = base; s.preview = p;
  c?.events.push({ type: 'ChainPreview', preview: structuredClone(p) });
}
export function cancelChain(s: RunState, c: RuleContext): void {
  for (const t of s.board) t.selected = false;
  s.chain.nodes = []; s.chain.ignored = []; updatePreview(s, c);
}
export function backtrack(s: RunState, slot: number, c: RuleContext): void {
  const index = s.chain.nodes.indexOf(slot);
  if (index < 0) return;
  for (const removed of s.chain.nodes.splice(index + 1)) s.board[removed]!.selected = false;
  updatePreview(s, c);
}
export function selectTile(s: RunState, at: Point, c: RuleContext): void {
  const slot = slotIndex(at.x, at.y);
  if (s.chain.nodes.includes(slot)) { backtrack(s, slot, c); return; }
  const last = s.chain.nodes.at(-1);
  if (last !== undefined && !adjacent(s.board[last]!, at)) return;
  if (!canMatchType(s, slot)) return;
  s.chain.nodes.push(slot); s.board[slot]!.selected = true; updatePreview(s, c);
}
/** ProcessInput / MatchTiles @0x330c0 / @0x31bcc. Selection coordinates are never entity references. */
export function commitChain(s: RunState, c: RuleContext): void {
  updatePreview(s);
  // ProcessInput @0x330c0 calls Rune before testing effective chain length.
  processRune(s, c);
  if (!s.preview.valid) {
    cancelChain(s, c);
    if (s.pending.length) { s.resumePhase = 'input'; phase(s, 'arrivals', c); }
    return;
  }
  const preview = structuredClone(s.preview), nodes = [...s.chain.nodes], ignored = [...s.chain.ignored];
  s.actionCommitted = true; s.kills.thisAttack = 0; s.chain.berserkHealing = 0;
  s.generated.total = s.generated.skulls = 0;
  phase(s, 'matching', c);
  s.collectedByType.fill(0); // MatchTiles resets these AFTER ProcessRune.
  const cocky = nodes.length <= 3 && hasFlaw(s, 'FLAW_COCKY');
  for (const slot of nodes) {
    if (ignored.includes(slot)) continue;
    const t = s.board[slot]!;
    if (t.type === TileType.TILE_SKULL && !isPhylactery(s, t)) attackSkull(s, slot, chainDamageFor(s, slot, nodes, preview.damage), true, c);
    else matchTile(s, slot, c, cocky ? 'none' : 'normal');
  }
  for (const slot of columnSlots()) {
    const t = s.board[slot]!;
    if (!nodes.includes(slot) && t.type === TileType.TILE_SKULL && effectiveEnemy(s, t) === enemyId('MEAT_SHIELD')) attackSkull(s, slot, preview.damage, false, c);
  }
  s.board.forEach(t => { t.newThisTurn = false; });
  cancelChain(s, c); refill(s, c);
  if (s.outcome) return;
  if (preview.fire > 0) flightDraw(c.rng);
  if (preview.spikes > 0) flightDraw(c.rng);
  // AddRevengeHealth and Berserk happen after refill, before arrivals.
  if (s.kills.thisAttack > 0) for (const slot of columnSlots()) { const t = s.board[slot]!; if (!t.matched && t.type === TileType.TILE_SKULL && effectiveEnemy(s, t) === enemyId('VENGEFUL')) { t.attack = iadd(t.attack, s.kills.thisAttack); labelDraw(c.rng, 27); } }
  if (s.kills.thisAttack > 14 && raceIs(s, 'HALFLING')) {
    if (c.hooks?.progression) c.hooks.progression(s, 'halfling-kills', c);
    else { increaseStat(s, s.equipment[2], 11); updateEquipmentStats(s); }
    labelDraw(c.rng, 34);
    s.achievementQueue.push({ id: 52, progress: 10 });
    if (s.combo.masochism) s.achievementQueue.push({ id: 57, progress: 100 });
  }
  if (s.current.berserk && s.chain.berserkHealing > 0) { heal(s, s.chain.berserkHealing, 'berserk', c); labelDraw(c.rng, 29); }
  // ProcessInput draws the leech flight even when its computed amount is zero.
  if (nodes.some(slot => !ignored.includes(slot) && preview.enemies.some(e => e.slot === slot))) flightDraw(c.rng);
  if (preview.leech > 0) enqueue(s, { kind: 'healing', source: 'leech', amount: preview.leech }, c);
  if (preview.fire > 0) enqueue(s, { kind: 'damage', source: 'fire', amount: preview.fire, targetSlot: null }, c);
  if (preview.spikes > 0) enqueue(s, { kind: 'damage', source: 'spikes', amount: preview.spikes, targetSlot: null }, c);
  s.resumePhase = 'enemy-attack'; phase(s, s.moving.length ? 'falling' : 'arrivals', c);
}
