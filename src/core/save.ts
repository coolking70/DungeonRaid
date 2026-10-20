import { saveAchievementRequests } from './achievements';
import { Difficulty, GameMode, itemData } from './data';
import { DEFAULT_OPTIONS } from './options';
import { createRunState, emptyTile, type ProfileState, type RunState } from './state';

export const SAVE_VERSION = 1;
export class SaveValidationError extends Error {
  constructor(path: string, reason: string) { super(`Invalid save at ${path}: ${reason}`); this.name = 'SaveValidationError'; }
}
type Validator = (value: unknown, path: string) => void;
const fail = (p: string, reason: string): never => { throw new SaveValidationError(p, reason); };
const num: Validator = (v, p) => { if (typeof v !== 'number' || !Number.isFinite(v)) fail(p, 'expected finite number'); };
const integer = (min = -2147483648, max = 2147483647): Validator => (v, p) => { num(v, p); if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) fail(p, `expected integer in [${min},${max}]`); };
const int = integer(), natural = integer(0), bool: Validator = (v, p) => { if (typeof v !== 'boolean') fail(p, 'expected boolean'); };
const str: Validator = (v, p) => { if (typeof v !== 'string') fail(p, 'expected string'); };
const oneOf = (...values: unknown[]): Validator => (v, p) => { if (!values.includes(v)) fail(p, 'unknown value'); };
const nullable = (validate: Validator): Validator => (v, p) => { if (v !== null) validate(v, p); };
const array = (validate: Validator, min = 0, max = 100000): Validator => (v, p) => {
  if (!Array.isArray(v) || v.length < min || v.length > max) fail(p, `expected array length ${min}..${max}`);
  (v as unknown[]).forEach((entry, i) => validate(entry, `${p}[${i}]`));
};
const object = (fields: Record<string, Validator>): Validator => (v, p) => {
  if (v === null || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) fail(p, 'expected plain object');
  const record = v as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!Object.prototype.hasOwnProperty.call(fields, key)) fail(`${p}.${key}`, 'unknown field');
  for (const [key, validate] of Object.entries(fields)) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) fail(`${p}.${key}`, 'missing field');
    validate(record[key], `${p}.${key}`);
  }
};
/** Uniform fixed structs; dynamic/nullable/discriminated structures are explicitly described below. */
function shape(example: object): Validator {
  return object(Object.fromEntries(Object.entries(example).map(([key, v]) => [key, typeof v === 'boolean' ? bool : typeof v === 'number' ? int : typeof v === 'string' ? str : shape(v)])));
}
const tagged = (key: string, branches: Record<string, Validator>): Validator => (v, p) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(p, 'expected tagged object');
  const tag = (v as Record<string, unknown>)[key];
  if (typeof tag !== 'string' || !Object.prototype.hasOwnProperty.call(branches, tag)) fail(`${p}.${key}`, 'unknown variant');
  branches[tag as string]!(v, p);
};
const point = object({ x: int, y: int });
const slot = integer(0, 35), skillId = integer(0, 41), classId = integer(0, 9);
const phase = oneOf('idle', 'input', 'matching', 'falling', 'arrivals', 'menu', 'enemy-attack', 'end-turn', 'ended');
const cause = oneOf('enemy-attack', 'poison', 'fire', 'spikes', 'acid', 'thrown-skull', 'fleeing', 'assassin', 'thief', 'kamikaze', 'unknown');
const skill = object({ id: skillId, level: integer(1, 10), cooldown: int, charge: int, active: bool });
const itemFields = { type: integer(0, 4), icon: integer(-1), prefixAnchor: integer(-1), displayPrefix: integer(-1), suffixIndex: integer(-1), stats: array(int, 20, 20) };
const item: Validator = (v, p) => {
  object(itemFields)(v, p);
  const i = v as RunState['equipment'][number], range = itemData.slots[i.type]!.iconRangeInclusive;
  if (i.icon !== -1 && (i.icon < range[0]! || i.icon > range[1]!)) fail(`${p}.icon`, 'outside item slot range');
  for (const key of ['prefixAnchor', 'displayPrefix'] as const) if (i[key] >= itemData.names.m_prefixes.length) fail(`${p}.${key}`, 'outside prefix table');
  if (i.icon !== -1 && i.suffixIndex !== -1) {
    const mapping = itemData.nameMappings.find(m => i.icon >= m.iconStart && i.icon < m.iconEndExclusive)!;
    if (i.suffixIndex >= itemData.names[mapping.pool as keyof typeof itemData.names].length) fail(`${p}.suffixIndex`, 'outside name pool');
  }
};
const configFields = { classId, race: integer(0, 9), perks: array(oneOf(255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9), 4, 4), flaws: array(oneOf(255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9), 4, 4), replacementSkills: array((v, p) => { if (v !== 255) skillId(v, p); }, 20, 20) };
const candidate = tagged('kind', {
  skill: object({ kind: oneOf('skill'), skill }), stat: object({ kind: oneOf('stat'), id: integer(42, 49), stat: integer(0, 7) }),
  item: object({ kind: oneOf('item'), item, scroll: nullable(skill) }),
  upgrade: object({ kind: oneOf('upgrade'), itemType: integer(0, 4), stat: integer(0, 19), value: int }),
});
const menu = object({ id: integer(1), kind: oneOf('level', 'shop', 'upgrade', 'class'), selected: array(natural, 0, 2), candidates: array(candidate, 0, 100) });
const effectFields = { id: integer(1), amount: int };
const pending = tagged('kind', {
  resource: object({ ...effectFields, kind: oneOf('resource'), tileType: integer(0, 7), variant: integer(0, 3), skillSlot: nullable(integer(0, 3)), targetSlot: nullable(slot) }),
  damage: object({ ...effectFields, kind: oneOf('damage'), source: oneOf('fire', 'spikes', 'thrown-skull', 'fleeing'), targetSlot: nullable(slot) }),
  healing: object({ ...effectFields, kind: oneOf('healing'), source: oneOf('leech') }),
});
const tileFields = Object.fromEntries(Object.entries(emptyTile(0, 0)).filter(([key]) => key !== 'poison').map(([key, v]) => [key, typeof v === 'boolean' ? bool : int]));
Object.assign(tileFields, { x: integer(0, 5), y: integer(0, 5), type: oneOf(0, 1, 2, 3, 4, 6, 7), specialType: oneOf(0, 1, 3), enemyType: integer(0, 32), poison: array(int, 3, 3), statsStatus: oneOf('none', 'ordinary', 'special-pending', 'special') });
const baseline = createRunState();
const bar = object({ remainder: integer(0, 99), banked: natural, carry: num, bonus: num });
const optionFields: Record<keyof typeof DEFAULT_OPTIONS, Validator> = {
  trophyInterval: oneOf('carry-across-runs', 'reset-each-run'), specialPendingCombat: oneOf('ordinary-placeholder', 'reject'),
  initialFilter: oneOf('exclude-skulls', 'exclude-swords'), zeroTurnPromotion: oneOf('consume-unit-and-defer', 'reject'),
  arrivalOrder: oneOf('explicit-events', 'reject-ambiguous'), specialInteractionOrder: oneOf('native-slot-order', 'reject-combinations'),
  raceSkillCombinations: oneOf('documented-branches', 'reject-unverified'), scrollFilter: oneOf('reject-unresolved', 'supplied-native-fixture'),
};
const runFields: Record<keyof RunState, Validator> = {
  board: array(object(tileFields), 36, 36), turn: natural, phase, inputReady: bool, attackStage: integer(0, 8), character: object(configFields),
  difficulty: oneOf(...Object.values(Difficulty)), mode: oneOf(...Object.values(GameMode)), challenge: bool,
  base: shape(baseline.base), equipmentStats: shape(baseline.equipmentStats), health: natural, armour: natural, level: integer(1),
  equipment: array(item, 5, 5), skills: array(nullable(skill), 4, 4), selectedSkillCount: integer(0, 4),
  resources: object({ xp: bar, gold: bar, upgrade: bar }), playerPoison: int, incomingPoison: int, promotion: shape(baseline.promotion),
  current: shape(baseline.current), next: shape(baseline.next), counterattack: bool, delayedLastStand: bool, actionCommitted: bool,
  filter: shape(baseline.filter), collectingBoard: bool, combo: shape(baseline.combo),
  chain: object({ nodes: array(slot, 0, 36), ignored: array(slot, 0, 36), damage: int, baseDamage: int, enemyAttack: int, berserkHealing: int }),
  collectedByType: array(int, baseline.collectedByType.length, baseline.collectedByType.length), generated: shape(baseline.generated), kills: shape(baseline.kills), classLevels: array(integer(0, 10), 10, 10),
  trophies: shape(baseline.trophies), pending: array(pending), menus: array(menu), nextEffectId: integer(1),
  preview: object({ effectiveLength: integer(0, 36), valid: bool, damage: int, leech: int, spikes: int, fire: int, resources: array(int, 5, 6),
    enemies: array(object({ slot, damage: int, healthLoss: int, lethal: bool, transforms: bool }), 0, 36) }),
  resumePhase: nullable(oneOf('enemy-attack', 'end-turn', 'input')), menuResumePhase: nullable(phase), lastDamage: cause,
  outcome: nullable(object({ won: bool, cause: (v, p) => { if (v !== 'sprint') cause(v, p); }, turn: natural })),
  moving: array(object({ slot, from: point, to: point, spawned: bool }), 0, 36), pretzel: shape(baseline.pretzel),
  scoreResources: object({ collected: array(int, 5, 5), preview: array(int, 5, 5) }), sprintWon: bool,
  achievementQueue: array(object({ id: integer(0, 77), progress: (v, p) => { num(v, p); if ((v as number) < 0 || (v as number) > 100) fail(p, 'progress outside 0..100'); } })),
  rng: object({ seeds: array(integer(0, 4294967295), 6, 6), calls: integer(0, Number.MAX_SAFE_INTEGER) }), options: object(optionFields), diagnostics: array(str),
};
const unique = (values: unknown[], p: string): void => { if (new Set(values).size !== values.length) fail(p, 'duplicates'); };
export function validateRun(value: unknown): asserts value is RunState {
  object(runFields)(value, 'run');
  const s = value as RunState;
  if (s.health > s.base.maxHealth + s.equipmentStats.maxHealth || s.armour > s.equipmentStats.maxArmour) fail('run', 'player health/armour exceeds maximum');
  if (s.phase !== 'idle' && s.board.some(t => t.type === 7)) fail('run.board', 'empty slot in active run');
  if (s.challenge !== (s.mode !== GameMode.MODE_CLASSIC)) fail('run.challenge', 'mode mismatch');
  if (s.inputReady !== (s.phase === 'input')) fail('run.inputReady', 'phase mismatch');
  s.board.forEach((t, i) => { if (t.x !== i % 6 || t.y !== Math.floor(i / 6)) fail(`run.board[${i}]`, 'slot coordinates mismatch'); });
  s.equipment.forEach((item, i) => { if (item.type !== i) fail(`run.equipment[${i}].type`, 'slot mismatch'); });
  if (s.skills.filter(Boolean).length !== s.selectedSkillCount) fail('run.selectedSkillCount', 'occupied slots mismatch');
  unique(s.skills.filter(k => k !== null).map(k => k.id), 'run.skills');
  unique(s.chain.nodes, 'run.chain.nodes'); unique(s.chain.ignored, 'run.chain.ignored');
  if (s.chain.ignored.some(i => !s.chain.nodes.includes(i))) fail('run.chain.ignored', 'not in chain');
  if (s.chain.nodes.some(i => !s.board[i]!.selected) || s.board.some((t, i) => t.selected && !s.chain.nodes.includes(i))) fail('run.chain', 'selected flags mismatch');
  unique([...s.pending, ...s.menus].map(e => e.id), 'run.queues');
  if ([...s.pending, ...s.menus].some(e => e.id >= s.nextEffectId)) fail('run.nextEffectId', 'must exceed all queued IDs');
  for (const [i, m] of s.menus.entries()) {
    unique(m.selected, `run.menus[${i}].selected`);
    if (m.selected.some(n => n >= m.candidates.length) || m.selected.length > (m.kind === 'level' ? 2 : 1)) fail(`run.menus[${i}].selected`, 'invalid choice');
  }
  if (s.phase === 'menu' && (!s.menus.length || s.menuResumePhase === null)) fail('run.menus', 'missing menu continuation');
  if (s.phase !== 'menu' && (s.menus.length || s.menuResumePhase !== null)) fail('run.menus', 'unexpected menu');
  if (s.phase === 'falling' || s.phase === 'arrivals') { if (s.resumePhase === null) fail('run.resumePhase', 'missing continuation'); }
  if (['input', 'idle', 'ended'].includes(s.phase) && (s.pending.length || s.moving.length || s.menus.length || s.resumePhase !== null || s.menuResumePhase !== null)) fail('run.phase', 'unexpected pending work');
  if ((s.phase === 'ended') !== (s.outcome !== null)) fail('run.outcome', 'phase mismatch');
  if (s.outcome && (s.outcome.turn !== s.turn || s.outcome.won !== s.sprintWon)) fail('run.outcome', 'result mismatch');
  if (s.sprintWon && s.mode !== GameMode.MODE_SPRINT) fail('run.sprintWon', 'not Sprint');
  for (const [key, b] of Object.entries(s.resources)) if (b.banked % 100 !== 0) fail(`run.resources.${key}.banked`, 'not a multiple of 100');
}
const score = object({ name: str, turn: natural, xp: int, gold: int, upgrade: int, score: int, skills: array(nullable(skillId), 4, 4) });
const profileFields: Record<keyof ProfileState, Validator> = {
  classes: array(object({ ...configFields, level: integer(0, 10), games: natural, kills: natural, bestScores: array(natural, 3, 3) }), 10, 10),
  achievements: (v, p) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail(p, 'expected progress map');
    for (const [key, progress] of Object.entries(v as object)) {
      if (!/^[1-9][0-9]?$/.test(key) || Number(key) > 77 || Number(key) === 45) fail(`${p}.${key}`, 'invalid or untriggerable achievement');
      num(progress, `${p}.${key}`); if (progress < 0 || progress > 100) fail(`${p}.${key}`, 'progress outside 0..100');
    }
  },
  highScores: array(array(score, 0, 10), 6, 6), playerName: str, lastScoreIndices: array(nullable(integer(0, 9)), 6, 6), trophyRemaining: int,
};
export function validateProfile(value: unknown): asserts value is ProfileState {
  object(profileFields)(value, 'profile');
  const p = value as ProfileState;
  if (p.lastScoreIndices.filter(i => i !== null).length > 1) fail('profile.lastScoreIndices', 'only the latest score category may be highlighted');
  p.classes.forEach((cls, i) => { if (cls.classId !== i) fail(`profile.classes[${i}]`, 'class ID mismatch'); });
  p.highScores.forEach((list, i) => {
    if (list.some((r, j) => j > 0 && list[j - 1]!.score < r.score)) fail(`profile.highScores[${i}]`, 'not descending');
    const last = p.lastScoreIndices[i];
    if (last !== null && (last === undefined || last >= list.length)) fail(`profile.lastScoreIndices[${i}]`, 'missing record');
  });
}
// Preserve IEEE negative zero as well as every finite JSON number. No other custom tags.
function encode(kind: 'run' | 'profile', state: object): string {
  return JSON.stringify({ format: 'dungeon-raid-port', version: SAVE_VERSION, kind, state }, (_, v: unknown) => typeof v === 'number' && Object.is(v, -0) ? { $number: '-0' } : v);
}
function decode(json: string, kind: 'run' | 'profile'): unknown {
  if (typeof json !== 'string') fail('root', 'expected JSON string');
  let result: unknown;
  try { result = JSON.parse(json, (_, v: unknown) => v && typeof v === 'object' && Object.keys(v).length === 1 && (v as Record<string, unknown>).$number === '-0' ? -0 : v); }
  catch { return fail('root', 'malformed JSON'); }
  object({ format: oneOf('dungeon-raid-port'), version: oneOf(SAVE_VERSION), kind: oneOf(kind), state: () => {} })(result, 'root');
  return (result as { state: unknown }).state;
}
/** No input mutation: persist json; consume the returned save-triggered achievement requests
 * once through applyAchievementRequests. The state in json is EXACTLY the input state. */
export function serializeRun(state: RunState): { json: string; achievementQueue: ReturnType<typeof saveAchievementRequests> } {
  validateRun(state); return { json: encode('run', state), achievementQueue: saveAchievementRequests(state) };
}
export function deserializeRun(json: string): RunState { const state = decode(json, 'run'); validateRun(state); return state; }
export function serializeProfile(profile: ProfileState): string { validateProfile(profile); return encode('profile', profile); }
export function deserializeProfile(json: string): ProfileState { const profile = decode(json, 'profile'); validateProfile(profile); return profile; }
