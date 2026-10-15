import { ALL_RAND_TYPES, Difficulty, GameMode, getClass } from './data';
import { initialiseBoard, initialiseItemAppearance, initialisePromotion, type BoardEvent } from './board';
import { NativeRng, type RngHook } from './rng';
import { createRunState, defaultCharacter, initialisePlayer, type Point, type RunState, type TurnPhase } from './state';

export type Action =
  | { type: 'NewGame'; seed: number; classId: number; difficulty: number; mode: number }
  | { type: 'SelectTile'; at: Point }
  | { type: 'Backtrack'; slot: number }
  | { type: 'CancelChain' }
  | { type: 'SubmitChain' }
  | { type: 'CastSkill'; slot: number; source: 'manual' | 'scroll' }
  | { type: 'SelectMenuItem'; menuId: number; index: number }
  | { type: 'ConfirmMenu'; menuId: number }
  | { type: 'ClaimTrophy'; slot: number }
  | { type: 'ConsumeEffect'; id: number }
  | { type: 'AdvancePhase' };
export type GameEvent = BoardEvent
  | { type: 'NewGameStarted'; seed: number }
  | { type: 'PhaseChanged'; phase: TurnPhase }
  | { type: 'CompatibilityNotice'; message: string };
export class UnimplementedActionError extends Error {
  constructor(readonly actionType: string) { super(`Action ${actionType} is not implemented (T04–T07)`); this.name = 'UnimplementedActionError'; }
}
/** Only public transition boundary. Trace callback is external, never stored in serializable state. */
export function step(input: RunState, action: Action, hooks: { rng?: RngHook } = {}): { state: RunState; events: GameEvent[] } {
  if (action.type !== 'NewGame') throw new UnimplementedActionError(action.type);
  getClass(action.classId);
  if (!Object.values(Difficulty).includes(action.difficulty)) throw new RangeError('Invalid difficulty');
  if (!Object.values(GameMode).includes(action.mode)) throw new RangeError('Invalid mode');
  if (!Number.isInteger(action.seed) || !Number.isFinite(action.seed)) throw new RangeError('Seed must be a finite integer');
  const state = structuredClone(input); // Exactly one deep copy at the step boundary.
  Object.assign(state, createRunState(state.options));
  state.character = defaultCharacter(action.classId);
  state.difficulty = action.difficulty;
  state.mode = action.mode;
  state.challenge = action.mode !== GameMode.MODE_CLASSIC;
  const rng = new NativeRng(state.rng, hooks.rng);
  rng.setRandSeed(action.seed, ALL_RAND_TYPES);
  rng.flushRandSeeds();
  const boardEvents: BoardEvent[] = [];
  initialisePromotion(state);
  initialiseBoard(state, rng, boardEvents);
  initialisePlayer(state);
  initialiseItemAppearance(state, rng);
  state.inputReady = true;
  state.phase = 'input';
  const events: GameEvent[] = [...boardEvents];
  events.push({ type: 'NewGameStarted', seed: action.seed }, { type: 'PhaseChanged', phase: state.phase });
  events.push(...state.diagnostics.map(message => ({ type: 'CompatibilityNotice' as const, message })));
  return { state, events };
}
