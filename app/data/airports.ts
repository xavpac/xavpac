export type LocalAirport = { icao: string; iata: string | null; name: string; municipality: string };

export const AIRPORTS: readonly LocalAirport[] = [
  { icao: "LFPG", iata: "CDG", name: "Paris Charles-de-Gaulle", municipality: "Paris" },
  { icao: "LFPO", iata: "ORY", name: "Paris-Orly", municipality: "Paris" },
  { icao: "LFMN", iata: "NCE", name: "Nice-Côte d’Azur", municipality: "Nice" },
  { icao: "LFML", iata: "MRS", name: "Marseille-Provence", municipality: "Marseille" },
  { icao: "LFLL", iata: "LYS", name: "Lyon-Saint-Exupéry", municipality: "Lyon" },
  { icao: "LFBO", iata: "TLS", name: "Toulouse-Blagnac", municipality: "Toulouse" },
  { icao: "LFBD", iata: "BOD", name: "Bordeaux-Mérignac", municipality: "Bordeaux" },
  { icao: "LFRS", iata: "NTE", name: "Nantes-Atlantique", municipality: "Nantes" },
  { icao: "LFST", iata: "SXB", name: "Strasbourg-Entzheim", municipality: "Strasbourg" },
  { icao: "LFQQ", iata: "LIL", name: "Lille-Lesquin", municipality: "Lille" },
  { icao: "LFSB", iata: "BSL", name: "EuroAirport Bâle-Mulhouse", municipality: "Bâle-Mulhouse" },
  { icao: "LFRN", iata: "RNS", name: "Rennes-Saint-Jacques", municipality: "Rennes" },
  { icao: "LFOB", iata: "BVA", name: "Paris-Beauvais", municipality: "Beauvais" },
  { icao: "LFOA", iata: "BOU", name: "Bourges", municipality: "Bourges" },
  { icao: "EGLL", iata: "LHR", name: "London Heathrow", municipality: "Londres" },
  { icao: "EGKK", iata: "LGW", name: "London Gatwick", municipality: "Londres" },
  { icao: "EHAM", iata: "AMS", name: "Amsterdam Schiphol", municipality: "Amsterdam" },
  { icao: "EDDF", iata: "FRA", name: "Frankfurt", municipality: "Francfort" },
  { icao: "EDDM", iata: "MUC", name: "Munich", municipality: "Munich" },
  { icao: "EBBR", iata: "BRU", name: "Brussels Airport", municipality: "Bruxelles" },
  { icao: "LSZH", iata: "ZRH", name: "Zürich", municipality: "Zurich" },
  { icao: "LEMD", iata: "MAD", name: "Madrid-Barajas", municipality: "Madrid" },
  { icao: "LEBL", iata: "BCN", name: "Barcelona-El Prat", municipality: "Barcelone" },
  { icao: "LIRF", iata: "FCO", name: "Rome-Fiumicino", municipality: "Rome" }
] as const;

export function findAirportByIcao(value?: string | null) {
  const code = value?.trim().toUpperCase();
  return code ? AIRPORTS.find((airport) => airport.icao === code) ?? null : null;
}
