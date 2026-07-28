import type { AirportIdentity, AirportWeather, RouteConfidence } from "./types.ts";

export function validCoordinate(value: number | null | undefined, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

export function airportHasCoordinates(airport: AirportIdentity | null | undefined) {
  return Boolean(airport
    && validCoordinate(airport.latitude, -90, 90)
    && validCoordinate(airport.longitude, -180, 180));
}

export function routeCanUseAirportWeather(
  confidence: RouteConfidence,
  departure: AirportIdentity | null | undefined,
  arrival: AirportIdentity | null | undefined
) {
  return confidence === "probable" && airportHasCoordinates(departure) && airportHasCoordinates(arrival);
}

export function routeWeatherKey(departure: AirportIdentity, arrival: AirportIdentity) {
  return [departure.icao ?? departure.iata ?? "DEP", departure.latitude, departure.longitude,
    arrival.icao ?? arrival.iata ?? "ARR", arrival.latitude, arrival.longitude].join(":");
}

export function weatherCondition(code?: number | null) {
  if (code === undefined || code === null) return "Conditions non déterminées";
  if (code === 0) return "Ciel dégagé";
  if ([1, 2].includes(code)) return "Éclaircies";
  if (code === 3) return "Couvert";
  if ([45, 48].includes(code)) return "Brouillard";
  if ([51, 53, 55, 56, 57].includes(code)) return "Bruine";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Pluie ou averses";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Neige";
  if ([95, 96, 99].includes(code)) return "Orage";
  return "Conditions variables";
}

export function weatherVisibility(value: AirportWeather["visibility"]) {
  if (typeof value !== "number") return "—";
  return value >= 10000 ? "> 10 km" : `${(value / 1000).toFixed(1)} km`;
}
