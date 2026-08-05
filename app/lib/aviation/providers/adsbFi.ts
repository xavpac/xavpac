import { measuredFetch, registerSource, type SourceAdapter } from "../sourceAdapter.ts";

type Input = { latitude: number; longitude: number; radiusNm: number; revalidateSeconds: number };
type Output = { ac?: unknown[]; now?: number };

export function adsbFiPointUrl(input: Pick<Input, "latitude" | "longitude" | "radiusNm">) {
  return `https://opendata.adsb.fi/api/v3/lat/${input.latitude}/lon/${input.longitude}/dist/${input.radiusNm}`;
}

const adapter: SourceAdapter<Input, Output> = {
  id: "adsb-fi",
  name: "adsb.fi",
  enabled: process.env.ADSB_FI_ENABLED !== "false",
  quota: "Gratuit, usage personnel non commercial, 1 requête/s, attribution obligatoire",
  async fetch(input) {
    const response = await fetch(adsbFiPointUrl(input), {
      next: { revalidate: input.revalidateSeconds },
      signal: AbortSignal.timeout(9000),
      headers: {
        Accept: "application/json",
        "User-Agent": `XavPac/${process.env.NEXT_PUBLIC_XAVPAC_VERSION ?? "development"} (personal non-commercial aviation assistant; https://xavpac-one.vercel.app)`
      }
    });
    if (!response.ok) throw new Error(`adsb.fi ${response.status}`);
    return response.json() as Promise<Output>;
  }
};

registerSource(adapter);

export function fetchAdsbFi(input: Input) {
  return measuredFetch(adapter, input);
}
