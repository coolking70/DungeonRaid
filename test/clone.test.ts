import { afterEach, expect, test, vi } from 'vitest';
import { cloneData } from '../src/core/clone';
import { GameSession, legalChain, SESSION_KEY } from '../ui/session';
import { Difficulty, GameMode } from '../src/core/data';

const nativeClone = globalThis.structuredClone;
afterEach(() => vi.unstubAllGlobals());

test('fallback keeps graph identity, optional values, holes and numeric values without sharing input', () => {
  const child = { value: 1 }, sparse = new Array(3); sparse[2] = undefined;
  const data = { a: child, b: child, missing: undefined, sparse, nan: NaN, infinity: Infinity, negativeZero: -0, self: null as unknown };
  data.self = data;
  const expected = nativeClone(data);
  vi.stubGlobal('structuredClone', undefined);
  const result = cloneData(data);
  expect(result).toEqual(expected); expect(result.a).toBe(result.b); expect(result.self).toBe(result);
  expect(0 in result.sparse).toBe(false); expect(2 in result.sparse).toBe(true);
  expect(Object.hasOwn(result, 'missing')).toBe(true); expect(Object.is(result.negativeZero, -0)).toBe(true);
  result.a.value = 2; expect(child.value).toBe(1);
});

test('fallback copies __proto__ as data and rejects unsupported objects instead of silently corrupting them', () => {
  vi.stubGlobal('structuredClone', undefined);
  const result = cloneData(JSON.parse('{"__proto__":{"polluted":true}}'));
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  expect(Object.hasOwn(result, '__proto__')).toBe(true);
  expect(() => cloneData(new Map())).toThrow('Expected plain game data');
  expect(() => cloneData({ callback() {} })).toThrow('Unsupported game data');
});

function playSession() {
  const data = new Map<string, string>();
  const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
  const session = new GameSession(store);
  session.start({ seed: 12345, classId: 0, difficulty: Difficulty.DIFF_NORMAL, mode: GameMode.MODE_CLASSIC });
  const initial = JSON.stringify(session.state);
  // Exercise the diagnostic callback copy as well as timeline/event snapshots.
  session.onEvents = events => { for (const event of events) if (event.type === 'ChainPreview') event.preview.damage = -999; };
  const chain = legalChain(session.state)!; expect(chain.length).toBeGreaterThanOrEqual(3);
  for (const slot of chain) expect(session.dispatch({ type: 'SelectTile', at: { x: slot % 6, y: Math.floor(slot / 6) } })).toBe(true);
  expect(session.dispatch({ type: 'CommitChain' })).toBe(true);
  for (let n = 0; n < 12000 && session.busy; n++) session.update(1 / 60);
  expect(session.busy).toBe(false); expect(session.error).toBeNull(); expect(session.state.turn).toBe(1);
  const reloaded = new GameSession(store);
  expect(reloaded.error).toBeNull(); expect(reloaded.state).toEqual(session.state);
  reloaded.timeline.display.board[0]!.health = -999;
  expect(reloaded.state.board[0]!.health).not.toBe(-999);
  return { initial, state: session.state, profile: session.profile, events: session.events, save: store.getItem(SESSION_KEY) };
}

test('missing API starts, plays, animates and reloads exactly like native structuredClone', () => {
  const native = playSession();
  vi.stubGlobal('structuredClone', undefined);
  expect(playSession()).toEqual(native);
});
