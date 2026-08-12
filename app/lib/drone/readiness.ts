export type DroneReadinessTone = "clear" | "hold" | "stop";

export type DroneReadinessAction = {
  id: string;
  level: "check" | "blocking";
  label: string;
};

export type DroneReadinessInput = {
  hasPosition: boolean;
  missionWindowValid: boolean;
  heightMeters: number;
  rtbaSeverity: "blocking" | "check" | "clear" | "unconfirmed";
  rtbaConfirmed: boolean;
  rtbaOutsideLocalCoverage: boolean;
  notamStatus: "idle" | "loading" | "success" | "error";
  directNotamCount: number;
  weatherAvailable: boolean;
  weatherBlocking: boolean;
  nearbyAircraftCount: number;
  pilotChecksConfirmed?: boolean;
};

export type DroneReadiness = {
  tone: DroneReadinessTone;
  headline: string;
  summary: string;
  actions: DroneReadinessAction[];
  confirmed: string[];
};

export function buildDroneReadiness(input: DroneReadinessInput): DroneReadiness {
  const actions: DroneReadinessAction[] = [];
  const confirmed: string[] = [];

  if (!input.hasPosition) actions.push({ id: "position", level: "check", label: "Choisir le point exact de la mission." });
  else confirmed.push("Point de mission défini");

  if (!input.missionWindowValid) actions.push({ id: "time", level: "check", label: "Corriger la date et les heures de la mission." });
  else confirmed.push("Créneau de mission défini");

  if (input.heightMeters > 120) actions.push({ id: "height", level: "blocking", label: "Ramener la hauteur demandée à 120 m maximum." });
  else confirmed.push(`Hauteur ${input.heightMeters} m`);

  if (input.rtbaSeverity === "blocking") {
    actions.push({ id: "rtba", level: "blocking", label: "Ne pas voler : une activation RTBA chevauche la mission." });
  } else if (!input.rtbaConfirmed) {
    actions.push({
      id: "rtba",
      level: "check",
      label: input.rtbaOutsideLocalCoverage
        ? "Consulter l’AZBA national : la carte XavPac ne couvre localement que LF-R45."
        : "Consulter l’AZBA officiel pour confirmer l’activation RTBA."
    });
  } else {
    confirmed.push("RTBA vérifié pour le créneau");
  }

  if (input.directNotamCount > 0) {
    actions.push({ id: "notam", level: "blocking", label: `${input.directNotamCount} NOTAM à impact direct : ne pas décoller avant résolution.` });
  } else if (input.notamStatus === "loading") {
    actions.push({ id: "notam", level: "check", label: "Attendre la fin de la recherche des NOTAM officiels." });
  } else if (input.notamStatus === "error") {
    actions.push({ id: "notam", level: "check", label: "SOFIA est indisponible : consulter le briefing officiel manuellement." });
  } else if (input.notamStatus !== "success") {
    actions.push({ id: "notam", level: "check", label: "Récupérer les NOTAM officiels autour du point de mission." });
  } else {
    confirmed.push("NOTAM analysés");
  }

  if (input.weatherBlocking) actions.push({ id: "weather", level: "blocking", label: "Conditions météo incompatibles détectées." });
  else if (!input.weatherAvailable) actions.push({ id: "weather", level: "check", label: "Attendre la météo au point exact de la mission." });
  else confirmed.push("Météo reçue sans alerte minimale");

  if (input.nearbyAircraftCount > 0) actions.push({ id: "traffic", level: "check", label: `${input.nearbyAircraftCount} aéronef${input.nearbyAircraftCount === 1 ? "" : "s"} en rapprochement : maintenir une vigilance renforcée.` });
  else confirmed.push("Aucun rapprochement ADS-B préoccupant");

  if (!input.pilotChecksConfirmed) actions.push({ id: "local", level: "check", label: "Confirmer les zones UAS, autorisations, SUP AIP et restrictions locales." });

  const hasBlocking = actions.some((action) => action.level === "blocking");
  const tone: DroneReadinessTone = hasBlocking ? "stop" : actions.length ? "hold" : "clear";
  const headline = tone === "stop" ? "NE PAS DÉCOLLER" : tone === "hold" ? "NE DÉCOLLEZ PAS ENCORE" : "AUCUN BLOCAGE DÉTECTÉ";
  const summary = tone === "stop"
    ? `${actions.filter((action) => action.level === "blocking").length} élément bloquant détecté.`
    : tone === "hold"
      ? `${actions.length} vérification${actions.length === 1 ? "" : "s"} à terminer avant le décollage.`
      : "Les contrôles disponibles dans XavPac sont favorables. Le télépilote reste responsable de la décision.";

  return { tone, headline, summary, actions, confirmed };
}
