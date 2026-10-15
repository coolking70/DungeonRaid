/** Original sample synthesizer. No assets, WebAudio oscillators, or game RNG are used. */
export type Waveform = 'sine' | 'square' | 'saw' | 'noise';

export interface SynthLayer {
  waveform: Waveform;
  /** Start and length as fractions of the whole sound. */
  start: number;
  length: number;
  frequency: number;
  gain: number;
  /** Fractions of layer length; must sum to 1. Decay reaches silence. */
  envelope: { attack: number; sustain: number; decay: number };
  slide?: number; // semitones over this layer (or each repeat)
  vibratoHz?: number;
  vibratoDepth?: number; // semitones
  duty?: number;
  dutySweep?: number;
  noiseMix?: number;
  lowpassHz?: number;
  highpassHz?: number;
  phaserMs?: number; // feed-forward delay, no feedback
  phaserSweepMs?: number;
  phaserMix?: number;
  repeatHz?: number; // resets envelope and pitch slide; phase stays continuous
}

export interface SynthParams {
  durationSeconds: number;
  seed: number;
  targetRms: number;
  peakLimit: number;
  layers: SynthLayer[];
}

function record(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
}
function range(value: unknown, name: string, min: number, max: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be finite and in [${min}, ${max}]`);
  }
}

/** Validate JSON at the boundary, before allocating any samples. */
export function validateParams(value: unknown): asserts value is SynthParams {
  record(value, 'params');
  range(value.durationSeconds, 'durationSeconds', 0.005, 10);
  range(value.seed, 'seed', 0, 0xffffffff);
  if (!Number.isInteger(value.seed)) throw new RangeError('seed must be uint32');
  range(value.targetRms, 'targetRms', 0.001, 0.5);
  range(value.peakLimit, 'peakLimit', value.targetRms, 0.95);
  if (!Array.isArray(value.layers) || value.layers.length < 1 || value.layers.length > 32) {
    throw new RangeError('layers must contain 1–32 layers');
  }
  for (const layer of value.layers) {
    record(layer, 'layer');
    if (!['sine', 'square', 'saw', 'noise'].includes(layer.waveform as string)) throw new TypeError('Unknown waveform');
    range(layer.start, 'start', 0, 1);
    range(layer.length, 'length', 0.001, 1);
    if (layer.start + layer.length > 1 + 1e-9) throw new RangeError('Layer extends past sound');
    range(layer.frequency, 'frequency', 10, 20000);
    range(layer.gain, 'gain', 0.001, 1);
    record(layer.envelope, 'envelope');
    const env = layer.envelope;
    range(env.attack, 'attack', 0.001, 0.999);
    range(env.sustain, 'sustain', 0, 0.998);
    range(env.decay, 'decay', 0.001, 0.999);
    if (Math.abs(env.attack + env.sustain + env.decay - 1) > 1e-8) throw new RangeError('Envelope must sum to 1');
    const optional: [string, number, number][] = [
      ['slide', -72, 72], ['vibratoHz', 0, 80], ['vibratoDepth', 0, 12],
      ['duty', 0.05, 0.95], ['dutySweep', -0.9, 0.9], ['noiseMix', 0, 1],
      ['lowpassHz', 20, 20000], ['highpassHz', 0, 20000],
      ['phaserMs', 0, 30], ['phaserSweepMs', -30, 30], ['phaserMix', -1, 1], ['repeatHz', 0, 60],
    ];
    for (const [key, min, max] of optional) if (layer[key] !== undefined) range(layer[key], key, min, max);
  }
}

function checkRate(sampleRate: number): void {
  range(sampleRate, 'sampleRate', 8000, 96000);
  if (!Number.isInteger(sampleRate)) throw new RangeError('sampleRate must be integer');
}

// Mulberry32: private render-local state, including seed 0; no Math.random().
function noiseGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 0x80000000 - 1;
  };
}

// Polynomial correction softens oscillator discontinuities without oversampling.
function polyBlep(phase: number, step: number): number {
  if (phase < step) { const x = phase / step; return x + x - x * x - 1; }
  if (phase > 1 - step) { const x = (phase - 1) / step; return x * x + x + x + 1; }
  return 0;
}
function envelope(position: number, env: SynthLayer['envelope']): number {
  if (position < env.attack) return position / env.attack;
  if (position < env.attack + env.sustain) return 1;
  return Math.max(0, (1 - position) / env.decay) ** 2;
}

/** Pure mono PCM. Repeated parameters + sample rate produce identical Float32 samples
 * in the same JS runtime. Duration rounds to the nearest output sample. */
export function renderSamples(params: SynthParams, sampleRate = 44100): Float32Array<ArrayBuffer> {
  validateParams(params);
  checkRate(sampleRate);
  const output = new Float32Array(Math.round(params.durationSeconds * sampleRate));
  params.layers.forEach((layer, layerIndex) => {
    const random = noiseGenerator((params.seed ^ Math.imul(layerIndex + 1, 0x9e3779b9)) >>> 0);
    const start = Math.round(layer.start * output.length);
    const length = Math.min(output.length - start, Math.round(layer.length * output.length));
    const raw = new Float32Array(length);
    const lowCoefficient = 1 - Math.exp(-2 * Math.PI * Math.min(layer.lowpassHz ?? 20000, sampleRate * 0.45) / sampleRate);
    const highCoefficient = Math.exp(-2 * Math.PI * (layer.highpassHz ?? 20) / sampleRate);
    let phase = 0, low = 0, high = 0, previousLow = 0;
    const period = layer.repeatHz ? sampleRate / layer.repeatHz : length;
    for (let i = 0; i < length; i++) {
      const position = i / Math.max(1, length - 1);
      const cycle = layer.repeatHz ? (i % period) / period : position;
      const vibrato = (layer.vibratoDepth ?? 0) * Math.sin(2 * Math.PI * (layer.vibratoHz ?? 0) * i / sampleRate);
      const hz = layer.frequency * 2 ** (((layer.slide ?? 0) * cycle + vibrato) / 12);
      const step = Math.min(sampleRate * 0.4, Math.max(10, hz)) / sampleRate;
      const duty = Math.max(0.05, Math.min(0.95, (layer.duty ?? 0.5) + (layer.dutySweep ?? 0) * cycle));
      let sample: number;
      switch (layer.waveform) {
        case 'noise': sample = random(); break;
        case 'sine': sample = Math.sin(phase * 2 * Math.PI); break;
        case 'saw': sample = 2 * phase - 1 - polyBlep(phase, step); break;
        case 'square': sample = (phase < duty ? 1 : -1) + polyBlep(phase, step) - polyBlep((phase - duty + 1) % 1, step); break;
      }
      const noiseMix = layer.noiseMix ?? 0;
      if (noiseMix) sample = sample * (1 - noiseMix) + random() * noiseMix;
      phase = (phase + step) % 1;
      low += lowCoefficient * (sample - low);
      high = highCoefficient * (high + low - previousLow);
      previousLow = low;
      raw[i] = high;
      const delay = Math.round(Math.max(0, (layer.phaserMs ?? 0) + (layer.phaserSweepMs ?? 0) * position) * sampleRate / 1000);
      const delayed = i >= delay ? raw[i - delay]! : 0;
      // Window after filters/delay so both ends are silent. Repeat also has an outer release.
      const amp = envelope(cycle, layer.envelope) * (layer.repeatHz ? envelope(position, layer.envelope) : 1);
      output[start + i] = output[start + i]! + (high + delayed * (layer.phaserMix ?? 0)) * amp * layer.gain;
    }
  });
  // RMS matching with a peak ceiling, using one linear gain (no clipping/distortion).
  let sum = 0, peak = 0;
  for (const sample of output) { sum += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
  if (peak > 0) {
    const gain = Math.min(params.targetRms / Math.sqrt(sum / output.length), params.peakLimit / peak);
    for (let i = 0; i < output.length; i++) output[i] = output[i]! * gain;
  }
  return output;
}

/** Allocation through a supplied context also supports OfflineAudioContext. */
export function synthesize(params: SynthParams, context: Pick<BaseAudioContext, 'createBuffer' | 'sampleRate'>): AudioBuffer {
  const samples = renderSamples(params, context.sampleRate);
  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}
