import { cached } from "../cache.ts";
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
  if (!response.ok) return null;
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
  const key = `adsbdb:${aircraftKey ?? "none"}:${callsign ?? "none"}`;
  return cached(key, callsign ? 30 * 60_000 : 7 * 86_400_000, async () => {
    if (aircraftKey && callsign && /^[A-Z0-9]{2,10}$/.test(callsign)) {
      const combined = await fetchAdsbDb(`aircraft/${encodeURIComponent(aircraftKey)}?callsign=${encodeURIComponent(callsign)}`, 1800);
      if (combined) return { aircraft: combined.aircraft ?? null, route: combined.flightroute ?? null };
    }
    const [aircraft, route] = await Promise.all([
      aircraftKey ? fetchAdsbDb(`aircraft/${encodeURIComponent(aircraftKey)}`, 604800) : Promise.resolve(null),
      callsign && /^[A-Z0-9]{2,10}$/.test(callsign) ? fetchAdsbDb(`callsign/${encodeURIComponent(callsign)}`, 1800) : Promise.resolve(null)
    ]);
    return { aircraft: aircraft?.aircraft ?? aircraft ?? null, route: route?.flightroute ?? route ?? null };
  });
  }
};
registerSource(adapter);

export async function lookupAdsbDb(input: Input): Promise<AdsbDbResult> {
  try { return await measuredFetch(adapter, input); }
  catch { return { aircraft: null, route: null }; }
}
