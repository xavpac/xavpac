import { cached } from "../cache.ts";
import { normalizeModeS, normalizeRawCallsign } from "../callsign.ts";
import { measuredFetch, registerSource, type SourceAdapter } from "../sourceAdapter.ts";

type OpenSkyFlight = { icao24?: string; callsign?: string | null; estDepartureAirport?: string | null; estArrivalAirport?: string | null; firstSeen?: number; lastSeen?: number };
let token: { value: string; expiresAt: number } | null = null;

async function accessToken() {
  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  if (token && token.expiresAt > Date.now() + 30_000) return token.value;
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret });
  const response = await fetch("https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token", { method: "POST", body, signal: AbortSignal.timeout(6500), headers: { "Content-Type": "application/x-www-form-urlencoded" }, cache: "no-store" });
  if (!response.ok) return null;
  const payload = await response.json();
  if (typeof payload.access_token !== "string") return null;
  token = { value: payload.access_token, expiresAt: Date.now() + Math.max(60, Number(payload.expires_in) || 1800) * 1000 };
  return token.value;
}

type Input = { modeS?: string | null; callsign?: string | null };
const adapter: SourceAdapter<Input, OpenSkyFlight | null> = {
  id: "opensky", name: "OpenSky", enabled: Boolean(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET) && process.env.OPENSKY_ENABLED !== "false",
  quota: "Selon compte OpenSky gratuit",
  async fetch({ modeS: modeSValue, callsign: callsignValue }) {
  const modeS = normalizeModeS(modeSValue)?.toLowerCase();
  if (!modeS) return null;
  const callsign = normalizeRawCallsign(callsignValue);
  return cached(`opensky-flight:${modeS}:${callsign ?? "none"}`, 30 * 60_000, async () => {
    const bearer = await accessToken();
    if (!bearer) return null;
    const end = Math.floor(Date.now() / 1000);
    const begin = end - 24 * 60 * 60;
    const response = await fetch(`https://opensky-network.org/api/flights/aircraft?icao24=${modeS}&begin=${begin}&end=${end}`, { cache: "no-store", signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" } });
    if (!response.ok) return null;
    const flights = await response.json() as OpenSkyFlight[];
    if (!Array.isArray(flights)) return null;
    const matching = flights.filter((flight) => !callsign || normalizeRawCallsign(flight.callsign) === callsign).sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
    return matching[0] ?? flights.sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0))[0] ?? null;
  });
  }
};
registerSource(adapter);

export async function lookupOpenSkyFlight(modeSValue?: string | null, callsignValue?: string | null) {
  if (!adapter.enabled) return null;
  try { return await measuredFetch(adapter, { modeS: modeSValue, callsign: callsignValue }); } catch { return null; }
}
