import { measuredFetch, registerSource, type SourceAdapter } from "../sourceAdapter";

type Input = { latitude: number; longitude: number; radiusNm: number; revalidateSeconds: number };
type Output = { ac?: unknown[]; now?: number };

const adapter: SourceAdapter<Input, Output> = {
  id: "airplanes-live", name: "Airplanes.live", enabled: process.env.AIRPLANES_LIVE_ENABLED !== "false",
  quota: "API communautaire gratuite, appels espacés et cache obligatoire",
  async fetch(input) {
    const response = await fetch(`https://api.airplanes.live/v2/point/${input.latitude}/${input.longitude}/${input.radiusNm}`, {
      next: { revalidate: input.revalidateSeconds }, signal: AbortSignal.timeout(9000),
      headers: { Accept: "application/json", "User-Agent": `XavPac/${process.env.NEXT_PUBLIC_XAVPAC_VERSION ?? "development"} (non-commercial aviation assistant)` }
    });
    if (!response.ok) throw new Error(`Airplanes.live ${response.status}`);
    return response.json() as Promise<Output>;
  }
};
registerSource(adapter);
export function fetchAirplanesLive(input: Input) { return measuredFetch(adapter, input); }
