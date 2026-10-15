import { classData, enumValue, getClass, getRace, GameMode, itemData, SpecialTileType, TileType, upgradeId } from './data';
import { createRngState, type RngState } from './rng';
import { DEFAULT_OPTIONS, type EngineOptions } from './options';
import { iadd } from './num';

export type Four<T> = [T, T, T, T];
export type Five<T> = [T, T, T, T, T];
export interface Point { x: number; y: number }
export interface Attributes {
  strength: number; // Game+c1a8 base / c1ac equipment
  dexterity: number; // Game+c1b0 base / c1b4 equipment
  vitality: number; // Game+c1b8 base / c1bc equipment
  luck: number; // Game+c1c0 base / c1c4 equipment
}
export interface TokenChances { coin: number; potion: number; xp: number; shield: number }
export interface BaseStats extends Attributes {
  maxHealth: number; // Game+0xc15c
  damage: number; // Game+0xc180
  healing: number; repair: number; // Game+0xc1c8 / c1d0
  bonusToken: TokenChances; // Game+c1d8/c1e0/c1e8/c1f0
}
export interface EquipmentStats extends Attributes {
  maxHealth: number; damage: number; // Game+c160/c184
  weaponDamage: number; maxArmour: number; // Game+c17c/c168
  healing: number; repair: number; // Game+c1cc/c1d4
  bonusToken: TokenChances; // Game+c1dc/c1e4/c1ec/c1f4
  breakThreshold: number; pierceThreshold: number; // Game+c188/c18c
  poison: number; leechPercent: number; cooldown: boolean; // Game+c21c/c220/c224
  spikes: number; weaken: number; regeneration: number; // Game+c228/c22c/c230
}
export interface ResourceBar {
  remainder: number; // Game+c170/c174/c178
  banked: number; // Game+c210/c218/c214: multiples of 100, not a level count
  carry: number; // Game+c190/c1a0/c198: fractional token accumulator
  bonus: number; // Game+c194/c1a4/c19c
}
export interface ItemState {
  type: number; icon: number; // Item+80/84
  prefixAnchor: number; displayPrefix: number; suffixIndex: number; // Item+88/8c/90
  stats: number[]; // Item+94+4*id; IDs from items.json
}
export interface SkillState {
  id: number; level: number; cooldown: number; charge: number; active: boolean; // Skill+84/88/8c/90/80
}
export interface Tile extends Point {
  // Fixed slot Game+5fcc+y*ea0+x*270; x/y are Tile+78/7c.
  type: number; specialType: number; // Tile+a0/a4
  matched: boolean; selected: boolean; newThisTurn: boolean; // Tile+88/89/8a
  appearance: number; // Tile+23c
  magicSword: boolean; arrow: boolean; mana: boolean; acid: boolean; explosive: boolean; // Tile+240..244
  attack: number; defence: number; health: number; maxHealth: number; // Tile+a8/ac/b0/b4
  poison: [number, number, number]; // Tile+248/24c/250
  enemyType: number; countdown: number; // Tile+25c/260
  abilityUsed: boolean; frozen: boolean; burning: boolean; fireSafe: boolean; fireDamage: number; // Tile+264..268
  broken: boolean; promotedBySkill: boolean; phylacteryDelayed: boolean; // Tile+26c..26e
  statsStatus: 'none' | 'ordinary' | 'special-pending' | 'special'; // Legacy pending fixtures reject by default; generation always produces complete stats.
}
export interface SkillFlags {
  swordBoost: boolean; shieldBoost: boolean; potionBoost: boolean; coinBoost: boolean; // c234..237 / c238..23b
  steal: boolean; // c383/c384
  oneHealthSkulls: boolean; forceCoin: boolean; // 1433d/e / 1433f/40
  rune: boolean; berserk: boolean; lastStand: boolean; // 15cd9/a,15cef/f0,15cec/d
}
export type TurnPhase = 'idle' | 'input' | 'matching' | 'falling' | 'arrivals' | 'menu' | 'enemy-attack' | 'end-turn' | 'ended';
export interface ChainPreview {
  effectiveLength: number; valid: boolean; damage: number; leech: number; spikes: number; fire: number;
  resources: number[]; // Guaranteed token counts, before random extras; special rewards may be unknown.
  enemies: { slot: number; damage: number; healthLoss: number; lethal: boolean; transforms: boolean }[];
}
export type DeathCause = 'enemy-attack' | 'poison' | 'fire' | 'spikes' | 'acid' | 'thrown-skull' | 'fleeing' | 'assassin' | 'thief' | 'kamikaze' | 'unknown';
export type PendingEffect =
  | { id: number; kind: 'resource'; tileType: number; variant: number; skillSlot: number | null; targetSlot: number | null; amount: number }
  | { id: number; kind: 'damage'; source: 'fire' | 'spikes' | 'thrown-skull' | 'fleeing'; amount: number; targetSlot: number | null }
  | { id: number; kind: 'healing'; source: 'leech'; amount: number };
export type MenuCandidate =
  | { kind: 'skill'; skill: SkillState }
  | { kind: 'stat'; id: number; stat: number }
  | { kind: 'item'; item: ItemState; scroll: SkillState | null }
  | { kind: 'upgrade'; itemType: number; stat: number; value: number };
export interface MenuState { id: number; kind: 'level' | 'shop' | 'upgrade' | 'class'; selected: number[]; candidates: MenuCandidate[] }
export interface ClassConfiguration {
  classId: number; race: number; perks: Four<number>; flaws: Four<number>; replacementSkills: number[];
}
export interface ClassProfile extends ClassConfiguration {
  level: number; games: number; kills: number; bestScores: [number, number, number]; // CharacterClass+54/58/5c/60/64/68
}
export interface ScoreRecord { name: string; turn: number; xp: number; gold: number; upgrade: number; score: number; skills: Four<number | null> }
export interface ProfileState {
  classes: ClassProfile[]; // Game+14dac, stride184; config offsets8,10..2c,48
  achievements: Record<number, number>; // Java percentComplete, not Game local achievements
  highScores: ScoreRecord[][]; // ScoreScreen six categories, max10; T07 implements ordering
  playerName: string;
  lastScoreIndices: (number | null)[]; // Native has one global category/index pair; at most one entry is non-null.
  trophyRemaining: number; // Java PREFS_TROPHY, persisted separately from native run bytes.
}
export interface RunState {
  board: Tile[]; // Game+5fcc: fixed row-major slots; all references below are slot indices
  turn: number; phase: TurnPhase; inputReady: boolean; attackStage: number; // Game+c/5f74/bc5c
  character: ClassConfiguration; // Game+15cd4 and selected CharacterClass configuration
  difficulty: number; mode: number; challenge: boolean; // Game+14328/14330/14335
  base: BaseStats; equipmentStats: EquipmentStats;
  health: number; armour: number; level: number; // Game+c158/c164/c20c
  equipment: Five<ItemState>; skills: Four<SkillState | null>; selectedSkillCount: number; // Game+c248..258/c358..364/c368
  resources: { xp: ResourceBar; gold: ResourceBar; upgrade: ResourceBar };
  playerPoison: number; incomingPoison: number; // Game+14d88/14d84
  promotion: { remaining: number; allowReset: boolean }; // Game+14338/1433c
  current: SkillFlags; next: SkillFlags;
  counterattack: boolean; delayedLastStand: boolean; actionCommitted: boolean; // Game+c382/15cee/14d94
  filter: { enabled: boolean; excludeSwords: boolean }; // Game+c380/c381
  collectingBoard: boolean; // Game+14dab: scoped TreasureChamber exception
  combo: { hack: boolean; slash: boolean; shock: boolean; awe: boolean; masochism: boolean; slashAchievement: boolean; fireball: boolean; charge: boolean; collectBoard: boolean }; // 14da9/a,15e72/73,15e18..1c
  chain: { nodes: number[]; ignored: number[]; damage: number; baseDamage: number; enemyAttack: number; berserkHealing: number }; // b78c/b794/c23c/c240/c244/15cf4
  collectedByType: number[]; // Game+c36c..c37c
  generated: { total: number; skulls: number }; // Game+15e20/15e24 (submission-local counters)
  kills: { thisAttack: number; total: number }; // Game+14d90/15e14
  classLevels: number[]; // Snapshot of ProfileState classes for Trophy eligibility; T06 synchronizes it.
  trophies: { remaining: number; awarded: number }; // Game+14da0/14da4
  pending: PendingEffect[]; menus: MenuState[]; nextEffectId: number; // Port event queues replace Token/animation containers
  preview: ChainPreview;
  resumePhase: 'enemy-attack' | 'end-turn' | 'input' | null;
  menuResumePhase: TurnPhase | null;
  lastDamage: DeathCause;
  outcome: { won: boolean; cause: DeathCause | 'sprint'; turn: number } | null;
  moving: { slot: number; from: Point; to: Point; spawned: boolean }[]; // Game+b7ac; Tile+8c/90/94
  pretzel: { score: number; preview: number; rating: number; crosses: number; maxCrosses: number; scoringChains: number; averageTimes10: number }; // score=15e2c, preview=15e30, rating=15e34, count=15e60, avg=15e64, max=15e68; crosses is derived
  scoreResources: { collected: number[]; preview: number[] }; // 15e38..48 / 15e4c..5c
  sprintWon: boolean; // Game+15e71
  achievementQueue: { id: number; progress: number }[];
  rng: RngState; // Six global native uint32 seeds; port stores all six, plus trace ordinal
  options: EngineOptions;
  diagnostics: string[]; // Explicit compatibility/placeholder notices, serializable
}
export function emptyTile(x: number, y: number): Tile {
  return { x, y, type: TileType.TILE_NONE, specialType: SpecialTileType.SPECIAL_TILE_NONE,
    matched: false, selected: false, newThisTurn: false, appearance: 0,
    magicSword: false, arrow: false, mana: false, acid: false, explosive: false,
    attack: 0, defence: 0, health: 0, maxHealth: 0, poison: [0, 0, 0],
    enemyType: enumValue('EnemyType', 'ENEMY_NORMAL'), countdown: 0, abilityUsed: false,
    frozen: false, burning: false, fireSafe: false, fireDamage: 0, broken: false,
    promotedBySkill: false, phylacteryDelayed: false, statsStatus: 'none' };
}
export function emptyFlags(): SkillFlags {
  return { swordBoost: false, shieldBoost: false, potionBoost: false, coinBoost: false, steal: false,
    oneHealthSkulls: false, forceCoin: false, rune: false, berserk: false, lastStand: false };
}
export function emptyPreview(): ChainPreview {
  return { effectiveLength: 0, valid: false, damage: 0, leech: 0, spikes: 0, fire: 0,
    resources: Array<number>(5).fill(0), enemies: [] };
}
export function defaultCharacter(classId: number): ClassConfiguration {
  const entry = getClass(classId); // classes.json default configuration, including NONE=255.
  return { classId, race: entry.defaultRace.value,
    perks: [entry.defaultPerk.value, ...Array<number>(3).fill(enumValue('PerkType', 'PERK_NONE'))] as Four<number>,
    flaws: [entry.defaultFlaw.value, ...Array<number>(3).fill(enumValue('FlawType', 'FLAW_NONE'))] as Four<number>,
    replacementSkills: entry.baseSkillVector.map(skill => skill.value) };
}
export function createProfileState(): ProfileState {
  return { classes: classData.classes.map(entry => ({ ...defaultCharacter(entry.class.value), level: entry.initialClassLevel,
    games: 0, kills: 0, bestScores: [0, 0, 0] })), achievements: {}, highScores: Array.from({ length: enumValue('ScoreType', 'SCORE_TYPE_COUNT') }, () => []), playerName: '', lastScoreIndices: Array(6).fill(null), trophyRemaining: 0 };
}
export const hasPerk = (state: RunState, name: string): boolean => name !== 'PERK_NONE' && state.character.perks.includes(enumValue('PerkType', name));
export const hasFlaw = (state: RunState, name: string): boolean => name !== 'FLAW_NONE' && state.character.flaws.includes(enumValue('FlawType', name));
export const mortalEnemy = (state: RunState): number => getRace(state.character.race).mortalEnemy.value;
/** Structural baseline. InitNewGame and initial equipment setup fill native gameplay values. */
export function createRunState(options: Partial<EngineOptions> = {}): RunState {
  const chances = (): TokenChances => ({ coin: 0, potion: 0, xp: 0, shield: 0 });
  const attributes = (): Attributes => ({ strength: 0, dexterity: 0, vitality: 0, luck: 0 });
  const bar = (): ResourceBar => ({ remainder: 0, banked: 0, carry: 0, bonus: 0 });
  return {
    board: Array.from({ length: 36 }, (_, index) => emptyTile(index % 6, Math.floor(index / 6))),
    turn: 0, phase: 'idle', inputReady: false, attackStage: 0,
    character: defaultCharacter(enumValue('ClassType', 'CLASS_ADVENTURER')),
    difficulty: enumValue('Difficulty', 'DIFF_NORMAL'), mode: GameMode.MODE_CLASSIC, challenge: false,
    base: { ...attributes(), maxHealth: 0, damage: 0, healing: 0, repair: 0, bonusToken: chances() },
    equipmentStats: { ...attributes(), maxHealth: 0, damage: 0, weaponDamage: 0, maxArmour: 0, healing: 0, repair: 0,
      bonusToken: chances(), breakThreshold: 0, pierceThreshold: 0, poison: 0, leechPercent: 0, cooldown: false, spikes: 0, weaken: 0, regeneration: 0 },
    health: 0, armour: 0, level: 1,
    // items.json slot order and 20-entry initial vectors; owned arrays never alias table data.
    equipment: itemData.slots.map(slot => ({ type: slot.itemType.value, icon: -1, prefixAnchor: -1, displayPrefix: -1, suffixIndex: -1, stats: [...slot.initialStats] })) as Five<ItemState>,
    skills: [null, null, null, null], selectedSkillCount: 0,
    resources: { xp: bar(), gold: bar(), upgrade: bar() }, playerPoison: 0, incomingPoison: 0,
    promotion: { remaining: 0, allowReset: true }, current: emptyFlags(), next: emptyFlags(),
    counterattack: false, delayedLastStand: false, actionCommitted: false,
    filter: { enabled: false, excludeSwords: false }, collectingBoard: false,
    combo: { hack: false, slash: false, shock: false, awe: false, masochism: false, slashAchievement: false, fireball: false, charge: false, collectBoard: false },
    chain: { nodes: [], ignored: [], damage: 0, baseDamage: 0, enemyAttack: 0, berserkHealing: 0 },
    collectedByType: Array<number>(enumValue('TileType', 'TILE_TYPE_COUNT')).fill(0),
    classLevels: classData.classes.map(c => c.initialClassLevel),
    generated: { total: 0, skulls: 0 }, kills: { thisAttack: 0, total: 0 }, trophies: { remaining: 0, awarded: 0 },
    pending: [], menus: [], nextEffectId: 1, moving: [],
    preview: emptyPreview(), resumePhase: null, menuResumePhase: null, lastDamage: 'unknown', outcome: null,
    pretzel: { score: 0, preview: 0, rating: 0, crosses: 0, maxCrosses: 0, scoringChains: 0, averageTimes10: 0 },
    scoreResources: { collected: Array<number>(5).fill(0), preview: Array<number>(5).fill(0) },
    sprintWon: false, achievementQueue: [], rng: createRngState(), options: { ...DEFAULT_OPTIONS, ...options }, diagnostics: [],
  };
}
/** Initial values only (InitNewGame @0x2d7a4 / initial UpdateStats @0x26c94).
 * General recomputation and skill cooldown changes live in equipment.ts. */
export function initialisePlayer(state: RunState): void {
  const pretzel = state.challenge && state.mode === GameMode.MODE_PRETZEL;
  state.base = { strength: 1, dexterity: 1, vitality: 1, luck: 1,
    maxHealth: (pretzel ? 100 : 40) + (hasPerk(state, 'PERK_TOUGH') ? 10 : 0) - (hasFlaw(state, 'FLAW_FRAIL') ? 10 : 0),
    damage: 3 + (hasPerk(state, 'PERK_STRONG') ? 1 : 0), healing: 1, repair: 1,
    bonusToken: { coin: 20 + (hasPerk(state, 'PERK_FRUGAL') ? 10 : 0), potion: 20, xp: 20, shield: 20 - (hasFlaw(state, 'FLAW_RECKLESS') ? 10 : 0) } };
  // Both initial exceptions (Slim armour, Pretzel accessory) come from items.json.
  for (const exception of itemData.initialExceptions) {
    const applies = exception.condition.enum === 'FlawType'
      ? state.character.flaws.includes(exception.condition.value)
      : state.challenge && state.mode === exception.condition.value;
    if (applies) state.equipment.find(item => item.type === exception.itemType.value)!.stats[exception.nativeStatId] = exception.value;
  }
  const sum = (key: string): number => state.equipment.reduce((total, item) => iadd(total, item.stats[upgradeId(key)]!), 0);
  state.equipmentStats.weaponDamage = sum('weaponDamage');
  state.equipmentStats.maxHealth = sum('maxHealth');
  state.equipmentStats.maxArmour = sum('armour');
  state.equipmentStats.breakThreshold = 50;
  state.equipmentStats.pierceThreshold = hasFlaw(state, 'FLAW_CAUTIOUS') ? 30 : 50;
  state.health = iadd(state.base.maxHealth, state.equipmentStats.maxHealth);
  state.armour = state.equipmentStats.maxArmour;
}
