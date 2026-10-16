import type { CosmeticSample } from '../src/core/cosmetics';
import { eventEffects, type VisualEffect } from './effects';
import { frameSounds, resourceSound, sampleSounds } from './cues';
import { Tween } from './animation';
import type { GameEvent } from '../src/core/engine';
import type { PendingEffect, RunState } from '../src/core/state';
import { TileType } from '../src/core/data';
import { Fall, TokenFlight, type Animation, type Point } from './animation';
import { SilentAudio, type AudioPort } from './audio';
export const boardTop = (s: RunState) => 79 + (s.challenge ? 5 : 0);
export const tileCenter = (s: RunState, slot: number): Point => ({ x: 1 + (slot % 6 + .5) * 53, y: boardTop(s) + (Math.floor(slot / 6) + .5) * 53 });
/** Interface::GetTarget @0x49028. Placeholder HUD uses these confirmed logical anchors. */
export function tokenTarget(s: RunState, e: Extract<PendingEffect, { kind: 'resource' }>): Point {
  if (e.variant === 1 && e.skillSlot !== null) return { x: 32.5 + 59 * e.skillSlot, y: 32.5 };
  if (e.variant === 3 || e.tileType === TileType.TILE_POTION) return { x: 273, y: 470 - 64 * s.health / Math.max(1, s.base.maxHealth + s.equipmentStats.maxHealth) };
  if (e.tileType === TileType.TILE_SKULL) return { x: 110 + s.resources.xp.remainder, y: 468 };
  if (e.tileType === TileType.TILE_COIN) return { x: 13 + 16 * Math.floor(s.resources.gold.remainder / 20), y: 476 - 3 * (s.resources.gold.remainder % 20) };
  return { x: 159, y: s.armour < s.equipmentStats.maxArmour ? 425 : 450 };
}
export interface PresentedToken { flight: TokenFlight; tileType: number; xp: boolean; appearance: number }
export interface PresentationFrame {
  before: RunState; after: RunState; events: GameEvent[];
  animations: Animation[]; falls: Map<number, Fall>;
  tokens: PresentedToken[]; launches: PresentedToken[];
  visuals: VisualEffect[]; sounds: number[]; arrivalSounds: number[]; started: boolean;
}
export class PresentationTimeline {
  display: RunState;
  paused = false;
  speed: 'original' | 'fast' = 'original';
  tokens: PresentedToken[] = [];
  private sounded = new Set<number>();
  private play(id: number) { if (!this.sounded.has(id)) { this.sounded.add(id); this.audio.play(id, -1); } }
  visuals: VisualEffect[] = [];
  private queue: PresentationFrame[] = [];
  private effects = new Map<number, { effect: PendingEffect; origin: Point; sample?: CosmeticSample; appearance: number; token?: PresentedToken }>();
  constructor(state: RunState, readonly audio: AudioPort = new SilentAudio()) { this.display = structuredClone(state); }
  get current() { return this.queue[0]; }
  get busy() { return this.queue.length > 0; }
  get length() { return this.queue.length; }
  reset(state: RunState) { this.queue = []; this.effects.clear(); this.visuals = []; this.tokens = []; this.sounded.clear(); this.display = structuredClone(state); }
  enqueue(before: RunState, after: RunState, events: GameEvent[], samples: CosmeticSample[] = []) {
    const f: PresentationFrame = { before: structuredClone(before), after: structuredClone(after), events: structuredClone(events), animations: [], falls: new Map(), tokens: [], launches: [], visuals: eventEffects(before, after, events, samples), sounds: [...frameSounds(before,after,events), ...sampleSounds(samples,events,before)], arrivalSounds: [], started: false };
    for (const e of events) {
      if (e.type === 'EffectQueued') {
        const effect = e.effect, slot = 'targetSlot' in effect ? effect.targetSlot : null;
        const origin = slot === null || slot === undefined ? { x: 160, y: 238 } : tileCenter(before, slot);
        const appearance = slot == null ? 0 : before.board[slot]?.appearance ?? 0;
        const sample = samples.find(sample => (sample.kind === 'token' || sample.kind === 'xp-token') && sample.eventIndex === events.indexOf(e));
        const token = effect.kind === 'resource' ? this.makeToken(effect, origin, appearance, sample) : undefined;
        this.effects.set(effect.id, { effect, origin, appearance, sample, token });
        if (token) f.launches.push(token);
      }
      if (e.type === 'EffectConsumed') {
        const saved = this.effects.get(e.id), effect = saved?.effect ?? before.pending.find(p => p.id === e.id);
        if (effect?.kind === 'resource') {
          const token = saved?.token ?? this.makeToken(effect, effect.targetSlot === null ? { x: 160, y: 238 } : tileCenter(before, effect.targetSlot), saved?.appearance ?? 0);
          if (!saved?.token) f.launches.push(token); // Restored pending effect has no creation frame.
          f.tokens.push(token); f.animations.push(token.flight);
          const sound = resourceSound(before, effect); if (sound !== null) f.arrivalSounds.push(sound);
        }
        this.effects.delete(e.id);
      }
    }
    // moving contains the final slot payload; TileMoved alone is not enough after cascades.
    if (events.some(e => e.type === 'TileMoved')) for (const m of after.moving) {
      const fall = new Fall(boardTop(after) + m.from.y * 53, boardTop(after) + m.to.y * 53);
      f.falls.set(m.slot, fall); f.animations.push(fall);
    }
    // Labels/particles overlap subsequent phases; they are not an extra .3s rule barrier.
    // ProcessAttack @0x311b8: attack flare falls from 1 to 0 at 4.5/s.
    if (events.some(e => e.type === 'EnemyAttack')) f.animations.push(new Tween(0, 1, 1 / 4.5));
    if (!this.busy && f.animations.length === 0) { this.complete(f); return; }
    this.queue.push(f);
  }
  private makeToken(effect: Extract<PendingEffect, { kind: 'resource' }>, origin: Point, appearance: number, sample?: CosmeticSample): PresentedToken {
    const v = sample?.values, length = Math.hypot(v?.[0] ?? .1, v?.[1] ?? 0) || 1;
    const direction = v ? { x: v[0]! / length * .1, y: v[1]! / length * .1 } : undefined;
    const xp = effect.tileType === TileType.TILE_SKULL && effect.variant !== 3;
    return { flight: new TokenFlight({ ...origin }, () => tokenTarget(this.display, effect), direction,
      (v ? v[4] ?? v[2]! : xp ? 5 : 6.5) * 320, v?.[3]), tileType: effect.tileType, xp, appearance };
  }
  private start(f: PresentationFrame) {
    if (f.started) return; f.started = true; this.visuals.push(...f.visuals); this.tokens.push(...f.launches);
    for (const id of f.sounds) this.play(id);
  }
  private complete(f: PresentationFrame) {
    this.start(f);
    this.display = f.after;
    for (const id of f.arrivalSounds) this.play(id);
    if (f.after.phase === 'ended') this.effects.clear();
  }
  /** Presentation only. GameSession already drained rules in FIFO order, stopping at input/menu/end. */
  finish() {
    if (this.paused) return;
    this.sounded.clear();
    while (this.current) { const f = this.queue.shift()!; this.complete(f); }
    for (const token of this.tokens) { token.flight.position = { ...token.flight.target() }; token.flight.done = true; }
    this.tokens = []; this.visuals = [];
  }
  update(dt: number) {
    if (this.paused || !Number.isFinite(dt) || dt <= 0) return;
    this.sounded.clear();
    dt *= this.speed === 'fast' ? 2 : 1;
    // Every active token flies in the same frame (Game::Process @0x339ac).
    // Commit display snapshots FIFO even when a later token arrives first.
    if (this.current) this.start(this.current);
    for (const token of this.tokens) if (!token.flight.done) token.flight.update(dt);
    this.tokens = this.tokens.filter(t => !t.flight.done);
    for (const effect of this.visuals) effect.update(dt);
    this.visuals = this.visuals.filter(e => !e.done);
    let spent = false;
    while (this.current) {
      const f = this.current; this.start(f);
      if (f.animations.some(a => !a.done)) {
        if (spent) break;
        spent = true;
        for (const a of f.animations) if (!a.done && !(a instanceof TokenFlight)) a.update(dt);
        if (f.animations.some(a => !a.done)) break;
      }
      this.queue.shift(); this.complete(f);
    }
  }
}
