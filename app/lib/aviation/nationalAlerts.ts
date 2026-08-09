import { distanceKm } from "./geometry.ts";

export type NationalAssetSignal = {
  id: string;
  callsign: string;
  latitude: number;
  longitude: number;
  onGround: boolean;
  identification?: { badge?: string; confidence?: "confirmed" | "probable" | "to-confirm" };
};

export type NearbyNationalAsset = NationalAssetSignal & {
  distanceKm: number;
  badge: string;
};

export function nationalMarkerCategory(badge: string) {
  const normalized = badge.toUpperCase();
  if (normalized.includes("CANADAIR")) return "national-canadair";
  if (normalized.includes("FIRE BOSS")) return "national-fireboss";
  if (normalized.includes("DASH")) return "national-dash";
  if (normalized.includes("DRAGON")) return "national-dragon";
  if (normalized.includes("GENDARMERIE")) return "national-gendarmerie";
  if (normalized.includes("SAMU")) return "national-samu";
  if (normalized.includes("BEECHCRAFT")) return "national-beechcraft";
  if (normalized.includes("MILITAIRE")) return "national-military";
  if (normalized.includes("DOUANE")) return "national-customs";
  if (normalized.includes("DRONE")) return "national-drone";
  return "national-unknown";
}

export function nationalAssetsInsideRadius(assets: NationalAssetSignal[], observer: [number, number], radiusKm = 100) {
  return assets
    .filter((asset) => !asset.onGround && Number.isFinite(asset.latitude) && Number.isFinite(asset.longitude))
    .map((asset): NearbyNationalAsset => ({
      ...asset,
      distanceKm: distanceKm(observer, [asset.latitude, asset.longitude]),
      badge: asset.identification?.badge ?? "Moyen national"
    }))
    .filter((asset) => asset.distanceKm <= radiusKm)
    .sort((left, right) => left.distanceKm - right.distanceKm);
}
