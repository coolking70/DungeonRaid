export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem?(key:string):void }
export function browserStorage(): StoragePort {
  return {
    getItem(key) { try { return localStorage.getItem(key); } catch { return null; } },
    removeItem(key) { localStorage.removeItem(key); },
    setItem(key, value) { localStorage.setItem(key, value); },
  };
}
