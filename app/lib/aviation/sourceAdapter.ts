export type SourceState = "available" | "degraded" | "offline" | "disabled";

export type SourceHealth = {
  id: string;
  name: string;
  state: SourceState;
  lastSuccess: string | null;
  lastFailure: string | null;
  averageResponseMs: number | null;
  requests: number;
  errors: number;
  errorRate: number;
  cacheHits: number;
  quota: string;
  enabled: boolean;
  lastError: string | null;
};

export interface SourceAdapter<Input, Output> {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly quota: string;
  fetch(input: Input): Promise<Output>;
}

type MutableHealth = SourceHealth & { totalResponseMs: number };
const globalHealth = globalThis as typeof globalThis & { __xavpacSourceHealth?: Map<string, MutableHealth> };
const registry = globalHealth.__xavpacSourceHealth ?? new Map<string, MutableHealth>();
globalHealth.__xavpacSourceHealth = registry;

function entry(adapter: Pick<SourceAdapter<unknown, unknown>, "id" | "name" | "enabled" | "quota">) {
  const current = registry.get(adapter.id);
  if (current) return current;
  const created: MutableHealth = {
    id: adapter.id, name: adapter.name, state: adapter.enabled ? "degraded" : "disabled",
    lastSuccess: null, lastFailure: null, averageResponseMs: null, requests: 0, errors: 0,
    errorRate: 0, cacheHits: 0, quota: adapter.quota, enabled: adapter.enabled,
    lastError: null, totalResponseMs: 0
  };
  registry.set(adapter.id, created);
  return created;
}

export async function measuredFetch<I, O>(adapter: SourceAdapter<I, O>, input: I): Promise<O> {
  const health = entry(adapter as SourceAdapter<unknown, unknown>);
  if (!adapter.enabled) throw new Error(`${adapter.name} désactivé`);
  const started = performance.now();
  health.requests += 1;
  try {
    const output = await adapter.fetch(input);
    health.totalResponseMs += performance.now() - started;
    health.averageResponseMs = Math.round(health.totalResponseMs / health.requests);
    health.lastSuccess = new Date().toISOString();
    health.state = health.errors / health.requests > 0.25 ? "degraded" : "available";
    health.errorRate = health.errors / health.requests;
    health.lastError = null;
    return output;
  } catch (error) {
    health.totalResponseMs += performance.now() - started;
    health.averageResponseMs = Math.round(health.totalResponseMs / health.requests);
    health.errors += 1;
    health.errorRate = health.errors / health.requests;
    health.lastFailure = new Date().toISOString();
    health.lastError = error instanceof Error ? error.message : "Erreur inconnue";
    health.state = health.lastSuccess ? "degraded" : "offline";
    throw error;
  }
}

export function registerSource(adapter: Pick<SourceAdapter<unknown, unknown>, "id" | "name" | "enabled" | "quota">) {
  entry(adapter);
}

export function sourceHealth(): SourceHealth[] {
  return [...registry.values()].map(({ totalResponseMs: _ignored, ...health }) => health);
}
