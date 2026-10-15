import { Difficulty, enumValue, GameMode, itemData, RandType, TileType } from './data';
import { fadd, fdiv, fmul, fsqrt, iadd, idiv, imul, isub, floatToInt } from './num';
import { type RandomSource } from './rng';
import { emptyTile, hasFlaw, hasPerk, mortalEnemy, type Point, type RunState, type Tile } from './state';

// InitNewGame @0x2d7a4: 6x6; physical slot traversal must remain row-major.
export const BOARD_SIZE = 6;
export function slotIndex(x: number, y: number): number {
  if (![x, y].every(n => Number.isInteger(n) && n >= 0 && n < BOARD_SIZE)) throw new RangeError(`Invalid tile (${x},${y})`);
  return y * BOARD_SIZE + x;
}
export function tileAt(state: RunState, x: number, y: number): Tile { return state.board[slotIndex(x, y)]!; }
export function* rowMajor(): Generator<Point> {
  for (let y = 0; y < BOARD_SIZE; y++) for (let x = 0; x < BOARD_SIZE; x++) yield { x, y };
}
export function* refillOrder(): Generator<Point> {
  for (let x = 0; x < BOARD_SIZE; x++) for (let y = BOARD_SIZE - 1; y >= 0; y--) yield { x, y };
}
export type BoardEvent =
  | { type: 'TileGenerated'; slot: number; tileType: number }
  | { type: 'TileMoved'; from: Point; to: Point; spawned: boolean }
  | { type: 'SpecialEnemyPending'; slot: number; enemyType: number; promotionCandidate: number | null };
export interface BoardHooks {
  /** T05: after common draws/promotion reset, finish multipliers and set statsStatus='special'. */
  completeSpecialStats?: (state: RunState, tile: Tile, rng: RandomSource) => void;
  /** T05: Corrosive/JumpDown and special spawn achievements, after counters and Trap. */
  specialSpawn?: (state: RunState, tile: Tile, rng: RandomSource) => void;
  /** T05 hook: called after every column is processed, in physical slot order. */
  fleeingFell?: (state: RunState, slot: number) => void;
}
export const isSprint = (state: RunState): boolean => state.challenge && state.mode === GameMode.MODE_SPRINT;
export function initialisePromotion(state: RunState): void {
  // InitNewGame @0x2d7a4, before filling the board.
  state.promotion.remaining = isSprint(state) ? 200 : hasFlaw(state, 'FLAW_ZEALOUS') ? 49 : 50;
  state.promotion.allowReset = true;
}
export function isTimeToPromote(state: RunState): boolean {
  // IsTimeToPromote @0x250b0: P=1 does not trigger; Sprint check also writes P.
  if (!isSprint(state) || state.promotion.remaining === 0) return state.promotion.remaining === 0;
  if (state.promotion.remaining === 200) return false;
  const zealous = hasFlaw(state, 'FLAW_ZEALOUS');
  if (isub(state.turn, zealous ? 3 : 4) % (zealous ? 9 : 10) !== 0) return false;
  state.promotion.remaining = 0;
  return true;
}
export function setTimeToPromotion(state: RunState, candidate: number | null): void {
  // SetTimeToPromotion @0x2985c. B2 cannot invent a finite natural interval.
  if (!state.promotion.allowReset) return;
  if (isSprint(state)) state.promotion.remaining = 200;
  else {
    if (candidate === null) throw new Error('B2: zero-turn special promotion requires an unverified interval');
    state.promotion.remaining = candidate;
  }
}
interface EnemyCurve { acceleration: number | null; attack: [number, number]; defence: [number, number]; health: [number, number]; minHealth: number; intervalLow: number; intervalExtra: number }
// Formula constants are evidence-backed code constants, not extracted enum/Item/Class values.
// Tile::GenerateStats @0x63098 difficulty switch; docs/spec/01-board.md table.
const curves = new Map<number, EnemyCurve>([
  [Difficulty.DIFF_EASY, { acceleration: null, attack: [80, 70], defence: [70, 55], health: [25, 20], minHealth: 3, intervalLow: 200, intervalExtra: 5 }],
  [Difficulty.DIFF_NORMAL, { acceleration: 700, attack: [65, 55], defence: [50, 40], health: [20, 15], minHealth: 4, intervalLow: 200, intervalExtra: 0 }],
  [Difficulty.DIFF_HARD, { acceleration: 750, attack: [50, 40], defence: [40, 37], health: [17, 12], minHealth: 4, intervalLow: 150, intervalExtra: 0 }],
  [Difficulty.DIFF_HARDER, { acceleration: 500, attack: [40, 35], defence: [30, 35], health: [15, 10], minHealth: 4, intervalLow: 150, intervalExtra: 0 }],
]);
/** Common native draws; a special placeholder deliberately has no usable final combat stats. */
export function generateStats(state: RunState, tile: Tile, rng: RandomSource): number | null {
  const difficulty = state.challenge && state.mode === GameMode.MODE_PRETZEL ? Difficulty.DIFF_NORMAL : state.difficulty;
  const curve = curves.get(difficulty);
  if (!curve) throw new RangeError(`Unknown difficulty ${difficulty}`);
  const xp = iadd(state.resources.xp.banked, state.resources.xp.remainder);
  const level = idiv(isSprint(state) ? idiv(xp, 4) : xp, 100);
  let q = state.turn;
  if (curve.acceleration !== null) {
    q = floatToInt(fmul(q, Math.max(1, fadd(1, fdiv(isub(q, 500), curve.acceleration)))));
    if (level > 40) q = floatToInt(fmul(q, fadd(1, fdiv(isub(level, 40), 60))));
  }
  if (q < 0) throw new RangeError('Enemy curve requires nonnegative turns');
  if (q === 0 && state.options.zeroTurnPromotion === 'reject') throw new Error('B2: q=0 promotion sampling is unresolved');
  const draw = ([a, b]: [number, number]): number => rng.randI(idiv(q, a), idiv(q, b), RandType.RAND_TILE);
  tile.attack = Math.max(1, draw(curve.attack));
  tile.defence = Math.max(0, draw(curve.defence));
  tile.health = Math.max(curve.minHealth, draw(curve.health));
  let candidate: number | null;
  if (q === 0) {
    // B2: preserve the one RNG multiplication, but do not claim native range/result fidelity.
    rng.randUnitF(RandType.RAND_TILE);
    candidate = null;
    if (!state.diagnostics.includes('B2: q=0 interval draw consumed; native bounds/result unresolved')) {
      state.diagnostics.push('B2: q=0 interval draw consumed; native bounds/result unresolved');
    }
  } else {
    const root = fsqrt(q);
    candidate = iadd(rng.randI(floatToInt(fdiv(curve.intervalLow, root)), floatToInt(fdiv(300, root)), RandType.RAND_TILE), curve.intervalExtra);
  }
  // Sprint overwrites AFTER the ordinary difficulty's four draws.
  if (isSprint(state)) {
    tile.attack = Math.max(1, draw([20, 12]));
    tile.defence = Math.max(0, draw([10, 6]));
    tile.health = Math.max(4, draw([8, 4]));
  }
  const ordinary = tile.enemyType === enumValue('EnemyType', 'ENEMY_NORMAL');
  if (ordinary && hasFlaw(state, 'FLAW_SNEAKY')) tile.health = iadd(tile.health, 1);
  if (!ordinary) {
    if (candidate !== null && hasFlaw(state, 'FLAW_ZEALOUS')) candidate = Math.max(isub(candidate, 1), 1);
    setTimeToPromotion(state, candidate);
    tile.defence = Math.max(1, tile.defence);
    tile.statsStatus = 'special-pending';
    // Special multipliers, Noisy, spawn abilities and achievements belong to T05.
  } else {
    tile.statsStatus = 'ordinary';
    // GenerateStats tail affects ordinary enemies too; no matched/new filtering in GetEnemyCount.
    const invisible = enumValue('EnemyType', 'ENEMY_INVISIBLE');
    if (mortalEnemy(state) === invisible && state.board.some(other => other.type === TileType.TILE_SKULL && other.enemyType === invisible)) tile.defence = imul(tile.defence, 2);
  }
  tile.maxHealth = tile.health;
  return candidate;
}
/** SetType @0x64ef8; preserve slot/matched/new flags, reset gameplay payload. */
export function setTileType(state: RunState, tile: Tile, type: number, rng: RandomSource, events: Pick<BoardEvent[], 'push'> = [], hooks: BoardHooks = {}): void {
  const { x, y, matched, newThisTurn } = tile;
  Object.assign(tile, emptyTile(x, y), { type, matched, newThisTurn });
  tile.appearance = rng.randI(0, 7, RandType.RAND_COSMETIC);
  if (type !== TileType.TILE_SKULL) return;
  if (isTimeToPromote(state)) {
    // Enemy bounds come from enums.json; Promote @0x64e3c uses all 32 special IDs.
    tile.enemyType = rng.randI(enumValue('EnemyType', 'ENEMY_BOSS'), enumValue('EnemyType', 'ENEMY_LICH'), RandType.RAND_TILE);
    if (state.character.classId !== enumValue('ClassType', 'CLASS_ADVENTURER')) {
      if (rng.randI(1, 200, RandType.RAND_TILE) <= (hasPerk(state, 'PERK_INTIMIDATING') ? 5 : 10)) tile.enemyType = mortalEnemy(state);
    }
  }
  const candidate = generateStats(state, tile, rng);
  if (tile.statsStatus === 'special-pending') {
    if (hooks.completeSpecialStats) hooks.completeSpecialStats(state, tile, rng);
    else {
      events.push({ type: 'SpecialEnemyPending', slot: slotIndex(x, y), enemyType: tile.enemyType, promotionCandidate: candidate });
      if (!state.diagnostics.includes('T05: special enemy stats and spawn abilities pending')) state.diagnostics.push('T05: special enemy stats and spawn abilities pending');
    }
  }
}
/** RandomiseTile @0x2d584. All retries consume the original full-range TILE draw. */
export function randomiseTile(state: RunState, tile: Tile, rng: RandomSource, events: Pick<BoardEvent[], 'push'> = [], hooks: BoardHooks = {}): void {
  const drawType = (): number => rng.randI(TileType.TILE_POTION, TileType.TILE_SWORD, RandType.RAND_TILE);
  let type = state.current.forceCoin && !state.filter.enabled && !state.collectingBoard ? TileType.TILE_COIN : drawType();
  if (isSprint(state) && isTimeToPromote(state)) type = TileType.TILE_SKULL;
  if (state.filter.enabled) {
    const excluded = state.filter.excludeSwords ? TileType.TILE_SWORD : TileType.TILE_SKULL;
    while (type === excluded) type = drawType();
  }
  setTileType(state, tile, type, rng, events, hooks);
  state.generated.total = iadd(state.generated.total, 1);
  if (type === TileType.TILE_SKULL) {
    state.generated.skulls = iadd(state.generated.skulls, 1);
    if (state.current.oneHealthSkulls) tile.health = 1;
    if (tile.enemyType !== enumValue('EnemyType', 'ENEMY_NORMAL')) hooks.specialSpawn?.(state, tile, rng);
  } else if (type === TileType.TILE_POTION && hasPerk(state, 'PERK_GIFTED')) {
    tile.mana = rng.randI(1, 100, RandType.RAND_TILE) < 6;
  } else if (type === TileType.TILE_SHIELD && hasFlaw(state, 'FLAW_CLUMSY')) {
    tile.broken = rng.randI(1, 100, RandType.RAND_TILE) < 4;
  } else if (type === TileType.TILE_SWORD && hasPerk(state, 'PERK_AGILE')) {
    tile.arrow = rng.randI(1, 100, RandType.RAND_TILE) < 6;
  }
  events.push({ type: 'TileGenerated', slot: slotIndex(tile.x, tile.y), tileType: type });
}
export function initialiseBoard(state: RunState, rng: RandomSource, events: Pick<BoardEvent[], 'push'> = [], hooks: BoardHooks = {}): void {
  state.filter.enabled = true;
  state.filter.excludeSwords = state.options.initialFilter === 'exclude-swords';
  for (const { x, y } of rowMajor()) randomiseTile(state, tileAt(state, x, y), rng, events, hooks);
  state.filter.enabled = false;
  state.filter.excludeSwords = false;
}
/** Initial Item::Initialise @0x4c0ec -> GenerateName @0x4c35c, after the initial board. */
export function initialiseItemAppearance(state: RunState, rng: RandomSource): void {
  for (const item of state.equipment) {
    const slot = itemData.slots.find(slot => slot.itemType.value === item.type)!;
    item.icon = rng.randI(slot.iconRangeInclusive[0]!, slot.iconRangeInclusive[1]!, RandType.RAND_ITEM);
    const mapping = itemData.nameMappings.find(mapping => item.icon >= mapping.iconStart && item.icon < mapping.iconEndExclusive)!;
    const names = itemData.names[mapping.pool as keyof typeof itemData.names];
    item.suffixIndex = rng.randI(0, names.length - 1, RandType.RAND_ITEM);
  }
}
/** MoveMatchedTiles @0x2fd7c. Mutates fixed slot objects, never retains entity object references. */
export function moveMatchedTiles(state: RunState, rng: RandomSource, events: Pick<BoardEvent[], 'push'> = [], hooks: BoardHooks = {}): void {
  const fleeing = enumValue('EnemyType', 'ENEMY_FLEEING');
  // Explicit T05 boundary: do not silently lose Stab for a fixture with an existing Fleeing enemy.
  if (!hooks.fleeingFell && state.board.some(tile => tile.type === TileType.TILE_SKULL && tile.enemyType === fleeing && !tile.matched && state.board.some(hole => hole.x === tile.x && hole.y > tile.y && hole.matched))) {
    throw new Error('T05: Fleeing descent requires a fleeingFell hook');
  }
  const fallingFleeing = new Set<number>();
  const spawnRows = Array<number>(BOARD_SIZE).fill(0);
  for (const { x, y } of refillOrder()) {
    const target = tileAt(state, x, y);
    if (!target.matched) continue;
    let sourceY = y - 1;
    while (sourceY >= 0 && tileAt(state, x, sourceY).matched) sourceY--;
    const spawned = sourceY < 0;
    const from = { x, y: sourceY };
    if (spawned) {
      from.y = --spawnRows[x]!;
      target.matched = false;
      target.newThisTurn = true;
    } else {
      const source = tileAt(state, x, sourceY);
      const hole = { ...target };
      Object.assign(target, source, { x, y });
      Object.assign(source, hole, { x, y: sourceY });
      if (target.type === TileType.TILE_SKULL && target.enemyType === fleeing) fallingFleeing.add(slotIndex(x, y));
    }
    const movement = { slot: slotIndex(x, y), from, to: { x, y }, spawned };
    state.moving.push(movement);
    events.push({ type: 'TileMoved', from, to: movement.to, spawned });
    // Native PositionTile and moving-list insertion precede RandomiseTile/JumpDown.
    if (spawned) randomiseTile(state, target, rng, events, hooks);
  }
  for (const slot of [...fallingFleeing].sort((a, b) => a - b)) hooks.fleeingFell!(state, slot);
}
