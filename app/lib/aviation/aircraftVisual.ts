export type AircraftVisualKind =
  | "airliner"
  | "turboprop"
  | "light"
  | "helicopter"
  | "water-bomber"
  | "medical"
  | "military"
  | "surveillance"
  | "drone"
  | "civil-security"
  | "specialized";

export type AircraftVisual = { kind: AircraftVisualKind; label: string };

export function classifyAircraftVisual(...values: Array<string | null | undefined>): AircraftVisual {
  const text = values.filter(Boolean).join(" ").toLowerCase();
  if (/(canadair|cl-?215|cl-?415|bombardier d.eau|water bomber)/i.test(text)) return { kind: "water-bomber", label: "Avion bombardier d’eau" };
  if (/(samu|smur|medical|médical)/i.test(text)) return { kind: "medical", label: "Hélicoptère médical" };
  if (/(dragon|condor[a-z]?|gendarmerie|helic|hélic|rotor|h125|h145|ec145|h135|ec135|as[ .-]?350|as50|écureuil|squirrel)/i.test(text)) return { kind: "helicopter", label: "Hélicoptère" };
  if (/(rafale|mirage|fighter|military|militaire|armée|air force|trainer)/i.test(text)) return { kind: "military", label: "Aéronef militaire" };
  if (/(douane|surveillance|beechcraft|king air|patmar)/i.test(text)) return { kind: "surveillance", label: "Aéronef de surveillance" };
  if (/(drone|uas|uav)/i.test(text)) return { kind: "drone", label: "Drone" };
  if (/(sécurité civile|securite civile|civil security)/i.test(text)) return { kind: "civil-security", label: "Moyen de la Sécurité civile" };
  if (/(dash|atr|turboprop|turbo.?prop|dhc|saab 340|embraer 120)/i.test(text)) return { kind: "turboprop", label: "Avion turbopropulsé" };
  if (/(cessna|piper|robin|cirrus|ulm|ultralight|glider|planeur|bristell)/i.test(text)) return { kind: "light", label: "Avion léger" };
  if (/(a3\d\d|b7\d\d|boeing|airbus|embraer|airliner|jet)/i.test(text)) return { kind: "airliner", label: "Avion de ligne" };
  return { kind: "specialized", label: "Aéronef — type à confirmer" };
}
