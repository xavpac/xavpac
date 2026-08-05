export type NationalIdentityInput = {
  registration?: string | null;
  callsign?: string | null;
  aircraftType?: string | null;
  description?: string | null;
  operator?: string | null;
};

export type NationalIdentity = {
  category: string;
  badge: string;
  model: string | null;
  operator: string | null;
  probableMission: string | null;
  confidence: "confirmed" | "probable" | "to-confirm";
  evidence: string[];
};

// Table volontairement explicite : compléter uniquement avec des données publiquement vérifiées.
export const KNOWN_NATIONAL_REGISTRATIONS: Readonly<Record<string, Omit<NationalIdentity, "evidence">>> = {
  "F-HJTB": {
    category: "Hélicoptère SAF",
    badge: "HÉLICOPTÈRE SAF",
    model: "Airbus Helicopters H125 / AS350 B3",
    operator: "SAF Hélicoptères",
    probableMission: null,
    confidence: "confirmed"
  }
};

// Registre officiel luxembourgeois du 10 mars 2026 : propriétaire Cargolux,
// exploitant Aquarius Aerial Firefighting. La mission du jour reste inconnue.
const VERIFIED_AQUARIUS_FIRE_BOSS = new Set(["LX-AFA", "LX-AFB", "LX-AFC", "LX-AFF", "LX-AFG", "LX-AFH", "LX-AFI", "LX-AFJ"]);

function normalized(input: NationalIdentityInput) {
  return {
    registration: input.registration?.trim().toUpperCase() ?? "",
    callsign: input.callsign?.trim().toUpperCase() ?? "",
    type: `${input.aircraftType ?? ""} ${input.description ?? ""}`.toUpperCase(),
    operator: input.operator?.trim() ?? null,
    operatorUpper: input.operator?.trim().toUpperCase() ?? ""
  };
}

export function identifyNationalAsset(input: NationalIdentityInput): NationalIdentity {
  const value = normalized(input);
  const known = KNOWN_NATIONAL_REGISTRATIONS[value.registration];
  if (known) return { ...known, evidence: ["immatriculation vérifiée"] };
  if (VERIFIED_AQUARIUS_FIRE_BOSS.has(value.registration)) {
    return {
      category: "Renfort aérien de lutte contre les feux",
      badge: "FIRE BOSS — RENFORT FEUX",
      model: "Air Tractor AT-802 Fire Boss",
      operator: "Aquarius Aerial Firefighting",
      probableMission: null,
      confidence: "confirmed",
      evidence: ["immatriculation et exploitant vérifiés au registre luxembourgeois", "mission du jour non déterminée"]
    };
  }

  const civilSecurity = /S[ÉE]CURIT[ÉE] CIVILE|CIVIL SECURITY/.test(value.operatorUpper);
  if (/AT8T|AT-?802|FIRE\s*BOSS/.test(value.type) || /AQUARIUS\s+AERIAL\s+FIREFIGHTING/.test(value.operatorUpper)) {
    return {
      category: "Avion de lutte contre les feux",
      badge: "FIRE BOSS — LUTTE FEUX",
      model: /AT8T|AT-?802|FIRE\s*BOSS/.test(value.type) ? "Air Tractor AT-802 Fire Boss" : null,
      operator: value.operator,
      probableMission: null,
      confidence: "probable",
      evidence: ["type ou opérateur spécialisé reçu par ADS-B", "mission du jour non déterminée"]
    };
  }
  const canadairCallsign = /^(PELICAN|P[ÉE]LICAN)/.test(value.callsign);
  if (/CL2T|CL-?415|CANADAIR/.test(value.type) || canadairCallsign) {
    const model = /CL2T|CL-?415/.test(value.type) ? "Canadair CL-415" : null;
    const attributed = canadairCallsign || civilSecurity;
    return {
      category: attributed ? "Canadair de la Sécurité civile" : model ? "Canadair CL-415" : "Avion bombardier d’eau",
      badge: attributed ? "CANADAIR SÉCURITÉ CIVILE" : model ? "CANADAIR CL-415" : "CANADAIR À CONFIRMER",
      model,
      operator: value.operator || (civilSecurity ? "Sécurité civile" : null),
      probableMission: canadairCallsign ? "Lutte contre les feux de forêt" : null,
      confidence: attributed ? "probable" : model ? "confirmed" : "to-confirm",
      evidence: [model ? "type ADS-B CL-415" : "type non confirmé", ...(canadairCallsign ? ["indicatif PÉLICAN"] : []), ...(civilSecurity ? ["opérateur déclaré Sécurité civile"] : [])]
    };
  }

  const dashCallsign = /^(MILAN|BENGALE)/.test(value.callsign);
  if (/DH8D|Q400|DASH\s*8/.test(value.type) || dashCallsign) {
    const model = /DH8D|Q400|DASH\s*8/.test(value.type) ? "Dash 8 Q400-MR" : null;
    const attributed = dashCallsign || civilSecurity;
    return {
      category: attributed ? "Dash de la Sécurité civile" : model ? "Dash 8" : "Avion à confirmer",
      badge: attributed ? "DASH SÉCURITÉ CIVILE" : model ? "DASH 8" : "DASH À CONFIRMER",
      model,
      operator: value.operator || (civilSecurity ? "Sécurité civile" : null),
      probableMission: null,
      confidence: attributed ? "probable" : model ? "confirmed" : "to-confirm",
      evidence: [model ? "type ADS-B Q400/DH8D" : "type non confirmé", ...(dashCallsign ? ["indicatif MILAN/BENGALE"] : []), ...(civilSecurity ? ["opérateur déclaré Sécurité civile"] : [])]
    };
  }

  if (/B200|B350|BE20|BE30|KING\s*AIR|BEECH/.test(value.type)) {
    const model = /B350|BE30/.test(value.type) ? "Beechcraft 350" : "Beechcraft 200";
    return { category: model, badge: model.toUpperCase(), model, operator: value.operator, probableMission: null, confidence: "confirmed", evidence: ["modèle ADS-B Beechcraft"] };
  }

  if (/^DRAGON/.test(value.callsign)) {
    return { category: "Hélicoptère Dragon", badge: "HÉLICOPTÈRE DRAGON", model: input.aircraftType || input.description || null, operator: value.operator || "Sécurité civile", probableMission: "Secours et sécurité civile", confidence: "probable", evidence: ["indicatif opérationnel DRAGON", "identité individuelle à confirmer"] };
  }
  if (/^CONDOR[A-Z]?/.test(value.callsign) && /SAF/.test(value.operatorUpper)) {
    return { category: "Hélicoptère SAF", badge: "HÉLICOPTÈRE SAF", model: input.aircraftType || input.description || null, operator: value.operator, probableMission: null, confidence: "probable", evidence: ["indicatif CONDOR", "opérateur SAF"] };
  }
  if (/GENDARMERIE/.test(value.operatorUpper) || /^F-MJ/.test(value.registration)) {
    return { category: "Hélicoptère de la Gendarmerie", badge: "HÉLICOPTÈRE GENDARMERIE", model: input.aircraftType || input.description || null, operator: value.operator || "Gendarmerie nationale", probableMission: null, confidence: "confirmed", evidence: ["opérateur ou immatriculation Gendarmerie"] };
  }
  if (/SAMU|SMUR/.test(`${value.callsign} ${value.operatorUpper}`)) {
    return { category: "Hélicoptère SAMU", badge: "HÉLICOPTÈRE SAMU", model: input.aircraftType || input.description || null, operator: value.operator, probableMission: "Transport médical d’urgence", confidence: "confirmed", evidence: ["indicatif ou opérateur SAMU/SMUR"] };
  }
  if (/DOUANE|CUSTOMS/.test(`${value.callsign} ${value.operatorUpper}`)) {
    return { category: "Aéronef des Douanes", badge: "DOUANES", model: input.aircraftType || input.description || null, operator: value.operator || "Douane française", probableMission: null, confidence: "confirmed", evidence: ["opérateur Douanes"] };
  }
  if (/DRONE|UAV|UNMANNED/.test(value.type)) {
    return { category: "Drone opérationnel", badge: "DRONE OPÉRATIONNEL", model: input.aircraftType || input.description || null, operator: value.operator, probableMission: null, confidence: "confirmed", evidence: ["type ADS-B drone/UAV"] };
  }
  if (/ARM[ÉE]E|AIR FORCE|MILITARY/.test(value.operatorUpper)) {
    const helicopter = /HELI|ROTOR|H125|H145|EC145|H135|EC135|AS50|AS350/.test(value.type);
    return { category: helicopter ? "Hélicoptère militaire" : "Autre appareil militaire", badge: helicopter ? "HÉLICOPTÈRE MILITAIRE" : "APPAREIL MILITAIRE", model: input.aircraftType || input.description || null, operator: value.operator, probableMission: null, confidence: "confirmed", evidence: ["opérateur militaire", ...(helicopter ? ["type hélicoptère"] : [])] };
  }
  if (civilSecurity) {
    return { category: "Autre appareil de sécurité civile", badge: "SÉCURITÉ CIVILE", model: input.aircraftType || input.description || null, operator: value.operator, probableMission: null, confidence: "confirmed", evidence: ["opérateur Sécurité civile"] };
  }

  return { category: "Moyen national à confirmer", badge: "MOYEN NATIONAL À CONFIRMER", model: input.aircraftType || input.description || null, operator: value.operator, probableMission: null, confidence: "to-confirm", evidence: [] };
}
