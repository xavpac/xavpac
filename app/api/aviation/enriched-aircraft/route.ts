import { NextRequest, NextResponse } from "next/server";
import { apiError, enforceRateLimit } from "../../../lib/api/guard";
import { mapWithConcurrency, cacheStats } from "../../../lib/aviation/cache";
import { enrichAircraft } from "../../../lib/aviation/enrichment";
import { normalizeModeS, normalizeRegistration } from "../../../lib/aviation/callsign";
import type { AircraftEnrichmentInput } from "../../../lib/aviation/types";

export const dynamic = "force-dynamic";

type Payload = { aircraft?: AircraftEnrichmentInput[]; selectedModeS?: string | null };

function validItem(item: AircraftEnrichmentInput) {
  const modeS = normalizeModeS(item.modeS);
  const registration = normalizeRegistration(item.registration);
  if (!modeS && !registration) return false;
  if (item.callsign && item.callsign.length > 16) return false;
  if (item.operator && item.operator.length > 160) return false;
  if (item.aircraftType && item.aircraftType.length > 80) return false;
  return item.distanceKm === undefined || item.distanceKm === null || (Number.isFinite(item.distanceKm) && item.distanceKm >= 0 && item.distanceKm <= 1000);
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, "aviation-enrichment", 20, 60_000);
  if (limited) return limited;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 64_000) return apiError("Requête trop volumineuse.", 413, "PAYLOAD_TOO_LARGE");
  let payload: Payload;
  try { payload = await request.json() as Payload; } catch { return apiError("Corps JSON invalide.", 400, "INVALID_JSON"); }
  if (!Array.isArray(payload.aircraft) || payload.aircraft.length > 25 || payload.aircraft.some((item) => !item || !validItem(item))) {
    return apiError("Liste d’aéronefs invalide (maximum 25).", 400, "INVALID_AIRCRAFT_LIST");
  }
  const selected = normalizeModeS(payload.selectedModeS);
  const prioritized = payload.aircraft.map((item, originalIndex) => ({ item, originalIndex })).sort((a, b) => {
    const aSelected = normalizeModeS(a.item.modeS) === selected ? 0 : 1;
    const bSelected = normalizeModeS(b.item.modeS) === selected ? 0 : 1;
    return aSelected - bSelected || (a.item.distanceKm ?? Infinity) - (b.item.distanceKm ?? Infinity);
  });
  const processed = await mapWithConcurrency(prioritized, 4, async ({ item, originalIndex }) => ({ originalIndex, value: await enrichAircraft(item) }));
  const enriched = processed.sort((a, b) => a.originalIndex - b.originalIndex).map((entry) => entry.value);
  const identified = enriched.filter((item) => item.departureAirport && item.arrivalAirport).length;
  return NextResponse.json({ ok: true, source: "Airplanes.live + ADSBDB + OpenSky + données locales", enriched, metrics: { total: enriched.length, routesIdentified: identified, routesUnavailable: enriched.length - identified }, cache: cacheStats() }, { headers: { "Cache-Control": "private, max-age=8" } });
}
