import presetData from '../../data/sfx.json';
import { synthesize, validateParams, type SynthParams } from './synth';

export interface SoundVariant { variant: number; name: string; params: SynthParams }
export interface SoundPreset {
  id: number;
  name: string;
  designDescription: string;
  timbre: string;
  variants: SoundVariant[];
}
// JSON is checked once before being exposed to either the UI or the renderer.
for (const sound of presetData.sounds) for (const variant of sound.variants) validateParams(variant.params);
export const soundPresets: readonly SoundPreset[] = presetData.sounds as SoundPreset[];
export const MAX_VOICES = 8; // SoundEngine.java: SoundPool(8, 3, 100), spec 12.
export const MIX_HEADROOM = 1 / MAX_VOICES;

export interface Playback {
  /** Resolves on natural completion, preemption, stopAll, or disposal. */
  finished: Promise<void>;
  stop(): void;
}
interface Voice { source: AudioBufferSourceNode; handle: Playback; finish(): void; endsAt: number }
export interface PlayerOptions {
  context?: AudioContext;
  volume?: number;
  muted?: boolean;
}

/** Zero-based variants match GetSoundMapping's RandI(0, n-1, COSMETIC).
 * This class never selects variants and never touches any RNG. */
export class SfxPlayer {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private readonly ownsContext: boolean;
  private buffers = new Map<string, AudioBuffer>();
  private voices: Voice[] = [];
  private loading: Promise<void> | undefined;
  private disposed = false;
  private volumeValue = 1;
  private mutedValue = false;
  private unlockBindings = new Set<() => void>();

  constructor(options: PlayerOptions = {}) {
    this.context = options.context;
    this.ownsContext = !options.context;
    this.setVolume(options.volume ?? 1);
    this.mutedValue = options.muted ?? false;
  }
  get volume(): number { return this.volumeValue; }
  get muted(): boolean { return this.mutedValue; }
  get ready(): boolean { return this.buffers.size === 70; }
  get activeVoices(): number { return this.voices.length; }

  private ensureContext(): AudioContext {
    if (this.disposed) throw new Error('SfxPlayer is disposed');
    this.context ??= new AudioContext();
    if (this.context.state === 'closed') throw new Error('AudioContext is closed');
    if (!this.master) {
      this.master = this.context.createGain();
      this.master.gain.value = this.mutedValue ? 0 : this.volumeValue * MIX_HEADROOM;
      this.master.connect(this.context.destination);
    }
    return this.context;
  }

  /** Pre-render everything once at the context's sample rate. Safe before a gesture.
   * Yields between sound types so the loading page can paint. No playback occurs. */
  preload(): Promise<void> {
    const context = this.ensureContext();
    this.loading ??= (async () => {
      for (const sound of soundPresets) {
        if (this.disposed) throw new Error('SfxPlayer disposed during preload');
        for (const variant of sound.variants) {
          this.buffers.set(`${sound.id}:${variant.variant}`, synthesize(variant.params, context));
        }
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
      if (this.disposed) throw new Error('SfxPlayer disposed during preload');
    })();
    return this.loading;
  }

  /** Call directly in a trusted click/pointer/key handler: resume happens before any await. */
  async unlock(): Promise<boolean> {
    const context = this.ensureContext();
    if (context.state !== 'running') await context.resume();
    await this.preload();
    return !this.disposed && context.state === 'running';
  }

  /** Retry on subsequent gestures (also after background suspension). Caller owns errors. */
  bindUnlock(target: EventTarget, onError: (error: unknown) => void = () => {}): () => void {
    if (this.disposed) throw new Error('SfxPlayer is disposed');
    const handler = () => { void this.unlock().catch(onError); };
    const events = ['pointerdown', 'touchend', 'keydown'];
    for (const event of events) target.addEventListener(event, handler);
    const detach = () => {
      for (const event of events) target.removeEventListener(event, handler);
      this.unlockBindings.delete(detach);
    };
    this.unlockBindings.add(detach);
    return detach;
  }

  setVolume(value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('Volume must be in [0, 1]');
    this.volumeValue = value;
    this.updateGain();
  }
  setMuted(value: boolean): void {
    this.mutedValue = value;
    if (value) this.stopAll();
    this.updateGain();
  }
  private updateGain(): void {
    if (this.master && this.context) {
      // Small ramp avoids clicks when adjusting volume. Muting stops current sources too.
      this.master.gain.setTargetAtTime(this.mutedValue ? 0 : this.volumeValue * MIX_HEADROOM, this.context.currentTime, 0.005);
    }
  }

  /** Returns null when muted, locked, suspended or not preloaded. Requests are never
   * buffered for a later burst. Invalid IDs/variants always throw, even when muted.
   * A singleton may omit variant; multi-variant sounds require the caller's choice. */
  play(soundId: number, variant?: number): Playback | null {
    const sound = soundPresets.find(preset => preset.id === soundId);
    if (!sound) throw new RangeError(`Unknown sound id ${soundId}`);
    if (variant === undefined && sound.variants.length > 1) throw new RangeError(`Sound ${soundId} requires a caller-selected variant`);
    const index = variant ?? 0;
    if (!Number.isInteger(index) || index < 0 || index >= sound.variants.length) throw new RangeError(`Invalid variant ${index} for sound ${soundId}`);
    if (this.disposed) throw new Error('SfxPlayer is disposed');
    const context = this.context;
    const buffer = this.buffers.get(`${soundId}:${index}`);
    if (this.mutedValue || this.volumeValue === 0 || context?.state !== 'running' || !this.master || !buffer) return null;
    // onended may be delayed on the main thread; prune already elapsed voices first.
    for (const voice of [...this.voices]) if (voice.endsAt <= context.currentTime) voice.finish();
    // Original SoundPool eviction is unspecified. Our explicit port policy: oldest first.
    if (this.voices.length >= MAX_VOICES) this.voices[0]!.handle.stop();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = false;
    source.playbackRate.value = 1;
    source.connect(this.master);
    let resolveFinished!: () => void;
    const finished = new Promise<void>(resolve => { resolveFinished = resolve; });
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      source.onended = null;
      source.disconnect();
      this.voices = this.voices.filter(voice => voice.source !== source);
      resolveFinished();
    };
    const handle: Playback = { finished, stop: () => { if (!ended) { source.stop(); finish(); } } };
    source.onended = finish;
    this.voices.push({ source, handle, finish, endsAt: context.currentTime + buffer.duration });
    try { source.start(); } catch (error) { finish(); throw error; }
    return handle;
  }

  stopAll(): void { for (const voice of [...this.voices]) voice.handle.stop(); }
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const detach of [...this.unlockBindings]) detach();
    this.stopAll();
    this.buffers.clear();
    this.master?.disconnect();
    if (this.ownsContext && this.context && this.context.state !== 'closed') await this.context.close();
  }
}
