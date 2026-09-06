export type Universe = "spotter" | "drone";

export type ModuleId =
  | "aviation"
  | "operations"
  | "spotting"
  | "weather"
  | "lightning"
  | "astronomy"
  | "drone"
  | "risks"
  | "center"
  | "technical";

export type NavigationModule = {
  id: ModuleId;
  icon: "aircraft" | "rescue" | "weather" | "moon" | "drone" | "operations" | "fire";
  title: string;
  shortTitle: string;
  subtitle: string;
};

export type UniverseNavigation = {
  title: string;
  description: string;
  href: `/${Universe}`;
  defaultModule: ModuleId;
  modules: readonly NavigationModule[];
};

export const NAVIGATION: Record<Universe, UniverseNavigation> = {
  spotter: {
    title: "Spotter",
    description: "Observer, identifier, mémoriser",
    href: "/spotter",
    defaultModule: "aviation",
    modules: [
      { id: "aviation", icon: "aircraft", title: "Trafic aérien", shortTitle: "Trafic", subtitle: "Carte live" },
      { id: "operations", icon: "rescue", title: "Moyens aériens", shortTitle: "Moyens", subtitle: "Secours & missions" },
      { id: "spotting", icon: "operations", title: "Carnet de spotting", shortTitle: "Carnet", subtitle: "Observations" },
      { id: "lightning", icon: "weather", title: "Orage / Foudre", shortTitle: "Orage", subtitle: "Impacts live" },
      { id: "weather", icon: "weather", title: "Météo", shortTitle: "Météo", subtitle: "Prévisions" },
      { id: "astronomy", icon: "moon", title: "Ciel", shortTitle: "Ciel", subtitle: "ISS & astronomie" }
    ]
  },
  drone: {
    title: "Drone",
    description: "Préparer, vérifier, sécuriser",
    href: "/drone",
    defaultModule: "drone",
    modules: [
      { id: "drone", icon: "drone", title: "Assistant de vol", shortTitle: "Assistant", subtitle: "Décision live" },
      { id: "risks", icon: "fire", title: "Feux & Risques", shortTitle: "Risques", subtitle: "FIRMS & DFCI" },
      { id: "center", icon: "operations", title: "Opérations", shortTitle: "Opérations", subtitle: "Situation terrain" },
      { id: "weather", icon: "weather", title: "Météo Drone", shortTitle: "Météo", subtitle: "Prévisions" }
    ]
  }
};

export function moduleBelongsToUniverse(universe: Universe, module: ModuleId) {
  return NAVIGATION[universe].modules.some((item) => item.id === module);
}
