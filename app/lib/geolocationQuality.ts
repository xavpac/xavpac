export type GpsQuality = "excellent" | "good" | "medium" | "insufficient" | "stale" | "unavailable";

export type GpsQualityAssessment = {
  quality: GpsQuality;
  usableForPreciseCalculations: boolean;
  reason: string;
};

const labels: Record<GpsQuality, string> = {
  excellent: "Excellent",
  good: "Bon",
  medium: "Moyen",
  insufficient: "Insuffisant",
  stale: "Ancien",
  unavailable: "Indisponible"
};

export function assessGpsQuality(accuracyMeters: number | null, ageSeconds: number | null): GpsQualityAssessment {
  if (accuracyMeters === null || !Number.isFinite(accuracyMeters) || accuracyMeters < 0 || ageSeconds === null || !Number.isFinite(ageSeconds) || ageSeconds < 0) {
    return { quality: "unavailable", usableForPreciseCalculations: false, reason: "Précision ou horodatage GPS indisponible" };
  }
  if (ageSeconds > 120) {
    return { quality: "stale", usableForPreciseCalculations: false, reason: `Position ancienne de ${Math.round(ageSeconds)} s` };
  }

  let quality: GpsQuality = accuracyMeters <= 15
    ? "excellent"
    : accuracyMeters <= 40
      ? "good"
      : accuracyMeters <= 100
        ? "medium"
        : "insufficient";

  // Une position précise mais vieillissante est volontairement dégradée.
  if (ageSeconds > 60 && quality !== "insufficient") quality = "medium";
  else if (ageSeconds > 20 && quality === "excellent") quality = "good";

  const usableForPreciseCalculations = quality === "excellent" || quality === "good" || quality === "medium";
  return {
    quality,
    usableForPreciseCalculations,
    reason: quality === "insufficient"
      ? `Précision insuffisante : ±${Math.round(accuracyMeters)} m`
      : `Précision ±${Math.round(accuracyMeters)} m • âge ${Math.round(ageSeconds)} s`
  };
}

export function gpsQualityLabel(quality: GpsQuality) {
  return labels[quality];
}

export function formatPositionAge(ageSeconds: number | null) {
  if (ageSeconds === null || !Number.isFinite(ageSeconds)) return "âge inconnu";
  if (ageSeconds < 1) return "à l’instant";
  if (ageSeconds < 60) return `${Math.round(ageSeconds)} s`;
  const minutes = Math.floor(ageSeconds / 60);
  return `${minutes} min ${Math.round(ageSeconds % 60).toString().padStart(2, "0")}`;
}
