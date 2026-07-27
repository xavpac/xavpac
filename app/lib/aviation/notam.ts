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

function translateOperationalText(value: string | null) {
  if (!value) return null;
  const replacements: Array<[RegExp, string]> = [
    [/\bTEMPORARY RESTRICTED AREA\b/gi, "zone réglementée temporaire"],
    [/\bTEMPO RESTRICTED AREA\b/gi, "zone réglementée temporaire"],
    [/\bUNMANNED AIRCRAFT\b/gi, "aéronefs sans équipage"],
    [/\bUNMANNED ACFT\b/gi, "aéronefs sans équipage"],
    [/\bMIL(?:ITARY)? EXER(?:CISE)?\b/gi, "exercice militaire"],
    [/\bAREA ACTIVATED\b/gi, "zone activée"],
    [/\bAREA CLSD\b/gi, "zone fermée"],
    [/\bCLSD\b/gi, "fermé"],
    [/\bACT\b/gi, "— activité annoncée"],
    [/\bDLY\b/gi, "chaque jour"],
    [/\bDAILY\b/gi, "chaque jour"],
    [/\bEXC\b/gi, "sauf"],
    [/\bMON\b/gi, "lundi"], [/\bTUE\b/gi, "mardi"], [/\bWED\b/gi, "mercredi"],
    [/\bTHU\b/gi, "jeudi"], [/\bFRI\b/gi, "vendredi"], [/\bSAT\b/gi, "samedi"], [/\bSUN\b/gi, "dimanche"],
    [/\bHOL\b/gi, "jours fériés"],
    [/\bSFC\b/gi, "surface"], [/\bGND\b/gi, "sol"],
    [/\bAMSL\b/gi, "au-dessus du niveau moyen de la mer"],
    [/\bASFC\b/gi, "au-dessus de la surface"], [/\bAGL\b/gi, "au-dessus du sol"],
    [/\bSR\b/gi, "lever du soleil"], [/\bSS\b/gi, "coucher du soleil"]
  ];
  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value)
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
