import { cloneData } from './clone';
import { observeCosmetics, type CosmeticSample } from './cosmetics';
import { checkConfiguration, claimTrophy } from './progression';
import { castSkill } from './skills';
import { selectMenuItem } from './menus';
import type { ClassConfiguration } from './state';
import { backtrack, cancelChain, commitChain, selectTile } from './chain';
import { advancePhase, chooseMenu, consumeEffect } from './turn';
import type { RuleContext, RuleEvent, RuleHooks } from './combat';
import { slotIndex } from './board';
import { ALL_RAND_TYPES, Difficulty, GameMode, getClass } from './data';
import { initialiseBoard, initialiseItemAppearance, initialisePromotion, type BoardEvent } from './board';
import { NativeRng, type RngHook } from './rng';
import { createRunState, defaultCharacter, initialisePlayer, type Point, type RunState } from './state';

export type Action =
  | { type: 'NewGame'; seed: number; classId: number; difficulty: number; mode: number; character?: ClassConfiguration }
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
export function step(input: RunState, action: Action, hooks: RuleHooks & { rng?: RngHook } = {}): { state: RunState; events: GameEvent[]; cosmetics: CosmeticSample[] } {
  const cosmetics: CosmeticSample[] = [];
  if (action.type !== 'NewGame') {
    const state = cloneData(input);
    const events: GameEvent[] = [];
    const c: RuleContext = { rng: new NativeRng(state.rng, hooks.rng), events, hooks };
    observeCosmetics(c.rng, sample => cosmetics.push({ ...sample, eventIndex: events.length }));
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
      case 'ChooseMenuOption': case 'ConfirmMenu': chooseMenu(state, action.menuId, c, action.type === 'ChooseMenuOption' ? action.option : 'confirm'); break;
      case 'SelectMenuItem': selectMenuItem(state, action.menuId, action.index, c); break;
      case 'CastSkill':
        if (action.source === 'manual') castSkill(state, action.slot, c);
        else {
          const menu = state.menus[0], candidate = menu?.candidates[action.slot];
          if (menu?.kind !== 'shop' || candidate?.kind !== 'item' || !candidate.scroll || menu.selected.length !== 1 || menu.selected[0] !== action.slot) throw new Error('Scroll source requires the selected shop purchase');
          chooseMenu(state, menu.id, c);
        }
        break;
      case 'ClaimTrophy': claimTrophy(state, action.slot, c); break;
      default: throw new Error('Unknown action');
    }
    return { state, events, cosmetics };
  }
  getClass(action.classId);
  if (!Object.values(Difficulty).includes(action.difficulty)) throw new RangeError('Invalid difficulty');
  if (!Object.values(GameMode).includes(action.mode)) throw new RangeError('Invalid mode');
  if (!Number.isInteger(action.seed) || !Number.isFinite(action.seed)) throw new RangeError('Seed must be a finite integer');
  const state = cloneData(input); // Exactly one deep copy at the step boundary.
  const classLevels = [...state.classLevels];
  const trophyRemaining = state.trophies.remaining;
  Object.assign(state, createRunState(state.options));
  state.classLevels = classLevels;
  if (state.options.trophyInterval === 'carry-across-runs') state.trophies.remaining = trophyRemaining;
  if (action.character && action.character.classId !== action.classId) throw new Error('Character classId mismatch');
  state.character = action.character ? checkConfiguration(action.character) : defaultCharacter(action.classId);
  state.difficulty = action.difficulty;
  state.mode = action.mode;
  state.challenge = action.mode !== GameMode.MODE_CLASSIC;
  const rng = new NativeRng(state.rng, hooks.rng);
  rng.setRandSeed(action.seed, ALL_RAND_TYPES);
  rng.flushRandSeeds();
  const boardEvents: BoardEvent[] = [];
  observeCosmetics(rng, sample => cosmetics.push({ ...sample, eventIndex: boardEvents.length }));
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
  return { state, events, cosmetics };
}
