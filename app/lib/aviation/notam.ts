export type FrenchNotamReading = {
  identifier: string | null;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  schedule: string | null;
  lowerLimit: string | null;
  upperLimit: string | null;
  frenchText: string | null;
  warnings: string[];
};

function field(source: string, key: string) {
  const expression = new RegExp(`(?:^|\\s)${key}\\)\\s*([\\s\\S]*?)(?=\\s(?:Q|A|B|C|D|E|F|G)\\)|$)`, "i");
  return source.match(expression)?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function utcDate(value: string | null, permanentLabel = false) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized.startsWith("PERM")) return "permanent";
  const match = normalized.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!match) return permanentLabel ? normalized : value;
  const year = 2000 + Number(match[1]);
  return `${match[3]}/${match[2]}/${year} à ${match[4]}:${match[5]} UTC`;
}

export function translateOperationalText(value: string | null) {
  if (!value) return null;
  const replacements: Array<[RegExp, string]> = [
    [/\bDUE TO\b/gi, "en raison de"],
    [/\bNOT AVAILABLE\b/gi, "indisponible"],
    [/\bNOT AVBL\b/gi, "indisponible"],
    [/\bOUT OF SERVICE\b/gi, "hors service"],
    [/\bAIRSPACE RESERVATION\b/gi, "réservation d’espace aérien"],
    [/\bTEMPORARY RESTRICTED AREA\b/gi, "zone réglementée temporaire"],
    [/\bTEMPO RESTRICTED AREA\b/gi, "zone réglementée temporaire"],
    [/\bRESTRICTED AREA\b/gi, "zone réglementée"],
    [/\bDANGER AREA\b/gi, "zone dangereuse"],
    [/\bPROHIBITED AREA\b/gi, "zone interdite"],
    [/\bAREA ACTIVATED\b/gi, "zone activée"],
    [/\bAREA DEACTIVATED\b/gi, "zone désactivée"],
    [/\bAREA CLSD\b/gi, "zone fermée"],
    [/\bUNMANNED AIRCRAFT\b/gi, "aéronefs sans équipage"],
    [/\bUNMANNED ACFT\b/gi, "aéronefs sans équipage"],
    [/\bDRONE ACTIVITY\b/gi, "activité de drones"],
    [/\bFLYING PROHIBITED\b/gi, "vol interdit"],
    [/\bMIL(?:ITARY)? EXER(?:CISE)?\b/gi, "exercice militaire"],
    [/\bWORK IN PROGRESS\b/gi, "travaux en cours"],
    [/\bWIP\b/gi, "travaux en cours"],
    [/\bRWY\b/gi, "piste"],
    [/\bTWY\b/gi, "voie de circulation"],
    [/\bAPRON\b/gi, "aire de trafic"],
    [/\bTHR\b/gi, "seuil"],
    [/\bOBST(?:ACLE)?\b/gi, "obstacle"],
    [/\bCRANE\b/gi, "grue"],
    [/\bPARACHUTE JUMPING\b/gi, "largage de parachutistes"],
    [/\bFIREWORKS?\b/gi, "feu d’artifice"],
    [/\bHELICOPTER\b/gi, "hélicoptère"],
    [/\bACFT\b/gi, "aéronef"],
    [/\bUAS\b/gi, "drone"],
    [/\bTFC\b/gi, "trafic"],
    [/\bFLT\b/gi, "vol"],
    [/\bOPS\b/gi, "opérations"],
    [/\bAVBL\b/gi, "disponible"],
    [/\bU\/S\b/gi, "hors service"],
    [/\bCLSD\b/gi, "fermé"],
    [/\bOPEN\b/gi, "ouvert"],
    [/\bOPN\b/gi, "ouvert"],
    [/\bACT\b/gi, "activité annoncée"],
    [/\bINACTIVE\b/gi, "inactif"],
    [/\bDLY\b/gi, "chaque jour"],
    [/\bDAILY\b/gi, "chaque jour"],
    [/\bBTN\b/gi, "entre"],
    [/\bFM\b/gi, "de"],
    [/\bEXC\b/gi, "sauf"],
    [/\bMON\b/gi, "lundi"], [/\bTUE\b/gi, "mardi"], [/\bWED\b/gi, "mercredi"],
    [/\bTHU\b/gi, "jeudi"], [/\bFRI\b/gi, "vendredi"], [/\bSAT\b/gi, "samedi"], [/\bSUN\b/gi, "dimanche"],
    [/\bHOL\b/gi, "jours fériés"],
    [/\bCENT(?:RE|ER)ED ON\b/gi, "centré sur"],
    [/\bRADIUS\b/gi, "rayon"],
    [/\bPSN\b/gi, "position"],
    [/\bWI\b/gi, "à l’intérieur de"],
    [/\bSFC\b/gi, "surface"], [/\bGND\b/gi, "sol"],
    [/FT\b/gi, " pieds"],
    [/\bAMSL\b/gi, "au-dessus du niveau moyen de la mer"],
    [/\bASFC\b/gi, "au-dessus de la surface"], [/\bAGL\b/gi, "au-dessus du sol"],
    [/\bSR\b/gi, "lever du soleil"], [/\bSS\b/gi, "coucher du soleil"],
    [/\bVFR\b/gi, "VFR (vol à vue)"], [/\bIFR\b/gi, "IFR (vol aux instruments)"]
  ];
  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value)
    .replace(/\s*:\s*/g, " : ")
    .replace(/\s+/g, " ")
    .trim();
}

export function readNotamInFrench(source: string): FrenchNotamReading | null {
  const normalized = source.replace(/\r/g, "\n").trim();
  if (!normalized) return null;
  const identifier = normalized.match(/\b([A-Z]\d{4}\/\d{2})\b/i)?.[1]?.toUpperCase() ?? null;
  const location = field(normalized, "A");
  const startsAt = utcDate(field(normalized, "B"));
  const endsAt = utcDate(field(normalized, "C"), true);
  const schedule = translateOperationalText(field(normalized, "D"));
  const lowerLimit = translateOperationalText(field(normalized, "F"));
  const upperLimit = translateOperationalText(field(normalized, "G"));
  const frenchText = translateOperationalText(field(normalized, "E"));
  const warnings: string[] = [];
  if (!field(normalized, "E")) warnings.push("Champ E) absent ou non reconnu : le contenu opérationnel n’a pas pu être interprété.");
  if (!startsAt || !endsAt) warnings.push("Période B)/C) incomplète : vérifiez les dates dans le texte original.");
  warnings.push("Lecture assistée non officielle : en cas d’écart, le NOTAM original fait foi.");
  return { identifier, location, startsAt, endsAt, schedule, lowerLimit, upperLimit, frenchText, warnings };
}
