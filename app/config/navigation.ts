export type Universe = "spotter" | "drone";

export type ModuleId =
  | "aviation"
  | "operations"
  | "spotting"
  | "weather"
  | "lightning"
  | "astronomy"
  | "drone"
  | "center"
  | "technical";

export type NavigationModule = {
  id: ModuleId;
  icon: "aircraft" | "rescue" | "weather" | "moon" | "drone" | "operations";
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
      { id: "aviation", icon: "aircraft", title: "Trafic aérien", shortTitle: "Trafic", subtitle: "Carte et passages" },
      { id: "operations", icon: "rescue", title: "Moyens aériens", shortTitle: "Moyens", subtitle: "Sécurité et missions" },
      { id: "spotting", icon: "operations", title: "Carnet de spotting", shortTitle: "Carnet", subtitle: "Souvenirs et statistiques" },
      { id: "lightning", icon: "weather", title: "Orage / Foudre", shortTitle: "Orage", subtitle: "Impacts autour de HOME" },
      { id: "weather", icon: "weather", title: "Météo", shortTitle: "Météo", subtitle: "Conditions locales" },
      { id: "astronomy", icon: "moon", title: "Ciel", shortTitle: "Ciel", subtitle: "ISS et astronomie" }
    ]
  },
  drone: {
    title: "Drone",
    description: "Préparer, vérifier, sécuriser",
    href: "/drone",
    defaultModule: "drone",
    modules: [
      { id: "drone", icon: "drone", title: "Assistant de vol", shortTitle: "Assistant", subtitle: "Décision et trafic" },
      { id: "center", icon: "operations", title: "Opérations", shortTitle: "Opérations", subtitle: "Situation terrain" },
      { id: "weather", icon: "weather", title: "Météo Drone", shortTitle: "Météo", subtitle: "Prévisions détaillées" }
    ]
  }
};

export function moduleBelongsToUniverse(universe: Universe, module: ModuleId) {
  return NAVIGATION[universe].modules.some((item) => item.id === module);
}
