type CacheEntry<T> = { value: T; expiresAt: number };

const values = new Map<string, CacheEntry<unknown>>();
const pending = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 1500;

function prune() {
  const now = Date.now();
  for (const [key, entry] of values) if (entry.expiresAt <= now) values.delete(key);
  while (values.size > MAX_ENTRIES) values.delete(values.keys().next().value as string);
}

export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = values.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const running = pending.get(key) as Promise<T> | undefined;
  if (running) return running;
  const promise = loader().then((value) => {
    values.set(key, { value, expiresAt: Date.now() + ttlMs });
    prune();
    return value;
  }).finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}

export function cacheStats() {
  prune();
  return { entries: values.size, pending: pending.size };
}

export async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>) {
  const result = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return result;
}
