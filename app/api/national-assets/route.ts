import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 60;

type RawAircraft = {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | "ground";
  gs?: number;
  track?: number;
  r?: string;
  t?: string;
  desc?: string;
  ownOp?: string;
  category?: string;
};

const searchPoints = [
  { lat: 47.1, lon: 2.4, radius: 250 },
  { lat: 43.8, lon: 4.8, radius: 250 }
];

const operationalPattern = /(DRAGON|PELICAN|MILAN|BENGALE|SECURITE\s*CIVILE|SÉCURITÉ\s*CIVILE|CIVIL\s*SECURITY|SAMU|SMUR|GENDARMERIE|DOUANES|POLICE|CANADAIR|DASH\s*8|CL-415|Q400)/i;

function isOperational(item: RawAircraft) {
  return operationalPattern.test(
    [item.flight, item.r, item.t, item.desc, item.ownOp, item.category]
      .filter(Boolean)
      .join(" ")
  );
}

function normalize(item: RawAircraft) {
  if (typeof item.lat !== "number" || typeof item.lon !== "number") return null;
  return {
    id: item.hex?.trim() || `${item.lat}-${item.lon}`,
    callsign: item.flight?.trim() || item.r?.trim() || item.hex?.toUpperCase() || "Sans indicatif",
    latitude: item.lat,
    longitude: item.lon,
    altitude: typeof item.alt_baro === "number" ? item.alt_baro * 0.3048 : null,
    speed: typeof item.gs === "number" ? item.gs * 1.852 : null,
    track: typeof item.track === "number" ? item.track : null,
    registration: item.r?.trim() || null,
    aircraftType: item.t?.trim() || null,
    description: item.desc?.trim() || null,
    operator: item.ownOp?.trim() || null,
    onGround: item.alt_baro === "ground"
  };
}

async function fetchPoint(point: (typeof searchPoints)[number]) {
  const response = await fetch(
    `https://api.airplanes.live/v2/point/${point.lat}/${point.lon}/${point.radius}`,
    {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(9000),
      headers: {
        Accept: "application/json",
        "User-Agent": "XavPac/4.0 non-commercial operational dashboard"
      }
    }
  );
  if (!response.ok) throw new Error(`Airplanes.live ${response.status}`);
  const data = await response.json();
  return Array.isArray(data.ac) ? (data.ac as RawAircraft[]) : [];
}

export async function GET() {
  try {
    const collected: RawAircraft[] = [];
    for (let index = 0; index < searchPoints.length; index += 1) {
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1100));
      collected.push(...(await fetchPoint(searchPoints[index])));
    }

    const unique = new Map<string, ReturnType<typeof normalize>>();
    for (const raw of collected) {
      if (!isOperational(raw)) continue;
      const item = normalize(raw);
      if (item) unique.set(item.id, item);
    }

    return NextResponse.json(
      {
        source: "Détection ADS-B publique Airplanes.live",
        fetchedAt: new Date().toISOString(),
        assets: [...unique.values()]
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120"
        }
      }
    );
  } catch {
    return NextResponse.json(
      {
        source: "Détection ADS-B publique Airplanes.live",
        error: "La détection des moyens nationaux est momentanément indisponible.",
        assets: []
      },
      { status: 502 }
    );
  }
}
