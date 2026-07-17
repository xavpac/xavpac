import type { Aircraft } from "../types";

const NATIONAL_HINTS = [
  "DRAGON",
  "PELICAN",
  "MILAN",
  "CHOUCAS",
  "SAMU",
  "GEND",
  "SECURITE CIVILE",
  "SÉCURITÉ CIVILE",
  "DOUANE",
  "POLICE",
  "ARMEE",
  "ARMÉE",
];

export function isNationalAircraft(aircraft: Aircraft) {
  const haystack = `${aircraft.callsign} ${aircraft.registration} ${aircraft.operator} ${aircraft.typeLabel}`.toUpperCase();
  return (
    NATIONAL_HINTS.some((hint) => haystack.includes(hint)) ||
    aircraft.registration.toUpperCase().startsWith("F-ZB") ||
    aircraft.category !== "airliner"
  );
}

export function altitudeLabel(feet: number | null) {
  if (feet === null) return "—";
  if (feet < 1000) return `${Math.round(feet)} ft`;
  return `FL${Math.round(feet / 100)}`;
}

export function metersFromFeet(feet: number | null) {
  if (feet === null) return null;
  return Math.round(feet * 0.3048);
}

export function kmhFromKnots(knots: number | null) {
  if (knots === null) return null;
  return Math.round(knots * 1.852);
}

export function cardinalDirection(degrees: number | null) {
  if (degrees === null) return "—";
  const labels = ["Nord", "Nord-Est", "Est", "Sud-Est", "Sud", "Sud-Ouest", "Ouest", "Nord-Ouest"];
  return labels[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

export function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}
