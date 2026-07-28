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
