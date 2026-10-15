import { backtrack, cancelChain, commitChain, selectTile } from './chain';
import { advancePhase, chooseMenu, consumeEffect } from './turn';
import type { RuleContext, RuleEvent, RuleHooks } from './combat';
import { slotIndex } from './board';
import { ALL_RAND_TYPES, Difficulty, GameMode, getClass } from './data';
import { initialiseBoard, initialiseItemAppearance, initialisePromotion, type BoardEvent } from './board';
import { NativeRng, type RngHook } from './rng';
import { createRunState, defaultCharacter, initialisePlayer, type Point, type RunState } from './state';

export type Action =
  | { type: 'NewGame'; seed: number; classId: number; difficulty: number; mode: number }
  | { type: 'SelectTile'; at: Point }
  | { type: 'ExtendChain'; at: Point }
  | { type: 'Backtrack'; at: Point; slot?: never }
  | { type: 'Backtrack'; slot: number; at?: never } // T03 compatibility alias
  | { type: 'CommitChain' }
  | { type: 'ChooseMenuOption'; menuId: number; option: 'skip' | 'confirm' }
  | { type: 'CancelChain' }
  | { type: 'SubmitChain' }
  | { type: 'CastSkill'; slot: number; source: 'manual' | 'scroll' }
  | { type: 'SelectMenuItem'; menuId: number; index: number }
  | { type: 'ConfirmMenu'; menuId: number }
  | { type: 'ClaimTrophy'; slot: number }
  | { type: 'ConsumeEffect'; id: number }
  | { type: 'AdvancePhase' };
export type GameEvent = RuleEvent;
export class UnimplementedActionError extends Error {
  constructor(readonly actionType: string) { super(`Action ${actionType} is not implemented (T04–T07)`); this.name = 'UnimplementedActionError'; }
}
/** Only public transition boundary. Trace callback is external, never stored in serializable state. */
export function step(input: RunState, action: Action, hooks: RuleHooks & { rng?: RngHook } = {}): { state: RunState; events: GameEvent[] } {
  if (action.type !== 'NewGame') {
    const state = structuredClone(input);
    const events: GameEvent[] = [];
    const c: RuleContext = { rng: new NativeRng(state.rng, hooks.rng), events, hooks };
    switch (action.type) {
      case 'SelectTile': case 'ExtendChain': case 'Backtrack': case 'CancelChain': case 'CommitChain': case 'SubmitChain':
        if (state.phase !== 'input') throw new Error(`Cannot select or commit during ${state.phase}`);
        if (action.type === 'SelectTile' || action.type === 'ExtendChain') selectTile(state, action.at, c);
        else if (action.type === 'Backtrack') backtrack(state, action.at ? slotIndex(action.at.x, action.at.y) : action.slot, c);
        else if (action.type === 'CancelChain') cancelChain(state, c);
        else commitChain(state, c);
        break;
      case 'ConsumeEffect': consumeEffect(state, action.id, c); break;
      case 'AdvancePhase': advancePhase(state, c); break;
      case 'ChooseMenuOption': case 'ConfirmMenu': chooseMenu(state, action.menuId, c); break;
      default: throw new UnimplementedActionError(action.type);
    }
    return { state, events };
  }
  getClass(action.classId);
  if (!Object.values(Difficulty).includes(action.difficulty)) throw new RangeError('Invalid difficulty');
  if (!Object.values(GameMode).includes(action.mode)) throw new RangeError('Invalid mode');
  if (!Number.isInteger(action.seed) || !Number.isFinite(action.seed)) throw new RangeError('Seed must be a finite integer');
  const state = structuredClone(input); // Exactly one deep copy at the step boundary.
  const classLevels = [...state.classLevels];
  Object.assign(state, createRunState(state.options));
  state.classLevels = classLevels;
  state.character = defaultCharacter(action.classId);
  state.difficulty = action.difficulty;
  state.mode = action.mode;
  state.challenge = action.mode !== GameMode.MODE_CLASSIC;
  const rng = new NativeRng(state.rng, hooks.rng);
  rng.setRandSeed(action.seed, ALL_RAND_TYPES);
  rng.flushRandSeeds();
  const boardEvents: BoardEvent[] = [];
  initialisePromotion(state);
  initialiseBoard(state, rng, boardEvents, hooks);
  initialisePlayer(state);
  initialiseItemAppearance(state, rng);
  if (state.options.specialPendingCombat === 'ordinary-placeholder') state.diagnostics.push('Legacy special-pending fixtures explicitly use ordinary combat; new enemies always have special stats');
  state.inputReady = true;
  state.phase = 'input';
  const events: GameEvent[] = [...boardEvents];
  events.push({ type: 'NewGameStarted', seed: action.seed }, { type: 'PhaseChanged', phase: state.phase });
  events.push(...state.diagnostics.map(message => ({ type: 'CompatibilityNotice' as const, message })));
  return { state, events };
}
