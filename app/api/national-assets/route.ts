import { NextResponse } from "next/server";
import { identifyNationalAsset } from "../../lib/nationalAssetIdentification";
import { fetchAirplanesLive } from "../../lib/aviation/providers/airplanesLive";

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
  seen?: number;
};

const searchPoints = [
  { lat: 47.1, lon: 2.4, radius: 250 },
  { lat: 43.8, lon: 4.8, radius: 250 }
];

// Un modèle seul (Q400, Beechcraft, etc.) ne prouve jamais qu'il s'agit d'un moyen national.
// Le filtre exige un indicatif opérationnel ou un organisme public français identifiable.
const operationalPattern = /(DRAGON|PELICAN|PÉLICAN|MILAN|BENGALE|SECURITE\s*CIVILE|SÉCURITÉ\s*CIVILE|SAMU|SMUR|GENDARMERIE|DOUANES|POLICE\s*NATIONALE|ARM[ÉE]E\s+DE\s+L['’ ]AIR|FRENCH\s+AIR\s+FORCE|MARINE\s+NATIONALE)/i;

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
  const data = await fetchAirplanesLive({ latitude: point.lat, longitude: point.lon, radiusNm: point.radius, revalidateSeconds: 60 });
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
