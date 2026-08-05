import type { EnrichedAircraft } from "./types.ts";

export type RemarkableAircraft = {
  key: string;
  icon: string;
  label: string;
  confidence: "confirmed" | "probable";
  evidence: string;
};

const rules: Array<{ key: string; icon: string; label: string; pattern: RegExp }> = [
  { key: "condor", icon: "🚁", label: "Hélicoptère CONDOR", pattern: /\bCONDOR[A-Z]?\b/i },
  { key: "samu", icon: "🚑", label: "SAMU", pattern: /\b(SAMU|SMUR)\b/i },
  { key: "gendarmerie", icon: "🚓", label: "Gendarmerie", pattern: /\b(GENDARMERIE|F-MJ|GEND)\b/i },
  { key: "air-force", icon: "✈️", label: "Armée de l’Air", pattern: /\b(ARME[EÉ]E DE L['’ ]AIR|FRENCH AIR FORCE|CTM\d|FAF)\b/i },
  { key: "navy", icon: "✈️", label: "Marine Nationale", pattern: /\b(MARINE NATIONALE|FRENCH NAVY|FNY)\b/i },
  { key: "customs", icon: "✈️", label: "Douanes", pattern: /\b(DOUANE|CUSTOMS)\b/i },
  { key: "a400m", icon: "✈️", label: "Airbus A400M", pattern: /\b(A400|A400M)\b/i },
  { key: "mrtt", icon: "✈️", label: "A330 MRTT", pattern: /\b(A33M|MRTT|PHENIX)\b/i },
  { key: "awacs", icon: "✈️", label: "AWACS", pattern: /\b(E3CF|E-?3[AF]|AWACS)\b/i },
  { key: "government", icon: "👑", label: "Avion gouvernemental", pattern: /\b(GOVERNMENT|GOUVERNEMENT|COTAM|REPUBLIC|PRESIDENTIAL)\b/i },
  { key: "a380", icon: "⭐", label: "Airbus A380", pattern: /\bA38[08]\b|A380/i },
  { key: "b747", icon: "⭐", label: "Boeing 747", pattern: /\bB74[1-8]\b|747/i },
  { key: "antonov", icon: "⭐", label: "Antonov", pattern: /\bAN(12|22|26|72|74|124|225)\b|ANTONOV/i },
  { key: "special-livery", icon: "⭐", label: "Livrée spéciale", pattern: /\b(SPECIAL LIVERY|RETRO LIVERY|ANNIVERSARY LIVERY)\b/i }
];

export function detectRemarkable(input: { callsign?: string | null; aircraftType?: string | null; description?: string | null; operator?: string | null }, enriched?: EnrichedAircraft | null): RemarkableAircraft[] {
  const typed = `${enriched?.aircraftType ?? input.aircraftType ?? ""} ${enriched?.manufacturer ?? ""}`;
  const operator = enriched?.operator ?? input.operator ?? "";
  const contextual = `${input.callsign ?? ""} ${input.description ?? ""} ${operator}`;
  const detected: RemarkableAircraft[] = [];
  const verifiedCivilSecurity = /S[ÉE]CURIT[ÉE] CIVILE|CIVIL SECURITY/i.test(operator)
    && enriched?.identityFields.operator?.confidence === "confirmed";
  const canadairType = /\b(CL2[15]|CL-?415|CANADAIR)\b/i.test(typed);
  const canadairCallsign = /\bP[ÉE]LICAN[A-Z0-9-]*\b/i.test(contextual);
  const fireBossType = /\b(AT8T|AT-?802[AF]?|FIRE\s*BOSS)\b/i.test(`${typed} ${contextual}`);
  const dashType = /\b(DH8[ABD]|Q400|DASH\s?8)\b/i.test(typed);
  const dashCallsign = /\b(MILAN|BENGALE)[A-Z0-9-]*\b/i.test(contextual);
  const dragonCallsign = /\bDRAGON[A-Z0-9-]*\b/i.test(contextual);

  if (canadairType || canadairCallsign) {
    const civilSecurity = verifiedCivilSecurity || canadairCallsign;
    detected.push({
      key: "canadair", icon: "🚒", label: civilSecurity ? "Canadair Sécurité Civile" : "Canadair CL-415",
      confidence: verifiedCivilSecurity || (canadairType && !civilSecurity) ? "confirmed" : "probable",
      evidence: verifiedCivilSecurity ? "Opérateur vérifié et type correspondant" : canadairCallsign ? "Indicatif PÉLICAN, appartenance à confirmer" : "Type d’appareil confirmé, opérateur non confirmé"
    });
  }
  if (fireBossType) detected.push({
    key: "fire-boss", icon: "🔥", label: "Fire Boss — lutte contre les feux",
    confidence: /AQUARIUS\s+AERIAL\s+FIREFIGHTING/i.test(contextual) ? "probable" : "confirmed",
    evidence: /AQUARIUS\s+AERIAL\s+FIREFIGHTING/i.test(contextual) ? "Type et opérateur spécialisé reçus" : "Type Fire Boss reçu ou enrichi"
  });
  if (dashType || dashCallsign) {
    const civilSecurity = verifiedCivilSecurity || dashCallsign;
    detected.push({
      key: "dash", icon: "🚒", label: civilSecurity ? "Dash Sécurité Civile" : "Dash 8",
      confidence: verifiedCivilSecurity || (dashType && !civilSecurity) ? "confirmed" : "probable",
      evidence: verifiedCivilSecurity ? "Opérateur vérifié et type correspondant" : dashCallsign ? "Indicatif MILAN/BENGALE, appartenance à confirmer" : "Type Dash 8 confirmé, opérateur non confirmé"
    });
  }
  if (dragonCallsign) detected.push({
    key: "dragon", icon: "🚁", label: "Dragon Sécurité Civile",
    confidence: verifiedCivilSecurity ? "confirmed" : "probable",
    evidence: verifiedCivilSecurity ? "Opérateur vérifié et indicatif DRAGON" : "Indicatif DRAGON, identité individuelle à confirmer"
  });
  for (const rule of rules) {
    if (rule.pattern.test(typed)) detected.push({ key: rule.key, icon: rule.icon, label: rule.label, confidence: "confirmed", evidence: "Type d’appareil reçu ou enrichi" });
    else if (rule.pattern.test(contextual)) detected.push({ key: rule.key, icon: rule.icon, label: rule.label, confidence: "probable", evidence: "Callsign ou opérateur correspondant à une règle locale" });
  }
  return detected;
}
