export type DroneZoneAssessment = { name: string; containsPoint: boolean; status: "active" | "inactive" | "unknown" };
export type DroneDecisionInput = { hasPosition: boolean; zones: DroneZoneAssessment[]; aerodromeDistanceKm: number | null; requestedHeightM: number; weatherAvailable: boolean; flightCategory?: string | null; gustKnots?: number | null; visibilityKm?: number | null; restrictionsChecked: boolean; nearbyAircraftCount?: number; directNotamCount?: number; criticalDataAvailable?: boolean };
export type DroneDecision = {
  level: "possible" | "check" | "forbidden" | "insufficient";
  label: "Aucun obstacle détecté par XavPac" | "Vérifications nécessaires" | "Élément bloquant détecté" | "Données insuffisantes";
  reasons: string[];
  blockingReasons: string[];
  checkReasons: string[];
  positiveReasons: string[];
};

export function evaluateDroneFlight(input: DroneDecisionInput): DroneDecision {
  const blocking: string[] = [];
  const checks: string[] = [];
  const positive: string[] = [];
  if (!input.hasPosition) checks.push("Point MISSION indisponible");
  if (input.requestedHeightM > 120) blocking.push("Hauteur demandée supérieure à 120 m");
  const activeZones = input.zones.filter((zone) => zone.containsPoint && zone.status === "active");
  const unknownZones = input.zones.filter((zone) => zone.containsPoint && zone.status === "unknown");
  if (activeZones.length) blocking.push(`Zone RTBA active : ${activeZones.map((zone) => zone.name).join(", ")}`);
  else if (unknownZones.length) checks.push(`Statut RTBA inconnu : ${unknownZones.map((zone) => zone.name).join(", ")}`);
  else if (input.hasPosition && input.restrictionsChecked) positive.push("Hors zone RTBA active connue");
  if (input.aerodromeDistanceKm !== null && input.aerodromeDistanceKm <= 5) checks.push("Proximité d’un aérodrome");
  if (!input.restrictionsChecked) checks.push("Autorisation, zones UAS, SUP AIP et restrictions locales à confirmer par le télépilote");
  if ((input.nearbyAircraftCount ?? 0) > 0) checks.push(`${input.nearbyAircraftCount} aéronef${input.nearbyAircraftCount === 1 ? "" : "s"} à proximité`);
  else if (input.hasPosition) positive.push("Aucun rapprochement ADS-B préoccupant identifié");
  if ((input.directNotamCount ?? 0) > 0) blocking.push(`${input.directNotamCount} NOTAM à impact direct sur la mission`);
  if (!input.weatherAvailable) checks.push("Météo opérationnelle indisponible");
  else {
    const category = input.flightCategory?.toUpperCase();
    if (category === "LIFR" || category === "IFR" || (input.gustKnots ?? 0) >= 35 || (input.visibilityKm ?? Infinity) < 1.5) blocking.push("Météo opérationnelle incompatible");
    else if (category === "MVFR" || (input.gustKnots ?? 0) >= 25 || (input.visibilityKm ?? Infinity) < 5) checks.push("Météo opérationnelle marginale");
    else positive.push("Météo minimale disponible sans alerte détectée");
  }
  if (blocking.length) return {
    level: "forbidden",
    label: "Élément bloquant détecté",
    reasons: [...blocking, ...checks],
    blockingReasons: blocking,
    checkReasons: checks,
    positiveReasons: positive
  };
  if (!input.hasPosition || input.criticalDataAvailable === false) return {
    level: "insufficient",
    label: "Données insuffisantes",
    reasons: [...checks, ...positive],
    blockingReasons: [],
    checkReasons: checks,
    positiveReasons: positive
  };
  if (checks.length) return {
    level: "check",
    label: "Vérifications nécessaires",
    reasons: [...checks, ...positive],
    blockingReasons: [],
    checkReasons: checks,
    positiveReasons: positive
  };
  return {
    level: "possible",
    label: "Aucun obstacle détecté par XavPac",
    reasons: positive,
    blockingReasons: [],
    checkReasons: [],
    positiveReasons: positive
  };
}
