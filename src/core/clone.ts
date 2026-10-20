/**
 * Copy game data without requiring the browser's structuredClone API.
 * Our state/events contain primitives, plain records and arrays only. This is
 * deliberately not a general structured-clone polyfill (no DOM/transferables).
 * Unlike a JSON round trip, the fallback retains undefined, sparse arrays,
 * non-finite numbers, shared references and cycles.
 */
export function cloneData<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
  const seen = new WeakMap<object, object>();
  function copy(input: unknown): unknown {
    if (typeof input === 'function' || typeof input === 'symbol') throw new TypeError('Unsupported game data');
    if (input === null || typeof input !== 'object') return input;
    const existing = seen.get(input);
    if (existing) return existing;
    const array = Array.isArray(input), proto = Object.getPrototypeOf(input);
    if (!array && proto !== Object.prototype && proto !== null) throw new TypeError('Expected plain game data');
    const result = array ? new Array(input.length) : {};
    seen.set(input, result);
    for (const key of Object.keys(input)) {
      Object.defineProperty(result, key, {
        value: copy((input as Record<string, unknown>)[key]),
        enumerable: true, writable: true, configurable: true,
      });
    }
    return result;
  }
  return copy(value) as T;
}
