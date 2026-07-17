import { measuredFetch, registerSource, type SourceAdapter } from "../sourceAdapter";

type Group = "stations" | "starlink" | "visual";
const adapter: SourceAdapter<Group, unknown[]> = {
  id: "celestrak", name: "CelesTrak", enabled: process.env.CELESTRAK_ENABLED !== "false",
  quota: "Service public gratuit, actualisation espacée",
  async fetch(group) {
    const response = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group.toUpperCase()}&FORMAT=JSON`, { cache: "no-store", signal: AbortSignal.timeout(12000), headers: { Accept: "application/json", "User-Agent": `XavPac/${process.env.NEXT_PUBLIC_XAVPAC_VERSION ?? "development"}` } });
    if (!response.ok) throw new Error(`CelesTrak ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }
};
registerSource(adapter);
export function fetchCelesTrak(group: Group) { return measuredFetch(adapter, group); }
