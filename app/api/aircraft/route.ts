import { NextRequest, NextResponse } from "next/server";

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

  return value * 0.3048;
}

function knotsToMetersPerSecond(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value * 0.514444;
}

type AirplanesLiveAircraft = {
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

function normalizeAircraft(item: AirplanesLiveAircraft) {
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
    velocity: knotsToMetersPerSecond(item.gs),
    trueTrack: numberOrNull(item.track),
    verticalRate: knotsToMetersPerSecond(item.baro_rate ?? item.geom_rate),
    squawk: item.squawk?.trim() || null,
    registration: item.r?.trim() || null,
    aircraftType: item.t?.trim() || null,
    description: item.desc?.trim() || null,
    operator: item.ownOp?.trim() || null,
    category: item.category?.trim() || null,
    lastContact:
      typeof item.seen === "number"
        ? Math.floor(Date.now() / 1000 - item.seen)
        : null
  };
}

export async function GET(request: NextRequest) {
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
  const endpoint =
    `https://api.airplanes.live/v2/point/` +
    `${latitude.toFixed(5)}/${longitude.toFixed(5)}/${radiusNm}`;

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
      headers: {
        Accept: "application/json",
        "User-Agent": "XavPac/3.1 (non-commercial aviation dashboard)"
      }
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Airplanes.live indisponible (${response.status}).`,
          aircraft: [],
          source: "Airplanes.live"
        },
        {
          status: 502,
          headers: { "Cache-Control": "no-store" }
        }
      );
    }

    const payload = await response.json();
    const sourceAircraft = Array.isArray(payload.ac) ? payload.ac : [];

    const aircraft = sourceAircraft
      .map((item: AirplanesLiveAircraft) => normalizeAircraft(item))
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
          "Cache-Control": "no-store, max-age=0",
          "CDN-Cache-Control": "no-store",
          "Vercel-CDN-Cache-Control": "no-store"
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
