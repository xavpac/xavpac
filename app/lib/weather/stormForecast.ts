export type StormForecastPoint = {
  atUtc: string;
  lightningPotentialJkg: number | null;
  capeJkg: number | null;
  precipitationMm: number | null;
  windGustKmh: number | null;
};

export type StormForecastFeed = {
  status: "available" | "unavailable";
  source: string | null;
  retrievedAt: string;
  horizonHours: number;
  points: StormForecastPoint[];
  message: string;
};

export type StormForecastSummary = {
  pointCount: number;
  maximumLightningPotentialJkg: number | null;
  maximumLightningPotentialAtUtc: string | null;
  maximumCapeJkg: number | null;
  maximumPrecipitationMm: number | null;
  maximumWindGustKmh: number | null;
};

function finite(value: number | null) {
  return value !== null && Number.isFinite(value);
}

function maximum(points: StormForecastPoint[], select: (point: StormForecastPoint) => number | null) {
  return points.reduce<number | null>((current, point) => {
    const value = select(point);
    if (!finite(value)) return current;
    return current === null || (value as number) > current ? value : current;
  }, null);
}

export function summarizeStormForecast(points: StormForecastPoint[]): StormForecastSummary {
  const maximumLightningPoint = points.reduce<StormForecastPoint | null>((current, point) => {
    if (!finite(point.lightningPotentialJkg)) return current;
    return !current || (point.lightningPotentialJkg as number) > (current.lightningPotentialJkg as number) ? point : current;
  }, null);

  return {
    pointCount: points.length,
    maximumLightningPotentialJkg: maximumLightningPoint?.lightningPotentialJkg ?? null,
    maximumLightningPotentialAtUtc: maximumLightningPoint?.atUtc ?? null,
    maximumCapeJkg: maximum(points, (point) => point.capeJkg),
    maximumPrecipitationMm: maximum(points, (point) => point.precipitationMm),
    maximumWindGustKmh: maximum(points, (point) => point.windGustKmh)
  };
}
