import { findAirline, GENERIC_AIRLINE_LOGO } from "../../data/airlines.ts";
import { findAirportByIcao } from "../../data/airports.ts";
import { normalizeModeS, normalizeRawCallsign, normalizeRegistration, parseCallsign } from "./callsign.ts";
import type { AircraftEnrichmentInput, AirportIdentity, EnrichedAircraft, EnrichedPhoto } from "./types.ts";
import { lookupAdsbDb, type AdsbDbAirport } from "./providers/adsbdb.ts";
import { lookupOpenSkyFlight } from "./providers/opensky.ts";
import { lookupExactPhoto } from "./providers/planespotters.ts";

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

function fallbackPhoto(aircraftType: string | null, airlineId?: string): EnrichedPhoto {
  if (airlineId?.startsWith("easyjet") && /A32[01]/i.test(aircraftType ?? "")) {
    return { url: "/aircraft/easyjet-a320.jpg", kind: "same-model-operator", label: "Photo du même modèle/opérateur", source: "Photothèque locale XavPac", photographer: null };
  }
  return { url: "/aircraft/generic-aircraft.jpg", kind: "generic", label: "Illustration générique", source: "Photothèque locale XavPac", photographer: null };
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
  const registration = normalizeRegistration(aircraft?.registration) ?? registrationInput;
  const callsignIcao = normalizeRawCallsign(route?.callsign_icao) ?? parsed.icao;
  const flightNumberIata = normalizeRawCallsign(route?.callsign_iata) ?? parsed.iata;
  const airline = findAirline({
    icao: route?.airline?.icao ?? parsed.airlineIcao,
    iata: route?.airline?.iata ?? parsed.airlineIata,
    operator: route?.airline?.name ?? aircraft?.registered_owner ?? input.operator,
    callsign: callsignIcao ?? rawCallsign
  });

  let departureAirport = airport(route?.origin);
  let arrivalAirport = airport(route?.destination);
  let routeSource: EnrichedAircraft["routeSource"] = departureAirport && arrivalAirport ? "ADSBDB" : null;
  let routeConfidence: EnrichedAircraft["routeConfidence"] = routeSource ? "probable" : "unavailable";

  if (!departureAirport || !arrivalAirport) {
    const opensky = await lookupOpenSkyFlight(modeS, rawCallsign);
    if (opensky?.estDepartureAirport && opensky?.estArrivalAirport) {
      departureAirport = openskyAirport(opensky.estDepartureAirport);
      arrivalAirport = openskyAirport(opensky.estArrivalAirport);
      routeSource = "OpenSky";
      routeConfidence = "inferred";
    }
  }

  const exactPhoto = await lookupExactPhoto({ modeS, registration });
  const aircraftType = aircraft?.icao_type?.trim() || aircraft?.type?.trim() || input.aircraftType?.trim() || null;
  const photo: EnrichedPhoto = exactPhoto
    ? { url: exactPhoto.url, kind: "exact", label: "Photo exacte", source: "PlaneSpotters", photographer: exactPhoto.photographer }
    : aircraft?.url_photo || aircraft?.url_photo_thumbnail
      ? { url: aircraft.url_photo || aircraft.url_photo_thumbnail || "/aircraft/generic-aircraft.jpg", kind: "exact", label: "Photo exacte", source: "ADSBDB", photographer: null }
      : fallbackPhoto(aircraftType, airline?.id);

  return {
    modeS,
    registration,
    rawCallsign,
    callsignIcao,
    flightNumberIata,
    operator: route?.airline?.name?.trim() || aircraft?.registered_owner?.trim() || airline?.canonicalName || input.operator?.trim() || null,
    airlineIcao: route?.airline?.icao?.trim().toUpperCase() || airline?.icao[0] || parsed.airlineIcao,
    airlineIata: route?.airline?.iata?.trim().toUpperCase() || airline?.iata[0] || parsed.airlineIata,
    aircraftType,
    manufacturer: aircraft?.manufacturer?.trim() || null,
    departureAirport,
    arrivalAirport,
    routeLabel: label(departureAirport, arrivalAirport),
    routeSource,
    routeConfidence,
    routeProvenance: {
      source: routeSource ?? "Aucune source",
      retrievedAt,
      confidence: routeConfidence,
      method: routeSource === "ADSBDB" ? "community" : routeSource === "OpenSky" ? "historical" : "calculated",
      freshnessSeconds: 0
    },
    identityProvenance: {
      source: aircraft ? "ADSBDB" : input.positionSource?.trim() || "Airplanes.live",
      retrievedAt,
      confidence: aircraft ? "probable" : "confirmed",
      method: aircraft ? "community" : "direct",
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
