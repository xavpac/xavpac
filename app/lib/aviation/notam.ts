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

function clock(value: string) {
  const match = value.match(/^(\d{2})(\d{2})$/);
  return match ? `${match[1]}:${match[2]}` : value;
}

function sentenceCase(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : trimmed;
}

export function translateNotamSchedule(value: string | null) {
  if (!value) return null;
  let text = value.trim().toUpperCase();

  text = text.replace(/\bH24\b/g, "24 h/24");
  text = text.replace(/\bSR-SS\b/g, "du lever au coucher du soleil");
  text = text.replace(/\bSS-SR\b/g, "du coucher au lever du soleil");

  text = text.replace(/\bDLY\s+(\d{4})-(\d{4})\b/g, (_match, start, end) =>
    `chaque jour de ${clock(start)} à ${clock(end)} UTC`
  );

  const days: Record<string, string> = {
    MON: "lundi", TUE: "mardi", WED: "mercredi", THU: "jeudi",
    FRI: "vendredi", SAT: "samedi", SUN: "dimanche"
  };
  text = text.replace(/\b(MON|TUE|WED|THU|FRI|SAT|SUN)-(MON|TUE|WED|THU|FRI|SAT|SUN)\s+(\d{4})-(\d{4})\b/g,
    (_match, from, to, start, end) => `du ${days[from]} au ${days[to]}, de ${clock(start)} à ${clock(end)} UTC`
  );
  text = text.replace(/\b(MON|TUE|WED|THU|FRI|SAT|SUN)\s+(\d{4})-(\d{4})\b/g,
    (_match, day, start, end) => `${days[day]}, de ${clock(start)} à ${clock(end)} UTC`
  );

  const replacements: Array<[RegExp, string]> = [
    [/\bDLY\b/g, "chaque jour"],
    [/\bMON\b/g, "lundi"], [/\bTUE\b/g, "mardi"], [/\bWED\b/g, "mercredi"],
    [/\bTHU\b/g, "jeudi"], [/\bFRI\b/g, "vendredi"], [/\bSAT\b/g, "samedi"], [/\bSUN\b/g, "dimanche"],
    [/\bHOL\b/g, "jours fériés"],
    [/\bEXC\b/g, "sauf"],
    [/\bSR\b/g, "lever du soleil"],
    [/\bSS\b/g, "coucher du soleil"]
  ];

  text = replacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
  return sentenceCase(text.replace(/\s+/g, " ").trim());
}

export function translateNotamLimit(value: string | null) {
  if (!value) return null;
  let text = value.trim().toUpperCase();

  if (/^(SFC|GND)$/.test(text)) return "Surface / sol";

  text = text
    .replace(/\bFL\s?(\d{2,3})\b/g, "niveau de vol FL$1")
    .replace(/\b(\d+)\s*FT\s*AMSL\b/g, (_match, feet) => `${Number(feet).toLocaleString("fr-FR")} pieds AMSL (au-dessus du niveau moyen de la mer)`)
    .replace(/\b(\d+)\s*FT\s*AGL\b/g, (_match, feet) => `${Number(feet).toLocaleString("fr-FR")} pieds AGL (au-dessus du sol)`)
    .replace(/\b(\d+)\s*FT\s*ASFC\b/g, (_match, feet) => `${Number(feet).toLocaleString("fr-FR")} pieds au-dessus de la surface`)
    .replace(/\bAMSL\b/g, "au-dessus du niveau moyen de la mer")
    .replace(/\bAGL\b/g, "au-dessus du sol")
    .replace(/\bASFC\b/g, "au-dessus de la surface")
    .replace(/\bSFC\b/g, "surface")
    .replace(/\bGND\b/g, "sol");

  return sentenceCase(text.replace(/\s+/g, " ").trim());
}

export function translateOperationalText(value: string | null) {
  if (!value) return null;
  let text = value.trim();

  const phraseReplacements: Array<[RegExp, string]> = [
    [/\bUNMANNED\s+(?:ACFT|AIRCRAFT)\s+ACT(?:IVITY)?\b/gi, "activité de drones / aéronefs sans équipage"],
    [/\bDRONE\s+ACT(?:IVITY)?\b/gi, "activité de drones"],
    [/\bRWY\s+([0-9]{2}(?:\/[0-9]{2})?)\s+CLSD\b/gi, "piste $1 fermée"],
    [/\bTWY\s+([A-Z0-9-]+)\s+CLSD\b/gi, "voie de circulation $1 fermée"],
    [/\bAD\s+CLSD\b/gi, "aérodrome fermé"],
    [/\bCRANE\s+PSN\s+([0-9.]+)\s*NM\s+FM\s+THR\b/gi, "grue positionnée à $1 NM du seuil"],
    [/\bPARACHUTE\s+JUMPING\s+ACT(?:IVITY)?\b/gi, "activité de parachutisme"],
    [/\bFIREWORKS?\s+ACT(?:IVITY)?\b/gi, "activité de feu d’artifice"],
    [/\bTEMPO(?:RARY)?\s+RESTRICTED\s+AREA\b/gi, "zone réglementée temporaire"],
    [/\bAIRSPACE\s+RESERVATION\b/gi, "réservation d’espace aérien"]
  ];
  text = phraseReplacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);

  const replacements: Array<[RegExp, string]> = [
    [/\bDUE TO\b/gi, "en raison de"],
    [/\bNOT AVAILABLE\b/gi, "indisponible"],
    [/\bNOT AVBL\b/gi, "indisponible"],
    [/\bOUT OF SERVICE\b/gi, "hors service"],
    [/\bRESTRICTED AREA\b/gi, "zone réglementée"],
    [/\bDANGER AREA\b/gi, "zone dangereuse"],
    [/\bPROHIBITED AREA\b/gi, "zone interdite"],
    [/\bAREA ACTIVATED\b/gi, "zone activée"],
    [/\bAREA DEACTIVATED\b/gi, "zone désactivée"],
    [/\bAREA CLSD\b/gi, "zone fermée"],
    [/\bUNMANNED AIRCRAFT\b/gi, "aéronefs sans équipage"],
    [/\bUNMANNED ACFT\b/gi, "aéronefs sans équipage"],
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
    [/\bPARACHUTE JUMPING\b/gi, "parachutisme"],
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
    [/\bOPN\b/gi, "ouvert"],
    [/\bACT\b/gi, "activité annoncée"],
    [/\bINACTIVE\b/gi, "inactif"],
    [/\bPPR\b/gi, "autorisation préalable requise"],
    [/\bRMK\b/gi, "remarque"],
    [/\bTEMPO\b/gi, "temporaire"],
    [/\bEST\b/gi, "estimé"],
    [/\bREF\b/gi, "référence"],
    [/\bCENT(?:RE|ER)ED ON\b/gi, "centré sur"],
    [/\bRADIUS\b/gi, "rayon"],
    [/\bPSN\b/gi, "position"],
    [/\bWI\b/gi, "à l’intérieur de"],
    [/\bBTN\b/gi, "entre"],
    [/\bEXC\b/gi, "sauf"],
    [/\bVFR\b/gi, "VFR (vol à vue)"],
    [/\bIFR\b/gi, "IFR (vol aux instruments)"]
  ];

  text = replacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text)
    .replace(/\b(\d+(?:\.\d+)?)\s*NM\b/gi, "$1 NM")
    .replace(/\s*:\s*/g, " : ")
    .replace(/\s+([.,;])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return sentenceCase(text);
}

export function readNotamInFrench(source: string): FrenchNotamReading | null {
  const normalized = source.replace(/\r/g, "\n").trim();
  if (!normalized) return null;
  const identifier = normalized.match(/\b([A-Z]\d{4}\/\d{2})\b/i)?.[1]?.toUpperCase() ?? null;
  const location = field(normalized, "A");
  const startsAt = utcDate(field(normalized, "B"));
  const endsAt = utcDate(field(normalized, "C"), true);
  const schedule = translateNotamSchedule(field(normalized, "D"));
  const lowerLimit = translateNotamLimit(field(normalized, "F"));
  const upperLimit = translateNotamLimit(field(normalized, "G"));
  const frenchText = translateOperationalText(field(normalized, "E"));
  const warnings: string[] = [];
  if (!field(normalized, "E")) warnings.push("Champ E) absent ou non reconnu : le contenu opérationnel n’a pas pu être interprété.");
  if (!startsAt || !endsAt) warnings.push("Période B)/C) incomplète : vérifiez les dates dans le texte original.");
  warnings.push("Lecture assistée non officielle : en cas d’écart, le NOTAM original fait foi.");
  return { identifier, location, startsAt, endsAt, schedule, lowerLimit, upperLimit, frenchText, warnings };
}
