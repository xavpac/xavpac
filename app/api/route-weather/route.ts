import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "../../lib/api/guard";
import type { AirportWeather } from "../../lib/aviation/types";
import { validCoordinate } from "../../lib/aviation/routeWeather";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type OpenMeteoPayload = {
  current?: Partial<Record<keyof AirportWeather, unknown>>;
};

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function airportWeather(latitude: number, longitude: number): Promise<AirportWeather> {
  const parameters = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,visibility,surface_pressure,cloud_cover",
    wind_speed_unit: "kn",
    timezone: "auto"
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${parameters}`, {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(6500),
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
  const payload = await response.json() as OpenMeteoPayload;
  const current = payload.current ?? {};
  return {
    time: typeof current.time === "string" ? current.time : null,
    temperature_2m: numberOrNull(current.temperature_2m),
    weather_code: numberOrNull(current.weather_code),
    wind_speed_10m: numberOrNull(current.wind_speed_10m),
    wind_gusts_10m: numberOrNull(current.wind_gusts_10m),
    visibility: numberOrNull(current.visibility),
    surface_pressure: numberOrNull(current.surface_pressure),
    cloud_cover: numberOrNull(current.cloud_cover)
  };
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "route-weather", 40, 60_000);
  if (limited) return limited;

  const originLat = Number(request.nextUrl.searchParams.get("originLat"));
  const originLon = Number(request.nextUrl.searchParams.get("originLon"));
  const destinationLat = Number(request.nextUrl.searchParams.get("destinationLat"));
  const destinationLon = Number(request.nextUrl.searchParams.get("destinationLon"));
  if (!validCoordinate(originLat, -90, 90) || !validCoordinate(originLon, -180, 180)
    || !validCoordinate(destinationLat, -90, 90) || !validCoordinate(destinationLon, -180, 180)) {
    return NextResponse.json({ error: "Coordonnées d’aéroports invalides." }, { status: 400 });
  }

  try {
    const [originWeather, destinationWeather] = await Promise.all([
      airportWeather(originLat, originLon),
      airportWeather(destinationLat, destinationLon)
    ]);
    return NextResponse.json(
      { originWeather, destinationWeather, source: "Open-Meteo" },
      { headers: { "Cache-Control": "public, max-age=120, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch {
    return NextResponse.json({ error: "Météo des aéroports momentanément indisponible." }, { status: 502 });
  }
}
