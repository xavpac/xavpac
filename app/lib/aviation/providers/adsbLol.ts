import { measuredFetch, registerSource, type SourceAdapter } from "../sourceAdapter.ts";

type Input = { latitude: number; longitude: number; radiusNm: number; revalidateSeconds: number };
type Output = { ac?: unknown[]; now?: number };

const adapter: SourceAdapter<Input, Output> = {
  id: "adsb-lol",
  name: "adsb.lol",
  enabled: process.env.ADSB_LOL_ENABLED !== "false",
  quota: "API publique gratuite ODbL • usage personnel XavPac",
  async fetch(input) {
    const response = await fetch(
      `https://api.adsb.lol/v2/point/${input.latitude}/${input.longitude}/${input.radiusNm}`,
      {
        next: { revalidate: input.revalidateSeconds },
        signal: AbortSignal.timeout(9000),
        headers: {
          Accept: "application/json",
          "User-Agent": `XavPac/${process.env.NEXT_PUBLIC_XAVPAC_VERSION ?? "development"} (personal non-commercial aviation assistant; https://xavpac-one.vercel.app)`
        }
      }
    );
    if (!response.ok) throw new Error(`adsb.lol ${response.status}`);
    return response.json() as Promise<Output>;
  }
};

registerSource(adapter);

export function fetchAdsbLol(input: Input) {
  return measuredFetch(adapter, input);
}
