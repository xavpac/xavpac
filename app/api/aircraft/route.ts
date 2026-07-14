import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function degreesForRadius(latitude: number, radiusKm: number) {
  const latitudeDelta = radiusKm / 111;
  const cosine = Math.max(Math.cos((latitude * Math.PI) / 180), 0.15);
  const longitudeDelta = radiusKm / (111 * cosine);

  return { latitudeDelta, longitudeDelta };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const latitude = Number(params.get("lat") ?? "46.346");
  const longitude = Number(params.get("lon") ?? "4.977");
  const radiusKm = clamp(Number(params.get("radius") ?? "20"), 5, 100);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json(
      { error: "Coordonnées invalides." },
      { status: 400 }
    );
  }

  const { latitudeDelta, longitudeDelta } = degreesForRadius(latitude, radiusKm);
  const query = new URLSearchParams({
    lamin: String(latitude - latitudeDelta),
    lamax: String(latitude + latitudeDelta),
    lomin: String(longitude - longitudeDelta),
    lomax: String(longitude + longitudeDelta)
  });

  try {
    const response = await fetch(
      `https://opensky-network.org/api/states/all?${query.toString()}`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": "XavPac/3.0"
        }
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `OpenSky indisponible (${response.status}).`,
          aircraft: [],
          source: "OpenSky Network"
        },
        { status: 502 }
      );
    }

    const payload = await response.json();
    const states = Array.isArray(payload.states) ? payload.states : [];

    const aircraft = states
      .map((state: unknown[]) => ({
        id: String(state[0] ?? ""),
        callsign: String(state[1] ?? "").trim() || "Sans indicatif",
        country: String(state[2] ?? ""),
        longitude: typeof state[5] === "number" ? state[5] : null,
        latitude: typeof state[6] === "number" ? state[6] : null,
        barometricAltitude:
          typeof state[7] === "number" ? state[7] : null,
        onGround: Boolean(state[8]),
        velocity: typeof state[9] === "number" ? state[9] : null,
        trueTrack: typeof state[10] === "number" ? state[10] : null,
        verticalRate: typeof state[11] === "number" ? state[11] : null,
        geometricAltitude:
          typeof state[13] === "number" ? state[13] : null,
        squawk: state[14] ? String(state[14]) : null,
        lastContact: typeof state[4] === "number" ? state[4] : null
      }))
      .filter(
        (aircraft: { latitude: number | null; longitude: number | null }) =>
          aircraft.latitude !== null && aircraft.longitude !== null
      );

    return NextResponse.json({
      source: "OpenSky Network",
      fetchedAt: new Date().toISOString(),
      center: { latitude, longitude, radiusKm },
      aircraft
    });
  } catch {
    return NextResponse.json(
      {
        error: "Impossible de joindre OpenSky.",
        aircraft: [],
        source: "OpenSky Network"
      },
      { status: 502 }
    );
  }
}
