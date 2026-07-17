export type RouteConfidence = "confirmed" | "probable" | "inferred" | "unavailable";

export type DataMethod = "direct" | "community" | "historical" | "calculated";

export type DataProvenance = {
  source: string;
  retrievedAt: string;
  confidence: RouteConfidence;
  method: DataMethod;
  freshnessSeconds: number;
};

export type AirportIdentity = {
  name: string | null;
  municipality: string | null;
  iata: string | null;
  icao: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type EnrichedPhoto = {
  url: string;
  kind: "exact" | "same-model-operator" | "same-model" | "generic";
  label: "Photo exacte" | "Photo du même modèle/opérateur" | "Photo du même modèle" | "Illustration générique";
  source: string;
  photographer: string | null;
};

export type EnrichedAircraft = {
  modeS: string;
  registration: string | null;
  rawCallsign: string | null;
  callsignIcao: string | null;
  flightNumberIata: string | null;
  operator: string | null;
  airlineIcao: string | null;
  airlineIata: string | null;
  aircraftType: string | null;
  manufacturer: string | null;
  departureAirport: AirportIdentity | null;
  arrivalAirport: AirportIdentity | null;
  routeLabel: string | null;
  routeSource: "ADSBDB" | "OpenSky" | "Observations XavPac" | null;
  routeConfidence: RouteConfidence;
  routeProvenance: DataProvenance;
  identityProvenance: DataProvenance;
  photoProvenance: DataProvenance;
  photo: EnrichedPhoto;
  logo: string;
  positionSource: string;
  dataUpdatedAt: string;
};

export type AircraftEnrichmentInput = {
  modeS?: string | null;
  registration?: string | null;
  callsign?: string | null;
  operator?: string | null;
  aircraftType?: string | null;
  description?: string | null;
  positionSource?: string | null;
  distanceKm?: number | null;
};
