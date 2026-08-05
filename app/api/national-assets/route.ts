import { NextResponse } from "next/server";
import { identifyNationalAsset } from "../../lib/nationalAssetIdentification";
import { fetchAirplanesLive } from "../../lib/aviation/providers/airplanesLive";
import { fetchAdsbFi } from "../../lib/aviation/providers/adsbFi";

export const dynamic = "force-dynamic";
export const revalidate = 360;

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
  seen?: number;
};

const searchPoints = [
  { lat: 47.1, lon: 2.4, radius: 250 },
  { lat: 43.8, lon: 4.8, radius: 250 }
];

// Un modèle générique (Q400, Beechcraft, etc.) ne prouve jamais qu'il s'agit d'un moyen opérationnel.
// Les types exclusivement dédiés à la lutte incendie, comme Fire Boss, restent admissibles.
const operationalPattern = /(DRAGON|CONDOR[A-Z]?|PELICAN|PÉLICAN|MILAN|BENGALE|SECURITE\s*CIVILE|SÉCURITÉ\s*CIVILE|SAMU|SMUR|GENDARMERIE|DOUANES|POLICE\s*NATIONALE|ARM[ÉE]E\s+DE\s+L['’ ]AIR|FRENCH\s+AIR\s+FORCE|MARINE\s+NATIONALE|FIRE\s*BOSS|AT-?802|AT8T|AQUARIUS\s+AERIAL\s+FIREFIGHTING|LX-AF[A-CF-J])/i;

function isOperational(item: RawAircraft) {
  return operationalPattern.test(
    [item.flight, item.r, item.t, item.desc, item.ownOp, item.category]
      .filter(Boolean)
      .join(" ")
  );
}

function normalize(item: RawAircraft) {
  if (typeof item.lat !== "number" || typeof item.lon !== "number") return null;
  const base = {
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
    onGround: item.alt_baro === "ground",
    lastSeenSeconds: typeof item.seen === "number" ? item.seen : null
  };
  return { ...base, identification: identifyNationalAsset(base) };
}

async function fetchPoint(point: (typeof searchPoints)[number]) {
  const input = { latitude: point.lat, longitude: point.lon, radiusNm: point.radius, revalidateSeconds: 360 };
  const results = await Promise.allSettled([fetchAirplanesLive(input), fetchAdsbFi(input)]);
  const aircraft: RawAircraft[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && Array.isArray(result.value.ac)) aircraft.push(...result.value.ac as RawAircraft[]);
  }
  if (results.every((result) => result.status === "rejected")) throw new Error("Sources ADS-B indisponibles");
  return aircraft;
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
        source: "Détection ADS-B publique Airplanes.live + adsb.fi",
        fetchedAt: new Date().toISOString(),
        assets: [...unique.values()]
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=360, stale-while-revalidate=600"
        }
      }
    );
  } catch {
    return NextResponse.json(
      {
        source: "Détection ADS-B publique Airplanes.live + adsb.fi",
        error: "La détection des moyens nationaux est momentanément indisponible.",
        assets: []
      },
      { status: 502 }
    );
  }
}
