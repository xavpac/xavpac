export type SpotterSkyMoodInput = {
  aircraftCount: number;
  closestDistanceKm: number | null;
  remarkableCount: number;
  nationalCount: number;
};

export type SpotterSkyMood = {
  icon: string;
  label: string;
  message: string;
  level: "calm" | "active" | "special";
};

export function buildSpotterSkyMood(input: SpotterSkyMoodInput): SpotterSkyMood {
  if (input.nationalCount > 0) {
    return { icon: "🛟", label: "MISSION SPÉCIALE", message: "Un moyen national traverse votre zone.", level: "special" };
  }
  if (input.remarkableCount > 0) {
    return { icon: "✨", label: "PÉPITE DU CIEL", message: "Un appareil remarquable mérite le coup d’œil.", level: "special" };
  }
  if (input.closestDistanceKm !== null && input.closestDistanceKm <= 5) {
    return { icon: "👀", label: "LÈVE LES YEUX", message: "Un avion passe à moins de 5 km.", level: "active" };
  }
  if (input.aircraftCount >= 15) {
    return { icon: "🎉", label: "GRAND BALLET", message: "Le ciel est très animé autour de vous.", level: "active" };
  }
  if (input.aircraftCount >= 5) {
    return { icon: "🛩️", label: "ÇA BOUGE", message: "Plusieurs avions sont prêts à observer.", level: "active" };
  }
  if (input.aircraftCount > 0) {
    return { icon: "☁️", label: "PETITE RONDE", message: "Quelques avions, faciles à suivre tranquillement.", level: "calm" };
  }
  return { icon: "🌙", label: "CIEL TRANQUILLE", message: "Le prochain passage sera votre nouvelle cible.", level: "calm" };
}

export function spotterChallengeScore(input: SpotterSkyMoodInput) {
  return Math.min(99, input.aircraftCount * 2 + input.remarkableCount * 12 + input.nationalCount * 20 + (input.closestDistanceKm !== null && input.closestDistanceKm <= 10 ? 8 : 0));
}

