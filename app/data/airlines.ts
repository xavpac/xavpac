export type AirlineRecord = {
  id: string;
  canonicalName: string;
  icao: readonly string[];
  iata: readonly string[];
  callsignAliases: readonly string[];
  nameAliases: readonly string[];
  subsidiaryOf: string | null;
  fallbackBrandId: string | null;
  logoPath: string;
};

export const AIRLINES: readonly AirlineRecord[] = [
  { id: "air-france", canonicalName: "Air France", icao: ["AFR"], iata: ["AF"], callsignAliases: ["AIRFRANS"], nameAliases: ["Air France"], subsidiaryOf: "air-france-klm", fallbackBrandId: null, logoPath: "/airlines/air-france.svg" },
  { id: "easyjet", canonicalName: "easyJet", icao: ["EZY", "EZS"], iata: ["U2"], callsignAliases: ["EASY"], nameAliases: ["easyJet", "easyJet UK", "easyJet Switzerland"], subsidiaryOf: null, fallbackBrandId: null, logoPath: "/airlines/easyjet.svg" },
  { id: "easyjet-europe", canonicalName: "easyJet Europe", icao: ["EJU"], iata: ["EC"], callsignAliases: ["ALPINE"], nameAliases: ["easyJet Europe", "EasyJet Europe Airline GmbH"], subsidiaryOf: "easyjet", fallbackBrandId: "easyjet", logoPath: "/airlines/easyjet.svg" },
  { id: "british-airways", canonicalName: "British Airways", icao: ["BAW"], iata: ["BA"], callsignAliases: ["SPEEDBIRD"], nameAliases: ["British Airways"], subsidiaryOf: "iag", fallbackBrandId: null, logoPath: "/airlines/british-airways.svg" },
  { id: "ba-euroflyer", canonicalName: "BA Euroflyer", icao: ["EFW"], iata: ["A0"], callsignAliases: ["GRIFFIN"], nameAliases: ["BA Euroflyer", "British Airways Euroflyer"], subsidiaryOf: "british-airways", fallbackBrandId: "british-airways", logoPath: "/airlines/british-airways.svg" },
  { id: "ryanair", canonicalName: "Ryanair", icao: ["RYR"], iata: ["FR"], callsignAliases: ["RYANAIR"], nameAliases: ["Ryanair"], subsidiaryOf: "ryanair-holdings", fallbackBrandId: null, logoPath: "/airlines/ryanair.svg" },
  { id: "ryanair-uk", canonicalName: "Ryanair UK", icao: ["RUK"], iata: ["RK"], callsignAliases: ["BLUEMAX"], nameAliases: ["Ryanair UK"], subsidiaryOf: "ryanair", fallbackBrandId: "ryanair", logoPath: "/airlines/ryanair.svg" },
  { id: "transavia-france", canonicalName: "Transavia France", icao: ["TVF"], iata: ["TO"], callsignAliases: ["FRANCE SOLEIL"], nameAliases: ["Transavia France", "Transavia"], subsidiaryOf: "air-france-klm", fallbackBrandId: null, logoPath: "/airlines/transavia.svg" },
  { id: "lufthansa", canonicalName: "Lufthansa", icao: ["DLH"], iata: ["LH"], callsignAliases: ["LUFTHANSA"], nameAliases: ["Deutsche Lufthansa", "Lufthansa"], subsidiaryOf: "lufthansa-group", fallbackBrandId: null, logoPath: "/airlines/lufthansa.svg" },
  { id: "klm", canonicalName: "KLM", icao: ["KLM"], iata: ["KL"], callsignAliases: ["KLM"], nameAliases: ["KLM Royal Dutch Airlines", "KLM"], subsidiaryOf: "air-france-klm", fallbackBrandId: null, logoPath: "/airlines/klm.svg" },
  { id: "volotea", canonicalName: "Volotea", icao: ["VOE"], iata: ["V7"], callsignAliases: ["VOLOTEA"], nameAliases: ["Volotea"], subsidiaryOf: null, fallbackBrandId: null, logoPath: "/airlines/volotea.svg" },
  { id: "wizz-air", canonicalName: "Wizz Air", icao: ["WZZ", "WMT"], iata: ["W6", "W9"], callsignAliases: ["WIZZ AIR"], nameAliases: ["Wizz Air", "Wizz Air Malta", "Wizz Air UK"], subsidiaryOf: null, fallbackBrandId: null, logoPath: "/airlines/wizz-air.svg" },
  { id: "swiss", canonicalName: "SWISS", icao: ["SWR"], iata: ["LX"], callsignAliases: ["SWISS"], nameAliases: ["Swiss International Air Lines", "SWISS"], subsidiaryOf: "lufthansa-group", fallbackBrandId: null, logoPath: "/airlines/swiss.svg" },
  { id: "brussels-airlines", canonicalName: "Brussels Airlines", icao: ["BEL"], iata: ["SN"], callsignAliases: ["BEE-LINE"], nameAliases: ["Brussels Airlines"], subsidiaryOf: "lufthansa-group", fallbackBrandId: null, logoPath: "/airlines/brussels-airlines.svg" },
  { id: "emirates", canonicalName: "Emirates", icao: ["UAE"], iata: ["EK"], callsignAliases: ["EMIRATES"], nameAliases: ["Emirates"], subsidiaryOf: "emirates-group", fallbackBrandId: null, logoPath: "/airlines/emirates.svg" },
  { id: "qatar-airways", canonicalName: "Qatar Airways", icao: ["QTR"], iata: ["QR"], callsignAliases: ["QATARI"], nameAliases: ["Qatar Airways"], subsidiaryOf: null, fallbackBrandId: null, logoPath: "/airlines/qatar-airways.svg" },
  { id: "turkish-airlines", canonicalName: "Turkish Airlines", icao: ["THY"], iata: ["TK"], callsignAliases: ["TURKISH"], nameAliases: ["Turkish Airlines"], subsidiaryOf: null, fallbackBrandId: null, logoPath: "/airlines/turkish-airlines.svg" }
] as const;

export const GENERIC_AIRLINE_LOGO = "/airlines/generic-airline.svg";

function normalized(value?: string | null) {
  return (value ?? "").trim().toUpperCase();
}

export function findAirline(input: { icao?: string | null; iata?: string | null; operator?: string | null; callsign?: string | null }) {
  const icao = normalized(input.icao);
  const iata = normalized(input.iata);
  const operator = normalized(input.operator);
  const callsign = normalized(input.callsign);
  const prefix = callsign.slice(0, 3);
  return AIRLINES.find((airline) =>
    (icao && airline.icao.includes(icao)) ||
    (iata && airline.iata.includes(iata)) ||
    airline.icao.includes(prefix) ||
    airline.nameAliases.some((alias) => operator.includes(alias.toUpperCase())) ||
    airline.callsignAliases.some((alias) => callsign.startsWith(alias.toUpperCase()))
  ) ?? null;
}
