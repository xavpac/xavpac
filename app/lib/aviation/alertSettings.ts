export const AVIATION_RADIUS_OPTIONS = [10, 20, 50, 100] as const;

export type AviationRadius = (typeof AVIATION_RADIUS_OPTIONS)[number];

export function normalizeAviationRadius(value: unknown, fallback: AviationRadius = 50): AviationRadius {
  const numeric = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return AVIATION_RADIUS_OPTIONS.includes(numeric as AviationRadius) ? numeric as AviationRadius : fallback;
}

