import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RawAircraft = {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  desc?: string;
  ownOp?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | "ground";
  alt_geom?: number;
  gs?: number;
  track?: number;
  geom_rate?: number;
  baro_rate?: number;
  category?: string;
  seen?: number;
};

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function radians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6371;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number) {
  const y = Math.sin(radians(lon2 - lon1)) * Math.cos(radians(lat2));
  const x = Math.cos(radians(lat1)) * Math.sin(radians(lat2)) - Math.sin(radians(lat1)) * Math.cos(radians(lat2)) * Math.cos(radians(lon2 - lon1));
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

function category(raw: RawAircraft) {
  const haystack = `${raw.flight ?? ""} ${raw.r ?? ""} ${raw.t ?? ""} ${raw.desc ?? ""} ${raw.ownOp ?? ""}`.toUpperCase();
  if (/DRAGON|CHOUCAS|SAMU|H145|H135|EC35|EC45|HELICOPTER/.test(haystack)) return "helicopter";
  if (/PELICAN|CANADAIR|CL2T|CL-415|DASH|Q400|DH8D/.test(haystack)) return "water-bomber";
  if (/RAFALE|A400|AWACS|ARMEE|ARMÉE|MILITARY/.test(haystack)) return "military";
  if (/SAMU|MEDICAL/.test(haystack)) return "medical";
  if (/A3|B7|E1|E2|CRJ|AT7|AIRBUS|BOEING|EMBRAER/.test(haystack)) return "airliner";
  return "other";
}

export async function GET(request: NextRequest) {
  const lat = numberParam(request.nextUrl.searchParams.get("lat"), 46.30063);
  const lon = numberParam(request.nextUrl.searchParams.get("lon"), 5.1154);
  const radius = Math.min(Math.max(numberParam(request.nextUrl.searchParams.get("radius"), 150), 1), 250);

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: "Coordonnées invalides" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(`https://api.airplanes.live/v2/point/${lat}/${lon}/${radius}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "XavPac/7.0" },
    });
    if (!response.ok) {
      return NextResponse.json({ error: `Source ADS-B indisponible (${response.status})` }, { status: 502 });
    }
    const payload = (await response.json()) as { ac?: RawAircraft[] };
    const aircraft = (payload.ac ?? [])
      .filter((item) => typeof item.lat === "number" && typeof item.lon === "number")
      .map((item) => {
        const callsign = item.flight?.trim() || "";
        const registration = item.r?.trim() || "";
        const type = item.t?.trim() || "";
        const altitudeFt = item.alt_baro === "ground" ? 0 : typeof item.alt_baro === "number" ? item.alt_baro : typeof item.alt_geom === "number" ? item.alt_geom : null;
        const lastSeen = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Paris" }).format(new Date());
        return {
          id: item.hex || `${item.lat}-${item.lon}-${callsign}`,
          hex: item.hex || "",
          callsign,
          registration,
          type,
          typeLabel: item.desc?.trim() || type || "Type non renseigné",
          operator: item.ownOp?.trim() || "Opérateur non renseigné",
          category: category(item),
          latitude: item.lat as number,
          longitude: item.lon as number,
          altitudeFt,
          groundSpeedKt: typeof item.gs === "number" ? item.gs : null,
          trackDeg: typeof item.track === "number" ? item.track : null,
          verticalRateFpm: typeof item.geom_rate === "number" ? item.geom_rate : typeof item.baro_rate === "number" ? item.baro_rate : null,
          distanceKm: distanceKm(lat, lon, item.lat as number, item.lon as number),
          bearingDeg: bearingDeg(lat, lon, item.lat as number, item.lon as number),
          onGround: item.alt_baro === "ground" || altitudeFt === 0,
          source: "ADS-B",
          lastSeen,
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return NextResponse.json(
      { aircraft, total: aircraft.length, generatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "Délai ADS-B dépassé" : "Connexion ADS-B impossible";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
