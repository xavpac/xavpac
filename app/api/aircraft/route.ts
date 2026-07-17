import { NextRequest, NextResponse } from "next/server";
import { feetPerMinuteToMetersPerSecond, feetToMeters, knotsToMetersPerSecond } from "../../lib/aviation/units";
import { enforceRateLimit } from "../../lib/api/guard";
import { fetchAirplanesLive } from "../../lib/aviation/providers/airplanesLive";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function altitudeFeetToMeters(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return feetToMeters(value);
}

function speedKnotsToMetersPerSecond(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return knotsToMetersPerSecond(value);
}

function verticalFeetPerMinuteToMetersPerSecond(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return feetPerMinuteToMetersPerSecond(value);
}

type AirplanesLiveAircraft = {
  type?: string;
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | "ground";
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  geom_rate?: number;
  squawk?: string;
  seen?: number;
  seen_pos?: number;
  r?: string;
  t?: string;
  desc?: string;
  ownOp?: string;
  category?: string;
};

function normalizeAircraft(item: AirplanesLiveAircraft, sourceTimestampMs: number) {
  const latitude = numberOrNull(item.lat);
  const longitude = numberOrNull(item.lon);

  if (latitude === null || longitude === null) {
    return null;
  }

  const onGround = item.alt_baro === "ground";
  const barometricAltitude =
    typeof item.alt_baro === "number"
      ? altitudeFeetToMeters(item.alt_baro)
      : null;
  const positionAgeSeconds = numberOrNull(item.seen_pos) ?? numberOrNull(item.seen);

  return {
    id: item.hex?.trim() || `${latitude}-${longitude}`,
    callsign:
      item.flight?.trim() ||
      item.r?.trim() ||
      item.hex?.trim().toUpperCase() ||
      "Sans indicatif",
    country:
      item.ownOp?.trim() ||
      item.desc?.trim() ||
      item.t?.trim() ||
      "Donnée ADS-B",
    longitude,
    latitude,
    barometricAltitude,
    geometricAltitude: altitudeFeetToMeters(item.alt_geom),
    onGround,
    velocity: speedKnotsToMetersPerSecond(item.gs),
    trueTrack: numberOrNull(item.track),
    verticalRate: verticalFeetPerMinuteToMetersPerSecond(item.baro_rate ?? item.geom_rate),
    squawk: item.squawk?.trim() || null,
    registration: item.r?.trim() || null,
    aircraftType: item.t?.trim() || null,
    description: item.desc?.trim() || null,
    operator: item.ownOp?.trim() || null,
    category: item.category?.trim() || null,
    positionSource: item.type?.trim() || "unknown",
    lastPositionAt: positionAgeSeconds === null ? null : new Date(sourceTimestampMs - positionAgeSeconds * 1000).toISOString(),
    positionAgeSeconds,
    lastContact:
      typeof item.seen === "number"
        ? Math.floor(sourceTimestampMs / 1000 - item.seen)
        : null
  };
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "aircraft", 30, 60_000);
  if (limited) return limited;
  const params = request.nextUrl.searchParams;
  const latitude = Number(params.get("lat") ?? "46.346");
  const longitude = Number(params.get("lon") ?? "4.977");
  const radiusKm = clamp(Number(params.get("radius") ?? "20"), 5, 100);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return NextResponse.json(
      { error: "Coordonnées invalides.", aircraft: [] },
      { status: 400 }
    );
  }

  // Airplanes.live attend un rayon en milles nautiques.
  const radiusNm = clamp(Math.ceil(radiusKm / 1.852), 3, 54);
  try {
    const payload = await fetchAirplanesLive({ latitude: Number(latitude.toFixed(5)), longitude: Number(longitude.toFixed(5)), radiusNm, revalidateSeconds: 8 });
    const sourceAircraft = Array.isArray(payload.ac) ? payload.ac as AirplanesLiveAircraft[] : [];
    const rawSourceTimestamp = numberOrNull(payload.now);
    const sourceTimestampMs = rawSourceTimestamp === null
      ? Date.now()
      : rawSourceTimestamp > 10_000_000_000 ? rawSourceTimestamp : rawSourceTimestamp * 1000;

    const aircraft = sourceAircraft
      .map((item: AirplanesLiveAircraft) => normalizeAircraft(item, sourceTimestampMs))
      .filter((item: ReturnType<typeof normalizeAircraft>) => item !== null);

    return NextResponse.json(
      {
        source: "Airplanes.live",
        fetchedAt: new Date().toISOString(),
        center: { latitude, longitude, radiusKm, radiusNm },
        total: aircraft.length,
        aircraft
      },
      {
        headers: {
          "Cache-Control": "public, max-age=5, s-maxage=8, stale-while-revalidate=4"
        }
      }
    );
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "La source aérienne a dépassé le délai de réponse."
        : "Impossible de joindre Airplanes.live.";

    return NextResponse.json(
      {
        error: message,
        aircraft: [],
        source: "Airplanes.live"
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" }
      }
    );
  }
}
