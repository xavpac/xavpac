export type AircraftVisualKind =
  | "airliner"
  | "turboprop"
  | "light"
  | "helicopter"
  | "airship"
  | "balloon"
  | "water-bomber"
  | "medical"
  | "military"
  | "surveillance"
  | "drone"
  | "civil-security"
  | "specialized";

export type AircraftVisual = { kind: AircraftVisualKind; label: string };

export function classifyAircraftVisual(...values: Array<string | null | undefined>): AircraftVisual {
  const normalizedValues = values.filter(Boolean).map((value) => value!.trim().toLowerCase());
  const text = normalizedValues.join(" ");
  const adsbCategory = normalizedValues.find((value) => /^[abc][1-7]$/i.test(value));

  // Catégories émetteur ADS-B : elles permettent d'identifier des trafics
  // atypiques même quand le modèle ou l'opérateur ne sont pas renseignés.
  if (adsbCategory === "a7") return { kind: "helicopter", label: "Hélicoptère" };
  if (adsbCategory === "b1") return { kind: "light", label: "Planeur" };
  if (adsbCategory === "b2") return { kind: "balloon", label: "Ballon / aérostat" };
  if (adsbCategory === "b4") return { kind: "light", label: "ULM / aéronef léger" };
  if (adsbCategory === "b6") return { kind: "drone", label: "Drone" };
  if (/(airship|dirigeable|zeppelin|\bzep\b|\blta\b)/i.test(text)) return { kind: "airship", label: "Dirigeable" };
  if (/(hot.?air.?balloon|montgolfi[eè]re|\bballoon\b|\bballon\b)/i.test(text)) return { kind: "balloon", label: "Montgolfière" };
  if (/(canadair|cl-?215|cl-?415|fire boss|at-?802|at8t|bombardier d.eau|water bomber|aerial firefighting)/i.test(text)) return { kind: "water-bomber", label: "Avion bombardier d’eau" };
  if (/(samu|smur|medical|médical|medevac|hems|urgences|secours)/i.test(text)) return { kind: "medical", label: "Aéronef médical / secours" };
  if (/(dragon|condor[a-z]?|gendarmerie|helic|hélic|rotor|h125|h145|ec145|h135|ec135|as[ .-]?350|as50|écureuil|squirrel|nh90|caracal|cougar|gazelle|dauphin)/i.test(text)) return { kind: "helicopter", label: "Hélicoptère" };
  if (/(rafale|mirage|fighter|military|militaire|armée|armee|air force|armée de l'air|marine nationale|french navy|french army|alat|aéronavale|aeronavale|dga essais|awacs|a400m|c130|c-130|c160|transall|alphajet|alpha jet|trainer)/i.test(text)) return { kind: "military", label: "Aéronef militaire" };
  if (/(douane|customs|surveillance|beechcraft|king air|patmar|police|gendarmerie|gardes.côtes|coast guard)/i.test(text)) return { kind: "surveillance", label: "Aéronef de surveillance" };
  if (/(drone|uas|uav)/i.test(text)) return { kind: "drone", label: "Drone" };
  if (/(sécurité civile|securite civile|civil security|civil protection|protection civile|dragon\s?\d{2})/i.test(text)) return { kind: "civil-security", label: "Moyen de la Sécurité civile" };
  if (/(dash|atr|turboprop|turbo.?prop|dhc|saab 340|embraer 120)/i.test(text)) return { kind: "turboprop", label: "Avion turbopropulsé" };
  if (/(cessna|piper|robin|cirrus|ulm|ultralight|glider|planeur|sailplane|bristell|diamond|da20|da40|da42|tecnam|pilatus|pc-?6|pc-?12)/i.test(text)) return { kind: "light", label: "Aéronef léger / privé" };
  if (/(a3\d\d|b7\d\d|boeing|airbus|embraer|airliner|jet)/i.test(text)) return { kind: "airliner", label: "Avion de ligne" };
  return { kind: "specialized", label: "Aéronef — type à confirmer" };
}
