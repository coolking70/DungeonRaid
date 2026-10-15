export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function browserStorage(): StoragePort {
  return {
    getItem(key) { try { return localStorage.getItem(key); } catch { return null; } },
    setItem(key, value) { localStorage.setItem(key, value); },
  };
}
