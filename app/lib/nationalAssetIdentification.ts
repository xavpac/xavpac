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
  confidence: "confirmed" | "to-confirm";
  evidence: string[];
};

// Table volontairement explicite : compléter uniquement avec des données publiquement vérifiées.
export const KNOWN_NATIONAL_REGISTRATIONS: Readonly<Record<string, Omit<NationalIdentity, "evidence">>> = {};

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

  const civilSecurity = /S[ÉE]CURIT[ÉE] CIVILE|CIVIL SECURITY/.test(value.operatorUpper);
  if (/CL2T|CL-?415|CANADAIR/.test(value.type) || /^(PELICAN|P[ÉE]LICAN)/.test(value.callsign)) {
    const model = /CL2T|CL-?415/.test(value.type) ? "Canadair CL-415" : null;
    return {
      category: model ? "Canadair CL-415" : "Avion bombardier d’eau",
      badge: model ? "CANADAIR CL-415" : "CANADAIR À CONFIRMER",
      model,
      operator: value.operator || (civilSecurity ? "Sécurité civile" : null),
      probableMission: /^(PELICAN|P[ÉE]LICAN)/.test(value.callsign) ? "Lutte contre les feux de forêt" : null,
      confidence: model || civilSecurity ? "confirmed" : "to-confirm",
      evidence: [model ? "modèle ADS-B CL-415" : "indicatif PELICAN"]
    };
  }

  if (/DH8D|Q400|DASH\s*8/.test(value.type) || /^MILAN/.test(value.callsign)) {
    const model = /DH8D|Q400|DASH\s*8/.test(value.type) ? "Dash 8 Q400-MR" : null;
    return {
      category: model ? "Dash 8 Q400-MR" : "Avion de sécurité civile",
      badge: model ? "DASH 8 Q400-MR" : "DASH À CONFIRMER",
      model,
      operator: value.operator || (civilSecurity ? "Sécurité civile" : null),
      probableMission: null,
      confidence: model || civilSecurity ? "confirmed" : "to-confirm",
      evidence: [model ? "modèle ADS-B Q400/DH8D" : "indicatif MILAN"]
    };
  }

  if (/B200|B350|BE20|BE30|KING\s*AIR|BEECH/.test(value.type)) {
    const model = /B350|BE30/.test(value.type) ? "Beechcraft 350" : "Beechcraft 200";
    return { category: model, badge: model.toUpperCase(), model, operator: value.operator, probableMission: null, confidence: "confirmed", evidence: ["modèle ADS-B Beechcraft"] };
  }

  if (/^DRAGON/.test(value.callsign)) {
    return { category: "Hélicoptère Dragon", badge: "HÉLICOPTÈRE DRAGON", model: input.aircraftType || input.description || null, operator: value.operator || "Sécurité civile", probableMission: "Secours et sécurité civile", confidence: "confirmed", evidence: ["indicatif opérationnel DRAGON"] };
  }
  if (/GENDARMERIE/.test(value.operatorUpper) || /^F-MJ/.test(value.registration)) {
    return { category: "Hélicoptère de la Gendarmerie", badge: "HÉLICOPTÈRE GENDARMERIE", model: input.aircraftType || input.description || null, operator: value.operator || "Gendarmerie nationale", probableMission: null, confidence: "confirmed", evidence: ["opérateur ou immatriculation Gendarmerie"] };
  }
  if (/SAMU|SMUR/.test(`${value.callsign} ${value.operatorUpper}`)) {
    return { category: "Hélicoptère SAMU", badge: "HÉLICOPTÈRE SAMU", model: input.aircraftType || input.description || null, operator: value.operator, probableMission: "Transport médical d’urgence", confidence: "confirmed", evidence: ["indicatif ou opérateur SAMU/SMUR"] };
  }
  if (/DRONE|UAV|UNMANNED/.test(value.type)) {
    return { category: "Drone opérationnel", badge: "DRONE OPÉRATIONNEL", model: input.aircraftType || input.description || null, operator: value.operator, probableMission: null, confidence: "confirmed", evidence: ["type ADS-B drone/UAV"] };
  }
  if (/ARM[ÉE]E|AIR FORCE|MILITARY/.test(value.operatorUpper)) {
    const helicopter = /HELI|ROTOR|H145|EC145|H135|EC135/.test(value.type);
    return { category: helicopter ? "Hélicoptère militaire" : "Autre appareil militaire", badge: helicopter ? "HÉLICOPTÈRE MILITAIRE" : "APPAREIL MILITAIRE", model: input.aircraftType || input.description || null, operator: value.operator, probableMission: null, confidence: "confirmed", evidence: ["opérateur militaire", ...(helicopter ? ["type hélicoptère"] : [])] };
  }
  if (civilSecurity) {
    return { category: "Autre appareil de sécurité civile", badge: "SÉCURITÉ CIVILE", model: input.aircraftType || input.description || null, operator: value.operator, probableMission: null, confidence: "confirmed", evidence: ["opérateur Sécurité civile"] };
  }

  return { category: "Moyen national à confirmer", badge: "MOYEN NATIONAL À CONFIRMER", model: input.aircraftType || input.description || null, operator: value.operator, probableMission: null, confidence: "to-confirm", evidence: [] };
}
