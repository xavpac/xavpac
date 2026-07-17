import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type OverpassElement = { id: number; lat?: number; lon?: number; center?: { lat?: number; lon?: number }; tags?: Record<string, string> };

function geometry(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => value * Math.PI / 180;
  const first = toRad(lat1), second = toRad(lat2), deltaLat = toRad(lat2 - lat1), deltaLon = toRad(lon2 - lon1);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(first) * Math.cos(second) * Math.sin(deltaLon / 2) ** 2;
  const y = Math.sin(deltaLon) * Math.cos(second);
  const x = Math.cos(first) * Math.sin(second) - Math.sin(first) * Math.cos(second) * Math.cos(deltaLon);
  return { distanceKm: 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)), bearing: (Math.atan2(y, x) * 180 / Math.PI + 360) % 360 };
}

export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 41 || latitude > 52 || longitude < -6 || longitude > 10) return NextResponse.json({ places: [], error: "Coordonnées invalides." }, { status: 400 });
  const query = `[out:json][timeout:12];(nwr(around:50000,${latitude},${longitude})[aeroway=aerodrome];nwr(around:50000,${latitude},${longitude})[aeroway=heliport];);out center tags;`;
  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: query, signal: AbortSignal.timeout(14000), headers: { "Content-Type": "text/plain", "User-Agent": `XavPac/${process.env.NEXT_PUBLIC_XAVPAC_VERSION ?? "development"}` } });
    if (!response.ok) throw new Error(String(response.status));
    const payload = await response.json();
    const places = ((payload.elements ?? []) as OverpassElement[]).flatMap((element) => {
      const lat = element.lat ?? element.center?.lat, lon = element.lon ?? element.center?.lon;
      if (typeof lat !== "number" || typeof lon !== "number") return [];
      const metrics = geometry(latitude, longitude, lat, lon);
      return [{ id: `osm-${element.id}`, name: element.tags?.name || element.tags?.icao || "Site aéronautique", icao: element.tags?.icao ?? null, kind: element.tags?.aeroway === "heliport" ? "heliport" : "aerodrome", latitude: lat, longitude: lon, ...metrics }];
    }).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 20);
    return NextResponse.json({ source: "OpenStreetMap / Overpass", places }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    return NextResponse.json({ source: "OpenStreetMap / Overpass", places: [], error: "Recherche des sites aéronautiques indisponible." });
  }
}
