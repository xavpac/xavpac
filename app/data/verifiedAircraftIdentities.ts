import type { AircraftCategory } from "../lib/aviation/types.ts";

export type VerifiedAircraftIdentity = {
  modeS: string;
  registration: string;
  manufacturer: string;
  aircraftModel: string;
  icaoTypeCode: string;
  operator: string;
  category: AircraftCategory;
  sources: readonly string[];
  verifiedAt: string;
};

// Référentiel volontairement réduit : chaque ligne doit pouvoir être justifiée par
// une source aéronautique publique et ne doit contenir aucune mission supposée.
export const VERIFIED_AIRCRAFT_IDENTITIES: readonly VerifiedAircraftIdentity[] = [
  {
    modeS: "39A661",
    registration: "F-HJTB",
    manufacturer: "Airbus Helicopters",
    aircraftModel: "H125 / AS350 B3 Écureuil",
    icaoTypeCode: "AS50",
    operator: "SAF Hélicoptères",
    category: "helicopter",
    sources: ["BEA France", "ADSBDB"],
    verifiedAt: "2026-07-30T00:00:00.000Z"
  }
] as const;

const BY_MODE_S = new Map(VERIFIED_AIRCRAFT_IDENTITIES.map((identity) => [identity.modeS, identity]));

export function verifiedAircraftIdentity(modeS: string | null | undefined) {
  return modeS ? BY_MODE_S.get(modeS.trim().toUpperCase()) ?? null : null;
}
