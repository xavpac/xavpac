import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "../../lib/api/guard";
import type { StormForecastFeed, StormForecastPoint } from "../../lib/weather/stormForecast";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type OpenMeteoPayload = {
  minutely_15?: {
    time?: unknown[];
    lightning_potential?: unknown[];
    cape?: unknown[];
    precipitation?: unknown[];
    wind_gusts_10m?: unknown[];
  };
};

function validCoordinate(value: number, minimum: number, maximum: number) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function nullableNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function utcTimestamp(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const timestamp = `${value}:00Z`;
  return Number.isFinite(Date.parse(timestamp)) ? timestamp : null;
}

function unavailable(message: string, horizonHours: number, status = 502) {
  const body: StormForecastFeed = {
    status: "unavailable",
    source: null,
    retrievedAt: new Date().toISOString(),
    horizonHours,
    points: [],
    message
  };
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "storm-forecast", 30, 60_000);
  if (limited) return limited;

  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  const horizonHours = Math.round(Number(request.nextUrl.searchParams.get("hours") ?? "6"));
  if (!validCoordinate(latitude, -90, 90) || !validCoordinate(longitude, -180, 180)
    || !Number.isFinite(horizonHours) || horizonHours < 1 || horizonHours > 24) {
    return unavailable("Paramètres de prévision convective invalides.", 6, 400);
  }

  try {
    const providerUrl = new URL("https://api.open-meteo.com/v1/forecast");
    providerUrl.searchParams.set("latitude", String(latitude));
    providerUrl.searchParams.set("longitude", String(longitude));
    providerUrl.searchParams.set("minutely_15", "lightning_potential,cape,precipitation,wind_gusts_10m");
    providerUrl.searchParams.set("forecast_minutely_15", String(horizonHours * 4));
    providerUrl.searchParams.set("timezone", "GMT");
    const response = await fetch(providerUrl, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return unavailable(`La prévision convective ne répond pas (${response.status}).`, horizonHours);
    const payload = await response.json() as OpenMeteoPayload;
    const minutely = payload.minutely_15;
    const times = Array.isArray(minutely?.time) ? minutely.time : [];
    const points: StormForecastPoint[] = times.flatMap((time, index) => {
      const atUtc = utcTimestamp(time);
      if (!atUtc) return [];
      return [{
        atUtc,
        lightningPotentialJkg: nullableNumber(minutely?.lightning_potential?.[index]),
        capeJkg: nullableNumber(minutely?.cape?.[index]),
        precipitationMm: nullableNumber(minutely?.precipitation?.[index]),
        windGustKmh: nullableNumber(minutely?.wind_gusts_10m?.[index])
      }];
    });
    if (!points.length) return unavailable("Aucune échéance convective exploitable n’a été reçue.", horizonHours);
    const body: StormForecastFeed = {
      status: "available",
      source: "Open-Meteo — prévision multi-modèles",
      retrievedAt: new Date().toISOString(),
      horizonHours,
      points,
      message: "Prévision convective disponible. Il ne s’agit pas d’impacts de foudre observés."
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return unavailable("Prévision convective momentanément indisponible.", horizonHours);
  }
}
