import { cachedWithPolicy } from "../cache.ts";
import { normalizeModeS } from "../callsign.ts";
import { measuredFetch, registerSource, type SourceAdapter } from "../sourceAdapter.ts";

export type HexDbAircraft = {
  modeS: string;
  registration: string | null;
  manufacturer: string | null;
  icaoTypeCode: string | null;
  aircraftModel: string | null;
  registeredOwner: string | null;
  operatorFlagCode: string | null;
};

function usefulString(value: unknown) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || /^(?:n\/?a|none|null|unknown|not available|-+)$/i.test(clean)) return null;
  return clean;
}

export function parseHexDbAircraft(payload: unknown): HexDbAircraft | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as Record<string, unknown>;
  const modeS = normalizeModeS(usefulString(value.ModeS));
  if (!modeS || value.status === "404") return null;
  const aircraft: HexDbAircraft = {
    modeS,
    registration: usefulString(value.Registration)?.toUpperCase() ?? null,
    manufacturer: usefulString(value.Manufacturer),
    icaoTypeCode: usefulString(value.ICAOTypeCode)?.toUpperCase() ?? null,
    aircraftModel: usefulString(value.Type),
    registeredOwner: usefulString(value.RegisteredOwners),
    operatorFlagCode: usefulString(value.OperatorFlagCode)?.toUpperCase() ?? null
  };
  return Object.values(aircraft).some((field, index) => index > 0 && field !== null) ? aircraft : null;
}

type Input = { modeS?: string | null };

const adapter: SourceAdapter<Input, HexDbAircraft | null> = {
  id: "hexdb",
  name: "HexDB",
  enabled: process.env.HEXDB_ENABLED !== "false",
  quota: "API publique : cache long et appels de complément uniquement",
  async fetch(input) {
    const modeS = normalizeModeS(input.modeS);
    if (!modeS) return null;
    return cachedWithPolicy(
      `hexdb-aircraft:${modeS}`,
      { ttlMs: 30 * 86_400_000, negativeTtlMs: 6 * 60 * 60_000, isNegative: (value) => value === null },
      async () => {
        const response = await fetch(`https://hexdb.io/api/v1/aircraft/${encodeURIComponent(modeS)}`, {
          next: { revalidate: 2_592_000 },
          signal: AbortSignal.timeout(5500),
          headers: {
            Accept: "application/json",
            "User-Agent": `XavPac/${process.env.NEXT_PUBLIC_XAVPAC_VERSION ?? "development"} (aircraft identification; https://github.com/xavpac/xavpac)`
          }
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`HexDB ${response.status}`);
        return parseHexDbAircraft(await response.json());
      }
    );
  }
};

registerSource(adapter);

export async function lookupHexDb(modeS?: string | null) {
  if (!adapter.enabled) return null;
  try { return await measuredFetch(adapter, { modeS }); }
  catch { return null; }
}
