import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "../../lib/api/guard";

export const dynamic = "force-dynamic";

type Airport = {
  name?: string;
  municipality?: string;
  iata_code?: string;
  icao_code?: string;
  latitude?: number;
  longitude?: number;
};

type AdsbDbAircraft = {
  type?: string;
  icao_type?: string;
  manufacturer?: string;
  registration?: string;
  registered_owner?: string;
  registered_owner_operator_flag_code?: string | null;
  url_photo?: string | null;
  url_photo_thumbnail?: string | null;
};

async function airportWeather(airport: Airport) {
  if (typeof airport.latitude !== "number" || typeof airport.longitude !== "number") return null;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(airport.latitude));
  url.searchParams.set("longitude", String(airport.longitude));
  url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,visibility,surface_pressure,cloud_cover");
  url.searchParams.set("wind_speed_unit", "kn");
  url.searchParams.set("timezone", "auto");
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6500) });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload.current ?? null;
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "flight-details", 30, 60_000);
  if (limited) return limited;
  const callsign = (request.nextUrl.searchParams.get("callsign") ?? "").trim().toUpperCase();
  const aircraftKey = (request.nextUrl.searchParams.get("aircraft") ?? "").replace(/[^A-Z0-9-]/gi, "").toUpperCase();
  const includeWeather = request.nextUrl.searchParams.get("weather") !== "0";
  const validCallsign = /^[A-Z0-9]{2,10}$/.test(callsign);
  if (!validCallsign && !aircraftKey) {
    return NextResponse.json({ route: null, aircraft: null, error: "Mode-S, immatriculation ou indicatif requis." }, { status: 400 });
  }

  try {
    const endpoint = aircraftKey && validCallsign
      ? `https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(aircraftKey)}?callsign=${encodeURIComponent(callsign)}`
      : aircraftKey
        ? `https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(aircraftKey)}`
        : `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`;
    const response = await fetch(endpoint, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(6500),
      headers: { Accept: "application/json", "User-Agent": `XavPac/${process.env.NEXT_PUBLIC_XAVPAC_VERSION ?? "development"}` }
    });
    if (!response.ok) return NextResponse.json({ route: null, source: "ADSBDB" });
    const payload = await response.json();
    const route = validCallsign ? payload.response?.flightroute ?? (aircraftKey ? null : payload.response) : null;
    const aircraft = (payload.response?.aircraft ?? (aircraftKey && !validCallsign ? payload.response : null)) as AdsbDbAircraft | null;
    const origin = route?.origin as Airport | undefined;
    const destination = route?.destination as Airport | undefined;
    const airlineName = typeof route?.airline?.name === "string" ? route.airline.name.trim() : null;
    const registeredOwner = aircraft?.registered_owner?.trim() || null;
    if (!origin || !destination) {
      return NextResponse.json({ route: null, aircraft, operator: airlineName || registeredOwner, source: "ADSBDB" });
    }
    const [originWeather, destinationWeather] = includeWeather
      ? await Promise.all([airportWeather(origin), airportWeather(destination)])
      : [null, null];
    return NextResponse.json({
      source: "ADSBDB + Open-Meteo",
      operator: airlineName || registeredOwner,
      aircraft,
      route: { origin, destination, originWeather, destinationWeather }
    }, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } });
  } catch {
    return NextResponse.json({ route: null, source: "ADSBDB", error: "Route indisponible." });
  }
}
