export type RouteConfidence = "confirmed" | "probable" | "inferred" | "unavailable";

export type IdentityStatus = "complete" | "partial" | "unknown";

export type AircraftCategory =
  | "airliner"
  | "turboprop"
  | "light"
  | "helicopter"
  | "military"
  | "drone"
  | "specialized"
  | "unknown";

export type DataMethod = "direct" | "community" | "historical" | "calculated" | "merged";

export type DataProvenance = {
  source: string;
  retrievedAt: string;
  confidence: RouteConfidence;
  method: DataMethod;
  freshnessSeconds: number;
};

export type IdentityFieldName =
  | "registration"
  | "manufacturer"
  | "aircraftModel"
  | "icaoTypeCode"
  | "operator"
  | "category";

export type IdentityFieldEvidence = DataProvenance & {
  value: string;
};

export type LearnedAircraftIdentity = {
  modeS: string;
  registration: string | null;
  manufacturer: string | null;
  aircraftModel: string | null;
  icaoTypeCode: string | null;
  operator: string | null;
  category: AircraftCategory;
  confidence: RouteConfidence;
  sources: string[];
  updatedAt: string;
};

export type AirportIdentity = {
  name: string | null;
  municipality: string | null;
  iata: string | null;
  icao: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type AirportWeather = {
  time: string | null;
  temperature_2m: number | null;
  weather_code: number | null;
  wind_speed_10m: number | null;
  wind_gusts_10m: number | null;
  visibility: number | null;
  surface_pressure: number | null;
  cloud_cover: number | null;
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
  aircraftOperator: string | null;
  flightOperator: string | null;
  airlineIcao: string | null;
  airlineIata: string | null;
  aircraftType: string | null;
  aircraftModel: string | null;
  icaoTypeCode: string | null;
  aircraftCategory: AircraftCategory;
  manufacturer: string | null;
  identityStatus: IdentityStatus;
  identitySources: string[];
  identityFields: Partial<Record<IdentityFieldName, IdentityFieldEvidence>>;
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
  category?: string | null;
  positionSource?: string | null;
  distanceKm?: number | null;
  learnedIdentity?: LearnedAircraftIdentity | null;
};
