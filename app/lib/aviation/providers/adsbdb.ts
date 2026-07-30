import { cachedWithPolicy } from "../cache.ts";
import { normalizeModeS, normalizeRawCallsign, normalizeRegistration } from "../callsign.ts";
import { measuredFetch, registerSource, type SourceAdapter } from "../sourceAdapter.ts";

export type AdsbDbAirport = { name?: string; municipality?: string; iata_code?: string; icao_code?: string; latitude?: number; longitude?: number };
export type AdsbDbResult = {
  aircraft: null | { type?: string; icao_type?: string; manufacturer?: string; registration?: string; registered_owner?: string; url_photo?: string | null; url_photo_thumbnail?: string | null };
  route: null | { callsign?: string; callsign_icao?: string | null; callsign_iata?: string | null; airline?: { name?: string; icao?: string; iata?: string | null }; origin?: AdsbDbAirport; destination?: AdsbDbAirport };
};

async function fetchAdsbDb(path: string, revalidate: number) {
  const response = await fetch(`https://api.adsbdb.com/v0/${path}`, {
    next: { revalidate },
    signal: AbortSignal.timeout(6500),
    headers: { Accept: "application/json", "User-Agent": `XavPac/${process.env.NEXT_PUBLIC_XAVPAC_VERSION ?? "development"}` }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`ADSBDB ${response.status}`);
  const payload = await response.json();
  return payload?.response ?? null;
}

type Input = { modeS?: string | null; registration?: string | null; callsign?: string | null };

const adapter: SourceAdapter<Input, AdsbDbResult> = {
  id: "adsbdb",
  name: "ADSBDB",
  enabled: process.env.ADSBDB_ENABLED !== "false",
  quota: "512 requêtes/minute avant blocage temporaire",
  async fetch(input) {
  const modeS = normalizeModeS(input.modeS);
  const registration = normalizeRegistration(input.registration);
  const callsign = normalizeRawCallsign(input.callsign);
  const aircraftKey = modeS || registration;
  const aircraftPromise = aircraftKey
    ? cachedWithPolicy(
      `adsbdb-aircraft:${aircraftKey}`,
      { ttlMs: 30 * 86_400_000, negativeTtlMs: 15 * 60_000, isNegative: (value) => value === null },
      async () => {
        const result = await fetchAdsbDb(`aircraft/${encodeURIComponent(aircraftKey)}`, 2_592_000);
        return result?.aircraft ?? result ?? null;
      }
    )
    : Promise.resolve(null);
  const routePromise = callsign && /^[A-Z0-9]{2,10}$/.test(callsign)
    ? cachedWithPolicy(
      `adsbdb-route:${callsign}`,
      { ttlMs: 30 * 60_000, negativeTtlMs: 5 * 60_000, isNegative: (value) => value === null },
      async () => {
        const result = await fetchAdsbDb(`callsign/${encodeURIComponent(callsign)}`, 1800);
        return result?.flightroute ?? result ?? null;
      }
    )
    : Promise.resolve(null);
  const [aircraft, route] = await Promise.all([aircraftPromise, routePromise]);
  return { aircraft, route };
  }
};
registerSource(adapter);

export async function lookupAdsbDb(input: Input): Promise<AdsbDbResult> {
  try { return await measuredFetch(adapter, input); }
  catch { return { aircraft: null, route: null }; }
}
