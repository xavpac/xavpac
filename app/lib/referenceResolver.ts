import type { GpsQuality } from "./geolocationQuality.ts";

export type ReferenceDevice = "mobile" | "desktop";
export type ReferencePreference = "auto" | "moi" | "home" | "mission" | "manual";
export type ResolvedReferenceKind = Exclude<ReferencePreference, "auto">;

export type ReferenceGpsFix = {
  position: [number, number];
  accuracyMeters: number | null;
  timestampMs: number | null;
  quality: GpsQuality;
  usable: boolean;
};

export type ResolvedReference = {
  kind: ResolvedReferenceKind;
  position: [number, number] | null;
  preference: ReferencePreference;
  usedLastValidGps: boolean;
  fallbackFrom: ReferencePreference | null;
};

export function detectReferenceDevice(input: {
  userAgent?: string;
  maxTouchPoints?: number;
  coarsePointer?: boolean;
} = {}): ReferenceDevice {
  const userAgent = input.userAgent ?? "";
  const touchPoints = input.maxTouchPoints ?? 0;
  const ipadDesktopMode = /Macintosh/i.test(userAgent) && touchPoints > 1;
  const mobileAgent = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(userAgent);
  return mobileAgent || ipadDesktopMode || Boolean(input.coarsePointer && touchPoints > 0) ? "mobile" : "desktop";
}

function gpsReference(
  preference: ReferencePreference,
  gps: ReferenceGpsFix | null,
  lastValidGps: ReferenceGpsFix | null,
  home: [number, number] | null
): ResolvedReference {
  if (gps?.usable) {
    return { kind: "moi", position: gps.position, preference, usedLastValidGps: false, fallbackFrom: null };
  }
  if (lastValidGps) {
    return { kind: "moi", position: lastValidGps.position, preference, usedLastValidGps: true, fallbackFrom: null };
  }
  return { kind: "home", position: home, preference, usedLastValidGps: false, fallbackFrom: "moi" };
}

export function resolveReference(input: {
  device: ReferenceDevice;
  preference?: ReferencePreference;
  explicitPosition?: [number, number] | null;
  home: [number, number] | null;
  gps: ReferenceGpsFix | null;
  lastValidGps?: ReferenceGpsFix | null;
}): ResolvedReference {
  const preference = input.preference ?? "auto";
  const lastValidGps = input.lastValidGps ?? null;

  if (preference === "home") {
    return { kind: "home", position: input.home, preference, usedLastValidGps: false, fallbackFrom: null };
  }
  if (preference === "manual" || preference === "mission") {
    if (input.explicitPosition) {
      return { kind: preference, position: input.explicitPosition, preference, usedLastValidGps: false, fallbackFrom: null };
    }
    return gpsReference(preference, input.gps, lastValidGps, input.home);
  }
  if (preference === "moi") return gpsReference(preference, input.gps, lastValidGps, input.home);
  if (input.device === "mobile") return gpsReference(preference, input.gps, lastValidGps, input.home);
  return { kind: "home", position: input.home, preference, usedLastValidGps: false, fallbackFrom: null };
}
