import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import metadata from '../data/sounds.json';
import presets from '../data/sfx.json';
import * as synth from '../src/audio/synth';
import { MAX_VOICES, MIX_HEADROOM, SfxPlayer, soundPresets } from '../src/audio/player';

function hash(samples: Float32Array): string {
  let result = 2166136261;
  for (const byte of new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength)) result = Math.imul(result ^ byte, 16777619) >>> 0;
  return result.toString(16).padStart(8, '0');
}
function metrics(samples: Float32Array) {
  let peak = 0, sum = 0;
  for (const value of samples) { peak = Math.max(peak, Math.abs(value)); sum += value * value; }
  return { peak, rms: Math.sqrt(sum / samples.length) };
}
const first = soundPresets[0]!.variants[0]!.params;

describe('S01 original deterministic synthesis', () => {
  it('matches all authoritative IDs, names, zero-based variants and durations (38 / 70)', () => {
    expect(soundPresets).toHaveLength(metadata.soundCount);
    expect(soundPresets.flatMap(sound => sound.variants)).toHaveLength(metadata.fileCount);
    expect(presets.variantIndexBase).toBe(0);
    for (const [index, sound] of metadata.sounds.entries()) {
      const preset = soundPresets[index]!;
      expect([preset.id, preset.name, preset.variants.length]).toEqual([sound.id, sound.name, sound.variations]);
      for (const [i, variant] of preset.variants.entries()) {
        expect(variant.variant).toBe(i);
        expect(variant.name).toBe(sound.files[i]!.name);
        expect(variant.params.durationSeconds).toBe(sound.files[i]!.durationSeconds);
        expect(() => synth.validateParams(variant.params)).not.toThrow();
      }
    }
  });

  for (const rate of [44100, 48000]) {
    it(`renders every variant deterministically, within half a sample, finite and unclipped at ${rate} Hz`, () => {
      for (const sound of soundPresets) {
        const rmsValues: number[] = [], hashes: string[] = [];
        for (const variant of sound.variants) {
          const samples = synth.renderSamples(variant.params, rate);
          const again = synth.renderSamples(structuredClone(variant.params), rate);
          expect(hash(samples), variant.name).toBe(hash(again));
          expect(Math.abs(samples.length / rate - variant.params.durationSeconds), variant.name).toBeLessThanOrEqual(0.50001 / rate);
          const { peak, rms } = metrics(samples);
          expect(Number.isFinite(rms), variant.name).toBe(true);
          expect(peak, variant.name).toBeLessThanOrEqual(variant.params.peakLimit + 1e-7);
          expect(rms, variant.name).toBeGreaterThan(0.03);
          expect(samples[0], variant.name).toBe(0);
          expect(samples.at(-1), variant.name).toBe(0);
          rmsValues.push(rms); hashes.push(hash(samples));
        }
        // RMS is a measurable consistency proxy, not a claim of identical perceived LUFS.
        expect(20 * Math.log10(Math.max(...rmsValues) / Math.min(...rmsValues)), sound.name).toBeLessThan(1);
        expect(new Set(hashes).size, sound.name).toBe(sound.variants.length);
        if (sound.variants.length > 1) {
          expect(new Set(sound.variants.map(v => v.params.layers[0]!.frequency)).size).toBe(sound.variants.length);
        }
      }
    }, 20000);
  }

  it.each([
    null, {}, { ...first, durationSeconds: NaN }, { ...first, durationSeconds: Infinity },
    { ...first, durationSeconds: -1 }, { ...first, durationSeconds: 11 },
    { ...first, seed: -1 }, { ...first, seed: 0.5 }, { ...first, seed: 2 ** 32 },
    { ...first, targetRms: 0 }, { ...first, peakLimit: 1.1 }, { ...first, layers: [] },
    ...[
      { waveform: 'triangle' }, { frequency: NaN }, { frequency: 0 }, { gain: 2 },
      { start: .5, length: .9 }, { envelope: { attack: 0, sustain: 0, decay: 1 } },
      { envelope: { attack: .1, sustain: .3, decay: .2 } }, { lowpassHz: -1 },
      { slide: Infinity }, { vibratoDepth: 13 }, { duty: 0 }, { noiseMix: 2 },
      { phaserMix: 2 }, { repeatHz: -1 },
    ].map(patch => ({ ...first, layers: [{ ...first.layers[0], ...patch }] })),
  ])('rejects invalid JSON parameters: %#', value => { expect(() => synth.validateParams(value)).toThrow(); });

  it('rejects invalid sample rates and handles supported sample-rate endpoints', () => {
    for (const rate of [NaN, 0, 7999, 96001, 44100.5]) expect(() => synth.renderSamples(first, rate)).toThrow();
    for (const rate of [8000, 96000]) expect(metrics(synth.renderSamples(first, rate)).peak).toBeLessThan(1);
  });
  it('owns noise locally, honors seed 0, and does not use Math.random', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Global random forbidden'); });
    try {
      const params: synth.SynthParams = { ...first, seed: 0, layers: [{ ...first.layers[0]!, waveform: 'noise' }] };
      expect(hash(synth.renderSamples(params))).toBe(hash(synth.renderSamples(params)));
      expect(hash(synth.renderSamples(params))).not.toBe(hash(synth.renderSamples({ ...params, seed: 1 })));
    } finally { random.mockRestore(); }
  });
  it('copies PCM to a mono AudioBuffer at the supplied context rate', () => {
    const data = new Float32Array(Math.round(first.durationSeconds * 48000));
    const copy = vi.fn((samples: Float32Array, channel: number) => { expect(channel).toBe(0); data.set(samples); });
    const buffer = { copyToChannel: copy } as unknown as AudioBuffer;
    const createBuffer = vi.fn(() => buffer);
    expect(synth.synthesize(first, { sampleRate: 48000, createBuffer })).toBe(buffer);
    expect(createBuffer).toHaveBeenCalledWith(1, data.length, 48000);
    expect(hash(data)).toBe(hash(synth.renderSamples(first, 48000)));
  });
});

function fakeContext(initial: AudioContextState = 'running') {
  const gain = { gain: { value: 0, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
  const sources: Array<ReturnType<typeof source>> = [];
  function source() {
    return { buffer: null as AudioBuffer | null, loop: true, playbackRate: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
  }
  const context = {
    state: initial, sampleRate: 44100, currentTime: 0, destination: {},
    createGain: vi.fn(() => gain), createBufferSource: vi.fn(() => { const s = source(); sources.push(s); return s; }),
    resume: vi.fn(async () => { context.state = 'running'; }), close: vi.fn(async () => { context.state = 'closed'; }),
  };
  return { context: context as unknown as AudioContext, raw: context, sources, gain };
}

describe('S01 player scheduling and lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(synth, 'synthesize').mockImplementation(params => ({ duration: params.durationSeconds }) as AudioBuffer);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  async function loaded(initial: AudioContextState = 'running') {
    const fake = fakeContext(initial);
    const player = new SfxPlayer({ context: fake.context });
    const promise = player.preload();
    await vi.runAllTimersAsync(); await promise;
    return { ...fake, player };
  }
  it('caches all 70 buffers once and requires explicit valid multi-variant selections', async () => {
    const { player, sources } = await loaded();
    await player.preload();
    expect(synth.synthesize).toHaveBeenCalledTimes(70);
    expect(player.ready).toBe(true);
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('No random in player'); });
    expect(() => player.play(1)).toThrow(/caller-selected/);
    for (const id of [-1, 38, NaN, .5]) expect(() => player.play(id, 0)).toThrow();
    for (const variant of [-1, 3, .5, NaN]) expect(() => player.play(1, variant)).toThrow();
    expect(player.play(0)).not.toBeNull();
    expect(player.play(32, 3)).not.toBeNull();
    expect(player.play(1, 2)).not.toBeNull();
    expect(sources[2]!.buffer!.duration).toBe(metadata.sounds[1]!.files[2]!.durationSeconds);
    expect(sources[0]!.loop).toBe(false); expect(sources[0]!.playbackRate.value).toBe(1);
    expect(random).not.toHaveBeenCalled();
  });
  it('keeps eight live sources and preempts the oldest, without deduplication', async () => {
    const { player, sources } = await loaded();
    const firstHandle = player.play(0)!;
    for (let i = 0; i < 8; i++) player.play(0);
    await firstHandle.finished;
    expect(player.activeVoices).toBe(MAX_VOICES);
    expect(sources).toHaveLength(9);
    expect(sources[0]!.stop).toHaveBeenCalledOnce();
    expect(sources[1]!.stop).not.toHaveBeenCalled();
    sources[1]!.onended!();
    expect(player.activeVoices).toBe(7);
    player.stopAll(); expect(player.activeVoices).toBe(0);
  });
  it('prunes elapsed voices even before onended delivery', async () => {
    const { player, raw, sources } = await loaded();
    for (let i = 0; i < 8; i++) player.play(0);
    raw.currentTime = 1;
    player.play(0);
    expect(player.activeVoices).toBe(1);
    expect(sources[0]!.disconnect).toHaveBeenCalledOnce();
  });
  it('drops locked requests, resumes inside the gesture, and never replays dropped sounds', async () => {
    const { player, raw, sources } = await loaded('suspended');
    expect(player.play(0)).toBeNull();
    const pending = player.unlock();
    expect(raw.resume).toHaveBeenCalledOnce(); // synchronous call before awaiting preload
    expect(await pending).toBe(true);
    expect(sources).toHaveLength(0);
    expect(player.play(0)).not.toBeNull();
  });
  it('drops requests before preload; supports failed unlock retry and removable gesture hooks', async () => {
    const fake = fakeContext('suspended');
    const player = new SfxPlayer({ context: fake.context });
    expect(player.play(0)).toBeNull();
    fake.raw.resume.mockRejectedValueOnce(new Error('gesture needed'));
    await expect(player.unlock()).rejects.toThrow('gesture needed');
    const target = new EventTarget();
    const detach = player.bindUnlock(target);
    target.dispatchEvent(new Event('pointerdown'));
    expect(fake.raw.resume).toHaveBeenCalledTimes(2);
    await vi.runAllTimersAsync();
    expect(player.ready).toBe(true);
    detach(); fake.raw.state = 'suspended';
    target.dispatchEvent(new Event('keydown'));
    expect(fake.raw.resume).toHaveBeenCalledTimes(2);
  });
  it('applies volume headroom, stops on mute, and rejects bad volume', async () => {
    const { player, gain } = await loaded();
    expect(gain.gain.value).toBe(MIX_HEADROOM);
    for (const value of [-1, 1.1, NaN, Infinity]) expect(() => player.setVolume(value)).toThrow();
    player.setVolume(.5);
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(.5 * MIX_HEADROOM, 0, .005);
    const handle = player.play(0)!;
    player.setMuted(true); await handle.finished;
    expect(player.activeVoices).toBe(0); expect(player.play(0)).toBeNull();
    player.setMuted(false); expect(player.play(0)).not.toBeNull();
    player.setVolume(0); expect(player.play(0)).toBeNull();
  });
  it('releases sources, cache and listeners without closing an injected context', async () => {
    const { player, raw } = await loaded();
    const target = new EventTarget(); player.bindUnlock(target);
    const handle = player.play(0)!;
    await player.dispose(); await handle.finished; await player.dispose();
    expect(player.ready).toBe(false); expect(player.activeVoices).toBe(0); expect(raw.close).not.toHaveBeenCalled();
    target.dispatchEvent(new Event('keydown')); expect(raw.resume).not.toHaveBeenCalled();
    expect(() => player.play(0)).toThrow(/disposed/);
  });
});
