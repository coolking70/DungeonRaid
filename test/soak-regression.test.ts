import { expect, test } from 'vitest';
import { GameMode } from '../src/core/data';
import { deserializeProfile, serializeProfile } from '../src/core/save';
import { simulate } from './soak-driver';
const SIMULATION_TIMEOUT_MS = 120_000;
const configs = Array.from({ length: 15 }, (_, i) => ({ seed: 42 + i * 997, mode: [GameMode.MODE_CLASSIC, GameMode.MODE_SPRINT, GameMode.MODE_PRETZEL][i % 3]!, difficulty: Math.floor(i / 3) % 4, classId: i % 10 }));
test.each(configs)('T07 whole-run save/replay seed=$seed mode=$mode difficulty=$difficulty class=$classId', config => {
  const continuous = simulate(config, { trace: true }), restored = simulate(config, { trace: true, restore: true });
  expect(restored.actions).toEqual(continuous.actions);
  expect(restored.state).toEqual(continuous.state);
  expect(restored.calls).toEqual(continuous.calls);
  expect(restored.events).toEqual(continuous.events);
  expect(restored.profile).toEqual(continuous.profile);
  expect(deserializeProfile(serializeProfile(restored.profile))).toEqual(restored.profile);
  expect(restored.calls).toHaveLength(restored.state.rng.calls);
  const phases = continuous.events.some(e => e.type === 'MenuRequested') ? ['falling', 'arrivals', 'menu', 'menu-selected'] : ['falling', 'arrivals'];
  for (const phase of phases) expect(restored.stats.checkpoints[phase], phase).toBeGreaterThan(0);
}, SIMULATION_TIMEOUT_MS);
