/** A fresh cache for one menu or widget response, never shared between requests. */
export function readCache() {
  const cached = new Map<string, Promise<unknown>>();
  return <T>(key: string, read: () => Promise<T>): Promise<T> => {
    const existing = cached.get(key);
    if (existing) return existing as Promise<T>;
    const value = read();
    cached.set(key, value);
    return value;
  };
}
