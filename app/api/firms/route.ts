import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "../../lib/api/guard";
import {
  distanceBetweenKm,
  firmsBoundingBox,
  isFirmsSource,
  parseFirmsCsv,
  type FirmsFeed
} from "../../lib/fire/firms";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function unavailable(message: string, status = 503) {
  const body: FirmsFeed = {
    status: "unavailable",
    source: "NASA FIRMS",
    retrievedAt: new Date().toISOString(),
    detections: [],
    message
  };
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function validCoordinate(value: number, minimum: number, maximum: number) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "firms", 20, 60_000);
  if (limited) return limited;

  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  const radiusKm = Number(request.nextUrl.searchParams.get("radiusKm") ?? "50");
  const sourceValue = request.nextUrl.searchParams.get("source")?.trim() || process.env.NASA_FIRMS_SOURCE?.trim() || "VIIRS_SNPP_NRT";
  if (!validCoordinate(latitude, -90, 90) || !validCoordinate(longitude, -180, 180)
    || !Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 250 || !isFirmsSource(sourceValue)) {
    return unavailable("Paramètres de recherche FIRMS invalides.", 400);
  }

  const mapKey = process.env.NASA_FIRMS_MAP_KEY?.trim();
  if (!mapKey) {
    return unavailable("NASA FIRMS n’est pas encore configuré sur ce déploiement. Aucun point chaud fictif n’est affiché.");
  }

  const box = firmsBoundingBox(latitude, longitude, radiusKm);
  const coordinates = [box.west, box.south, box.east, box.north].map((value) => value.toFixed(5)).join(",");
  const endpoint = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(mapKey)}/${sourceValue}/${coordinates}/1`;

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "text/csv", "User-Agent": "XavPac/6.5 (NASA FIRMS field viewer)" }
    });
    if (!response.ok) return unavailable(`NASA FIRMS ne répond pas correctement (${response.status}).`, 502);
    const detections = parseFirmsCsv(await response.text(), sourceValue)
      .filter((detection) => distanceBetweenKm([latitude, longitude], [detection.latitude, detection.longitude]) <= radiusKm);
    const body: FirmsFeed = {
      status: "available",
      source: "NASA FIRMS",
      retrievedAt: new Date().toISOString(),
      detections,
      message: detections.length
        ? `${detections.length} détection${detections.length === 1 ? "" : "s"} thermique${detections.length === 1 ? "" : "s"} satellite reçue${detections.length === 1 ? "" : "s"}.`
        : "Aucune détection thermique satellite reçue dans ce périmètre sur la dernière journée."
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return unavailable("NASA FIRMS est momentanément inaccessible.", 502);
  }
}
