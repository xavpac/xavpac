export const XAVPAC_HOME = {
  name: "HOME",
  address: "124 impasse des Fiolières, 01380 Bâgé-Dommartin",
  position: [46.345497, 4.976824] as [number, number],
  geocoding: {
    source: "Base Adresse Nationale — IGN / Géoplateforme",
    id: "01025_0267_00124",
    banId: "a3222420-f4c7-465f-9f10-473b77af2647",
    score: 0.9468509090909091,
    retrievedAt: "2026-08-12T00:00:00+02:00"
  }
} as const;

export function isXavPacHome(position: [number, number] | null | undefined) {
  return Boolean(position
    && position[0] === XAVPAC_HOME.position[0]
    && position[1] === XAVPAC_HOME.position[1]);
}
