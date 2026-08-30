import { findAirline, GENERIC_AIRLINE_LOGO } from "../../data/airlines.ts";
import { findAirportByIcao } from "../../data/airports.ts";
import { verifiedAircraftIdentity } from "../../data/verifiedAircraftIdentities.ts";
import { normalizeModeS, normalizeRawCallsign, normalizeRegistration, parseCallsign } from "./callsign.ts";
import { classifyAircraftVisual } from "./aircraftVisual.ts";
import { resolveAircraftIdentity, type IdentityCandidate } from "./identityResolver.ts";
import type { AircraftCategory, AircraftEnrichmentInput, AirportIdentity, DataMethod, EnrichedAircraft, EnrichedPhoto, RouteConfidence } from "./types.ts";
import { lookupAdsbDb, type AdsbDbAirport } from "./providers/adsbdb.ts";
import { lookupOpenSkyFlight } from "./providers/opensky.ts";
import { lookupExactPhoto } from "./providers/planespotters.ts";
import { resolveAircraftRoute, type RouteCandidate } from "./routeResolver.ts";

function airport(value?: AdsbDbAirport | null): AirportIdentity | null {
  if (!value) return null;
  return {
    name: value.name?.trim() || null,
    municipality: value.municipality?.trim() || null,
    iata: value.iata_code?.trim().toUpperCase() || null,
    icao: value.icao_code?.trim().toUpperCase() || null,
    latitude: typeof value.latitude === "number" ? value.latitude : null,
    longitude: typeof value.longitude === "number" ? value.longitude : null
  };
}

function openskyAirport(icao?: string | null): AirportIdentity | null {
  const code = icao?.trim().toUpperCase();
  if (!code) return null;
  const local = findAirportByIcao(code);
  return { name: local?.name ?? null, municipality: local?.municipality ?? null, iata: local?.iata ?? null, icao: code, latitude: null, longitude: null };
}

function label(origin: AirportIdentity | null, destination: AirportIdentity | null) {
  if (!origin || !destination) return null;
  const from = origin.iata || origin.icao;
  const to = destination.iata || destination.icao;
  return from && to ? `${from} → ${to}` : null;
}

function fallbackPhoto(aircraftType: string | null, airlineId?: string, ...context: Array<string | null | undefined>): EnrichedPhoto {
  if (airlineId?.startsWith("easyjet") && /A32[01]/i.test(aircraftType ?? "")) {
    return { url: "/aircraft/easyjet-a320.jpg", kind: "same-model-operator", label: "Photo du même modèle/opérateur", source: "Photothèque locale XavPac", photographer: null };
  }
  const visual = classifyAircraftVisual(aircraftType, ...context);
  if (visual.kind === "medical") {
    return { url: "/aircraft/emergency-helicopter.svg", kind: "type-illustration", label: "Illustration de la catégorie", source: "Illustration XavPac", photographer: null };
  }
  if (visual.kind === "civil-security" || visual.kind === "water-bomber") {
    return { url: "/aircraft/civil-security-aircraft.svg", kind: "type-illustration", label: "Illustration de la catégorie", source: "Illustration XavPac", photographer: null };
  }
  if (visual.kind === "airship") {
    return { url: "/aircraft/airship.svg", kind: "type-illustration", label: "Illustration de la catégorie", source: "Illustration XavPac", photographer: null };
  }
  return { url: "/aircraft/generic-aircraft.jpg", kind: "generic", label: "Illustration générique", source: "Photothèque locale XavPac", photographer: null };
}

function identityCategory(...values: Array<string | null | undefined>): AircraftCategory {
  if (!values.some((value) => value?.trim())) return "unknown";
  const kind = classifyAircraftVisual(...values).kind;
  if (kind === "helicopter" || kind === "medical") return "helicopter";
  if (kind === "airship") return "airship";
  if (kind === "balloon") return "balloon";
  if (kind === "airliner") return "airliner";
  if (kind === "turboprop") return "turboprop";
  if (kind === "light") return "light";
  if (kind === "military" || kind === "surveillance" || kind === "civil-security" || kind === "water-bomber") return "military";
  if (kind === "drone") return "drone";
  return kind === "specialized" ? "specialized" : "unknown";
}

function aggregateIdentityConfidence(identity: ReturnType<typeof resolveAircraftIdentity>): RouteConfidence {
  const values = Object.values(identity.fields);
  if (!values.length) return "unavailable";
  if (values.every((field) => field?.confidence === "confirmed")) return "confirmed";
  if (values.some((field) => field?.confidence === "confirmed" || field?.confidence === "probable")) return "probable";
  return "inferred";
}

function aggregateIdentityMethod(identity: ReturnType<typeof resolveAircraftIdentity>): DataMethod {
  const methods = [...new Set(Object.values(identity.fields).map((field) => field?.method).filter((method): method is DataMethod => Boolean(method)))];
  return methods.length > 1 ? "merged" : methods[0] ?? "direct";
}

export async function enrichAircraft(input: AircraftEnrichmentInput): Promise<EnrichedAircraft> {
  const retrievedAt = new Date().toISOString();
  const modeS = normalizeModeS(input.modeS) ?? "";
  const registrationInput = normalizeRegistration(input.registration);
  const rawCallsign = normalizeRawCallsign(input.callsign);
  const parsed = parseCallsign(rawCallsign);
  const adsbdb = await lookupAdsbDb({ modeS, registration: registrationInput, callsign: rawCallsign });
  const aircraft = adsbdb.aircraft;
  const route = adsbdb.route;
  const verified = verifiedAircraftIdentity(modeS);
  const candidates: IdentityCandidate[] = [
    {
      source: input.positionSource?.trim() || "Airplanes.live",
      retrievedAt,
      confidence: "probable",
      method: "direct",
      priority: 40,
      values: {
        registration: registrationInput,
        aircraftModel: input.description?.trim() || null,
        icaoTypeCode: input.aircraftType?.trim() || null,
        operator: input.operator?.trim() || null,
        category: identityCategory(input.aircraftType, input.description, input.operator, input.category)
      }
    },
    ...(input.learnedIdentity ? [{
      source: input.learnedIdentity.sources.join(" + ") || "Mémoire XavPac",
      retrievedAt: input.learnedIdentity.updatedAt,
      // La mémoire navigateur est utile en secours mais ne peut jamais s’auto-déclarer vérifiée.
      confidence: "inferred" as const,
      method: "historical" as const,
      priority: 50,
      values: {
        registration: input.learnedIdentity.registration,
        manufacturer: input.learnedIdentity.manufacturer,
        aircraftModel: input.learnedIdentity.aircraftModel,
        icaoTypeCode: input.learnedIdentity.icaoTypeCode,
        operator: input.learnedIdentity.operator,
        category: input.learnedIdentity.category
      }
    }] : []),
    ...(aircraft ? [{
      source: "ADSBDB",
      retrievedAt,
      confidence: "probable" as const,
      method: "community" as const,
      priority: 80,
      values: {
        registration: normalizeRegistration(aircraft.registration),
        manufacturer: aircraft.manufacturer,
        aircraftModel: aircraft.type,
        icaoTypeCode: aircraft.icao_type,
        operator: aircraft.registered_owner,
        category: identityCategory(aircraft.icao_type, aircraft.type, aircraft.manufacturer, aircraft.registered_owner)
      }
    }] : []),
    ...(verified ? [{
      source: `Référentiel XavPac vérifié (${verified.sources.join(" + ")})`,
      retrievedAt: verified.verifiedAt,
      confidence: "confirmed" as const,
      method: "historical" as const,
      priority: 100,
      values: {
        registration: verified.registration,
        manufacturer: verified.manufacturer,
        aircraftModel: verified.aircraftModel,
        icaoTypeCode: verified.icaoTypeCode,
        operator: verified.operator,
        category: verified.category
      }
    }] : [])
  ];
  const identity = resolveAircraftIdentity(candidates);
  const identityConfidence = aggregateIdentityConfidence(identity);
  const registration = identity.registration;
  const callsignIcao = normalizeRawCallsign(route?.callsign_icao) ?? parsed.icao;
  const flightNumberIata = normalizeRawCallsign(route?.callsign_iata) ?? parsed.iata;
  const airline = findAirline({
    icao: route?.airline?.icao ?? parsed.airlineIcao,
    iata: route?.airline?.iata ?? parsed.airlineIata,
    operator: route?.airline?.name ?? identity.operator ?? input.operator,
    callsign: callsignIcao ?? rawCallsign
  });

  const routeCandidates: RouteCandidate[] = [];
  const adsbDbOrigin = airport(route?.origin);
  const adsbDbDestination = airport(route?.destination);
  if (adsbDbOrigin || adsbDbDestination) routeCandidates.push({
    source: "ADSBDB",
    origin: adsbDbOrigin,
    destination: adsbDbDestination,
    confidence: adsbDbOrigin && adsbDbDestination ? "probable" : "unavailable",
    method: "community",
    retrievedAt,
    priority: 90
  });

  if (!adsbDbOrigin || !adsbDbDestination) {
    const opensky = await lookupOpenSkyFlight(modeS, rawCallsign);
    if (opensky?.estDepartureAirport && opensky?.estArrivalAirport) {
      routeCandidates.push({
        source: "OpenSky",
        origin: openskyAirport(opensky.estDepartureAirport),
        destination: openskyAirport(opensky.estArrivalAirport),
        confidence: "inferred",
        method: "historical",
        retrievedAt,
        priority: 60
      });
    }
  }
  const routeResolution = resolveAircraftRoute(routeCandidates);
  const departureAirport = routeResolution.selected?.origin ?? null;
  const arrivalAirport = routeResolution.selected?.destination ?? null;
  const routeSource = routeResolution.selected?.source ?? null;
  const routeConfidence = routeResolution.selected?.confidence ?? "unavailable";

  const exactPhoto = await lookupExactPhoto({ modeS, registration });
  const aircraftType = identity.aircraftModel || identity.icaoTypeCode || input.aircraftType?.trim() || input.description?.trim() || null;
  const photo: EnrichedPhoto = exactPhoto
    ? { url: exactPhoto.url, kind: "exact", label: "Photo exacte", source: "PlaneSpotters", photographer: exactPhoto.photographer }
    : aircraft?.url_photo || aircraft?.url_photo_thumbnail
      ? { url: aircraft.url_photo || aircraft.url_photo_thumbnail || "/aircraft/generic-aircraft.jpg", kind: "exact", label: "Photo exacte", source: "ADSBDB", photographer: null }
      : fallbackPhoto(aircraftType, airline?.id, identity.operator, input.operator, input.description, input.category, rawCallsign);

  return {
    modeS,
    registration,
    rawCallsign,
    callsignIcao,
    flightNumberIata,
    operator: route?.airline?.name?.trim() || identity.operator || airline?.canonicalName || input.operator?.trim() || null,
    aircraftOperator: identity.operator,
    flightOperator: route?.airline?.name?.trim() || null,
    airlineIcao: route?.airline?.icao?.trim().toUpperCase() || airline?.icao[0] || parsed.airlineIcao,
    airlineIata: route?.airline?.iata?.trim().toUpperCase() || airline?.iata[0] || parsed.airlineIata,
    aircraftType,
    aircraftModel: identity.aircraftModel,
    icaoTypeCode: identity.icaoTypeCode,
    aircraftCategory: identity.category,
    manufacturer: identity.manufacturer,
    identityStatus: identity.status,
    identitySources: identity.sources,
    identityFields: identity.fields,
    departureAirport,
    arrivalAirport,
    routeLabel: label(departureAirport, arrivalAirport),
    routeSource,
    routeConfidence,
    routeProvenance: {
      source: routeSource ?? "Aucune source",
      retrievedAt,
      confidence: routeConfidence,
      method: routeResolution.selected?.method ?? "calculated",
      freshnessSeconds: 0
    },
    identityProvenance: {
      source: identity.sources.join(" + ") || input.positionSource?.trim() || "Airplanes.live",
      retrievedAt,
      confidence: identityConfidence,
      method: aggregateIdentityMethod(identity),
      freshnessSeconds: 0
    },
    photoProvenance: {
      source: photo.source,
      retrievedAt,
      confidence: photo.kind === "exact" ? "probable" : photo.kind === "generic" ? "unavailable" : "inferred",
      method: photo.source === "PlaneSpotters" || photo.source === "ADSBDB" ? "community" : "historical",
      freshnessSeconds: 0
    },
    photo,
    logo: airline?.logoPath || GENERIC_AIRLINE_LOGO,
    positionSource: input.positionSource?.trim() || "unknown",
    dataUpdatedAt: retrievedAt
  };
}
