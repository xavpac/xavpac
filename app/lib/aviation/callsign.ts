export function normalizeModeS(value?: string | null) {
  const normalized = (value ?? "").trim().replace(/^~/, "").toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? normalized : null;
}

export function normalizeRegistration(value?: string | null) {
  const normalized = (value ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return normalized || null;
}

export function normalizeRawCallsign(value?: string | null) {
  const normalized = (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return normalized || null;
}

export function parseCallsign(value?: string | null) {
  const raw = normalizeRawCallsign(value);
  if (!raw) return { raw: null, icao: null, iata: null, airlineIcao: null, airlineIata: null };
  const icaoMatch = raw.match(/^([A-Z]{3})([0-9][A-Z0-9]{0,4})$/);
  const iataMatch = raw.match(/^([A-Z0-9]{2})([0-9][A-Z0-9]{0,4})$/);
  return {
    raw,
    icao: icaoMatch ? raw : null,
    iata: !icaoMatch && iataMatch ? raw : null,
    airlineIcao: icaoMatch?.[1] ?? null,
    airlineIata: !icaoMatch ? iataMatch?.[1] ?? null : null
  };
}
