export type DroneZoneAssessment = { name: string; containsPoint: boolean; status: "active" | "inactive" | "unknown" };
export type DroneDecisionInput = { hasPosition: boolean; zones: DroneZoneAssessment[]; aerodromeDistanceKm: number | null; requestedHeightM: number; weatherAvailable: boolean; flightCategory?: string | null; gustKnots?: number | null; visibilityKm?: number | null; restrictionsChecked: boolean; nearbyAircraftCount?: number };
export type DroneDecision = { level: "possible" | "check" | "forbidden"; label: "VOL POSSIBLE" | "VOL À VÉRIFIER" | "VOL NON AUTORISÉ"; reasons: string[] };

export function evaluateDroneFlight(input: DroneDecisionInput): DroneDecision {
  const blocking: string[] = [];
  const checks: string[] = [];
  const positive: string[] = [];
  if (!input.hasPosition) checks.push("Position GPS indisponible");
  if (input.requestedHeightM > 120) blocking.push("Hauteur demandée supérieure à 120 m");
  const activeZones = input.zones.filter((zone) => zone.containsPoint && zone.status === "active");
  const unknownZones = input.zones.filter((zone) => zone.containsPoint && zone.status === "unknown");
  if (activeZones.length) blocking.push(`Zone RTBA active : ${activeZones.map((zone) => zone.name).join(", ")}`);
  else if (unknownZones.length) checks.push(`Statut RTBA inconnu : ${unknownZones.map((zone) => zone.name).join(", ")}`);
  else if (input.hasPosition) positive.push("Hors zone RTBA active connue");
  if (input.aerodromeDistanceKm !== null && input.aerodromeDistanceKm <= 5) checks.push("Proximité d’un aérodrome");
  if (!input.restrictionsChecked) checks.push("Restrictions aéronautiques non vérifiées automatiquement");
  if ((input.nearbyAircraftCount ?? 0) > 0) checks.push(`${input.nearbyAircraftCount} aéronef${input.nearbyAircraftCount === 1 ? "" : "s"} à proximité`);
  else if (input.hasPosition) positive.push("Aucun aéronef dangereux détecté à proximité");
  if (!input.weatherAvailable) checks.push("Météo opérationnelle indisponible");
  else {
    const category = input.flightCategory?.toUpperCase();
    if (category === "LIFR" || category === "IFR" || (input.gustKnots ?? 0) >= 35 || (input.visibilityKm ?? Infinity) < 1.5) blocking.push("Météo opérationnelle incompatible");
    else if (category === "MVFR" || (input.gustKnots ?? 0) >= 25 || (input.visibilityKm ?? Infinity) < 5) checks.push("Météo opérationnelle marginale");
    else positive.push("Météo minimale disponible sans alerte détectée");
  }
  if (blocking.length) return { level: "forbidden", label: "VOL NON AUTORISÉ", reasons: [...blocking, ...checks] };
  if (checks.length) return { level: "check", label: "VOL À VÉRIFIER", reasons: [...checks, ...positive, "Données insuffisantes : vérification manuelle nécessaire"] };
  return { level: "possible", label: "VOL POSSIBLE", reasons: positive };
}
