import type { RngHook } from '../src/core/rng';
import type { CosmeticSample } from '../src/core/cosmetics';
import { adjacent, canMatchType } from '../src/core/chain';
import { applyAchievementRequests, consumeAchievements } from '../src/core/achievements';
import { applyClassLevelChanged, applyRunResult, prepareNewRun } from '../src/core/profile';
import { deserializeProfile, deserializeRun, serializeProfile, serializeRun } from '../src/core/save';
import { canCastSkill } from '../src/core/skills';
import { SpecialTileType, TileType } from '../src/core/data';
import { step, type Action, type GameEvent } from '../src/core/engine';
import { createProfileState, createRunState, type RunState } from '../src/core/state';
import { scrollNativeWord } from './scroll-i1';
import { PresentationTimeline } from './timeline';
import { SilentAudio, type AudioPort } from './audio';
import type { StoragePort } from './storage';
import { AchievementNotices } from './achievement-notices';
export const SESSION_KEY = 'dungeonraid.session.v2';
export const ENGINE_OPTIONS = { scrollFilter: 'supplied-native-fixture' as const };
export const HOOKS = { scrollNativeWord };
/** Atomic single-key run/profile envelope, including terminal run removal. Old v1 keys read only. */
export class GameSession {
  state = createRunState(ENGINE_OPTIONS);
  profile = createProfileState();
  readonly timeline: PresentationTimeline;
  readonly notices = new AchievementNotices();
  readonly log: string[] = [];
  readonly events: GameEvent[] = [];
  error: string | null = null;
  storageError: string | null = null;
  private settled = false;
  /** Rule events for diagnostics; presentation/audio must consume the ordered timeline instead. */
  onRng?: RngHook;
  onEvents?: (events: readonly GameEvent[], cosmetics: readonly CosmeticSample[]) => void;
  constructor(readonly storage: StoragePort, audio: AudioPort = new SilentAudio()) {
    try {
      const raw = storage.getItem(SESSION_KEY);
      if (raw) {
        const record = JSON.parse(raw) as { version: number; profile: string; run: string | null };
        if (record.version !== 2) throw new Error('Unsupported session version');
        const profile = deserializeProfile(record.profile);
        const state = record.run ? deserializeRun(record.run) : this.state;
        this.profile = profile; this.state = state;
      } else {
        const p = storage.getItem('dungeonraid.profile.v1'), r = storage.getItem('dungeonraid.run.v1');
        if (p) this.profile = deserializeProfile(p);
        if (r) this.state = deserializeRun(r);
      }
    } catch (err) { this.error = `Save: ${(err as Error).message}`; }
    this.timeline = new PresentationTimeline(this.state, audio);
    try { this.timeline.speed = storage.getItem('dungeonraid.animationSpeed') === 'fast' ? 'fast' : 'original'; } catch { /* Keep the default when storage is unavailable. */ }
  }
  /** Clear the atomic envelope first; never allow pagehide to resurrect the old run. */
  clearProfile(): boolean {
    const profile=createProfileState(), state=createRunState(ENGINE_OPTIONS);
    try { this.storage.setItem(SESSION_KEY,JSON.stringify({version:2,profile:serializeProfile(profile),run:null})); }
    catch(err){this.storageError=`Save unavailable: ${(err as Error).message}`;return false;}
    this.profile=profile;this.state=state;this.timeline.reset(state);this.settled=false;
    this.events.length=0;this.log.length=0;this.notices.clear();this.error=null;this.storageError=null;
    // The v2 envelope shadows these obsolete migration sources even if removal fails.
    try{this.storage.removeItem?.('dungeonraid.profile.v1');this.storage.removeItem?.('dungeonraid.run.v1');}catch{}
    return true;
  }
  get busy() { return this.timeline.busy; }
  start(options: Omit<Extract<Action, { type: 'NewGame' }>, 'type'>) {
    const initial = prepareNewRun(this.profile, createRunState(ENGINE_OPTIONS));
    // Validate before replacing an existing run.
    const result = step(initial, { type: 'NewGame', ...options }, { ...HOOKS, rng: this.onRng });
    this.state = result.state; this.settled = false; this.error = null; this.events.length = 0; this.log.length = 0;
    this.timeline.reset(initial); this.accept(initial, result.events, result.cosmetics); this.save();
  }
  resume() { this.drain(); this.save(); }
  dispatch(action: Action) {
    if (this.busy || this.timeline.paused) return false;
    try {
      this.advance(action); this.drain(); this.error = null; this.save(); return true;
    } catch (err) { this.error = `${action.type}: ${(err as Error).message}`; this.log.push(this.error); return false; }
  }
  private advance(action: Action) {
    const before = this.state, result = step(before, action, { ...HOOKS, rng: this.onRng });
    this.state = result.state; this.accept(before, result.events, result.cosmetics);
  }
  private accept(before: RunState, events: GameEvent[], cosmetics: CosmeticSample[]) {
    for (const event of events) {
      if (event.type === 'ClassLevelChanged') {
        const before = this.profile.achievements;
        this.profile = applyClassLevelChanged(this.profile, event, this.state.difficulty);
        this.notices.add(Object.entries(this.profile.achievements).filter(([id,p])=>p===100&&before[Number(id)]!==100).map(([id])=>Number(id)));
      }
      this.events.push(event);
      if (event.type !== 'ChainPreview') this.log.push(JSON.stringify(event));
    }
    this.events.splice(0, Math.max(0, this.events.length - 1000));
    this.log.splice(0, Math.max(0, this.log.length - 200));
    this.timeline.enqueue(before, this.state, events, cosmetics);
    this.onEvents?.(structuredClone(events), structuredClone(cosmetics));
  }
  private drain() {
    // Retain P2 order exactly: fall completion, FIFO pending, phase; menus are explicit user actions.
    for (let n = 0; n < 2000; n++) {
      if (['idle', 'input', 'menu', 'ended'].includes(this.state.phase)) break;
      if (this.state.phase === 'falling') this.advance({ type: 'AdvancePhase' });
      else if (this.state.pending.length) this.advance({ type: 'ConsumeEffect', id: this.state.pending[0]!.id });
      else this.advance({ type: 'AdvancePhase' });
      if (n === 1999) throw new Error('Rule drain exceeded 2000 steps');
    }
    const drained = consumeAchievements(this.profile, this.state);
    this.profile = drained.profile; this.state = drained.state;
    for (const event of drained.events) if (event.unlocked) this.log.push(`Achievement ${event.id}`);
    this.notices.add(drained.events.filter(e=>e.unlocked).map(e=>e.id));
    if (this.state.phase === 'ended' && !this.settled) { this.profile = applyRunResult(this.profile, this.state); this.settled = true; }
  }
  save() {
    let run: string | null = null;
    if (!['idle', 'ended'].includes(this.state.phase)) {
      const saved = serializeRun(this.state); run = saved.json;
      const achievements = applyAchievementRequests(this.profile, this.state.difficulty, saved.achievementQueue);
      this.profile = achievements.profile;
      this.notices.add(achievements.events.filter(e=>e.unlocked).map(e=>e.id));
      this.profile.trophyRemaining = this.state.trophies.remaining;
    }
    try {
      this.storage.setItem(SESSION_KEY, JSON.stringify({ version: 2, profile: serializeProfile(this.profile), run }));
      this.storageError = null;
    } catch (err) { this.storageError = `Save unavailable: ${(err as Error).message}`; }
  }
  setAnimationSpeed(speed: 'original' | 'fast') {
    this.timeline.speed = speed;
    try { this.storage.setItem('dungeonraid.animationSpeed', speed); } catch { /* Preference is usable for this session. */ }
  }
  skip() {
    if (this.timeline.paused) return false;
    this.drain(); this.timeline.finish(); this.save(); return true;
  }
  update(dt: number) { this.timeline.update(dt); }
}
/** Exact minimum-effective-chain search shared by no-move diagnostics and browser QA. */
export function legalChain(s: RunState): number[] | null {
  const effective = (nodes: number[]) => nodes.filter((slot, i) => i === 0 || !s.board[nodes[i - 1]!]!.arrow || [TileType.TILE_SKULL, TileType.TILE_SWORD].includes(s.board[slot]!.type)).length;
  const visit = (nodes: number[]): number[] | null => {
    if (effective(nodes) >= 3) return nodes;
    if (nodes.length >= 5) return null;
    for (let i = 0; i < 36; i++) {
      if (nodes.includes(i) || (nodes.length && !adjacent(s.board[i]!, s.board[nodes.at(-1)!]!)) || !canMatchType(s, i, nodes)) continue;
      const result = visit([...nodes, i]); if (result) return result;
    }
    return null;
  };
  return visit([]);
}
export function isStuck(s: RunState) {
  return s.phase === 'input' && !s.skills.some((_, i) => canCastSkill(s, i)) &&
    !s.board.some(t => t.specialType === SpecialTileType.SPECIAL_TILE_TROPHY && !t.frozen && !t.matched) && !legalChain(s);
}
