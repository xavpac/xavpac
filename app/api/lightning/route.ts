import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "../../lib/api/guard";
import type { LightningFeed, LightningStrike } from "../../lib/weather/lightning";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProviderPayload = {
  impacts?: unknown[];
  strikes?: unknown[];
  source?: unknown;
  availableSince?: unknown;
  retrievedAt?: unknown;
};

function validCoordinate(value: number, minimum: number, maximum: number) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateValue(value: unknown) {
  const text = stringValue(value);
  if (!text || !Number.isFinite(Date.parse(text))) return null;
  return new Date(text).toISOString();
}

function localDateTime(utcDate: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short"
  }).format(new Date(utcDate));
}

function normalizeStrike(value: unknown, providerSource: string, retrievedAt: string, index: number): LightningStrike | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const latitude = numberValue(candidate.latitude ?? candidate.lat);
  const longitude = numberValue(candidate.longitude ?? candidate.lon ?? candidate.lng);
  const occurredAtUtc = dateValue(candidate.occurredAtUtc ?? candidate.timestamp ?? candidate.time);
  if (latitude === null || longitude === null || occurredAtUtc === null
    || !validCoordinate(latitude, -90, 90) || !validCoordinate(longitude, -180, 180)) return null;
  const type = candidate.type === "cloud-ground" || candidate.type === "intra-cloud" ? candidate.type : undefined;
  const polarity = candidate.polarity === "positive" || candidate.polarity === "negative" ? candidate.polarity : undefined;
  const peakCurrentKa = numberValue(candidate.peakCurrentKa);
  const precisionMeters = numberValue(candidate.precisionMeters);
  const detectionQuality = stringValue(candidate.detectionQuality);
  return {
    id: stringValue(candidate.id) ?? `${occurredAtUtc}:${latitude}:${longitude}:${index}`,
    latitude,
    longitude,
    occurredAtUtc,
    occurredAtLocal: localDateTime(occurredAtUtc),
    source: stringValue(candidate.source) ?? providerSource,
    retrievedAt,
    ...(type ? { type } : {}),
    ...(polarity ? { polarity } : {}),
    ...(peakCurrentKa === null ? {} : { peakCurrentKa }),
    ...(precisionMeters === null && !detectionQuality ? {} : {
      quality: {
        ...(precisionMeters === null ? {} : { precisionMeters }),
        ...(detectionQuality ? { detectionQuality } : {})
      }
    })
  };
}

function unavailable(message: string, status = 503) {
  const body: LightningFeed = {
    status: "unavailable",
    source: null,
    retrievedAt: new Date().toISOString(),
    availableSince: null,
    impacts: [],
    message
  };
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "lightning", 30, 60_000);
  if (limited) return limited;

  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  const radiusKm = Number(request.nextUrl.searchParams.get("radiusKm") ?? "50");
  const from = dateValue(request.nextUrl.searchParams.get("from"));
  if (!validCoordinate(latitude, -90, 90) || !validCoordinate(longitude, -180, 180)
    || !Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 250 || !from) {
    return unavailable("Paramètres de recherche foudre invalides.", 400);
  }

  const providerUrl = process.env.LIGHTNING_PROVIDER_URL?.trim();
  if (!providerUrl) {
    return unavailable("Aucune source structurée et autorisée n’est configurée. La carte publique indicative reste consultable, mais elle ne permet pas de calculer des statistiques fiables.");
  }

  try {
    const providerRequest = new URL(providerUrl);
    providerRequest.searchParams.set("lat", String(latitude));
    providerRequest.searchParams.set("lon", String(longitude));
    providerRequest.searchParams.set("radiusKm", String(radiusKm));
    providerRequest.searchParams.set("from", from);
    const token = process.env.LIGHTNING_PROVIDER_TOKEN?.trim();
    const response = await fetch(providerRequest, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
    if (!response.ok) return unavailable(`La source foudre configurée ne répond pas (${response.status}).`, 502);
    const payload = await response.json() as ProviderPayload;
    const retrievedAt = dateValue(payload.retrievedAt) ?? new Date().toISOString();
    const source = stringValue(payload.source) ?? process.env.LIGHTNING_PROVIDER_NAME?.trim() ?? "Source foudre configurée";
    const rawImpacts = Array.isArray(payload.impacts) ? payload.impacts : Array.isArray(payload.strikes) ? payload.strikes : null;
    if (!rawImpacts) return unavailable("La source foudre a répondu dans un format non reconnu.", 502);
    const impacts = rawImpacts.map((impact, index) => normalizeStrike(impact, source, retrievedAt, index)).filter((impact): impact is LightningStrike => Boolean(impact));
    const body: LightningFeed = {
      status: "available",
      source,
      retrievedAt,
      availableSince: dateValue(payload.availableSince),
      impacts,
      message: impacts.length
        ? `${impacts.length} impact${impacts.length === 1 ? "" : "s"} reçu${impacts.length === 1 ? "" : "s"}.`
        : "Aucune activité foudre détectée dans les données disponibles sur la période sélectionnée."
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return unavailable("DONNÉES FOUDRE NON DISPONIBLES — échec de la source configurée.", 502);
  }
}
