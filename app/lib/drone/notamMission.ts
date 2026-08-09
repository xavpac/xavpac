export type NotamMissionInput = {
  notamType?: "NOTAMN" | "NOTAMR" | "NOTAMC" | "NOTAM";
  qCode: string;
  category: string;
  impactsPoint: boolean;
  distanceToAreaKm: number | null;
  radiusNm: number | null;
  lowerFl: number | null;
  upperFl: number | null;
  startsAtIso: string | null;
  endsAtIso: string | null;
  isPermanent?: boolean;
  schedule: string | null;
};

export type NotamMissionAssessment = {
  level: "direct" | "relevant" | "information";
  horizontal: "inside" | "near" | "outside" | "unknown";
  vertical: "intersects" | "outside" | "unknown";
  temporal: "intersects" | "outside" | "schedule-unknown" | "unknown";
  explanation: string[];
};

function time(value: string | null) {
  if (!value) return null;
  const milliseconds = new Date(value).getTime();
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function isMissionSensitive(qCode: string, category: string) {
  return /Q(?:WU|RT|RR|RD|RP|RM|WE|WM|WP|WA|WZ|OB)|drone|réglement|dangereu|interdit|militaire|tir|parachut|manifestation|obstacle/i.test(`${qCode} ${category}`);
}

export function assessNotamForMission(input: NotamMissionInput, missionStartMs: number, missionEndMs: number, requestedHeightMeters: number): NotamMissionAssessment {
  const explanation: string[] = [];
  const horizontal = input.impactsPoint
    ? "inside" as const
    : input.distanceToAreaKm === null
      ? "unknown" as const
      : input.distanceToAreaKm <= 10 ? "near" as const : "outside" as const;
  if (horizontal === "inside") explanation.push(`Le point MISSION se trouve dans le périmètre publié${input.radiusNm === null ? "" : ` (rayon ${Math.round(input.radiusNm * 1.852 * 10) / 10} km)`}.`);
  else if (horizontal === "near") explanation.push(`Le bord du périmètre se trouve à environ ${input.distanceToAreaKm?.toFixed(1)} km du point MISSION.`);
  else if (horizontal === "outside") explanation.push(`Le périmètre se trouve à environ ${input.distanceToAreaKm?.toFixed(1)} km du point MISSION.`);
  else explanation.push("La relation horizontale avec la mission n’est pas déterminable.");

  let vertical: NotamMissionAssessment["vertical"] = "unknown";
  if (input.lowerFl === 0 && input.upperFl !== null) {
    const ceilingMeters = input.upperFl * 100 * 0.3048;
    vertical = requestedHeightMeters <= ceilingMeters ? "intersects" : "outside";
    explanation.push(vertical === "intersects"
      ? `Le volume part de la surface et recouvre la hauteur prévue de ${requestedHeightMeters} m.`
      : `La hauteur prévue de ${requestedHeightMeters} m dépasse le plafond publié approximatif.`);
  } else if (input.lowerFl !== null && input.lowerFl > 0) {
    explanation.push("Le plancher est exprimé en niveau de vol : l’altitude du terrain manque pour conclure verticalement.");
  } else {
    explanation.push("Les limites verticales sont incomplètes : vérifiez l’original officiel.");
  }

  const startsAt = time(input.startsAtIso);
  const endsAt = time(input.endsAtIso);
  let temporal: NotamMissionAssessment["temporal"] = "unknown";
  if (startsAt !== null && (endsAt !== null || input.isPermanent)) {
    const validityOverlaps = startsAt < missionEndMs && (input.isPermanent || (endsAt ?? 0) > missionStartMs);
    temporal = validityOverlaps ? input.schedule ? "schedule-unknown" : "intersects" : "outside";
    explanation.push(!validityOverlaps
      ? "La période de validité ne chevauche pas la mission."
      : input.schedule
        ? "La validité générale chevauche la mission, mais les horaires du champ D) doivent encore être confirmés."
        : "Le NOTAM est valide pendant la mission.");
  } else {
    explanation.push("La période de validité est incomplète ou permanente : vérification manuelle requise.");
  }

  const sensitive = isMissionSensitive(input.qCode, input.category);
  if (input.notamType === "NOTAMC") explanation.push("Ce NOTAM annonce une annulation : contrôlez la référence annulée dans le briefing officiel.");
  const direct = input.notamType !== "NOTAMC" && sensitive && horizontal === "inside" && vertical === "intersects" && temporal === "intersects";
  const relevant = direct || horizontal === "inside" || horizontal === "near" || temporal === "schedule-unknown";
  return { level: direct ? "direct" : relevant ? "relevant" : "information", horizontal, vertical, temporal, explanation };
}
