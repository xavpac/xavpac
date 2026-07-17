import { findAirline, GENERIC_AIRLINE_LOGO } from "../data/airlines";

export type AirlineBrand = { name: string; iata: string | null; icao: string | null; logo: string };

export function resolveAirlineBrand(operator?: string | null, callsign = ""): AirlineBrand | null {
  const entry = findAirline({ operator, callsign });
  return entry ? { name: entry.canonicalName, iata: entry.iata[0] ?? null, icao: entry.icao[0] ?? null, logo: entry.logoPath || GENERIC_AIRLINE_LOGO } : null;
}
