type CacheEntry<T> = { value: T; expiresAt: number };

const values = new Map<string, CacheEntry<unknown>>();
const pending = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 1500;
let hits = 0;
let misses = 0;

function prune() {
  const now = Date.now();
  for (const [key, entry] of values) if (entry.expiresAt <= now) values.delete(key);
  while (values.size > MAX_ENTRIES) values.delete(values.keys().next().value as string);
}

export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  return cachedWithPolicy(key, { ttlMs }, loader);
}

export async function cachedWithPolicy<T>(
  key: string,
  policy: { ttlMs: number; negativeTtlMs?: number; isNegative?: (value: T) => boolean },
  loader: () => Promise<T>
): Promise<T> {
  const hit = values.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) {
    hits += 1;
    return hit.value;
  }
  const running = pending.get(key) as Promise<T> | undefined;
  if (running) {
    hits += 1;
    return running;
  }
  misses += 1;
  const promise = loader().then((value) => {
    const negative = policy.isNegative?.(value) ?? false;
    const ttlMs = negative ? policy.negativeTtlMs ?? Math.min(policy.ttlMs, 5 * 60_000) : policy.ttlMs;
    values.set(key, { value, expiresAt: Date.now() + Math.max(0, ttlMs) });
    prune();
    return value;
  }).finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}

export function cacheStats() {
  prune();
  return { entries: values.size, size: values.size, pending: pending.size, hits, misses };
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
